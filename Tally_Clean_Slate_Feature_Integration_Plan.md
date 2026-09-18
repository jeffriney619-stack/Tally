# Tally Clean Slate Feature Integration Plan

## 1. Feature Summary

The **Clean Slate** feature gives users a compassionate, controlled way to recover when their budget has become too difficult to reconcile or when they simply want to begin again.

The experience must feel warm and reassuring while clearly communicating that its reset actions are permanent. It must support two distinct levels of reset:

1. **Reset Transactions and Envelope Totals** — preserve the user's budget structure while clearing its financial history and restoring envelope totals.
2. **Start a New Budget** — delete the entire current budget and return the user to Tally's original no-budget state.

Neither reset can be undone.

---

## 2. Goals

- Give overwhelmed users a clear path forward without requiring them to repair months of outdated budget data.
- Support a lighter reset that preserves the work involved in creating a budget.
- Support a complete budget restart without forcing users to recreate their account or reconnect their bank.
- Prevent erased bank transactions from being imported again.
- Make irreversible consequences understandable before the user confirms an action.
- Allow Tally's insights, forecasts, reviews, and badges to rebuild from a genuinely clean baseline.

## 3. Non-Goals

- The feature does not delete the user's Tally account, profile, login, connected bank accounts, or general app preferences.
- The feature does not provide an undo or recovery period.
- The first version will not preserve scheduled or recurring budget items.
- The first version will not offer a data export before deletion.
- The lighter reset will not reconcile configured envelope contributions against the user's actual bank balance.

---

## 4. Settings Entry Point

Add a new section to the Settings menu.

### Section title

**Need a reset?**

### Supporting copy direction

Use a short, comforting sentence that normalizes restarting. Recommended copy:

> Falling behind happens. Start fresh whenever you need to—your next step matters more than your last one.

### Primary action

**Clean Slate**

Selecting the button opens a modal containing two descriptive option cards:

- **Reset Transactions and Envelope Totals**
- **Start a New Budget**

The modal should use a warm, reassuring tone while still explaining deletion precisely.

### No-budget state

When the user does not have an active budget:

- Keep the **Need a reset?** section visible.
- Display both reset options as disabled/grayed out.
- Do not allow either reset workflow to begin.

---

## 5. Option One: Reset Transactions and Envelope Totals

### User intent

Use this option when the user wants to keep their current budget structure but erase all activity and restart its balances.

### Descriptive card copy

**Reset Transactions and Envelope Totals**

> Keep your envelopes, monthly contributions, connected banks, and saved vendor rules. Remove your transaction history and restart each envelope from this month's contribution.

### Data that is preserved

- User profile and login
- General app preferences
- Connected bank accounts
- Existing envelopes
- Envelope names, organization, and ordering
- Configured monthly contribution amounts
- Saved merchant/vendor categorization rules

### Data that is deleted or reset

- All posted transactions from every month
- All manual transactions from every month
- All pending transactions from every month
- All prior envelope balances and spending totals
- All past budget history
- All scheduled or recurring budget items, including items such as auto-insurance expenses
- All budget-derived data, including:
  - Forecasts
  - Month-in-review data
  - Spending trends
  - Insights
  - Earned badges
  - Badge progress
  - Any other calculations derived from deleted budget activity

### Envelope balance behavior

After the reset:

1. Restore every envelope to its full configured contribution for the current month.
2. Do this regardless of how late in the month the reset occurs.
3. Do not prorate contributions.
4. Do not scale or adjust contributions based on the user's connected bank balance.

### Confirmation

This reset requires two separate confirmation clicks. The interface must clearly explain that:

- Transactions across all months will be permanently deleted.
- Historical budget data and derived insights will be erased.
- Envelopes, contributions, connected banks, and saved vendor rules will remain.
- The action cannot be undone.

The precise two-click sequence was not finalized during product discovery. Recommended implementation:

