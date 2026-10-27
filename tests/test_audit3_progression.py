"""Audit 3, F7: steps the app cannot measure no longer hold the path shut.

Check 7 of the audit studied every tracked deck and found Kanji N5, Reading and
the JLPT steps locked for good, with ``reading_mode`` and ``advanced_analytics``
never unlocking. Robbie's ruling was "Don't block on them": an unmeasured step
opens what follows it once it is reached, still reports no progress, and is
never mastered.

Every test here runs on a temporary database.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from data import database
from domain.progression_curriculum import MEASURED_NODE_IDS, UNMEASURED_NODE_IDS
from domain.scheduler import ReviewState
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-audit3-progression.db")


def _study(*node_ids: str) -> None:
    """Answer every card behind each node correctly once."""
    desktop_bridge.init_study_db()
    for node_id in node_ids:
        deck = desktop_bridge.ALL_DECKS[desktop_bridge._PROGRESSION_SYNC_DECK_SLUGS[node_id]]()
        for card in deck.cards:
            database.save_state(deck.name, ReviewState(card_id=card.id, repetitions=1))


def _nodes() -> dict[str, dict[str, Any]]:
    status = desktop_bridge.build_progression_status()
    return {n["node_id"]: n for n in cast("list[dict[str, Any]]", status["nodes"])}


def _features() -> dict[str, dict[str, Any]]:
    status = desktop_bridge.build_feature_unlock_status()
    return {f["feature_id"]: f for f in cast("list[dict[str, Any]]", status["features"])}


DECK_NODES = tuple(desktop_bridge._PROGRESSION_SYNC_DECK_SLUGS)


def test_measured_nodes_are_listed_once_and_the_bridge_measures_exactly_them() -> None:
    assert set(desktop_bridge._PROGRESSION_SYNC_ORDER) == MEASURED_NODE_IDS
    assert set(desktop_bridge._PROGRESSION_SYNC_DECK_SLUGS) == MEASURED_NODE_IDS - {"tutorial"}
    assert desktop_bridge.UNTRACKED_PROGRESSION_NODES == UNMEASURED_NODE_IDS
    assert MEASURED_NODE_IDS | UNMEASURED_NODE_IDS == set(desktop_bridge.JPLEARN_GRAPH.nodes)


def test_check_7_every_tracked_deck_studied_opens_the_whole_path(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")
    _study(*DECK_NODES)

    nodes = _nodes()

    for node_id in MEASURED_NODE_IDS:
        assert nodes[node_id]["status"] == "mastered", node_id
    # Kanji N5 waited on Listening, which nothing measures; it opened and its
    # studied deck mastered it in the same sync.
    assert nodes["kanji_n5"]["status"] == "mastered"
    for node_id in UNMEASURED_NODE_IDS:
        node = nodes[node_id]
        assert node["status"] == "unlocked", node_id
        assert node["is_reachable"] is True, node_id
        assert node["is_tracked"] is False, node_id
        assert (node["mastered_count"], node["total_count"], node["mastered_ratio"]) == (0, 0, 0.0)

    features = _features()
    assert all(f["is_unlocked"] for f in features.values()), [
        fid for fid, f in features.items() if not f["is_unlocked"]
    ]
    # The gate says what it actually waits for: Reading reached, not mastered.
    for feature_id in ("reading_mode", "advanced_analytics"):
        assert list(features[feature_id]["requires"]) == [{"node_id": "reading", "status": "unlocked"}]


def test_an_unmeasured_step_opens_only_what_its_own_reach_allows(
    tmp_path: Path, monkeypatch,
) -> None:
    """Up to Grammar N5 studied, nothing of Kanji N5: the path walks past the three
    unmeasured steps to Kanji N5, and stops there because Kanji N5 is measured."""
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")
    _study("hiragana", "katakana", "vocabulary_n5", "grammar_n5")

    nodes = _nodes()

    for node_id in ("sentence_examples", "scripted_conv", "listening"):
        assert nodes[node_id]["status"] == "unlocked", node_id
    assert nodes["kanji_n5"]["status"] == "unlocked"
    for node_id in ("free_conv", "reading", "jlpt_n5", "jlpt_n1"):
        assert nodes[node_id]["status"] == "locked", node_id

    features = _features()
    assert features["kanji_mode"]["is_unlocked"] is True
    assert features["reading_mode"]["is_unlocked"] is False
    assert features["advanced_analytics"]["is_unlocked"] is False


def test_a_fresh_account_opens_nothing_past_the_tutorial(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    nodes = _nodes()

    assert nodes["tutorial"]["status"] == "unlocked"
    assert all(n["status"] == "locked" for nid, n in nodes.items() if nid != "tutorial")


def test_reached_steps_are_stored_and_never_move_back(tmp_path: Path, monkeypatch) -> None:
    """The feature gates read the stored state, so a reached unmeasured step has to
    be written down; and losing the counts later must not close anything."""
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")
    _study(*DECK_NODES)
    desktop_bridge.sync_progression_state()

    stored = {row["node_id"]: row["status"] for row in database.load_user_progression()}
    for node_id in UNMEASURED_NODE_IDS:
        assert stored[node_id] == "unlocked", node_id

    monkeypatch.setattr(
        desktop_bridge, "_compute_node_mastery_counts", lambda node_id: (0, 1),
    )
    state, events = desktop_bridge.sync_progression_state()

    assert events == ()
    for node_id in MEASURED_NODE_IDS:
        assert state.node_states[node_id].status == "mastered", node_id
    for node_id in UNMEASURED_NODE_IDS:
        assert state.node_states[node_id].status == "unlocked", node_id
