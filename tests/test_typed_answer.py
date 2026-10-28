import json
from pathlib import Path

import pytest

from domain.answer_check import assess_typed_answer

# The same table electron-frontend/src/lib/answerAssessment.test.ts runs against
# assessTypedAnswer, so the Python copy cannot drift from the renderer's grader.
_CASES_PATH = (
    Path(__file__).resolve().parent.parent
    / "electron-frontend"
    / "src"
    / "lib"
    / "typedAnswerCases.json"
)
_CASES = json.loads(_CASES_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("expected", "given", "state"),
    [(case["expected"], case["given"], case["state"]) for case in _CASES],
)
def test_assess_typed_answer_matches_shared_case_table(expected: str, given: str, state: str) -> None:
    assert assess_typed_answer(expected, given).state == state


def test_short_words_get_no_typo_tolerance() -> None:
    # Robbie's ruling (audit 9): one-letter slips count only on words of 4+ letters.
    assert assess_typed_answer("to go", "do").state == "incorrect"
    assert assess_typed_answer("water", "watr").state == "near_miss"
