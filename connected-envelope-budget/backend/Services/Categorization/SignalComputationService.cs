using Backend.Models;

namespace Backend.Services.Categorization;

// Stage 4 of the pipeline (build plan §4b): pure computation, no I/O, no AI call.
public sealed class SignalComputationService
{
    // Below this many confirmed events for a vendor, evidence is too thin to trust —
    // DeterministicConfidence stays 0 and no timing pattern is reported. TODO: tune via §8 harness.
    private const int MinSampleSizeForPattern = 3;

    public CategorizationSignals Compute(
        IReadOnlyList<CategorizationEvent> evidence,
        int accountMaturity,
        DayOfWeek transactionDayOfWeek)
    {
        var confirmed = evidence
            .Where(item => item.CategoryId is not null && item.EventType is
                CategorizationEventType.Manual or CategorizationEventType.SuggestedApproved or CategorizationEventType.Corrected)
            .ToList();

        var sameMerchantHistory = confirmed
            .GroupBy(item => item.CategoryId!)
            .ToDictionary(group => group.Key, group => group.Count());

        var recentTrend = confirmed
            .OrderByDescending(item => item.CreatedAt)
            .Take(5)
            .Select(item => item.CategoryId!)
            .ToList();

        // Previous AI suggestions are not confirmed labels — only explicit rejections
        // become negative evidence (plan §1 "Retrieve relevant historical evidence").
        var negativeFeedback = evidence
            .Where(item => item.EventType == CategorizationEventType.SuggestedRejected)
            .Select(item => $"Rejected {item.CategoryId ?? "no category"} on {item.TransactionDate:yyyy-MM-dd}.")
            .ToList();

        string? timingPattern = null;
        var sameDayConfirmed = confirmed.Where(item => item.TransactionDate.DayOfWeek == transactionDayOfWeek).ToList();
        if (sameDayConfirmed.Count >= MinSampleSizeForPattern)
        {
            var majority = sameDayConfirmed
                .GroupBy(item => item.CategoryId!)
                .OrderByDescending(group => group.Count())
                .First();
            if (majority.Count() == sameDayConfirmed.Count)
            {
                timingPattern = $"{majority.Count()} comparable {transactionDayOfWeek} purchases were {majority.Key}.";
            }
        }

        var sampleSize = confirmed.Count;
        var deterministicConfidence = 0.0;
        if (sampleSize >= MinSampleSizeForPattern && sameMerchantHistory.Count > 0)
        {
            var majorityCategory = sameMerchantHistory.OrderByDescending(pair => pair.Value).First();
            var contradicted = negativeFeedback.Any(note => note.Contains(majorityCategory.Key, StringComparison.Ordinal));
            if (!contradicted)
            {
                deterministicConfidence = Math.Clamp((double)majorityCategory.Value / sampleSize, 0, 1);
            }
        }

        return new CategorizationSignals(
            sameMerchantHistory,
            recentTrend,
            timingPattern,
            negativeFeedback,
            sampleSize,
            accountMaturity,
            deterministicConfidence);
    }
}
