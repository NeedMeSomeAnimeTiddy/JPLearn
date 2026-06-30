"""Tutor integration domain models.

Converts system events (progression milestones, feature unlocks, XP level-ups,
study recommendations) into structured TutorMessages that the LLM layer can
consume later.

This module is distinct from ``domain/assistant.py``:
- ``assistant.py`` handles session-level coaching (mood, momentum, streaks).
- This module handles system-level event reactions (mastery, unlocks, levels).

Domain rules:
- All dataclasses are frozen (value objects).
- No LLM calls, no randomness, no side effects.
- Every TutorMessage is fully formed from deterministic templates.
- Time is always injected; never read internally.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

TutorEventType = Literal[
    "node_mastered",
    "node_unlocked",
    "branch_unlocked",
    "feature_unlocked",
    "level_up",
    "recommendation",
]

TutorEventPriority = Literal["low", "normal", "high"]

TutorMessageType = Literal[
    "congratulation",   # achievement: mastery, level-up, feature unlock
    "encouragement",    # struggling: high error rate, leeches, weak retention
    "guidance",         # direction: new content, next step, recommendations
    "acknowledgement",  # minor progress: node unlocked, balanced review
]


# ---------------------------------------------------------------------------
# TutorEvent
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TutorEvent:
    """A normalised event that the tutor should react to.

    Constructed from domain events by the factory functions in
    :mod:`domain.tutor_service`.

    Attributes:
        event_type: Category of the triggering event.
        subject_id: Machine-readable identifier (node_id, feature_id, level number).
        subject_label: Human-readable name used in message templates.
        date: Caller-supplied date of the triggering event.
        priority: Relative urgency of this event for the tutor.
        metadata: Immutable key-value pairs carrying extra context
            (e.g. ``(("reason", "high_error_rate"), ("difficulty", "easy"))``).
    """

    event_type: TutorEventType
    subject_id: str
    subject_label: str
    date: date
    priority: TutorEventPriority
    metadata: tuple[tuple[str, str], ...] = ()


# ---------------------------------------------------------------------------
# TutorMessage
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TutorMessage:
    """A fully-formed, template-rendered message ready for LLM consumption.

    The LLM integration layer (outside domain/) combines ``headline``,
    ``body``, and ``cta`` into a prompt.  ``message_key`` is used for
    template selection and i18n lookup.

    Attributes:
        message_type: Tone category.
        message_key: Machine-readable template identifier.
        headline: Short, punchy message (e.g. "You mastered Hiragana!").
        body: One-sentence elaboration for LLM context.
        cta: Call-to-action string.
        date: Mirrors the triggering event's date.
    """

    message_type: TutorMessageType
    message_key: str
    headline: str
    body: str
    cta: str
    date: date


# ---------------------------------------------------------------------------
# TutorReaction
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TutorReaction:
    """The tutor's response to a single TutorEvent.

    Attributes:
        event: The event that triggered this reaction.
        message: Rendered message payload.
        dedup_key: Key used to prevent re-showing the same reaction.
            Format: ``"{event_type}:{subject_id}"`` for milestones,
            ``"rec:{subject_id}:{reason}"`` for recommendations.
        suppressed: ``True`` when ``dedup_key`` was already in the caller's
            seen-keys set; the message exists but should not be displayed.
    """

    event: TutorEvent
    message: TutorMessage
    dedup_key: str
    suppressed: bool = False
