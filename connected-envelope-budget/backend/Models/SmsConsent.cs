namespace Backend.Models;

// One row per user — absence of a row means no SMS consent has ever been
// granted, per the "no outbound SMS without an active consent row" rule.
public sealed class SmsConsent
{
    public string Username { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public DateTimeOffset ConsentGivenAt { get; set; } = DateTimeOffset.UtcNow;
    public string ConsentMethod { get; set; } = string.Empty;
    public DateTimeOffset? OptedOutAt { get; set; }
}
