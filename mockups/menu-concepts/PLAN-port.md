# PLAN — the port

Scoped 2026-08-31, against the mockup as it stands: fifteen screens, two overlays, every row of
`PLAN-navigation.md` built. Nothing here is written yet. Every number below was measured, not
estimated.

## What is actually there

| | the mockup | the app |
| --- | --- | --- |
| size | `01-sumi-3d.html`, **29,526 lines**, one file | `App.tsx` **2,752 lines** + 7 views + `App.css` **14,380 lines** |
| navigation | L1 → L2 → L3, 15 screens, 2 overlays | `AppView`, **6 flat views**, visit-order back/forward |
| 3D | three + GLTFLoader + CSS3DRenderer + GSAP | **none of it** — not a dependency, not a line |
| assets | `world.glb` **44.6 MB**, `night_lightmap.png` 7.6 MB, two smaller `.glb` | — |
| state | module-level `let`s and one `NAV` object | **85 `useState`/`useRef` in `App.tsx` alone** |
| corners | square, always | **348 `border-radius` declarations** |
| tokens | `--washi`, `--gold-hi`, `skewX(-8deg)` | **zero of them** |

Cold boot of the mockup, measured: **3.1 s to a usable menu**, 233 MB JS heap, `world.glb` decoded
in 417 ms off local disk.

## The three problems, in the order they will bite

### 1. The scene has to outlive React, and React has no idea it exists

This is the one that decides the architecture, and it is not a styling problem.

The camera *flies* between sections. Entering THE WORLD is a 1.4 s move from the menu's standing
point to the bridge; Escape flies back. `hudBack()` turns the camera and swaps the panel on one
clock. None of that survives a component unmounting and remounting — a remount is a black frame
and a lost camera position, which is exactly the "dropped frame looks like a snap" failure the
flight code was written to avoid.

So the valley **cannot be a React component**. It is a single `<canvas>` mounted once, above the
router, that never unmounts, driven imperatively — which is what `NAV` already is. React renders
the HUD as a layer over it and calls `NAV.goto(...)`; the scene calls back when a flight lands.
The seam is small and already exists; the mistake would be reaching for `@react-three/fiber` and
putting the world *inside* the tree it has to outlive.

**Consequence:** the port adds `three` and `gsap` as real dependencies, and ~52 MB of assets to
the packaged app. It also means one file's worth of the mockup — the world, the flights, the
lighting rig, the crowd — ports almost verbatim as a non-React module, and only the HUD becomes
components.

### 2. There are two visual languages and only one of them is designed

`App.css` has 348 `border-radius` declarations and not one of the mockup's tokens. The menu is
square-cornered washi over a valley; the app is a rounded dark UI. They are not variants of each
other.

That is fine as long as the seam is deliberate: **the menu is the chrome, the app is what happens
inside a session.** `PLAN-navigation.md` already says so — every L4 cell reads *(in the app)*. The
failure mode is drifting into a re-skin by accident, one screen at a time, and ending up with
neither language finished.

### 3. `App.tsx` will not survive the tree without splitting

85 `useState`/`useRef` in 2,752 lines, and the view switch is six inline ternaries at the bottom.
The tree adds three levels of navigation state that a dozen screens read. Adding that to `App.tsx`
as it stands makes a 3,500-line file where every HUD keystroke re-renders the study session.

## The scope question — the one thing I need decided

| | scope | what ships | cost |
| --- | --- | --- | --- |
| **A** | **new front door** | valley + L1 menu replace `home`; the five rows dispatch to the six existing views unchanged | smallest; two languages meet immediately and jarringly |
| **B** | **the tree** *(recommended)* | L1–L3 all ported; the six current views become the L4 things you *do* | what the tree was designed for |
| **C** | everything | plus a re-skin of `App.css` | never the plan; a separate project |

**B is what `PLAN-navigation.md` describes** and the only one where the design is coherent: you
never see the old chrome until you are inside a session, and inside a session you are *doing*
something, not navigating.

## The phases

Each is shippable on its own and leaves the app working.

**0 · The valley, headless.** `world.glb` rendering inside Electron behind whatever `home` draws
today. No HUD, no navigation change. **This must be first**: if 52 MB and a 3.1 s boot are not
acceptable in the packaged app, nothing after it matters. Deliverable is a number, not a screen.

