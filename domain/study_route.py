"""How a study recommendation becomes a launchable round.

Ported from ``electron-frontend/src/lib/studyPlan.ts``, which used to make this
decision in the renderer from deck-mastery aggregates while
``domain/recommendation_service.py`` independently ranked the same sections from
SRS metrics.  Two engines, two rankings, one screen — see the note in
``build_recommendations_payload``.  This module is the routing half of the
merged engine: given a section, the learner's stage, and *why* the recommender
raised the row, it answers "which drill, with which session settings".

Pure: no I/O, no randomness, no hidden state.  Time is never read here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# The six section ids the UI routes on (`ScriptKey` in the renderer).  Not deck
# slugs — one section spans many decks, e.g. `vocab_n5` reaches
# `vocab_n1_law_justice` through the renderer's category map.
SectionKey = Literal[
    "hiragana",
    "katakana",
    "kanji_n5",
    "vocab_n5",
    "grammar_patterns",
    "sentence_examples",
]

MinigameKey = Literal[
    "romaji_sprint",
    "meaning_match",
    "character_match",
    "stroke_order",
    "typed_recall",
    "particle_cloze",
    "imposter",
    "interleave_mix",
]

LearnerStage = Literal["starter", "building", "advanced"]


@dataclass(frozen=True)
class SessionOverrides:
    """Session preferences a row sets before the round starts.

    Applied over the learner's persisted prefs by the renderer, so anything left
    ``None`` keeps whatever the learner last chose.
    """

    leech_focus_enabled: bool | None = None


@dataclass(frozen=True)
class StudyRoute:
    """The launchable half of a recommendation."""

    section: str
    minigame: str
    overrides: SessionOverrides = field(default_factory=SessionOverrides)


# Drills that ask the learner to *produce* an item from memory rather than pick
# it out of a lineup.  They are only useful on a track that is already underway.
RECALL_DRILLS: frozenset[str] = frozenset({
    "typed_recall",
    "stroke_order",
    "particle_cloze",
})

# Reasons that describe a learner who is struggling or starting fresh.  Each
# forces the section's `starter` route, which is recognition-only on every
# branch below — you do not answer "this learner is getting these wrong" with a
# production drill.
RECOGNITION_REASONS: frozenset[str] = frozenset({
    "high_error_rate",
    "new_content_ready",
    "progression_milestone",
    "streak_recovery",
})


def target_mastery(section: str) -> float:
    """Mastery the plan steers *section* toward, as a fraction."""
    if section == "hiragana":
        return 0.9
    if section == "katakana":
        return 0.85
    if section in ("kanji_n5", "vocab_n5"):
        return 0.72
    return 0.68


def recall_floor(section: str) -> float:
    """Track mastery below which recall drills are withheld.

    ``learner_stage`` is a whole-account average, so on its own it will happily
    route a learner into production drills on a track they have never opened —
    two mastered kana tracks are enough to reach ``building``.  Each track
    therefore carries its own floor: half the mastery it is being steered
    toward.
    """
    return target_mastery(section) / 2


def learner_stage(overall_mastery: float, current_streak: int) -> LearnerStage:
    """Classify how far through the six sections the learner is.

    No minimum-reviewed-cards condition on purpose.  The one that used to live
    in the renderer was fed summed deck *totals* — installed corpus size, not a
    reviewed count — so it never fired.  ``current_streak >= 2`` carries the
    intent instead, since a learner cannot hold a two-day streak without having
    reviewed anything (#75).
    """
    if current_streak < 2 or overall_mastery < 0.25:
        return "starter"
    if overall_mastery < 0.65:
        return "building"
    return "advanced"


def stage_minigame(section: str, stage: str, index: int) -> str:
    """The drill *section* leads with at *stage*, for the row at *index*."""
    if section in ("hiragana", "katakana"):
        if stage == "starter":
            return "meaning_match" if index == 0 else "character_match"
        if stage == "building":
            return "character_match" if index == 0 else "romaji_sprint"
        return "interleave_mix" if index == 0 else "character_match"

    if section == "kanji_n5":
        if stage == "starter":
            return "character_match" if index == 0 else "meaning_match"
        if stage == "building":
            return "character_match" if index == 0 else "typed_recall"
        return "typed_recall" if index == 0 else "stroke_order"

    if section == "vocab_n5":
        if stage == "starter":
            return "meaning_match" if index == 0 else "character_match"
        if stage == "building":
            return "typed_recall" if index == 0 else "particle_cloze"
        return "particle_cloze" if index == 0 else "imposter"

    if stage == "starter":
        return "meaning_match" if index == 0 else "character_match"
    if stage == "building":
        return "particle_cloze" if index == 0 else "typed_recall"
    return "imposter" if index == 0 else "particle_cloze"


def choose_route(
    section: str,
    stage: str,
    index: int,
    track_mastery: float,
    reason: str,
) -> StudyRoute:
    """Pick the drill and session settings for one recommendation row.

    The stage route is the baseline; *reason* narrows it, because the reason is
    why the row exists at all:

    - ``leeches_detected`` keeps the stage drill but turns leech focus on, so a
      row labelled "problem items" actually studies the problem items.
    - The reasons in :data:`RECOGNITION_REASONS` drop to the section's
      ``starter`` route.

    *track_mastery* must be scoped to the same content the learner can reach —
    the N5 categories for the kanji/vocabulary sections, not the whole N5→N1
    track.  Passing the wider figure strands a learner who has mastered all of
    N5 below the recall floor.
    """
    effective_stage = "starter" if reason in RECOGNITION_REASONS else stage
    minigame = stage_minigame(section, effective_stage, index)

    # Fall back to the section's own `starter` route rather than a fixed pair.
    # Every `starter` branch is recognition-only, so this is always a safe
    # landing spot, and it keeps each section's preference: kanji leads with
    # `character_match` because recognising the glyph is the apter first drill
    # there, where the other sections lead with `meaning_match`.
    if minigame in RECALL_DRILLS and track_mastery < recall_floor(section):
        minigame = stage_minigame(section, "starter", index)

    overrides = SessionOverrides(
        leech_focus_enabled=True if reason == "leeches_detected" else None,
    )
    return StudyRoute(section=section, minigame=minigame, overrides=overrides)


def session_minutes(total_review_count: int) -> int:
    """Minutes the whole block is meant to take, from the work it contains.

    Replaces the renderer's estimate, which branched on how many reviews the
    learner had done in the past week — a number unrelated to what the rows in
    front of them actually hold.
    """
    if total_review_count <= 0:
        return 10
    if total_review_count < 20:
        return 10
    if total_review_count < 40:
        return 15
    return 20


def session_note(top_label: str | None, stage: str, current_streak: int) -> str:
    """One line of framing under the block heading."""
    if top_label:
        return f"Start with {top_label} and move on once it feels steady."
    if current_streak > 0:
        return "Keep the streak alive with a short mixed review."
    return "Study a few rounds and this will highlight your weakest active track."


def stage_label(stage: str) -> str:
    """Display name for *stage*."""
    if stage == "starter":
        return "Starter-safe"
    if stage == "building":
        return "Build-up"
    return "Advanced"
