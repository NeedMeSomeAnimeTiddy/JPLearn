# PLAN — the whole app as a tree

Agreed 2026-08-16. This is the canonical shape of the app's navigation; the mockup, the
design system and the port should all be read against it. Where a screen already exists it
says so, and where a decision was taken it says who took it and why.

## The two findings this is built on

**1. The app already has a progression game and no UI for it.**
`domain/feature_catalog.py` gates nine features behind curriculum milestones — `listening_mode`,
`conversation_mode`, `kanji_mode`, `reading_mode`, `jlpt_dashboard`, `tutor_chat`,
`advanced_analytics`, `themes`, `achievements`. The bridge exposes `feature-unlocks` and
`electron/ipc_handlers.cjs` forwards it. **No React file calls it.** The app was built to grow
and currently arrives fully grown.

**2. The curriculum is a menu of the other menus.**
`STUDY_PATH` / `domain/progression_curriculum.py` is 16 nodes, and ten of them are `kind: 'goto'`
whose only action is to jump to another section — including `reading`, `listening` and
`jlpt_n5`–`n1`. Two of them (`scripted_conv`, `free_conv`) point at `null` while
`features/scenario-tutor/` is one of the most finished things in the repo.

**The fix for both is the same.** The curriculum stops being a section that links to sections and
becomes the spine that *unlocks* them. A `goto` node is no longer a door — it is the moment a
section appears.

## The five sections

Six become five, and a first-run player sees one unlocked.

| | section | what it is | unlocked by |
| --- | --- | --- | --- |
| 1 | **The Path** 道 | the spine — all new material, and the only thing that unlocks anything | always |
| 2 | **Practice** 練習 | using what the path taught: reviews, drills, daily games | first cards exist |
| 3 | **The World** 実践 | real Japanese — reading and conversation | `grammar_n5` — see below |
| 4 | **The Exam** 検定 | JLPT readiness and mocks | `jlpt_n5` node |
| 5 | **You** 記録 | streak, year, level, achievements, settings | always |

Plus **Look it up** 引く — an overlay on one key from any level, not a section.

### What moved, from today's six

- **STUDY → The Path.** Its ten `goto` steps become unlock milestones rather than doors.
- **DAILY dissolves.** Its four puzzles are practice; its daily goal moves to the L1 hero and crown.
- **DRILLS → a lane in Practice.** Drilling is done *to* material the path gave you; it was never
  a peer of the curriculum.
- **READING → a lane in The World**, joined by conversation, which today has no home at all.
  **Built 2026-08-31, and the unlock order came out the opposite way round from what this plan
  assumed.** `domain/feature_catalog.py` opens `conversation_mode` at `grammar_n5` — step five of
  sixteen — where `reading_mode` waits for `reading` at step eleven, and `tutor_chat` (free talk)
  chains off `conversation_mode`. So **Talk opens six steps before Read**, the section's own gate
  is GRAMMAR rather than READING, and there is a six-step window in which The World is open and
  half of it is not. That window is a real state most early accounts will sit in, so the Read lane
  draws it (press `L` on the screen) rather than the mockup pretending the section arrives whole.
- **JLPT → The Exam.** Same shape, gains the level three it never had. **Built 2026-08-31**,
  and the ascent gave up the detail panel that was doing a level three's job from inside level
  two. The new screen carries the fact nothing in the app stated: the vocabulary-and-grammar
  section is a separate gate, so a total above the pass mark with that section below 19 (or 38
  at N4/N5) is still a fail. It also draws what the app *cannot* project — there is no
  listening content, so `overall_passes` is always False and the total is hatched, not zeroed.
- **RECORDS → You.** Gains achievements, history and settings.
- **New: Look it up.** `dictionary-search`, `kanji-detail`, `lookup-sentence`, `assistant-chat`
  and `assistant-chat-ocr` all exist on the bridge and appear nowhere in the menu.

## The levels

**L1 — the valley menu.** One hero card carrying the app's opinion of what to do now, from
`recommendations` + `study-queue` + `daily-goal`. Five section rows beneath it. Crown carries
streak, XP, level. *Built; the hero and the progressive reveal are new.*

| section | L2 — the shape | L3 — the thing | L4 — doing it |
| --- | --- | --- | --- |
| The Path | the journey, 16 milestones **[built]** | a deck's blocks **[built]** · today's words **[built]** · an unlock moment **[new]** | the study session *(in the app)* |
| Practice | three lanes **[new]** | review **[new]** · drill picker **[briefed]** · daily games **[built]** | the game runs *(in the app)* |
| The World | two lanes **[built]** | the library **[built]** · pick a scene **[built]** | the reader · the conversation *(in the app)* |
| The Exam | the ascent **[built]** | a level **[built]** | the exam runs *(in the app)* |
| You | the ledger **[built]** | achievements · history · settings **[to design]** | — |

