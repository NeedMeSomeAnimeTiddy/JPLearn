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

## What I would want answered before phase 0

1. **Scope: A, B or C.** Everything above assumes B.
2. **Is 52 MB and a 3.1 s cold boot acceptable?** If not, phase 0 becomes an optimisation project
   first — the lightmap is 7.6 MB of PNG that should be a compressed texture, and `world.glb` has
   never been Draco'd or meshopt'd. Both are real wins and neither has been tried.
3. **Does the old chrome stay reachable?** During phases 2–5 the tree and the flat views coexist.
   A titlebar escape hatch back to today's UI makes each phase safe to ship; without one, every
   phase is all-or-nothing.
