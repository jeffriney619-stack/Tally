# Tally Adaptive Budget Onboarding

## Product Specification

### Purpose

Tally's adaptive budget onboarding helps a user create the smallest useful set of budget envelopes for their real life. The experience should not merely reproduce a generic budget template. It should learn:

- Which expenses apply to the user.
- How the user naturally groups those expenses.
- Which areas deserve separate spending limits.
- Whether the user prefers a simple, balanced, or detailed budget.
- Which purchases should be grouped by person, category, purpose, trip, or savings goal.

The onboarding recommends envelope names and boundaries only. It does not ask the user to assign contribution amounts during this flow.

---

## Core Product Principles

### 1. Every envelope must have a reason to exist

An envelope should help the user:

- Control recurring spending.
- Separate personally meaningful spending.
- Prepare for a specific goal.
- Manage a recurring obligation.
- Make transaction categorization easier.

Do not create an envelope merely because it exists in a default catalog.

### 2. Prefer the smallest useful budget

Avoid unnecessary fragmentation. The user's selected detail preference controls whether related expenses are grouped or separated:

- **Simple:** Prefer broader envelopes and fewer categorization decisions.
- **Balanced:** Separate expenses where the boundary provides a clear budgeting benefit.
- **Detailed:** Create more specific envelopes when the user requests granular control.

### 3. Purpose overrides purchase type

The same merchant or transaction type may belong to different envelopes depending on context.

Examples:

- A local Uber to work belongs to Everyday Transportation.
- An Uber to the airport for a vacation belongs to Trips & Vacation.
- Gas purchased during a road trip belongs to the trip envelope.
- A restaurant meal may belong to Dining Out, Date Night, Personal Fun Money, or Travel.

### 4. Free-text clarification wins

When free-text input conflicts with a multiple-choice selection, use the user's specific explanation. If the conflict materially changes the recommendation and cannot be resolved safely, ask a concise follow-up question.

### 5. Miscellaneous is universal

Every generated budget must contain a **Miscellaneous** envelope.

Boundary:

> Small or unusual purchases that do not reasonably belong in another envelope.

Miscellaneous is a fallback. It should not be recommended for a transaction when a more specific applicable envelope exists.

---

## Experience Structure

The onboarding contains seven adaptive sections:

1. Household
2. Essentials
3. Food
4. Fun & Lifestyle
5. Transportation
6. Home & Life
7. Goals

After the questionnaire:

1. Show the recommended envelope set.
2. Allow the user to rename or remove envelopes.
3. Let the user test ambiguous sample transactions.
4. Collect recommendation feedback.

---

## Live Interpretation

Display a persistent panel titled:

> **What Tally understands**

This panel should update as the user answers questions. It may show:

- Household structure.
- Preferred budget detail.
- Number of confirmed essential expenses.
- Food organization.
- Discretionary-spending approach.
- Transportation and travel structure.
- Applicable life areas.
- Savings approach.
- Debt goals.

The panel should use plain language. Do not expose technical scores, prompt details, raw model reasoning, or internal confidence values.

Include reassurance:

> If Tally misunderstands something, change the answer before it becomes part of your budget.

---

## Section 1: Household

### Question: Who does this budget support?

Single selection:

- Just me
- Me and a partner
- A family with children
- A shared household or roommates

### Question: How detailed should your budget feel?

Single selection:

- **Simple:** Broader envelopes and fewer decisions.
- **Balanced:** Separate expenses when the boundary is useful.
- **Detailed:** Specific controls and granular reporting.

### Adaptive household rules

The household answer must shape later questions:

- **Solo:** Hide “Separate Fun Money by person.”
- **Couple:** Allow separate personal allowances and partner-related language.
- **Family:** Allow person-based allowances and family-oriented categories.
- **Shared household:** Avoid assuming all expenses are shared. Only create joint envelopes when supported by another answer.

When the household supports multiple people, allow the user to enter names for personal allowances.

---

## Section 2: Essentials

### Question: Which essential expenses belong in your budget?

Multi-select:

- Rent/Mortgage
- Utilities
- Insurance
- Healthcare
- Childcare or School
- Personal Care
- None

Use **Rent/Mortgage** everywhere in user-facing language. Do not use “Housing” as a synonym in the interface.

### Question: How should Rent/Mortgage and Utilities work?

Single selection:

- Rent/Mortgage and Utilities separately
- Combine them into one Home Bills envelope
- Utilities are included in Rent/Mortgage

### Recommendation rules

- Selecting Rent/Mortgage creates **Rent/Mortgage**.
- Selecting Utilities creates **Utilities**, unless the user combines the expenses or says utilities are included.
- Combining both creates **Home Bills**.
- If utilities are included, do not create a separate Utilities envelope.

### Question: How should Insurance work?

Single selection:

- One Insurance envelope
- Separate by insurance type
- Treat it as ordinary fixed bills

Insurance-specific envelopes should only be created when supported by confirmed insurance expenses elsewhere in the questionnaire.

