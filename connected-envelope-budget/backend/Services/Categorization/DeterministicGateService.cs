using Backend.Contracts;
using Backend.Models;

namespace Backend.Services.Categorization;

// Outcome of the deterministic gate (build plan §4c). When Bypass is true, the
// controller returns CategoryId/Confidence/Explanation directly with no model call.
// When false, Signals/Evidence/VendorKey are populated so the controller can call the
// model next.
public sealed record CategorizationGateResult(
    bool Bypass,
    string? CategoryId,
    double? Confidence,
    string? Explanation,
    IReadOnlyList<string> EvidenceIds,
    string? Source,
    string VendorKey,
    CategorizationSignals? Signals,
    IReadOnlyList<CategorizationEvent> Evidence);

// Stage 4c of the pipeline: vendor rule always wins outright; else bypass the model
// entirely when the pipeline's own evidence-based confidence is already high enough
// (build plan Decisions #1 and #7). Only genuinely ambiguous/thin evidence escalates
// to an actual model call — this is the cascade confirmed against the product's own
// explainer flowcharts.
public sealed class DeterministicGateService(
    EvidenceRetrievalService evidenceRetrieval,
    SignalComputationService signalComputation,
    IConfiguration config)
{
    public async Task<CategorizationGateResult> EvaluateAsync(
        TransactionCategorizationRequest request,
        CancellationToken cancellationToken)
    {
        var vendorKey = VendorKeyNormalizer.Normalize(request.Merchant);

        var vendorRule = request.VendorRules.FirstOrDefault(
            rule => rule.Enabled && string.Equals(rule.VendorKey, vendorKey, StringComparison.Ordinal));
        if (vendorRule is not null)
        {
            return new CategorizationGateResult(
                Bypass: true,
                CategoryId: vendorRule.CategoryId,
                Confidence: 1.0,
                Explanation: $"You have a rule that always categorizes \"{request.Merchant}\" this way.",
                EvidenceIds: [],
                Source: SuggestionSource.VendorRule,
                VendorKey: vendorKey,
                Signals: null,
                Evidence: []);
        }

        var (evidence, accountMaturity) = await evidenceRetrieval.RetrieveAsync(request.Username, vendorKey, cancellationToken);
        var signals = signalComputation.Compute(evidence, accountMaturity, request.Date.DayOfWeek);

        var bypassCeiling = config.GetValue<double?>("AiTransactionCategorizer:BypassConfidenceCeiling") ?? 0.95;
        if (signals.DeterministicConfidence >= bypassCeiling && signals.SameMerchantHistory.Count > 0)
        {
            var majorityCategory = signals.SameMerchantHistory.OrderByDescending(pair => pair.Value).First();
            var supportingEvidenceIds = evidence
                .Where(item => item.CategoryId == majorityCategory.Key)
                .Select(item => item.Id)
                .ToList();

            return new CategorizationGateResult(
                Bypass: true,
                CategoryId: majorityCategory.Key,
                Confidence: signals.DeterministicConfidence,
                Explanation: $"{majorityCategory.Value} of your last {signals.SampleSize} confirmed categorizations for this vendor used this envelope.",
                EvidenceIds: supportingEvidenceIds,
                Source: SuggestionSource.Deterministic,
                VendorKey: vendorKey,
                Signals: signals,
                Evidence: evidence);
        }

        return new CategorizationGateResult(
            Bypass: false,
            CategoryId: null,
            Confidence: null,
            Explanation: null,
            EvidenceIds: [],
            Source: null,
            VendorKey: vendorKey,
            Signals: signals,
            Evidence: evidence);
    }
}
