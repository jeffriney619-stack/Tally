namespace Backend.Contracts;

public sealed record BudgetCategoryRequest(
    string Name,
    string Group,
    decimal MonthlyTarget,
    int SortOrder,
    decimal OpeningBalance = 0,
    int WarningThreshold = 100,
    bool Archived = false);

public sealed record SaveBudgetSetupRequest(
    decimal MonthlyIncome,
    string TemplateKey,
    string AllocationModel,
    IReadOnlyList<BudgetCategoryRequest> Categories);

public sealed record BudgetCategoryResponse(
    string Id,
    string Name,
    string Group,
    decimal MonthlyTarget,
    int SortOrder,
    decimal OpeningBalance,
    int WarningThreshold,
    bool Archived);

public sealed record BudgetSetupResponse(
    Guid Id,
    decimal MonthlyIncome,
    string TemplateKey,
    string AllocationModel,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<BudgetCategoryResponse> Categories);