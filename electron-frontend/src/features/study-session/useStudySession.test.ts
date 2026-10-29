/**
 * The session hook on its own, for the parts no screen shows today (audit 4).
 *
 * F4: the Up Next list names the cards the round cycle will serve. The cycle is built over the
 * session's pool -- the problem cards, a retry list, a mode's filter -- and its indices used to be
 * read against the whole block. (The list has no button that opens it at present, so it is read
 * here, from the context slice, rather than from the screen.)
 * F7: the session goal is sent only once a round has been built.
 * F8: a session whose goal never started still clears its save and builds its run report.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { DEFAULT_SESSION_LENGTH_PRESET } from '../../constants'
import { SESSION_STORAGE_KEY } from '../../lib/appStorage'
import { baseDesktopApi } from '../../test-fixtures/desktopApi'
import type { RoundState, ScriptDeck } from '../../types'
import type { StudySessionDeps } from './types'
import { useStudySession } from './useStudySession'

const cards: ScriptDeck['cards'] = Array.from({ length: 6 }, (_, id) => ({
  id,
  character: `char${id}`,
  romaji: `r${id}`,
  meaning: `m${id}`,
  tags: ['hiragana'],
  example_sentence: null,
  dictionary_summary: null,
  /* cards 4 and 5 are the problem cards, so their places in the pool (0, 1) differ from the block's */
  is_leech: id >= 4,
  curriculum_stage: 1,
  meaning_distractor_ids: [],
  character_distractor_ids: [],
  note_key: `note:v1:builtin:${id.toString(16).padStart(64, '0')}`,
})) as unknown as ScriptDeck['cards']

/** a round that asks for `cards[index]`'s meaning; the hook only reads these fields */
function roundFor(pool: ScriptDeck['cards'], index: number): RoundState {
  const card = pool[index]
  return {
    cardId: card.id, mode: 'meaning_match', audioText: '', exampleSentenceAudioText: null,
    surprisePrompt: false, curriculumStage: 1, chapterNumber: null, chapterLabel: null,
    hintText: null, dictionarySeedQuery: null, dictionaryNote: null, promptLabel: '',
    focusText: card.character, answer: card.meaning, options: [],
  }
}

function makeDeps(overrides: Partial<StudySessionDeps> = {}): StudySessionDeps {
  return {
    view: 'minigame',
    activeScript: 'hiragana',
    activeGame: 'meaning_match',
    activeDeckSlug: 'hiragana',
    activeBlockCards: cards,
    deckCards: cards,
    scriptStats: { hiragana: { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0 } } as unknown as StudySessionDeps['scriptStats'],
    gameLoading: false,
    navigate: vi.fn(),
    setActiveScript: vi.fn(),
    setActiveGame: vi.fn(),
    setGameError: vi.fn(),
    setDeckCards: vi.fn(),
    openStudyDeck: vi.fn(),
    setCardScores: vi.fn(),
    setScriptStats: vi.fn(),
    setMinigameStats: vi.fn(),
    setXpProgress: vi.fn(),
    setXpToasts: vi.fn(),
    setMilestoneToasts: vi.fn(),
    resolveScriptMinigame: (_script, minigame) => minigame,
    buildRound: (pool, _mode, index) => roundFor(pool, index),
    buildRoundWithBridge: async (pool, _mode, index) => roundFor(pool, index),
    /* the queue serves the problem cards in id order */
    getStudyQueue: async () => ({
      ok: true,
      queue: { slug: 'hiragana', card_ids: [4, 5], indices: [], buckets_due: 0, buckets_leech: 2, buckets_new: 0, buckets_review: 0 },
    }) as unknown as Awaited<ReturnType<StudySessionDeps['getStudyQueue']>>,
    invalidateStudyQueue: vi.fn(),
    onSessionStart: vi.fn(),
    onSessionEnd: vi.fn(),
    queueAssistantToast: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.jplearnDesktop = { ...baseDesktopApi } as unknown as typeof window.jplearnDesktop
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('the Up Next list (audit 4 F4)', () => {
  it('names the problem cards a problem-card session will serve, not the block\'s first cards', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useStudySession(deps))

    /* focus on for this session: the pool is cards 4 and 5, and the first round takes card 4 */
    await act(async () => {
      await result.current.startSession('meaning_match', undefined, undefined, undefined, true)
    })

    expect(result.current.slice.roundState?.cardId).toBe(4)
    expect(result.current.slice.upcomingCards.map((card) => card.id)).toEqual([5])
  })
})

