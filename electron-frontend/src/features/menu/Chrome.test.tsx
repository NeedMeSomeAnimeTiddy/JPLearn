import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MENU_SECTIONS } from './constants'
import { SCREEN_NAMES, screenHead } from './chrome'
import { ScreenHead } from './components/ScreenHead'
import { MenuChrome } from './components/MenuChrome'
import { FLASH, doFlash, refuse } from './refuse'
import { screenClass } from './useScreen'
import { UNLOCK_GOES_TO, UNLOCK_LEADS_TO } from './unlock'
import type { MenuCrown } from './types'

vi.mock('../../valley/valley', () => ({ punchCamera: vi.fn() }))

afterEach(() => {
  cleanup()
  document.getElementById('mn-flash')?.remove()
})

describe('what a screen says it is', () => {
  it('gives every section its own mark and its own colour', () => {
    /* the mark is the one element carried unchanged from the row you pressed, which is what makes
       the tie readable at a glance rather than by reading */
    for (const s of MENU_SECTIONS) {
      const head = screenHead(s.key, null)!
      expect(head.mark).toBe(s.glyph)
      expect(head.accent).toBe(s.accent)
    }
  })

  it('has no kicker at level two, where the heading IS the section', () => {
    /* a kicker there would print the same word twice, an inch apart */
    expect(screenHead('STUDY', null)!.kick).toBeNull()
    expect(screenHead('STUDY', null)!.en).toBe('THE PATH')
  })

  it('says where you came from at level three', () => {
    const head = screenHead('READING', 'scenes')!
    expect(head.kick).toBe('THE WORLD')
    expect(head.en).toBe('TALK')
    expect(head.mark).toBe('実')
  })

  it('falls back to the section rather than to nothing for a screen it has not met', () => {
    /* a heading that says the less specific true thing beats no heading; there are three ways into
       a deck and a fourth screen is one `enterScreen` call away */
    const head = screenHead('DRILLS', 'something-new')!
    expect(head.en).toBe('PRACTICE')
    expect(head.kick).toBeNull()
  })

  it('lets a screen name itself where the name is data', () => {
    /* the exam level's title is N5..N1, which is a row of the ladder rather than a screen id */
    expect(screenHead('JLPT', 'level', { en: 'N4', jp: '級' })!.en).toBe('N4')
  })

  it('has nothing to say outside the tree', () => {
    expect(screenHead(null, null)).toBeNull()
  })

  it('knows every screen the menu can actually reach', () => {
    /* `enterScreen` is called with eight ids across App.tsx; a screen missing from this table gets
       the section's name, which is a quiet downgrade rather than a visible break -- so it is pinned */
    expect(Object.keys(SCREEN_NAMES).sort()).toEqual(
      ['daily', 'deck', 'drills', 'feed', 'level', 'library', 'scenes', 'wall'],
    )
  })
})

