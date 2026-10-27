"""Tests for ``unlock_ready_nodes`` and the curriculum's gate on unmeasured nodes (audit 3, F7)."""
from __future__ import annotations

from datetime import date

from domain.progression import (
    MasteryRequirement,
    NodeProgressionState,
    ProgressionNode,
    ProgressionState,
    UnlockCondition,
    UnlockRequirement,
)
from domain.progression_curriculum import (
    JPLEARN_GRAPH,
    MEASURED_NODE_IDS,
    UNMEASURED_NODE_IDS,
    gate_status,
)
from domain.progression_service import build_graph, build_initial_state, unlock_ready_nodes

TODAY = date(2026, 10, 27)


def _node(node_id: str, requires: str | None, status: str = "mastered", **kw) -> ProgressionNode:
    conditions = (UnlockCondition(node_id=requires, required_status=status),) if requires else ()  # type: ignore[arg-type]
    return ProgressionNode(
        node_id=node_id,
        name=node_id,
        category="tutorial",
        unlock_requirement=UnlockRequirement(conditions=conditions),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0),
        **kw,
    )


# root (measured) -> a (reached is enough) -> b (reached is enough) -> c (needs b mastered)
GRAPH = build_graph(
    [
        _node("root", None, children=("a",)),
        _node("a", "root", children=("b",)),
        _node("b", "a", "unlocked", children=("c",)),
        _node("c", "b", "unlocked", children=("d",)),
        _node("d", "c", "mastered"),
    ],
    root_id="root",
)


def _state(**statuses: str) -> ProgressionState:
    state = build_initial_state(GRAPH)
    for node_id, status in statuses.items():
        state.node_states[node_id] = NodeProgressionState(node_id=node_id, status=status)  # type: ignore[arg-type]
    return state


class TestUnlockReadyNodes:
    def test_walks_a_chain_of_reached_gates_in_one_call(self):
        state, events = unlock_ready_nodes(GRAPH, _state(root="mastered", a="unlocked"), TODAY)
        assert [state.node_states[n].status for n in ("b", "c", "d")] == ["unlocked", "unlocked", "locked"]
        assert [(e.event_type, e.node_id) for e in events] == [
            ("node_unlocked", "b"), ("node_unlocked", "c"),
        ]

    def test_does_nothing_while_the_gate_before_is_locked(self):
        state, events = unlock_ready_nodes(GRAPH, _state(root="unlocked"), TODAY)
        assert events == ()
        assert state.node_states["b"].status == "locked"

    def test_never_moves_a_status_backwards(self):
        before = _state(root="mastered", a="mastered", b="mastered", c="active", d="unlocked")
        state, events = unlock_ready_nodes(GRAPH, before, TODAY)
        assert events == ()
        assert state.node_states == before.node_states

    def test_is_idempotent(self):
        once, _ = unlock_ready_nodes(GRAPH, _state(root="mastered", a="unlocked"), TODAY)
        twice, events = unlock_ready_nodes(GRAPH, once, TODAY)
        assert events == ()
        assert twice.node_states == once.node_states


class TestCurriculumGates:
    def test_a_measured_prerequisite_must_be_mastered_and_an_unmeasured_one_reached(self):
        for node in JPLEARN_GRAPH.nodes.values():
            for cond in node.unlock_requirement.conditions:
                expected = "mastered" if cond.node_id in MEASURED_NODE_IDS else "unlocked"
                assert cond.required_status == expected, (node.node_id, cond.node_id)

    def test_kanji_n5_waits_on_listening_being_reached(self):
        (cond,) = JPLEARN_GRAPH.nodes["kanji_n5"].unlock_requirement.conditions
        assert (cond.node_id, cond.required_status) == ("listening", "unlocked")

    def test_gate_status(self):
        assert gate_status("grammar_n5") == "mastered"
        assert gate_status("reading") == "unlocked"

    def test_the_unmeasured_nodes_are_the_ten_issue_78_left_without_a_measure(self):
        assert UNMEASURED_NODE_IDS == {
            "sentence_examples", "scripted_conv", "listening", "free_conv", "reading",
            "jlpt_n5", "jlpt_n4", "jlpt_n3", "jlpt_n2", "jlpt_n1",
        }
