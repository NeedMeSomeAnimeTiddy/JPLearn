"""Deterministic study recommendation logic.

All functions are pure, side-effect free, and produce identical outputs for
identical inputs.  No machine learning, no randomness.

Rules are applied in a fixed priority order.  Each rule inspects the
:class:`~domain.recommendation.StudySnapshot` and returns zero or more
:class:`~domain.recommendation.StudyRecommendation` candidates.
``generate_recommendations`` collects candidates across all rules, deduplicates
by node_id (first occurrence wins, preserving priority order), and returns the
top *max_recommendations* results.
"""
from __future__ import annotations

from domain.progression import ProgressionGraph
from domain.recommendation import (
    FOCUSED_REVIEW_COUNT,
    DEFAULT_REVIEW_COUNT,
    LEECH_THRESHOLD,
    OVERDUE_CRITICAL_THRESHOLD,
    QUICK_REVIEW_COUNT,
    RETENTION_ACCURACY_THRESHOLD,
    STREAK_BREAK_DAYS,
    STRUGGLING_ACCURACY_THRESHOLD,
    CategoryMetrics,
    RecommendationEvent,
    StudyRecommendation,
    StudySnapshot,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _node_name(node_id: str, graph: ProgressionGraph) -> str:
    """Return the human-readable name for a node, falling back to the id."""
    node = graph.nodes.get(node_id)
    return node.name if node else node_id.replace("_", " ").title()


def _is_accessible(node_id: str, snapshot: StudySnapshot) -> bool:
    """Return True if a node is not locked in the current progression state.

    Nodes absent from the progression state are treated as accessible so that
    content outside the formal graph can still receive recommendations.
    """
    ns = snapshot.progression_state.node_states.get(node_id)
    return ns is None or ns.status != "locked"


def _accessible_metrics(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
) -> list[CategoryMetrics]:
    """Return metrics for all accessible, non-empty nodes, sorted by node_id."""
    return sorted(
        (m for m in snapshot.category_metrics if _is_accessible(m.node_id, snapshot) and m.total_items > 0),
        key=lambda m: m.node_id,
    )


def _build(
    node_id: str,
    graph: ProgressionGraph,
    *,
    reason: str,
    display_template: str,
    review_count: int,
    difficulty: str,
    focus_areas: tuple[str, ...],
    priority: int,
) -> StudyRecommendation:
    name = _node_name(node_id, graph)
    return StudyRecommendation(
        node_id=node_id,
        display_label=display_template.format(name=name),
        review_count=review_count,
        difficulty=difficulty,  # type: ignore[arg-type]
        focus_areas=focus_areas,
        reason=reason,  # type: ignore[arg-type]
        priority=priority,
    )


# ---------------------------------------------------------------------------
# Individual rule functions
# ---------------------------------------------------------------------------


def _rule_streak_recovery(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when the learner returns after a study gap."""
    if snapshot.days_since_last_study < STREAK_BREAK_DAYS:
        return []
    if not metrics:
        return []
    # Pick the node with the most due items as the warm-up target.
    target = max(metrics, key=lambda m: (m.due_count, -metrics.index(m)))
    return [
        _build(
            target.node_id,
            graph,
            reason="streak_recovery",
            display_template="Warm up with {name}",
            review_count=QUICK_REVIEW_COUNT,
            difficulty="easy",
            focus_areas=("familiar_items",),
            priority=priority,
        )
    ]


def _rule_overdue_reviews(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when a node has a significant overdue backlog."""
    overdue = [m for m in metrics if m.overdue_count >= OVERDUE_CRITICAL_THRESHOLD]
    if not overdue:
        return []
    # Sort: most overdue first, then by node_id for determinism.
    overdue.sort(key=lambda m: (-m.overdue_count, m.node_id))
    result = []
    for m in overdue:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="overdue_reviews",
                display_template="Catch up on {name} reviews",
                review_count=min(m.overdue_count, DEFAULT_REVIEW_COUNT),
                difficulty="normal",
                focus_areas=("overdue_items",),
                priority=priority,
            )
        )
    return result


def _rule_high_error_rate(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when a node's 7-day accuracy falls below the struggling threshold."""
    struggling = [
        m for m in metrics
        if m.accuracy_7d < STRUGGLING_ACCURACY_THRESHOLD and m.total_items > 0
    ]
    # Also include nodes with recent explicit mistake signals.
    mistake_ids = set(snapshot.recent_mistake_node_ids)
    extra = [
        m for m in metrics
        if m.node_id in mistake_ids and m not in struggling
    ]
    candidates = struggling + extra
    if not candidates:
        return []
    candidates.sort(key=lambda m: (m.accuracy_7d, m.node_id))
    result = []
    for m in candidates:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="high_error_rate",
                display_template="Review weak {name} points",
                review_count=FOCUSED_REVIEW_COUNT,
                difficulty="easy",
                focus_areas=("review_mistakes", "confusion_pairs"),
                priority=priority,
            )
        )
    return result


def _rule_leeches_detected(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when a node has a significant number of leech cards."""
    leechy = [m for m in metrics if m.leech_count > LEECH_THRESHOLD]
    if not leechy:
        return []
    leechy.sort(key=lambda m: (-m.leech_count, m.node_id))
    result = []
    for m in leechy:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="leeches_detected",
                display_template="Review {name} problem items",
                review_count=min(m.leech_count * 2, FOCUSED_REVIEW_COUNT),
                difficulty="easy",
                focus_areas=("problem_items", "weak_spots"),
                priority=priority,
            )
        )
    return result


def _rule_weak_retention(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when mastered content shows declining accuracy."""
    weak = [
        m for m in metrics
        if m.mastered_ratio >= 0.4
        and 0.0 < m.accuracy_7d < RETENTION_ACCURACY_THRESHOLD
    ]
    if not weak:
        return []
    weak.sort(key=lambda m: (m.accuracy_7d, m.node_id))
    result = []
    for m in weak:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="weak_retention",
                display_template="Reinforce {name} retention",
                review_count=FOCUSED_REVIEW_COUNT,
                difficulty="normal",
                focus_areas=("spaced_repetition", "retention_boost"),
                priority=priority,
            )
        )
    return result


