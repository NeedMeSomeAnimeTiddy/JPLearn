# Issue #69 — App.tsx decomposition: state of play and the Phase 4 plan

Working handoff document. Delete it when #69 closes.

Branch: `refactor/issue-69-app-decomposition` (10 commits, branched from `main` at `d437b87`).

## Where things stand

| Metric | At filing | Now | Note |
|---|---|---|---|
| `App.tsx` lines | 7,451 | **4,060** | −46% |
| `useState` | 112 | **111** | *unchanged by design* — no state has moved yet |
| `useCallback` | 60 | 73 | rose deliberately: inline JSX closures were lifted to named handlers |
| Frontend tests | 561 | 605 | |

The line count is past target, but **the issue's actual complaint — 112 `useState` in an
"orchestrator only" component — is still open.** Everything so far moved pure logic and
JSX. State moves in Phase 4b, and that is the remaining work.

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

### Not done

- **4b** — session state → `useStudySession` (the bulk of the issue; planned below)
- **4c** — routing: still a flat `view` string with inline conditional JSX
- Feature-module conformance: `card-notes`, `heatmap`, `models`, `window-drag`

On that last item: **don't apply the checklist mechanically.** `window-drag` is a small
hook; inventing `types.ts`/`constants.ts` for it adds files, not clarity. `card-notes` is
the real outlier — no `index.ts` barrel, and `CardNoteEditor.tsx` sits at the module root
instead of `components/`. Fix that one; leave the rest unless there's a reason.

---

## Phase 4b — the plan

### The good news: the interface already exists

`src/context/SessionContext.tsx` already defines `SessionContextValue` — 40 state fields
+ 12 actions. `App.tsx` builds that object inline and hands it to `SessionProvider`;
`MinigameView` and `ScriptHubView` consume it via `useSession()` and take no session props
directly.

So the seam is already drawn, already the thing consumers depend on, and already enforced
by tsc. `useStudySession` should produce (or feed) that value. This is real encapsulation,
not a "god hook" that just relocates the coupling.

**But `SessionContextValue` is a composite, not a mirror of the state cluster.** It also
folds in voice (`voiceBusy`, `voiceUnavailable`, `playAudio`), derived memos
(`blockSessionComplete`, `upcomingCards`, `activeSessionLengthPreset`) and refs
(`answerInputRef`). Decide deliberately whether the hook returns the whole value or just
the session slice that App merges with voice/derived state. **Do not pull voice into the
hook just so it can "own" the interface.**

### Scope