**1 · The two overlays.** `/` and `,`, independent of everything else, and the cheapest real value
in the whole port. ~~`searchDictionary`, `getKanjiDetail`, `lookupSentence` and `downloadDictionary`
are all already in `preload.cjs` and called by nothing.~~ **Wrong — all four are wired; see the
phase 1 section.** The gap was the *door*: no `/` anywhere, the dictionary reachable only from
inside a study session, and `lookupSentence` with no UI at all.

**2 · L1 replaces `home`.** The standing menu becomes the front door; the five rows point at the
existing flat views. First phase anyone can see. `HomeView` (334 lines) retires.

**3 · The navigation model.** `useAppNavigation` gets rewritten: flat `AppView` + visit history
becomes the tree + an L3→L2→L1 back stack. This is the phase that touches everything, so it comes
after the front door proves the seam works and before the screens start arriving.

**4 · L2, one section at a time.** Path, lanes, world, ascent, ledger, road. Each either replaces a
view or wraps one.

**5 · L3.** Deck, feed, library, scenes, modes, level, unlock, wall.

**6 · The unlock moment fires for real.** The bridge can already announce it —
`FeatureStatusPayload` gained `just_unlocked` and `unlocked_at` on 2026-08-31 — and nothing draws
it. Last because it needs the path (phase 4) to fire from.

## The libraries, with a verdict

- **`three` + `gsap`** — new, and not optional. The world and the flights are the design. GSAP
  specifically because the camera work is authored against its easing and rewriting those tweens
  would be re-authoring the flights.
- **`zustand`** — ~~yes, at phase 3~~ **not taken at phase 3, and the reason is worth keeping.**
  The justification was "navigation state a dozen screens read" — but at phase 3 the tree is read
  by two places, and the dozen screens are phases 4 and 5. The keyboard layer turned out to be
  inside React already. A plain hook does it in 75 lines with no dependency. **Revisit when the
  L2 screens actually arrive**, which is the point at which the claim becomes true rather than
  anticipated.
- **`@tanstack/react-query`** — ~~yes, at phase 2~~ **not taken.** The dedupe argument is real but
  it was already solved: `App.tsx` hand-rolls an in-flight map and a cache for `study-queue`, the
  expensive one, and L1 reuses `summary`, `recommendations` and `xpProgress` that App had already
  loaded. The menu added exactly one new call (`getFeatureState`), once, on mount. A data layer
  for one call is a data layer for its own sake.
- **`motion`** — already installed, still unused for navigation. The HUD's enter/leave transitions
  are the one place it beats GSAP, because they are component lifecycle rather than a timeline.
- **`@tanstack/react-router`** — still no. Electron, no URL bar, and phase 3 replaces the router
  with something that models the tree directly.
- **`@react-three/fiber`** — **no**, and see problem 1. It would put the scene inside the tree it
  has to outlive.

## The three decisions, taken 2026-08-31

**1. Scope is B — the tree.** L1–L3 port; the six current views become the L4 things you do.
`App.css` is not touched. The seam is deliberate and stated: the menu is the chrome, the app is
what happens inside a session.

**2. Phase 0 optimises before it renders.** 52 MB and 3.1 s are not accepted as given. Two things
have never been tried and both are real: the lightmap is **7.6 MB of PNG** that should be a
compressed texture, and `world.glb` has never been Draco'd or meshopt'd. Phase 0's deliverable is
a before/after number, and the packaged-app boot time measured rather than inferred from a headed
browser on a local HTTP server.

**3. The old chrome stays reachable — a titlebar toggle.** The tree and the flat views coexist
through phases 2–5. Every phase ships on its own and a regression is a switch away from being
worked around rather than a blocked release. The toggle is temporary and comes out at phase 6;
it is the one piece of scaffolding this plan is willing to build.

### What that changes about phase 0

It stops being "render the valley in Electron" and becomes:

- measure the packaged app's real cold boot, not the dev server's;
- compress the lightmap and quantise/compress `world.glb`, measuring each separately;
- **then** render it behind whatever `home` draws today, with the number to show for it.

The gate stays the same: if the honest post-optimisation number is still unacceptable, the port
stops there and the design stays a mockup — which is a real outcome and cheaper to discover in
phase 0 than in phase 4.

---

# Phase 0 — done, 2026-08-31

The valley renders inside the packaged Electron app. Every number below was measured on this
machine against `out/JPLearn-win32-x64/JPLearn.exe`, three cold boots each, median reported.

## What shipped

`three` 0.185.1 as a real dependency, `src/valley/valley.ts` (a module, **not** a component),
mounted from `main.tsx` after first paint, behind everything `home` draws. 244 lines. No HUD, no
navigation change, no flights — exactly what the phase said.

## Compressing the world

