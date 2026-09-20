// Deterministic recommendation engine for Adaptive Budget Onboarding.
// See Tally_Adaptive_Budget_Onboarding_Feature_Spec.md for the product rules
// this file implements. AI is intentionally not involved here — this module
// must always produce a valid, sensible envelope set on its own so the
// onboarding flow never depends on an external model being available.
import type { BudgetGroup, OnboardingAnswers } from './types/budget'

export type EnvelopeRecommendationSource =
  | 'essentials'
  | 'food'
  | 'fun'
  | 'transportation'
  | 'homeLife'
  | 'goals'
  | 'freeText'
  | 'system'

export type EnvelopeRecommendation = {
  id: string
  name: string
  group: BudgetGroup
  purpose: string
  reason: string
  includes: string[]
  excludes: string[]
  source: EnvelopeRecommendationSource
  /** Miscellaneous only — every generated budget must keep this envelope. */
  locked?: boolean
}

export function createEmptyOnboardingAnswers(): OnboardingAnswers {
  return {
    household: { type: null, detail: null, memberNames: '' },
    essentials: { applicable: [], rentUtilities: null, insurance: null },
    food: { areas: [], casualMeal: null, specialFood: '' },
    fun: { approach: null, categories: [], specialAttention: '' },
    transportation: { costs: [], detail: null, trips: null, tripNames: '' },
    homeLife: { areas: [], petOrg: null, homeOrg: null, giving: null, subscriptions: null },
    goals: { savingsApproach: null, goalNames: '', debtGoals: [] },
  }
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function splitCommaList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

class RecommendationBuilder {
  private byId = new Map<string, EnvelopeRecommendation>()

  add(rec: EnvelopeRecommendation) {
    const existing = this.byId.get(rec.id)
    if (!existing) {
      this.byId.set(rec.id, rec)
      return
    }
    // Same conceptual envelope recommended from more than one section — merge
    // boundaries/reasons instead of creating a duplicate (spec: "Duplicate
    // prevention").
    this.byId.set(rec.id, {
      ...existing,
      includes: Array.from(new Set([...existing.includes, ...rec.includes])),
      excludes: Array.from(new Set([...existing.excludes, ...rec.excludes])),
      reason: existing.reason.includes(rec.reason)
        ? existing.reason
        : `${existing.reason} ${rec.reason}`,
    })
  }

  has(id: string) {
    return this.byId.has(id)
  }

  list(): EnvelopeRecommendation[] {
    return Array.from(this.byId.values())
  }
}

function essentialsRecommendations(
  answers: OnboardingAnswers['essentials'],
  b: RecommendationBuilder,
) {
  const { applicable, rentUtilities, insurance } = answers
  const has = (name: string) => applicable.includes(name)

  if (rentUtilities === 'combine' && has('Rent/Mortgage') && has('Utilities')) {
    b.add({
      id: 'home-bills',
      name: 'Home Bills',
      group: 'Needs',
      purpose: 'Recurring housing payment plus utilities in one place',
      reason: 'Create Home Bills because you chose to combine Rent/Mortgage and Utilities.',
      includes: ['rent or mortgage payment', 'power, water, gas, internet'],
      excludes: ['home repairs, furniture, or projects'],
      source: 'essentials',
    })
  } else {
    if (has('Rent/Mortgage')) {
      b.add({
        id: 'rent-mortgage',
        name: 'Rent/Mortgage',
        group: 'Needs',
        purpose: 'The recurring housing payment',
        reason: 'Create Rent/Mortgage because you confirmed it as an essential expense.',
        includes: ['monthly rent or mortgage payment', 'HOA dues'],
        excludes: ['utilities', 'home repairs or furniture'],
        source: 'essentials',
      })
    }
    if (has('Utilities') && rentUtilities !== 'included') {
      b.add({
        id: 'utilities',
        name: 'Utilities',
        group: 'Needs',
        purpose: 'Services required to keep the home running',
        reason:
          'Create Utilities because you confirmed it as an essential expense, tracked separately from Rent/Mortgage.',
        includes: ['power', 'water', 'gas', 'internet'],
        excludes: ['rent or mortgage payment'],
        source: 'essentials',
      })
    }
  }

  if (has('Insurance')) {
    if (insurance === 'separate') {
      // Only split when a corresponding confirmed insurance expense exists elsewhere.
      b.add({
        id: 'insurance',
        name: 'Insurance',
        group: 'Needs',
        purpose: 'Recurring insurance premiums',
        reason: 'Create Insurance because you confirmed it as an essential expense.',
        includes: ['insurance premiums'],
        excludes: [],
        source: 'essentials',
      })
    } else {
      b.add({
        id: 'insurance',
        name: 'Insurance',
        group: 'Needs',
        purpose: insurance === 'ordinary' ? 'A fixed monthly bill' : 'Recurring insurance premiums',
        reason: 'Create Insurance because you confirmed it as an essential expense.',
        includes: ['auto, renter\u2019s, home, or health insurance premiums'],
        excludes: [],
        source: 'essentials',
      })
    }
  }

  if (has('Healthcare')) {
    b.add({
      id: 'healthcare',
      name: 'Healthcare',
      group: 'Needs',
      purpose: 'Routine medical and dental spending',
      reason: 'Create Healthcare because you confirmed it as an essential expense.',
      includes: ['doctor visits', 'prescriptions', 'dental care'],
      excludes: ['insurance premiums'],
      source: 'essentials',
    })
  }

  if (has('Childcare or School')) {
    b.add({
      id: 'childcare-school',
      name: 'Childcare & School',
      group: 'Needs',
      purpose: 'Recurring childcare or school costs',
      reason: 'Create Childcare & School because you confirmed it as an essential expense.',
      includes: ['daycare', 'tuition', 'school supplies'],
      excludes: [],
      source: 'essentials',
    })
  }

  if (has('Personal Care')) {
    b.add({
      id: 'personal-care',
      name: 'Personal Care',
      group: 'Needs',
      purpose: 'Routine personal upkeep',
      reason: 'Create Personal Care because you confirmed it as an essential expense.',
      includes: ['haircuts', 'toiletries', 'routine grooming'],
      excludes: [],
      source: 'essentials',
    })
  }
}

function foodRecommendations(answers: OnboardingAnswers['food'], b: RecommendationBuilder) {
  const { areas, specialFood } = answers
  if (areas.includes('Keep All Food Together')) {
    b.add({
      id: 'food',
      name: 'Food',
      group: 'Needs',
      purpose: 'All groceries and meals in one envelope',
      reason: 'Create Food because you chose to keep all food spending together.',
      includes: ['groceries', 'dining out', 'takeout'],
      excludes: [],
      source: 'food',
    })
  } else {
    if (areas.includes('Groceries')) {
      b.add({
        id: 'groceries',
        name: 'Groceries',
        group: 'Needs',
        purpose: 'Food bought to prepare at home',
        reason: 'Create Groceries because you asked to track it separately.',
        includes: ['grocery store trips', 'bulk/warehouse runs'],
        excludes: ['restaurants', 'takeout'],
        source: 'food',
      })
    }
    if (areas.includes('Routine Dining and Takeout')) {
      b.add({
        id: 'dining-out',
        name: 'Dining Out',
        group: 'Wants',
        purpose: 'Everyday restaurant meals and takeout',
        reason: 'Create Dining Out because you asked to track it separately.',
        includes: ['takeout', 'casual restaurant meals'],
        excludes: ['groceries', 'date nights'],
        source: 'food',
      })
    }
    if (areas.includes('Date Nights')) {
      b.add({
        id: 'date-night',
        name: 'Date Night',
        group: 'Wants',
        purpose: 'Meals or outings shared with a partner',
        reason: 'Create Date Night because you asked to track it separately.',
        includes: ['dinner with a partner', 'shared outings'],
        excludes: ['routine solo dining'],
        source: 'food',
      })
    }
    if (areas.includes('Social Meals')) {
      b.add({
        id: 'social-dining',
        name: 'Social Dining',
        group: 'Wants',
        purpose: 'Meals shared with friends or family, outside a date',
        reason: 'Create Social Dining because you asked to track it separately.',
        includes: ['group dinners', 'meals with friends'],
        excludes: ['date nights', 'routine solo dining'],
        source: 'food',
      })
    }
    if (areas.includes('Health & Nutrition')) {
      b.add({
        id: 'health-nutrition',
        name: 'Health & Nutrition',
        group: 'Needs',
        purpose: 'Supplements and health-focused food spending',
        reason: 'Create Health & Nutrition because you asked to track it separately.',
        includes: ['supplements', 'specialty health foods'],
        excludes: ['routine groceries'],
        source: 'food',
      })
    }
  }

  if (specialFood.trim().length > 0) {
    const name = titleCase(specialFood.trim())
    b.add({
      id: slug(name),
      name,
      group: 'Wants',
      purpose: 'A food expense you called out as worth tracking separately',
      reason: `Create ${name} because you told Tally it's worth tracking separately.`,
      includes: [specialFood.trim()],
      excludes: [],
      source: 'freeText',
    })
  }
}

function funRecommendations(
  answers: OnboardingAnswers['fun'],
  household: OnboardingAnswers['household'],
  b: RecommendationBuilder,
) {
  const { approach, categories, specialAttention } = answers

  if (approach === 'one') {
    b.add({
      id: 'fun-money',
      name: 'Fun Money',
      group: 'Wants',
      purpose: 'Personal discretionary spending',
      reason: 'Create Fun Money because you chose one shared discretionary envelope.',
      includes: ['shopping', 'entertainment', 'hobbies'],
      excludes: [],
      source: 'fun',
    })
  } else if (approach === 'by_person' && household.type !== 'solo') {
    const names = splitCommaList(household.memberNames)
    if (names.length > 0) {
      names.forEach((name) => {
        b.add({
          id: slug(`${name} fun money`),
          name: `${titleCase(name)}'s Fun Money`,
          group: 'Wants',
          purpose: `Personal discretionary spending for ${titleCase(name)}`,
          reason: `Create ${titleCase(name)}'s Fun Money because you chose to separate discretionary spending by person.`,
          includes: ['shopping', 'entertainment', 'hobbies'],
          excludes: [],
          source: 'fun',
        })
      })
    } else {
      b.add({
        id: 'fun-money',
        name: 'Fun Money',
        group: 'Wants',
        purpose: 'Personal discretionary spending',
        reason:
          'Create Fun Money as a starting point until names are added for per-person envelopes.',
        includes: ['shopping', 'entertainment', 'hobbies'],
        excludes: [],
        source: 'fun',
      })
    }
  } else if (approach === 'by_category') {
    const categoryDefs: Record<string, { id: string; name: string; purpose: string }> = {
      Shopping: {
        id: 'shopping',
        name: 'Shopping',
        purpose: 'Clothing, gadgets, and general purchases',
      },
      Entertainment: {
        id: 'entertainment',
        name: 'Entertainment',
        purpose: 'Movies, shows, and outings',
      },
      'Social Activities': {
        id: 'social-activities',
        name: 'Social Activities',
        purpose: 'Spending time with friends and family',
      },
      'Hobbies or Fitness': {
        id: 'hobbies-fitness',
        name: 'Hobbies & Fitness',
        purpose: 'Gear, classes, and memberships for hobbies or fitness',
      },
      'Gifts and Holidays': {
        id: 'gifts-holidays',
        name: 'Gifts & Holidays',
        purpose: 'Gifts and seasonal celebrations',
      },
      'Dining Out': {
        id: 'dining-out',
        name: 'Dining Out',
        purpose: 'Everyday restaurant meals and takeout',
      },
      'Date Night': {
        id: 'date-night',
        name: 'Date Night',
        purpose: 'Meals or outings shared with a partner',
      },
    }
    categories.forEach((category) => {
      const def = categoryDefs[category]
      if (!def) return
      b.add({
        id: def.id,
        name: def.name,
        group: 'Wants',
        purpose: def.purpose,
        reason: `Create ${def.name} because you chose to organize discretionary spending by category.`,
        includes: [def.purpose.toLowerCase()],
        excludes: [],
        source: 'fun',
      })
    })
  }

  if (specialAttention.trim().length > 0) {
    const name = titleCase(specialAttention.trim())
    const id = slug(name)
    if (!b.has(id)) {
      b.add({
        id,
        name,
        group: 'Wants',
        purpose: 'Spending you want to watch closely',
        reason: `Create ${name} because you called it out as needing special attention.`,
        includes: [specialAttention.trim()],
        excludes: [],
        source: 'freeText',
      })
    }
  }
}

function transportationRecommendations(
  answers: OnboardingAnswers['transportation'],
  b: RecommendationBuilder,
) {
  const { costs, detail, trips, tripNames } = answers
  const hasCost = (name: string) => costs.includes(name)
  const carCosts = ['Gas or EV Charging', 'Car Maintenance', 'Car Payment', 'Auto Insurance']
  const nonCarCosts = ['Public Transit', 'Rideshare, Taxis, Bikes, or Scooters']

  if (
    detail &&
    detail !== 'none' &&
    costs.length > 0 &&
    !(costs.length === 1 && costs[0] === 'None')
  ) {
    if (detail === 'one') {
      b.add({
        id: 'transportation',
        name: 'Transportation',
        group: 'Needs',
        purpose: 'Everyday getting-around costs',
        reason: 'Create Transportation because you chose one envelope for everyday transportation.',
        includes: ['gas', 'maintenance', 'public transit', 'rideshare'],
        excludes: ['trip or vacation travel'],
        source: 'transportation',
      })
    } else if (detail === 'car_noncar') {
      if (carCosts.some(hasCost)) {
        b.add({
          id: 'car-costs',
          name: 'Car Costs',
          group: 'Needs',
          purpose: 'Everything related to owning and running a car',
          reason:
            'Create Car Costs because you chose to separate car costs from non-car transportation.',
          includes: ['gas', 'maintenance', 'car payment', 'auto insurance'],
          excludes: ['public transit', 'rideshare'],
          source: 'transportation',
        })
      }
      if (nonCarCosts.some(hasCost)) {
        b.add({
          id: 'non-car-transportation',
          name: 'Non-car Transportation',
          group: 'Needs',
          purpose: 'Getting around without a personal car',
          reason: 'Create Non-car Transportation because you chose to separate it from car costs.',
          includes: ['public transit', 'rideshare, taxis, bikes, or scooters'],
          excludes: ['gas', 'car maintenance'],
          source: 'transportation',
        })
      }
    } else if (detail === 'gas_maintenance_other') {
      if (hasCost('Gas or EV Charging')) {
        b.add({
          id: 'gas-ev-charging',
          name: 'Gas & EV Charging',
          group: 'Needs',
          purpose: 'Fuel or charging for everyday driving',
          reason: 'Create Gas & EV Charging because you chose to track it separately.',
          includes: ['gas station fill-ups', 'EV charging'],
          excludes: ['maintenance', 'trip-related gas'],
          source: 'transportation',
        })
      }
      if (hasCost('Car Maintenance')) {
        b.add({
          id: 'car-maintenance',
          name: 'Car Maintenance',
          group: 'Needs',
          purpose: 'Repairs and routine car upkeep',
          reason: 'Create Car Maintenance because you chose to track it separately.',
          includes: ['oil changes', 'repairs', 'tires'],
          excludes: ['gas'],
          source: 'transportation',
        })
      }
      const otherCosts = ['Car Payment', 'Auto Insurance', ...nonCarCosts]
      if (otherCosts.some(hasCost)) {
        b.add({
          id: 'other-transportation',
          name: 'Other Transportation',
          group: 'Needs',
          purpose: 'Remaining transportation costs',
          reason:
            'Create Other Transportation to hold everything else you pay toward getting around.',
          includes: ['car payment', 'auto insurance', 'public transit', 'rideshare'],
          excludes: ['gas', 'maintenance'],
          source: 'transportation',
        })
      }
    }
  }

  if (trips === 'one') {
    b.add(tripsVacationRecommendation())
  } else if (trips === 'work_personal') {
    b.add({
      id: 'work-travel',
      name: 'Work Travel',
      group: 'Needs',
      purpose: 'Travel expenses tied to work',
      reason: 'Create Work Travel because you chose to separate it from personal trips.',
      includes: ['work flights', 'work lodging', 'work travel meals'],
      excludes: ['personal vacations'],
      source: 'transportation',
    })
    b.add(tripsVacationRecommendation())
  } else if (trips === 'major_trips') {
    const names = splitCommaList(tripNames)
    if (names.length > 0) {
      names.forEach((name) => {
        const title = titleCase(name)
        b.add({
          id: slug(title),
          name: title,
          group: 'Savings',
          purpose: `Travel fund for ${title}`,
          reason: `Create ${title} because you named it as an upcoming trip to save for.`,
          includes: [
            'airfare',
            'lodging',
            'trip-related gas',
            'rideshare',
            'meals during the trip',
            'activities',
          ],
          excludes: ['ordinary commuting', 'local everyday transportation'],
          source: 'transportation',
        })
      })
    } else {
      b.add(tripsVacationRecommendation())
    }
  }
}

function tripsVacationRecommendation(): EnvelopeRecommendation {
  return {
    id: 'trips-vacation',
    name: 'Trips & Vacation',
    group: 'Savings',
    purpose: 'Travel fund',
    reason: 'Create Trips & Vacation because you chose to keep personal trip expenses together.',
    includes: [
      'airfare',
      'lodging',
      'trip-related gas',
      'rideshare',
      'meals during the trip',
      'activities',
    ],
    excludes: ['ordinary commuting', 'local everyday transportation'],
    source: 'transportation',
  }
}

function homeLifeRecommendations(answers: OnboardingAnswers['homeLife'], b: RecommendationBuilder) {
  const { areas, petOrg, homeOrg, giving, subscriptions } = answers
  const hasArea = (name: string) => areas.includes(name)

  if (hasArea('Pets') && petOrg && petOrg !== 'none') {
    if (petOrg === 'one') {
      b.add({
        id: 'pet-care',
        name: 'Pet Care',
        group: 'Wants',
        purpose: 'Everything for your pet in one place',
        reason: 'Create Pet Care because you chose one envelope for all pet expenses.',
        includes: ['pet food', 'vet visits', 'pet toys'],
        excludes: [],
        source: 'homeLife',
      })
    } else if (petOrg === 'pet_vet') {
      b.add({
        id: 'pet-care',
        name: 'Pet Care',
        group: 'Wants',
        purpose: 'Routine pet food and supplies',
        reason: 'Create Pet Care because you chose to separate it from vet care.',
        includes: ['pet food', 'toys', 'grooming'],
        excludes: ['veterinary bills'],
        source: 'homeLife',
      })
      b.add({
        id: 'vet-care',
        name: 'Vet Care',
        group: 'Needs',
        purpose: 'Veterinary appointments and medical care',
        reason: 'Create Vet Care because you chose to separate it from routine pet spending.',
        includes: ['vet appointments', 'medication'],
        excludes: ['pet food', 'pet toys'],
        source: 'homeLife',
      })
    } else if (petOrg === 'pet_vet_fun') {
      b.add({
        id: 'pet-food',
        name: 'Pet Food',
        group: 'Needs',
        purpose: 'Routine pet food and supplies',
        reason: 'Create Pet Food because you chose to separate pet food, vet care, and pet fun.',
        includes: ['pet food', 'litter', 'supplies'],
        excludes: ['vet bills', 'toys'],
        source: 'homeLife',
      })
      b.add({
        id: 'vet-care',
        name: 'Vet Care',
        group: 'Needs',
        purpose: 'Veterinary appointments and medical care',
        reason: 'Create Vet Care because you chose to separate pet food, vet care, and pet fun.',
        includes: ['vet appointments', 'medication'],
        excludes: ['pet food', 'toys'],
        source: 'homeLife',
      })
      b.add({
        id: 'pet-fun',
        name: 'Pet Fun',
        group: 'Wants',
        purpose: 'Toys, treats, and extras for your pet',
        reason: 'Create Pet Fun because you chose to separate pet food, vet care, and pet fun.',
        includes: ['toys', 'treats', 'pet daycare'],
        excludes: ['pet food', 'vet bills'],
        source: 'homeLife',
      })
    }
  }

  if (hasArea('Home Furniture, Repairs, or Projects') && homeOrg && homeOrg !== 'none') {
    if (homeOrg === 'one') {
      b.add({
        id: 'home',
        name: 'Home',
        group: 'Wants',
        purpose: 'Furniture, decor, maintenance, repairs, and projects',
        reason: 'Create Home because you chose one envelope for everything related to your home.',
        includes: ['furniture', 'decor', 'repairs', 'projects'],
        excludes: ['rent or mortgage', 'utilities'],
        source: 'homeLife',
      })
    } else if (homeOrg === 'repairs_furniture') {
      b.add({
        id: 'home-repairs',
        name: 'Home Repairs',
        group: 'Needs',
        purpose: 'Fixing things around the home',
        reason: 'Create Home Repairs because you chose to separate it from furniture and decor.',
        includes: ['repairs', 'maintenance'],
        excludes: ['furniture', 'decor'],
        source: 'homeLife',
      })
      b.add({
        id: 'furniture-decor',
        name: 'Furniture & Decor',
        group: 'Wants',
        purpose: 'Furnishing and decorating your home',
        reason: 'Create Furniture & Decor because you chose to separate it from repairs.',
        includes: ['furniture', 'decor'],
        excludes: ['repairs', 'maintenance'],
        source: 'homeLife',
      })
    } else if (homeOrg === 'maintenance_projects') {
      b.add({
        id: 'home-maintenance',
        name: 'Home Maintenance',
        group: 'Needs',
        purpose: 'Routine upkeep of your home',
        reason: 'Create Home Maintenance because you chose to separate it from larger projects.',
        includes: ['routine maintenance', 'small repairs'],
        excludes: ['large projects'],
        source: 'homeLife',
      })
      b.add({
        id: 'home-projects',
        name: 'Home Projects',
        group: 'Savings',
        purpose: 'Saving for bigger home improvements',
        reason: 'Create Home Projects because you chose to separate it from routine maintenance.',
        includes: ['renovations', 'large purchases'],
        excludes: ['routine maintenance'],
        source: 'homeLife',
      })
    }
  }

  if (hasArea('Medical or Dental') && !b.has('healthcare')) {
    b.add({
      id: 'medical-dental',
      name: 'Medical & Dental',
      group: 'Needs',
      purpose: 'Medical and dental costs',
      reason: 'Create Medical & Dental because you confirmed it as an applicable life area.',
      includes: ['doctor visits', 'dental care'],
      excludes: ['insurance premiums'],
      source: 'homeLife',
    })
  }

  const subscriptionsApplicable = hasArea('Subscriptions') || subscriptions !== null
  if (subscriptionsApplicable && subscriptions !== 'none') {
    if (subscriptions === 'essential_entertainment') {
      b.add({
        id: 'essential-subscriptions',
        name: 'Essential Subscriptions',
        group: 'Needs',
        purpose: 'Subscriptions you rely on',
        reason:
          'Create Essential Subscriptions because you chose to separate essential and entertainment subscriptions.',
        includes: ['cloud storage', 'software you rely on'],
        excludes: ['streaming for entertainment'],
        source: 'homeLife',
      })
      b.add({
        id: 'entertainment-subscriptions',
        name: 'Entertainment Subscriptions',
        group: 'Wants',
        purpose: 'Subscriptions for entertainment',
        reason:
          'Create Entertainment Subscriptions because you chose to separate essential and entertainment subscriptions.',
        includes: ['streaming services', 'gaming subscriptions'],
        excludes: ['essential software'],
        source: 'homeLife',
      })
    } else {
      b.add({
        id: 'subscriptions',
        name: 'Subscriptions',
        group: subscriptions === 'ordinary' ? 'Needs' : 'Wants',
        purpose: subscriptions === 'ordinary' ? 'A fixed monthly bill' : 'Recurring subscriptions',
        reason: 'Create Subscriptions because you confirmed it as an applicable life area.',
        includes: ['streaming services', 'software', 'memberships'],
        excludes: [],
        source: 'homeLife',
      })
    }
  }

  if (hasArea('Donations or Giving') && giving && giving !== 'none') {
    if (giving === 'seasonal') {
      b.add({
        id: 'seasonal-giving',
        name: 'Seasonal Giving',
        group: 'Wants',
        purpose: 'Giving tied to specific times of year',
        reason: 'Create Seasonal Giving because you chose to budget for it seasonally.',
        includes: ['holiday donations', 'seasonal charity drives'],
        excludes: [],
        source: 'homeLife',
      })
    } else {
      b.add({
        id: 'giving',
        name: 'Giving',
        group: 'Wants',
        purpose: 'Donations and charitable giving',
        reason: 'Create Giving because you confirmed it as an applicable life area.',
        includes: ['charitable donations', 'tithing'],
        excludes: [],
        source: 'homeLife',
      })
    }
  }

  if (hasArea('Annual Bills')) {
    b.add({
      id: 'annual-bills',
      name: 'Annual Bills',
      group: 'Needs',
      purpose: 'Setting aside monthly for irregular annual bills',
      reason: 'Create Annual Bills because you confirmed it as an applicable life area.',
      includes: ['annual memberships', 'yearly premiums', 'registration fees'],
      excludes: [],
      source: 'homeLife',
    })
  }
}

function goalsRecommendations(answers: OnboardingAnswers['goals'], b: RecommendationBuilder) {
  const { savingsApproach, goalNames, debtGoals } = answers

  if (savingsApproach === 'emergency_plus') {
    b.add({
      id: 'emergency-fund',
      name: 'Emergency Fund',
      group: 'Savings',
      purpose: 'A cushion for unexpected expenses',
      reason: 'Create Emergency Fund because you are building one alongside additional savings.',
      includes: ['unplanned repairs', 'income gaps'],
      excludes: [],
      source: 'goals',
    })
    b.add({
      id: 'general-savings',
      name: 'General Savings',
      group: 'Savings',
      purpose: 'Additional savings beyond the emergency fund',
      reason:
        'Create General Savings because you save additional money beyond your emergency fund.',
      includes: ['extra savings'],
      excludes: [],
      source: 'goals',
    })
  } else if (savingsApproach === 'below_means') {
    b.add({
      id: 'general-savings',
      name: 'General Savings',
      group: 'Savings',
      purpose: 'Whatever is left over each month',
      reason:
        'Create General Savings because you save whatever remains after spending below your means.',
      includes: ['month-end surplus'],
      excludes: [],
      source: 'goals',
    })
  } else if (savingsApproach === 'one_goal' || savingsApproach === 'several_goals') {
    const names = splitCommaList(goalNames)
    names.forEach((name) => {
      const title = titleCase(name)
      b.add({
        id: slug(title),
        name: title,
        group: 'Savings',
        purpose: `Saving toward ${title}`,
        reason: `Create ${title} because you named it as a savings goal.`,
        includes: ['contributions toward this goal'],
        excludes: [],
        source: 'goals',
      })
    })
  }

  const debtDefs: Record<string, string> = {
    'Credit Card Payoff': 'Credit Card Payoff',
    'Student Loans': 'Student Loans',
    'Auto Loan': 'Auto Loan',
    'Personal Loan': 'Personal Loan',
  }
  debtGoals.forEach((debt) => {
    const name = debtDefs[debt]
    if (!name) return
    b.add({
      id: slug(name),
      name,
      group: 'Savings',
      purpose: `Paying down ${name.toLowerCase()}`,
      reason: `Create ${name} because you selected it as a debt goal.`,
      includes: ['extra payments toward this debt'],
      excludes: [],
      source: 'goals',
    })
  })
}

const GROUP_SORT: Record<BudgetGroup, number> = { Needs: 0, Wants: 1, Savings: 2 }

export function computeRecommendations(answers: OnboardingAnswers): EnvelopeRecommendation[] {
  const b = new RecommendationBuilder()
  essentialsRecommendations(answers.essentials, b)
  foodRecommendations(answers.food, b)
  funRecommendations(answers.fun, answers.household, b)
  transportationRecommendations(answers.transportation, b)
  homeLifeRecommendations(answers.homeLife, b)
  goalsRecommendations(answers.goals, b)

  // Miscellaneous is universal — always present, always last, never a fallback
  // for spending that already has a more specific applicable envelope.
  b.add({
    id: 'miscellaneous',
    name: 'Miscellaneous',
    group: 'Wants',
    purpose: 'A home for small or unusual purchases',
    reason:
      'Every Tally budget includes Miscellaneous for spending that does not fit anywhere else.',
    includes: ['small or unusual purchases'],
    excludes: ['anything that fits a more specific envelope'],
    source: 'system',
    locked: true,
  })

  return b.list().sort((a, b2) => GROUP_SORT[a.group] - GROUP_SORT[b2.group])
}

export function buildLiveUnderstanding(answers: OnboardingAnswers): string[] {
  const lines: string[] = []
  const householdLabels: Record<HouseholdTypeNonNull, string> = {
    solo: 'Just you',
    couple: 'You and a partner',
    family: 'A family with children',
    shared: 'A shared household or roommates',
  }
  if (answers.household.type) {
    lines.push(`Budgeting for: ${householdLabels[answers.household.type]}`)
  }
  if (answers.household.detail) {
    const detailLabels: Record<string, string> = {
      simple: 'Simple — broader envelopes, fewer decisions',
      balanced: 'Balanced — separate expenses where it helps',
      detailed: 'Detailed — specific, granular envelopes',
    }
    lines.push(`Budget style: ${detailLabels[answers.household.detail]}`)
  }
  if (answers.essentials.applicable.length > 0 && !answers.essentials.applicable.includes('None')) {
    lines.push(`Essential expenses confirmed: ${answers.essentials.applicable.join(', ')}`)
  }
  if (answers.food.areas.length > 0) {
    lines.push(
      answers.food.areas.includes('Keep All Food Together')
        ? 'Food: kept together in one envelope'
        : `Food organized around: ${answers.food.areas.join(', ')}`,
    )
  }
  if (answers.fun.approach) {
    const funLabels: Record<string, string> = {
      one: 'One shared Fun Money envelope',
      by_person: 'Separated by person',
      by_category: `By category: ${answers.fun.categories.join(', ') || 'not yet chosen'}`,
    }
    lines.push(`Discretionary spending: ${funLabels[answers.fun.approach]}`)
  }
  if (answers.transportation.costs.length > 0 || answers.transportation.trips) {
    const parts: string[] = []
    if (answers.transportation.detail)
      parts.push(`everyday transportation is ${answers.transportation.detail.replace(/_/g, ' ')}`)
    if (answers.transportation.trips)
      parts.push(`trips are handled as ${answers.transportation.trips.replace(/_/g, ' ')}`)
    if (parts.length > 0) lines.push(`Transportation & travel: ${parts.join('; ')}`)
  }
  const lifeAreas = answers.homeLife.areas.filter((area) => area !== 'None')
  if (lifeAreas.length > 0) {
    lines.push(`Life areas that apply: ${lifeAreas.join(', ')}`)
  }
  if (answers.goals.savingsApproach) {
    const savingsLabels: Record<string, string> = {
      emergency_plus: 'Building an emergency fund plus additional savings',
      below_means: 'Spending below your means and saving the remainder',
      one_goal: `Saving toward: ${answers.goals.goalNames || 'a specific goal'}`,
      several_goals: `Saving toward: ${answers.goals.goalNames || 'several goals'}`,
      not_saving: 'Not actively saving yet',
    }
    lines.push(savingsLabels[answers.goals.savingsApproach])
  }
  if (answers.goals.debtGoals.length > 0 && !answers.goals.debtGoals.includes('None')) {
    lines.push(`Paying down: ${answers.goals.debtGoals.join(', ')}`)
  }
  return lines
}

type HouseholdTypeNonNull = 'solo' | 'couple' | 'family' | 'shared'

export type SampleTransaction = {
  key: string
  label: string
  description: string
}

export const SAMPLE_TRANSACTIONS: SampleTransaction[] = [
  { key: 'groceries', label: 'Weekly groceries', description: 'A regular grocery store run.' },
  { key: 'solo-lunch', label: 'Solo lunch', description: 'Lunch out, just for you.' },
  {
    key: 'partner-dinner',
    label: 'Dinner with a partner',
    description: 'A restaurant dinner together.',
  },
  { key: 'uber-work', label: 'Uber to work', description: 'A rideshare for your regular commute.' },
  {
    key: 'uber-airport',
    label: 'Uber to the airport for vacation',
    description: 'A rideshare to catch a vacation flight.',
  },
  {
    key: 'road-trip-gas',
    label: 'Gas during a road trip',
    description: 'Fuel purchased while traveling.',
  },
  { key: 'prescription', label: 'Prescription pickup', description: 'Picking up a prescription.' },
  { key: 'pet-food', label: 'Pet-food delivery', description: 'A delivery order of pet food.' },
  { key: 'vet-visit', label: 'Veterinary appointment', description: 'A checkup for your pet.' },
  {
    key: 'subscription',
    label: 'Monthly subscription',
    description: 'A recurring subscription charge.',
  },
  { key: 'home-repair', label: 'Home repair', description: 'A repair around the house.' },
  {
    key: 'birthday-gift',
    label: 'Birthday gift',
    description: 'A gift for someone\u2019s birthday.',
  },
]

function findByName(recommendations: EnvelopeRecommendation[], ...candidates: string[]) {
  for (const candidate of candidates) {
    const match = recommendations.find(
      (item) => item.name.toLowerCase() === candidate.toLowerCase(),
    )
    if (match) return match
  }
  return null
}

export function routeSampleTransaction(
  key: string,
  answers: OnboardingAnswers,
  recommendations: EnvelopeRecommendation[],
): { envelope: EnvelopeRecommendation; reason: string } {
  const fallback: EnvelopeRecommendation = {
    id: 'miscellaneous',
    name: 'Miscellaneous',
    group: 'Wants',
    purpose: 'A home for small or unusual purchases',
    reason:
      'Every Tally budget includes Miscellaneous for spending that does not fit anywhere else.',
    includes: ['small or unusual purchases'],
    excludes: ['anything that fits a more specific envelope'],
    source: 'system',
    locked: true,
  }
  const misc = recommendations.find((item) => item.id === 'miscellaneous') ?? fallback

  const respond = (envelope: EnvelopeRecommendation | null, reason: string) => ({
    envelope: envelope ?? misc,
    reason: envelope ? reason : 'No specific envelope applies, so this falls to Miscellaneous.',
  })

  switch (key) {
    case 'groceries':
      return respond(
        findByName(recommendations, 'Groceries', 'Food'),
        'Routine grocery purchases belong in Groceries.',
      )
    case 'solo-lunch': {
      if (answers.food.casualMeal === 'fun_money') {
        return respond(
          findByName(recommendations, 'Fun Money'),
          'You chose to route casual solo meals to Fun Money.',
        )
      }
      return respond(
        findByName(recommendations, 'Dining Out', 'Food'),
        'A casual solo meal is routine dining, not a shared occasion.',
      )
    }
    case 'partner-dinner':
      return respond(
        findByName(recommendations, 'Date Night', 'Dining Out', 'Food'),
        'A meal shared with a partner is an explicit shared occasion.',
      )
    case 'uber-work':
      return respond(
        findByName(
          recommendations,
          'Non-car Transportation',
          'Transportation',
          'Car Costs',
          'Other Transportation',
        ),
        'A commute to work is everyday transportation, not travel.',
      )
    case 'uber-airport':
      return respond(
        findByName(recommendations, 'Trips & Vacation', 'Work Travel') ??
          recommendations.find(
            (item) => item.source === 'transportation' && item.group === 'Savings',
          ) ??
          null,
        'Trip context overrides ordinary transportation routing.',
      )
    case 'road-trip-gas':
      return respond(
        findByName(recommendations, 'Trips & Vacation') ??
          recommendations.find(
            (item) => item.source === 'transportation' && item.group === 'Savings',
          ) ??
          null,
        'Gas purchased during a trip is a trip expense, not everyday transportation.',
      )
    case 'prescription':
      return respond(
        findByName(recommendations, 'Healthcare', 'Medical & Dental'),
        'Prescriptions are routine medical spending.',
      )
    case 'pet-food':
      return respond(
        findByName(recommendations, 'Pet Food', 'Pet Care'),
        'Pet food is routine pet spending, not veterinary care.',
      )
    case 'vet-visit':
      return respond(
        findByName(recommendations, 'Vet Care', 'Pet Care'),
        'A veterinary appointment is medical care for your pet.',
      )
    case 'subscription':
      return respond(
        findByName(
          recommendations,
          'Subscriptions',
          'Entertainment Subscriptions',
          'Essential Subscriptions',
        ),
        'Recurring subscription charges belong in a Subscriptions envelope.',
      )
    case 'home-repair':
      return respond(
        findByName(recommendations, 'Home Repairs', 'Home', 'Home Maintenance'),
        'A repair is home spending, distinct from Rent/Mortgage and Utilities.',
      )
    case 'birthday-gift':
      return respond(
        findByName(recommendations, 'Gifts & Holidays'),
        'A birthday gift is a gift-giving occasion.',
      )
    default:
      return respond(null, '')
  }
}
