# STUDY — 学習, the three-storey pavilion

The second of the six places, and the first one cut from REVIEW's pattern rather than invented.
Agreed 2026-08-02.

## Why this one next

- **It is the hardest test of the pattern, and that is the point of doing it early.** REVIEW is a
  shrine precinct — outdoors, with sky, treeline and fog doing a lot of the work. STUDY is a
  building. If Landmark → Threshold → Path only survives outdoors, that is worth finding out with
  five places left rather than one.
- It is menu item #1 and owns the home screen's UP NEXT hook, so it is the one most people land on.
- It is REVIEW's counterpart — study against review — which justifies a shared visual family while
  still being a different structure.

## The shape of it

REVIEW's two levels are both **horizontal**: you stand in a court, then you walk down a corridor.
Repeating that in a different costume would be a re-skin. STUDY's level change is **vertical**, and
that one decision is what makes it a different place at the level of structure.

It also removes REVIEW's hardest problem. Level three there had to become a walk because a corridor
converges on a vanishing point — six signs cannot be separated on screen without moving the camera.
A veranda is a straight run seen obliquely: every bay reads at once.

### The one danger, and the fix

**An interior occludes itself.** The tunnel proved this the expensive way — twenty-six gates closed
their own sight line about three thousand units in, and four separate attempts to put something at
the far end failed because nothing there was ever visible. Floors are worse than gates: a floor is a
solid plane. Enclosed storeys would mean standing on one you cannot see the next, and the continuity
that makes REVIEW work — you can see the tunnel from the court, so you know where you are going —
would be gone.

So the pavilion is **never enclosed**. 楼閣 form: a stone base, three open storeys, a veranda (縁側)
wrapping each, shoji behind them, deep eaves instead of walls, an open stair on the near face. You
can see the storey above from the one below, which is the continuity the tunnel never had.

## Levels

| | what it is | the picks |
|---|---|---|
| menu | one building, three storeys, on the west shore at bearing −37° | — |
| L2 | the ground veranda, seen slightly obliquely | four shoji bays: **かな / 漢字 / 語彙 / 文法** |
| L3 | a walk along the upper veranda, turning the building's corner | the blocks within the chosen subject |

- **L2** — the pick is a bay: a shoji panel with a noren over it. Hover lights the paper from within
  rather than moving anything. This is strictly easier than REVIEW's ema wall, whose tablets had to
  be turned 36° toward the path before they were legible; a veranda is already oblique.
- **L3** — reuses REVIEW's walk wholesale: `walkGo`, screen navigation, `.walk-pick` focus twins,
  the HUD, Escape to back out. The one new thing is that the flight **rises**: station 0 is the
  stair head, and the line turns the corner at the end, which is what stops it being a corridor.

## The counterpart

REVIEW learned that a place with one thing in it is a yard with a thing in it — the water pavilion
is what turned its court into a courtyard. STUDY's counterpart is the lake itself: the pavilion
stands at the water's edge, so its own reflection answers it. The planar reflection pass already
exists and already runs, so this costs nothing — and it is the reason the building belongs on the
shore rather than back from it.

## Order of work

**0. Measure before modelling.** Both of this session's expensive failures were "build, then look".
   Before any geometry: probe the terrain at bearing −37° for level and slope, set `stand` and
   `eyeLift` on `DEST_SPECS[0]` (it is still on the defaults; REVIEW needed overrides), then put a
   stand-in box at the pavilion's intended size and answer two questions —
   - does three storeys fit the frame at that stand-off?
   - do storey two's eaves occlude storey one's veranda from it?

   `NAV.probe` and `NAV.hit` answer both in one page load. If the second answer is bad, the storey
   spacing changes before anything is built.

**1. The building.** One `mergeParts` geometry per storey, so each is one draw call and one outline.

**2. Level two.** The four bays, their hover, the picks and their focus twins.

**3. Level three.** The rising flight and the row placards.

**4. Dressing.** Planting through `spaced`/`PLANTED`, the stair, the approach from the shore.

## Reused vs new

**Reused:** the walk mechanism, the screen-space outline, the placard/sign canvas pipeline,
`spaced`/`PLANTED`/`treeClaim`, the transition machinery, and all four measurement instruments
(`NAV.probe`, `NAV.rectOf`, `NAV.hit`, `NAV.outlineAudit`).

**New:** the pavilion geometry, the shoji/noren bay, and a flight path that climbs.

## Before the geometry lands: split the file

6,435 lines, of which REVIEW is roughly 1,200. Five more places at that rate is well over twelve
thousand in one file. The shrine moves to `places/review.js` exporting a single `buildReview(ctx)`,
with `ctx` carrying what it needs from the core — a mechanical move with no behaviour change, and
far cheaper now than once a second place is tangled into the same scope. STUDY then follows the same
shape as `places/study.js`, and the pattern is established rather than invented twice.

(An inline `<script type="module">` can import from a file but cannot be imported from, which is why
the core is passed in as a context object rather than exported.)
