# Tally Badges Product Plan

## 1. Product Summary

Create a lightweight achievement system that celebrates positive budgeting behaviors. Badges are permanent, one-time achievements stored in a collection on the user's profile.

This plan is an add-on to existing Tally infrastructure. It assumes the monthly review experience, transaction data, envelope data, user profile, and navigation already exist. The badge implementation should integrate with those surfaces without changing their base requirements.

## 2. Product Goals

- Make monthly financial reflection feel rewarding and memorable.
- Encourage sustainable budgeting behavior.
- Give users a permanent record of achievements.
- Add delight without creating competitive scores or financial shame.

## 3. Initial Badge Set

### 3.1 Net Builder

Award only when every envelope spent less during the reviewed month than the amount contributed to that envelope.

Rules:

- Evaluate every applicable envelope.
- If any applicable envelope spent an amount equal to or greater than its contribution, do not award the badge.
- Award the badge only once per user.

### 3.2 Comeback Kid

Award when at least one envelope had a negative available balance and later returned above zero.

Rules:

- The envelope must cross from a negative available balance to a positive available balance.
- Reaching exactly $0 does not qualify as returning above zero.
- Award the badge only once per user.

## 4. Badge Evaluation

- Evaluate badge eligibility using the existing monthly review's prepared data and Tally's envelope history.
- Evaluate only badges the user has not already earned.
- Do not re-award or count repeated occurrences of the same badge.
- Badge evaluation must not block completion of the underlying monthly review.

## 5. Award Experience in Month in Review

Add an **Awards** page to the existing Month in Review walkthrough when at least one new badge is earned.

Integration requirements:

- Insert the Awards page after the envelope-change pages and before Tally's recommendations page.
- Reveal each newly earned badge with celebratory visuals.
- Explain the behavior that earned each badge.
- Omit the Awards page entirely when no new badge was earned.
- Do not show a negative message such as **No awards earned**.
- Do not otherwise change the base Month in Review pages, calculations, completion rules, archive behavior, or navigation.

## 6. Completed Monthly Review Dashboard

Extend the existing reopened monthly review dashboard to display badges earned during that month.

Requirements:

- Show only badges awarded during the selected month's original review.
- Do not add unrelated badge analytics or progress tracking to the dashboard.
- The existing dashboard remains responsible for its own summary data.

## 7. Permanent Award Rules

- Each badge is a one-time achievement.
- Once awarded, a badge remains earned permanently.
- Do not revoke a badge when a late transaction changes the month that originally qualified.
- Recalculating a completed monthly review must not remove an already awarded badge.
- Late data may not award the same badge a second time.

## 8. Profile Badge Collection

Add a permanent badge collection to the existing user profile.

Display:

- Earned badges with their completed visual treatment.
- Locked badges that have not yet been earned.
- The name of every locked badge.
- The exact earning criteria for every locked badge.

Do not refer to these as secret badges because their names and criteria are visible.

## 9. Data Requirements

Store at minimum:

- Badge identifier
- Badge name
- Badge description and exact criteria
- Earned or locked state
- Date earned
- Monthly review or month associated with the award

The earned state must be durable and idempotent so the same badge cannot be awarded twice.

## 10. Integration Boundaries

This product may consume:

- Existing envelope contribution data
- Existing envelope spending data
- Existing envelope balance history
- Existing monthly review data preparation
- Existing monthly review page framework
- Existing completed-review dashboard
- Existing user profile

This product must not own or modify:

- Base monthly-review eligibility
- Review reminder banners or review queues
- Transaction categorization workflows
- Base review metrics or merchant rankings
- Envelope balance calculations
- Core budgeting access

## 11. Out of Scope

- Envelope Sweep or any other undefined badge
- Public leaderboards
- Comparing users against one another
- Social sharing
- Penalties or negative badges
- Revoking earned badges
- Points, currencies, or redeemable rewards
- Repeated awards or award counts
- Blocking any feature based on badge status

## 12. Acceptance Criteria

1. Tally evaluates Net Builder and Comeback Kid using the defined rules.
2. Each badge can be awarded only once per user.
3. A conditional Awards page appears in Month in Review only when a new badge is earned.
4. The Awards page appears between envelope changes and recommendations.
5. Earned badges are stored permanently and are never revoked.
6. Completed monthly dashboards show badges earned during that month.
7. The profile collection displays earned and locked badges.
8. Locked badges show their names and exact earning criteria.
9. Badge processing does not alter or gate unrelated Tally functionality.
