using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

public sealed class BudgetDbContext(DbContextOptions<BudgetDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<BudgetProfile> BudgetProfiles => Set<BudgetProfile>();
    public DbSet<BudgetCategory> BudgetCategories => Set<BudgetCategory>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<SmsConsent> SmsConsents => Set<SmsConsent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.ToTable("users");
            user.HasKey(item => item.Id);
            user.HasIndex(item => item.Username).IsUnique();
        });

        modelBuilder.Entity<BudgetProfile>(profile =>
        {
            profile.ToTable("budget_profiles");
            profile.HasKey(item => item.Id);
            profile.HasIndex(item => item.Username).IsUnique();
            profile.Property(item => item.MonthlyIncome).HasPrecision(12, 2);
        });

        modelBuilder.Entity<BudgetCategory>(category =>
        {
            category.ToTable("budget_categories");
            category.HasKey(item => item.Id);
            category.HasIndex(item => item.Username);
            category.Property(item => item.Name).HasMaxLength(80);
            category.Property(item => item.MonthlyTarget).HasPrecision(12, 2);
            category.Property(item => item.OpeningBalance).HasPrecision(12, 2);
        });

        modelBuilder.Entity<Transaction>(transaction =>
        {
            transaction.ToTable("transactions");
            transaction.HasKey(item => item.Id);
            transaction.HasIndex(item => new { item.Username, item.Date });
            transaction.Property(item => item.Amount).HasPrecision(12, 2);
        });

        modelBuilder.Entity<SmsConsent>(consent =>
        {
            consent.ToTable("sms_consent");
            consent.HasKey(item => item.Username);
        });
    }
}