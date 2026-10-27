"""The feature catalog gates on unmeasured nodes as reached, not mastered (audit 3, F7)."""
from __future__ import annotations

from datetime import date

from domain.feature_catalog import JPLEARN_FEATURES
from domain.feature_service import build_feature_state, evaluate_features
from domain.progression import NodeProgressionState, ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH, MEASURED_NODE_IDS

TODAY = date(2026, 10, 27)


def _by_id(feature_id: str):
    return next(f for f in JPLEARN_FEATURES if f.feature_id == feature_id)


def _prog(**statuses: str) -> ProgressionState:
    return ProgressionState(node_states={
        node_id: NodeProgressionState(node_id=node_id, status=statuses.get(node_id, "locked"))  # type: ignore[arg-type]
        for node_id in JPLEARN_GRAPH.nodes
    })


def test_every_mastery_gate_on_an_unmeasured_node_asks_only_that_it_is_reached():
    for feature in JPLEARN_FEATURES:
        for cond in feature.requirement.progression_conditions:
            if cond.node_id not in MEASURED_NODE_IDS:
                assert cond.required_status == "unlocked", (feature.feature_id, cond.node_id)


def test_reading_mode_and_advanced_analytics_open_once_reading_is_reached():
    for feature_id in ("reading_mode", "advanced_analytics"):
        (cond,) = _by_id(feature_id).requirement.progression_conditions
        assert (cond.node_id, cond.required_status) == ("reading", "unlocked")

    locked, _ = evaluate_features(JPLEARN_FEATURES, _prog(), build_feature_state(JPLEARN_FEATURES), TODAY)
    opened, _ = evaluate_features(
        JPLEARN_FEATURES, _prog(reading="unlocked"), build_feature_state(JPLEARN_FEATURES), TODAY,
    )
    assert locked.statuses["reading_mode"] == "locked"
    assert opened.statuses["reading_mode"] == "unlocked"
    assert opened.statuses["advanced_analytics"] == "unlocked"


def test_measured_gates_still_want_mastery():
    (cond,) = _by_id("conversation_mode").requirement.progression_conditions
    assert (cond.node_id, cond.required_status) == ("grammar_n5", "mastered")