| | size | vs base | fetch | parse | **total load** | triangles |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (float32) | 44.59 MB | — | 200 ms | 593 ms | **792 ms** | 2,809,553 |
| **quantized** (`KHR_mesh_quantization`) | **29.09 MB** | −34.8% | 130 ms | 633 ms | **763 ms** | 2,809,553 |
| quantized + meshopt | 14.43 MB | −67.7% | 66 ms | 657 ms | **723 ms** | 2,809,553 |
| draco | 7.43 MB | −83.3% | 57 ms | 647 ms | **704 ms** | 2,808,409 |

**Compression buys install size, not boot time.** 88 ms separates a 44 MB file from a 7 MB one,
because the asset is on local disk and the parse cost is building 21,486 mesh objects, not
decoding bytes. Every variant preserves all 21,072 nodes, 9 cameras and every node name; draco
alone is lossy, quietly dropping 1,144 triangles.

### Why the answer is `quantize` and not the smaller two

`script-src 'self'` in `index.html` forbids `WebAssembly.instantiate`. **meshopt and Draco are
both wasm, so both are impossible without adding `'wasm-unsafe-eval'` to the CSP.** Quantization
is the only one three reads natively. Trading a CSP relaxation for 15 MB of install size, in an
app that ships 492 MB, is not a trade worth making — and it costs 40 ms.

The CSP did need one change regardless: `connect-src`/`img-src` gained `blob:`, because
GLTFLoader hands embedded textures to the page as blob URLs and all eight were being refused.

## The lightmap is not shipped

`night_lightmap.png` is 4096×4096 RGB, 7.62 MB, and **nothing in phase 0 uses it** — the night
rig has not been ported. Shipping it would be 7.6 MB of dead weight, so it was removed. The
measurements stand for whoever ports the rig:

| | size | vs base | error vs source |
| --- | --- | --- | --- |
| lossless PNG, max effort | 6.73 MB | −11.7% | none |
| lossless WebP | 5.23 MB | −31.3% | none |
| near-lossless WebP q60 | 3.18 MB | −58.2% | slight |
| lossy WebP q95 | 2.84 MB | −63.6% | RMSE 6.72, **max 150/255** |
| downscaled to 2048 | 465 KB | −94.0% | **RMSE 21.85** |

The source was **not** badly compressed — a lossless re-encode wins only 11.7%. And the
resolution is carrying real detail: halving it costs three times the error of any compression
setting. A lightmap has hard discontinuities at UV island borders, which is precisely what
DCT-based lossy compression handles worst, and a max error of 150/255 is light leaking across an
island edge. **If it must shrink, lossless WebP at full resolution is the only free win.**

## Packaging

The app was shipping its own sources: `public/` is copied verbatim into `dist/` and then both
went into the asar, and `node_modules/three` added ~26 MB of examples and sources for a library
vite had already inlined. A forge `ignore` list fixes it.

| | package | app.asar |
| --- | --- | --- |
| baseline, before any of this | 472 MB | 104.8 MB |
| valley + duplicated assets | 570 MB | — |
| **valley, deduplicated** | **492 MB** | **126.5 MB** |

**+20 MB over baseline** for a 29 MB world, because the cleanup gave back more than the world costs.

## The boot, A/B from one build

`JPLEARN_VALLEY=off` disables the valley, so both arms are the same binary.

| | valley OFF | valley ON | delta |
| --- | --- | --- | --- |
| app content on screen | 1514 ms | 1604 ms | **+90 ms** |
| world standing behind it | — | +1126 ms after that | |
| sustained frame rate | — | **117–165 fps** | |
| meshes → drawables | — | 21,484 → **345** | |

The valley waits for first contentful paint before it starts. That is not caution, it was
measured: kicking the import off at module scope cost first paint 1212 ms → 3992 ms, because
parsing 21,000 nodes is about a second of unbroken main-thread work and the browser had not
painted yet when it began.

## The one real cost: memory

From Electron's own `getAppMetrics()`, not `usedJSHeapSize` — which reports 9.5 MB either way,
because it counts neither three's ArrayBuffers nor anything on the GPU.

| process | valley OFF | valley ON | delta |
| --- | --- | --- | --- |
| Tab (renderer) | 98.8 MB | 351.8 MB | **+253.0 MB** |
| GPU | 107.3 MB | 211.5 MB | **+104.2 MB** |
| Browser | 165.3 MB | 167.2 MB | +1.9 MB |
| Utility | 47.5 MB | 47.5 MB | — |
| **total** | **418.9 MB** | **778.1 MB** | **+359.2 MB** |

