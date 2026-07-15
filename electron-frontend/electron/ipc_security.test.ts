// @vitest-environment node
import { describe, expect, it } from 'vitest'

const {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validateExpertiseLevelInput,
  validateSessionGoalPayload,
  validateSessionId,
  validateAssistantEventInteractionPayload,
  validateStartupThemeInput,
  validateGrammarMinigameRequest,
  validateDailyGamesAttemptPayload,
  validateDailyGamesDay,
  validateDailyGamesPracticeSeedPayload,
  validateDailyGamesCrosswordClues,
  validateRecordGameResultPayload,
  validateSpeakPayload,
} = require('./ipc_security.cjs')

describe('ipc_security', () => {
  it('accepts allowed renderer URLs in dev and prod', () => {
    expect(isAllowedRendererUrl('http://localhost:5173', true)).toBe(true)
    expect(isAllowedRendererUrl('file:///index.html', false)).toBe(true)
  })

  it('rejects untrusted renderer URLs', () => {
    expect(isAllowedRendererUrl('https://example.com', true)).toBe(false)
    expect(isAllowedRendererUrl('https://example.com', false)).toBe(false)
  })

  it('normalizes and bounds speak payloads', () => {
    expect(validateSpeakPayload('  あ  ')).toEqual({ text: 'あ' })
    expect(validateSpeakPayload({ text: 'こんにちは', speaker: 13, speed: 1.2 })).toEqual({
      text: 'こんにちは',
      speaker: 13,
      speed: 1.2,
    })
    expect(validateSpeakPayload({ text: 'x'.repeat(600) }).text).toHaveLength(400)
  })

  it('rejects invalid speak payloads', () => {
    expect(() => validateSpeakPayload('   ')).toThrow(/must not be empty/i)
    expect(() => validateSpeakPayload(42)).toThrow(/expected string or object/i)
    expect(() => validateSpeakPayload({ text: 'a', speaker: -1 })).toThrow(/Invalid speaker/i)
    expect(() => validateSpeakPayload({ text: 'a', speed: 9 })).toThrow(/Invalid speed/i)
  })

  it('rejects IPC when sender frame is not the main frame', () => {
    const sender = {
      mainFrame: { url: 'file:///index.html' },
    }
    const event = {
      sender,
      senderFrame: { url: 'file:///index.html' },
    }

    expect(() =>
      assertTrustedIpcSender(event, {
        isDev: false,
        getWindowFromSender: () => ({ isDestroyed: () => false }),
      }),
    ).toThrow(/non-main-frame sender/i)
  })

  it('rejects IPC from untrusted URL', () => {
    const mainFrame = { url: 'https://evil.example' }
    const sender = { mainFrame }
    const event = { sender, senderFrame: mainFrame }

    expect(() =>
      assertTrustedIpcSender(event, {
        isDev: false,
        getWindowFromSender: () => ({ isDestroyed: () => false }),
      }),
    ).toThrow(/untrusted URL/i)
  })

  it('validates deck slug and startup theme types', () => {
    expect(validateDeckSlug('hiragana')).toBe('hiragana')
    expect(validateDeckSlug('sentence_examples')).toBe('sentence_examples')
    expect(() => validateDeckSlug('unknown_deck')).toThrow(/invalid deck slug/i)

    expect(validateStartupThemeInput('harbor_mist')).toBe('harbor_mist')
    expect(() => validateStartupThemeInput(42)).toThrow(/invalid startup theme/i)

    expect(validateExpertiseLevelInput('total_beginner')).toBe('total_beginner')
    expect(() => validateExpertiseLevelInput('expert')).toThrow(/invalid expertise level/i)
  })

  it('validates record game result payload and rejects malformed values', () => {
    const valid = validateRecordGameResultPayload({
      slug: 'hiragana',
      cardId: 12,
      isCorrect: true,
      minigame: 'romaji_sprint',
      curriculumStage: 2,
      sessionId: 'session-1',
      confidenceScore: 4,
    })

    expect(valid.slug).toBe('hiragana')
    expect(valid.cardId).toBe(12)
    expect(valid.isCorrect).toBe(true)
    expect(valid.sessionId).toBe('session-1')
    expect(valid.confidenceScore).toBe(4)

    expect(() =>
      validateRecordGameResultPayload({
        slug: 'hiragana',
        cardId: '12',
        isCorrect: true,
      }),
    ).toThrow(/invalid cardid/i)

    expect(() =>
      validateRecordGameResultPayload({
        slug: 'hiragana',
        cardId: 12,
        isCorrect: true,
        curriculumStage: 9,
      }),
    ).toThrow(/invalid curriculumstage/i)

    expect(() =>
      validateRecordGameResultPayload({
        slug: 'hiragana',
        cardId: 12,
        isCorrect: true,
        sessionId: '   ',
      }),
    ).toThrow(/invalid session id/i)

    expect(() =>
      validateRecordGameResultPayload({
        slug: 'hiragana',
        cardId: 12,
        isCorrect: true,
        confidenceScore: 0,
      }),
    ).toThrow(/invalid confidencescore/i)
  })

  it('validates grammar minigame request payload and rejects malformed values', () => {
    const valid = validateGrammarMinigameRequest({
      gameType: 'particle_cloze',
      sentence: '私は日本語を勉強します',
      seed: 3,
    })

    expect(valid.gameType).toBe('particle_cloze')
    expect(valid.sentence).toBe('私は日本語を勉強します')
    expect(valid.seed).toBe(3)

    expect(() =>
      validateGrammarMinigameRequest({
        gameType: 'unknown_mode',
      }),
    ).toThrow(/invalid grammar minigame gametype/i)

    expect(() =>
      validateGrammarMinigameRequest({
        gameType: 'imposter',
        seed: -1,
      }),
    ).toThrow(/invalid grammar minigame seed/i)
  })

  it('validates Daily Games request payloads and rejects invalid day or outcome data', () => {
    expect(validateDailyGamesDay('2026-07-15')).toBe('2026-07-15')
    expect(validateDailyGamesPracticeSeedPayload({
      day: '2026-07-15',
      gameType: 'crossword',
    })).toEqual({
      day: '2026-07-15',
      gameType: 'crossword',
    })
    expect(validateDailyGamesAttemptPayload({
      day: '2026-07-15',
      gameType: 'typing_blitz',
      mode: 'daily',
      score: 120,
      completed: true,
      durationSeconds: 45,
      outcomes: [{ poolPosition: 0, outcome: 'correct' }],
    })).toMatchObject({
      day: '2026-07-15',
      gameType: 'typing_blitz',
      mode: 'daily',
      score: 120,
      completed: true,
      durationSeconds: 45,
    })

    expect(() => validateDailyGamesDay('2026-02-29')).toThrow(/valid calendar date/i)
    expect(() => validateDailyGamesDay('2026/07/15')).toThrow(/YYYY-MM-DD/i)
    expect(() => validateDailyGamesAttemptPayload({
      day: '2026-07-15',
      gameType: 'crossword',
      mode: 'daily',
      score: 1,
      completed: true,
      outcomes: [
        { poolPosition: 0, outcome: 'correct' },
        { poolPosition: 0, outcome: 'incorrect' },
      ],
    })).toThrow(/duplicate poolPosition/i)
    expect(() => validateDailyGamesAttemptPayload({
      day: '2026-07-15',
      gameType: 'crossword',
      mode: 'daily',
      score: 1,
      completed: true,
      outcomes: [{ poolPosition: 20, outcome: 'correct' }],
    })).toThrow(/poolPosition/i)
  })

  it('bounds crossword clue IPC payloads and rejects duplicate positions', () => {
    expect(validateDailyGamesCrosswordClues([
      { poolPosition: 0, answer: '学校', fallbackClue: 'school' },
    ], true)).toEqual([
      { poolPosition: 0, answer: '学校', fallbackClue: 'school' },
    ])
    expect(validateDailyGamesCrosswordClues([
      { poolPosition: 0, clue: ' school ' },
    ], false)).toEqual([{ poolPosition: 0, clue: 'school' }])
    expect(() => validateDailyGamesCrosswordClues([
      { poolPosition: 0, answer: '学校', fallbackClue: 'school' },
    ], false)).toThrow(/clue text/i)
    expect(() => validateDailyGamesCrosswordClues([
      { poolPosition: 0, clue: 'school' },
    ], true)).toThrow(/clue request/i)
    expect(() => validateDailyGamesCrosswordClues([
      { poolPosition: 0, clue: 'one' },
      { poolPosition: 0, clue: 'two' },
    ], false)).toThrow(/poolPosition/i)
  })

  it('validates session goal payload and session id values', () => {
    const valid = validateSessionGoalPayload({
      targetItems: 15,
      targetMinutes: 20,
      targetAccuracy: 85,
      sessionId: 'session-123',
    })

    expect(valid.targetItems).toBe(15)
    expect(valid.targetMinutes).toBe(20)
    expect(valid.targetAccuracy).toBe(85)
    expect(valid.sessionId).toBe('session-123')

    expect(validateSessionId(' session-abc ')).toBe('session-abc')

    expect(() => validateSessionGoalPayload({ targetItems: 0 })).toThrow(/invalid targetitems/i)
    expect(() => validateSessionGoalPayload({ targetItems: 3, targetAccuracy: 101 })).toThrow(/invalid targetaccuracy/i)
    expect(() => validateSessionId('   ')).toThrow(/invalid session id/i)
  })

  it('validates assistant event interaction payload', () => {
    const valid = validateAssistantEventInteractionPayload({
      eventId: 12,
      interactionType: 'clicked',
      metadata: {
        target_mode: 'context_cloze',
        reason: 'cta',
      },
    })

    expect(valid.eventId).toBe(12)
    expect(valid.interactionType).toBe('clicked')
    expect(valid.metadata.target_mode).toBe('context_cloze')

    expect(() =>
      validateAssistantEventInteractionPayload({
        eventId: 0,
        interactionType: 'clicked',
      }),
    ).toThrow(/invalid assistant event id/i)

    expect(() =>
      validateAssistantEventInteractionPayload({
        eventId: 5,
        interactionType: 'unknown',
      }),
    ).toThrow(/invalid assistant interaction type/i)

    expect(() =>
      validateAssistantEventInteractionPayload({
        eventId: 5,
        interactionType: 'expired',
        metadata: 'bad',
      }),
    ).toThrow(/invalid assistant interaction metadata/i)
  })

})