---

## Section 3: Food

### Question: Which food areas need their own spending limit?

Multi-select:

- Groceries
- Routine Dining and Takeout
- Date Nights
- Social Meals
- Health & Nutrition
- Keep All Food Together

“Keep All Food Together” is mutually exclusive with the individual food categories.

### Question: Where should a casual meal purchased for yourself go?

Single selection:

- Dining Out
- Personal Fun Money
- Ask based on the occasion

### Optional free-text question

> Is there a food expense worth tracking separately?

Examples:

- Coffee
- Supplements
- Work lunches
- Meal preparation

### Food-routing precedence

1. Trip context
2. Date or explicit shared occasion
3. Personal allowance rule
4. Routine Dining Out
5. Groceries

---

## Section 4: Fun & Lifestyle

### Question: How should personal discretionary spending work?

Single selection:

- One Fun Money envelope
- Separate Fun Money by person
- By category

Helper text for **By category**:

> Shopping, entertainment, social activities, hobbies, and more.

“Separate Fun Money by person” should only appear when supported by the household answer.

### Conditional question

Show the following only when **By category** is selected:

> **Which discretionary spending categories should have their own envelope?**

Multi-select:

- Shopping
- Entertainment
- Social Activities
- Hobbies or Fitness
- Gifts and Holidays
- Dining Out
- Date Night

Do not display a separate shared-activities question. Do not recommend a generic Shared Fun envelope from this flow.

### Special-attention question

> What spending needs special attention?

Optional free text for an expense that is frequent, personally important, or easy to overspend on.

Examples:

- Golf
- Skincare
- Concerts
- Kids' activities

An explicitly named special-attention expense should generally receive its own envelope unless it clearly duplicates another selected envelope.

---

## Section 5: Transportation

### Question: Which transportation costs do you pay?

Multi-select:

- Gas or EV Charging
- Car Maintenance
- Car Payment
- Auto Insurance
- Public Transit
- Rideshare, Taxis, Bikes, or Scooters
- None

### Question: How detailed should everyday transportation be?

Single selection:

- One Transportation envelope
- Car Costs and Non-car Transportation
- Gas, Maintenance, and Other Transportation separately
- No dedicated Transportation envelope

### Question: How should purchases made during a trip work?

Single selection:

- One Trips & Vacation envelope
- Work Travel and Personal Travel separately
- Create envelopes for major trips
- Use normal spending categories
- I rarely or never travel

### Optional trip-name field

Allow the user to name an upcoming trip, such as:

- Italy Trip
- Beach Trip
- Ski Weekend

### Travel-routing rule

When a purchase is caused by a trip, route it to the applicable travel envelope regardless of its transaction type.

Trip envelopes may include:

- Airfare
- Lodging
- Gas
- Rental cars
- Uber
- Metro
- Bikes or scooters
- Meals
- Activities

---

## Section 6: Home & Life

### Question: Which areas apply to your life?

Multi-select:

- Pets
- Home Furniture, Repairs, or Projects
- Medical or Dental
- Subscriptions
- Donations or Giving
- Annual Bills
- None

### Pet organization

Single selection:

- One Pet Care envelope
- Pet Care and Vet Care
- Pet Food, Vet Care, and Pet Fun separately
- No Pet envelope

Selecting a pet organization option must directly generate the corresponding envelope or envelopes.

### Home organization

Question:

> **How should spending on your home be organized?**

Single selection:

- One Home envelope for everything
- Separate Home Repairs from Furniture & Decor
- Separate Home Maintenance from larger Home Projects
- I do not need a home-spending envelope

Selecting a Home organization option must directly generate the corresponding envelope or envelopes. It must not depend on a redundant earlier checkbox.

Home spending is distinct from Rent/Mortgage:

- **Rent/Mortgage:** The recurring housing payment.
- **Utilities:** Services such as power, water, gas, and internet.
- **Home spending:** Furniture, decor, maintenance, repairs, and projects.

### Giving

Single selection:

- Create a Giving envelope
- Create Seasonal Giving
- Do not create a Giving envelope

### Removed question

Do not ask:

> Which costs should receive money ahead of time?

Do not generate envelopes from that removed question.

---

## Subscriptions Logic

Selecting **Subscriptions** as an applicable expense should be sufficient to create a subscription envelope unless the user explicitly selects **No Subscriptions envelope**.

### Question: How should Subscriptions work?

Single selection:

- One Subscriptions envelope
- Essential and Entertainment Subscriptions separately
- Treat them as ordinary bills
- No Subscriptions envelope

### Recommendation rules

- **One envelope:** Create **Subscriptions** under Wants.
- **Separate types:** Create **Essential Subscriptions** under Needs and **Entertainment Subscriptions** under Wants.
- **Ordinary bills:** Create **Subscriptions** under Needs and label it as a fixed-bill envelope.
- **No envelope:** Create no subscription envelope.
- If Subscriptions was selected as applicable but this follow-up was unanswered, default to one **Subscriptions** envelope.