**+359 MB is the honest price of the valley**, and it is the only number here that gives pause.
Boot is +90 ms, frame rate is not a problem, install is +20 MB — memory is the cost.

### The lever, pulled

three keeps a CPU-side copy of every vertex attribute after uploading it, and
`BufferAttribute.onUpload` frees them. It was worth **15 MB**, not the ~150 MB the gap between a
42.6 MB JS heap and a 289 MB renderer process suggested.

First, though, **63 MB of the original +359 MB was garbage V8 had not collected**. Forcing
collection is the difference between a cost and a queue, and every figure below is post-GC:

| | Tab | GPU | total |
| --- | --- | --- | --- |
| valley off | 99.8 MB | 107.6 MB | 422.2 MB |
| valley on, no lever | 289.1 MB | 211.1 MB | 716.3 MB |
| **+ `onUpload`** | **272.4 MB** | 211.1 MB | **701.2 MB** |
| + force full upload | 262.6 MB | 236.9 MB | 715.5 MB |
| + release parser | 273.3 MB | 215.4 MB | 706.8 MB |

**Two of the four things tried were not worth doing, and knowing which is the point.**

- **`onUpload` freed 40.1 MB of arrays across 629 attributes but returned only 15 MB.** glTF
  accessors are *views* over shared per-bufferView `ArrayBuffer`s, and a buffer only goes when
  every view of it does.
- **Forcing the whole valley to upload on frame one made things worse.** It frees the 328
  attributes belonging to frustum-culled geometry — but uploading shapes the camera has never
  seen cost 25.8 MB of GPU memory to save 9.8 MB of renderer memory. Deferred is strictly
  better: it converges on the same place if you visit everywhere and stays cheaper if you don't.
- **Releasing `GLTFParser.associations` changed nothing** (706.8 against 701.2, inside the
  noise). The map really does hold 22,087 entries pinning every discarded mesh, but `gltf` is a
  local that nothing outlives, so it was already collectable. An earlier reading that said
  otherwise was the diagnostic handle holding `gltf` itself. The call stays as a **guard** — one
  line against the day a later phase keeps the loader for its cameras — and is commented as one.

**Where the +294 MB actually is:** ~103 MB of it is GPU buffers for 2.8 M triangles, which is
irreducible without less geometry. Of the ~173 MB in the renderer process, only ~16 MB was ever
freeable CPU arrays; the rest is Chromium's own mirror of the GPU buffers plus the object graph.
**There is no further easy win here — the next one is fewer triangles, not better housekeeping.**

Freeing the arrays has two real consequences, both handled: a lost WebGL context can no longer be
re-uploaded, so the valley reloads itself from the file instead; and ray-picking world geometry is
gone, which costs nothing while the menu is screen-space but is the thing to remember if a later
phase ever wants to click a building.

Boot and frame rate are unchanged by any of it: 1420 ms to app content, 864 ms for the world
behind it, 139 fps.

## Final phase 0 position (before phase 1)

| | value |
| --- | --- |
| app on screen | **+90 ms** over no valley |
| world behind it | ~0.9–1.1 s later |
| frame rate | **117–165 fps** |
| package | **492 MB** (baseline 472 MB) |
| memory | **701 MB** (baseline 422 MB) — **+279 MB** |

## Three measurements that were wrong before they were right

Recorded because each would have sent the decision the wrong way.

- **The first baseline was the splash screen.** 1.68 s to paint, 9.5 MB heap, zero canvases —
  all of it the splash window, not the app. The real window is created hidden and shown on
  `ready-to-show`, so Chromium records **no paint entries for it at all**; a probe that waits for
  first-contentful-paint on the app window waits forever. Readiness is now polled from outside.
- **A "lossless" PNG re-encode at −63%** was sharp silently palettizing to 256 colours
  (`colorType 3`). The real lossless figure is −11.7%. A 256-colour lightmap would band visibly.
- **`usedJSHeapSize` shows no difference whatsoever** between a booted app and a booted app
  holding 2.8 M triangles. Every memory number here comes from the process metrics instead.

## Reproducing the asset

`electron-frontend/public/models/world.glb` is a build artifact and is **not in git** — 29 MB a
revision would dominate a repository that is 50 MB packed, and its own source
(`mockups/menu-concepts/models/world.glb`) is not tracked either, for the same reason. It is made
from that file with:

```bash
npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
```

```js
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { quantize } from '@gltf-transform/functions'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read('mockups/menu-concepts/models/world.glb')
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10,
  quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 }))
await io.write('electron-frontend/public/models/world.glb', doc)
```

