export type BudgetGroup = 'Needs' | 'Wants' | 'Savings'
export type MonthStatus = 'open' | 'closed'
export type TransactionStatus = 'posted' | 'pending'
export type TransactionSource = 'bank' | 'manual' | 'sms'

export type BudgetCategory = {
  id: string
  name: string
  group: BudgetGroup
  monthlyTarget: number
  openingBalance: number
  warningThreshold: number
  archived: boolean
}

export type BudgetMonth = { key: string; status: MonthStatus; closedAt?: string }

export type BudgetTransaction = {
  id: string
  date: string
  merchant: string
  rawDescription: string
  amount: number
  categoryId: string | null
  accountId: string
  status: TransactionStatus
  source: TransactionSource
  notes: string
  spreadMonths: number
  refundOfId?: string
  expectedRefund?: boolean
  categorizationSource?: string
}

export type ConnectedAccount = {
  id: string
  nickname: string
  institution: string
  lastFour: string
  status: 'connected' | 'attention' | 'disabled'
  included: boolean
}

export type AuditEntry = { id: string; at: string; action: string; detail: string }
export type SmsMessage = { id: string; direction: 'in' | 'out'; body: string; at: string }
export type AdHocAdjustment = {
  id: string
  date: string
  categoryId: string
  amount: number
  kind: 'add' | 'transfer-in' | 'transfer-out'
  note: string
  transferId?: string
}
export type UserProfile = {
  name: string
  nickname: string
  username: string
  email: string
  phone: string
  recoveryEmail: string
}

// A user-approved rule telling Tally to suggest `categoryId` for future transactions
// from `vendorKey`. It only ever influences future suggestions, never auto-approves them.
export type VendorSuggestionRule = {
  vendorKey: string
  categoryId: string
  enabled: boolean
}

// Month in Review: Top 3 merchant by dollars
export type MerchantStat = {
  merchant: string
  totalAmount: number
  count: number
}

// Month in Review: Envelope change (amount spent from start to end of month)
export type EnvelopeChange = {
  categoryId: string
  categoryName: string
  amountSpent: number
  percentageOfBudget: number
  group: BudgetGroup
}

// Month in Review: stores data about a completed review for a specific month
export type MonthInReviewData = {
  monthKey: string
  completedAt: string
  totalTransactions: number
  noSpendDays: number
  mostFrequentDay: string // e.g., "Monday", "Tuesday", etc.
  topMerchants?: MerchantStat[]
  envelopeChanges?: EnvelopeChange[]
  updatedAt?: string
}

export type ObligationPayment = {
  categoryId: string
  monthKey: string
  paidAt: string
}

export type AssistantTemplateSource = 'rule' | 'ai_custom' | 'user_added'

export type AssistantCategoryDraft = {
  id: string
  name: string
  group: 'needs' | 'wants' | 'savings'
  source: AssistantTemplateSource
  reason: string | null
  answerKeys: string[]
  selected: boolean
  displayOrder: number
}

// Adaptive Budget Onboarding — one entry per section of the questionnaire
// (see Tally_Adaptive_Budget_Onboarding_Feature_Spec.md). All fields are
// nullable/empty-array by default so partial progress can be evaluated by
// the live-understanding panel and the recommendation engine at any time.
export type HouseholdType = 'solo' | 'couple' | 'family' | 'shared'
export type BudgetDetailLevel = 'simple' | 'balanced' | 'detailed'

export type OnboardingAnswers = {
  household: {
    type: HouseholdType | null
    detail: BudgetDetailLevel | null
    memberNames: string
  }
  essentials: {
    applicable: string[]
    rentUtilities: 'separate' | 'combine' | 'included' | null
    insurance: 'one' | 'separate' | 'ordinary' | null
  }
  food: {
    areas: string[]
    casualMeal: 'dining_out' | 'fun_money' | 'ask' | null
    specialFood: string
  }
  fun: {
    approach: 'one' | 'by_person' | 'by_category' | null
    categories: string[]
    specialAttention: string
  }
  transportation: {
    costs: string[]
    detail: 'one' | 'car_noncar' | 'gas_maintenance_other' | 'none' | null
    trips: 'one' | 'work_personal' | 'major_trips' | 'normal_categories' | 'rarely' | null
    tripNames: string
  }
  homeLife: {
    areas: string[]
    petOrg: 'one' | 'pet_vet' | 'pet_vet_fun' | 'none' | null
    homeOrg: 'one' | 'repairs_furniture' | 'maintenance_projects' | 'none' | null
    giving: 'giving' | 'seasonal' | 'none' | null
    subscriptions: 'one' | 'essential_entertainment' | 'ordinary' | 'none' | null
  }
  goals: {
    savingsApproach:
      | 'emergency_plus'
      | 'below_means'
      | 'one_goal'
      | 'several_goals'
      | 'not_saving'
      | null
    goalNames: string
    debtGoals: string[]
  }
}

export type AssistantSessionState = {
  status: 'in_progress' | 'generating' | 'ready' | 'failed' | 'accepted' | 'abandoned'
  currentSection: number
  promptVersion: string
  modelName?: string
  summary?: string
  answers: OnboardingAnswers
  categories: AssistantCategoryDraft[]
  templateName?: string
  updatedAt: string
}

export type PrototypeState = {
  profile: UserProfile
  introductionCompletedAt?: string
  onboardingComplete: boolean
  monthlyIncome: number
  currentMonth: string
  lastLoginAt: string
  months: BudgetMonth[]
  categories: BudgetCategory[]
  transactions: BudgetTransaction[]
  accounts: ConnectedAccount[]
  audit: AuditEntry[]
  sms: SmsMessage[]
  adjustments: AdHocAdjustment[]
  vendorRules: VendorSuggestionRule[]
  monthInReviews: MonthInReviewData[]
  obligationPayments: ObligationPayment[]
  assistantSession?: AssistantSessionState
  debugCurrentDate?: string
  resetCutoffAt?: string
}

export type BudgetSetup = {
  id?: string
  monthlyIncome: number
  templateKey: string
  allocationModel: string
  updatedAt?: string
  categories: Array<{
    id?: string
    name: string
    group: BudgetGroup
    monthlyTarget: number
    sortOrder: number
  }>
}
