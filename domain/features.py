"""Feature unlock system domain models.

Features are gameplay systems, UI modes, and learning capabilities that
become available when progression and/or other feature prerequisites are met.

This module is deliberately separate from the progression system:
- Progression tracks content mastery (nodes, SRS intervals).
- Features control access to application capabilities.

Domain rules:
- Frozen dataclasses for all value objects.
- FeatureState is not frozen (holds a dict; copy-update pattern).
- No XP, levels, or SRS scheduling.
- No UI, database, or file I/O.
- Time is always injected; never read internally.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from domain.progression import NodeStatus


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

FeatureCategory = Literal[
    "learning_mode",
    "analytics",
    "customization",
    "ui",
]

FeatureEventType = Literal["feature_unlocked"]


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressionCondition:
    """A progression node must reach a minimum status.

    Attributes:
        node_id: The node to check in ProgressionState.
        required_status: Minimum status the node must have.
    """

    node_id: str
    required_status: NodeStatus


@dataclass(frozen=True)
class FeatureDependency:
    """Another feature must already be unlocked.

    Attributes:
        feature_id: The prerequisite feature.
    """

    feature_id: str


@dataclass(frozen=True)
class FeatureRequirement:
    """All conditions must be satisfied (AND semantics).

    An empty requirement (both tuples empty) means the feature is always
    available with no prerequisites.

    Attributes:
        progression_conditions: Progression nodes that must meet their
            required status.
        feature_dependencies: Features that must already be unlocked.
    """

    progression_conditions: tuple[ProgressionCondition, ...] = ()
    feature_dependencies: tuple[FeatureDependency, ...] = ()


# ---------------------------------------------------------------------------
# Rewards and unlock descriptor
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FeatureReward:
    """Informational label emitted when a feature unlocks.

    Purely descriptive — no XP, no numeric values.

    Attributes:
        reward_type: Category of reward.
        descriptor: Machine-readable label (e.g. ``"listening_badge"``).
    """

    reward_type: Literal["feature_access", "theme", "badge"]
    descriptor: str


@dataclass(frozen=True)
class FeatureUnlock:
    """Describes what is granted when a feature first becomes available.

    Attributes:
        access_descriptor: Machine-readable capability identifier
            (e.g. ``"listening_mode_access"``).
        rewards: Optional informational rewards emitted on first unlock.
    """

    access_descriptor: str
    rewards: tuple[FeatureReward, ...] = ()


# ---------------------------------------------------------------------------
# Feature definition
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Feature:
    """A single unlockable capability or mode.

    Attributes:
        feature_id: Unique identifier (e.g. ``"listening_mode"``).
        name: Human-readable label.
        category: Content category metadata; does not drive logic.
        requirement: Conditions that must all be met before this feature
            becomes available.  Empty requirement = always available.
        unlock: What is granted when the feature first becomes available.
    """

    feature_id: str
    name: str
    category: FeatureCategory
    requirement: FeatureRequirement
    unlock: FeatureUnlock


# ---------------------------------------------------------------------------
# Feature state
# ---------------------------------------------------------------------------


@dataclass
class FeatureState:
    """Current unlock status for all known features.

    Not frozen because the inner dict is replaced on each transition
    (copy-update pattern; same convention as ReviewState / ProgressionState).

    Attributes:
        statuses: Maps feature_id \u2192 ``"locked"`` or ``"unlocked"``.
    """

    statuses: dict[str, Literal["locked", "unlocked"]]


# ---------------------------------------------------------------------------
# Feature event
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FeatureEvent:
    """Emitted by service functions when a feature first becomes available.

    Attributes:
        event_type: Always ``"feature_unlocked"`` in v1.
        feature_id: Feature that transitioned to unlocked.
        date: Caller-supplied date; never read internally.
        unlock: The unlock descriptor and rewards granted.
    """

    event_type: FeatureEventType
    feature_id: str
    date: date
    unlock: FeatureUnlock
