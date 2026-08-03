# STUDY — 回遊式庭園, the stroll garden

The second of the six places. Costume settled 2026-08-03 — see `PLAN-places.md` for the whole set
and why it was re-planned.

> **This file used to plan a three-storey pavilion (楼閣).** That was dropped: it was one of three
> stacked-roof timber buildings in the set, and it had nowhere to put L4. The step-0 measurement
> work done against it is kept below, because most of it is facts about the terrain and the
> instruments rather than facts about a pavilion.

## Why the garden

- **It is the one Japanese form designed as a sequence of framed scenes you walk between.** L3 is
  not something imposed on it, it is what a stroll garden is *for* — which is the opposite of the
  pavilion, where a walk along a veranda had to be invented.
- **It has a room at the end of every path.** The 茶室 or 東屋 at each station is where the minigame
  plays. L4 was the requirement that killed the four preceding proposals.
- **It is not a building**, which is the objection that started the re-plan, while still being
  unmistakably Japanese in every element: arched bridge, stepping stones, snow-viewing lantern,
  moss, koi, 鹿威し.
- It is REVIEW's counterpart in temperament as well as in name — the shrine is ceremony on an axis,
  the garden is a wandering circuit. Study against review.

## Levels

| | what it is | the picks |
|---|---|---|
| L1 | a low walled garden on the lake shore, one roof and a few crowns showing over the wall | — |
| L2 | four quarters, one per season | **かな / 漢字 / 語彙 / 文法** |
| L3 | the stations along that quarter's path, each named by a 駒札 | the blocks within the subject |
| L4 | the 茶室 or 東屋 at a station — you kneel inside and the game plays on the mat | — |

The season mapping is not decoration; it is doing work:

- **春 spring, cherry → かな.** The beginning, first things.
- **夏 summer, iris and open water → 漢字.** The deep work, the heaviest green.
- **秋 autumn, maple → 語彙.** Accumulation, the harvest.
- **冬 winter, pine under 雪吊り rope cones → 文法.** Bare branches — winter is when structure shows.

## Borrowed scenery

借景 is a real technique and it hands the garden a landmark for nothing: the wall is built to *frame*
the lake and the far ranges as part of the composition rather than to shut them out. That is how a
low enclosure gets a skyline without building one, and it is the reason the garden belongs on the
shore rather than back from it.

## Order of work

**1. The site, re-measured.** The bearing was forced out to −52 by the pavilion's 1,240-unit width
   reaching into the menu frame. A walled garden has no tall silhouette and may not need that, so
   the constraint is re-run rather than inherited. What the garden wants instead: **level ground**
   (a garden is built level), **a water edge** for the pond to meet the lake, and a view worth
   borrowing. `NAV.site` reports fall, near/far wetness and reach; that is the same query with
   different targets.

**2. The shot.** `stand` 3200 / `eyeLift` 460 framed a 1,040-tall building and does not transfer. A
   garden is read as a *ground plan*, so the eye probably wants to be higher and the stand-off
   closer. Measure before modelling — the instruments are built and this is one page load.

**3. The enclosure.** Wall, coping, gate. One `mergeParts` geometry.

**4. The water and the circuit.** The pond, the island, the path around it. The path is the ribbon
   mesh REVIEW's approach already uses — it cannot step or gap, and it carries its own colour.

**5. The four quarters.** Their planting, their lanterns, their picks and focus twins.

**6. Level three.** The stations along a quarter, and the 駒札 name-plaques. Reuses REVIEW's walk.

**7. The rooms.** A 茶室 at each station — the first L4 interior in the project, so it sets the
   pattern for the other five places.

## Reused vs new

**Reused:** the walk mechanism, the screen-space outline, the placard/sign canvas pipeline, the path
ribbon, `spaced`/`PLANTED`/`treeClaim`, the transition machinery, the planar reflection, and all the
measurement instruments (`NAV.probe`, `NAV.rectOf`, `NAV.hit`, `NAV.site`, `NAV.tryStand`,
`NAV.outlineAudit`).

**New:** the enclosure, the pond and its bridges, seasonal planting, and the first L4 interior.

---

# What step 0 established (kept)

Measured against the pavilion massing, but most of it is not about the pavilion.

## Still true — terrain and instruments

**The shore at bearing −52 is a neck of land.** Lake from f −2600 to −1000, dry ground −800 to +600,
open water beyond +800. Measured, and independent of what stands on it.

**A bearing outside the menu's 31° half-cone is not automatically safe.** The cone is a rule about
points. STUDY sat at −37 and the pavilion still reached into the frame, sliced by the left edge and
landing behind the type column. *A destination's bearing is safe only for an object of the size that
was there when it was chosen* — which is why the garden's bearing gets re-measured rather than
inherited, in the other direction this time.

**Wetness has to be split near from far.** The same "40% water" is the lake between you and the
place at one bearing and the lake behind it at another, where the place hides its own reflection.
`NAV.site` reports `near`, `far` and `reach`.

**Clearing the footprint does nothing about the approach.** Everything between the camera and the
subject is in shot, so a tree claim has to be a wedge widening toward the subject, not a circle
around it. Two of the pavilion's four bays came back blocked by a broadleaf.

**Height is what makes level ground read, not how much of it there is.** 360 units of bank at a 180
eye is 48 pixels; the same bank at 460 is 60. *This one matters more for a garden than it did for a
building* — a garden IS level ground, and how much of its plan you can see is almost entirely a
question of eye height.

**`standOff` clamps at `len - 400`.** Stand-offs of 3,700 and 4,200 measure identically. There is a
ceiling on how far back any of these shots can go.

**`entered` is not `arrived`, and neither is `state === 'menu' && !busy`.** Both go true while the
intro camera is still easing — rig at [381,180,1050] fov 46 against a home of [170,60,830] fov 42.
Two separate readings claimed the pavilion had come 300–500px back into the menu frame at 21:9 when
it is clear of it. The only condition that means the shot has arrived is **the rig reporting the
same numbers two frames running**.

## Superseded

- The site choice **−52 / 4150** and the shot **stand 3200 / eyeLift 460 / focus +430** were both
  chosen to frame a 1,040-tall building. Re-derive.
- The massing constraints — eave taper carried by the oversail, storey pitch 250, the widest eave
  near 1,030 units, the plinth's 260 skirt — die with the pavilion.
- **The occlusion finding dies with it too**, but the shape of the answer is worth keeping: the
  danger ran the *opposite* way to the one predicted. An eave hides what is behind and above it, so
  what got swallowed was the deck of the storey above, never the wall below. When a plan predicts an
  occlusion, check which direction it actually runs before designing around it.

## Open, and now inherited by the garden

- **STUDY still has its legacy CSS3D level two** — four black tiles (ひらがな / カタカナ / 漢字 /
  語彙) stepping diagonally across whatever stands there, plus the 学習 title plane and the env
  backdrop. The agreed set is **かな / 漢字 / 語彙 / 文法**, so those get replaced wholesale.
- **900×1000 portrait is the weak viewport.** The pavilion fell to 33% of frame height and 55px per
  bay there. Re-check once the garden's real picks exist.
