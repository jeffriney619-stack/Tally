# Tally Month in Review Product Plan

## 1. Product Summary

Replace the existing mandatory **Month Close** concept with an optional **Month in Review** experience. The review gives users an enjoyable retrospective look at the prior month without locking balances, restricting historical navigation, or controlling access to other Tally features.

The first-time experience should feel inspired by Spotify Wrapped: visual, scrollable, concise, and fun. It is not an accounting close, reconciliation workflow, or dense analytics dashboard.

## 2. Product Goals

- Encourage users to reflect on their spending each month.
- Make financial reflection feel rewarding instead of procedural.
- Highlight a focused set of facts, merchant rankings, and envelope changes.
- Provide useful next steps without automatically changing the budget.
- Keep the review optional so it never interferes with everyday budgeting.

## 3. Core Rules

### 3.1 Optional participation

- Completing a Month in Review is optional.
- Users can continue using the full budget while reviews are outstanding.
- An outstanding review does not lock a month or prevent historical browsing.

### 3.2 Availability

- A review becomes available three days after the month ends.
- Example: September's review becomes available on October 4.
- The delay provides a short processing window for recent bank transactions.

### 3.3 Terminology

- Remove **Close Month** language from this experience.
- Use **Month in Review** as the feature name.
- Use month-specific calls to action such as **Start September Review**.

## 4. Discovery and Reminder Experience

### 4.1 Overview banner

- Display one quiet banner on the Overview page when one or more reviews are available.
- Show the total number of outstanding reviews.
- Do not increase the banner's urgency as reviews accumulate.
- Selecting the banner opens the oldest outstanding review.

Example:

> You have 2 months to review. See how your money changed and get your Month in Review.

Primary action:

> Start August Review

### 4.2 Chronological review queue

- Reviews are offered chronologically, beginning with the oldest outstanding month.
- After completing a review, the user may start the next outstanding review from the final page.
- Users are never required to continue through the queue.

### 4.3 Historical-month entry point

- An unreviewed historical month shows **Start [Month] Review**.
- A completed historical month provides access to its saved review dashboard.

## 5. Eligibility and Transaction Handling

### 5.1 Uncategorized transactions before starting

- A review cannot begin while that month contains uncategorized transactions.
- Explain that categorization is required for accurate results.
- Provide a primary button that opens the Transaction Review experience.
- After the transactions are categorized, the user can return and begin the review.

Suggested message:

> Finish reviewing your transactions first
>
> September still has uncategorized transactions. Categorize them before starting your Month in Review so your results are accurate.

Primary action:

> Review Transactions

### 5.2 Late categorized transactions

- A completed review is not a frozen snapshot.
- When a late categorized transaction arrives, recalculate all review facts, merchant rankings, envelope changes, and recommendations.
- Keep the review completed and do not return it to the review queue.
- Do not notify the user separately.
- Show a subtle **Updated [date]** label inside the saved review dashboard.

### 5.3 Late uncategorized transactions

- Keep the review's completed status.
- Show a warning inside the saved review that its results may change.
- When the transaction is categorized, recalculate all review content and remove the warning.

Suggested warning:

> This review may change because September has an uncategorized transaction.

## 6. First-Time Review Experience

The initial review is a scrollable, Spotify Wrapped-style walkthrough. Use large typography, playful layouts, visual movement, and charts where useful.

Only the following pages belong to the base Month in Review plan.

### Page 1: Starter

Example headline:

> Here is your September in Review

Requirements:

- Update the month name dynamically.
- Provide a clear prompt to begin scrolling.

### Page 2: General Facts

Display exactly:

- Total number of transactions
- Number of no-spend days
- Most frequent purchase day of the week

Present these as large, easy-to-scan visual statistics with brief celebratory or neutral copy.

### Page 3: Top Merchants by Dollars Spent

Display the user's Top 3 merchants based on total purchase dollars during the reviewed month.

Requirements:

- Show merchant name and total purchase amount.
- Order merchants from highest to lowest dollars spent.
- Rank purchases only and ignore refunds.
- Use a ranked graph, bars, or another playful visualization.

### Page 4: Envelopes That Increased

List every envelope with a positive existing monthly-change value.

Requirements:

- Show the envelope name.
- Show the dollar amount of the increase.
- Present increases as accumulated money or progress.
- Provide an appropriate empty state if none increased.

Tally already calculates the monthly-change value. Do not create a new balance comparison, snapshot, or ending-balance system.

### Page 5: Envelopes That Decreased

List every envelope with a negative existing monthly-change value.

Requirements:

- Show the envelope name.
- Show the dollar amount of the decrease.
- Use neutral, supportive language.
- Frame significant decreases as items the user may want to monitor.
- Provide an appropriate positive empty state if none decreased.

Use Tally's existing monthly-change value. Do not add or rebuild ending available balances.

### Page 6: Tally's Recommended Actions

End with general, personalized guidance based on the review results.

Requirements:

- Remind users about relevant actions they can take.
- Keep recommendations general and supportive.
- Do not move money or change contributions automatically.
- Show only relevant and available actions.

Supported exit actions:

1. **Adjust Monthly Contributions**
2. **Move Money Between Envelopes**
3. **Return to Current Budget**
4. **Review Next Month**, when another overdue review exists

## 7. Completed Review Dashboard

The first completion uses the immersive walkthrough. Reopening a completed review from the central archive or historical month opens a compact dashboard instead of replaying the walkthrough.

Display only:

- Total transactions
- Number of no-spend days
- Most frequent purchase day
- Top 3 Merchants by purchase dollars
- A combined summary of every envelope's existing monthly change, positive or negative
- An **Updated [date]** label when late data changed the review

Do not display recommendations or exit-action buttons on the reopened dashboard. Do not introduce additional metrics.

## 8. Review Archive

Completed review dashboards are accessible from:

1. A central **Monthly Reviews** archive.
2. The corresponding historical month.

The archive identifies each reviewed month and opens its compact dashboard.

## 9. Completion Behavior

- Mark a review completed when the user reaches the recommendations page.
- Remove that month from the outstanding-review count.
- Preserve access through the archive and historical month.
- Offer **Review Next Month** when another outstanding review exists.

## 10. Out of Scope

- Locking or financially closing a month
- Requiring reviews before using the budget
- Building or duplicating ending available-balance functionality
- A detailed analytics dashboard
- Metrics or fun facts beyond the explicitly approved content
- Social sharing
- Automatic budget changes

## 11. Acceptance Criteria

1. A review becomes available three days after month-end.
2. One quiet banner displays the number of outstanding reviews.
3. The banner opens the oldest outstanding review.
4. Users can continue using Tally without completing reviews.
5. Uncategorized transactions block the review and link to Transaction Review.
6. The base walkthrough contains only the six approved pages.
7. General Facts contains total transactions, no-spend days, and most frequent purchase day.
8. The merchant page shows the Top 3 merchants by purchase dollars and ignores refunds.
9. Envelope pages consume Tally's existing monthly-change value.
10. The final page provides guidance and the four approved exit actions without automatic changes.
11. Reopened reviews use the compact dashboard rather than replaying the walkthrough.
12. Completed reviews are accessible from both the archive and historical month.
13. Late categorized transactions recalculate all content and add an internal **Updated** label.
14. Late uncategorized transactions show a warning until categorized.