44 `useState` (of App's 111), ~18 refs, and ~1,236 lines across these:

| Function | Lines | Function | Lines |
|---|---|---|---|
| `submitAnswer` | 391 | `handleResume` | 35 |
| `submitHandwritingOutcome` | 171 | `hydrateRoundCycle` | 33 |
| `startSession` | 109 | `continueLastSession` | 30 |
| `clearPersistedSession` | 106 | `nextCardIndex` | 30 |
| `nextRound` | 72 | `buildQueueCycle` | 23 |
| `startMissedWordReview` | 63 | `resetSessionCore` / `Full` / `End` / `WithLives` | 62 |
| `saveSessionPrefs` | 22 | `upcomingCards` | 20 |
| `returnToDailyGamesHub` | 16 | `nextRoundMode` | 14 |
| `activeSessionLengthPreset` | 10 | `handleRetry` / `handleDismissResume` / `skipFeedback` | 22 |

### The real risk: refs, not props

Phases 1–3 leaned on `tsc`. **4b cannot.** The failure mode is behavioural: if a ref moves
into the hook while any *other* reader stays in App, you get two distinct ref objects.
Both typecheck. Cross-round state silently desyncs.

**Rule: a ref and every one of its readers/writers move together, or neither moves.**

Enumeration of session refs and their owning functions (regenerate with the script in the
"Reproducing the analysis" section below):

| Ref | Owners |
|---|---|
| `seenCardIdsRef` | `startSession`, `submitAnswer`, `clearPersistedSession`, `activeSessionLengthPreset` |
| `wrongCardIdsRef` | `startSession`, `submitAnswer`, `clearPersistedSession`, `activeSessionLengthPreset` |
| `nearMissCardIdsRef` | `startSession`, `submitAnswer`, `clearPersistedSession`, `activeSessionLengthPreset` |
| `retryCardsRef` | `handleRetry`, `nextRound`, `resetSessionCore`, `returnToDailyGamesHub`, `startSession` |
| `retryTargetItemsRef` | + `submitAnswer`, `activeSessionLengthPreset` |
| `explicitReviewItemsRef` | `nextRound`, `resetSessionCore`, `returnToDailyGamesHub`, `submitAnswer`, `submitHandwritingOutcome`, `upcomingCards` |
| `explicitReviewCursorRef` | `nextRound`, `resetSessionCore`, `returnToDailyGamesHub`, `upcomingCards` |
| `explicitReviewPersistenceRequestRef` | `resetSessionCore`, `returnToDailyGamesHub`, `submitAnswer` |
| `feedbackAdvanceRef` | `resetSessionCore`, `returnToDailyGamesHub`, `skipFeedback`, `submitAnswer` |
| `roundCycleRef`, `roundCursorRef` | `hydrateRoundCycle`, `nextCardIndex`, `resetRoundCycle`, `upcomingCards` |
| `roundPresentedAtRef` | `nextRound`, `startSession`, `submitAnswer`, `activeSessionLengthPreset` |
| `interleaveCursorRef` | `nextRoundMode`, `resetRoundCycle` |
| `queueBucketCountsRef` | `hydrateRoundCycle`, JSX (feeds `SessionContextValue`) |

**Two refs genuinely straddle the boundary — decide these explicitly before starting:**

1. **`studyQueueCacheRef`** — owned by `getStudyQueueDeduped` (deck loading, *not* session)
   but invalidated by `submitAnswer` (session). Either the session gets an injected
   `invalidateStudyQueue()` callback, or queue caching moves too.
2. **`localToastIdRef`** — shared between `submitAnswer` and toast rendering. Likely wants
   an injected `pushToast()`.

### `submitAnswer` also needs injected dependencies

It is the "review recorded" path, so it writes a lot that is *not* session state:
`setCardScores`, `setScriptStats`, `setMinigameStats`, `setXpProgress`, `setXpToasts`,
`setMilestoneToasts`, `setDeckCards`, `tutor`, plus `loadSummary`. Pass these in as
explicit callbacks rather than letting the hook reach for App state.

### Suggested order

1. Draw the seam: decide hook-returns-full-`SessionContextValue` vs. session-slice-only.
2. Resolve `studyQueueCacheRef` and `localToastIdRef`.
3. Move state + refs + functions **in one commit** — they don't subdivide well; a partial
   move is what creates the split-ref bug.
4. `useStudySession.ts` in `src/features/study-session/` next to the existing builders.

A smaller optional warm-up: the round-cycle cluster (`roundCycleRef`, `roundCursorRef`,
`hydrateRoundCycle`, `nextCardIndex`, `resetRoundCycle`, `buildQueueCycle`, `upcomingCards`)
has a closed owner set, ~96 lines. It needs `getStudyQueueDeduped` injected. Low value for
the effort, but safe if you want to validate the approach first.

---

## The gate — run this after every step

`src/App.session-state.test.tsx` (6 tests) pins the behaviour that breaks silently: score
vs. round counting, points below the first combo threshold, points surviving a streak
reset, lives decrementing only on wrong answers. Written *before* 4a deliberately.

It is mutation-verified: neutering the lives decrement fails 1 test, neutering the score
increment fails 2. **If you extend it, re-verify that way** — a characterization test that
cannot fail is worse than none.

```bash
npx vitest run src/App.session-state.test.tsx
```

Note `MinigameView.test.tsx` hand-builds a `SessionContextValue`, so it exercises the
view's rendering and will keep passing even if the state machine breaks. Don't count it.

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
