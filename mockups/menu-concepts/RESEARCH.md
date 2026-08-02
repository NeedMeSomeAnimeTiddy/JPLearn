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

## v19 — spines, dead clicks, and the vanishing menu

**READING is bound books now.** Cloth spines with foil bands top and bottom, four different
heights, each leaning its own way, feet on a common receding line. `at` rows gained an optional
roll and height so a row of spines reads as separate books rather than one object repeated — the
per-item variation is the whole tell.

**The two rearmost options in every section were unclickable, and the cause is worth knowing:**
`CSS3DObject`'s constructor writes `style.pointerEvents = 'auto'` **inline** on every element it
wraps. An inline declaration beats any selector, so the existing `#cssStage * { pointer-events:
none }` never applied to a single 3D plane — all the scenery was hit-testable, and the enormous
ghost watermark sitting dead centre was swallowing whole options (READING and JLPT items 3 and 4
scored 0/24 and 4/24 on a hit-test grid). Fixed with `decorPlane()`, called from the three plane
factories, which switches decoration off per object. It has to run *after* construction — setting
it first just gets overwritten by the constructor.

**The menu was dissolving before it left the screen.** `depthDress` fades and blurs menu items by
camera distance to give the settled menu depth. Since v17 the camera dollies 1900 units outward on
every transition, which drove every item to minimum opacity and maximum blur within a few frames.
It is a *resting* effect, so it now returns early unless `state === 'menu'` — the menu holds its
look and the camera simply carries it out of frame. The backdrop had the same problem from the
other direction: `homeScenery.visible = false` fired on a fixed 0.4s timer, well before the
camera had turned away. It is now camera-driven — `homeIsOffScreen()` compares the view axis
against the direction to what the menu is composed around, using the real horizontal half-cone,
and the dressing drops the frame it actually clears (with a 1.6s fallback).

## v20 — the scenery is real geometry (first pass)

The six rooms moved out of the DOM and into WebGL: procedural meshes in `backScene`, lit, with a
real depth buffer. The interface stays in CSS3D on the layer above, which makes "the world never
occludes the UI" a property of the architecture rather than something to fight — and that is how
the reference behaves anyway.

Room-local axes are unchanged (group parked at `d.sub`, looking at `d.rest`, +z toward the
viewer), so all the placement knowledge carried over. Lights are parented to their own room:
three.js skips invisible subtrees when gathering lights, so only the room you are standing in
contributes any and the shader's light count stays constant.

Two things caught me out, both about **scale**:

- **Real geometry needs real distance.** Dropping meshes at the depths the CSS cut-outs used made
  the shoji wall into wallpaper again — worse than before, because a flat plane at least implied
  distance through its art. It has to sit far enough back, and be *bounded*, that the veranda
  floor reads below it and the head beam above it. Sizing against the cone (half-width
  `0.614·(D − z)`) matters more here than it did for the DOM version.
- **Point lights fall off with the square of the distance, and this world is thousands of units
  across.** Anything more than a room's width from the lamp goes black — the torii, 3000 units
  out, simply vanished. Point lights are for close pools of lantern light only; a room that needs
  lifting wants a directional, which does not attenuate.

Where it stands: READING (real bamboo receding), JLPT (cloud sea and lit peaks), DRILLS (a timber
hall with beams and a taiko) and STUDY (a bounded shoji wall over veranda boards) all read better
than the cut-outs did. REVIEW's raked gravel and set stones are still too dark to read, and
RECORDS' gates need more light on them — both are lighting passes, not structural.

**And then the rooms stopped unloading.** Every `showOnlyEnv` mechanism in this file — the
visibility switching, the cross-fade, the pop it caused, the whole forbidden-bearing analysis —
existed for one reason: CSS3D has neither frustum culling nor a depth buffer, so a room that was
merely *elsewhere* would paint through the menu. Real meshes have both. So the six rooms are now
simply left standing and the world is a single continuous landscape the camera moves around
inside. Distance and fog do the work that visibility switching used to: from the menu the other
rooms are far-off silhouettes sunk into the night, which is what a place looks like, and arriving
somewhere no longer involves anything appearing — the torii is already there as you come round to
it. `flat()` had to become fog-aware for this (a lit paper screen three thousand units away must
recede like everything else) and fog moved out to 3400/12000 so nothing in the room you occupy is
dulled.

Only the CSS3D interface still switches, because that layer still has no culling — which is the
honest statement of where the two-layer split earns its keep.

Next build steps: the React port (R3F + drei + GSAP), or a fourth level (individual cards
inside a block).
- Per-frame depth dressing: distance → opacity/blur on menu planes (fog for DOM).

## v21 — the shading lab (`lab-shading.html`)

The dawn valley was scrapped because it looked bad and I could not say why. The lab is the
answer to that: one hill, one tree, three rocks, and every technique on a key so its
contribution is *shown* rather than asserted. Keys 1–5 toggle baked vertex AO, slope/height
ramp colour, toon ramp + outline, the shadow map, and drifting cloud shadows; 0 and 9 are all
off / all on. `window.LAB` pins the orbit (`freeze`), pins the camera anywhere
(`view = [eye…, at…]`) and exposes the scene, because a lab you cannot screenshot under
controlled conditions is a worse lab.

What the lab actually settled:

- **Terrain takes smooth shading; toon is for objects.** A 4-step ramp across a large curved
  surface quantises into contour blotches. The same ramp reads correctly on the tree and the
  rocks. So terrain gets ramp colour + baked AO + shadows, and never a gradient map.
- **Key-to-fill ratio is the whole game.** Raising the hemisphere to 1.9 to stop shadows going
  black quietly broke everything downstream: with fill nearly matching key, direct sunlight
  became a minority of the terrain's light, so cast shadows *and* cloud shadows moved the final
  pixel by about 1%. It reads as "the shadows are weak" but the shadows were fine. The way out
  is not trading one against the other but a **third light** — a directional bounce from the
  opposite side casting nothing, which lifts shadowed surfaces while still shaping them. Key
  3.2 / bounce 0.95 / hemisphere 0.7. Peak cloud contrast went from 17/255 to 131/255 on that
  change alone.
- **Size the shadow box, then count its texels.** The hard black wedge across the hill was the
  shadow camera's own frustum edge — a 3600-unit box cannot hold a 3000-unit terrain once the
  light is at 47°, because the terrain projects much longer than itself along the light. Half
  the diagonal plus the height shift gives the real number (~2470 here, so 2600). Every unit
  past that is resolution thrown away.
- **The shadow blur must be smaller than what it shadows.** At 2048 over a 6400-unit box a
  texel is 3.1 units, so `shadow.radius = 7` is a ±22-unit PCF kernel — wider than a 54-unit
  rock. Every small object sampled its own far side and went fully black, which looks exactly
  like "the rocks are unlit" rather than like a shadow bug.
- **`PCFSoftShadowMap` is deprecated in this three build** and silently falls back to
  `PCFShadowMap`, so the code was describing behaviour that wasn't running.
- Outlines need **screen-constant width**: a fixed world-space extrusion is about a pixel at
  landscape range. Extrude by `normal * (w * -mv.z)` in the vertex shader.

Cloud shadows are the cheapest large-scale variation available and the only thing that breaks
up the plain diagonal terminator a single directional light always gives a smooth landform.
Tileable fBm on a canvas, sampled per-fragment from world position, multiplying **direct light
only** so shaded ground falls to the cold fill rather than just going grey. The lookup is
projected along the light onto y = 0 (`P.xz − P.y · L.xz/L.y`) so the cover stays put on a
hillside instead of sliding up the slope. (It dims the bounce light too, which is not physical
— a cloud only occludes the sun — but it reads well and costs nothing to leave.)

## v22 — the lab's terrain, ported into the mockup

`01-sumi-3d.html` now carries the lab's stack: ACES tone mapping, real shadows, a dominant key
with a non-casting directional bounce, slope/height ramp colour, baked concavity AO, coherent
mottle and drifting cloud shadows. The terrain was one flat hex value on a flat-shaded plane
before, which is exactly why the near ground read as a sheet of dark green.

Things that only showed up at landscape scale:

- **The sky and the sunrise sprites have to opt out of tone mapping.** They are painted art that
  is already the colour it should end up; ACES only washes the dawn gradient out. One sweep over
  the finished scene sets `toneMapped = false` on every basic/sprite material and turns cloud
  shadows and shadow casting on for everything else — done as a sweep rather than at each
  construction site so nothing gets forgotten.
- **Vertex colour and vertex AO can only vary as fast as the mesh does.** At 150 segments over
  70,000 units a quad is 466 units, and no amount of ramp detail survives that. 340 segments
  (206-unit quads) is the floor for the mottle reading as grain instead of as bands, and the
  cost is a one-off bake, not per frame — page load is unchanged at ~880 ms.
- **Do not flatten the whole heightfield near the camera.** The old `h *= smoothstep(d, 1400,
  9000)` bought a calm foreground at the price of a mirror-flat one. Splitting it — flatten the
  long wavelengths, leave two short ones (2400 and 890 units) at full strength — keeps the
  composition quiet while giving the ground something to catch light on.
