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
