import { ArrowRight, Check, ChevronLeft, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { audit, money, shortDate } from './App'
import { getCategoryIcon } from './categoryIcon'
import { MoneyPlantMascot } from './MoneyPlantMascot'
import { getSuggestion, MIN_SUGGESTION_CONFIDENCE } from './services/merchantCategorizer'
import type { AuditEntry, BudgetCategory, BudgetTransaction, PrototypeState } from './types/budget'

const GROUP_ORDER: BudgetCategory['group'][] = ['Needs', 'Wants', 'Savings']

type Phase =
  | 'intro'
  | 'suggested-categories'
  | 'manual-transition'
  | 'manual-review'
  | 'skipped-prompt'
  | 'skipped-review'
  | 'success'
  | 'complete'

type ItemStatus = 'suggested' | 'approved' | 'removed' | 'unresolved-initial'

interface ReviewItem {
  transaction: BudgetTransaction
  vendorKey: string
  suggestedCategoryId: string | null
  confidence: number
  status: ItemStatus
  vendorRuleEnabled: boolean
}

function normalizeVendor(merchant: string) {
  return merchant.trim().toLowerCase()
}

function sortChronologically(items: ReviewItem[]) {
  return [...items].sort((a, b) => a.transaction.date.localeCompare(b.transaction.date))
}

function buildItems(
  transactions: BudgetTransaction[],
  categories: BudgetCategory[],
  vendorRules: PrototypeState['vendorRules'],
): ReviewItem[] {
  return transactions.map((transaction) => {
    const recommendation = getSuggestion(transaction, categories)
    const vendorKey = normalizeVendor(transaction.merchant)
    const target = categories.find((category) => category.id === recommendation.categoryId)
    const confident = target !== undefined && recommendation.confidence >= MIN_SUGGESTION_CONFIDENCE
    if (!confident) {
      return {
        transaction,
        vendorKey,
        suggestedCategoryId: null,
        confidence: recommendation.confidence,
        status: 'unresolved-initial',
        vendorRuleEnabled: false,
      }
    }
    const existingRule = vendorRules.find(
      (rule) => rule.vendorKey === vendorKey && rule.categoryId === recommendation.categoryId,
    )
    return {
      transaction,
      vendorKey,
      suggestedCategoryId: recommendation.categoryId,
      confidence: recommendation.confidence,
      status: 'suggested',
      vendorRuleEnabled: existingRule?.enabled ?? false,
    }
  })
}

function findUnresolved(items: ReviewItem[]) {
  return items.filter((item) => item.status === 'removed' || item.status === 'unresolved-initial')
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="review-progress-track"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="review-progress-fill"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  )
}

