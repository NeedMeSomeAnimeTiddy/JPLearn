---
name: jplearn-backend-invariants
description: JPLearn backend invariants and traps moved from root CLAUDE.md - the two SQLite DBs, where mastery lives (SQLite, with a localStorage snapshot), the strictly serial Python bridge and dedicated runtimes, hand-allocated card id offsets, Japanese text normalization on writes, the mastered threshold, load_states default fabrication, and the bridge-payload dataclass / generate_ts_types rule. Use when touching persistence or SQLite, progress/mastery/review state, scripts/desktop_bridge.py or any bridge command or payload, electron/*_runtime.cjs or a new long-running backend operation, decks or card ids (domain/decks.py), or data/ write paths.
---

# JPLearn backend invariants

Moved verbatim from the root `CLAUDE.md` ("Architecture" and "Key conventions"). See
`ARCHITECTURE.md` for the full design reference.

## Architecture invariants

**Two SQLite DBs, not equivalent**: `data/jplearn.db` (via `database.py`) is the real,
live-written database — review/progress/gamification/assistant state. `data/app.db` (via
`SRSRepository` in `srs_repository.py`) is a dev/replay fixture used only by
`scripts/srs_apply.py`/`srs_check.py`/`srs_replay.py`/`db_check.py` and one test — no runtime
app path touches it, despite FEATURES.md describing it as live persistence.

**Mastery lives in SQLite.** The counter is `card_mastery_scores`, keyed `(deck_slug, card_id)` and
written on the same bridge call as the review; `review_states` (keyed by deck *name*) holds the FSRS
schedule. The renderer's `localStorage` `cardScores` is a warm-start snapshot only (#66). Any new
progress-related feature should know which one it is reading. See `ARCHITECTURE.md` §4.

**Bridge is strictly serial**: the Python child process handles one request at a time, so a slow
request blocks everything queued behind it; three timeouts in a row restart it and reject what was
queued on it (`electron/bridge_worker.cjs`). Never route a new
long-running backend operation through the shared worker — give it a dedicated child process
or a poll/progress channel instead. Four dedicated runtimes already exist to copy from:
`llm_runtime.cjs` and `voice_runtime.cjs` (HTTP to a spawned server), `speech_runtime.cjs` and
`ocr_runtime.cjs` (newline-JSON over stdin/stdout to `scripts/speech_recognition_server.py` /
`scripts/ocr_server.py`). See ARCHITECTURE.md §2 "Dedicated runtimes" for the lifecycle rules
these share (single-flight queue, kill-on-timeout, unload only between requests).

**Card ids are hand-allocated by offset** (`domain/decks.py`, e.g. kanji N5→N1 at 0/1000/2000/…).
Adding a deck means picking a verified-disjoint `id_offset` — there's no uniqueness assertion,
so a collision silently corrupts SRS/mastery state rather than erroring.

## Data and bridge conventions

- `data/` normalizes Japanese text (NFC + dash/punctuation variants, `data/text_normalization.py`)
  before every write — new write paths must go through it or lookups silently miss.
- Mastered threshold: `repetitions >= 3` AND `interval >= 21` (days).
- `data/database.load_states()` may fabricate a default `ReviewState` for unseen cards — only
  persist after an actual review, not on load.
- Any new bridge payload should be a `@dataclass`, either in `desktop_bridge.py` or in a `data/`
  repository module the bridge imports from (e.g. `data/dictionary_repository.py`) — never
  duplicated in both. `scripts/generate_ts_types.py` AST-walks the files listed in its
  `SOURCE_FILES` tuple and generates `electron-frontend/src/generated/types.ts` from every
  `@dataclass` it finds (`--check` mode detects drift). Adding a payload dataclass to a new
  source file means adding that file to `SOURCE_FILES` too. Don't hand-write renderer types that
  duplicate one of these dataclasses.
