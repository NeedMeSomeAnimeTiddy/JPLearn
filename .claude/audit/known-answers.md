# Known answers — the reconciliation step

Read **Part 1** at Orient and **Part 2** at Reconcile. The search lines are patterns for the search
tools, not commands to run.

- **Constraints** (Part 1) define what a valid recommendation looks like. They cannot bias a reading
  of the code, so they are read first. Breaking one produces advice that cannot be taken.
- **Settled answers** (Part 2) record what somebody already concluded about specific systems.
  Reading them early costs the independent read, so they wait until every finding is traced.

---

# Part 1 — Constraints (read up front)

## Card identity is positional, and progress hangs off it

`domain/decks.py` assigns card ids as `id_offset + index` over the imported rows, and every learner
record — `review_states`, `review_events`, `card_mastery_scores`, card notes — is keyed by
`(deck_name, card_id)`. So:

- Dropping, inserting or reordering a corpus row moves every later card onto another word's history.
  "Deduplicate the corpus" or "sort the deck" is never available as written. Hiding a card is done by
  filtering after ids are assigned (`hidden_repeat_ids`, #80).
- Renaming a deck forks its history in the same way. Category decks are *views* that keep their
  parent's name for exactly this reason (#78).
- Where an identity change is genuinely wanted, the shape is `data/category_identity_migration.py`:
  back up the database, rewrite the keyed rows, report what moved.
- Ids are hand-allocated per deck with no runtime uniqueness check; `tests/test_deck_id_uniqueness.py`
  is the guard. Recommending a new deck means naming a verified-free `id_offset`.

## Two databases, one of them live

`data/jplearn.db` (via `data/database.py`) is the real store. `data/app.db` (via
`SRSRepository`) is a dev and replay fixture for a few scripts and one test. A finding about
`app.db` affects no learner; a recommendation to "use the repository layer" for live data points at
the wrong database.

## The bridge is serial

One Python child serves every study query, one request at a time, and a timed-out request tears it
down and rejects everything else in flight. A recommendation that adds a slow call to it is an
error. Long work gets a dedicated runtime (`ocr_runtime.cjs`, `speech_runtime.cjs`,
`voice_runtime.cjs`, `llm_runtime.cjs` are the patterns) or a one-shot process.

## Layers

`domain/` is pure: no database, no file I/O, no UI, time and randomness injected. `data/` holds no
business logic or UI behaviour. `scripts/arch_check.py` forbids `domain → data`, `domain → ui`,
`data → ui`, `scripts → ui`. "Move this lookup into the domain function" is unavailable if the lookup
reads the database; pass the value in instead.

## Local-first and offline

The learner's text, recordings, photos and tutor conversations stay on the machine; the tutor is a
local llama.cpp model, speech is local Whisper, OCR is local PaddleOCR, voice is local VOICEVOX.
"Use a hosted API" is never available. The network is for downloads the learner starts. Since the
2026 setup-probe fix: **nothing that reports what is installed may sit behind a network call**
(ARCHITECTURE §8 B4).

## The renderer is untrusted

`contextIsolation`, no `nodeIntegration`, `sandbox: true`, one preload bridge
(`window.jplearnDesktop`), sender and payload checks in `ipc_security.cjs`. No recommendation may
give the renderer direct file or process access, or widen a route to accept a path or command the
main process then trusts.

## The renderer's own rules

From `.github/instructions/electron.instructions.md` and `electron-frontend/CLAUDE.md`:
React 19.2 without `forwardRef` or `import React`; new stateful systems go in
`src/features/<name>/`, never inline in `App.tsx`; colours from `@radix-ui/colors` tokens, never raw
hex; **square corners** (no `border-radius` on new components); WCAG 2.1 AA, keyboard reachable,
visible focus; no synchronous IPC. A recommendation that breaks one of these is an error. Existing
code that breaks one is a finding only with a consequence (a learner who cannot reach a control, a
colour that fails contrast), not for the rule alone.

## Generated files

`electron-frontend/src/generated/types.ts`, `domain/external_deck_data.py` and the handwriting
manifest are outputs. A finding about their content is a finding about their generator or source
data; a hand edit is never the fix.

## The authored world

The menu's 3D valley (`world.glb`, built from `environment.blend`) is Robbie's authored work. A
performance finding about it may recommend camera, culling, loading or material changes; it may
never recommend hiding, decimating or replacing his meshes without asking him.

## Age is not a defect

Much of this code was written by much older models, and Robbie wants it made robust. That makes
consequences the measure: a finding names what goes wrong for the learner or the data, when, and
how often. Unfamiliar style, length or a pattern a newer model would not choose is not a finding on
its own. Equally, no "simplify now, build it properly later" advice.

---

# Part 2 — Reconciling findings (Reconcile)

## The procedure

For each traced finding, in this order:

1. **Search `ARCHITECTURE.md` section 8** for the file, symbol or concept; a struck id is closed and
   says how. Also search sections 2-7: several "looks wrong" choices are explained there with
   measurements (section 4 on why mastery is not derived from FSRS, for example).
2. **Search `DEBT.md`** for the symbol, and read every open entry's trigger. A trigger that has
   fired is the most valuable thing a pass reports: say which, and give the count or the caller
   that fired it.
3. **Search closed GitHub issues** for the subject (`gh issue list --state closed --search "<term>"`
   under Checks to run), and the code comment beside the thing: rulings often live there.
4. **Check `FEATURES.md`** for what the system is supposed to do; built but unverified is not
   broken.
5. **Assign a bucket:** NEW · RECORDED · TRIGGER FIRED · STALE RECORD · or, if the code disagrees
   with a record, a Question for Robbie (never resolved silently).

## Things that reliably look like findings and are not

| What the code looks like | Why it is not a finding |
|---|---|
| `kanji_n1` ids run past its nominal 1,000-slot spacing | `ARCH §8 A1`: guarded by `tests/test_deck_id_uniqueness.py`; nothing else claims ids above 4000 |
| Category builders in `domain/decks.py` still allocate their own `id_offset` | #78: they are source data for matching (`CATEGORY_SOURCE_DECKS`); `ALL_DECKS` serves views that keep the parent's ids and name |
| A word on two JLPT lists appears in only one level deck; old `review_states` rows for the hidden card remain | #80, decided by Robbie: lowest level keeps it, ids do not move, nothing is migrated |
| `localStorage` holds card scores as well as SQLite | `ARCH §8 A2` closed: SQLite `card_mastery_scores` is the truth; `localStorage` is a warm-start snapshot |
| Mastery counter is not derived from FSRS state | `ARCHITECTURE.md` §4: measured and ruled out |
| `data/app.db` / `SRSRepository` unused by the app | `ARCH §8 D4`, recorded |
| Bridge worker is serial | `ARCH §8 B1`: a constraint by design; slow work already moved off it |
| `desktop_bridge.py` and `data/database.py` over 2,000 lines | `arch_check.py` warns on purpose; `ARCH §8 D2` records the split already done |
| `App.tsx` is large and holds routing state | `ARCH §8 D1`, recorded with its remaining step (#69) |
| `main.py` / `gui.py` raise `RuntimeError` | The legacy GUI is retired on purpose; Electron is the only surface |
| `domain/external_deck_data.py` is enormous | Generated from `data/external_sources/*.csv`; exempt from size checks |
| The valley models are not in git | Release `valley-models-1` holds them, pinned by SHA-256 in `electron-frontend/scripts/fetch-models.cjs` |
| `mockups/` holds a large, separately built three.js app | A prototype workspace for menu design, not shipped code |
| Release CI runs on a self-hosted runner, or not at all | GitHub-hosted runners are unavailable on the account; `scripts/dev.py --full` and `npm run make:release` are the verified local equivalents |
| The packaged app uses `python-bundle/` before system Python | Deliberate; the bundle must carry `fugashi` and `unidic-lite` or the bridge dies |
| A CSS class with no literal mention in source | May be built: `is-${tone}` (`Cells.tsx`), `assistant-toast-${priority}` (`TutorToast.tsx`). Check producers before calling it dead |

This table is a snapshot and drifts. **The searches are the authority; the table is the shortcut.**
If it disagrees with a record, the record wins — and say so, because a stale row here is worth
fixing.

## When the record and the code genuinely disagree

That is a real finding and a serious one. Say which record, quote it, show what the code does
instead, and put it under Questions for Robbie. Whether the code or the record is wrong is his call.
