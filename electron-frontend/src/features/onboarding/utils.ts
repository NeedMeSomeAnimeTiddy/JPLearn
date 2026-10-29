import type { KnownItem } from '../../electron'
import { ipcErrorReason } from '../../lib/ipcErrorReason'
import { FAMILIARITY_ITEMS, SUBMIT_FAILURE_LEAD } from './constants'
import type { OnboardingAnswers, OnboardingFailure } from './types'

/** The checklist's ticks the bridge can seed, in checklist order; anything else is dropped. */
export function knownItemsFromChecked(checked: ReadonlySet<string>): KnownItem[] {
  return FAMILIARITY_ITEMS.filter((item) => checked.has(item.key)).map((item) => item.key)
}

/** The sentence the wizard shows for a failed save. */
export function onboardingFailureSentence(failure: OnboardingFailure): string {
  return `${SUBMIT_FAILURE_LEAD[failure.stage]}: ${failure.message}`
}

export interface OnboardingSaveSteps {
  applyKnownItems: (items: KnownItem[]) => Promise<unknown>
  /** runs only after a successful seed; must not throw */
  afterSeeded: () => Promise<void>
  completeOnboarding: (answers: OnboardingAnswers) => Promise<void>
}

/**
 * Seeds the ticked decks as known, then records that onboarding finished. Nothing ticked seeds
 * nothing. A failed seed stops before onboarding is recorded, so the learner's ticks are never
 * silently lost; either failure names its stage. A retry runs the whole sequence again, which is
 * safe because re-seeding is a no-op on the bridge.
 */
export async function saveOnboarding(
  checked: ReadonlySet<string>,
  answers: OnboardingAnswers,
  steps: OnboardingSaveSteps,
): Promise<OnboardingFailure | null> {
  const items = knownItemsFromChecked(checked)
  if (items.length > 0) {
    try {
      await steps.applyKnownItems(items)
    } catch (error) {
      return { stage: 'known_items', message: ipcErrorReason(error) }
    }
    await steps.afterSeeded()
  }
  try {
    await steps.completeOnboarding(answers)
  } catch (error) {
    return { stage: 'complete', message: ipcErrorReason(error) }
  }
  return null
}