describe('the session goal (audit 4 F7)', () => {
  it('is not recorded when no round can be built', async () => {
    const startSessionGoal = vi.fn(baseDesktopApi.startSessionGoal)
    window.jplearnDesktop = { ...baseDesktopApi, startSessionGoal } as unknown as typeof window.jplearnDesktop
    const deps = makeDeps({ buildRoundWithBridge: async () => null })
    const { result } = renderHook(() => useStudySession(deps))

    await act(async () => {
      await result.current.startSession('meaning_match')
    })

    expect(result.current.sessionActive).toBe(false)
    expect(startSessionGoal).not.toHaveBeenCalled()
  })

  it('is recorded once the first round is built', async () => {
    const startSessionGoal = vi.fn(baseDesktopApi.startSessionGoal)
    window.jplearnDesktop = { ...baseDesktopApi, startSessionGoal } as unknown as typeof window.jplearnDesktop
    const deps = makeDeps()
    const { result } = renderHook(() => useStudySession(deps))

    await act(async () => {
      await result.current.startSession('meaning_match')
    })

    expect(result.current.sessionActive).toBe(true)
    expect(startSessionGoal).toHaveBeenCalledTimes(1)
    expect(result.current.activeSessionId).toBe('test')
  })
})

describe('grading an answer (audit 9)', () => {
  /** a session whose every round is `round`, with the saved review captured */
  async function startWith(round: Partial<RoundState>) {
    window.localStorage.clear()
    const recordGameResult = vi.fn(async () => true)
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult } as unknown as typeof window.jplearnDesktop
    const build = (pool: ScriptDeck['cards'], _mode: unknown, index: number) => ({ ...roundFor(pool, index), ...round })
    const deps = makeDeps({ buildRound: build, buildRoundWithBridge: async (pool, mode, index) => build(pool, mode, index) })
    const hook = renderHook(() => useStudySession(deps))
    await act(async () => { await hook.result.current.startSession('meaning_match') })
    const submit = (answer: string, hintStep?: 0 | 1 | 2) => {
      act(() => { hook.result.current.slice.submitAnswer(answer, hintStep === undefined ? undefined : { hintStep }) })
    }
    const saved = () => (recordGameResult.mock.calls.at(-1) as unknown as [{ isCorrect: boolean }] | undefined)?.[0]
    return { hook, submit, saved }
  }

  it('saves a Dictation answer one kana off as wrong and says it was close (F1)', async () => {
    const { hook, submit, saved } = await startWith({ mode: 'dictation', answer: 'がき', focusText: 'がき' })
    submit('かき')
    await act(async () => {})
    expect(saved()?.isCorrect).toBe(false)
    expect(hook.result.current.slice.roundFeedback).toMatch(/^Close/)
    expect(hook.result.current.slice.roundFeedback).toContain('がき')
  })

  it('names each spelling readably when a reading has two', async () => {
    const { hook, submit, saved } = await startWith({ mode: 'dictation', answer: 'なん/なに', focusText: '何' })
    submit('なね')
    await act(async () => {})
    expect(saved()?.isCorrect).toBe(false)
    expect(hook.result.current.slice.roundFeedback).toContain('なん or なに')
  })

  it('saves いえ for いぬ as wrong in Dictation (F1)', async () => {
    const { submit, saved } = await startWith({ mode: 'dictation', answer: 'いぬ', focusText: '犬' })
    submit('いえ')
    await act(async () => {})
    expect(saved()?.isCorrect).toBe(false)
  })

  it('accepts coffee typed with the long-vowel mark or in katakana (F8)', async () => {
    for (const given of ['こーひー', 'コーヒー', 'こおひい']) {
      const { submit, saved, hook } = await startWith({ mode: 'dictation', answer: 'こおひい', focusText: 'コーヒー' })
      submit(given)
      await act(async () => {})
      expect(saved()?.isCorrect).toBe(true)
      hook.unmount()
    }
  })

  it('does not take "do" for "to go" in Typed Recall, but forgives a typo in a longer word (Q1)', async () => {
    const short = await startWith({ mode: 'typed_recall', answer: 'to go' })
    short.submit('do')
    await act(async () => {})
    expect(short.saved()?.isCorrect).toBe(false)
    short.hook.unmount()

    const long = await startWith({ mode: 'typed_recall', answer: 'water' })
    long.submit('watr')
    await act(async () => {})
    expect(long.saved()?.isCorrect).toBe(true)
  })

  it('does not take the displayed Japanese word as the meaning in Speech Recall (F2)', async () => {
    const note = {
      title: '', copy: '', character: '犬', reading: 'いぬ', primaryGloss: 'dog', secondaryGlosses: ['hound'],
    } as unknown as RoundState['dictionaryNote']
    const shown = await startWith({ mode: 'speech_recall', answer: 'dog', focusText: '犬', dictionaryNote: note })
    shown.submit('犬')
    await act(async () => {})
    expect(shown.saved()?.isCorrect).toBe(false)
    shown.hook.unmount()

    const reading = await startWith({ mode: 'speech_recall', answer: 'dog', focusText: '犬', dictionaryNote: note })
    reading.submit('いぬ')
    await act(async () => {})
    expect(reading.saved()?.isCorrect).toBe(false)
    reading.hook.unmount()

    const meaning = await startWith({ mode: 'speech_recall', answer: 'dog', focusText: '犬', dictionaryNote: note })
    meaning.submit('Hound')
    await act(async () => {})
    expect(meaning.saved()?.isCorrect).toBe(true)
  })

  it('saves a right answer given after the hint printed it as wrong (F4)', async () => {
    const { hook, submit, saved } = await startWith({})
    submit(hook.result.current.slice.roundState?.answer ?? '', 2)
    await act(async () => {})
    expect(saved()?.isCorrect).toBe(false)
    expect(hook.result.current.slice.roundFeedback).toMatch(/hint showed the answer/i)
  })

  it('still saves a right answer given after only the clue as right (F4)', async () => {
    const { hook, submit, saved } = await startWith({})
    submit(hook.result.current.slice.roundState?.answer ?? '', 1)
    await act(async () => {})
    expect(saved()?.isCorrect).toBe(true)
  })
})

