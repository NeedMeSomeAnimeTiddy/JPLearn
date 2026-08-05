# The six places

Agreed 2026-08-03, replacing the costume table the destinations were first authored with.

## Why it was re-planned

The first table had **three stacked-roof timber buildings in it** — STUDY's 楼閣 pavilion, RECORDS'
五重塔 pagoda, and REVIEW's 本殿 — plus a torii at REVIEW and another standing in the water off the
menu. At any distance those read as one idea repeated, and "a different section" is not a thing you
can see. It also carried a neon tower district for DRILLS, which is not a different place in this
world so much as a different world.

Two tests were applied. A place is distinct if it differs in **material**, **silhouette** and
**relationship to the ground** — not merely in what it is called. And it is buildable if it has
somewhere for all four levels to happen, **including L4**.

## The level stack

The thing the first plan under-weighted. Every place is four deep, not three:

| | what it is | REVIEW's version (built) |
|---|---|---|
| **L1** | the landmark, seen from the menu or on approach | the torii and the shrine precinct |
| **L2** | four picks — the subjects, decks, genres | the ema wall's four tablets |
| **L3** | the blocks within one pick — a walk past placards | the torii tunnel |
| **L4** | **a room the minigame plays in** | not built |

L4 is the expensive one and it is the one that decides whether a costume works at all: a theme with
no interior has nowhere to put the actual practice. This is why several otherwise good forms were
turned down — carp streamers, a colossal Buddha, pine islets and a beacon station are all striking
and all have nowhere to sit down.

## The table

| | form | material | silhouette | light |
|---|---|---|---|---|
| **学習 STUDY** | 回遊式庭園 — the stroll garden | water, stone, moss, maple | low, walled, horizontal | dawn |
| **復習 REVIEW** | 神社 — shrine precinct and torii tunnel — **built** | vermilion timber | gate on a long axis | dawn |
| **読解 READING** | 蔵 — storehouses on a lane | white plaster, black tile | blocky, windowless row | dawn, shadowed |
| **特訓 DRILLS** | 祭 — festival ground and 櫓 | raw lattice, rope, paper | open tower, radial plan | night, lantern gold |
| **検定 JLPT** | 五重塔 — the pagoda | dark timber | stacked cone | dawn |
| **記録 RECORDS** | 観月台 — the moon deck on the ridge | pale timber, white sand | a deck over nothing | moon |

Six materials, six silhouettes, six relationships to the ground — and only one stacked roof left in
the world, at the one place where the stack *means* something.

## The sites — settled 2026-08-05 against the built world

`models/environment.blend` is 20,695 objects across thirteen areas, and the mapping below was
settled by reading what is actually modelled in each rather than by matching collection names.
Two earlier calls were reversed on the evidence, and the reasons matter more than the outcome.

| | area in the .blend | ground | what decided it |
|---|---|---|---|
| **学習 STUDY** | `Zen` | −257 | `Hojo_001` — the 方丈 itself — plus `Sanmon`, `Teahouse`, `HallMonks`, tsukubai, moss, momiji, 95 stems of bamboo |
| **復習 REVIEW** | `Torii` | **+149** | `Honden`, six `Hokora`, two `Chozuya` — a full shrine precinct on the highest built ground |
| **読解 READING** | `Onsen` | −560 | **`Signboard` ×10**, `Vending` ×7, `GasLamp` ×40, a lane of inns and shops |
| **特訓 DRILLS** | `Festival` | −250 | `Yagura` — the drum tower — with `Yatai` stalls, `ChochinPole`, `MaskWall`, goldfish tanks |
| **検定 JLPT** | `Pagoda` | +76 | `Pagoda5_001`, `Hondo`, `Sanmon`, `Shoro` |
| **記録 RECORDS** | *not built* — north ridge ~(−4000, 14000) | **+1717** | the only ground in the map from which every other place is visible |

Held back, deliberately: **`Garden`** (teahouse, two azumaya, drum and zigzag bridges, 65 moss,
30 azalea, 9 sakura, four 雪見灯籠) is the best-appointed area in the file and has **no text in it
at all**, which makes it a poor destination and a strong candidate for a seventh. **`Onsen`'s**
former role and **`Meadow`** (58 objects) are scenery and a waypoint.

