# Tally: AI/ML Transaction Categorization Workflow

## Purpose and scope

The AI/ML workflow is: **prepare the transaction → gather relevant context → compare candidate envelopes → make or withhold a recommendation → validate the result → learn from the user's final choice.**

Assume Tally already has transaction history, account information, envelope definitions, and previous feedback. The work is deciding which information matters for this transaction and how to use it to predict the user's intended envelope.

Here, “slotting” means placing the transaction in a suggested envelope, pending confirmation.

This document describes the AI/ML logic only. It does not specify a full product rollout or require training model weights.

## 1. Normalize the incoming transaction

Turn the uncategorized transaction into a consistent input.

| Component | Details |
|---|---|
| Inputs | Raw merchant description, merchant identifier, amount, transaction dates, available purchase time, account identifier, pending/posted status |
| Logic | Resolve merchant aliases; standardize amounts and dates; distinguish purchase time from posting time; flag missing or unreliable fields |
| Tools | Data-processing code, merchant mapping table, timestamp validation |
| Output | A normalized transaction with data-quality flags |

For example, `SQ *BISTRO ABC #102` and `Bistro ABC` might represent the same merchant. Reliable matching allows Tally to retrieve the correct history.

**Do not ask the model to infer a purchase time that is missing.** Unknown fields should remain unknown.

## 2. Assemble the user's categorization context

Define the choices and preferences relevant to this account.

| Component | Details |
|---|---|
| Inputs | Active envelopes, envelope descriptions, explicit merchant rules, user preferences, relevant account information |
| Logic | Identify valid destinations; load explicit instructions; include account attributes only when they have a defined categorization meaning |
| Tools | Database queries, rule lookup, envelope lookup |
| Output | Valid envelope candidates and applicable constraints |

Example envelope definitions:

| Envelope | User's definition |
|---|---|
| Dining | Ordinary meals out and takeout |
| Dates | Meals and activities specifically for date nights |
| Travel | Expenses incurred as part of a trip |

These definitions help distinguish purchase type from purchase purpose.

An account being a credit card does not establish purpose. A user explicitly designating an account for business expenses could be relevant.

## 3. Retrieve relevant historical evidence

Select useful history rather than passing the entire account history to the model.

| Component | Details |
|---|---|
| Inputs | Normalized transaction, confirmed past categorizations, previous suggestions, rejections, corrections |
| Logic | Retrieve exact merchant matches first; supplement with similar purchases; retain recent corrections and conflicting examples |
| Tools | Database filters, merchant matching, similarity search if ordinary matching proves insufficient |
| Output | A compact evidence set with record IDs and feedback provenance |

Useful evidence might include:

- Confirmed purchases at the same merchant.
- Comparable purchases at other merchants.
- Previous rejection of the proposed envelope.
- The category ultimately selected after rejection.
- Relevant explicit preferences.

**Previous AI suggestions are not confirmed labels.** Preserve whether an example was manually categorized, approved, rejected, or left unreviewed.

All retrieved information must belong to the correct user and must have been available before the current decision.

## 4. Convert history into interpretable signals

Calculate patterns that help the model compare envelopes.

| Component | Details |
|---|---|
| Inputs | Retrieved evidence, transaction details, envelope definitions |
| Logic | Summarize category frequencies, recency, corrections, merchant ambiguity, and reliable timing patterns |
| Tools | Aggregation code and feature calculations |
| Output | Evidence summaries for candidate envelopes |

For a hypothetical transaction:

> Bistro ABC, $84, Friday at 7:30 p.m.

The summaries might be:

| Signal | Evidence |
|---|---|
| Same-merchant history | Six confirmed Dates purchases; two Dining purchases |
| Recent behavior | Last three confirmed purchases were Dates |
| Timing | Four comparable Friday-evening purchases were Dates |
| Negative feedback | One previous Dates suggestion was corrected to Dining |
| Category availability | Both Dates and Dining remain active |

Keep the counts and exceptions visible. “Usually Dates” hides information the decision may need.

Timing should support a pattern, not establish one by itself. Also, **one transaction can contribute to several signals**; those signals are not independent pieces of evidence.

