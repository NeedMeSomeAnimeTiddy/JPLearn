// @vitest-environment node
import { describe, expect, it } from 'vitest'

const {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  isRendererPermissionAllowed,
  validateDictionarySearchQuery,
  validateDeckSlug,
  validateKnownItemsInput,
  validateDailyMinutesInput,
  validateSessionGoalPayload,
  validateSessionId,
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
  validateTranscribeSpeechPayload,
  validateScenarioSessionId,
  validateScenarioId,
  validateScenarioLearnerLevel,
  validateScenarioSessionSavePayload,
  validateScenarioSrsCardSavePayload,
  validateScenarioEvaluationRequest,
} = require('./ipc_security.cjs')

const ANSWER_ID = '0b6f1c1e-3f7a-4c1e-9d55-1a2b3c4d5e6f'

function answer() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    answerId: ANSWER_ID,
    answeredAtUtc: now.toISOString(),
    answeredLocalDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
}

describe('ipc_security', () => {
  it('accepts allowed renderer URLs in dev and prod', () => {
    expect(isAllowedRendererUrl('http://localhost:5173', true)).toBe(true)
    expect(isAllowedRendererUrl('file:///index.html', false, 'file:///index.html')).toBe(true)
  })

  it('accepts only the app page in production, with any query or hash (audit 8 F1)', () => {
    const appPage = 'file:///C:/Program%20Files/JPLearn/resources/app/dist/index.html'
    expect(isAllowedRendererUrl(`${appPage}?valley=off#menu`, false, appPage)).toBe(true)
    expect(isAllowedRendererUrl(appPage.replace('Program%20Files', 'program%20files'), false, appPage)).toBe(true)
    expect(isAllowedRendererUrl('file:///C:/Users/x/Downloads/page.html', false, appPage)).toBe(false)
    expect(isAllowedRendererUrl('file:///C:/Program%20Files/JPLearn/resources/app/dist/other.html', false, appPage)).toBe(false)
    expect(isAllowedRendererUrl('file://evil-host/C:/Program%20Files/JPLearn/resources/app/dist/index.html', false, appPage)).toBe(false)
    expect(isAllowedRendererUrl(appPage, false, undefined)).toBe(false)
  })

  it('accepts the app page from a folder with a percent sign in its name', () => {
    // pathToFileURL writes '%25'; Electron's loadFile leaves the '%' as it is.
    const expected = 'file:///C:/Users/Ana/100%25/JPLearn/dist/index.html'
    expect(isAllowedRendererUrl('file:///C:/Users/Ana/100%/JPLearn/dist/index.html', false, expected)).toBe(true)
    expect(isAllowedRendererUrl(expected, false, expected)).toBe(true)
    expect(isAllowedRendererUrl('file:///C:/Users/Ana/100%/Other/index.html', false, expected)).toBe(false)
    const spaced = 'file:///C:/Users/Ana%20Smith/100%25/JPLearn/dist/index.html'
    expect(isAllowedRendererUrl('file:///C:/Users/Ana%20Smith/100%/JPLearn/dist/index.html', false, spaced)).toBe(true)
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

    expect(validateKnownItemsInput([])).toEqual([])
    expect(validateKnownItemsInput(['vocab_n5', 'kanji_n3', 'vocab_n5'])).toEqual(['vocab_n5', 'kanji_n3'])
    expect(() => validateKnownItemsInput('vocab_n5')).toThrow(/invalid known items/i)
    expect(() => validateKnownItemsInput(['jlpt_n5_foundation'])).toThrow(/invalid known item/i)
    expect(() => validateKnownItemsInput(['hiragana', 42])).toThrow(/invalid known item/i)
    expect(() => validateKnownItemsInput(Array.from({ length: 9 }, () => 'hiragana'))).toThrow(/invalid known items/i)

    expect(validateDailyMinutesInput(20)).toBe('20')
    for (const bad of [Number.NaN, 1.5, 0, 241, '20', undefined]) {
      expect(validateDailyMinutesInput(bad)).toBe('')
    }
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
      ...answer(),
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

  it('requires each answer to carry a well-formed, plausible identity', () => {
    const base = { slug: 'hiragana', cardId: 12, isCorrect: true }
    const ok = validateRecordGameResultPayload({ ...base, ...answer() })
    expect(ok.answerId).toBe(ANSWER_ID)
    expect(ok.answeredLocalDate).toBe(answer().answeredLocalDate)

    expect(() => validateRecordGameResultPayload(base)).toThrow(/invalid answerid/i)
    expect(() => validateRecordGameResultPayload({ ...base, ...answer(), answerId: 'not-a-uuid' }))
      .toThrow(/invalid answerid/i)
    expect(() => validateRecordGameResultPayload({ ...base, ...answer(), answeredAtUtc: '2026-10-27 09:00' }))
      .toThrow(/invalid answeredatutc/i)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(() => validateRecordGameResultPayload({ ...base, ...answer(), answeredAtUtc: threeDaysAgo }))
      .toThrow(/not a plausible time/i)
    const now = new Date().toISOString()
    expect(() => validateRecordGameResultPayload({
      ...base, answerId: ANSWER_ID, answeredAtUtc: now, answeredLocalDate: '2001-01-01',
    })).toThrow(/does not match/i)
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

})

describe('renderer permissions (audit 8 F2)', () => {
  const appPageUrl = 'file:///C:/JPLearn/dist/index.html'
  const allowed = (permission: string, extra: Record<string, unknown> = {}) =>
    isRendererPermissionAllowed({ permission, url: `${appPageUrl}?valley=off`, isDev: false, appPageUrl, ...extra })

  it('grants the microphone, fullscreen and the clipboard to the app page', () => {
    expect(allowed('media', { mediaTypes: ['audio'] })).toBe(true)
    expect(allowed('fullscreen')).toBe(true)
    expect(allowed('clipboard-read')).toBe(true)
    expect(allowed('clipboard-sanitized-write')).toBe(true)
  })

  it('refuses the camera, other permissions and other pages', () => {
    expect(allowed('media', { mediaTypes: ['audio', 'video'] })).toBe(false)
    expect(allowed('media', { mediaTypes: ['video'] })).toBe(false)
    expect(allowed('media', { mediaTypes: [] })).toBe(false)
    expect(allowed('geolocation')).toBe(false)
    expect(allowed('notifications')).toBe(false)
    expect(allowed('display-capture')).toBe(false)
    expect(allowed('openExternal')).toBe(false)
    expect(allowed('fullscreen', { url: 'file:///C:/Users/x/page.html' })).toBe(false)
    expect(allowed('fullscreen', { url: 'data:text/html,splash' })).toBe(false)
  })
})

describe('payload bounds (audit 8 F3)', () => {
  it('cuts a dictionary search at 200 characters', () => {
    expect(validateDictionarySearchQuery('  たべる  ')).toBe('たべる')
    expect(validateDictionarySearchQuery('あ'.repeat(5000))).toHaveLength(200)
    const edge = validateDictionarySearchQuery(`${'あ'.repeat(199)}𠮟${'い'.repeat(10)}`)
    expect(Array.from(edge)).toHaveLength(200)
    expect(edge.endsWith('𠮟')).toBe(true)
    expect(() => validateDictionarySearchQuery('   ')).toThrow(/must not be empty/)
  })

  it('bounds session ids', () => {
    expect(validateSessionId('3f2b8c1e-0d4a-4b7e-9a51-2c6f0e9d1b7a')).toBe('3f2b8c1e-0d4a-4b7e-9a51-2c6f0e9d1b7a')
    expect(() => validateSessionId('x'.repeat(129))).toThrow(/too long/)
    expect(() => validateSessionId(`a${String.fromCharCode(10)}b`)).toThrow(/control characters/)
  })

  it('refuses an oversized grammar minigame sentence', () => {
    expect(() => validateGrammarMinigameRequest({ gameType: 'particle_cloze', sentence: 'あ'.repeat(1001) })).toThrow(/too long/)
    expect(validateGrammarMinigameRequest({ gameType: 'particle_cloze', sentence: '私は学生です。' }).sentence).toBe('私は学生です。')
  })

  it('lets speech transcription ask for Japanese or English only (audit 9, F2)', () => {
    const base = { audioBase64: 'AAAA', mimeType: 'audio/webm' }
    expect(validateTranscribeSpeechPayload({ ...base, language: 'en' }).language).toBe('en')
    expect(validateTranscribeSpeechPayload({ ...base, language: 'ja' }).language).toBe('ja')
    expect(validateTranscribeSpeechPayload({ ...base, language: 'fr' }).language).toBe('ja')
    expect(validateTranscribeSpeechPayload({ ...base }).language).toBe('ja')
  })
})
