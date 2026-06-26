// @vitest-environment node
import { describe, expect, it } from 'vitest'

const {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validatePronunciationPayload,
  validateSessionGoalPayload,
  validateSessionId,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
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
    expect(() => validateDeckSlug('unknown_deck')).toThrow(/invalid deck slug/i)

    expect(validateStartupThemeInput('harbor_mist')).toBe('harbor_mist')
    expect(() => validateStartupThemeInput(42)).toThrow(/invalid startup theme/i)
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

  it('validates pronunciation payload and rejects malformed values', () => {
    const valid = validatePronunciationPayload({
      text: 'こんにちは',
      provider: 'kokoro_tts',
      voice: 'ja-JP-NanamiNeural',
      audioRate: 1,
    })

    expect(valid.text).toBe('こんにちは')
    expect(valid.provider).toBe('kokoro_tts')
    expect(valid.voice).toBe('ja-JP-NanamiNeural')
    expect(valid.audioRate).toBe(1)

    expect(() => validatePronunciationPayload({ text: '' })).toThrow(/invalid pronunciation text/i)
    expect(() => validatePronunciationPayload({ text: 'a'.repeat(121) })).toThrow(/invalid pronunciation text/i)
    expect(() => validatePronunciationPayload({ text: 'ok', provider: 'system_tts' })).toThrow(/invalid pronunciation provider/i)
    expect(() => validatePronunciationPayload({ text: 'ok', voice: '../bad' })).toThrow(/invalid pronunciation voice/i)
    expect(() => validatePronunciationPayload({ text: 'ok', audioRate: 2 })).toThrow(/invalid pronunciation audiorate/i)
  })
})
