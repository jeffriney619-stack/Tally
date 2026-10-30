using Backend.Contracts;

namespace Backend.Services.Categorization;

// Stage 4d of the pipeline: builds the system prompt and request payload sent to the
// model. Wording kept close to the build plan's reviewed/approved text — don't
// re-litigate without product-owner sign-off.
public static class CategorizationPromptBuilder
{
    public const string SystemPrompt =
        "Select the existing envelope best supported by this user's confirmed history and definitions. " +
        "Treat rejected suggestions as negative evidence. Do not invent purchase purpose. Request input " +
        "when the evidence cannot distinguish plausible destinations. Return only JSON matching the supplied schema.";

    public static object BuildPayload(
        TransactionCategorizationRequest request,
        CategorizationSignals signals,
        int accountMaturityThreshold)
    {
        var isEstablished = signals.AccountMaturity >= accountMaturityThreshold;
        var guidance = isEstablished
            ? "This user has well-established categorization history. Prioritize their actual confirmed choices over generic assumptions about merchant type."
            : "This user has limited categorization history. Weight the envelope's own definition and general merchant-type matching above thin personal history. Do not treat 1-2 confirmed examples as an established pattern.";

        return new
        {
            transaction = new
            {
                merchant = request.Merchant,
                amount = request.Amount,
                date = request.Date.ToString("yyyy-MM-dd"),
                dayOfWeek = request.Date.DayOfWeek.ToString(),
            },
            envelopes = request.Envelopes.Select(envelope => new
            {
                id = envelope.Id,
                name = envelope.Name,
                description = envelope.Description,
            }),
            signals = new
            {
                sameMerchantHistory = signals.SameMerchantHistory,
                recentTrend = signals.RecentTrend,
                timingPattern = signals.TimingPattern,
                negativeFeedback = signals.NegativeFeedback,
            },
            accountMaturity = isEstablished ? "established" : "low",
            guidance,
            requiredResponseShape = new
            {
                decision = "suggest|needs_input",
                envelope_id = "string|null",
                alternative_envelope_ids = new[] { "string" },
                evidence_ids = new[] { "string" },
                explanation = "string",
                clarification_question = "string|null",
            },
        };
    }
}
