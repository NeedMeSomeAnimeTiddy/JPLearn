import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ASCENT_BOT, ASCENT_TOP } from './ascent'

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
  /* the round is a menu screen that happens to be a session -- it reads the same tokens off the same
     stage roots, so it is guarded by the same checks */
  'round.css': '../round/round.css',
  /* and EVERY CHARACTER stands on the lookup's own shell, which puts it on the same stage roots */
  'mastery.css': '../mastery/mastery.css',
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

/* ==================================================================================================
   EVERY BOX THAT STANDS ON THE BOARD STANDS ON THE STAGE.

   THIS EXISTS BECAUSE TWELVE SCREENS DID NOT, AND THE ONLY WAY TO SEE IT WAS TO LOOK. The screens
   were transplanted out of the mockup, where each one is a block inside `.hud-panel` whose own space
   begins at frame y166 -- so `top: 34px` there means y200 on the board, and here it meant y34: in
   the crown, under the heading, with the whole bottom half of the picture empty. Nothing failed. The
   build was clean, the lint was clean, fifteen hundred tests were clean, and every screen but two
   was drawn a hundred and sixty-six pixels too high for three phases.

   A COORDINATE CANNOT BE CHECKED BY READING IT, so the table below is the check. It names every rule
   whose `top` is a BOARD coordinate -- the containing block is `.mn-frame` or a wrapper that fills
   it -- and the band that rule belongs to. Anything not named here is positioned inside something
   else and its `top` means something different; `.as-lockbox` at 118 is 118 from the top of its
   column, `.sc-free` at 294 is inside `.scenes`.
   ================================================================================================== */
const STAGE_TOP = 192
const STAGE_BOT = 576
/* the foot band's "~640" -- a band that carries two thin rows (the drills) runs a little past it */
const FOOT_BOT = 646
const CROWN_BOT = 192

/** every rule whose `top` is a coordinate on the 1280x720 board, and where it is allowed to stand */
const BOARD_BOXES: Record<string, 'stage' | 'foot' | 'crown' | 'span'> = {
  /* the front door */
  '.st-hero': 'stage',
  /* THE PATH, as a ledger: the run on the left, the step on the world beside it, the whole
     course once in the band */
  '.pa-run': 'stage', '.pa-here': 'stage', '.pa-strip': 'foot',
  /* RECORDS -- two cards and the year on the stage, the level bar and the badges in the foot */
  '.lg-streak': 'stage', '.lg-rest': 'stage', '.lg-year': 'stage',
  '.lg-lv': 'foot', '.lg-ach': 'foot', '.lg-sheet': 'stage',
  /* the badge wall */
  '.bw-rows': 'stage', '.bw-detail': 'stage',
  /* a deck's blocks, as a ledger: the run on the left, the block on the world beside it, and the
     whole deck once in the band -- where it is also the scrubber. And the vocabulary rail that
     replaces the blocks for the five vocab decks. */
  '.dk-run': 'stage', '.dk-here': 'stage', '.dk-strip': 'foot',
  '.fd-run': 'stage', '.fd-here': 'stage', '.fd-none': 'stage',
  '.fd-mini': 'foot', '.fd-set': 'foot', '.fd-steplab': 'foot',
  /* PRACTICE and THE WORLD, which are the same ledger filled twice */
  '.pr-run': 'stage', '.pr-here': 'stage', '.pr-note': 'foot',
  /* the library */
  '.lb-view': 'stage', '.lb-heads': 'span', '.lb-mini': 'foot',
  /* the drills: the deck axis across the top, the catalogue as lines under it, the mode itself
     beside them, and a foot band carrying two thin rows */
  '.dr-decks': 'stage', '.dr-run': 'stage', '.dr-card': 'stage',
  '.dr-mini': 'foot', '.dr-set': 'foot',
  /* JLPT: the ascent is five tracks and one line under them; the level is a column of
     mode rows and one reading plate */
  '.as-law': 'foot',
  '.lv-modes': 'stage', '.lv-read': 'stage',
  /* the moment something opens */
  '.un-stamp': 'stage', '.un-lead': 'stage', '.un-list': 'stage', '.un-slab': 'stage',
  /* the conversations */
  '.sc-run': 'stage', '.sc-here': 'stage',
  /* shared furniture */
  '.pj-empty': 'stage', '.pj-back': 'crown',
}
/* THE THREE LEDGERS ARE THE SAME THREE BOXES: a run of thin rows on the left, the one thing you
   are about to act on at poster size beside it, and one whole-set summary in the band. The course
   spells them `.pa-*`, a deck's blocks `.dk-*` and the drills `.dr-*`, because the three say
   genuinely different words in the same shapes -- a block is STARTED, a step is OPENED and a mode
   is RUN -- and one parameterised drawing would put all three screens' copy in one file. */

/** is this selector declared at all? */
function menuHas(selector: string): boolean {
  return SHEETS['menu.css'].split('\n').some((line) => line.startsWith(selector))
}

