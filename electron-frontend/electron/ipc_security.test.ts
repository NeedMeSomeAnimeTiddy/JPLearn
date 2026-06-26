// @vitest-environment node
import { describe, expect, it } from 'vitest'

const {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
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
    })

    expect(valid.slug).toBe('hiragana')
    expect(valid.cardId).toBe(12)
    expect(valid.isCorrect).toBe(true)

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
  })
})
