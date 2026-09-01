/**
 * The daily budgets offered as one-press choices.
 *
 * The bridge clamps to 0..200 and defaults to 10 (`domain/vocab_order`); these are the
 * five a control can reasonably hold, not the range. Zero is first and is a real setting
 * — "no new words today, just my reviews" — rather than a disabled state.
 *
 * SHARED, because two surfaces offer it: the script hub's feed panel and the menu's feed
 * screen. Two copies of a step list is two places for the highlighted chip to disagree
 * with the number beside it.
 */
export const VOCAB_BUDGET_STEPS = [0, 5, 10, 20, 40] as const
