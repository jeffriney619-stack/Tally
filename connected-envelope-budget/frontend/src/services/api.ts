import type {
  AssistantQuestionnaireAnswers,
  BudgetCategory,
  BudgetSetup,
  BudgetTransaction,
  PrototypeState,
} from '../types/budget'

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

export type AuthResponse = {
  token: string
  username: string
  expiresAt: string
}

export async function signup(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Signup failed')
  }
  return response.json() as Promise<AuthResponse>
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Login failed')
  }
  return response.json() as Promise<AuthResponse>
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

export function clearAuthToken(): void {
  localStorage.removeItem('auth_token')
}

export async function getBudgetSetup(username: string): Promise<BudgetSetup | null> {
  const response = await fetch(
    `${apiBaseUrl}/api/budget-setup?username=${encodeURIComponent(username)}`,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Unable to load your budget setup.')
  return response.json() as Promise<BudgetSetup>
}

export async function saveBudgetSetup(username: string, setup: BudgetSetup): Promise<BudgetSetup> {
  const response = await fetch(
    `${apiBaseUrl}/api/budget-setup?username=${encodeURIComponent(username)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setup),
    },
  )

  if (!response.ok) throw new Error('Unable to save your budget setup.')
  return response.json() as Promise<BudgetSetup>
}

export async function getPrototypeState(username: string): Promise<PrototypeState | null> {
  const response = await fetch(
    `${apiBaseUrl}/api/prototype?username=${encodeURIComponent(username)}`,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Unable to load the prototype.')
  return response.json() as Promise<PrototypeState>
}

export async function savePrototypeState(
  username: string,
  state: PrototypeState,
): Promise<PrototypeState> {
  const response = await fetch(
    `${apiBaseUrl}/api/prototype?username=${encodeURIComponent(username)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    },
  )

  if (!response.ok) throw new Error('Unable to save the prototype.')
  return response.json() as Promise<PrototypeState>
}

// The endpoints below read/write the real budget_categories and transactions
// tables added in the Transaction/Category migration — separate from the
// JSON-blob prototype state everything else on this page still uses.

export async function listLiveCategories(username: string): Promise<BudgetCategory[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/categories?username=${encodeURIComponent(username)}`,
  )
  if (!response.ok) throw new Error('Unable to load categories.')
  return response.json() as Promise<BudgetCategory[]>
}

export async function listLiveTransactions(
  username: string,
  month?: string,
): Promise<BudgetTransaction[]> {
  const params = new URLSearchParams({ username })
  if (month) params.set('month', month)
  const response = await fetch(`${apiBaseUrl}/api/transactions?${params.toString()}`)
  if (!response.ok) throw new Error('Unable to load transactions.')
  return response.json() as Promise<BudgetTransaction[]>
}

export type CreateLiveTransactionInput = {
  date: string
  merchant: string
  rawDescription: string
  amount: number
  categoryId: string | null
  accountId: string
  status: 'posted' | 'pending'
  source: 'bank' | 'manual' | 'sms'
  notes: string
  spreadMonths: number
}

export async function createLiveTransaction(
  username: string,
  input: CreateLiveTransactionInput,
): Promise<BudgetTransaction> {
  const response = await fetch(
    `${apiBaseUrl}/api/transactions?username=${encodeURIComponent(username)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  if (!response.ok) throw new Error('Unable to add the transaction.')
  return response.json() as Promise<BudgetTransaction>
}

export async function updateLiveTransactionCategory(
  username: string,
  transactionId: string,
  categoryId: string,
): Promise<BudgetTransaction> {
  const response = await fetch(
    `${apiBaseUrl}/api/transactions/${encodeURIComponent(transactionId)}?username=${encodeURIComponent(username)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, categorizationSource: 'Manual selection (live view)' }),
    },
  )
  if (!response.ok) throw new Error('Unable to categorize the transaction.')
  return response.json() as Promise<BudgetTransaction>
}

export type SmsConsentStatus = {
  phoneNumber: string
  consentGivenAt: string
  consentMethod: string
  optedOutAt: string | null
}

export type CleanSlateResetType = 'reset_transactions' | 'start_new_budget'

export type CleanSlateResponse = {
  resetType: CleanSlateResetType
  resetAt: string
  state: PrototypeState
}

export type EnvelopeAssistantRequest = {
  promptVersion: string
  universalCategories: Array<{ id: string; name: string; group: 'needs' | 'wants' | 'savings' }>
  baselineCategoryIds: string[]
  answers: AssistantQuestionnaireAnswers
}

export type EnvelopeAssistantResponse = {
  summary: string
  categories: Array<{
    name: string
    group: 'needs' | 'wants' | 'savings'
    source: 'universal' | 'custom'
    universalCategoryId: string | null
    replacesUniversalCategoryIds: string[]
    reason: string
    answerKeys: string[]
    priority: 'normal' | 'high'
  }>
  modelName?: string
}

export async function generateEnvelopeAssistantRecommendation(
  input: EnvelopeAssistantRequest,
): Promise<EnvelopeAssistantResponse> {
  const response = await fetch(`${apiBaseUrl}/api/envelope-assistant/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let detail = "Tally couldn't finish your recommendation. Try again or continue with the standard templates."
    try {
      const problem = (await response.json()) as { detail?: string }
      if (problem.detail) detail = problem.detail
    } catch {
      // Keep fallback copy.
    }
    throw new Error(detail)
  }

  return response.json() as Promise<EnvelopeAssistantResponse>
}

// Absence of a row (404) means consent was never granted — never treat that as an error.
export async function getSmsConsent(username: string): Promise<SmsConsentStatus | null> {
  const response = await fetch(
    `${apiBaseUrl}/api/sms-consent?username=${encodeURIComponent(username)}`,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Unable to load SMS consent.')
  return response.json() as Promise<SmsConsentStatus>
}

export async function saveSmsConsent(
  username: string,
  phoneNumber: string,
  consentGiven: boolean,
  method: string,
): Promise<SmsConsentStatus> {
  const response = await fetch(
    `${apiBaseUrl}/api/sms-consent?username=${encodeURIComponent(username)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, consentGiven, method }),
    },
  )
  if (!response.ok) throw new Error('Unable to save SMS consent.')
  return response.json() as Promise<SmsConsentStatus>
}

export async function runCleanSlate(
  username: string,
  resetType: CleanSlateResetType,
  idempotencyKey: string,
): Promise<CleanSlateResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/clean-slate?username=${encodeURIComponent(username)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ resetType, idempotencyKey }),
    },
  )

  if (!response.ok) {
    let detail = 'Unable to complete your reset.'
    try {
      const problem = (await response.json()) as { detail?: string }
      if (problem.detail) detail = problem.detail
    } catch {
      // Ignore JSON parsing failures and keep fallback error copy.
    }
    throw new Error(detail)
  }

  return response.json() as Promise<CleanSlateResponse>
}
