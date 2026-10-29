"""Static definition of the JPLearn progression curriculum.

Pure data — analogous to ``domain/decks.py``.  All logic lives in
:mod:`domain.progression_service`.

Main path (each node requires the previous to be mastered):

  tutorial → hiragana → katakana → vocabulary_n5 → grammar_n5
  → scripted_conv → listening → kanji_n5 → free_conv → reading
  → jlpt_n5 → jlpt_n4 → jlpt_n3 → jlpt_n2 → jlpt_n1

A prerequisite in ``UNMEASURED_NODE_IDS`` only has to be reached instead,
because nothing can ever mark it mastered (``gate_status``).

Milestone seals follow the same rule: a measured node's seal is earned when it is mastered, an
unmeasured node's when it is reached. The JLPT steps carry no seal, because reaching Reading opens
all five at once, so "JLPT N1 Ready" would go to a beginner (audit 12, F3; Robbie: "2 on reach,
hide 6").
"""
from __future__ import annotations

from domain.progression import (
    MasteryRequirement,
    NodeStatus,
    ProgressionGraph,
    ProgressionNode,
    ProgressionReward,
    UnlockCondition,
    UnlockRequirement,
)
from domain.progression_service import build_graph


#: The nodes the app can measure: the tutorial, and the five nodes backed by a
#: deck (``scripts/desktop_bridge.py`` maps each to its deck and syncs them).
#: This is the one list; the bridge, this graph and the feature catalog all
#: derive from it.
MEASURED_NODE_IDS: frozenset[str] = frozenset(
    {"tutorial", "hiragana", "katakana", "vocabulary_n5", "grammar_n5", "kanji_n5"}
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def gate_status(node_id: str) -> NodeStatus:
    """The status a node must reach before whatever waits on it can open.

    A measured node must be mastered. An unmeasured one can never report
    progress, so it can never be mastered; it would hold everything behind it
    shut for good. It only has to be reached instead (audit 3, F7). The node
    itself still reports no progress and never reads as mastered.
    """
    return "mastered" if node_id in MEASURED_NODE_IDS else "unlocked"


def _requires_mastered(node_id: str) -> UnlockRequirement:
    """Shorthand: unlock when a single node is mastered, or reached if unmeasured."""
    return UnlockRequirement(
        conditions=(UnlockCondition(node_id=node_id, required_status=gate_status(node_id)),)
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
        # Absolute floor, not a ratio: this node gates the grammar path on
        # "knows enough N5 words to start", which is a fixed quantity. It used
        # to read `mastered_ratio=0.8` against a vocab_n5 deck truncated to 50
        # cards — i.e. 40 words. Lifting that truncation (#67) grew the deck to
        # the full 718-word corpus, which would have silently turned the same
        # ratio into a 575-word gate. Keep the gate decoupled from corpus size.
        mastery_requirement=MasteryRequirement(mastered_ratio=0.0, min_mastered=40),
        children=("grammar_n5",),
        rewards=_content("n5_vocabulary_unlocked"),
    ),
    ProgressionNode(
        node_id="grammar_n5",
        name="Grammar N5",
        category="grammar",
        unlock_requirement=_requires_mastered("vocabulary_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=("sentence_examples", "scripted_conv"),
        rewards=_content("n5_grammar_unlocked"),
    ),
    ProgressionNode(
        node_id="sentence_examples",
        name="Sentence Examples",
        category="sentences",
        unlock_requirement=_requires_mastered("grammar_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.8),
        children=(),
        rewards=_content("sentence_examples_unlocked"),
    ),
    ProgressionNode(
        node_id="scripted_conv",
        name="Scripted Conversation",
        category="scripted_conversation",
        unlock_requirement=_requires_mastered("grammar_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0),
        children=("listening",),
        # No seal: nothing measures scripted conversation, so it could never be earned
        # (audit 12, F3; Robbie: hide it until something does).
        rewards=(),
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
        rewards=(),
    ),
    ProgressionNode(
        node_id="jlpt_n4",
        name="JLPT N4",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n5"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n3",),
        rewards=(),
    ),
    ProgressionNode(
        node_id="jlpt_n3",
        name="JLPT N3",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n4"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n2",),
        rewards=(),
    ),
    ProgressionNode(
        node_id="jlpt_n2",
        name="JLPT N2",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n3"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=("jlpt_n1",),
        rewards=(),
    ),
    ProgressionNode(
        node_id="jlpt_n1",
        name="JLPT N1",
        category="jlpt",
        unlock_requirement=_requires_mastered("jlpt_n2"),
        mastery_requirement=MasteryRequirement(mastered_ratio=0.9),
        children=(),
        rewards=(),
    ),
]

# ---------------------------------------------------------------------------
# Public graph singleton
# ---------------------------------------------------------------------------

JPLEARN_GRAPH: ProgressionGraph = build_graph(_NODES, root_id="tutorial")

#: The rest of the graph. Issue #78 left these without a measure on purpose:
#: they always report no progress and never read as mastered, and what waits
#: on them opens once they are reached (see ``gate_status``).
UNMEASURED_NODE_IDS: frozenset[str] = frozenset(JPLEARN_GRAPH.nodes) - MEASURED_NODE_IDS
