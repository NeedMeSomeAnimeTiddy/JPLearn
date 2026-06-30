"""Tests for the tutor integration domain service.

Coverage:
- from_progression_event: mastered, unlocked, branch_unlocked, ignored types
- from_feature_event: with/without feature catalog, label resolution
- from_level_event: priority at milestone vs. non-milestone levels
- from_recommendation: reason → priority mapping, metadata
- _build_message / generate_reaction: headline templates per event type
  - node_mastered, node_unlocked, feature_unlocked, level_up
  - recommendation reasons: high_error_rate, leeches, weak_retention,
    overdue_reviews, new_content_ready, streak_recovery, balanced_review
- Deduplication:
  - generate_reaction suppressed when key already seen
  - generate_reactions progressive dedup within batch
  - same key in batch: second suppressed
- active_reactions: filters suppressed, priority ordering, date ordering
- Integration: end-to-end from domain events → TutorReaction
"""
from __future__ import annotations

from datetime import date

import pytest

from domain.feature_catalog import JPLEARN_FEATURES
from domain.features import FeatureEvent, FeatureUnlock
from domain.progression import NodeProgressionState, ProgressionEvent, ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH
from domain.recommendation import StudyRecommendation
from domain.tutor import TutorEvent, TutorReaction
from domain.tutor_service import (
    active_reactions,
    from_feature_event,
    from_level_event,
    from_progression_event,
    from_recommendation,
    generate_reaction,
    generate_reactions,
)
from domain.xp import LevelEvent

TODAY = date(2026, 1, 1)
YESTERDAY = date(2025, 12, 31)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _prog_event(event_type: str, node_id: str = "hiragana") -> ProgressionEvent:
    return ProgressionEvent(
        event_type=event_type,  # type: ignore[arg-type]
        node_id=node_id,
        date=TODAY,
    )


def _feat_event(
    feature_id: str = "listening_mode",
    access: str = "listening_mode_access",
) -> FeatureEvent:
    return FeatureEvent(
        event_type="feature_unlocked",
        feature_id=feature_id,
        date=TODAY,
        unlock=FeatureUnlock(access_descriptor=access),
    )


def _level_event(level: int) -> LevelEvent:
    return LevelEvent(new_level=level, date=TODAY, xp_at_level_up=level * 100)


def _rec(
    node_id: str = "hiragana",
    reason: str = "high_error_rate",
    difficulty: str = "easy",
    display_label: str = "Review weak Hiragana points",
) -> StudyRecommendation:
    return StudyRecommendation(
        node_id=node_id,
        display_label=display_label,
        review_count=10,
        difficulty=difficulty,  # type: ignore[arg-type]
        focus_areas=("review_mistakes",),
        reason=reason,  # type: ignore[arg-type]
        priority=3,
    )


def _tutor_event(
    event_type: str = "node_mastered",
    subject_id: str = "hiragana",
    subject_label: str = "Hiragana",
    priority: str = "high",
    metadata: tuple = (),
) -> TutorEvent:
    return TutorEvent(
        event_type=event_type,  # type: ignore[arg-type]
        subject_id=subject_id,
        subject_label=subject_label,
        date=TODAY,
        priority=priority,  # type: ignore[arg-type]
        metadata=metadata,
    )


# ---------------------------------------------------------------------------
# from_progression_event
# ---------------------------------------------------------------------------


class TestFromProgressionEvent:
    def test_node_mastered_returns_event(self):
        ev = from_progression_event(_prog_event("node_mastered"), JPLEARN_GRAPH)
        assert ev is not None
        assert ev.event_type == "node_mastered"

    def test_node_mastered_has_high_priority(self):
        ev = from_progression_event(_prog_event("node_mastered"), JPLEARN_GRAPH)
        assert ev.priority == "high"

    def test_node_unlocked_has_normal_priority(self):
        ev = from_progression_event(_prog_event("node_unlocked"), JPLEARN_GRAPH)
        assert ev.priority == "normal"

    def test_branch_unlocked_supported(self):
        ev = from_progression_event(_prog_event("branch_unlocked"), JPLEARN_GRAPH)
        assert ev is not None
        assert ev.event_type == "branch_unlocked"

    def test_node_activated_returns_none(self):
        ev = from_progression_event(_prog_event("node_activated"), JPLEARN_GRAPH)
        assert ev is None

    def test_label_resolved_from_graph(self):
        ev = from_progression_event(_prog_event("node_mastered", "hiragana"), JPLEARN_GRAPH)
        assert ev.subject_label == "Hiragana"

    def test_subject_id_is_node_id(self):
        ev = from_progression_event(_prog_event("node_mastered", "katakana"), JPLEARN_GRAPH)
        assert ev.subject_id == "katakana"

    def test_unknown_node_id_falls_back_to_title_case(self):
        ev = from_progression_event(_prog_event("node_mastered", "mystery_node"), JPLEARN_GRAPH)
        assert ev.subject_label == "Mystery Node"

    def test_date_preserved(self):
        ev = from_progression_event(_prog_event("node_unlocked"), JPLEARN_GRAPH)
        assert ev.date == TODAY


