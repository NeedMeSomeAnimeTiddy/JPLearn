"""Deterministic distractor ranking for multiple-choice prompts."""

from __future__ import annotations

from domain.cards import Card


def _shared_prefix_length(a: str, b: str) -> int:
    count = 0
    for left, right in zip(a, b):
        if left != right:
            break
        count += 1
    return count


def _script_bucket(character: str) -> str:
    if not character:
        return "other"
    point = ord(character[0])
    if 0x3040 <= point <= 0x309F:
        return "hiragana"
    if 0x30A0 <= point <= 0x30FF:
        return "katakana"
    if 0x4E00 <= point <= 0x9FFF:
        return "kanji"
    return "other"


def rank_distractor_ids(cards: list[Card], target: Card, mode: str) -> list[int]:
    """Return candidate card ids ranked best-to-worst for distractor quality."""
    scored: list[tuple[int, int]] = []

    for card in cards:
        if card.id == target.id:
            continue

        score = 0
        shared_tags = len(set(target.tags).intersection(set(card.tags)))
        score += shared_tags * 8

        romaji_prefix = _shared_prefix_length(target.romaji.lower(), card.romaji.lower())
        score += min(romaji_prefix, 3) * 4

        if mode == "meaning":
            meaning_prefix = _shared_prefix_length(target.meaning.lower(), card.meaning.lower())
            score += min(meaning_prefix, 3) * 4
            score -= abs(len(target.meaning) - len(card.meaning))
            if _script_bucket(target.character) == _script_bucket(card.character):
                score += 2
        else:
            if _script_bucket(target.character) == _script_bucket(card.character):
                score += 8
            score -= abs(len(target.character) - len(card.character)) * 2
            if target.meaning[:1].lower() == card.meaning[:1].lower() and target.meaning and card.meaning:
                score += 2

        scored.append((score, card.id))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return [card_id for _, card_id in scored]
