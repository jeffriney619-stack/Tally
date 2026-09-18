# Tally AI Envelope Assistant

## Feature integration plan

**Status:** Ready for implementation planning  
**Product:** Connected Envelope Budget  
**Feature area:** New-user onboarding and category-template selection  
**Feature name in the UI:** Tally's AI Assistant  

## 1. Purpose

Tally's AI Assistant helps a new user create an envelope structure that reflects how they naturally make spending decisions. The assistant asks seven short questions, identifies useful category boundaries, and creates a personalized template containing standard envelopes plus a small number of custom envelopes.

The feature addresses a weakness in universal budgeting templates. Standard categories such as Groceries, Dining, Shopping, and Entertainment work for many people, but they often miss the distinctions that make a budget useful to a particular user. Examples include Date Nights, separate personal-spending envelopes for two adults, Kitchen & Wellness Extras, Golf, Hosting, and Home Projects.

The assistant should discover those distinctions without producing an unnecessarily complicated budget.

## 2. Product principle

Create a separate envelope only when it gives the user a balance they would meaningfully fund, protect, or check before spending.

Every additional envelope must earn its place. The assistant should use as few envelopes as possible while preserving the distinctions the user says matter.

## 3. Scope

### Included

- A new onboarding choice between AI-guided setup and the existing template/manual setup.
- A seven-question guided interview.
- Structured selectable answers for most questions.
- Small conditional follow-ups when an answer requires more detail.
- One open-ended question for a spending type that needs special attention.
- AI-generated custom envelope recommendations.
- Reuse of existing universal envelopes when they already represent the user's intent.
- A saved template named `<First name>'s Curated Budget`, with `My Curated Budget` as the fallback.
- Integration of the curated template into the existing **Pick the envelopes you want to start with** screen.
- User review, selection, removal, renaming, and manual additions before confirmation.
- Per-user persistence of answers and the curated template.
- Funnel and retention analytics.

### Excluded from this feature

- Recommended dollar amounts.
- Changes to the 50/30/20 allocation feature.
- Bank-history analysis.
- Connected-account data in the prompt.
- Automatic transaction categorization.
- Advice that challenges or judges the user's spending choices.
- Paid-plan or upgraded bank-analysis behavior.

The 50/30/20 flow remains a separate onboarding step. This feature decides which envelopes exist; the allocation flow later decides how money is distributed.

## 4. Entry-point integration

Insert a new page immediately before the current category-template page.

### Page heading

**How would you like to build your budget?**

### AI-guided option

**Build with Tally**

New to envelope budgeting? Answer seven quick questions and Tally will create a budget around your lifestyle.

Button: **Start AI assistant**

### Existing setup option

**Choose it yourself**

Already experienced with the envelope system? Select a starter template or create your budget manually.

Button: **Use templates or build manually**

### Routing

- `Start AI assistant` opens the assistant at Question 1.
- `Use templates or build manually` opens the current **Pick the envelopes you want to start with** page with no behavioral changes.
- Returning from the assistant after generation opens the same existing category-template page with the personalized template added as a selectable option.

## 5. Questionnaire interaction model

- Display one main question per screen.
- Show progress as `Question 1 of 7` through `Question 7 of 7`.
- Persist each answer when the user continues.
- Provide Back and Continue controls.
- Preserve answers when moving backward.
- Most questions use large selectable cards.
- Single-select questions advance only after the user selects one answer and presses Continue.
- Multi-select questions allow several selections and require at least one selection.
- `Something else` opens a short text field.
- Conditional follow-ups appear directly beneath the selected answer and do not count as additional main questions.
- Ask no more than two conditional follow-ups during one session unless the user explicitly enters an answer that cannot be interpreted.
- After a response, Tally may show one short acknowledgement, such as: `Got it. I'll keep personal spending separate for each adult.`
- Do not show category recommendations while the interview is still in progress. Reveal the complete result after Question 7 so the user evaluates the system as a whole.

