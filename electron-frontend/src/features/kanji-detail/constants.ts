export const KANJI_DETAIL_COPY = {
  missingData: 'Not available in the offline data.',
  /** Shown when the payload came from the committed deck data alone. */
  deckOnly: 'Readings, compounds and stroke counts need the offline dictionary.',
  componentsHeading: 'Built from',
  noVerifiedExample: 'No verified example in the offline dictionary.',
  unavailable: 'Kanji details are unavailable. Re-download the offline dictionary to continue.',
  error: 'Kanji details could not be loaded. Please try again.',
  loading: 'Loading kanji details…',
  reducedMotion: 'Stroke-order animation disabled by reduced-motion preference.',
  strokeUnavailable: 'Stroke-order data is not available for this kanji.',
} as const
