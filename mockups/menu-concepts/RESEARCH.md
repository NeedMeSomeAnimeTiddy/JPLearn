# 3D spatial UI — library research (2026-08-01)

Goal: real 3D depth for the Persona-style menu — DOM-quality Japanese typography positioned
in 3D space, a moving camera for transitions, and a living WebGL background. Evaluated for
(a) these standalone mockups and (b) eventual integration into the Electron + React 19 app.

## Verdict

**Mockup stack (implemented in `01-sumi-3d.html`)**
- **three.js 0.185.1** — scene, camera, fog, particles. Monthly releases (r180 was Sep 2025),
  the de-facto WebGL standard.
- **CSS3DRenderer** (three.js addon) — puts real DOM elements into the three scene graph with
  the *same camera* as WebGL. Text stays vector-crisp at any depth; buttons stay real buttons
  (focus, hover, a11y). This is the key primitive for "3D spatial UI" without SDF-font pain.
- **GSAP 3.15.0** — camera choreography. Timelines tween a plain camera-state object
  (pos/target/fov/roll) that a rAF loop applies each frame. 100% free since v3.13 (Webflow
  acquired GreenSock, Apr 2025) — all formerly-paid plugins included.

Both vendored in `lib/` — no CDN, no build step.

**Production recommendation (React 19 app)**
- **@react-three/fiber v9** — React renderer for three.js; v9 pairs with React 19 (currently
  compatible through 19.2). Same architecture transfers: drei's `<Html>` = CSS3DRenderer's
  role (DOM in scene), plus instancing/postprocessing ecosystems.
- **@react-three/drei** — camera rigs, `<Html>`, instances, environment helpers (pmndrs, active).
- **GSAP** for the camera timelines (works fine inside R3F via useGSAP/refs), or R3F-native
  springs for simple moves.

## Rejected

| Library | Why not |
|---|---|
| Babylon.js | Full game engine; heavier than a menu needs, and no DOM-in-scene story as clean as CSS3DRenderer/drei `<Html>` |
| Motion (ex-Framer Motion) | Excellent React animation, but no scene graph / true camera — 3D is per-element transforms only |
| Theatre.js | Cinematic sequencer with an editor UI; powerful but niche cadence, overkill vs GSAP timelines |
| PixiJS | 2D-only (great filters, no z-space camera) |
| Zdog | Pseudo-3D toy renderer, effectively dormant |
| A-Frame | VR-first abstraction, wrong shape for desktop menu UI |
| Pure CSS 3D (`perspective` + `preserve-3d`) | What v1-style mockups can fake; no shared WebGL camera, no fog/particles, camera moves get unmanageable |

## Architecture notes (what `01-sumi-3d.html` does)

- Three render layers, one `PerspectiveCamera`:
  `WebGL back` (ink particles, wash-cloud sprites, ring/stain sprites, paper-colored fog) →
  `CSS3D` (menu shard planes, watermark kanji, ensō, ghost practice sheets, submenu plane) →
  `WebGL front` (paper motes, falling ink drops between camera and UI).
- Camera state lives in one plain object; GSAP timelines tween it; the rAF loop applies it,
  adds idle breathing + mouse parallax, then renders all three layers.
- Transition grammar (v3 — four selectable prototypes, `?t=1..4`, chips in the UI, key `T`):
  see "Transition craft" below. The v2 free-form spline flight was retired — it read as
  unnatural in real-time motion.

## Transition craft — why the spline failed, and the four grammars

**Post-mortem of the spline flight (v2).** Four compounding causes of "unnatural":
1. Hand-placed Catmull-Rom waypoints create *unmotivated curvature* — velocity direction
   changes that correspond to no cinematic intent. Real camera moves are built from a small
   vocabulary of primitives (dolly, pan, crane, orbit), not freehand paths.
2. Two chained eases on the same spline parameter had mismatched velocities at the junction
   (a visible hitch), and Catmull-Rom is not arc-length parameterized, so even a smooth ease
   produces uneven world-speed.
3. The look-at target moved along its own second spline — combined with positional curvature,
   angular velocity spiked unpredictably (whip-panning across nothing, unmasked).
4. Too many beats (recoil/punch/burst/card/smear/overshoot) inside 1.6s — and 1.6s itself is
   2–3× longer than motion-design guidance for context switches (~300–500ms, up to ~700ms
   when many objects stagger).

**Principles applied in v3** (film grammar + motion-design guidance):
- One primitive per shot; one thing moving at a time; the eye always knows its subject.
- Continuous acceleration: a single ease per parameter per shot, never chained mismatches.
- High angular velocity only when masked by blur (the whip-pan rule); cuts hidden on a flash
  or at peak smear, with matched movement direction and matched contrast either side.
- 650–900ms totals; arrivals ease out; punctuation (flash, burst, shake) ≤ 150ms.

**The four grammars** (each with a mirrored return):

