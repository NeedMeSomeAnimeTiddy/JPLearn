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

- **`three`** — new, and not optional. The world and the flights are the design.
- **~~`gsap`~~ — NOT NEEDED, and this premise was wrong.** The claim was that the camera work is
  authored against GSAP's easing. It is not: `turnTo` runs `ease: 'none'` on a linear 0→1 drive
  and applies `easeInOutSine` by hand inside its own `onUpdate`. GSAP was the clock and nothing
  else. Its one real contribution, `ticker.lagSmoothing(34, 16)`, is three lines of capped `dt`.
  The flights ship with no new dependency.
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
| The World | two lanes | **built** |
| The Exam | the ascent | passthrough → `jlpt_prep` |
| You | the ledger | **built** |

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

## The World, level two — two lanes on Practice's card

The third registration, and the one that tested whether the shared card was a real decision or a
nice sentence. It was real: no component came with this screen. `Lanes` grew two OPTIONAL parts
— the milestone chip and the list of what is inside the lane — which PRACTICE simply does not
pass, and the rest of THE WORLD is `worldLanes.ts`, which is data.

Live, on a seeded account: **READ 30 texts · TALK 2 scenes, 2 played**. Both doors driven — READ
lands on the Passages hub, TALK on Scenario Practice — arrows walk the two, Escape returns to L1.

### Three of the mockup's figures were wrong for the app, and the data said so

- **"4 BANDS BY DIFFICULTY" is one band.** All thirty passages report
  `difficulty_label: 'beginner'`; the hub sorts on `(label, score)` and draws one chip. The foot
  says what is true instead.
- **"NEW" and "38%" cannot be said at all.** `usePassages` holds its progress map in `useState`
  and nothing persists it, so between visits the app knows nothing about what you have read. The
  mockup's tags were derived from a library that remembered. Ours tag the one figure the data does
  carry — the length — and the foot states the absence outright rather than printing a zero.
- **The gloss under a text cannot be English.** The mockup's rows were Japanese title over English
  gloss; thirty Aozora Bunko texts carry no English anywhere. The author takes that slot, and
  `enJp` puts it in the Japanese face — a Japanese name set in a Latin UI face is how you get tofu.

What the app could do that the mockup could not: **count the conversations actually played.**
`scenario_sessions` is a real table behind `listScenarioSessions`, so TALK's foot counts where
READ's cannot — which is the whole difference between the two lanes' feet.

### The three texts are the first three through the door

Not "the easiest three" by some rule of this screen's own — `sortByDifficulty` is the hub's own
comparator, so the card shows literally the top of the list it opens onto. Four texts tie at
difficulty 0.0 and the sort is stable, so the tie falls out in payload order on both screens. Any
other rule would have let the card and the screen behind it disagree about which text is easiest.

### The lock is the only red, so the hollow row gave its up

Free talk sits in TALK's list because it is a third thing you can enter, and it is hollow because
it is not authored content with a start and an end. The mockup marked its tag vermilion; on screen,
next to a shut READ lane, that was two reds — and `ANY TOPIC` pulled harder than the action slab
did. THE WORLD owes you nothing, so the only red it is allowed is a lane the curriculum has not
opened. The tag is italic now, which is how an absence is set everywhere else in this menu.

**And the chip changes tense, not just colour.** "OPENED BY READING" in red, on a door that has
never opened, is a sentence arguing with its own styling. Shut, it reads OPENS AT READING.

### The gate could not be faked, so the account was seeded

`contextBridge` exposes `window.jplearnDesktop` frozen and non-configurable — measured, after the
first probe silently did nothing — so no renderer-side stub can move a feature state. This account
is at step three, where THE WORLD's L1 row is locked and unenterable. Each run instead got its own
copy of the real progress DB with the `user_feature_unlocks` rows the app itself writes: one with
`reading_mode`, one without. Every figure on both screenshots, the lock included, is read from a
real backend.

