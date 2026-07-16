import manifestJson from '../../lib/handwriting-data/manifest.json'
import type {
  HandwritingCharacterData,
  HandwritingManifest,
  HandwritingOutcome,
} from './types'

const manifest = manifestJson as HandwritingManifest
const characterModules = import.meta.glob('../../lib/handwriting-data/characters/*.json')

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

export async function loadHandwritingCharacterData(character: string): Promise<HandwritingCharacterData> {
  if (!isHandwritingEligibleCharacter(character)) {
    throw new HandwritingDataError('No verified handwriting data is available for this character.')
  }

  const entry = manifest.characters[character]
  const modulePath = `../../lib/handwriting-data/${entry.path}`
  const loader = characterModules[modulePath]
  if (!loader) {
    throw new HandwritingDataError('The verified handwriting data file is unavailable.')
  }

  let loaded: unknown
  try {
    loaded = (await loader()) as { default: unknown }
  } catch {
    throw new HandwritingDataError('The handwriting data file could not be read.')
  }

  const data = (loaded as { default?: unknown }).default ?? loaded
  if (!validateHandwritingCharacterData(data)) {
    throw new HandwritingDataError('The handwriting data file is malformed.')
  }
  return data
}

export function isHandwritingOutcomeCorrect(outcome: HandwritingOutcome): boolean {
  return outcome.completed
    && !outcome.gaveUp
    && outcome.mistakeCount === 0
    && !outcome.usedHint
    && !outcome.usedAnimation
}
