import { ArrowLeft, Check, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getCategoryIcon } from './categoryIcon'
import {
  buildLiveUnderstanding,
  computeRecommendations,
  type EnvelopeRecommendation,
  SAMPLE_TRANSACTIONS,
} from './onboardingEngine'
import type { BudgetGroup, HouseholdType, OnboardingAnswers } from './types/budget'

type Phase = 'sections' | 'review' | 'boundary-test'

const SECTION_TITLES = [
  'Household',
  'Essentials',
  'Food',
  'Fun & Lifestyle',
  'Transportation',
  'Home & Life',
  'Goals',
]

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function AdaptiveOnboarding({
  initialAnswers,
  initialSection,
  onProgress,
  onCancel,
  onFinish,
}: {
  initialAnswers: OnboardingAnswers
  initialSection: number
  onProgress: (answers: OnboardingAnswers, section: number) => void
  onCancel: () => void
  onFinish: (envelopes: EnvelopeRecommendation[], summary: string) => void
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers)
  const [sectionIndex, setSectionIndex] = useState(
    Math.min(initialSection, SECTION_TITLES.length - 1),
  )
  const [phase, setPhase] = useState<Phase>('sections')
  const [error, setError] = useState('')

  const recommendations = useMemo(() => computeRecommendations(answers), [answers])
  const liveUnderstanding = useMemo(() => buildLiveUnderstanding(answers), [answers])

  const [renames, setRenames] = useState<Record<string, string>>({})
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const finalEnvelopes = useMemo(
    () =>
      recommendations
        .filter((item) => !removedIds.has(item.id))
        .map((item) => (renames[item.id] ? { ...item, name: renames[item.id] } : item)),
    [recommendations, removedIds, renames],
  )

  const [txnIndex, setTxnIndex] = useState(0)
  const [userChoices, setUserChoices] = useState<Record<string, string>>({})
  const [testedKeys, setTestedKeys] = useState<Set<string>>(new Set())

  function advanceTransaction() {
    if (txnIndex < SAMPLE_TRANSACTIONS.length - 1) {
      setTxnIndex((current) => current + 1)
    }
  }

  function updateAnswers(patch: (draft: OnboardingAnswers) => OnboardingAnswers) {
    const next = patch(answers)
    setAnswers(next)
    onProgress(next, sectionIndex)
  }

  function goToSection(nextIndex: number) {
    setError('')
    setSectionIndex(nextIndex)
    onProgress(answers, nextIndex)
  }

  function validateSection(): string {
    switch (sectionIndex) {
      case 0:
        if (!answers.household.type) return 'Choose who this budget supports.'
        if (!answers.household.detail) return 'Choose how detailed your budget should feel.'
        return ''
      case 1:
        if (answers.essentials.applicable.length === 0)
          return 'Choose at least one option, or None.'
        return ''
      case 2:
        if (answers.food.areas.length === 0) return 'Choose at least one food area.'
        return ''
      case 3:
        if (!answers.fun.approach) return 'Choose how discretionary spending should work.'
        return ''
      case 4:
        if (answers.transportation.costs.length === 0) return 'Choose at least one option, or None.'
        return ''
      case 5:
        if (answers.homeLife.areas.length === 0) return 'Choose at least one option, or None.'
        return ''
      case 6:
        if (!answers.goals.savingsApproach) return 'Choose how you currently save.'
        return ''
      default:
        return ''
    }
  }

  function goNextSection() {
    const message = validateSection()
    if (message) {
      setError(message)
      return
    }
    if (sectionIndex === SECTION_TITLES.length - 1) {
      setPhase('review')
      return
    }
    goToSection(sectionIndex + 1)
  }

  function goBackSection() {
    if (sectionIndex === 0) {
      onCancel()
      return
    }
    goToSection(sectionIndex - 1)
  }

  function renameEnvelope(id: string, name: string) {
    setRenames((prev) => ({ ...prev, [id]: name }))
  }

  function removeEnvelope(id: string) {
    setRemovedIds((prev) => new Set(prev).add(id))
  }

  function restoreEnvelope(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function finish() {
    const summary = `Tally built ${finalEnvelopes.length} envelopes from your answers.`
    onFinish(finalEnvelopes, summary)
  }

  return (
    <div className="adaptive-onboarding">
      <aside className="adaptive-live-panel">
        <h2>What Tally understands</h2>
        {liveUnderstanding.length === 0 ? (
          <p className="adaptive-live-empty">
            Answer questions and Tally will summarize what it learns here.
          </p>
        ) : (
          <ul>
            {liveUnderstanding.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <p className="adaptive-live-reassurance">
          If Tally misunderstands something, change the answer before it becomes part of your
          budget.
        </p>
      </aside>

      <div className="adaptive-main">
        {phase === 'sections' && (
          <section className="onboarding-step wide">
            <p className="eyebrow">
              Section {sectionIndex + 1} of {SECTION_TITLES.length}
            </p>
            <h1>{SECTION_TITLES[sectionIndex]}</h1>
            {sectionIndex === 0 && <HouseholdSection answers={answers} onChange={updateAnswers} />}
            {sectionIndex === 1 && <EssentialsSection answers={answers} onChange={updateAnswers} />}
            {sectionIndex === 2 && <FoodSection answers={answers} onChange={updateAnswers} />}
            {sectionIndex === 3 && <FunSection answers={answers} onChange={updateAnswers} />}
            {sectionIndex === 4 && (
              <TransportationSection answers={answers} onChange={updateAnswers} />
            )}
            {sectionIndex === 5 && <HomeLifeSection answers={answers} onChange={updateAnswers} />}
            {sectionIndex === 6 && <GoalsSection answers={answers} onChange={updateAnswers} />}

            {error && <p className="form-message">{error}</p>}
            <div className="assistant-controls">
              <button className="text-button" onClick={goBackSection} type="button">
                <ArrowLeft size={15} /> {sectionIndex === 0 ? 'Cancel' : 'Back'}
              </button>
              <button className="primary-action" onClick={goNextSection} type="button">
                {sectionIndex === SECTION_TITLES.length - 1 ? 'Review my envelopes' : 'Continue'}
              </button>
            </div>
          </section>
        )}

        {phase === 'review' && (
          <ReviewPhase
            recommendations={recommendations}
            removedIds={removedIds}
            renames={renames}
            onRename={renameEnvelope}
            onRemove={removeEnvelope}
            onRestore={restoreEnvelope}
            onBack={() => setPhase('sections')}
            onContinue={() => setPhase('boundary-test')}
          />
        )}

        {phase === 'boundary-test' && (
          <BoundaryTestPhase
            envelopes={finalEnvelopes}
            txnIndex={txnIndex}
            testedCount={testedKeys.size}
            totalCount={SAMPLE_TRANSACTIONS.length}
            userChoices={userChoices}
            onChoose={(key, envelopeName) => {
              setTestedKeys((prev) => new Set(prev).add(key))
              setUserChoices((prev) => ({ ...prev, [key]: envelopeName }))
              advanceTransaction()
            }}
            onNext={finish}
            onSkip={(key) => {
              setTestedKeys((prev) => new Set(prev).add(key))
              advanceTransaction()
            }}
            onBack={() => {
              if (txnIndex > 0) setTxnIndex((current) => current - 1)
              else setPhase('review')
            }}
          />
        )}
      </div>
    </div>
  )
}

function OptionGrid({
  options,
  selected,
  onToggle,
  multi,
}: {
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  multi?: boolean
}) {
  return (
    <div className="assistant-option-grid">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            className={isSelected ? 'selected' : ''}
            key={option}
            onClick={() => onToggle(option)}
            type="button"
          >
            {multi && isSelected && <Check size={14} />} {option}
          </button>
        )
      })}
    </div>
  )
}

function HouseholdSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const household = answers.household
  return (
    <>
      <p className="onboarding-lead">Who does this budget support?</p>
      <OptionGrid
        options={[
          'Just me',
          'Me and a partner',
          'A family with children',
          'A shared household or roommates',
        ]}
        selected={household.type ? [householdLabel(household.type)] : []}
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            household: { ...draft.household, type: householdValue(value) },
          }))
        }
      />
      <p className="onboarding-lead">How detailed should your budget feel?</p>
      <OptionGrid
        options={['Simple', 'Balanced', 'Detailed']}
        selected={household.detail ? [titleOf(household.detail)] : []}
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            household: {
              ...draft.household,
              detail: value.toLowerCase() as OnboardingAnswers['household']['detail'],
            },
          }))
        }
      />
      {household.type && household.type !== 'solo' && (
        <label>
          Names for personal allowances (optional, comma separated)
          <input
            onChange={(event) =>
              onChange((draft) => ({
                ...draft,
                household: { ...draft.household, memberNames: event.target.value },
              }))
            }
            placeholder="Me, Partner"
            value={household.memberNames}
          />
        </label>
      )}
    </>
  )
}

function householdValue(label: string): HouseholdType {
  if (label === 'Just me') return 'solo'
  if (label === 'Me and a partner') return 'couple'
  if (label === 'A family with children') return 'family'
  return 'shared'
}