That second account is the **six-step window** — GRAMMAR has opened the section and TALK with it,
READING has not arrived — and it is where most early accounts will sit. Both the chip and the
unlock sentence name the milestone with `milestone()`, which reads the curriculum's own node name,
so THE WORLD says GRAMMAR N5 exactly as the path screen does. (L1's own row still says "reach
GRAMMAR", authored in `constants.ts` — the one place left that transcribes a milestone.)

### Two fixes it turned up on the way

- **The card row's bleed had to be re-derived for two-up.** 190/900 sat 10px inside the stage on
  one side and 6 on the other, because the frame contract's half-extent rule is written for
  `rotate(-1.2deg)`, where the lean partly cancels the skew — the second card in every lane row is
  `rotate(1deg)`, where it adds. At h=312 that is 18.6px of bleed against 24.6. Laid at 184/906 the
  row measures 165.5–1114.1 against a stage of 160–1120, centred within 0.2px.
- **`Lanes` refocused itself on every render.** The focus call lived in the keydown effect, whose
  deps include the lanes array — fine for PRACTICE, which builds its lanes synchronously, and not
  fine for THE WORLD, whose two figures arrive from the bridge after the screen is up. It would
  have snatched focus back out of wherever the reader had just put it. It is a mount effect now.

**909 tests pass across 86 files**, 8 a11y, lint clean.

## The flights — and the four phases of camera that were quietly wrong

Robbie stopped the port to ask why the camera was spinning and where the transitions were. Both
answers were bad, and neither was a regression: they had been true since phase 0.

**The spin was a measuring instrument.** `valley.ts` turned the camera 0.02 degrees a frame so that
the frame cost phase 0 was pricing came off a MOVING frame rather than a still one. It had no
business surviving the phase; it survived three more, and what it turned the valley into was a
photograph revolving behind the menu. Two frames 1.6 s apart are now pixel-identical at rest.

**The flights had never been ported at all.** Four levels of HUD had been built over a world the
camera could not travel in. They exist now: `flight.ts` (the move), `destinations.ts` (the five
shots), and two calls the menu makes through a shim that imports no three, so the lazy 600 KB
chunk stays lazy.

### The menu had been standing in the wrong place since phase 0

Phase 0 looked through world.glb for a camera named MainMenu, found `Camera_MainMenu` at
(-500, 460, 1900), and stood there. The mockup does not use that camera: `composeWorldHome` puts
the eye at **(0, 2000, 6000)** and SOLVES the aim so Fuji's measured summit lands at frame
(0.76, 0.24) at a 43-degree lens. Those two points are 4,100 apart in z and 1,540 in height.

It was invisible while the camera never moved — it just looked like a murky shot. It stopped being
invisible the moment there were routes, because **every `mid` in `flights.json` was flown and
saved from the composed point**: solved through their middles from the authored camera, the route
to the pagoda swung 2,400 units BACKWARDS over the menu before turning round, and the middle of
the move came back as a black frame with nothing in it but petals. That was diagnosed as fog first,
and it was not fog. From the right standing point the menu is the composed valley shot — Fuji
right of centre, the shrine approach, the lake and its bridge — which is a different screen from
the one this port has been drawing on for four phases.

### A kink at u = 0.90, on every route, out and back

The mockup aims the lean at a point `FLIGHT_LEAD` (0.10) further along the arc:
`getPointAt(Math.min(1, u + FLIGHT_LEAD))`. That `Math.min` pins the lead point to the endpoint for
the last tenth of every move while the eye keeps closing on it, so the tangent's rate of change
steps. Measured on the way home from THE PATH at 60fps, the aim turns 0.26, 0.36, 0.46, 0.63, 0.88,
1.02 degrees a frame as u climbs to 0.9006 — and 0.13 on the very next frame. An eightfold collapse
in the rate of turn, nine tenths of the way through. Asking the curve for its own tangent
(`getTangentAt`) removes the constant and the clamp together; the rate now runs 0.165, 0.162,
0.160, 0.158 straight through the same stretch.

### Three of the tests were asking the wrong question, and the flight was right

- **"flies through its mid at halfway"** — every route missed by 70 to 780 units. `sample` walks by
  ARC LENGTH and half the arc length of an asymmetric curve is not t = 0.5. The clearance work only
  needed the path to GO through the gap; closest approach is under 5 units, which is the sampling
  step.
- **"turns no faster than 2 degrees a frame"** — a number nobody measured. Medians run 0.14 to 0.73
  across the ten legs, in line with the mockup's own 0.15–0.47; peaks reach 2.58 on THE EXAM's way
  home, which reverses 151 degrees over the shortest arc on the board and is perfectly smooth. A
  snap is one frame far outside ITS OWN NEIGHBOURS, so that is what is asked now.
- **"leans less going back than out"** — failed on THE WORLD by a degree, because both legs run into
  the 15-degree cap and the achieved deviation is set by the cap rather than the fraction. What the
  smaller fraction is FOR is pitch: every return stays between -13 and +19 degrees except THE EXAM,
  a pagoda you arrive looking 17 degrees up at.

**45 flight tests**, and they sample exactly what the render loop samples.

### What the flights then exposed, which is not the flights

The **lighting is still phase 0**: one ambient, one directional, a flat colour for sky. The fog was
6,000 to 26,000 — tuned for a static shot in a valley 26,000 units across — so a camera crossing it
looked into black; that is pushed out to 18,000–62,000. The sky is a two-stop gradient now instead
of a single colour, deliberately dull, because the real rig (a sun composed in frame, god rays, a
shadow map, a day cycle) is Robbie's to author and inventing a look here would be worse to undo
than a void. Looking up still reads as night over a lit valley. **That is the next thing the valley
owes, and it is bigger than the flights were.**

**954 tests across 87 files**, 8 a11y, lint clean. Driven live: still at rest, the screen arriving
at 82% of the move rather than over a camera still crossing the valley, Escape taking the board off
at once and the camera following it home — landing on pixels identical to the frame it left from.

## The lighting, and then the shafts

Robbie asked for the lighting after the flights handed him a working camera in a valley that read
as night. All four of the mockup's layers are in now.

**The rig, the graded sky and the sun** came first: key `0xffc189` at 6.4 against a `0x6f8bd6` fill
at 1.35 and a hemisphere at 0.44, `Landscape_Props_SkyDome_001` keeping its painted image and taking
a per-fragment grade on top, and a disc that TERMINATES with about one percent of limb. Shadows at
4096 square over a ±9000 box, one build, `normalBias` 4 rather than 12 — twelve units is most of a
fence post, so the small stuff cast nothing and the meadow read as evenly lit ground under a low
sun, which is the one thing it cannot be. The sun is placed by COMPOSITION: unprojected through
the standing camera at the middle of frame, 30% down, 50,000 out.

**Then the shafts**, which are the layer the previous pass stopped short of because they need to
know what is open sky. The mockup gets that free from a full-resolution normals-and-depth prepass
it runs for its ink outlines; this port has no outlines, so it renders the cheapest thing that
answers the one question the march asks — the whole scene in black on a white field, at half
resolution, with `scene.overrideMaterial`. Then a 28-step jittered radial march, a separable
gaussian each way, and one additive overlay carrying the shafts, the aureole and the bleed.

**The atmosphere needed a layer of its own.** The dome and the disc are meshes like anything else,
so on the default layer they fill the mask solid and there is no sky anywhere to shaft through.
`ATMOS_LAYER` is turned off for the mask pass and left on for the render — and it takes them out of
the shadow map for free, because three tests an object's layers against the LIGHT's.

**And the mask pass is where a pending shadow build would have landed.** It is a whole scene pass
sitting immediately before the real render, which is precisely the shape of the mockup's own bug:
its one shadow map was consumed by the lake reflection, a pass that clips at the waterline, and the
valley had no shadows in it for weeks. `shadowDirty` is lowered immediately before the main render
and nowhere else, so there is never a pending build while the mask runs.

### What it costs, measured

At 1,280 × 822 with vsync off: **2.10 ms a frame with the shafts against 1.06 without** — they
double the cost of drawing the valley, which is exactly what a second scene pass over 2.8 million
triangles should do. Both pin at the 165 Hz cap with vsync on, so the first measurement said 165
against 165 and meant nothing.

So the mask pass is **skipped outright when the sun is off screen**, which is most of this menu:
four of the five destinations face away from it, and a mask marched toward a sun nobody can see is
a whole scene pass drawn for a glow multiplied by zero. `?rays=off` turns the layer off entirely,
the way `?valley=off` does the world.

### Still owed

The **legibility pass**. The ascent's columns are `rgba(12,10,8,0.72)` and I tuned them against a
valley that was accidentally black; over a lit pagoda the plinth text and the lock chips lose their
footing. The frame contract already names this failure — *everything above y560 brings its own
ground, and a screen that needed the global scrim to be legible was never legible, it was being
carried*. Mine was being carried. The contract's foot band is ported now (nothing across the top
three quarters, 0% at y560 to 28% at y720), but the L2 screens want a pass against real lit plates.

