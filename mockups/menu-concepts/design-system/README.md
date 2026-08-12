# JPLearn menu — design system

Constraints and existing vocabulary for the menu in `01-sumi-3d.html`. **This describes what exists.
It does not propose how the study course should look — that is deliberately left open.**

Every value here is copied from the mockup, not invented. If one differs, the mockup is right and
this is stale.

## What is in it

| Card | What it settles |
| --- | --- |
| `foundations/color.html` | The six tokens, the six section accents, and the colour law: gold = earned, vermilion = the one thing to press, ink = not yet. |
| `foundations/type.html` | The four faces available and what each is for. Display vs label, mincho vs gothic. |
| `foundations/legibility.html` | Physics, not taste: the interface stands on a lit, moving, flat-shaded valley, so type needs a keyline, a ground, or a crushed backdrop. Shown failing and fixed. |
| `foundations/geometry.html` | The existing chrome's geometry — square corners, one skew angle, one hard shadow. **Square corners are a hard rule; the skew and shadow are the current chrome's habit, not a law.** |
| `components/chip.html` | The chip family — top row, figure stack, keycaps, gauge track. Shared by all six sections. |
| `components/action-slab.html` | The bottom-right slab: three states, and why its third line cannot lie. |

## The open problem

**The STUDY course.** Sixteen ordered steps, four of which are decks and ten of which hand off to
another section. It needs to show, at a glance: where you are, what is behind you, what is locked,
and what pressing Enter will do.

Ten designs have been rejected. All of them are in git history and none should be used as a
starting point:

- four ladders (rows, columns, a rule, a bar per row)
- a printed sheet, a calendar of numerals, a stack of save slabs
- a crest field, a technique chain, a pale scroll panel

The step data lives in `STUDY_PATH` in the mockup: an id, an English name, a Japanese name, a kind
(`deck` / `goto` / `none`), and the gate in plain words ("all 46 characters", "80% of it").

## Hard constraints

1. **Screen-space 2D only.** The 3D world contributes camera movement, place and distance — never
   widgets. No boards, signs or tablets in the world.
2. **Square corners.** No `border-radius`, anywhere.
3. **It stands on a lit 3D valley** that moves and changes with time of day, from bright sand to
   green canopy to night. See `foundations/legibility.html`.
4. **Windows system fonts only** — no webfonts. See `foundations/type.html`.
5. The panel is full-bleed with ~52px of left padding; the block for the course is about 1,180 ×
   400 CSS px at a 1280×720 design scale.

## Previewing locally

Self-contained pages; open one directly, or serve the folder:

```bash
python mockups/menu-concepts/serve.py 5230
```

Fonts will fall back off Windows — judge structure there and type on Windows.
