import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { PREFS_STORAGE_KEY } from '../../lib/appStorage'
import type { BlockInfo } from '../../types'
import { useBlockSelection } from './useBlockSelection'

const block = (index: number, unlocked: boolean): BlockInfo => ({
  index, name: `B${index}`, card_ids: [index], sample_chars: [], characters: [], meanings: [],
  romajis: [], mastery: 0, unlocked,
}) as unknown as BlockInfo

const blocks = [block(0, true), block(1, true), block(2, false)]

function storedSelection(): unknown {
  return JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}').blockSelectionV2
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('select (audit 4 F1)', () => {
  it('leaves the selection alone for a block its list has locked, rather than saving the whole deck', () => {
    /* a saved [] means the learner chose the whole deck; nothing else may write it */
    const { result } = renderHook(() => useBlockSelection('hiragana', blocks, []))
    act(() => result.current.select(0))
    expect(storedSelection()).toEqual({ hiragana: [0] })

    act(() => result.current.select(2))
    expect(storedSelection()).toEqual({ hiragana: [0] })
    expect(result.current.selected).toEqual([0])
  })

  it('checks the block against a fresher list when it is given one', () => {
    const { result } = renderHook(() => useBlockSelection('hiragana', blocks, []))
    act(() => result.current.select(2, [block(0, true), block(1, true), block(2, true)]))
    expect(storedSelection()).toEqual({ hiragana: [2] })
  })
})
