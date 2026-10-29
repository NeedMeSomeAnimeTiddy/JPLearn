# Debt register

Known shortcuts, each with the condition that makes fixing it worth doing. Audits draft rows; the
lead numbers and files them (`.claude/audit-profile.md`, "Debt filing rule"). The older findings
table in `ARCHITECTURE.md` section 8 (`A1`..`F5`) stays where it is and is read alongside this one.

Row shape:

```
## <n>. <title>

**Recorded <date>.** What it is, where (`file:line`), and why it is not fixed now.

**Trigger:** the behaviour or count that makes it worth fixing, stated so an audit can check it.
```

A closed row stays in place, with `**CLOSED <date>**` after its title and how it closed. A trigger
that has fired and is still open is written `**Trigger - FIRED <date>:**`.

## Not debt, though it looks like it

See `.claude/audit/known-answers.md`, Part 2: each entry there names its record.

<!-- Rows start below. -->

## 1. The review log has no index

**Recorded 2026-10-26.** `review_events` (`data/database.py:268-281`) is append-only with no index;
its query plan is `SCAN review_events` (audit 1, Check 3). Every answer runs a full-table read for
the leech window (`database.py:1867-1882`) and a `COUNT(*)` (`1196-1200`); every summary runs one
per deck and id chunk (`209-216`). Not fixed now: the table held 1 row after a reset, and a whole
review save took 40-65 ms on a fresh database (audit 1, Check 8).

**Trigger:** `review_events` passes 100,000 rows, or `record-result` takes over 150 ms on a warm
worker.

## 2. The FSRS optimizer fits a model the scheduler does not use

**Recorded 2026-10-26.** `data/fsrs_optimization.py:58-86` loads only quality and UTC timestamps,
and `domain/fsrs_optimizer.py:81-89` maps ratings without the confidence blend that
`domain/scheduler.py:141-151` applies live and `domain/review_replay.py:82` applies in replay. Not
fixed now: Optimize is a rare manual action, and the reset database cannot meet its minimum
(5+ cards with 2+ reviews, `fsrs_optimization.py:148`).

**Trigger:** Optimize can run (5+ cards with 2+ reviews) and, over at least 500 logged answers, more
than 10% carry a `confidence_score`; or Optimize is run automatically or offered as a prompt.

## 3. Long writes on the bridge worker report failure at 30 s

**Recorded 2026-10-27.** Reset, JSON import, onboarding seeding and the legacy score import now run on
the worker alone, in turn with answers (audit 1 review, b91cc8a), so no one-shot copy can still be
writing after a reset. The worker's 30 s timeout (`BRIDGE_REQUEST_TIMEOUT_MS`) counts from when the
request is written, queue time included; a write that outlasts it is reported as failed while Python
finishes it, and a merge import retried by the learner runs twice. Not fixed now: no measured import
or seed comes near 30 s.

**Trigger:** any of those four commands takes over 10 s on a warm worker, or a learner reports an
import that "failed" but changed their progress.

## 4. Decks are rebuilt on every call

**Recorded 2026-10-27.** No `ALL_DECKS` builder is cached (`domain/decks.py:286-355, 923-927,
1602-1626`); topic views rebuild their parent. All 43 decks take 254.6 ms to build, and an
empty-database `_build_summary()` takes about 520 ms warm, about half of it building decks (audit 2,
Check 5). Recommendations rebuild the level decks again for each section's metrics
(`scripts/desktop_bridge.py`, `_section_deck_slugs`). Not fixed now: within budget once the sentence payload is capped (audit 2, F8). A per-process cache
needs no invalidation within a run, since the sources are static module data and process-cached CSV
rows; callers must not mutate the cached cards.

**Trigger:** a warm `summary` passes 1 s, or the first summary misses its 2,500 ms budget in startup
telemetry on two launches running.

## 5. The list generator positions rows after silently dropping at least 180 cross-level repeats

**Recorded 2026-10-27.** `scripts/import_external_lists.py:138-157` (keep-first, the only policy that
regenerates; the default `error` fails on about 180 conflicts) drops every later-level row whose
spelling and reading an earlier list carries, and the header reports 0
(`domain/external_deck_data.py:5`). Ids are positional, so editing an earlier list can make a later
row appear or vanish mid-list and move every later id. Nothing compares a regeneration with the
committed module. Not fixed now: the committed module is reproduced exactly (audit 2, Check 1), and
no list edit is planned.

