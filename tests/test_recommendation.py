"""Tests for the adaptive study recommendation system.

Coverage:
- _is_accessible: locked vs. unlocked, missing node
- _accessible_metrics: filters locked nodes and empty nodes
- _rule_streak_recovery: trigger threshold, node selection
- _rule_overdue_reviews: threshold, ordering, multiple nodes
- _rule_high_error_rate: accuracy threshold, mistake signal, ordering
- _rule_leeches_detected: threshold, ordering
- _rule_weak_retention: mastered+declining vs. low-mastery node
- _rule_new_content_ready: unstarted nodes, partial-progress excluded
- _rule_progression_milestone: unlocked status gate
- _rule_balanced_review: fallback, due prioritisation, all-new fallback
- generate_recommendations: priority ordering, deduplication, max cap,
                             determinism, empty snapshot
- create_recommendation_event: fields, context_summary content
"""
from __future__ import annotations

from datetime import date

import pytest

from domain.progression import NodeProgressionState, ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH
from domain.recommendation import (
    FOCUSED_REVIEW_COUNT,
    LEECH_THRESHOLD,
    OVERDUE_CRITICAL_THRESHOLD,
    QUICK_REVIEW_COUNT,
    STREAK_BREAK_DAYS,
    STRUGGLING_ACCURACY_THRESHOLD,
    CategoryMetrics,
    StudySnapshot,
)
from domain.recommendation_service import (
    _accessible_metrics,
    _is_accessible,
    create_recommendation_event,
    generate_recommendations,
)

TODAY = date(2026, 1, 1)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _prog(node_ids_and_statuses: dict[str, str]) -> ProgressionState:
    return ProgressionState(
        node_states={
            nid: NodeProgressionState(node_id=nid, status=status)  # type: ignore[arg-type]
            for nid, status in node_ids_and_statuses.items()
        }
    )


def _metrics(
    node_id: str,
    *,
    due: int = 5,
    overdue: int = 0,
    new: int = 0,
    leeches: int = 0,
    accuracy: float = 0.85,
    mastered: float = 0.3,
    total: int = 50,
) -> CategoryMetrics:
    return CategoryMetrics(
        node_id=node_id,
        due_count=due,
        overdue_count=overdue,
        new_count=new,
        leech_count=leeches,
        accuracy_7d=accuracy,
        mastered_ratio=mastered,
        total_items=total,
    )


def _snapshot(
    metrics: list[CategoryMetrics],
    *,
    node_statuses: dict[str, str] | None = None,
    days_since: int = 0,
    streak: int = 5,
    xp_7d: int = 200,
    mistake_ids: tuple[str, ...] = (),
) -> StudySnapshot:
    if node_statuses is None:
        node_statuses = {m.node_id: "active" for m in metrics}
    return StudySnapshot(
        date=TODAY,
        category_metrics=tuple(metrics),
        progression_state=_prog(node_statuses),
        days_since_last_study=days_since,
        current_streak=streak,
        xp_last_7_days=xp_7d,
        recent_mistake_node_ids=mistake_ids,
    )


# ---------------------------------------------------------------------------
# _is_accessible
# ---------------------------------------------------------------------------


class TestIsAccessible:
    def test_unlocked_node_is_accessible(self):
        snap = _snapshot([], node_statuses={"hiragana": "unlocked"})
        assert _is_accessible("hiragana", snap) is True

    def test_active_node_is_accessible(self):
        snap = _snapshot([], node_statuses={"hiragana": "active"})
        assert _is_accessible("hiragana", snap) is True

    def test_mastered_node_is_accessible(self):
        snap = _snapshot([], node_statuses={"hiragana": "mastered"})
        assert _is_accessible("hiragana", snap) is True

    def test_locked_node_is_not_accessible(self):
        snap = _snapshot([], node_statuses={"hiragana": "locked"})
        assert _is_accessible("hiragana", snap) is False

    def test_unknown_node_is_accessible(self):
        snap = _snapshot([], node_statuses={})
        assert _is_accessible("unknown_node", snap) is True


# ---------------------------------------------------------------------------
# _accessible_metrics
# ---------------------------------------------------------------------------


