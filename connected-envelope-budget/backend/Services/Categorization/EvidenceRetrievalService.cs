using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Categorization;

// Normalizes a merchant string into the vendor_key used to scope all evidence queries
// (build plan §3a / repo convention: trim + lowercase, matches frontend's vendorKey).
public static class VendorKeyNormalizer
{
    public static string Normalize(string merchant) => merchant.Trim().ToLowerInvariant();
}

// Stage 3 of the pipeline (build plan §4a): retrieves this user's evidence for one
// vendor, plus their account-wide confirmed-event count (maturity signal). Every query
// is scoped to a single username — never cross-user (plan Decision #5).
public sealed class EvidenceRetrievalService(BudgetDbContext database)
{
    private const int MaxEvidenceEvents = 25; // TODO: tune via §8 harness

    private static readonly string[] ConfirmedEventTypes =
    [
        CategorizationEventType.Manual,
        CategorizationEventType.SuggestedApproved,
        CategorizationEventType.Corrected,
    ];

    public async Task<(IReadOnlyList<CategorizationEvent> Evidence, int AccountMaturity)> RetrieveAsync(
        string username,
        string vendorKey,
        CancellationToken cancellationToken)
    {
        var evidence = await database.CategorizationEvents
            .Where(item => item.Username == username && item.VendorKey == vendorKey)
            .OrderByDescending(item => item.CreatedAt)
            .Take(MaxEvidenceEvents)
            .ToListAsync(cancellationToken);

        var accountMaturity = await database.CategorizationEvents
            .CountAsync(item => item.Username == username && ConfirmedEventTypes.Contains(item.EventType), cancellationToken);

        return (evidence, accountMaturity);
    }
}
