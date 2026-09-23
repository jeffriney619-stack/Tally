import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  Film,
  Gamepad2,
  Heart,
  History,
  Home,
  Inbox,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PawPrint,
  PiggyBank,
  Plane,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Undo2,
  UserRound,
  UtensilsCrossed,
  X,
  Zap,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'
import { AdaptiveOnboarding } from './AdaptiveOnboarding'
import moneyPlantLogo from './assets/money-plant.png'
import exampleTransactionsRaw from './data/example_transactions.json'
import { MoneyPlantMascot } from './MoneyPlantMascot'
import { MonthInReviewFlow } from './MonthInReview'
import { createEmptyOnboardingAnswers } from './onboardingEngine'
import {
  type CleanSlateResetType,
  clearAuthToken,
  getAuthToken,
  getPrototypeState,
  getSmsConsent,
  login,
  runCleanSlate,
  savePrototypeState,
  saveSmsConsent,
  setAuthToken,
  signup,
} from './services/api'
import {
  generateRandomDateInMonth,
  pickRandomTransaction,
  recommendCategory,
  suggestionCache as suggestions,
  type TransactionTemplate,
} from './services/merchantCategorizer'
import { TransactionReviewFlow } from './TransactionReview'
import type {
  AdHocAdjustment,
  AssistantCategoryDraft,
  AssistantSessionState,
  AuditEntry,
  BudgetCategory,
  BudgetGroup,
  BudgetTransaction,
  ConnectedAccount,
  OnboardingAnswers,
  PrototypeState,
} from './types/budget'

type View =
  | 'dashboard'
  | 'categories'
  | 'transactions'
  | 'inbox'
  | 'assistant'
  | 'settings'
  | 'sms'
  | 'activity'
  | 'categoryDetail'
  | 'monthInReview'
type SettingsTab = 'profile' | 'accounts' | 'budget'
type AuthMode = 'signup' | 'login' | 'recovery'

// Cast example transactions from JSON
const exampleTransactions = exampleTransactionsRaw as TransactionTemplate[]

const navItems: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> = [
  { view: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'categories', label: 'Envelopes and Income', icon: Tag },
  { view: 'transactions', label: 'Transactions', icon: ReceiptText },
  { view: 'inbox', label: 'Uncategorized', icon: Inbox },
  { view: 'assistant', label: 'Transaction review', icon: Bot },
  { view: 'sms', label: 'SMS simulator', icon: MessageSquareText },
  { view: 'activity', label: 'Audit history', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings },
]

export function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function monthLabel(key: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}-01T12:00:00Z`))
}

export function shortDate(date: string) {
  try {
    // Handle both YYYY-MM-DD and ISO 8601 formats
    const dateToFormat = date.includes('T') ? date : `${date}T12:00:00Z`
    const dateObj = new Date(dateToFormat)
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date'
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(dateObj)
  } catch {
    return 'Invalid date'
  }
}

export function isReviewEligible(monthKey: string, currentDate: string): boolean {
  // A review becomes available 3 days after the month ends
  // monthKey is YYYY-MM, so last day of month is YYYY-MM-[last day]
  const [year, month] = monthKey.split('-')
  const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate()
  const monthEndDate = new Date(`${monthKey}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59Z`)
  const gracePeriodEnd = new Date(monthEndDate.getTime() + 3 * 24 * 60 * 60 * 1000)
  
  const current = new Date(currentDate.includes('T') ? currentDate : `${currentDate}T00:00:00Z`)
  
  return current >= gracePeriodEnd
}

function addMonthsToKey(monthKey: string, delta: number): string {
  const [yearRaw, monthRaw] = monthKey.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const next = new Date(Date.UTC(year, monthIndex + delta, 1))
  const nextYear = next.getUTCFullYear()
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function monthsBetween(fromMonthKey: string, toMonthKey: string): number {
  const [fromYearRaw, fromMonthRaw] = fromMonthKey.split('-')
  const [toYearRaw, toMonthRaw] = toMonthKey.split('-')
  const fromYear = Number(fromYearRaw)
  const fromMonth = Number(fromMonthRaw)
  const toYear = Number(toYearRaw)
  const toMonth = Number(toMonthRaw)
  return (toYear - fromYear) * 12 + (toMonth - fromMonth)
}

function categorySpend(state: PrototypeState, categoryId: string, month: string) {
  const category = state.categories.find((item) => item.id === categoryId)
  if (category && isSavingsCategory(category)) return 0
  return state.transactions
    .filter(
      (transaction) => transaction.categoryId === categoryId && transaction.date.startsWith(month),
    )
    .reduce(
      (total, transaction) => total + transaction.amount / Math.max(1, transaction.spreadMonths),
      0,
    )
}

function projectedFutureSpreadImpact(
  state: PrototypeState,
  categoryId: string,
  liveCurrentMonth: string,
  forecastMonth: string,
) {
  const ahead = Math.max(0, monthsBetween(liveCurrentMonth, forecastMonth))
  if (ahead === 0) return 0

  let total = 0
  for (const transaction of state.transactions) {
    if (transaction.categoryId !== categoryId) continue
    if (transaction.spreadMonths <= 1) continue

    const transactionMonth = transaction.date.slice(0, 7)
    const monthlyImpact = transaction.amount / Math.max(1, transaction.spreadMonths)

    for (let offset = 1; offset <= ahead; offset += 1) {
      const targetMonth = addMonthsToKey(liveCurrentMonth, offset)
      const monthOffsetFromCharge = monthsBetween(transactionMonth, targetMonth)
      if (monthOffsetFromCharge >= 0 && monthOffsetFromCharge < transaction.spreadMonths) {
        total += monthlyImpact
      }
    }
  }

  return total
}

function categoryAdjustments(state: PrototypeState, categoryId: string, month: string) {
  return state.adjustments.filter(
    (adjustment) => adjustment.categoryId === categoryId && adjustment.date.startsWith(month),
  )
}

function categoryAdjustmentTotal(state: PrototypeState, categoryId: string, month: string) {
  return categoryAdjustments(state, categoryId, month).reduce((sum, item) => sum + item.amount, 0)
}

function monthAdHocIncome(state: PrototypeState, month: string) {
  return state.adjustments
    .filter((item) => item.kind === 'add' && item.date.startsWith(month))
    .reduce((sum, item) => sum + item.amount, 0)
}

export function audit(action: string, detail: string): AuditEntry {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), action, detail }
}

function isRentMortgageCategory(category: BudgetCategory): boolean {
  const name = category.name.trim().toLowerCase()
  return name === 'rent/mortgage' || name === 'housing'
}

function isSavingsCategory(category: BudgetCategory): boolean {
  return category.group === 'Savings'
}

function getRentMortgagePayment(
  state: PrototypeState,
  categoryId: string,
  monthKey: string,
): { categoryId: string; monthKey: string; paidAt: string } | null {
  return (
    state.obligationPayments.find(
      (item) => item.categoryId === categoryId && item.monthKey === monthKey,
    ) ?? null
  )
}

function createBlankAccount(username: string): PrototypeState {
  const now = new Date()
  const monthKey = now.toISOString().slice(0, 7)
  return {
    profile: { name: '', nickname: '', username, email: '', phone: '', recoveryEmail: '' },
    introductionCompletedAt: undefined,
    onboardingComplete: false,
    monthlyIncome: 0,
    currentMonth: monthKey,
    lastLoginAt: now.toISOString(),
    months: [{ key: monthKey, status: 'open' }],
    categories: [],
    transactions: [],
    accounts: [],
    audit: [],
    sms: [],
    adjustments: [],
    vendorRules: [],
    monthInReviews: [],
    obligationPayments: [],
    debugCurrentDate: undefined,
  }
}

function normalizeArchivedCategories(state: PrototypeState): PrototypeState {
  if (!state.categories.some((category) => category.archived)) {
    return state
  }

  return {
    ...state,
    categories: state.categories.map((category) => ({ ...category, archived: false })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAssistantSession(input: unknown): AssistantSessionState | undefined {
  if (!isRecord(input)) return undefined

  const validStatuses: AssistantSessionState['status'][] = [
    'in_progress',
    'generating',
    'ready',
    'failed',
    'accepted',
    'abandoned',
  ]
  const defaultAnswers = createEmptyOnboardingAnswers()
  const rawAnswers = isRecord(input.answers) ? input.answers : null

  const hasAdaptiveShape =
    !!rawAnswers &&
    isRecord(rawAnswers.household) &&
    isRecord(rawAnswers.essentials) &&
    isRecord(rawAnswers.food) &&
    isRecord(rawAnswers.fun) &&
    isRecord(rawAnswers.transportation) &&
    isRecord(rawAnswers.homeLife) &&
    isRecord(rawAnswers.goals)

  const answers = hasAdaptiveShape ? (rawAnswers as OnboardingAnswers) : defaultAnswers

  const categoriesRaw = Array.isArray(input.categories) ? input.categories : []
  const categories: AssistantCategoryDraft[] = categoriesRaw.flatMap((item, index) => {
    if (!isRecord(item)) return []

    const fallbackName = typeof item.customName === 'string' ? item.customName.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : fallbackName
    if (!name) return []

    const rawGroup = typeof item.group === 'string' ? item.group.toLowerCase() : ''
    const group =
      rawGroup === 'needs' || rawGroup === 'wants' || rawGroup === 'savings' ? rawGroup : 'needs'

    const rawSource = typeof item.source === 'string' ? item.source : ''
    const source: AssistantCategoryDraft['source'] =
      rawSource === 'rule' || rawSource === 'ai_custom' || rawSource === 'user_added'
        ? rawSource
        : rawSource === 'custom'
          ? 'ai_custom'
          : 'rule'

    const answerKeys = Array.isArray(item.answerKeys)
      ? item.answerKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : []

    return [
      {
        id: typeof item.id === 'string' && item.id.length > 0 ? item.id : crypto.randomUUID(),
        name,
        group,
        source,
        reason: typeof item.reason === 'string' ? item.reason : null,
        answerKeys,
        selected: typeof item.selected === 'boolean' ? item.selected : true,
        displayOrder:
          typeof item.displayOrder === 'number' && Number.isFinite(item.displayOrder)
            ? item.displayOrder
            : index,
      },
    ]
  })

  const currentSectionRaw = input.currentSection
  const currentSection =
    typeof currentSectionRaw === 'number' && Number.isFinite(currentSectionRaw)
      ? Math.max(0, Math.min(6, Math.trunc(currentSectionRaw)))
      : 0

  const statusRaw = typeof input.status === 'string' ? input.status : ''
  const status = validStatuses.includes(statusRaw as AssistantSessionState['status'])
    ? (statusRaw as AssistantSessionState['status'])
    : 'in_progress'

  return {
    status,
    currentSection,
    promptVersion:
      typeof input.promptVersion === 'string' && input.promptVersion.trim().length > 0
        ? input.promptVersion
        : 'adaptive-onboarding-v1',
    modelName: typeof input.modelName === 'string' ? input.modelName : undefined,
    summary: typeof input.summary === 'string' ? input.summary : undefined,
    answers,
    categories,
    templateName: typeof input.templateName === 'string' ? input.templateName : undefined,
    updatedAt:
      typeof input.updatedAt === 'string' && input.updatedAt.trim().length > 0
        ? input.updatedAt
        : new Date().toISOString(),
  }
}

function App() {
  const AUTH_USERNAME_KEY = 'auth_username'
  const [state, setState] = useState<PrototypeState | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [authMessage, setAuthMessage] = useState('')
  const [view, setView] = useState<View>('dashboard')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'uncategorized' | 'refunds'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  // starts idle ('saved'), not 'loading' -- otherwise the login button is stuck disabled pre-login
  const [saveStatus, setSaveStatus] = useState<'loading' | 'saved' | 'error'>('saved')
  const [lockWarning, setLockWarning] = useState(false)
  const [smsInput, setSmsInput] = useState('')
  const [pendingCategorizations, setPendingCategorizations] = useState<Record<string, string>>({})
  const [refundAmount, setRefundAmount] = useState('')
  const [showActivityPopup, setShowActivityPopup] = useState(false)
  const [showOnboardingIntro, setShowOnboardingIntro] = useState(false)
  const [onboardingActive, setOnboardingActive] = useState(false)
  const [showReviewBlockedPopup, setShowReviewBlockedPopup] = useState(false)
  const [username, setUsername] = useState('')
  const [selectedReviewMonth, setSelectedReviewMonth] = useState<string | null>(null)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  function lockSession() {
    setAuthenticated(false)
    setState(null)
    setView('dashboard')
    setMobileNav(false)
    setSelectedId(null)
    setSelectedCategoryId(null)
    setCategoryFilter(null)
  }

  useEffect(() => {
    if (authenticated || state) return
    const token = getAuthToken()
    const savedUsername = localStorage.getItem(AUTH_USERNAME_KEY)
    if (!token || !savedUsername) return

    setSaveStatus('loading')
    setUsername(savedUsername)

    getPrototypeState(savedUsername)
      .then(async (saved) => {
        const initialRaw = saved
          ? {
              ...saved,
              introductionCompletedAt: saved.introductionCompletedAt,
              vendorRules: saved.vendorRules ?? [],
              monthInReviews: saved.monthInReviews ?? [],
              obligationPayments: saved.obligationPayments ?? [],
              assistantSession: normalizeAssistantSession(saved.assistantSession),
              debugCurrentDate: saved.debugCurrentDate,
            }
          : createBlankAccount(savedUsername)
        const initial = normalizeArchivedCategories(initialRaw)

        if (!saved) {
          await savePrototypeState(savedUsername, initial)
        }

        setState(initial)
        setAuthenticated(true)
        setSaveStatus('saved')
      })
      .catch(() => {
        clearAuthToken()
        localStorage.removeItem(AUTH_USERNAME_KEY)
        setUsername('')
        setSaveStatus('saved')
      })
  }, [authenticated, state])

  async function handleAuthSubmit(username: string, password: string, mode: AuthMode) {
    setSaveStatus('loading')
    setAuthMessage('')
    try {
      let authResponse
      if (mode === 'signup') {
        authResponse = await signup(username, password)
        setAuthMessage('Account created! Logging in...')
      } else if (mode === 'login') {
        authResponse = await login(username, password)
      } else {
        return
      }

      // Store the auth token
      setAuthToken(authResponse.token)
      localStorage.setItem(AUTH_USERNAME_KEY, authResponse.username)
      setUsername(authResponse.username)

      // Load or create the user's budget profile
      const saved = await getPrototypeState(authResponse.username)
      const initialRaw = saved
        ? {
            ...saved,
            introductionCompletedAt: saved.introductionCompletedAt,
            vendorRules: saved.vendorRules ?? [],
            monthInReviews: saved.monthInReviews ?? [],
            obligationPayments: saved.obligationPayments ?? [],
            assistantSession: normalizeAssistantSession(saved.assistantSession),
            debugCurrentDate: saved.debugCurrentDate,
          }
        : createBlankAccount(authResponse.username)
      const initial = normalizeArchivedCategories(initialRaw)
      if (!saved) await savePrototypeState(authResponse.username, initial)

      setState(initial)
      setAuthenticated(true)
      setSaveStatus('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed'
      setAuthMessage(message)
      setSaveStatus('error')
    }
  }

  // TODO: Implement logout button in dashboard
  // function handleLogout() {
  //   localStorage.removeItem('auth_token')
  //   setAuthenticated(false)
  //   setUsername('')
  //   setState(null)
  //   setAuthMode('signup')
  // }

  useEffect(() => {
    if (!authenticated) return
    let warningTimer = window.setTimeout(() => setLockWarning(true), 4 * 60 * 1000)
    let lockTimer = window.setTimeout(() => setAuthenticated(false), 5 * 60 * 1000)
    const reset = () => {
      setLockWarning(false)
      window.clearTimeout(warningTimer)
      window.clearTimeout(lockTimer)
      warningTimer = window.setTimeout(() => setLockWarning(true), 4 * 60 * 1000)
      lockTimer = window.setTimeout(() => setAuthenticated(false), 5 * 60 * 1000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((event) => {
      window.addEventListener(event, reset)
    })
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, reset)
      })
      window.clearTimeout(warningTimer)
      window.clearTimeout(lockTimer)
    }
  }, [authenticated])

  useEffect(() => {
    if (!authenticated || !state) return
    const currentState = state
    const monthTransactions = currentState.transactions.filter((item) =>
      item.date.startsWith(currentState.currentMonth),
    )
    const hasNews =
      monthTransactions.some(
        (item) => item.amount > 0 && item.date >= currentState.lastLoginAt.slice(0, 10),
      ) ||
      monthTransactions.some((item) => !item.categoryId) ||
      monthTransactions.some((item) => item.amount < 0)
    if (hasNews) {
      setShowActivityPopup(true)
      return
    }

    // Keep "since your last visit" anchored to real sessions, even when
    // there is nothing to show in the activity popup.
    void commit({ ...currentState, lastLoginAt: new Date().toISOString() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  useEffect(() => {
    if (!authenticated || !state) return
    setSelectedMonth(state.currentMonth)
  }, [authenticated, state?.currentMonth])

  useEffect(() => {
    if (!authenticated || !state) return
    if (!state.introductionCompletedAt && !state.onboardingComplete) {
      setShowOnboardingIntro(true)
    }
  }, [authenticated, state?.introductionCompletedAt, state?.onboardingComplete])

  function acknowledgeActivityPopup() {
    if (!state) return
    setShowActivityPopup(false)
    void commit({ ...state, lastLoginAt: new Date().toISOString() })
  }

  function completeOnboardingIntro() {
    if (!state) return
    setShowOnboardingIntro(false)
    void commit({ ...state, introductionCompletedAt: new Date().toISOString() })
  }

  async function commit(next: PrototypeState, entry?: AuditEntry) {
    const normalized = normalizeArchivedCategories(next)
    const withAudit = entry ? { ...normalized, audit: [entry, ...normalized.audit] } : normalized
    setState(withAudit)
    setSaveStatus('loading')
    try {
      const saved = await savePrototypeState(username, withAudit)
      setState(saved)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  // Same persistence as commit(), but reports success/failure so the Transaction
  // Review workflow can hold its place and show a recoverable error on failure
  // instead of silently advancing.
  async function commitReviewChange(next: PrototypeState, entry?: AuditEntry): Promise<boolean> {
    const normalized = normalizeArchivedCategories(next)
    const withAudit = entry ? { ...normalized, audit: [entry, ...normalized.audit] } : normalized
    setState(withAudit)
    setSaveStatus('loading')
    try {
      const saved = await savePrototypeState(username, withAudit)
      setState(saved)
      setSaveStatus('saved')
      return true
    } catch {
      setSaveStatus('error')
      return false
    }
  }

  if (!authenticated || !state) {
    return (
      <AuthScreen
        busy={saveStatus === 'loading'}
        message={authMessage}
        mode={authMode}
        onMode={setAuthMode}
        onAuthSubmit={handleAuthSubmit}
        onRecover={() =>
          setAuthMessage('Recovery instructions sent to your verified email (simulated).')
        }
      />
    )
  }

  if (showOnboardingIntro) {
    return <OnboardingIntroduction onComplete={completeOnboardingIntro} onSkip={completeOnboardingIntro} />
  }

  if (onboardingActive) {
    return (
      <OnboardingWizard
        onCommit={commit}
        onExit={() => setOnboardingActive(false)}
        onFinish={() => {
          commit(
            { ...state, onboardingComplete: true },
            audit('Onboarding finished', 'Budget setup completed.'),
          )
          setOnboardingActive(false)
        }}
        state={state}
        username={username}
      />
    )
  }

  const hasBuiltBudget = state.onboardingComplete && state.categories.length > 0
  const liveCurrentMonth = state.currentMonth
  const actualTimelineMonths = Array.from(
    new Set([
      ...state.months.map((month) => month.key).filter((monthKey) => monthKey <= liveCurrentMonth),
      liveCurrentMonth,
    ]),
  ).sort((a, b) => a.localeCompare(b))
  const futureMonths = Array.from({ length: 12 }, (_, index) => addMonthsToKey(liveCurrentMonth, index + 1))
  const timelineMonths = [...actualTimelineMonths, ...futureMonths]
  const activeMonth = selectedMonth ?? liveCurrentMonth
  const activeMonthIndex = Math.max(0, timelineMonths.indexOf(activeMonth))
  const clampedActiveMonth = timelineMonths[activeMonthIndex] ?? liveCurrentMonth
  const isForecastMonth = clampedActiveMonth > liveCurrentMonth
  const forecastMonthsAhead = Math.max(0, monthsBetween(liveCurrentMonth, clampedActiveMonth))

  const stateForMonth =
    clampedActiveMonth === liveCurrentMonth ? state : { ...state, currentMonth: clampedActiveMonth }

  const selectedTransaction = state.transactions.find(
    (transaction) => transaction.id === selectedId,
  )
  const currentTransactions = state.transactions.filter((transaction) =>
    transaction.date.startsWith(clampedActiveMonth),
  )
  const uncategorized = currentTransactions.filter((transaction) => !transaction.categoryId)

  function navigate(nextView: View) {
    if (isForecastMonth && nextView !== 'dashboard') {
      setFlashMessage('Forecast months are view-only on Overview. Return to the current month to edit.')
      return
    }
    if (!hasBuiltBudget && nextView !== 'dashboard' && nextView !== 'settings') {
      setFlashMessage('Create your first budget from Overview to unlock the rest of the workspace.')
      return
    }
    setView(nextView)
    setMobileNav(false)
    setCategoryFilter(null)
  }

  function openMonthInReview(monthKey: string) {
    setSelectedReviewMonth(monthKey)
    setView('monthInReview')
  }

  function openCategoryDetail(categoryId: string) {
    setSelectedCategoryId(categoryId)
    setView('categoryDetail')
    setMobileNav(false)
  }

  function viewCategoryTransactions(categoryId: string) {
    setCategoryFilter(categoryId)
    setView('transactions')
    setMobileNav(false)
  }

  function moveMonth(direction: number) {
    const next = timelineMonths[activeMonthIndex + direction]
    if (!next) return
    setSelectedMonth(next)
    if (next > liveCurrentMonth) {
      setView('dashboard')
      setCategoryFilter(null)
      setSelectedCategoryId(null)
      setSelectedId(null)
    }
  }

  function categorize(transactionId: string, categoryId: string, source = 'Manual selection') {
    const loadedState = state
    if (!loadedState) return
    const transaction = loadedState.transactions.find((item) => item.id === transactionId)
    const category = loadedState.categories.find((item) => item.id === categoryId)
    if (!transaction || !category) return
    if (isSavingsCategory(category)) {
      setFlashMessage(
        'Savings envelopes are auto-funded each month and cannot receive card charges. Choose a Needs or Wants envelope.',
      )
      return
    }
    const next = {
      ...loadedState,
      transactions: loadedState.transactions.map((item) =>
        item.id === transactionId ? { ...item, categoryId, categorizationSource: source } : item,
      ),
    }
    commit(
      next,
      audit(
        'Transaction categorized',
        `${transaction.merchant} assigned to ${category.name} via ${source}.`,
      ),
    )
    // Clear pending categorization after approval
    setPendingCategorizations((prev) => {
      const next = { ...prev }
      delete next[transactionId]
      return next
    })
  }

  function setPendingCategory(transactionId: string, categoryId: string) {
    setPendingCategorizations((prev) => ({
      ...prev,
      [transactionId]: categoryId,
    }))
  }

  function approveCategorization(transactionId: string, source = 'Manual selection') {
    const categoryId = pendingCategorizations[transactionId]
    if (categoryId) {
      categorize(transactionId, categoryId, source)
    }
  }

  function clearPendingCategory(transactionId: string) {
    setPendingCategorizations((prev) => {
      const next = { ...prev }
      delete next[transactionId]
      return next
    })
  }

  function toggleDateSimulation() {
    const loadedState = state
    if (!loadedState) return
    const nextState = { ...loadedState }
    if (nextState.debugCurrentDate === '2026-10-05') {
      delete nextState.debugCurrentDate
    } else {
      nextState.debugCurrentDate = '2026-10-05'
    }
    commit(nextState)
  }

  function setRentMortgagePaid(categoryId: string, paid: boolean) {
    const loadedState = state
    if (!loadedState) return
    const category = loadedState.categories.find((item) => item.id === categoryId)
    if (!category || !isRentMortgageCategory(category)) return

    const existing = getRentMortgagePayment(loadedState, categoryId, loadedState.currentMonth)
    if (paid && existing) return
    if (!paid && !existing) return

    const nextPayments = paid
      ? [
          ...loadedState.obligationPayments,
          { categoryId, monthKey: loadedState.currentMonth, paidAt: new Date().toISOString() },
        ]
      : loadedState.obligationPayments.filter(
          (item) => !(item.categoryId === categoryId && item.monthKey === loadedState.currentMonth),
        )

    commit(
      { ...loadedState, obligationPayments: nextPayments },
      audit(
        paid ? 'Rent/Mortgage marked paid' : 'Rent/Mortgage marked not paid',
        `${category.name} in ${monthLabel(loadedState.currentMonth)} is now ${paid ? 'Paid' : 'Not Paid'}.`,
      ),
    )
  }

  function addManualTransaction(input: {
    name: string
    amount: number
    categoryId: string
    vendor?: string
    monthKey: string
  }) {
    const loadedState = state
    if (!loadedState || !loadedState.accounts || loadedState.accounts.length === 0) return
    const category = loadedState.categories.find((item) => item.id === input.categoryId)
    if (!category || isSavingsCategory(category)) {
      setFlashMessage('Pick a Needs or Wants category for manual transactions.')
      return
    }

    const now = new Date()
    const currentMonthKey = now.toISOString().slice(0, 7)
    const day = input.monthKey === currentMonthKey ? String(now.getUTCDate()).padStart(2, '0') : '15'
    const date = `${input.monthKey}-${day}`
    const vendor = input.vendor?.trim() ?? ''
    const name = input.name.trim()

    const transaction: BudgetTransaction = {
      id: crypto.randomUUID(),
      date,
      merchant: vendor || name,
      rawDescription: name.toUpperCase(),
      amount: input.amount,
      categoryId: input.categoryId,
      accountId: loadedState.accounts[0].id,
      status: 'posted',
      source: 'manual',
      notes: vendor ? `Manual entry: ${name}` : '',
      spreadMonths: 1,
      categorizationSource: 'Manual entry',
    }

    commit(
      { ...loadedState, transactions: [transaction, ...loadedState.transactions] },
      audit('Manual transaction added', `${transaction.merchant} ${money(transaction.amount)} added.`),
    )
  }

  return (
    <div className={`product-shell ${isForecastMonth ? 'forecast-mode' : ''}`}>
      <aside className={`product-sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="product-brand">
          <span className="logo-image-wrap">
            <img alt="Tally logo" className="brand-logo" src={moneyPlantLogo} />
          </span>
          <div>
            <strong>Tally</strong>
            <small>Mindful money</small>
          </div>
        </div>
        <nav className="product-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            const count = item.view === 'inbox' ? uncategorized.length : 0
            const lockedByBudget = !hasBuiltBudget && item.view !== 'dashboard' && item.view !== 'settings'
            return (
              <button
                className={view === item.view ? 'active' : ''}
                disabled={(isForecastMonth && item.view !== 'dashboard') || lockedByBudget}
                key={item.view}
                onClick={() => navigate(item.view)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {count > 0 && <b>{count}</b>}
              </button>
            )
          })}
        </nav>
        <div className="connection-status">
          <span />
          <div>
            <strong>Bank sync simulated</strong>
            <small>Last checked 2 min ago</small>
          </div>
        </div>
        <button
          className="profile-chip"
          onClick={() => {
            setSettingsTab('profile')
            navigate('settings')
          }}
          type="button"
        >
          <span>
            {state.profile.name
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </span>
          <div>
            <strong>{state.profile.name}</strong>
            <small>
              {saveStatus === 'loading'
                ? 'Saving...'
                : saveStatus === 'error'
                  ? 'Offline changes'
                  : 'All changes saved'}
            </small>
          </div>
          <ChevronRight size={16} />
        </button>
      </aside>

      <div className="product-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav((isOpen) => !isOpen)}
            title="Open navigation"
            type="button"
          >
            <Menu size={20} />
          </button>
          <div className={`month-control ${isForecastMonth ? 'forecast' : ''}`}>
            <button
              disabled={activeMonthIndex <= 0}
              onClick={() => moveMonth(-1)}
              title="Previous month"
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <strong>
                {monthLabel(clampedActiveMonth)}
                {isForecastMonth && <span className="forecast-pill">Forecast</span>}
              </strong>
              <small>
                {isForecastMonth
                  ? `${forecastMonthsAhead} month${forecastMonthsAhead === 1 ? '' : 's'} ahead`
                  : state.months.find((month) => month.key === clampedActiveMonth)?.status ===
                      'closed'
                    ? 'Closed month'
                    : 'Open month'}
              </small>
            </div>
            <button
              disabled={activeMonthIndex >= timelineMonths.length - 1}
              onClick={() => moveMonth(1)}
              title="Next month"
              type="button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              disabled={isForecastMonth || !hasBuiltBudget}
              onClick={() => navigate('inbox')}
              title="Uncategorized inbox"
              type="button"
            >
              <Inbox size={19} />
              {uncategorized.length > 0 && <b>{uncategorized.length}</b>}
            </button>
          </div>
        </header>

        {lockWarning && (
          <div className="lock-warning">
            <LockKeyhole size={16} /> Session locks in one minute due to inactivity.
            <button onClick={() => setLockWarning(false)} type="button">
              Stay signed in
            </button>
          </div>
        )}

        <main className="workspace">
          {flashMessage && (
            <div className="flash-banner">
              <span>{flashMessage}</span>
              <button onClick={() => setFlashMessage(null)} type="button" title="Dismiss message">
                <X size={16} />
              </button>
            </div>
          )}
          {view === 'dashboard' && (
            <Dashboard
              state={stateForMonth}
              uncategorized={uncategorized}
              liveCurrentMonth={liveCurrentMonth}
              isForecastMonth={isForecastMonth}
              forecastMonthsAhead={forecastMonthsAhead}
              onGetStarted={() => setOnboardingActive(true)}
              onNavigate={navigate}
              onSelect={setSelectedId}
              onSelectCategory={openCategoryDetail}
              onSetRentMortgagePaid={setRentMortgagePaid}
              onToggleDateSimulation={toggleDateSimulation}
              onOpenReview={openMonthInReview}
              onShowReviewBlocked={() => setShowReviewBlockedPopup(true)}
            />
          )}
          {view === 'categories' && (
            <CategoriesView
              state={stateForMonth}
              onCommit={commit}
              onOpenSettings={() => {
                setSettingsTab('profile')
                navigate('settings')
              }}
            />
          )}
          {view === 'categoryDetail' && selectedCategoryId && (
            <CategoryDetailView
              categoryId={selectedCategoryId}
              onBack={() => navigate('dashboard')}
              onCommit={commit}
              onSelect={setSelectedId}
              onViewAllTransactions={() => viewCategoryTransactions(selectedCategoryId)}
              state={stateForMonth}
            />
          )}
          {view === 'transactions' && (
            <Transactions
              state={stateForMonth}
              search={search}
              filter={filter}
              categoryFilter={categoryFilter}
              onFilter={setFilter}
              onSearch={setSearch}
              onSelect={setSelectedId}
              onAddManualTransaction={addManualTransaction}
              onSimulate={() => {
                if (isForecastMonth) return
                simulateCharge(stateForMonth, commit)
              }}
              onClearCategoryFilter={() => setCategoryFilter(null)}
            />
          )}
          {view === 'inbox' && (
            <InboxView
              state={stateForMonth}
              transactions={uncategorized}
              onSetPendingCategory={setPendingCategory}
              onApproveCategorization={approveCategorization}
              onClearPendingCategory={clearPendingCategory}
              pendingCategorizations={pendingCategorizations}
              onReview={() => setView('assistant')}
              onSelect={setSelectedId}
            />
          )}
          {view === 'assistant' && (
            <TransactionReviewFlow
              state={stateForMonth}
              transactions={uncategorized}
              onCommit={commitReviewChange}
              onExit={() => navigate('dashboard')}
            />
          )}
          {view === 'monthInReview' && selectedReviewMonth && (
            <MonthInReviewFlow
              state={state}
              monthKey={selectedReviewMonth}
              onComplete={commit}
              onNavigateView={(nextView) => {
                navigate(nextView)
                setSelectedReviewMonth(null)
              }}
              onOpenMonthReview={(nextMonthKey) => {
                openMonthInReview(nextMonthKey)
              }}
              onExit={() => {
                navigate('dashboard')
                setSelectedReviewMonth(null)
              }}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              state={state}
              tab={settingsTab}
              onTab={setSettingsTab}
              onCommit={commit}
              onLogout={lockSession}
              username={username}
              onReplaceState={(next) => {
                setState(next)
                setSaveStatus('saved')
              }}
              onGoOverview={() => navigate('dashboard')}
              onSetFlashMessage={setFlashMessage}
            />
          )}
          {view === 'sms' && (
            <SmsSimulator
              state={state}
              input={smsInput}
              onInput={setSmsInput}
              onSend={() => sendSms(state, smsInput, setSmsInput, commit)}
            />
          )}
          {view === 'activity' && <ActivityView state={state} />}
        </main>
      </div>

      {selectedTransaction && (
        <TransactionDrawer
          state={stateForMonth}
          transaction={selectedTransaction}
          refundAmount={refundAmount}
          onRefundAmount={setRefundAmount}
          onClose={() => {
            setSelectedId(null)
            setRefundAmount('')
          }}
          onCommit={commit}
          onSetPendingCategory={setPendingCategory}
          onApproveCategorization={approveCategorization}
          onClearPendingCategory={clearPendingCategory}
          pendingCategorizations={pendingCategorizations}
        />
      )}

      {showActivityPopup && (
        <ActivityPopup
          onClose={acknowledgeActivityPopup}
          onReviewUncategorized={() => {
            acknowledgeActivityPopup()
            setView('inbox')
          }}
          onViewRefunds={() => {
            acknowledgeActivityPopup()
            setCategoryFilter(null)
            setFilter('refunds')
            setView('transactions')
          }}
          state={stateForMonth}
        />
      )}
      {showReviewBlockedPopup && (
        <ReviewBlockedPopup
          uncategorizedCount={uncategorized.length}
          onClose={() => setShowReviewBlockedPopup(false)}
          onReviewTransactions={() => {
            setShowReviewBlockedPopup(false)
            setView('inbox')
          }}
        />
      )}
    </div>
  )
}

