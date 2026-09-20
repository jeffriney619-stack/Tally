import { ArrowDown, ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { monthLabel, shortDate, money } from './App'
import { MoneyPlantMascot } from './MoneyPlantMascot'
import type {
  AuditEntry,
  BudgetGroup,
  BudgetTransaction,
  PrototypeState,
  MonthInReviewData,
  MerchantStat,
  EnvelopeChange,
} from './types/budget'

type Phase =
  | 'intro'
  | 'facts'
  | 'merchants'
  | 'merchantFrequency'
  | 'envelopes'
  | 'recommendations'
  | 'complete'
  | 'archive'
  | 'dashboard'

interface ReviewFacts {
  totalTransactions: number
  noSpendDays: number
  mostFrequentDay: string
}

interface BalanceStoryPoint {
  date: string
  balance: number
  amount?: number
  merchant?: string
  crossedBelowZero?: boolean
}

interface BalanceStoryCategory {
  categoryId: string
  categoryName: string
  group: BudgetGroup
  startBalance: number
  endBalance: number
  points: BalanceStoryPoint[]
}

interface TurningPointInsight {
  categoryName: string
  date: string
  amount: number
}

function toUtcDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`)
}

function isSavingsLike(categoryName: string, group: string): boolean {
  if (group === 'Savings') return true
  const normalized = categoryName.trim().toLowerCase()
  return normalized.includes('savings')
}

function isRentMortgageLike(categoryName: string): boolean {
  const normalized = categoryName.trim().toLowerCase()
  return normalized === 'rent/mortgage' || normalized === 'rent' || normalized === 'mortgage' || normalized === 'housing'
}

function getStorylineCategories(
  categories: PrototypeState['categories'],
): PrototypeState['categories'] {
  return categories.filter(
    (category) =>
      !category.archived &&
      !isSavingsLike(category.name, category.group) &&
      !isRentMortgageLike(category.name),
  )
}

function calculateBalanceStoryline(
  monthKey: string,
  transactions: BudgetTransaction[],
  categories: PrototypeState['categories'],
): BalanceStoryCategory[] {
  const storylineCategories = getStorylineCategories(categories)
  const categoriesById = new Map(storylineCategories.map((c) => [c.id, c]))

  const byCategory: Record<string, BudgetTransaction[]> = {}
  for (const tx of transactions) {
    if (tx.amount <= 0 || !tx.categoryId) continue
    if (!categoriesById.has(tx.categoryId)) continue
    if (!tx.date.startsWith(monthKey)) continue
    if (!byCategory[tx.categoryId]) byCategory[tx.categoryId] = []
    byCategory[tx.categoryId].push(tx)
  }

  const stories: BalanceStoryCategory[] = storylineCategories.map((category) => {
    const startBalance = category.openingBalance + category.monthlyTarget
    const categoryTransactions = (byCategory[category.id] ?? []).sort((a, b) => {
      const dateSort = a.date.localeCompare(b.date)
      if (dateSort !== 0) return dateSort
      return a.id.localeCompare(b.id)
    })

    const points: BalanceStoryPoint[] = [
      {
        date: `${monthKey}-01`,
        balance: startBalance,
      },
    ]

    let running = startBalance
    for (const tx of categoryTransactions) {
      const next = running - tx.amount
      points.push({
        date: tx.date,
        balance: next,
        amount: tx.amount,
        merchant: tx.merchant,
        crossedBelowZero: running >= 0 && next < 0,
      })
      running = next
    }

    return {
      categoryId: category.id,
      categoryName: category.name,
      group: category.group,
      startBalance,
      endBalance: running,
      points,
    }
  })

  return stories
    .filter((story) => story.points.length > 1)
    .sort((a, b) => Math.abs(b.startBalance - b.endBalance) - Math.abs(a.startBalance - a.endBalance))
}

function calculateTurningPoint(stories: BalanceStoryCategory[]): TurningPointInsight | null {
  const crossingEvents = stories.flatMap((story) =>
    story.points
      .filter((point) => point.crossedBelowZero && typeof point.amount === 'number')
      .map((point) => ({
        categoryName: story.categoryName,
        date: point.date,
        amount: point.amount ?? 0,
      })),
  )

  if (crossingEvents.length === 0) return null
  crossingEvents.sort((a, b) => toUtcDate(a.date).getTime() - toUtcDate(b.date).getTime())
  return crossingEvents[0]
}

function reduceStoryPointsForCompact(points: BalanceStoryPoint[]): BalanceStoryPoint[] {
  if (points.length <= 3) return points

  const first = points[0]
  const lastPointByDay = new Map<string, BalanceStoryPoint>()

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    lastPointByDay.set(point.date, point)
  }

  const dailyPoints = Array.from(lastPointByDay.values()).sort((a, b) => a.date.localeCompare(b.date))
  const maxPoints = 9

  if (dailyPoints.length <= maxPoints) {
    return [first, ...dailyPoints]
  }

  const sampled: BalanceStoryPoint[] = []
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round((i * (dailyPoints.length - 1)) / (maxPoints - 1))
    sampled.push(dailyPoints[index])
  }

  const deduped = sampled.filter(
    (point, index, list) => index === 0 || point.date !== list[index - 1].date,
  )
  return [first, ...deduped]
}

function BalanceStorylinePrototype({
  monthKey,
  stories,
}: {
  monthKey: string
  stories: BalanceStoryCategory[]
}) {
  const [compactMode, setCompactMode] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 760px)')
    const onChange = (event: MediaQueryListEvent) => setCompactMode(event.matches)
    setCompactMode(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const chartStories = useMemo(
    () =>
      compactMode
        ? stories.map((story) => ({
            ...story,
            points: reduceStoryPointsForCompact(story.points),
          }))
        : stories,
    [compactMode, stories],
  )

  const width = 980
  const height = Math.max(360, 240 + chartStories.length * 28)
  const margin = { top: 24, right: 250, bottom: 30, left: 74 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const start = toUtcDate(`${monthKey}-01`).getTime()
  const [yearRaw, monthRaw] = monthKey.split('-')
  const daysInMonth = new Date(Number(yearRaw), Number(monthRaw), 0).getDate()
  const end = toUtcDate(`${monthKey}-${String(daysInMonth).padStart(2, '0')}`).getTime()

  const values = chartStories.flatMap((story) => story.points.map((point) => point.balance))
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(...values, 0)
  const paddedMin = Math.floor((minValue - 100) / 100) * 100
  const paddedMax = Math.ceil((maxValue + 100) / 100) * 100
  const range = Math.max(1, paddedMax - paddedMin)

  const xForDate = (date: string) => {
    const current = toUtcDate(date).getTime()
    const ratio = end === start ? 0 : (current - start) / (end - start)
    return margin.left + ratio * innerWidth
  }
  const yForValue = (value: number) => margin.top + ((paddedMax - value) / range) * innerHeight

  const tickCount = compactMode ? 4 : 6
  const generatedTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const value = paddedMin + (range / tickCount) * i
    return Math.round(value)
  })
  const yTicks = Array.from(new Set([...generatedTicks, 0])).sort((a, b) => a - b)

  const dateTickDays = compactMode
    ? [1, Math.max(1, Math.round(daysInMonth / 2)), daysInMonth]
    : [1, 8, 15, 22, 29]
  const dateTicks = Array.from(new Set(dateTickDays))
    .filter((day) => day <= daysInMonth)
    .map((day) => `${monthKey}-${String(day).padStart(2, '0')}`)

  const palette = ['#79B8FF', '#F6A259', '#6AD1A5', '#E87B7B', '#B39DDB', '#FFD166', '#8EC5FC']
  const chartEndDate = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`
  const chartEndX = xForDate(chartEndDate)

  const rawLabelLayout = chartStories
    .map((story, index) => ({
      categoryId: story.categoryId,
      color: palette[index % palette.length],
      rawY: yForValue(story.endBalance),
    }))
    .sort((a, b) => a.rawY - b.rawY)

  const labelGap = 18
  const minLabelY = margin.top + 8
  const maxLabelY = height - margin.bottom - 8

  for (let i = 0; i < rawLabelLayout.length; i += 1) {
    if (i === 0) {
      rawLabelLayout[i].rawY = Math.max(minLabelY, rawLabelLayout[i].rawY)
      continue
    }
    rawLabelLayout[i].rawY = Math.max(rawLabelLayout[i].rawY, rawLabelLayout[i - 1].rawY + labelGap)
  }

  for (let i = rawLabelLayout.length - 1; i >= 0; i -= 1) {
    if (i === rawLabelLayout.length - 1) {
      rawLabelLayout[i].rawY = Math.min(maxLabelY, rawLabelLayout[i].rawY)
      continue
    }
    rawLabelLayout[i].rawY = Math.min(rawLabelLayout[i].rawY, rawLabelLayout[i + 1].rawY - labelGap)
  }

  const labelYByCategory = new Map(rawLabelLayout.map((item) => [item.categoryId, item.rawY]))

  return (
    <div className="review-balance-story-prototype">
      <div className="review-balance-story-header">
        <h3>Prototype: Balance Storyline</h3>
        <p>Each drop marks a transaction hitting that envelope balance.</p>
      </div>
      <div className="review-balance-story-canvas" role="img" aria-label="Envelope balance storyline chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="review-balance-story-svg">
          {yTicks.map((tick) => {
            const y = yForValue(tick)
            const isZero = Math.abs(tick) < 1
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={y}
                  y2={y}
                  className={isZero ? 'review-story-grid-line zero' : 'review-story-grid-line'}
                />
                {isZero && (
                  <text
                    x={width - margin.right - 10}
                    y={y - 7}
                    textAnchor="end"
                    className="review-story-zero-label"
                  >
                    $0 baseline
                  </text>
                )}
                <text x={margin.left - 10} y={y + 4} textAnchor="end" className="review-story-axis-label">
                  {money(tick)}
                </text>
              </g>
            )
          })}

          {dateTicks.map((tick) => {
            const x = xForDate(tick)
            return (
              <g key={tick}>
                <line x1={x} x2={x} y1={margin.top} y2={height - margin.bottom} className="review-story-vertical-grid" />
                <text x={x} y={height - 8} textAnchor="middle" className="review-story-axis-label">
                  {shortDate(tick)}
                </text>
              </g>
            )
          })}

          {chartStories.map((story, index) => {
            const color = palette[index % palette.length]
            const startPoint = story.points[0]
            let path = `M ${xForDate(startPoint.date)} ${yForValue(startPoint.balance)}`
            let previousY = yForValue(startPoint.balance)

            for (let i = 1; i < story.points.length; i += 1) {
              const point = story.points[i]
              const x = xForDate(point.date)
              const y = yForValue(point.balance)
              path += ` L ${x} ${previousY} L ${x} ${y}`
              previousY = y
            }

            const finalX = chartEndX
            path += ` L ${finalX} ${previousY}`
            const rawEndY = yForValue(story.endBalance)
            const labelY = labelYByCategory.get(story.categoryId) ?? rawEndY
            const adjusted = Math.abs(labelY - rawEndY) > 1

            return (
              <g key={story.categoryId}>
                <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
                {!compactMode &&
                  story.points.map((point, pointIndex) => {
                    if (pointIndex === 0) return null
                    return (
                      <circle
                        key={`${story.categoryId}-${point.date}-${pointIndex}`}
                        cx={xForDate(point.date)}
                        cy={yForValue(point.balance)}
                        r={5}
                        fill={color}
                        className="review-story-point"
                      />
                    )
                  })}
                {adjusted && (
                  <line
                    x1={finalX + 4}
                    y1={rawEndY}
                    x2={width - margin.right + 2}
                    y2={labelY}
                    stroke={color}
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                  />
                )}
                <text
                  x={width - margin.right + 8}
                  y={labelY + 4}
                  className="review-story-series-label"
                  fill={color}
                >
                  {story.categoryName} {money(story.endBalance)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

type StoryGroupFilter = 'all' | 'needs' | 'wants'

function getPurchaseTransactions(transactions: BudgetTransaction[]): BudgetTransaction[] {
  // Use the same purchase set across all slides to keep totals consistent.
  return transactions.filter((tx) => tx.amount > 0)
}

function calculateFacts(transactions: BudgetTransaction[]): ReviewFacts {
  const totalTransactions = transactions.length

  const allDaysInMonth = new Set<string>()
  const spendingDays = new Set<string>()
  
  const monthKey = transactions.length > 0 ? transactions[0].date.slice(0, 7) : new Date().toISOString().slice(0, 7)
  const [year, month] = monthKey.split('-')
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate()
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`
    allDaysInMonth.add(dateStr)
  }
  
  transactions.forEach((tx) => {
    if (tx.amount > 0) {
      spendingDays.add(tx.date)
    }
  })
  
  const noSpendDays = allDaysInMonth.size - spendingDays.size

  const dayOfWeekCounts: Record<string, number> = {}
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  transactions.forEach((tx) => {
    if (tx.amount > 0) {
      const dateObj = new Date(`${tx.date}T12:00:00Z`)
      const dayOfWeek = dayNames[dateObj.getUTCDay()]
      dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1
    }
  })
  
  const mostFrequentDay = Object.entries(dayOfWeekCounts).length > 0
    ? Object.entries(dayOfWeekCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0]
    : 'N/A'

  return { totalTransactions, noSpendDays, mostFrequentDay }
}

function calculateMerchants(transactions: BudgetTransaction[]): MerchantStat[] {
  // Exclude refunds (negative amounts) and sum by merchant
  const merchantTotals: Record<string, { total: number; count: number }> = {}
  
  transactions.forEach((tx) => {
    if (tx.amount > 0) {
      if (!merchantTotals[tx.merchant]) {
        merchantTotals[tx.merchant] = { total: 0, count: 0 }
      }
      merchantTotals[tx.merchant].total += tx.amount
      merchantTotals[tx.merchant].count += 1
    }
  })
  
  // Sort by total amount and take top 3
  return Object.entries(merchantTotals)
    .map(([merchant, { total, count }]) => ({
      merchant,
      totalAmount: total,
      count,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 3)
}

function calculateMostPopularMerchant(transactions: BudgetTransaction[]): MerchantStat | null {
  const merchantTotals: Record<string, { total: number; count: number }> = {}

  transactions.forEach((tx) => {
    if (tx.amount <= 0) return
    if (!merchantTotals[tx.merchant]) {
      merchantTotals[tx.merchant] = { total: 0, count: 0 }
    }
    merchantTotals[tx.merchant].total += tx.amount
    merchantTotals[tx.merchant].count += 1
  })

  const ranked = Object.entries(merchantTotals)
    .map(([merchant, { total, count }]) => ({
      merchant,
      totalAmount: total,
      count,
    }))
    .sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount)

  return ranked[0] ?? null
}

function calculateEnvelopeChanges(
  transactions: BudgetTransaction[],
  categories: PrototypeState['categories'],
): EnvelopeChange[] {
  // Sum spending by category (amount > 0 only)
  const categorySpending: Record<string, number> = {}
  
  transactions.forEach((tx) => {
    if (tx.amount > 0 && tx.categoryId) {
      categorySpending[tx.categoryId] = (categorySpending[tx.categoryId] || 0) + tx.amount
    }
  })
  
  // Create EnvelopeChange for each category that had spending
  const changes = Object.entries(categorySpending).map(([categoryId, amountSpent]) => {
    const category = categories.find((c) => c.id === categoryId)
    if (!category) return null
    
    const percentageOfBudget = category.monthlyTarget > 0 
      ? Math.round((amountSpent / category.monthlyTarget) * 100)
      : 0
    
    return {
      categoryId,
      categoryName: category.name,
      amountSpent,
      percentageOfBudget,
      group: category.group,
    }
  })
  
  // Filter out nulls and sort by amount spent (descending)
  return changes
    .filter((c) => c !== null)
    .sort((a, b) => (b?.amountSpent || 0) - (a?.amountSpent || 0)) as EnvelopeChange[]
}

function hasUncategorizedTransactions(transactions: BudgetTransaction[]): boolean {
  return transactions.some((tx) => tx.amount > 0 && tx.categoryId === null)
}

interface RecommendedAction {
  id: 'adjust-contributions' | 'move-money' | 'review-next-month' | 'return-to-budget'
  title: string
  description: string
  icon: string
  action: 'external' | 'phase' | 'exit'
}

function calculateRecommendations(
  facts: ReviewFacts,
  merchants: MerchantStat[],
  envelopes: EnvelopeChange[],
  hasNextReview: boolean,
): RecommendedAction[] {
  const recommendations: RecommendedAction[] = []

  // Check for high-spend envelopes (over 85% of budget)
  const highSpendEnvelopes = envelopes.filter((e) => e.percentageOfBudget >= 85)
  if (highSpendEnvelopes.length > 0) {
    recommendations.push({
      id: 'adjust-contributions',
      title: 'Review High-Spend Envelopes',
      description: `${highSpendEnvelopes.length} envelope${highSpendEnvelopes.length !== 1 ? 's' : ''} are close to or over their limits. Consider adjusting your contributions.`,
      icon: '📊',
      action: 'external',
    })
  }

  // Check for significant variation in spending patterns
  if (merchants.length > 0 && facts.totalTransactions > 20) {
    const topMerchantSpending = merchants[0]?.totalAmount || 0
    const avgTransaction = merchants.reduce((sum, m) => sum + m.totalAmount, 0) / merchants.length / 3
    if (topMerchantSpending > avgTransaction * 2) {
      recommendations.push({
        id: 'move-money',
        title: 'Rebalance Your Budget',
        description: 'Your spending patterns suggest you might benefit from moving money between envelopes.',
        icon: '💱',
        action: 'external',
      })
    }
  }

  // Always offer to return to current budget
  recommendations.push({
    id: 'return-to-budget',
    title: 'Return to Current Budget',
    description: 'Continue managing your finances for the current month.',
    icon: '📅',
    action: 'exit',
  })

  // Offer next month review if available
  if (hasNextReview) {
    recommendations.push({
      id: 'review-next-month',
      title: 'Review Next Month',
      description: 'You have another month ready for review. Start now or come back later.',
      icon: '📈',
      action: 'phase',
    })
  }

  return recommendations
}

/**
 * Phase 4: Late Transaction Handling
 * Detects if new categorized transactions have arrived for a completed review.
 * A review needs recalculation if the current transaction count exceeds the saved count.
 */
function hasNewTransactionsForReview(
  monthKey: string,
  currentTransactions: BudgetTransaction[],
  savedReview: MonthInReviewData,
): boolean {
  const monthTransactions = currentTransactions.filter((tx) => tx.date.startsWith(monthKey))
  const currentCategorizedCount = monthTransactions.filter(
    (tx) => tx.amount > 0 && tx.categoryId !== null,
  ).length

  // If current categorized transaction count exceeds saved total, new transactions arrived
  return currentCategorizedCount > (savedReview.totalTransactions || 0)
}

/**
 * Phase 4: Recalculate review metrics if new transactions detected.
 * Updates all facts, merchants, and envelopes while preserving completed status.
 * Returns updated review with new timestamp, or null if no recalculation needed.
 */
function recalculateReviewIfNeeded(
  monthKey: string,
  currentTransactions: BudgetTransaction[],
  categories: PrototypeState['categories'],
  savedReview: MonthInReviewData,
): MonthInReviewData | null {
  if (!hasNewTransactionsForReview(monthKey, currentTransactions, savedReview)) {
    return null // No new transactions, keep existing review
  }

  // New transactions detected: recalculate all metrics
  const monthTransactions = currentTransactions.filter((tx) => tx.date.startsWith(monthKey))
  const facts = calculateFacts(monthTransactions)
  const merchants = calculateMerchants(monthTransactions)
  const envelopes = calculateEnvelopeChanges(monthTransactions, categories)

  // Return updated review with new timestamp, preserving completed status
  return {
    ...savedReview,
    totalTransactions: facts.totalTransactions,
    noSpendDays: facts.noSpendDays,
    mostFrequentDay: facts.mostFrequentDay,
    topMerchants: merchants,
    envelopeChanges: envelopes,
    updatedAt: new Date().toISOString(), // Mark when recalculation happened
  }
}

export function MonthInReviewFlow({
  state,
  monthKey,
  onComplete,
  onExit,
  onNavigateView,
  onOpenMonthReview,
}: {
  state: PrototypeState
  monthKey: string
  onComplete: (next: PrototypeState, entry?: AuditEntry) => Promise<void>
  onExit: () => void
  onNavigateView?: (view: 'categories' | 'transactions') => void
  onOpenMonthReview?: (monthKey: string) => void
}) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [submitting, setSubmitting] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [storyGroupFilter, setStoryGroupFilter] = useState<StoryGroupFilter>('all')
  const [selectedStoryCategoryIds, setSelectedStoryCategoryIds] = useState<string[]>([])

  const monthTransactions = useMemo(
    () => state.transactions.filter((tx) => tx.date.startsWith(monthKey)),
    [state.transactions, monthKey],
  )
  const purchaseTransactions = useMemo(
    () => getPurchaseTransactions(monthTransactions),
    [monthTransactions],
  )

  const facts = useMemo(() => calculateFacts(purchaseTransactions), [purchaseTransactions])
  const merchants = useMemo(() => calculateMerchants(purchaseTransactions), [purchaseTransactions])
  const mostPopularMerchant = useMemo(
    () => calculateMostPopularMerchant(purchaseTransactions),
    [purchaseTransactions],
  )
  const envelopes = useMemo(
    () => calculateEnvelopeChanges(purchaseTransactions, state.categories),
    [purchaseTransactions, state.categories],
  )
  const totalSpent = useMemo(
    () => purchaseTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [purchaseTransactions],
  )
  const totalBudgeted = useMemo(
    () => state.categories.filter((category) => !category.archived).reduce((sum, category) => sum + category.monthlyTarget, 0),
    [state.categories],
  )
  const budgetDelta = totalBudgeted - totalSpent
  const balanceStories = useMemo(
    () => calculateBalanceStoryline(monthKey, purchaseTransactions, state.categories),
    [monthKey, purchaseTransactions, state.categories],
  )
  useEffect(() => {
    if (balanceStories.length === 0) {
      setSelectedStoryCategoryIds([])
      return
    }

    setSelectedStoryCategoryIds((previous) => {
      const valid = previous.filter((id) => balanceStories.some((story) => story.categoryId === id))
      if (valid.length > 0) return valid
      return balanceStories.map((story) => story.categoryId)
    })
  }, [balanceStories])

  const filteredBalanceStories = useMemo(() => {
    return balanceStories.filter((story) => {
      if (storyGroupFilter === 'needs' && story.group !== 'Needs') return false
      if (storyGroupFilter === 'wants' && story.group !== 'Wants') return false
      return selectedStoryCategoryIds.includes(story.categoryId)
    })
  }, [balanceStories, storyGroupFilter, selectedStoryCategoryIds])

  const visibleStoryCategories = useMemo(() => {
    return balanceStories.filter((story) => {
      if (storyGroupFilter === 'needs') return story.group === 'Needs'
      if (storyGroupFilter === 'wants') return story.group === 'Wants'
      return true
    })
  }, [balanceStories, storyGroupFilter])

  const allVisibleSelected =
    visibleStoryCategories.length > 0 &&
    visibleStoryCategories.every((story) => selectedStoryCategoryIds.includes(story.categoryId))

  function toggleStoryCategory(categoryId: string) {
    setSelectedStoryCategoryIds((previous) =>
      previous.includes(categoryId)
        ? previous.filter((id) => id !== categoryId)
        : [...previous, categoryId],
    )
  }

  function toggleVisibleCategories() {
    const visibleIds = visibleStoryCategories.map((story) => story.categoryId)
    setSelectedStoryCategoryIds((previous) => {
      if (allVisibleSelected) {
        return previous.filter((id) => !visibleIds.includes(id))
      }
      const merged = new Set(previous)
      visibleIds.forEach((id) => merged.add(id))
      return Array.from(merged)
    })
  }

  const balanceSummaryRows = useMemo(
    () =>
      filteredBalanceStories.map((story) => {
        const spent = story.points.reduce((sum, point) => sum + (point.amount ?? 0), 0)
        return {
          categoryId: story.categoryId,
          categoryName: story.categoryName,
          spent,
          startBalance: story.startBalance,
          newBalance: story.endBalance,
        }
      }),
    [filteredBalanceStories],
  )
  const balanceSummaryTotals = useMemo(() => {
    return balanceSummaryRows.reduce(
      (totals, row) => {
        totals.spent += row.spent
        totals.startBalance += row.startBalance
        totals.newBalance += row.newBalance
        return totals
      },
      { spent: 0, startBalance: 0, newBalance: 0 },
    )
  }, [balanceSummaryRows])
  const turningPoint = useMemo(
    () => calculateTurningPoint(filteredBalanceStories),
    [filteredBalanceStories],
  )
  const hasUncategorized = useMemo(
    () => hasUncategorizedTransactions(purchaseTransactions),
    [purchaseTransactions],
  )

  const existingReview = useMemo(
    () => state.monthInReviews.find((r) => r.monthKey === monthKey),
    [state.monthInReviews, monthKey],
  )

  const hasNextReview = useMemo(() => {
    const currentMonthIndex = state.months.findIndex((m) => m.key === monthKey)
    if (currentMonthIndex === -1) return false
    // Check if there's a next month that's closed and unreviewed
    for (let i = currentMonthIndex + 1; i < state.months.length; i++) {
      const month = state.months[i]
      if (month.status === 'closed' && !state.monthInReviews.find((r) => r.monthKey === month.key)) {
        return true
      }
    }
    return false
  }, [state.months, state.monthInReviews, monthKey])

  const recommendations = useMemo(
    () => calculateRecommendations(facts, merchants, envelopes, hasNextReview),
    [facts, merchants, envelopes, hasNextReview],
  )

  // Phase 4: Late Transaction Handling
  // When dashboard phase is entered, check if new transactions require recalculation
  useEffect(() => {
    if (phase !== 'dashboard' || !existingReview) return

    const recalculatedReview = recalculateReviewIfNeeded(
      monthKey,
      state.transactions,
      state.categories,
      existingReview,
    )

    if (!recalculatedReview) return // No new transactions, nothing to update

    // New transactions detected: update the review in state
    const updated = {
      ...state,
      monthInReviews: state.monthInReviews.map((r) =>
        r.monthKey === monthKey ? recalculatedReview : r,
      ),
    }

    onComplete(updated)
  }, [phase, monthKey, existingReview, state, onComplete])

  function handleStartReview() {
    // Block entry if uncategorized transactions exist
    if (hasUncategorized) {
      const uncatCount = purchaseTransactions.filter((tx) => tx.categoryId === null).length
      alert(
        `You have ${uncatCount} uncategorized transaction${uncatCount !== 1 ? 's' : ''}.\n\nPlease categorize them in Transaction Review before proceeding with this month review.\n\nClick OK to go to Transaction Review.`
      )
      onExit() // Exit month review and let parent handle nav to transaction review
      return
    }
    setPhase('facts')
  }

  async function handleCompleteReview() {
    // Mark as completed and save the review data
    setSubmitting(true)
    try {
      const reviewData: MonthInReviewData = {
        monthKey,
        completedAt: new Date().toISOString(),
        totalTransactions: facts.totalTransactions,
        noSpendDays: facts.noSpendDays,
        mostFrequentDay: facts.mostFrequentDay,
        topMerchants: merchants,
        envelopeChanges: envelopes,
      }

      const updated = existingReview
        ? {
            ...state,
            monthInReviews: state.monthInReviews.map((r) =>
              r.monthKey === monthKey ? { ...reviewData, updatedAt: new Date().toISOString() } : r,
            ),
          }
        : {
            ...state,
            monthInReviews: [...state.monthInReviews, reviewData],
          }

      await onComplete(updated)
      setPhase('complete')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRecommendationAction(action: RecommendedAction) {
    if (action.action === 'exit') {
      onExit()
    } else if (action.action === 'phase') {
      if (action.id === 'review-next-month') {
        // Find next unreviewed closed month and open it
        const nextMonth = state.months.find(
          (m) => m.status === 'closed' && !state.monthInReviews.find((r) => r.monthKey === m.key),
        )
        if (nextMonth) {
          if (onOpenMonthReview) {
            onOpenMonthReview(nextMonth.key)
            return
          }
          onExit()
        }
      }
    } else if (action.action === 'external') {
      if (action.id === 'adjust-contributions') {
        if (onNavigateView) {
          onNavigateView('categories')
          return
        }
        onExit()
        return
      }
      if (action.id === 'move-money') {
        if (onNavigateView) {
          onNavigateView('transactions')
          return
        }
        onExit()
      }
    }
  }

  if (phase === 'archive') {
    return (
      <main className="review-archive">
        <div className="review-archive-header">
          <button className="review-back-button" onClick={() => setPhase('intro')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Monthly Reviews</h1>
          <div style={{ width: '44px' }} />
        </div>
        <div className="review-archive-list">
          {state.monthInReviews.length === 0 ? (
            <p className="review-empty-state">No reviews yet. Start reviewing your months!</p>
          ) : (
            state.monthInReviews
              .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
              .map((review) => (
                <button
                  key={review.monthKey}
                  className="review-archive-item"
                  onClick={() => {
                    setPhase('dashboard')
                  }}
                >
                  <Calendar size={20} />
                  <div>
                    <strong>{monthLabel(review.monthKey)}</strong>
                    <small>
                      {review.totalTransactions} transactions •{' '}
                      {new Date(review.completedAt).toLocaleDateString()}
                    </small>
                  </div>
                  <ChevronDown size={20} />
                </button>
              ))
          )}
        </div>
      </main>
    )
  }

  if (phase === 'dashboard' && existingReview) {
    return (
      <main className="review-dashboard">
        <div className="review-dashboard-header">
          <button className="review-back-button" onClick={() => setPhase('archive')}>
            <ArrowLeft size={20} />
          </button>
          <h1>{monthLabel(monthKey)}</h1>
          <button className="review-close-button" onClick={() => setPhase('intro')}>
            <X size={20} />
          </button>
        </div>
        <div className="review-dashboard-content">
          <div className="review-stat">
            <div className="review-stat-value">{existingReview.totalTransactions}</div>
            <div className="review-stat-label">Transactions</div>
          </div>
          <div className="review-stat">
            <div className="review-stat-value">{existingReview.noSpendDays}</div>
            <div className="review-stat-label">No-spend days</div>
          </div>
          <div className="review-stat">
            <div className="review-stat-value">{existingReview.mostFrequentDay}</div>
            <div className="review-stat-label">Most frequent purchase day</div>
          </div>
          {existingReview.topMerchants && existingReview.topMerchants.length > 0 && (
            <div className="review-merchants-preview">
              <h3>Top Merchants</h3>
              {existingReview.topMerchants.map((m) => (
                <div key={m.merchant} className="review-merchant-preview">
                  <span>{m.merchant}</span>
                  <span>{money(m.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
          {existingReview.updatedAt && (
            <small className="review-updated-label">
              Updated {shortDate(existingReview.updatedAt)}
            </small>
          )}
        </div>
      </main>
    )
  }

  if (phase === 'complete') {
    return (
      <main className="review-success">
        <MoneyPlantMascot mood="celebrating" className="mood-mascot large" alt="Celebrating mascot" />
        <div className="review-success-icon">
          <Check size={48} />
        </div>
        <h1>Review Complete</h1>
        <p>{monthLabel(monthKey)} is now in your review archive.</p>
        <div className="review-success-actions">
          <button className="review-action-button primary" onClick={() => setPhase('archive')}>
            View Archive
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Return to Budget
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'recommendations') {
    return (
      <main className="review-page review-recommendations-page">
        <div className="review-page-header">
          <button className="review-back-button" onClick={() => setPhase('envelopes')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Recommended Actions</h1>
          <div style={{ width: '44px' }} />
        </div>
        <div className="review-recommendations-content">
          {recommendations.length === 0 ? (
            <p className="review-empty-state">No recommendations at this time</p>
          ) : (
            recommendations.map((rec) => (
              <button
                key={rec.id}
                className="review-recommendation-card"
                onClick={() => handleRecommendationAction(rec)}
              >
                <div className="review-recommendation-icon">{rec.icon}</div>
                <div className="review-recommendation-content">
                  <div className="review-recommendation-title">{rec.title}</div>
                  <div className="review-recommendation-description">{rec.description}</div>
                </div>
                <ArrowRight size={20} />
              </button>
            ))
          )}
        </div>
        <div className="review-page-actions">
          <button
            className="review-action-button primary"
            onClick={handleCompleteReview}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Finish Review'}
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'envelopes') {
    return (
      <main className="review-page review-envelopes-page">
        <div className="review-page-header">
          <button className="review-back-button" onClick={() => setPhase('merchantFrequency')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Envelope Highlights</h1>
          <div style={{ width: '44px' }} />
        </div>
        <p className="review-storyline">
          Here is the part of your story where each envelope either stayed chill or asked for a bit
          more than planned.
        </p>
        {balanceStories.length > 0 && (
          <>
            {turningPoint && (
              <article className="review-turning-point-card">
                <h4>The turning point came {shortDate(turningPoint.date)}.</h4>
                <p>
                  {turningPoint.categoryName} crossed below zero after a {money(turningPoint.amount)} charge.
                </p>
              </article>
            )}

            <section className="review-story-filters" aria-label="Line chart filters">
              <div className="review-story-filter-group">
                <button
                  type="button"
                  className={storyGroupFilter === 'all' ? 'active' : ''}
                  onClick={() => setStoryGroupFilter('all')}
                >
                  Needs + Wants
                </button>
                <button
                  type="button"
                  className={storyGroupFilter === 'needs' ? 'active' : ''}
                  onClick={() => setStoryGroupFilter('needs')}
                >
                  Needs only
                </button>
                <button
                  type="button"
                  className={storyGroupFilter === 'wants' ? 'active' : ''}
                  onClick={() => setStoryGroupFilter('wants')}
                >
                  Wants only
                </button>
              </div>

              <details className="review-story-category-filter">
                <summary>Filter categories ({selectedStoryCategoryIds.length} selected)</summary>
                <div className="review-story-category-actions">
                  <button type="button" onClick={toggleVisibleCategories}>
                    {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
                  </button>
                </div>
                <div className="review-story-category-grid">
                  {visibleStoryCategories.map((story) => {
                    const selected = selectedStoryCategoryIds.includes(story.categoryId)
                    return (
                      <label key={story.categoryId} className={selected ? 'selected' : ''}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleStoryCategory(story.categoryId)}
                        />
                        {story.categoryName}
                      </label>
                    )
                  })}
                </div>
              </details>
            </section>

            {filteredBalanceStories.length === 0 ? (
              <p className="review-empty-state">No categories selected for this view</p>
            ) : (
              <BalanceStorylinePrototype monthKey={monthKey} stories={filteredBalanceStories} />
            )}

            <section className="review-balance-summary-dropdown">
              <button
                type="button"
                className="review-balance-summary-toggle"
                onClick={() => setSummaryExpanded((prev) => !prev)}
                aria-expanded={summaryExpanded}
              >
                <div>
                  <h4>Category Balance Summary</h4>
                  <p>Tap to {summaryExpanded ? 'hide' : 'view'} a compact outcome table.</p>
                </div>
                <ChevronDown size={18} className={summaryExpanded ? 'open' : ''} />
              </button>
              {summaryExpanded && (
                <div className="review-balance-summary-content">
                  {balanceSummaryRows.map((row) => {
                    const positive = row.newBalance >= 0
                    return (
                      <article key={row.categoryId} className="review-balance-summary-row">
                        <div className="review-balance-summary-name">
                          <strong>{row.categoryName}</strong>
                        </div>
                        <div>
                          <small>Spent</small>
                          <strong>{money(row.spent)}</strong>
                        </div>
                        <div>
                          <small>Available before</small>
                          <strong>{money(row.startBalance)}</strong>
                        </div>
                        <div>
                          <small>Available after</small>
                          <strong className={positive ? 'up' : 'down'}>{money(row.newBalance)}</strong>
                        </div>
                      </article>
                    )
                  })}
                  <footer className="review-balance-summary-totals">
                    <div>
                      <small>Total spent</small>
                      <strong>{money(balanceSummaryTotals.spent)}</strong>
                    </div>
                    <div>
                      <small>Combined before</small>
                      <strong>{money(balanceSummaryTotals.startBalance)}</strong>
                    </div>
                    <div>
                      <small>Combined after</small>
                      <strong className={balanceSummaryTotals.newBalance >= 0 ? 'up' : 'down'}>
                        {money(balanceSummaryTotals.newBalance)}
                      </strong>
                    </div>
                  </footer>
                </div>
              )}
            </section>
          </>
        )}
        <div className="review-page-actions">
          <button
            className="review-action-button primary"
            onClick={() => setPhase('recommendations')}
          >
            Continue
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'merchants') {
    return (
      <main className="review-page review-merchants-page">
        <div className="review-page-header">
          <button className="review-back-button" onClick={() => setPhase('facts')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Biggest Merchant Moments</h1>
          <div style={{ width: '44px' }} />
        </div>
        <p className="review-storyline">
          Your top spend destinations this month. Think of this as your money&apos;s playlist by
          total dollars.
        </p>
        <div className="review-merchants-content">
          {merchants.length === 0 ? (
            <p className="review-empty-state">No transactions this month</p>
          ) : (
            merchants.map((merchant, idx) => (
              <div key={merchant.merchant} className="review-merchant-card">
                <div className="review-merchant-rank">#{idx + 1}</div>
                <div className="review-merchant-info">
                  <div className="review-merchant-name">{merchant.merchant}</div>
                  <small>{merchant.count} transaction{merchant.count !== 1 ? 's' : ''}</small>
                </div>
                <div className="review-merchant-amount">{money(merchant.totalAmount)}</div>
              </div>
            ))
          )}
        </div>
        <div className="review-page-actions">
          <button
            className="review-action-button primary"
            onClick={() => setPhase('merchantFrequency')}
          >
            Continue
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'merchantFrequency') {
    const fallback = merchants[0] ?? null
    const spotlight = mostPopularMerchant ?? fallback
    return (
      <main className="review-page review-merchants-page">
        <div className="review-page-header">
          <button className="review-back-button" onClick={() => setPhase('merchants')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Most Popular Merchant</h1>
          <div style={{ width: '44px' }} />
        </div>
        <p className="review-storyline">
          Your repeat cameo winner. This is where you tapped your card most often.
        </p>
        <div className="review-merchants-content">
          {!spotlight ? (
            <p className="review-empty-state">No transactions this month</p>
          ) : (
            <article className="review-spotlight-card">
              <small>Most frequent stop</small>
              <h2>{spotlight.merchant}</h2>
              <p>
                You visited <strong>{spotlight.count}</strong>{' '}
                {spotlight.count === 1 ? 'time' : 'times'} and spent{' '}
                <strong>{money(spotlight.totalAmount)}</strong> in total.
              </p>
            </article>
          )}
        </div>
        <div className="review-page-actions">
          <button className="review-action-button primary" onClick={() => setPhase('envelopes')}>
            Continue
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'facts') {
    return (
      <main className="review-page review-facts-page">
        <div className="review-page-header">
          <button className="review-back-button" onClick={() => setPhase('intro')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Your Month At A Glance</h1>
          <div style={{ width: '44px' }} />
        </div>
        <p className="review-storyline">
          A quick rewind before we dive deeper. Your spending rhythm had a vibe.
        </p>
        <div className="review-mascot-inline">
          <MoneyPlantMascot mood="hard-at-work" className="mood-mascot small" alt="Hard at work mascot" />
        </div>
        <div className="review-facts-content">
          <div className="review-fact-card">
            <div className="review-fact-number">{facts.totalTransactions}</div>
            <div className="review-fact-label">Total transactions</div>
          </div>
          <div className="review-fact-card">
            <div className="review-fact-number">{money(totalSpent)}</div>
            <div className="review-fact-label">Total spent</div>
            <small className={`review-fact-sub ${budgetDelta < 0 ? 'over' : 'under'}`}>
              {budgetDelta < 0
                ? `${money(Math.abs(budgetDelta))} over ${money(totalBudgeted)} budgeted`
                : `${money(budgetDelta)} under ${money(totalBudgeted)} budgeted`}
            </small>
          </div>
          <div className="review-fact-card">
            <div className="review-fact-number">{facts.noSpendDays}</div>
            <div className="review-fact-label">No-spend days</div>
          </div>
          <div className="review-fact-card">
            <div className="review-fact-number">{facts.mostFrequentDay}</div>
            <div className="review-fact-label">Most frequent purchase day</div>
          </div>
        </div>
        <div className="review-page-actions">
          <button
            className="review-action-button primary"
            onClick={() => setPhase('merchants')}
          >
            Continue
          </button>
          <button className="review-action-button secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </main>
    )
  }

  // Default: intro page
  return (
    <main className="review-page review-intro-page">
      <div className="review-page-header">
        <div style={{ width: '44px' }} />
        <h1>{monthLabel(monthKey).split(' ')[0]} Wrapped</h1>
        <button className="review-close-button" onClick={onExit}>
          <X size={20} />
        </button>
      </div>
      <div className="review-intro-content">
        <div className="review-intro-message">
          <MoneyPlantMascot mood="curious" className="mood-mascot medium" alt="Curious mascot" />
          <p>Press play on your month and relive where your money went.</p>
          <ArrowDown size={32} />
        </div>
      </div>
      <div className="review-page-actions">
        <button className="review-action-button primary" onClick={handleStartReview}>
          Start Review
        </button>
        <button className="review-action-button secondary" onClick={onExit}>
          Maybe Later
        </button>
      </div>
    </main>
  )
}
