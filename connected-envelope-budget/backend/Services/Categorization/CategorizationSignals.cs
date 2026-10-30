namespace Backend.Services.Categorization;

// Computed, code-derived evidence summary (build plan §4b). DeterministicConfidence is
// a trustworthy-by-construction number computed from raw evidence counts — never the
// model's self-reported confidence (explicitly distrusted, see plan Decision #7).
public sealed record CategorizationSignals(
    IReadOnlyDictionary<string, int> SameMerchantHistory,
    IReadOnlyList<string> RecentTrend,
    string? TimingPattern,
    IReadOnlyList<string> NegativeFeedback,
    int SampleSize,
    int AccountMaturity,
    double DeterministicConfidence);
