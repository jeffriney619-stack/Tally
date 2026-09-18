using Backend.Contracts;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/transactions")]
public sealed class TransactionsController(BudgetDbContext database) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TransactionResponse>>> List(
        [FromQuery] string username,
        [FromQuery] string? month,
        [FromQuery] string? status,
        [FromQuery] string? categoryId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var query = database.Transactions.AsNoTracking().Where(item => item.Username == username);

        if (!string.IsNullOrWhiteSpace(month) && DateOnly.TryParse($"{month}-01", out var monthStart))
        {
            var monthEnd = monthStart.AddMonths(1);
            query = query.Where(item => item.Date >= monthStart && item.Date < monthEnd);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(item => item.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(categoryId))
        {
            query = query.Where(item => item.CategoryId == categoryId);
        }

        var results = await query.OrderByDescending(item => item.Date).ToListAsync(cancellationToken);
        return Ok(results.Select(ToResponse).ToList());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<TransactionResponse>> Get(
        string id,
        [FromQuery] string username,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var transaction = await database.Transactions
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == id && item.Username == username, cancellationToken);

        return transaction is null ? NotFound() : Ok(ToResponse(transaction));
    }

    [HttpPost]
    public async Task<ActionResult<TransactionResponse>> Create(
        [FromQuery] string username,
        CreateTransactionRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        if (!DateOnly.TryParse(request.Date, out var date))
        {
            ModelState.AddModelError(nameof(request.Date), "Date must be a valid date.");
        }

        if (string.IsNullOrWhiteSpace(request.Merchant))
        {
            ModelState.AddModelError(nameof(request.Merchant), "Merchant is required.");
        }

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var transaction = new Transaction
        {
            Username = username,
            Date = date,
            Merchant = request.Merchant.Trim(),
            RawDescription = request.RawDescription.Trim(),
            Amount = request.Amount,
            CategoryId = request.CategoryId,
            AccountId = request.AccountId,
            Status = request.Status,
            Source = request.Source,
            Notes = request.Notes,
            SpreadMonths = request.SpreadMonths <= 0 ? 1 : request.SpreadMonths,
        };

        database.Transactions.Add(transaction);
        await database.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(transaction));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<TransactionResponse>> Update(
        string id,
        [FromQuery] string username,
        UpdateTransactionRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var transaction = await database.Transactions
            .SingleOrDefaultAsync(item => item.Id == id && item.Username == username, cancellationToken);
        if (transaction is null)
        {
            return NotFound();
        }

        if (request.CategoryId is not null)
        {
            transaction.CategoryId = request.CategoryId;
        }

        if (request.Notes is not null)
        {
            transaction.Notes = request.Notes;
        }

        if (request.CategorizationSource is not null)
        {
            transaction.CategorizationSource = request.CategorizationSource;
        }

        if (request.Status is not null)
        {
            transaction.Status = request.Status;
        }

        transaction.UpdatedAt = DateTimeOffset.UtcNow;

        await database.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(transaction));
    }

    private static TransactionResponse ToResponse(Transaction transaction) => new(
        transaction.Id,
        transaction.Date.ToString("yyyy-MM-dd"),
        transaction.Merchant,
        transaction.RawDescription,
        transaction.Amount,
        transaction.CategoryId,
        transaction.AccountId,
        transaction.Status,
        transaction.Source,
        transaction.Notes,
        transaction.SpreadMonths,
        transaction.RefundOfId,
        transaction.ExpectedRefund,
        transaction.CategorizationSource);
}
