"""Tests for the domain progression system.

Coverage:
- build_graph: validation, parent_index construction, error cases
- build_initial_state: root unlocked, others locked
- is_unlocked: prerequisite evaluation, status ordering
- is_mastered: ratio + floor logic, edge cases
- activate_node: unlocked→active, no-ops, locked guard
- record_mastery: count updates, mastery transition, child unlock propagation,
                  branch unlock propagation, idempotency
- reachable_nodes: filters locked nodes
- JPLEARN_GRAPH: curriculum integrity validation
"""
from __future__ import annotations

from datetime import date

import pytest

from domain.progression import (
    MasteryRequirement,
    NodeProgressionState,
    ProgressionNode,
    ProgressionReward,
    UnlockCondition,
    UnlockRequirement,
)
from domain.progression_curriculum import JPLEARN_GRAPH
from domain.progression_service import (
    activate_node,
    build_graph,
    build_initial_state,
    is_mastered,
    is_unlocked,
    reachable_nodes,
    record_mastery,
)

TODAY = date(2026, 1, 1)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _node(
    node_id: str,
    *,
    requires: str | None = None,
    ratio: float = 1.0,
    min_mastered: int = 0,
    children: tuple[str, ...] = (),
    branches: tuple[str, ...] = (),
    rewards: tuple[ProgressionReward, ...] = (),
) -> ProgressionNode:
    """Helper to build a minimal ProgressionNode for tests."""
    unlock = (
        UnlockRequirement(
            conditions=(UnlockCondition(node_id=requires, required_status="mastered"),)
        )
        if requires
        else UnlockRequirement()
    )
    return ProgressionNode(
        node_id=node_id,
        name=node_id.capitalize(),
        category="tutorial",
        unlock_requirement=unlock,
        mastery_requirement=MasteryRequirement(mastered_ratio=ratio, min_mastered=min_mastered),
        children=children,
        branches=branches,
        rewards=rewards,
    )


@pytest.fixture()
def linear_graph():
    """root → a → b (linear chain)."""
    nodes = [
        _node("root", children=("a",)),
        _node("a", requires="root", children=("b",)),
        _node("b", requires="a"),
    ]
    return build_graph(nodes, root_id="root")


@pytest.fixture()
def branching_graph():
    """root → a (child) + branch_x (branch, optional)."""
    nodes = [
        _node("root", children=("a",), branches=("branch_x",)),
        _node("a", requires="root"),
        _node("branch_x", requires="root"),
    ]
    return build_graph(nodes, root_id="root")


@pytest.fixture()
def multi_prereq_graph():
    """a and b must both be mastered before c unlocks."""
    c = ProgressionNode(
        node_id="c",
        name="C",
        category="tutorial",
        unlock_requirement=UnlockRequirement(
            conditions=(
                UnlockCondition(node_id="a", required_status="mastered"),
                UnlockCondition(node_id="b", required_status="mastered"),
            )
        ),
        mastery_requirement=MasteryRequirement(mastered_ratio=1.0),
    )
    nodes = [
        _node("root", children=("a", "b")),
        _node("a", requires="root"),
        _node("b", requires="root"),
        c,
    ]
    return build_graph(nodes, root_id="root")


# ---------------------------------------------------------------------------
# build_graph
# ---------------------------------------------------------------------------


class TestBuildGraph:
    def test_parent_index_covers_children(self, linear_graph):
        assert "root" in linear_graph.parent_index["a"]

    def test_parent_index_covers_branches(self, branching_graph):
        assert "root" in branching_graph.parent_index["branch_x"]

    def test_root_has_no_parents(self, linear_graph):
        assert linear_graph.parent_index["root"] == ()

    def test_all_nodes_registered(self, linear_graph):
        assert set(linear_graph.nodes) == {"root", "a", "b"}

    def test_root_id_stored(self, linear_graph):
        assert linear_graph.root_id == "root"

    def test_unknown_root_raises(self):
        with pytest.raises(ValueError, match="root_id"):
            build_graph([_node("a")], root_id="missing")

    def test_unknown_child_raises(self):
        nodes = [_node("root", children=("ghost",))]
        with pytest.raises(ValueError, match="ghost"):
            build_graph(nodes, root_id="root")

    def test_unknown_branch_raises(self):
        nodes = [_node("root", branches=("ghost",))]
        with pytest.raises(ValueError, match="ghost"):
            build_graph(nodes, root_id="root")

    def test_unknown_condition_node_raises(self):
        nodes = [_node("root"), _node("a", requires="ghost")]
        with pytest.raises(ValueError, match="ghost"):
            build_graph(nodes, root_id="root")

    def test_single_node_graph(self):
        g = build_graph([_node("only")], root_id="only")
        assert g.root_id == "only"
        assert g.parent_index["only"] == ()


