"""Component-aware ordering for the generated part of the kanji decks."""

from __future__ import annotations

import pytest

from domain.kanji_components import KANJI_COMPONENTS
from domain.kanji_ordering import order_by_components, prerequisites_within


class TestOrderByComponents:
    def test_a_component_comes_before_what_it_builds(self) -> None:
        components = {"明": ("日", "月")}
        ordered = order_by_components(["明", "日", "月"], components)

        assert ordered.index("日") < ordered.index("明")
        assert ordered.index("月") < ordered.index("明")

    def test_keeps_input_order_where_the_graph_is_silent(self) -> None:
        """Unconstrained characters must not be reshuffled — the deck order is curated."""
        chars = ["山", "川", "田", "人"]
        assert order_by_components(chars, {}) == chars

    def test_ignores_components_outside_the_set(self) -> None:
        # 亠 is a radical the app never teaches; requiring it would strand 京.
        components = {"京": ("亠", "口", "小")}
        assert order_by_components(["京"], components) == ["京"]

    def test_ignores_a_character_listed_as_its_own_component(self) -> None:
        assert order_by_components(["口", "品"], {"口": ("口",), "品": ("口",)}) == ["口", "品"]

    def test_transitive_chains_resolve_in_depth_order(self) -> None:
        components = {"語": ("言", "口"), "言": ("口",)}
        assert order_by_components(["語", "言", "口"], components) == ["口", "言", "語"]

    def test_a_cycle_terminates_instead_of_deadlocking(self) -> None:
        # KRADFILE is not guaranteed acyclic, so this must not hang or drop cards.
        components = {"甲": ("乙",), "乙": ("甲",)}
        ordered = order_by_components(["甲", "乙"], components)

        assert sorted(ordered) == ["乙", "甲"]

    def test_every_character_survives_exactly_once(self) -> None:
        chars = ["明", "日", "月", "語", "言", "口"]
        components = {"明": ("日", "月"), "語": ("言", "口"), "言": ("口",)}
        ordered = order_by_components(chars, components)

        assert sorted(ordered) == sorted(chars)

    def test_is_deterministic_across_runs(self) -> None:
        chars = ["語", "明", "言", "日", "口", "月"]
        components = {"明": ("日", "月"), "語": ("言", "口"), "言": ("口",)}

        assert order_by_components(chars, components) == order_by_components(chars, components)

    @pytest.mark.parametrize("chars", [[], ["日"]])
    def test_handles_trivial_input(self, chars: list[str]) -> None:
        assert order_by_components(chars, KANJI_COMPONENTS) == chars


class TestPrerequisitesWithin:
    def test_keeps_only_in_set_dependencies(self) -> None:
        result = prerequisites_within(["京"], {"京": ("亠", "口", "小")})
        assert result == {"京": ()}

    def test_reports_the_edges_the_ordering_acts_on(self) -> None:
        result = prerequisites_within(["語", "口"], {"語": ("言", "口")})
        assert result["語"] == ("口",)


class TestGeneratedData:
    def test_every_taught_kanji_has_a_component_entry(self) -> None:
        from domain.decks import ALL_DECKS

        for slug in ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1"):
            for card in ALL_DECKS[slug]().cards:
                assert card.character in KANJI_COMPONENTS, f"{card.character} missing from the generated map"

    def test_no_character_lists_itself(self) -> None:
        """The generator strips self-references; without that the sort stalls."""
        for char, parts in KANJI_COMPONENTS.items():
            assert char not in parts
