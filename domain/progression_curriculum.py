"""Static definition of the JPLearn progression curriculum.

Pure data — analogous to ``domain/decks.py``.  All logic lives in
:mod:`domain.progression_service`.

Main path (each node requires the previous to be mastered):

  tutorial → hiragana → katakana → vocabulary_n5 → grammar_n5
  → scripted_conv → listening → kanji_n5 → free_conv → reading
  → jlpt_n5 → jlpt_n4 → jlpt_n3 → jlpt_n2 → jlpt_n1
"""
from __future__ import annotations

from domain.progression import (
    MasteryRequirement,
    ProgressionGraph,
    ProgressionNode,
    ProgressionReward,
    UnlockCondition,
    UnlockRequirement,
)
from domain.progression_service import build_graph


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _requires_mastered(node_id: str) -> UnlockRequirement:
    """Shorthand: unlock when a single node is mastered."""
    return UnlockRequirement(
        conditions=(UnlockCondition(node_id=node_id, required_status="mastered"),)
    )


def _milestone(descriptor: str) -> tuple[ProgressionReward, ...]:
    return (ProgressionReward(reward_type="milestone", descriptor=descriptor),)


def _content(descriptor: str) -> tuple[ProgressionReward, ...]:
    return (ProgressionReward(reward_type="content_descriptor", descriptor=descriptor),)


# ---------------------------------------------------------------------------
# Node definitions
# ---------------------------------------------------------------------------

_NODES: list[ProgressionNode] = [
    # ------------------------------------------------------------------
    # Entry point — no prerequisites
    # ------------------------------------------------------------------
    ProgressionNode(
        node_id="tutorial",
        name="Tutorial",
        category="tutorial",
        unlock_requirement=UnlockRequirement(),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0),
        children=("hiragana",),
        rewards=_milestone("tutorial_complete"),
    ),
    # ------------------------------------------------------------------
    # Script foundations
    # ------------------------------------------------------------------
    ProgressionNode(
        node_id="hiragana",
        name="Hiragana",
        category="hiragana",
        unlock_requirement=_requires_mastered("tutorial"),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0, min_mastered=46),
        children=("katakana",),
        rewards=_milestone("hiragana_mastered"),
    ),
    ProgressionNode(
        node_id="katakana",
        name="Katakana",
        category="katakana",
        unlock_requirement=_requires_mastered("hiragana"),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0, min_mastered=46),
        children=("vocabulary_n5",),
        rewards=_milestone("katakana_mastered"),
    ),
    # ------------------------------------------------------------------
    # N5 core path
    # ------------------------------------------------------------------
    ProgressionNode(
        node_id="vocabulary_n5",
        name="Vocabulary N5",
        category="vocabulary",
        unlock_requirement=_requires_mastered("katakana"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("grammar_n5",),
        rewards=_content("n5_vocabulary_unlocked"),
    ),
    ProgressionNode(
        node_id="grammar_n5",
        name="Grammar N5",
        category="grammar",
        unlock_requirement=_requires_mastered("vocabulary_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("scripted_conv",),
        rewards=_content("n5_grammar_unlocked"),
    ),
    ProgressionNode(
        node_id="scripted_conv",
        name="Scripted Conversation",
        category="scripted_conversation",
        unlock_requirement=_requires_mastered("grammar_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0),
        children=("listening",),
        rewards=_milestone("scripted_conversation_complete"),
    ),
    ProgressionNode(
        node_id="listening",
        name="Listening",
        category="listening",
        unlock_requirement=_requires_mastered("scripted_conv"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("kanji_n5",),
        rewards=_content("listening_unlocked"),
    ),
    ProgressionNode(
        node_id="kanji_n5",
        name="Basic Kanji (N5)",
        category="kanji",
        unlock_requirement=_requires_mastered("listening"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8, min_mastered=80),
        children=("free_conv",),
        rewards=_content("n5_kanji_unlocked"),
    ),
    ProgressionNode(
        node_id="free_conv",
        name="Free Conversation",
        category="free_conversation",
        unlock_requirement=_requires_mastered("kanji_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("reading",),
        rewards=_milestone("free_conversation_unlocked"),
    ),
    ProgressionNode(
        node_id="reading",
        name="Reading",
        category="reading",
        unlock_requirement=_requires_mastered("free_conv"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("jlpt_n5",),
        rewards=_milestone("reading_unlocked"),
    ),
    # ------------------------------------------------------------------
    # JLPT progression N5 → N1
    # ------------------------------------------------------------------
    ProgressionNode(
        node_id="jlpt_n5",
        name="JLPT N5",
        category="jlpt",
        unlock_requirement=_requires_mastered("reading"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n4",),
        rewards=_milestone("jlpt_n5_passed"),
    ),
    ProgressionNode(
        node_id="jlpt_n4",
        name="JLPT N4",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n3",),
        rewards=_milestone("jlpt_n4_passed"),
    ),
    ProgressionNode(
        node_id="jlpt_n3",
        name="JLPT N3",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n4"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n2",),
        rewards=_milestone("jlpt_n3_passed"),
    ),
    ProgressionNode(
        node_id="jlpt_n2",
        name="JLPT N2",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n3"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n1",),
        rewards=_milestone("jlpt_n2_passed"),
    ),
    ProgressionNode(
        node_id="jlpt_n1",
        name="JLPT N1",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n2"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=(),
        rewards=_milestone("jlpt_n1_passed"),
    ),
]

# ---------------------------------------------------------------------------
# Public graph singleton
# ---------------------------------------------------------------------------

JPLEARN_GRAPH: ProgressionGraph = build_graph(_NODES, root_id="tutorial")
