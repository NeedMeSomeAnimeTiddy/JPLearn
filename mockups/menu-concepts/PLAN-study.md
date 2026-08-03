# STUDY — 方丈と四方の庭, the hall and its four gardens

The second of the six places. Costume settled 2026-08-03 — see `PLAN-places.md` for the whole set
and why it was re-planned.

> **This file used to plan a three-storey pavilion (楼閣).** That was dropped: it was one of three
> stacked-roof timber buildings in the set, and it had nowhere to put L4. The step-0 measurement
> work done against it is kept below, because most of it is facts about the terrain and the
> instruments rather than facts about a pavilion.

## Why a garden

- **A garden is designed as a sequence of framed scenes you walk between.** L3 is not something
  imposed on it, it is what a garden is *for* — the opposite of the pavilion, where a walk along a
  veranda had to be invented.
- **There is a room at the end of every path.** L4 was the requirement that killed the four
  preceding proposals; here it is the hall’s own room on that side.
- **Its identity is not a roof.** That is the objection that started the re-plan, and it still holds
  — the hall is single-storey and everything else is ground, water, stone and planting: arched
  bridge, stepping stones, raked gravel, moss, koi, 雪見灯籠.
- It is REVIEW's counterpart in temperament as well as in name — the shrine is ceremony on an axis,
  the garden is four rooms you wander between. Study against review.

## The form: 方丈と四方の庭 — one hall, four gardens

**There is a real precedent and it is exactly this.** 東福寺方丈 (Tōfuku-ji Hōjō) in Kyoto has four
gardens, one on each face of a single hall, each in a *different style* — the only such arrangement
in Japan. So the structure is not invented: a hall in the middle, and four gardens round it that
share nothing but their wall.

That gives level two something no other place in the set has — **four picks that are genuinely
different objects rather than four labels on the same object.** A dry gravel garden and a pond
garden do not look like variants of each other.

| face | garden | season | subject | why |
|---|---|---|---|---|
| 東 east | 苔庭 — moss and cherry | 春 spring | **かな** | soft, low, first things |
| 北 north | 池庭 — the pond, with the 反橋 arched bridge over it | 夏 summer | **漢字** | water and irises; the deep work |
| 西 west | 紅葉 — the maple grove | 秋 autumn | **語彙** | accumulation, the harvest |
| 南 south | 枯山水 — raked gravel and rock groupings | 冬 winter | **文法** | nothing grows; pure structure, which is what grammar is |

**The bridge is in the north garden** and is crossed during that quarter's level-three walk, so it
is a thing you use rather than a thing you look at.

## The hall, and why it is the answer to L4

A single-storey 書院 with a 縁側 veranda running right round it and shoji on all four faces. Its
roof showing over the wall is the compound's landmark — there is no second storey and no stacked
roof, so it stays clear of the pagoda at JLPT.

And it solves level four for nothing: **the room you kneel in is the room that faces your garden.**
かな plays against moss and cherry, 漢字 against the pond and the bridge, 語彙 against maples, 文法
against raked gravel. Four different backdrops for the minigames out of one building, because the
building was always going to have four sides.

## Levels

| | what it is | the picks |
|---|---|---|
| L1 | the walled compound on high ground, the hall's roof over the wall, the gate off to one side | — |
| L2 | four path-heads ranked across the entrance court, each the mouth of the way round to its garden | **かな / 漢字 / 語彙 / 文法** |
| L3 | the stations along that garden's path, each named by a 駒札 | the blocks within the subject |
| L4 | the hall's room on that side — you step onto the veranda and kneel, and the garden is the view | — |

Level two keeps the arrangement step 1 measured and proved: a rank of four path-heads, with the
**gate deliberately off the axis**. See "What step 1 settled" — a roofed threshold standing between
the eye and the picks fails at some band of eye heights and cannot be made not to.

## Borrowed scenery

借景 still applies, but it borrows the mountains rather than the lake. The compound stands 210 units
above the valley floor with the water 7,500 away, so what the wall frames is the far ranges and the
wood below — which is the drier, older kind of 借景 anyway (Entsū-ji borrows Hiei, not a pond).

## The site — moved off the water entirely

The first site put the compound half in the lake (57% wet over a 389 fall) with its far wall
standing in open water. Asked for dry ground at REVIEW's travel distance, the sweep found **none
anywhere on the western arc at any distance** — 63% wet at the driest. So the whole circle was
swept once instead, and the world turned out to have a shape worth writing down:

| arc | ground at 4,600–5,800 |
|---|---|
| **−140° → +40°** — west and forward | **25–90% water.** The lake owns it. |
| **+80° → +170°** — east and south | **0% water**, falls 138–338. |

Every dry, unclaimed, out-of-menu bearing is in the east. The neighbours are READING 74, REVIEW 105,
DRILLS 143, RECORDS 196 (−164), and the only gap wide enough for a 2,800-unit compound is the one
between DRILLS and RECORDS.

**Settled: bearing 170, dist 6520, `stand` 1284** — a flight of **3,916**, which is REVIEW's exactly.

- **0% wet** over a 207 fall, and the lake does not come within 7,500 units.
- **Ground at −90 against the valley floor's −300**, so it stands 210 up. It is not merely away from
  the water, it is above it — which is the right ground for a walled compound and gives the wall
  something to frame.
- **170° is the longest turn in the world**, nearly straight behind the menu camera. For the section
  most people land on, that is the biggest journey there is.

> **Worth flagging for later: JLPT and RECORDS are also sited on water.** JLPT at −101 is 60–80% wet
> and RECORDS at −164 is 12–29%. Neither is built, and RECORDS wants a ridge so a slope may suit it,
> but a pagoda cannot stand in a lake. The six destinations were spread evenly round a circle before
> anyone knew where the land was; that spread needs revisiting before READING or DRILLS start.

## Order of work

**1. The site and the shot — DONE (twice).** First pass settled −54/4400 against a low walled
   garden on the shore; the site then moved off the water entirely, as above. What survived the move
   is everything about the *shot* rather than the place: the picks at the entrance, the offset gate,
   the flight arithmetic. See "What step 1 settled".

**2. The compound.** The wall, its coping, the offset gate, and the hall at the centre — the
   structure, before any of the four gardens are planted. One `mergeParts` geometry per element.

**3. The four gardens.** Their ground, planting and character — the pond and its bridge in the
   north, gravel and rock in the south, moss in the east, maples in the west. The paths are the ribbon
   mesh REVIEW's approach already uses — it cannot step or gap, and it carries its own colour.

**4. Level two.** The rank of path-heads, their lanterns and 駒札, the picks and their focus twins.

**5. Level three.** The stations along a quarter, and the 駒札 name-plaques. Reuses REVIEW's walk.

**6. The rooms.** The hall’s four rooms, each looking out on its own garden — the first L4
   interiors in the project, so they set the pattern for the other five places.

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

---

# What step 1 settled

Measured against a boxes stand-in before any of the garden was modelled. Two of the findings
changed the design rather than the numbers.

## The picks are at the entrance, not at the corners

The first stand-in put a 茶室 in each corner of a 1,700-square enclosure. The four measured **1,601
pixels apart** — the whole frame width — with the pond a dark slab between them, and it read as an
aerial photograph of a compound rather than a garden anyone was standing in. No stand-off fixes it:
pulling back far enough to gather four corners costs the flight, and a big enclosure seen whole is a
plan drawing either way.

That is the wrong shape for the interaction anyway. **In a stroll garden you do not survey four
quarters and choose one; you stand near the entrance and choose a way to go.** So level two is a
rank of four path-heads across the court — an opening in a hedge, its season's tree over it, a
lantern beside it and a 駒札 name-plaque on a post. The quarter is what level three walks into, and
the tea house at its end is level four.

## A roofed threshold on the sight line cannot be made to work

With the gate centred, the picks measured 4/4 visible at an eye of 200, **0/4 at 320**, 4/4 at 460
and 0/4 again at 1,400/460. The sight line passes *under* the gate roof from low down and *over* it
from high up, and between those is a band where the slab cuts exactly through the name-plaques.
Widening the opening does not fix it; raising the roof only moves the band. **Any roofed threshold
standing between the eye and level two has that failure somewhere in its range.**

Offsetting the gate removes the whole class of problem — and is what a Japanese garden does anyway.
Entrances are deliberately not axial: you turn to come in, so the garden is disclosed rather than
presented. With the gate at sd −450 the picks read **4/4 at every stand-off and every eye height
measured**.

## The flight is part of the shot

`dist − stand` is how far the camera actually travels, and the rest of the world runs 3,100 to
4,100. Three passes of tuning the pavilion's framing never looked at it and left STUDY on a journey
of **950** — arriving somewhere you were already standing.