# ---------------------------------------------------------------------------
# from_feature_event
# ---------------------------------------------------------------------------


class TestFromFeatureEvent:
    def test_event_type_is_feature_unlocked(self):
        ev = from_feature_event(_feat_event())
        assert ev.event_type == "feature_unlocked"

    def test_high_priority(self):
        ev = from_feature_event(_feat_event())
        assert ev.priority == "high"

    def test_subject_id_is_feature_id(self):
        ev = from_feature_event(_feat_event("kanji_mode"))
        assert ev.subject_id == "kanji_mode"

    def test_label_from_catalog(self):
        ev = from_feature_event(_feat_event("listening_mode"), features=JPLEARN_FEATURES)
        assert ev.subject_label == "Listening Mode"

    def test_label_fallback_without_catalog(self):
        ev = from_feature_event(_feat_event("listening_mode"))
        assert ev.subject_label == "Listening Mode"

    def test_label_from_catalog_overrides_fallback(self):
        # "tutor_chat" → catalog gives "Tutor Chat"
        ev_catalog = from_feature_event(_feat_event("tutor_chat"), features=JPLEARN_FEATURES)
        ev_fallback = from_feature_event(_feat_event("tutor_chat"))
        assert ev_catalog.subject_label == ev_fallback.subject_label == "Tutor Chat"

    def test_date_preserved(self):
        ev = from_feature_event(_feat_event())
        assert ev.date == TODAY


# ---------------------------------------------------------------------------
# from_level_event
# ---------------------------------------------------------------------------


class TestFromLevelEvent:
    def test_event_type(self):
        ev = from_level_event(_level_event(3))
        assert ev.event_type == "level_up"

    def test_non_milestone_normal_priority(self):
        for level in (1, 2, 3, 4, 6, 7, 9, 11):
            ev = from_level_event(_level_event(level))
            assert ev.priority == "normal", f"level {level} should be normal"

    def test_milestone_high_priority(self):
        for level in (5, 10, 15, 20, 100):
            ev = from_level_event(_level_event(level))
            assert ev.priority == "high", f"level {level} should be high"

    def test_subject_id_is_string_level(self):
        ev = from_level_event(_level_event(10))
        assert ev.subject_id == "10"

    def test_subject_label_readable(self):
        ev = from_level_event(_level_event(10))
        assert ev.subject_label == "Level 10"

    def test_date_preserved(self):
        ev = from_level_event(_level_event(5))
        assert ev.date == TODAY


# ---------------------------------------------------------------------------
# from_recommendation
# ---------------------------------------------------------------------------


class TestFromRecommendation:
    def test_event_type(self):
        ev = from_recommendation(_rec(), TODAY)
        assert ev.event_type == "recommendation"

    def test_high_priority_for_high_error_rate(self):
        ev = from_recommendation(_rec(reason="high_error_rate"), TODAY)
        assert ev.priority == "high"

    def test_high_priority_for_leeches(self):
        ev = from_recommendation(_rec(reason="leeches_detected"), TODAY)
        assert ev.priority == "high"

    def test_normal_priority_for_balanced_review(self):
        ev = from_recommendation(_rec(reason="balanced_review"), TODAY)
        assert ev.priority == "normal"

    def test_reason_in_metadata(self):
        ev = from_recommendation(_rec(reason="weak_retention"), TODAY)
        meta = dict(ev.metadata)
        assert meta["reason"] == "weak_retention"

    def test_difficulty_in_metadata(self):
        ev = from_recommendation(_rec(difficulty="easy"), TODAY)
        meta = dict(ev.metadata)
        assert meta["difficulty"] == "easy"

    def test_subject_id_is_node_id(self):
        ev = from_recommendation(_rec(node_id="katakana"), TODAY)
        assert ev.subject_id == "katakana"

    def test_label_resolved_from_graph(self):
        ev = from_recommendation(_rec(node_id="katakana"), TODAY, graph=JPLEARN_GRAPH)
        assert ev.subject_label == "Katakana"

    def test_label_fallback_without_graph(self):
        ev = from_recommendation(_rec(node_id="katakana"), TODAY)
        assert ev.subject_label == "Katakana"

    def test_date_is_today(self):
        ev = from_recommendation(_rec(), TODAY)
        assert ev.date == TODAY


