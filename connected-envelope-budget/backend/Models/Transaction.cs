namespace Backend.Models;

// Real, server-owned transaction record. Id is a string so it can preserve
// ids already used by the prototype's JSON-blob transactions (e.g. "tx-1001")
// during backfill.
public sealed class Transaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Username { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    public string Merchant { get; set; } = string.Empty;
    public string RawDescription { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? CategoryId { get; set; }
    public string AccountId { get; set; } = string.Empty;
    public string Status { get; set; } = "posted";
    public string Source { get; set; } = "bank";
    public string Notes { get; set; } = string.Empty;
    public int SpreadMonths { get; set; } = 1;
    public string? RefundOfId { get; set; }
    public bool ExpectedRefund { get; set; }
    public string? CategorizationSource { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
