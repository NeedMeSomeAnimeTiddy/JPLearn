# Known answers — the reconciliation step

Read **Part 1** at Orient and **Part 2** at Reconcile. The search lines are patterns for the search
tools, not commands to run.

- **Constraints** (Part 1) define what a valid recommendation looks like. They hold no conclusions
  about whether any system works, so they are read first. Breaking one produces advice that cannot be
  taken.
- **Settled answers** (Part 2) record what somebody already concluded about specific systems.
  Reading them early costs the independent read, so they wait until every finding is traced.

Facts below were checked against the source on 2026-10-26. Where one has drifted, the code wins and
the drift is a STALE RECORD worth reporting.

---

# Part 1 — Constraints (read up front)

## Each learner store has its own key

| Store (table, file) | Keyed by | Consequence |
|---|---|---|
| `review_states` (`data/database.py`) | `(deck, card_id)`; deck is the deck's display **name**, normalised | Renaming a deck or moving a card id forks the schedule |
| `review_events` | `deck`, `card_id` per row; append-only log | Migrations deliberately leave it as history (`data/category_identity_migration.py`) |
| `leech_items` | `(deck, card_id)` by name | Readers not limited to the cards a deck shows see cards no deck serves |
| `curriculum_stages` | `(deck, card_id, mode)` | as above |
| `daily_game_miss_signals` | `(deck_name, card_id)` | as above |
| `card_mastery_scores` (`data/mastery_repository.py`) | `(deck, card_id)` where deck is the **slug** | A slug change forks mastery; a name change does not |
| `card_notes` (`data/card_notes_repository.py`) | an opaque `note_key`, independent of deck: built-in cards hash character and reading; dictionary entries use their JMdict source id, and hash character and reading only when that id is missing | Survives deck and id changes; a change to text normalisation moves the hashed keys (and a change to source-id canonicalisation moves dictionary keys) |
| `daily_word_pools` / `_words` | `pool_day`, `pool_position`; rows carry `deck_slug`, `deck_name`, `card_id` | Results go by pool position |
| Single-row and keyed-by-name tables (`streak_state`, `user_xp`, `user_settings`, `assistant_*`, `user_progression`, ...) | their own ids | Not tied to cards |