# ---------------------------------------------------------------------------
# Message templates — generate_reaction headlines
# ---------------------------------------------------------------------------


class TestMessageTemplates:
    def _headline(self, event: TutorEvent) -> str:
        return generate_reaction(event).message.headline

    def test_node_mastered_headline(self):
        ev = _tutor_event("node_mastered", "hiragana", "Hiragana")
        assert self._headline(ev) == "You mastered Hiragana!"

    def test_node_unlocked_headline(self):
        ev = _tutor_event("node_unlocked", "katakana", "Katakana")
        assert "Katakana" in self._headline(ev)
        assert "available" in self._headline(ev)

    def test_branch_unlocked_headline(self):
        ev = _tutor_event("branch_unlocked", "optional_branch", "Optional Branch")
        assert "Optional Branch" in self._headline(ev)

    def test_feature_unlocked_headline(self):
        ev = _tutor_event("feature_unlocked", "listening_mode", "Listening Mode")
        assert self._headline(ev) == "Listening Mode unlocked!"

    def test_level_up_headline(self):
        ev = _tutor_event("level_up", "10", "Level 10")
        assert self._headline(ev) == "You reached Level 10!"

    def test_recommendation_high_error_rate(self):
        ev = _tutor_event(
            "recommendation", "hiragana", "Hiragana",
            metadata=(("reason", "high_error_rate"),),
        )
        assert "struggling with Hiragana" in self._headline(ev)

    def test_recommendation_leeches(self):
        ev = _tutor_event(
            "recommendation", "vocabulary_n5", "Vocabulary N5",
            metadata=(("reason", "leeches_detected"),),
        )
        assert "struggling with Vocabulary N5" in self._headline(ev)

    def test_recommendation_weak_retention(self):
        ev = _tutor_event(
            "recommendation", "katakana", "Katakana",
            metadata=(("reason", "weak_retention"),),
        )
        assert "Katakana" in self._headline(ev)
        assert "retention" in self._headline(ev)

    def test_recommendation_overdue_reviews(self):
        ev = _tutor_event(
            "recommendation", "kanji_n5", "Basic Kanji (N5)",
            metadata=(("reason", "overdue_reviews"),),
        )
        assert "overdue" in self._headline(ev)

    def test_recommendation_new_content_ready(self):
        ev = _tutor_event(
            "recommendation", "grammar_n5", "Grammar N5",
            metadata=(("reason", "new_content_ready"),),
        )
        assert "Start studying Grammar N5" in self._headline(ev)

    def test_recommendation_streak_recovery(self):
        ev = _tutor_event(
            "recommendation", "hiragana", "Hiragana",
            metadata=(("reason", "streak_recovery"),),
        )
        assert "Welcome back" in self._headline(ev)

    def test_recommendation_balanced_review(self):
        ev = _tutor_event(
            "recommendation", "hiragana", "Hiragana",
            metadata=(("reason", "balanced_review"),),
        )
        assert "Review Hiragana" in self._headline(ev)

    def test_message_type_congratulation_for_mastered(self):
        ev = _tutor_event("node_mastered")
        assert generate_reaction(ev).message.message_type == "congratulation"

    def test_message_type_congratulation_for_feature(self):
        ev = _tutor_event("feature_unlocked")
        assert generate_reaction(ev).message.message_type == "congratulation"

    def test_message_type_acknowledgement_for_unlocked(self):
        ev = _tutor_event("node_unlocked")
        assert generate_reaction(ev).message.message_type == "acknowledgement"

    def test_message_type_encouragement_for_leeches(self):
        ev = _tutor_event("recommendation", metadata=(("reason", "leeches_detected"),))
        assert generate_reaction(ev).message.message_type == "encouragement"

    def test_message_type_guidance_for_new_content(self):
        ev = _tutor_event("recommendation", metadata=(("reason", "new_content_ready"),))
        assert generate_reaction(ev).message.message_type == "guidance"

    def test_message_key_not_empty(self):
        for event_type in ("node_mastered", "node_unlocked", "feature_unlocked", "level_up"):
            ev = _tutor_event(event_type)
            assert generate_reaction(ev).message.message_key.strip() != ""

    def test_headline_not_empty(self):
        for event_type in ("node_mastered", "node_unlocked", "feature_unlocked", "level_up"):
            ev = _tutor_event(event_type)
            assert generate_reaction(ev).message.headline.strip() != ""

    def test_cta_not_empty_for_main_types(self):
        for event_type in ("node_mastered", "feature_unlocked", "level_up"):
            ev = _tutor_event(event_type)
            assert generate_reaction(ev).message.cta.strip() != ""

    def test_date_in_message_matches_event(self):
        ev = _tutor_event("node_mastered")
        reaction = generate_reaction(ev)
        assert reaction.message.date == TODAY