Do **not** add `weld()` or `dedup()` to that chain. Welding wins 0.07 MB, because the world's
duplicate vertices carry distinct normals and welding them would change the shading; `dedup()`
collapses 53 materials to 20, and the mockup mutates materials for the night rig, so shared
instances would leak light between objects that only happened to look alike.

**A fresh clone cannot build the valley.** That is an open question, not a settled one: LFS, a
release asset, a fetch script or a first-run download are all live options and phase 1 should
pick one. Until then the app boots fine without it — `mountValley` swallows its own failure and
the app loses a backdrop, not a feature.

## What phase 1 inherits

- A canvas that is mounted once, outside React, and never unmounts — the thing problem 1 said the
  architecture turns on. It survives every React render because React has never heard of it.
- An off switch (`JPLEARN_VALLEY=off`) that is the seed of the phase-3 titlebar toggle.
- An instancing collapse that turns the authored world's 21,484 meshes into 345 drawables. The
  mockup has its own, more careful version of this pass; when the world module ports, that one
  wins and this one goes.
- A crude two-light rig standing in for the sunset. It is not the design and is not meant to be.

---

# Phase 1 — done, 2026-09-01

## The phase's premise was wrong, and the correction is the interesting part

This plan said the four lookup commands were **"all already in `preload.cjs` and called by
nothing"**, and that phase 1 was "a UI over a wire that exists". Checked, on 2026-09-01:

| command | claimed | actually |
| --- | --- | --- |
| `searchDictionary` | called by nothing | **`DictionaryPopup.tsx`** — 752 lines of real dictionary |
| `downloadDictionary` | called by nothing | **`SetupWizard.tsx`** |
| `getKanjiDetail` | called by nothing | **`features/kanji-detail/useKanjiDetail.ts`** |
| `lookupSentence` | called by nothing | **`useStudySession.ts:1327`**, to seed a round |

All four are wired. Building "a dictionary UI" would have been building a second one.

**The real gap was the door, not the answers.** `DictionaryPopup` opens only from inside study
contexts (`openDictionaryForCurrentRound`, and the passage/reading views). There was no `/`
binding anywhere in the app, `lookupSentence` had no UI at all — it could seed a round and never
answer a question — and settings was on `Ctrl+,` only. The mockup's line for this screen is
*ONE FIELD · ANY LEVEL*, and "any level" was the part that did not exist.

## What shipped

`src/features/lookup/` — 6 files, following the feature-module convention, plus 10 tests.

- **`/` from anywhere** opens one field. The route is inferred: one kanji asks `kanji-detail`,
  anything longer asks `dictionary-search`, and every query also asks `lookup-sentence`, because
  a sentence lookup complements a query rather than competing with one.
- **The five routes are drawn along the foot** with a mark each, so the inference is never a guess
  and you can see where the answers are without visiting them. The two model-backed routes are
  named and disabled — doors this overlay does not walk through.
- **Enter hands off** to `KanjiDetailPanel` or `DictionaryPopup` — the panels that already do this
  properly. Nothing is redrawn.
- **`,` from anywhere** opens the existing `AppSettingsModal`. `Ctrl+,` still works; this adds a
  door rather than moving one.
- Both bare keys are ignored while anything is being typed into, the same guard `?` already used.

**Asked sequentially, and that is not an oversight.** `CLAUDE.md` is explicit that the bridge is
serial and that a timed-out request rejects *every* other in flight — three concurrent lookups
would make one slow dictionary look like three broken routes. The route the query asked for goes
first. There is a test that fails if the calls ever overlap.

**An absence is drawn as an absence.** With no offline dictionary, `語` answers with its level and
its components 言 口 五 and says in italic grey what the download would add. A word says
*"The offline dictionary is not installed — add it from Settings (,)"* — the one message that
connects the two doors. Electron's `Error invoking remote method '…'` wrapper is peeled off first;
it is a sentence about IPC, not about Japanese.

## It brings the frame contract with it

The menu is authored on a 1280×720 board, and `zoom: var(--u)` is what makes `left: 250px` mean
the same place in any window. The overlay carries that stage, skew and all, because it is the one
screen that can stand on it alone — **phase 2 needs it anyway**. The tokens (`--washi`, `--ink`,
`--gold-hi`, `--hi`) are scoped to the overlay root, never `:root`: this app has 348
`border-radius` declarations and the seam is supposed to be deliberate.

## Four things only running it could have found

