namespace Backend.Contracts;

public sealed record TransactionResponse(
    string Id,
    string Date,
    string Merchant,
    string RawDescription,
    decimal Amount,
    string? CategoryId,
    string AccountId,
    string Status,
    string Source,
    string Notes,
    int SpreadMonths,
    string? RefundOfId,
    bool ExpectedRefund,
    string? CategorizationSource);

public sealed record CreateTransactionRequest(
    string Date,
    string Merchant,
    string RawDescription,
    decimal Amount,
    string? CategoryId,
    string AccountId,
    string Status,
    string Source,
    string Notes,
    int SpreadMonths);

// Only the fields an SMS reply / manual edit is allowed to change. Amount,
// date, merchant, and identity always come from the ingestion source, never
// from this endpoint (product doc section 6).
public sealed record UpdateTransactionRequest(
    string? CategoryId,
    string? Notes,
    string? CategorizationSource,
    string? Status);