| # | Name | Primitive | The cut | Feel |
|---|------|-----------|---------|------|
| T1 | 衝撃 CUT | Straight dolly-punch into the shard, settle-dolly out at the destination | Hard cut masked by flash + ink burst (editor's grammar; closest to actual Persona) | Violent, snappy (~0.9s) |
| T2 | 振向 WHIP | Pure rotation: whip-pan right, arrive panning the same direction | Hidden at peak blur (classic stitched whip-pan; title card streaks with the pan) | Energetic, film-like (~0.65s) |
| T3 | 障子 DOOR | Locked-target straight dolly THROUGH the shard; destination is placed on the same axis beyond it | None — the shard itself occludes the frame as you pass (object-as-wipe) | Seamless, spatial, Japanese (~1.05s) |
| T4 | 軸回 ORBIT | Constant-radius 90° arc around a fixed pivot; bank angle derived from angular velocity | None — fully continuous | Calm, furniture-like, byōbu fold (~1.05s) |

Notes: T3/T4 relocate the submenu cluster per-selection (on the dolly axis / on the orbit
chord) and re-park it on return; T4's sweep direction must arc *away* from the menu cluster
or the shards photobomb the arrival.

## v4 — user sift: WHIP + ORBIT survive (CUT/DOOR retired), plus atmosphere & mascot

Keyframing refinements that answered "smoothness":
- **Whip**: the two pan phases are now *velocity-matched at the stitch* — phase A `power2.in`
  exits at 1.5rad·2/0.30s = 10 rad/s, phase B `power3.out` enters at 1.1rad·3/0.33s = 10 rad/s.
  Handheld drift (small lateral position lead + 2.2° roll into the turn, counter-settle after),
  bold gold accent streaks, and the cut-in card gains a 140ms center-lock beat between its
  blurred entry and exit.
- **Orbit**: single `sine.inOut` (gentlest extremes), *analytic* bank = bell curve
  `sin(p·π)·6.5°` instead of per-frame velocity lerp (no jitter), radius leans in 4.5% mid-arc,
  height cranes over a +46 rise, and the look-target blends pivot→destination over the last
  quarter (no end snap).

Re-theme: 月夜 twilight — indigo night (#171c2c…#10131e), luminous washi shards (#f2ead8)
with ink type (figure/ground inverted from v1), 緋 vermillion #e34a33 + gold #cfa45c accents.
Fog color must track the new background.

Ambience added: three sumi-e mountain ridge planes (one with a pagoda silhouette), a breathing
moon, seven drifting "thought-kanji", two sliding mist bands, dark + pale ink-wash clouds,
gold ember particles rising among pale mist motes, and gold ink-drops that ring and stain.
Settled-menu ambient motion: every shard bobs/sways on its own phase, the watermark kanji
breathes, ensō rotates, mists slide, kanji drift.

Mascot: 折鶴 origami crane — ~14 hand-placed triangles in three gold tones + vermillion beak,
wings pivoted at the spine (flap rate and amplitude derive from speed: brisk when pushing,
glide when cruising). v5: it no longer follows the pointer — it wanders its own waypoints
(new anchor every 5–9.5s at varying depth), circles them with small living motion, and only
*avoids* the pointer when crowded (shy slip-aside). During the whip it takes a scripted dash
across frame against the pan. Because targets are camera-relative, it rides every transition.

## v5 — polish round (user notes)

- Moon: halo confined well inside a larger plane (no more clipped glow), repositioned fully
  into the home framing.
- Watermark kanji: crossfades (fade-out 160ms → swap → fade-in 400ms + a scale pulse routed
  through a multiplier so the ambient breathe and the pulse don't fight over `scale`).
- Menu buttons redesigned as layered collage: dark backing sheet offset behind each washi
  strip (offset grows on hover), tapered ribbon silhouettes, vermillion index tabs with JP
  text, a large ghost kanji filling each strip's right side, and a gold brush underline that
  draws on hover.
- Whip, visible upgrades: anticipation counter-turn before the pan (animation principle #2),
  torn "world-scrap" ghost streaks (blurred kanji + washi bars) smearing past at peak blur,
  the crane's scripted dash, a vermillion slash underlining the cut-in card during its
  center-lock, and the arrival band unfurling (translucent → full) with staggered header
  letters.
- Orbit, visible upgrades: gold petal burst from the chosen strip as the arc begins, the look
  now *leads into the turn* (driver's-eyes tangent offset that hands off to the destination),
  the moon flares as it wheels through frame, longer 1.05s arc with deeper 8° bank, and the
  same band/letters arrival assembly.

## v6 — orbit de-pendulumed; destination assembles; menu becomes type

- The v5 look-lead read as "turn → stop → turn back" (lead pushes the view ahead, the k-blend
  pulls it back — a pendulum). Fixed by deleting the lead/pivot-stare entirely: the look now
  lerps start→destination monotonically on the same sine ease as the 55° arc (was 77°).
  One continuous swing, nothing reverses.
- The destination no longer pre-exists: the submenu plane is opacity-0 through the flight and
  **assembles at ~82% of the arc** — red band wipes in from off-plane, its kanji pops, title
  letters stagger, desc slides, tiles unroll (base-delayed stagger), back chip pops last.
  Same assembly plays on whip arrivals.
- Menu redesign (creative-freedom round): boxes removed — **type IS the button** (Persona
  grammar). Two full variants built and compared: `?menu=a` diagonal cascade of giant italic
  words with red kanji tags (hover: word goes white on a red brush-slash swash, gold underline
  draws, stamp slams); `?menu=b` vertical kanji columns (standing-scroll look, EN rotated
  vertical). **A chosen as default** — unmistakably Persona, better scanability; B kept behind
  the param as the road not taken.

## v7 — reachability, tempo, the entrance bug, and the alcove

- **Entrance pile-up bug (since the first 3D build) root-caused and fixed**: the enter
  animation tweened `transform` on the CSS3D plane root; CSS animations beat the renderer's
  per-frame inline matrix, so items rendered flat at their DOM layout spot (overlapping,
  right-center) until `animationend`. The entrance now fades the root (opacity is safe) and
  slides an inner `.t-inner` wrapper. Rule reaffirmed: the renderer owns the root transform.
- **Menu layouts, round two**: `a` is now a tight jagged stack (all six words within
  ~19–72% of screen height — the bottom item is easily reachable); `b` columns kept; new
  `c` = 3×2 centered grid for ergonomic comparison. Stack remains default.
- **Orbit retuned**: 0.85s (was 1.0), sweep widened to ~72° so the camera genuinely travels,
  rest distance 990 (plane fully in frame — at 880 the band clipped off-screen).
- **Arrival tempo**: `openSub(pace)` — the whole assembly ritual (band → kanji → letters →
  desc → tiles → back chip) is gsap-driven and scaled by a pace factor: orbit uses 1.0
  (~2.4s calm ritual), whip uses 0.45 (snap). CSS-keyframe assembly removed.
- **Destination environment**: a `THREE.Group` alcove (backlit shoji lattice wall, two
  breathing lantern glows, tatami floor hint, ink pine overhang, 一期一会 tokonoma scroll)
  that `placeSub()` carries to wherever the submenu lands — arriving now means entering a
  different room in the same night.
- Gotcha: a stylesheet `transform` on an element you also tween with gsap `xPercent` (plus a
  `gsap.set` reset) can strand the transform channel at its start value while other channels
  finish — keep gsap-animated elements free of stylesheet transforms and tween px.

## v8 — the 360° world

The prop-group alcove was retired for a true surrounding environment:
- **Painted panorama cylinder** (canvas 4096×1024 → `CylinderGeometry` r3200, `BackSide`,
  `fog: false`): procedurally painted night sky, stars, seamless all-around far ridge
  (integer-period sines so the wrap has no seam), and four sectors by world azimuth —
  mountains behind the menu (−113°), bamboo grove (−52°, sweeps past mid-orbit), the lit
  engawa veranda (+8°, where transitions land), torii over still water (+130°, reserved for
  future menus). Azimuth→texture-u mapping: `u = (90° − az)/360`, verified correct on the
  first render.
- **Fixed world bearings**: `WORLD_PIVOT` (150,0,150), orbit radius 680; home camera sits at
  bearing 88°, the engawa rest at 8°. The submenu + alcove set-pieces (shoji wall, posts,
  lanterns, tatami, pine, scroll) are static world geometry at the engawa bearing — nothing
  follows the camera anymore. The orbit is now literally: swing ~80° around the world pivot
  while the look pans from the mountain sector to the veranda; whip pans to the same room.
  UI assembly starts at 88% of the swing (well into deceleration).
- Corner cleanup: brand rebuilt as one horizontal lockup (語 seal + JPLEARN + 日本語学習·月夜);
  floating kanji reduced to five and confined to a mid-depth band away from screen corners.
- Sector map for future menus: each new destination claims a bearing (torii sector is empty
  and waiting); `orbitSwing(azEnd, yEnd, endTgt, …)` already takes an arbitrary bearing.

## v9 — IA decisions (user-quizzed) and stage two

Button-corner rework (the actual v8 complaint): the red JP tag and floating stamp left the
word's corners — now a red tick opens the word, the JP reading sits beneath as a sub-caption
(gold on hover), and the stamp lands inline after the word like an artist's seal.

App IA studied (App.tsx views: home / script_hub / minigame / jlpt_prep / passage_hub /
daily_games; Overview is a CRT popup, not a view; Home is a hub with deck cassettes + tiles +
"Up next" recommendations). Four layout decisions re-made with the user (all recommendations
accepted):
1. **Up next** → Persona-style ticker on the main menu (cycling every ~5s, one click jumps to
   the target section). Implemented.
2. **STUDY** keeps the four-script split (Hiragana/Katakana/Kanji/Vocab) — matches the data
   model; block lists are the next menu level to build.
3. **REVIEW** is top-level with a red due-count badge worn inline on the menu word. Implemented.
4. **RECORDS** is a real destination at the **torii bearing** (AZ_TORII ≈ +130°): giant
   vermillion torii with a 記録 tablet, animated water shimmer plane, stone lantern. The
   popup-overview pattern retires. `destFor(i)` routes destinations: RECORDS orbits LEFT over
   the water, everything else orbits RIGHT to the engawa — the world has directional meaning.

## v10 — six destinations, the torii rebuilt, and level three

**1. Every section owns a bearing.** `DESTS[]` holds six anchors derived from azimuth
(`restAt`/`subAt` place camera-rest and panel positions on the orbit circle):

| Section | Bearing | Place | Trick |
|---|---|---|---|
| STUDY | +8° | engawa veranda | short swing right |
| REVIEW | +55° | karesansui rock garden | raked-circle floor = SRS cycles |
| READING | −52° | deep in the bamboo grove | long swing right |
| DRILLS | −175° | the dojo | near-half-turn left, taiko + nobori |
| JLPT | +88°, **y +620** | the summit | *same bearing as home but the camera climbs* — the exam is the mountain; arriving above a cloud sea from the identical compass heading |
| RECORDS | +130° | torii over water | swing left |

The JLPT trick matters: bearings alone would have crowded six sectors into 360°, so one
destination is stacked **vertically** over home instead of beside it. Panorama gained matching
painted sectors (summit + cloud sea, garden wall, dojo facade with maku curtain).

**2. Torii rebuilt with real depth**: three receding gates (1.0 / 0.64 / 0.42 scale, slight
yaw variance) form a tunnel; a blurred, masked, vertically-mirrored reflection under the near
gate; two stone lanterns flanking; two drifting toro lights animated on the water; shading
split per-post so the columns read round. Near gate rides at y+520 so its 記録 tablet clears
the RECORDS header.

**3. Level three — the block browser.** STUDY's four script tiles now drill into a third
level inside the same plane: L2 slides out left, L3 slides in from the right, the camera
dollies 44 units closer (deeper = physically nearer), and rows stagger in. Each row is a named
block with character count, a gold progress bar, and 済 for complete. Paged 6-at-a-time
(漢字 has 12 blocks over 2 pages). Content mirrors the real app's named blocks. `Esc` steps
L3 → L2 → world.

Gotchas this round: (a) the sub-plane's DOM is detached until the first CSS3D render, so
`document.getElementById` on its children returns null at module scope — query through the
plane element; (b) set-dressing on a sector's flank can leak into a *neighbouring* sector's
frustum (the dojo's east banner appeared at home) — the reliable fix is deletion, not nudging.

## v11 — distance-proportional camera, and third levels everywhere

**Camera timing fixed.** `orbitSwing` ran a fixed 0.9s for every destination, so READING's
140° sweep moved at ~156°/s while REVIEW's 33° hop crawled — and the 6.5° bank + 46-unit
mid-arc rise were applied at full strength even on tiny turns (the "weird angle"). Now:

```
travel = |sweep| + climb / 700          // 620 units of climb ≈ 1 radian of turn
dur    = clamp(0.62 + travel * 0.46, 0.8, 1.9)
turn   = clamp(|sweep| / 1.5, 0, 1)     // bank and hop scale with actual turning
```

Measured swing durations after the change: REVIEW 0.89s · RECORDS 0.96s · JLPT 1.09s ·
STUDY 1.26s · DRILLS 1.40s · READING 1.75s. Peak angular-velocity spread narrowed from
4.7:1 to 2.2:1. `openFrac` is now a *fraction* of the swing (0.82) rather than absolute
seconds, so arrival pacing holds at any distance. JLPT's bearing moved 1.5414 → 1.40 so the
ascent spirals slightly instead of reading as a pure elevator (still inside its painted
summit sector, which spans ~46°–130°).

**Third levels for READING / DRILLS / JLPT.** `BLOCKS` became `L3DATA[section][tile]`, so any
tile with data drills in; tiles that do get a `›` marker and a hover slide. Content:
READING → passage lists (title, level · length, % read); DRILLS → drill variants (best score,
mastery); JLPT → mock exams per level (attempts · best, readiness). Rows render uniformly
(name / meta / bar / value) with `済` for complete and `—` for untouched, `.fresh` dimming
untried rows. REVIEW and RECORDS tiles stay leaf nodes by design — one starts a session, the
other is a stat display.

Layout gotcha: the L3 row is a flex line inside a 2-column grid, so longer Japanese names and
metas wrapped to two lines. Fix is explicit flex roles — name `flex: 1 1 auto; min-width: 0`
with ellipsis, meta/bar/value all `flex: none`.

## v12 — quality pass (bugs, bilingual, depth)

**Bugs found and fixed**
- *Back button dead in READING and JLPT.* Not a pointer-events problem — genuine 3D occlusion.
  `elementFromPoint` over the chip returned `.plane-enso` (READING) and `.plane-cloud` (JLPT):
  the home scenery drifts into other bearings' sightlines, and one JLPT cloud sat at local
  **+z**, i.e. between camera and UI. Fixes: home dressing (ensō, watermark, sheets, stroke,
  floaters, mists) moved into a `homeScenery` group toggled by `Object3D.visible` partway
  through each transition (CSS3DRenderer honours `.visible`), and all JLPT clouds pushed to
  negative local z. Verified with real `mouse.click`, not just `Escape`.
- *Hover pop skipped when moving fast.* GSAP 3 does not overwrite by default, so rapid hovering
  stacked rival tweens on the same object and the "shrink back" one won. Added
  `overwrite: true` to the four `setActive` tweens.
- *REVIEW too snappy.* Its 33° sweep hit the duration floor; floor raised 0.8 → 1.15s
  (base 0.72).

**Bilingual pass** — a learner who cannot read Japanese could not use the UI. English now
leads everywhere, Japanese sits under it as flavour: menu descriptions, HUD chips
(`12 DAY STREAK 連続`, `LEVEL 7`, weekday abbreviations), keyboard hints (`Select 選択`),
up-next ticker, all L2 tile metadata, and — most importantly — **every L3 row carries an
English gloss** (`Numbers & time / 数と時`, `18 kanji`, `DONE`).

**Look**
- L3 redesigned: skewed slabs with big italic index numbers, English gloss over Japanese,
  per-section accent, `DONE` / `—` states. No longer a generic table.
- L2→L3 is now a vermillion brush wipe: tiles scatter, the brush sweeps the plane, the list is
  written underneath it, camera dollies in. Reverse on the way out.
- Per-section colour identity via a `--sec` custom property set in `buildSub`
  (STUDY gold, REVIEW vermillion, READING bamboo green, DRILLS crimson, JLPT steel blue,
  RECORDS vermillion-gold) driving band, tile meta, L3 accents and back-chip hover.
- Moon rebuilt: real disc with maria, rim ring, halo, and a drifting cloud band across its face.
- Dojo given a room instead of a wallpaper: back wall pushed to −1150 plus angled side walls,
  perspective floor, two ceiling beams and lamp glows at different depths.
- Torii rebuilt on a taller 1600×1800 gate whose pillars reach the water. All three gates now
  place their feet on the same waterline (`y = WATER_Y + (GATE_H/2) * scale`) so perspective
  alone lifts the distant ones toward the horizon — no more floating front gate.
- Crane keeps to the margins while a menu is open (it was flying across the content).

## v13 — one room at a time, six visual identities, and the signboard flip

**Destination isolation.** Every room is now an entry in `ENVS[]` and `showOnlyEnv(i)` keeps
exactly one visible — lit partway into the transition, dark again on the way home. Previously
the dojo's architecture (and others') hung in the main menu's frustum and ate the landscape.
The main menu now shows panorama + mountains + moon and nothing else.

**Six genuinely different level-two treatments.** `buildSub` stamps `data-sec` on the panel and
each section styles `.tile-face` from scratch — same markup, entirely different object:

| Section | Object | Entry |
|---|---|---|
| STUDY | 原稿用紙 manuscript sheets, red grid ruling | sheets rise |
| REVIEW | karuta cards, black borders, tilted, red pip | dealt in from the left with rotation |
| READING | book spines standing on a shelf plank | drop onto the shelf |
| DRILLS | arcade cabinets, marquee, CRT scanlines, coin slot | power-on brightness flicker |
| JLPT | official answer sheets, barcode, bubble grid | slide up askew |
| RECORDS | ema votive plaques hanging from cords | swing down and settle |

Bubble/pattern fields need masking out of the middle band or they eat the label
(`mask-image: linear-gradient(...)` on the deco layer). Vertical four-character labels need a
smaller size or they wrap to a second column.

**The flip.** Level two → three is no longer a 2D wipe: the panel is a physical signboard.
`.plane-sub` gets `transform-style: preserve-3d`, both faces get `backface-visibility: hidden`,
`.sub-l3` is pre-rotated `rotateY(180deg)`, and the transition rotates the **CSS3DObject's
quaternion** π about its local Y (`subBaseQ` captured in `placeSub`, multiplied by an
axis-angle each frame) while the camera arcs out to catch it edge-on and settles back square.
Reverse flip on the way out, arcing the opposite side.

**Level three redesigned as a printed poster.** Flat section-colour rail with the name in
tategaki, a 520px ghost glyph bled off the right edge, kicker chip, huge skewed title with a
colour drop-shadow, and rows that are pure typography — hairline rules, outsized outlined
numerals, English gloss over Japanese, and progress as five discrete blocks rather than a bar.
Hover floods the row with the section colour.

Framing note: panel distance went 990 → 1120 because the 1150-wide board overran the screen
edge and its rail slid under the brand lockup.

## v14 — hitboxes, composition, and the room-visibility experiment

**Back-button hitboxes — the real cause.** Not 3D occlusion this time: the screen-space
`.chrome` layer sits at `z-index: 5` above the CSS3D stage, and `.desc-line` (faded to
`opacity: 0` in a submenu, but still hit-testing) covered part of the chip. Fixed at the root
with `.chrome { pointer-events: none }` and re-enabling only `.chrome a, .chrome button`.
A second, subtler one: **a `backface-visibility: hidden` face still hit-tests in Chrome**, so
the level-three back button was catching clicks through the board. Both faces are now gated
explicitly with a `.at-l3` class toggling `pointer-events`.

**"Move the drills area / make the world bigger" — both tried.** Bearings were re-spaced so no
room sits near the home cone (DRILLS to 265°, "177° from home"), then rooms were left
permanently lit (`?envs=all`, kept in the file as a comparison switch). The dojo painted
straight through the middle of the menu anyway, which was read as proof that `CSS3DRenderer`
performs no frustum culling and that visibility switching is therefore unavoidable.

> **Superseded by v15 — that conclusion was wrong, and so was the 177°.** Both numbers compared
> *bearings around the pivot*, which say nothing about what the menu can see. Measured properly,
> DRILLS was 18° off the home view axis: not behind the camera at all, just parked in front of
> it. See v15 for the correct frame and what the re-run of the experiment actually showed.

**Composition, not skins.** The previous pass changed each tile's surface but every section
still laid out four equal tiles in a row. Now the *arrangement* differs per section — tiles
are absolutely positioned per `data-sec` with their own sizes, offsets and tilts:

| Section | Arrangement |
|---|---|
| STUDY | manuscript sheets strewn across a desk, overlapping at four different angles |
| REVIEW | a fanned hand of cards, rotated about a pivot below the panel |
| READING | books of four different heights and widths standing on a shelf plank |
| DRILLS | a row of cabinets, tallest at centre, outer pair angled inward, neon spill on the floor |
| JLPT | loose papers dropped on a desk, overlapping and askew |
| RECORDS | plaques hung from one rail on cords of four different lengths |

**Menu word colour.** `SECTION_ACCENT` moved above the item loop so each main-menu word sets
its own `--sec`; the brush slash, the tick and the due badge now wear the colour of the room
that word leads to.

## v15 — the frame the whole world hangs on

Two symptoms, one cause. DRILLS still faded in dead ahead of the menu, and the menu's landscape
had turned to soup — bamboo stalks and the dojo's white *maku* zigzag painted across the ridge.
Both came from measuring separation in the wrong frame in v14.

**The mistake.** Home *stands* at bearing 88° but *looks* across the pivot along −112°, so the
rooms it can see are the ones on the far side of the world. v14 compared each room's orbit
bearing against the camera's *standing* bearing and read DRILLS as "177° apart — antipodal".
The angle that matters is between `(room − eye)` and the view axis:

```
θ(az) = atan2(1800·sin az − 680, 1800·cos az − 20)      home axis = −112.5°
```

By that measure DRILLS was **18.4°** off-centre and READING **18.6°** — both inside a 63° cone.
They were not behind the camera; they were parked in front of it. The same error had moved
their painted panorama sectors on top of the menu's backdrop, which is the "mess".

**The rule.** θ must clear the axis by more than the horizontal half-cone (31.6° at 16:10) plus
the room's own ~13° half-width. That forbids `az ∈ [177°, 308°]` outright and leaves 226° of arc
for six rooms — placed at 316 / 356 / 30 / 66 / 116 / 168, worst clearance 56°. There is now a
startup guard that computes θ for every destination and `console.warn`s if one is too close,
because eyeballing bearings got this wrong twice.

**The panorama has the same budget problem.** A destination reads `az ± 25°` of the cylinder, so
a sector wants ~50°; six of those is 300° and the menu's own backdrop needs the strip
[206°, 281°] to itself. The six sectors now tile the other 260° at 34–52° apart with a few
degrees of overlap (which reads as one continuous world), stopping ~12° short of the menu strip
on both sides. Each sector's *density* scales with its width too — 30 bamboo stalks in a 44°
sector is a fence, not a grove.

**The all-rooms-lit experiment, re-run honestly.** With correct bearings it very nearly works:
the rooms themselves clear the cone and the menu is clean apart from one intruder, identified by
hit-testing the corner as `plane-rake` — REVIEW's karesansui gravel. It is not the room's
*position* that leaks but the *extent* of a large ground plane tilted toward the camera, and it
only shows at 16:9 where the cone widens. So `showOnlyEnv` stays, for a mundane reason rather
than a renderer limitation: room dressing is physically big. The cross-fade is genuinely
invisible now, because the room centres really are out of frame when it runs.

**Pacing regression, caught and fixed.** Moving DRILLS collapsed its orbit sweep from 177° to
28°, and `dur` was computed from the sweep alone — so the biggest *view* rotation in the game
(131°) got pinned to the 1.15s floor. Duration and bank now key off `max(|sweep|, viewTurn·0.75)`.
Settle times went from a 1.15s floor to a 1.36–2.04s spread; DRILLS 1.15 → 1.58s.

**The v14 hitbox fix had a hole.** `.chrome { pointer-events: none }` plus a blanket
`.chrome a, .chrome button { pointer-events: auto }` handed the pointer straight back to the
up-next ticker, which is faded to `opacity: 0` in a submenu but still hit-tests — it covered up
to 18 of 45 sample points on the back chip (REVIEW/READING/DRILLS). Opacity is a look, not a
state: menu-only chrome is now marked `.menu-only` and gated on `body.at-menu`. All six sections
now probe 45/45 with zero occlusion.

## v16 — level two rebuilt: six objects, no shared frame

Three rounds of "make the submenus unique" failed for one reason: every attempt redecorated a
**shared shell**. `.sub-band` (a colour rail down the left), `.sub-head` at a fixed offset, a
`.sub-grid` of four `.scroll-tile`s and a `.back-chip` were hard-coded into one template, and
per-section CSS only ever restyled or repositioned those same parts. v13 changed the tile
surfaces; v14 changed the tile *arrangement*. Both still read as one design, correctly, because
the frame never moved.

So the frame is gone. All 301 lines of it were deleted and level two is now six independent
renderers. The contract is deliberately tiny:

- root element `.l2` with the section's own class
- a `#backBtn` **somewhere** — position, shape and styling are the layout's business
- `data-tile="<jp>"` on anything that should open level three

`L2_LAYOUT[section]` returns the whole markup; `L2_INTRO[section]` runs its own entrance. They
do not agree on a header position, a colour rail, a tile, a grid, or even whether there are
tiles at all.

| Section | The object | Layout language |
|---|---|---|
| STUDY | 原稿用紙 manuscript sheet | full-bleed 82px ruled grid; glyphs written one per square, top-to-bottom, right-to-left; title in the margin; annotations run down the column feet |
| REVIEW | a ledger | one 320px hero count bleeding off the corner; four ruled rows weighed against the largest backlog; figures tally up on entry |
| READING | an open book | two leaves and a gutter; left page is real set text in tategaki; right page is a typeset contents list with leaders — no tiles at all |
| DRILLS | arcade character select | four skewed parallelogram panels butted edge to edge under a lit marquee; scanlines; LED plinth; a round arcade button for back |
| JLPT | 受験票 admission slip | hairline rules, crop marks, form fields, OMR bubble rows, monospace figures, and a red inspection stamp that slams down last |
| RECORDS | a data wall | a 30-day bar chart and a 26-week activity heatmap carry it; the four figures are readouts on a ruled column |

**On libraries.** The brief invited them. The only real candidate was a chart library for
RECORDS, and it was not worth it here: the mockup has no build step and vendors everything, and
these charts are art-directed against a fixed palette, which fights a chart library's defaults
more than it saves. ~40 lines of generated markup gives exact control, and GSAP (already
vendored) does the animation. No new dependency.

**The bug that cost the most: never use `gsap.from()` for an entrance.** `.from()` resolves its
END value from the element's live state. If the start state has already been written once —
which `immediateRender: true` does at creation — the end can resolve to the start, and the tween
animates 0→0 and strands there permanently. It bit twice: the cabinets stuck at `y: ±300`, and
the arcade back button stuck at `scale(0)`, which made it a 0×0 hit target and killed the back
control in DRILLS while `elementFromPoint` reported no occlusion at all. Every intro tween is
`fromTo` with explicit end values now.

Two smaller ones. A whitespace text node between the absolutely-positioned children and the
first cell opened a phantom 83px first row in the manuscript columns — `display: flex` on the
column discards anonymous whitespace children and fixed it. And `clearActive()` runs on arrival
at a *destination* as well as at the menu, so `.type-item.is-active` is not an at-menu signal;
tests must use `body.at-menu`.

## v17 — a bigger world, and level two dissolved into it

**The world got bigger, and that is what buys spacing.** Six rooms were crowding 34–52° apart
because the menu *stands* at 88° but *looks across* the pivot along −112°, so the whole far half
of the world is forbidden. Pushing the rooms out shrinks that dead zone, because as radius grows
the bearing `az` and the angle-from-the-eye `θ` converge. At the old room radius of 1800 the dead
zone was 131° wide, leaving 226° for six; at 3720 it is 113°, and they now sit at an even 44°.
The ceiling is about 54° — set by the frustum itself — so there was no point going further; past
here the world just gets emptier. `ORBIT_R` 680 → 2600, panorama cylinder 3200 → 6400 (height
5000, ratio held near the old 8:1 so the painted art keeps its proportions), fog 1400/4200 →
2600/9000, far plane 8000 → 18000.

The camera keeps its old close radius at home and now *dollies out* to the room radius on every
swing, which is why `orbitSwing` had to be given an explicit `rEnd` — previously home and the
destinations shared `ORBIT_R` and the return trip worked only by coincidence.

**Level two is no longer a screen.** It was a 1150×660 plane hanging in front of the room: a flat
rectangle that hid the very environment the transition had just travelled to. It is now
*furniture*. Each option is its own CSS3D plane parked inside the destination's own group, at its
own place and depth:

| Section | What the options are |
|---|---|
| STUDY | shoji panels set into the veranda wall, lit from the room behind, posts crossing in front |
| REVIEW | cedar stakes driven into the raked gravel, receding down the garden |
| READING | tanzaku strung between the bamboo, hanging at four different depths |
| DRILLS | wooden fuda nailed to the dojo wall, the taiko behind them |
| JLPT | carved stone markers up the mountain path, each higher and further than the last |
| RECORDS | ema plaques hung on the rack in front of the torii, over the water |

The section name hangs in the room as a banner and "back" is a stepping stone on the ground, so
no part of the menu is screen-space furniture any more. Entrances animate the **CSS3DObject's
world position** rather than any DOM transform — the plane root's transform belongs to
CSS3DRenderer and `.w-in`'s belongs to the hover transition, so animating either fights
something; moving the object is also simply more truthful for a thing in a room.

Level three lost its signboard flip along with the board it flipped, and is now a **kakemono**:
it drops from above the frame and unrolls down its own length while the room's own objects step
back 260 units and dim to 16%, so you can still see where you are standing.

**Placement has to be done against the cone, not on a flat grid.** At standoff D the half-width
available at depth z is `0.614·(D − z)` and the half-height `0.384·(D − z)`, so a near object has
far less room than a far one. Laying all six out on one flat grid pushed the outer items off both
edges of the frame. Standoff also went 1120 → 1400, since the frame now has to hold objects
either side of centre as well as the level-three scroll.

**A splice destroyed three functions.** Replacing the intro block by line range removed
`cutCard`, `spawnGhostStreaks` and `spawnPetals` along with it, and the file is untracked, so
there was no git history to recover from — they had to be rewritten from their call sites and
surviving CSS. Splice by *located content*, never by a line range computed from a scan, and get
this file under version control.

## v18 — level two finally stops being rectangles

Four rounds of "make them unique" all failed the same way, and the diagnosis is worth stating
plainly: **the atom never changed.** Every version was a vertical rectangle containing a centred
Japanese word, a small English label and a meta line, repeated four times in an evenly spaced
row. Changing the material (paper → card → book → cabinet → shoji → stone → wood), the
arrangement (grid → fan → shelf → receding diagonal) and even the rendering context (flat panel →
real objects in a 3D room) left that atom untouched. Cutting a notch in the top of the rectangle
to make it a fuda is the same design wearing a hat. Worse, v17's "realistic props in a room" is
actively *anti*-Persona — the reference is not a tasteful diorama, it is graphic design that
assaults the frame.

So the rules were written down first and the layouts built to them:

- **nothing is upright or evenly spaced.** Every run is a diagonal cascade, each item skewed, each
  at a different scale (`at` rows carry a per-item scale, 0.7 → 1.15).
- **type IS the graphic.** The word is 60–212px and its label is 12px *in the same item*. Scale
  contrast inside one element was completely absent before.
- **elements bleed past their own plane bounds.** Ghost outline numerals hang off the corners;
  overflow is left visible on purpose.
- **selection is an event for every item, not one.** The pick slams forward and brightens
  (`.is-hot`) while the other three flatten, desaturate and skew away (`.is-cold`). Previously
  hover was `translateY(-18px) scale(1.045)` — a web card.
- **nothing rests.** Settled items keep drifting and canting, driven from `tick` on the
  `Object3D` so it can never collide with the hover transform.

| Section | Treatment |
|---|---|
| STUDY | torn black shards with the word knocked out, hard colour offset, cascading down the veranda wall |
| REVIEW | vermillion slashes cutting across the garden, count set huge against a vertical label |
| READING | naked tategaki at poster scale — no container at all, just type and a colour rule in the bamboo |
| DRILLS | impact shards, the Latin word swung hard on the diagonal with the JP demoted to a caption |
| JLPT | stencilled N5→N2 numerals climbing the path, *growing* toward the peak |
| RECORDS | the figure is the hero at 158px, the label a footnote |

**The rooms had to move out of the way.** Level two now occupies a depth band that room geometry
was sitting in: the garden wall (−430 → −1050) cut the far slashes in half, and the torii gates
(−430/−1120/−1760 → −1680/−2500/−3300) put posts straight through the figures. Depth sorting does
not reliably save type from a large intersecting CSS3D plane, so RECORDS also flanks the gate two
figures a side rather than running a diagonal through it. And the home mountain ridges are 4600
units wide — in the enlarged world their far edge reached into REVIEW and covered its back tab;
they belong to `homeScenery` and are now switched off on leaving the menu.

Next build steps: the React port (R3F + drei + GSAP), or a fourth level (individual cards
inside a block).
- Per-frame depth dressing: distance → opacity/blur on menu planes (fog for DOM).

## Gotchas learned (worth keeping)

- `three.module.min.js` (r167+) imports a sibling `three.core.min.js` — vendor both.
- CSS3DRenderer **owns** each plane element's `transform` (rewritten every frame). Never
  CSS-animate the plane root; animate inner children, or tween the `CSS3DObject` itself.
- Playwright's `hover()`/`click()` wait for element stability — a breathing camera means
  nothing is ever stable. Use `dispatchEvent('mouseenter'/'click')` in tests.
- CSS3D planes are double-sided by default — a fly-through element (like the title card) shows
  mirrored from behind after the camera crosses it. `backface-visibility: hidden` on the plane
  root fixes it.
- A `filter` on the CSS3D container flattens its `preserve-3d` rendering — apply motion-blur
  filters to the WebGL canvases only, never to the CSS3D stage.
- Per-frame depth dressing (inline opacity) fights any tween of the same property — gate it
  with a class (`is-consumed`) that tells the dresser to leave the element alone.
- **Visibility is an angle from the eye, never a bearing around the pivot.** An orbiting camera
  that looks *across* its pivot sees the far side of the world, so "antipodal" and "out of
  frame" are opposites. Measure `angle((target − eye), viewAxis)`; anything else will read
  dead-ahead geometry as maximally distant.
- `getBoundingClientRect()` on a CSS3D plane behind the camera returns a full-viewport box, so
  it cannot be used to test whether a plane is on screen. Hit-test sample points instead
  (inject `#cssStage div { pointer-events: auto }` first).
- Opacity is a look, not a state — a faded element still hit-tests, and so does a
  `backface-visibility: hidden` face. Gate `pointer-events` on a state class, never on tag name.
- Pace a camera move by how far the *view* rotates, not how far the camera travels; with a
  moving look-target the two are uncorrelated.
- **Never use `gsap.from()` for an entrance — use `fromTo` with explicit end values.** `.from()`
  reads its end value off the live element, so once the start state has been written the end can
  resolve to the start and the tween strands at the "from" pose forever. Function-based values
  and repeated calls both trigger it.
- A stranded `scale(0)` leaves the layout box intact but the *client rect* at 0×0, so a button
  can be fully "present" and un-occluded yet impossible to click. Check rect size, not just
  `elementFromPoint`.
- Whitespace between an element's children is a real text node: next to absolutely-positioned
  siblings it can open a phantom row. `display: flex` on the parent discards it.
- `clearActive()` fires on arrival at a destination too, so `.type-item.is-active` never means
  "at the menu". Use the `body.at-menu` state class.
- Skinning a shared template cannot make things look different — if six screens must read as six
  designs, the *frame* has to go, not just its paint.
- A flat plane in front of a 3D room hides the room. If the environment is the point, the menu
  has to be objects *in* it at different depths, not a panel parked between it and the lens.
- Place 3D UI against the cone it is seen through: usable half-width at depth z is
  `0.614·(D − z)`. A layout that works at the origin will run off both edges when its near items
  are brought forward.
- Animate a CSS3D item by moving its `Object3D`, not its DOM. The plane root's transform is
  rewritten every frame by the renderer, and any inner transform is usually owned by a CSS
  hover transition.
- Never splice a file by a line range derived from a scan — locate the exact boundary content and
  splice between those. A range that drifts silently eats neighbouring functions, and an
  untracked file has no undo.

## Sources

- three.js releases: https://github.com/mrdoob/three.js/releases (r180 tag, Sep 2025)
- GSAP free announcement: https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/ and https://webflow.com/blog/gsap-becomes-free
- GSAP package: https://www.npmjs.com/package/gsap (3.15.0 installed)
- R3F ↔ React 19 pairing: https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide and https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/CHANGELOG.md
- drei React 19 discussion: https://github.com/pmndrs/drei/discussions/2213