function AuthScreen({
  mode,
  message,
  busy,
  onMode,
  onRecover,
  onAuthSubmit,
}: {
  mode: AuthMode
  message: string
  busy: boolean
  onMode: (mode: AuthMode) => void
  onRecover: () => void
  onAuthSubmit?: (username: string, password: string, mode: AuthMode) => void
}) {
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirmInput, setPasswordConfirmInput] = useState('')

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'signup' || mode === 'login') {
      if (!usernameInput.trim() || !passwordInput.trim()) {
        return
      }
      if (mode === 'signup' && passwordInput !== passwordConfirmInput) {
        return
      }
      onAuthSubmit?.(usernameInput, passwordInput, mode)
    } else {
      onRecover()
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="auth-brand">
          <img alt="Tally logo" className="brand-logo auth-logo" src={moneyPlantLogo} /> Tally
        </div>
        <div>
          <p className="eyebrow light">Connected envelope budgeting</p>
          <h1>Stay close to every purchase. Not every spreadsheet cell.</h1>
          <p>
            AI handles the repetition while you keep the awareness that makes a budget meaningful.
          </p>
        </div>
        <div className="auth-promise">
          <ShieldCheck size={20} />
          <span>This prototype never asks for or stores bank credentials.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={handleFormSubmit}>
          {mode === 'signup' && (
            <>
              <p className="eyebrow">Create account</p>
              <h2>Set up your Tally account</h2>
              <label>
                Username (3-30 characters)
                <input
                  autoComplete="username"
                  onChange={(event) => setUsernameInput(event.target.value)}
                  value={usernameInput}
                  disabled={busy}
                  minLength={3}
                  maxLength={30}
                  required
                />
              </label>
              <label>
                Password (at least 6 characters)
                <input
                  type="password"
                  autoComplete="new-password"
                  onChange={(event) => setPasswordInput(event.target.value)}
                  value={passwordInput}
                  disabled={busy}
                  minLength={6}
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  onChange={(event) => setPasswordConfirmInput(event.target.value)}
                  value={passwordConfirmInput}
                  disabled={busy}
                  minLength={6}
                  required
                />
              </label>
              <button
                className="primary-action"
                disabled={busy || passwordInput !== passwordConfirmInput}
                type="submit"
              >
                <LockKeyhole size={17} /> {busy ? 'Creating account...' : 'Create account'}
              </button>
              <button
                className="text-button"
                onClick={() => onMode('login')}
                type="button"
                disabled={busy}
              >
                Already have an account? Sign in
              </button>
            </>
          )}
          {mode === 'login' && (
            <>
              <p className="eyebrow">Welcome back</p>
              <h2>Continue to your plan</h2>
              <label>
                Username
                <input
                  autoComplete="username"
                  onChange={(event) => setUsernameInput(event.target.value)}
                  value={usernameInput}
                  disabled={busy}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  onChange={(event) => setPasswordInput(event.target.value)}
                  value={passwordInput}
                  disabled={busy}
                  required
                />
              </label>
              <button className="primary-action" disabled={busy} type="submit">
                <LockKeyhole size={17} /> {busy ? 'Signing in...' : 'Sign in'}
              </button>
              <button
                className="text-button"
                onClick={() => onMode('recovery')}
                type="button"
                disabled={busy}
              >
                Forgot username or password?
              </button>
              <button
                className="text-button"
                onClick={() => onMode('signup')}
                type="button"
                disabled={busy}
              >
                Don't have an account? Sign up
              </button>
            </>
          )}
          {mode === 'recovery' && (
            <>
              <p className="eyebrow">Account recovery</p>
              <h2>Recover your access</h2>
              <label>
                Verified recovery email
                <input defaultValue="jordan.backup@example.com" type="email" />
              </label>
              <button className="primary-action" type="submit">
                Send recovery link
              </button>
              <button className="text-button" onClick={() => onMode('login')} type="button">
                <ArrowLeft size={15} /> Back to sign in
              </button>
            </>
          )}
          {message && <p className="form-message">{message}</p>}
          <div className="legal-links" aria-label="Legal">
            <a href="/privacy-policy.html" rel="noopener noreferrer" target="_blank">
              Privacy Policy
            </a>
            <span aria-hidden="true">|</span>
            <a href="/terms-and-conditions.html" rel="noopener noreferrer" target="_blank">
              Terms &amp; Conditions
            </a>
          </div>
        </form>
      </section>
    </main>
  )
}