/** the declared `top` and `height` of one rule, read out of the stylesheet by its own selector */
function boxOf(selector: string): { top: number, height: number | null } | null {
  const menu = SHEETS['menu.css']
  const pattern = new RegExp(
    `(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,{])[^{]*\\{([^}]*)\\}`,
    'g',
  )
  for (const match of menu.matchAll(pattern)) {
    const body = match[2]
    const top = /(?<![\w-])top:\s*(-?[\d.]+)px/.exec(body)
    if (!top) continue
    const height = /(?<![\w-])height:\s*(-?[\d.]+)px/.exec(body)
    return { top: Number(top[1]), height: height ? Number(height[1]) : null }
  }
  return null
}

describe('the frame contract', () => {
  it('stands every board-level box on the stage or in a band', () => {
    const wrong: string[] = []
    for (const [selector, band] of Object.entries(BOARD_BOXES)) {
      const box = boxOf(selector)
      if (!box) { wrong.push(`${selector} has no rule with a top -- did it move or get renamed?`); continue }
      const foot = box.height === null ? box.top : box.top + box.height
      if (band === 'crown') {
        if (box.top >= CROWN_BOT) wrong.push(`${selector} is crown furniture but sits at y${box.top}`)
        continue
      }
      /* `span` is the third case and there are exactly two of it: a box that starts on the stage and
         is MEANT to reach into the band under it. The ascent's cursor outlines a column and the
         plinth that names it, which are one object read as one; the library's heading layer is the
         same 384-tall plate as its rail, two pixels down, so it ends two into the band. */
      const floor = band === 'foot' ? STAGE_BOT : STAGE_TOP
      const ceiling = band === 'stage' ? STAGE_BOT : FOOT_BOT
      if (box.top < floor) wrong.push(`${selector} starts at y${box.top}, above the ${band} (y${floor})`)
      if (foot > ceiling) wrong.push(`${selector} runs to y${foot}, past the ${band} (y${ceiling})`)
    }
    expect(wrong).toEqual([])
  })

  it('keeps the ascent inside the stage, which its own module sizes rather than the stylesheet', () => {
    /* the columns' box is solved in TypeScript because the wide one moves -- so the numbers the
       stylesheet cannot see are checked against the same two lines */
    expect(ASCENT_TOP).toBeGreaterThanOrEqual(STAGE_TOP)
    expect(ASCENT_BOT).toBeLessThanOrEqual(STAGE_BOT)
    /* every level's name, count and state ride INSIDE its own column now, so there is nothing
       left to hang off the ladder and drift out of line with it */
    expect(menuHas('.as-plinth')).toBe(false)
    expect(menuHas('.as-lockbox')).toBe(false)
  })

  /* ==================================================================================================
     TEN POINTS IS THE FLOOR, and it took four passes to get here.

     The menu was drawn at phone scale and then rebuilt screen by screen at desktop scale, and every
     time a screen's figures were resized the labels beside them were left where they were -- so the
     ledger read `ACCURACY 正答率` at nine points against a per-cent at thirty, and the library set
     `MIN` under a text's length at seven and a half. Sixty-nine rules across thirteen screens, found
     one and two at a time because none of them was ever the worst thing on the screen it was on.

     This is the line under that. A size below ten is not a design question at 1280x720 -- it is type
     nobody at desk distance can read -- and the four rules at exactly ten are the floor rather than
     an exception to it. `round.css` has its own smallest rule at 9.5, deliberately, on the card tags.
     ================================================================================================== */
  it('never sets menu type below ten points again', () => {
    const offenders: string[] = []
    for (const [name, css] of Object.entries(SHEETS)) {
      for (const match of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const selector = match[1].split('\n').pop()?.trim() ?? ''
        for (const size of match[2].matchAll(/font-size:\s*([\d.]+)px/g)) {
          if (Number(size[1]) < 10) offenders.push(`${name} ${selector} @${size[1]}px`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no card grid and no card fan left to come back', () => {
    /* THE TWO SHAPES THIS FAMILY OF SCREENS DOES NOT MAKE. `.dk-sheet` was a six-across paged
       overlay of cleared blocks and `.dr-tab`/`.dr-hero`/`.dr-side` were seventeen modes fanned off
       both edges of the stage at 45% opacity -- a phone's grid and a phone's carousel. The rows
       reach everything both of them reached, so neither is kept as a second way to do one thing. */
    for (const gone of ['.dk-sheet', '.dk-cell', '.dk-grid', '.dk-behind', '.dk-ahead',
      '.dr-tab', '.dr-hero', '.dr-side', '.dr-strip', '.dr-rail', '.lanes', '.scenes', '.sc-card', '.sc-free', '.fd-hero', '.fd-today', '.fd-rail']) {
      expect([gone, menuHas(gone)]).toEqual([gone, false])
    }
  })
})