function householdLabel(type: HouseholdType): string {
  if (type === 'solo') return 'Just me'
  if (type === 'couple') return 'Me and a partner'
  if (type === 'family') return 'A family with children'
  return 'A shared household or roommates'
}

function titleOf(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value
}

function EssentialsSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const essentials = answers.essentials
  const options = [
    'Rent/Mortgage',
    'Utilities',
    'Insurance',
    'Healthcare',
    'Childcare or School',
    'Personal Care',
    'None',
  ]
  return (
    <>
      <p className="onboarding-lead">Which essential expenses belong in your budget?</p>
      <OptionGrid
        multi
        options={options}
        selected={essentials.applicable}
        onToggle={(value) =>
          onChange((draft) => {
            const nextApplicable =
              value === 'None'
                ? ['None']
                : toggle(
                    draft.essentials.applicable.filter((item) => item !== 'None'),
                    value,
                  )
            return { ...draft, essentials: { ...draft.essentials, applicable: nextApplicable } }
          })
        }
      />
      {essentials.applicable.includes('Rent/Mortgage') &&
        essentials.applicable.includes('Utilities') && (
          <>
            <p className="onboarding-lead">How should Rent/Mortgage and Utilities work?</p>
            <OptionGrid
              options={[
                'Rent/Mortgage and Utilities separately',
                'Combine them into one Home Bills envelope',
                'Utilities are included in Rent/Mortgage',
              ]}
              selected={
                essentials.rentUtilities === 'separate'
                  ? ['Rent/Mortgage and Utilities separately']
                  : essentials.rentUtilities === 'combine'
                    ? ['Combine them into one Home Bills envelope']
                    : essentials.rentUtilities === 'included'
                      ? ['Utilities are included in Rent/Mortgage']
                      : []
              }
              onToggle={(value) =>
                onChange((draft) => ({
                  ...draft,
                  essentials: {
                    ...draft.essentials,
                    rentUtilities: value.startsWith('Combine')
                      ? 'combine'
                      : value.startsWith('Utilities are included')
                        ? 'included'
                        : 'separate',
                  },
                }))
              }
            />
          </>
        )}
      {essentials.applicable.includes('Insurance') && (
        <>
          <p className="onboarding-lead">How should Insurance work?</p>
          <OptionGrid
            options={[
              'One Insurance envelope',
              'Separate by insurance type',
              'Treat it as ordinary fixed bills',
            ]}
            selected={
              essentials.insurance === 'one'
                ? ['One Insurance envelope']
                : essentials.insurance === 'separate'
                  ? ['Separate by insurance type']
                  : essentials.insurance === 'ordinary'
                    ? ['Treat it as ordinary fixed bills']
                    : []
            }
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                essentials: {
                  ...draft.essentials,
                  insurance: value.startsWith('One')
                    ? 'one'
                    : value.startsWith('Separate')
                      ? 'separate'
                      : 'ordinary',
                },
              }))
            }
          />
        </>
      )}
    </>
  )
}

function FoodSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const food = answers.food
  const options = [
    'Groceries',
    'Routine Dining and Takeout',
    'Date Nights',
    'Social Meals',
    'Health & Nutrition',
    'Keep All Food Together',
  ]
  return (
    <>
      <p className="onboarding-lead">Which food areas need their own spending limit?</p>
      <OptionGrid
        multi
        options={options}
        selected={food.areas}
        onToggle={(value) =>
          onChange((draft) => {
            const nextAreas =
              value === 'Keep All Food Together'
                ? ['Keep All Food Together']
                : toggle(
                    draft.food.areas.filter((item) => item !== 'Keep All Food Together'),
                    value,
                  )
            return { ...draft, food: { ...draft.food, areas: nextAreas } }
          })
        }
      />
      <p className="onboarding-lead">Where should a casual meal purchased for yourself go?</p>
      <OptionGrid
        options={['Dining Out', 'Personal Fun Money', 'Ask based on the occasion']}
        selected={
          food.casualMeal === 'dining_out'
            ? ['Dining Out']
            : food.casualMeal === 'fun_money'
              ? ['Personal Fun Money']
              : food.casualMeal === 'ask'
                ? ['Ask based on the occasion']
                : []
        }
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            food: {
              ...draft.food,
              casualMeal:
                value === 'Dining Out'
                  ? 'dining_out'
                  : value === 'Personal Fun Money'
                    ? 'fun_money'
                    : 'ask',
            },
          }))
        }
      />
      <label>
        Is there a food expense worth tracking separately? (optional)
        <input
          onChange={(event) =>
            onChange((draft) => ({
              ...draft,
              food: { ...draft.food, specialFood: event.target.value },
            }))
          }
          placeholder="Coffee, supplements, work lunches..."
          value={food.specialFood}
        />
      </label>
    </>
  )
}

function FunSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const fun = answers.fun
  const householdSupportsMultiple = answers.household.type !== 'solo'
  const approachOptions = [
    'One Fun Money envelope',
    ...(householdSupportsMultiple ? ['Separate Fun Money by person'] : []),
    'By category',
  ]
  return (
    <>
      <p className="onboarding-lead">How should personal discretionary spending work?</p>
      <OptionGrid
        options={approachOptions}
        selected={
          fun.approach === 'one'
            ? ['One Fun Money envelope']
            : fun.approach === 'by_person'
              ? ['Separate Fun Money by person']
              : fun.approach === 'by_category'
                ? ['By category']
                : []
        }
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            fun: {
              ...draft.fun,
              approach: value.startsWith('One')
                ? 'one'
                : value.startsWith('Separate')
                  ? 'by_person'
                  : 'by_category',
            },
          }))
        }
      />
      {fun.approach === 'by_category' && (
        <>
          <p className="onboarding-lead">
            Which discretionary spending categories should have their own envelope?
          </p>
          <OptionGrid
            multi
            options={[
              'Shopping',
              'Entertainment',
              'Social Activities',
              'Hobbies or Fitness',
              'Gifts and Holidays',
              'Dining Out',
              'Date Night',
            ]}
            selected={fun.categories}
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                fun: { ...draft.fun, categories: toggle(draft.fun.categories, value) },
              }))
            }
          />
        </>
      )}
      <label>
        What spending needs special attention? (optional)
        <input
          onChange={(event) =>
            onChange((draft) => ({
              ...draft,
              fun: { ...draft.fun, specialAttention: event.target.value },
            }))
          }
          placeholder="Golf, skincare, concerts, kids' activities..."
          value={fun.specialAttention}
        />
      </label>
    </>
  )
}

function TransportationSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const transportation = answers.transportation
  return (
    <>
      <p className="onboarding-lead">Which transportation costs do you pay?</p>
      <OptionGrid
        multi
        options={[
          'Gas or EV Charging',
          'Car Maintenance',
          'Car Payment',
          'Auto Insurance',
          'Public Transit',
          'Rideshare, Taxis, Bikes, or Scooters',
          'None',
        ]}
        selected={transportation.costs}
        onToggle={(value) =>
          onChange((draft) => {
            const nextCosts =
              value === 'None'
                ? ['None']
                : toggle(
                    draft.transportation.costs.filter((item) => item !== 'None'),
                    value,
                  )
            return { ...draft, transportation: { ...draft.transportation, costs: nextCosts } }
          })
        }
      />
      <p className="onboarding-lead">How detailed should everyday transportation be?</p>
      <OptionGrid
        options={[
          'One Transportation envelope',
          'Car Costs and Non-car Transportation',
          'Gas, Maintenance, and Other Transportation separately',
          'No dedicated Transportation envelope',
        ]}
        selected={
          transportation.detail === 'one'
            ? ['One Transportation envelope']
            : transportation.detail === 'car_noncar'
              ? ['Car Costs and Non-car Transportation']
              : transportation.detail === 'gas_maintenance_other'
                ? ['Gas, Maintenance, and Other Transportation separately']
                : transportation.detail === 'none'
                  ? ['No dedicated Transportation envelope']
                  : []
        }
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            transportation: {
              ...draft.transportation,
              detail: value.startsWith('One')
                ? 'one'
                : value.startsWith('Car Costs')
                  ? 'car_noncar'
                  : value.startsWith('Gas')
                    ? 'gas_maintenance_other'
                    : 'none',
            },
          }))
        }
      />
      <p className="onboarding-lead">How should purchases made during a trip work?</p>
      <OptionGrid
        options={[
          'One Trips & Vacation envelope',
          'Work Travel and Personal Travel separately',
          'Create envelopes for major trips',
          'Use normal spending categories',
          'I rarely or never travel',
        ]}
        selected={
          transportation.trips === 'one'
            ? ['One Trips & Vacation envelope']
            : transportation.trips === 'work_personal'
              ? ['Work Travel and Personal Travel separately']
              : transportation.trips === 'major_trips'
                ? ['Create envelopes for major trips']
                : transportation.trips === 'normal_categories'
                  ? ['Use normal spending categories']
                  : transportation.trips === 'rarely'
                    ? ['I rarely or never travel']
                    : []
        }
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            transportation: {
              ...draft.transportation,
              trips: value.startsWith('One')
                ? 'one'
                : value.startsWith('Work Travel')
                  ? 'work_personal'
                  : value.startsWith('Create')
                    ? 'major_trips'
                    : value.startsWith('Use normal')
                      ? 'normal_categories'
                      : 'rarely',
            },
          }))
        }
      />
      {transportation.trips === 'major_trips' && (
        <label>
          Name your upcoming trip(s) (optional, comma separated)
          <input
            onChange={(event) =>
              onChange((draft) => ({
                ...draft,
                transportation: { ...draft.transportation, tripNames: event.target.value },
              }))
            }
            placeholder="Italy Trip, Ski Weekend"
            value={transportation.tripNames}
          />
        </label>
      )}
    </>
  )
}

function HomeLifeSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const homeLife = answers.homeLife
  return (
    <>
      <p className="onboarding-lead">Which areas apply to your life?</p>
      <OptionGrid
        multi
        options={[
          'Pets',
          'Home Furniture, Repairs, or Projects',
          'Medical or Dental',
          'Subscriptions',
          'Donations or Giving',
          'Annual Bills',
          'None',
        ]}
        selected={homeLife.areas}
        onToggle={(value) =>
          onChange((draft) => {
            const nextAreas =
              value === 'None'
                ? ['None']
                : toggle(
                    draft.homeLife.areas.filter((item) => item !== 'None'),
                    value,
                  )
            return { ...draft, homeLife: { ...draft.homeLife, areas: nextAreas } }
          })
        }
      />
      {homeLife.areas.includes('Pets') && (
        <>
          <p className="onboarding-lead">How should pet spending be organized?</p>
          <OptionGrid
            options={[
              'One Pet Care envelope',
              'Pet Care and Vet Care',
              'Pet Food, Vet Care, and Pet Fun separately',
              'No Pet envelope',
            ]}
            selected={
              homeLife.petOrg === 'one'
                ? ['One Pet Care envelope']
                : homeLife.petOrg === 'pet_vet'
                  ? ['Pet Care and Vet Care']
                  : homeLife.petOrg === 'pet_vet_fun'
                    ? ['Pet Food, Vet Care, and Pet Fun separately']
                    : homeLife.petOrg === 'none'
                      ? ['No Pet envelope']
                      : []
            }
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                homeLife: {
                  ...draft.homeLife,
                  petOrg: value.startsWith('One')
                    ? 'one'
                    : value === 'Pet Care and Vet Care'
                      ? 'pet_vet'
                      : value.startsWith('Pet Food')
                        ? 'pet_vet_fun'
                        : 'none',
                },
              }))
            }
          />
        </>
      )}
      {homeLife.areas.includes('Home Furniture, Repairs, or Projects') && (
        <>
          <p className="onboarding-lead">How should spending on your home be organized?</p>
          <OptionGrid
            options={[
              'One Home envelope for everything',
              'Separate Home Repairs from Furniture & Decor',
              'Separate Home Maintenance from larger Home Projects',
              'I do not need a home-spending envelope',
            ]}
            selected={
              homeLife.homeOrg === 'one'
                ? ['One Home envelope for everything']
                : homeLife.homeOrg === 'repairs_furniture'
                  ? ['Separate Home Repairs from Furniture & Decor']
                  : homeLife.homeOrg === 'maintenance_projects'
                    ? ['Separate Home Maintenance from larger Home Projects']
                    : homeLife.homeOrg === 'none'
                      ? ['I do not need a home-spending envelope']
                      : []
            }
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                homeLife: {
                  ...draft.homeLife,
                  homeOrg: value.startsWith('One')
                    ? 'one'
                    : value.startsWith('Separate Home Repairs')
                      ? 'repairs_furniture'
                      : value.startsWith('Separate Home Maintenance')
                        ? 'maintenance_projects'
                        : 'none',
                },
              }))
            }
          />
        </>
      )}
      {(homeLife.areas.includes('Subscriptions') || homeLife.subscriptions) && (
        <>
          <p className="onboarding-lead">How should Subscriptions work?</p>
          <OptionGrid
            options={[
              'One Subscriptions envelope',
              'Essential and Entertainment Subscriptions separately',
              'Treat them as ordinary bills',
              'No Subscriptions envelope',
            ]}
            selected={
              homeLife.subscriptions === 'one'
                ? ['One Subscriptions envelope']
                : homeLife.subscriptions === 'essential_entertainment'
                  ? ['Essential and Entertainment Subscriptions separately']
                  : homeLife.subscriptions === 'ordinary'
                    ? ['Treat them as ordinary bills']
                    : homeLife.subscriptions === 'none'
                      ? ['No Subscriptions envelope']
                      : []
            }
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                homeLife: {
                  ...draft.homeLife,
                  subscriptions: value.startsWith('One')
                    ? 'one'
                    : value.startsWith('Essential')
                      ? 'essential_entertainment'
                      : value.startsWith('Treat')
                        ? 'ordinary'
                        : 'none',
                },
              }))
            }
          />
        </>
      )}
      {homeLife.areas.includes('Donations or Giving') && (
        <>
          <p className="onboarding-lead">How should giving be organized?</p>
          <OptionGrid
            options={[
              'Create a Giving envelope',
              'Create Seasonal Giving',
              'Do not create a Giving envelope',
            ]}
            selected={
              homeLife.giving === 'giving'
                ? ['Create a Giving envelope']
                : homeLife.giving === 'seasonal'
                  ? ['Create Seasonal Giving']
                  : homeLife.giving === 'none'
                    ? ['Do not create a Giving envelope']
                    : []
            }
            onToggle={(value) =>
              onChange((draft) => ({
                ...draft,
                homeLife: {
                  ...draft.homeLife,
                  giving: value.startsWith('Create a Giving')
                    ? 'giving'
                    : value.startsWith('Create Seasonal')
                      ? 'seasonal'
                      : 'none',
                },
              }))
            }
          />
        </>
      )}
    </>
  )
}

