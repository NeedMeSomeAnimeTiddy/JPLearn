import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { ScenarioSessionPayload } from '../../generated/types'
import { SCENARIOS } from '../../lib/scenarios'
import { Scenes } from './components/Scenes'
import { scenes } from './scenes'

const onPick = vi.fn()
const onUp = vi.fn()
const session = (id: string) => ({ scenario_id: id } as unknown as ScenarioSessionPayload)

afterEach(() => { cleanup(); onPick.mockReset(); onUp.mockReset() })

describe('what a scene card is made of', () => {
  it('reads every word off the scenario file', () => {
    const [first] = scenes([])
    const src = SCENARIOS[0]
    expect(first).toMatchObject({
      id: src.id, jp: src.titleJa, en: src.title, who: src.npc.name, role: src.npc.role,
      desc: src.description,
    })
    expect(first.objectives).toHaveLength(src.objectives.length)
  })

  it('trims the one label that says "(optional)" out loud', () => {
    /* the hollow marker already says optional, so the data is quoted and its redundancy is not */
    const all = scenes([]).flatMap((s) => s.objectives)
    expect(all.some((o) => /\(optional\)/i.test(o.label))).toBe(false)
    expect(all.some((o) => !o.required)).toBe(true)
  })

  it('counts the plays of THIS scenario rather than of any', () => {
    const [cafe, shinjuku] = scenes([
      session(SCENARIOS[0].id), session(SCENARIOS[0].id), session('something-else'),
    ])
    expect(cafe.played).toBe(2)
    expect(cafe.foot).toMatch(/PLAYED 2 TIMES/)
    expect(shinjuku.played).toBe(0)
    expect(shinjuku.foot).toMatch(/^NOT PLAYED/)
  })

  it('says neither played nor unplayed when the bridge has not answered', () => {
    /* no count is not zero plays, which is the same rule the lane above obeys */
    expect(scenes(null)[0].foot).not.toMatch(/PLAYED/)
  })
})

describe('the scenes screen', () => {
  const show = () => render(
    <Scenes scenes={scenes([session(SCENARIOS[0].id)])} onPick={onPick} onUp={onUp} />,
  )

  it('draws one row per scenario, plus the one that is not a scenario', () => {
    /* FREE TALK IS THE LAST ROW, NOT A DIFFERENT SHAPE. It is not authored content with a start
       and an end -- but that is a fact about what it IS, not about how it is chosen, and it was
       already on the same cursor as the two that are. */
    show()
    expect(document.querySelectorAll('.sc-row')).toHaveLength(SCENARIOS.length + 1)
    expect(document.querySelectorAll('.sc-row.on')).toHaveLength(1)
    expect(document.querySelector('.sc-here')).not.toBeNull()
  })

  it('marks the optional objectives hollow and the required ones solid', () => {
    /* the checklist is the most useful thing on this screen -- it is what the tutor marks you
       against -- so it is the poster's, at a size you can read, rather than eleven pixels of
       card */
    show()
    const opts = document.querySelectorAll('.sc-here .sc-obj span.opt')
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.length).toBeLessThan(document.querySelectorAll('.sc-here .sc-obj span').length)
  })

  it('walks off the last card onto free talk and no further', () => {
    show()
    const root = document.querySelector('.mn-open') as HTMLElement
    for (let i = 0; i < 6; i++) fireEvent.keyDown(root, { key: 'ArrowDown' })
    const rows = document.querySelectorAll('.sc-row')
    expect(rows[rows.length - 1].className).toContain('on')
    expect(document.querySelector('.sc-here')?.textContent).toContain('FREE TALK')
    fireEvent.keyDown(root, { key: 'Enter' })
    /* free talk is not a scene and never was — it hands back null rather than an id */
    expect(onPick).toHaveBeenCalledWith(null)
  })

  it('hands back the scenario that was chosen, not the list', () => {
    show()
    fireEvent.click(document.querySelectorAll('.sc-row')[1])
    expect(onPick).toHaveBeenCalledWith(SCENARIOS[1].id)
  })

  it('goes back up to the lane it came from', () => {
    show()
    /* the back control is the mockup's washi tab in the corner now, not a gold line at the top */
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onUp).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    show()
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})