function ReviewBlockedPopup({
  uncategorizedCount,
  onClose,
  onReviewTransactions,
}: {
  uncategorizedCount: number
  onClose: () => void
  onReviewTransactions: () => void
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-card activity-popup">
        <h2>Finish reviewing your transactions first</h2>
        <p>
          {uncategorizedCount} {uncategorizedCount === 1 ? 'purchase needs' : 'purchases need'} a category. Categorize them before starting your Month in Review so your results are accurate.
        </p>
        <button className="activity-popup-action" onClick={onReviewTransactions} type="button">
          <Inbox size={18} />
          <span>
            <strong>Review Transactions</strong>
            <small>Categorize your purchases</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <div className="modal-actions">
          <button className="outline-action full" onClick={onClose} type="button">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

function ActivityPopup({
  state,
  onClose,
  onReviewUncategorized,
  onViewRefunds,
}: {
  state: PrototypeState
  onClose: () => void
  onReviewUncategorized: () => void
  onViewRefunds: () => void
}) {
  const transactions = state.transactions.filter((item) => item.date.startsWith(state.currentMonth))
  const newCharges = transactions.filter(
    (item) => item.amount > 0 && item.date >= state.lastLoginAt.slice(0, 10),
  )
  const uncategorized = transactions.filter((item) => !item.categoryId)
  const refunds = transactions.filter((item) => item.amount < 0)
  return (
    <div className="modal-overlay">
      <div className="modal-card activity-popup">
        <h2>Welcome back, {state.profile.name.split(' ')[0]}.</h2>
        <p>
          You've had {newCharges.length} new {newCharges.length === 1 ? 'charge' : 'charges'} since
          your last visit.
        </p>
        {uncategorized.length > 0 && (
          <button className="activity-popup-action" onClick={onReviewUncategorized} type="button">
            <Inbox size={18} />
            <span>
              <strong>
                {uncategorized.length}{' '}
                {uncategorized.length === 1 ? 'purchase needs' : 'purchases need'} a category
              </strong>
              <small>Review them in the inbox</small>
            </span>
            <ArrowRight size={16} />
          </button>
        )}
        {refunds.length > 0 && (
          <button className="activity-popup-action" onClick={onViewRefunds} type="button">
            <Undo2 size={18} />
            <span>
              <strong>
                {refunds.length} {refunds.length === 1 ? 'refund' : 'refunds'} received
              </strong>
              <small>View in transactions</small>
            </span>
            <ArrowRight size={16} />
          </button>
        )}
        <div className="modal-actions">
          <button className="outline-action full" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  )
}

function SemiGauge({
  percent,
  markerPercent,
  segments,
  size = 220,
  strokeWidth = 16,
}: {
  percent: number
  markerPercent?: number
  segments?: Array<{ percent: number; className: 'needs' | 'wants' | 'savings'; title: string }>
  size?: number
  strokeWidth?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - strokeWidth
  const point = (pct: number, radius: number) => {
    const theta = (180 - Math.max(0, Math.min(100, pct)) * 1.8) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(theta), y: cy - radius * Math.sin(theta) }
  }
  const start = point(0, r)
  const end = point(100, r)
  const track = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`
  const over = percent > 100
  const clamped = Math.max(0, Math.min(100, percent))
  const marker = markerPercent !== undefined ? point(markerPercent, r) : null
  const hasSegments = Boolean(segments && segments.length > 0)
  let cumulative = 0
  return (
    <svg className="gauge-svg" viewBox={`0 0 ${size} ${size / 2 + 18}`}>
      <defs>
        <linearGradient id="gaugeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="var(--forest)" />
          <stop offset="100%" stopColor="var(--gold)" />
        </linearGradient>
      </defs>
      <path
        className="gauge-track"
        d={track}
        fill="none"
        pathLength={100}
        style={{ strokeWidth }}
      />
      {hasSegments
        ? segments!.map((segment, index) => {
            const width = Math.max(0, Math.min(100 - cumulative, segment.percent))
            const path = (
              <path
                className={`gauge-segment ${segment.className}`}
                d={track}
                fill="none"
                key={`${segment.className}-${index}`}
                pathLength={100}
                strokeDasharray={`${width} 100`}
                strokeDashoffset={-cumulative}
                style={{ strokeWidth }}
              >
                <title>{segment.title}</title>
              </path>
            )
            cumulative += width
            return path
          })
        : (
            <path
              className={`gauge-fill ${over ? 'over' : ''}`}
              d={track}
              fill="none"
              pathLength={100}
              strokeDasharray={`${clamped} 100`}
              style={{ strokeWidth }}
            />
          )}
      {marker && (
        <circle className="gauge-marker" cx={marker.x} cy={marker.y} r={Math.max(3, size / 44)}>
          <title>Total budgeted</title>
        </circle>
      )}
    </svg>
  )
}

type AllocationSplit = { needs: number; wants: number; savings: number }

function rebalanceSplit(
  current: AllocationSplit,
  key: keyof AllocationSplit,
  rawValue: number,
): AllocationSplit {
  const value = Math.max(0, Math.min(100, Math.round(rawValue)))
  const others = (['needs', 'wants', 'savings'] as const).filter((item) => item !== key)
  const remaining = 100 - value
  const otherSum = current[others[0]] + current[others[1]]
  const first =
    otherSum > 0
      ? Math.round((current[others[0]] / otherSum) * remaining)
      : Math.round(remaining / 2)
  return { ...current, [key]: value, [others[0]]: first, [others[1]]: remaining - first }
}

function AllocationSlider({
  compact,
  onChange,
  value,
}: {
  compact?: boolean
  onChange: (next: AllocationSplit) => void
  value: AllocationSplit
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'h1' | 'h2' | null>(null)
  const boundary1 = value.needs
  const boundary2 = value.needs + value.wants

  useEffect(() => {
    if (!dragging) return
    function handleMove(event: PointerEvent) {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const pct = ((event.clientX - rect.left) / rect.width) * 100
      if (dragging === 'h1') {
        const nextNeeds = Math.max(0, Math.min(Math.round(pct), boundary2 - 1))
        onChange({ needs: nextNeeds, wants: boundary2 - nextNeeds, savings: value.savings })
      } else {
        const nextBoundary2 = Math.max(boundary1 + 1, Math.min(Math.round(pct), 100))
        onChange({
          needs: value.needs,
          wants: nextBoundary2 - boundary1,
          savings: 100 - nextBoundary2,
        })
      }
    }
    function handleUp() {
      setDragging(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging, boundary1, boundary2, value, onChange])

  return (
    <div className={`allocation-slider ${compact ? 'compact' : ''}`}>
      <div className="allocation-slider-track" ref={trackRef}>
        <span className="allocation-segment needs" style={{ width: `${value.needs}%` }} />
        <span className="allocation-segment wants" style={{ width: `${value.wants}%` }} />
        <span className="allocation-segment savings" style={{ width: `${value.savings}%` }} />
        <button
          aria-label="Adjust Needs / Wants split"
          className="allocation-handle"
          onPointerDown={(event) => {
            event.preventDefault()
            setDragging('h1')
          }}
          style={{ left: `${boundary1}%` }}
          type="button"
        />
        <button
          aria-label="Adjust Wants / Savings split"
          className="allocation-handle"
          onPointerDown={(event) => {
            event.preventDefault()
            setDragging('h2')
          }}
          style={{ left: `${boundary2}%` }}
          type="button"
        />
      </div>
      <div className="allocation-slider-legend">
        {(['needs', 'wants', 'savings'] as const).map((key) => (
          <label className={key} key={key}>
            <i /> {key === 'needs' ? 'Needs' : key === 'wants' ? 'Wants' : 'Savings'}
            <input
              max={100}
              min={0}
              onChange={(event) => onChange(rebalanceSplit(value, key, Number(event.target.value)))}
              type="number"
              value={value[key]}
            />
            %
          </label>
        ))}
      </div>
    </div>
  )
}

function GroupDial({
  allocated,
  group,
  target,
}: {
  allocated: number
  group: BudgetGroup
  target: number
}) {
  const pct = target > 0 ? (allocated / target) * 100 : 0
  return (
    <div className={`mini-gauge-card ${group.toLowerCase()}`}>
      <span className="mini-gauge-label">{group}</span>
      <div className="mini-gauge-center">
        <SemiGauge percent={pct} size={128} strokeWidth={11} />
        <div className="mini-gauge-readout">
          <strong>{Math.round(pct)}%</strong>
          <span>
            {money(allocated)} of {money(target)}
          </span>
        </div>
      </div>
    </div>
  )
}

function TotalTracker({ allocated, income }: { allocated: number; income: number }) {
  const pct = income > 0 ? (allocated / income) * 100 : 0
  const over = allocated > income
  return (
    <div className="tracker-card">
      <span>Total allocated</span>
      <strong>
        {money(allocated)} <small>of {money(income)}</small>
      </strong>
      <div className="tracker-bar-track">
        <span
          className={`tracker-bar-fill ${over ? 'over' : ''}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <small>
        {over
          ? `${money(allocated - income)} over income`
          : `${money(income - allocated)} remaining`}
      </small>
    </div>
  )
}

function SproutMascot() {
  return <MoneyPlantMascot mood="excited" className="sprout-mascot" alt="Tally money plant mascot" />
}

function OnboardingEmptyState({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="onboarding-empty">
      <SproutMascot />
      <h1>Let's grow your first budget.</h1>
      <p>
        You don't have any envelopes yet. Answer a few quick questions and we'll help you build a
        budget that fits your life.
      </p>
      <button className="primary-action large" onClick={onGetStarted} type="button">
        <Sparkles size={18} /> Get started
      </button>
    </div>
  )
}

function Dashboard({
  state,
  uncategorized,
  liveCurrentMonth,
  isForecastMonth,
  forecastMonthsAhead,
  onNavigate,
  onSelect,
  onSelectCategory,
  onSetRentMortgagePaid,
  onToggleDateSimulation,
  onGetStarted,
  onOpenReview,
  onShowReviewBlocked,
}: {
  state: PrototypeState
  uncategorized: BudgetTransaction[]
  liveCurrentMonth: string
  isForecastMonth: boolean
  forecastMonthsAhead: number
  onNavigate: (view: View) => void
  onSelect: (id: string) => void
  onSelectCategory: (categoryId: string) => void
  onSetRentMortgagePaid: (categoryId: string, paid: boolean) => void
  onToggleDateSimulation: () => void
  onGetStarted: () => void
  onOpenReview: (monthKey: string) => void
  onShowReviewBlocked: () => void
}) {
  if (!state.onboardingComplete) {
    return <OnboardingEmptyState onGetStarted={onGetStarted} />
  }
  const transactions = state.transactions.filter((item) => item.date.startsWith(state.currentMonth))
  const activeCategories = state.categories.filter((category) => !category.archived)
  
  // Grace period logic: Reviews available 3 days after month ends
  const currentDate = state.debugCurrentDate || new Date().toISOString().slice(0, 10)
  const assumedHandledMonths = new Set(['2026-08'])
  const eligibleReviewMonths = state.months
    .map((month) => month.key)
    .filter((monthKey) => !assumedHandledMonths.has(monthKey))
    .filter((monthKey) => isReviewEligible(monthKey, currentDate))
    .sort((a, b) => a.localeCompare(b))
  
  const dialByGroup = activeCategories.reduce(
    (totals, category) => {
      const adjustmentTotal = categoryAdjustmentTotal(state, category.id, state.currentMonth)
      const effectiveTarget = category.monthlyTarget + adjustmentTotal
      if (isSavingsCategory(category)) {
        totals.Savings += Math.max(0, effectiveTarget)
        return totals
      }
      if (isRentMortgageCategory(category)) {
        const isPaid = Boolean(getRentMortgagePayment(state, category.id, state.currentMonth))
        if (isPaid) totals.Needs += Math.max(0, effectiveTarget)
        return totals
      }
      const spent = categorySpend(state, category.id, state.currentMonth)
      totals[category.group] += Math.max(0, spent)
      return totals
    },
    { Needs: 0, Wants: 0, Savings: 0 } as Record<BudgetGroup, number>,
  )
  const uncategorizedSpent = transactions
    .filter((item) => item.amount > 0 && !item.categoryId)
    .reduce((sum, item) => sum + item.amount, 0)
  dialByGroup.Needs += uncategorizedSpent
  const dialSavings = isForecastMonth ? 0 : dialByGroup.Savings
  const spentForDial = dialByGroup.Needs + dialByGroup.Wants + dialSavings
  const totalBudgeted = state.categories
    .filter((item) => !item.archived)
    .reduce(
      (sum, item) =>
        sum + item.monthlyTarget + categoryAdjustmentTotal(state, item.id, state.currentMonth),
      0,
    )
  const adHocIncome = monthAdHocIncome(state, state.currentMonth)
  const effectiveIncome = state.monthlyIncome + adHocIncome
  const availableToSpend = effectiveIncome - spentForDial
  const incomeUsedPct = effectiveIncome > 0 ? (spentForDial / effectiveIncome) * 100 : 0
  const dialSegments =
    effectiveIncome > 0
      ? [
          {
            className: 'needs' as const,
            percent: (dialByGroup.Needs / effectiveIncome) * 100,
            title: `Needs: ${money(dialByGroup.Needs)}`,
          },
          {
            className: 'wants' as const,
            percent: (dialByGroup.Wants / effectiveIncome) * 100,
            title: `Wants: ${money(dialByGroup.Wants)}`,
          },
          {
            className: 'savings' as const,
            percent: (dialSavings / effectiveIncome) * 100,
            title: `Savings: ${money(dialSavings)}`,
          },
        ]
      : []
  const projectedContributionTotal = isForecastMonth
    ? activeCategories.reduce((sum, category) => sum + category.monthlyTarget * forecastMonthsAhead, 0)
    : 0

  return (
    <>
      <PageHeading
        eyebrow={isForecastMonth ? 'Forecast view' : 'Monthly plan'}
        title={`Good morning, ${state.profile.nickname || state.profile.name.split(' ')[0] || 'there'}.`}
        description={
          isForecastMonth
            ? `Projected balances for ${monthLabel(state.currentMonth)} based on your current available money and recurring contributions.`
            : 'Here is what changed since your last visit and where your envelopes stand.'
        }
        action={
          <button className="outline-action" onClick={onToggleDateSimulation} type="button">
            <Calendar size={16} />
            {state.debugCurrentDate === '2026-10-05'
              ? 'Simulating October 5th (reset)'
              : 'Simulate October 5th'}
          </button>
        }
      />
      {isForecastMonth && (
        <section className="attention-banner forecast-banner">
          <div>
            <TrendingUp size={20} />
            <span>
              <strong>Forecast balances include your current available money and planned monthly contributions.</strong>{' '}
              Only transactions you explicitly spread into future months are included as projected spending.
            </span>
          </div>
        </section>
      )}
      {!isForecastMonth && uncategorized.length > 0 && (
        <section className="attention-banner">
          <div>
            <Sparkles size={20} />
            <span>
              <strong>{uncategorized.length} purchases are waiting for you.</strong> Review them
              before reviewing {monthLabel(state.currentMonth)}.
            </span>
          </div>
          <button onClick={() => onNavigate('assistant')} type="button">
            Start Transaction Review <ArrowRight size={16} />
          </button>
        </section>
      )}
      {!isForecastMonth && eligibleReviewMonths.length > 0 && (
        <section className="attention-banner review-banner">
          <div>
            <Calendar size={20} />
            <span>
              <strong>You have {eligibleReviewMonths.length} month{eligibleReviewMonths.length !== 1 ? 's' : ''} to review.</strong> See how your money changed and get your Month in Review.
            </span>
          </div>
          <button
            onClick={() => {
              if (uncategorized.length > 0) {
                onShowReviewBlocked()
                return
              }
              const oldestMonth = eligibleReviewMonths[0]
              if (oldestMonth) {
                onOpenReview(oldestMonth)
              }
            }}
            type="button"
          >
            Start {monthLabel(eligibleReviewMonths[0])} Review <ArrowRight size={16} />
          </button>
        </section>
      )}
      <section className="income-gauge-card">
        <div className="income-gauge-side income">
          <span>{isForecastMonth ? 'Recurring contribution / month' : 'Monthly income'}</span>
          <strong>{money(isForecastMonth ? totalBudgeted : state.monthlyIncome)}</strong>
          <small>
            {isForecastMonth
              ? 'Current contribution totals across your active envelopes'
              : 'Editable from Settings'}
          </small>
          {!isForecastMonth && (
            <div className="income-contribution-chip">
              <span>Envelope contributions</span>
              <strong>{money(totalBudgeted)}</strong>
            </div>
          )}
          {!isForecastMonth && adHocIncome > 0 && (
            <div className="ad-hoc-chip">+ {money(adHocIncome)} ad hoc income</div>
          )}
        </div>
        <div className="income-gauge-center">
          <SemiGauge percent={incomeUsedPct} segments={dialSegments} />
          <div className="income-gauge-readout">
            <strong>{money(spentForDial)}</strong>
            <span>
              {isForecastMonth
                ? `Current spending (fixed baseline) of ${money(effectiveIncome)}`
                : `spent of ${money(effectiveIncome)}`}
            </span>
          </div>
        </div>
        <div className="income-gauge-side available">
          <span>{isForecastMonth ? 'Projected contribution growth' : 'Available to spend'}</span>
          <strong>{money(isForecastMonth ? projectedContributionTotal : availableToSpend)}</strong>
          <small>
            {isForecastMonth
              ? `Added over the next ${forecastMonthsAhead} month${forecastMonthsAhead === 1 ? '' : 's'}`
              : 'Income minus everything charged'}
          </small>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <h2>Your envelopes</h2>
          <p>Contribution, spending, and rollover — colored by Needs / Wants / Savings.</p>
        </div>
        <div className="group-legend">
          <span className="needs">
            <i /> Needs
          </span>
          <span className="wants">
            <i /> Wants
          </span>
          <span className="savings">
            <i /> Savings
          </span>
        </div>
      </section>
      <EnvelopeGroupedTable
        forecastMonthsAhead={forecastMonthsAhead}
        isForecastMonth={isForecastMonth}
        liveCurrentMonth={liveCurrentMonth}
        onSelectCategory={onSelectCategory}
        onSetRentMortgagePaid={onSetRentMortgagePaid}
        state={state}
      />
      {!isForecastMonth && (
        <section className="dashboard-bottom">
        <div>
          <div className="section-heading compact">
            <div>
              <h2>Recent activity</h2>
              <p>Actual card charges remain distinct from budget impact.</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate('transactions')}
              type="button"
            >
              View all
            </button>
          </div>
          <TransactionTable
            categories={state.categories}
            onSelect={onSelect}
            transactions={transactions.slice(0, 5)}
          />
        </div>
        </section>
      )}
    </>
  )
}

const GROUP_ORDER: BudgetCategory['group'][] = ['Needs', 'Wants', 'Savings']

