"""Tests for the domain feature unlock system.

Coverage:
- build_feature_state: all features start locked
- is_available: progression conditions, feature dependencies, no requirements,
                partial multi-condition, status ordering
- evaluate_features: unlocks on met requirements, cascade (tutor_chat),
                     idempotency, no-requirements features, original not mutated,
                     unknown dependency raises, newly-added feature handling
- unlocked_features: filters to unlocked only
- JPLEARN_FEATURES catalog: integrity, tier structure, dependency wiring
"""
from __future__ import annotations

from datetime import date

import pytest

from domain.feature_catalog import JPLEARN_FEATURES
from domain.features import (
    Feature,
    FeatureDependency,
    FeatureRequirement,
    FeatureReward,
    FeatureState,
    FeatureUnlock,
    ProgressionCondition,
)
from domain.feature_service import (
    build_feature_state,
    evaluate_features,
    is_available,
    unlocked_features,
)
from domain.progression import NodeProgressionState, ProgressionState

TODAY = date(2026, 1, 1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _feature(
    feature_id: str,
    *,
    requires_nodes: list[tuple[str, str]] | None = None,
    requires_features: list[str] | None = None,
) -> Feature:
    """Build a minimal Feature for tests."""
    prog_conds = tuple(
        ProgressionCondition(node_id=nid, required_status=status)  # type: ignore[arg-type]
        for nid, status in (requires_nodes or [])
    )
    feat_deps = tuple(
        FeatureDependency(feature_id=fid) for fid in (requires_features or [])
    )
    return Feature(
        feature_id=feature_id,
        name=feature_id.capitalize(),
        category="learning_mode",
        requirement=FeatureRequirement(
            progression_conditions=prog_conds,
            feature_dependencies=feat_deps,
        ),
        unlock=FeatureUnlock(access_descriptor=f"{feature_id}_access"),
    )


def _prog_state(**node_statuses: str) -> ProgressionState:
    """Build a ProgressionState with only the specified nodes."""
    return ProgressionState(
        node_states={
            nid: NodeProgressionState(node_id=nid, status=status)  # type: ignore[arg-type]
            for nid, status in node_statuses.items()
        }
    )


def _feat_state(**statuses: str) -> FeatureState:
    return FeatureState(statuses=dict(statuses))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# build_feature_state
# ---------------------------------------------------------------------------


class TestBuildFeatureState:
    def test_all_start_locked(self):
        features = [_feature("a"), _feature("b")]
        state = build_feature_state(features)
        assert state.statuses["a"] == "locked"
        assert state.statuses["b"] == "locked"

    def test_all_features_have_entry(self):
        features = [_feature("x"), _feature("y"), _feature("z")]
        state = build_feature_state(features)
        assert set(state.statuses) == {"x", "y", "z"}

    def test_empty_catalog_produces_empty_state(self):
        state = build_feature_state([])
        assert state.statuses == {}


# ---------------------------------------------------------------------------
# is_available
# ---------------------------------------------------------------------------


class TestIsAvailable:
    def test_no_requirements_always_available(self):
        feat = _feature("free")
        prog = _prog_state()
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is True

    def test_progression_mastered_satisfied(self):
        feat = _feature("a", requires_nodes=[("hiragana", "mastered")])
        prog = _prog_state(hiragana="mastered")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is True

    def test_progression_unlocked_satisfies_unlocked_condition(self):
        feat = _feature("a", requires_nodes=[("hiragana", "unlocked")])
        prog = _prog_state(hiragana="unlocked")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is True

    def test_progression_mastered_satisfies_unlocked_condition(self):
        # mastered > unlocked in ordering
        feat = _feature("a", requires_nodes=[("hiragana", "unlocked")])
        prog = _prog_state(hiragana="mastered")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is True

    def test_progression_unlocked_does_not_satisfy_mastered_condition(self):
        feat = _feature("a", requires_nodes=[("hiragana", "mastered")])
        prog = _prog_state(hiragana="unlocked")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is False

    def test_progression_locked_not_satisfied(self):
        feat = _feature("a", requires_nodes=[("hiragana", "mastered")])
        prog = _prog_state(hiragana="locked")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is False

    def test_progression_node_missing_returns_false(self):
        feat = _feature("a", requires_nodes=[("hiragana", "mastered")])
        prog = _prog_state()  # no nodes at all
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is False

    def test_feature_dependency_unlocked_satisfied(self):
        feat = _feature("tutor", requires_features=["conversation"])
        prog = _prog_state()
        fstate = _feat_state(conversation="unlocked")
        assert is_available(feat, prog, fstate) is True

    def test_feature_dependency_locked_not_satisfied(self):
        feat = _feature("tutor", requires_features=["conversation"])
        prog = _prog_state()
        fstate = _feat_state(conversation="locked")
        assert is_available(feat, prog, fstate) is False

    def test_feature_dependency_missing_not_satisfied(self):
        feat = _feature("tutor", requires_features=["conversation"])
        prog = _prog_state()
        fstate = _feat_state()  # no entry for "conversation"
        assert is_available(feat, prog, fstate) is False

    def test_multi_node_all_must_be_met(self):
        feat = _feature("kanji", requires_nodes=[("vocab", "mastered"), ("grammar", "mastered")])
        # Only vocab mastered — grammar not
        prog = _prog_state(vocab="mastered", grammar="unlocked")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is False

    def test_multi_node_all_met(self):
        feat = _feature("kanji", requires_nodes=[("vocab", "mastered"), ("grammar", "mastered")])
        prog = _prog_state(vocab="mastered", grammar="mastered")
        fstate = _feat_state()
        assert is_available(feat, prog, fstate) is True

    def test_mixed_conditions_both_required(self):
        # Requires node mastered AND feature unlocked
        feat = Feature(
            feature_id="advanced",
            name="Advanced",
            category="learning_mode",
            requirement=FeatureRequirement(
                progression_conditions=(
                    ProgressionCondition(node_id="reading", required_status="mastered"),
                ),
                feature_dependencies=(
                    FeatureDependency(feature_id="analytics"),
                ),
            ),
            unlock=FeatureUnlock(access_descriptor="advanced_access"),
        )
        # Both met
        prog = _prog_state(reading="mastered")
        fstate = _feat_state(analytics="unlocked")
        assert is_available(feat, prog, fstate) is True

    def test_mixed_conditions_only_progression_met(self):
        feat = Feature(
            feature_id="advanced",
            name="Advanced",
            category="learning_mode",
            requirement=FeatureRequirement(
                progression_conditions=(
                    ProgressionCondition(node_id="reading", required_status="mastered"),
                ),
                feature_dependencies=(
                    FeatureDependency(feature_id="analytics"),
                ),
            ),
            unlock=FeatureUnlock(access_descriptor="advanced_access"),
        )
        prog = _prog_state(reading="mastered")
        fstate = _feat_state(analytics="locked")
        assert is_available(feat, prog, fstate) is False


# ---------------------------------------------------------------------------
# evaluate_features
# ---------------------------------------------------------------------------


class TestEvaluateFeatures:
    def test_no_requirement_feature_unlocks_immediately(self):
        features = [_feature("free")]
        prog = _prog_state()
        state = build_feature_state(features)
        new_state, events = evaluate_features(features, prog, state, TODAY)
        assert new_state.statuses["free"] == "unlocked"
        assert len(events) == 1
        assert events[0].event_type == "feature_unlocked"
        assert events[0].feature_id == "free"
        assert events[0].date == TODAY

    def test_feature_with_unmet_condition_stays_locked(self):
        features = [_feature("listening", requires_nodes=[("hiragana", "mastered")])]
        prog = _prog_state(hiragana="locked")
        state = build_feature_state(features)
        new_state, events = evaluate_features(features, prog, state, TODAY)
        assert new_state.statuses["listening"] == "locked"
        assert events == ()

    def test_feature_unlocks_when_progression_met(self):
        features = [_feature("listening", requires_nodes=[("hiragana", "mastered")])]
        prog = _prog_state(hiragana="mastered")
        state = build_feature_state(features)
        new_state, events = evaluate_features(features, prog, state, TODAY)
        assert new_state.statuses["listening"] == "unlocked"
        assert len(events) == 1

    def test_cascade_unlocks_in_single_call(self):
        """A unlocks B, and B's unlock enables C — all in one evaluate_features call."""
        features = [
            _feature("a", requires_nodes=[("node_x", "mastered")]),
            _feature("b", requires_features=["a"]),
            _feature("c", requires_features=["b"]),
        ]
        prog = _prog_state(node_x="mastered")
        state = build_feature_state(features)
        new_state, events = evaluate_features(features, prog, state, TODAY)
        assert new_state.statuses["a"] == "unlocked"
        assert new_state.statuses["b"] == "unlocked"
        assert new_state.statuses["c"] == "unlocked"
        assert len(events) == 3
        unlocked_ids = [e.feature_id for e in events]
        assert unlocked_ids.index("a") < unlocked_ids.index("b")
        assert unlocked_ids.index("b") < unlocked_ids.index("c")

    def test_already_unlocked_not_re_emitted(self):
        features = [_feature("free")]
        prog = _prog_state()
        state = build_feature_state(features)
        state, _ = evaluate_features(features, prog, state, TODAY)
        # Call again
        _, events = evaluate_features(features, prog, state, TODAY)
        assert events == ()

    def test_idempotent_state(self):
        features = [_feature("free")]
        prog = _prog_state()
        state = build_feature_state(features)
        state1, _ = evaluate_features(features, prog, state, TODAY)
        state2, _ = evaluate_features(features, prog, state1, TODAY)
        assert state1.statuses == state2.statuses

    def test_unlock_payload_attached_to_event(self):
        reward = FeatureReward(reward_type="badge", descriptor="my_badge")
        feature = Feature(
            feature_id="special",
            name="Special",
            category="ui",
            requirement=FeatureRequirement(),
            unlock=FeatureUnlock(access_descriptor="special_access", rewards=(reward,)),
        )
        prog = _prog_state()
        state = build_feature_state([feature])
        _, events = evaluate_features([feature], prog, state, TODAY)
        assert events[0].unlock.access_descriptor == "special_access"
        assert events[0].unlock.rewards == (reward,)

    def test_original_state_not_mutated(self):
        features = [_feature("free")]
        prog = _prog_state()
        state = build_feature_state(features)
        original_statuses = dict(state.statuses)
        evaluate_features(features, prog, state, TODAY)
        assert state.statuses == original_statuses

    def test_newly_added_feature_gets_default_locked_entry(self):
        """A feature_id in the catalog but absent from state is defaulted to locked."""
        features = [_feature("existing"), _feature("new_feature")]
        prog = _prog_state()
        # state only knows about "existing"
        state = FeatureState(statuses={"existing": "unlocked"})
        new_state, _ = evaluate_features(features, prog, state, TODAY)
        assert "new_feature" in new_state.statuses

    def test_unknown_dependency_raises(self):
        features = [_feature("broken", requires_features=["nonexistent"])]
        prog = _prog_state()
        state = build_feature_state(features)
        with pytest.raises(ValueError, match="nonexistent"):
            evaluate_features(features, prog, state, TODAY)

    def test_partial_unlock_does_not_affect_locked_feature(self):
        features = [
            _feature("a", requires_nodes=[("n1", "mastered"), ("n2", "mastered")]),
        ]
        prog = _prog_state(n1="mastered", n2="locked")
        state = build_feature_state(features)
        new_state, events = evaluate_features(features, prog, state, TODAY)
        assert new_state.statuses["a"] == "locked"
        assert events == ()


# ---------------------------------------------------------------------------
# unlocked_features
# ---------------------------------------------------------------------------


class TestUnlockedFeatures:
    def test_empty_state_returns_empty(self):
        assert unlocked_features(_feat_state()) == frozenset()

    def test_locked_only_returns_empty(self):
        state = _feat_state(a="locked", b="locked")
        assert unlocked_features(state) == frozenset()

    def test_returns_only_unlocked(self):
        state = _feat_state(a="unlocked", b="locked", c="unlocked")
        assert unlocked_features(state) == {"a", "c"}

    def test_all_unlocked(self):
        state = _feat_state(a="unlocked", b="unlocked")
        assert unlocked_features(state) == {"a", "b"}


# ---------------------------------------------------------------------------
# JPLEARN_FEATURES catalog — integrity
# ---------------------------------------------------------------------------


class TestJPLearnCatalog:
    EXPECTED_FEATURE_IDS = {
        "themes",
        "achievements",
        "listening_mode",
        "conversation_mode",
        "kanji_mode",
        "reading_mode",
        "advanced_analytics",
        "jlpt_dashboard",
        "tutor_chat",
    }

    def test_all_expected_features_present(self):
        ids = {f.feature_id for f in JPLEARN_FEATURES}
        assert ids == self.EXPECTED_FEATURE_IDS

    def test_no_duplicate_feature_ids(self):
        ids = [f.feature_id for f in JPLEARN_FEATURES]
        assert len(ids) == len(set(ids))

    def test_all_dependency_references_are_valid(self):
        known = {f.feature_id for f in JPLEARN_FEATURES}
        for feature in JPLEARN_FEATURES:
            for dep in feature.requirement.feature_dependencies:
                assert dep.feature_id in known, (
                    f"Feature '{feature.feature_id}' depends on unknown "
                    f"'{dep.feature_id}'"
                )

    def test_themes_has_no_requirements(self):
        themes = next(f for f in JPLEARN_FEATURES if f.feature_id == "themes")
        assert themes.requirement.progression_conditions == ()
        assert themes.requirement.feature_dependencies == ()

    def test_achievements_has_no_requirements(self):
        ach = next(f for f in JPLEARN_FEATURES if f.feature_id == "achievements")
        assert ach.requirement.progression_conditions == ()
        assert ach.requirement.feature_dependencies == ()

    def test_listening_requires_hiragana_mastered(self):
        feat = next(f for f in JPLEARN_FEATURES if f.feature_id == "listening_mode")
        conds = feat.requirement.progression_conditions
        assert any(c.node_id == "hiragana" and c.required_status == "mastered" for c in conds)

    def test_conversation_requires_grammar_mastered(self):
        feat = next(f for f in JPLEARN_FEATURES if f.feature_id == "conversation_mode")
        conds = feat.requirement.progression_conditions
        assert any(c.node_id == "grammar_n5" and c.required_status == "mastered" for c in conds)

    def test_kanji_requires_vocab_and_grammar(self):
        feat = next(f for f in JPLEARN_FEATURES if f.feature_id == "kanji_mode")
        node_ids = {c.node_id for c in feat.requirement.progression_conditions}
        assert "vocabulary_n5" in node_ids
        assert "grammar_n5" in node_ids

    def test_tutor_chat_requires_conversation_mode(self):
        feat = next(f for f in JPLEARN_FEATURES if f.feature_id == "tutor_chat")
        deps = {d.feature_id for d in feat.requirement.feature_dependencies}
        assert "conversation_mode" in deps
        assert feat.requirement.progression_conditions == ()

    def test_all_features_have_access_descriptor(self):
        for feat in JPLEARN_FEATURES:
            assert feat.unlock.access_descriptor, (
                f"Feature '{feat.feature_id}' has no access_descriptor"
            )

    def test_tier1_features_unlock_with_empty_progression(self):
        """Themes and achievements unlock immediately with no progression."""
        tier1 = [f for f in JPLEARN_FEATURES if not f.requirement.progression_conditions
                 and not f.requirement.feature_dependencies]
        assert len(tier1) >= 2
        prog = _prog_state()
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, events = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        for feat in tier1:
            assert new_state.statuses[feat.feature_id] == "unlocked"

    def test_conversation_mastery_cascade_unlocks_tutor_chat(self):
        """Mastering grammar_n5 → conversation_mode unlocked → tutor_chat unlocked."""
        prog = _prog_state(grammar_n5="mastered", vocabulary_n5="mastered")
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, events = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        assert new_state.statuses["conversation_mode"] == "unlocked"
        assert new_state.statuses["tutor_chat"] == "unlocked"
        unlocked_ids = [e.feature_id for e in events]
        assert unlocked_ids.index("conversation_mode") < unlocked_ids.index("tutor_chat")

    def test_kanji_mode_requires_both_conditions(self):
        """Only vocab mastered — kanji_mode must remain locked."""
        prog = _prog_state(vocabulary_n5="mastered", grammar_n5="unlocked")
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, _ = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        assert new_state.statuses["kanji_mode"] == "locked"

    def test_jlpt_dashboard_unlocks_when_vocabulary_n5_unlocked(self):
        prog = _prog_state(vocabulary_n5="unlocked")
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, _ = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        assert new_state.statuses["jlpt_dashboard"] == "unlocked"

    def test_jlpt_dashboard_stays_locked_without_vocabulary_n5(self):
        prog = _prog_state()
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, _ = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        assert new_state.statuses["jlpt_dashboard"] == "locked"

    def test_nothing_beyond_tier1_unlocks_without_progression(self):
        """With no progression, only no-requirement features should unlock."""
        prog = _prog_state()
        state = build_feature_state(JPLEARN_FEATURES)
        new_state, _ = evaluate_features(JPLEARN_FEATURES, prog, state, TODAY)
        locked = {
            fid for fid, status in new_state.statuses.items()
            if status == "locked"
        }
        # At minimum, learning modes (which require progression) must still be locked
        assert "listening_mode" in locked
        assert "conversation_mode" in locked
        assert "kanji_mode" in locked
        assert "tutor_chat" in locked