## 6. The seven questions

### Question 1: Recreational spending

**How do you naturally organize recreational spending?**

Input: single-select cards.

- By person: my spending, partner spending, or children
- By who I am with: friends, date nights, or family activities
- By activity: golf, fitness, gaming, crafts, or another hobby
- By broad category: entertainment, dining, or shopping
- Mostly one category: fun money
- A combination

Conditional behavior:

- `By person` asks: **Who needs a separate personal-spending envelope?** Accept short labels or household roles. Convert personal names into broad labels such as `My Personal Spending` and `Partner Personal Spending` unless the user later renames them.
- `By activity` asks: **Which one or two activities need their own balance?**
- `A combination` opens: **Briefly describe what you would keep separate.**

Recommendation intent:

- Learn the user's primary categorization lens.
- Avoid creating separate hobby or social envelopes when the user prefers one broad Fun Money or Recreation balance.

### Question 2: Food and drink

**How would you organize food and drink purchases?**

Input: single-select cards.

- One category for everything
- Groceries and Dining
- Groceries, Dining, and Date Nights
- Groceries plus Kitchen Extras for items such as wine, supplements, specialty coffee, and protein products
- By purpose: Everyday Food, Health & Nutrition, and Social Dining
- Something else

Conditional behavior:

- `Something else` opens: **What food or drink purchases would you keep separate?**

Recommendation intent:

- Reuse Groceries and Dining when the standard split is sufficient.
- Add a broad custom envelope such as `Kitchen & Wellness Extras` when the user wants nonstandard kitchen, nutrition, or specialty products protected from ordinary grocery spending.
- Do not create separate envelopes for every product example.

### Question 3: Personal purchases

**How should personal purchases work in your household?**

Input: single-select cards.

- All personal purchases can share one Shopping or Personal Spending category
- Each adult should have separate personal spending money
- Clothing, beauty, and personal care should be separate
- Hobbies should be separated from ordinary personal purchases
- Something else

Conditional behavior:

- `Each adult` asks: **How many adults need separate spending envelopes?** Use broad result names such as `My Personal Spending` and `Partner Personal Spending`.
- `Hobbies` asks for no more than two hobbies that need their own balance.
- `Something else` opens a short description field.

Recommendation intent:

- Discover whether Shopping should remain broad, become Personal Spending, or be split by person or purpose.
- Prefer broad household-role names in the generated result. Users can personalize names during review.

### Question 4: Relationships and social spending

**How do you want to budget for time spent with other people?**

Input: multi-select cards.

- Keep it within Dining and Entertainment
- Create a Date Nights envelope
- Separate Friends and Social Activities
- Create a Family Activities envelope
- Separate Hosting and Entertaining at Home
- Something else

Rules:

- `Keep it within Dining and Entertainment` is exclusive. Selecting it clears the other answers.
- Other selections may be combined.
- `Something else` opens: **What kind of time or activity would you track separately?**

Recommendation intent:

- Create relationship-based envelopes only when the user wants to preserve or monitor money for that relationship or setting.
- Example: choosing Date Nights creates or selects `Date Nights`; it does not also create `Social Dining` unless another answer supports it.

### Question 5: Home spending

**How would you organize spending on your home?**

Input: single-select cards.

- Keep everything under Housing
- Separate monthly household bills from furnishings and décor
- Create a Home Projects and Repairs envelope
- Separate routine Household Supplies from larger home purchases
- I do not need a separate home-spending envelope
- Something else

Conditional behavior:

- `Something else` opens: **What home spending would you keep separate?**

Recommendation intent:

- Keep Housing as the universal envelope when no additional balance helps.
- Create one broad `Home Projects` or `Household Purchases` envelope instead of several overlapping home envelopes.

### Question 6: Savings approach

**How do you currently think about saving money?**

Input: single-select cards.

- I am building an emergency fund and saving additional money on top of it
- I try to spend a certain percentage below my means and save whatever remains
- I am saving toward one specific goal
- I divide my savings among several different goals
- I am not actively saving yet

