using Backend.Contracts;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

// Feedback write-back (build plan §6): every approve/reject/correct/rule-toggle action
// in Transaction Review calls this so the evidence store actually grows. Without this,
// nothing the user does ever becomes future evidence for EvidenceRetrievalService.
[ApiController]
[Route("api/categorization-events")]
public sealed class CategorizationEventsController(BudgetDbContext database) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] IReadOnlyList<CategorizationEventRequest> events, CancellationToken cancellationToken)
    {
        if (events is null || events.Count == 0)
        {
            return BadRequest(new ProblemDetails { Detail = "At least one event is required." });
        }

        foreach (var item in events)
        {
            if (string.IsNullOrWhiteSpace(item.Username) || string.IsNullOrWhiteSpace(item.VendorKey) ||
                string.IsNullOrWhiteSpace(item.TransactionId) || string.IsNullOrWhiteSpace(item.EventType))
            {
                return BadRequest(new ProblemDetails { Detail = "username, vendorKey, transactionId, and eventType are required." });
            }

            database.CategorizationEvents.Add(new CategorizationEvent
            {
                Username = item.Username,
                VendorKey = item.VendorKey,
                TransactionId = item.TransactionId,
                CategoryId = item.CategoryId,
                EventType = item.EventType,
                Amount = item.Amount,
                TransactionDate = item.TransactionDate.ToDateTime(TimeOnly.MinValue),
            });
        }

        await database.SaveChangesAsync(cancellationToken);
        return Ok(new { created = events.Count });
    }
}
