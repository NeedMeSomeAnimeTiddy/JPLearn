from domain.leech import evaluate_leech_state


def test_evaluate_leech_state_requires_full_window() -> None:
    evaluation = evaluate_leech_state([0, 0, 0, 4], window_size=5, fail_threshold=3)
    assert evaluation.attempts_recent == 4
    assert evaluation.failures_recent == 3
    assert evaluation.is_active is False


def test_evaluate_leech_state_activates_when_failure_threshold_hit() -> None:
    evaluation = evaluate_leech_state([0, 1, 2, 4, 4], window_size=5, fail_threshold=3)
    assert evaluation.attempts_recent == 5
    assert evaluation.failures_recent == 3
    assert evaluation.is_active is True


def test_evaluate_leech_state_deactivates_when_failures_drop() -> None:
    evaluation = evaluate_leech_state([4, 4, 4, 2, 4], window_size=5, fail_threshold=3)
    assert evaluation.attempts_recent == 5
    assert evaluation.failures_recent == 1
    assert evaluation.is_active is False
