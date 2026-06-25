from domain.curriculum import clamp_stage, next_stage


def test_clamp_stage_bounds_values() -> None:
    assert clamp_stage(-1) == 1
    assert clamp_stage(1) == 1
    assert clamp_stage(2) == 2
    assert clamp_stage(3) == 3
    assert clamp_stage(9) == 3


def test_next_stage_promotes_and_demotes_deterministically() -> None:
    assert next_stage(1, is_correct=True) == 2
    assert next_stage(2, is_correct=True) == 3
    assert next_stage(3, is_correct=True) == 3
    assert next_stage(3, is_correct=False) == 2
    assert next_stage(2, is_correct=False) == 1
    assert next_stage(1, is_correct=False) == 1