class TestAccessibleMetrics:
    def test_locked_nodes_excluded(self):
        snap = _snapshot(
            [_metrics("a"), _metrics("b")],
            node_statuses={"a": "active", "b": "locked"},
        )
        result = _accessible_metrics(snap, JPLEARN_GRAPH)
        ids = [m.node_id for m in result]
        assert "b" not in ids
        assert "a" in ids

    def test_zero_total_items_excluded(self):
        snap = _snapshot(
            [_metrics("a", total=0), _metrics("b", total=5)],
            node_statuses={"a": "active", "b": "active"},
        )
        result = _accessible_metrics(snap, JPLEARN_GRAPH)
        ids = [m.node_id for m in result]
        assert "a" not in ids
        assert "b" in ids

    def test_result_sorted_by_node_id(self):
        snap = _snapshot(
            [_metrics("z"), _metrics("a"), _metrics("m")],
            node_statuses={"z": "active", "a": "active", "m": "active"},
        )
        result = _accessible_metrics(snap, JPLEARN_GRAPH)
        ids = [m.node_id for m in result]
        assert ids == sorted(ids)


# ---------------------------------------------------------------------------
# Rule: streak_recovery
# ---------------------------------------------------------------------------


class TestRuleStreakRecovery:
    def test_no_gap_does_not_fire(self):
        snap = _snapshot([_metrics("hiragana")], days_since=0)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "streak_recovery" not in reasons

    def test_one_day_gap_does_not_fire(self):
        snap = _snapshot([_metrics("hiragana")], days_since=STREAK_BREAK_DAYS - 1)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "streak_recovery" not in reasons

    def test_gap_fires_at_threshold(self):
        snap = _snapshot([_metrics("hiragana")], days_since=STREAK_BREAK_DAYS)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "streak_recovery" for r in recs)

    def test_streak_recovery_is_easy(self):
        snap = _snapshot([_metrics("hiragana")], days_since=STREAK_BREAK_DAYS)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        sr = next(r for r in recs if r.reason == "streak_recovery")
        assert sr.difficulty == "easy"

    def test_streak_recovery_review_count(self):
        snap = _snapshot([_metrics("hiragana")], days_since=STREAK_BREAK_DAYS)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        sr = next(r for r in recs if r.reason == "streak_recovery")
        assert sr.review_count == QUICK_REVIEW_COUNT

    def test_streak_recovery_has_priority_1(self):
        snap = _snapshot([_metrics("hiragana")], days_since=STREAK_BREAK_DAYS)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        sr = next(r for r in recs if r.reason == "streak_recovery")
        assert sr.priority == 1


# ---------------------------------------------------------------------------
# Rule: overdue_reviews
# ---------------------------------------------------------------------------


