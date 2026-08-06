# The six places

The design each destination is being built to. Rewritten 2026-08-06 from the 2026-08-03 plan,
keeping the reasoning and dropping the siting: which area of the .blend a place occupies, its
centroid and its Blender→three.js coordinate conversion were all settled long ago and now live in
the model and in `DEST_SPECS`, where they can be read instead of remembered.

## The two tests

Applied to every candidate, and the reason the first costume table was thrown out — it had three
stacked-roof timber buildings in it (a 楼閣 for STUDY, a 五重塔 for RECORDS, a 本殿 for REVIEW),
which at any distance read as one idea repeated. "A different section" has to be a thing you can
see.

1. **Distinct** — differs in **material**, **silhouette** and **relationship to the ground**, not
   merely in what it is called.
2. **Buildable** — has somewhere for all four levels to happen, **including L4**.

Test 2 is the one that kills good-looking ideas. A theme with no interior has nowhere to put the
actual practice.

## The level stack

Every place is four deep, not three.

| | what it is | REVIEW's version |
|---|---|---|
| **L1** | the landmark, seen from the menu or on approach | the torii and the shrine precinct |
| **L2** | four picks — subjects, decks, genres | the ema wall's four tablets |
| **L3** | the blocks within one pick — a walk past placards | the torii tunnel |
| **L4** | **a room the minigame plays in** | not built anywhere yet |

## The table

| | form | material | silhouette | light |
|---|---|---|---|---|
| **学習 STUDY** | 方丈と四方の庭 — a hall with four gardens | timber, moss, gravel, maple | low, walled, horizontal | dawn |
| **復習 REVIEW** | 神社 — shrine precinct and torii tunnel | vermilion timber | gate on a long axis | dawn |
| **読解 READING** | 蔵 — storehouses on a lane | white plaster, black tile | blocky, windowless row | dawn, shadowed |
| **特訓 DRILLS** | 祭 — festival ground and 櫓 | raw lattice, rope, paper | open tower, radial plan | night, lantern gold |
| **検定 JLPT** | 五重塔 — the pagoda | dark timber | stacked cone | dawn |
| **記録 RECORDS** | 観月台 — the moon deck on the ridge | pale timber, white sand | a deck over nothing | moon |

Six materials, six silhouettes, six relationships to the ground — and only one stacked roof left in
the world, at the one place where the stack *means* something.

## How a place gets built now

This changed on 2026-08-06 and is the reason the next place should be cheaper than the last two.

A place is a module in `places/` exporting one `build*(ctx)` function. It does **not** reach into
the page. It:

- **imports** its geometry and texture helpers from `places/toolkit.js` — `mergeParts`,
  `outlineGeom`, `toriiGeo`, `beamSeg`, the tree geometries, the noise stack, `hash01`, the canvas
  texture makers. Anything depending only on THREE and a canvas lives there.
- **receives** the page in `ctx` — the scene, the look state, `groundAt`, `destPlace`, `standOff`,
  `blockAdd`, `treeClaim`, `worldPickEl`, `addOutline`, `outlineMaterial`, `instanced`, and the
  one `spec` it is sited by. REVIEW takes 18 names, STUDY 14. Adding to that list is a decision
  somebody makes on purpose.
- **returns** what it registers, rather than writing into globals:

```js
return {
  probe,      // PROBE[key]  — the approach coordinate function
  focus,      // DEST_SPECS[idx].focus
  eyeLift,    // DEST_SPECS[idx].eyeLift
  marks,      // merged into MARKS — every named part, for NAV.hit
  walk,       // WORLD_L3[key] — the L3 walk
  title,      // WORLD_TITLE[key] — the name-board
  l2,         // WORLD_L2[key] — the four picks
  ambient, noReflect,
};
```

`installPlace(key, idx, result)` in the page puts it away. That object **is the interface**: if a
place needs to announce something there is no key for, that is a deliberate addition, not another
line reaching into a global.

The reason for `ctx` at all: the core lives in an inline `<script type="module">`, and an inline
module can import from a file but cannot be imported *from*. That constraint is permanent. What is
not permanent is applying it to helpers that never needed the page.

