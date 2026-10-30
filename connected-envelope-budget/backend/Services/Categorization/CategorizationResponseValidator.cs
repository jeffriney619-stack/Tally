using Backend.Contracts;

namespace Backend.Services.Categorization;

// Stage 4e, Layer 1+2 (build plan): structural/referential validation plus evidence
// grounding. Layer 3 ("is this strong enough to show") is deliberately NOT here — that's
// the gate/threshold policy, kept separate in the controller.
public static class CategorizationResponseValidator
{
    public static bool IsValid(
        AiCategorizationModelResponse response,
        IReadOnlyList<TransactionCategorizationEnvelope> envelopes,
        IReadOnlySet<string> sentEvidenceIds)
    {
        if (string.IsNullOrWhiteSpace(response.Explanation))
        {
            return false;
        }

        if (response.Decision is not ("suggest" or "needs_input"))
        {
            return false;
        }

        if (response.Decision == "suggest")
        {
            if (string.IsNullOrWhiteSpace(response.EnvelopeId))
            {
                return false;
            }

            // Never trust a model-returned envelope ID without checking membership
            // against the real list sent in this request (plan Decision/Q5).
            if (!envelopes.Any(envelope => envelope.Id == response.EnvelopeId))
            {
                return false;
            }
        }
        else if (string.IsNullOrWhiteSpace(response.ClarificationQuestion))
        {
            return false;
        }

        // A cited evidence id that wasn't in the original evidence set means the model
        // fabricated a citation ("hallucinated grounding") — treat as invalid.
        var evidenceIds = response.EvidenceIds ?? [];
        return evidenceIds.All(sentEvidenceIds.Contains);
    }
}
