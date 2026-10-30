using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Backend.Contracts;
using Backend.Services.Categorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

// Precompute endpoint for the transaction-categorization AI pipeline — see
// Tally_Transaction_AI_Categorization_Build_Plan.md (workspace root) §4. Called once,
// synchronously, at transaction creation/import time (not live from Transaction Review).
[ApiController]
[Route("api/transaction-categorization")]
public sealed class TransactionCategorizationController(
    DeterministicGateService gate,
    IConfiguration config,
    IHttpClientFactory httpClientFactory,
    ILogger<TransactionCategorizationController> logger) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    [HttpPost("suggest")]
    public async Task<IActionResult> Suggest([FromBody] TransactionCategorizationRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Merchant))
        {
            return BadRequest(new ProblemDetails { Detail = "username and merchant are required." });
        }

        if (request.Envelopes.Count == 0)
        {
            return BadRequest(new ProblemDetails { Detail = "envelopes is required." });
        }

        var gateResult = await gate.EvaluateAsync(request, cancellationToken);
        if (gateResult.Bypass)
        {
            return Ok(new TransactionCategorizationResponse(
                gateResult.CategoryId,
                gateResult.Confidence,
                gateResult.Explanation ?? string.Empty,
                gateResult.EvidenceIds,
                gateResult.Source ?? SuggestionSource.Deterministic,
                NeedsInput: false,
                ClarificationQuestion: null));
        }

        var signals = gateResult.Signals!;
        var sentEvidenceIds = gateResult.Evidence.Select(item => item.Id).ToHashSet();
        var accountMaturityThreshold = config.GetValue<int?>("AiTransactionCategorizer:AccountMaturityThreshold") ?? 50;

        var endpoint = ResolveEndpoint();
        var apiKey = ResolveApiKey();
        if (!string.IsNullOrWhiteSpace(endpoint) && !string.IsNullOrWhiteSpace(apiKey))
        {
            var modelResult = await CallModelAsync(request, signals, accountMaturityThreshold, endpoint, apiKey, cancellationToken);
            if (!modelResult.IsValid || modelResult.Response is null)
            {
                modelResult = await CallModelAsync(request, signals, accountMaturityThreshold, endpoint, apiKey, cancellationToken);
            }

            if (modelResult.IsValid && modelResult.Response is not null &&
                CategorizationResponseValidator.IsValid(modelResult.Response, request.Envelopes, sentEvidenceIds))
            {
                var response = modelResult.Response;
                var isNeedsInput = response.Decision == "needs_input";
                return Ok(new TransactionCategorizationResponse(
                    isNeedsInput ? null : response.EnvelopeId,
                    // No numeric confidence for AI-sourced suggestions — the model's own
                    // decision field is the only gate for this path (confirmed decision).
                    Confidence: null,
                    Explanation: response.Explanation ?? string.Empty,
                    EvidenceIds: response.EvidenceIds ?? [],
                    Source: SuggestionSource.Ai,
                    NeedsInput: isNeedsInput,
                    ClarificationQuestion: response.ClarificationQuestion));
            }

            logger.LogWarning("Transaction categorization model call failed validation twice for vendor {VendorKey}; falling back to keyword matcher.", gateResult.VendorKey);
        }

        return Ok(BuildFallbackResponse(request));
    }

    private TransactionCategorizationResponse BuildFallbackResponse(TransactionCategorizationRequest request)
    {
        var candidateEnvelopes = request.Envelopes.Select(envelope => (envelope.Id, envelope.Name)).ToList();
        var (categoryId, confidence0To100, reason) = FallbackKeywordCategorizer.RecommendCategory(request.Merchant, candidateEnvelopes);
        var normalizedConfidence = confidence0To100 / 100.0;
        var manualReviewFloor = config.GetValue<double?>("AiTransactionCategorizer:ManualReviewFloor") ?? 0.5;

        if (categoryId is null || normalizedConfidence < manualReviewFloor)
        {
            return new TransactionCategorizationResponse(
                null,
                null,
                "Tally couldn't find a confident match automatically — please categorize this one manually.",
                [],
                SuggestionSource.FallbackKeyword,
                NeedsInput: true,
                ClarificationQuestion: null);
        }

        return new TransactionCategorizationResponse(
            categoryId,
            normalizedConfidence,
            reason,
            [],
            SuggestionSource.FallbackKeyword,
            NeedsInput: false,
            ClarificationQuestion: null);
    }

    private async Task<(bool IsValid, AiCategorizationModelResponse? Response)> CallModelAsync(
        TransactionCategorizationRequest request,
        CategorizationSignals signals,
        int accountMaturityThreshold,
        string endpoint,
        string apiKey,
        CancellationToken cancellationToken)
    {
        var model = ResolveModel();
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var payload = CategorizationPromptBuilder.BuildPayload(request, signals, accountMaturityThreshold);
        var chatPayload = new
        {
            model,
            temperature = 0.15,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new { role = "system", content = CategorizationPromptBuilder.SystemPrompt },
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
                logger.LogWarning("Transaction categorization model call failed with status {StatusCode}. Body: {Body}", response.StatusCode, providerBody);
                return (false, null);
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var json = JsonDocument.Parse(body);
            var result = json.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(result))
            {
                return (false, null);
            }

            var parsed = JsonSerializer.Deserialize<AiCategorizationModelResponse>(result, JsonOptions);
            return parsed is null ? (false, null) : (true, parsed);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Transaction categorization model call threw an exception.");
            return (false, null);
        }
    }

    private string ResolveEndpoint()
    {
        var configured = config["AiEnvelopeAssistant:Endpoint"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        var envEndpoint = Environment.GetEnvironmentVariable("OPENAI_API_ENDPOINT");
        return string.IsNullOrWhiteSpace(envEndpoint) ? "https://api.openai.com/v1/chat/completions" : envEndpoint;
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
