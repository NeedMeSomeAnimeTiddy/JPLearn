"""Progression system domain models.

Defines the static progression graph (nodes, requirements, rewards) and the
mutable ProgressionState used to track a learner's position in the graph.

Domain rules:
- Frozen dataclasses for all value objects.
- ProgressionState is not frozen because it holds a dict (copy-update pattern,
  same convention as ReviewState).
- No XP, levels, feature flags, or SRS scheduling here.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from collections.abc import Mapping
from typing import Literal


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

NodeStatus = Literal["locked", "unlocked", "active", "mastered"]

NodeCategory = Literal[
    "tutorial",
    "hiragana",
    "katakana",
    "vocabulary",
    "grammar",
    "scripted_conversation",
    "listening",
    "kanji",
    "free_conversation",
    "reading",
    "jlpt",
]

RewardType = Literal["milestone", "content_descriptor"]

ProgressionEventType = Literal[
    "node_unlocked",
    "node_activated",
    "node_mastered",
    "branch_unlocked",
]

# Status ordering used for prerequisite evaluation.
_STATUS_ORDER: dict[str, int] = {
    "locked": 0,
    "unlocked": 1,
    "active": 2,
    "mastered": 3,
}


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class UnlockCondition:
    """A single prerequisite: one node must reach a given status.

    Attributes:
        node_id: The prerequisite node.
        required_status: The minimum status that node must have.
    """

    node_id: str
    required_status: NodeStatus


@dataclass(frozen=True)
class UnlockRequirement:
    """All conditions must be satisfied (AND semantics).

    An empty ``conditions`` tuple means the node is always unlockable.

    Attributes:
        conditions: Every condition must be met before the node can unlock.
    """

    conditions: tuple[UnlockCondition, ...] = ()


@dataclass(frozen=True)
class MasteryRequirement:
    """Threshold a node must meet to transition to ``"mastered"``.

    Both fields must be satisfied simultaneously.
    Set ``min_mastered=0`` to disable the absolute floor.

    Attributes:
        mastered_ratio: Fraction of items [0.0, 1.0] that must reach mastery.
        min_mastered: Absolute minimum count of mastered items.
    """

    mastered_ratio: float
    min_mastered: int = 0


# ---------------------------------------------------------------------------
# Rewards
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressionReward:
    """Informational label emitted when a node is mastered.

    Purely a named descriptor — no XP, no feature gates.

    Attributes:
        reward_type: Category of reward.
        descriptor: Machine-readable label (e.g. ``"hiragana_mastered"``).
    """

    reward_type: RewardType
    descriptor: str


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressionNode:
    """A single vertex in the progression graph.

    Attributes:
        node_id: Unique identifier (e.g. ``"hiragana"``, ``"jlpt_n5"``).
        name: Human-readable label.
        category: Content category metadata; does not drive logic.
        unlock_requirement: Prerequisites; empty = no prerequisites.
        mastery_requirement: Threshold to transition to ``"mastered"``.
        children: Ordered mandatory successor node_ids.
        branches: Optional parallel-path node_ids; not required for
            main-path progression.
        rewards: Emitted when this node transitions to ``"mastered"``.
    """

    node_id: str
    name: str
    category: NodeCategory
    unlock_requirement: UnlockRequirement
    mastery_requirement: MasteryRequirement
    children: tuple[str, ...] = ()
    branches: tuple[str, ...] = ()
    rewards: tuple[ProgressionReward, ...] = ()


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressionGraph:
    """Immutable static definition of the progression DAG.

    Built via :func:`~domain.progression_service.build_graph`.

    Attributes:
        nodes: Complete node registry keyed by node_id.
        parent_index: Reverse lookup — child_id → tuple of parent node_ids.
            Covers both ``children`` and ``branches`` edges.
        prerequisite_index: Reverse of ``unlock_requirement.conditions`` —
            maps a node_id to the tuple of node_ids that declare it as a
            prerequisite.  Used to find newly-unlockable successors after a
            mastery event, including nodes with multiple prerequisites.
        root_id: Entry-point node (no prerequisites).
    """

    nodes: Mapping[str, ProgressionNode]
    parent_index: Mapping[str, tuple[str, ...]]
    prerequisite_index: Mapping[str, tuple[str, ...]]
    root_id: str


# ---------------------------------------------------------------------------
# Per-node learner state
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NodeProgressionState:
    """Immutable snapshot of a learner's state for one node.

    Attributes:
        node_id: Matches :attr:`ProgressionNode.node_id`.
        status: Current lifecycle status.
        mastered_item_count: Items the caller reports as SRS-mastered.
        total_item_count: Total items belonging to this node.
        first_activated_date: Date the node first became ``"active"``.
        mastered_date: Date the node transitioned to ``"mastered"``.
    """

    node_id: str
    status: NodeStatus
    mastered_item_count: int = 0
    total_item_count: int = 0
    first_activated_date: date | None = None
    mastered_date: date | None = None


@dataclass
class ProgressionState:
    """Mutable container for all per-node lifecycle states.

    Not frozen because the inner dict is replaced on every transition
    (copy-update pattern; same convention as ReviewState).

    Attributes:
        node_states: Maps node_id → its current NodeProgressionState.
    """

    node_states: dict[str, NodeProgressionState]


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressionEvent:
    """Emitted by service functions when a node transitions status.

    Attributes:
        event_type: The kind of transition that occurred.
        node_id: Node that changed status.
        date: Caller-supplied date (time is always injected, never read here).
        rewards: Non-empty only for ``"node_mastered"`` events.
    """

    event_type: ProgressionEventType
    node_id: str
    date: date
    rewards: tuple[ProgressionReward, ...] = ()
