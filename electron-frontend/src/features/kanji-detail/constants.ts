export const KANJI_DETAIL_COPY = {
  missingData: 'Not available in the offline data.',
  /** Shown when the payload came from the committed deck data alone. */
  deckOnly: 'Readings, compounds and stroke counts need the offline dictionary.',
  componentsHeading: 'Built from',
  unavailable: 'Kanji details are unavailable. Re-download the offline dictionary to continue.',
  error: 'Kanji details could not be loaded. Please try again.',
  loading: 'Loading kanji details…',
  reducedMotion: 'Stroke-order animation disabled by reduced-motion preference.',
  strokeUnavailable: 'Stroke-order data is not available for this kanji.',
} as const

/* THE MIDDLE COLUMN'S BUDGET. Six rows is what 316 tall holds under two kickers at the sheet's own
   row height (the approved board draws two readings and four compounds); at most three of them are
   readings, so the compounds -- the part that teaches words -- always keep half. */
export const KANJI_SHEET_ROWS = 6
export const KANJI_SHEET_READING_ROWS = 3

/** the slate the stroke order is drawn on, which is also `.kx-slate`'s size in `kanji-detail.css` */
export const KANJI_SLATE = 150