### The two reversals, and what caused them

**READING was going to be Zen, and moved to Onsen.** Zen's bamboo grove is beautiful and the first
instinct was to put reading in it. But the props say otherwise: Zen's writing is `Sotoba`, `EmaRack`
and `OmikujiRack` — sacred, vertical, classical — while Onsen has ten signboards, seven vending
machines and a street of shopfronts. 読解 practice is everyday written Japanese, and a town lane is
made of it. **An area's props are a better statement of what it is for than its name.**

**STUDY was going to be the Garden, and moved back to Zen.** That was a consequence rather than a
decision: moving READING out of Zen freed the `Hojo`, which restores 方丈と四方の庭 and means the
619 lines already written in `places/study.js` — hall, four gardens on four faces, the seasonal
subject mapping — keep their intent instead of being rewritten against a stroll garden.

### What the cameras say, and why they were not followed

The file carries seven named cameras. Only **two** agree with the architecture: `Camera_JLPT` aims
at the Pagoda (18° off) and `Camera_Study` is nearest Zen. The rest are crossed — `Camera_Drills`
aims at the shrine (5°), `Camera_Review` at the garden (6°), `Camera_Records` at the onsen (7°).
They are "look at this area" framings placed before the mapping was settled, and they are useful for
**testing fly-ins** rather than as final positions. A `Yagura` is unambiguously the drill ground;
a camera name is a label.

### Coordinates, for wiring

Blender is Z-up and glTF is Y-up, so `(x, y, z)` becomes `(x, z, −y)`:

| place | Blender centroid | three.js |
|---|---|---|
| STUDY / Zen | 2390, 8228, −257 | `2390, -257, -8228` |
| REVIEW / Torii | 11165, 656, 149 | `11165, 149, -656` |
| READING / Onsen | −6738, 4446, −560 | `-6738, -560, -4446` |
| DRILLS / Festival | 2285, −3287, −250 | `2285, -250, 3287` |
| JLPT / Pagoda | −2127, −4532, 76 | `-2127, 76, 4532` |
| RECORDS / ridge | −4000, 14000, 1717 | `-4000, 1717, -14000` |
| *(held)* Garden | −3871, −1353, −474 | `-3871, -474, 1353` |

## Each place, level by level

### 学習 STUDY — 回遊式庭園, the stroll garden

The one Japanese form that was **designed as a sequence of framed scenes you walk between**. L3 is
not something imposed on it; it is what a stroll garden is for. Katsura and Kenrokuen are the
references. It is also not a building, which is what the pavilion kept failing on.

- **L1** — a low earthen wall (築地塀) with tile coping on the lake shore, one roof and a few tree
  crowns showing over it, a modest roofed gate. Borrowed scenery (借景) does the rest: the wall
  frames the lake and the far ranges as part of the composition, which is a real technique and
  means the garden gets a landmark for free without building one.
- **L2** — **four quarters, one per season**, mapped to the subjects:
  - 春 spring, cherry — **かな** (the beginning, first things)
  - 夏 summer, iris and open water — **漢字** (the deep work, the heaviest green)
  - 秋 autumn, maple — **語彙** (accumulation, the harvest)
  - 冬 winter, pine under 雪吊り rope cones — **文法** (bare branches; winter is when structure shows)
- **L3** — the stations along that quarter's path, each named by a 駒札 (the wooden name-plaque
  Japanese gardens actually use) and marked by a lantern. Reuses REVIEW's walk wholesale.
- **L4** — the 茶室 or 東屋 at each station. You kneel inside it and the minigame plays on the mat.

Vocabulary to build from: 反橋 arched bridge, 飛石 stepping stones, 雪見灯籠, 手水鉢, 鹿威し, koi,
moss, a central pond with an island.

### 復習 REVIEW — 神社, the shrine precinct — BUILT

Unchanged. L2 is the ema wall's four tablets, L3 the torii tunnel walk. **L4 has no home yet** — the
本殿 at the tunnel's end is the obvious candidate and is currently scenery.

### 読解 READING — 蔵, the storehouses

A repository *is* a storehouse, and kura are the visual opposite of shrine architecture: thick white
plaster, black tile, tiny barred windows, heavy iron-clad doors. The shrine is open frames and
voids; the kura is solid mass.

