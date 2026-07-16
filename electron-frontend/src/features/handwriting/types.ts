export interface HandwritingOutcome {
  completed: boolean
  mistakeCount: number
  usedHint: boolean
  usedAnimation: boolean
  gaveUp: boolean
}

export interface HandwritingCharacterData {
  strokes: string[]
  medians: number[][][]
  radStrokes?: number[]
}

export interface HandwritingManifestEntry {
  chunk: string
}

export interface HandwritingChunkManifestEntry {
  path: string
  sha256: string
  characterCount: number
}

export interface HandwritingManifest {
  formatVersion: number
  upstream: {
    repository: string
    revision: string
    japaneseDataRepository: string
    japaneseDataRevision: string
  }
  coverage: {
    eligibleCharacters: number
    decks: Record<string, string[]>
    excludedMultiCharacterCards: Record<string, string[]>
  }
  chunks: Record<string, HandwritingChunkManifestEntry>
  characters: Record<string, HandwritingManifestEntry>
}

export type HandwritingStatus = 'loading' | 'ready' | 'error' | 'complete'