- **Cloud blobs have to be smaller than the thing you want them to vary.** At a 4,000-unit blob
  the entire near meadow sat inside one and the effect read as a uniform dimmer.

**The hard straight seam across the foreground was never the terrain.** It survived swapping the
vertex colours out, turning shadows off, and changing the fog, and the baked colours along a row
of vertices were provably smooth. A raycast through pixels either side of it found the answer in
one shot: above the line the first hit was a *valley fog bank*, below it the ground. Those banks
are ellipsoids scaled ×2.3 in world x — one placed 3,400 units out with a 3,400 radius reaches
7,800, back past the eye — and their tops sat above eye height, so the camera was inside one and
looking out through it. They are now held at arm's length and kept below the eye, which is what
valley fog looks like from a slope anyway.

## v23 — the valley rebuilt, and type contrast measured

**Type contrast, measured rather than guessed.** With the type hidden and the shade left up, the
background luminance behind each item gives the contrast directly. The result contradicted the
eye: the weak pair were **STUDY and REVIEW at 2.14 and 1.89**, sitting against the brightest part
of the dawn sky — not the items over the bright meadow, which were already at 8.3–8.9. An
edge-anchored gradient barely reached the top of the stack, so the main shade is now an ellipse
centred on the stack itself, and the type carries a soft dark halo behind its hard offset shadow
(the offset shadow is the Persona look and only guards one edge). STUDY went to 4.09, REVIEW to
3.48, and after the valley rebuild the whole stack holds 3.5–5.3 worst-case.

**Everything in the valley is rebuilt.** The pattern throughout: landform takes smooth
vertex-coloured shading, objects take a toon ramp and an inverted-hull outline.

- **Nothing is placed at a flat `GROUND_Y` any more.** `groundAt(x, z)` samples the heightfield,
  and every tree, rock, tuft and river control point sits on it. This is most of why the old
  valley read as objects arranged on a board — the terrain rolled and the props did not.
- **A repeated primitive is wallpaper.** Three species, each a merged multi-part model (trunk
  plus stacked skirts, or trunk plus a bundle of canopy masses), instanced with an outline twin
  that shares its instance matrices so the two can never drift apart. Merging also matters for
  the outline: as separate meshes it would wrap each piece rather than the tree.
- **Outlines need a distance policy.** Screen-constant width out to 4,000 units and then frozen,
  so a far tree sheds its line instead of turning into a black lozenge; and the line itself takes
  the fog, because an unfogged outline stays jet black against a dissolving mountain and reads as
  a crack in the image.
- **Fuji's snow is vertex colour on one shell.** Two shells broke it three times over —
  z-fighting at 13,500 away, the rock ending up wider than the cap, the cap flaring past the rock.
  A snowline cannot fight geometry it is part of. The summit also had to get *broader*: at
  exponent 1.7 with a 1.6% summit radius the top tapered to a nipple; the real mountain is a
  600 m crater on a 40 km base and its flanks are less concave than the instinct to draw a
  "volcano" suggests.
- **Ridges are merged clusters, coloured by height** — forested skirt, bare rock, snow only high
  up, with a ragged line between each. As separate cones the shoulders showed their silhouettes
  through one another and the cluster read as a pile of triangles.
- **Ground cover has to grow in patches.** Evenly scattered detail reads as a printed pattern no
  matter how much its size varies — three passes of tuning size and count all came out as a
  sprinkle of identical lozenges. Gating placement on a coarse field, with grass and scrub taking
  opposite sides of the same threshold so they interlock, did more than any of them.
- **The near field needs its own scatter.** A distribution weighted across 900–9,000 units puts
  almost nothing in the first thousand, because that band is a rounding error of the area — so
  the ground directly under the camera, a third of the frame, came out bare.

## v24 — the scatter was never random

**`(i * 9301 + seed * 49297) % 233280` is linear in `i`.** Consecutive instances step by exactly
9301/233280 and wrap, so the values land on a regular lattice; using two of them as distance and
side put every tree, every bush and every stone on a diagonal grid. Every complaint about the
scatter looking "not like nature at all" was correct and none of it was fixable by tuning counts
or sizes, because nothing about it was random in the first place. Replaced with a multiply-shift
hash, salted differently per axis. Rotation gets its own salt too — reusing the size value for it
meant every tree of a given height faced the same way, which the eye reads as order even when the
positions do not.

**Props were standing inside mountains** because everything is placed from the heightfield while
the ranges, Fuji and the river are separate meshes sitting on top of it. Each now registers a
footprint. The first attempt used a flat exclusion circle and deleted most of the wood: a
1,900-unit-wide hill only 800 tall carved a 3,000-unit hole. A blocker is stored as a cone and
the test asks for the *surface height* at that point, so a prop at the foot of a slope survives
and only one near the axis is culled.

That still was not enough, because the ranges had been placed at 5,200–8,900 — inside the band
the trees scatter across. Seven overlapping footprints plus Fuji's claimed more of that band than
existed. **A range is a backdrop; it belongs behind the thing it is a backdrop to.** Moved out to
10,500–20,000 and the wood came back.

**Measure with a percentile, not a maximum.** Tuning the type shade against the single brightest
pixel in each item's box was chasing noise — the camera breathes, so `max` is dominated by
whichever canopy highlight drifted into frame that run, and two consecutive runs disagreed by
more than the change I was trying to measure. A 95th percentile is stable to ±0.02 and every item
now sits at 4.2–10.7 against the cream.

## v25 — the lake, and mist that is weather rather than an object

**The river floated 285 units above the ground, and the cause is a one-liner.**
`TubeGeometry(...); geo.scale(1, 0.05, 1)` scales about the geometry's ORIGIN, not about the
curve it was built around. The control points sat near y = −300, so flattening the tube
multiplied that by 0.05 and lifted the whole river to y ≈ −15. It looked like a ribbon because
it *was* the right shape — it was simply in the wrong place, and an earlier version had been
hiding it with a compensating `river.position.y` that did not survive the rebuild. It is now a
strip of quads built directly from ground samples, sitting in a channel cut into the heightfield
itself. Verified by raycasting the terrain under nine points along its length: 5–21 units of
clearance, and the nearest tree instance is 942 units away.

**The lake is cut into the terrain, not laid on it.** Both it and the river are authored in
sight-line coordinates — two dot products against the AXIS/SIDE pair, which matters because the
AO bake calls `landAt` two million times and a distance-to-polyline test there would have cost
minutes. Because the water is part of the heightfield, every prop gets the shoreline for free:
`blocked()` gained one line testing the waterline, and the lake, the river bed and the shallows
cleared themselves of trees, tufts and stones without any of them knowing water exists.

**The reflection is real.** The scene is rendered again from the camera mirrored about the water
plane, clipped to everything above it, and sampled in screen space through a texture matrix.
Two things needed care: 768² rather than 512², because at 512 a reflected trunk is under two
pixels wide and the ripple smeared them into scribbles — *the distortion has to stay smaller
than the features it distorts* — and the ground cover is hidden during the pass, because
thousands of 15-unit tufts contribute nothing to a rippled reflection of the far shore.

**Valley mist is atmosphere, not geometry.** Flattened ellipsoids gave a lid to look down on and
a rim to see under. Sprites fixed the geometry problem and created a worse one: 260 large
alpha-blended quads cost four times the entire rest of the frame. The answer was to stop making
mist out of objects. It is now the analytic integral of an exponential height-density field
along the view ray, injected into every lit material's fragment shader — thick along the valley
floor, thin as you look up out of it, pooling in whatever is low, with no surface to see the
underside of and no draw calls at all.

**Tune fog against the arithmetic.** With the camera 426 units above the water the base density
is `amt·exp(−426/H)`, and a horizontal look across the valley gives `1 − exp(−base·dist)`. The
first guess came out 81% opaque at 8,000 units and swallowed the reflection; solving for 30%
gave the value directly.

## v26 — the coast, the outline's reach, and one sun

**Build a branch from its base, not its middle.** A rotated cylinder placed by its centre puts
its inner end wherever the trigonometry lands it — seven units clear of the trunk, in the
sakura's case, so the branches hung in the air beside it. Translating the cylinder so its base
sits at the origin *before* rotating means the base stays put at any angle and can be dropped on
the trunk axis, where it is guaranteed to be buried in the wood. The blossom then goes on the
tip each branch actually reached rather than on a hand-typed coordinate that has to be
re-guessed whenever an angle changes.

**Sample a coastline off the shore, not off the nominal radius.** The lake's edge wobbles ±29%
with bearing. Taking the planting ring at 1.0–1.34 × the *nominal* radius while testing against
the *wobbled* shoreline meant whole bearings had their entire band on the wrong side: where the
shore bulged, every sample was still in the water; where it pulled in, every sample was a third
of a radius inland. The lake came out planted on one side only.

Two more things had to change before the coast planted evenly:

- **A bank.** Without one the valley's own relief dips below the water level in places outside
  the basin, so stretches of "coast" were land that merely happened to be lower than the lake.
  Low ground near the shore is now lifted toward the waterline without touching ground already
  higher, so the lake sits in a bowl.
- **Water culls, not low ground.** A global "below the waterline" test looked equivalent to a
  water test and was not: the terrain drops below the lake's level in plenty of places nowhere
  near it, and those were being cleared of trees for no reason.

**Outlines needed a distance policy per class of object.** The extrusion stops growing past
4,000 units, so beyond that it is effectively a fixed world width — and the tree value of 0.0016
comes to six units, sub-pixel on something 13,500 away. Fuji, the ranges and the rim get roughly
three times that, which is what puts a line on them at all.

**One sun, two consumers.** The key light and the visible disc had been placed independently and
disagreed. The disc sat 3,800 units from Fuji's axis on a mountain 6,000 wide — inside the
silhouette — so all you ever saw was a glow leaking round the flank. Both are now derived from a
single `SUN_AT`, 4,600 clear of the axis at 11° of elevation, and the shading agrees with where
the sun visibly is.

**A mirrored camera breaks height fog.** The reflection pass renders from a camera below the
water — 446 units under the mist reference plane — and `exp(+446/380)` put the base density at
3.2×, so the reflected world dissolved and left only the outline hulls. Reflections looked like
skeletons of the trees above them. Clamping the camera's height to the mist plane fixes it.

## v27 — the camera stops orbiting a pivot (stage A of the destination rebuild)

The model the brief always described, and never had: **the camera stands on the lake shore and
stays there; choosing a section turns it to face a place and flies it toward that place.** The
old one put the camera on a 680-unit circle around a world pivot and slid it to a 2,600-unit
one, which had two consequences worth naming. A "destination" was a *bearing*, so there was
nothing at it — arrivals framed whatever the arc happened to leave in shot, which is why every
section opened on the same anonymous meadow. And the arrival framing could not be authored,
because it was a by-product of the sweep.

A destination is now a point in the landscape, authored in the same sight-line frame as the
lake and the river: a bearing off the home axis and a distance out. Where the ground is at that
point is looked up rather than assumed. The camera's standing point is derived — on the line
from home, 1,500 short of the place, at the same height above the ground that home rides at.

- **Interpolate the look direction as yaw and pitch, not by lerping the target through space.**
  Lerping a point gives non-constant angular velocity — fast through the middle of a wide turn,
  slow at its ends — and the eye reads angular velocity. The old swing had a hand-tuned discount
  (`viewTurn * 0.75`) to compensate for exactly this; rotating at a constant rate needs no such
  correction and the fudge factor went with it.
- **Yaw and flight overlap.** The turn leads and finishes at 62% of the move; the flight starts
  at 18% and runs to the end. Sequenced rather than overlapped, it reads as two shots.
- **The bank belongs to the turn, not to the move.** Peaking it halfway through the whole
  journey means a long flight after a short turn heels over at nothing.
- **Over water, the surface is the ground.** `groundAt` returns the lake BED, 330 units down, so
  a place authored over the lake went under the waterline and the camera was sent to stand on
  the bottom — it arrived nine units above the surface, skimming it. Anything positional that
  can fall over water needs `max(ground, waterline)`.

WHIP needed no change beyond being handed the new end points: it always took an explicit
position and target, and a whip-pan is a yaw, which is what this model is made of.

## v28 — the first place: 鳥居 (stage B)

REVIEW now has somewhere to be. The gate stands in open water off the far shore, vermillion
against a scene that is otherwise entirely muted — it is the only saturated thing in the frame
and it does the work a focal point should. From the menu it reads as a silhouette with its own
reflection; arriving, the camera comes to rest in front of it and you look *through* it at Fuji.

- **The six places moved out of the interaction layer and into the landscape.** A destination is
  a landscape feature, not a navigation parameter, and putting it with the lake means it takes
  the world's treatment for free: cloud shadows, shadow casting, and a footprint the coast
  planting already knows to avoid. Only the camera's standing point stayed behind, because that
  genuinely is a fact about navigation.
- **Scale against the trees, not against Fuji.** The world is not at one scale — the mountain is
  compressed to 3,500 units for 3,776 metres while a cedar is near enough life-size. A torii
  sized off Fuji comes out the height of a fence post. At 620 it stands about two-thirds of the
  cedars behind it, which is roughly Itsukushima's proportion.
- **The place marker is where the camera LOOKS, not where the object's feet go.** REVIEW's marker
  sits 270 above the water because that is a good thing to aim at; a gate built from it would
  have its footings 270 units in the air.
- The curved top beam (kasagi) is the whole difference between a torii and two posts and a
  lintel. Five straight segments along a shallow parabola are enough — at this size the facets
  read as the traditional stepped ends, and a swept surface would cost far more.

**What the arrival proves about stage C.** The level-two cards are vermillion DOM panels, so
against a vermillion gate they merge into it *and* draw straight over its posts — both the
colour clash and the occlusion. World-geometry tablets in pale wood fix both at once, which is
the next stage.

## v29 — level two moves into the world: 絵馬 (stage C)

REVIEW's four options are votive tablets on a rack standing in the water in front of the gate.
They are meshes, so the gate can pass in front of them, they take the same light and mist as
everything else, and they hang in the same reflection. The arrival that ended stage B made the
case on its own: vermillion DOM panels against a vermillion torii merged into it *and* drew
straight over its posts, because the CSS3D layer is architecturally in front of the world and
always will be.

**What DOM was giving away free, and what replaces it.** Hit-testing is a raycast against the
tablet bodies. Hover moves the pick toward the camera rather than recolouring it — at this
distance a lit tablet and an unlit one are hard to tell apart, but one that has stepped out of
the rank is unmistakable. Focus, keyboard and screen-reader access come from a parallel layer of
transparent buttons, positioned each frame by projecting each tablet, carrying the full label
(`今日の分 — DUE TODAY, 24 cards`) and taking `pointer-events: none` so the mouse still goes to
the raycast. Verified: four twins, correctly named, focus ring lands, cursor turns to a pointer
over each tablet and clears off them.

- **A section has its level two in the world or in front of it, never both.** Building the DOM
  tiles and then hiding them leaves four invisible click targets floating in front of the scene,
  so `buildWorldMenus` skips them entirely for a world section — but the section title and the
  back button stay in the DOM, because they are chrome rather than options and they want to be
  legible and clickable rather than to belong to the place.
- **An unlit face reads as a sticker.** The first pass used `MeshBasicMaterial` with
  `toneMapped: false`, which put the tablets at full brightness over a scene in shadow — exactly
  the complaint that moved level two into the world to begin with. Lit, they belong; but a
  four-step toon ramp at a grazing sun angle drops the whole rack into its darkest band, so the
  faces carry an emissive floor. Writing has to stay readable in shade.
- **Size a rack against the standing distance, not against the tablet.** At 196 wide with a
  58 gap the rack came out 925 across at 980 away: posts off both edges, and it buried the gate
  it is meant to stand in front of.

## v30 — the threshold is part of the landmark, and it never leaves

Two complaints about the ema rack, one root cause each, and both were mine rather than the
idea's.

**It was 974 units wide against a gate 781 wide and cedars 800 tall** — a fifteen-metre timber
structure standing in front of the landmark and out-massing it. The furniture cannot be bigger
than the thing it belongs to. The fix was not to shrink the rack but to delete it: the tablets
hang from the gate's own tie beam, which removes the competing structure outright and makes the
threshold part of the architecture rather than an object parked in front of it.

**And it faded in on arrival and out on leaving** — the same mistake the scenery made before the
single-landscape rebuild, re-introduced in the UI layer because that is how the CSS3D level two
had always worked. Nothing in this world appears or vanishes. The tablets are permanent: from
the menu they are a detail hanging in the shrine across the lake, close enough to read the due
count off, and the fly-in is the only entrance there needs to be. Shedworks reached the same
conclusion from the other end on Sable — objects that simply appeared were *"ugly and a real
problem"*.

- **An object that assembles itself on arrival is an object you watch being born every visit.**
  Removing the intro animation made the arrival better, not poorer, because the camera move was
  always the entrance.
- **A thing that hangs must move.** A permanent object with no motion reads as scenery; a slow
  per-tablet sway on its own phase is what says these are objects on a cord. It also fills the
  role the entrance animation was pretending to serve.
- **Stand-off is per place, not global.** The gate's tablets are hand-sized objects on a
  620-unit structure and want approaching; a hillside wants to be seen whole.
- **The type is deliberately oversized** — signage, not ema. A real votive tablet is written
  small in a hand, edge to edge; this carries type far larger than the object would, because the
  camera stops far enough back to keep the shrine and the valley in frame and legibility has to
  survive that. Games oversize signage constantly and nobody notices.

## v31 — the gate is a landmark again, and the threshold is a wall of ema

The tablets hanging in the torii were ugly, and size was the symptom rather than the fault. Two
mistakes underneath it:

**The interface was inside the landmark's void.** A torii's entire meaning is the empty space you
pass through; hanging four tablets across it is a menu nailed over a doorway, and it reads wrong
at any scale because it fights what the object is for.