function GoalsSection({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers
  onChange: (patch: (draft: OnboardingAnswers) => OnboardingAnswers) => void
}) {
  const goals = answers.goals
  return (
    <>
      <p className="onboarding-lead">How do you currently save?</p>
      <OptionGrid
        options={[
          'Emergency Fund plus additional savings',
          'Spend below my means and save the remainder',
          'One specific goal',
          'Several savings goals',
          'Not actively saving yet',
        ]}
        selected={
          goals.savingsApproach === 'emergency_plus'
            ? ['Emergency Fund plus additional savings']
            : goals.savingsApproach === 'below_means'
              ? ['Spend below my means and save the remainder']
              : goals.savingsApproach === 'one_goal'
                ? ['One specific goal']
                : goals.savingsApproach === 'several_goals'
                  ? ['Several savings goals']
                  : goals.savingsApproach === 'not_saving'
                    ? ['Not actively saving yet']
                    : []
        }
        onToggle={(value) =>
          onChange((draft) => ({
            ...draft,
            goals: {
              ...draft.goals,
              savingsApproach: value.startsWith('Emergency')
                ? 'emergency_plus'
                : value.startsWith('Spend below')
                  ? 'below_means'
                  : value === 'One specific goal'
                    ? 'one_goal'
                    : value.startsWith('Several')
                      ? 'several_goals'
                      : 'not_saving',
            },
          }))
        }
      />
      {(goals.savingsApproach === 'one_goal' || goals.savingsApproach === 'several_goals') && (
        <label>
          Name your savings goal(s), comma separated
          <input
            onChange={(event) =>
              onChange((draft) => ({
                ...draft,
                goals: { ...draft.goals, goalNames: event.target.value },
              }))
            }
            placeholder="Emergency Fund, House, New Car, College"
            value={goals.goalNames}
          />
        </label>
      )}
      <p className="onboarding-lead">Are you working on paying down any debt?</p>
      <OptionGrid
        multi
        options={['Credit Card Payoff', 'Student Loans', 'Auto Loan', 'Personal Loan', 'None']}
        selected={goals.debtGoals}
        onToggle={(value) =>
          onChange((draft) => {
            const nextDebt =
              value === 'None'
                ? ['None']
                : toggle(
                    draft.goals.debtGoals.filter((item) => item !== 'None'),
                    value,
                  )
            return { ...draft, goals: { ...draft.goals, debtGoals: nextDebt } }
          })
        }
      />
    </>
  )
}