Conditional behavior:

#### Emergency fund plus additional savings

Ask: **Does your additional savings have a specific purpose?**

- No, it is general savings
- Yes — describe the purpose

Possible result: `Emergency Fund` plus `General Savings` or one named broad goal.

#### Spend below my means

Ask: **What percentage below your means do you aim to spend?**

Input: numeric percentage from 1 to 100. Store the answer for the later allocation experience, but do not calculate or recommend an amount in this feature.

Possible result: `General Savings`.

#### One specific goal

Ask: **What are you saving for?**

Input: short free text.

Possible result: a broad goal name such as `Home Purchase`, `Travel`, or `New Car`.

#### Several goals

Ask: **Which goals are you currently saving toward?**

Input: multi-select plus free text.

- Emergency fund
- Travel
- Home purchase or improvement
- Vehicle purchase or repairs
- Education
- Retirement or investing
- Major purchase
- Gifts or holidays
- Other

Possible result: one envelope for each selected goal, subject to the minimum-envelope and duplicate rules below.

#### Not actively saving

No follow-up and no new custom savings envelope.

Recommendation intent:

- Determine the savings-envelope structure only.
- Do not recommend contribution amounts.
- Do not duplicate a goal already represented elsewhere. If Travel appears in both spending and savings answers, create one rolling `Travel` envelope.

### Question 7: Special-attention expense

**Is there one type of spending you make frequently, want to track individually, or want to be especially careful not to overspend on?**

Helper text: `This could be a particular hobby, habit, purchase, or activity that matters to you.`

Input:

- Open text field with placeholder: `Tell Tally what you would like to track...`
- Alternative selection: `Nothing needs special attention at this time`

Rules:

- The text response and `Nothing needs special attention` are mutually exclusive.
- A meaningful text answer becomes a high-priority custom-envelope candidate.
- If it overlaps with a broad standard envelope, the explicit user request takes priority. Examples:
  - `I buy too much coffee` -> `Coffee`
  - `Golf is my main hobby` -> `Golf`
  - `I want to control Amazon purchases` -> `Online Shopping`
  - `Supplements get lost in groceries` -> `Health & Supplements`
  - `I want to protect money for dates` -> `Date Nights`
- Selecting `Nothing needs special attention` creates no additional envelope.

## 7. Recommendation logic

### 7.1 Inputs

The recommendation service receives:

- User first name, when available, only for naming the saved curated template.
- The seven structured answers and any conditional follow-up text.
- The current universal category catalog, including stable IDs, display names, and Needs/Wants/Savings classifications.
- The existing Essentials Only and Full Picture template definitions.

Do not send monthly income, identity details beyond the first name needed locally for display, bank data, transactions, credentials, card data, or unrelated account metadata to the language model.

The server should construct the template display name locally rather than include the user's name in the AI prompt.

### 7.2 Baseline

Use the existing `Essentials only` template as the starting baseline. Reference its stored category IDs; do not duplicate its category list inside the AI prompt or application code.

The assistant may then:

- Add an existing universal category.
- Add a new custom category.
- Replace a broad optional category with a more useful custom category.
- Split one broad category only when the user explicitly prefers separate balances.

The final review screen remains the authority. Users can add or remove any category before accepting the budget.

### 7.3 Minimum-envelope rules

Apply these rules in order:

1. Preserve the existing Essentials Only baseline.
2. Honor an explicit special-attention answer from Question 7.
3. Honor explicit choices for separate personal-spending, relationship, activity, home, and savings balances.
4. Reuse an existing universal category when its meaning matches the request.
5. Merge semantically equivalent recommendations.
6. Avoid both a parent and child envelope unless the user explicitly requested both. For example, do not create `Recreation`, `Golf`, and `Personal Spending` for the same purchases.
7. Prefer one broad custom envelope that covers several related examples. For example, vitamins, protein powder, wine, and specialty coffee can become `Kitchen & Wellness Extras` rather than four envelopes.
8. Use broad, understandable names. Do not put a spouse's, child's, friend's, or pet's personal name in the generated name.
9. Do not create an envelope solely because an example appeared in helper text.
10. Do not infer dollar amounts.