And the valley is lit but not **alive**: no day cycle, no lanterns, no crowd idle, no walkers. That
is a separate system and a large one — 362 clustered lantern lights, 1,059 idling figures, closed
walker loops — all of it described in the lighting memory.

**954 tests across 87 files**, 8 a11y, lint clean.

## The legibility pass, and the bug it was hiding

The lit valley was supposed to have cost the L2 screens their contrast. It mostly had not — and
finding that out took three instruments, each wrong in its own way, before the pixels settled it.

- **The first read `backgroundColor` up the ancestors** to find what each label stood on, and called
  the lane slabs and the path rows groundless at a contrast of 1.00. Every card in this menu is
  painted with a LINEAR GRADIENT, and a gradient leaves `backgroundColor` transparent.
- **The second measured the tonal spread inside each label's box** and flagged 36 of 42 labels on
  THE PATH. That figure is dominated by how much of a box is glyph rather than paper, so ordinary
  secondary type — `pj-want`, `mn-desc` — scored as failures while reading perfectly.
- **The third asked the question the contract actually asks**: does the world REACH this label?
  Two frames, one over the lit valley and one with the canvas hidden, and any label whose pixels
  move is one the world is carrying. That one works, and its answer was that the type was fine
  nearly everywhere: the crown scored 1.01 on the second instrument purely because that instrument
  ignores the 4.6px ink keyline which IS its ground.