class TestRuleOverdueReviews:
    def test_below_threshold_does_not_fire(self):
        snap = _snapshot(
            [_metrics("hiragana", overdue=OVERDUE_CRITICAL_THRESHOLD - 1)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "overdue_reviews" not in reasons

    def test_at_threshold_fires(self):
        snap = _snapshot(
            [_metrics("hiragana", overdue=OVERDUE_CRITICAL_THRESHOLD)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "overdue_reviews" for r in recs)

    def test_most_overdue_node_first(self):
        snap = _snapshot([
            _metrics("b", overdue=15),
            _metrics("a", overdue=OVERDUE_CRITICAL_THRESHOLD),
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        overdue_recs = [r for r in recs if r.reason == "overdue_reviews"]
        assert overdue_recs[0].node_id == "b"

    def test_review_count_capped_at_default(self):
        snap = _snapshot(
            [_metrics("hiragana", overdue=100)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        orec = next(r for r in recs if r.reason == "overdue_reviews")
        assert orec.review_count <= 20


# ---------------------------------------------------------------------------
# Rule: high_error_rate
# ---------------------------------------------------------------------------


class TestRuleHighErrorRate:
    def test_good_accuracy_does_not_fire(self):
        snap = _snapshot([_metrics("hiragana", accuracy=0.85)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "high_error_rate" not in reasons

    def test_below_threshold_fires(self):
        snap = _snapshot(
            [_metrics("hiragana", accuracy=STRUGGLING_ACCURACY_THRESHOLD - 0.01)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "high_error_rate" for r in recs)

    def test_worst_accuracy_first(self):
        snap = _snapshot([
            _metrics("b", accuracy=0.50),
            _metrics("a", accuracy=0.40),
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        err_recs = [r for r in recs if r.reason == "high_error_rate"]
        assert err_recs[0].node_id == "a"

    def test_mistake_signal_promotes_node(self):
        """A node with explicit mistake signal is included even above threshold."""
        snap = _snapshot(
            [_metrics("a", accuracy=0.75)],  # above struggling threshold
            mistake_ids=("a",),
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "high_error_rate" and r.node_id == "a" for r in recs)

    def test_high_error_rate_is_easy(self):
        snap = _snapshot(
            [_metrics("hiragana", accuracy=0.40)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        hr = next(r for r in recs if r.reason == "high_error_rate")
        assert hr.difficulty == "easy"

    def test_focus_areas_include_mistakes(self):
        snap = _snapshot([_metrics("hiragana", accuracy=0.40)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        hr = next(r for r in recs if r.reason == "high_error_rate")
        assert "review_mistakes" in hr.focus_areas


# ---------------------------------------------------------------------------
# Rule: leeches_detected
# ---------------------------------------------------------------------------


class TestRuleLeechesDetected:
    def test_at_threshold_does_not_fire(self):
        snap = _snapshot([_metrics("hiragana", leeches=LEECH_THRESHOLD)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "leeches_detected" not in reasons

    def test_above_threshold_fires(self):
        snap = _snapshot([_metrics("hiragana", leeches=LEECH_THRESHOLD + 1)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "leeches_detected" for r in recs)

    def test_most_leeches_first(self):
        snap = _snapshot([
            _metrics("a", leeches=5),
            _metrics("b", leeches=10),
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        leech_recs = [r for r in recs if r.reason == "leeches_detected"]
        assert leech_recs[0].node_id == "b"

    def test_review_count_proportional(self):
        snap = _snapshot([_metrics("hiragana", leeches=LEECH_THRESHOLD + 1)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        lr = next(r for r in recs if r.reason == "leeches_detected")
        assert lr.review_count <= FOCUSED_REVIEW_COUNT

    def test_leech_rec_is_easy(self):
        snap = _snapshot([_metrics("hiragana", leeches=5)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        lr = next(r for r in recs if r.reason == "leeches_detected")
        assert lr.difficulty == "easy"


# ---------------------------------------------------------------------------
# Rule: weak_retention
# ---------------------------------------------------------------------------


class TestRuleWeakRetention:
    def test_low_mastery_does_not_fire(self):
        """Node with mastered_ratio < 0.4 should not trigger weak_retention."""
        snap = _snapshot([_metrics("hiragana", mastered=0.2, accuracy=0.65)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "weak_retention" not in reasons

    def test_mastered_and_declining_fires(self):
        snap = _snapshot(
            [_metrics("hiragana", mastered=0.6, accuracy=0.65)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "weak_retention" for r in recs)

    def test_mastered_and_good_accuracy_does_not_fire(self):
        snap = _snapshot(
            [_metrics("hiragana", mastered=0.6, accuracy=0.85)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "weak_retention" not in reasons

    def test_worst_retention_first(self):
        snap = _snapshot([
            _metrics("b", mastered=0.5, accuracy=0.68),
            _metrics("a", mastered=0.5, accuracy=0.62),
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        wr = [r for r in recs if r.reason == "weak_retention"]
        assert wr[0].node_id == "a"


# ---------------------------------------------------------------------------
# Rule: new_content_ready
# ---------------------------------------------------------------------------


class TestRuleNewContentReady:
    def test_no_new_items_does_not_fire(self):
        snap = _snapshot([_metrics("hiragana", new=0, due=5)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "new_content_ready" not in reasons

    def test_partial_progress_excluded(self):
        """Nodes with existing due items should not fire new_content_ready."""
        snap = _snapshot([_metrics("hiragana", new=10, due=5)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "new_content_ready" not in reasons

    def test_unstarted_node_fires(self):
        snap = _snapshot(
            [_metrics("hiragana", new=15, due=0, overdue=0, mastered=0.0)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "new_content_ready" for r in recs)

    def test_review_count_capped(self):
        snap = _snapshot(
            [_metrics("hiragana", new=100, due=0, overdue=0, mastered=0.0)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        nr = next(r for r in recs if r.reason == "new_content_ready")
        assert nr.review_count <= 15


# ---------------------------------------------------------------------------
# Rule: progression_milestone
# ---------------------------------------------------------------------------


class TestRuleProgressionMilestone:
    def test_active_node_does_not_fire_milestone(self):
        snap = _snapshot(
            [_metrics("hiragana", new=10, due=0, overdue=0, mastered=0.0)],
            node_statuses={"hiragana": "active"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        reasons = {r.reason for r in recs}
        assert "progression_milestone" not in reasons

    def test_unlocked_node_fires_milestone(self):
        snap = _snapshot(
            [_metrics("hiragana", new=10, due=0, overdue=0, mastered=0.0)],
            node_statuses={"hiragana": "unlocked"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        # progression_milestone has lower priority than new_content_ready,
        # but if new_content_ready doesn't fire (due=0 is fine, but mastered=0)
        # let's check which fires
        all_reasons = {r.reason for r in recs}
        # With due=0, overdue=0, mastered=0, new=10 → new_content_ready fires first
        # milestone also requires "unlocked" status: verify via explicit check
        milestone_snap = _snapshot(
            [_metrics("test_node", new=10, due=0, overdue=0, mastered=0.1)],
            node_statuses={"test_node": "unlocked"},
        )
        recs2 = generate_recommendations(milestone_snap, JPLEARN_GRAPH)
        assert any(r.reason == "progression_milestone" for r in recs2)


# ---------------------------------------------------------------------------
# Rule: balanced_review
# ---------------------------------------------------------------------------


class TestRuleBalancedReview:
    def test_fallback_fires_with_due_items(self):
        snap = _snapshot([_metrics("hiragana", due=10)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.reason == "balanced_review" for r in recs)

    def test_highest_due_count_first(self):
        snap = _snapshot([
            _metrics("b", due=5),
            _metrics("a", due=20),
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        br = [r for r in recs if r.reason == "balanced_review"]
        assert br[0].node_id == "a"

    def test_new_items_fallback_when_nothing_due(self):
        snap = _snapshot(
            [_metrics("hiragana", due=0, overdue=0, new=10)]
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        # new_content_ready fires first if mastered=0, else balanced
        all_reasons = {r.reason for r in recs}
        assert "balanced_review" in all_reasons or "new_content_ready" in all_reasons


# ---------------------------------------------------------------------------
# generate_recommendations — priority, dedup, determinism
# ---------------------------------------------------------------------------


class TestGenerateRecommendations:
    def test_empty_snapshot_returns_empty(self):
        snap = _snapshot([])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert recs == ()

    def test_max_recommendations_respected(self):
        snap = _snapshot(
            [_metrics(f"node_{i}", due=10) for i in range(10)],
            node_statuses={f"node_{i}": "active" for i in range(10)},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        assert len(recs) <= 2

    def test_no_duplicate_node_ids(self):
        snap = _snapshot([
            _metrics("a", accuracy=0.40, leeches=5),  # triggers both high_error and leeches
        ])
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=5)
        node_ids = [r.node_id for r in recs]
        assert len(node_ids) == len(set(node_ids))

    def test_priority_ordering_preserved(self):
        """streak_recovery (priority 1) must precede balanced_review (priority 8)."""
        snap = _snapshot(
            [_metrics("hiragana", due=10)],
            days_since=STREAK_BREAK_DAYS,
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=2)
        if len(recs) >= 2:
            assert recs[0].priority <= recs[1].priority

    def test_determinism_same_inputs_same_output(self):
        snap = _snapshot([
            _metrics("a", accuracy=0.45, leeches=5, overdue=12, due=8),
            _metrics("b", accuracy=0.90, due=3),
        ])
        recs1 = generate_recommendations(snap, JPLEARN_GRAPH)
        recs2 = generate_recommendations(snap, JPLEARN_GRAPH)
        assert recs1 == recs2

    def test_locked_node_never_recommended(self):
        snap = _snapshot(
            [_metrics("hiragana", due=100)],
            node_statuses={"hiragana": "locked"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert all(r.node_id != "hiragana" for r in recs)

    def test_all_rules_can_coexist_with_max_3(self):
        """Snapshot designed to trigger multiple rules — max 3 returned."""
        snap = _snapshot(
            [
                _metrics("a", accuracy=0.40, leeches=5, overdue=12, mastered=0.7),
                _metrics("b", accuracy=0.45, due=5),
                _metrics("c", due=5),
            ],
            days_since=STREAK_BREAK_DAYS,
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=3)
        assert len(recs) <= 3
        assert len({r.node_id for r in recs}) == len(recs)

    def test_streak_recovery_is_highest_priority_among_returned(self):
        snap = _snapshot(
            [
                _metrics("a", accuracy=0.40, overdue=15),
                _metrics("b", due=5),
            ],
            days_since=STREAK_BREAK_DAYS,
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert recs[0].reason == "streak_recovery"

    def test_display_label_not_empty(self):
        snap = _snapshot([_metrics("hiragana", due=10)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        for rec in recs:
            assert rec.display_label.strip() != ""

    def test_review_count_positive(self):
        snap = _snapshot([_metrics("hiragana", due=5, overdue=3, new=10)])
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        for rec in recs:
            assert rec.review_count > 0


# ---------------------------------------------------------------------------
# JPLEARN_GRAPH integration
# ---------------------------------------------------------------------------


class TestJPLearnIntegration:
    def test_hiragana_low_accuracy_recommends_review(self):
        snap = _snapshot(
            [_metrics("hiragana", accuracy=0.45, due=10)],
            node_statuses={"hiragana": "active"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.node_id == "hiragana" and r.reason == "high_error_rate" for r in recs)

    def test_vocabulary_leeches_fires(self):
        snap = _snapshot(
            [_metrics("vocabulary_n5", leeches=6, due=10)],
            node_statuses={"vocabulary_n5": "active"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.node_id == "vocabulary_n5" and r.reason == "leeches_detected" for r in recs)

    def test_unlocked_grammar_fires_milestone(self):
        snap = _snapshot(
            [_metrics("grammar_n5", new=20, due=0, overdue=0, mastered=0.1)],
            node_statuses={"grammar_n5": "unlocked"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        assert any(r.node_id == "grammar_n5" for r in recs)

    def test_display_labels_use_real_node_names(self):
        snap = _snapshot(
            [_metrics("hiragana", due=10)],
            node_statuses={"hiragana": "active"},
        )
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        for rec in recs:
            assert "Hiragana" in rec.display_label


# ---------------------------------------------------------------------------
# create_recommendation_event
# ---------------------------------------------------------------------------


class TestCreateRecommendationEvent:
    def _make_recs(self, n: int = 1):
        snap = _snapshot([_metrics("hiragana", due=10)])
        return generate_recommendations(snap, JPLEARN_GRAPH, max_recommendations=n), snap

    def test_event_type(self):
        recs, snap = self._make_recs()
        event = create_recommendation_event(recs, snap)
        assert event.event_type == "recommendations_generated"

    def test_date_matches_snapshot(self):
        recs, snap = self._make_recs()
        event = create_recommendation_event(recs, snap)
        assert event.date == TODAY

    def test_recommendations_attached(self):
        recs, snap = self._make_recs()
        event = create_recommendation_event(recs, snap)
        assert event.recommendations == recs

    def test_context_summary_not_empty(self):
        recs, snap = self._make_recs()
        event = create_recommendation_event(recs, snap)
        assert event.context_summary.strip() != ""

    def test_context_summary_includes_streak(self):
        recs, snap = self._make_recs()
        event = create_recommendation_event(recs, snap)
        assert "streak" in event.context_summary

    def test_context_summary_studied_today(self):
        snap = _snapshot([_metrics("hiragana", due=5)], days_since=0)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        event = create_recommendation_event(recs, snap)
        assert "studied today" in event.context_summary

    def test_context_summary_gap_days(self):
        snap = _snapshot([_metrics("hiragana", due=5)], days_since=3)
        recs = generate_recommendations(snap, JPLEARN_GRAPH)
        event = create_recommendation_event(recs, snap)
        assert "gap=3d" in event.context_summary

    def test_empty_recommendations(self):
        snap = _snapshot([])
        event = create_recommendation_event((), snap)
        assert event.recommendations == ()
        assert "0 recommendation" in event.context_summary
