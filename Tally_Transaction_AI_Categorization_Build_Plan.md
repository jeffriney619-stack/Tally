# Tally — Transaction Categorization AI/ML Build Plan

> **Purpose of this document:** a self-contained build plan for implementing
> real AI-backed category suggestions in Tally's Transaction Review feature,
> replacing the current hardcoded keyword matcher. Written so an AI
> assistant or engineer with minimal prior context on this repo can pick it
> up and implement it correctly. Every decision below was already debated
> and confirmed with the product owner — do not re-litigate them without
> explicit sign-off; flag disagreement instead of silently changing course.

---

## 1. Context primer (read this first)

**Tally** is an envelope-budgeting app. Repo root: `connected-envelope-budget/`.
- **Backend**: ASP.NET Core + EF Core + SQLite, .NET 10, top-level
  `Program.cs`. Single SQLite file backs everything — there is no separate
  database per user, no vector DB, no additional infra.
- **Frontend**: React 19 + Vite + TypeScript, in `frontend/src/`.
- **Two parallel data paths exist** — important, don't confuse them:
  - **Path 1 ("prototype state")**: one giant JSON blob per username, stored
    in the `budget_accounts` table, read/written whole via
    `PrototypeController` (`GET`/`PUT /api/prototype`). This is what the
    *entire* running app (Dashboard, Categories, Transactions, Transaction
    Review, Settings) actually operates on today. `frontend/src/types/budget.ts`
    defines its shape (`PrototypeState`).
  - **Path 2 (real EF Core tables)**: `BudgetProfile`, `BudgetCategory`,
    `Transaction`, etc. — normalized tables, used only by a beta "Live Data"
    view. Mostly dead code for the main app flows.
  - **This feature straddles both on purpose** (see §3) — the day-to-day
    transaction/category data keeps living in Path 1, but the new
    evidence/history log is a **new, real EF Core table**, for reasons
    explained below. This is a deliberate hybrid, not an oversight.
- **EF Core gotcha**: `EnsureCreated()` is effectively a no-op in this repo
  once any table exists in the SQLite file (see explanation in repo's own
  dev notes). **Every table — including any new one added for this
  feature — must get an explicit `CREATE TABLE IF NOT EXISTS ...` added to
  `Program.cs`.** Do not rely on EF migrations/`EnsureCreated()` alone or the
  table silently won't exist at runtime.
- **The feature being replaced**: `frontend/src/services/merchantCategorizer.ts`
  — a hardcoded keyword-to-category dictionary with fake static "confidence"
  values (40/65/78/96, picked by nothing but gut feel). It has zero
  learning, is identical for every user, and is the reason suggestions feel
  "completely inaccurate." This file's `recommendCategory()` function stays
  in the codebase as a **last-resort fallback only** (see §6) — do not
  delete it.
- **The feature already built (UI/UX layer — do not redesign)**:
  `frontend/src/TransactionReview.tsx` implements the full phased review
  flow (intro → suggested-category groups → manual one-at-a-time review →
  skipped review → completion) per
  `Tally_Transaction_Review_Feature_Integration_Plan.md` (workspace root).
  This plan is about replacing *only* the suggestion-generation logic
  underneath that UI, plus adding a feedback write-back — not rebuilding the
  UX.