### And then the zoom found what none of the numbers had

`--gold` was never defined. `stage.css` shipped `--gold-hi` without it, and the ascent paints every
column's fill with `var(--gold)` and only the selected one with `var(--gold-hi)`.

An undefined custom property does not throw and does not warn — the declaration is invalid at
computed-value time and the property falls back to its initial value, so `background: var(--gold)`
is `background: transparent`. **Four of the five bars on the ladder drew as empty tracks and the
target's plinth let the pagoda through its own name.** Against phase 0's accidentally-black valley
none of that was visible; it survived a build, a lint, 954 tests and several rounds of looking at
the screen, and was found by lighting the world and then zooming in at 2x.

`menu.css.test.ts` now asserts that every `var(--x)` in the menu's three stylesheets is declared in
one of them or set from TypeScript (`--acc`, `--lk-u`), and that nothing is declared and never read.
Checked by deleting `--gold` again: two of its three tests fail.

### One real violation, and its numbers are solved rather than chosen

`.as-plinth.locked` at `rgba(12, 10, 8, 0.6)` — over a black world it read perfectly, and over the
lit pagoda the crowd walks through the digits. Opaque now, at `#231f19`, lifted off the ink the open
plinths use so a locked level still reads as inert. On that ground washi at 0.30 gives a contrast of
2.47, which is what `0 / 2,193 MASTERED` was set at and why it could not be read; 0.52 gives 4.6 and
the level id at 0.58 gives 5.5. Re-measured: **0.0% of every plinth's box moves when the world is
taken away**, against 72–100% before.

**957 tests across 88 files**, 8 a11y, lint clean.

## The ledger — YOU's level two, and the end of phase 4

RECORDS IS A LEDGER, NOT A ROAD: its figures are things you READ, not places you go — there is
nothing inside a streak to open — so it is the one section that does not get the road. The current
run is set large with your best standing behind it in the same face at fifteen percent ink, so the
two are read against each other without a second scale, a second axis or a word of explanation.