# ---------------------------------------------------------------------------
# build_initial_state
# ---------------------------------------------------------------------------


class TestBuildInitialState:
    def test_root_is_unlocked(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert state.node_states["root"].status == "unlocked"

    def test_non_root_nodes_are_locked(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert state.node_states["a"].status == "locked"
        assert state.node_states["b"].status == "locked"

    def test_all_nodes_present(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert set(state.node_states) == {"root", "a", "b"}

    def test_counts_initialised_to_zero(self, linear_graph):
        state = build_initial_state(linear_graph)
        ns = state.node_states["root"]
        assert ns.mastered_item_count == 0
        assert ns.total_item_count == 0


# ---------------------------------------------------------------------------
# is_unlocked
# ---------------------------------------------------------------------------


class TestIsUnlocked:
    def test_no_conditions_always_unlocked(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert is_unlocked(linear_graph, state, "root") is True

    def test_locked_prereq_blocks_unlock(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert is_unlocked(linear_graph, state, "a") is False

    def test_mastered_prereq_allows_unlock(self, linear_graph):
        state = build_initial_state(linear_graph)
        # Manually set root to mastered
        state.node_states["root"] = NodeProgressionState(
            node_id="root", status="mastered"
        )
        assert is_unlocked(linear_graph, state, "a") is True

    def test_active_prereq_does_not_satisfy_mastered_condition(self, linear_graph):
        state = build_initial_state(linear_graph)
        state.node_states["root"] = NodeProgressionState(
            node_id="root", status="active"
        )
        # "a" requires "root" mastered, active < mastered
        assert is_unlocked(linear_graph, state, "a") is False

    def test_partial_multi_prereq_not_enough(self, multi_prereq_graph):
        state = build_initial_state(multi_prereq_graph)
        state.node_states["a"] = NodeProgressionState(node_id="a", status="mastered")
        # "b" still locked → "c" should not unlock
        assert is_unlocked(multi_prereq_graph, state, "c") is False

    def test_both_prereqs_mastered_unlocks(self, multi_prereq_graph):
        state = build_initial_state(multi_prereq_graph)
        state.node_states["a"] = NodeProgressionState(node_id="a", status="mastered")
        state.node_states["b"] = NodeProgressionState(node_id="b", status="mastered")
        assert is_unlocked(multi_prereq_graph, state, "c") is True


# ---------------------------------------------------------------------------
# is_mastered
# ---------------------------------------------------------------------------


class TestIsMastered:
    def _node_with_req(self, ratio: float, min_m: int = 0) -> ProgressionNode:
        return _node("x", ratio=ratio, min_mastered=min_m)

    def test_zero_total_never_mastered(self):
        n = self._node_with_req(0.0)
        assert is_mastered(n, 0, 0) is False

    def test_exact_ratio_satisfied(self):
        n = self._node_with_req(0.8)
        assert is_mastered(n, 8, 10) is True

    def test_below_ratio_not_mastered(self):
        n = self._node_with_req(0.8)
        assert is_mastered(n, 7, 10) is False

    def test_ratio_100_requires_all(self):
        n = self._node_with_req(1.0)
        assert is_mastered(n, 9, 10) is False
        assert is_mastered(n, 10, 10) is True

    def test_floor_blocks_despite_ratio(self):
        # 5/6 ≈ 0.83 which is ≥ 0.8, but floor=10 not met
        n = self._node_with_req(0.8, min_m=10)
        assert is_mastered(n, 5, 6) is False

    def test_both_ratio_and_floor_required(self):
        n = self._node_with_req(0.8, min_m=4)
        # 4/5 = 0.8, min met
        assert is_mastered(n, 4, 5) is True

    def test_ratio_zero_min_zero_still_blocked_by_total(self):
        n = self._node_with_req(0.0, min_m=0)
        # total=0 → blocked regardless
        assert is_mastered(n, 0, 0) is False

    def test_ratio_zero_with_items_passes(self):
        n = self._node_with_req(0.0, min_m=0)
        assert is_mastered(n, 0, 1) is True


# ---------------------------------------------------------------------------
# activate_node
# ---------------------------------------------------------------------------


class TestActivateNode:
    def test_unlocked_becomes_active(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, events = activate_node(linear_graph, state, "root", TODAY)
        assert new_state.node_states["root"].status == "active"
        assert len(events) == 1
        assert events[0].event_type == "node_activated"
        assert events[0].node_id == "root"
        assert events[0].date == TODAY

    def test_first_activated_date_set(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, _ = activate_node(linear_graph, state, "root", TODAY)
        assert new_state.node_states["root"].first_activated_date == TODAY

    def test_already_active_is_noop(self, linear_graph):
        state = build_initial_state(linear_graph)
        state, _ = activate_node(linear_graph, state, "root", TODAY)
        state2, events = activate_node(linear_graph, state, "root", TODAY)
        assert events == ()
        assert state2.node_states["root"].status == "active"

    def test_mastered_node_is_noop(self, linear_graph):
        state = build_initial_state(linear_graph)
        state.node_states["root"] = NodeProgressionState(
            node_id="root", status="mastered"
        )
        new_state, events = activate_node(linear_graph, state, "root", TODAY)
        assert events == ()
        assert new_state.node_states["root"].status == "mastered"

    def test_locked_node_raises(self, linear_graph):
        state = build_initial_state(linear_graph)
        with pytest.raises(ValueError, match="locked"):
            activate_node(linear_graph, state, "a", TODAY)

    def test_unknown_node_raises(self, linear_graph):
        state = build_initial_state(linear_graph)
        with pytest.raises(ValueError, match="ghost"):
            activate_node(linear_graph, state, "ghost", TODAY)

    def test_original_state_not_mutated(self, linear_graph):
        state = build_initial_state(linear_graph)
        original_status = state.node_states["root"].status
        activate_node(linear_graph, state, "root", TODAY)
        assert state.node_states["root"].status == original_status


# ---------------------------------------------------------------------------
# record_mastery
# ---------------------------------------------------------------------------


class TestRecordMastery:
    def test_counts_updated_below_threshold(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, events = record_mastery(linear_graph, state, "root", 3, 10, TODAY)
        ns = new_state.node_states["root"]
        assert ns.mastered_item_count == 3
        assert ns.total_item_count == 10
        assert ns.status == "unlocked"  # ratio=0.3, not mastered
        assert events == ()

    def test_mastery_transition_at_threshold(self, linear_graph):
        state = build_initial_state(linear_graph)
        # root has ratio=1.0; 10/10 = 1.0 → mastered
        new_state, events = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert new_state.node_states["root"].status == "mastered"
        assert any(e.event_type == "node_mastered" for e in events)

    def test_mastered_date_set(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert new_state.node_states["root"].mastered_date == TODAY

    def test_child_unlocked_after_parent_mastered(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, events = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert new_state.node_states["a"].status == "unlocked"
        assert any(e.event_type == "node_unlocked" and e.node_id == "a" for e in events)

    def test_grandchild_still_locked_after_one_mastery(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        # "b" requires "a" mastered; "a" only unlocked at this point
        assert new_state.node_states["b"].status == "locked"

    def test_branch_unlocked_with_branch_unlocked_event(self, branching_graph):
        state = build_initial_state(branching_graph)
        new_state, events = record_mastery(branching_graph, state, "root", 10, 10, TODAY)
        assert new_state.node_states["branch_x"].status == "unlocked"
        assert any(e.event_type == "branch_unlocked" and e.node_id == "branch_x" for e in events)

    def test_rewards_attached_to_mastered_event(self):
        reward = ProgressionReward(reward_type="milestone", descriptor="done")
        nodes = [_node("root", rewards=(reward,))]
        g = build_graph(nodes, root_id="root")
        state = build_initial_state(g)
        _, events = record_mastery(g, state, "root", 1, 1, TODAY)
        mastered_event = next(e for e in events if e.event_type == "node_mastered")
        assert mastered_event.rewards == (reward,)

    def test_already_mastered_does_not_re_emit(self, linear_graph):
        state = build_initial_state(linear_graph)
        state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        # Call again — should not emit another node_mastered
        _, events = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert not any(e.event_type == "node_mastered" for e in events)

    def test_counts_still_updated_when_already_mastered(self, linear_graph):
        state = build_initial_state(linear_graph)
        state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        new_state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert new_state.node_states["root"].mastered_item_count == 10

    def test_unknown_node_raises(self, linear_graph):
        state = build_initial_state(linear_graph)
        with pytest.raises(ValueError, match="ghost"):
            record_mastery(linear_graph, state, "ghost", 1, 1, TODAY)

    def test_total_zero_never_triggers_mastery(self, linear_graph):
        state = build_initial_state(linear_graph)
        new_state, events = record_mastery(linear_graph, state, "root", 0, 0, TODAY)
        assert new_state.node_states["root"].status == "unlocked"
        assert events == ()

    def test_original_state_not_mutated(self, linear_graph):
        state = build_initial_state(linear_graph)
        original = state.node_states["root"].status
        record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        assert state.node_states["root"].status == original

    def test_multi_prereq_child_only_unlocks_when_all_met(self, multi_prereq_graph):
        state = build_initial_state(multi_prereq_graph)
        # Manually unlock and master "root" first so a/b can be studied
        state.node_states["root"] = NodeProgressionState(node_id="root", status="mastered")
        state.node_states["a"] = NodeProgressionState(node_id="a", status="unlocked")
        state.node_states["b"] = NodeProgressionState(node_id="b", status="unlocked")
        # Master "a" only → "c" still locked
        state, _ = record_mastery(multi_prereq_graph, state, "a", 1, 1, TODAY)
        assert state.node_states["c"].status == "locked"
        # Now master "b" → "c" should unlock
        state, events = record_mastery(multi_prereq_graph, state, "b", 1, 1, TODAY)
        assert state.node_states["c"].status == "unlocked"
        assert any(e.node_id == "c" for e in events)


# ---------------------------------------------------------------------------
# reachable_nodes
# ---------------------------------------------------------------------------


class TestReachableNodes:
    def test_only_root_reachable_initially(self, linear_graph):
        state = build_initial_state(linear_graph)
        assert reachable_nodes(linear_graph, state) == {"root"}

    def test_mastered_root_adds_child_to_reachable(self, linear_graph):
        state = build_initial_state(linear_graph)
        state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        reachable = reachable_nodes(linear_graph, state)
        assert "root" in reachable
        assert "a" in reachable
        assert "b" not in reachable

    def test_full_chain_all_reachable(self, linear_graph):
        state = build_initial_state(linear_graph)
        state, _ = record_mastery(linear_graph, state, "root", 10, 10, TODAY)
        state, _ = record_mastery(linear_graph, state, "a", 10, 10, TODAY)
        state, _ = record_mastery(linear_graph, state, "b", 10, 10, TODAY)
        assert reachable_nodes(linear_graph, state) == {"root", "a", "b"}


# ---------------------------------------------------------------------------
# JPLEARN_GRAPH — curriculum integrity
# ---------------------------------------------------------------------------


class TestJPLearnGraph:
    EXPECTED_NODES = {
        "tutorial", "hiragana", "katakana", "vocabulary_n5", "grammar_n5",
        "sentence_examples", "scripted_conv", "listening", "kanji_n5", "free_conv", "reading",
        "jlpt_n5", "jlpt_n4", "jlpt_n3", "jlpt_n2", "jlpt_n1",
    }

    def test_all_nodes_present(self):
        assert set(JPLEARN_GRAPH.nodes.keys()) == self.EXPECTED_NODES

    def test_root_is_tutorial(self):
        assert JPLEARN_GRAPH.root_id == "tutorial"

    def test_tutorial_has_no_prerequisites(self):
        node = JPLEARN_GRAPH.nodes["tutorial"]
        assert node.unlock_requirement.conditions == ()

    def test_hiragana_requires_tutorial(self):
        node = JPLEARN_GRAPH.nodes["hiragana"]
        cond = node.unlock_requirement.conditions[0]
        assert cond.node_id == "tutorial"
        assert cond.required_status == "mastered"

    def test_linear_main_path_ordering(self):
        main_path = [
            "tutorial", "hiragana", "katakana", "vocabulary_n5", "grammar_n5",
            "scripted_conv", "listening", "kanji_n5", "free_conv", "reading",
            "jlpt_n5",
        ]
        for parent_id, child_id in zip(main_path, main_path[1:]):
            parent = JPLEARN_GRAPH.nodes[parent_id]
            assert child_id in parent.children, (
                f"Expected '{parent_id}' to have '{child_id}' as a child"
            )
            child = JPLEARN_GRAPH.nodes[child_id]
            prereq_ids = [c.node_id for c in child.unlock_requirement.conditions]
            assert parent_id in prereq_ids, (
                f"Expected '{child_id}' to require '{parent_id}'"
            )

    def test_jlpt_levels_are_sequential(self):
        jlpt_chain = ["jlpt_n5", "jlpt_n4", "jlpt_n3", "jlpt_n2", "jlpt_n1"]
        for parent_id, child_id in zip(jlpt_chain, jlpt_chain[1:]):
            parent = JPLEARN_GRAPH.nodes[parent_id]
            assert child_id in parent.children

    def test_jlpt_n1_is_leaf(self):
        n1 = JPLEARN_GRAPH.nodes["jlpt_n1"]
        assert n1.children == ()
        assert n1.branches == ()

    def test_all_nodes_have_rewards(self):
        for node_id, node in JPLEARN_GRAPH.nodes.items():
            assert node.rewards, f"Node '{node_id}' has no rewards defined"

    def test_hiragana_min_mastered_is_46(self):
        node = JPLEARN_GRAPH.nodes["hiragana"]
        assert node.mastery_requirement.min_mastered == 46

    def test_katakana_min_mastered_is_46(self):
        node = JPLEARN_GRAPH.nodes["katakana"]
        assert node.mastery_requirement.min_mastered == 46

    def test_kanji_n5_min_mastered_is_80(self):
        node = JPLEARN_GRAPH.nodes["kanji_n5"]
        assert node.mastery_requirement.min_mastered == 80

    def test_vocabulary_n5_gate_is_an_absolute_floor_not_a_corpus_ratio(self):
        """Regression guard for issue #67.

        vocab_n5 grew from 50 cards to the full 718-word corpus. A ratio-based
        gate would have quietly gone from "40 words" to "575 words" and blocked
        the whole grammar path, so this node gates on an absolute count.
        """
        node = JPLEARN_GRAPH.nodes["vocabulary_n5"]
        assert node.mastery_requirement.min_mastered == 40
        assert node.mastery_requirement.mastered_ratio == 0.0

    def test_vocabulary_n5_gate_is_independent_of_deck_size(self):
        node = JPLEARN_GRAPH.nodes["vocabulary_n5"]
        for total in (50, 718, 5000):
            assert is_mastered(node, 39, total) is False
            assert is_mastered(node, 40, total) is True

    def test_parent_index_is_complete(self):
        # Every node referenced as child/branch should appear in parent_index
        # with the referencing node listed.
        for node in JPLEARN_GRAPH.nodes.values():
            for child_id in (*node.children, *node.branches):
                assert node.node_id in JPLEARN_GRAPH.parent_index[child_id]

    def test_initial_state_only_tutorial_unlocked(self):
        state = build_initial_state(JPLEARN_GRAPH)
        for node_id, ns in state.node_states.items():
            expected = "unlocked" if node_id == "tutorial" else "locked"
            assert ns.status == expected, f"{node_id}: expected {expected}, got {ns.status}"

    def test_mastering_tutorial_unlocks_hiragana_only(self):
        state = build_initial_state(JPLEARN_GRAPH)
        new_state, events = record_mastery(JPLEARN_GRAPH, state, "tutorial", 1, 1, TODAY)
        assert new_state.node_states["hiragana"].status == "unlocked"
        # All others (except tutorial) remain locked
        for node_id, ns in new_state.node_states.items():
            if node_id not in ("tutorial", "hiragana"):
                assert ns.status == "locked", f"{node_id} should still be locked"

    def test_cannot_skip_prerequisite(self):
        state = build_initial_state(JPLEARN_GRAPH)
        # "katakana" requires "hiragana" mastered — try to record mastery directly
        new_state, events = record_mastery(JPLEARN_GRAPH, state, "katakana", 46, 46, TODAY)
        # katakana is still locked; the counts update but no mastery event fires
        # because the node is "locked" (not active), but more importantly:
        # mastering katakana should NOT unlock vocabulary_n5 while hiragana is locked.
        assert new_state.node_states["vocabulary_n5"].status == "locked"

    def test_full_path_walk_to_hiragana(self):
        """Walk the first two steps of the main path end-to-end."""
        state = build_initial_state(JPLEARN_GRAPH)
        state, _ = activate_node(JPLEARN_GRAPH, state, "tutorial", TODAY)
        state, _ = record_mastery(JPLEARN_GRAPH, state, "tutorial", 1, 1, TODAY)
        assert state.node_states["hiragana"].status == "unlocked"

        state, _ = activate_node(JPLEARN_GRAPH, state, "hiragana", TODAY)
        state, _ = record_mastery(JPLEARN_GRAPH, state, "hiragana", 46, 46, TODAY)
        assert state.node_states["hiragana"].status == "mastered"
        assert state.node_states["katakana"].status == "unlocked"
        assert state.node_states["vocabulary_n5"].status == "locked"