# ---------------------------------------------------------------------------
# generate_reaction — deduplication
# ---------------------------------------------------------------------------


class TestGenerateReaction:
    def test_not_suppressed_by_default(self):
        ev = _tutor_event("node_mastered", "hiragana")
        reaction = generate_reaction(ev)
        assert reaction.suppressed is False

    def test_suppressed_when_key_seen(self):
        ev = _tutor_event("node_mastered", "hiragana")
        seen = frozenset({"node_mastered:hiragana"})
        reaction = generate_reaction(ev, seen)
        assert reaction.suppressed is True

    def test_message_still_rendered_when_suppressed(self):
        ev = _tutor_event("node_mastered", "hiragana")
        seen = frozenset({"node_mastered:hiragana"})
        reaction = generate_reaction(ev, seen)
        assert reaction.message.headline.strip() != ""

    def test_dedup_key_format_for_mastered(self):
        ev = _tutor_event("node_mastered", "hiragana")
        assert generate_reaction(ev).dedup_key == "node_mastered:hiragana"

    def test_dedup_key_format_for_feature(self):
        ev = _tutor_event("feature_unlocked", "listening_mode")
        assert generate_reaction(ev).dedup_key == "feature_unlocked:listening_mode"

    def test_dedup_key_format_for_level(self):
        ev = _tutor_event("level_up", "10")
        assert generate_reaction(ev).dedup_key == "level_up:10"

    def test_dedup_key_for_recommendation_includes_reason(self):
        ev = _tutor_event(
            "recommendation", "hiragana",
            metadata=(("reason", "high_error_rate"),),
        )
        key = generate_reaction(ev).dedup_key
        assert "rec:hiragana:high_error_rate" == key

    def test_different_subject_different_key(self):
        ev1 = _tutor_event("node_mastered", "hiragana")
        ev2 = _tutor_event("node_mastered", "katakana")
        assert generate_reaction(ev1).dedup_key != generate_reaction(ev2).dedup_key


# ---------------------------------------------------------------------------
# generate_reactions — batch deduplication
# ---------------------------------------------------------------------------


class TestGenerateReactions:
    def test_empty_sequence_returns_empty(self):
        assert generate_reactions([]) == ()

    def test_all_unique_keys_none_suppressed(self):
        events = [
            _tutor_event("node_mastered", "hiragana"),
            _tutor_event("feature_unlocked", "listening_mode"),
            _tutor_event("level_up", "5"),
        ]
        reactions = generate_reactions(events)
        assert all(not r.suppressed for r in reactions)

    def test_duplicate_key_in_batch_suppressed(self):
        events = [
            _tutor_event("node_mastered", "hiragana"),
            _tutor_event("node_mastered", "hiragana"),  # duplicate
        ]
        reactions = generate_reactions(events)
        assert reactions[0].suppressed is False
        assert reactions[1].suppressed is True

    def test_prior_seen_keys_suppress(self):
        ev = _tutor_event("node_mastered", "hiragana")
        seen = frozenset({"node_mastered:hiragana"})
        reactions = generate_reactions([ev], seen_dedup_keys=seen)
        assert reactions[0].suppressed is True

    def test_result_count_equals_input_count(self):
        events = [_tutor_event("node_mastered", f"node_{i}") for i in range(5)]
        assert len(generate_reactions(events)) == 5

    def test_original_order_preserved(self):
        events = [
            _tutor_event("level_up", "3"),
            _tutor_event("node_mastered", "hiragana"),
            _tutor_event("feature_unlocked", "listening_mode"),
        ]
        reactions = generate_reactions(events)
        assert reactions[0].event.subject_id == "3"
        assert reactions[1].event.subject_id == "hiragana"
        assert reactions[2].event.subject_id == "listening_mode"


