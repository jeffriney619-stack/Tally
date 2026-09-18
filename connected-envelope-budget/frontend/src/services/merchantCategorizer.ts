import type { BudgetCategory } from '../types/budget'

export interface TransactionTemplate {
  'Transaction name': string
  Cost: number
}

export interface Recommendation {
  categoryId: string
  confidence: number
  reason: string
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const categoryNameAliases: Record<string, string[]> = {
  dining: ['dining'],
  groceries: ['groceries', 'grocery'],
  transport: ['transport', 'transportation', 'car', 'gas'],
  shopping: ['shopping', 'personalspending', 'personal'],
  entertainment: ['entertainment', 'recreation', 'funmoney', 'fun'],
  insurance: ['insurance'],
  housing: ['housing', 'rentmortgage', 'rent', 'mortgage', 'home'],
}

function findCategoryByPatternId(categories: BudgetCategory[], patternId: string) {
  const byId = categories.find((category) => normalizeLabel(category.id) === normalizeLabel(patternId))
  if (byId) return byId

  const aliases = categoryNameAliases[patternId] ?? [patternId]
  const normalizedAliases = aliases.map((alias) => normalizeLabel(alias))
  return categories.find((category) => {
    const normalizedName = normalizeLabel(category.name)
    return normalizedAliases.some(
      (alias) => normalizedName === alias || normalizedName.includes(alias) || alias.includes(normalizedName),
    )
  })
}

// Merchant keywords mapped to category IDs
const merchantPatterns: Record<string, { categories: string[]; keywords: string[] }> = {
  dining: {
    keywords: [
      'coffee',
      'restaurant',
      'cafe',
      'pizza',
      'burger',
      'sushi',
      'takeout',
      'delivery',
      'doordash',
      'uber eats',
      'grubhub',
      'chipotle',
      'taco',
      'bar',
      'pub',
      'grill',
      'diner',
      'bistro',
      'bakery',
      'ice cream',
      'smoothie',
      'chips',
      'cookies',
    ],
    categories: ['dining', 'shopping', 'entertainment'],
  },
  groceries: {
    keywords: [
      'grocery',
      'kroger',
      'safeway',
      'whole foods',
      'trader joes',
      'costco',
      'walmart',
      'target',
      'sprouts',
      'publix',
      'trader',
      'market',
      'supermarket',
      'food store',
    ],
    categories: ['groceries', 'shopping'],
  },
  transport: {
    keywords: [
      'gas',
      'fuel',
      'shell',
      'exxon',
      'chevron',
      'bp',
      'texaco',
      'speedway',
      'parking',
      'uber',
      'lyft',
      'taxi',
      'rideshare',
      'train',
      'transit',
      'airline',
      'flight',
      'airport',
      'vehicle',
      'car',
      'automotive',
      'mechanic',
      'repair',
      'inspection',
      'transfer',
    ],
    categories: ['transport', 'shopping'],
  },
  shopping: {
    keywords: [
      'amazon',
      'ebay',
      'shop',
      'store',
      'retail',
      'mall',
      'clothing',
      'apparel',
      'shoes',
      'merchandise',
      'lamp',
      'furniture',
      'phone charger',
      'harness',
    ],
    categories: ['shopping', 'entertainment'],
  },
  entertainment: {
    keywords: [
      'gym',
      'fitness',
      'yoga',
      'class',
      'trainer',
      'crossfit',
      'pilates',
      'massage',
      'couples massage',
      'spa',
      'wellness',
      'movie',
      'cinema',
      'theater',
      'concert',
      'sports',
      'game',
      'recreation',
    ],
    categories: ['entertainment', 'shopping'],
  },
  shopping2: {
    keywords: [
      'haircut',
      'salon',
      'beauty',
      'cosmetics',
      'grooming',
      'barber',
      'pet',
      'veterinary',
      'dog',
      'cat',
      'animal',
      'supplies',
      'sitter',
      'childcare',
      'babysitter',
      'laundry',
      'dry cleaning',
    ],
    categories: ['shopping', 'entertainment'],
  },
  utilities_or_insurance: {
    keywords: [
      'electric',
      'water',
      'gas bill',
      'utility',
      'internet',
      'phone',
      'service',
      'cable',
      'insurance',
      'state farm',
      'geico',
      'progressive',
    ],
    categories: ['insurance', 'housing'],
  },
  housing: {
    keywords: [
      'rent',
      'mortgage',
      'property tax',
      'home maintenance',
      'hvac',
      'plumbing',
      'roof',
      'hoa',
      'lease',
    ],
    categories: ['housing', 'shopping'],
  },
}

/**
 * Recommend a category for a merchant based on keyword matching
 * Falls back to the most common category for the merchant type
 */
export function recommendCategory(
  merchantName: string,
  availableCategories: BudgetCategory[],
): Recommendation {
  const lowerMerchant = merchantName.toLowerCase()
  const spendableCategories = availableCategories.filter(
    (category) => !category.archived && category.group !== 'Savings',
  )

  // Try to find matching pattern
  for (const [_baseCategory, { keywords, categories }] of Object.entries(merchantPatterns)) {
    for (const keyword of keywords) {
      if (lowerMerchant.includes(keyword)) {
        // Find the first matching category that exists in user's categories
        for (const catId of categories) {
          const match = findCategoryByPatternId(spendableCategories, catId)
          if (match) {
            return {
              categoryId: match.id,
              confidence: 78,
              reason: `"${merchantName}" contains "${keyword}" — likely ${match.name}.`,
            }
          }
        }
      }
    }
  }

  // Fallback: try to infer from merchant type words
  if (lowerMerchant.includes('restaurant') || lowerMerchant.includes('eat')) {
    const dining = spendableCategories.find((c) => c.name.toLowerCase().includes('dining'))
    if (dining) {
      return {
        categoryId: dining.id,
        confidence: 65,
        reason: 'Transaction appears to be a restaurant or food merchant.',
      }
    }
  }

  // Last resort: pick first non-archived category
  const fallback = spendableCategories[0]
  return {
    categoryId: fallback?.id ?? 'shopping',
    confidence: 40,
    reason: 'Could not confidently categorize — please review.',
  }
}

// Recommendations at or above this confidence are treated as a real Tally
// suggestion (Transaction Review Phase 1). Below this, recommendCategory has
// fallen back to its lowest tier ("could not confidently categorize") and the
// transaction is routed to manual review instead.
export const MIN_SUGGESTION_CONFIDENCE = 60

// Suggestions are cached per-transaction-id as they're computed, mirroring the
// existing pattern where a recommendation is generated once (e.g. when a bank
// charge or SMS transaction is created) and reused everywhere that transaction
// is displayed. Seeded with the original prototype's demo suggestions.
export const suggestionCache: Record<string, Recommendation> = {
  'tx-1004': {
    categoryId: 'shopping',
    confidence: 82,
    reason: 'Similar Target purchases were Shopping.',
  },
  'tx-1005': {
    categoryId: 'transport',
    confidence: 96,
    reason: 'Fuel merchants usually map to Transportation.',
  },
  'tx-1007': {
    categoryId: 'shopping',
    confidence: 68,
    reason: 'Amazon varies, so this needs your confirmation.',
  },
  'tx-1010': {
    categoryId: 'groceries',
    confidence: 74,
    reason: 'Likely a neighborhood grocery purchase.',
  },
}

/** Returns the cached suggestion for a transaction, computing and caching one if needed. */
export function getSuggestion(
  transaction: { id: string; merchant: string },
  availableCategories: BudgetCategory[],
): Recommendation {
  const cached = suggestionCache[transaction.id]
  if (cached) return cached
  const recommendation = recommendCategory(transaction.merchant, availableCategories)
  suggestionCache[transaction.id] = recommendation
  return recommendation
}

/**
 * Generate a random date evenly distributed across the given month
 * @param yearMonth format: "2026-09"
 */
export function generateRandomDateInMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  // Get the number of days in the month
  const daysInMonth = new Date(year, month, 0).getDate()
  // Pick a random day between 1 and the last day of the month
  const randomDay = Math.floor(Math.random() * daysInMonth) + 1
  const dayStr = String(randomDay).padStart(2, '0')
  return `${yearMonth}-${dayStr}`
}

/**
 * Pick a random transaction from the template list
 */
export function pickRandomTransaction(templates: TransactionTemplate[]): TransactionTemplate {
  return templates[Math.floor(Math.random() * templates.length)]
}