Everything marked *(in the app)* exists as a React feature today and is not a menu screen —
`features/study-session`, `MinigameView`, `features/daily-games`, `features/passages`
(`PassageReader`), `features/scenario-tutor` (`ScenarioPlayer`), `JLPTPrepView`.

## The four decisions

Taken 2026-08-16. Each was a genuine fork; each can be reversed, and the cost of reversing is
noted.

**1. The path is one straight chain**, not a branching map. 16 milestones in a line, one open.
Already built and measured as the `path` screen. Chosen for zero ambiguity about what is next,
which is the thing a casual user needs most. *Reversing this means a new screen and a real graph
in the curriculum data, which is currently a flat list.*

**2. Locked sections are visible, dimmed, and name their unlock** — "reach READING on the path"
— rather than being hidden. You can see the whole game from day one. *Reversing costs one
conditional.*

**3. Due reviews get a lane in Practice AND the L1 hero when any are due.** Two doors, one
obvious: the hero is the first thing you see, the lane is how you get there deliberately.
Reviews are the daily SRS obligation and burying them is the classic failure of this kind of app.

**4. Labels are English-led with Japanese as texture.** PRACTICE large, 練習 small.

> **This costs exactly one component.** L1's rows are *already* English-led — `.st-en` is 19→26px
> heavy italic Latin against `.st-jp` at 14→17px mincho. It is the L2 heading slab that is
> inverted: `.hud-title b` is 34px mincho Japanese and `.hud-title i` is 14px Latin. Flipping that
> one hierarchy is the whole change. The kanji chip, the reading and the vertical type all stay.

## Libraries

**Already installed and underused** — lean on these before adding anything:

- **`motion`** (v12) — shared-layout transitions between L1→L2→L3 are what make a tree feel like a
  place rather than a set of pages. Installed; navigation is not animated today.
- **`embla-carousel-react`** — the road shape. **`react-activity-calendar`** — the year band.
- `hanzi-writer`, `wanakana`, `howler`, `@dnd-kit`, `@radix-ui/*` — all in use, all keep.

**Worth adding:**

- **`@tanstack/react-query`** — the strongest case. The bridge is strictly serial and a timed-out
  request rejects *every* other in-flight one (see CLAUDE.md). Query gives request dedupe, so two
  components asking for `summary` make one call; staleness-based caching; and one place for retry
  policy. This is a mitigation for a documented failure mode, not a convenience.
- **`zustand`** — `App.tsx` is already past the 2,000-line warning and holds most session state; a
  four-level tree makes that worse. ~1KB, no provider, and works outside React, which the keyboard
  layer wants.
- **`@tanstack/react-router`** — *optional.* Nested routes map one-to-one onto L1→L4 and back/
  forward comes free, but this is Electron with no URL bar and `features/navigation` exists. Worth
  it only for deep links in tests.

**Deliberately not adding:** a component library (the design is bespoke and square-cornered;
Radix covers the two behaviours needed) · a chart library (the ledger's drawings are hand-made and
better for it) · a virtualisation library — **the frame contract's overflow rule means nothing
scrolls**, so windows are computed rather than virtualised · i18n (single locale).

**The valley ships** (decided 2026-08-16). The 3D world comes into the product, so `three` is a
real dependency — but **`@react-three/fiber` and `drei` probably are not**, and that is worth
stating plainly because it is the difference between a week of work and a month.

> The mockup is already split the way a React port wants: the valley is a `<canvas>` driven by
> imperative three.js, and the entire interface is screen-space HTML on top of it. React only ever
> needs to own the HUD. Rewriting ~25,000 lines of working world code into a declarative scene
> graph buys a reactivity model that a fixed, authored world does not need. Mount the world module
> as-is in one component, give it an imperative handle for `flyTo(section)`, and let React own the
> 2D layer — which is what it already owns today.

**What the world actually costs.** Runtime payload is `world.glb` 44.6 MB + `people.glb` 0.1 MB +
`boatlamp.glb` 0.02 MB + ~1.1 MB of three.js and addons. In a browser that would be disqualifying;
**in Electron it is nothing** — it loads from local disk in an app whose runtime is already ~150 MB,
with WebGL guaranteed by the bundled Chromium and no network fetch at all. The real costs are
elsewhere and both are measurable: **cold start** (the mockup needs ~4s before the menu is usable,
which is a long time to look at nothing) and the **frame budget** while the menu is up. Neither is
a reason not to ship it; both need a number before the port is called done.

## What is not decided

- Whether READING's level four is a frame-contract screen or a full-page reader. It is the app's
  `PassageReader`, and the stage/moat rules probably should not govern a page of prose.
- Where onboarding sits. `complete-onboarding` and `features/onboarding` exist; the tree has no
  slot for a first run — and with the valley shipping, a first run is also the first time anyone
  waits four seconds for a menu.
