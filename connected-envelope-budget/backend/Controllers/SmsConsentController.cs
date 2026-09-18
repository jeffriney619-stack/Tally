using Backend.Contracts;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/sms-consent")]
public sealed class SmsConsentController(BudgetDbContext database) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SmsConsentResponse>> Get(
        [FromQuery] string username,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        var consent = await database.SmsConsents
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Username == username, cancellationToken);

        return consent is null ? NotFound() : Ok(ToResponse(consent));
    }

    [HttpPut]
    public async Task<ActionResult<SmsConsentResponse>> Save(
        [FromQuery] string username,
        SaveSmsConsentRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ProblemDetails { Detail = "username is required." });
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            ModelState.AddModelError(nameof(request.PhoneNumber), "A phone number is required.");
            return ValidationProblem(ModelState);
        }

        var consent = await database.SmsConsents
            .SingleOrDefaultAsync(item => item.Username == username, cancellationToken);

        if (!request.ConsentGiven)
        {
            // Nothing to opt out of if consent was never granted in the first place.
            if (consent is null)
            {
                return NotFound();
            }

            consent.OptedOutAt = DateTimeOffset.UtcNow;
            await database.SaveChangesAsync(cancellationToken);
            return Ok(ToResponse(consent));
        }

        if (consent is null)
        {
            consent = new SmsConsent
            {
                Username = username,
                PhoneNumber = request.PhoneNumber.Trim(),
                ConsentGivenAt = DateTimeOffset.UtcNow,
                ConsentMethod = request.Method,
            };
            database.SmsConsents.Add(consent);
        }
        else
        {
            consent.PhoneNumber = request.PhoneNumber.Trim();
            consent.OptedOutAt = null; // re-consenting clears a prior opt-out
        }

        await database.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(consent));
    }

    private static SmsConsentResponse ToResponse(SmsConsent consent) => new(
        consent.Username,
        consent.PhoneNumber,
        consent.ConsentGivenAt,
        consent.ConsentMethod,
        consent.OptedOutAt);
}
