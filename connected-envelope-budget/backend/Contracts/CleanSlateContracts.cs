using System.Text.Json.Nodes;

namespace Backend.Contracts;

public sealed record CleanSlateRequest(
    string ResetType,
    string IdempotencyKey);

public sealed record CleanSlateResponse(
    string ResetType,
    string ResetAt,
    JsonObject State);
