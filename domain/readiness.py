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

PathId = Literal["complete_beginner"]


@dataclass(frozen=True)
class LearningPathStep:
    """One step in a learning path, with runtime readiness attached."""
    section_id: str
    label: str
    readiness: SectionReadiness
    mastery_pct: float   # 0.0–1.0, based on the section's own node


@dataclass(frozen=True)
class LearningPathStatus:
    path_id: PathId | None
    path_name: str | None
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
}

# Soft prerequisites for readiness labels (simplified vs. the strict graph).
# Keys are section_ids; values are lists of prerequisite section_ids.
SECTION_PREREQUISITES: dict[str, list[str]] = {
    "hiragana": [],
    "katakana": ["hiragana"],
    "vocab_n5": ["katakana"],
    "grammar_patterns": ["vocab_n5"],
    "kanji_n5": ["hiragana", "katakana"],
}

# Human-readable labels for each section
SECTION_LABELS: dict[str, str] = {
    "hiragana": "Hiragana",
    "katakana": "Katakana",
    "vocab_n5": "N5 Vocabulary",
    "grammar_patterns": "N5 Grammar",
    "kanji_n5": "Basic Kanji (N5)",
}

# Ordered steps for each learning path
LEARNING_PATHS: dict[str, dict] = {
    "complete_beginner": {
        "name": "Complete Beginner",
        "steps": ["hiragana", "katakana", "vocab_n5", "grammar_patterns"],
    },
}


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


def get_suggested_next_step(
    path_id: PathId,
    state: ProgressionState,
) -> str | None:
    """Return the section_id of the first incomplete step in the path."""
    path = LEARNING_PATHS.get(path_id)
    if path is None:
        return None
    for section_id in path["steps"]:
        status = _node_status(section_id, state)
        if status != "mastered":
            return section_id
    return None  # All steps mastered


def build_learning_path_status(
    path_id: PathId | None,
    onboarding_complete: bool,
    state: ProgressionState,
) -> LearningPathStatus:
    """Build the full ``LearningPathStatus`` for the frontend.

    If ``path_id`` is None, returns a status with empty steps and
    ``onboarding_complete=False`` so the UI can show the onboarding screen.
    """
    if path_id is None or path_id not in LEARNING_PATHS:
        return LearningPathStatus(
            path_id=None,
            path_name=None,
            onboarding_complete=onboarding_complete,
            suggested_next=None,
            steps=(),
        )

    path = LEARNING_PATHS[path_id]
    suggested = get_suggested_next_step(path_id, state)

    steps: list[LearningPathStep] = []
    for section_id in path["steps"]:
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
        path_id=path_id,
        path_name=path["name"],
        onboarding_complete=onboarding_complete,
        suggested_next=suggested,
        steps=tuple(steps),
    )
