using System.Text.Json;
using Backend.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/prototype")]
public sealed class PrototypeController(BudgetDbContext database) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string username, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        await using var command = database.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT data FROM budget_accounts WHERE username = @username";
        var usernameParam = command.CreateParameter();
        usernameParam.ParameterName = "@username";
        usernameParam.Value = username;
        command.Parameters.Add(usernameParam);
        await database.Database.OpenConnectionAsync(cancellationToken);
        var result = await command.ExecuteScalarAsync(cancellationToken);

        return result is string data
            ? Content(data, "application/json")
            : NotFound();
    }

    [HttpPut]
    public async Task<IActionResult> Save(
        [FromQuery] string username,
        JsonElement state,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        if (state.ValueKind is not JsonValueKind.Object)
        {
            return BadRequest(new ProblemDetails { Detail = "Prototype state must be a JSON object." });
        }

        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO budget_accounts (username, data, updated_at)
            VALUES ({username}, {state.GetRawText()}, {DateTimeOffset.UtcNow.ToString("O")})
            ON CONFLICT(username) DO UPDATE SET
                data = excluded.data,
                updated_at = excluded.updated_at;
            """, cancellationToken);

        return Ok(state);
    }
}