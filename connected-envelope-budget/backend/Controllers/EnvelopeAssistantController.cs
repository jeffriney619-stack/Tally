using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Backend.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/envelope-assistant")]
public sealed class EnvelopeAssistantController(IConfiguration config, IHttpClientFactory httpClientFactory, ILogger<EnvelopeAssistantController> logger) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] EnvelopeAssistantRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PromptVersion))
        {
            return BadRequest(new ProblemDetails { Detail = "promptVersion is required." });
        }

        if (request.UniversalCategories.Count == 0)
        {
            return BadRequest(new ProblemDetails { Detail = "universalCategories is required." });
        }

        if (request.BaselineCategoryIds.Count == 0)
        {
            return BadRequest(new ProblemDetails { Detail = "baselineCategoryIds is required." });
        }

        if (request.Answers.ValueKind is not JsonValueKind.Object)
        {
            return BadRequest(new ProblemDetails { Detail = "answers must be a JSON object." });
        }

        var endpoint = ResolveEndpoint();
        var apiKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(apiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Detail = "AI assistant is not configured on the backend. Set AiEnvelopeAssistant:ApiKey (or OPENAI_API_KEY). Optional endpoint: AiEnvelopeAssistant:Endpoint (or OPENAI_API_ENDPOINT)."
            });
        }

        var generated = await GenerateFromModelAsync(request, cancellationToken);
        if (!generated.IsValid)
        {
            generated = await GenerateFromModelAsync(request, cancellationToken);
        }

        if (!generated.IsValid || generated.Response is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Detail = generated.ErrorDetail ?? "Tally couldn't finish your recommendation. Try again or continue with the standard templates."
            });
        }

        var response = NormalizeAndValidateResponse(generated.Response, request.UniversalCategories, request.BaselineCategoryIds);
        if (!response.IsValid || response.Value is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Detail = "Tally couldn't finish your recommendation. Try again or continue with the standard templates."
            });
        }

        return Ok(response.Value with { ModelName = generated.ModelName });
    }

    private async Task<(bool IsValid, EnvelopeAssistantResponse? Response, string? ModelName, string? ErrorDetail)> GenerateFromModelAsync(
        EnvelopeAssistantRequest request,
        CancellationToken cancellationToken)
    {
        var endpoint = ResolveEndpoint();
        var apiKey = ResolveApiKey();
        var model = ResolveModel();

        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(apiKey))
        {
            return (false, null, null, "AI assistant is not configured on the backend. Set AiEnvelopeAssistant:ApiKey (or OPENAI_API_KEY). Optional endpoint: AiEnvelopeAssistant:Endpoint (or OPENAI_API_ENDPOINT).");
        }

        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var systemPrompt = """
You create a minimal envelope-budget category structure from a user's questionnaire answers.

Create a separate envelope only when the user would meaningfully fund it, protect its money, or check its balance before spending. Reuse a supplied universal category whenever it matches. Create custom categories for meaningful distinctions missing from the universal catalog. Use as few envelopes as possible. Merge overlapping purposes. Do not create both broad and narrow categories for the same spending unless the user explicitly requested both.

Use broad, clear names. Do not include personal names. Do not recommend amounts. Do not judge or challenge the user's choices. Treat the user's open-ended special-attention expense as a high-priority candidate. Savings answers determine savings-envelope structure only.

Return only JSON matching the supplied schema.
""";

        var schema = new
        {
            summary = "string",
            categories = new[]
            {
                new
                {
                    name = "string",
                    group = "needs|wants|savings",
                    source = "universal|custom",
                    universalCategoryId = "string|null",
                    replacesUniversalCategoryIds = new[] { "string" },
                    reason = "string",
                    answerKeys = new[] { "string" },
                    priority = "normal|high"
                }
            }
        };

        var payload = new
        {
            promptVersion = request.PromptVersion,
            universalCategories = request.UniversalCategories,
            baselineCategoryIds = request.BaselineCategoryIds,
            answers = request.Answers,
            requiredResponseShape = schema
        };

        var chatPayload = new
        {
            model,
            temperature = 0.15,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = JsonSerializer.Serialize(payload) }
            }
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(chatPayload), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(endpoint, content, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var providerBody = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning("Envelope assistant model call failed with status {StatusCode}. Body: {Body}", response.StatusCode, providerBody);

                string? providerDetail = null;
                try
                {
                    using var bodyJson = JsonDocument.Parse(providerBody);
                    if (bodyJson.RootElement.TryGetProperty("error", out var errorNode) &&
                        errorNode.ValueKind == JsonValueKind.Object &&
                        errorNode.TryGetProperty("message", out var messageNode) &&
                        messageNode.ValueKind == JsonValueKind.String)
                    {
                        providerDetail = messageNode.GetString();
                    }
                }
                catch
                {
                    // Keep provider detail null when the response body is not JSON.
                }

                if ((int)response.StatusCode == 429)
                {
                    return (false, null, model, "AI assistant is configured, but the model provider returned rate limit/quota (429). Check your API plan, usage limits, and billing status.");
                }
                return (false, null, model, providerDetail is not null
                    ? $"AI assistant call failed with status {(int)response.StatusCode} ({response.StatusCode}): {providerDetail}"
                    : $"AI assistant call failed with status {(int)response.StatusCode} ({response.StatusCode}).");
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var result = root
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(result))
            {
                return (false, null, model, "AI assistant returned an empty response.");
            }

            var parsed = JsonSerializer.Deserialize<EnvelopeAssistantResponse>(result, JsonOptions);
            return parsed is null
                ? (false, null, model, "AI assistant returned unreadable JSON.")
                : (true, parsed, model, null);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Envelope assistant model call threw an exception.");
            return (false, null, model, "AI assistant call failed before completion. Check backend logs for details.");
        }
    }

    private static (bool IsValid, EnvelopeAssistantResponse? Value) NormalizeAndValidateResponse(
        EnvelopeAssistantResponse response,
        IReadOnlyList<EnvelopeAssistantUniversalCategory> universalCategories,
        IReadOnlyList<string> baselineCategoryIds)
    {
        if (string.IsNullOrWhiteSpace(response.Summary) || response.Categories.Count == 0)
        {
            return (false, null);
        }

        var universalIds = universalCategories.Select(item => item.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var merged = new List<EnvelopeAssistantCategoryRecommendation>();
        var dedupe = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var category in response.Categories)
        {
            if (string.IsNullOrWhiteSpace(category.Name) || string.IsNullOrWhiteSpace(category.Reason))
            {
                return (false, null);
            }

            var group = category.Group.ToLowerInvariant();
            if (group is not ("needs" or "wants" or "savings"))
            {
                return (false, null);
            }

            var source = category.Source.ToLowerInvariant();
            if (source is not ("universal" or "custom"))
            {
                return (false, null);
            }

            if (source == "universal")
            {
                if (string.IsNullOrWhiteSpace(category.UniversalCategoryId) || !universalIds.Contains(category.UniversalCategoryId))
                {
                    return (false, null);
                }
            }

            var normalizedName = NormalizeName(category.Name);
            if (!dedupe.Add(normalizedName))
            {
                continue;
            }

            merged.Add(category with
            {
                Group = group,
                Source = source,
                Priority = string.IsNullOrWhiteSpace(category.Priority) ? "normal" : category.Priority
            });
        }

        foreach (var baselineId in baselineCategoryIds)
        {
            var baseline = universalCategories.FirstOrDefault(item => string.Equals(item.Id, baselineId, StringComparison.OrdinalIgnoreCase));
            if (baseline is null) continue;
            if (merged.Any(item => string.Equals(item.UniversalCategoryId, baseline.Id, StringComparison.OrdinalIgnoreCase))) continue;

            merged.Add(new EnvelopeAssistantCategoryRecommendation(
                Name: baseline.Name,
                Group: baseline.Group.ToLowerInvariant(),
                Source: "universal",
                UniversalCategoryId: baseline.Id,
                ReplacesUniversalCategoryIds: Array.Empty<string>(),
                Reason: "Included from the Essentials baseline.",
                AnswerKeys: new[] { "baseline" },
                Priority: "normal"));
        }

        return merged.Count == 0
            ? (false, null)
            : (true, response with { Categories = merged });
    }

    private static string NormalizeName(string name)
    {
        var chars = name.Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray();
        return new string(chars);
    }

    private string ResolveEndpoint()
    {
        var configured = config["AiEnvelopeAssistant:Endpoint"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        var envEndpoint = Environment.GetEnvironmentVariable("OPENAI_API_ENDPOINT");
        if (!string.IsNullOrWhiteSpace(envEndpoint))
        {
            return envEndpoint;
        }

        return "https://api.openai.com/v1/chat/completions";
    }

    private string? ResolveApiKey()
    {
        var configured = config["AiEnvelopeAssistant:ApiKey"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        var envKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        return string.IsNullOrWhiteSpace(envKey) ? null : envKey;
    }

    private string ResolveModel()
    {
        var configured = config["AiEnvelopeAssistant:Model"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        var envModel = Environment.GetEnvironmentVariable("OPENAI_MODEL");
        return string.IsNullOrWhiteSpace(envModel) ? "gpt-4.1-mini" : envModel;
    }
}
