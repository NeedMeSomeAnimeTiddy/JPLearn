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

/* COMMENTS ARE PROSE, NOT CODE, and this family of stylesheets quotes CSS in its prose constantly
   -- the L1 header alone names `zoom: var(--u)` three times, explaining what the transplant dropped
   and why. Scanned with the comments left in, every token a comment MENTIONS counted as one the
   stylesheet USES, so the guard demanded a declaration for a property that is deliberately gone.
   Stripping them first is what makes this a check on the rules rather than on the writing. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

const SHEET_PATHS = {
  'stage.css': '../../styles/stage.css',
  'menu.css': './menu.css',
  'lookup.css': '../lookup/lookup.css',
}

/** each sheet on its own, for the checks that are about one file's own source order */
const SHEETS: Record<string, string> = Object.fromEntries(
  Object.entries(SHEET_PATHS).map(([name, rel]) => [name, strip(readFileSync(join(__dirname, rel), 'utf8'))]),
)

const CSS = Object.values(SHEETS).join('\n')

/* AN AT-RULE IS ALLOWED TO REPEAT A DECLARATION — that is what `prefers-reduced-motion` is FOR — so
   the whole block goes before the check below reads the file. Matched by counting braces rather
   than by a regex, which cannot count. */
function noAtRules(css: string): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf('@', i)
    if (at < 0) { out += css.slice(i); break }
    out += css.slice(i, at)
    let j = css.indexOf('{', at)
    if (j < 0) break
    let depth = 0
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') { depth--; if (!depth) { j++; break } }
    }
    i = j
  }
  return out
}

/* set per element from TypeScript rather than declared in a stylesheet, so a search of the CSS
   alone would call them missing:
     --acc   the section's own accent, written onto each L1 row from `MENU_SECTIONS`
     --lk-u  the stage's scale, written onto the frame by every screen's fit()
     --top   where an L1 row sits, which is SOLVED per selection and cannot have a resting value
     --h     how tall it is -- 40 shut, 118/126/122 open by which figure it carries
     --i     its index down the column, which the entrance staggers off */
const SET_IN_TS = new Set(['--acc', '--lk-u', '--top', '--h', '--i'])

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

  /* ================================================================================================
     AND NO RULE QUIETLY UNDOES AN EARLIER ONE.

     THIS EXISTS BECAUSE SIX OF THEM DID. There is no cascade layer and almost no `@media` in this
     family of stylesheets, so between two rules with the same selector at the same specificity the
     only tiebreaker is which one sits further down the file — and 4,500 lines is long enough that
     the second one gets written by somebody who has forgotten the first. Every instance so far has
     been silent: it renders, it lints, it passes, and the wrong half wins.

     What it had already cost, in the order they were found:
       - `transition`, twice, each time dropping a property the earlier rule animated;
       - `font`, a SHORTHAND written into a second `.stat-chip` rule, which reset family, size and
         weight to their inherited values and grew the chip bar from 410px to 600;
       - `left`/`right: 7px` on `.as-lockbox`, on the line immediately after the rule that set 11px;
       - and an entire duplicated ledger-sheet block, twenty-one properties of it, which left the
         sheet's whole visual design as dead code while an older copy 150 lines below rendered.
     Run against the commit before this test landed, it reports twenty-six.

     WHAT IT DOES NOT CATCH, stated so nobody trusts it further than it goes: the collision has to be
     between the SAME selector. Two of the six were not — `.brand, .stats` undone by a later `.stats`
     and `.stat-chip` undone by `.stat-chip.is-open` — and finding those needs specificity
     arithmetic and a matcher, which is a different and much larger check. This one is the cheap half
     that happens to cover the cases this file keeps producing.

     A human reading a diff cannot catch either kind: both rules look right on their own, and the bug
     is the distance between them.
     ================================================================================================ */
  it('never sets the same property twice for the same selector', () => {
    const collisions: string[] = []
    for (const [name, css] of Object.entries(SHEETS)) {
      const seen = new Map<string, string>()
      for (const rule of noAtRules(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        /* the selector LIST carries the specificity, so `.a, .b` and `.b, .a` are the same rule */
        const selector = rule[1]
          .split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join(', ')
        if (!selector) continue
        for (const declaration of rule[2].split(';')) {
          const colon = declaration.indexOf(':')
          if (colon < 0) continue
          const property = declaration.slice(0, colon).trim()
          const value = declaration.slice(colon + 1).trim().replace(/\s+/g, ' ')
          /* custom properties are exempt: redefining one per variant is how they are meant to work */
          if (!property || property.startsWith('--')) continue
          const key = `${selector} | ${property}`
          const first = seen.get(key)
          if (first !== undefined && first !== value) {
            collisions.push(`${name}: ${selector} sets ${property} to "${first}", then to "${value}"`)
          }
          seen.set(key, value)
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it('keeps both golds, because the ladder needs the difference', () => {
    /* `--gold` is the earned, settled one and `--gold-hi` the lit one. The ascent is the only
       screen that shows them together and it is the reason the pair has to exist. */
    expect(CSS).toMatch(/--gold:\s*#cfa45c/)
    expect(CSS).toMatch(/--gold-hi:\s*#e8c47c/)
  })
})