## Where each place stands

| | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| **REVIEW** | built | built — ema wall | built — torii tunnel | — |
| **STUDY** | structure only — wall, gate, platform, hall; gardens are bare ground | registered | — | — |
| **READING** | — | placeholder tiles only | — | — |
| **DRILLS** | — | placeholder tiles only | — | — |
| **JLPT** | — | placeholder tiles only | — | — |
| **RECORDS** | — | placeholder tiles only | — | — |

The four unbuilt places exist today as a row in `ITEMS`, four labels in `SUBTILES`, a colour triple
in `SECTION_ACCENT` and a bearing in `DEST_SPECS`. About a dozen lines each, all of it data.

## Each place, level by level

### 学習 STUDY — 方丈と四方の庭, the hall and its four gardens

One hall in the middle, four gardens round it. The precedent is exact: 東福寺方丈 in Kyoto has four
gardens, one on each face of a single hall, each in a different style — the only such arrangement
in Japan. It gives L2 four picks that are genuinely different **objects** rather than four labels on
the same one, and it gives L4 its room for nothing, because the room you kneel in is the room that
faces your garden.

> Superseded: the 2026-08-03 plan had STUDY as a 回遊式庭園 stroll garden. That was reversed two
> days later and the hall restored. Ignore the stroll garden; `places/study.js` is the hall.

- **L1** — a low earthen wall (築地塀) with tile coping, a modest offset roofed gate, the hall's
  roof and a few tree crowns showing over the wall. Borrowed scenery (借景) does the rest — the
  wall frames the lake and the far ranges as part of the composition, which is a real technique and
  earns a landmark without building one.
- **L2** — four gardens on four faces, mapped season → subject:

  | | face | garden | season | subject |
  |---|---|---|---|---|
  | 東 | east | 苔庭 moss and cherry | 春 | **かな** — the beginning, first things |
  | 北 | north | 池庭 the pond and its 反橋 | 夏 | **漢字** — the deep work, the heaviest green |
  | 西 | west | 紅葉 the maple grove | 秋 | **語彙** — accumulation, the harvest |
  | 南 | south | 枯山水 raked gravel and rock | 冬 | **文法** — bare branches; winter is when structure shows |

- **L3** — stations along that garden's path, each named by a 駒札 (the wooden name-plaque Japanese
  gardens actually use) and marked by a lantern. Reuses REVIEW's walk wholesale.
- **L4** — the 茶室 or 東屋 at each station. You kneel inside and the minigame plays on the mat.

Vocabulary to build from: 反橋 arched bridge, 飛石 stepping stones, 雪見灯籠, 手水鉢, 鹿威し, koi,
moss, a central pond with an island.

### 復習 REVIEW — 神社, the shrine precinct — BUILT

L1 the precinct and torii, L2 the ema wall's four tablets, L3 the torii tunnel walk. **L4 has no
home yet** — the 本殿 at the tunnel's end is the obvious candidate and is currently scenery.

### 読解 READING — 蔵, the storehouses

A repository *is* a storehouse, and kura are the visual opposite of shrine architecture: thick white
plaster, black tile, tiny barred windows, heavy iron-clad doors. The shrine is open frames and
voids; the kura is solid mass.

- **L1** — three or four kura along a lane, white against a dark wood.
- **L2** — pick a storehouse. Placeholder tiles today: 短文 / 物語 / 記事 / 随筆.
- **L3** — the shelf-run inside it.
- **L4** — a reading room off the shelves.

### 特訓 DRILLS — 祭, the festival ground

The best L4 in the set, because **festival stalls already are minigames**: 射的 cork-gun shooting,
金魚すくい goldfish scooping, 型抜き, 輪投げ. The mechanic exists in the culture and needs only
dressing.

- **L1** — a 櫓: an open square lattice tower with a taiko drum on top, ropes of paper lanterns
  radiating to poles around it. The only warm-lit place in the world, the only open lattice against
  everything else's mass, the only radial plan against everything else's axis.
- **L2** — four drill types. Placeholder tiles today: 聞き取り / 書き取り / 速読 / 対戦.
- **L3** — the row of stalls running out under one rope of lanterns.
- **L4** — the stall game itself.

