import { describe, expect, it } from 'vitest'
import { CLOSE_BEHAVIORS, isCloseBehavior } from './constants'

// The main process owns the list; the renderer keeps a typed copy for its union (audit 17, F7).
const configStore = require('../electron/config_store.cjs') as { CLOSE_BEHAVIORS: readonly string[] }

describe('close behaviour values', () => {
  it('are the main process list, in the same order', () => {
    expect([...CLOSE_BEHAVIORS]).toEqual([...configStore.CLOSE_BEHAVIORS])
  })

  it('narrow only those values', () => {
    for (const value of CLOSE_BEHAVIORS) expect(isCloseBehavior(value)).toBe(true)
    expect(isCloseBehavior('minimise')).toBe(false)
    expect(isCloseBehavior(true)).toBe(false)
  })
})
