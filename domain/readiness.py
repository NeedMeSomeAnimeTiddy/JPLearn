"""Section readiness computation for the guided learning path system.

Replaces binary locked/unlocked gates with a soft readiness label that the
UI uses to recommend, warn, or celebrate — but never hard-block — access to
any study section.

Domain rules:
- Pure functions only; no database access, no I/O.
- ``ProgressionState`` is always injected by the caller.
- Section IDs match the frontend ``ScriptKey`` union type.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from domain.progression import ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

SectionReadiness = Literal[
    "completed",       # Section's own node is fully mastered
    "suggested_next",  # The single recommended next step in the active path
    "recommended",     # All prerequisites are mastered; good to start
    "challenging",     # Prerequisites started but not yet mastered
    "advanced",        # Prerequisites not yet started
]

@dataclass(frozen=True)
class LearningPathStep:
    """One step in a learning path, with runtime readiness attached."""
    section_id: str
    label: str
    readiness: SectionReadiness
    mastery_pct: float   # 0.0–1.0, based on the section's own node


@dataclass(frozen=True)
class LearningPathStatus:
    """The single curriculum plus the learner's readiness for each section.

    Carried no ``path_id``/``path_name`` since issue #78 Phase 5: there is one
    curriculum, defined by ``JPLEARN_GRAPH``, so there is nothing to name or
    choose between.
    """

    onboarding_complete: bool
    suggested_next: str | None
    steps: tuple[LearningPathStep, ...]


# ---------------------------------------------------------------------------
# Static configuration
# ---------------------------------------------------------------------------

# Maps frontend section_id → progression node_id
SECTION_TO_NODE: dict[str, str] = {
    "hiragana": "hiragana",
    "katakana": "katakana",
    "vocab_n5": "vocabulary_n5",
    "grammar_patterns": "grammar_n5",
    "kanji_n5": "kanji_n5",
    "sentence_examples": "sentence_examples",
}

# Soft prerequisites for readiness labels (simplified vs. the strict graph).
# Keys are section_ids; values are lists of prerequisite section_ids.
SECTION_PREREQUISITES: dict[str, list[str]] = {
    "hiragana": [],
    "katakana": ["hiragana"],
    "vocab_n5": ["katakana"],
    "grammar_patterns": ["vocab_n5"],
    "kanji_n5": ["hiragana", "katakana"],
    "sentence_examples": ["grammar_patterns"],
}

# Human-readable labels for each section
SECTION_LABELS: dict[str, str] = {
    "hiragana": "Hiragana",
    "katakana": "Katakana",
    "vocab_n5": "N5 Vocabulary",
    "grammar_patterns": "N5 Grammar",
    "kanji_n5": "Basic Kanji (N5)",
    "sentence_examples": "Sentences",
}

def _curriculum_section_order() -> tuple[str, ...]:
    """Studiable sections in the order :data:`JPLEARN_GRAPH` teaches them.

    This used to be a hardcoded list inside a ``LEARNING_PATHS`` dict — a second,
    flatter model of the same curriculum, holding one path and free to disagree
    with the graph (issue #78 Phase 5, and the reason #20 asked for "more
    paths"). Deriving it means the order can only ever have one definition.

    Graph order is a breadth-first walk from the root, so a section appears
    after everything it depends on.
    """
    node_to_section = {node_id: section for section, node_id in SECTION_TO_NODE.items()}
    ordered: list[str] = []
    for node_id in JPLEARN_GRAPH.nodes:
        section = node_to_section.get(node_id)
        if section is not None and section not in ordered:
            ordered.append(section)
    return tuple(ordered)


#: The single curriculum, derived rather than declared.
CURRICULUM_SECTION_ORDER: tuple[str, ...] = _curriculum_section_order()


# ---------------------------------------------------------------------------
# Core readiness computation
# ---------------------------------------------------------------------------

def _node_status(section_id: str, state: ProgressionState) -> str | None:
    """Return the node status for a section, or None if not in state."""
    node_id = SECTION_TO_NODE.get(section_id)
    if node_id is None:
        return None
    ns = state.node_states.get(node_id)
    return ns.status if ns else None


def _mastery_pct(section_id: str, state: ProgressionState) -> float:
    """Return mastery ratio (0.0–1.0) for the section's own node."""
    node_id = SECTION_TO_NODE.get(section_id)
    if node_id is None:
        return 0.0
    ns = state.node_states.get(node_id)
    if ns is None or ns.total_item_count == 0:
        return 0.0
    return ns.mastered_item_count / ns.total_item_count


def compute_section_readiness(
    section_id: str,
    state: ProgressionState,
) -> SectionReadiness:
    """Compute the soft readiness label for a section.

    The label is used by the UI to guide—not restrict—the learner.
    ``"suggested_next"`` is NOT assigned here; the caller applies it to the
    single next step returned by :func:`get_suggested_next_step`.
    """
    # Completed: own node is mastered
    own_status = _node_status(section_id, state)
    if own_status == "mastered":
        return "completed"

    # Entry point (no prerequisites)
    prereqs = SECTION_PREREQUISITES.get(section_id, [])
    if not prereqs:
        return "recommended"

    # Evaluate prerequisite statuses
    prereq_statuses: list[str] = []
    for prereq_id in prereqs:
        s = _node_status(prereq_id, state) or "locked"
        prereq_statuses.append(s)

    _ORDER = {"locked": 0, "unlocked": 1, "active": 2, "mastered": 3}
    all_mastered = all(s == "mastered" for s in prereq_statuses)
    any_progressed = any(_ORDER.get(s, 0) >= 2 for s in prereq_statuses)  # active or mastered

    if all_mastered:
        return "recommended"
    if any_progressed:
        return "challenging"
    return "advanced"


def get_suggested_next_step(state: ProgressionState) -> str | None:
    """Return the section_id of the first section not yet mastered."""
    for section_id in CURRICULUM_SECTION_ORDER:
        status = _node_status(section_id, state)
        if status != "mastered":
            return section_id
    return None  # Everything mastered


def build_learning_path_status(
    onboarding_complete: bool,
    state: ProgressionState,
) -> LearningPathStatus:
    """Build the full ``LearningPathStatus`` for the frontend."""
    suggested = get_suggested_next_step(state)

    steps: list[LearningPathStep] = []
    for section_id in CURRICULUM_SECTION_ORDER:
        readiness = compute_section_readiness(section_id, state)
        # Promote the suggested step's label (only if not already completed)
        if section_id == suggested and readiness != "completed":
            readiness = "suggested_next"
        steps.append(LearningPathStep(
            section_id=section_id,
            label=SECTION_LABELS.get(section_id, section_id),
            readiness=readiness,
            mastery_pct=_mastery_pct(section_id, state),
        ))

    return LearningPathStatus(
        onboarding_complete=onboarding_complete,
        suggested_next=suggested,
        steps=tuple(steps),
    )
