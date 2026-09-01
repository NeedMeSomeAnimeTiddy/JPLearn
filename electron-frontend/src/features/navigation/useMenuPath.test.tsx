import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { MenuSectionKey } from '../menu'
import type { MenuPathApi } from './types'
import { L2_READY, useMenuPath } from './useMenuPath'

const passthrough = vi.fn()

let api: MenuPathApi

function Harness() {
  api = useMenuPath(passthrough)
  return null
}

function mount() {
  render(<Harness />)
}

afterEach(() => {
  cleanup()
  passthrough.mockReset()
  for (const key of Object.keys(L2_READY)) {
    delete L2_READY[key as MenuSectionKey]
  }
})

describe('the menu tree', () => {
  it('starts at the root, with nothing selected', () => {
    mount()
    expect(api.level).toBe(1)
    expect(api.section).toBeNull()
    expect(api.screen).toBeNull()
  })

  it('passes a section with no L2 screen straight through to the flat view', () => {
    mount()
    act(() => api.enterSection('JLPT'))

    expect(passthrough).toHaveBeenCalledWith('JLPT')
    /* and it does NOT stop at a level you cannot see — that would make the next Escape do
       nothing, once, for no visible reason */
    expect(api.level).toBe(1)
  })

  it('stops at L2 once that section has a screen', () => {
    L2_READY.JLPT = true
    mount()
    act(() => api.enterSection('JLPT'))

    expect(passthrough).not.toHaveBeenCalled()
    expect(api.level).toBe(2)
    expect(api.section).toBe('JLPT')
  })

  it('goes down to L3 and back up one level at a time', () => {
    L2_READY.STUDY = true
    mount()
    act(() => api.enterSection('STUDY'))
    act(() => api.enterScreen('deck'))

    expect(api.level).toBe(3)
    expect(api.screen).toBe('deck')

    act(() => { expect(api.up()).toBe(true) })
    expect(api.level).toBe(2)
    expect(api.section).toBe('STUDY')
    expect(api.screen).toBeNull()

    act(() => { expect(api.up()).toBe(true) })
    expect(api.level).toBe(1)
    expect(api.section).toBeNull()
  })

  it('says so when there is nowhere above to go', () => {
    mount()
    /* the boolean is what lets Escape fall through to the app's own parent chain instead of
       silently doing nothing at the root */
    let moved: boolean | undefined
    act(() => { moved = api.up() })
    expect(moved).toBe(false)
    expect(api.level).toBe(1)
  })

  it('cannot enter a screen from the root, because there is nothing to be inside of', () => {
    mount()
    act(() => api.enterScreen('deck'))
    expect(api.level).toBe(1)
  })

  it('reset comes home from anywhere', () => {
    L2_READY.READING = true
    mount()
    act(() => api.enterSection('READING'))
    act(() => api.enterScreen('library'))
    expect(api.level).toBe(3)

    act(() => api.reset())
    expect(api.level).toBe(1)
    expect(api.section).toBeNull()
  })

  it('registering a screen converts a passthrough into a stop, and nothing else changes', () => {
    mount()
    act(() => api.enterSection('DRILLS'))
    expect(passthrough).toHaveBeenCalledTimes(1)
    expect(api.level).toBe(1)

    /* this is exactly what phase 4 does, one section at a time */
    L2_READY.DRILLS = true
    act(() => api.enterSection('DRILLS'))
    expect(passthrough).toHaveBeenCalledTimes(1)
    expect(api.level).toBe(2)
  })
})