**And the landmark was framed around the interface's legibility.** The camera stood where the
writing became readable, which put a symmetrical object dead-centre, front-on, filling 60% of
frame — a title card, not a place. Nobody photographs Itsukushima square-on.

So `place` (the silhouette you aim at from the menu) and `focus` (what the camera frames on
arrival) are now separate points. Collapsing them is what let the tail wag the dog in both
directions at once.

The threshold is a **絵馬掛所**, and it fixes more than the framing:

- **A real ema wall is a crowd of hundreds**, so the blanks are not padding, they are accuracy —
  and four live tablets standing out of a crowd read as CHOSEN rather than as a row of four
  rectangles, which is the failure this design has fallen into at every previous attempt.
- **A crowd has to show its edges.** Packed 24 to a row at 54 wide they overlapped into a
  continuous tan slab and read as a solid board. Fewer per row than the width allows, a wide
  spread of size and tilt, and a real range of weathering, so every tablet has a dark line
  either side of it.
- **It stands on piles over the water**, which is what Itsukushima's shrine actually is — and
  also the only way to have it near the gate at all. The lake is 2,700 across and every point
  within reach of the torii is in it; standing the wall on the far shore put 77° between the two
  and the gate never made the frame.

The gate itself came down from 620 to 450 (Itsukushima's is 16m against 30m trees) and gained a
smaller second gate behind it — which turns a single object into the start of an approach, and
is the first gate of the senbon-torii tunnel level three will travel down.

## v32 — REVIEW moves onto land: the approach

The gate and the wall were growing through one another, and the reason was that I kept trying to
put the place in the water. A gate standing in water is the picture you want from the menu, but
it can never be the destination: **there is nothing behind it to walk toward, which is the whole
point of a gate.** Everything within reach of the water torii is lake — the lake is 2,700 across
— so the wall had nowhere to stand but on top of the gate.

REVIEW's shrine is on land now, past the far shore. A water torii stays where it was, as scenery.

- **Author a place in APPROACH coordinates, not world ones.** "In front of the gate and to its
  left" is a statement about the approach axis; saying it in world x and z is what had two
  objects occupying the same space. One forward vector, one side vector, and every element is
  placed with `at3(forward, sideways)`.
- **A clearing has to be the shape of what it clears.** One blocker at the gate cleared a
  678-unit circle around a 4,000-unit approach, so the wood grew straight through the tunnel and
  stood between the camera and the gate. It needs a line of blockers from behind the camera's
  standing point to past the last gate — and a second line down the wall's side, because the
  corridor is measured from the axis while the wall reaches 585 off it.
- **The tunnel foreshortens by design**: each gate smaller than the last and closer to it, so
  the far end reads as distance rather than as a row of identical objects.

Layout, on the line you arrive along: the ema wall forward-left and turned in toward the gate's
centre; the gate; a smaller gate beyond; then the tunnel running away. Square-on to the camera
the wall read as a billboard set up for your benefit — angled in, it belongs to the approach's
own geometry.

## v33 — REVIEW becomes a precinct, off-screen

Two instructions I had been failing to follow, and one of them repeatedly.

**The area is off-screen.** At bearing 26° it sat inside the home camera's 31° half-cone and
cluttered the one composition in this project that works. Everything is at 105° now, behind the
shoulder — you only ever see the shrine by going to it. A single torii stays out in the water as
scenery, because that is the picture the menu wants; it is not the destination.

**The wall is a fraction of the gate.** It had been drifting upward every time the tablets
needed to be more readable until it was 620 wide against a 590-wide gate: the same size as the
landmark, which is the one thing furniture must never be. `buildEmaWall` takes W and HH as
ARGUMENTS now and the caller states them as ratios of the gate — half its height, a third of its
width — so the number cannot creep. Everything inside scales off those two values.

The way to keep the tablets readable at that size is not to grow the wall but to **stand the
camera close to it and far from the gate**: 530 units to the wall, 1,430 to the gate. The
tablets read at 108px, and the gate still towers over them, because perspective is doing the
work instead of the modelling.

It is also a full area rather than three props: a paved approach, stone lanterns flanking it, the
gate, a tunnel of eleven gates each smaller than the last AND closer to it, and a hall at the end
of them. Without something at the far end the tunnel is a corridor to nowhere, which is what
makes a place read as a set.

Two things that only showed up once it was built:

- **Furniture flanking a path still has to miss what the path leads you to read.** The lantern
  pair at −820 stood ten units in front of the wall and directly over its first tablet.
- **Chrome authored for one framing does not survive another.** The section title and the back
  button are CSS3D planes offset from the destination, and the offsets were written against the
  old head-on composition — the title cropped off the top of the frame and the button off the
  bottom.

## v34 — the precinct dressed

- **Eye height is per place, not global.** Standing back to take in a valley and standing close
  to read something hanging at chest height are not the same shot; `standOff` takes a lift now
  and REVIEW rides at 215 rather than 360.
- **The wall addresses the path, not the viewer.** A board square to the camera is a poster; a
  board turned along the way in is something that was put there for people walking past it.
- **Butt-jointed low-poly parts show a seam wherever their silhouettes disagree.** The lantern's
  sections overlap now rather than meeting, and the segment counts match — 8 for the round
  parts, 6 for the box and its roof — so the facets line up instead of interleaving. Stacked
  masonry looks like overlap anyway.
- **The crowd needed something to hang on.** The blanks were floating behind the posts with
  nothing behind them, which reads as geometry poking through rather than as tablets on a wall.
  A backing board fixes it and is what a real ema wall has; a ridge beam covers the join where
  the two roof slopes meet.
- **A clearing without planting is a lawn.** Stripping the wood out to make room for the
  approach left a golf course. Low shrubs bank the edge of the paving, taller ones sit behind
  them, and maples mark where the wood resumes — all placed in approach coordinates and kept
  clear of the path by construction rather than by a blocker test.

## v35 — the swing, the tab, and the frame that fits the window

Five faults, of which three turned out to be the same class of mistake: a value written down by
hand where the code already knew the answer.

- **The sign of a rotation is not a matter of taste.** The wall had been turned *away* from the
  path, and the direction is derivable rather than guessable: after `lookAt`, a group's local +X
  is the approach's `side` vector, and a positive `rotateY` carries the face from the camera
  toward it. Working that out once beats trying angles until one looks right — and it is now
  written down next to the number, so nobody has to work it out again. 0.55 rad (32°) reads as
  addressed to the path while still showing the tablets at 85% of their width.
- **Hover has to be the gesture the object can actually make.** The tablets flew out of the wall
  and snapped back into it, because the tween was a translation on a group whose origin sat at
  the tablet's own centre — at that origin, translation and spin are the only moves available.
  Moving the origin to the peg the tablet hangs from turns the identical tween into a swing:
  the bottom edge comes out toward you and the face tips up, which is what someone lifting a
  votive tablet to read it actually does, and it aims the writing at a camera standing above it.
- **A rest pose that is an angle cannot be forgotten; a rest pose that is a position can.** The
  return tween went to `z: 0`, which was never where the tablets started (they hang proud of the
  backing board at `z = W·0.07`), so letting go filed each one back *inside* the wall. Rotation
  has no such trap: rest is zero.
- **Do not raycast the thing the hover animation moves.** Testing against the tablet meant the
  cursor fell off what it had just picked and the two states chattered. An invisible proxy box
  standing at the resting position fixes it — `material.visible = false` skips the draw while
  `object.visible` stays true so the ray still hits. Padded to just under the gap between
  neighbours, it is a bigger target than the gabled pentagon and no two can overlap.
- **Read the rest value out of the material; never retype it.** Tweening emissive back to a
  hand-written `0.361` — the sRGB component of `0x5c503c` — left every hovered tablet permanently
  three times brighter than its neighbours, because the renderer works in linear space and had
  stored `0.107`. `material.emissive.clone()` is right in either space. (Emissive *does* reach
  the GPU without a `needsUpdate` bump; the uniform trap in v18 was specific to custom uniforms.)
- **Size the focus twin from the object, not from a constant.** The projection used a 236-unit
  figure tuned once against a different wall, so every focus rectangle was five times the size of
  its tablet and they all overlapped. Projecting the tablet's own width and height is both
  simpler and permanently correct.
- **BACK belongs on the screen, not in the world.** As a CSS3D plane it was authored per place,
  which at the shrine's standoff came out as four hundred pixels of washi filling the corner and
  out-shouting what you came to look at — and a plane in the world can be walked into, occluded
  and cropped, and needs re-placing by hand six times. A small fixed tab has none of those
  problems at any viewport and belongs with the ESC hint opposite it.
- **A vertical field of view crops the sides.** Every framing in the file was composed at 16:9,
  so any narrower window silently cut the composition. Below a reference aspect the camera now
  opens its *vertical* field instead, holding the horizontal field constant — one function, all
  six arrivals, and portrait gains sky and ground rather than losing the gate. The 2D chrome
  needed the same treatment: three separately anchored bottom items meet in the middle at 1024px.
- **CSS3D has no frustum culling and no depth buffer.** Two planes were being drawn across every
  destination: the menu's own type stack, still transformed while behind the camera (a
  perspective divide by a negative z is a flip), and the level-three board's watermark kanji,
  which is a *separate* CSS3D object from the board and so was never switched off with it. Both
  had been visible from the beginning; nothing else in the file has the problem because
  everything else is a mesh with a depth test.