**The year is real here and it was not in the mockup.** The mockup's own note says so: the lifetime
count and the year's SHAPE came from the database, and the individual days were SYNTHESISED from
those parameters, because a year of real dates is 365 lines of data to carry a drawing that only
needs the distribution. `daily-activity` returns exactly that year — `{date, count, accuracy}` per
day — so the bars here are the days themselves. Live on this account: **5 of 364 days, 19 reviews,
74% accuracy**, which draws as two gold bars at the right-hand end of a band of floor ticks. That is
what a real early account looks like and the screen has to survive it.

### Two of the mockup's six figures are not drawn, because the app does not have them

- **RANK** (段級, "7TH GRADE") is not a thing JPLearn tracks. There is no grade system anywhere in
  `domain/`, and LEVEL is the app's own idea of the same shape — the mockup carries both.
- **STUDY TIME** in hours has no source either: `session_history` carries `started_at_utc`,
  `target_items`, `reviewed`, `correct` and `accuracy`, and no duration at all.

A figure with no source is not drawn. That is a different thing from an absence of DATA, which this
menu draws as an em dash and a sentence — printing "STUDY TIME —" would promise a measurement the
app has never taken. What replaces them is REVIEWS, which the year already counts.

### Where the calls are made from, and why this one differs

The other four L2 screens take an `enabled` flag from `App`, because their hooks live there. This
one makes its two calls from INSIDE the component, which is better and only possible here: it is
mounted exactly when the ledger is up, so being mounted IS the flag. And the badge count comes from
`useAchievements`, the app's own hook, which already folds three sources into one earned set —
feature badges, milestone badges and node mastery. Re-deriving that would have been a second answer
to a question the app has already answered.

### One collision, and which object moved

The level strip is the one plate that lives in the FOOT BAND, and the key hint lives there too: at
y612 it ran straight through "0 / 150 XP THIS LEVEL". Moving the strip up instead would push it back
onto the year band, which is already at the bottom of what the stage has — this screen simply has
one more object in it than the others — so the hint moves down to 648 on this screen alone.

**Phase 4 is done.** All five sections stop at their own level two; nothing passes through any more.
The passthrough mechanism stays, because level three is the next thing to fill in the same way.

**975 tests across 89 files**, 8 a11y, lint clean.

## Phase 5, part one — four of the seven level threes

| screen | parent | state |
| --- | --- | --- |
| scenes | THE WORLD · TALK | **built** |
| the wall | YOU | **built** |
| the library | THE WORLD · READ | **built** |
| one rung | THE EXAM | **built** |
| modes | PRACTICE · DRILLS | a deck rail, a scrolling strip, a centred hero and a mini-chart |
| deck · feed | THE PATH · a milestone | block progress, and the 186-block vocabulary feed |

### The wall, and the second time the same rule caught me

Twenty-five seals in the catalog's own three categories, walked on two axes — left and right run the
whole set so every seal is reachable by holding one key, up and down jump a group. **The description
IS the requirement**: every string in `BADGE_METADATA` says what earns the badge, so an unearned
seal has something to say without a second field being invented for it.

A seal wears the badge's own icon rather than a glyph. The mockup gave each of its badges a Japanese
one, authored for the mockup and existing nowhere in this app — inventing twenty-five kanji to keep
the all-type vocabulary would be inventing exactly what this port refuses to. That icon map moved
out of `AchievementsPanel`, where it was module-private, so both screens read one copy.

**And the unearned seals were drawn translucent**, which over the lit valley made them ghosts with
invisible marks in them — the identical failure the ascent's locked plinths had, for the identical
reason: it read perfectly while the world behind it was accidentally black. Same fix, same solved
ground.

### The library, and the progress column that is not there

Thirty texts, six on the stage, the ends saying how many are folded away — this menu's overflow law,
not this screen's. Live: **30 TEXTS · ALL BEGINNER · 10 HOURS OF READING ALOUD**, all counted.
Forty words a minute is a beginner reading aloud and is the one assumption on the screen, so it is
named rather than buried in an expression.