- **The app's own CSS styles every input.** `input:focus-visible` in `App.css` paints a 2px accent
  outline — a rounded box floating on washi paper, in a design with no rounded corners. Focus now
  moves to the field's underline, which turns vermilion.
- **`z-index: 10050` was not enough.** The window titlebar painted straight through the scrim:
  `elementFromPoint` over it returned the titlebar, not the overlay. z-index is only a rank
  *within a stacking context* — the fix is `createPortal` to `document.body`, not a bigger number.
- **`学校` climbed out of its tile.** The 68px character tile is sized for one character; the
  threshold for setting a query smaller was off by one.
- **Three of my own probes measured the wrong screen.** A clean `userData` dir means first run,
  so the app showed the **SetupWizard** and then **onboarding** — `Ctrl+K` did not work either,
  which is what proved it was the harness and not the new code. Setup is gated by
  `<JPLEARN_USER_DATA_DIR>/models/.setup-done`; onboarding is gated by the *backend*
  (`learningPathStatus.onboarding_complete`), so it cannot be shortcut from the renderer.

## Verified

10 new tests (stable over five consecutive runs), **845 passing overall**, 8 a11y tests, lint
clean. Driven live in Electron against the real bridge: `/` opens from the home screen, `語`
returns N5 and 言 口 五 from `kanji-detail`, the absent fields read as absent, `,` opens settings,
Escape closes both, and a comma typed into the field goes into the field.

---

# Phase 2 — done, 2026-09-01

**The valley menu is the app's front door.** Five section rows and a hero card standing on the
stage, over the world phase 0 put behind them, with the old `HomeView` one titlebar click away.

## What shipped

`src/features/menu/` — 6 files, 12 tests — plus `src/styles/stage.css`, which is the frame
contract extracted from the lookup overlay so there is **one** definition of the board rather than
two. The lookup was refactored onto it in the same change and its tests still pass.

- **Five rows in curriculum order**: THE PATH 道, PRACTICE 練習, THE WORLD 実践, THE EXAM 検定,
  YOU 記録. Six became five — DAILY is a lane inside PRACTICE, which is what the navigation plan
  decided.
- **Each row dispatches to the view that does that job today**: `script_hub`, `daily_games`,
  `passage_hub`, `jlpt_prep`, and the overview panel for YOU. Phase 2 changes the door, not what
  is behind it; phase 4 replaces those one at a time.
- **The hero is derived, never authored.** Everything on it comes from `recommendations` — the
  same `StudyBlockPayload` the old home screen's "Up next" block read — so the menu cannot drift
  from what the app actually thinks you should do. With no recommendation it says *nothing due*
  rather than inventing a number.
- **The crown** carries streak, level and XP from `summary` and `getXpProgress`.

## The locks are real, and that is the point

The mockup's locks were authored demo state so its finished screens stayed reachable. These are
read from `getFeatureState` — the same command `useAchievements` already used for badges — so the
progression game the app has always had finally gates something. On this account, THE WORLD and
THE EXAM draw shut, each naming the milestone that opens it.

Two rules made it honest rather than annoying:

- **Locked is visible and dimmed, never hidden.** You can see the whole game from day one.
- **Nothing is locked until the catalog answers.** A menu that draws five locked rows for a
  moment and then opens four reads as a bug, so the loading state is *not yet known*, drawn open.

**THE WORLD's gate is conversation, not reading**, and the catalog is what says so:
`conversation_mode` opens at `grammar_n5` (step five) where `reading_mode` waits for `reading`
(step eleven). A section opens when its first lane does.

## Making the app transparent

`.app-shell` paints an opaque gradient and sets `isolation: isolate`. While the menu is the front
door it gets `mn-showing` and goes transparent, which is the only reason the valley is visible
at all — phase 0 rendered it, but the app had been painting straight over it ever since.

## The test suite told the truth, and it took four goes to hear it

Changing what `home` renders broke **92 tests across 8 files** — every suite that starts by
reaching for a deck cassette, the "Up next" heading, or the Daily Games button. None of them were
wrong: what they test is the flow *behind* the door.

Making the classic surface explicit took three attempts, and the failures were the useful part:

1. Setting the flag once in `test-setup.ts` fixed **4 of 92** — ten suites call
   `localStorage.clear()` in their own `afterEach`, so it survived exactly the first test per file.
2. Moving it into a global `beforeEach` fixed **41 more** — setup-file hooks run before file-level
   ones, so it now beat the `afterEach` clears.
