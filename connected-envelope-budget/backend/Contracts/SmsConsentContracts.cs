namespace Backend.Contracts;

public sealed record SmsConsentResponse(
    string Username,
    string PhoneNumber,
    DateTimeOffset ConsentGivenAt,
    string ConsentMethod,
    DateTimeOffset? OptedOutAt);

public sealed record SaveSmsConsentRequest(string PhoneNumber, bool ConsentGiven, string Method);
