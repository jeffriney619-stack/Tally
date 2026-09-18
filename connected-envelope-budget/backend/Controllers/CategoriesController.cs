using Backend.Contracts;
using Backend.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

// Read access to the live envelope categories, independent of BudgetProfile —
// callers (e.g. the SMS pipeline, category verification) shouldn't need a
// setup-wizard profile row to exist just to look up a user's categories.
[ApiController]
[Route("api/categories")]
public sealed class CategoriesController(BudgetDbContext database) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BudgetCategoryResponse>>> List(
        [FromQuery] string username,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var categories = await database.BudgetCategories
            .AsNoTracking()
            .Where(item => item.Username == username)
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
            .ToListAsync(cancellationToken);

        return Ok(categories);
    }
}
