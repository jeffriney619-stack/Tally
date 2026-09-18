namespace Backend.Models;

public sealed class BudgetProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public decimal MonthlyIncome { get; set; }
    public string TemplateKey { get; set; } = string.Empty;
    public string AllocationModel { get; set; } = string.Empty;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

// The live, ongoing envelope: scoped directly by Username rather than through
// BudgetProfile, matching the per-username convention used elsewhere (e.g.
// budget_accounts). Id is a string so it can preserve ids already used by the
// prototype's JSON-blob categories (e.g. "housing") during backfill.
public sealed class BudgetCategory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Group { get; set; } = string.Empty;
    public decimal MonthlyTarget { get; set; }
    public decimal OpeningBalance { get; set; }
    public int WarningThreshold { get; set; } = 100;
    public bool Archived { get; set; }
    public int SortOrder { get; set; }
}