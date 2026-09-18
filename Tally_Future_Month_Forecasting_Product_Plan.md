# Tally Future-Month Forecasting Product Plan

## 1. Product Summary

Allow users to browse projected envelope balances up to 12 months into the future. The feature helps users visualize how today's available money can accumulate through recurring contributions. users will be able to navigate to the future months using tally's existing arrows on the top of the overvie's page.

This is an independent forecasting capability. It must not depend on any retrospective or month-end workflow.

## 2. Product Goals

- Make long-term envelope growth visible and motivating.
- Show the future impact of money currently available.
- Keep the calculation predictable and easy to explain.
- Clearly distinguish projected values from actual balances.

## 3. Month Navigation

- Allow users to browse historical months freely.
- Allow users to browse up to 12 months beyond the current month.
- No optional retrospective workflow may restrict month navigation.
- Treat the current month as the boundary between actual monthly history and future projections.

## 4. Forecast Calculation

For each envelope:

> Forecast balance = current available balance + all recurring contributions that have not yet occurred through the selected future month

### 4.1 Mid-month behavior

- While it's hasn't necessarily been stated, a "month's contributions" as to when it receives the next amount "deposited into the envelope" happens at the very first of the month. This doens't matter too much since the user only has the ability to few the month as a whole instead of days. Therefore, Current-month spending is already reflected in that starting value.
- Example: halfway through September, viewing October adds October's contribution only.

### 4.2 Contributions

- Repeat the current monthly contribution for each visible future month.
- Do not support one-time future adjustments or separate future contribution schedules.

### 4.3 Editing a contribution

When a user changes a contribution during the current month:

- Apply the new amount to the current month's contribution.
- Adjust the real current-month available balance by the difference between the previous and new contribution.
- Record the difference as a normal contribution adjustment in Tally's existing activity history.
- Repeat the new contribution amount across all future months.
- Use the revised live balance as the forecast starting point.

Example:

- September contribution changes from $100 to $150 on September 29.
- Add a $50 contribution adjustment to September's real envelope balance and activity history.
- Use $150 as the recurring contribution for October and every later visible month.

### 4.4 Rollover

- Carry all unspent available money forward indefinitely.
- No envelope balance expires at month-end.

### 4.5 Assumptions

- Do not subtract hypothetical future discretionary spending.
- The forecast represents current available money plus recurring contributions.
- It is a contribution-based projection, not a prediction of actual future spending.

## 5. Forecast Presentation

Use all of the following treatments for future months:

1. A visible **Forecast** label.
2. A different color treatment.
3. Lighter or dotted envelope-balance visuals.
4. A banner explaining the assumptions.

Suggested banner:

> Forecast balances include your current available money and planned monthly contributions. Future spending is not included.

## 6. Negative Forecasts

- Display negative projected balances rather than flooring them at zero.
- If there is an envelope with a large negative number, it may take a few months to get back into the green. When an envelope goes from negative to postiive, nothing flashy or fancy should happen, other than that teh available balance goes from a negative to a postiive number
- If it does not recover within 12 months, continue showing its negative projected balances, whatever that woulde after ___ number of months forcasted out..

## 7. Dynamic Recalculation

Recalculate all visible future months when:

- The current available balance changes.
- A recurring contribution changes.
- Money is transferred between envelopes.
- Another existing action changes an envelope's live available amount.

## 8. Out of Scope

- Edtiing of a future months income or envelope contributions
- Predicting future discretionary purchases
- Deducting estimated category spending
- Multiple forecast scenarios
- More than 12 future months
- One-time scheduled future contributions
- A separate future contribution schedule
- Changes to Tally's existing actual-balance calculation beyond the approved current-month contribution adjustment

## 9. Acceptance Criteria

1. Users can browse historical, current, and up to 12 future months.
2. Future balances begin with the live current available balance.
3. Only contributions that have not yet occurred are added.
4. The current recurring contribution repeats across all future months.
5. Unspent money rolls forward indefinitely.
6. Forecasted months use the label, color, lighter or dotted styling, and assumptions banner.
7. Negative projected balances remain visible.
8. Tally identifies a recovery month only when recovery occurs within the 12-month window.
9. Editing a current-month contribution adjusts the real balance by the difference and records an activity entry.
10. Forecasts update whenever their underlying live balance or contribution inputs change.