3. Five suites clear in their *own* `beforeEach`, which runs after the setup file's. Those five
   now say so themselves, one line each — which is better than a global anyway: a suite that
   depends on a particular front door should state it.
4. One test clears storage **mid-test** and re-renders `<App />`. It needed the same line again.

**857 tests pass, 82 files**, 8 a11y, lint clean.

## The toggle

`AppTitlebar` gained one button — a mountain — that swaps between the valley menu and the classic
home, persisted in `localStorage`. It is the phase-2-to-5 scaffolding the third decision asked
for, and it comes out at phase 6.

## What phase 3 inherits

The rows already know their own keys (`STUDY`, `DRILLS`, `READING`, `JLPT`, `RECORDS`) — the same
keys the mockup's `SECTION_ACCENT`, `SUBTILES` and `L2_PLANES` are keyed by — so the L2 work lands
on names that already match. What is still flat is the *model*: `openMenuSection` dispatches
straight to a view, and phase 3 is where that becomes a tree with a real back stack.

---

# Phase 3 — done, 2026-09-01

**The navigation model, and nothing visible.** This is the phase the plan called "the one that
touches everything", and the honest report is that it touches everything *structurally* and
changes nothing a user can see. That is the design, not a shortfall — see the passthrough below.

## Two models, on purpose

The app's own navigation is a flat `AppView` plus an order-of-visit history: six screens, all
siblings, and a `VIEW_PARENT` map so Escape has somewhere to go. That is the right model for six
destinations and the wrong one for a menu three levels deep, because **"up" and "back" stop being
the same question** the moment you can reach one screen two ways.

So `useMenuPath` is a *second, smaller* model sitting above the old one rather than replacing it.
It owns L1 → L2 → L3; the flat views stay exactly as they are at L4. `useAppNavigation` was not
rewritten and not touched — the two coexist, which is what the third decision asked for.

## The passthrough is the whole trick

A section with **no L2 screen yet does not stop at L2** — it goes straight through to the flat
view that does its job today, and the path stays at the root. `L2_READY` is empty, so every one
of the five rows behaves exactly as it did in phase 2.

Phase 4 registers screens one at a time. Each registration silently converts a passthrough into a
real stop **without touching anything that calls this** — there is a test that does exactly that
and asserts nothing else changed.

It matters that a passthrough leaves the path at L1 rather than parking it at a level with nothing
to draw: a level you cannot see is a level Escape would appear to ignore, once, for no reason.

## Escape asks the tree first

Inside the menu, Escape means *up one level*, and only falls through to the flat `VIEW_PARENT`
chain when the tree says it is already at the root. `up()` returns a boolean for exactly that
reason — a silent no-op would make Escape a key that sometimes does nothing.

Two things that had to be right:

- **`up()` reads the current path, not a flag set inside a state updater.** React may call an
  updater more than once, and does in StrictMode, so anything it writes to a closure is not a
  reliable answer to hand back to a caller.
- **The keydown effect's dependency array now carries the tree.** Without it the handler closes
  over a stale path and walks the wrong level — the kind of bug that only shows up on the second
  Escape.

Wiring it meant moving `openMenuSection` and `useMenuPath` above the keydown effect that uses
them; every dependency they need (`navigate`, `tutor`, `openDailyGames`) was already defined
earlier, so it was a move rather than a rewrite.

## The libraries, revisited

Both of this plan's library verdicts were written before the code existed, and **neither survived
contact with it**. The entries above are corrected in place rather than quietly dropped:

- **`react-query` (phase 2) — not taken.** The dedupe it was for already exists by hand for the
  expensive call, and the menu added exactly one new bridge call.
- **`zustand` (phase 3) — not taken.** "State a dozen screens read" is a phase 4–5 claim; at
  phase 3 the tree has two readers and the keyboard layer is inside React already. 75 lines, no
  dependency. Revisit when the screens that justify it exist.

Neither is a rejection of the library. Both are a rejection of adding it *before* the thing it
solves is real.

## Verified

8 new tests for the tree — passthrough, stop, down, up, up-at-the-root, screen-from-the-root,
reset, and the phase-4 registration flip. **865 passing overall**, 8 a11y, lint clean, and driven
live in Electron: the rows still navigate, a locked row still does not, and the toggle still
returns the classic home.

---

# Phase 4 — in progress. The Path, 2026-09-01

Phase 4 is five L2 screens and the plan says "one section at a time". **One is done: The Path.**
The other four still pass straight through to their flat views, which is exactly what the phase-3
passthrough was built for — and the flip cost one line.

## The Path, level two — the journey

