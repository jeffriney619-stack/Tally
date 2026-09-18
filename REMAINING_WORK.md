# Tally – Remaining Work & Product Refinements

**Last Updated:** 2026-09-15  
**Status:** Prototype active, multiple feature refinements and integrations pending

---

## 1. Authentication & Account Management (Foundational)

**Current State:** Login accepts username/password but unclear if profiles are separate or simulated. **Username/password creation does not appear to exist yet.**

**Open Questions:**
- Are separate user profiles actually being created and persisted?
- Is login gating real account data or is everything simulated for prototyping?
- What is the benefit of linking to email vs. username-only auth?
- How should profile state/preferences be saved and restored?

**Scope:**
- **Build username/password creation flow** (signup/registration page)
- Clarify authentication model (real separate accounts vs. prototype simulation)
- Decide on email integration value proposition
- Implement persistent profile storage if not already doing so
- Plan credential recovery flow (password reset, etc.)

---

## 2. Onboarding & Feature Education (User Enablement)

**Current State:** No onboarding guide exists; users land directly on the app after login.

**Vision:** First-time users need coaching on Tally's core concepts and workflows before diving into the app. This becomes the foundation for the eventual public marketing website.

**Scope:**

**Part 1 – Interactive Onboarding Tutorial** (In-App)
- Appears on first login after account creation
- Teaches core concepts:
  - Envelope budgeting model and 50/30/20 rule
  - How to set up categories and monthly contributions
  - Transaction categorization workflow (single transaction, AI review, SMS)
  - Month-close ritual and rollover behavior
  - Available balance tracking and goal timelines
  - Refund reconciliation
- Interactive demonstrations:
  - **GIF-style animated sequences** showing:
    - Dragging a transaction into a category bucket
    - Chatting with AI to categorize charges
    - SMS interaction (message in, category response)
    - Creating a new envelope/category
    - Closing a month and seeing rollover
  - Each section has a "Try it now" button to practice
  - Can be skipped, but available in Help menu later

**Part 2 – Marketing/Landing Page Content** (External Site)
- Same educational content in web-friendly format
- Explainer videos/GIFs showing the experience
- Use cases and benefits
- Link to login/signup
- Informs eventual public hosting strategy

**Scope:**
- Decide on animation tool (Loom, Figma prototypes, custom video, screen recordings)
- Write/storyboard each tutorial section
- Create GIF-quality demos (or embed video)
- Build in-app tutorial component (can be built as a modal/walkthrough)
- Design corresponding landing page content
- Plan how to make tutorial optional/repeatable for existing users

---

## 3. Month-Close Feature Redesign (UX Refinement)

**Current State:** Month-close button exists but its value is unclear.

**Problems Identified:**
- Not clear if month-closing is actually compelling to users
- Month closure appears procedural rather than insightful
- Users want to click through months freely to see category growth over time (e.g., watching vacation savings accumulate)
- Current month-close is a gate, not an experience

**Opportunity:**
- Consider "Month in Review" style summary (Spotify Wrapped model) when closing
- Show category trajectories, spending patterns, remaining balance trends
- Allow free historical browsing without requiring month-close as prerequisite
- Evaluate: Is month-close even necessary, or should it be optional/implicit?

**Scope:**
- Brainstorm month-review experience design
- Decide if month-close should remain a gate or become optional
- Implement historical month browsing if removing the gate
- Build review summary if keeping month-close

---

## 4. Savings Category Automation (Product Design)

**Current State:** Savings categories show percentage bars, but no real bank charges feed them.

**Problem:** Savings envelopes are manually funded (from monthly contribution), but users never see a charge against them. This creates a UX mismatch.

**Options:**
- **A:** Treat savings as non-transactional (automatic monthly contribution, no charge experience)
- **B:** Create virtual "savings milestone" transactions to show progress visually
- **C:** Hide savings from transaction feed entirely, show only as balance rollover
- **D:** Link to external tracking (bank account view, investment account, etc.) — out of scope for now

**Uncertainty:** Users may prefer seeing savings grow in real bank account or stock plan rather than in-app.

**Scope:**
- Decide on savings visualization philosophy
- Implement chosen approach
- Test whether automatic funding feels satisfying vs. transaction-based approach

---

## 5. AI Review Tab UX Redesign (Core Feature)

**Current State:** "Review with AI" button exists but experience is unclear.

**Problems Identified:**
- Difficult for users to visually find the right category when many categories exist
- Batch review of many charges at once is overwhelming
- Drag-and-drop with many categories becomes complex
- No clear "I was wrong" flow for AI suggestions

**Proposed Workflow:**
1. **Step 1 – Automated Guess:** AI categorizes all uncategorized charges, grouped by category
2. **Step 2 – Confidence Review:** Show user each category group with ✓/✗ buttons per group
3. **Step 3 – Manual Resolution:** For rejected groups, switch to **one-charge-at-a-time** flow
   - Show single charge with cleaned merchant name
   - Offer quick buttons for most-used categories
   - Provide category search/filter
   - Allow drag-to-category if desired

**Benefits:**
- First pass is automatic (satisfying)
- User confirms in batches (efficient)
- Corrections happen single-charge (manageable)
- Personal preferences build over time