- **A hidden CSS3D plane has no element in the document.** CSS3DRenderer appends an element the
  first time it renders it, so `getElementById` on something inside a plane that starts hidden
  returns null. Hold the element reference.
- **Density is not the same as reading as a crowd.** Thirteen small tablets to a row is truer to
  a real ema wall and rendered as crazy paving; the fix was fewer, bigger, hanging nearly
  straight, and — decisively — a thin rail above each row. The rail is what says "hanging", and
  that reading survives even when no individual tablet can be made out.
- **Scatter is not planting.** 184 shrubs over 4,600 units is one every 160 units: dotting.
  Six hundred, drawn as clumps around a handful of centres, with a low dense band right at the
  verge and a treeline behind, is planting. Uniform-random is the one distribution that never
  occurs outdoors — the same lesson as the lattice in v22, arrived at from the opposite side.
- **Reflect out of a keep-out, don't drop.** Discarding anything that lands on the approach
  thins the very edge you most want planted. Mirroring it back across the boundary keeps the
  distribution smooth and gives the clearing a planted edge instead of a fade.

## v36 — nothing grows through anything

- **Clumping answers "where", not "may two things be here".** The clustered planting fixed the
  distribution and said nothing about occupancy, so at a hundred and eighty units per bush they
  simply grew through one another. Every plant registers a footprint now and every candidate is
  tested against what is already standing — with **two radii, not one**, because clipping is a
  question about height as much as about plan. A bush beside a cedar is a bush at the foot of a
  cedar, which is correct; two canopies at the same height are a graft. `rLo` is what occupies
  the ground, `rHi` what occupies the air, and a shrub has no `rHi` at all so it is free to sit
  under anything.
- **A rejected candidate must cost a gap, never a graft.** Retry within the same clump a dozen
  times, then give up. Loosening the radius to force one in puts the intersection straight back.
- **The answer to a thin result is more candidates.** Once rejection is safe, doubling the number
  thrown at the ground is free — and the density you get becomes a property of the ground rather
  than of the seed.
- **A local registry cannot see what is planted after it.** The shrine spaced its own planting
  perfectly and the valley's wood, built later and knowing nothing about the shrine, put cedars
  straight through it. Registering the shrine's trees as scatter blockers only half-worked,
  because a blocker's cone has to be sized against the largest tree that might land next to it.
  One shared registry that every wood in the file goes through is both simpler and correct.
- **The valley's wood had never had a spacing test at all** — `standSpot` and `ringSpot` checked
  only that a position was not inside a mountain. Two trees sharing a trunk is invisible at the
  menu's standoff, which is why it survived this long; the destination cameras stand a few
  hundred units from the same wood and it is not invisible there. **A tolerance that holds at
  one camera distance is not a tolerance, it is a coincidence.**
- **Measure it.** Eyeballing "a lot of clipping" gives you nothing to aim at. An audit that walks
  every instance near the shrine, takes each one's real bounding box, and counts overlapping
  pairs turned an argument into a number: 233 → 21 → 1. It also caught two things the eye had
  not — that most of the "clashes" were bushes standing under canopies (a bad test, not a bad
  scene) and that the sakura's spacing radius was 78 against a real reach of 148.
- **Contrast is a pair, not a value.** The blank tablets were lightened twice and still vanished,
  because the board behind them was lightened with them. Board down, blanks up.
- **A flat emissive term lifts the ink exactly as much as the paper.** On a surface this far from
  the key light the emissive is most of what you see, so it was washing the writing off the
  tablet — the thing meant to make it legible was the thing destroying it. `emissiveMap` set to
  the face's own texture lights the paper and leaves the glyphs alone.
- **Section colours are chosen against near-black.** On cream it is the *light* end of the ramp
  that disappears: REVIEW's `#e34a33` on paper is 2.4:1, its `#b23320` is 4.4:1.
- **Two tweens on one property do not queue, they race.** An elastic ease of one duration against
  a shorter one of another can finish in the wrong order and park the object at the losing tween's
  end value — which is exactly what a fast hover-and-unhover produced. `overwrite: true`.
- **Solve an overlap where it actually happens.** The wall's posts came up through the paving,
  and every attempt to fix it by moving the wall further out ran into the frame's left edge
  instead — there is only about thirty degrees between the gate and the edge of the picture. A
  stone footing, which is what real ema-kake stand on, makes the overlap deliberate and costs
  none of the framing.

## v37 — the plinth that was there and could not be seen

Three complaints, and the first one took three attempts because each fix was correct about
something different.

- **An append after the merge is silence, not an error.** The stone footing was pushed into
  `frame` two lines *after* `mergeParts(frame)` had already consumed it. The code ran, allocated
  its box and had no effect whatsoever. A list is only a list until something consumes it.
- **A plinth goes UNDER, not around.** Built the second time, it was a block centred on the
  wall's base — which is a block wrapped around the wall's lower half, and it rose far enough to
  swallow the bottom course of tablets. Lifting the group clear of the ground and filling the gap
  beneath it costs the board nothing and can be as deep as it likes.
- **Two things placed from different references do not share a floor.** Built the third time it
  was still invisible: the plinth measured from `groundAt` at the wall's own station, 215 units
  off the axis, while the paving measured from the axis. The hillside falls enough over that
  distance that the top of the stone came out below the top of the path. The wall now stands on
  `max(its own ground, the approach's surface) + margin`, which is exact whatever the terrain
  does between them.
- **`fillText`'s fifth argument condenses rather than shrinks.** Type size on a label is
  otherwise governed by the longest string any section might ever pass in, and every other tablet
  pays for it. With `maxWidth` the glyphs keep their height and lose width, which is the trade a
  label wants.
- **Check what the margin is for.** A fifth of the wall's width was being held back either side
  of the row of four tiles on no principle beyond looking tidy in the first draft, and it was
  costing a sixth of every glyph. The board's own posts already frame the row.
- **Anisotropy is the difference between legible and smeared** on a small textured quad seen at a
  slant. The tablet is 384 texels wide and lands on seventy pixels — four or five mip levels
  down. It had been set to 4 with the hardware offering 16.
- **A row has to hold its row.** The blanks stood 23 units tall in a 25-unit pitch and the
  vertical jitter pushed one row's lower edge through the next row's rail, which reads as
  over-stuffed rather than as a crowd. Smaller, one more per row, less jitter.

## v38 — English leads on the tablet

- **Stop asking the harder script to do the reading.** Three rounds went into making 今日の分
  bigger — a wider tile, a taller glyph, `maxWidth`, sixteen-times anisotropy — and it was still
  the hardest thing on the wall to read, because kanji carry far more detail per glyph than Latin
  capitals do and the tablet renders at about seventy pixels whatever is on it. Swapping them put
  DUE TODAY where the effort had been going and settled it in one change. The Japanese stays
  underneath, small, to be grown into rather than relied on — the same call the main menu's
  description line already makes. **When repeated increases of a quantity are not fixing a
  legibility problem, the quantity is not what is wrong.**
- **Two short lines beat one condensed line at every size.** Breaking a label at its space costs
  nothing and buys back everything `maxWidth` was taking.
- **A row of labels shares a type size.** Sized per tablet, ALL came out at 112 next to WEAK
  CARDS at 84 and the row read as though something were being emphasised. The wall now asks for
  the largest size every one of its tiles can carry, which makes the set the unit rather than the
  tile.
- **`measureText` scales linearly with font size for a given string,** so one measurement gives
  the size that exactly fills a width. Nothing has to be guessed and nothing breaks when the
  label table grows a nine-character entry.

## v39 — six faces for one tablet

Swapping the scripts made the tablet readable and made it busy, because it left four bands of
type stacked in a pentagon — label, gloss, figure, unit — with nothing dominant. Rather than
argue about it, six arrangements, switchable with `?ema=a..f`, each deciding what the tablet is
FOR and letting everything else get out of the way of that:

- **a** the figure is the answer, the label names it — a dashboard tile
- **b** a banner in the section colour with the type reversed out, the figure on paper below
- **c** label, rule, figure — one line each and a lot of paper between them
- **d** the figure struck into a block, the label under it — the menu's own chip language
- **e** the label is the choice and the count a footnote — what a menu item usually is
- **f** what was there, as a control

**Chosen: e**, and the other five are deleted rather than left behind a switch. It is the only
one of the six that treats the tablet as something to *choose* rather than something to read a
number off — which is what a level-two item is. The count still gets the section's colour and a
rule of its own, so it is present without competing; the arrangements that led with the figure
made every tablet answer a question nobody had asked yet.

Three things worth keeping out of the exercise itself:

- **Judge a face in the place it is read, not on a contact sheet.** A switch on the URL costs ten
  lines and shows every candidate lit, angled, at seventy pixels and against the actual
  background. A contact sheet would have made **b** look like the obvious winner; in place, four
  red banners in a row fight the gate they are standing in front of.
- **A row shares its figure size as well as its label size.** Left to fill its own tablet, `341`
  came out condensed to two-thirds the digit width of `24` beside it, and four counts read as
  four different kinds of thing. Anchoring the figure by the middle of its block rather than by a
  baseline lets the shared size shrink without the composition sliding.
- **Build the alternatives cheaply and delete them the moment one wins.** Six faces behind a URL
  switch is a good way to decide and a terrible thing to keep: the branch is dead weight in every
  future read of the function, and the losing five would go on being maintained by accident.

## v40 — the court, and a gate you go through

- **The wall did not need moving; it needed ground to stand on.** Three rounds went into sliding
  the ema wall sideways so its posts stopped coming up through a 360-wide path, and each one ran
  into the frame's left edge instead — there is only about thirty degrees between the gate and the
  edge of the picture. The path opens into a paved court now and the wall simply stands on it.
  **When a thing keeps not fitting where you are putting it, the question may be about the place
  rather than about the thing.**
- **A level platform replaces a guess with a number.** Everything on the court is placed from one
  height instead of from `groundAt` at its own station, which is precisely the bug that hid the
  wall's plinth three builds running. The court is set above the HIGHEST point it covers — an
  average comes out buried at the high end — and skirted 300 deep so the hill can do what it likes
  underneath.
- **A courtyard with one thing in it is a yard with a thing in it.** The 手水舎 opposite is what
  makes the space between them read as a place, and it is open on all four sides on purpose: it
  has to hold its half of the frame without becoming a second board competing for the eye.
- **Set a counterpart BACK, not just aside.** At side 258 it was nearer the camera than the wall
  it answers, filled the right third and had its roof cut off. Out at the court's edge and half
  again further down it, it reads at about the wall's apparent size — which is what balance means
  when perspective is doing the work.
- **A gate you pass through has to be checked, not eyeballed.** The flight is a straight line from
  home to the standing point and the standing point is on the approach axis, so a gate on that
  axis is flown through — but "through" means under the tie beam and between the posts, and those
  clearances are a calculation. Intersecting the flight line with the gate's plane gives them
  exactly: 247 above the base against a tie beam at 316, and 12 off-centre against posts at 221.
- **Headless cannot screenshot a moving camera.** At two frames a second the transition is over
  before the shot lands. Exposing the camera RIG — not `camera`, which `applyCamera` overwrites
  every frame from it — lets any point on any flight path be parked on and photographed.

## v41 — level three is a walk

REVIEW's four tiles are QUEUES, not lists — you do not browse "due today", you run it — which is
why this section had no level three while four others did. What it can honestly show is what the
queue is made OF: the same six decks every time, with the count and the progress **this** queue
sees. The placards down the tunnel therefore never change identity, only their numbers, which is
also what lets them be permanent scenery instead of something that spawns on arrival.

- **A corridor cannot show a list all at once, and no arrangement fixes that.** Everything in a
  corridor converges on the vanishing point, so keeping N signs apart on screen needs their
  offsets to grow with their distance — which means a widening corridor, which is not a corridor.
  Every static-camera layout ends with the third sign hidden behind the first. So the camera
  moves, the counter exists because you cannot see the whole list, and the arrow keys are the
  scrollbar. **"A path you travel down" turned out to be required by the geometry rather than
  merely permitted by it.**
- **A tunnel that fakes depth cannot be entered.** Gates each smaller and nearer than the last
  read beautifully from one fixed viewpoint and are a corridor that closes to a point the moment
  the camera goes down it — tie beam at 114 against a camera at 182. Uniform gates are what a
  real senbon-torii has anyway, and they instance to one draw call instead of eleven.
- **Check the unit scale before choosing an eye height.** The gate is 470 for a torii that would
  be nine metres, so a unit is about twenty millimetres and the courtyard camera rides at three
  and a half metres. Outdoors nobody notices. Inside a corridor whose beams are at 242 it means
  the beams cross at eye level and there is no corridor to look down.
- **In a regular colonnade the camera's distance is not a free number.** At an arbitrary stand-off
  every viewpoint came to rest inside a gate. It has to be a whole count of bays plus a half,
  measured from the sign's own offset within the bay.
- **Sight lines, not depth sorting.** The placards and the posts sit at similar distances from the
  axis, so from three bays back the post two bays ahead subtends a *wider* angle than the sign's
  outer edge and shaves the first character off every line. Nothing about moving the sign along
  the corridor fixes that; the offset has to come inside the opening the nearer gate leaves.
- **`facing` had already turned the gates round.** Adding a further half-turn to the placards sent
  their written faces down the tunnel and left the backs of the boards pointing at the camera —
  which renders as a plain brown rectangle and looks *exactly* like a texture that failed to load.
  Half an hour went into the wrong half of that.
- **A tunnel is a dark place.** The emissive tuned for a tablet under open sky leaves a placard
  between two vermilion gates as a brown rectangle with invisible writing, and post shadows rake
  across it as you walk. In there a sign has to carry itself almost entirely.
- **A colonnade is not a collision.** The clipping audit counted every adjacent pair of tunnel
  gates as a 97% intersection the moment they became an InstancedMesh. A repeated structure with
  deliberate spacing looks identical to a fault if all you measure is bounding boxes.

## v42 — walking it showed what standing still had hidden

Everything in this pass was already wrong before level three existed. Walking down the thing is
what made it visible, which is the general lesson: **a scene is only tested from the viewpoints
you have actually been to.**

- **The path was a line of boxes, not a path.** Each 260-unit segment was levelled at the mean of
  its own two ground samples and rotated to point at the next, so consecutive segments met at
  different heights AND different angles — a staircase of small steps with slivers of daylight
  between them. Invisible from the courtyard; it is the floor when you walk down it. A ribbon
  built from shared vertices cannot step and cannot gap. It is also level ACROSS its width where
  the hillside is not — a paved way is built up on the low side, it does not tilt — and it ramps
  onto the court instead of meeting the kerb at whatever height the ground happens to be doing.
- **`mergeParts` writes one flat colour over every vertex it is handed.** That is what it is for,
  and exactly wrong for a ribbon carrying its courses in its own colour attribute: merged in, the
  whole path came out white. Some geometry has to keep its own mesh.
- **Planting ranges were written when the world was smaller.** They stopped at 4,300 because that
  was the end of everything; the tunnel now runs to 7,340, so the last third of the walk was a
  corridor with mown grass either side. Ranges tied to a landmark rather than to a number would
  not have drifted — and the counts have to go up with the length, because the density was right
  and the quantity was not.
- **A dolly wants a sine, and time.** `power2.inOut` over six tenths reads as being shoved from
  one sign to the next. A sine has no sudden change of acceleration at either end, and 1.25s over
  1,072 units is about walking pace at this scale.
- **The keyboard cannot be the only way down a corridor.** The placards are their own controls —
  raycast, cursor feedback, and a transparent focus twin each — with two steppers in the counter
  for anyone who would rather not aim. Only the NEXT placard is a reliable target, though: a far
  one on the same side converges behind its nearer neighbour, which is the same fact about
  corridors that made the camera move in the first place.
- **A point behind the camera projects to a flipped, meaningless place.** The sign you have just
  walked past was putting a 560px focus rectangle in the middle of the screen. `z > 1` after
  `project()` is the test.

## v43 — a sign is a thing that was already there

The placards started blank and filled in when you picked a queue. Two separate faults wearing one
coat, and the second is the interesting one.

- **The hitch was a shader rebuild.** Building a fresh `CanvasTexture` per queue meant assigning a
  new `map` AND a new `emissiveMap` to a material that had been compiled without either, which
  forces a program rebuild — a dropped frame, and the first frame after it is the sign appearing
  out of nothing. Each placard owns one canvas and one texture now; lettering redraws the canvas
  and sets `texture.needsUpdate`. One upload, no recompile.
- **And the rest was a category error.** Watching a sign fill in is the one thing signage must
  never do, because **a sign is a thing that was already there.** They are lettered with the whole
  collection at build time, so the tunnel is a signed corridor from the moment you first see it
  down the courtyard — and picking a queue only changes the numbers on it.
- **A full turn hides the swap completely.** The board is edge-on a quarter of the way round and
  its back is toward you for half of it, so the new face is simply what is there when it comes
  back. No cross-fade, no pop, and the swap can happen at any point in the middle. The turn is
  staggered down the corridor, because six boards going at once is a flicker and six going in
  sequence is a departure board.
- **Turn the board, not the sign.** A nested group whose origin is the board's own centre is the
  difference between a sign flipping over and a sign being swung on its cords.
- **At two frames a second an animation is invisible to a screenshot.** Sampling the rotation on
  every `requestAnimationFrame` and looking for values strictly between 0 and 2π proved both the
  turn and its stagger — `[6.26, 6.02, 5.26, 3.68, 1.68, 0.56]` is the wave rolling down the
  tunnel — where five screenshots at 160ms apart had shown nothing but zeros.