## 5. Apply explicit rules and compare candidate envelopes

Use deterministic logic for clear instructions and AI for the remaining interpretation.

| Component | Details |
|---|---|
| Inputs | Applicable rules, candidate envelopes, transaction, historical examples, calculated signals |
| Logic | Honor explicit rules; otherwise compare how well each envelope fits the user's definitions and confirmed behavior |
| Tools | Rule engine, model API, structured-output instructions |
| Output | Proposed envelope or a decision that more information is needed |

The model's task should be narrowly defined:

> Select the existing envelope best supported by this user's confirmed history and definitions. Treat rejected suggestions as negative evidence for the relevant transaction. Do not invent purchase purpose. Request input when the evidence cannot distinguish plausible destinations.

A useful structured result contains:

| Field | Purpose |
|---|---|
| `decision` | `suggest` or `needs_input` |
| `envelope_id` | Proposed destination, if supported |
| `alternative_envelope_ids` | Other plausible destinations |
| `evidence_ids` | Records supporting the recommendation |
| `explanation` | Brief explanation grounded in supplied evidence |
| `clarification_question` | Missing information needed to distinguish candidates |

The output can say:

> “Suggested Dates based on your recent confirmed purchases at this merchant.”

It should not say:

> “You were having dinner with your wife.”

The supplied evidence does not establish who attended.

## 6. Validate and decide whether to surface the suggestion

Check both structural correctness and the strength of the recommendation.

| Component | Details |
|---|---|
| Inputs | Model output, active envelope list, applicable rules, evidence records |
| Logic | Verify the envelope exists, belongs to the user, and satisfies explicit rules; check that cited evidence exists; apply the suggestion policy |
| Tools | Schema validation, deterministic checks, empirically tested decision thresholds |
| Output | Validated suggestion, clarification request, or manual-review fallback |

Distinguish two questions:

1. **Is the output valid?** The envelope exists and the response follows the required format.
2. **Is the recommendation sufficiently supported?** The evidence warrants displaying it.

A model-generated confidence score is not automatically a calibrated probability. If you use confidence thresholds, verify their relationship to actual correctness on labeled cases.

## 7. Incorporate the user's response

Turn the outcome into evidence for future decisions.

| Component | Details |
|---|---|
| Inputs | Approval, rejection, final envelope selection, clarification answer, explicit rule creation |
| Logic | Record exactly what happened; update confirmed history; save broader preferences only when justified |
| Tools | Feedback-event store, transaction history, preference/rule store |
| Output | New labeled evidence available to subsequent transactions |

| User action | What the system learns |
|---|---|
| Approves Dates | Dates was accepted for this transaction |
| Rejects Dates without selecting another envelope | Dates was rejected; correct destination remains unknown |
| Selects Dining instead | Dining is the confirmed label; Dates was rejected |
| Skips | No categorization label |
| Says “Always use Dining for this merchant” | An explicit merchant rule |

This is how the workflow can personalize over time **without retraining the model's weights**.

## 8. Evaluate and refine the decision logic

Replay historical transactions to determine whether each component improves categorization.

| Component | Details |
|---|---|
| Inputs | Labeled transactions, historical context snapshots, workflow versions |
| Logic | Generate recommendations using only information available at each decision; compare against confirmed outcomes |
| Tools | Evaluation script, held-out dataset, error analysis |
| Output | Measured improvements and targeted changes to retrieval, signals, or model instructions |

Compare these versions on the same cases:

| Version | Question it answers |
|---|---|
| Merchant-history baseline | How far does simple matching get us? |
| Model with transaction and envelope definitions | Does semantic interpretation help? |
| Add confirmed history | Does personalization help? |
| Add corrections and rejections | Does feedback prevent repeated mistakes? |
| Add reliable timing | Does timing improve results beyond the other evidence? |

Measure **suggestion correctness and coverage together**, plus unnecessary clarification, invalid outputs, and performance on ambiguous cases.

## Core architecture

The core algorithm combines **retrieval, calculated historical signals, model interpretation, and deterministic validation**.

The model's central job is resolving ambiguity between the user's envelopes. The surrounding code supplies trustworthy evidence and enforces the decision boundaries.