describe('the missed-word review (audit 16 F1)', () => {
  it('saves a vocabulary reading typed without its bracketed part as right', async () => {
    const vocabCard = { ...cards[0], id: 7, character: '勉強', romaji: 'benkyou (suru)', meaning: 'study', tags: ['vocab'] }
    const recordGameResult = vi.fn(async () => true)
    const getDeckCards = vi.fn(async () => ({ cards: [vocabCard] }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult, getDeckCards } as unknown as typeof window.jplearnDesktop
    /* the review builds Romaji Sprint rounds, whose answer is the card's stored reading */
    const deps = makeDeps({
      buildRound: (pool, mode, index) => ({ ...roundFor(pool, index), mode, answer: pool[index].romaji }),
    })
    const { result } = renderHook(() => useStudySession(deps))

    await act(async () => {
      await result.current.startMissedWordReview([
        { word: { deck_slug: 'vocab_n5', card_id: 7 } },
      ] as unknown as Parameters<typeof result.current.startMissedWordReview>[0])
    })
    expect(result.current.slice.roundState?.mode).toBe('romaji_sprint')

    act(() => { result.current.slice.submitAnswer('benkyou') })
    await act(async () => {})
    const saved = (recordGameResult.mock.calls.at(-1) as unknown as [{ isCorrect: boolean; minigame: string }] | undefined)?.[0]
    expect(saved?.minigame).toBe('romaji_sprint')
    expect(saved?.isCorrect).toBe(true)
  })
})

describe('a session whose goal never started (audit 4 F8)', () => {
  it('clears its save and builds its run report when it ends', async () => {
    const getSessionSummary = vi.fn(baseDesktopApi.getSessionSummary)
    window.jplearnDesktop = {
      ...baseDesktopApi,
      startSessionGoal: async () => ({ ok: false }),
      getSessionSummary,
    } as unknown as typeof window.jplearnDesktop
    const deps = makeDeps()
    const { result } = renderHook(() => useStudySession(deps))

    /* one round short of the end, as a resumed run would be */
    const target = DEFAULT_SESSION_LENGTH_PRESET.items
    await act(async () => {
      await result.current.startSession('meaning_match', undefined, 1, {
        sessionScore: target - 1, sessionRounds: target - 1, sessionPoints: 0, sessionStreak: 0,
        sessionBestStreak: 0, sessionConfidenceCount: 0, sessionConfidenceTotal: 0, livesRemaining: 3,
      })
    })
    expect(result.current.sessionActive).toBe(true)
    expect(result.current.activeSessionId).toBeNull()

    const answer = result.current.slice.roundState?.answer ?? ''
    act(() => { result.current.slice.submitAnswer(answer) })
    /* the answer is saved for resume until the session ends */
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()

    await act(async () => { result.current.slice.skipFeedback() })

    expect(result.current.sessionActive).toBe(false)
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(result.current.slice.sessionRunReport?.rounds).toBe(target)
    /* there is no session id to ask the backend about */
    expect(getSessionSummary).not.toHaveBeenCalled()
  })
})