export function TransactionReviewFlow({
  state,
  transactions,
  onCommit,
  onExit,
}: {
  state: PrototypeState
  transactions: BudgetTransaction[]
  onCommit: (next: PrototypeState, entry?: AuditEntry) => Promise<boolean>
  onExit: () => void
}) {
  const categories = useMemo(
    () => state.categories.filter((item) => !item.archived && item.group !== 'Savings'),
    [state.categories],
  )
  // Snapshot taken once per visit -- resets on re-entry, matching the spec's
  // "recalculate rather than restore prior screen position" resume behavior.
  const [items, setItems] = useState<ReviewItem[]>(() =>
    buildItems(transactions, categories, state.vendorRules),
  )
  const [phase, setPhase] = useState<Phase>('intro')
  const [groupIndex, setGroupIndex] = useState(0)
  const [groupApproved, setGroupApproved] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualQueue, setManualQueue] = useState<ReviewItem[]>([])
  const [manualIndex, setManualIndex] = useState(0)
  const [skippedIds, setSkippedIds] = useState<string[]>([])
  const [skippedQueue, setSkippedQueue] = useState<ReviewItem[]>([])
  const [skippedIndex, setSkippedIndex] = useState(0)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const groups = useMemo(() => {
    const ordered = GROUP_ORDER.flatMap((group) =>
      categories.filter((category) => category.group === group),
    )
    return ordered
      .map((category) => ({
        category,
        allItems: items.filter((item) => item.suggestedCategoryId === category.id),
      }))
      .filter((group) => group.allItems.length > 0)
  }, [categories, items])

  const currentGroup = groups[groupIndex]
  const currentVisibleItems = currentGroup
    ? currentGroup.allItems.filter((item) => item.status !== 'removed')
    : []

  useEffect(() => {
    if (phase === 'manual-review' && manualQueue.length > 0 && manualIndex >= manualQueue.length) {
      setPhase(skippedIds.length > 0 ? 'skipped-prompt' : 'complete')
    }
  }, [phase, manualIndex, manualQueue, skippedIds])

  useEffect(() => {
    if (
      phase === 'skipped-review' &&
      skippedQueue.length > 0 &&
      skippedIndex >= skippedQueue.length
    ) {
      setPhase('complete')
    }
  }, [phase, skippedIndex, skippedQueue])

  function enterPhase2OrSuccess(currentItems: ReviewItem[]) {
    const unresolved = findUnresolved(currentItems)
    if (unresolved.length > 0) {
      setManualQueue(sortChronologically(unresolved))
      setManualIndex(0)
      setPhase('manual-transition')
    } else {
      setPhase('success')
    }
  }

  function handleStart() {
    if (groups.length > 0) {
      setPhase('suggested-categories')
      return
    }
    enterPhase2OrSuccess(items)
  }

  function removeSuggestion(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.transaction.id === id
          ? { ...item, status: 'removed', vendorRuleEnabled: false }
          : item,
      ),
    )
  }

  function toggleVendorRule(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.transaction.id === id ? { ...item, vendorRuleEnabled: !item.vendorRuleEnabled } : item,
      ),
    )
  }

  async function approveCurrentGroup() {
    if (!currentGroup || submitting) return
    setSubmitting(true)
    setError(null)

    const category = currentGroup.category
    const keep = currentGroup.allItems.filter((item) => item.status !== 'removed')
    const removed = currentGroup.allItems.filter((item) => item.status === 'removed')
    const keepIds = new Set(keep.map((item) => item.transaction.id))
    const removedIds = new Set(removed.map((item) => item.transaction.id))

    const nextTransactions = state.transactions.map((transaction) => {
      if (keepIds.has(transaction.id)) {
        return {
          ...transaction,
          categoryId: category.id,
          categorizationSource: 'Transaction review · suggested match',
        }
      }
      if (removedIds.has(transaction.id)) {
        return { ...transaction, categoryId: null, categorizationSource: undefined }
      }
      return transaction
    })

    // One rule decision per vendor represented in this group; removed rows
    // never enable a rule, so removing a suggestion naturally stops future
    // suggestions for that vendor/category pairing once this group is saved.
    const vendorDecisions = new Map<string, boolean>()
    for (const item of currentGroup.allItems) {
      vendorDecisions.set(item.vendorKey, item.status !== 'removed' && item.vendorRuleEnabled)
    }
    const nextVendorRules = state.vendorRules.slice()
    for (const [vendorKey, enabled] of vendorDecisions) {
      const idx = nextVendorRules.findIndex(
        (rule) => rule.vendorKey === vendorKey && rule.categoryId === category.id,
      )
      if (enabled) {
        if (idx >= 0) nextVendorRules[idx] = { ...nextVendorRules[idx], enabled: true }
        else nextVendorRules.push({ vendorKey, categoryId: category.id, enabled: true })
      } else if (idx >= 0) {
        nextVendorRules.splice(idx, 1)
      }
    }

    const wasRevisit = groupApproved[category.id] === true
    const ok = await onCommit(
      { ...state, transactions: nextTransactions, vendorRules: nextVendorRules },
      audit(
        wasRevisit ? 'Transaction review group revised' : 'Transaction review group approved',
        `${keep.length} transaction(s) categorized to ${category.name}${
          removed.length ? `, ${removed.length} sent back for individual review` : ''
        }.`,
      ),
    )
    setSubmitting(false)
    if (!ok) {
      setError("We couldn't save this group. Check your connection and try again.")
      return
    }

    const nextItems = items.map((item) =>
      item.suggestedCategoryId === category.id && item.status !== 'removed'
        ? ({ ...item, status: 'approved' } as ReviewItem)
        : item,
    )
    setItems(nextItems)
    setGroupApproved((prev) => ({ ...prev, [category.id]: true }))

    if (groupIndex < groups.length - 1) {
      setGroupIndex((index) => index + 1)
      return
    }
    enterPhase2OrSuccess(nextItems)
  }

  async function assignManual(current: ReviewItem, categoryId: string) {
    if (submitting) return
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return
    setSubmitting(true)
    setError(null)
    const ok = await onCommit(
      {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.id === current.transaction.id
            ? {
                ...transaction,
                categoryId: category.id,
                categorizationSource: 'Transaction review · manual',
              }
            : transaction,
        ),
      },
      audit(
        'Transaction categorized',
        `${current.transaction.merchant} assigned to ${category.name} via manual review.`,
      ),
    )
    setSubmitting(false)
    if (!ok) {
      setError("We couldn't save that assignment. Check your connection and try again.")
      return
    }
    setManualIndex((index) => index + 1)
  }

  function skipManual(current: ReviewItem) {
    setSkippedIds((prev) => [...prev, current.transaction.id])
    setManualIndex((index) => index + 1)
  }

  async function redoManual() {
    if (manualIndex === 0 || submitting) return
    const previous = manualQueue[manualIndex - 1]
    if (skippedIds.includes(previous.transaction.id)) {
      setSkippedIds((ids) => ids.filter((id) => id !== previous.transaction.id))
      setManualIndex((index) => index - 1)
      return
    }
    setSubmitting(true)
    setError(null)
    const ok = await onCommit(
      {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.id === previous.transaction.id
            ? { ...transaction, categoryId: null, categorizationSource: undefined }
            : transaction,
        ),
      },
      audit('Transaction review undo', `${previous.transaction.merchant} reopened for review.`),
    )
    setSubmitting(false)
    if (!ok) {
      setError("We couldn't undo that. Check your connection and try again.")
      return
    }
    setManualIndex((index) => index - 1)
  }

  function startSkippedReview() {
    const queue = manualQueue.filter((item) => skippedIds.includes(item.transaction.id))
    setSkippedQueue(queue)
    setSkippedIndex(0)
    setPhase('skipped-review')
  }

  async function assignSkipped(current: ReviewItem, categoryId: string) {
    if (submitting) return
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return
    setSubmitting(true)
    setError(null)
    const ok = await onCommit(
      {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.id === current.transaction.id
            ? {
                ...transaction,
                categoryId: category.id,
                categorizationSource: 'Transaction review · manual',
              }
            : transaction,
        ),
      },
      audit(
        'Transaction categorized',
        `${current.transaction.merchant} assigned to ${category.name} via manual review.`,
      ),
    )
    setSubmitting(false)
    if (!ok) {
      setError("We couldn't save that assignment. Check your connection and try again.")
      return
    }
    setSkippedIndex((index) => index + 1)
  }

  function skipSkipped() {
    setSkippedIndex((index) => index + 1)
  }

  const totalApproved = items.filter((item) => item.status === 'approved').length
  const manualDoneCount = manualQueue
    .slice(0, manualIndex)
    .filter((item) => !skippedIds.includes(item.transaction.id)).length

  if (phase === 'intro') {
    return (
      <div className="review-shell">
        <div className="review-intro">
          <span className="review-intro-icon">
            <MoneyPlantMascot mood="curious" className="mood-mascot small" alt="Curious mascot" />
          </span>
          <h1>Let's review your transactions together.</h1>
          <p>
            Tally will first group transactions into the envelopes it believes are correct. You
            approve or remove those suggestions. Anything left over gets reviewed one at a time.
          </p>
          <button className="primary-action" onClick={handleStart} type="button">
            Start Review <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'suggested-categories' && currentGroup) {
    const category = currentGroup.category
    const Icon = getCategoryIcon(category.name)
    const isRevisit = groupApproved[category.id] === true
    const percent = groups.length > 0 ? Math.round((groupIndex / groups.length) * 100) : 0
    return (
      <div className="review-shell">
        <ProgressBar percent={percent} />
        <div className="review-step">
          <div className="review-step-header">
            <span className={`category-mark ${category.group.toLowerCase()}`}>
              <Icon size={18} />
            </span>
            <div>
              <p className="review-bubble">
                I found {currentGroup.allItems.length} transaction
                {currentGroup.allItems.length === 1 ? '' : 's'} that{' '}
                {currentGroup.allItems.length === 1 ? 'looks' : 'look'} like{' '}
                {currentGroup.allItems.length === 1 ? 'it belongs' : 'they belong'} in{' '}
                <strong>{category.name}</strong>. Remove anything that doesn't belong, then approve
                the rest.
              </p>
            </div>
          </div>

          {error && <div className="review-error">{error}</div>}

          {currentVisibleItems.length === 0 ? (
            <div className="empty-state">Nothing left in this group.</div>
          ) : (
            <div className="review-tx-list">
              {currentVisibleItems.map((item) => (
                <div className="review-tx-row" key={item.transaction.id}>
                  <div className="review-tx-main">
                    <strong>{item.transaction.merchant}</strong>
                    <small>{shortDate(item.transaction.date)}</small>
                  </div>
                  <span className="review-tx-amount">{money(item.transaction.amount)}</span>
                  <label
                    className="vendor-toggle"
                    title="Suggest this envelope for future transactions from this vendor"
                  >
                    <input
                      checked={item.vendorRuleEnabled}
                      onChange={() => toggleVendorRule(item.transaction.id)}
                      type="checkbox"
                    />
                    <span>Suggest for this vendor next time</span>
                  </label>
                  <button
                    aria-label={`Remove ${item.transaction.merchant} from ${category.name}`}
                    className="icon-button review-remove"
                    onClick={() => removeSuggestion(item.transaction.id)}
                    title="This doesn't belong here"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="review-step-actions">
            <button
              className="outline-action"
              disabled={groupIndex === 0 || submitting}
              onClick={() => setGroupIndex((index) => index - 1)}
              type="button"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              className="primary-action"
              disabled={submitting}
              onClick={approveCurrentGroup}
              type="button"
            >
              <Check size={17} />{' '}
              {currentVisibleItems.length === 0
                ? 'Confirm None Belong Here'
                : isRevisit
                  ? 'Save Changes'
                  : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'manual-transition') {
    const unresolvedCount = manualQueue.length
    return (
      <div className="review-shell">
        <div className="review-intro">
          <span className="review-intro-icon">
            <MoneyPlantMascot mood="hard-at-work" className="mood-mascot small" alt="Working mascot" />
          </span>
          <h1>A few transactions still need your help.</h1>
          <p>
            Great—your suggested matches are reviewed. {unresolvedCount} transaction
            {unresolvedCount === 1 ? '' : 's'} still need{unresolvedCount === 1 ? 's' : ''} your
            help, so we'll go through {unresolvedCount === 1 ? 'it' : 'those'} one at a time.
          </p>
          <button
            className="primary-action"
            onClick={() => setPhase('manual-review')}
            type="button"
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'manual-review' || phase === 'skipped-review') {
    const isSkippedPass = phase === 'skipped-review'
    const queue = isSkippedPass ? skippedQueue : manualQueue
    const index = isSkippedPass ? skippedIndex : manualIndex
    const current = queue[index]
    const percent = queue.length > 0 ? Math.round((index / queue.length) * 100) : 0

    if (!current) {
      return (
        <div className="review-shell">
          <div className="review-intro">
            <p>Loading…</p>
          </div>
        </div>
      )
    }

    return (
      <div className="review-shell">
        <ProgressBar percent={percent} />
        {error && <div className="review-error">{error}</div>}
        <article
          className="manual-card"
          draggable={!submitting}
          onDragStart={(event) => event.dataTransfer.setData('text/plain', current.transaction.id)}
        >
          <strong>{current.transaction.merchant}</strong>
          <span className="manual-card-amount">{money(current.transaction.amount)}</span>
          <small>{shortDate(current.transaction.date)}</small>
        </article>

        <div className="envelope-groups">
          {GROUP_ORDER.map((group) => {
            const rows = categories.filter((category) => category.group === group)
            if (rows.length === 0) return null
            return (
              <div className="envelope-group" key={group}>
                <p className="envelope-group-label">{group}</p>
                <div className="envelope-grid">
                  {rows.map((category) => {
                    const Icon = getCategoryIcon(category.name)
                    return (
                      <button
                        className={`envelope-tile ${category.group.toLowerCase()}`}
                        disabled={submitting}
                        key={category.id}
                        onClick={() =>
                          isSkippedPass
                            ? assignSkipped(current, category.id)
                            : assignManual(current, category.id)
                        }
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          const droppedId = event.dataTransfer.getData('text/plain')
                          if (droppedId !== current.transaction.id) return
                          if (isSkippedPass) assignSkipped(current, category.id)
                          else assignManual(current, category.id)
                        }}
                        type="button"
                      >
                        <Icon size={18} />
                        <span>{category.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="manual-controls">
          <button
            className="outline-action"
            disabled={submitting}
            onClick={() => (isSkippedPass ? skipSkipped() : skipManual(current))}
            type="button"
          >
            Skip
          </button>
          {!isSkippedPass && (
            <button
              className="outline-action"
              disabled={manualIndex === 0 || submitting}
              onClick={redoManual}
              type="button"
            >
              <Undo2 size={15} /> Redo
            </button>
          )}
          <button
            aria-label="Exit transaction review"
            className="icon-button"
            onClick={() => setShowExitConfirm(true)}
            title="Exit review"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {showExitConfirm && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h2>Exit transaction review?</h2>
              <p>
                Everything you've approved or assigned so far is already saved —{' '}
                {totalApproved + manualDoneCount} transaction
                {totalApproved + manualDoneCount === 1 ? '' : 's'} categorized. The current
                transaction and anything remaining will stay uncategorized, and you can pick up
                right where you left off next time.
              </p>
              <div className="modal-actions">
                <button
                  className="outline-action"
                  onClick={() => setShowExitConfirm(false)}
                  type="button"
                >
                  Keep reviewing
                </button>
                <button className="primary-action" onClick={onExit} type="button">
                  Exit review
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'skipped-prompt') {
    return (
      <div className="modal-overlay">
        <div className="modal-card">
          <h2>Review skipped transactions?</h2>
          <p>
            You skipped {skippedIds.length} transaction{skippedIds.length === 1 ? '' : 's'}. You can
            go through {skippedIds.length === 1 ? 'it' : 'them'} now, or finish and leave{' '}
            {skippedIds.length === 1 ? 'it' : 'them'} uncategorized for later.
          </p>
          <div className="modal-actions">
            <button className="outline-action" onClick={() => setPhase('complete')} type="button">
              Finish without them
            </button>
            <button className="primary-action" onClick={startSkippedReview} type="button">
              Review skipped
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="review-shell">
        <div className="complete-state">
          <MoneyPlantMascot mood="celebrating" className="mood-mascot medium" alt="Celebrating mascot" />
          <Check size={28} />
          <h2>All set!</h2>
          <p>Every transaction was resolved during your suggested-category review.</p>
          <button className="primary-action" onClick={() => setPhase('complete')} type="button">
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'complete') {
    return (
      <div className="review-shell">
        <div className="complete-state">
          <MoneyPlantMascot mood="excited" className="mood-mascot medium" alt="Excited mascot" />
          <Check size={28} />
          <h2>Review complete</h2>
          <p>Nice work — your transactions are up to date.</p>
          <button className="primary-action" onClick={onExit} type="button">
            Return to Overview
          </button>
        </div>
      </div>
    )
  }

  return null
}