### 7.4 Classification

- Existing universal categories retain their current Needs/Wants/Savings classification.
- Categories created by the savings question are classified as Savings.
- Relationship, recreation, hobby, specialty-food, and personal-spending categories default to Wants.
- Home Repairs may reuse the existing product classification if one exists; otherwise default it to Needs.
- Unknown custom categories default to Wants and remain editable during review.

This classification supports the later 50/30/20 flow but does not change or calculate that allocation.

### 7.5 Duplicate detection

Before saving the result:

- Normalize case, punctuation, singular/plural forms, and common synonyms.
- Compare custom names with universal category names and other custom recommendations.
- Treat names such as `Vacation`, `Vacations`, and `Travel Fund` as potential equivalents.
- Treat `Date Night` and `Date Nights` as equivalent.
- If two recommendations have the same spending purpose, keep the broader name unless Question 7 explicitly requests the narrower name.
- Preserve source evidence so the UI can explain why each custom envelope was recommended.

### 7.6 User control

The assistant recommends a draft. It must not silently activate the template or continue onboarding. The user reviews and confirms the selected envelopes on the existing category-template page.

## 8. AI service contract

Use the language model for interpreting open text, selecting broad category names, resolving overlaps, and producing a concise rationale. Use deterministic application code for validation, deduplication, classification defaults, persistence, and navigation.

### Request shape

```json
{
  "promptVersion": "envelope-assistant-v1",
  "universalCategories": [
    { "id": "date-night", "name": "Date night", "group": "wants" }
  ],
  "baselineCategoryIds": ["housing", "groceries", "transportation"],
  "answers": {
    "recreation": {},
    "food": {},
    "personal": {},
    "relationships": {},
    "home": {},
    "savings": {},
    "specialAttention": {}
  }
}
```

### Required response shape

```json
{
  "summary": "A concise explanation of the organizing approach.",
  "categories": [
    {
      "name": "Kitchen & Wellness Extras",
      "group": "wants",
      "source": "custom",
      "universalCategoryId": null,
      "replacesUniversalCategoryIds": [],
      "reason": "The user wants supplements and specialty kitchen purchases separate from ordinary groceries.",
      "answerKeys": ["food"],
      "priority": "normal"
    }
  ]
}
```

### Response constraints

- Return valid JSON matching the schema.
- Include the baseline category selections in the final category list or merge them server-side consistently; choose one method and use it everywhere.
- Use only `needs`, `wants`, or `savings` for `group`.
- Use only `universal` or `custom` for `source`.
- `universalCategoryId` is required for universal categories and must match an ID supplied in the request.
- A custom category must contain a short title, group, reason, and supporting answer key.
- The model may not invent a universal category ID.
- The model may not return amounts, percentages, financial advice, or transactions.
- The model may not include personal names in category names.

### Suggested system prompt

```text
You create a minimal envelope-budget category structure from a user's questionnaire answers.

Create a separate envelope only when the user would meaningfully fund it, protect its money, or check its balance before spending. Reuse a supplied universal category whenever it matches. Create custom categories for meaningful distinctions missing from the universal catalog. Use as few envelopes as possible. Merge overlapping purposes. Do not create both broad and narrow categories for the same spending unless the user explicitly requested both.

Use broad, clear names. Do not include personal names. Do not recommend amounts. Do not judge or challenge the user's choices. Treat the user's open-ended special-attention expense as a high-priority candidate. Savings answers determine savings-envelope structure only.

Return only JSON matching the supplied schema.
```

### Failure handling

