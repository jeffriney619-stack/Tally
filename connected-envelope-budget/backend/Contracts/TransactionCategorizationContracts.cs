using System.Text.Json.Serialization;

namespace Backend.Contracts;

// Candidate envelope the transaction could be slotted into. Caller (frontend) is
// responsible for only including spendable, non-archived envelopes — this contract
// does not re-derive that filtering.
public sealed record TransactionCategorizationEnvelope(
    string Id,
    string Name,
    string? Description);

// A user-approved vendor->category rule (mirrors frontend VendorSuggestionRule).
// Vendor rules live in Path 1 (PrototypeState), not a backend table, so the caller
// must supply the relevant one(s) with the request.
public sealed record TransactionCategorizationVendorRule(
    string VendorKey,
    string CategoryId,
    bool Enabled);

public sealed record TransactionCategorizationRequest(
    string Username,
    string TransactionId,
    string Merchant,
    decimal Amount,
    DateOnly Date,
    IReadOnlyList<TransactionCategorizationEnvelope> Envelopes,
    IReadOnlyList<TransactionCategorizationVendorRule> VendorRules);

// Source of a returned suggestion — mirrors frontend SuggestionSource.
public static class SuggestionSource
{
    public const string VendorRule = "vendor_rule";
    public const string Deterministic = "deterministic";
    public const string Ai = "ai";
    public const string FallbackKeyword = "fallback_keyword";
}

public sealed record TransactionCategorizationResponse(
    string? CategoryId,
    // Null for Source == "ai": the model's own suggest/needs_input decision is the
    // only gate for that path (no post-hoc numeric confidence — see build plan).
    double? Confidence,
    string Explanation,
    IReadOnlyList<string> EvidenceIds,
    string Source,
    bool NeedsInput,
    string? ClarificationQuestion);

// Raw shape returned by the OpenAI call, before validation (plan §4d requiredResponseShape).
// Property names mirror the snake_case keys specified in that schema.
public sealed record AiCategorizationModelResponse(
    string Decision,
    [property: JsonPropertyName("envelope_id")] string? EnvelopeId,
    [property: JsonPropertyName("alternative_envelope_ids")] IReadOnlyList<string>? AlternativeEnvelopeIds,
    [property: JsonPropertyName("evidence_ids")] IReadOnlyList<string>? EvidenceIds,
    string? Explanation,
    [property: JsonPropertyName("clarification_question")] string? ClarificationQuestion);