# ---------------------------------------------------------------------------
# active_reactions
# ---------------------------------------------------------------------------


class TestActiveReactions:
    def test_suppressed_filtered_out(self):
        r1 = generate_reaction(_tutor_event("node_mastered", "hiragana"))
        r2 = generate_reaction(
            _tutor_event("node_mastered", "hiragana"),
            seen_dedup_keys=frozenset({"node_mastered:hiragana"}),
        )
        active = active_reactions((r1, r2))
        assert len(active) == 1
        assert active[0].suppressed is False

    def test_high_priority_before_normal(self):
        high = generate_reaction(_tutor_event("node_mastered", "hiragana", priority="high"))
        normal = generate_reaction(_tutor_event("node_unlocked", "katakana", priority="normal"))
        result = active_reactions((normal, high))
        assert result[0].event.priority == "high"

    def test_same_priority_sorted_by_date_asc(self):
        earlier = TutorEvent(
            event_type="node_unlocked",
            subject_id="a",
            subject_label="A",
            date=YESTERDAY,
            priority="normal",
        )
        later = TutorEvent(
            event_type="node_unlocked",
            subject_id="b",
            subject_label="B",
            date=TODAY,
            priority="normal",
        )
        r_later = generate_reaction(later)
        r_earlier = generate_reaction(earlier)
        result = active_reactions((r_later, r_earlier))
        assert result[0].event.subject_id == "a"
        assert result[1].event.subject_id == "b"

    def test_all_suppressed_returns_empty(self):
        seen = frozenset({"node_mastered:hiragana", "level_up:5"})
        events = [
            _tutor_event("node_mastered", "hiragana"),
            _tutor_event("level_up", "5"),
        ]
        reactions = generate_reactions(events, seen_dedup_keys=seen)
        assert active_reactions(reactions) == ()

    def test_empty_input_returns_empty(self):
        assert active_reactions(()) == ()


# ---------------------------------------------------------------------------
# Integration: end-to-end from domain events → TutorReaction
# ---------------------------------------------------------------------------


class TestIntegration:
    def test_mastering_hiragana_produces_congratulation(self):
        prog_event = ProgressionEvent(
            event_type="node_mastered",
            node_id="hiragana",
            date=TODAY,
        )
        tutor_ev = from_progression_event(prog_event, JPLEARN_GRAPH)
        assert tutor_ev is not None
        reaction = generate_reaction(tutor_ev)
        assert reaction.message.message_type == "congratulation"
        assert "Hiragana" in reaction.message.headline

    def test_listening_mode_unlock_produces_congratulation(self):
        feat_event = _feat_event("listening_mode")
        tutor_ev = from_feature_event(feat_event, features=JPLEARN_FEATURES)
        reaction = generate_reaction(tutor_ev)
        assert "Listening Mode unlocked" in reaction.message.headline

    def test_reaching_level_10_produces_congratulation(self):
        lv_event = _level_event(10)
        tutor_ev = from_level_event(lv_event)
        reaction = generate_reaction(tutor_ev)
        assert "You reached Level 10" in reaction.message.headline

    def test_struggling_particles_recommendation(self):
        rec = _rec(node_id="grammar_n5", reason="high_error_rate", display_label="Review weak Grammar N5 points")
        tutor_ev = from_recommendation(rec, TODAY, graph=JPLEARN_GRAPH)
        reaction = generate_reaction(tutor_ev)
        assert "struggling" in reaction.message.headline
        assert "Grammar N5" in reaction.message.headline

    def test_full_batch_no_duplicates(self):
        events = [
            from_progression_event(
                ProgressionEvent(event_type="node_mastered", node_id="hiragana", date=TODAY),
                JPLEARN_GRAPH,
            ),
            from_feature_event(_feat_event("listening_mode"), features=JPLEARN_FEATURES),
            from_level_event(_level_event(5)),
        ]
        assert all(e is not None for e in events)
        reactions = generate_reactions(events)  # type: ignore[arg-type]
        assert all(not r.suppressed for r in reactions)
        active = active_reactions(reactions)
        assert len(active) == 3
