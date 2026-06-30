"""Adaptive study recommendation domain models.

A deterministic rule-based system that analyses SRS performance, progression
state, and study patterns to produce prioritised study recommendations.

No machine learning, no randomness.  Same inputs always produce the same
outputs.

Domain rules:
- Frozen dataclasses for all value objects.
- No SRS scheduling logic here; only consumption of pre-computed metrics.
- No UI, database, or file I/O.
- Time is always injected by the caller.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from domain.progression import ProgressionState


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

RecommendationReason = Literal[
    "high_error_rate",       # accuracy below struggling threshold
    "leeches_detected",      # multiple problem items in the node
    "new_content_ready",     # unlocked node not yet started
    "overdue_reviews",       # review backlog accumulating
    "streak_recovery",       # returning after a study break
    "progression_milestone", # node just unlocked, ready to begin
    "weak_retention",        # accuracy declining on previously-mastered content
    "balanced_review",       # default maintenance sweep
]

RecommendationDifficulty = Literal["easy", "normal", "challenging"]


# ---------------------------------------------------------------------------
# Thresholds (module-level constants, deterministic)
# ---------------------------------------------------------------------------

#: 7-day accuracy below this triggers a "struggling" recommendation.
STRUGGLING_ACCURACY_THRESHOLD: float = 0.60

#: Accuracy below this on mostly-mastered content triggers "weak retention".
RETENTION_ACCURACY_THRESHOLD: float = 0.70

#: Node leech_count above this triggers a leech recommendation.
LEECH_THRESHOLD: int = 3

#: Node overdue_count at or above this triggers an urgent overdue recommendation.
OVERDUE_CRITICAL_THRESHOLD: int = 10

#: Days without study before a "streak recovery" recommendation fires.
STREAK_BREAK_DAYS: int = 2

#: Default number of items in a balanced review session.
DEFAULT_REVIEW_COUNT: int = 20

#: Items recommended for a targeted/focused session.
FOCUSED_REVIEW_COUNT: int = 10

#: Items recommended for a warm-up or recovery session.
QUICK_REVIEW_COUNT: int = 5


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CategoryMetrics:
    """Pre-computed SRS summary for one learning node.

    The caller (data or application layer) aggregates raw ReviewState records
    into these metrics before passing them to the recommendation service.

    Attributes:
        node_id: Matches a node_id in the progression graph.
        due_count: Cards due for review today.
        overdue_count: Cards whose due date is in the past.
        new_count: Cards never reviewed.
        leech_count: Cards flagged as leeches.
        accuracy_7d: Fraction of correct answers in the past 7 days [0.0, 1.0].
            Set to 1.0 if no reviews were recorded in the window.
        mastered_ratio: Fraction of items at SRS mastery threshold [0.0, 1.0].
        total_items: Total cards in the node.
    """

    node_id: str
    due_count: int
    overdue_count: int
    new_count: int
    leech_count: int
    accuracy_7d: float
    mastered_ratio: float
    total_items: int


@dataclass(frozen=True)
class StudySnapshot:
    """All context required to generate study recommendations.

    Attributes:
        date: Caller-supplied reference date (injected; never read internally).
        category_metrics: Per-node SRS summaries for all nodes with items.
        progression_state: Current node unlock / mastery status.
        days_since_last_study: Days elapsed since the last study session.
            0 = studied today, 1 = yesterday, etc.
        current_streak: Consecutive days studied.
        xp_last_7_days: Total XP earned in the past 7 days; used as an
            engagement signal.
        recent_mistake_node_ids: Node IDs that had notable mistake patterns
            recently (as determined by the caller).
    """

    date: date
    category_metrics: tuple[CategoryMetrics, ...]
    progression_state: ProgressionState
    days_since_last_study: int
    current_streak: int
    xp_last_7_days: int
    recent_mistake_node_ids: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StudyRecommendation:
    """A single actionable study recommendation.

    Attributes:
        node_id: Content area to focus on.
        display_label: Human-readable label (e.g. "Review weak Hiragana points").
        review_count: Suggested number of items to review in this session.
        difficulty: Suggested session difficulty.
        focus_areas: Specific sub-areas within the node to target.
        reason: Machine-readable reason code that triggered this recommendation.
        priority: Relative priority among the returned set; 1 = highest.
    """

    node_id: str
    display_label: str
    review_count: int
    difficulty: RecommendationDifficulty
    focus_areas: tuple[str, ...]
    reason: RecommendationReason
    priority: int


@dataclass(frozen=True)
class RecommendationEvent:
    """Emitted when a recommendation set is generated.

    Attributes:
        event_type: Always ``"recommendations_generated"``.
        date: Caller-supplied date of generation.
        recommendations: Ordered recommendations, highest priority first.
        context_summary: Human-readable summary of the triggering conditions.
    """

    event_type: Literal["recommendations_generated"]
    date: date
    recommendations: tuple[StudyRecommendation, ...]
    context_summary: str