- **The existing AI-integration pattern to copy**:
  `backend/Controllers/EnvelopeAssistantController.cs` — calls OpenAI via
  `IHttpClientFactory`, Bearer-token auth from config
  (`AiEnvelopeAssistant:ApiKey` / `OPENAI_API_KEY`), `response_format:
  json_object` for structured output, one retry on failure, defensive
  validation of the parsed response before trusting any ID in it. **Follow
  this exact pattern** for the new controller (naming, config keys can be
  parallel, e.g. `AiTransactionCategorizer:ApiKey`, or reuse the same config
  if a single shared OpenAI credential is intended — confirm with the
  product owner if unsure, don't assume a new separate key is required).
- **Reference doc**: `Tally_AI_ML_Transaction_Workflow.md` (workspace root)
  — the 8-stage conceptual framework this whole plan implements (normalize →
  assemble context → retrieve evidence → compute signals → apply rules/call
  model → validate → incorporate feedback → evaluate). Read it before
  starting; this build plan is the concrete translation of that doc onto
  this specific codebase.

**The core technique, in one sentence**: this is Retrieval-Augmented
Generation (RAG), not model training — OpenAI's model never changes; what
changes is the evidence (a growing, per-user, append-only history of
confirmed/rejected/corrected categorizations) fed into the prompt at request
time.

---

## 2. Decisions already made — do not re-litigate

1. **Vendor rules always win.** If an enabled `VendorSuggestionRule` exists
   for a transaction's vendor, suggest that rule's category directly — no
   model call, no ambiguity. This is a deterministic short-circuit, first
   gate in the pipeline.
2. **Signals the model/pipeline should consider** (confirmed scope): the
   user's own past approvals/corrections per vendor; recurring amount/pattern
   detection (subscriptions); day-of-week/time-of-day timing patterns;
   rejections as explicit *negative* evidence (not just "no signal"); the
   full set of the user's available envelopes + their definitions; the raw
   transaction/bank-statement detail itself (merchant text, amount, date),
   which should be weighted very heavily especially early on (see point 8).
3. **Suggestions are precomputed and cached**, not computed live when
   Transaction Review opens. Compute once when a transaction is
   created/imported; store the result on the transaction record.
4. **Fallback on OpenAI failure/unavailability**: fall back to the existing
   keyword matcher (`recommendCategory` in `merchantCategorizer.ts`) as a
   best-effort guess, flagged with a distinct `suggestionSource` so the UI/
   analytics can tell it apart from a real evidence-based suggestion. Do not
   silently treat a fallback guess as equivalent to a validated suggestion.
5. **Cross-user / global aggregate evidence is explicitly parked.** The
   product owner called this "touchy" and wants to revisit later. **Do not
   build any cross-user data sharing, aggregation, or pooling in this phase.**
   Every query against the evidence store must be scoped to a single
   `username` — no exceptions, no "just for cold start" shortcuts.
6. **No synthetic persona test fixtures.** The product owner has ~2 years of
   his own real household spending data he will import into his own dev
   account instead (see §7). Do not generate fake persona datasets.
7. **New deterministic confidence gate, second in the pipeline** (after the
   vendor-rule check): if the evidence-based confidence computed from Stage-4
   signals (see §4) is at or above a (to-be-empirically-determined) ceiling,
   suggest directly without calling the model at all. This is **not** the
   model's self-reported confidence (explicitly distrusted — LLM confidence
   scores are not calibrated probabilities) — it's a number the pipeline's
   own code computes from raw evidence counts, so it's trustworthy by
   construction and auditable.
8. **Account-maturity-aware weighting.** For a user with few total confirmed
   categorizations (a rough starting candidate is "under ~50," **to be
   empirically tuned, not hardcoded**), the pipeline should lean heavily on
   the raw merchant/transaction text and the envelope's own definition
   (Stage 1/2) rather than thin personal history (Stage 3/4), since a
   couple of data points shouldn't be treated as an established pattern.
   Once an account is "mature," flip that emphasis toward the user's actual
   confirmed history. This is implemented as **prompt framing and gate
   threshold adjustment**, not literal numeric weight coefficients (there
   are no trained weights in this system — see §9's framing instructions).
9. **Thresholds are empirically determined, not guessed.** The old `60` in
   `merchantCategorizer.ts` was picked arbitrarily and measures nothing real.
   Every threshold in the new system (manual-review floor, deterministic
   bypass ceiling, account-maturity cutoff) must be set using the evaluation
   harness in §8, run against the product owner's real imported data, before
   being treated as final. Ship with clearly-labeled placeholder/config
   values until that harness has run.
10. **The 2-year personal data import is a dev/test-only tool.** It gets
    imported into the product owner's **own** account only, is used to
    validate the pipeline and tune thresholds (§7, §8), and is never used as
    a template/baseline applied to other users' evidence (that would bake
    one household's idiosyncratic habits in as if universal — an overfitting
    risk explicitly called out and rejected). Real users never bulk-import
    history; they start cold, same as any new account.
11. **Bank-provided category signal**: Tally has no real bank/Plaid-style
    ingestion yet. Design the signal schema (§4) with an explicit, currently-
    unused slot for a future "provider-asserted category" signal so it can
    be added later without a schema redesign, but do not implement it now.

---

## 3. Data model changes

