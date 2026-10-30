namespace Backend.Services.Categorization;

// Server-side C# port of frontend/src/services/merchantCategorizer.ts's recommendCategory().
// Last-resort fallback only (build plan Decision #4) — used when the AI model call fails
// or is unavailable, never as the primary suggestion path. Caller must pass only spendable,
// non-archived candidate envelopes (the frontend already filters this way today).
public static class FallbackKeywordCategorizer
{
    private sealed record MerchantPattern(string[] Keywords, string[] Categories);

    private static readonly Dictionary<string, string[]> CategoryNameAliases = new()
    {
        ["dining"] = ["dining"],
        ["groceries"] = ["groceries", "grocery"],
        ["transport"] = ["transport", "transportation", "car", "gas"],
        ["shopping"] = ["shopping", "personalspending", "personal"],
        ["entertainment"] = ["entertainment", "recreation", "funmoney", "fun"],
        ["insurance"] = ["insurance"],
        ["housing"] = ["housing", "rentmortgage", "rent", "mortgage", "home"],
    };

    private static readonly Dictionary<string, MerchantPattern> MerchantPatterns = new()
    {
        ["dining"] = new(
            ["coffee", "restaurant", "cafe", "pizza", "burger", "sushi", "takeout", "delivery",
                "doordash", "uber eats", "grubhub", "chipotle", "taco", "bar", "pub", "grill",
                "diner", "bistro", "bakery", "ice cream", "smoothie", "chips", "cookies"],
            ["dining", "shopping", "entertainment"]),
        ["groceries"] = new(
            ["grocery", "kroger", "safeway", "whole foods", "trader joes", "costco", "walmart",
                "target", "sprouts", "publix", "trader", "market", "supermarket", "food store"],
            ["groceries", "shopping"]),
        ["transport"] = new(
            ["gas", "fuel", "shell", "exxon", "chevron", "bp", "texaco", "speedway", "parking",
                "uber", "lyft", "taxi", "rideshare", "train", "transit", "airline", "flight",
                "airport", "vehicle", "car", "automotive", "mechanic", "repair", "inspection", "transfer"],
            ["transport", "shopping"]),
        ["shopping"] = new(
            ["amazon", "ebay", "shop", "store", "retail", "mall", "clothing", "apparel", "shoes",
                "merchandise", "lamp", "furniture", "phone charger", "harness"],
            ["shopping", "entertainment"]),
        ["entertainment"] = new(
            ["gym", "fitness", "yoga", "class", "trainer", "crossfit", "pilates", "massage",
                "couples massage", "spa", "wellness", "movie", "cinema", "theater", "concert",
                "sports", "game", "recreation"],
            ["entertainment", "shopping"]),
        ["shopping2"] = new(
            ["haircut", "salon", "beauty", "cosmetics", "grooming", "barber", "pet", "veterinary",
                "dog", "cat", "animal", "supplies", "sitter", "childcare", "babysitter", "laundry",
                "dry cleaning"],
            ["shopping", "entertainment"]),
        ["utilities_or_insurance"] = new(
            ["electric", "water", "gas bill", "utility", "internet", "phone", "service", "cable",
                "insurance", "state farm", "geico", "progressive"],
            ["insurance", "housing"]),
        ["housing"] = new(
            ["rent", "mortgage", "property tax", "home maintenance", "hvac", "plumbing", "roof",
                "hoa", "lease"],
            ["housing", "shopping"]),
    };

    public static (string? CategoryId, double Confidence, string Reason) RecommendCategory(
        string merchantName,
        IReadOnlyList<(string Id, string Name)> candidateEnvelopes)
    {
        var lowerMerchant = merchantName.ToLowerInvariant();

        foreach (var pattern in MerchantPatterns.Values)
        {
            foreach (var keyword in pattern.Keywords)
            {
                if (!lowerMerchant.Contains(keyword, StringComparison.Ordinal))
                {
                    continue;
                }

                foreach (var patternId in pattern.Categories)
                {
                    var (id, name) = FindCategoryByPatternId(candidateEnvelopes, patternId);
                    if (id is null)
                    {
                        continue;
                    }

                    return (id, 78, $"\"{merchantName}\" contains \"{keyword}\" \u2014 likely {name}.");
                }
            }
        }

        if (lowerMerchant.Contains("restaurant", StringComparison.Ordinal) || lowerMerchant.Contains("eat", StringComparison.Ordinal))
        {
            var dining = candidateEnvelopes.FirstOrDefault(item => item.Name.ToLowerInvariant().Contains("dining", StringComparison.Ordinal));
            if (dining.Id is not null)
            {
                return (dining.Id, 65, "Transaction appears to be a restaurant or food merchant.");
            }
        }

        var fallback = candidateEnvelopes.Count > 0 ? candidateEnvelopes[0] : default;
        return (fallback.Id, 40, "Could not confidently categorize \u2014 please review.");
    }

    private static (string? Id, string? Name) FindCategoryByPatternId(
        IReadOnlyList<(string Id, string Name)> categories,
        string patternId)
    {
        var byId = categories.FirstOrDefault(item => NormalizeLabel(item.Id) == NormalizeLabel(patternId));
        if (byId.Id is not null)
        {
            return byId;
        }

        var aliases = CategoryNameAliases.TryGetValue(patternId, out var configured) ? configured : [patternId];
        var normalizedAliases = aliases.Select(NormalizeLabel).ToArray();
        foreach (var category in categories)
        {
            var normalizedName = NormalizeLabel(category.Name);
            if (normalizedAliases.Any(alias => normalizedName == alias || normalizedName.Contains(alias) || alias.Contains(normalizedName)))
            {
                return category;
            }
        }

        return (null, null);
    }

    private static string NormalizeLabel(string value) =>
        new([.. value.ToLowerInvariant().Where(char.IsLetterOrDigit)]);
}
