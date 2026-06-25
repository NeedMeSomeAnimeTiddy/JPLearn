from domain.srs import SRSSettings, SRSState, update_srs


def test_update_srs_default_settings_keep_existing_interval_behaviour() -> None:
    result = update_srs(SRSState(last_interval=10, ease_factor=2.0), performance=4)
    assert result.next_interval == 20
    assert result.new_ease_factor == 2.1


def test_update_srs_higher_target_retention_shortens_intervals() -> None:
    base_state = SRSState(last_interval=12, ease_factor=2.0)
    baseline = update_srs(base_state, performance=4)
    stricter = update_srs(
        base_state,
        performance=4,
        settings=SRSSettings(target_retention=0.95, review_load="normal"),
    )
    assert stricter.next_interval < baseline.next_interval


def test_update_srs_review_load_profiles_scale_interval() -> None:
    base_state = SRSState(last_interval=12, ease_factor=2.0)
    light = update_srs(base_state, performance=4, settings=SRSSettings(review_load="light"))
    normal = update_srs(base_state, performance=4, settings=SRSSettings(review_load="normal"))
    heavy = update_srs(base_state, performance=4, settings=SRSSettings(review_load="heavy"))
    assert light.next_interval > normal.next_interval > heavy.next_interval


def test_update_srs_rejects_invalid_target_retention() -> None:
    try:
        update_srs(
            SRSState(last_interval=10, ease_factor=2.0),
            performance=4,
            settings=SRSSettings(target_retention=0.6, review_load="normal"),
        )
    except ValueError as exc:
        assert "target_retention" in str(exc)
    else:
        raise AssertionError("Expected ValueError for invalid target_retention")