### 検定 JLPT — 五重塔, the pagoda

Five storeys, five levels, N5 on the ground and N1 at the top. It earns the one remaining stacked
roof in the world by *meaning* the thing rather than decorating with it.

- **L1** — the pagoda on its ridge.
- **L2** — the five levels. **This is the one place with five picks, not four, and that is correct.**
  Note the placeholder tiles contradict it — they are the four exam sections (文字語彙 / 文法 /
  読解 / 聴解). One of the two has to give when this is built; the plan says the storeys win, since
  five picks is the whole reason the form was chosen.
- **L3** — the sections within a level, climbing storey to storey.
- **L4** — the chamber at that storey.

### 記録 RECORDS — 観月台, the moon deck

A timber platform cantilevered off the ridge over nothing, with a raked white sand cone beside it.
**The only place above the world**, and the only one whose content is the rest of it.

- **L1** — the deck on the skyline.
- **L2** — **the other five places, seen below.** You look down at the shrine and it tells you how
  many reviews you have cleared; at the pagoda, which levels you have passed; at the garden, cards
  learned. The picks are the world rather than a row of tiles, which no other place can do.
  (Placeholder tiles today are a conventional row — 連続記録 / 正答率 / 学習時間 / 級位 — and are a
  stand-in for this, not a design.)
- **L3** — the history within one place.
- **L4** — none. This is the one section that reports rather than practises.

Chosen for contemplation over a beacon station and a chain climb, even though the form aims at the
sky and the purpose aims at the ground. Worth watching: if the deck reads as facing away from the
valley, the sand cone and the rail can be re-set to face down it.

## Considered and turned down

Recorded so the same ground is not walked twice.

- **棚田 rice terraces, 竹林 bamboo grove, 茶室と露地 tea house and path** — for STUDY. Read as
  landscape association rather than as structure.
- **合掌造り thatched farmhouses, 舟屋 boat houses, 城の石垣 castle ramparts, 回廊 cloister** — for
  STUDY. Vernacular architecture: building types rather than recognisable things.
- **鯉のぼり carp streamers, 大仏 the great Buddha, 松島 pine islets, 能舞台 noh stage** — for STUDY.
  Striking, and all fail test 2: nowhere to sit down.
- **宿場町 post town, 屋形船 moored fleet, 藩校 domain school** — for STUDY. All nest four deep, but
  the post town collides with READING's lane, the fleet is under-scaled for the biggest section, and
  the school is the timber compound the re-plan set out to remove.
- **街道と一里塚 the old highway, 石庭 the dry garden, 石仏の列 rows of jizō, 稲架 drying racks,
  古墳 the ancient mound, 鐘楼 the bell** — for RECORDS.
- **A neon tower district** — the original DRILLS. A different world, not a different place in it.

## One lesson worth keeping from the siting

The area each place occupies was decided by reading **what is actually modelled** in each part of
the file rather than by matching collection names, and that reversed two calls. READING was going
to sit in the bamboo grove until the props were counted: the grove's writing is 卒塔婆, ema racks
and omikuji — sacred, vertical, classical — while the lane has ten signboards, seven vending
machines and a street of shopfronts. 読解 practice is everyday written Japanese, and a town lane is
made of it.

**An area's props are a better statement of what it is for than its name.** The same applies to the
seven cameras in the file: only two of them agree with the architecture, because they were framed
before the mapping was settled. A 櫓 is unambiguously the drill ground; a camera called
`Camera_Drills` pointed at the shrine is a label.

## Open before building

- **L4 exists nowhere.** REVIEW is three levels deep and has been the template for everything; the
  first L4 built will set that pattern the way `review.js` set the place pattern. Worth doing at
  REVIEW, where L1–L3 already work, rather than discovering it inside a new place.
- **JLPT's five picks against L2's four** — see above.
- **RECORDS' L2 is not a tile row** and cannot be built from the same helper as the others.
- **STUDY's shot** — `stand` and `eyeLift` were measured against a tall pavilion that no longer
  exists. A hall behind a low wall is horizontal and wants a higher eye to read its ground plan.
