using System.Text.Json;
using System.Text;
using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Authentication.JwtBearer;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddDbContext<BudgetDbContext>(options =>
	options.UseSqlite(builder.Configuration.GetConnectionString("BudgetDatabase")));

var defaultCorsOrigins = new[]
{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:5174",
	"http://127.0.0.1:5174"
};
var configuredCorsOrigins =
	builder.Configuration["Cors:AllowedOrigins"] ??
	Environment.GetEnvironmentVariable("CORS_ORIGINS");
var allowedCorsOrigins = string.IsNullOrWhiteSpace(configuredCorsOrigins)
	? defaultCorsOrigins
	: configuredCorsOrigins
		.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// Add JWT authentication
var jwtSecret = builder.Configuration["JwtSecret"] ?? "your-secret-key-change-this-in-production-12345";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
	.AddJwtBearer(options =>
	{
		options.TokenValidationParameters = new TokenValidationParameters
		{
			ValidateIssuerSigningKey = true,
			IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
			ValidateIssuer = true,
			ValidIssuer = "Tally",
			ValidateAudience = true,
			ValidAudience = "Tally",
			ValidateLifetime = true
		};
	});

builder.Services.AddCors(options =>
	options.AddPolicy("frontend", policy => policy
		.WithOrigins(allowedCorsOrigins)
		.AllowAnyHeader()
		.AllowAnyMethod()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
	var database = scope.ServiceProvider.GetRequiredService<BudgetDbContext>();
	// EnsureCreated() only creates tables when the database has none at all — since
	// prototype_state/budget_accounts already exist, it would silently no-op forever
	// and never create new EF-mapped tables. So every EF table is created explicitly
	// below, the same way prototype_state/budget_accounts already were.
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS users (
			Id TEXT NOT NULL PRIMARY KEY,
			Username TEXT NOT NULL,
			PasswordHash TEXT NOT NULL,
			CreatedAt TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw(
		"CREATE UNIQUE INDEX IF NOT EXISTS IX_users_Username ON users (Username);");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS budget_profiles (
			Id TEXT NOT NULL PRIMARY KEY,
			Username TEXT NOT NULL,
			MonthlyIncome TEXT NOT NULL,
			TemplateKey TEXT NOT NULL,
			AllocationModel TEXT NOT NULL,
			UpdatedAt TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw(
		"CREATE UNIQUE INDEX IF NOT EXISTS IX_budget_profiles_Username ON budget_profiles (Username);");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS budget_categories (
			Id TEXT NOT NULL PRIMARY KEY,
			Username TEXT NOT NULL,
			Name TEXT NOT NULL,
			"Group" TEXT NOT NULL,
			MonthlyTarget TEXT NOT NULL,
			OpeningBalance TEXT NOT NULL,
			WarningThreshold INTEGER NOT NULL,
			Archived INTEGER NOT NULL,
			SortOrder INTEGER NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw(
		"CREATE INDEX IF NOT EXISTS IX_budget_categories_Username ON budget_categories (Username);");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS transactions (
			Id TEXT NOT NULL PRIMARY KEY,
			Username TEXT NOT NULL,
			Date TEXT NOT NULL,
			Merchant TEXT NOT NULL,
			RawDescription TEXT NOT NULL,
			Amount TEXT NOT NULL,
			CategoryId TEXT NULL,
			AccountId TEXT NOT NULL,
			Status TEXT NOT NULL,
			Source TEXT NOT NULL,
			Notes TEXT NOT NULL,
			SpreadMonths INTEGER NOT NULL,
			RefundOfId TEXT NULL,
			ExpectedRefund INTEGER NOT NULL,
			CategorizationSource TEXT NULL,
			CreatedAt TEXT NOT NULL,
			UpdatedAt TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw(
		"CREATE INDEX IF NOT EXISTS IX_transactions_Username_Date ON transactions (Username, Date);");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS sms_consent (
			Username TEXT NOT NULL PRIMARY KEY,
			PhoneNumber TEXT NOT NULL,
			ConsentGivenAt TEXT NOT NULL,
			ConsentMethod TEXT NOT NULL,
			OptedOutAt TEXT NULL
		);
		""");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS prototype_state (
			id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
			data TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS budget_accounts (
			username TEXT NOT NULL PRIMARY KEY,
			data TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS clean_slate_cutoffs (
			username TEXT NOT NULL PRIMARY KEY,
			cutoff_at TEXT NOT NULL,
			reset_type TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		""");
	database.Database.ExecuteSqlRaw("""
		CREATE TABLE IF NOT EXISTS clean_slate_operations (
			username TEXT NOT NULL,
			idempotency_key TEXT NOT NULL,
			reset_type TEXT NOT NULL,
			response_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (username, idempotency_key)
		);
		""");
	// One-time migration: fold the old single-account row into the new per-username table.
	database.Database.ExecuteSqlRaw("""
		INSERT OR IGNORE INTO budget_accounts (username, data, updated_at)
		SELECT 'jriley', data, updated_at FROM prototype_state WHERE id = 1;
		""");

	BackfillCategoriesAndTransactions(database);
}

app.UseCors("frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();

// One-time, idempotent backfill: promotes categories/transactions embedded in each
// username's JSON blob (budget_accounts.data) into the real budget_categories and
// transactions tables, so nothing from the existing prototype data is lost. Safe
// to run on every startup — already-backfilled ids are skipped.
static void BackfillCategoriesAndTransactions(BudgetDbContext database)
{
	var existingCategoryIds = database.BudgetCategories.Select(item => item.Id).ToHashSet();
	var existingTransactionIds = database.Transactions.Select(item => item.Id).ToHashSet();

	var blobs = new List<(string Username, string Data)>();
	database.Database.OpenConnection();
	using (var command = database.Database.GetDbConnection().CreateCommand())
	{
		command.CommandText = "SELECT username, data FROM budget_accounts";
		using var reader = command.ExecuteReader();
		while (reader.Read())
		{
			blobs.Add((reader.GetString(0), reader.GetString(1)));
		}
	}

	foreach (var (username, data) in blobs)
	{
		using var document = JsonDocument.Parse(data);
		var root = document.RootElement;

		if (root.TryGetProperty("categories", out var categories))
		{
			var sortOrder = 0;
			foreach (var category in categories.EnumerateArray())
			{
				var id = category.TryGetProperty("id", out var idProperty)
					? idProperty.GetString() ?? Guid.NewGuid().ToString()
					: Guid.NewGuid().ToString();
				if (!existingCategoryIds.Add(id))
				{
					sortOrder++;
					continue;
				}

				database.BudgetCategories.Add(new BudgetCategory
				{
					Id = id,
					Username = username,
					Name = category.TryGetProperty("name", out var name) ? name.GetString() ?? string.Empty : string.Empty,
					Group = category.TryGetProperty("group", out var group) ? group.GetString() ?? string.Empty : string.Empty,
					MonthlyTarget = category.TryGetProperty("monthlyTarget", out var target) ? target.GetDecimal() : 0,
					OpeningBalance = category.TryGetProperty("openingBalance", out var opening) ? opening.GetDecimal() : 0,
					WarningThreshold = category.TryGetProperty("warningThreshold", out var warning) ? warning.GetInt32() : 100,
					Archived = category.TryGetProperty("archived", out var archived) && archived.ValueKind == JsonValueKind.True,
					SortOrder = sortOrder,
				});
				sortOrder++;
			}
		}

		if (root.TryGetProperty("transactions", out var transactions))
		{
			foreach (var transaction in transactions.EnumerateArray())
			{
				var id = transaction.TryGetProperty("id", out var idProperty)
					? idProperty.GetString() ?? Guid.NewGuid().ToString()
					: Guid.NewGuid().ToString();
				if (!existingTransactionIds.Add(id))
				{
					continue;
				}

				if (!transaction.TryGetProperty("date", out var dateProperty) ||
					!DateOnly.TryParse(dateProperty.GetString(), out var date))
				{
					continue;
				}

				database.Transactions.Add(new Transaction
				{
					Id = id,
					Username = username,
					Date = date,
					Merchant = transaction.TryGetProperty("merchant", out var merchant) ? merchant.GetString() ?? string.Empty : string.Empty,
					RawDescription = transaction.TryGetProperty("rawDescription", out var raw) ? raw.GetString() ?? string.Empty : string.Empty,
					Amount = transaction.TryGetProperty("amount", out var amount) ? amount.GetDecimal() : 0,
					CategoryId = transaction.TryGetProperty("categoryId", out var categoryId) && categoryId.ValueKind == JsonValueKind.String
						? categoryId.GetString()
						: null,
					AccountId = transaction.TryGetProperty("accountId", out var accountId) ? accountId.GetString() ?? string.Empty : string.Empty,
					Status = transaction.TryGetProperty("status", out var status) ? status.GetString() ?? "posted" : "posted",
					Source = transaction.TryGetProperty("source", out var source) ? source.GetString() ?? "bank" : "bank",
					Notes = transaction.TryGetProperty("notes", out var notes) ? notes.GetString() ?? string.Empty : string.Empty,
					SpreadMonths = transaction.TryGetProperty("spreadMonths", out var spread) ? spread.GetInt32() : 1,
					RefundOfId = transaction.TryGetProperty("refundOfId", out var refundOfId) && refundOfId.ValueKind == JsonValueKind.String
						? refundOfId.GetString()
						: null,
					ExpectedRefund = transaction.TryGetProperty("expectedRefund", out var expected) && expected.ValueKind == JsonValueKind.True,
					CategorizationSource = transaction.TryGetProperty("categorizationSource", out var categorizationSource) && categorizationSource.ValueKind == JsonValueKind.String
						? categorizationSource.GetString()
						: null,
				});
			}
		}
	}

	database.SaveChanges();
}
