namespace Backend.Models;

// Append-only evidence log for the transaction-categorization AI pipeline (see
// Tally_Transaction_AI_Categorization_Build_Plan.md, workspace root, §3a).
// Every row is scoped by Username — never queried across users (plan Decision #5).
public sealed class CategorizationEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public required string Username { get; set; }
    public required string VendorKey { get; set; }
    public required string TransactionId { get; set; }
    public string? CategoryId { get; set; }
    public required string EventType { get; set; }
    public decimal Amount { get; set; }
    public DateTime TransactionDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// String-typed EventType values for CategorizationEvent.EventType (matches this
// repo's existing convention of string-typed status fields rather than DB enums).
public static class CategorizationEventType
{
    public const string Manual = "manual";
    public const string SuggestedApproved = "suggested_approved";
    public const string SuggestedRejected = "suggested_rejected";
    public const string Corrected = "corrected";
    public const string RuleCreated = "rule_created";
    public const string RuleRemoved = "rule_removed";
}
