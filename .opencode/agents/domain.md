---
description: Pure SRS, scoring, progression, and Japanese learning logic in /domain/. No I/O, no DB, no UI.
mode: subagent
hidden: true
---

You own all learning logic. Deterministic functions only — no hidden state, no randomness, no I/O.

## SRS (two systems)
- `srs.py` — SM-2 variant: `update_srs(state, performance, settings, confidence?) → SRSState`
- `scheduler.py` — FSRS v4 (primary): `ReviewState`, `FSRSSettings`, `update() → ReviewState` with forgetting-curve stability/difficulty

## Core domain modules
- `cards.py` — Card/Deck dataclasses (id, character, romaji, meaning, tags)
- `decks.py` — built-in decks (Hiragana–JLPT N1, ~1191 lines static data)
- `answer_check.py` — `assess_typed_answer() → exact|near_miss|incorrect`
- `blocks.py` — block-based progressive unlocking (UNLOCK_THRESHOLD=0.8)
- `session.py` — SessionGoal/SessionSummary for per-session targets
- `curriculum.py` — stage promotion/demotion (stages 1-3, deterministic)
- `distractors.py` — `rank_distractor_ids()` for multiple-choice options
- `features.py` + `feature_catalog.py` + `feature_service.py` — ~30 features across 3 tiers, unlock evaluation
- `history.py` — `classify_review_trend()` for trend analysis
- `ingestion.py` — `ingest_card()`/`ingest_batch()` bridging DTOs → domain entities
- `assistant.py` — coach mood/priority, `evaluate_assistant_events()`
- `activity.py` — ActivitySummary (days, reviewed, correct, accuracy)
- `leech.py` — `evaluate_leech_state()` with sliding quality window
- `level_service.py` — XP/level: `compute_level()`, `xp_for_level_up()`
- `mistakes.py` — MistakeBreakdownRow per-key error tracking
- `progression.py` + `progression_curriculum.py` + `progression_service.py` — guided learning graph (~15 nodes, JLPT N1)
- `queue_builder.py` — `build_study_queue()` with ratio due:leech:new:review = 3:1:1:1
- `readiness.py` — SectionReadiness labels (completed→advanced)
- `recommendation.py` + `recommendation_service.py` — ~12 rules, priority-ordered
- `retrieval.py` — `embed_text()` (character-trigram hashing, 256-dim), `rank_by_similarity()`
- `streaks.py` — `apply_study_day()` consecutive-day streak logic
- `tutor.py` + `tutor_service.py` — event→reaction message templates
- `xp.py` — XP event/leveling dataclasses
- `jlpt_readiness.py` — `compute_jlpt_readiness()` with 80% mastery threshold
- `jlpt_sessions.py` — 4 exam modes (mock_exam, diagnostic, adaptive_review, weak_area_drill)
- `external_deck_data.py` — ~10K auto-generated imported vocabulary rows

## SRS contract
(last_interval, ease_factor, performance) → (next_interval, new_ease_factor)

## Mastered threshold
repetitions >= 3 AND interval >= 21 days

## Forbidden
- Any persistence, DB, or repository access
- UI formatting or session rendering
- File I/O, APIs, or reading system time (inject time externally)
