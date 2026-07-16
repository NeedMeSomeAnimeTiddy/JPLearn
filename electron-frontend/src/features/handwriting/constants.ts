// Keep assistance deliberate, while ensuring no learner remains stuck on one stroke.
export const HANDWRITING_MISS_THRESHOLD = 3
export const HANDWRITING_MAX_RETRIES_PER_STROKE = 4

// Hanzi Writer halves its distance allowance for all but the first stroke. These
// values keep its ordered-stroke quiz while making desktop mouse input practical.
export const HANDWRITING_QUIZ_OPTIONS = {
  leniency: 3.2,
  averageDistanceThreshold: 600,
  acceptBackwardsStrokes: false,
  markStrokeCorrectAfterMisses: HANDWRITING_MAX_RETRIES_PER_STROKE,
} as const

export const HANDWRITING_COLOR_FALLBACKS = {
  darkText: '#f9f6e7',
  darkDrawing: '#75d5c8',
  lightText: '#1c2b34',
  highlight: '#f2b95c',
} as const

export const HANDWRITING_ERROR_COPY = 'This character’s offline stroke data could not be loaded. Retry the round or choose another game.'