def _rule_new_content_ready(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when an accessible node has unstarted items and no prior progress."""
    new_nodes = [
        m for m in metrics
        if m.new_count > 0
        and m.mastered_ratio == 0.0
        and m.due_count == 0
        and m.overdue_count == 0
    ]
    if not new_nodes:
        return []
    new_nodes.sort(key=lambda m: m.node_id)
    result = []
    for m in new_nodes:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="new_content_ready",
                display_template="Start studying {name}",
                review_count=min(m.new_count, 15),
                difficulty="normal",
                focus_areas=("introduction", "first_pass"),
                priority=priority,
            )
        )
    return result


def _rule_progression_milestone(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Fire when a node was recently unlocked and is ready to begin.

    Targets nodes that are "unlocked" in progression (not yet active) and
    have new items available.
    """
    metric_ids = {m.node_id for m in metrics}
    recently_unlocked = [
        m for m in metrics
        if m.node_id in metric_ids
        and _node_status(m.node_id, snapshot) == "unlocked"
        and m.new_count > 0
    ]
    if not recently_unlocked:
        return []
    recently_unlocked.sort(key=lambda m: m.node_id)
    result = []
    for m in recently_unlocked:
        result.append(
            _build(
                m.node_id,
                graph,
                reason="progression_milestone",
                display_template="Begin {name}",
                review_count=min(m.new_count, 15),
                difficulty="normal",
                focus_areas=("introduction",),
                priority=priority,
            )
        )
    return result


def _rule_balanced_review(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    metrics: list[CategoryMetrics],
    priority: int,
) -> list[StudyRecommendation]:
    """Default fallback: pick nodes with the most due or overdue items."""
    workload = [m for m in metrics if m.due_count + m.overdue_count > 0]
    if not workload:
        # Nothing due — suggest the node with the most new items.
        workload = [m for m in metrics if m.new_count > 0]
    if not workload:
        workload = list(metrics)
    if not workload:
        return []
    workload.sort(key=lambda m: (-(m.due_count + m.overdue_count), m.node_id))
    result = []
    for m in workload:
        total = m.due_count + m.overdue_count + m.new_count
        result.append(
            _build(
                m.node_id,
                graph,
                reason="balanced_review",
                display_template="Review {name}",
                review_count=min(total, DEFAULT_REVIEW_COUNT),
                difficulty="normal",
                focus_areas=(),
                priority=priority,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Rule registry (priority order — first rule has highest priority)
# ---------------------------------------------------------------------------

# Each entry: (rule_function, priority_number)
_RULES = [
    (_rule_streak_recovery, 1),
    (_rule_overdue_reviews, 2),
    (_rule_high_error_rate, 3),
    (_rule_leeches_detected, 4),
    (_rule_weak_retention, 5),
    (_rule_new_content_ready, 6),
    (_rule_progression_milestone, 7),
    (_rule_balanced_review, 8),
]


# ---------------------------------------------------------------------------
# Helper for rule functions that need node status
# ---------------------------------------------------------------------------


def _node_status(node_id: str, snapshot: StudySnapshot) -> str:
    ns = snapshot.progression_state.node_states.get(node_id)
    return ns.status if ns is not None else "unlocked"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_recommendations(
    snapshot: StudySnapshot,
    graph: ProgressionGraph,
    max_recommendations: int = 3,
) -> tuple[StudyRecommendation, ...]:
    """Generate up to *max_recommendations* prioritised study recommendations.

    Rules are applied in priority order.  Each rule may produce multiple
    candidates (e.g. several struggling nodes).  Candidates are collected
    across all rules; the first recommendation for any given ``node_id`` wins
    (deduplication by node_id, priority preserved).

    Args:
        snapshot: All context needed to evaluate rules.
        graph: Progression graph used to look up node names.
        max_recommendations: Maximum number of recommendations to return.

    Returns:
        Tuple of recommendations ordered by priority (highest first).
        Empty if no accessible nodes have items.
    """
    metrics = _accessible_metrics(snapshot, graph)
    seen: set[str] = set()
    results: list[StudyRecommendation] = []

    for rule_fn, priority in _RULES:
        if len(results) >= max_recommendations:
            break
        candidates = rule_fn(snapshot, graph, metrics, priority)
        for rec in candidates:
            if len(results) >= max_recommendations:
                break
            if rec.node_id not in seen:
                results.append(rec)
                seen.add(rec.node_id)

    return tuple(results)


def create_recommendation_event(
    recommendations: tuple[StudyRecommendation, ...],
    snapshot: StudySnapshot,
) -> RecommendationEvent:
    """Wrap a set of recommendations in a :class:`~domain.recommendation.RecommendationEvent`.

    The ``context_summary`` is assembled deterministically from the snapshot.
    """
    streak_info = (
        f"streak={snapshot.current_streak}d"
        if snapshot.current_streak > 0
        else "no active streak"
    )
    gap_info = (
        f"gap={snapshot.days_since_last_study}d"
        if snapshot.days_since_last_study > 0
        else "studied today"
    )
    summary = (
        f"{len(recommendations)} recommendation(s); "
        f"{streak_info}; {gap_info}; xp_7d={snapshot.xp_last_7_days}"
    )
    return RecommendationEvent(
        event_type="recommendations_generated",
        date=snapshot.date,
        recommendations=recommendations,
        context_summary=summary,
    )
