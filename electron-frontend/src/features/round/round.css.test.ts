import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const here = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const round = here('src/features/round/round.css')
const app = here('src/App.css')

/* ==================================================================================================
   THE SHEET IS ONE SURFACE. Four modes brought the app's own dark panels into the middle of it for
   one commit — a black slab with a gold-edged field on cream, brown gradient chips with rounded
   corners in an app that has no rounded corners anywhere else, and a handwriting canvas that drew in
   `--text-main`, which this app's dark theme resolves to a near-white. This is the guard that says
   they cannot walk back in.
   ================================================================================================== */
describe('the work cell is paper all the way down', () => {
  it('has no dark panel left to come back', () => {
    for (const gone of [
      'sentence-assembly', 'stroke-order-picker', 'stroke-order-candidate', 'speech-answer',
      'handwriting-answer-panel', 'handwriting-canvas',
      /* and the screen the sheet replaced, whose last components went with the fills: the cassette
         shell, the HUD, the four-choice grid, the feedback card and the post-run summary */
      'minigame-cassette', 'minigame-hud', 'minigame-response', 'minigame-focus-mode',
      'minigame-session-summary', 'round-feedback', 'option-button', 'option-grid',
      'post-session', 'challenge-prompt', 'hint-assist', 'game-prompt-main',
    ]) {
      /* ANCHORED TO THE START OF A CLASS NAME. `settings-option-button` CONTAINS `option-button`
         and belongs to the settings modal, which is alive; the round grid is `.option-button`. */
      expect(app.includes(`.${gone}`), `.${gone} is still styled in App.css`).toBe(false)
      expect(round.includes(`.${gone}`), `.${gone} is still styled in round.css`).toBe(false)
    }
  })

  it('never rounds a corner', () => {
    expect(round.includes('border-radius')).toBe(false)
  })

  it('keeps the rule as the focus indicator rather than the app accent ring', () => {
    /* `App.css` puts `outline: 2px solid var(--accent)` two pixels off every focused input, and the
       round's field is focused on every single round. See the note in `round.css`. */
    expect(round).toContain('.rd-type input:focus-visible, .rd-rule:focus-visible { outline: none; }')
    expect(round).toContain('.rd-type input:focus, .rd-rule:focus { box-shadow: inset 0 -2px 0 var(--hi); }')
  })

  it('gives every fill somewhere to carry its own verdict', () => {
    /* the slips have `.right`/`.wrong`, the typed rule has this, and the panels keep their board */
    expect(round).toContain('.rd-said.miss b')
    expect(round).toContain('.rd-said.hit > span')
  })
})

/* Two declarations of the same property in one rule is the shape a hand-edited stylesheet takes when
   a block gets pasted twice, and it has caught real drift in `menu.css` more than once. */
describe('no rule declares the same property twice', () => {
  it('holds across round.css', () => {
    const offenders: string[] = []
    for (const match of round.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].split('\n').pop()?.trim() ?? ''
      if (!selector || selector.startsWith('@')) continue
      const seen = new Set<string>()
      for (const line of match[2].split(';')) {
        const property = line.split(':')[0]?.trim()
        if (!property || property.startsWith('/*')) continue
        if (seen.has(property)) offenders.push(`${selector} { ${property} }`)
        seen.add(property)
      }
    }
    expect(offenders).toEqual([])
  })
})
