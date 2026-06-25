---
description: Instructions for Japanese SRS (spaced repetition) Python desktop application
applyTo: "**/*.py"
---

# Japanese SRS App Instructions

## Scope
Japanese learning app using spaced repetition for vocabulary/kanji.

---

## Core Rules
- Python 3.11+
- Type hints required (public APIs)
- SQLite only (via data layer repositories)
- No global state
- No DB access outside data layer
- Prefer simple, direct implementations

---

## Architecture
- UI: presentation only
- Domain: pure learning logic (SRS + active recall + parsing) (no DB, no I/O)
- Data: SQLite repositories only

Learning system consists of:
- SRS scheduler (long-term retention timing)
- Active recall queue (session-based repetition of mistakes)
- Contextual learning layer (sentence/cloze presentation)
- Mining layer (extracting/creating items from input content)

Rules:
- Scheduling logic and session logic must be separate concerns
- Domain logic must not depend on storage or UI
- Item lifecycle is shared across all learning modes

---

## System Design Interpretation Rule
The following "layers" (SRS, Active Recall, Presentation, Mining) are CONCEPTUAL responsibilities, not required class structures.

Rules:
- Do NOT create a class per layer unless it simplifies implementation
- Prefer functions or small service modules over architectural frameworks
- Layers describe behavioral boundaries, not inheritance or object hierarchies
- Only introduce classes when state persistence or coordination is required

---

## File Structure
Use modular structure:

/domain/
/data/
/ui/

Enforce boundaries:
- domain cannot import data or ui
- data cannot import ui
- ui may import domain and data

---

## SRS Contract (critical)
Deterministic function only:

(last_interval, ease_factor, performance)
-> (next_interval, new_ease_factor)

- No time dependency (inject if needed)
- No randomness
- No hidden state

---

## Learning System Model

Each learning item is processed through four layers:

- Scheduling (SRS): determines long-term review timing
- Session control (Active Recall): immediate repetition of incorrect items
- Presentation (Contextual): how content is shown (word, sentence, cloze)
- Ingestion (Mining): creation of new items from input text/content

Rules:
- These layers must remain independent
- Scheduling must not affect presentation logic
- Presentation must not affect scheduling logic
- Ingestion must not bypass domain validation rules

---

## Data Rules
- All SQLite access must be in repository classes (data layer only)
- Normalize Japanese text using `unicodedata`
- Use dataclasses for domain models

---

## Testing (pytest)
- AAA pattern
- Fully deterministic tests
- Mock DB, filesystem, time
- Integration tests only for full flows

---

## Python Rules
- Explicit exceptions only (no bare except)
- Use standard logging only
- Validate external input at boundaries
- Prefer small pure functions over classes

---

## Implementation Behavior
- No over-engineering
- No unnecessary abstraction
- Direct implementation preferred over design patterns

---

## Redundancy Rule
Do not re-express logic that already exists in Domain, Data, or UI layers.

If functionality exists, reuse it. Do not re-implement it in Skills, Agents, or new files.

---

## Source of Truth Rule
- Domain owns all learning logic
- Data owns all persistence rules
- UI owns all presentation rules

No other layer may redefine these responsibilities.

---

## Output Rule
Prefer minimal diffs and targeted changes over full-file rewrites unless explicitly requested.

---

## Reuse Rule
Before creating new logic, search existing Domain/Data/UI code for reusable functions or repositories.
