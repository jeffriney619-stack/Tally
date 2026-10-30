namespace Backend.Contracts;

public sealed record CategorizationEventRequest(
    string Username,
    string VendorKey,
    string TransactionId,
    string? CategoryId,
    string EventType,
    decimal Amount,
    DateOnly TransactionDate);