The mockup drew a "HOW FAR YOU GOT" track on every row. There is none here, for the reason the lane
above already found: `usePassages` keeps its progress map in component state and nothing persists
it. Thirty empty tracks would be thirty claims that you have read none of them, which is a different
statement from the app not keeping the answer. The note says which, once.

### One rung, which carries the fact nothing in the app states

The JLPT does not add your papers up: **the vocabulary-and-grammar section is a separate gate**, and
a total above the mark with that section below 38 — or 19 at N3 upward — is still a fail. Both
numbers have been on `JLPT_LEVEL_SPECS` and reported to the renderer all along, and no screen has
ever drawn what they are for.

**And what the app cannot project is hatched, not zeroed.** `domain/jlpt_readiness` says it in its
own docstring: listening is not assessed in this system, and at N1–N3 reading is its own paper too.
So the app can speak for one section and never for the total out of 180 — 60 points of it at N4/N5
and 120 at N3 upward simply have no source. A zero there would be a prediction that you fail; an em
dash is the truth, which is that nobody asked. Live on the seeded account: **N4, YOUR TARGET, 84%,
PAST THE LINE**, both tracks hatched, and *60 POINTS OF IT ARE LISTENING, WHICH THIS APP HAS NO
CONTENT FOR*.

The projection is not recomputed: `project_mock_score` already runs in `domain/jlpt_sessions` and
its answer is stored on the result. And the four ways in each carry what they are FOR — two move the
readiness figure, one measures it, one finds your level — which the app's own descriptions, being
about mechanics, never say. `MODE_META` moved to `constants.tsx` so the view and the menu share one
copy, the same lesson `--gold` taught.

**1,007 tests across 91 files**, 8 a11y, lint clean.

## The drills road — phase 5's fifth, and the last one that is not a deck

Seventeen modes on a road, and the deck you run them on. **Both axes were already in the app**:
`MINIGAMES` is the seventeen the picker renders, `MINIGAME_SKILL_GROUP` puts each in one of five
groups, and `SCRIPT_MINIGAMES` says which of them a deck offers. Nothing is invented and every
figure on the screen is counted out of that last map.

**THE FOLD IS IN THE WIDTHS.** A mode the chosen deck does not offer is given width zero and the
cursor walks the OFFERED list rather than all seventeen — the road closes over it with no special
case anywhere else in the drawing, and no gap for the selection to land in. Changing deck snaps
outward to the nearest mode that deck still offers, so the cursor can never rest on a fold. Live:
**12 OF 17 MODES RUN ON HIRAGANA**, twelve tabs laid out, and *5 MODES DO NOT RUN ON HIRAGANA* said
out loud beneath — a road that silently omitted them would read as a shorter catalogue.

The road is TRANSLATED rather than scrolled: the selection is held at the strip's middle and the
rail moves under it, so the thing you are choosing never moves and the catalogue does.

**The order is derived, not a second list.** `MINIGAMES` is in catalogue order, which interleaves
the groups; the road reads as five chapters, so it is sorted by each group's own `order` and then by
catalogue position. The chapter name rides the tab that OPENS its chapter rather than a separate
marker layer — with five chapters over a road that is already moving, a second layer is a second
thing to keep in step.

**And the hero says which decks offer it** — `SCRIPT_MINIGAMES` read the other way round, and the
one fact a learner picking a drill cannot get anywhere else in the app. Romaji Sprint reads *ON 3 OF
6 DECKS*.

One observation for Robbie rather than a change: `MINIGAME_SKILL_GROUP` maps **`sentence_assembly`
to `listening`**, so "Sentence Assembly" opens the LISTENING chapter. That is the app's own mapping
and the screen reports it faithfully; whether arranging shuffled chunks belongs under listening is a
question about the catalogue, not about this drawing.

The screen also hands over BOTH axes when it starts a drill, where the lane above could only pass
the deck the hub happened to be holding.

**1,015 tests across 91 files**, 8 a11y, lint clean.

### What is left of phase 5

| screen | parent | why it is not next |
| --- | --- | --- |
| deck · feed | THE PATH · a milestone | block progress per deck and the 186-block vocabulary feed — two screens over `block-progress` and `deck-cards`, and the largest data surface in the menu |