That looked fatal for a garden, because the whole western arc is lake past about 6,000 and the far
shore does not return until 11,000+, at bearings inside the menu frame. But the premise was the
pavilion's: a building has to be stood BACK from to be seen whole. **A garden is entered.** Its
camera stops just inside the gate, the way the shrine's stops in its own court at 855.

| | STUDY | REVIEW | READING | DRILLS | JLPT | RECORDS |
|---|---|---|---|---|---|---|
| flight | **3550** | 3916 | 3100 | 4100 | 3500 | 3300 |

## The enclosure is deep rather than square

Two constraints pulling opposite ways, fixed by one number. Arriving has to put the camera *inside*
the garden — outside it, the near wall stands 500 units off the eye and fills the bottom third of
the frame, and the threshold you have supposedly just crossed is still in front of you. But an
interior camera is close to everything, and the picks were then 2,000 pixels apart.

So the garden runs **2,400 deep against 1,700 across**, the camera stands just inside the gate and
the picks sit 950 further on. Which is also simply what a stroll garden is: the circuit needs a
there and a back.

## The settled numbers

| | |
|---|---|
| bearing / dist | −54 / 4400 |
| `stand` / `eyeLift` | 1100 / 460 |
| focus | the rank of path-heads, 120 above the platform |
| enclosure | f −900 to +1500, sd ±850; wall 90 + 26 coping |
| gate | sd −450, 300 wide, 210 to the eaves |
| picks | f +250, sd −300 / −100 / +100 / +300 |
| pond | f +620 to +1340, half-width 620 |

Verified at six aspect ratios: **4/4 picks at every one**, spread 369–788px, plaques 65–139px.

## Open

- **The menu.** The garden's platform corner reaches ~60px into the 16:9 frame and ~380px at 21:9,
  both below the horizon at the extreme lower-left. Invisible at 16:9; at 21:9 it is a faint grey
  slab in the fog. Re-check once the wall has material and planting — it may simply stop reading, or
  the far wall may need pulling in.
- **The foreground is empty.** The bottom half of the arrival is bare platform. That is where the
  entrance court's gravel, stepping stones and 手水鉢 go, so it should fill itself — but if it does
  not, the eye comes down.
- **The site is 57% wet over a 389 fall** now the footprint is 2,400 deep. The far wall stands in
  the lake, which is the pond opening to it, but it is a large platform to build and skirt.
- **900×1000 portrait** gives 65px plaques. Smallest of any viewport; check once they carry text.

---

# What step 2 settled

The compound built as structure only — wall, coping, offset gate, platform and hall. Two of the
three findings are corrections to things stated as fact earlier.

## The flight is not `dist - stand`

**It is `|focus| - stand`.** The camera flies to `standOff(focus, stand)`, and every place rewrites
its own `focus` — STUDY’s sits on the rank of path-heads, 1,320 short of the nominal place. So a
`dist` of 5200 with a `stand` of 1284 gave a journey of **2,597**, not the 3,916 the arithmetic
suggested and not the number that had already been written down as settled. REVIEW is offset the
same way (5200 nominal, 4,345 by the naive sum, 3,916 in fact).

dist is now **6520**: 6520 − 1320 − 1284 = 3,916, measured from home in the running page rather than
computed on paper.

## The entrance court’s depth is fixed by the stand-off, not chosen

The flight length fixes the eye exactly `stand` short of the picks — wherever that falls. At a court
620 deep it fell **664 units outside the near wall**, and from out there the compound’s own plinth
(it stands 194 above the ground it is cut into) filled the lower third of the frame as a brown
cliff, with the wall a band across the middle: arriving *at* a place you are supposed to have
arrived *in*. The court is now 1400 — deeper than the 1,284 stand-off — so the arrival lands inside
it with the wall behind the eye. **Any enclosure that is entered has to be at least as deep as its
own stand-off before the wall.**

## Projection behind the camera is a wrong answer, not a small error

`project()` divides by w, and behind the eye w is negative, so a point comes back mirrored through
the origin and lands somewhere entirely plausible. It has now produced two confident wrong
conclusions here: a compound 170° behind the menu camera reported a **1,406-pixel-wide rect across
the type column**, and an enclosure the camera stood inside reported rects of tens of thousands of
pixels. `screenRect` now discards corners behind the eye, returns **null** when nothing is in front,
and flags `partial` when a box straddles the eye plane. A caller that gets null has its answer.

## The state

