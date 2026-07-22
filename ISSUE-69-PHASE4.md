# Issue #69 — App.tsx decomposition: state of play and the Phase 4 plan

Working handoff document. Delete it when #69 closes.

Branch: `refactor/issue-69-phase4b` (branched from `main` at `9888cc0`).
Phases 1–3 and 4a are merged into `main`; 4b and 4c are on this branch.

## Where things stand

| Metric | At filing | After 4a | After 4b | **After 4c** | Note |
|---|---|---|---|---|---|
| `App.tsx` lines | 7,451 | 4,060 | 2,880 | **2,802** | −62% from filing |
| `useState` | 112 | 111 | 67 | **65** | 44 → `useStudySession`, 2 → `useAppNavigation` |
| `useRef` | — | 43 | 27 | **24** | 3 more → `useAppNavigation` |
| `useCallback` | 60 | 73 | 58 | 56 | |
| `useMemo` | 27 | 27 | 23 | 23 | |
| `useEffect` | 34 | 34 | 28 | 27 | |
| Frontend tests | 561 | 605 | 605 | **616** | +11 routing gate |

**The issue's original complaint — 112 `useState` in an "orchestrator only" component — is
resolved.** Session state lives in `src/features/study-session/useStudySession.ts`; routing
state in `src/features/navigation/useAppNavigation.ts`. What's left in `App()` is genuine
orchestration: deck/summary loading, settings, and wiring the feature hooks together.

### Done

| Phase | What | Commit |
|---|---|---|
| 1 | Type/constant dedup against `src/types.ts` + `src/constants.tsx` | `c7d14ea` |
| 2 | Pure helpers → `src/lib/` (6 modules, 29 unit tests) | `710ffbc` |
| 3a | Lift titlebar inline closures to named callbacks | `00a1b14` |
| 3b | Titlebar → `src/components/AppTitlebar.tsx` (430 lines) | `528d2f5` |
| 3c | Settings modal → `src/components/AppSettingsModal.tsx` (913 lines) | `ba314e3` |
| — | Settings + titlebar wiring tests | `c5a01cf`, `d932a12` |
| — | Docs metrics refresh (`ARCHITECTURE.md` §4, D1) | `acad9e7` |
| 4-gate | Session state machine characterization tests | `ab2319f` |
| 4a | Round builders → `features/study-session/` (814 lines) | `d52ac5a` |
| 4b-prep | Hoist hook dependencies above their consumers | `ee52eb0` |
| 4b | Session state → `useStudySession` (44 useState, 17 refs) | `caa4b35` |
| 4c-gate | Routing characterization tests (11, mutation-verified) | `eda0103` |
| 4c | Routing state → `useAppNavigation` + `VIEW_PARENT` | `f0f72e3` |
| 4c | View branches → `renderView()` closure | `cd2299b` |
| — | `card-notes` conformance: `index.ts` barrel, editor → `components/` | `57c8c2f` |

### Not done — nothing blocking; the rest is deliberately declined

- **Feature-module conformance for `heatmap`, `models`, `window-drag`.** Left as-is on
  purpose: the checklist is not applied mechanically — inventing `types.ts`/`constants.ts`
  for a small hook adds files, not clarity. `card-notes` was the real outlier (done above).
- **Coverage gaps carried over from 4b:** the resume-toast flow (`handleResume` /
  `handleDismissResume`) and `handleRetry` still have no test. Neither crosses a hook
  boundary, so the risk is transcription, not desync. Test them first if you touch them.

When #69 closes, delete this file.

---

## Phase 4b — what was done

`useStudySession` now lives in `src/features/study-session/useStudySession.ts`. The move was
two commits: `ee52eb0` reorders App.tsx so the hook's dependencies precede its call site
(pure reordering, no behaviour change), `caa4b35` moves the state.

### Decision 1 — the hook returns a *slice*, not the whole `SessionContextValue`

`SessionContextValue` is a composite. Four of its fields are not session state: `voiceBusy`,
`voiceUnavailable`, `playAudio` (owned by `useVoice`) and `blockSessionComplete` (derived
from `cardScores` + `activeBlockCards`). Pulling them in would have made the hook own voice
and mastery — the "god hook" outcome this document warned against.

```ts
export type StudySessionSlice = Omit<
  SessionContextValue,
  'blockSessionComplete' | 'voiceBusy' | 'voiceUnavailable' | 'playAudio'
>
```

