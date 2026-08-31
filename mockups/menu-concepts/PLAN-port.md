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
in the whole port — `searchDictionary`, `getKanjiDetail`, `lookupSentence` and `downloadDictionary`
are **all already in `preload.cjs` and called by nothing**. This is a UI over a wire that exists.

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
- **`zustand`** — yes, at phase 3. Problem 3 is the reason: navigation state a dozen screens read,
  in a file already past the size warning. ~1 KB, no provider, and it works outside React, which
  the keyboard layer wants.
- **`@tanstack/react-query`** — yes, at phase 2. Not a convenience: the bridge is strictly serial
  and a timed-out request rejects *every* other in-flight one. L1 alone wants `summary`,
  `recommendations`, `daily-goal` and `feature-unlocks` on every paint. Dedupe is a mitigation for
  a documented failure mode.
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

One lever has not been pulled: three keeps a CPU-side copy of every vertex attribute after
uploading it to the GPU, and `BufferAttribute.onUpload` frees them. That should take a bite out
of the 253 MB renderer figure and is untried. **Do that before treating 778 MB as final.**

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