- Validate every response before persistence.
- Retry once when the response is invalid JSON or fails the schema.
- If the second attempt fails, retain the user's answers and show: `Tally couldn't finish your recommendation. Try again or continue with the standard templates.`
- Never lose completed answers.
- Never save a partially validated curated template.

## 9. Data model

Adapt these fields to the existing application schema rather than creating duplicate concepts.

### Assistant session

```text
assistant_session
- id
- user_id
- status: in_progress | generating | ready | failed | accepted | abandoned
- current_question
- answers_json
- prompt_version
- model_name
- result_json
- created_at
- updated_at
- completed_at
```

### Curated template

```text
curated_template
- id
- user_id
- name
- assistant_session_id
- status: draft | active | superseded
- created_at
- updated_at
```

### Curated template category

```text
curated_template_category
- id
- curated_template_id
- universal_category_id: nullable
- custom_name: nullable
- group: needs | wants | savings
- source: baseline | universal_selection | ai_custom | user_added
- reason: nullable
- answer_keys_json
- selected
- display_order
```

Requirements:

- Enforce user ownership on every read and write.
- Store the raw structured questionnaire answers for regeneration and product analysis.
- Store prompt version and model name for reproducibility.
- Do not store hidden chain-of-thought or request it from the model.
- Maintain only one active curated template per user. A rerun creates a new draft and supersedes the old active version only after the user confirms the new result.

## 10. Results and review integration

After generation, route the user to the existing **Pick the envelopes you want to start with** page.

### Template controls

Add a new template option alongside the existing controls:

- Essentials only
- Full picture
- `<First name>'s Curated Budget`
- Clear selection

The curated option appears only after a valid recommendation exists.

### Selecting the curated template

When selected:

- Select all recommended universal envelopes.
- Display and select all recommended custom envelopes.
- Mark custom cards with a subtle `Created for you` label.
- Preserve the current Needs, Wants, and Savings labels.
- Show a short summary above the cards: `Tally created this starting point from your answers. You can change anything before continuing.`

### Review actions

Users can:

- Select or deselect any envelope.
- Rename custom envelopes.
- Add another envelope using the existing manual creation behavior.
- Remove a custom envelope.
- Return to the assistant and edit answers.
- Regenerate the recommendation.
- Accept the selection and continue to the existing allocation flow.

If merge functionality already exists, expose it here. If it does not exist, merge can be implemented as deselecting one envelope and renaming the retained envelope; native merge behavior is not required for the first release.

## 11. Example validation scenario

Use this scenario as a product-level test of the recommendation quality.

### Example answers

- Recreation: organize by person, with separate spending for two adults.
- Food: Groceries and Dining plus a separate category for supplements, wine, protein products, and specialty kitchen purchases.
- Personal purchases: each adult needs separate personal spending.
- Relationships: protect money for date nights.
- Home: separate home projects and household purchases from Housing.
- Savings: build an Emergency Fund and keep additional General Savings.
- Special attention: nothing additional.

### Expected custom recommendations

- My Personal Spending
- Partner Personal Spending
- Kitchen & Wellness Extras
- Date Nights, preferably by reusing the existing Date Night category
- Home Projects
- Emergency Fund, preferably by reusing the existing universal category
- General Savings or the existing Long-term Goals category when its meaning matches

### Expected behavior

- Standard essentials remain selected from the baseline.
- The result does not create separate envelopes for vitamins, wine, protein powder, and coffee.
- The result does not create Recreation in addition to both personal-spending envelopes unless the user explicitly requests it.
- The result uses broad names and does not include a spouse's name.
- No dollar amounts are recommended.

## 12. Analytics and success measurement

### Primary outcome

Measure whether users who start with a curated budget continue using a stable budget longer than users who start with a universal template.

Recommended primary comparison:

- Percentage of curated-template users who categorize transactions and complete a second monthly budget cycle within 60 days.
- Compare against users who selected Essentials Only or Full Picture during the same period.

### Supporting metrics