**Trigger:** any edit to a `data/external_sources/words_n*.csv` or `kanji_n*.csv`, or any change to
`data/text_normalization.py` that the generator uses.

## 6. The topic-to-level migration skips the slug-keyed mastery store

**Recorded 2026-10-27.** `data/category_identity_migration.py:83` treats `card_mastery_scores` as
keyed by deck name; production keys it by slug (`data/mastery_repository.py:92-107`), and
`tests/test_category_identity_migration.py:183-200` seeds the name shape. Not fixed now: the live
database holds no topic-slug mastery rows (audit 2, Check 11).

**Trigger:** a new identity migration is written using this file as its template, or a
`card_mastery_scores` row appears under a topic-deck slug.

## 7. The FSRS "mastered" rule is copied in seven places

**Recorded 2026-10-27.** "Three reviews and a 21-day interval" is written out separately in
`data/database.py:237`, `data/deck_portability.py:1107`, `data/state_rebuild.py:87`,
`scripts/desktop_bridge.py` (`_build_category_metrics_for_node`; an unused copy was removed after audit 3),
`domain/word_of_the_day.py:64`, and `domain/jlpt_readiness.py:15-16`, and the figure appears in
learner text at `ledger.ts:436` and `Ascent.tsx:130`. All agree today (audit 3). Not fixed now:
nothing diverges, and the SQL readers need the literal in the query, so a shared constant means
building those queries from it.

**Trigger:** any change to the rule, or an eighth reader added.

## 8. A slow study queue silently plays the session in random order

**Recorded 2026-10-27.** `hydrateRoundCycle` races the bridge's study queue against a 1,200 ms timer
(`ROUND_QUEUE_TIMEOUT_MS`, `electron-frontend/src/features/study-session/useStudySession.ts:75-76,
303-315`) and, on a loss, shuffles the pool with no notice. The cycle keeps that order until it
wraps, so due cards are not served first for that session. The main process allows the same request
30 s (`BRIDGE_REQUEST_TIMEOUT_MS`; the 12 s at `electron/main.cjs:306` is its read-cache lifetime,
corrected by audit 7), and at session start the queue waits behind `startSessionGoal` and
any answer saves on the serial bridge (ARCH §8 B1). Not fixed now: audit 4 (F6) could not measure
how long the queue takes in ordinary use, and a fix (wait with a loading state, or swap in the real
order once it lands) is only worth making if the timer actually fires.

**Trigger:** a measured `getStudyQueue` over 1.2 s when a session starts in the built app (audit 4,
Check 3), or a learner noticing that due cards were not served first.

## 9. Daily Games state reads every attempt ever played, one query per attempt

**Recorded 2026-10-28.** `_reconcile_daily_games_streak` (`scripts/desktop_bridge.py:1125-1142`)
calls `load_attempts()` with no day. That selects every `daily_game_attempts` row and runs one
outcomes query per row (`data/daily_games_repository.py:370-393`), on every `daily-games-state` and
`daily-games-record-attempt`. Not fixed now: the live table holds 0 rows (audit 7, Check 4), and it
grows by a few rows a day.

**Trigger:** `daily_game_attempts` passes 2,000 rows, or `daily-games-state` takes over 300 ms on a
warm worker.

## 10. The startup budget measures neither the summary nor the wait the learner sees

**Recorded 2026-10-29.** `STARTUP_BUDGETS_MS.firstSummary` (2,500 ms) is checked against the
renderer's `firstSummaryMs`, timed from `App`'s first render (`electron-frontend/src/App.tsx`,
`startupBootMarkRef`) to the summary landing. The summary request starts earlier, in the
main-process startup preload, and the renderer shares it through the read cache, so a slow summary
that mostly ran before `App` mounted can report under budget. What the learner waits for is the
window showing, `main.startupSessionMs` in `startup-telemetry.json`, which has no budget, and the
time before the splash (two awaited config reads in `app.whenReady`) is outside every figure. The
packaged smoke records these and asserts none. DEBT #4's trigger reads `firstSummaryMs`, so it can
miss a regression. Not fixed now: the budget values are Robbie's call and nothing is known to be
slow (audit 11, F6). Since audit 11 the whole splash also has a 30 s deadline, which is an escape
hatch, not a performance target.

**Trigger:** a learner noticing a slow start, `preload.tasks[summary].durationMs` over 2,500 ms in
`startup-telemetry.json`, or `startupSessionMs` over 5,000 ms. Read those two alongside
`firstSummaryMs` whenever DEBT #4's trigger is checked.