**Scope:**
- Design confidence UI (approve/reject per category group)
- Build single-charge categorization UI with category picker
- Implement memory of user corrections
- Test with expanded charge set (see #5)

---

## 6. Bank Charge Simulation Expansion (Testing Infrastructure)

**Current State:** Manual "Simulate a bank charge" button (one at a time).

**Need:** Replace Plaid integration (time constraint) with robust simulation of realistic transaction volumes.

**Requirement:**
- Bulk charge generation (dozens to hundreds)
- Randomized merchants, amounts, dates, categories
- Realistic merchant names and categories
- Spread across time (not all same date)

**Scope:**
- Define charge generation rules (merchants, amounts, date distribution, frequency)
- Build bulk simulator UI or backend endpoint
- User to provide charge templates/data later
- Enable realistic testing of AI review, month-close, and available-balance tracking

---

## 7. Available Money & Rollover Tracking Enhancement (UX Improvement)

**Current State:** Available amount is shown as a single number, no historical context.

**Problems:**
- Users want to see how funds accumulate over months (e.g., when will $400 vacation fund be ready?)
- No way to visualize "if I spend $X this month, when will I hit $Y goal?"
- Current column-based display doesn't tell the story

**Opportunities:**
- Show available balance as a trend line or growth chart across months
- "Goal timeline" — if user inputs a savings target, show projected month when goal is reached
- "Scenario planner" — "If I spend this much in Dining, when is Vacation ready?"
- Highlight rollover amounts when months close
- Show runway/burn rate

**Scope:**
- Decide on primary visualization (trend, timeline, scenario)
- Implement selected approach
- Link to historical month browsing (#2)
- Test with multi-month data

---

## 8. Twilio Integration Completion (Feature Completeness)

**Current State:** SMS consent feature built (Phase 2); Phase 3 paused awaiting public URL.

**Current Blocker:** Campaign registration requires live Privacy Policy & Terms of Service URLs.

**Outstanding:**
- Finish A2P 10DLC Campaign registration (Twilio console, pending public URLs)
- Buy/attach local number to Messaging Service (~$1.15/month)
- Build SMS response handling in backend
- Test SMS question/answer flow with real messages
- Integrate with transaction categorization (SMS → category update → API)

**Scope:**
- Defer until Tally has a public URL (#8)
- Once hosted, create Privacy Policy & Terms pages
- Complete Twilio campaign registration
- Add SMS inbound webhook handler to backend
- Wire SMS responses into transaction categorization
- Test end-to-end SMS flow

---

## 9. Public Hosting & Multi-User Scale (Production Deployment)

**Current State:** Running locally on http://localhost:5173 and http://localhost:5080.

**Need:** Scalable hosting, proper user isolation, production database, SSL, monitoring.

**Decisions Pending:**
- Hosting platform (Azure, AWS, Heroku, etc.)
- Database (managed Postgres, SQL Server, etc.)
- Authentication service (Auth0, built-in, etc.)
- Domain name
- Backup/recovery strategy
- Monitoring and logging

**Scope:**
- Choose hosting provider and plan
- Migrate backend & frontend to cloud
- Set up production database and backups
- Configure SSL/HTTPS
- Implement multi-user isolation/permissions
- Set up monitoring and alerting
- Enable Twilio to reach public URL (enables #7)

---

## 10. Account Reset / "Clean Slate" Feature (User Experience Recovery)

**Current State:** No reset capability exists; users cannot wipe their account and start fresh.

**Need:** Users may get behind on categorization, overspend categories, or simply want a fresh start without creating a new account.

**Opportunity:**
- Provide "Clean Slate" button to wipe all budget data while preserving the account
- Allow users to keep account name/login but reset categories, transactions, and balances
- Optional: Preserve onboarding preference (don't re-show tutorial on reset)
- Optional: Archive old data rather than delete (compliance, recovery)

**Variations:**
- **Full Wipe:** Delete all transactions, reset all category balances, restart from scratch
- **Preserve Structure:** Keep category setup, reset only balances and transactions
- **Archive & Reset:** Move old data to archive, start fresh but keep history accessible

**Scope:**
- Decide on reset scope (full wipe vs. preserve structure vs. archive)
- Add "Reset Account" option to Settings menu
- Build confirmation dialog with clear consequences
- Implement backend reset logic (delete transactions, reset balances per category)
- Optional: Add data export before reset (user recovery)
- Test reset flow and verify data isolation

---

## Suggested Execution Order

### Phase A – Foundation & Design (Low Risk, Unblocks Others)
1. **Build username/password creation** (#1) — critical missing feature, enables real multi-user testing
2. **Clarify auth model** (#1) — foundational, informs all user data handling
3. **Create onboarding guide & tutorial** (#2) — establishes feature narrative, required for external site later
4. **Expand charge simulation** (#6) — enables realistic testing without Plaid
5. **Brainstorm month-close/review UX** (#3, #7) — informs overall interaction model

### Phase B – Core Experience Refinement (High Impact)
6. **Redesign AI review workflow** (#5) — most used user flow for uncategorized charges
7. **Rethink savings automation** (#4) — product decision with ripple effects
8. **Enhance available-balance tracking** (#7) — improves goal-setting experience

### Phase C – Feature Completion & Scale (Time-Intensive)
9. **Complete Twilio integration** (#8) — requires public URL from Phase C
10. **Deploy to public hosting** (#9) — enables multi-user, SMS, production readiness

---

## Notes

- **Item #1 (auth + password creation)** is critical and blocking — users can't sign up or create profiles right now
- **Item #2 (onboarding)** shapes the entire product narrative and supports the eventual marketing site
- **Items #1 and #3 are foundational** – recommend clarifying these before heavy feature work
- **Item #6 (charge simulation)** – needed quickly to test everything else at scale
- **Item #9 (hosting)** – unblocks Item #8 (Twilio) but is time-intensive; may be last
- **Items #4, #5, #7** – benefit from user feedback during prototype testing
