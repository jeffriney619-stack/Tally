# Tally Text Integration Feature Summary

## Overview
The text integration feature is currently a hybrid implementation:
- Real backend support for SMS consent and opt-in/opt-out state.
- Real frontend wiring for collecting and updating consent.
- Simulated SMS conversation UX for budgeting interactions.
- Planned (not yet implemented) provider-backed two-way texting via Twilio.

## What Is Implemented Today

### 1. Backend SMS consent API (live)
A real API exists for storing and reading SMS consent per user.
- `GET /api/sms-consent?username=...` returns current consent status.
- `PUT /api/sms-consent?username=...` creates/updates consent.
- Opt-out updates `OptedOutAt`.
- Re-consent clears prior opt-out.
- If no record exists, consent is treated as never granted.

### 2. Database support (live)
The `sms_consent` table is created at backend startup and used by EF Core.
Consent fields track:
- Username
- Phone number
- Consent timestamp
- Consent method
- Opt-out timestamp (nullable)

### 3. Onboarding consent capture (live)
In onboarding, users can provide a mobile number and check a consent checkbox.
When checked, the app saves consent to the backend.

### 4. Settings consent management (live)
In Settings, the app:
- Loads existing consent state on mount.
- Lets users toggle consent on/off.
- Persists changes through the same backend consent endpoint.

### 5. SMS simulator experience (live, frontend-only)
The app includes an "SMS simulator" tab that models the conversation behavior.
Supported simulated replies include:
- `Y` / `YES` style confirmation behavior
- `M` category menu
- `balance`
- `summary`

This simulator updates prototype app state and audit history in-app, but does not send real text messages.

## What Is Not Implemented Yet

### 1. Real provider messaging path
The production two-way SMS stack is still pending:
- No live Twilio outbound send flow wired to transaction ingestion yet.
- No inbound Twilio webhook processing endpoint implemented yet.
- No live SMS message log/conversation lock tables wired end-to-end yet.

### 2. Compliance delivery phase completion
Twilio registration/setup work is documented but paused pending public legal pages (Privacy Policy and Terms) needed for campaign completion.

## Product Shape Right Now
Practically, the feature already supports:
- Capturing user permission to text.
- Storing and enforcing consent state.
- Demonstrating the expected text conversation UX in simulation.

It does not yet support:
- Sending or receiving real carrier SMS messages in production.

## Recommended One-Line Positioning
"Tally has live SMS consent infrastructure and a complete simulated texting workflow today; full real-time Twilio-powered two-way texting is the next implementation phase."