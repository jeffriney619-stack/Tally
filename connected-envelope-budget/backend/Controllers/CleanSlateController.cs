using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Backend.Contracts;
using Backend.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/clean-slate")]
public sealed class CleanSlateController(BudgetDbContext database) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Reset(
        [FromQuery] string username,
        CleanSlateRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        if (request is null || string.IsNullOrWhiteSpace(request.ResetType))
        {
            return BadRequest(new ProblemDetails { Detail = "resetType is required." });
        }

        if (!IsSupportedResetType(request.ResetType))
        {
            return BadRequest(new ProblemDetails { Detail = "resetType must be reset_transactions or start_new_budget." });
        }

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            return BadRequest(new ProblemDetails { Detail = "idempotencyKey is required." });
        }

        var existingResponse = await GetExistingIdempotentResponse(username, request.IdempotencyKey, cancellationToken);
        if (!string.IsNullOrWhiteSpace(existingResponse))
        {
            return Content(existingResponse, "application/json");
        }

        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);

        var currentStateJson = await GetPrototypeStateJson(username, cancellationToken);
        if (currentStateJson is null)
        {
            return NotFound();
        }

        var root = JsonNode.Parse(currentStateJson) as JsonObject;
        if (root is null)
        {
            return BadRequest(new ProblemDetails { Detail = "Stored prototype state is invalid." });
        }

        var resetAt = DateTimeOffset.UtcNow;
        var resetAtIso = resetAt.ToString("O");
        var currentMonth = DateTime.UtcNow.ToString("yyyy-MM");

        ApplyReset(root, request.ResetType, currentMonth, resetAtIso);

        if (request.ResetType == "start_new_budget")
        {
            await database.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM budget_profiles WHERE Username = {username};",
                cancellationToken);

            await database.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM budget_categories WHERE Username = {username};",
                cancellationToken);
        }

        await database.Database.ExecuteSqlInterpolatedAsync(
            $"DELETE FROM transactions WHERE Username = {username};",
            cancellationToken);

        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO clean_slate_cutoffs (username, cutoff_at, reset_type, updated_at)
            VALUES ({username}, {resetAtIso}, {request.ResetType}, {resetAtIso})
            ON CONFLICT(username) DO UPDATE SET
                cutoff_at = excluded.cutoff_at,
                reset_type = excluded.reset_type,
                updated_at = excluded.updated_at;
            """, cancellationToken);

        var nextStateJson = root.ToJsonString();
        await database.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE budget_accounts
            SET data = {nextStateJson}, updated_at = {resetAtIso}
            WHERE username = {username};
            """, cancellationToken);

        var responseNode = new JsonObject
        {
            ["resetType"] = request.ResetType,
            ["resetAt"] = resetAtIso,
            ["state"] = root.DeepClone(),
        };
        var responseJson = responseNode.ToJsonString();

        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO clean_slate_operations (username, idempotency_key, reset_type, response_json, created_at)
            VALUES ({username}, {request.IdempotencyKey}, {request.ResetType}, {responseJson}, {resetAtIso});
            """, cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return Content(responseJson, "application/json");
    }

    private async Task<string?> GetExistingIdempotentResponse(
        string username,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        await using var command = database.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT response_json FROM clean_slate_operations WHERE username = @username AND idempotency_key = @idempotency_key";

        var usernameParam = command.CreateParameter();
        usernameParam.ParameterName = "@username";
        usernameParam.Value = username;
        command.Parameters.Add(usernameParam);

        var keyParam = command.CreateParameter();
        keyParam.ParameterName = "@idempotency_key";
        keyParam.Value = idempotencyKey;
        command.Parameters.Add(keyParam);

        if (command.Connection?.State != ConnectionState.Open)
        {
            await database.Database.OpenConnectionAsync(cancellationToken);
        }

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private async Task<string?> GetPrototypeStateJson(string username, CancellationToken cancellationToken)
    {
        await using var command = database.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT data FROM budget_accounts WHERE username = @username";

        var usernameParam = command.CreateParameter();
        usernameParam.ParameterName = "@username";
        usernameParam.Value = username;
        command.Parameters.Add(usernameParam);

        if (command.Connection?.State != ConnectionState.Open)
        {
            await database.Database.OpenConnectionAsync(cancellationToken);
        }

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private static bool IsSupportedResetType(string resetType) =>
        resetType is "reset_transactions" or "start_new_budget";

    private static void ApplyReset(JsonObject root, string resetType, string currentMonth, string resetAtIso)
    {
        EnsureArray(root, "transactions").Clear();
        EnsureArray(root, "adjustments").Clear();
        EnsureArray(root, "monthInReviews").Clear();
        EnsureArray(root, "audit").Clear();

        ClearDerivedArtifacts(root);

        if (resetType == "start_new_budget")
        {
            root["onboardingComplete"] = false;
            root["monthlyIncome"] = 0;
            EnsureArray(root, "categories").Clear();
            EnsureArray(root, "vendorRules").Clear();
        }
        else
        {
            var categories = EnsureArray(root, "categories");
            foreach (var categoryNode in categories)
            {
                if (categoryNode is JsonObject category)
                {
                    category["openingBalance"] = 0;
                }
            }
        }

        EnsureCurrentMonth(root, currentMonth);
        root["resetCutoffAt"] = resetAtIso;
    }

    private static void ClearDerivedArtifacts(JsonObject root)
    {
        foreach (var propertyName in new[] { "forecasts", "insights", "spendingTrends", "badges", "badgeProgress" })
        {
            if (root[propertyName] is not null)
            {
                root[propertyName] = new JsonArray();
            }
        }
    }

    private static void EnsureCurrentMonth(JsonObject root, string currentMonth)
    {
        var months = EnsureArray(root, "months");
        var foundCurrent = false;

        foreach (var monthNode in months)
        {
            if (monthNode is not JsonObject monthObj)
            {
                continue;
            }

            var key = monthObj["key"]?.GetValue<string>();
            if (!string.Equals(key, currentMonth, StringComparison.Ordinal))
            {
                continue;
            }

            foundCurrent = true;
            monthObj["status"] = "open";
            monthObj.Remove("closedAt");
        }

        if (!foundCurrent)
        {
            months.Add(new JsonObject
            {
                ["key"] = currentMonth,
                ["status"] = "open",
            });
        }

        root["currentMonth"] = currentMonth;
    }

    private static JsonArray EnsureArray(JsonObject root, string propertyName)
    {
        if (root[propertyName] is JsonArray existingArray)
        {
            return existingArray;
        }

        var created = new JsonArray();
        root[propertyName] = created;
        return created;
    }
}