1. User selects **Reset Transactions and Envelope Totals** in the option modal.
2. Tally opens a detailed warning screen; the user selects **Continue**.
3. Tally presents a final **Reset Now** confirmation button.

### Completion state

After a successful reset:

- Return the user to Overview.
- Show a reassuring reset-success message.
- Display restored envelope totals based on configured current-month contributions.
- Begin collecting new activity immediately.

Recommended success message:

> Your clean slate is ready. Your envelopes and monthly contributions are still here, and you can move forward from today.

---

## 6. Option Two: Start a New Budget

### User intent

Use this option when the user wants to discard the current budget completely and return to the state they were in before creating a budget.

### Descriptive card copy

**Start a New Budget**

> Delete your current budget, envelopes, transactions, history, and progress. Your profile, preferences, and connected banks will remain.

### Data that is preserved

- User profile and login
- General app preferences
- Connected bank accounts

### Data that is deleted or reset

- The entire active budget
- All envelopes and their contribution amounts
- All posted and manual transactions across every month
- All pending transactions across every month
- All budget and monthly history
- All scheduled or recurring budget items
- All saved vendor categorization rules, because their destination envelopes no longer exist
- All forecasts and month-in-review data
- All spending trends and insights
- All earned badges and badge progress
- All other budget-derived data

### Confirmation

The workflow must display a clear warning that the action is permanent and cannot be undone.

To enable the final destructive action, the user must type:

`DELETE`

Recommended requirements:

- Match the confirmation phrase exactly.
- Keep the final action disabled until the correct phrase is entered.
- Label the final action **Delete Budget and Start Fresh**.
- Provide a non-destructive **Cancel** action.

### Completion state

After completion:

- Return the user to Overview.
- Show the normal no-budget empty state—the flower with the coin/smile illustration.
- Do not automatically launch onboarding.
- Do not disconnect the user's bank accounts.
- Do not require the user to reconnect their bank when they later create a budget.

Whether a separate success toast or banner should accompany the normal empty state was not finalized. The base requirement is to show the established no-budget Overview state.

---

## 7. Bank Synchronization and Transaction Cutoff

Both reset actions must create a permanent transaction cutoff using the reset timestamp.

### Import rule

- Import only transactions that post after the reset timestamp.
- Do not reimport deleted transactions during a later bank synchronization.
- Eligibility is determined by when the transaction posts, not merely by its purchase or authorization date.

### Pending-transaction handling

Pending transactions are deleted during both reset paths.

If a previously pending charge later posts after the reset timestamp, it may import as a new eligible posted transaction because eligibility is based on post time.

No pending-to-posted in-place update is required after reset because the pending record no longer exists.

---

## 8. Months and Historical Navigation

The reset applies across every month.

After either reset:

- Months before the reset remain available in month navigation.
- Those prior months display as empty months.
- No deleted transactions, totals, summaries, trends, or insights may appear in them.
- The current month becomes the new starting point for activity and calculations.

---

## 9. Badges, Forecasts, Reviews, and Insights

All budget-derived features restart after either reset.

### Badges

- Delete all previously earned badges and badge progress.
- Allow the user to earn every badge again.
- Begin evaluating badge criteria immediately using post-reset activity.

### Forecasts, month reviews, trends, and insights

- Delete all existing outputs and source calculations.
- Begin rebuilding immediately from post-reset activity.
- Never use deleted pre-reset data in new calculations.
- Features that require a minimum amount of data should remain in their normal insufficient-data state until the threshold is met.

---

## 10. Recurring and Scheduled Items

For the first version, delete all future scheduled and recurring budget items after either reset.

This includes expected expenses such as auto insurance when represented as scheduled or recurring budget items.

This behavior is intentionally provisional. The product model for recurring items should be revisited later to determine whether users should be able to preserve, review, or selectively restore them.

---

## 11. UX and Content Principles

