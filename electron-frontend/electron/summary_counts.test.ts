// @vitest-environment node
import { describe, expect, it } from 'vitest'

const { remainingDue } = require('./summary_counts.cjs')

describe('remainingDue', () => {
  it('reads the cards still due from the summary totals', () => {
    expect(remainingDue({ totals: { remaining_due: 7, due_today: 12 }, decks: [{ due_today: 99 }] })).toBe(7)
  })

  it('is zero for a summary from before the totals, or a bad value', () => {
    expect(remainingDue({ decks: [{ due_today: 5 }] })).toBe(0)
    expect(remainingDue({ totals: { remaining_due: -2 } })).toBe(0)
    expect(remainingDue({ totals: { remaining_due: 'x' } })).toBe(0)
    expect(remainingDue(null)).toBe(0)
  })
})