The follow-up controls organization. It must not accidentally suppress the category.

---

## Section 7: Goals

### Question: How do you currently save?

Single selection:

- Emergency Fund plus additional savings
- Spend below my means and save the remainder
- One specific goal
- Several savings goals
- Not actively saving yet

### Savings-goal names

Allow comma-separated goal names:

- Emergency Fund
- House
- New Car
- College

Create one envelope for each specific named goal.

### Debt goals

Multi-select:

- Credit Card Payoff
- Student Loans
- Auto Loan
- Personal Loan
- None

Create an envelope for each selected debt goal.

---

## Recommendation Engine

### Three-stage architecture

1. **Normalize answers:** Convert questionnaire responses into structured signals.
2. **Apply deterministic product rules:** Determine envelope eligibility, merging, splitting, and conflicts.
3. **Use AI for interpretation:** Interpret free text, detect semantic duplicates, create user-friendly names, and explain recommendations.

The AI should not independently invent the entire envelope set without rule constraints.

### Conflict precedence

1. Explicit free-text clarification
2. Direct “keep separate” or “combine” selection
3. Special-attention expense
4. Applicability
5. Detail preference
6. Default behavior

### Duplicate prevention

Create each conceptual envelope only once.

Examples:

- Do not create Date Night twice when selected under both Food and category-based discretionary spending.
- Do not create Dining Out when the user keeps all food together.
- Do not create both Home and Home Repairs unless their boundaries are intentionally distinct.

### Required internal explanation

For every recommendation, the system should be able to complete:

> Create **[Envelope]** because the user **[answer or preference]**, and keeping it separate helps them **[control spending, organize an obligation, or protect a goal]**.

If the sentence cannot be completed using questionnaire evidence, merge, omit, or mark the envelope optional.

---

## Recommendation Output

Each recommended envelope should include:

- Name
- Needs, Wants, or Savings classification
- Functional purpose
- Plain-language reason
- Boundary: what belongs
- Boundary: what does not belong
- Source questionnaire answers
- Confidence status for internal use

Example:

```json
{
  "name": "Trips & Vacation",
  "type": "Savings",
  "purpose": "Travel fund",
  "reason": "The user chose to keep personal trip expenses together.",
  "includes": [
    "airfare",
    "lodging",
    "trip-related gas",
    "rideshare",
    "meals during the trip",
    "activities"
  ],
  "excludes": [
    "ordinary commuting",
    "local everyday transportation"
  ]
}
```

---

## Recommendation Review

After generating the budget:

- Group envelopes by Needs, Wants, and Savings.
- Show why each envelope was recommended.
- Show a concise boundary.
- Allow Rename.
- Allow Remove.
- Ensure Miscellaneous is present.

Do not ask for contribution amounts during this recommendation-review step.

---

## Transaction Boundary Test

Let the user test the recommended envelope set against ambiguous sample purchases.

Recommended examples:

- Weekly groceries
- Solo lunch
- Dinner with a partner
- Uber to work
- Uber to the airport for vacation
- Gas during a road trip
- Prescription pickup
- Pet-food delivery
- Veterinary appointment
- Monthly subscription
- Home repair
- Birthday gift

For each transaction:

- Show Tally's recommendation.
- Show the reason or context used.
- Allow reassignment.
- Allow the user to rate the recommendation.

Feedback choices:

- Correct
- Right idea, wrong envelope
- I would never organize it this way

---

## Feedback Summary

At the end of the test:

- Calculate the percentage of rated suggestions marked correct.
- List transactions that were reassigned.
- List envelopes that were removed.
- List envelopes that were renamed.
- Capture optional written product feedback.

Use this feedback to identify:

- Confusing questions.
- Missing envelope choices.
- Overlapping boundaries.
- Incorrect routing precedence.
- Recommendations that are too broad or too detailed.

---

## Acceptance Criteria

1. Household structure changes later questions and available answers.
2. Solo users never see “Separate Fun Money by person.”
3. The discretionary category checklist appears only after selecting **By category**.
4. The removed shared-activities question does not appear.
5. The removed “money ahead of time” question does not appear.
6. Rent/Mortgage terminology is used consistently in all visible content.
7. Home selections always generate the expected Home envelope or envelopes.
8. Subscription selections always generate the expected envelope unless explicitly disabled.
9. Trip context overrides ordinary transportation routing.
10. Duplicate envelope concepts are merged.
11. Every generated budget includes Miscellaneous.
12. Miscellaneous is used only when no specific envelope reasonably applies.
13. The live interpretation panel updates as answers change.
14. Users can rename and remove recommendations.
15. Users can test and correct ambiguous transaction routing.

---

## Out of Scope

- Determining monthly contribution amounts
- Connecting bank accounts
- Importing historical transactions
- Moving money between envelopes
- Month-in-review analytics
- Forecasting
- Badges
- Clean Slate behavior

Those capabilities may use the completed envelope set after onboarding, but they are not part of this feature.
