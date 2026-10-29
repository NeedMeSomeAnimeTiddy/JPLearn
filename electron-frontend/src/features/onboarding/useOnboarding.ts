import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Page, OnboardingAnswers, OnboardingFailure, OnboardingWizardProps } from './types'
import { ALL_PAGES, ALL_PAGES_NO_FEATURES } from './types'
import { onboardingFailureSentence } from './utils'
import { ipcErrorReason } from '../../lib/ipcErrorReason'

export function useOnboarding(props: OnboardingWizardProps) {
  const [page, setPage] = useState<Page>(1)
  const [goal, setGoal] = useState<string | undefined>(undefined)
  const [dailyMinutes, setDailyMinutes] = useState<number | undefined>(undefined)
  const [targetLevel, setTargetLevel] = useState<string | undefined>(undefined)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const [revealed, setRevealed] = useState(false)

  const hasOptionalFeatures =
    props.showChatbotSection ||
    props.showVoiceSection ||
    props.showFontSection

  const actualSteps = useMemo<Page[]>(
    () => (hasOptionalFeatures ? ALL_PAGES : ALL_PAGES_NO_FEATURES),
    [hasOptionalFeatures],
  )

  useEffect(() => {
    if (!actualSteps.includes(page)) {
      setPage(1)
    }
  }, [actualSteps, page])

  // Reset reveal state when page changes
  useEffect(() => {
    setRevealed(false)
  }, [page])

  const currentIndex = actualSteps.indexOf(page)
  const totalSteps = actualSteps.length
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === actualSteps.length - 1

  const goToPage = useCallback((next: Page) => {
    if (actualSteps.includes(next)) {
      setPage(next)
      setSubmitError(null)
    }
  }, [actualSteps])

  const goNext = useCallback(() => {
    if (isLastStep) return
    const nextPage = actualSteps[currentIndex + 1]
    if (nextPage !== undefined) { setPage(nextPage); setSubmitError(null) }
  }, [actualSteps, currentIndex, isLastStep])

  const goBack = useCallback(() => {
    if (isFirstStep) return
    const prevPage = actualSteps[currentIndex - 1]
    if (prevPage !== undefined) { setPage(prevPage); setSubmitError(null) }
  }, [actualSteps, currentIndex, isFirstStep])

  function toggleItem(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function buildAnswers(): OnboardingAnswers {
    return { goal, dailyMinutes, targetLevel }
  }

  /* LEAVING ONBOARDING SAYS WHY IT COULD NOT (audit 12). A failed save used to be swallowed and
     Start did nothing; now the reason shows and Start or Skip retries the whole sequence.
     One attempt at a time: the ref holds back a second press before the re-render can. */
  async function submit(run: () => Promise<OnboardingFailure | null>) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const failure = await run()
      if (failure) setSubmitError(onboardingFailureSentence(failure))
    } catch (error) {
      // The handler reports its own stages; a throw past it still means onboarding did not finish.
      setSubmitError(onboardingFailureSentence({ stage: 'complete', message: ipcErrorReason(error) }))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function handleStart() {
    return submit(() => props.onComplete('complete_beginner', checkedItems, buildAnswers()))
  }

  function handleSkip() {
    return submit(() => props.onSkip(checkedItems, buildAnswers()))
  }

  return {
    page,
    setPage: goToPage,
    goNext,
    goBack,
    goal,
    setGoal: (v: string | undefined) => setGoal(v),
    dailyMinutes,
    setDailyMinutes: (v: number | undefined) => setDailyMinutes(v),
    targetLevel,
    setTargetLevel: (v: string | undefined) => setTargetLevel(v),
    checkedItems,
    toggleItem,
    submitting,
    submitError,
    actualSteps,
    totalSteps,
    isFirstStep,
    isLastStep,
    handleStart,
    handleSkip,
    revealed,
    setRevealed,
  }
}
