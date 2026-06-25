"""Deterministic typed-answer assessment helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
import unicodedata

AnswerState = Literal["exact", "near_miss", "incorrect"]


@dataclass(frozen=True)
class TypedAnswerAssessment:
    state: AnswerState
    normalized_expected: str
    normalized_given: str


def _normalize_typed_text(text: str) -> str:
    lowered = unicodedata.normalize("NFKC", text).lower().strip()
    return "".join(ch for ch in lowered if ch.isalnum())


def _is_transposition(a: str, b: str) -> bool:
    if len(a) != len(b):
        return False
    diffs: list[int] = [index for index, (left, right) in enumerate(zip(a, b)) if left != right]
    if len(diffs) != 2:
        return False
    i, j = diffs
    return a[i] == b[j] and a[j] == b[i]


def _levenshtein_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)

    previous_row = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current_row = [i]
        for j, right_char in enumerate(right, start=1):
            substitution_cost = 0 if left_char == right_char else 1
            current_row.append(
                min(
                    previous_row[j] + 1,
                    current_row[j - 1] + 1,
                    previous_row[j - 1] + substitution_cost,
                )
            )
        previous_row = current_row
    return previous_row[-1]


def assess_typed_answer(expected: str, given: str) -> TypedAnswerAssessment:
    normalized_expected = _normalize_typed_text(expected)
    normalized_given = _normalize_typed_text(given)

    if not normalized_expected or not normalized_given:
        return TypedAnswerAssessment(
            state="incorrect",
            normalized_expected=normalized_expected,
            normalized_given=normalized_given,
        )
    if normalized_expected == normalized_given:
        return TypedAnswerAssessment(
            state="exact",
            normalized_expected=normalized_expected,
            normalized_given=normalized_given,
        )

    distance = _levenshtein_distance(normalized_expected, normalized_given)
    min_length = min(len(normalized_expected), len(normalized_given))
    near_miss = (
        distance <= 1
        or _is_transposition(normalized_expected, normalized_given)
        or (distance == 2 and min_length >= 6)
    )

    return TypedAnswerAssessment(
        state="near_miss" if near_miss else "incorrect",
        normalized_expected=normalized_expected,
        normalized_given=normalized_given,
    )
