"""Curriculum readiness, now derived from the graph rather than declared twice.

`readiness.py` had no tests at all. It also held ``LEARNING_PATHS`` — a second,
flatter model of the same curriculum, carrying one path and free to disagree with
``JPLEARN_GRAPH`` (issue #78 Phase 5, and what #20 asked to extend). These cover
the reduction and the readiness rules it feeds.
"""

from __future__ import annotations

import pytest

from domain.progression import NodeProgressionState, NodeStatus, ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH
from domain.readiness import (
    CURRICULUM_SECTION_ORDER,
    SECTION_TO_NODE,
    build_learning_path_status,
    compute_section_readiness,
    get_suggested_next_step,
)

#: What `LEARNING_PATHS["complete_beginner"]["steps"]` hardcoded before removal.
_LEGACY_STEPS = (
    "hiragana", "katakana", "vocab_n5", "grammar_patterns", "sentence_examples", "kanji_n5",
)


def _state(**statuses: NodeStatus) -> ProgressionState:
    """Build a state where every named node has the given status."""
    return ProgressionState(node_states={
        node_id: NodeProgressionState(
            node_id=node_id,
            status=statuses.get(node_id, "locked"),
            mastered_item_count=10 if statuses.get(node_id) == "mastered" else 0,
            total_item_count=10,
        )
        for node_id in JPLEARN_GRAPH.nodes
    })


def _everything_mastered() -> ProgressionState:
    """A state where every studiable section's node is mastered."""
    mastered: dict[str, NodeStatus] = {node: "mastered" for node in SECTION_TO_NODE.values()}
    return _state(**mastered)


class TestCurriculumOrder:
    def test_matches_the_order_the_hardcoded_path_declared(self) -> None:
        """The reduction must be faithful, not merely plausible."""
        assert CURRICULUM_SECTION_ORDER == _LEGACY_STEPS

    def test_covers_every_studiable_section_exactly_once(self) -> None:
        assert set(CURRICULUM_SECTION_ORDER) == set(SECTION_TO_NODE)
        assert len(CURRICULUM_SECTION_ORDER) == len(set(CURRICULUM_SECTION_ORDER))

    def test_is_derived_from_the_graph_rather_than_a_literal(self) -> None:
        """Every section must correspond to a node the graph actually defines.

        This is what stops the two models drifting: a section whose node is
        renamed or dropped disappears from the curriculum instead of lingering.
        """
        for section in CURRICULUM_SECTION_ORDER:
            assert SECTION_TO_NODE[section] in JPLEARN_GRAPH.nodes


class TestSuggestedNextStep:
    def test_is_the_first_section_on_a_fresh_account(self) -> None:
        assert get_suggested_next_step(_state()) == CURRICULUM_SECTION_ORDER[0]

    def test_advances_past_mastered_sections(self) -> None:
        state = _state(hiragana="mastered", katakana="mastered")
        assert get_suggested_next_step(state) == "vocab_n5"

    def test_is_none_once_everything_is_mastered(self) -> None:
        assert get_suggested_next_step(_everything_mastered()) is None


class TestSectionReadiness:
    def test_a_mastered_section_reads_as_completed(self) -> None:
        assert compute_section_readiness("hiragana", _state(hiragana="mastered")) == "completed"

    def test_an_entry_point_is_always_recommended(self) -> None:
        assert compute_section_readiness("hiragana", _state()) == "recommended"

    def test_all_prerequisites_mastered_reads_as_recommended(self) -> None:
        state = _state(hiragana="mastered")
        assert compute_section_readiness("katakana", state) == "recommended"

    def test_a_started_prerequisite_reads_as_challenging(self) -> None:
        state = _state(hiragana="active")
        assert compute_section_readiness("katakana", state) == "challenging"

    def test_an_untouched_prerequisite_reads_as_advanced(self) -> None:
        assert compute_section_readiness("katakana", _state()) == "advanced"

    @pytest.mark.parametrize("section", _LEGACY_STEPS)
    def test_every_section_produces_a_label(self, section: str) -> None:
        assert compute_section_readiness(section, _state())


class TestLearningPathStatus:
    def test_reports_one_step_per_curriculum_section(self) -> None:
        status = build_learning_path_status(onboarding_complete=True, state=_state())
        assert [step.section_id for step in status.steps] == list(CURRICULUM_SECTION_ORDER)

    def test_promotes_the_suggested_step(self) -> None:
        status = build_learning_path_status(onboarding_complete=True, state=_state())
        suggested = [s for s in status.steps if s.readiness == "suggested_next"]
        assert [s.section_id for s in suggested] == [status.suggested_next]

    def test_never_promotes_a_completed_step(self) -> None:
        status = build_learning_path_status(onboarding_complete=True, state=_everything_mastered())
        assert status.suggested_next is None
        assert all(step.readiness == "completed" for step in status.steps)

    def test_carries_onboarding_state_through(self) -> None:
        assert build_learning_path_status(
            onboarding_complete=False, state=_state(),
        ).onboarding_complete is False

    def test_reports_steps_even_before_onboarding_is_finished(self) -> None:
        """Onboarding is skippable, so it must not blank the curriculum.

        The removed ``path_id`` gate returned an empty step list whenever no
        path had been chosen, which is every learner who skipped onboarding.
        """
        status = build_learning_path_status(onboarding_complete=False, state=_state())
        assert len(status.steps) == len(CURRICULUM_SECTION_ORDER)