## v44 — the flicker was z-fighting, and I had blamed the shader

- **I fixed the wrong thing last time.** The placards still flashed after the material rebuild was
  removed, because that was never the cause: the face sat **four tenths of a unit** proud of the
  board it is printed on, seen from 800 to 4,000 away, in a depth buffer stretched from 1 to
  60,000. That is far below what the buffer can resolve, so the two surfaces traded places from
  frame to frame. Two units of clearance and a polygon offset settle it outright. **A hitch and a
  flicker are different symptoms and I merged them into one diagnosis.**
- **And the face did not need to be transparent at all.** `transparent: true` was there only so
  the dimming could be done with opacity, and it bought a per-frame depth sort and a second
  render pass for a surface with no transparency in it. The dimming moved to the emissive —
  which in a tunnel is most of what you see of a placard anyway, so turning it down reads
  precisely as "not the one you are reading".
- **A board hung from a rail cannot turn a full circle.** The 360° spin was mechanically absurd
  and that is why it read as a graphical fault rather than as a gesture. They rest at a quarter
  turn with their backs to the corridor, get lettered up there where nothing is readable, and are
  then let down onto their cords in sequence. The swap is hidden by being ABOVE you rather than
  by being fast.
- **The hinge is the top edge.** A nested group on the cord line with the board hung back below it
  is the difference between a sign swinging and a sign being spun about its middle — same one
  line of tween, entirely different object.
- **Two tweens cannot share a hinge.** The arrival's sway fired over the top of the drop and
  cancelled it, so the first placard simply appeared already vertical. Its own overshoot was
  the sway it needed.
- **A place you can only look at is a diorama.** The basin is the one object in the courtyard
  whose whole purpose is to be used, it is on the side away from the interface so playing with it
  cannot be mistaken for choosing something, and water is the only material in the scene that is
  supposed to move. Rings and droplets are allocated once and rest at zero — the rule that
  nothing appears or vanishes applies to effects too; what an effect may do is start and finish.
  Ambient picking is tested only after the menu items have said no, so scenery can never shadow a
  control.
- **The title was tangled in a roofline, not badly placed.** REVIEW sat exactly on the ema wall's
  roof — the one horizontal in that corner — so the two read as a single shape. The courtyard
  camera looks up, which leaves a deep band of sky along the top that nothing else wants.

## v45 — the test window was flattering everything

- **A cant needs a reason, and this one had somebody else's.** The placards were turned 24° toward
  the reader because that is what a shop sign in an alley does — and it earns its keep there
  because you walk PAST the sign. Here you walk toward it down a straight line, so the cant did
  nothing except hold every board at an angle and then require a second rotation to undo when you
  arrived: two moving parts to reach the state it should have started in. Square to the corridor,
  and the six degrees of obliquity its side-offset already gives it is enough that it reads as an
  object rather than a decal. Selection now changes exactly one thing — how brightly it is lit.
- **THE TEST VIEWPORT WAS LYING.** Everything through this whole build was checked at 1400×880,
  which is aspect 1.59 — *narrower* than the 16:9 reference `fitFov` locks to. Below that
  reference the vertical field OPENS UP, so the test window has been showing about 10% more
  height than a real monitor for weeks, and anything placed near the top edge was flattered by
  it. The section title was 17px off the top at 1920×1080 and 28px off at 1600×900 while looking
  comfortable in every screenshot I took.
- **The tightest case is the reference aspect, not the extreme one.** I had tested 1920×700 and
  900×1000 believing those were the hard cases. They are not: below 16:9 the field widens and
  above it only the horizontal grows. **16:9 exactly is the vertical worst case**, and it is also
  what most people are looking at. It is first in the harness now.
- **Measure the safe zone, do not look at it.** Reading the title's own bounding rect at six
  viewport sizes and asserting a 4% margin turned "looks fine to me" into six numbers, three of
  which were negative.

## v46 — the name becomes a board

The section title stops being type floating over the scene and becomes a 扁額 hanging in it,
which also retires the last thing the safe-zone problem was about: a board mounted on a building
cannot leave the frame, because the building cannot.

- **Black lacquer and gold is not a stylistic choice here, it is the only thing that reads.** A
  name-board has to sit against vermilion at dusk; a light board disappears into the sky behind it
  and a mid-tone one disappears into the timber. A ground darker than anything else in the frame
  with letters that carry their own light is what a real hengaku is for.
- **Where a name-board goes is a question about the building, not about the type.** Three
  placements, built and switchable with `?title=a|b|c`, because the only way to judge one is in
  the place — over the tablets on the ema wall, on the gate's gakuzuka (which is what that strut
  is FOR), and under the water pavilion's near eave.
- **A board mounted on a structure that faces across the court is invisible from up the court.**
  The pavilion is turned to address the ema wall — that is what makes the courtyard a courtyard —
  so the first version of C was seen edge-on and read as a bright sliver on the roof. The eave
  facing back down the way in is the surface a visitor actually sees, and hanging a board under
  an eave is what that surface is for.
- **Parent to the structure and inherit its geometry for free.** The ema-wall board is a child of
  the wall group, so it takes the wall's 36° turn toward the path without knowing the number.

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
- **`CSS3DObject` writes `pointer-events: auto` inline on every element it wraps**, so no
  stylesheet rule can make a 3D plane click-through. Undo it per object, *after* construction.
  Until you do, every piece of scenery is an invisible click target.
- A distance-driven "depth" effect on UI becomes a bug the moment the camera dollies. Gate it to
  the resting state.
- Don't switch scenery off on a timer during a camera move — test whether it has actually left
  the frustum.
- Never splice a file by a line range derived from a scan — locate the exact boundary content and
  splice between those. A range that drifts silently eats neighbouring functions, and an
  untracked file has no undo.
- **three.js uploads a built-in material's uniforms only when its `version` changes**, so a
  custom uniform added through `onBeforeCompile` reaches the GPU exactly once. Mutating `.value`
  per frame does nothing, silently — correct shader, correct texture, effect never moves.
  `needsUpdate` is only `version++` (it disposes nothing), so bumping it on the affected
  materials each frame is the cheap way through. Keep a registry of them.
- **A `String.replace` on a shader chunk name that moved is a silent no-op**, and the result
  looks identical to a working feature with its strength set to zero. Assert the injected text
  is present and `console.error` if it isn't.
- **An inverted-hull outline tears open on any flat-shaded polyhedron.** Flat shading duplicates
  each vertex per face with its own face normal, so extruding sends the copies of a shared
  corner in different directions and the hull comes apart along every edge. Give the outline its
  own geometry with normals averaged across coincident vertices — and keep the original normal
  in an attribute so the shader can divide out `dot(smoothN, flatN)`, or corners stay
  under-extruded and the gap merely narrows instead of closing.
- When an effect "doesn't work", check whether the thing it multiplies is non-zero *before*
  re-deriving the maths. Two rounds went into a cloud shader that was correct all along.
- **AO must measure concavity, not "some neighbours are higher".** Summing every uphill sample
  darkens whole hillsides in proportion to their steepness, which is mud, not shade. Take the
  horizon in each direction *relative to the local tangent plane* — then a planar surface, flat
  or steeply tilted, comes out at exactly zero and only real hollows darken.
- **A volumetric prop's extent is in world axes, not along the sight line.** An ellipsoid scaled
  ×2.3 in x, placed "far away" down a diagonal sight line, can reach back past the camera; if
  its top is also above eye height you end up rendering its inside across the whole frame. The
  symptom is a dead-straight seam that survives every change to the thing it appears to be on.
- **When a seam survives every change to the surface it appears to be on, stop changing the
  surface.** One raycast through pixels either side of it names the object in a single run —
  a screenshot cannot, because a veil and a shade look identical.
- **Measure contrast, don't judge it.** Hide the type, screenshot, and read the background
  luminance inside each item's rect. Twice now the item that *looked* worst was fine and the one
  that looked fine was the failure — bright ground draws the eye, but it is the bright *sky*
  behind the top of a stack that actually kills cream type.
- A new top-level `function` in a 3,400-line file will collide sooner or later — `ridge` was
  already taken by an SVG helper 600 lines further down, and the only symptom is a bare
  `Identifier has already been declared` with the whole module dead.

- **A pseudo-random generator that is linear in its index is not a generator, it is a lattice.**
  `(i * A + seed * B) % M` steps by a constant; two of them used as x and y put everything on a
  diagonal grid. Use a multiply-shift hash and salt each axis separately — and give rotation its
  own salt, or objects of equal size all face the same way.
- **Exclusion zones want a height test, not a containment test.** A footprint circle sized to a
  mountain's base deletes forest for hundreds of units around a hill that is barely raised there.
- **Tune against a percentile.** Any metric taken from a single extreme pixel of a live 3D scene
  is noise; consecutive runs will disagree by more than the change being measured.

