using System.Text.Json;

namespace Backend.Contracts;

public sealed record EnvelopeAssistantUniversalCategory(
    string Id,
    string Name,
    string Group);

public sealed record EnvelopeAssistantRequest(
    string PromptVersion,
    IReadOnlyList<EnvelopeAssistantUniversalCategory> UniversalCategories,
    IReadOnlyList<string> BaselineCategoryIds,
    JsonElement Answers);

public sealed record EnvelopeAssistantCategoryRecommendation(
    string Name,
    string Group,
    string Source,
    string? UniversalCategoryId,
    IReadOnlyList<string> ReplacesUniversalCategoryIds,
    string Reason,
    IReadOnlyList<string> AnswerKeys,
    string Priority);

public sealed record EnvelopeAssistantResponse(
    string Summary,
    IReadOnlyList<EnvelopeAssistantCategoryRecommendation> Categories,
    string? ModelName = null);
