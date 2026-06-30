"""Pure functions for the tutor integration layer.

Factory functions convert domain events to :class:`~domain.tutor.TutorEvent`.
Reaction functions produce :class:`~domain.tutor.TutorReaction` payloads via
deterministic message templates.

All functions are side-effect free.  No LLM calls, no I/O, no randomness.
Time (``date``) is always injected by the caller.
"""
from __future__ import annotations

from datetime import date
from typing import Sequence

from domain.features import Feature, FeatureEvent
from domain.progression import ProgressionEvent, ProgressionGraph
from domain.recommendation import StudyRecommendation
from domain.tutor import (
    TutorEvent,
    TutorMessage,
    TutorReaction,
)
from domain.xp import LevelEvent


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_label(node_id: str, graph: ProgressionGraph | None) -> str:
    """Return the human-readable name for a node_id."""
    if graph is not None:
        node = graph.nodes.get(node_id)
        if node is not None:
            return node.name
    return node_id.replace("_", " ").title()


def _metadata_dict(metadata: tuple[tuple[str, str], ...]) -> dict[str, str]:
    return dict(metadata)


# ---------------------------------------------------------------------------
# Message templates (deterministic)
# ---------------------------------------------------------------------------

# Priority ordering used by active_reactions.
_PRIORITY_ORDER: dict[str, int] = {"high": 0, "normal": 1, "low": 2}


def _build_message(event: TutorEvent) -> TutorMessage:
    """Render a TutorMessage from a TutorEvent using deterministic templates."""
    meta = _metadata_dict(event.metadata)
    name = event.subject_label
    d = event.date

    if event.event_type == "node_mastered":
        return TutorMessage(
            message_type="congratulation",
            message_key="tutor.node_mastered",
            headline=f"You mastered {name}!",
            body=f"All {name} content has reached SRS mastery level.",
            cta="Move on to the next topic when you're ready.",
            date=d,
        )

    if event.event_type in ("node_unlocked", "branch_unlocked"):
        return TutorMessage(
            message_type="acknowledgement",
            message_key="tutor.node_unlocked",
            headline=f"{name} is now available.",
            body=f"You've unlocked {name}. Add it to your study queue.",
            cta="Start when you're ready.",
            date=d,
        )

    if event.event_type == "feature_unlocked":
        return TutorMessage(
            message_type="congratulation",
            message_key="tutor.feature_unlocked",
            headline=f"{name} unlocked!",
            body=f"You've earned access to a new learning mode: {name}.",
            cta="Try it in your next session.",
            date=d,
        )

    if event.event_type == "level_up":
        return TutorMessage(
            message_type="congratulation",
            message_key="tutor.level_up",
            headline=f"You reached {name}!",
            body="Your consistent study has paid off.",
            cta="Keep going to reach the next level.",
            date=d,
        )

    if event.event_type == "recommendation":
        reason = meta.get("reason", "balanced_review")

        if reason == "streak_recovery":
            return TutorMessage(
                message_type="encouragement",
                message_key="tutor.rec.streak_recovery",
                headline=f"Welcome back! Let's warm up with {name}.",
                body="A short session will get you back on track.",
                cta="Start a quick warm-up session.",
                date=d,
            )

        if reason in ("high_error_rate", "leeches_detected"):
            return TutorMessage(
                message_type="encouragement",
                message_key=f"tutor.rec.{reason}",
                headline=f"You've been struggling with {name}.",
                body=f"A focused review will help consolidate these items.",
                cta="Start a targeted review session.",
                date=d,
            )

        if reason == "weak_retention":
            return TutorMessage(
                message_type="encouragement",
                message_key="tutor.rec.weak_retention",
                headline=f"Your {name} retention needs reinforcement.",
                body="Some previously-mastered items are slipping. Review them now.",
                cta="Start a reinforcement session.",
                date=d,
            )

        if reason == "overdue_reviews":
            return TutorMessage(
                message_type="guidance",
                message_key="tutor.rec.overdue_reviews",
                headline=f"You have overdue {name} reviews.",
                body="Clearing overdue cards prevents your retention from dropping.",
                cta="Catch up on your reviews.",
                date=d,
            )

        if reason in ("new_content_ready", "progression_milestone"):
            return TutorMessage(
                message_type="guidance",
                message_key=f"tutor.rec.{reason}",
                headline=f"Start studying {name}.",
                body=f"{name} is ready for you to begin.",
                cta="Introduce the new content.",
                date=d,
            )

        # balanced_review and any unknown reason
        return TutorMessage(
            message_type="guidance",
            message_key="tutor.rec.balanced_review",
            headline=f"Review {name}.",
            body=f"Keep your {name} skills sharp with a regular review.",
            cta="Start your study session.",
            date=d,
        )

    # Fallback for any future event types
    return TutorMessage(
        message_type="acknowledgement",
        message_key="tutor.generic",
        headline=name,
        body="",
        cta="",
        date=d,
    )


def _make_dedup_key(event: TutorEvent) -> str:
    """Build a deduplication key for a TutorEvent."""
    if event.event_type == "recommendation":
        reason = _metadata_dict(event.metadata).get("reason", "")
        return f"rec:{event.subject_id}:{reason}"
    return f"{event.event_type}:{event.subject_id}"


# ---------------------------------------------------------------------------
# Factory functions
# ---------------------------------------------------------------------------