- **L1** — three or four kura along a lane, white against a dark wood.
- **L2** — pick a storehouse.
- **L3** — the shelf-run inside it.
- **L4** — a reading room off the shelves.

### 特訓 DRILLS — 祭, the festival ground

The best L4 in the set, because **festival stalls already are minigames**: 射的 cork-gun shooting,
金魚すくい goldfish scooping, 型抜き, 輪投げ. The mechanic exists in the culture and needs only to be
dressed.

- **L1** — a 櫓: an open square lattice tower with a taiko drum on top, ropes of paper lanterns
  radiating out to poles around it. The only warm-lit place in the world, the only open lattice
  against everything else's mass, and the only radial plan against everything else's axis.
- **L2** — four drill types (open: speed / listening / writing / recall).
- **L3** — the row of stalls running out under one rope of lanterns.
- **L4** — the stall game itself.

### 検定 JLPT — 五重塔, the pagoda

Five storeys, five levels, N5 on the ground and N1 at the top. It earns the one remaining stacked
roof in the world by *meaning* the thing rather than decorating with it.

- **L1** — the pagoda on its ridge.
- **L2** — the five levels (this is the one place with five picks, not four, and that is correct).
- **L3** — the sections within a level, climbing storey to storey.
- **L4** — the chamber at that storey.

### 記録 RECORDS — 観月台, the moon deck

A timber platform cantilevered off the ridge over nothing, with a raked white sand cone beside it.
**The only place that is above the world**, and the only one whose content is the rest of it.

- **L1** — the deck on the skyline.
- **L2** — **the other five places, seen below.** You look down at the shrine and it tells you how
  many reviews you have cleared; at the pagoda, which levels you have passed; at the garden, cards
  learned. The picks are the world rather than a row of tiles, which no other place can do.
- **L3** — the history within one place.
- **L4** — none. This is the one section that reports rather than practises.

The form was chosen for contemplation over the alternatives (a beacon station, a chain climb) even
though it aims at the sky and the place's purpose aims at the ground. Worth watching: if the deck
reads as facing away from the valley, the sand cone and the rail can be re-set to face down it.

## Considered and turned down

Recorded so the same ground is not walked twice.

- **棚田 rice terraces, 竹林 bamboo grove, 茶室と露地 tea house and path** — proposed for STUDY. Read
  as landscape association rather than as structure.
- **合掌造り thatched farmhouses, 舟屋 boat houses, 城の石垣 castle ramparts, 回廊 cloister** —
  proposed for STUDY. Vernacular architecture: building types rather than recognisable things.
- **鯉のぼり carp streamers, 大仏 the great Buddha, 松島 pine islets, 能舞台 noh stage** — proposed
  for STUDY. Striking, and all of them fail on L4: nowhere to sit down.
- **宿場町 post town, 屋形船 moored fleet, 藩校 domain school** — proposed for STUDY. All nest four
  deep; the post town collides with READING's lane, the fleet is under-scaled for the biggest
  section, and the school is the timber compound the re-plan set out to remove.
- **街道と一里塚 the old highway, 石庭 the dry garden, 石仏の列 rows of jizō, 稲架 drying racks,
  古墳 the ancient mound, 鐘楼 the bell** — proposed for RECORDS.
- **A neon tower district** — the original DRILLS. A different world, not a different place in it.

## What this costs

- **STUDY's pavilion is dead.** `places/study.js` currently holds a nine-box stand-in massing for a
  1,040-tall three-storey 楼閣. It goes.
- **Step 0's site work mostly survives.** The instruments (`NAV.site`, `NAV.tryStand`, `NAV.probe`'s
  ground read, `NAV.hit`'s naming) are costume-independent, and the shore profile at bearing −52 is
  a fact about the terrain. See `PLAN-study.md`.
- **The shot does not survive.** `stand` 3200 / `eyeLift` 460 frames a tall building. A garden is
  low and horizontal and wants a different eye entirely — probably higher, to read the ground plan.
- **The menu-frame constraint relaxes.** It was the pavilion's 1,240-unit width that forced the
  bearing from −37 to −52. A walled garden with no tall silhouette may not need that, so the bearing
  is worth re-measuring rather than inheriting.