| | |
|---|---|
| bearing / dist | 170 / 6520 |
| `stand` / `eyeLift` | 1284 / 460 |
| flight | 3,916 — REVIEW’s to the unit |
| site | 0% wet, 194 fall, ground −104 against the valley’s −300, lake 7,500 away |
| compound | f −2720 to +1320, sd ±1410; wall 100 + 28 coping |
| court | 1400 deep, gate at sd −790 |
| hall | 940 × 760 body, 120 veranda, 230 eaves, ridge 724 |
| picks | f −1320, sd −420 / −140 / +140 / +420 |

Verified at six aspect ratios: **4/4 picks at every one**, spread 456–974px, plaques 65–139px, and
the compound correctly reported as behind the menu camera at all of them. REVIEW unchanged — twins
in frame at five aspects, hover at rest, walk and back tab, title safe at six sizes, no console
errors.

## Open

- **The north garden is invisible from the entrance**, since the hall stands between. Expected —
  it is what level three walks round to — but it means the pond and its bridge, the one element with
  a fixed place in the brief, never appear in the arrival shot. Worth deciding whether that matters.
- **The four gardens are bare coloured slabs.** Step 3.
- **The legacy CSS3D level two is still there**, four black tiles stepping across the hall.

---

# What step 3 settled

## The camera was measuring the wrong floor

"Barely passes over the wall" was exact, and the cause was not the eye height. `standOff` sets the
eye to `surfaceAt(camera) + eyeLift`, and **`surfaceAt` reads the natural terrain** — it knows
nothing about the platform a compound is built on. The camera lands inside the walls where the
floor is the platform, 350 units above the terrain, so:

- `eyeLift: 460` put the eye only **162 above the court** and **34 above the wall coping** —
  standing in a walled garden and peering over the top of it.
- Anything below `eyeLift` 300 put the eye **inside the platform block**, which is why the picks
  read 0/4 there and why lowering it looked impossible.

`eyeLift` is now **computed, not chosen**: study.js states `EYE_H` — how far the eye rides above the
court’s own floor — and back-solves the lift from the ground under the standing point. The wall came
down from 128 to 92 at the same time, because a 築地塀 is a garden wall meant to be seen over from
inside, not a rampart the camera has to clear.

**The same bug bit the harness.** `NAV.probe(...).w` returns terrain-relative points, so parking a
camera in a garden with it buried the camera under the compound’s own floor and every raycast came
back empty. Any place standing on made ground has two heights and they are not interchangeable.

## A pond is a hole in the ground

The first pass laid the water at y −46 and the garden floor at 0–8, so the floor ran over the top
of the pond: the water was buried and the arched bridge crossed dry grass. The north garden’s floor
is now built as four bands around the pond’s footprint. **Ground that a thing is set INTO has to
have the thing’s shape taken out of it** — laying one slab over another only works upward.

## Two things sized against the wrong reference

- **Rocks at 150 units are 5.5 metres.** Standing stones, not garden rocks. Halved.
- **13 rake ridges 22 deep read as a striped floor.** A raked line has to be a LINE at the distance
  it is seen from; 21 ridges at 14 deep and half the height.
- **Rails on one side make a bridge a ramp with a fence beside it.** Both sides now, with a
  handrail, because seven posts without one are seven posts.

## The four gardens

| face | garden | what carries it |
|---|---|---|
| 南 · 文法 | 枯山水 | 21 rake ridges, rock groupings in threes and twos, nothing growing |
| 東 · かな | 苔庭 | moss mounds (hemispheres, so the ground swells), cherries, 飛石 stepping stones |
| 西 · 語彙 | 紅葉 | five maples and fallen leaf litter — the busiest, because a vocabulary is a heap |
| 北 · 漢字 | 池庭 | the pond cut into the floor, the 反橋 as five segments on a parabola, irises, 雪見灯籠 |

Verified by standing the camera in each: every garden reports its own elements under the ray and
none reports another’s. Arrival holds 4/4 picks at six aspect ratios, plaques 65–138px, flight
3,916. REVIEW unchanged, no console errors.

## Open

- **The entrance court floor is bare.** It is the largest single area in the arrival shot and it is
  flat brown. Gravel, stepping stones and a 手水鉢 belong there — step 4.
- **The legacy CSS3D room still overlays everything**, including a large red panel at the left of
  the arrival. Step 4 replaces level two, which takes it with it.
- **The south garden is only glimpsed** from the entrance; the hall hides most of it. Correct for a
  walk-round plan, but it means the one garden facing the arrival is the one you see least of.