def from_progression_event(
    event: ProgressionEvent,
    graph: ProgressionGraph,
) -> TutorEvent | None:
    """Convert a :class:`~domain.progression.ProgressionEvent` to a TutorEvent.

    Returns ``None`` for event types that the tutor should not react to
    (e.g. ``"node_activated"``).
    """
    if event.event_type not in ("node_mastered", "node_unlocked", "branch_unlocked"):
        return None
    label = _resolve_label(event.node_id, graph)
    priority = "high" if event.event_type == "node_mastered" else "normal"
    return TutorEvent(
        event_type=event.event_type,  # type: ignore[arg-type]
        subject_id=event.node_id,
        subject_label=label,
        date=event.date,
        priority=priority,
    )


def from_feature_event(
    event: FeatureEvent,
    features: Sequence[Feature] | None = None,
) -> TutorEvent | None:
    """Convert a :class:`~domain.features.FeatureEvent` to a TutorEvent.

    Returns None for features with no requirements (always available),
    since these don't need unlock notifications.

    Args:
        event: The feature unlock event.
        features: Optional feature catalog; used to resolve the human-readable
            feature name and to check if the feature has requirements.
            Falls back to a title-cased conversion of ``event.feature_id``
            when not supplied.
    """
    # Check if feature has requirements (if catalog is provided)
    if features:
        feat = next((f for f in features if f.feature_id == event.feature_id), None)
        if feat is not None:
            # Don't notify for features with no requirements (always available)
            has_requirements = (
                feat.requirement.progression_conditions
                or feat.requirement.feature_dependencies
            )
            if not has_requirements:
                return None
            label = feat.name
        else:
            label = event.feature_id.replace("_", " ").title()
    else:
        label = event.feature_id.replace("_", " ").title()

    return TutorEvent(
        event_type="feature_unlocked",
        subject_id=event.feature_id,
        subject_label=label,
        date=event.date,
        priority="high",
    )


def from_level_event(event: LevelEvent) -> TutorEvent:
    """Convert a :class:`~domain.xp.LevelEvent` to a TutorEvent.

    Milestone levels (multiples of 5) receive ``"high"`` priority;
    all others receive ``"normal"``.
    """
    priority = "high" if event.new_level % 5 == 0 else "normal"
    return TutorEvent(
        event_type="level_up",
        subject_id=str(event.new_level),
        subject_label=f"Level {event.new_level}",
        date=event.date,
        priority=priority,
    )


def from_recommendation(
    rec: StudyRecommendation,
    today: date,
    graph: ProgressionGraph | None = None,
) -> TutorEvent:
    """Convert a :class:`~domain.recommendation.StudyRecommendation` to a TutorEvent.

    Args:
        rec: The recommendation to translate.
        today: Caller-supplied date (injected; never read internally).
        graph: Optional progression graph for node name lookup.
    """
    label = _resolve_label(rec.node_id, graph)
    priority = "high" if rec.reason in ("high_error_rate", "leeches_detected") else "normal"
    return TutorEvent(
        event_type="recommendation",
        subject_id=rec.node_id,
        subject_label=label,
        date=today,
        priority=priority,
        metadata=(
            ("reason", rec.reason),
            ("difficulty", rec.difficulty),
        ),
    )


# ---------------------------------------------------------------------------
# Reaction generation
# ---------------------------------------------------------------------------


def generate_reaction(
    event: TutorEvent,
    seen_dedup_keys: frozenset[str] = frozenset(),
) -> TutorReaction:
    """Generate a :class:`~domain.tutor.TutorReaction` for one TutorEvent.

    The reaction is always fully rendered.  ``suppressed=True`` when the
    ``dedup_key`` is already in *seen_dedup_keys*; the caller decides whether
    to display or discard suppressed reactions.
    """
    message = _build_message(event)
    dedup_key = _make_dedup_key(event)
    return TutorReaction(
        event=event,
        message=message,
        dedup_key=dedup_key,
        suppressed=dedup_key in seen_dedup_keys,
    )


def generate_reactions(
    events: Sequence[TutorEvent],
    seen_dedup_keys: frozenset[str] = frozenset(),
) -> tuple[TutorReaction, ...]:
    """Generate reactions for a sequence of TutorEvents.

    Deduplication is applied progressively: once a ``dedup_key`` is emitted
    as a non-suppressed reaction, subsequent events with the same key are
    suppressed within this batch.

    Args:
        events: Events to process, in the order they should be evaluated.
        seen_dedup_keys: Keys already shown in previous batches.

    Returns:
        Tuple of reactions in input order.  Suppressed reactions are included
        but marked ``suppressed=True``.
    """
    working_seen: set[str] = set(seen_dedup_keys)
    reactions: list[TutorReaction] = []
    for event in events:
        reaction = generate_reaction(event, frozenset(working_seen))
        reactions.append(reaction)
        if not reaction.suppressed:
            working_seen.add(reaction.dedup_key)
    return tuple(reactions)


def active_reactions(
    reactions: tuple[TutorReaction, ...],
) -> tuple[TutorReaction, ...]:
    """Return non-suppressed reactions sorted by priority then date.

    ``"high"`` priority events appear before ``"normal"``, which appear
    before ``"low"``.  Within the same priority, events are sorted by date
    (earliest first).

    Args:
        reactions: Output of :func:`generate_reactions` or similar.

    Returns:
        Sorted tuple of non-suppressed reactions.
    """
    active = [r for r in reactions if not r.suppressed]
    active.sort(key=lambda r: (_PRIORITY_ORDER[r.event.priority], r.event.date))
    return tuple(active)