- AI-assistant start rate from the new landing page.
- Completion rate for all seven questions.
- Drop-off by question.
- Recommendation-generation success rate.
- Curated-template selection and acceptance rate.
- Percentage of recommended custom envelopes retained at confirmation.
- Percentage renamed, deselected, or supplemented manually.
- Number of categories added or removed within 30, 60, and 90 days.
- Percentage of users who complete a second and third monthly budget cycle.
- Percentage who rerun the assistant.

### Suggested events

```text
assistant_entry_viewed
assistant_started
assistant_question_answered
assistant_followup_answered
assistant_abandoned
assistant_generation_started
assistant_generation_succeeded
assistant_generation_failed
curated_template_viewed
curated_template_selected
curated_category_renamed
curated_category_deselected
curated_category_added
curated_template_accepted
assistant_rerun_started
```

Do not place free-text answers or category names in analytics event properties. Record answer IDs and aggregate counts only.

## 13. Acceptance criteria

1. A new onboarding page offers AI-guided setup and the existing template/manual path.
2. Choosing the manual path opens the current category-template page without changing its behavior.
3. Choosing the AI path presents exactly seven main questions, one per screen.
4. Selectable questions support the specified single-select or multi-select behavior.
5. Conditional follow-ups appear only for answers that require more information.
6. The user's answers persist when navigating backward or leaving and returning to an incomplete session.
7. Question 7 accepts either free text or `Nothing needs special attention at this time`, but not both.
8. The recommendation uses the existing Essentials Only template as its baseline.
9. The assistant reuses an existing universal category when it matches the requested purpose.
10. The assistant can create a custom envelope that does not exist in the universal list.
11. The result contains no duplicate or semantically equivalent envelopes.
12. The result uses broad category names and does not include personal names.
13. The result contains no recommended dollar amounts.
14. Savings answers create savings-envelope structure without changing the 50/30/20 feature.
15. A valid result creates a selectable `<First name>'s Curated Budget` option on the existing envelope screen.
16. Selecting the curated template selects its universal and custom envelope cards.
17. The user can change the curated selection before continuing.
18. Accepting the curated template creates the user's envelope structure and continues into the existing allocation flow.
19. An AI failure preserves the completed questionnaire and offers retry or the standard-template path.
20. Curated templates and questionnaire answers are isolated by user account.
21. The implementation emits the defined funnel and acceptance events without sending free-text answers to analytics.

## 14. Implementation sequence

### Phase 1: Navigation and questionnaire

- Add the onboarding-choice route.
- Add the two entry cards and routing.
- Build the reusable single-select, multi-select, short-text, and percentage question components.
- Implement the seven-question configuration and conditional branches.
- Persist draft answers per user.

### Phase 2: Recommendation service

- Define and validate the request and response schemas.
- Add the prompt template and version identifier.
- Call the configured language-model provider through a server-side interface.
- Add deterministic validation, universal-category ID checks, classification defaults, duplicate detection, and minimum-envelope enforcement.
- Add retry and failure behavior.

### Phase 3: Curated-template persistence and review

- Save valid recommendations as a draft curated template.
- Add the curated-template option to the existing category-template page.
- Render custom category cards and selection behavior.
- Support edit answers, regenerate, rename, add, remove, and acceptance.
- Continue into the unchanged allocation flow.

### Phase 4: Instrumentation and release validation

- Add funnel and retention events.
- Validate the example scenario in this plan.
- Test empty, conflicting, duplicate, and long free-text answers.
- Test AI timeout, invalid JSON, unknown universal IDs, and retry failure.
- Test account isolation.
- Test keyboard navigation, focus behavior, selectable-card labels, error messaging, and small-screen layouts.
- Release behind a feature flag before making the new landing page the default.

## 15. Definition of done

The feature is complete when a new user can choose Tally's AI Assistant, answer seven understandable questions, receive a minimal personalized envelope template containing relevant custom categories, edit that template on the existing envelope-selection screen, and continue through the current allocation workflow without receiving amount recommendations or changing the behavior of 50/30/20.