**Card ids are positional.** `domain/decks.py` assigns `id_offset + index` over the imported rows.
Dropping, inserting or reordering a corpus row moves every later card onto another word's history,
so "deduplicate the corpus" or "sort the deck" is never available as written; hiding a card is done
by filtering after ids are assigned (`hidden_repeat_ids`, #80). Category decks are views that keep
their parent's name and ids (#78). Ids are hand-allocated per deck; `tests/test_deck_id_uniqueness.py`
is the guard, so a recommended new deck names a verified-free `id_offset`. Where an identity change
is genuinely wanted, the shape is `data/category_identity_migration.py`: back up, rewrite the keyed
stores, report what moved.

## Where the live database is

The app's store is `jplearn.db`, at `<JPLEARN_DOCUMENTS_DIR>/data/` when that is set, else
`Documents\JPLearn Progress\data\` for the Electron app, else the repo's `data/` for Python run
directly (`electron/main.cjs::resolveProgressDocumentsDir`, `data/database.py::_resolve_db_path`).
`data/app.db` (`SRSRepository`) is a dev and replay fixture no runtime path uses.

## Mastery: one store, three notions

`card_mastery_scores` in SQLite is the counter; the renderer's `localStorage` copy is a warm-start
snapshot only. `domain/mastery.py` defines three distinct notions of "mastered"; a recommendation
that merges them changes what the learner is shown.

## The bridge is serial

One Python child serves every study query, one request at a time (`electron/bridge_worker.cjs`). A
request that times out is rejected on its own; the worker is restarted only after
`BRIDGE_MAX_CONSECUTIVE_TIMEOUTS` (3, `electron/main.cjs`) timeouts in a row, and a restart settles
only that child's requests. Slow work still blocks every query queued behind it, so a
recommendation that adds a slow call to the bridge is an error. Long work gets a dedicated runtime
(`ocr_runtime.cjs`, `speech_runtime.cjs`, `voice_runtime.cjs`, `llm_runtime.cjs`) or a one-shot
process.

## Layers

`domain/` is pure: no database, no file I/O, no UI, time and randomness injected. `data/` holds no
business logic or UI behaviour. `scripts/arch_check.py` forbids `domain → data`, `domain → ui`,
`data → ui`, `scripts → ui`. "Move this lookup into the domain function" is unavailable when the
lookup reads the database; pass the value in instead.

## What may leave the machine

The tutor (llama.cpp), speech recognition (Whisper), OCR (PaddleOCR) and voice (VOICEVOX) all run
locally; "use a hosted API" is never available. Outbound traffic is downloads the learner starts
(`electron/setup_runtime.cjs`, `scripts/get_*.py`) and the packaged app's update check
(`electron/updater.cjs`, GitHub Releases, when a repository is configured). Nothing that reports what
is installed may wait on the network.

## The renderer is untrusted

`contextIsolation`, no `nodeIntegration`, `sandbox: true`, one preload bridge
(`window.jplearnDesktop`), sender and payload checks in `ipc_security.cjs`. No recommendation may
give the renderer direct file or process access, or widen a route to accept a path or command the
main process then trusts.

## The renderer's own rules

From `.github/instructions/electron.instructions.md` and `electron-frontend/CLAUDE.md`: React 19.2
without `forwardRef` or `import React`; new stateful systems go in `src/features/<name>/`, never
inline in `App.tsx`; colours from `@radix-ui/colors` tokens, never raw hex; WCAG 2.1 AA, keyboard
reachable, visible focus; no synchronous IPC. Robbie's ruling, recorded in
`electron-frontend/CLAUDE.md`: the UI is square-cornered. A recommendation that breaks one of these
is an error. Existing code that breaks one is a finding only with a consequence (a control a learner
cannot reach, a colour that fails contrast), not for the rule alone.

## Generated files

`electron-frontend/src/generated/types.ts` (`scripts/generate_ts_types.py`, whose `SOURCE_FILES`
lists the payload modules), `domain/external_deck_data.py`
(`python -m scripts.import_external_lists --conflict-policy keep-first`; `keep-first` drops
cross-level repeats, so editing an earlier list can move later ids, DEBT #5; `--output` must be
inside the repo) and the handwriting manifest
(`scripts/build_handwriting_assets.py`) are outputs. A finding about their content is a finding
about their generator or source data; a hand edit is never the fix.

## The authored world

The menu's 3D valley (`world.glb`, built from `environment.blend`) is Robbie's authored work. A
performance finding may recommend camera, culling, loading or material changes; hiding, decimating
or replacing his meshes needs his approval and is recommended only as a question to him.

## Age is not a defect

Much of this code was written by much older models, and Robbie wants it made robust. Consequences
are the measure: a finding names what goes wrong for the learner or the data, when, and how often.
Unfamiliar style, length or a pattern a newer model would not choose is not a finding on its own.
And no "simplify now, build it properly later" advice.

---

# Part 2 — Reconciling findings (Reconcile)

## The procedure

For each traced finding, in this order:

1. **Search `ARCHITECTURE.md`** — section 8 for the file, symbol or concept (a struck id is closed and
   says how), then sections 2-7, where several choices that look wrong are explained with
   measurements (section 4 on why mastery is not derived from FSRS state, for example).
2. **Search `DEBT.md`**, and read every open entry's trigger (`census.py --records` lists them). A
   fired trigger is the most valuable thing a pass reports: say which, with the count or the caller
   that fired it.
3. **Search closed GitHub issues** for the subject (`gh issue list --state closed --search "<term>"`
   under Checks to run), and the code comment beside the thing: rulings often live there.
4. **Check `FEATURES.md`** for what the system is meant to do; built but unverified is not broken.
5. **Assign a bucket.** A record that describes the code wrongly is a STALE RECORD: report the
   record. A conflict with a decision, or an intent the records leave unclear, is a question for
   Robbie. Anything else the records do not cover is NEW.

## Intentional designs — not findings while they hold

| What the code looks like | Why it is by design |
|---|---|
| Category builders in `domain/decks.py` still allocate their own `id_offset` | #78: they are source data for matching (`CATEGORY_SOURCE_DECKS`); `ALL_DECKS` serves views with the parent's ids and name |
| A word on two JLPT lists appears in only one level deck; old rows for the hidden card remain in the database | #80, Robbie's decision: the lowest level keeps it, ids do not move, nothing is migrated |
| `kanji_n1` ids run past its nominal 1,000-slot spacing | `ARCH §8 A1`: guarded by `tests/test_deck_id_uniqueness.py` |
| `localStorage` holds card scores as well as SQLite | `ARCH §8 A2`: SQLite is the truth, `localStorage` a warm-start snapshot |
| Mastery is not derived from FSRS state | `ARCHITECTURE.md` §4, measured |
| `review_events` keeps old deck names after a migration | `data/category_identity_migration.py`: an append-only log of what happened at the time |
| `main.py` / `gui.py` raise `RuntimeError` | The legacy GUI is retired; Electron is the only surface |
| `domain/external_deck_data.py` is enormous | Generated from `data/external_sources/*.csv` |
| The valley models are not in git | Release `valley-models-1`, pinned by SHA-256 in `electron-frontend/scripts/fetch-models.cjs` |
| `mockups/` holds a separately built three.js app | A prototype workspace for menu design, not shipped |
| The packaged app uses `python-bundle/` before system Python | Deliberate; the bundle must carry `fugashi` and `unidic-lite` |
| Release checks run locally rather than on GitHub-hosted runners | Hosted runners are unavailable on the account; `scripts/dev.py --full` and `npm run make:release` are the local equivalents |
| A CSS class with no literal mention in source | May be built at runtime (`is-${tone}` in `Cells.tsx`, `assistant-toast-${priority}` in `TutorToast.tsx`); check producers first |

## Recorded problems that are still open — re-check, never exempt

These are known and not yet fixed. Confirm the record still describes the code, check whether its
scope has grown, and report a change either way. Reporting the unchanged problem again is one line,
RECORDED.

| Record | What it says is open |
|---|---|
| `ARCH §8 B1` | Slow work on the serial bridge blocks everything behind it |
| `ARCH §8 B2` | Timeout handling; partly addressed (one timeout no longer stops the worker) — check what remains |
| `ARCH §8 B3` | The fallback after a worker failure spawns a one-shot Python process per request |
| `ARCH §8 D1` | `App.tsx` size and routing; its figures are older than the code |
| `ARCH §8 D4` | `data/app.db` and `SRSRepository` are unused by the app but documented as live |
| `ARCH §8 D5`, `D6`, `E1`-`E3`, `F1`-`F5` | Leftover packages, incomplete modules, test gaps, stale docs |
| `desktop_bridge.py` and `data/database.py` over 2,000 lines | `arch_check.py` warns on purpose |

## Historical fixes — a regression is a finding

`ARCH §8 A1`-`A4`, `B4`, `C1`, `C2`, `D2`, `D3` are struck: each was fixed, and the row says how. Code
that has drifted back is a NEW finding citing the old row.

These tables are snapshots and drift. **The searches are the authority; the tables are the
shortcut.** If a table disagrees with a record, the record wins, and the stale row here is worth
reporting.