Deriving it by `Omit` rather than restating the fields keeps tsc enforcing both halves: the
hook cannot drop a field (it is the return type), and App cannot forget to supply one (the
`SessionProvider value` is still checked against the full `SessionContextValue`).

`upcomingCards`, `activeSessionLengthPreset` and `answerInputRef` *did* move into the hook —
they are session-derived, unlike voice and mastery.

### Decision 2 — the straddling refs

**`localToastIdRef` moved wholesale.** This document guessed it wanted an injected
`pushToast()`; that was wrong. Its only two readers in the entire tree were both inside
`submitAnswer` — it is a private monotonic counter, not a shared channel. The real injected
dependency is `tutor.queueAssistantToast`.

**`studyQueueCacheRef` stayed in App.** Two of its three readers (`getStudyQueueDeduped`,
`refreshDeckProgressAfterSeedChange`) are deck loading, not session; only `submitAnswer` is.
The hook takes injected `getStudyQueue(slug, opts)` and `invalidateStudyQueue(slug)`.

**Two more straddlers this document did not list**, found by reading call sites:

- `explicitReviewItemsRef` is read imperatively by the Escape handler and `MinigameView`'s
  `onBack`, both of which stayed in App. The hook returns the **ref object itself**, so both
  sides share one object. (`answerInputRef` was already exposed this way.)
- `queueBucketCountsRef` was read in the provider value. It moved; App now takes the exposed
  `queueBucketCounts` *value* and no longer names the ref.

Net: **no ref is split across the boundary.** Verified by grep — the only session-ref names
remaining in App.tsx are the `explicitReviewItemsRef` destructured from `session`.

### The wiring order problem, and the one backwards edge

`useStudySession` must sit *below* everything it takes by value (`activeBlockCards` is a
render-time memo and cannot be late-bound through a ref) and *above* everything that reads
session state (`isInMinigameSession`, `showPetalLayer`, `blockSessionComplete`,
`activeRunCards`, the provider value). That ordering is what `ee52eb0` establishes.

One edge does not fit: `useTutor` consumes session state (`isInMinigameSession`,
`activeSessionId`, and an `onToastNavigate` that calls `startSession`), so it is constructed
*after* the session hook — but `submitAnswer` needs `tutor.queueAssistantToast`. Resolved
with a latest-value ref box assigned during render right after `useTutor` returns. An effect
would be wrong here: the tutor hook's functions are not stable, so an effect keyed on its
identity can hold a stale reference between renders.

`pomodoro.onSessionStart` / `onSessionEnd` go through the same ref box, matching how App
called them before (neither appeared in the original dependency arrays).

### Verification

- Gate (`App.session-state.test.tsx`) 6/6, full suite 605/605, `tsc -b`, oxlint 0 warnings,
  `vite build`, and the built Electron app launches clean.
- The gate only covers `submitAnswer` scoring/lives. The riskier ref-heavy cluster —
  explicit/missed-word review, its persistence sequencing, and `returnToDailyGamesHub` — is
  covered by `App.daily-games.test.tsx` (5 tests), which a split ref would fail immediately.
- Still uncovered by any test: the resume-toast flow (`handleResume` / `handleDismissResume`)
  and `handleRetry`. Neither involves a cross-boundary ref, so the residual risk there is
  transcription, not desync — and a normalized diff of all 1,064 moved lines against the
  pre-move file shows no body logic changed. **If you touch these, test them first.**

---

## Phase 4c — what was done

Routing was "a flat `view` string with inline conditional JSX." It turned out to be *three*
separate mappings, not one duplicated graph, and they were handled distinctly:

1. **`view → component`** — the six render branches. Stayed in App (each screen needs
   App-owned props; a `<ViewRouter>` would just mint a huge new prop interface, the
   transposable-props trap again). Lifted verbatim into a `renderView()` closure so the
   return reads `<SessionProvider>{renderView()}{overlays}</SessionProvider>`.
2. **`view → parent`** (Escape) — was a five-branch `if (view === …)` chain. Now the
   `VIEW_PARENT` constant + a lookup. The minigame/explicit-review guard stays in App because
   it reads session state.
3. **history stack** (titlebar back/forward) — the cohesive win, and the hook's real content:
   `viewHistoryRef` + `viewHistoryIndexRef` + `isHistoryNavigationRef` + the maintenance
   effect + back/forward + can-back/can-forward, moved as one unit into `useAppNavigation`.