- Use warm, nonjudgmental language. A reset should feel like recovery, not failure.
- Never minimize the permanence of deletion.
- Explain what will be preserved and deleted before confirmation.
- Keep the two options visually distinct so users understand that one retains the budget structure and the other destroys it.
- Use destructive styling for the final irreversible actions even if the surrounding experience is reassuring.
- Keep **Cancel** visible throughout all confirmation steps.
- Disable actions while the reset is processing to prevent duplicate submissions.
- Do not display partially reset data.

### Suggested modal introduction

> Sometimes the best way forward is a fresh start. Choose how much you want to reset—Tally will clearly show what stays and what goes before anything changes.

---

## 12. Functional and Data Requirements

### Atomic operation

Each reset must behave as a single atomic operation:

- If the reset succeeds, every required deletion and reset completes.
- If any required step fails, do not leave the budget partially reset.
- Preserve the pre-reset state and show an actionable error message.

### Idempotency

- Prevent duplicate reset requests caused by repeated clicks, retries, or network timeouts.
- Repeating the same request must not duplicate restored contributions or reintroduce deleted transactions.

### Synchronization safeguards

- Save the reset cutoff before allowing the next bank synchronization.
- If previously pending charges post after reset, deduplicate import events by transaction identity to prevent duplicates.
- Ensure deleted historical transactions cannot return after reconnect, refresh, webhook retry, or backfill.

### Derived-data invalidation

- Remove or invalidate cached analytics and summaries.
- Recompute new outputs only from eligible post-reset data.

---

## 13. Recommended Analytics Events

Track behavior without retaining deleted financial content:

- `clean_slate_opened`
- `clean_slate_option_selected`
  - Property: `reset_transactions`
  - Property: `start_new_budget`
- `clean_slate_confirmation_started`
- `clean_slate_cancelled`
- `clean_slate_completed`
- `clean_slate_failed`

Useful non-financial properties may include:

- Reset type
- Entry point
- Confirmation step reached
- Whether pending transactions existed
- Processing duration
- Failure category

Do not include merchant names, transaction descriptions, dollar amounts, account identifiers, or other deleted financial data in analytics payloads.

---

## 14. Acceptance Criteria

### Settings and selection

- A **Need a reset?** section appears in Settings with comforting supporting text.
- Selecting **Clean Slate** opens a modal with two descriptive option cards.
- Both options are visible but disabled when no active budget exists.

### Reset Transactions and Envelope Totals

- All posted and manual transactions across all months are deleted.
- All pending transactions across all months are deleted.
- All historical and budget-derived data is deleted.
- Existing envelopes, monthly contributions, connected banks, and vendor rules remain.
- Every envelope returns to its full current-month contribution.
- The user completes two confirmation actions before execution.
- The action cannot be undone.
- The user returns to Overview with a success message.

### Start a New Budget

- The entire budget, all envelopes, all history, all vendor rules, and all derived data are deleted.
- Profile, preferences, and connected banks remain.
- The user must type `DELETE` before the action is enabled.
- The action cannot be undone.
- The user returns to the normal flower/coin no-budget Overview state.
- Onboarding does not launch automatically.

### Bank behavior

- Only transactions posted after the reset are imported going forward.
- Deleted transactions do not return after synchronization.
- Pending transactions are deleted during reset.
- If a previously pending charge posts after reset, it imports as a new transaction only if its post time is after the cutoff.

### Historical and derived behavior

- Previous months remain navigable but empty.
- Badges can be earned again from post-reset activity.
- Forecasts, reviews, trends, and insights begin rebuilding immediately from post-reset data.
- Scheduled and recurring budget items are deleted in both reset paths.

---

## 15. Open Decisions

The following presentation details were not finalized and should either follow the recommendations in this plan or be confirmed during design review:

1. The exact two-click confirmation sequence for **Reset Transactions and Envelope Totals**.
2. Whether the Settings section uses neutral styling with destructive final buttons, a full danger-zone treatment, or another visual hierarchy.
3. Whether **Start a New Budget** shows a success toast/banner in addition to the standard empty Overview state.
4. The longer-term preservation model for scheduled and recurring budget items.

