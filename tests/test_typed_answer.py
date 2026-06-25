from domain.answer_check import assess_typed_answer


def test_assess_typed_answer_exact_after_normalization() -> None:
    result = assess_typed_answer("shi", " ShI ")
    assert result.state == "exact"


def test_assess_typed_answer_exact_ignores_punctuation_and_spacing() -> None:
    result = assess_typed_answer("kyo-u", "kyo u")
    assert result.state == "exact"


def test_assess_typed_answer_near_miss_single_edit() -> None:
    result = assess_typed_answer("sakura", "sakur")
    assert result.state == "near_miss"


def test_assess_typed_answer_near_miss_transposition() -> None:
    result = assess_typed_answer("kana", "knaa")
    assert result.state == "near_miss"


def test_assess_typed_answer_incorrect_for_far_input() -> None:
    result = assess_typed_answer("arigatou", "neko")
    assert result.state == "incorrect"