`view` and `navDirection` came along into the hook. Every `setNavDirection(d); setView(v)`
pair collapsed to `navigate(v, d)` — a view change and its direction can no longer disagree.
The two titlebar jumps that set the view without a direction call `navigate(v)` (direction
optional, not defaulted), preserving that they leave `navDirection` untouched.

**`navDirection` has no accessible output, so no test can catch a transposed direction** —
every call site's direction was checked by eye during the conversion.

`useStudySession` now takes an injected `navigate` instead of `setView` + `setNavDirection`;
the session shouldn't hold two setters that must fire together.

`canHistoryBack`/`canHistoryForward` still read the history refs *during render* — a latent
stale-read that works only because a `view` state change re-renders alongside. Preserved
deliberately; the routing gate pins that timing. Do not "upgrade" history to `useState`.

### Verification (4c)

- Routing gate (`App.routing.test.tsx`) 11/11, mutation-verified: redirecting minigame's
  Escape parent, dropping the jlpt_prep branch, removing forward-trail truncation, and
  ungating the number keys each fail exactly one test.
- Session gate 6/6, full suite 616/616, `tsc -b`, oxlint 0 warnings, `vite build`, built app
  launches clean.

---

## The gate — run this after every step

`src/App.session-state.test.tsx` (6 tests) pins the behaviour that breaks silently: score
vs. round counting, points below the first combo threshold, points surviving a streak
reset, lives decrementing only on wrong answers. Written *before* 4a deliberately.

It is mutation-verified: neutering the lives decrement fails 1 test, neutering the score
increment fails 2. **If you extend it, re-verify that way** — a characterization test that
cannot fail is worse than none.

```bash
npx vitest run src/App.session-state.test.tsx   # session state machine (6)
npx vitest run src/App.routing.test.tsx          # view routing (11), added for 4c
```

Both are mutation-verified; re-verify that way if you extend either. Note
`MinigameView.test.tsx` hand-builds a `SessionContextValue`, so it exercises the view's
rendering and will keep passing even if the state machine breaks. Don't count it.

Full validation (from `electron-frontend/`):

```bash
npm run lint && npx tsc -b && npm run test:ui
```

`npm run test:ui` does **not** typecheck — run `tsc -b` separately. A bad cast in a test
file slipped into commit `710ffbc` because of exactly this.

---

## Method notes that paid off

- **Generate both sides of a prop boundary from one dependency list.** Compute the deps by
  intersecting identifiers in the JSX block with App's scope, then emit the props interface
  and the call site from that same list. They cannot disagree.
- **Lift inline closures to named handlers *first*, as a separate verified commit.** It
  removes raw `setState` props from the boundary — five identically-typed
  `Dispatch<SetStateAction<boolean>>` props are transposable and tsc cannot tell them apart.
- **Mutation-test any test you're relying on as a gate.**
- Two gaps found the hard way in the dependency scan: it missed `const { x } = obj` object
  destructuring (caught by tsc), and it over-matched identifiers inside string literals
  (harmless — produced unused props).
- Test-harness gotchas: the cassette carousel needs **two** clicks (focus, then launch);
  the feedback card's continue button is named "Continue immediately" (its `title`), not
  "Next now"; and round prompt + options must be read in one settled step, re-querying
  before clicking, or you get flake under full-suite load.

## Reproducing the analysis

The script attributes each line to the **nearest preceding top-level declaration**, so
usages inside the JSX return block get credited to whatever `const` happens to precede
them (`showOnboardingFontSection`, `xpPercent`, `showPetalLayer` are artefacts, not real
owners). Treat the output as a candidate list and confirm each ref's true readers by
eye before moving it — that confirmation is the whole point of the exercise.

```bash
# session refs and their owning functions
cd electron-frontend && python - <<'PY'
import re
s=open('src/App.tsx',encoding='utf-8').read(); lines=s.split('\n')
heads=[(i,re.match(r'^  (?:const|function)\s+(\w+)',l).group(1))
       for i,l in enumerate(lines) if re.match(r'^  (?:const|function)\s+\w+',l)]
def owner(i):
    best='<module/JSX>'
    for hi,n in heads:
        if hi<=i: best=n
        else: break
    return best
for r in sorted(set(re.findall(r'\b(\w+Ref)\b',s))):
    hits=[i for i,l in enumerate(lines) if re.search(r'\b'+r+r'\b',l)]
    print(f'{r:36} {sorted({owner(i) for i in hits})}')
PY
```
