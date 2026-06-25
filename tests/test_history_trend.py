from domain.history import classify_review_trend


def test_classify_review_trend_defaults_to_stable_for_short_series() -> None:
    assert classify_review_trend([]) == "stable"
    assert classify_review_trend([1]) == "stable"
    assert classify_review_trend([1, 0]) == "stable"


def test_classify_review_trend_detects_improving_with_prior_window() -> None:
    # Prior 0/3 success, recent 3/3 success
    assert classify_review_trend([0, 0, 0, 1, 1, 1]) == "improving"


def test_classify_review_trend_detects_declining_with_prior_window() -> None:
    # Prior 3/3 success, recent 0/3 success
    assert classify_review_trend([1, 1, 1, 0, 0, 0]) == "declining"


def test_classify_review_trend_detects_stable_with_small_delta() -> None:
    # Prior 2/3, recent 2/3
    assert classify_review_trend([1, 0, 1, 1, 1, 0]) == "stable"


def test_classify_review_trend_uses_recent_only_when_no_prior_window() -> None:
    assert classify_review_trend([1, 1, 1]) == "improving"
    assert classify_review_trend([0, 0, 0]) == "declining"
    assert classify_review_trend([1, 0, 0]) == "stable"
