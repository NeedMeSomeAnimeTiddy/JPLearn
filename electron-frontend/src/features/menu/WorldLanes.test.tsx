import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { Passage } from '../passages'
import type { ProgressionNodeView } from '../progression'
import type { ScenarioSessionPayload } from '../../generated/types'
import { SCENARIOS } from '../../lib/scenarios'
import { gateWords } from './unlock'
import { Lanes } from './components/Lanes'
import { worldLanes, READ_FEATURE, TALK_FEATURE, LANE_ITEMS } from './worldLanes'

const onPick = vi.fn()
const onUp = vi.fn()

/* the two nodes the two lanes wait on, named as the curriculum names them */
const NODES = [
  { node_id: 'grammar_n5', name: 'Grammar N5' },
  { node_id: 'reading', name: 'Reading' },
] as unknown as ProgressionNodeView[]

const passage = (title: string, author: string, difficulty: number, words: number) => ({
  id: title, title, title_reading: title, author,
  source: 'Aozora Bunko (Public Domain)', source_url: '', original_publication: '',
  difficulty, difficulty_label: 'beginner', word_count: words,
  text_jp: '', raw_text: '', vocabulary: [],
} as unknown as Passage)

/* deliberately out of order, so a test that passes could only have sorted them */
const LIBRARY = [
  passage('三番目', '作家 三', 0.9, 2539),
  passage('一番目', '小川 未明', 0.0, 359),
  passage('二番目', '岡本 かの子', 0.2, 555),
]

const session = (id: string) => ({ id, scenario_id: 'cafe-order' } as unknown as ScenarioSessionPayload)

const open = new Set([READ_FEATURE, TALK_FEATURE])
/* the six-step window: GRAMMAR has opened the section and TALK with it, READING has not arrived */
const window6 = new Set([TALK_FEATURE])

/* THE GATE IS RESOLVED FOR THESE LANES, NOT LOOKED UP BY THEM. `useMenuL1` reads `requires` off
   the feature payload and names the milestone; this stands in for that one call, so the lanes are
   tested against the shape they actually receive rather than against a node list they no longer
   see. */
const gates: Record<string, ReturnType<typeof gateWords>> = {
  [READ_FEATURE]: gateWords([{ node_id: 'reading', status: 'mastered' }], NODES),
  [TALK_FEATURE]: gateWords([{ node_id: 'grammar_n5', status: 'mastered' }], NODES),
}

const build = (over: Partial<Parameters<typeof worldLanes>[0]> = {}) => worldLanes({
  passages: LIBRARY, sessions: [], unlocked: open, gateOf: (id) => gates[id] ?? null, ...over,
})

function show(lanes = build()) {
  render(
    <Lanes
      jp="実践" en="THE WORLD" note="NOTE"
      lanes={lanes} onPick={onPick} onUp={onUp}
    />,
  )
}

afterEach(() => {
  cleanup()
  onPick.mockReset()
  onUp.mockReset()
})

