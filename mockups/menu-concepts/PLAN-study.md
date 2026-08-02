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

**0. Measure before modelling. — DONE.** See below; it changed the site, and step 1 starts from
   settled numbers rather than from this section's guesses.

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

---

# Step 0 — what the measurement said

A stand-in massing went up first: nine named boxes at the intended dimensions, in
`places/study.js`. Step 1 replaces it. Everything below is measured, not chosen.

## The site moved

`DEST_SPECS[0]` had carried **bearing −37, dist 4400** since the destinations were authored, and it
is not a site the pavilion can stand on. Three things had to agree and only ever two did at once:

| bearing / dist | menu | footprint | shore |
|---|---|---|---|
| −37 / 4400 | **reaches into the frame**, sliced by the left edge, behind the type column | 46% under water, 195 fall | water on the near side — ideal |
| −55 / 4400 | clear | 40% wet, 199 fall | water on the **far** side; building hides its own reflection, foreground is wood |
| **−52 / 4000** | **clear** (17px of eave at 21:9, invisible against the treeline) | **10% wet, 114 fall — flattest in the sweep** | water reaching 2,500 back along the approach |

The two findings worth carrying to the other four places:

- **A bearing outside the menu's 31° half-cone is not automatically safe.** The cone is a rule about
  points; the pavilion is 1,240 units wide. A landmark intrudes from further out than its bearing
  suggests, and only something of the final size standing there can say by how much.
- **Wetness has to be split near from far.** The same "40% water" is the lake between you and the
  building at one bearing and the lake behind it at another. `NAV.site` now reports `near`, `far`
  and `reach` (how far back along the approach the water still comes) for exactly this reason.

## The shot

`stand: 2700, eyeLift: 180`, focus **430 above the platform top**. The default 1,500 overflowed the
frame by 900px in height.

| viewport | building height | % of frame | ground veranda |
|---|---|---|---|
| 1920×1080 | 859 | 80% | 560px |
| 1600×900 | 716 | 80% | 467px |
| 1400×880 | 626 | 71% | 409px |
| 1024×768 | 458 | 60% | 299px |
| 2560×1080 | 859 | 80% | 560px |
| 900×1000 | 403 | 40% | 263px |

560px of veranda is **140 per bay** — more than the shrine's ema tablets ever had, so level two's
legibility is not in question. The 900×1000 case is the weak one at 40% of frame height; it is
still legible and it is the least likely viewport.

## The occlusion question, answered — and it pointed the other way

"Do storey two's eaves occlude storey one's veranda?" **No, and they cannot.** From a low camera an
eave hides what is behind and above it, so what gets swallowed is the *deck of the storey above*,
never the wall below. Raycast at the chosen shot: `core1`, `core2`, `core3` and `roof` all report
themselves; `deck2` and `deck3` report `eave1` and `eave2`, which is what a pavilion looks like from
the ground. Level three stands on the veranda, so it never needs that view.

**The real occlusion problem was trees.** Two of the four bays came back BLOCKED by a broadleaf.
A claim circle round the building does nothing about the 2,700 units between it and the camera, so
the claim is now a wedge widening from the standing point to the facade.

## Constraints step 1 inherits

- **The widest eave must stay near 1,030 units.** At 21:9 the massing clears the menu's left edge by
  17px. A wider building needs the bearing re-checked, not just the eave.
- **The taper has to be carried by the eaves.** Drawing the walls in while holding the oversail
  constant produced a visible stack of identical trays. Current: cores 640/540/430, oversails
  195/165/135, so the eaves read 1030/870/700.
- **Storey pitch 250 works** — it is what leaves all three fronts clear at a 180 eye. Changing it
  reopens the occlusion question.
- **The platform is level at −296** and the base skirt has to reach 260 below it; the near ground
  rises enough to bury the plinth's foot, which is correct but means the base's visible height is
  less than its modelled height.

## Two things step 0 uncovered that steps 2 and 4 own

- **STUDY still has its legacy CSS3D level two** — four black tiles (ひらがな / カタカナ / 漢字 /
  語彙) stepping diagonally across the facade, plus the 学習 title plane and the env backdrop. They
  are what step 2 replaces with shoji bays, and the agreed set is **かな / 漢字 / 語彙 / 文法**, not
  the four currently there.
- **The base reads as a blank slab** and the ground cuts across its foot. Step 1 gives it a stone
  edge; step 4 dresses the bank.
