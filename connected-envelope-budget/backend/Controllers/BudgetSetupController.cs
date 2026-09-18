using Backend.Contracts;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/budget-setup")]
public sealed class BudgetSetupController(BudgetDbContext database) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<BudgetSetupResponse>> Get(
        [FromQuery] string username,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var profile = await database.BudgetProfiles
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Username == username, cancellationToken);
        if (profile is null)
        {
            return NotFound();
        }

        var categories = await database.BudgetCategories
            .AsNoTracking()
            .Where(item => item.Username == username)
            .OrderBy(item => item.SortOrder)
            .ToListAsync(cancellationToken);

        return Ok(ToResponse(profile, categories));
    }

    [HttpPut]
    public async Task<ActionResult<BudgetSetupResponse>> Save(
        [FromQuery] string username,
        SaveBudgetSetupRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var validationProblem = Validate(request);
        if (validationProblem is not null)
        {
            return validationProblem;
        }

        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var profile = await database.BudgetProfiles
            .SingleOrDefaultAsync(item => item.Username == username, cancellationToken);

        if (profile is null)
        {
            profile = new BudgetProfile { Username = username };
            database.BudgetProfiles.Add(profile);
        }

        await database.BudgetCategories
            .Where(item => item.Username == username)
            .ExecuteDeleteAsync(cancellationToken);

        profile.MonthlyIncome = request.MonthlyIncome;
        profile.TemplateKey = request.TemplateKey.Trim();
        profile.AllocationModel = request.AllocationModel.Trim();
        profile.UpdatedAt = DateTimeOffset.UtcNow;
        var categories = request.Categories
            .OrderBy(item => item.SortOrder)
            .Select(item => new BudgetCategory
            {
                Username = username,
                Name = item.Name.Trim(),
                Group = item.Group.Trim(),
                MonthlyTarget = item.MonthlyTarget,
                OpeningBalance = item.OpeningBalance,
                WarningThreshold = item.WarningThreshold,
                Archived = item.Archived,
                SortOrder = item.SortOrder,
            })
            .ToList();
        database.BudgetCategories.AddRange(categories);

        await database.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(ToResponse(profile, categories));
    }

    private ActionResult? Validate(SaveBudgetSetupRequest request)
    {
        if (request.MonthlyIncome <= 0)
        {
            ModelState.AddModelError(nameof(request.MonthlyIncome), "Monthly income must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(request.TemplateKey))
        {
            ModelState.AddModelError(nameof(request.TemplateKey), "Choose a budget template.");
        }

        if (request.Categories.Count == 0)
        {
            ModelState.AddModelError(nameof(request.Categories), "Add at least one category.");
        }

        if (request.Categories.Any(item => string.IsNullOrWhiteSpace(item.Name) || item.MonthlyTarget < 0))
        {
            ModelState.AddModelError(nameof(request.Categories), "Every category needs a name and a non-negative target.");
        }

        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    private static BudgetSetupResponse ToResponse(BudgetProfile profile, IReadOnlyList<BudgetCategory> categories) => new(
        profile.Id,
        profile.MonthlyIncome,
        profile.TemplateKey,
        profile.AllocationModel,
        profile.UpdatedAt,
        categories
            .OrderBy(item => item.SortOrder)
            .Select(item => new BudgetCategoryResponse(
                item.Id,
                item.Name,
                item.Group,
                item.MonthlyTarget,
                item.SortOrder,
                item.OpeningBalance,
                item.WarningThreshold,
                item.Archived))
            .ToList());
}