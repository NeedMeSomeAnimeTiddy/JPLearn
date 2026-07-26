"""The generated renderer eligibility index must match the live classifier."""

from __future__ import annotations

from scripts.generate_conjugation_index import (
    OUTPUT_FILE,
    collect_drillable_words,
    render,
)


def test_generated_index_is_not_stale() -> None:
    """Adding or changing deck content without regenerating would silently
    offer the drill on words it cannot build, or hide ones it can."""
    assert OUTPUT_FILE.exists(), "run python scripts/generate_conjugation_index.py"
    assert OUTPUT_FILE.read_text(encoding="utf-8") == render(collect_drillable_words())


def test_index_excludes_the_i_final_non_adjectives() -> None:
    words = set(collect_drillable_words())
    assert "おやすみなさい" not in words
    assert "ごめんなさい" not in words


def test_index_covers_the_obvious_verbs_and_adjectives() -> None:
    words = set(collect_drillable_words())
    for word in ("会う", "食べる", "読む", "高い"):
        assert word in words, word
