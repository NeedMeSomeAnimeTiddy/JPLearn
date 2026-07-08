import { useState, useMemo, useCallback, useEffect } from 'react'
import type { Page, OnboardingAnswers, OnboardingWizardProps } from './types'
import { ALL_PAGES, ALL_PAGES_NO_FEATURES } from './types'

export function useOnboarding(props: OnboardingWizardProps) {
  const [page, setPage] = useState<Page>(1)
  const [goal, setGoal] = useState<string | undefined>(undefined)
  const [dailyMinutes, setDailyMinutes] = useState<number | undefined>(undefined)
  const [targetLevel, setTargetLevel] = useState<string | undefined>(undefined)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
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
    }
  }, [actualSteps])

  const goNext = useCallback(() => {
    if (isLastStep) return
    const nextPage = actualSteps[currentIndex + 1]
    if (nextPage !== undefined) setPage(nextPage)
  }, [actualSteps, currentIndex, isLastStep])

  const goBack = useCallback(() => {
    if (isFirstStep) return
    const prevPage = actualSteps[currentIndex - 1]
    if (prevPage !== undefined) setPage(prevPage)
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

  async function handleStart() {
    if (submitting) return
    setSubmitting(true)
    try {
      await props.onComplete('complete_beginner', checkedItems, buildAnswers())
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    if (submitting) return
    setSubmitting(true)
    try {
      await props.onSkip(checkedItems, buildAnswers())
    } finally {
      setSubmitting(false)
    }
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