### 3a. New EF Core table: `categorization_events`

**Why a real table and not another field in the Path 1 JSON blob**: this is
an append-only log that needs to be queried/filtered efficiently
(`WHERE username = ? AND vendor_key = ?`) and will grow large once real
history (including the 2-year import) exists. The Path 1 blob model means
loading/re-saving the *entire* JSON document on every read/write — fine for
the current transaction/category lists, not appropriate for a growing
evidence log. Follows the same `Username`-scoped-table convention already
used by `BudgetCategory`/`Transaction` in Path 2.

New file `backend/Models/CategorizationEvent.cs`:

```csharp
public class CategorizationEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public required string Username { get; set; }
    public required string VendorKey { get; set; }       // normalized merchant string
    public required string TransactionId { get; set; }    // the BudgetTransaction.id this event is about
    public string? CategoryId { get; set; }                // null when rejected-without-reassignment
    public required string EventType { get; set; }         // see enum below
    public decimal Amount { get; set; }
    public DateTime TransactionDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

`EventType` values (string, not a DB enum, to match this repo's existing
style of string-typed status fields):
- `manual` — user categorized unprompted, no suggestion was ever shown.
- `suggested_approved` — Tally suggested `CategoryId`, user approved it.
- `suggested_rejected` — Tally suggested a category, user removed it;
  `CategoryId` on this row is the *rejected* category, recorded as negative
  evidence for that vendor+category pair.
- `corrected` — Tally suggested one category, user picked a different one;
  write **two** rows for this: one `suggested_rejected` (old category) and
  one `corrected` (new, final `CategoryId`).
- `rule_created` / `rule_removed` — a `VendorSuggestionRule` was toggled on/off.

Add to `BudgetDbContext.cs`: `DbSet<CategorizationEvent> CategorizationEvents`.

Add to `Program.cs` (alongside the other `CREATE TABLE IF NOT EXISTS`
statements):
```sql
CREATE TABLE IF NOT EXISTS categorization_events (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    vendor_key TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    category_id TEXT NULL,
    event_type TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categorization_events_vendor
    ON categorization_events (username, vendor_key);
```

### 3b. `BudgetCategory.description` (new optional field)

**Why**: Stage 2 of the pipeline needs each envelope's *meaning*, not just
its name, to disambiguate cases like "Dining" vs. "Dates." Today this
reasoning is computed during AI-assisted onboarding
(`EnvelopeRecommendation.reason` in `frontend/src/onboardingEngine.ts`, e.g.
*"Create Date Night because you asked to track it separately."*) but is
**dropped** after onboarding commits — it survives only transiently in
`assistantSession.categories[].reason` (linked by name, not id) and never
reaches the persisted `BudgetCategory`.

Changes:
- `frontend/src/types/budget.ts`: add `description?: string` to `BudgetCategory`.
- `backend/Models/` equivalent EF entity: add nullable `Description` column
  + `CREATE TABLE`/`ALTER TABLE` update for `budget_categories` (Path 2 —
  lower priority since Path 2 is mostly dead code for the main flows, but
  keep the two models consistent).
- `frontend/src/App.tsx`, inside the `AdaptiveOnboarding` `onFinish` handler
  (search for `const newCategories: BudgetCategory[] = toCreate.map(...)`,
  currently around line 4130): set `description: item.reason` when building
  each new `BudgetCategory`.
- Manual-setup path (non-AI onboarding, the old template grid) has no
  `reason` available — leave `description` undefined/blank; optionally
  surface an editable "What's this envelope for?" field somewhere in the
  Categories/Settings UI so users can fill it in later. Not required for v1
  but flagged as a nice-to-have — confirm with product owner before
  building UI for this specifically.

### 3c. `BudgetTransaction` — new cached-suggestion fields

Add to `frontend/src/types/budget.ts`'s `BudgetTransaction` (and the Path 2
EF `Transaction` model if kept in sync):

```ts
export type SuggestionSource = 'vendor_rule' | 'deterministic' | 'ai' | 'fallback_keyword' | null

// Cached result of the categorization pipeline, computed once at transaction
// creation time (see §5). Null/undefined until the pipeline has run.
suggestedCategoryId?: string | null
suggestionConfidence?: number | null
suggestionExplanation?: string | null
suggestionEvidenceIds?: string[]
suggestionSource?: SuggestionSource
```

`TransactionReview.tsx`'s `buildItems()` should read these cached fields
directly instead of calling `getSuggestion()`/`recommendCategory()` from
`merchantCategorizer.ts` (that file becomes fallback-only, see §6).

---

## 4. Backend pipeline — new services + controller

New folder suggestion: `backend/Services/Categorization/` (mirrors no
existing folder exactly, but keeps this cleanly separated from
`Controllers/`/`Contracts/`). All of these are plain C# classes, no new
external dependencies required beyond what's already in the project
(`IHttpClientFactory`, EF Core, `System.Text.Json`).

### 4a. `EvidenceRetrievalService`
Input: `username`, `vendorKey`.
Query `categorization_events` filtered to that pair (and only that pair —
see Decision #5, never cross-user), ordered by `created_at` descending,
capped at a reasonable count (e.g. most recent 25 — tune later, not a
hard product requirement to get exactly right on first pass). Also fetch
**account-level** total confirmed-event count for the maturity signal
(Decision #8) — a separate, cheap `COUNT(*)` query scoped to `username`
only (not vendor-scoped).

### 4b. `SignalComputationService`
Pure computation, no I/O, no AI call. Input: the evidence from 4a + the
transaction being categorized. Output, roughly:

```csharp
public record CategorizationSignals(
    Dictionary<string, int> SameMerchantHistory,   // categoryId -> confirmed count
    List<string> RecentTrend,                      // most recent confirmed categoryIds, newest first
    string? TimingPattern,                          // e.g. "4 comparable Friday-evening purchases were Dates" or null
    List<string> NegativeFeedback,                  // human-readable notes on rejections/corrections for this vendor
    int SampleSize,                                  // total confirmed events for this vendor
    int AccountMaturity,                             // total confirmed events for this user, all vendors
    double DeterministicConfidence                  // see formula below — 0 when insufficient/contradictory evidence
);
```

`DeterministicConfidence` formula (placeholder constants marked `TODO: tune
via §8 harness`):
```
if SampleSize < 3 (TODO: tune) → 0
if any contradiction in NegativeFeedback for the majority category → 0
else → (count of majority category / SampleSize), scaled/clamped to [0,1]
```

### 4c. `DeterministicGateService`
Given a transaction:
1. Look up `VendorSuggestionRule` for this vendor — if enabled, return
   `(Source: vendor_rule, CategoryId: rule.CategoryId)` immediately, no
   further computation needed.
2. Else compute signals via 4a/4b. If `DeterministicConfidence >=
   BYPASS_CEILING` (config value, `TODO: tune via §8`, placeholder `0.95`),
   return `(Source: deterministic, CategoryId: majority category,
   Confidence: DeterministicConfidence)` — no model call.
3. Else, evidence is ambiguous/thin — proceed to 4d (call the model).

### 4d. `PromptBuilder` + `TransactionCategorizationController`
New controller `backend/Controllers/TransactionCategorizationController.cs`,
route suggestion: `api/transaction-categorization`, same constructor-injection
pattern as `EnvelopeAssistantController` (`IConfiguration`,
`IHttpClientFactory`, `ILogger<...>`).

System prompt (adapt, keep close to the source doc's wording — this was
reviewed and approved conceptually):
```
Select the existing envelope best supported by this user's confirmed
history and definitions. Treat rejected suggestions as negative evidence.
Do not invent purchase purpose. Request input when the evidence cannot
distinguish plausible destinations. Return only JSON matching the supplied
schema.
```
Include explicit account-maturity framing in the prompt payload (Decision
#8), e.g. a `guidance` string that changes based on `AccountMaturity`:
- Low maturity: "This user has limited categorization history. Weight the
  envelope's own definition and general merchant-type matching above thin
  personal history. Do not treat 1-2 confirmed examples as an established
  pattern."
- Established: "This user has well-established categorization history.
  Prioritize their actual confirmed choices over generic assumptions about
  merchant type."

Request payload shape (JSON body to the model, `response_format:
json_object`, same as `EnvelopeAssistantController`):
```json
{
  "transaction": { "merchant": "...", "amount": 0.0, "date": "...", "dayOfWeek": "...", "accountId": "..." },
  "envelopes": [ { "id": "...", "name": "...", "description": "..." } ],
  "signals": { "sameMerchantHistory": {}, "recentTrend": [], "timingPattern": null, "negativeFeedback": [] },
  "accountMaturity": "low|established",
  "guidance": "...",
  "requiredResponseShape": {
    "decision": "suggest|needs_input",
    "envelope_id": "string|null",
    "alternative_envelope_ids": ["string"],
    "evidence_ids": ["string"],
    "explanation": "string",
    "clarification_question": "string|null"
  }
}
```

New contract types in `backend/Contracts/TransactionCategorizationContracts.cs`
mirroring `EnvelopeAssistantContracts.cs`'s style (records with
`[JsonPropertyName]` attributes as needed).

### 4e. `ResponseValidator` (Stage 6 — two layers, keep them distinct)

**Layer 1 — structural/referential**, mirrors
`EnvelopeAssistantController.NormalizeAndValidateResponse`:
- `decision` must be exactly `"suggest"` or `"needs_input"`.
- If `"suggest"`: `envelope_id` must be non-empty AND must exist in the
  `envelopes` list sent in **this** request (never trust an ID without
  checking membership against the real list — the model can hallucinate a
  plausible-looking ID).
- If `"needs_input"`: `clarification_question` must be non-empty.
- `explanation` must be non-empty.

**Layer 2 — evidence grounding** (new, not present in
`EnvelopeAssistantController` since that feature doesn't cite evidence):
every ID in `evidence_ids` must exist in the evidence set that was actually
sent to the model in this request. A cited ID that wasn't in the original
evidence set is treated as a validation failure (the model fabricated a
citation) — this is a cheap, deterministic way to catch a class of
plausible-but-false explanations without another model call.

On failure of either layer: retry the model call once (same pattern as
`EnvelopeAssistantController.Generate`); if still invalid, fall back per
Decision #4.

**Layer 3 is NOT part of this validator** — "is this well-formed and
grounded" (validator's job) is a different question from "is this
recommendation strong enough to show" (the gate/threshold policy, §2 #7/#9).
Keep these conceptually and in code separate.

### 4f. Config
`appsettings.json` / env vars (parallel to `AiEnvelopeAssistant:*`):
```
AiTransactionCategorizer:ApiKey (or reuse OPENAI_API_KEY)
AiTransactionCategorizer:Endpoint (optional override)
AiTransactionCategorizer:Model
AiTransactionCategorizer:BypassConfidenceCeiling   // placeholder 0.95, TODO tune
AiTransactionCategorizer:ManualReviewFloor          // placeholder TBD, TODO tune
AiTransactionCategorizer:AccountMaturityThreshold   // placeholder 50, TODO tune
```

---

## 5. Precompute hook — where suggestions actually get generated

Suggestions must be computed **once, at transaction creation/import time**,
not live when Transaction Review opens (Decision #3). This requires finding
every current code path that creates a `BudgetTransaction` and calling the
new backend pipeline right after, caching the result onto the new fields
from §3c. Known creation paths to check (confirm exhaustively during
implementation — this list is a starting point, not guaranteed complete):
- Manual transaction entry (`App.tsx`, search `categorizationSource:
  'Manual entry'`).
- SMS confirmation flow (`App.tsx`, search `categorizationSource: 'SMS
  confirmation'`).
- Any seed/demo/backfill transaction creation (`data/seed.ts`,
  `BackfillCategoriesAndTransactions` in `Program.cs`) — decide whether
  demo/seed data should also get real suggestions computed (probably yes,
  for consistent dev/demo experience) or be explicitly excluded (if seed
  data shouldn't burn real OpenAI calls) — **confirm with product owner**.
- The future real bank-import path, whenever that's built (out of scope
  today, but the hook point should be designed so adding it later is a
  one-line call to "run the categorization pipeline for this new
  transaction," not a redesign).

---

## 6. Frontend changes

- `frontend/src/TransactionReview.tsx`: `buildItems()` reads
  `transaction.suggestedCategoryId` / `.suggestionConfidence` /
  `.suggestionExplanation` directly instead of calling
  `getSuggestion()`. The `MIN_SUGGESTION_CONFIDENCE` check becomes "does
  this transaction have a non-null `suggestedCategoryId`" (the backend has
  already applied the threshold policy before caching a result — the
  frontend shouldn't re-implement threshold logic).
- `frontend/src/services/merchantCategorizer.ts`: **keep
  `recommendCategory()`** as the implementation backing the `fallback_keyword`
  `suggestionSource` (Decision #4) — called server-side as a fallback when
  the AI call fails, or client-side only if no cached suggestion exists at
  all for some reason. Remove/retire `suggestionCache`'s role as the
  *primary* suggestion path once the backend precompute hook is live;
  it can stay as-is for the fallback use case or be deleted if the backend
  fallback makes it fully redundant — confirm during implementation which
  layer actually ends up calling it.
- Feedback write-back: in `TransactionReview.tsx`, wherever a group is
  approved, a transaction is removed from a suggested group, a manual
  assignment happens in Phase 2, or a vendor rule is toggled, also call a
  new API (`POST /api/categorization-events` or batched with the existing
  `onCommit` save) to persist the corresponding `CategorizationEvent` row(s)
  per the mapping in §3a's `EventType` list. This is the mechanism that
  makes the evidence store grow — without this, nothing the user does in
  Transaction Review ever becomes future evidence.
- Category description field: surface `description` as an editable field
  somewhere a user manages envelopes (exact placement — Settings vs.
  Categories view — is a UI decision, confirm with product owner before
  building; not blocking for the core pipeline to function since the field
  can simply be blank for categories that don't have one).

---

## 7. Real-data import (dev/test-only — see Decision #10)

- Need a one-time import mechanism (script or temporary admin endpoint) that
  takes the product owner's ~2 years of real household transaction data and:
  1. Creates/matches `BudgetTransaction` rows in **his own account only**.
  2. Creates matching `CategorizationEvent` rows with `EventType = "manual"`
     for every already-categorized transaction (none of this history ever
     went through Tally's suggestion flow, so it's all `manual`, never
     `suggested_*`).
- **Exact file format of the source data is not yet known** — confirm with
  the product owner before building a parser (likely a spreadsheet/CSV
  export from a bank or budgeting tool, but do not assume; ask).
- This import must never run against any other user's account, and must not
  feed any cross-user/global aggregate (Decision #5/#10 — there isn't one
  built in this phase anyway).

---

## 8. Evaluation harness (Stage 8 — run before locking in any threshold)

Build a small offline evaluation script/console utility (does not need to
be a polished product feature) that:
1. Loads the imported real history (§7), sorted chronologically.
2. For each transaction, computes what the pipeline *would have* suggested
   using **only evidence dated strictly before** that transaction's date
   (avoid look-ahead bias / data leakage — do not let the harness "see the
   future" relative to the transaction being evaluated).
3. Compares the would-have-suggested category to the transaction's actual
   real-world category (ground truth, since this is the product owner's own
   real history).
4. Aggregates **precision** (of transactions where a confident suggestion
   was made, how often was it correct) and **recall/coverage** (of all
   transactions, how many got a confident suggestion at all) across a range
   of candidate thresholds for:
   - the deterministic bypass ceiling (try e.g. 70/80/85/90/95%),
   - the manual-review floor,
   - the account-maturity cutoff (try e.g. 25/50/100 confirmed events).
5. Outputs a table of precision/recall per candidate threshold so the
   product owner can pick values deliberately (there is no universally
   "correct" number — it's a product trade-off between coverage and trust,
   his call to make with real numbers in front of him).
6. Replace every `TODO: tune via §8` placeholder in config (§4f) with the
   chosen real values once this has run.

---

## 9. Explicitly out of scope for this build (do not implement)

- Cross-user/global aggregate evidence or any form of pooling data across
  usernames (Decision #5).
- Synthetic persona test fixtures (Decision #6).
- Bank/Plaid-style provider category signal (no real ingestion exists yet —
  leave a schema slot, don't implement, Decision #11).
- Reviving the old true-AI `EnvelopeAssistantController`-driven onboarding
  flow (unrelated, separately parked by the product owner).
- Any change to the Transaction Review UX/phases/progress bars themselves —
  this plan only replaces the suggestion-generation logic underneath it.

---

## 10. Suggested implementation order

1. Data model: `categorization_events` table + `BudgetCategory.description`
   + new `BudgetTransaction` cached-suggestion fields (§3).
2. Backend services end-to-end with placeholder thresholds: retrieval →
   signals → deterministic gates → prompt builder → OpenAI call → validator
   (§4), exposed via the new controller.
3. Precompute hook wired into every transaction-creation path found (§5).
4. Frontend: `TransactionReview.tsx` reads cached suggestions; feedback
   actions write `CategorizationEvent`s; `merchantCategorizer.ts` demoted to
   fallback-only (§6).
5. Real-data import mechanism into the product owner's own dev account (§7).
6. Evaluation harness; run it against the imported data; replace placeholder
   thresholds with measured values (§8).
7. Ship; keep logging suggestion outcomes going forward so thresholds can be
   revisited later as real (non-synthetic, non-single-household) usage data
   accumulates across actual users.

---

## 11. Implementation status (as of 2026-10-08)

**Steps 1–4 of §10 are built, verified, and live-tested. Steps 5–6 (§7 real
2-year data import, §8 evaluation harness) have not been started — that is
the next work.** If you're picking this up in a fresh chat: read this whole
document first, then this section, then just ask to start on §7.

### What exists now

**Data model (§3)** — all live in the real dev SQLite DB, migrations verified:
- `backend/Models/CategorizationEvent.cs` — `CategorizationEvent` entity +
  `CategorizationEventType` string constants.
- `BudgetDbContext.cs` / `Program.cs` — `categorization_events` table + index
  on `(Username, VendorKey)`; `BudgetCategory.Description` column added via a
  new `EnsureColumnExists` helper (safe `ALTER TABLE` for a table that already
  existed in the dev DB).
- `frontend/src/types/budget.ts` — `BudgetCategory.description?`, new
  `SuggestionSource` type, and `suggestedCategoryId` / `suggestionConfidence`
  / `suggestionExplanation` / `suggestionEvidenceIds` / `suggestionSource` on
  `BudgetTransaction`.
- **Deliberately not done**: the Path 2 EF `Transaction` model was *not*
  given matching suggestion-cache columns — Transaction Review only ever
  reads Path 1 (`PrototypeState`), so those columns would be dead weight on
  Path 2 right now (the plan itself calls this "lower priority").

**Backend pipeline (§4)** — `backend/Services/Categorization/`:
- `VendorKeyNormalizer`, `EvidenceRetrievalService` (per-user/per-vendor,
  capped at 25 most-recent events — a named placeholder, not tuned),
  `SignalComputationService` (pure; computes `CategorizationSignals`
  including `DeterministicConfidence`), `DeterministicGateService` (vendor
  rule → deterministic bypass → else defer to AI), `CategorizationPromptBuilder`,
  `CategorizationResponseValidator` (structural + evidence-grounding checks),
  `FallbackKeywordCategorizer` (faithful C# port of the old
  `merchantCategorizer.ts` `recommendCategory()`, used server-side only when
  the AI call fails/is unconfigured).
- `Controllers/TransactionCategorizationController.cs`
  (`POST /api/transaction-categorization/suggest`) and
  `Controllers/CategorizationEventsController.cs`
  (`POST /api/categorization-events`, the feedback write-back endpoint).
- `appsettings.json` — `AiTransactionCategorizer:BypassConfidenceCeiling`
  (0.95), `ManualReviewFloor` (0.5), `AccountMaturityThreshold` (50), all
  explicitly placeholders pending §8.
- OpenAI credentials are **reused** from `AiEnvelopeAssistant:*` — no
  separate key/endpoint/model config was added.

**Precompute hook + frontend (§5/§6)**:
- `frontend/src/services/api.ts` — `suggestTransactionCategory()` and
  `recordCategorizationEvents()`.
- `simulateCharge` (the "Simulate bank charge" button in Transactions — the
  primary way to exercise this pipeline pre-bank-integration) calls the real
  backend pipeline synchronously and caches all 5 fields on the transaction;
  falls back to the local keyword matcher only if the backend call throws.
- `addManualTransaction` and the SMS-simulator "Y" confirm flow both write
  `CategorizationEvent`s (`manual` / `suggested_approved` as appropriate).
- `TransactionReview.tsx` — `buildItems()` reads `suggestedCategoryId`
  directly (an `undefined` field means "never computed, legacy data" → one
  last local guess; an explicit `null` means "pipeline ran, found nothing" →
  trusted as-is, routed straight to manual review). `approveCurrentGroup`
  writes `suggested_approved` / `suggested_rejected` / `rule_created` /
  `rule_removed`; `assignManual` / `assignSkipped` write `corrected` (item
  had a suggestion that got overridden) or `manual` (never had one).
- `merchantCategorizer.ts` — `suggestionCache` and `getSuggestion()` were
  **deleted** (confirmed decision, not kept as a fallback layer);
  `recommendCategory()` and `MIN_SUGGESTION_CONFIDENCE` remain.
- `data/seed.ts` — the 4 demo transactions that used to rely on the deleted
  `suggestionCache` (`tx-1004`/`1005`/`1007`/`1010`) now carry the same
  suggestion values directly as fields.

### Extra decisions confirmed beyond this document (don't re-litigate)

1. AI-called path's gate is the model's own `suggest`/`needs_input` decision
   only — no post-hoc numeric confidence is computed for AI-sourced
   suggestions. `ManualReviewFloor` applies only to the deterministic score
   and to the keyword-fallback path.
2. Precompute is synchronous (blocks the save/import request), not
   fire-and-forget.
3. Synthetic/manually-entered transactions **do** get real pipeline calls —
   there's no bank ingestion yet, so they're the only way to exercise this
   for now. (A cheap no-API-call "test mode" for bulk fixtures would be a
   separate future ask.)
4. Feedback events: `suggested_rejected` for an item removed from a
   suggested group fires when the **group is approved/committed**, not at
   the moment of the removal click. A subsequent manual-review assignment
   for that same item writes `corrected` only (not a second
   `suggested_rejected`).
5. Vendor rule `rule_created`/`rule_removed` events only fire when a rule's
   enabled state actually changes versus its prior saved state, not on every
   group approval.
6. One-time startup backfill for pre-existing transactions missing the new
   cached fields was agreed in concept (run the real pipeline, don't force a
   suggestion onto evidence-thin rows) but **was not implemented** — no
   backfill code exists yet. Flag this if asked to backfill later.

### Verification performed

- Backend: `dotnet build` clean (0 warnings/errors) after every phase; real
  `dotnet run` against the actual dev SQLite file confirmed all new
  tables/columns/migrations apply without error.
- Backend logic: live HTTP calls to `/api/transaction-categorization/suggest`
  and `/api/categorization-events` confirmed all four pipeline branches
  (vendor-rule bypass, deterministic bypass, keyword-fallback-confident,
  ambiguous-evidence → AI-attempt-fails(no key) → low-confidence fallback →
  `needsInput: true`).
- Frontend: `tsc --noEmit` clean and `biome check` clean (pre-existing
  repo-wide lint debt unrelated to this feature, documented in repo memory,
  was left alone) after every phase.
- Full live browser pass (logged in as `jriley`): "Simulate bank charge" →
  real cached suggestion fields confirmed via API; "Manually add
  transaction" → `manual` event path confirmed (no console errors);
  Transaction Review → an unsuggested (`null`) transaction correctly skipped
  Phase 1 and went straight to manual review, got assigned, and persisted
  with `categorizationSource: "Transaction review · manual"`.

### Known incidental state (not a code issue, just FYI)

- `jriley`'s dev account had **no envelopes/categories at all** when this
  testing started (pre-onboarding/blank state) — it was seeded with 3
  placeholder envelopes (Dining, Shopping, Transportation) and a couple of
  test transactions via direct API calls purely to enable browser testing.
  Nothing pre-existing was overwritten, but don't assume `jriley` reflects a
  "real" onboarded account — reset or rebuild it before using it as a
  realistic demo.
- A `smoketest-user`'s rows were written to `categorization_events` during
  backend-only testing and were deleted afterward (one-time cleanup, no
  residue left).

### To resume: §7 (real 2-year data import) and §8 (evaluation harness)

Per Decision #10 in §2 and the notes in §7/§8 above: this is dev/test-only,
imports into the product owner's **own** account only, and the exact source
file format is **not yet known** — confirm with the product owner before
writing a parser. Do not reuse `jriley`'s current placeholder test data for
this; it should probably go into a clean account or a clean reset of
`jriley`. Nothing about §7/§8 has been scoped in detail yet beyond what's
already written earlier in this document.

