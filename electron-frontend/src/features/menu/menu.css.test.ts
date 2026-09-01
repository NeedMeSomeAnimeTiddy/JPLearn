import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* ==================================================================================================
   EVERY TOKEN THE MENU ASKS FOR IS ONE THE MENU DEFINES.

   THIS EXISTS BECAUSE `--gold` DID NOT, AND NOTHING NOTICED FOR THREE PHASES. The ascent paints
   every column's fill with `var(--gold)` and only the selected one with `var(--gold-hi)`, and
   `stage.css` had shipped the second without the first. An undefined custom property does not throw
   and does not log: the whole declaration is simply INVALID AT COMPUTED-VALUE TIME and the property
   falls back to its initial value, so `background: var(--gold)` became `background: transparent`.

   What that looked like: four of the five bars on the ladder drew as empty tracks and the target's
   plinth let the pagoda show through its own name. Against phase 0's accidentally-black valley it
   was invisible. It survived a build, a lint, 954 tests and several rounds of looking at the screen,
   and was only found by lighting the world and then zooming into the pixels.

   A missing token is not a design question, so it does not need an eye — it needs this.
   ================================================================================================== */

const CSS = ['../../styles/stage.css', './menu.css', '../lookup/lookup.css']
  .map((rel) => readFileSync(join(__dirname, rel), 'utf8'))
  .join('\n')

/* set per element from TypeScript rather than declared in a stylesheet, so a search of the CSS
   alone would call them missing:
     --acc   the section's own accent, written onto each L1 row from `MENU_SECTIONS`
     --lk-u  the stage's scale, written onto the frame by every screen's fit() */
const SET_IN_TS = new Set(['--acc', '--lk-u'])

/* AND A `var()` THAT CARRIES A FALLBACK IS ALREADY DEFINED, which is the whole difference between
   `--sky` and `--gold`. `--sky` is written on :root by the valley's day cycle and is absent
   entirely when the valley is off (`?valley=off` is a supported boot), so every read of it names
   the value to use instead. `background: var(--gold)` named nothing, which is why it painted
   transparent and nobody noticed for three phases. */
const usedWithoutFallback = (css: string) => new Set(
  [...css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)]
    .filter((m) => m[2] === ')')
    .map((m) => m[1]),
)

describe('the menu stylesheet', () => {
  it('defines every custom property it uses without a fallback', () => {
    const used = usedWithoutFallback(CSS)
    const declared = new Set([...CSS.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[2]))
    const missing = [...used].filter((t) => !declared.has(t) && !SET_IN_TS.has(t))
    expect(missing).toEqual([])
  })

  it('gives a token the stylesheet cannot define a fallback, rather than trusting it to arrive', () => {
    /* `--sky` runs 0 at midnight to 1 at noon and only exists while the valley is mounted */
    expect(CSS).toMatch(/var\(--sky,\s*[\d.]+\)/)
    expect(usedWithoutFallback(CSS).has('--sky')).toBe(false)
  })

  it('uses every custom property it defines', () => {
    /* the other half of the same mistake: a token nobody reads is a token that has quietly been
       renamed somewhere, which is how the two golds came apart in the first place */
    const used = new Set([...CSS.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]))
    const declared = [...CSS.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[2])
    const unread = [...new Set(declared)].filter((t) => !used.has(t))
    expect(unread).toEqual([])
  })

  it('keeps both golds, because the ladder needs the difference', () => {
    /* `--gold` is the earned, settled one and `--gold-hi` the lit one. The ascent is the only
       screen that shows them together and it is the reason the pair has to exist. */
    expect(CSS).toMatch(/--gold:\s*#cfa45c/)
    expect(CSS).toMatch(/--gold-hi:\s*#e8c47c/)
  })
})