describe('the heading slab', () => {
  it('draws the mark, the trail and both scripts', () => {
    render(<ScreenHead head={screenHead('RECORDS', 'wall')} note="2 / 25 SEALS" />)
    expect(document.querySelector('.pj-mark')?.textContent).toBe('記')
    expect(document.querySelector('.pj-kick')?.textContent).toBe('YOU')
    expect(document.querySelector('.pj-title b')?.textContent).toBe('ACHIEVEMENTS')
    expect(document.querySelector('.pj-title i')?.textContent).toBe('章')
    expect(document.querySelector('.pj-note')?.textContent).toBe('2 / 25 SEALS')
  })

  it('carries the section colour, because a stylesheet cannot know it', () => {
    render(<ScreenHead head={screenHead('DRILLS', 'drills')} />)
    const cap = document.querySelector('.pj-cap') as HTMLElement
    expect(cap.style.getPropertyValue('--pj-accent')).toBe('#c2344a')
  })

  it('draws nothing at all rather than an empty slab', () => {
    const { container } = render(<ScreenHead head={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('leaves the note out when the screen has nothing live to say', () => {
    render(<ScreenHead head={screenHead('STUDY', null)} />)
    expect(document.querySelector('.pj-note')).toBeNull()
  })
})

const crown: MenuCrown = {
  streakDays: 4, level: 2, xpInLevel: 100, xpForLevel: 150,
  streakBest: 11, freezes: 2, lastStudied: null, totalXp: 300, week: null,
}

describe('the chrome layer', () => {
  it('stands outside the board, which is what stops it landing on a screen', () => {
    /* twelve of the thirteen screens are composed to FILL the 1280x720 board -- the ledger's second
       plate runs x 745..1107 at y 34 -- so a chip bar placed on the board paints over live figures.
       See the note by `.brand` in menu.css. */
    render(<MenuChrome crown={crown} />)
    const brand = document.querySelector('.brand')!
    const frame = document.querySelector('.mn-frame')!
    expect(frame.contains(brand)).toBe(false)
  })

  it('carries the brand and every chip the account can fill', () => {
    render(<MenuChrome crown={crown} />)
    expect(screen.getByText('JPLEARN')).toBeTruthy()
    expect(screen.getByLabelText('Streak — 4 days')).toBeTruthy()
    expect(screen.getByLabelText('Level 2')).toBeTruthy()
  })

  it('publishes the board scale where a fixed element can read it', () => {
    render(<MenuChrome crown={crown} />)
    expect(document.documentElement.style.getPropertyValue('--lk-u')).not.toBe('')
  })
})

describe('the entrance', () => {
  it('is off on the frame that inserts the screen and on for the one after', () => {
    /* the class has to be applied in a LATER paint than the one that inserted the element, or the
       browser has nothing to transition from and the board simply appears at its final value */
    expect(screenClass(false)).toBe('mn-open')
    expect(screenClass(true)).toBe('mn-open on')
  })

  it('keeps whatever else the screen calls itself', () => {
    expect(screenClass(true, 'un-open')).toBe('mn-open on un-open')
  })
})

describe('saying no', () => {
  it('makes one sheet and keeps it, however many times it is asked', () => {
    /* a refusal can happen twice in a second, and a fresh node each time leaves a stack of them
       behind whenever an animation is interrupted */
    const el = document.createElement('div')
    el.animate = vi.fn(() => ({ cancel: vi.fn() })) as never
    doFlash()
    doFlash()
    doFlash()
    expect(document.querySelectorAll('.mn-flash')).toHaveLength(1)
    void el
  })

  it('is a blink rather than a strobe, and short', () => {
    expect(FLASH.peak).toBeLessThan(0.35)
    expect(FLASH.ms).toBeLessThan(250)
  })

  it('knocks the frame as well as flashing, because either alone is ambiguous', async () => {
    /* a flash with no knock reads as a rendering glitch, and a knock with no flash is easy to miss */
    const { punchCamera } = await import('../../valley/valley')
    act(() => refuse())
    expect(punchCamera).toHaveBeenCalled()
  })

  it('survives a browser with no animation API rather than throwing inside a keydown', () => {
    const sheet = document.createElement('div')
    sheet.id = 'mn-flash'
    document.body.appendChild(sheet)
    ;(sheet as unknown as { animate: undefined }).animate = undefined
    expect(() => doFlash()).not.toThrow()
  })
})

describe('where an unlocked feature lives', () => {
  it('routes every feature that names a menu section', () => {
    /* the label and the route are separate tables on purpose: `themes` is in Settings, which this
       menu has no route into, so it keeps its label and stays a plain card */
    for (const id of Object.keys(UNLOCK_LEADS_TO)) {
      if (id === 'themes') { expect(UNLOCK_GOES_TO[id]).toBeUndefined(); continue }
      expect(UNLOCK_GOES_TO[id]).toBeTruthy()
    }
  })

  it('sends each one to a section the tree actually has', () => {
    const keys = new Set(MENU_SECTIONS.map((s) => s.key))
    for (const route of Object.values(UNLOCK_GOES_TO)) expect(keys.has(route.section)).toBe(true)
  })

  it('names a screen the heading table knows, wherever it names one', () => {
    for (const route of Object.values(UNLOCK_GOES_TO)) {
      if (route.screen) expect(SCREEN_NAMES[route.screen]).toBeTruthy()
    }
  })
})