- **`geometry.scale()` scales about the origin, not about your content.** Flattening a tube
  whose points sit far from y = 0 moves it as well as squashing it. The symptom is an object of
  exactly the right shape in exactly the wrong place.
- **Shadow maps are re-rendered on every `render()` call.** A static sun over a static landscape
  needs one build ever: `shadowMap.autoUpdate = false` plus a single `needsUpdate`. With a second
  scene pass for water it was costing two 4096² depth renders a frame for nothing.
- **Large alpha-blended sprites are a fill-rate trap.** Overdraw, not geometry, is what kills
  frames; measure by hiding things and timing, because the expensive thing is rarely the thing
  that looks expensive.
- When a metric collapses after a change, bisect it by hiding candidates at runtime — one pass
  named the mist as four times the rest of the frame combined.

- **Place rotated parts by the joint, not by the centre.** Translate so the join is at the
  origin, then rotate, then move the join where it belongs — otherwise every angle change needs
  its position re-derived by hand, and the parts drift apart.
- **Sample against the same field you test against.** Taking positions off a nominal radius and
  accepting them against a wobbled one silently empties whole bearings.
- Any shader term that depends on the camera's height needs a second look the moment a
  reflection pass exists — the mirrored camera is below the world.

- **Wait for a state change, not for a number of milliseconds.** Fixed waits in a headless
  harness are guesswork the moment the frame rate moves — and it moves whenever the scene does.
  Expose enough state to await the thing you actually mean.

- **Moving UI into a 3D scene costs hit-testing, hover, focus and keyboard, not just markup.**
  Budget for the parallel focus layer up front — transparent buttons with `pointer-events: none`,
  positioned by projecting the object each frame, keep Tab and Enter working and cost almost
  nothing. Retrofitting accessibility to a raycast-only picker is much harder.

- **Apply the no-unloading rule to UI as well as to scenery.** It is easy to fix pop-in in the
  world and then reintroduce it in the interface, because interface code has always worked that
  way. If nothing else in the scene may appear or vanish, neither may the menu.

- **Never let legibility choose the framing.** If the camera stands where the type becomes
  readable, the composition is a by-product of the font size. Frame the shot, then solve
  legibility with the type — oversized signage is invisible as a cheat and a badly framed
  landmark is not.
- **Don't put the interface in the part of an object that is meant to be empty.** A gate, an
  archway, a window: the void is the point, and filling it fights the object's own meaning.

- **A gate cannot be a destination unless something is behind it.** Scenery and place are
  different jobs; the most photogenic spot in a scene is often the worst place to stand.
- **Place composite scenes in local approach coordinates.** Forward and sideways relative to how
  the camera arrives, never world axes — otherwise "to the left of" silently means something
  different for every bearing, and objects grow through each other.

- **Pass sizes in, don't hard-code them.** A constant inside a builder drifts every time a
  downstream requirement pushes on it, and nothing ever pushes back. Stating a ratio at the call
  site makes the relationship the thing being maintained.
- **Solve readability with camera distance before reaching for scale.** Standing near the small
  thing and far from the big one keeps both the right size in the world.

- **Put the origin where the object is attached.** A group's origin decides which animations are
  even expressible: at an object's centre you get translation and spin, at the point it hangs
  from you get a swing. Choosing it wrongly makes the right motion impossible to tween.
- **Never retype a value the code already holds** — colour components most of all, because the
  renderer's working space is not the space you typed the hex in.
- **Hit-test against something that does not move.** Any hover animation applied to the ray's own
  target will make the pick chatter.
- **A vertical FOV crops the sides; lock the horizontal one instead.** Compositions are framed
  against the frame's edges, so the field that must stay constant is the one those edges are on.
- **CSS3D planes have no frustum culling, no depth test, and no element until first rendered.**
  Anything in that layer needs its visibility driven explicitly, and its element held by
  reference rather than looked up.

- **Scatter needs an occupancy test, not just a distribution.** "Where things go" and "may two of
  them be here" are separate questions, and only the first one is interesting to author.
- **A tolerance that holds at one camera distance is not a tolerance.** Anything that survives
  because the camera is far away will fail the moment a destination camera stands next to it.
- **Two tweens on one property race; they do not queue.** Overwrite, or find the object parked
  wherever the loser happened to end.
- **Turn a disagreement about a scene into a number.** Walking the instances and counting real
  bounding-box overlaps is a few dozen lines and it both proves the fix and catches the cases
  the eye was misreading.

- **Two objects that must meet have to be placed from the same reference.** "On the ground" is
  not a shared floor when the ground is a heightfield and the two are measured at different
  points on it.
- **An append to a list that has already been consumed fails silently.** Builder code that
  collects parts and then merges them has an invisible deadline in the middle of it.
- **When something you built is invisible, ask whether it was built, whether it is where you
  think, and whether something else is in front of it** — in that order. Three attempts at one
  plinth were three different answers to that question.

- **If turning a dial up repeatedly does not fix the problem, the dial is not the problem.**
  Four increases of the kanji's size did less than swapping it for the Latin gloss.
- **A set of labels is the unit, not a label.** Size, weight and colour belong to the row.

- **When something keeps not fitting where you put it, suspect the place, not the thing.** Three
  rounds of moving a wall were answered by giving it ground to stand on.
- **A level platform is worth building for the arithmetic alone.** Everything on it is placed from
  one number instead of from a heightfield sampled at each object's own station.
- **Expose the camera rig, not the camera.** Anything that rewrites `camera.position` every frame
  makes the camera unsettable from outside, and every question about a flight path then becomes
  unanswerable without it.

- **Scenery built for one viewpoint cannot be entered.** Any depth faked by scaling breaks the
  moment the camera is allowed inside it.
- **Know your unit scale.** An eye height that is invisible outdoors is a giant indoors.
- **In a repeated structure, distances are quantised.** Bay spacing decides where a camera may
  stand, not taste.
- **Occlusion in a colonnade is a question about angles, not depths.** Two things at similar
  offsets from an axis trade places in the frame as the camera moves back.
- **A measurement that cannot tell a colonnade from a collision will report a colonnade.** Every
  automatic check needs to know what the scene means, not just where its boxes are.

- **A scene is only tested from the viewpoints you have been to.** Everything the walk exposed —
  a stepped path, planting that stopped, a camera that lurched — had been wrong for weeks and was
  invisible from the one place the camera had ever stood.
- **Ground built from independent pieces will not meet itself.** Anything laid along a heightfield
  wants shared vertices, not a row of separately levelled boxes.
- **Tie ranges to landmarks, not to numbers.** A literal that meant "the end of the world" when it
  was written stops meaning that the moment the world grows.
- **A dolly wants a sine and about a second per stride.** Snappy eases are for cuts, not for
  walking.

- **A sign is a thing that was already there.** Anything that reads as signage must never be seen
  being written; give it content at build time and change the content, not its existence.
- **Assigning a map to a material that was compiled without one rebuilds its shader.** Own the
  canvas, redraw it, set `texture.needsUpdate` — and the material never notices.
- **Hide a swap inside a rotation.** A full turn puts the object edge-on and then back-on, which
  is a window in which anything at all may be changed unobserved.
- **Sample per frame, not per screenshot.** A headless renderer at two frames a second cannot
  photograph an animation, but it can be asked what it is doing on every `requestAnimationFrame`.

- **A hitch and a flicker are different symptoms.** Fixing one and assuming the other went with it
  cost a whole round. Decal surfaces flicker because of depth precision; a fraction of a unit of
  clearance is nothing at four thousand units out.
- **Only make a material transparent if something about it is transparent.** Using opacity as a
  dimmer buys a depth sort and a render pass; on a lit surface, dim the light instead.
- **Animate what the object could actually do.** A hinged board swings; it does not spin. Motion
  that contradicts the mechanism reads as a bug however well it is tweened.
- **Two tweens on one hinge is the same fault as two tweens on one property**, and it arrives
  disguised as "the first one doesn't play".
- **Give a place one thing that answers.** It is the cheapest possible difference between a set
  and somewhere that exists.

- **Know which way your test window lies.** With a horizontal-FOV lock, any viewport narrower than
  the reference aspect shows MORE vertically than a real screen — so the habitual test window can
  flatter every composition near the top edge indefinitely. Test at the reference aspect first.
- **The reference aspect is the worst case, not the extremes.** Below it the field opens; above it
  only the other axis grows.
- **Assert margins numerically.** "Looks fine" cannot see 17 pixels of crop, and a bounding rect
  against a percentage margin can.
- **Two rotations that cancel are one rotation too many.** If arriving somewhere requires undoing
  a transform, ask why the transform is there.

## Sources

- three.js releases: https://github.com/mrdoob/three.js/releases (r180 tag, Sep 2025)
- GSAP free announcement: https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/ and https://webflow.com/blog/gsap-becomes-free
- GSAP package: https://www.npmjs.com/package/gsap (3.15.0 installed)
- R3F ↔ React 19 pairing: https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide and https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/CHANGELOG.md
- drei React 19 discussion: https://github.com/pmndrs/drei/discussions/2213
