import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatHandwritingAttemptValue,
  isCurvedKanaStroke,
  isHandwritingEligibleCharacter,
  isHandwritingOutcomeCorrect,
  loadHandwritingCharacterData,
  matchesCurvedKanaFallback,
  resetHandwritingDataCacheForTests,
  resolveHandwritingColors,
  validateHandwritingCharacterData,
} from './utils'

const aSweep = [[570, 460], [610, 416], [460, 173], [200, 64], [181, 218], [342, 344], [466, 386], [641, 401], [754, 380], [838, 294], [845, 137], [703, 31], [508, -22]]
const oSweep = [[287, 800], [338, 760], [311, 53], [150, 160], [80, 330], [180, 540], [410, 610], [680, 550], [810, 300], [720, 80], [480, 10]]
const fuSweep = [[140, 80], [370, 100], [580, 210], [620, 430], [450, 620], [180, 710]]
const kanaData = { strokes: ['M1'], medians: [aSweep] }
const kanjiData = { strokes: ['M1'], medians: [[[0, 0], [100, 100]]] }

function asMousePath(median: number[][], sampleEvery = 1) {
  return median
    .filter((_, index) => index % sampleEvery === 0 || index === median.length - 1)
    .map(([x, y], index, points) => ({
      x: x + (index === 0 ? 28 : index === points.length - 1 ? -34 : (index % 3 - 1) * 42),
      y: y + (index === 0 ? -22 : index === points.length - 1 ? 31 : (index % 2 === 0 ? 36 : -28)),
    }))
}

function withExtraPointerEvents(points: ReturnType<typeof asMousePath>) {
  return points.flatMap((point, index) => {
    const next = points[index + 1]
    return next ? [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }] : [point]
  })
}

function jsonResponse(data: unknown, ok = true): Response {
  return { ok, json: vi.fn().mockResolvedValue(data) } as unknown as Response
}

afterEach(() => {
  resetHandwritingDataCacheForTests()
  vi.unstubAllGlobals()
})

describe('handwriting data utilities', () => {
  it('accepts supported single kana and kanji but excludes multi-character cards', () => {
    expect(isHandwritingEligibleCharacter('あ')).toBe(true)
    expect(isHandwritingEligibleCharacter('ア')).toBe(true)
    expect(isHandwritingEligibleCharacter('日')).toBe(true)
    expect(isHandwritingEligibleCharacter('きゃ')).toBe(false)
  })

  it('loads and caches representative kana and kanji chunks once per renderer session', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(jsonResponse(url.includes('hiragana') ? { あ: kanaData } : { 日: kanjiData })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadHandwritingCharacterData('あ')).resolves.toEqual(kanaData)
    await expect(loadHandwritingCharacterData('あ')).resolves.toEqual(kanaData)
    await expect(loadHandwritingCharacterData('日')).resolves.toEqual(kanjiData)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('handwriting-data/chunks/hiragana.json')
  })

  it('reports missing and malformed chunks without caching their failed reads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockResolvedValueOnce(jsonResponse({ あ: { strokes: [], medians: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadHandwritingCharacterData('あ')).rejects.toThrow('unavailable')
    await expect(loadHandwritingCharacterData('あ')).rejects.toThrow('malformed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('counts every completed character as correct, regardless of retries or assistance metadata', () => {
    expect(isHandwritingOutcomeCorrect({ completed: true, mistakeCount: 4, usedHint: true, usedAnimation: true, gaveUp: false })).toBe(true)
    expect(isHandwritingOutcomeCorrect({ completed: false, mistakeCount: 0, usedHint: false, usedAnimation: false, gaveUp: true })).toBe(false)
  })

  it('keeps outcome metadata out of the generic answer value', () => {
    expect(formatHandwritingAttemptValue({ completed: true, mistakeCount: 4, usedHint: true, usedAnimation: true, gaveUp: false }, '日')).toBe('日')
    expect(formatHandwritingAttemptValue({ completed: false, mistakeCount: 0, usedHint: false, usedAnimation: false, gaveUp: true }, '日')).toBe('Not completed')
  })

  it('uses contrasting theme-aware drawing colors', () => {
    const dark = resolveHandwritingColors('dark', { textMain: '#f9f6e7', toneTeal: '#75d5c8', toneAmber: '#f2b95c' })
    const light = resolveHandwritingColors('light', { textMain: '#1c2b34', toneTeal: '#287c73', toneAmber: '#8e5b00' })
    expect(dark.drawingColor).toBe('#75d5c8')
    expect(light.drawingColor).toBe('#1c2b34')
    expect(light.drawingColor).toBe(light.strokeColor)
  })

  it('rejects malformed character data before it reaches Hanzi Writer', () => {
    expect(validateHandwritingCharacterData(kanaData)).toBe(true)
    expect(validateHandwritingCharacterData({ strokes: ['M1'], medians: [] })).toBe(false)
  })

  it.each([['あ', aSweep], ['お', oSweep], ['フ', fuSweep]])('recognizes the representative sweeping %s stroke as curved kana', (character, median) => {
    expect(isCurvedKanaStroke(character, median)).toBe(true)
  })

  it('accepts sparse and dense uneven mouse curves while rejecting unrelated strokes', () => {
    expect(matchesCurvedKanaFallback(asMousePath(aSweep, 2), aSweep)).toBe(true)
    expect(matchesCurvedKanaFallback(withExtraPointerEvents(asMousePath(fuSweep)), fuSweep)).toBe(true)
    expect(matchesCurvedKanaFallback([{ x: -950, y: -950 }, { x: -700, y: -720 }, { x: -420, y: -450 }], aSweep)).toBe(false)
  })
})