`L2_READY.STUDY = true`, and that single registration turned a passthrough into a real stop.
Nothing that calls `enterSection` changed.

**The list is not declared anywhere in the menu.** `domain/progression_curriculum.py` already owns
those sixteen nodes, in that order, and the bridge reports each one's real status — so the rows are
built from `progression.nodes` and a small table supplies only what the backend does not carry: the
Japanese name, and the one line saying what the step asks of you. Live, on this account:

- **TUTORIAL** done · **HIRAGANA** 103/104, the step you are on · fourteen ahead
- `1 OF 16 MILESTONES BEHIND YOU` in the caption, counted rather than stated
- the **one vermilion** is the current step's progress bar, and nothing else on the screen wears it

A node the design has never heard of still renders, with its backend name and no Japanese. A
missing label is a small wrong thing; a silently dropped milestone is a large one, and there is a
test for it.

**Nothing scrolls; overflow folds.** Sixteen rows do not fit the stage and the frame contract
forbids a scrollbar, so a six-row window moves with the cursor and the ends say `▼ 10 AHEAD`. A
count is a fact; a cut-off row is an accident.

Enter reuses `progression.requestOpen` + `openProgressionNode` — the progression map's own pair —
so soft-gating and its confirmation dialog come for free rather than being reimplemented.

## The bug the screenshot could not show

The arrow keys did nothing. The listener is bound to the screen's own subtree rather than to the
window — deliberately, so the menu never eats the arrows a study session needs — but **a subtree
only receives keydown when focus is inside it**, and after a click on the level above, focus is on
`<body>`. Measured live: two ArrowDowns moved the cursor nowhere.

This had been true of **L1 since phase 2** and nobody noticed, because the unit tests dispatch
keydown straight at the root and the live probes only ever clicked. Both screens now take focus on
arrival (`tabIndex={-1}`, the same thing a dialog does).

## And one in the test suite

`useMenuPath.test.tsx` emptied `L2_READY` in its cleanup, which was harmless while the registry was
empty and became a real hazard the moment it had an entry: a test that clears a live registry
un-registers the screens the app ships and leaves whatever runs next testing a different
application. It now saves and restores, and every test states the registry it wants.

## Still to do in phase 4

| section | L2 | state |
| --- | --- | --- |
| The Path | the journey, 16 milestones | **built** |
| Practice | three lanes | **built** |
| The World | two lanes | passthrough → `passage_hub` (the lane card is ready for it) |
| The Exam | the ascent | passthrough → `jlpt_prep` |
| You | the ledger | passthrough → the overview panel |

**880 tests pass across 84 files**, 8 a11y, lint clean, and driven live: THE PATH stops at L2,
the arrows walk it, Escape goes up one level rather than out, and PRACTICE still passes through.

## Practice, level two — three lanes

The second registration, and the card it is built from is deliberately **shared with THE WORLD**,
which is two lanes of the same thing. The mockup made that call and the reason holds in code: both
screens answer *which of these do you want to do*, nothing on either is ordered or gated against
its neighbour, and a learner who has learned one should not have to learn the other. So `Lanes`
takes N lanes and the screens differ only in what fills them — The World is now mostly data.

Live, on this account: **REVIEW 2 cards due · DRILLS 17 modes, 5 skill groups · DAILY GAMES 4
puzzles**, all counted from `summary.decks`, `MINIGAMES` and `DAILY_GAME_TILES` rather than stated.

**One obligation wears the vermilion.** Reviews are the only thing in this menu that is *owed*
rather than chosen, so the review lane's action slab is the single red thing on the screen — and
it stops being red when nothing is due, because then it is not an obligation either. A clear day
draws as an em dash and `NOTHING DUE`, never as `0 CARDS DUE`.

Three lanes, three genuinely different destinations: `jumpToScriptHub`, `jumpToScriptHubMinigame`
and `openDailyGames`.

### The comment that nearly proved its own point

`lanes.ts` carries a rule — *figures are counted, not copied* — and the first draft of its comment
said the app had **21** drills against the mockup's seventeen. 21 is how many entries the
`MinigameKey` *union* has; `MINIGAMES`, the array the drill picker actually renders, has **17**,
and the design was right all along. The running app is what caught it. The rule stands and the
anecdote is now the comment: a number transcribed into a comment goes stale exactly as silently as
one transcribed into a screen.

**892 tests pass across 85 files**, 8 a11y, lint clean. Driven live: PRACTICE stops at L2, the
arrows walk the three cards, Enter opens each one's own destination, and Escape returns to L1.