function ReviewPhase({
  recommendations,
  removedIds,
  renames,
  onRename,
  onRemove,
  onRestore,
  onBack,
  onContinue,
}: {
  recommendations: EnvelopeRecommendation[]
  removedIds: Set<string>
  renames: Record<string, string>
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const groups: BudgetGroup[] = ['Needs', 'Wants', 'Savings']
  return (
    <section className="onboarding-step wide">
      <p className="eyebrow">Recommendation review</p>
      <h1>Here's the envelope set Tally built for you.</h1>
      <p className="onboarding-lead">
        Rename or remove anything before continuing. Amounts come later.
      </p>
      {groups.map((group) => {
        const items = recommendations.filter((item) => item.group === group)
        if (items.length === 0) return null
        return (
          <section className={`adaptive-review-section ${group.toLowerCase()}`} key={group}>
            <header className="adaptive-review-section-header">
              <span className={`group-pill ${group.toLowerCase()}`}>{group}</span>
              <small>{items.length} envelopes</small>
            </header>
            <div className="adaptive-review-list">
              {items.map((item) => {
                const removed = removedIds.has(item.id)
                return (
                  <div
                    className={`adaptive-review-card ${group.toLowerCase()} ${removed ? 'removed' : ''}`}
                    key={item.id}
                  >
                    <div className="adaptive-review-card-header">
                      <input
                        disabled={removed}
                        onChange={(event) => onRename(item.id, event.target.value)}
                        value={renames[item.id] ?? item.name}
                      />
                      {!item.locked && (
                        <button
                          onClick={() => (removed ? onRestore(item.id) : onRemove(item.id))}
                          title={removed ? 'Restore envelope' : 'Remove envelope'}
                          type="button"
                        >
                          {removed ? <Sparkles size={15} /> : <X size={15} />}
                        </button>
                      )}
                    </div>
                    <p className="adaptive-review-reason">{item.reason}</p>
                    <p className="adaptive-review-boundary">
                      <strong>Includes:</strong> {item.includes.join(', ') || '—'}
                    </p>
                    {item.excludes.length > 0 && (
                      <p className="adaptive-review-boundary">
                        <strong>Doesn't include:</strong> {item.excludes.join(', ')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      <div className="assistant-controls">
        <button className="text-button" onClick={onBack} type="button">
          <ArrowLeft size={15} /> Back to questions
        </button>
        <button className="primary-action" onClick={onContinue} type="button">
          Test it with sample transactions
        </button>
      </div>
    </section>
  )
}

function BoundaryTestPhase({
  envelopes,
  txnIndex,
  testedCount,
  totalCount,
  userChoices,
  onChoose,
  onNext,
  onSkip,
  onBack,
}: {
  envelopes: EnvelopeRecommendation[]
  txnIndex: number
  testedCount: number
  totalCount: number
  userChoices: Record<string, string>
  onChoose: (key: string, envelopeName: string) => void
  onNext: () => void
  onSkip: (key: string) => void
  onBack: () => void
}) {
  const txn = SAMPLE_TRANSACTIONS[txnIndex]
  const chosen = userChoices[txn.key]
  const groups: BudgetGroup[] = ['Needs', 'Wants', 'Savings']
  const allTested = testedCount >= totalCount

  return (
    <section className="onboarding-step wide">
      <p className="eyebrow">
        Transaction {txnIndex + 1} of {totalCount} &middot; {testedCount} of {totalCount} tested
      </p>
      <h1>Categorize this transaction</h1>
      <article className="manual-card">
        <strong>{txn.label}</strong>
        <small>{txn.description}</small>
      </article>
      <div className="envelope-groups">
        {groups.map((group) => {
          const rows = envelopes.filter((item) => item.group === group)
          if (rows.length === 0) return null
          return (
            <div className="envelope-group" key={group}>
              <p className="envelope-group-label">{group}</p>
              <div className="envelope-grid">
                {rows.map((item) => {
                  const Icon = getCategoryIcon(item.name)
                  const selected = chosen === item.name
                  return (
                    <button
                      className={`envelope-tile ${item.group.toLowerCase()} ${selected ? 'selected' : ''}`}
                      key={item.id}
                      onClick={() => onChoose(txn.key, item.name)}
                      type="button"
                    >
                      <Icon size={18} />
                      <span>{item.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="assistant-controls">
        <button className="text-button" onClick={onBack} type="button">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="adaptive-boundary-forward-actions">
          <button className="outline-action" onClick={() => onSkip(txn.key)} type="button">
            Skip
          </button>
          <button className="primary-action" disabled={!allTested} onClick={onNext} type="button">
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
