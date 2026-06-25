from domain.cards import Card
from domain.distractors import rank_distractor_ids


def _cards() -> list[Card]:
    return [
        Card(id=1, character="か", romaji="ka", meaning="mosquito", tags=["hiragana"]),
        Card(id=2, character="き", romaji="ki", meaning="tree", tags=["hiragana"]),
        Card(id=3, character="カ", romaji="ka", meaning="car", tags=["katakana"]),
        Card(id=4, character="が", romaji="ga", meaning="moth", tags=["hiragana"]),
        Card(id=5, character="火", romaji="ka", meaning="fire", tags=["kanji", "n5"]),
    ]


def test_rank_distractor_ids_is_deterministic() -> None:
    cards = _cards()
    target = cards[0]
    first = rank_distractor_ids(cards, target, mode="meaning")
    second = rank_distractor_ids(cards, target, mode="meaning")
    assert first == second


def test_rank_distractor_ids_excludes_target_and_is_unique() -> None:
    cards = _cards()
    target = cards[0]
    ranked = rank_distractor_ids(cards, target, mode="character")
    assert target.id not in ranked
    assert len(ranked) == len(set(ranked))


def test_rank_distractor_ids_prefers_same_script_for_character_mode() -> None:
    cards = _cards()
    target = cards[0]
    ranked = rank_distractor_ids(cards, target, mode="character")
    assert ranked[0] in {2, 4}
