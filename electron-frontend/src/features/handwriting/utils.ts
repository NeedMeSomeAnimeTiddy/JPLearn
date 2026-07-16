import manifestJson from '../../lib/handwriting-data-manifest.json'
import type {
  HandwritingCharacterData,
  HandwritingManifest,
  HandwritingOutcome,
} from './types'
import { HANDWRITING_COLOR_FALLBACKS } from './constants'

export interface HandwritingPoint {
  x: number
  y: number
}

type HandwritingPointInput = HandwritingPoint | number[]

const CURVED_KANA_PATH_RATIO = 1.2
const CURVED_KANA_MIN_POINTS = 5
const CURVED_KANA_SAMPLE_COUNT = 16
const CURVED_KANA_ENDPOINT_TOLERANCE = 550
const CURVED_KANA_SHAPE_TOLERANCE = 0.48
const CURVED_KANA_MIN_LENGTH_RATIO = 0.28
const CURVED_KANA_MAX_LENGTH_RATIO = 2.8

const manifest = manifestJson as HandwritingManifest
const chunkCache = new Map<string, Promise<Record<string, unknown>>>()

export class HandwritingDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HandwritingDataError'
  }
}

export function isHandwritingEligibleCharacter(character: string): boolean {
  return Array.from(character).length === 1 && Boolean(manifest.characters[character])
}

export function validateHandwritingCharacterData(value: unknown): value is HandwritingCharacterData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<HandwritingCharacterData>
  return Array.isArray(candidate.strokes)
    && candidate.strokes.length > 0
    && candidate.strokes.every((stroke) => typeof stroke === 'string' && stroke.length > 0)
    && Array.isArray(candidate.medians)
    && candidate.medians.length === candidate.strokes.length
    && candidate.medians.every((median) => Array.isArray(median) && median.length > 0)
}

function handwritingAssetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}handwriting-data/${path}`, document.baseURI).toString()
}

async function loadHandwritingChunk(chunkName: string): Promise<Record<string, unknown>> {
  const cached = chunkCache.get(chunkName)
  if (cached) return cached

  const entry = manifest.chunks[chunkName]
  if (!entry) {
    throw new HandwritingDataError('The verified handwriting data chunk is unavailable.')
  }

  const pending = (async () => {
    let response: Response
    try {
      response = await fetch(handwritingAssetUrl(entry.path))
    } catch {
      throw new HandwritingDataError('The handwriting data chunk could not be read.')
    }
    if (!response.ok) {
      throw new HandwritingDataError('The handwriting data chunk is unavailable.')
    }
    try {
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new HandwritingDataError('The handwriting data chunk is malformed.')
      }
      return data as Record<string, unknown>
    } catch (error) {
      if (error instanceof HandwritingDataError) throw error
      throw new HandwritingDataError('The handwriting data chunk is malformed.')
    }
  })()
  chunkCache.set(chunkName, pending)
  try {
    return await pending
  } catch (error) {
    chunkCache.delete(chunkName)
    throw error
  }
}

export async function loadHandwritingCharacterData(character: string): Promise<HandwritingCharacterData> {
  if (!isHandwritingEligibleCharacter(character)) {
    throw new HandwritingDataError('No verified handwriting data is available for this character.')
  }

  const entry = manifest.characters[character]
  const chunk = await loadHandwritingChunk(entry.chunk)
  const data = chunk[character]
  if (!validateHandwritingCharacterData(data)) {
    throw new HandwritingDataError('The handwriting data file is malformed.')
  }
  return data
}

export function resetHandwritingDataCacheForTests(): void {
  chunkCache.clear()
}

export function isHandwritingOutcomeCorrect(outcome: HandwritingOutcome): boolean {
  return outcome.completed && !outcome.gaveUp
}

export function formatHandwritingAttemptValue(outcome: HandwritingOutcome, character: string): string {
  return outcome.completed && !outcome.gaveUp ? character : 'Not completed'
}

function toPoint(point: HandwritingPointInput): HandwritingPoint {
  return Array.isArray(point) ? { x: point[0], y: point[1] } : point
}

function distance(a: HandwritingPointInput, b: HandwritingPointInput): number {
  const first = toPoint(a)
  const second = toPoint(b)
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function pathLength(points: HandwritingPointInput[]): number {
  return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0)
}

function isKana(character: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)
}

function resamplePath(points: HandwritingPointInput[], count = CURVED_KANA_SAMPLE_COUNT): HandwritingPoint[] {
  if (points.length <= 1) return points.map(toPoint)
  const totalLength = pathLength(points)
  if (totalLength === 0) return [toPoint(points[0])]

  const result: HandwritingPoint[] = [toPoint(points[0])]
  let segmentIndex = 1
  let segmentStart = toPoint(points[0])
  let segmentLength = distance(segmentStart, points[segmentIndex])
  for (let sample = 1; sample < count - 1; sample += 1) {
    const targetDistance = totalLength * sample / (count - 1)
    let travelled = 0
    for (let index = 1; index < segmentIndex; index += 1) {
      travelled += distance(points[index - 1], points[index])
    }
    while (segmentIndex < points.length - 1 && travelled + segmentLength < targetDistance) {
      travelled += segmentLength
      segmentStart = toPoint(points[segmentIndex])
      segmentIndex += 1
      segmentLength = distance(segmentStart, points[segmentIndex])
    }
    const ratio = segmentLength === 0 ? 0 : (targetDistance - travelled) / segmentLength
    result.push({
      x: segmentStart.x + (toPoint(points[segmentIndex]).x - segmentStart.x) * ratio,
      y: segmentStart.y + (toPoint(points[segmentIndex]).y - segmentStart.y) * ratio,
    })
  }
  result.push(toPoint(points[points.length - 1]))
  return result
}

function normalizePath(points: HandwritingPoint[]): HandwritingPoint[] {
  const origin = points[0]
  const length = Math.max(pathLength(points), 1)
  return points.map((point) => ({
    x: (point.x - origin.x) / length,
    y: (point.y - origin.y) / length,
  }))
}

export function isCurvedKanaStroke(character: string, median: number[][] | undefined): boolean {
  if (!isKana(character) || !median || median.length < CURVED_KANA_MIN_POINTS) return false
  const directDistance = distance(median[0], median[median.length - 1])
  return pathLength(median) / Math.max(directDistance, 1) >= CURVED_KANA_PATH_RATIO
}

export function matchesCurvedKanaFallback(
  drawnPoints: HandwritingPoint[],
  expectedMedian: number[][] | undefined,
): boolean {
  if (!expectedMedian || drawnPoints.length < 3) return false

  const expectedLength = pathLength(expectedMedian)
  const drawnLength = pathLength(drawnPoints)
  const lengthRatio = drawnLength / Math.max(expectedLength, 1)
  if (lengthRatio < CURVED_KANA_MIN_LENGTH_RATIO || lengthRatio > CURVED_KANA_MAX_LENGTH_RATIO) return false
  if (distance(drawnPoints[0], expectedMedian[0]) > CURVED_KANA_ENDPOINT_TOLERANCE) return false
  if (distance(drawnPoints[drawnPoints.length - 1], expectedMedian[expectedMedian.length - 1]) > CURVED_KANA_ENDPOINT_TOLERANCE) return false

  const expected = normalizePath(resamplePath(expectedMedian))
  const drawn = normalizePath(resamplePath(drawnPoints))
  if (expected.length !== drawn.length) return false
  const averageShapeDistance = expected.reduce((total, point, index) => total + distance(point, drawn[index]), 0) / expected.length
  return averageShapeDistance <= CURVED_KANA_SHAPE_TOLERANCE
}

interface HandwritingThemeTokens {
  textMain?: string
  toneTeal?: string
  toneAmber?: string
}

export interface HandwritingColors {
  strokeColor: string
  drawingColor: string
  highlightColor: string
}

export function resolveHandwritingColors(
  mode: 'light' | 'dark',
  tokens: HandwritingThemeTokens,
): HandwritingColors {
  const textColor = tokens.textMain || (mode === 'light'
    ? HANDWRITING_COLOR_FALLBACKS.lightText
    : HANDWRITING_COLOR_FALLBACKS.darkText)

  return {
    strokeColor: textColor,
    drawingColor: mode === 'light'
      ? textColor
      : (tokens.toneTeal || HANDWRITING_COLOR_FALLBACKS.darkDrawing),
    highlightColor: tokens.toneAmber || HANDWRITING_COLOR_FALLBACKS.highlight,
  }
}