function EnvelopeGroupedTable({
  state,
  liveCurrentMonth,
  isForecastMonth,
  forecastMonthsAhead,
  onSelectCategory,
  onSetRentMortgagePaid,
}: {
  state: PrototypeState
  liveCurrentMonth: string
  isForecastMonth: boolean
  forecastMonthsAhead: number
  onSelectCategory: (categoryId: string) => void
  onSetRentMortgagePaid: (categoryId: string, paid: boolean) => void
}) {
  const active = state.categories.filter((category) => !category.archived)
  return (
    <table className={`category-table ${isForecastMonth ? 'forecast-table' : ''}`}>
      <thead>
        <tr>
          <th>Category</th>
          <th className="cell-progress">
            {isForecastMonth ? 'Forecast contributions' : 'Spent vs contribution'}
          </th>
          {isForecastMonth && <th className="num">Spread transactions</th>}
          <th className="num">{isForecastMonth ? 'Forecast envelope balance' : 'Envelope balance'}</th>
        </tr>
      </thead>
      {GROUP_ORDER.map((group) => {
        const rows = active
          .filter((category) => category.group === group)
          .map((category) => {
            const targetMonth = isForecastMonth ? liveCurrentMonth : state.currentMonth
            const adjustmentTotal = categoryAdjustmentTotal(state, category.id, targetMonth)
            const effectiveTarget = category.monthlyTarget + adjustmentTotal
            const isSavings = isSavingsCategory(category)
            const isRentMortgage = isRentMortgageCategory(category)
            const rentPayment = isRentMortgage
              ? getRentMortgagePayment(state, category.id, targetMonth)
              : null
            const spent = isSavings
              ? 0
              : isRentMortgage
              ? (rentPayment ? effectiveTarget : 0)
              : categorySpend(state, category.id, targetMonth)
            const currentAvailable = isSavings || isRentMortgage
              ? category.openingBalance + effectiveTarget
              : category.openingBalance + effectiveTarget - spent
            const forecastContribution = category.monthlyTarget * forecastMonthsAhead
            const spreadFutureImpact =
              isForecastMonth && !isSavings && !isRentMortgage
                ? projectedFutureSpreadImpact(state, category.id, liveCurrentMonth, state.currentMonth)
                : 0
            const available = isForecastMonth
              ? currentAvailable + forecastContribution - spreadFutureImpact
              : currentAvailable
            const usage =
              effectiveTarget > 0
                ? Math.max(0, (isSavings ? 0 : isRentMortgage ? (rentPayment ? 100 : 0) : (spent / effectiveTarget) * 100))
                : 0
            const status = isSavings
              ? 'healthy'
              : isRentMortgage
              ? (rentPayment ? 'paid' : 'not-paid')
              : available < 0
                ? 'over'
                : 'healthy'
            return {
              category,
              forecastContribution,
              spent,
              available,
              usage,
              status,
              effectiveTarget,
              spreadFutureImpact,
              rentPayment,
              isRentMortgage,
              isSavings,
            }
          })
        if (rows.length === 0) return null
        return (
          <tbody className={group.toLowerCase()} key={group}>
            <tr className="group-header-row">
              <td colSpan={isForecastMonth ? 4 : 3}>
                <div
                  className={`group-header-content ${isForecastMonth ? 'forecast-cols' : 'current-cols'}`}
                  aria-label="Column titles"
                >
                  <span className="group-name">
                    {group} · {rows.length} {rows.length === 1 ? 'category' : 'categories'}
                  </span>
                  <span className="group-col-title">
                    {isForecastMonth ? 'Forecast contributions' : 'Spent vs contribution'}
                  </span>
                  {isForecastMonth && <span className="group-col-title num">Spread transactions</span>}
                  <span className="group-col-title num">
                    {isForecastMonth ? 'Forecast envelope balance' : 'Envelope balance'}
                  </span>
                </div>
              </td>
            </tr>
            {rows.map(
              ({
                category,
                forecastContribution,
                spent,
                available,
                usage,
                status,
                effectiveTarget,
                spreadFutureImpact,
                rentPayment,
                isRentMortgage,
                isSavings,
              }) => (
              <tr
                className={`${status} ${category.group.toLowerCase()} ${isForecastMonth ? 'forecast-row' : ''}`}
                key={category.id}
                onClick={isForecastMonth ? undefined : () => onSelectCategory(category.id)}
              >
                <td>
                  <div className="cat-name-cell">
                    <div>
                      <strong>{category.name}</strong>
                      {category.openingBalance !== 0 && (
                        <span className="rollover-note">
                          {category.openingBalance > 0 ? '+' : ''}
                          {money(category.openingBalance)} rolled from last month
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="cell-progress">
                  {isForecastMonth ? (
                    isRentMortgage ? (
                      <div className="forecast-projection-note">
                        <strong>---</strong>
                        <span>Not tracked for forecasted rent/mortgage</span>
                      </div>
                    ) : (
                      <div className="forecast-projection-note">
                        <strong>{money(forecastContribution)}</strong>
                        <span>
                          recurring contributions added over {forecastMonthsAhead}{' '}
                          month{forecastMonthsAhead === 1 ? '' : 's'}
                          {spreadFutureImpact > 0
                            ? `, minus ${money(spreadFutureImpact)} from spread transactions`
                            : ''}
                        </span>
                      </div>
                    )
                  ) : isSavings ? (
                    <div className="row-progress-meta">
                      <span>{money(effectiveTarget)} auto-funded</span>
                    </div>
                  ) : isRentMortgage ? (
                    <div className="obligation-progress" onClick={(event) => event.stopPropagation()}>
                      <div className="obligation-toggle" role="group" aria-label="Rent or mortgage payment status">
                        <button
                          className={!rentPayment ? 'active' : ''}
                          onClick={() => onSetRentMortgagePaid(category.id, false)}
                          type="button"
                        >
                          Not Paid
                        </button>
                        <button
                          className={rentPayment ? 'active' : ''}
                          onClick={() => onSetRentMortgagePaid(category.id, true)}
                          type="button"
                        >
                          Paid
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="row-progress-track">
                        <span
                          className="row-progress-fill"
                          style={{ width: `${Math.min(100, usage)}%` }}
                        />
                      </div>
                      <div className="row-progress-meta">
                        <span>{money(spent)}/{money(effectiveTarget)} spent</span>
                      </div>
                    </>
                  )}
                </td>
                {isForecastMonth && (
                  <td className="num">
                    <div className="available-amount-cell">
                      <strong>
                        {isRentMortgage
                          ? '---'
                          : spreadFutureImpact > 0
                            ? money(spreadFutureImpact)
                            : '—'}
                      </strong>
                      <small>
                        {isRentMortgage
                          ? 'Not tracked in forecast'
                          : spreadFutureImpact > 0
                          ? 'Projected from spread'
                          : 'No spread commitments'}
                      </small>
                    </div>
                  </td>
                )}
                <td className="num" style={available < 0 ? { color: '#923d2d' } : undefined}>
                  <div className="available-amount-cell">
                    <strong>{isForecastMonth && isRentMortgage ? '---' : money(available)}</strong>
                    <small>
                      {isForecastMonth
                        ? isRentMortgage
                          ? 'Not tracked in forecast'
                          : 'Forecast envelope balance'
                        : 'Envelope balance'}
                    </small>
                  </div>
                </td>
              </tr>
            ),
            )}
          </tbody>
        )
      })}
    </table>
  )
}

function CategoryDetailView({
  state,
  categoryId,
  onBack,
  onSelect,
  onViewAllTransactions,
  onCommit,
}: {
  state: PrototypeState
  categoryId: string
  onBack: () => void
  onSelect: (id: string) => void
  onViewAllTransactions: () => void
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
}) {
  const category = state.categories.find((item) => item.id === categoryId)
  if (!category) {
    return (
      <>
        <PageHeading
          description="This envelope no longer exists."
          eyebrow="Category"
          title="Not found"
        />
        <button className="outline-action" onClick={onBack} type="button">
          <ArrowLeft size={16} /> Back to overview
        </button>
      </>
    )
  }
  const spent = categorySpend(state, category.id, state.currentMonth)
  const adjustments = categoryAdjustments(state, category.id, state.currentMonth)
  const adjustmentTotal = adjustments.reduce((sum, item) => sum + item.amount, 0)
  const effectiveTarget = category.monthlyTarget + adjustmentTotal
  const available = category.openingBalance + effectiveTarget - spent
  const usage = effectiveTarget > 0 ? (spent / effectiveTarget) * 100 : 0
  const categoryName = category.name
  const transactions = state.transactions
    .filter((item) => item.date.startsWith(state.currentMonth) && item.categoryId === category.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  function otherCategoryName(adjustment: AdHocAdjustment) {
    if (!adjustment.transferId) return 'another envelope'
    const pair = state.adjustments.find(
      (item) => item.transferId === adjustment.transferId && item.id !== adjustment.id,
    )
    return state.categories.find((item) => item.id === pair?.categoryId)?.name ?? 'another envelope'
  }

  function undoAdjustment(adjustment: AdHocAdjustment) {
    const idsToRemove = adjustment.transferId
      ? state.adjustments
          .filter((item) => item.transferId === adjustment.transferId)
          .map((item) => item.id)
      : [adjustment.id]
    onCommit(
      { ...state, adjustments: state.adjustments.filter((item) => !idsToRemove.includes(item.id)) },
      audit(
        'Ad hoc adjustment undone',
        adjustment.kind === 'add'
          ? `${money(adjustment.amount)} addition to ${categoryName} undone.`
          : `Transfer of ${money(Math.abs(adjustment.amount))} involving ${categoryName} undone.`,
      ),
    )
  }

  return (
    <>
      <PageHeading
        eyebrow={category.group}
        title={category.name}
        description={`Contribution, spending, and rollover for ${category.name} this month.`}
        action={
          <button className="text-button" onClick={onBack} type="button">
            <ArrowLeft size={15} /> Back to envelopes
          </button>
        }
      />
      <section className={`income-gauge-card category-gauge ${category.group.toLowerCase()}`}>
        <div className="income-gauge-side income">
          <span>Spent so far</span>
          <strong>{money(spent)}</strong>
          <small>{money(effectiveTarget)} budgeted this month</small>
          {adjustmentTotal !== 0 && (
            <div className="ad-hoc-chip">
              {adjustmentTotal > 0 ? '+' : ''}
              {money(adjustmentTotal)} ad hoc this month
            </div>
          )}
        </div>
        <div className="income-gauge-center">
          <SemiGauge percent={usage} />
          <div className="income-gauge-readout">
            <strong>{Math.round(usage)}%</strong>
            <span>of budget used</span>
          </div>
        </div>
        <div className="income-gauge-side available">
          <span>{available < 0 ? 'Over by' : 'Available'}</span>
          <strong style={available < 0 ? { color: '#923d2d' } : undefined}>
            {money(Math.abs(available))}
          </strong>
          <small>
            {category.openingBalance !== 0
              ? `${category.openingBalance > 0 ? '+' : ''}${money(category.openingBalance)} rolled in`
              : 'Rolls forward next month'}
          </small>
        </div>
      </section>
      {adjustments.length > 0 && (
        <section className="adhoc-section">
          <div className="section-heading compact">
            <div>
              <h2>Ad hoc adjustments this month</h2>
              <p>Money added or moved outside the regular budget.</p>
            </div>
          </div>
          <ul className="adhoc-list">
            {adjustments.map((adjustment) => (
              <li key={adjustment.id}>
                <span
                  className={`adhoc-amount ${adjustment.amount >= 0 ? 'positive' : 'negative'}`}
                >
                  {adjustment.amount >= 0 ? '+' : ''}
                  {money(adjustment.amount)}
                </span>
                <span className="adhoc-desc">
                  {adjustment.kind === 'add' && (
                    <>
                      Added — <em>&ldquo;{adjustment.note}&rdquo;</em>
                    </>
                  )}
                  {adjustment.kind === 'transfer-out' && (
                    <>
                      Transferred to {otherCategoryName(adjustment)} —{' '}
                      <em>&ldquo;{adjustment.note}&rdquo;</em>
                    </>
                  )}
                  {adjustment.kind === 'transfer-in' && (
                    <>
                      Transferred from {otherCategoryName(adjustment)} —{' '}
                      <em>&ldquo;{adjustment.note}&rdquo;</em>
                    </>
                  )}
                </span>
                <button
                  className="text-button"
                  onClick={() => undoAdjustment(adjustment)}
                  type="button"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="section-heading compact">
        <div>
          <h2>Transactions in {category.name}</h2>
          <p>
            {transactions.length} this month, {money(effectiveTarget)} budgeted.
          </p>
        </div>
        <button className="text-button" onClick={onViewAllTransactions} type="button">
          Open in Transactions <ArrowRight size={15} />
        </button>
      </section>
      <TransactionTable
        categories={state.categories}
        onSelect={onSelect}
        transactions={transactions}
      />
    </>
  )
}

function Transactions({
  state,
  search,
  filter,
  categoryFilter,
  onFilter,
  onSearch,
  onSelect,
  onAddManualTransaction,
  onSimulate,
  onClearCategoryFilter,
}: {
  state: PrototypeState
  search: string
  filter: 'all' | 'uncategorized' | 'refunds'
  categoryFilter: string | null
  onFilter: (filter: 'all' | 'uncategorized' | 'refunds') => void
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onAddManualTransaction: (input: {
    name: string
    amount: number
    categoryId: string
    vendor?: string
    monthKey: string
  }) => void
  onSimulate: () => void
  onClearCategoryFilter: () => void
}) {
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategoryId, setManualCategoryId] = useState('')
  const [manualVendor, setManualVendor] = useState('')
  const spendableCategories = state.categories.filter(
    (item) => !item.archived && item.group !== 'Savings',
  )

  function submitManualTransaction(event: React.FormEvent) {
    event.preventDefault()
    const amount = Number(manualAmount)
    if (!manualName.trim() || !manualCategoryId || !Number.isFinite(amount) || amount <= 0) return
    onAddManualTransaction({
      name: manualName.trim(),
      amount,
      categoryId: manualCategoryId,
      vendor: manualVendor.trim(),
      monthKey: state.currentMonth,
    })
    setShowManualEntry(false)
    setManualName('')
    setManualAmount('')
    setManualCategoryId('')
    setManualVendor('')
  }

  const filteredCategory = categoryFilter
    ? state.categories.find((item) => item.id === categoryFilter)
    : null
  const list = state.transactions
    .filter((item) => item.date.startsWith(state.currentMonth))
    .filter((item) =>
      filter === 'uncategorized' ? !item.categoryId : filter === 'refunds' ? item.amount < 0 : true,
    )
    .filter((item) => (categoryFilter ? item.categoryId === categoryFilter : true))
    .filter((item) =>
      `${item.merchant} ${item.rawDescription}`.toLowerCase().includes(search.toLowerCase()),
    )
  return (
    <>
      <PageHeading
        eyebrow="Transactions"
        title="Every purchase, in context."
        description="Search, inspect, categorize, edit, spread, or link a refund without changing the original bank record."
        action={
          <div className="transaction-actions">
            <button className="outline-action" onClick={() => setShowManualEntry(true)} type="button">
              <Plus size={17} /> Manually add transaction
            </button>
            <button className="primary-action" onClick={onSimulate} type="button">
              <Plus size={17} /> Simulate bank charge
            </button>
          </div>
        }
      />
      {showManualEntry && (
        <div className="modal-overlay">
          <div className="modal-card manual-transaction-modal">
            <h2>Manually add transaction</h2>
            <form className="manual-transaction-form" onSubmit={submitManualTransaction}>
              <label>
                Name of transaction
                <input
                  onChange={(event) => setManualName(event.target.value)}
                  required
                  type="text"
                  value={manualName}
                />
              </label>
              <label>
                Amount
                <input
                  min="0.01"
                  onChange={(event) => setManualAmount(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={manualAmount}
                />
              </label>
              <label>
                Category
                <select
                  onChange={(event) => setManualCategoryId(event.target.value)}
                  required
                  value={manualCategoryId}
                >
                  <option value="">Select category</option>
                  {spendableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vendor (optional)
                <input
                  onChange={(event) => setManualVendor(event.target.value)}
                  type="text"
                  value={manualVendor}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="outline-action"
                  onClick={() => setShowManualEntry(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="primary-action" type="submit">
                  Add transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {filteredCategory && (
        <div className="filter-chip-row">
          <span className="filter-chip">
            Filtered by {filteredCategory.name}
            <button onClick={onClearCategoryFilter} title="Clear category filter" type="button">
              <X size={13} />
            </button>
          </span>
        </div>
      )}
      <div className="toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search merchant or bank description"
            value={search}
          />
        </label>
        <div className="segmented">
          {(['all', 'uncategorized', 'refunds'] as const).map((item) => (
            <button
              className={filter === item ? 'active' : ''}
              key={item}
              onClick={() => onFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <TransactionTable categories={state.categories} onSelect={onSelect} transactions={list} />
    </>
  )
}

function TransactionTable({
  categories,
  transactions,
  onSelect,
}: {
  categories: BudgetCategory[]
  transactions: BudgetTransaction[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="transaction-table">
      <div className="table-head">
        <span>Date</span>
        <span>Merchant</span>
        <span>Category</span>
        <span>Budget impact</span>
        <span>Charge</span>
      </div>
      {transactions.map((transaction) => {
        const category = categories.find((item) => item.id === transaction.categoryId)
        return (
          <button
            className="transaction-row"
            key={transaction.id}
            onClick={() => onSelect(transaction.id)}
            type="button"
          >
            <span>{shortDate(transaction.date)}</span>
            <span className="merchant-cell">
              <strong>{transaction.merchant}</strong>
              <small>
                {transaction.status}
                {transaction.refundOfId ? ' · linked refund' : ''}
              </small>
            </span>
            <span>
              {category ? (
                <em>{category.name}</em>
              ) : (
                <em className="uncategorized">Needs review</em>
              )}
            </span>
            <span>
              {money(transaction.amount / Math.max(1, transaction.spreadMonths))}
              {transaction.spreadMonths > 1 && <small> / month</small>}
            </span>
            <strong className={transaction.amount < 0 ? 'refund-amount' : ''}>
              {money(transaction.amount)}
            </strong>
          </button>
        )
      })}
      {transactions.length === 0 && (
        <div className="empty-state">No transactions match this view.</div>
      )}
    </div>
  )
}

function InboxView({
  state,
  transactions,
  onSetPendingCategory,
  onApproveCategorization,
  onClearPendingCategory,
  pendingCategorizations,
  onReview,
  onSelect,
}: {
  state: PrototypeState
  transactions: BudgetTransaction[]
  onSetPendingCategory: (id: string, categoryId: string) => void
  onApproveCategorization: (id: string, source: string) => void
  onClearPendingCategory: (id: string) => void
  pendingCategorizations: Record<string, string>
  onReview: () => void
  onSelect: (id: string) => void
}) {
  const spendableCategories = state.categories.filter(
    (item) => !item.archived && item.group !== 'Savings',
  )

  return (
    <>
      <PageHeading
        eyebrow="Uncategorized inbox"
        title={`${transactions.length} purchases need your attention.`}
        description="Nothing disappears until you decide where it belongs. Handle one now or let Tally guide you through the batch."
        action={
          <button
            className="primary-action"
            disabled={transactions.length === 0}
            onClick={onReview}
            type="button"
          >
            <Sparkles size={17} />{' '}
            {transactions.length === 0 ? 'All caught up' : 'Start Transaction Review'}
          </button>
        }
      />
      <div className="inbox-list">
        {transactions.map((transaction) => {
          const suggestion = suggestions[transaction.id]
          const suggestedCategory = suggestion
            ? state.categories.find((item) => item.id === suggestion.categoryId)
            : undefined
          const suggestedName =
            suggestedCategory && suggestedCategory.group !== 'Savings' ? suggestedCategory.name : null
          return (
            <article className="inbox-item" key={transaction.id}>
              <button
                className="transaction-summary"
                onClick={() => onSelect(transaction.id)}
                type="button"
              >
                <span className="merchant-avatar">{transaction.merchant[0]}</span>
                <span>
                  <strong>{transaction.merchant}</strong>
                  <small>
                    {shortDate(transaction.date)} ·{' '}
                    {state.accounts.find((item) => item.id === transaction.accountId)?.nickname}
                  </small>
                </span>
                <b>{money(transaction.amount)}</b>
              </button>
              <div className="suggestion">
                <Sparkles size={16} />
                {pendingCategorizations[transaction.id] ? (
                  <>
                    <span>
                      Confirm:{' '}
                      {
                        state.categories.find(
                          (item) => item.id === pendingCategorizations[transaction.id],
                        )?.name
                      }
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="primary-action"
                        onClick={() =>
                          onApproveCategorization(transaction.id, 'AI Review + Manual Approval')
                        }
                        type="button"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '14px' }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        className="outline-action"
                        onClick={() => onClearPendingCategory(transaction.id)}
                        type="button"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '14px' }}
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>
                      {suggestion
                        ? suggestedName
                          ? `Suggested: ${suggestedName} · ${suggestion.confidence}%`
                          : 'Choose a category'
                        : 'Choose a category'}
                    </span>
                    <select
                      aria-label={`Category for ${transaction.merchant}`}
                      defaultValue={suggestion?.categoryId ?? ''}
                      onChange={(event) =>
                        event.target.value &&
                        onSetPendingCategory(transaction.id, event.target.value)
                      }
                    >
                      <option value="">Choose...</option>
                      {spendableCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </article>
          )
        })}
        {transactions.length === 0 && (
          <div className="complete-state">
            <Check size={28} />
            <h2>Inbox cleared</h2>
            <p>Every purchase in {monthLabel(state.currentMonth)} has a category.</p>
          </div>
        )}
      </div>
    </>
  )
}

function MoneyMoveModal({
  state,
  onCommit,
  onClose,
}: {
  state: PrototypeState
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
  onClose: () => void
}) {
  const activeCategories = state.categories.filter((item) => !item.archived)
  const [mode, setMode] = useState<'add' | 'transfer'>('add')
  const [addCategoryId, setAddCategoryId] = useState(activeCategories[0]?.id ?? '')
  const [addAmount, setAddAmount] = useState('')
  const [addNote, setAddNote] = useState('')
  const [fromCategoryId, setFromCategoryId] = useState(activeCategories[0]?.id ?? '')
  const [toCategoryId, setToCategoryId] = useState(
    activeCategories[1]?.id ?? activeCategories[0]?.id ?? '',
  )
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')

  function categorySnapshot(categoryId: string) {
    const category = state.categories.find((item) => item.id === categoryId)
    if (!category) return null
    const spent = categorySpend(state, category.id, state.currentMonth)
    const target =
      category.monthlyTarget + categoryAdjustmentTotal(state, category.id, state.currentMonth)
    const available = category.openingBalance + target - spent
    return { category, target, available }
  }

  const addAmountNumber = Number(addAmount) || 0
  const addSnapshot = categorySnapshot(addCategoryId)
  const addNewTarget = (addSnapshot?.target ?? 0) + addAmountNumber
  const addNewAvailable = (addSnapshot?.available ?? 0) + addAmountNumber

  const transferAmountNumber = Number(transferAmount) || 0
  const fromSnapshot = categorySnapshot(fromCategoryId)
  const toSnapshot = categorySnapshot(toCategoryId)
  const fromNewAvailable = (fromSnapshot?.available ?? 0) - transferAmountNumber
  const toNewAvailable = (toSnapshot?.available ?? 0) + transferAmountNumber

  function submitAdd() {
    if (!addSnapshot || addAmountNumber <= 0 || !addNote.trim()) return
    const adjustment: AdHocAdjustment = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      categoryId: addCategoryId,
      amount: addAmountNumber,
      kind: 'add',
      note: addNote.trim(),
    }
    onCommit(
      { ...state, adjustments: [...state.adjustments, adjustment] },
      audit(
        'Ad hoc money added',
        `${money(addAmountNumber)} added to ${addSnapshot.category.name} — "${addNote.trim()}"`,
      ),
    )
    onClose()
  }

  function submitTransfer() {
    if (!fromSnapshot || !toSnapshot || fromCategoryId === toCategoryId) return
    if (transferAmountNumber <= 0 || !transferNote.trim()) return
    const transferId = crypto.randomUUID()
    const outLeg: AdHocAdjustment = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      categoryId: fromCategoryId,
      amount: -transferAmountNumber,
      kind: 'transfer-out',
      note: transferNote.trim(),
      transferId,
    }
    const inLeg: AdHocAdjustment = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      categoryId: toCategoryId,
      amount: transferAmountNumber,
      kind: 'transfer-in',
      note: transferNote.trim(),
      transferId,
    }
    onCommit(
      { ...state, adjustments: [...state.adjustments, outLeg, inLeg] },
      audit(
        'Money transferred',
        `${money(transferAmountNumber)} transferred from ${fromSnapshot.category.name} to ${toSnapshot.category.name} — "${transferNote.trim()}"`,
      ),
    )
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card money-move-modal">
        <h2>Add or transfer money</h2>
        <div className="segmented modal-segmented">
          <button
            className={mode === 'add' ? 'active' : ''}
            onClick={() => setMode('add')}
            type="button"
          >
            Add money
          </button>
          <button
            className={mode === 'transfer' ? 'active' : ''}
            onClick={() => setMode('transfer')}
            type="button"
          >
            Transfer money
          </button>
        </div>

        {mode === 'add' ? (
          <div className="money-move-form">
            <label>
              Category
              <select
                onChange={(event) => setAddCategoryId(event.target.value)}
                value={addCategoryId}
              >
                {activeCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <div className="income-edit-field">
                <span>$</span>
                <input
                  min="0"
                  onChange={(event) => setAddAmount(event.target.value)}
                  type="number"
                  value={addAmount}
                />
              </div>
            </label>
            <label>
              Reason
              <input
                onChange={(event) => setAddNote(event.target.value)}
                placeholder='e.g. "Bonus from work"'
                value={addNote}
              />
            </label>
            {addSnapshot && (
              <div className="money-move-preview">
                <div>
                  <span>New available</span>
                  <strong>{money(addNewAvailable)}</strong>
                  <small>was {money(addSnapshot.available)}</small>
                </div>
                <div>
                  <span>New monthly budget</span>
                  <strong>{money(addNewTarget)}</strong>
                  <small>was {money(addSnapshot.target)}</small>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="outline-action" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={!addSnapshot || addAmountNumber <= 0 || !addNote.trim()}
                onClick={submitAdd}
                type="button"
              >
                Add money
              </button>
            </div>
          </div>
        ) : (
          <div className="money-move-form">
            <p className="transfer-sentence">
              Transfer
              <span className="income-edit-field inline">
                <span>$</span>
                <input
                  min="0"
                  onChange={(event) => setTransferAmount(event.target.value)}
                  type="number"
                  value={transferAmount}
                />
              </span>
              from
              <select
                onChange={(event) => setFromCategoryId(event.target.value)}
                value={fromCategoryId}
              >
                {activeCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              to
              <select
                onChange={(event) => setToCategoryId(event.target.value)}
                value={toCategoryId}
              >
                {activeCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </p>
            <label>
              Reason
              <input
                onChange={(event) => setTransferNote(event.target.value)}
                placeholder='e.g. "Covering overspend"'
                value={transferNote}
              />
            </label>
            {fromCategoryId === toCategoryId ? (
              <p className="form-message">Pick two different envelopes.</p>
            ) : (
              fromSnapshot &&
              toSnapshot && (
                <div className="money-move-preview">
                  <div>
                    <span>{fromSnapshot.category.name} available</span>
                    <strong style={fromNewAvailable < 0 ? { color: '#923d2d' } : undefined}>
                      {money(fromNewAvailable)}
                    </strong>
                    <small>was {money(fromSnapshot.available)}</small>
                  </div>
                  <div>
                    <span>{toSnapshot.category.name} available</span>
                    <strong>{money(toNewAvailable)}</strong>
                    <small>was {money(toSnapshot.available)}</small>
                  </div>
                </div>
              )
            )}
            <div className="modal-actions">
              <button className="outline-action" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={
                  fromCategoryId === toCategoryId ||
                  transferAmountNumber <= 0 ||
                  !transferNote.trim()
                }
                onClick={submitTransfer}
                type="button"
              >
                Transfer money
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type CategorySuggestion = {
  name: string
  group: BudgetGroup
  icon: typeof Home
  templates: Array<'essentials' | 'full'>
  examples: [string, string, string]
}

type IconOption = {
  key: string
  label: string
  icon: typeof Home
}

const CUSTOM_ENVELOPE_ICON_OPTIONS: IconOption[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'cart', label: 'Groceries', icon: ShoppingCart },
  { key: 'car', label: 'Transportation', icon: Car },
  { key: 'shield', label: 'Insurance', icon: ShieldCheck },
  { key: 'zap', label: 'Utilities', icon: Zap },
  { key: 'food', label: 'Dining', icon: UtensilsCrossed },
  { key: 'heart', label: 'Lifestyle', icon: Heart },
  { key: 'plane', label: 'Travel', icon: Plane },
  { key: 'piggy', label: 'Savings', icon: PiggyBank },
  { key: 'gamepad', label: 'Fun', icon: Gamepad2 },
  { key: 'calendar', label: 'Bills', icon: Calendar },
  { key: 'receipt', label: 'Receipts', icon: ReceiptText },
  { key: 'money', label: 'Cash', icon: CircleDollarSign },
  { key: 'tag', label: 'General', icon: Tag },
  { key: 'landmark', label: 'Banking', icon: Landmark },
  { key: 'inbox', label: 'Buffer', icon: Inbox },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { key: 'activity', label: 'Health', icon: Activity },
]

function defaultExamplesForGroup(group: BudgetGroup): [string, string, string] {
  if (group === 'Needs') return ['Power bill', 'Gas station', 'Pharmacy refill']
  if (group === 'Savings') return ['Emergency transfer', 'Retirement auto-save', 'Vacation fund']
  return ['Coffee shop', 'Streaming renewal', 'Weekend outing']
}

const CATEGORY_SUGGESTIONS: CategorySuggestion[] = [
  {
    name: 'Rent/Mortgage',
    group: 'Needs',
    icon: Home,
    templates: ['essentials', 'full'],
    examples: ['Monthly rent', 'Mortgage payment', 'HOA dues'],
  },
  {
    name: 'Groceries',
    group: 'Needs',
    icon: ShoppingCart,
    templates: ['essentials', 'full'],
    examples: ['Whole Foods run', 'Costco bulk buy', 'Trader Joe\'s'],
  },
  {
    name: 'Transportation',
    group: 'Needs',
    icon: Car,
    templates: ['essentials', 'full'],
    examples: ['Gas fill-up', 'Parking garage', 'Train pass'],
  },
  {
    name: 'Insurance',
    group: 'Needs',
    icon: ShieldCheck,
    templates: ['essentials', 'full'],
    examples: ['Auto insurance', 'Renter\'s insurance', 'Health premium'],
  },
  {
    name: 'Utilities',
    group: 'Needs',
    icon: Zap,
    templates: ['essentials', 'full'],
    examples: ['Electric bill', 'Water bill', 'Internet service'],
  },
  {
    name: 'Dining',
    group: 'Wants',
    icon: UtensilsCrossed,
    templates: ['full'],
    examples: ['Dinner out', 'Takeout order', 'Coffee shop'],
  },
  {
    name: 'Shopping',
    group: 'Wants',
    icon: ShoppingBag,
    templates: ['full'],
    examples: ['Clothing purchase', 'Home decor', 'Online order'],
  },
  {
    name: 'Entertainment',
    group: 'Wants',
    icon: Film,
    templates: ['full'],
    examples: ['Movie tickets', 'Concert pass', 'Arcade night'],
  },
  {
    name: 'Subscriptions',
    group: 'Wants',
    icon: Repeat,
    templates: ['full'],
    examples: ['Netflix renewal', 'Music streaming', 'Cloud storage'],
  },
  {
    name: 'Pets',
    group: 'Wants',
    icon: PawPrint,
    templates: [],
    examples: ['Pet grooming', 'Toy refill', 'Pet daycare'],
  },
  {
    name: 'Vacation',
    group: 'Wants',
    icon: Plane,
    templates: ['full'],
    examples: ['Flight booking', 'Hotel deposit', 'Travel excursion'],
  },
  {
    name: 'Date night',
    group: 'Wants',
    icon: Heart,
    templates: ['full'],
    examples: ['Dinner reservation', 'Show tickets', 'Dessert stop'],
  },
  {
    name: 'Recreation',
    group: 'Wants',
    icon: Gamepad2,
    templates: ['full'],
    examples: ['Hobby supplies', 'Sport league fee', 'Gym day pass'],
  },
  {
    name: 'Misc',
    group: 'Wants',
    icon: MoreHorizontal,
    templates: [],
    examples: ['Last-minute gift', 'Small surprise expense', 'One-off purchase'],
  },
  {
    name: 'Emergency fund',
    group: 'Savings',
    icon: PiggyBank,
    templates: ['essentials', 'full'],
    examples: ['Emergency transfer', 'Rainy day top-up', 'Unexpected repair reserve'],
  },
  {
    name: 'Long-term goals',
    group: 'Savings',
    icon: TrendingUp,
    templates: ['full'],
    examples: ['Future home fund', 'Education savings', 'Investment contribution'],
  },
]

const ASSISTANT_PROMPT_VERSION = 'adaptive-onboarding-v1'

const INTRO_PAGES = [
  'opening',
  'envelope-assistant',
  'transaction-review',
  'text-categorization',
  'envelope-transfer',
  'month-in-review',
  'clean-slate',
] as const

const INTRO_AUTOPLAY_MS = 6200

function OnboardingIntroduction({
  onComplete,
  onSkip,
}: {
  onComplete: () => void
  onSkip: () => void
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const page = INTRO_PAGES[pageIndex]
  const isFirst = pageIndex === 0
  const isLast = pageIndex === INTRO_PAGES.length - 1

  useEffect(() => {
    if (!autoPlayEnabled || isLast) {
      return
    }

    const timer = window.setTimeout(() => {
      setPageIndex((current) => Math.min(INTRO_PAGES.length - 1, current + 1))
    }, INTRO_AUTOPLAY_MS)

    return () => window.clearTimeout(timer)
  }, [autoPlayEnabled, isLast, pageIndex])

  function goBack() {
    setAutoPlayEnabled(false)
    setPageIndex((current) => Math.max(0, current - 1))
  }

  function goNext() {
    setAutoPlayEnabled(false)
    if (isLast) {
      onComplete()
      return
    }
    setPageIndex((current) => Math.min(INTRO_PAGES.length - 1, current + 1))
  }

  return (
    <div className="intro-overlay">
      <div className="intro-shell">
        <header className="intro-header">
          <div className="intro-brand">
            <img alt="Tally logo" className="brand-logo intro-logo" src={moneyPlantLogo} /> Tally
          </div>
          <div className="intro-header-actions">
            <span className="intro-tour-state" aria-live="polite">
              {autoPlayEnabled && !isLast ? 'Auto-playing preview' : 'Manual preview'}
            </span>
            <button
              className="text-button"
              onClick={() => setAutoPlayEnabled((current) => !current)}
              type="button"
            >
              {autoPlayEnabled ? 'Pause auto-play' : 'Resume auto-play'}
            </button>
            <button className="text-button" onClick={onSkip} type="button">
              Skip introduction
            </button>
          </div>
        </header>

        <section className="intro-page">
          <div className="intro-scene" key={page}>
          {page === 'opening' && (
            <>
              <p className="eyebrow">Welcome to Tally</p>
              <h1>Tally takes a more personal and efficient approach to helping you reach your financial goals.</h1>
              <p>
                Here are six ways Tally makes budgeting easier to build, maintain, and understand.
              </p>
            </>
          )}

          {page === 'envelope-assistant' && (
            <>
              <p className="eyebrow">AI Envelope Assistant</p>
              <h1>Build a budget around your life.</h1>
              <p>
                Answer ten quick questions, and Tally will recommend a personalized set of
                envelopes based on how you spend, save, and organize your money.
              </p>
              <div className="intro-visual envelope-assistant-visual">
                <section className="assistant-question-preview">
                  <header>
                    <Bot size={16} />
                    <span>Questionnaire</span>
                  </header>
                  <div className="question-row">
                    <span>Relationship plans</span>
                    <strong>Date nights matter</strong>
                  </div>
                  <div className="question-row">
                    <span>Special interests</span>
                    <strong>Golf twice a month</strong>
                  </div>
                  <div className="question-row">
                    <span>Savings priority</span>
                    <strong>Build emergency reserve</strong>
                  </div>
                  <div className="assistant-run">
                    <Sparkles size={14} /> Tally personalizing your starting envelopes
                  </div>
                </section>
                <div className="assistant-transform-arrow" aria-hidden="true">
                  <ArrowRight size={20} />
                </div>
                <div className="envelope-grid personalized">
                  <article className="envelope-card needs">
                    <span>Needs</span>
                    <strong>Groceries</strong>
                  </article>
                  <article className="envelope-card wants personalized-a">
                    <span>Wants</span>
                    <strong>Date Nights</strong>
                  </article>
                  <article className="envelope-card wants personalized-b">
                    <span>Wants</span>
                    <strong>Golf</strong>
                  </article>
                  <article className="envelope-card savings personalized-c">
                    <span>Savings</span>
                    <strong>Emergency Fund</strong>
                  </article>
                </div>
              </div>
            </>
          )}

          {page === 'transaction-review' && (
            <>
              <p className="eyebrow">Guided Transaction Review</p>
              <h1>Review more transactions in less time.</h1>
              <p>
                Tally groups likely matches so you can approve the batch quickly, remove any
                outliers, and keep moving.
              </p>
              <div className="intro-visual transaction-review-visual">
                <div className="review-column dining">
                  <h3>
                    <UtensilsCrossed size={16} /> Dining
                  </h3>
                  <div className="review-item">
                    <span className="review-item-content">Chipotle · $18.42</span>
                    <span className="review-item-status">
                      <Check size={12} /> Categorized
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-item-content">Panera · $13.80</span>
                    <span className="review-item-status">
                      <Check size={12} /> Categorized
                    </span>
                  </div>
                  <div className="review-item wrong">Whole Foods · $86.31</div>
                  <div className="review-item">
                    <span className="review-item-content">Local Cafe · $9.14</span>
                    <span className="review-item-status">
                      <Check size={12} /> Categorized
                    </span>
                  </div>
                  <button className="review-approve-button" type="button">
                    <Check size={14} /> Approve dining batch
                  </button>
                </div>
                <div className="intro-mascot-cue review">
                  <MoneyPlantMascot
                    mood="hard-at-work"
                    className="mood-mascot small"
                    alt="Hard at work mascot"
                  />
                  <small>Tally catches merchant patterns as you review.</small>
                </div>
              </div>
            </>
          )}

          {page === 'text-categorization' && (
            <>
              <p className="eyebrow">Transaction Texting · Coming Soon</p>
              <h1>Keep your budget updated by text.</h1>
              <p>
                When a purchase needs your attention, reply to Tally&apos;s text to categorize it and
                immediately see your updated envelope balance.
              </p>
              <div className="intro-visual text-categorization-visual">
                <div className="phone-preview">
                  <div className="sms-bubble outbound">$42.18 at Trader Joe&apos;s. Add to Groceries?</div>
                  <div className="sms-bubble inbound">Yes</div>
                  <div className="sms-bubble outbound">Added to Groceries. $318.42 remaining.</div>
                </div>
                <div className="mini-budget-window">
                  <header>
                    <span>Groceries</span>
                    <strong>$318.42</strong>
                  </header>
                  <div className="mini-budget-track">
                    <span />
                  </div>
                </div>
              </div>
            </>
          )}

          {page === 'envelope-transfer' && (
            <>
              <p className="eyebrow">Envelope Transfers</p>
              <h1>Move money between envelopes in seconds.</h1>
              <p>
                When priorities shift, transfer money from one envelope to another without
                rebuilding your budget. Tally preserves your monthly plan while reflecting the
                change instantly.
              </p>
              <div className="intro-visual transfer-envelope-visual">
                <article className="transfer-envelope-card from">
                  <header>
                    <ShoppingBag size={15} /> Dining Out
                  </header>
                  <strong className="transfer-balance transfer-balance-surplus">
                    <span className="before">$260.00</span>
                    <span className="after">$160.00</span>
                  </strong>
                  <small>Surplus category funding another envelope</small>
                </article>
                <div className="transfer-arrow" aria-hidden="true">
                  <ArrowRight size={20} />
                </div>
                <article className="transfer-envelope-card to">
                  <header>
                    <Car size={15} /> Car Repairs
                  </header>
                  <strong className="transfer-balance transfer-balance-rescue">
                    <span className="before">-$45.00</span>
                    <span className="after">$55.00</span>
                  </strong>
                  <small>Moves from negative to positive</small>
                </article>
                <div className="transfer-chip transfer-chip-single" aria-hidden="true">
                  <Plus size={12} /> $100
                </div>
              </div>
            </>
          )}

          {page === 'month-in-review' && (
            <>
              <p className="eyebrow">Month in Review</p>
              <h1>Understand the story behind your month.</h1>
              <p>
                Tally transforms your monthly activity into a visual review of where your money
                went, which envelopes changed, and what may deserve your attention next.
              </p>
              <div className="intro-visual month-review-visual">
                <div className="review-story-frame">
                  <article className="review-story-card card-1">
                    <p>September recap</p>
                    <strong className="month-metric-shift">
                      <span className="intro-number-shift compact">
                        <span className="before">72</span>
                        <span className="after">86</span>
                      </span>{' '}
                      transactions
                    </strong>
                    <small>9 no-spend days</small>
                  </article>
                  <article className="review-story-card card-2">
                    <p>Top merchants</p>
                    <strong>Trader Joe&apos;s · Shell · Target</strong>
                    <small>$1,249 total at your top three</small>
                  </article>
                  <article className="review-story-card card-3">
                    <p>Envelope movement</p>
                    <strong>Up: Emergency Fund, Travel</strong>
                    <small>Down: Dining, Shopping</small>
                  </article>
                  <article className="review-story-card card-4">
                    <p>Ready for next month</p>
                    <strong>New ending balances saved</strong>
                    <small>Your monthly story assembles automatically.</small>
                  </article>
                </div>
                <div className="intro-mascot-cue month">
                  <MoneyPlantMascot mood="curious" className="mood-mascot small" alt="Curious mascot" />
                  <small>Each scene advances on its own to reveal your patterns.</small>
                </div>
                <div className="story-controls" aria-hidden="true">
                  <div className="story-dots">
                    <span className="active" />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </>
          )}

          {page === 'clean-slate' && (
            <>
              <p className="eyebrow">Clean Slate</p>
              <h1>Start fresh without abandoning your progress.</h1>
              <p>
                If your budget falls behind, Clean Slate lets you clear outdated activity while
                preserving your budget structure or begin again with a completely new budget.
              </p>
              <div className="intro-visual clean-slate-visual">
                <div className="clean-dashboard-shell" aria-hidden="true">
                  <header className="clean-dashboard-header">
                    <strong>Overview dashboard</strong>
                    <span>Before reset</span>
                  </header>

                  <div className="clean-dashboard-stats">
                    <article className="clean-stat-card overdue">
                      <span>Overdue categories</span>
                      <strong className="clean-shift-number">
                        <span className="before">4</span>
                        <span className="after">0</span>
                      </strong>
                    </article>
                    <article className="clean-stat-card negative">
                      <span>Negative envelopes</span>
                      <strong className="clean-shift-number">
                        <span className="before">3</span>
                        <span className="after">0</span>
                      </strong>
                    </article>
                    <article className="clean-stat-card pending">
                      <span>Unreviewed charges</span>
                      <strong className="clean-shift-number">
                        <span className="before">36</span>
                        <span className="after">0</span>
                      </strong>
                    </article>
                  </div>

                  <div className="clean-dashboard-main">
                    <section className="clean-dial-panel">
                      <div className="clean-dial-ring">
                        <div className="clean-dial-inner">
                          <small>Income used</small>
                          <strong className="clean-shift-number compact">
                            <span className="before">112%</span>
                            <span className="after">0%</span>
                          </strong>
                        </div>
                      </div>
                    </section>

                    <section className="clean-category-list">
                      <header className="clean-category-header">
                        <span>Category</span>
                        <span>Envelope balance</span>
                        <span>Usage</span>
                      </header>
                      <div className="clean-category-row">
                        <span className="clean-category-name">Dining</span>
                        <strong className="clean-row-balance negative">
                          <span className="before">-$118</span>
                          <span className="after">$0</span>
                        </strong>
                        <div className="clean-progress-track danger">
                          <span className="before" />
                          <span className="after" />
                        </div>
                      </div>
                      <div className="clean-category-row">
                        <span className="clean-category-name">Shopping</span>
                        <strong className="clean-row-balance negative">
                          <span className="before">-$64</span>
                          <span className="after">$0</span>
                        </strong>
                        <div className="clean-progress-track warning">
                          <span className="before" />
                          <span className="after" />
                        </div>
                      </div>
                      <div className="clean-category-row">
                        <span className="clean-category-name">Transportation</span>
                        <strong className="clean-row-balance negative">
                          <span className="before">-$29</span>
                          <span className="after">$0</span>
                        </strong>
                        <div className="clean-progress-track warning-soft">
                          <span className="before" />
                          <span className="after" />
                        </div>
                      </div>
                      <div className="clean-category-row">
                        <span className="clean-category-name">Groceries</span>
                        <strong className="clean-row-balance neutral">
                          <span className="before">Mismatch</span>
                          <span className="after">Aligned</span>
                        </strong>
                        <div className="clean-progress-track mismatch">
                          <span className="before" />
                          <span className="after" />
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="clean-reset-sweep" />
                </div>
                <div className="clean-slate-action">
                  <ArrowLeftRight size={16} /> Reset transactions and envelope totals
                </div>
                <p className="clean-slate-caption">Past transactions are cleared while your envelope structure stays intact.</p>
                <div className="intro-mascot-cue clean">
                  <MoneyPlantMascot mood="celebrating" className="mood-mascot small" alt="Celebrating mascot" />
                  <small>Reset complete. Your envelope structure is ready to use today.</small>
                </div>
              </div>
            </>
          )}
          </div>
        </section>

        <footer className="intro-footer">
          <div className="intro-progress-dots">
            {INTRO_PAGES.map((entry, index) => (
              <button
                aria-label={`Go to introduction page ${index + 1}`}
                className={index === pageIndex ? 'active' : ''}
                key={entry}
                onClick={() => {
                  setAutoPlayEnabled(false)
                  setPageIndex(index)
                }}
                type="button"
              />
            ))}
            <span>
              {pageIndex + 1} of {INTRO_PAGES.length}
            </span>
          </div>

          <div className="intro-actions">
            <button className="outline-action" disabled={isFirst} onClick={goBack} type="button">
              <ArrowLeft size={16} /> Back
            </button>
            <button className="primary-action" onClick={goNext} type="button">
              {isFirst
                ? 'Start guided preview'
                : isLast
                  ? 'Enter setup'
                  : 'Next'}{' '}
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

const ONBOARDING_STEPS = 9

function OnboardingWizard({
  state,
  onCommit,
  onExit,
  onFinish,
  username,
}: {
  state: PrototypeState
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
  onExit: () => void
  onFinish: () => void
  username: string
}) {
  const MISC_CANDIDATE_NAMES = ['misc', 'miscellaneous']

  const [step, setStep] = useState(1)
  const [nameInput, setNameInput] = useState(state.profile.name)
  const [nicknameInput, setNicknameInput] = useState(state.profile.nickname)
  const [incomeInput, setIncomeInput] = useState(
    state.monthlyIncome ? String(state.monthlyIncome) : '',
  )
  const [split, setSplit] = useState<AllocationSplit>({ needs: 50, wants: 30, savings: 20 })
  const [setupMode, setSetupMode] = useState<'manual' | 'ai' | null>(null)
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>(
    state.assistantSession?.answers ?? createEmptyOnboardingAnswers(),
  )
  const [onboardingSection, setOnboardingSection] = useState(state.assistantSession?.currentSection ?? 0)
  const [assistantError, setAssistantError] = useState('')
  const existingNames = new Set(state.categories.map((item) => item.name))
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set(existingNames))
  const [curatedNames, setCuratedNames] = useState<Set<string>>(
    new Set(
      (state.assistantSession?.categories ?? [])
        .filter((item) => item.selected)
        .map((item) => item.name),
    ),
  )
  const [customSuggestions, setCustomSuggestions] = useState<CategorySuggestion[]>([])
  const [showCreateEnvelopeModal, setShowCreateEnvelopeModal] = useState(false)
  const [customEnvelopeName, setCustomEnvelopeName] = useState('')
  const [customEnvelopeGroup, setCustomEnvelopeGroup] = useState<BudgetGroup>('Wants')
  const [customEnvelopeIconKey, setCustomEnvelopeIconKey] = useState(CUSTOM_ENVELOPE_ICON_OPTIONS[0].key)
  const [customEnvelopeError, setCustomEnvelopeError] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryGroup, setNewCategoryGroup] = useState<BudgetGroup>('Wants')
  const [phoneInput, setPhoneInput] = useState(state.profile.phone)
  const [smsConsent, setSmsConsent] = useState(false)
  const stickyBarRef = useRef<HTMLDivElement>(null)
  const [stickyBarHeight, setStickyBarHeight] = useState(0)

  const activeCategories = state.categories.filter((item) => !item.archived)
  const totalBudgeted = activeCategories.reduce((sum, item) => sum + item.monthlyTarget, 0)
  const income = Number(incomeInput) || 0
  const groupPct: Record<BudgetGroup, number> = {
    Needs: split.needs,
    Wants: split.wants,
    Savings: split.savings,
  }
  const groupAllocated = Object.fromEntries(
    GROUP_ORDER.map((group) => [
      group,
      activeCategories
        .filter((item) => item.group === group)
        .reduce((sum, item) => sum + item.monthlyTarget, 0),
    ]),
  ) as Record<BudgetGroup, number>
  const groupTargets = Object.fromEntries(
    GROUP_ORDER.map((group) => [group, (income * groupPct[group]) / 100]),
  ) as Record<BudgetGroup, number>
  const overGroups = GROUP_ORDER.filter(
    (group) => groupAllocated[group] > groupTargets[group] + 0.5,
  )
  const onboardingSuggestions = [...CATEGORY_SUGGESTIONS, ...customSuggestions]

  function estimateEnvelopeAmount(category: BudgetCategory): number {
    const groupCategories = activeCategories.filter((item) => item.group === category.group)
    const emptyCategories = groupCategories.filter((item) => item.monthlyTarget <= 0)
    const fundedCategories = groupCategories.filter((item) => item.monthlyTarget > 0)
    const remainingInGroup = Math.max(0, groupTargets[category.group] - groupAllocated[category.group])

    let suggested = 0
    if (emptyCategories.length > 0 && remainingInGroup > 0) {
      suggested = remainingInGroup / emptyCategories.length
    } else if (fundedCategories.length > 0) {
      suggested =
        fundedCategories.reduce((sum, item) => sum + item.monthlyTarget, 0) /
        fundedCategories.length
    } else {
      suggested = groupTargets[category.group] / Math.max(1, groupCategories.length)
    }

    const rounded = Math.round(suggested / 25) * 25
    return Math.max(25, rounded)
  }

  useEffect(() => {
    const bar = stickyBarRef.current
    if (!bar || step !== 6) return
    const observer = new ResizeObserver(() => setStickyBarHeight(bar.offsetHeight))
    observer.observe(bar)
    return () => observer.disconnect()
  }, [step])

  function toggleSuggestion(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function applyTemplate(template: 'essentials' | 'full' | 'curated') {
    const miscCategory = onboardingSuggestions.find((item) =>
      MISC_CANDIDATE_NAMES.includes(item.name.trim().toLowerCase()),
    )
    const miscName = miscCategory?.name ?? 'Misc'

    if (template === 'curated') {
      setSelectedNames(new Set([...existingNames, ...curatedNames, miscName]))
      return
    }
    const names = CATEGORY_SUGGESTIONS.filter((item) => item.templates.includes(template)).map(
      (item) => item.name,
    )
    setSelectedNames(new Set([...existingNames, ...names, miscName]))
  }

  function firstNameOrFallback() {
    const first = (nicknameInput || nameInput).trim().split(' ')[0]
    return first ? `${first}'s Curated Budget` : 'My Curated Budget'
  }

  async function goNext() {
    if (step === 4) {
      if (!setupMode) {
        setAssistantError('Choose how you want to build your budget to continue.')
        return
      }
      if (setupMode === 'manual') {
        setAssistantError('')
        setStep(5)
        return
      }
      // The 'ai' path is driven entirely by <AdaptiveOnboarding>, which calls
      // onFinish directly and advances past this shared footer button.
      return
    }

    if (step === 1) {
      onCommit({
        ...state,
        profile: { ...state.profile, name: nameInput.trim(), nickname: nicknameInput.trim() },
      })
    }
    if (step === 2) {
      onCommit({ ...state, monthlyIncome: income })
    }
    if (step === 5) {
      const toCreate = onboardingSuggestions.filter(
        (item) => selectedNames.has(item.name) && !existingNames.has(item.name),
      )
      if (toCreate.length > 0) {
        const newCategories: BudgetCategory[] = toCreate.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          group: item.group,
          monthlyTarget: 0,
          openingBalance: 0,
          warningThreshold: 80,
          archived: false,
        }))
        onCommit({ ...state, categories: [...state.categories, ...newCategories] })
      }
    }
    if (step === 8) {
      onCommit({ ...state, profile: { ...state.profile, phone: phoneInput.trim() } })
      if (smsConsent && phoneInput.trim()) {
        saveSmsConsent(username, phoneInput.trim(), true, 'Onboarding checkbox').catch(() => {})
      }
    }
    setStep((current) => Math.min(ONBOARDING_STEPS, current + 1))
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1))
  }

  function updateCategory(categoryId: string, patch: Partial<BudgetCategory>) {
    onCommit({
      ...state,
      categories: state.categories.map((item) =>
        item.id === categoryId ? { ...item, ...patch } : item,
      ),
    })
  }

  function addConnection() {
    const account: ConnectedAccount = {
      id: crypto.randomUUID(),
      nickname: 'New rewards card',
      institution: 'Demo Bank',
      lastFour: String(Math.floor(1000 + Math.random() * 9000)),
      status: 'connected',
      included: true,
    }
    onCommit({ ...state, accounts: [...state.accounts, account] })
  }

  function openCreateEnvelopeModal() {
    setCustomEnvelopeName('')
    setCustomEnvelopeGroup('Wants')
    setCustomEnvelopeIconKey(CUSTOM_ENVELOPE_ICON_OPTIONS[0].key)
    setCustomEnvelopeError('')
    setShowCreateEnvelopeModal(true)
  }

  function submitCustomEnvelope() {
    const trimmedName = customEnvelopeName.trim()
    if (!trimmedName) {
      setCustomEnvelopeError('Envelope name is required.')
      return
    }
    const exists = onboardingSuggestions.some(
      (item) => item.name.toLowerCase() === trimmedName.toLowerCase(),
    )
    if (exists) {
      setCustomEnvelopeError('An envelope with that name already exists in this setup list.')
      return
    }

    const iconOption =
      CUSTOM_ENVELOPE_ICON_OPTIONS.find((item) => item.key === customEnvelopeIconKey) ??
      CUSTOM_ENVELOPE_ICON_OPTIONS[0]

    const customSuggestion: CategorySuggestion = {
      name: trimmedName,
      group: customEnvelopeGroup,
      icon: iconOption.icon,
      templates: [],
      examples: defaultExamplesForGroup(customEnvelopeGroup),
    }

    setCustomSuggestions((prev) => [...prev, customSuggestion])
    setSelectedNames((prev) => new Set([...prev, trimmedName]))
    setShowCreateEnvelopeModal(false)
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div className="onboarding-brand">
            <img alt="Tally logo" className="brand-logo onboarding-logo" src={moneyPlantLogo} /> Tally
          </div>
          <div className="onboarding-progress">
            <span>
              Step {step} of {ONBOARDING_STEPS}
            </span>
            <div className="onboarding-progress-track">
              <span style={{ width: `${(step / ONBOARDING_STEPS) * 100}%` }} />
            </div>
          </div>
          <button className="text-button" onClick={onExit} type="button">
            Save and exit
          </button>
        </header>

        <div className="onboarding-body">
          {step === 1 && (
            <section className="onboarding-step">
              <p className="eyebrow">Welcome</p>
              <h1>What should we call you?</h1>
              <p className="onboarding-lead">This personalizes your dashboard greeting.</p>
              <label>
                Full name
                <input
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Jordan Riley"
                  value={nameInput}
                />
              </label>
              <label>
                Nickname
                <input
                  onChange={(event) => setNicknameInput(event.target.value)}
                  placeholder="Jordan"
                  value={nicknameInput}
                />
              </label>
            </section>
          )}

          {step === 2 && (
            <section className="onboarding-step">
              <p className="eyebrow">Income</p>
              <h1>What's your monthly take-home pay?</h1>
              <p className="onboarding-lead">
                The amount available for budgeting each month, after taxes.
              </p>
              <label>
                Monthly income
                <div className="income-edit-field">
                  <span>$</span>
                  <input
                    min="0"
                    onChange={(event) => setIncomeInput(event.target.value)}
                    type="number"
                    value={incomeInput}
                  />
                </div>
              </label>
            </section>
          )}

          {step === 3 && (
            <section className="onboarding-step wide">
              <p className="eyebrow">Allocation model</p>
              <h1>How should your budget be divided?</h1>
              <p className="onboarding-lead">
                Drag the handles or type exact percentages. This is a guideline while you build your
                envelopes — nothing is locked in.
              </p>
              <AllocationSlider onChange={setSplit} value={split} />
            </section>
          )}

          {step === 4 && !setupMode && (
            <section className="onboarding-step wide">
              <p className="eyebrow">Budget setup</p>
              <h1>Do you want guidance, or a template to pick from?</h1>
              <p className="onboarding-lead">
                Choose AI-guided setup for a curated starting point, or use templates and build
                manually.
              </p>
              <div className="assistant-entry-grid">
                <article className="assistant-entry-card">
                  <h2>Build with Tally</h2>
                  <p>
                    New to envelope budgeting? Answer a short set of questions and Tally will
                    create a budget around your lifestyle.
                  </p>
                  <button
                    className="primary-action"
                    onClick={() => {
                      setSetupMode('ai')
                      setAssistantError('')
                    }}
                    type="button"
                  >
                    Start AI assistant
                  </button>
                </article>
                <article className="assistant-entry-card">
                  <h2>Choose it yourself</h2>
                  <p>
                    Already experienced with the envelope system? Select a starter template or
                    create your budget manually.
                  </p>
                  <button
                    className="outline-action"
                    onClick={() => {
                      setSetupMode('manual')
                      setAssistantError('')
                    }}
                    type="button"
                  >
                    Use templates or build manually
                  </button>
                </article>
              </div>
              {assistantError && <p className="form-message">{assistantError}</p>}
            </section>
          )}

          {step === 4 && setupMode === 'manual' && (
            <section className="onboarding-step wide">
              <div className="assistant-manual-copy">
                <p className="eyebrow">Manual setup selected</p>
                <h1>Great. We'll take you to template selection next.</h1>
                <button className="text-button" onClick={() => setSetupMode(null)} type="button">
                  <ArrowLeft size={15} /> Switch to AI assistant
                </button>
              </div>
            </section>
          )}

          {step === 4 && setupMode === 'ai' && (
            <AdaptiveOnboarding
              initialAnswers={onboardingAnswers}
              initialSection={onboardingSection}
              onCancel={() => setSetupMode(null)}
              onFinish={(envelopes, summary) => {
                const assistantCategories: AssistantCategoryDraft[] = envelopes.map((item, index) => ({
                  id: crypto.randomUUID(),
                  name: item.name,
                  group: item.group.toLowerCase() as 'needs' | 'wants' | 'savings',
                  source: item.source === 'freeText' ? 'ai_custom' : 'rule',
                  reason: item.reason,
                  answerKeys: [item.source],
                  selected: true,
                  displayOrder: index,
                }))
                const nextCuratedNames = new Set(envelopes.map((item) => item.name))
                setCuratedNames(nextCuratedNames)
                setSelectedNames(new Set([...existingNames, ...nextCuratedNames]))

                const toCreate = envelopes.filter((item) => !existingNames.has(item.name))
                const newCategories: BudgetCategory[] = toCreate.map((item) => ({
                  id: crypto.randomUUID(),
                  name: item.name,
                  group: item.group,
                  monthlyTarget: 0,
                  openingBalance: 0,
                  warningThreshold: 80,
                  archived: false,
                }))

                onCommit(
                  {
                    ...state,
                    categories: [...state.categories, ...newCategories],
                    assistantSession: {
                      status: 'ready',
                      currentSection: onboardingSection,
                      promptVersion: ASSISTANT_PROMPT_VERSION,
                      answers: onboardingAnswers,
                      categories: assistantCategories,
                      summary,
                      templateName: firstNameOrFallback(),
                      updatedAt: new Date().toISOString(),
                    },
                  },
                  audit(
                    'Adaptive onboarding completed',
                    `Built ${envelopes.length} envelopes from your answers.`,
                  ),
                )
                setStep(6)
              }}
              onProgress={(answers, section) => {
                setOnboardingAnswers(answers)
                setOnboardingSection(section)
                onCommit({
                  ...state,
                  assistantSession: {
                    status: 'in_progress',
                    currentSection: section,
                    promptVersion: ASSISTANT_PROMPT_VERSION,
                    answers,
                    categories: state.assistantSession?.categories ?? [],
                    summary: state.assistantSession?.summary,
                    templateName: state.assistantSession?.templateName,
                    updatedAt: new Date().toISOString(),
                  },
                })
              }}
            />
          )}

          {step === 5 && (
            <section className="onboarding-step wide">
              <p className="eyebrow">Category template</p>
              <h1>Pick the envelopes you want to start with.</h1>
              <div className="onboarding-mascot-row">
                <MoneyPlantMascot
                  mood={state.assistantSession?.status === 'ready' ? 'excited' : 'hard-at-work'}
                  className="mood-mascot medium"
                  alt="Envelope assistant mascot"
                />
                <small>
                  {state.assistantSession?.status === 'ready'
                    ? 'Your personalized template is ready. Pick what fits you best.'
                    : 'Your setup assistant is working with you to shape the right starting envelopes.'}
                </small>
              </div>
              <p className="onboarding-lead">
                Choose a starter template, then add or remove any category. You can rename and
                adjust everything later.
              </p>
              {state.assistantSession?.status === 'ready' && (
                <p className="assistant-summary">
                  Tally created this starting point from your answers. You can change anything
                  before continuing.
                </p>
              )}
              <div className="onboarding-templates">
                <button
                  className="outline-action"
                  onClick={() => applyTemplate('essentials')}
                  type="button"
                >
                  Essentials only
                </button>
                <button
                  className="outline-action"
                  onClick={() => applyTemplate('full')}
                  type="button"
                >
                  Full picture
                </button>
                {curatedNames.size > 0 && (
                  <button className="primary-action" onClick={() => applyTemplate('curated')} type="button">
                    {state.assistantSession?.templateName || firstNameOrFallback()}
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => setSelectedNames(new Set(existingNames))}
                  type="button"
                >
                  Clear selection
                </button>
                <button className="outline-action" onClick={openCreateEnvelopeModal} type="button">
                  <Plus size={16} /> Create your own envelope
                </button>
              </div>
              <div className="onboarding-suggestion-groups">
                {GROUP_ORDER.map((group) => {
                  const groupItems = onboardingSuggestions.filter((item) => item.group === group)
                  return (
                    <section className="onboarding-suggestion-group" key={group}>
                      <header>
                        <span className={`group-pill ${group.toLowerCase()}`}>{group}</span>
                        <small>{groupItems.length} options</small>
                      </header>
                      <div className="onboarding-category-grid">
                        {groupItems.map((item) => {
                          const Icon = item.icon
                          const selected = selectedNames.has(item.name)
                          const createdForYou = curatedNames.has(item.name) && !CATEGORY_SUGGESTIONS.some(
                            (base) => base.name.toLowerCase() === item.name.toLowerCase(),
                          )
                          return (
                            <button
                              className={`onboarding-category-tile ${item.group.toLowerCase()} ${selected ? 'selected' : ''}`}
                              key={`${group}-${item.name}`}
                              onClick={() => toggleSuggestion(item.name)}
                              type="button"
                            >
                              <Icon size={20} />
                              <span>{item.name}</span>
                              <span className="group-pill">{item.group}</span>
                              {createdForYou && <small className="created-for-you">Created for you</small>}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </section>
          )}

          {showCreateEnvelopeModal && (
            <div className="modal-overlay">
              <div className="modal-card create-envelope-modal">
                <h2>Create your envelope</h2>
                <p>Choose a name, category, and icon to add a custom option to this setup step.</p>
                <label>
                  Envelope name
                  <input
                    onChange={(event) => setCustomEnvelopeName(event.target.value)}
                    placeholder="e.g. Childcare"
                    value={customEnvelopeName}
                  />
                </label>
                <label>
                  Envelope category
                  <select
                    onChange={(event) => setCustomEnvelopeGroup(event.target.value as BudgetGroup)}
                    value={customEnvelopeGroup}
                  >
                    <option value="Needs">Needs</option>
                    <option value="Wants">Wants</option>
                    <option value="Savings">Savings</option>
                  </select>
                </label>
                <div className="create-envelope-icon-picker">
                  <span>Envelope icon</span>
                  <div className="create-envelope-icon-grid">
                    {CUSTOM_ENVELOPE_ICON_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const selected = customEnvelopeIconKey === option.key
                      return (
                        <button
                          className={selected ? 'selected' : ''}
                          key={option.key}
                          onClick={() => setCustomEnvelopeIconKey(option.key)}
                          type="button"
                        >
                          <Icon size={17} />
                          <small>{option.label}</small>
                        </button>
                      )
                    })}
                  </div>
                </div>
                {customEnvelopeError && <p className="form-message">{customEnvelopeError}</p>}
                <div className="modal-actions">
                  <button
                    className="outline-action"
                    onClick={() => setShowCreateEnvelopeModal(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="primary-action" onClick={submitCustomEnvelope} type="button">
                    Add envelope
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <>
              <div className="allocation-sticky-bar" ref={stickyBarRef}>
                <div className="allocation-sticky-inner">
                  <p className="eyebrow">Build your envelopes</p>
                  <h1>Set a monthly amount for each envelope.</h1>
                  <AllocationSlider compact onChange={setSplit} value={split} />
                  <div className="mini-gauge-row">
                    {GROUP_ORDER.map((group) => (
                      <GroupDial
                        allocated={groupAllocated[group]}
                        group={group}
                        key={group}
                        target={groupTargets[group]}
                      />
                    ))}
                  </div>
                  <div className="tracker-inline">
                    <TotalTracker allocated={totalBudgeted} income={income} />
                  </div>
                </div>
              </div>

              {(totalBudgeted > income || overGroups.length > 0) && (
                <section className="attention-banner over-budget-banner onboarding-warning">
                  <div>
                    <Sparkles size={20} />
                    <div>
                      {totalBudgeted > income && (
                        <p>
                          <strong>
                            You're allocating {money(totalBudgeted - income)} more than your income.
                          </strong>
                        </p>
                      )}
                      {overGroups.length > 0 && (
                        <ul>
                          {overGroups.map((group) => (
                            <li key={group}>
                              <strong>{group}</strong> is{' '}
                              {money(groupAllocated[group] - groupTargets[group])} over its{' '}
                              {groupPct[group]}% guideline ({money(groupTargets[group])}).
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <section className="onboarding-step wide step5-columns">
                <div className="step5-tables">
                  <div className="category-toolbar">
                    <span>{activeCategories.length} envelopes</span>
                    <label className="inline-add">
                      <input
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        placeholder="New envelope name"
                        value={newCategoryName}
                      />
                      <select
                        aria-label="New envelope group"
                        onChange={(event) => setNewCategoryGroup(event.target.value as BudgetGroup)}
                        value={newCategoryGroup}
                      >
                        <option value="Needs">Needs</option>
                        <option value="Wants">Wants</option>
                        <option value="Savings">Savings</option>
                      </select>
                      <button
                        onClick={() => {
                          if (!newCategoryName.trim()) return
                          const category: BudgetCategory = {
                            id: crypto.randomUUID(),
                            name: newCategoryName.trim(),
                            group: newCategoryGroup,
                            monthlyTarget: 0,
                            openingBalance: 0,
                            warningThreshold: 80,
                            archived: false,
                          }
                          onCommit({ ...state, categories: [...state.categories, category] })
                          setNewCategoryName('')
                        }}
                        title="Add envelope"
                        type="button"
                      >
                        <Plus size={17} /> Add envelope
                      </button>
                    </label>
                  </div>
                  {GROUP_ORDER.map((group) => {
                    const groupCategories = activeCategories.filter((item) => item.group === group)
                    return (
                      <div className="group-table-block" key={group}>
                        <div className="group-table-heading">
                          <span className={`group-pill ${group.toLowerCase()}`}>{group}</span>
                          <small>
                            {money(groupAllocated[group])} of {money(groupTargets[group])} guideline
                          </small>
                        </div>
                        <table className="category-table editable-table">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th className="num">Monthly amount</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupCategories.length === 0 ? (
                              <tr>
                                <td className="empty-row" colSpan={3}>
                                  No {group.toLowerCase()} envelopes yet.
                                </td>
                              </tr>
                            ) : (
                              groupCategories.map((category) => (
                                <tr className={group.toLowerCase()} key={category.id}>
                                  <td>
                                    <div className="cat-name-cell">
                                      <input
                                        aria-label="Category name"
                                        onChange={(event) =>
                                          updateCategory(category.id, { name: event.target.value })
                                        }
                                        value={category.name}
                                      />
                                    </div>
                                  </td>
                                  <td className="num">
                                    <label className="inline-currency">
                                      <span>$</span>
                                      <input
                                        aria-label={`${category.name} amount`}
                                        min="0"
                                        onChange={(event) =>
                                          updateCategory(category.id, {
                                            monthlyTarget:
                                              event.target.value === '' ? 0 : Number(event.target.value),
                                          })
                                        }
                                        placeholder={String(estimateEnvelopeAmount(category))}
                                        type="number"
                                        value={category.monthlyTarget === 0 ? '' : String(category.monthlyTarget)}
                                      />
                                    </label>
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <select
                                        aria-label={`${category.name} group`}
                                        onChange={(event) =>
                                          updateCategory(category.id, {
                                            group: event.target.value as BudgetGroup,
                                          })
                                        }
                                        value={category.group}
                                      >
                                        <option value="Needs">Needs</option>
                                        <option value="Wants">Wants</option>
                                        <option value="Savings">Savings</option>
                                      </select>
                                      <button
                                        className="icon-button danger"
                                        onClick={() =>
                                          onCommit({
                                            ...state,
                                            categories: state.categories.filter(
                                              (item) => item.id !== category.id,
                                            ),
                                          })
                                        }
                                        title={`Remove ${category.name}`}
                                        type="button"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
                <aside className="tracker-sidebar" style={{ top: stickyBarHeight + 16 }}>
                  <TotalTracker allocated={totalBudgeted} income={income} />
                </aside>
              </section>
            </>
          )}

          {step === 7 && (
            <section className="onboarding-step">
              <p className="eyebrow">Connect accounts</p>
              <h1>Link a credit card to watch for new charges.</h1>
              <p className="onboarding-lead">
                Simulated for this prototype — no real bank credentials are used. You can skip this
                and add it later from Settings.
              </p>
              {state.accounts.length === 0 ? (
                <button className="primary-action" onClick={addConnection} type="button">
                  <CreditCard size={17} /> Connect a card (simulated)
                </button>
              ) : (
                state.accounts.map((account) => (
                  <div className="onboarding-connected-account" key={account.id}>
                    <CreditCard size={18} />
                    <span>
                      {account.nickname} · {account.institution} ·•••• {account.lastFour}
                    </span>
                  </div>
                ))
              )}
            </section>
          )}

          {step === 8 && (
            <section className="onboarding-step">
              <p className="eyebrow">Notifications</p>
              <h1>Where should we text you about new charges?</h1>
              <p className="onboarding-lead">
                Simulated SMS — no real text messages are sent in this prototype. You can skip this
                and add it later from Settings.
              </p>
              <label>
                Mobile number
                <input
                  onChange={(event) => setPhoneInput(event.target.value)}
                  placeholder="(555) 555-0100"
                  value={phoneInput}
                />
              </label>
              <label className="inline-add">
                <input
                  checked={smsConsent}
                  onChange={(event) => setSmsConsent(event.target.checked)}
                  type="checkbox"
                />
                I agree to receive text messages from Tally about my purchases and budget. Reply
                STOP at any time to opt out.
              </label>
            </section>
          )}

          {step === 9 && (
            <section className="onboarding-step">
              <p className="eyebrow">Review</p>
              <h1>You're ready to go, {nicknameInput || nameInput.split(' ')[0] || 'there'}.</h1>
              <div className="onboarding-summary">
                <div>
                  <span>Monthly income</span>
                  <strong>{money(income)}</strong>
                </div>
                <div>
                  <span>Envelopes</span>
                  <strong>{activeCategories.length}</strong>
                </div>
                <div>
                  <span>Total budgeted</span>
                  <strong>{money(totalBudgeted)}</strong>
                </div>
                <div>
                  <span>Connected accounts</span>
                  <strong>{state.accounts.length}</strong>
                </div>
              </div>
            </section>
          )}
        </div>

        {!(step === 4 && setupMode === 'ai') && (
          <footer className="onboarding-footer">
            <button className="outline-action" disabled={step === 1} onClick={goBack} type="button">
              <ArrowLeft size={16} /> Back
            </button>
            {step < ONBOARDING_STEPS ? (
              <button className="primary-action" onClick={() => void goNext()} type="button">
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button className="primary-action" onClick={onFinish} type="button">
                <Check size={17} /> Finish setup
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function CategoriesView({
  state,
  onCommit,
  onOpenSettings,
}: {
  state: PrototypeState
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
  onOpenSettings: () => void
}) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryGroup, setNewCategoryGroup] = useState<BudgetGroup>('Wants')
  const [showCreateEnvelopeModal, setShowCreateEnvelopeModal] = useState(false)
  const [showMoneyModal, setShowMoneyModal] = useState(false)
  const [pendingOverBudget, setPendingOverBudget] = useState<{
    categoryId: string
    previousValue: number
    newTotal: number
  } | null>(null)
  const focusValues = useRef<Record<string, number>>({})

  const activeCategories = state.categories
  const totalBudgeted = activeCategories.reduce((sum, item) => sum + item.monthlyTarget, 0)
  const remaining = state.monthlyIncome - totalBudgeted
  const isOverBudget = remaining < 0
  const groupTotals = GROUP_ORDER.map((group) => ({
    group,
    total: activeCategories
      .filter((item) => item.group === group)
      .reduce((sum, item) => sum + item.monthlyTarget, 0),
  }))
  const incomeBase = state.monthlyIncome > 0 ? state.monthlyIncome : Math.max(totalBudgeted, 1)
  const widthBase = totalBudgeted > incomeBase ? totalBudgeted : incomeBase
  const formatIncomeShare = (amount: number) => {
    const rawPct = (amount / incomeBase) * 100
    if (amount > 0 && rawPct < 1) return '<1%'
    return `${Math.round(rawPct)}%`
  }
  const groupBreakdown: Array<{ key: string; label: string; className: string; pct: string; width: number }> =
    groupTotals.map(({ group, total }) => ({
      key: group,
      label: group,
      className: group.toLowerCase(),
      pct: formatIncomeShare(total),
      width: (total / widthBase) * 100,
    }))
  const unallocated = Math.max(0, state.monthlyIncome - totalBudgeted)
  if (unallocated > 0) {
    groupBreakdown.push({
      key: 'unallocated',
      label: 'Unallocated',
      className: 'unallocated',
      pct: formatIncomeShare(unallocated),
      width: (unallocated / widthBase) * 100,
    })
  }
  const barSegments = groupBreakdown.map((segment) => ({
    ...segment,
    width: Math.max(0, Math.min(segment.width, 100)),
  }))
  let usedWidth = 0
  const normalizedBarSegments = barSegments.map((segment, index) => {
    if (index === barSegments.length - 1) {
      const finalWidth = Math.max(0, 100 - usedWidth)
      return { ...segment, width: finalWidth }
    }
    const width = Math.max(0, Math.min(segment.width, 100 - usedWidth))
    usedWidth += width
    return { ...segment, width }
  })

  function updateCategory(categoryId: string, patch: Partial<BudgetCategory>) {
    onCommit({
      ...state,
      categories: state.categories.map((item) =>
        item.id === categoryId ? { ...item, ...patch } : item,
      ),
    })
  }

  function handleTargetBlur(category: BudgetCategory) {
    const previousValue = focusValues.current[category.id]
    delete focusValues.current[category.id]
    if (previousValue === undefined) return
    const newTotal = state.categories.reduce((sum, item) => sum + item.monthlyTarget, 0)
    const totalBeforeThisEdit = newTotal - category.monthlyTarget + previousValue
    const wasAlreadyOver = state.monthlyIncome - totalBeforeThisEdit < 0
    if (newTotal > state.monthlyIncome && !wasAlreadyOver) {
      setPendingOverBudget({ categoryId: category.id, previousValue, newTotal })
    }
  }

  function addEnvelope(event?: FormEvent) {
    event?.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    const category: BudgetCategory = {
      id: crypto.randomUUID(),
      name,
      group: newCategoryGroup,
      monthlyTarget: 0,
      openingBalance: 0,
      warningThreshold: 80,
      archived: false,
    }
    onCommit(
      { ...state, categories: [...state.categories, category] },
      audit('Category created', `${category.name} added to ${category.group}.`),
    )
    setNewCategoryName('')
    setNewCategoryGroup('Wants')
    setShowCreateEnvelopeModal(false)
  }

  return (
    <>
      <PageHeading
        eyebrow="Budget structure"
        title="Envelopes and income."
        description="Add, edit, regroup, or remove envelopes and see how they compare to your income as you go."
      />
      {isOverBudget && (
        <section className="attention-banner over-budget-banner">
          <div>
            <Sparkles size={20} />
            <span>
              <strong>You're allocating {money(Math.abs(remaining))} more than your income.</strong>{' '}
              Lower an envelope or raise your income to close the gap.
            </span>
          </div>
        </section>
      )}
      <div className="budget-overview">
        <div className="budget-overview-stats">
          <div className="income-readonly-card">
            <span>Monthly income</span>
            <strong>{money(state.monthlyIncome)}</strong>
            <button className="text-button" onClick={onOpenSettings} type="button">
              Edit in Settings <ArrowRight size={14} />
            </button>
          </div>
          <div className={`budget-total-stat ${isOverBudget ? 'over' : ''}`}>
            <span>Total budgeted</span>
            <strong>{money(totalBudgeted)}</strong>
          </div>
          <div className={`budget-total-stat ${isOverBudget ? 'over' : ''}`}>
            <span>{isOverBudget ? 'Over income by' : 'Remaining to allocate'}</span>
            <strong>{money(Math.abs(remaining))}</strong>
          </div>
        </div>
        <div className="budget-donut-wrap">
          <div className="budget-split-summary">
            <strong>{money(totalBudgeted)}</strong>
            <span>budgeted</span>
          </div>
          <div className="budget-split-track" role="img" aria-label="Envelope allocation by group">
            {normalizedBarSegments.map(({ key, className, width }, index) => (
              <span
                className={`allocation-segment ${className} ${index === 0 ? 'first' : ''} ${index === groupBreakdown.length - 1 ? 'last' : ''}`}
                key={key}
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          <ul className="budget-donut-legend">
            {groupBreakdown.map(({ key, label, className, pct }) => (
              <li className={className} key={key}>
                <i /> {label} <b>{pct}</b>
              </li>
            ))}
          </ul>
          <small>Guideline: 50% Needs · 30% Wants · 20% Savings</small>
        </div>
      </div>
      <div className="category-toolbar">
        <span>{activeCategories.length} active envelopes</span>
        <div className="category-toolbar-actions categories-toolbar-actions">
          <button className="outline-action" onClick={() => setShowMoneyModal(true)} type="button">
            <ArrowLeftRight size={16} /> Add / transfer money
          </button>
          <button
            className="outline-action"
            onClick={() => setShowCreateEnvelopeModal(true)}
            type="button"
          >
            <Plus size={17} /> Add envelope
          </button>
        </div>
      </div>
      <table className="category-table editable-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Group</th>
            <th className="num">Monthly contribution</th>
            <th>Actions</th>
          </tr>
        </thead>
        {GROUP_ORDER.map((group) => {
          const items = state.categories.filter((category) => category.group === group)
          if (items.length === 0) return null
          const groupBudgeted = items
            .filter((item) => !item.archived)
            .reduce((sum, item) => sum + item.monthlyTarget, 0)
          return (
            <tbody className={group.toLowerCase()} key={group}>
              <tr className="group-header-row">
                <td colSpan={4}>
                  <div className="group-header-content">
                    <span className="group-name">
                      <i /> {group} · {items.length}{' '}
                      {items.length === 1 ? 'category' : 'categories'}
                    </span>
                    <span className="group-totals">
                      <span>
                        Budgeted {money(groupBudgeted)}
                        {state.monthlyIncome > 0
                          ? ` (${Math.round((groupBudgeted / state.monthlyIncome) * 100)}% of income)`
                          : ''}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
              {items.map((category) => (
                <tr
                  className={category.group.toLowerCase()}
                  key={category.id}
                >
                  <td>
                    <div className="cat-name-cell">
                      <input
                        aria-label="Category name"
                        value={category.name}
                        onChange={(event) =>
                          updateCategory(category.id, { name: event.target.value })
                        }
                      />
                    </div>
                  </td>
                  <td>
                    <select
                      aria-label={`${category.name} group`}
                      value={category.group}
                      onChange={(event) =>
                        onCommit(
                          {
                            ...state,
                            categories: state.categories.map((item) =>
                              item.id === category.id
                                ? { ...item, group: event.target.value as BudgetCategory['group'] }
                                : item,
                            ),
                          },
                          audit(
                            'Category regrouped',
                            `${category.name} moved to ${event.target.value}.`,
                          ),
                        )
                      }
                    >
                      <option value="Needs">Needs</option>
                      <option value="Wants">Wants</option>
                      <option value="Savings">Savings</option>
                    </select>
                  </td>
                  <td className="num">
                    <label className="inline-currency">
                      <span>$</span>
                      <input
                        aria-label={`${category.name} monthly contribution`}
                        min="0"
                        type="number"
                        value={category.monthlyTarget}
                        onFocus={() => {
                          focusValues.current[category.id] = category.monthlyTarget
                        }}
                        onChange={(event) =>
                          updateCategory(category.id, { monthlyTarget: Number(event.target.value) })
                        }
                        onBlur={() => handleTargetBlur(category)}
                      />
                    </label>
                  </td>
                  <td>
                    <div className="category-setting-actions">
                      <button
                        className="icon-button danger"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Delete ${category.name}? Past transactions will move to "Needs review".`,
                          )
                          if (!confirmed) {
                            return
                          }
                          const confirmedAgain = window.confirm(
                            `Are you absolutely sure you want to delete ${category.name}? This can't be undone.`,
                          )
                          if (!confirmedAgain) {
                            return
                          }
                          onCommit(
                            {
                              ...state,
                              categories: state.categories.filter(
                                (item) => item.id !== category.id,
                              ),
                              transactions: state.transactions.map((item) =>
                                item.categoryId === category.id
                                  ? { ...item, categoryId: null }
                                  : item,
                              ),
                            },
                            audit('Category deleted', `${category.name} removed.`),
                          )
                        }}
                        title={`Delete ${category.name}`}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          )
        })}
      </table>
      {pendingOverBudget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>This puts you over budget</h2>
            <p>
              Your envelopes now add up to {money(pendingOverBudget.newTotal)}, which is{' '}
              {money(pendingOverBudget.newTotal - state.monthlyIncome)} more than your{' '}
              {money(state.monthlyIncome)} monthly income.
            </p>
            <div className="modal-actions">
              <button
                className="outline-action"
                onClick={() => {
                  updateCategory(pendingOverBudget.categoryId, {
                    monthlyTarget: pendingOverBudget.previousValue,
                  })
                  setPendingOverBudget(null)
                }}
                type="button"
              >
                Revert change
              </button>
              <button
                className="primary-action"
                onClick={() => setPendingOverBudget(null)}
                type="button"
              >
                Keep it anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreateEnvelopeModal && (
        <div className="modal-overlay">
          <div className="modal-card create-envelope-modal">
            <h2>Add envelope</h2>
            <p>Give your new envelope a name and choose which budget group it belongs to.</p>
            <form
              onSubmit={(event) => {
                void addEnvelope(event)
              }}
            >
              <label>
                Envelope name
                <input
                  autoFocus
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="e.g. Childcare"
                  value={newCategoryName}
                />
              </label>
              <label>
                Envelope category
                <select
                  onChange={(event) => setNewCategoryGroup(event.target.value as BudgetGroup)}
                  value={newCategoryGroup}
                >
                  <option value="Needs">Needs</option>
                  <option value="Wants">Wants</option>
                  <option value="Savings">Savings</option>
                </select>
              </label>
              <div className="modal-actions">
                <button
                  className="outline-action"
                  onClick={() => {
                    setShowCreateEnvelopeModal(false)
                    setNewCategoryName('')
                    setNewCategoryGroup('Wants')
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="primary-action" disabled={!newCategoryName.trim()} type="submit">
                  Add envelope
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showMoneyModal && (
        <MoneyMoveModal
          onClose={() => setShowMoneyModal(false)}
          onCommit={onCommit}
          state={state}
        />
      )}
    </>
  )
}

function SettingsView({
  state,
  tab,
  onTab,
  onCommit,
  onLogout,
  username,
  onReplaceState,
  onGoOverview,
  onSetFlashMessage,
}: {
  state: PrototypeState
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
  onLogout: () => void
  username: string
  onReplaceState: (next: PrototypeState) => void
  onGoOverview: () => void
  onSetFlashMessage: (message: string) => void
}) {
  const [smsConsented, setSmsConsented] = useState(false)
  const [showCleanSlate, setShowCleanSlate] = useState(false)
  const [cleanSlateStep, setCleanSlateStep] = useState<
    'choose' | 'resetWarning' | 'resetFinal' | 'newBudgetFinal'
  >('choose')
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [cleanSlateBusy, setCleanSlateBusy] = useState(false)
  const [cleanSlateError, setCleanSlateError] = useState('')

  const hasActiveBudget =
    state.categories.length > 0 || state.monthlyIncome > 0 || state.onboardingComplete

  useEffect(() => {
    getSmsConsent(username)
      .then((consent) => setSmsConsented(Boolean(consent && !consent.optedOutAt)))
      .catch(() => {})
  }, [username])

  function toggleSmsConsent(checked: boolean) {
    setSmsConsented(checked)
    if (!state.profile.phone.trim()) return
    saveSmsConsent(username, state.profile.phone.trim(), checked, 'Settings checkbox').catch(
      () => {},
    )
  }

  function openCleanSlate() {
    setShowCleanSlate(true)
    setCleanSlateStep('choose')
    setDeleteConfirmInput('')
    setCleanSlateError('')
  }

  function closeCleanSlate() {
    if (cleanSlateBusy) return
    setShowCleanSlate(false)
    setCleanSlateStep('choose')
    setDeleteConfirmInput('')
    setCleanSlateError('')
  }

  async function executeCleanSlate(resetType: CleanSlateResetType) {
    setCleanSlateBusy(true)
    setCleanSlateError('')
    try {
      const response = await runCleanSlate(username, resetType, crypto.randomUUID())
      onReplaceState(response.state)
      onSetFlashMessage(
        resetType === 'reset_transactions'
          ? 'Your clean slate is ready. Your envelopes and monthly contributions are still here, and you can move forward from today.'
          : 'Your old budget was removed. You are ready for a brand new start whenever you are.',
      )
      setShowCleanSlate(false)
      onGoOverview()
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to complete your reset.'
      setCleanSlateError(detail)
    } finally {
      setCleanSlateBusy(false)
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Your budget, connections, and security."
        description="Manage the parts of Tally that shape your daily experience."
      />
      <div className="settings-tabs">
        {(['profile', 'accounts', 'budget'] as const).map((item) => (
          <button
            className={tab === item ? 'active' : ''}
            key={item}
            onClick={() => onTab(item)}
            type="button"
          >
            {item === 'profile' ? (
              <UserRound size={17} />
            ) : item === 'accounts' ? (
              <CreditCard size={17} />
            ) : (
              <Tag size={17} />
            )}
            {item === 'profile'
              ? 'Profile'
              : item === 'accounts'
                ? 'Accounts'
                : 'Envelopes & Budget'}
          </button>
        ))}
      </div>
      {tab === 'profile' && (
        <div className="settings-grid">
          <section className="settings-panel">
            <h2>Profile</h2>
            <label>
              Display name
              <input
                value={state.profile.name}
                onChange={(event) =>
                  onCommit({ ...state, profile: { ...state.profile, name: event.target.value } })
                }
              />
            </label>
            <label>
              Username
              <input
                value={state.profile.username}
                onChange={(event) =>
                  onCommit({
                    ...state,
                    profile: { ...state.profile, username: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Monthly income
              <input
                min="0"
                type="number"
                value={state.monthlyIncome}
                onChange={(event) => {
                  const nextIncome = Number(event.target.value) || 0
                  onCommit(
                    { ...state, monthlyIncome: nextIncome },
                    audit('Monthly income updated', money(nextIncome)),
                  )
                }}
              />
            </label>
            <label>
              Email
              <input
                value={state.profile.email}
                onChange={(event) =>
                  onCommit({ ...state, profile: { ...state.profile, email: event.target.value } })
                }
              />
            </label>
            <label>
              SMS number
              <input
                value={state.profile.phone}
                onChange={(event) =>
                  onCommit({ ...state, profile: { ...state.profile, phone: event.target.value } })
                }
              />
            </label>
            <label className="inline-add">
              <input
                checked={smsConsented}
                onChange={(event) => toggleSmsConsent(event.target.checked)}
                type="checkbox"
              />
              Send me texts about my purchases and budget. Reply STOP any time to opt out.
            </label>
          </section>
          <section className="settings-panel">
            <h2>Security & data</h2>
            <div className="setting-row">
              <div>
                <strong>Automatic session lock</strong>
                <small>Locks after 5 minutes of inactivity</small>
              </div>
              <span className="status-pill healthy">On</span>
            </div>
            <button className="outline-action full" type="button">
              <Download size={17} /> Export budget as CSV
            </button>
            <button className="outline-action full" onClick={onLogout} type="button">
              <LogOut size={17} /> Lock this session
            </button>
            <div className="danger-zone">
              <strong>Delete account</strong>
              <p>
                Immediately disables login and bank access. Data remains recoverable for 30 days.
              </p>
              <button type="button">Begin deletion</button>
            </div>
          </section>
        </div>
      )}
      {tab === 'accounts' && (
        <section className="settings-panel wide-panel">
          <div className="panel-title">
            <div>
              <h2>Connected cards</h2>
              <p>Tally stores provider connection state, never bank credentials.</p>
            </div>
            <button
              className="primary-action"
              onClick={() => {
                const account = {
                  id: crypto.randomUUID(),
                  nickname: 'New rewards card',
                  institution: 'Demo Bank',
                  lastFour: '1204',
                  status: 'connected' as const,
                  included: true,
                }
                onCommit(
                  { ...state, accounts: [...state.accounts, account] },
                  audit(
                    'Account connected',
                    `${account.nickname} added through simulated provider.`,
                  ),
                )
              }}
              type="button"
            >
              <Plus size={17} /> Add connection
            </button>
          </div>
          {state.accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <span className="account-icon">
                <CreditCard size={19} />
              </span>
              <div>
                <input
                  aria-label="Card nickname"
                  value={account.nickname}
                  onChange={(event) =>
                    onCommit({
                      ...state,
                      accounts: state.accounts.map((item) =>
                        item.id === account.id ? { ...item, nickname: event.target.value } : item,
                      ),
                    })
                  }
                />
                <small>
                  {account.institution} ·•••• {account.lastFour}
                </small>
              </div>
              <span
                className={`status-pill ${account.status === 'connected' ? 'healthy' : account.status === 'attention' ? 'near' : ''}`}
              >
                {account.status}
              </span>
              <button
                className="icon-button"
                onClick={() =>
                  onCommit(
                    {
                      ...state,
                      accounts: state.accounts.map((item) =>
                        item.id === account.id ? { ...item, status: 'connected' } : item,
                      ),
                    },
                    audit('Account reconnected', account.nickname),
                  )
                }
                title="Reconnect account"
                type="button"
              >
                <RefreshCw size={17} />
              </button>
              <label className="switch">
                <input
                  checked={account.included}
                  onChange={(event) =>
                    onCommit({
                      ...state,
                      accounts: state.accounts.map((item) =>
                        item.id === account.id ? { ...item, included: event.target.checked } : item,
                      ),
                    })
                  }
                  type="checkbox"
                />
                <span />
              </label>
            </article>
          ))}
        </section>
      )}
      {tab === 'budget' && (
        <section className="settings-panel">
          <h2>Envelopes and budget settings</h2>
          <p className="section-copy">
            Manage how your envelope budget behaves, including full reset options.
          </p>
          <div className="clean-slate-entry">
            <strong className="clean-slate-entry-title">
              <Sparkles size={16} /> Need a reset?
            </strong>
            <p>
              Falling behind happens. Start fresh whenever you need to-your next step matters more
              than your last one.
            </p>
            <button className="outline-action full" onClick={openCleanSlate} type="button">
              Clean Slate
            </button>
          </div>
        </section>
      )}

      {showCleanSlate && (
        <div className="modal-overlay">
          <div className="modal-card clean-slate-modal">
            <button
              aria-label="Close clean slate"
              className="modal-exit"
              disabled={cleanSlateBusy}
              onClick={closeCleanSlate}
              type="button"
            >
              <X size={16} />
            </button>
            <h2>Clean Slate</h2>
            <div className="clean-slate-mascot-wrap">
              <MoneyPlantMascot
                mood={
                  cleanSlateStep === 'choose'
                    ? 'tired'
                    : cleanSlateStep === 'newBudgetFinal'
                      ? 'curious'
                      : cleanSlateStep === 'resetFinal'
                        ? 'sad'
                        : 'hard-at-work'
                }
                className="mood-mascot medium"
                alt="Clean slate status mascot"
              />
            </div>
            {cleanSlateStep === 'choose' && (
              <>
                <p>
                  Sometimes the best way forward is a fresh start. Choose how much you want to
                  reset. We will clearly show what stays and what goes before anything changes.
                </p>
                <div className="clean-slate-options">
                  <button
                    className={`clean-slate-option ${!hasActiveBudget ? 'disabled' : ''}`}
                    disabled={!hasActiveBudget || cleanSlateBusy}
                    onClick={() => {
                      setCleanSlateError('')
                      setCleanSlateStep('resetWarning')
                    }}
                    type="button"
                  >
                    <strong className="clean-slate-option-title">
                      <span className="clean-slate-option-icon soft">
                        <Repeat size={15} />
                      </span>
                      Reset Transactions and Envelope Totals
                    </strong>
                    <small>
                      Keep your envelopes, monthly contributions, connected banks, and vendor
                      rules. Delete all transactions, reset balances, and clear history.
                    </small>
                  </button>
                  <button
                    className={`clean-slate-option danger ${!hasActiveBudget ? 'disabled' : ''}`}
                    disabled={!hasActiveBudget || cleanSlateBusy}
                    onClick={() => {
                      setCleanSlateError('')
                      setDeleteConfirmInput('')
                      setCleanSlateStep('newBudgetFinal')
                    }}
                    type="button"
                  >
                    <strong className="clean-slate-option-title">
                      <span className="clean-slate-option-icon danger">
                        <Trash2 size={15} />
                      </span>
                      Start a New Budget
                    </strong>
                    <small>
                      Delete your full budget, categories, transactions, and progress. Keep your
                      profile, preferences, and connected bank links.
                    </small>
                  </button>
                </div>
                {!hasActiveBudget && (
                  <p className="clean-slate-note">
                    No active budget found yet. These reset options are available after you create
                    a budget.
                  </p>
                )}
              </>
            )}

            {cleanSlateStep === 'resetWarning' && (
              <>
                <p>
                  This will permanently delete all posted, manual, and pending transactions across
                  all months, plus history and derived insights. Your envelopes and monthly
                  contribution targets will stay, but each envelope restarts at this month&apos;s full
                  contribution amount.
                </p>
                <div className="modal-actions">
                  <button className="outline-action" disabled={cleanSlateBusy} onClick={closeCleanSlate} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-action"
                    disabled={cleanSlateBusy}
                    onClick={() => setCleanSlateStep('resetFinal')}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {cleanSlateStep === 'resetFinal' && (
              <>
                <p>
                  Final confirmation: this cannot be undone. Transactions and historical budget data
                  will be removed immediately.
                </p>
                <div className="modal-actions">
                  <button className="outline-action" disabled={cleanSlateBusy} onClick={closeCleanSlate} type="button">
                    Cancel
                  </button>
                  <button
                    className="danger-action"
                    disabled={cleanSlateBusy}
                    onClick={() => executeCleanSlate('reset_transactions')}
                    type="button"
                  >
                    {cleanSlateBusy ? 'Resetting...' : 'Reset Now'}
                  </button>
                </div>
              </>
            )}

            {cleanSlateStep === 'newBudgetFinal' && (
              <>
                <p>
                  This permanently deletes your current budget, envelopes, all transactions, vendor
                  rules, and derived progress. To continue, type DELETE exactly.
                </p>
                <label className="clean-slate-confirm-label">
                  Type DELETE to confirm
                  <input
                    disabled={cleanSlateBusy}
                    onChange={(event) => setDeleteConfirmInput(event.target.value)}
                    value={deleteConfirmInput}
                  />
                </label>
                <div className="modal-actions">
                  <button className="outline-action" disabled={cleanSlateBusy} onClick={closeCleanSlate} type="button">
                    Cancel
                  </button>
                  <button
                    className="danger-action"
                    disabled={cleanSlateBusy || deleteConfirmInput !== 'DELETE'}
                    onClick={() => executeCleanSlate('start_new_budget')}
                    type="button"
                  >
                    {cleanSlateBusy ? 'Deleting...' : 'Delete Budget and Start Fresh'}
                  </button>
                </div>
              </>
            )}

            {cleanSlateError && <p className="form-message">{cleanSlateError}</p>}
          </div>
        </div>
      )}
    </>
  )
}

function SmsSimulator({
  state,
  input,
  onInput,
  onSend,
}: {
  state: PrototypeState
  input: string
  onInput: (value: string) => void
  onSend: () => void
}) {
  return (
    <>
      <PageHeading
        eyebrow="SMS simulator"
        title="Budget one purchase at a time."
        description="Test the complete text conversation without a phone number or commercial messaging provider."
      />
      <div className="sms-layout">
        <section className="phone-frame">
          <header>
            <ChevronLeft size={18} />
            <div>
              <strong>Tally</strong>
              <small>Budget assistant · simulated</small>
            </div>
            <span>•••</span>
          </header>
          <div className="message-thread">
            {state.sms.map((message) => (
              <div className={`message ${message.direction}`} key={message.id}>
                {message.body}
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onSend()
            }}
          >
            <input
              onChange={(event) => onInput(event.target.value)}
              placeholder="Reply Y, M, balance, or summary"
              value={input}
            />
            <button disabled={!input.trim()} title="Send message" type="submit">
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
        <aside className="simulator-guide">
          <p className="eyebrow">Try a reply</p>
          <button onClick={() => onInput('Y')} type="button">
            <strong>Y</strong>
            <span>Confirm the current suggestion</span>
          </button>
          <button onClick={() => onInput('M')} type="button">
            <strong>M</strong>
            <span>Request a numbered category menu</span>
          </button>
          <button onClick={() => onInput('balance')} type="button">
            <strong>Balance</strong>
            <span>Ask for an envelope balance</span>
          </button>
          <button onClick={() => onInput('summary')} type="button">
            <strong>Summary</strong>
            <span>Ask for this month's activity</span>
          </button>
          <p>Additional charges wait in the web inbox while one SMS conversation is active.</p>
        </aside>
      </div>
    </>
  )
}

function ActivityView({ state }: { state: PrototypeState }) {
  return (
    <>
      <PageHeading
        eyebrow="Audit history"
        title="A record of every meaningful change."
        description="Historical edits, category decisions, refunds, spread changes, account events, and month close actions remain traceable."
      />
      <div className="timeline">
        {state.audit.map((entry) => (
          <article key={entry.id}>
            <span>
              <Activity size={16} />
            </span>
            <div>
              <strong>{entry.action}</strong>
              <p>{entry.detail}</p>
              <small>{new Date(entry.at).toLocaleString()}</small>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function TransactionDrawer({
  state,
  transaction,
  refundAmount,
  onRefundAmount,
  onClose,
  onCommit,
  onSetPendingCategory,
  onApproveCategorization,
  onClearPendingCategory,
  pendingCategorizations,
}: {
  state: PrototypeState
  transaction: BudgetTransaction
  refundAmount: string
  onRefundAmount: (value: string) => void
  onClose: () => void
  onCommit: (state: PrototypeState, entry?: AuditEntry) => void
  onSetPendingCategory: (id: string, categoryId: string) => void
  onApproveCategorization: (id: string, source: string) => void
  onClearPendingCategory: (id: string) => void
  pendingCategorizations: Record<string, string>
}) {
  const spendableCategories = state.categories.filter(
    (item) => !item.archived && item.group !== 'Savings',
  )
  const account = state.accounts.find((item) => item.id === transaction.accountId)
  const relatedAudit = state.audit.filter((entry) =>
    entry.detail.toLowerCase().includes(transaction.merchant.toLowerCase()),
  )
  function update(changes: Partial<BudgetTransaction>, description: string) {
    onCommit(
      {
        ...state,
        transactions: state.transactions.map((item) =>
          item.id === transaction.id ? { ...item, ...changes } : item,
        ),
      },
      audit('Transaction updated', `${transaction.merchant}: ${description}`),
    )
  }
  function addRefund() {
    const amount = Math.min(transaction.amount, Math.abs(Number(refundAmount)))
    if (!amount) return
    const refund: BudgetTransaction = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      merchant: `${transaction.merchant} refund`,
      rawDescription: 'MANUAL EXPECTED REFUND',
      amount: -amount,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      status: 'pending',
      source: 'manual',
      notes: 'Expected refund awaiting provider match',
      spreadMonths: transaction.spreadMonths,
      refundOfId: transaction.id,
      expectedRefund: true,
    }
    onCommit(
      { ...state, transactions: [refund, ...state.transactions] },
      audit(
        'Expected refund created',
        `${money(amount)} expected from ${transaction.merchant}; linked without double-counting.`,
      ),
    )
    onRefundAmount('')
  }
  return (
    <div className="drawer-backdrop">
      <aside className="transaction-drawer">
        <header>
          <div>
            <p className="eyebrow">Transaction details</p>
            <h2>{transaction.merchant}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close details" type="button">
            <X size={20} />
          </button>
        </header>
        <div className="transaction-hero">
          <span className={transaction.amount < 0 ? 'refund' : ''}>
            {money(transaction.amount)}
          </span>
          <small>
            {transaction.status} · {shortDate(transaction.date)}
          </small>
        </div>
        <section>
          <h3>Budget treatment</h3>
          {pendingCategorizations[transaction.id] ? (
            <>
              <div style={{ marginBottom: '12px' }}>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '6px' }}>
                  Category
                </p>
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    fontWeight: '500',
                  }}
                >
                  {
                    state.categories.find(
                      (item) => item.id === pendingCategorizations[transaction.id],
                    )?.name
                  }
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="primary-action"
                  onClick={() => onApproveCategorization(transaction.id, 'Manual approval')}
                  type="button"
                  style={{ flex: 1 }}
                >
                  ✓ Approve Category
                </button>
                <button
                  className="outline-action"
                  onClick={() => onClearPendingCategory(transaction.id)}
                  type="button"
                  style={{ flex: 1 }}
                >
                  ✕ Cancel
                </button>
              </div>
            </>
          ) : (
            <label>
              Category
              <select
                value={transaction.categoryId ?? ''}
                onChange={(event) =>
                  event.target.value
                    ? onSetPendingCategory(transaction.id, event.target.value)
                    : onClearPendingCategory(transaction.id)
                }
              >
                <option value="">Uncategorized</option>
                {spendableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Spread transaction into future months
            <select
              value={transaction.spreadMonths}
              onChange={(event) =>
                update(
                  { spreadMonths: Number(event.target.value) },
                  `budget impact spread across ${event.target.value} months`,
                )
              }
            >
              {[1, 2, 3, 6, 12].map((months) => (
                <option key={months} value={months}>
                  {months === 1
                    ? 'No future spread (current month only)'
                    : `Spread into ${months} months · ${money(transaction.amount / months)}/month`}
                </option>
              ))}
            </select>
          </label>
          {transaction.spreadMonths > 1 && (
            <div className="spread-explainer">
              <CircleDollarSign size={18} />
              <div>
                <strong>{money(transaction.amount)} charged to the card now</strong>
                <span>
                  {money(transaction.amount / transaction.spreadMonths)} affects this envelope each
                  month for {transaction.spreadMonths} months.
                </span>
              </div>
            </div>
          )}
          <label>
            Notes
            <textarea
              value={transaction.notes}
              onChange={(event) => update({ notes: event.target.value }, 'notes edited')}
            />
          </label>
        </section>
        <section>
          <h3>Bank record</h3>
          <dl>
            <div>
              <dt>Original description</dt>
              <dd>{transaction.rawDescription}</dd>
            </div>
            <div>
              <dt>Connected card</dt>
              <dd>
                {account?.nickname} ·•••• {account?.lastFour}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{transaction.source}</dd>
            </div>
            <div>
              <dt>Categorized by</dt>
              <dd>{transaction.categorizationSource ?? 'Not categorized'}</dd>
            </div>
          </dl>
        </section>
        {transaction.amount > 0 && (
          <section>
            <h3>Record a refund</h3>
            <p className="section-copy">
              Creates a linked pending refund. When a provider refund arrives, Tally will offer to
              match it instead of counting it twice.
            </p>
            <div className="refund-entry">
              <span>$</span>
              <input
                max={transaction.amount}
                min="0"
                onChange={(event) => onRefundAmount(event.target.value)}
                placeholder="0.00"
                type="number"
                value={refundAmount}
              />
              <button onClick={addRefund} type="button">
                <ArrowDownLeft size={16} /> Add expected refund
              </button>
            </div>
          </section>
        )}
        <section>
          <h3>Edit history</h3>
          {relatedAudit.length > 0 ? (
            relatedAudit.map((entry) => (
              <div className="drawer-audit" key={entry.id}>
                <History size={14} />
                <span>{entry.detail}</span>
              </div>
            ))
          ) : (
            <p className="section-copy">No edits recorded for this transaction.</p>
          )}
        </section>
      </aside>
    </div>
  )
}

function simulateCharge(
  state: PrototypeState,
  commit: (state: PrototypeState, entry?: AuditEntry) => void,
) {
  const fallbackAccount: ConnectedAccount = {
    id: 'simulated-account',
    nickname: 'Primary checking',
    institution: 'Simulated Bank',
    lastFour: '0000',
    status: 'connected',
    included: true,
  }
  const account = state.accounts[0] ?? fallbackAccount
  const accounts = state.accounts.length > 0 ? state.accounts : [fallbackAccount]

  // Pick a random transaction from the 100 examples
  const template = pickRandomTransaction(exampleTransactions)
  const transactionId = crypto.randomUUID()

  // Generate a random date evenly distributed across the current month
  const date = generateRandomDateInMonth(state.currentMonth)

  // Generate a recommendation based on merchant name and available categories
  const recommendation = recommendCategory(template['Transaction name'], state.categories)

  // Add recommendation to suggestions object
  suggestions[transactionId] = recommendation

  const transaction: BudgetTransaction = {
    id: transactionId,
    date,
    merchant: template['Transaction name'],
    rawDescription: `SQ *${template['Transaction name'].toUpperCase()}`,
    amount: template.Cost,
    categoryId: null,
    accountId: account.id,
    status: 'pending',
    source: 'bank',
    notes: '',
    spreadMonths: 1,
  }
  commit(
    { ...state, accounts, transactions: [transaction, ...state.transactions] },
    audit(
      'Bank charge received',
      `${transaction.merchant} ${money(transaction.amount)} added to the uncategorized inbox. Suggested category: ${recommendation.reason}`,
    ),
  )
}

function sendSms(
  state: PrototypeState,
  input: string,
  clear: (value: string) => void,
  commit: (state: PrototypeState, entry?: AuditEntry) => void,
) {
  if (!input.trim()) return
  const waiting = state.transactions.find(
    (item) => item.date.startsWith(state.currentMonth) && !item.categoryId,
  )
  const normalized = input.trim().toLowerCase()
  let body = "I didn't understand that. Reply Y to confirm, M for categories, balance, or summary."
  let transactions = state.transactions
  let entry: AuditEntry | undefined
  if (normalized === 'y' && waiting) {
    const categoryId = suggestions[waiting.id]?.categoryId ?? 'shopping'
    const category = state.categories.find((item) => item.id === categoryId)
    transactions = state.transactions.map((item) =>
      item.id === waiting.id
        ? { ...item, categoryId, categorizationSource: 'SMS confirmation' }
        : item,
    )
    const available = category
      ? category.openingBalance +
        category.monthlyTarget -
        categorySpend({ ...state, transactions }, category.id, state.currentMonth)
      : 0
    body = `Added ${money(waiting.amount)} to ${category?.name}.\nAvailable: ${money(available)}.`
    entry = audit(
      'SMS confirmation',
      `${waiting.merchant} assigned to ${category?.name} after user replied Y.`,
    )
  } else if (normalized === 'm')
    body = state.categories
      .filter((item) => !item.archived)
      .map((item, index) => `${index + 1}. ${item.name}`)
      .join('\n')
  else if (normalized.includes('balance'))
    body = `Dining: ${money((state.categories.find((item) => item.id === 'dining')?.monthlyTarget ?? 0) - categorySpend(state, 'dining', state.currentMonth))} available this month.`
  else if (normalized.includes('summary'))
    body = `${monthLabel(state.currentMonth)}: ${state.transactions.filter((item) => item.date.startsWith(state.currentMonth)).length} charges, ${state.transactions.filter((item) => item.date.startsWith(state.currentMonth) && !item.categoryId).length} uncategorized.`
  const now = new Date().toISOString()
  commit(
    {
      ...state,
      transactions,
      sms: [
        ...state.sms,
        { id: crypto.randomUUID(), direction: 'in', body: input.trim(), at: now },
        { id: crypto.randomUUID(), direction: 'out', body, at: now },
      ],
    },
    entry,
  )
  clear('')
}

export default App
