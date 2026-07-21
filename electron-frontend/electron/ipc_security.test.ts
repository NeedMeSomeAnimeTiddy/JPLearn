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
  validateKanjiDetailCharacter,
  validateStartupThemeInput,
  validateGrammarMinigameRequest,
  validateDailyGamesAttemptPayload,
  validateDailyGamesDay,
  validateDailyGamesPracticeSeedPayload,
  validateDailyGamesCrosswordClues,
  validateCardNoteKey,
  validateCardNoteSavePayload,
  validateCardNoteText,
  validateRecordGameResultPayload,
  validateSpeakPayload,
  validateScenarioSessionId,
  validateScenarioId,
  validateScenarioLearnerLevel,
  validateScenarioSessionSavePayload,
  validateScenarioSrsCardSavePayload,
  validateScenarioEvaluationRequest,
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

  it('validates exactly one Unicode Han character for kanji detail requests', () => {
    expect(validateKanjiDetailCharacter('  日  ')).toBe('日')
    expect(validateKanjiDetailCharacter('𠮷')).toBe('𠮷')

    for (const invalid of ['', '日本', 'ひ', 'A', '々', '日\uFE0F', 42, null]) {
      expect(() => validateKanjiDetailCharacter(invalid)).toThrow(/exactly one Unicode Han character|Invalid kanji detail character/i)
    }
  })

  it('validates opaque card note keys and Unicode-aware note text payloads', () => {
    const builtinKey = `note:v1:builtin:${'a'.repeat(64)}`
    const fallbackKey = `note:v1:offline_dictionary:fallback:${'b'.repeat(64)}`
    const sourceKey = 'note:v1:offline_dictionary:jmdict:test-entry-1'

    expect(validateCardNoteKey(builtinKey)).toBe(builtinKey)
    expect(validateCardNoteKey(sourceKey)).toBe(sourceKey)
    expect(validateCardNoteKey(fallbackKey)).toBe(fallbackKey)
    expect(validateCardNoteText('first\r\nsecond\rthird 😀')).toBe('first\nsecond\nthird 😀')
    expect(validateCardNoteText('😀'.repeat(2000))).toHaveLength(4000)
    expect(validateCardNoteSavePayload({
      noteKey: builtinKey,
      noteText: '  mnemonic\r\nline two  ',
    })).toEqual({
      noteKey: builtinKey,
      noteText: '  mnemonic\nline two  ',
    })

    for (const invalidKey of [
      '',
      `note:v1:builtin:${'A'.repeat(64)}`,
      'note:v1:offline_dictionary:jmdict:test_entry',
      `note:v1:offline_dictionary:jmdict:${'a'.repeat(129)}`,
      `note:v1:offline_dictionary:fallback:${'B'.repeat(64)}`,
      `note:v2:builtin:${'a'.repeat(64)}`,
    ]) {
      expect(() => validateCardNoteKey(invalidKey)).toThrow(/Invalid card note key/i)
    }
    expect(() => validateCardNoteText(' \r\n\t ')).toThrow(/must not be empty/i)
    expect(() => validateCardNoteText('😀'.repeat(2001))).toThrow(/exceeds 2000/i)
    expect(() => validateCardNoteSavePayload({ noteKey: builtinKey })).toThrow(/Invalid card note text/i)
  })

  it('validates scenario session ids, scenario ids, and learner levels', () => {
    expect(validateScenarioSessionId('11111111-1111-1111-1111-111111111111')).toBe('11111111-1111-1111-1111-111111111111')
    expect(validateScenarioId('cafe-order')).toBe('cafe-order')
    expect(validateScenarioLearnerLevel('beginner')).toBe('beginner')
    expect(validateScenarioLearnerLevel('intermediate')).toBe('intermediate')

    for (const invalid of ['', 'has space', 'a'.repeat(65), 'under_score', null, 42]) {
      expect(() => validateScenarioSessionId(invalid)).toThrow(/Invalid scenario session id/i)
    }
    for (const invalid of ['', 'Cafe-Order', 'cafe_order', 'a'.repeat(129), null]) {
      expect(() => validateScenarioId(invalid)).toThrow(/Invalid scenario id/i)
    }
    for (const invalid of ['expert', '', null, 42]) {
      expect(() => validateScenarioLearnerLevel(invalid)).toThrow(/Invalid scenario learner level/i)
    }
  })

  it('validates scenario session save payloads including size caps', () => {
    const basePayload = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      scenarioId: 'cafe-order',
      scenarioVersion: 1,
      learnerLevel: 'beginner',
      startedAtUtc: '2026-07-21T00:00:00.000Z',
      transcript: [{ turnIndex: 0 }],
      summary: { objectives: [] },
    }

    expect(validateScenarioSessionSavePayload(basePayload)).toEqual(basePayload)

    expect(() => validateScenarioSessionSavePayload({ ...basePayload, scenarioVersion: 0 }))
      .toThrow(/scenarioVersion must be a positive integer/i)
    expect(() => validateScenarioSessionSavePayload({ ...basePayload, startedAtUtc: '' }))
      .toThrow(/startedAtUtc must be a non-empty string/i)
    expect(() => validateScenarioSessionSavePayload({ ...basePayload, transcript: 'not-an-array' }))
      .toThrow(/transcript must be an array/i)
    expect(() => validateScenarioSessionSavePayload({ ...basePayload, summary: null }))
      .toThrow(/summary must be an object/i)
    expect(() => validateScenarioSessionSavePayload({
      ...basePayload,
      transcript: [{ filler: 'x'.repeat(200001) }],
    })).toThrow(/transcript exceeds/i)
    expect(() => validateScenarioSessionSavePayload(null)).toThrow(/expected object/i)
  })

  it('validates scenario SRS card save payloads including size caps', () => {
    const basePayload = {
      id: 'srs-1',
      sessionId: '11111111-1111-1111-1111-111111111111',
      scenarioId: 'cafe-order',
      front: 'コーヒー',
      back: 'coffee',
      reading: 'こーひー',
      notes: '',
    }

    expect(validateScenarioSrsCardSavePayload(basePayload)).toEqual(basePayload)
    expect(validateScenarioSrsCardSavePayload({
      id: 'srs-2', sessionId: basePayload.sessionId, scenarioId: 'cafe-order', front: 'x', back: 'y',
    })).toEqual({ id: 'srs-2', sessionId: basePayload.sessionId, scenarioId: 'cafe-order', front: 'x', back: 'y', reading: '', notes: '' })

    expect(() => validateScenarioSrsCardSavePayload({ ...basePayload, front: '' }))
      .toThrow(/front must be non-empty/i)
    expect(() => validateScenarioSrsCardSavePayload({ ...basePayload, back: '' }))
      .toThrow(/back must be non-empty/i)
    expect(() => validateScenarioSrsCardSavePayload({ ...basePayload, front: 'x'.repeat(501) }))
      .toThrow(/front must be non-empty and at most 500/i)
    expect(() => validateScenarioSrsCardSavePayload({ ...basePayload, reading: 'x'.repeat(501) }))
      .toThrow(/reading exceeds 500/i)
    expect(() => validateScenarioSrsCardSavePayload(null)).toThrow(/expected object/i)
  })

  it('bounds the single-turn context sent for scenario AI evaluation', () => {
    const baseRequest = {
      scenarioTitle: 'Order at a Cafe',
      npcLine: 'いらっしゃいませ',
      objectiveDescription: 'Order a drink',
      expectedIntents: [{ id: 'intent-order', description: 'Order a drink politely', examplePhrases: ['コーヒーをください'] }],
      requiredSlotIds: ['drink'],
      learnerResponse: 'ホットのコーヒーをひとつ',
      learnerLevel: 'beginner',
    }

    expect(validateScenarioEvaluationRequest(baseRequest)).toEqual(baseRequest)
    // Optional fields normalize rather than fail.
    expect(validateScenarioEvaluationRequest({
      ...baseRequest,
      objectiveDescription: '',
      requiredSlotIds: undefined,
      expectedIntents: [{ id: 'intent-order', description: 'Order a drink politely' }],
    })).toEqual({ ...baseRequest, objectiveDescription: '', requiredSlotIds: [], expectedIntents: [{ id: 'intent-order', description: 'Order a drink politely', examplePhrases: [] }] })

    expect(() => validateScenarioEvaluationRequest(null)).toThrow(/expected object/i)
    expect(() => validateScenarioEvaluationRequest({ ...baseRequest, expectedIntents: [] }))
      .toThrow(/expectedIntents must hold/i)
    expect(() => validateScenarioEvaluationRequest({
      ...baseRequest,
      expectedIntents: Array.from({ length: 9 }, (_, index) => ({ id: `intent-${index}`, description: 'x', examplePhrases: [] })),
    })).toThrow(/expectedIntents must hold/i)
    expect(() => validateScenarioEvaluationRequest({ ...baseRequest, learnerResponse: '' }))
      .toThrow(/learnerResponse must not be empty/i)
    expect(() => validateScenarioEvaluationRequest({ ...baseRequest, learnerResponse: 'x'.repeat(601) }))
      .toThrow(/learnerResponse exceeds 600/i)
    expect(() => validateScenarioEvaluationRequest({ ...baseRequest, learnerLevel: 'expert' }))
      .toThrow(/Invalid scenario learner level/i)
    expect(() => validateScenarioEvaluationRequest({ ...baseRequest, requiredSlotIds: ['drink size!'] }))
      .toThrow(/required slot id at index 0/i)
    expect(() => validateScenarioEvaluationRequest({
      ...baseRequest,
      expectedIntents: [{ id: 'intent-order', description: 'x', examplePhrases: ['a', 'b', 'c', 'd'] }],
    })).toThrow(/too many example phrases/i)
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