describe('what the world lanes are made of', () => {
  it('counts the texts rather than stating them', () => {
    expect(build()[0].fig).toBe(String(LIBRARY.length))
  })

  it('draws an uncounted library as an absence, never as zero texts', () => {
    const read = build({ passages: null })[0]
    expect(read.fig).toBe('—')
    expect(read.figLab).toBe('NOT COUNTED YET')
    expect(read.absent).toBe(true)
    expect(read.items).toEqual([])
  })

  it('shows the first three through the door, in the hub\'s own order', () => {
    const items = build()[0].items ?? []
    expect(items).toHaveLength(LANE_ITEMS)
    expect(items.map((item) => item.jp)).toEqual(['一番目', '二番目', '三番目'])
  })

  it('tags a text with its length, because what you read is not kept', () => {
    const [first] = build()[0].items ?? []
    expect(first.tag).toBe('359 WORDS')
    /* and the gloss is the author, set in the Japanese face — these carry no English title */
    expect(first.en).toBe('小川 未明')
    expect(first.enJp).toBe(true)
  })

  it('lists free talk among the scenes without counting it as one', () => {
    const talk = build()[1]
    expect(talk.fig).toBe(String(SCENARIOS.length))
    const items = talk.items ?? []
    expect(items).toHaveLength(SCENARIOS.length + 1)
    expect(items.at(-1)).toMatchObject({ en: 'Free Talk', hollow: true })
    expect(items.filter((item) => item.hollow)).toHaveLength(1)
  })

  it('counts the conversations actually played, and says so when none were', () => {
    expect(build({ sessions: [session('a'), session('b')] })[1].foot).toMatch(/^2 PLAYED/)
    expect(build({ sessions: [] })[1].foot).toMatch(/^NOTHING PLAYED YET/)
    /* and drops the claim entirely when the bridge never answered — no count is not zero plays */
    expect(build({ sessions: null })[1].foot).not.toMatch(/PLAYED/)
  })

  it('locks nothing until the catalog answers', () => {
    expect(build({ unlocked: null }).every((lane) => !lane.shut)).toBe(true)
  })

  it('draws the six-step window where the section is open and half of it is not', () => {
    const [read, talk] = build({ unlocked: window6 })
    expect(read.shut).toBe(true)
    expect(talk.shut).toBe(false)
  })

  it('changes the gate chip\'s tense with its state, not just its colour', () => {
    expect(build()[0].gate?.en).toBe('OPENED BY READING')
    expect(build({ unlocked: window6 })[0].gate?.en).toBe('OPENS AT READING')
  })

  it('names one milestone in the chip and the same one in the unlock sentence', () => {
    const [read, talk] = build({ unlocked: new Set<string>() })
    /* AND IT SAYS WHICH TRIGGER, which the authored sentence never did: both of these want their
       step MASTERED, and "reach READING on the path" was quietly wrong about that. */
    expect(read.opens).toBe('READING · MASTERED')
    expect(read.gate?.en).toContain('READING')
    /* TALK's step is GRAMMAR N5, which is the name the path screen itself draws for it */
    expect(talk.opens).toBe('GRAMMAR N5 · MASTERED')
    expect(talk.gate?.en).toContain('GRAMMAR N5')
  })

  it('draws no chip at all until the catalog has answered', () => {
    /* a chip reading "OPENS AT" with no step is worse than no chip, and on a first paint the
       feature payload has not landed yet */
    const [read] = build({ gateOf: () => null })
    expect(read.gate?.en).toBe('')
    expect(read.opens).toBe('not open yet')
  })

  it('makes nothing here an obligation', () => {
    expect(build().some((lane) => lane.duty)).toBe(false)
  })
})

describe('the world screen', () => {
  it('draws two lanes on the two-up row', () => {
    show()
    expect(document.querySelectorAll('.pr-lane')).toHaveLength(2)
    expect(document.querySelector('.lanes')?.className).toBe('lanes two')
  })

  it('credits the milestone that opened each lane, and lists what is inside', () => {
    show()
    expect(screen.getByText('OPENED BY READING')).toBeTruthy()
    expect(screen.getByText('OPENED BY GRAMMAR N5')).toBeTruthy()
    expect(document.querySelectorAll('.pr-lane')[0].querySelectorAll('.wd-item')).toHaveLength(3)
    expect(document.querySelectorAll('.wd-item.hollow')).toHaveLength(1)
  })

  it('wears no vermilion at all while both lanes are open', () => {
    show()
    expect(document.querySelectorAll('.pr-lane.duty')).toHaveLength(0)
    expect(document.querySelectorAll('.pr-lane.shut')).toHaveLength(0)
  })

  it('keeps a shut lane whole and puts the unlock on its slab', () => {
    show(build({ unlocked: window6 }))
    const read = document.querySelectorAll('.pr-lane')[0]
    expect(read.classList.contains('shut')).toBe(true)
    /* it keeps its figure and its list — the point of drawing a locked thing is seeing inside */
    expect(read.querySelector('.pr-fig b')?.textContent).toBe(String(LIBRARY.length))
    expect(read.querySelectorAll('.wd-item')).toHaveLength(3)
    expect(read.querySelector('.pr-slab')?.textContent).toBe('READING · MASTERED')
    fireEvent.click(read)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('opens each lane on its own door', () => {
    show()
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('read')
    fireEvent.click(document.querySelectorAll('.pr-lane')[1])
    expect(onPick).toHaveBeenCalledWith('talk')
  })

  it('has no accessibility violations', async () => {
    show(build({ unlocked: window6 }))
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})
