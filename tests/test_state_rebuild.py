"""Tests for rebuilding overwritten review_states rows from the review log."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from data import database
from data.state_rebuild import _load_saved_weights, plan_rebuild, run_rebuild
from domain.review_replay import ReplayedReview, rebuild_review_state
from domain.scheduler import ReviewState, get_weights, reset_weights


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test-rebuild.db")
    database.init_db()


DAY = date(2026, 3, 1)


class TestRebuildReviewState:
    def test_replays_each_review_on_its_recorded_day(self) -> None:
        reviews = [
            ReplayedReview(DAY, 4),
            ReplayedReview(DAY + timedelta(days=2), 4),
            ReplayedReview(DAY + timedelta(days=9), 4),
        ]

        state = rebuild_review_state(1, reviews)

        assert state.card_id == 1
        assert state.last_review == DAY + timedelta(days=9)
        assert state.next_review == state.last_review + timedelta(days=state.interval)
        assert state.repetitions == 3
        assert state.stability > 0

    def test_same_day_drilling_does_not_inflate_the_rebuild(self) -> None:
        drilled = rebuild_review_state(1, [ReplayedReview(DAY, 4) for _ in range(10)])

        assert drilled.repetitions == 1
        assert drilled.interval < 21

    def test_empty_log_gives_an_untouched_state(self) -> None:
        state = rebuild_review_state(5, [])

        assert state.repetitions == 0
        assert state.stability == 0.0

    def test_lapse_history_rebuilds_a_short_interval(self) -> None:
        spaced = rebuild_review_state(1, [
            ReplayedReview(DAY, 4),
            ReplayedReview(DAY + timedelta(days=2), 4),
        ])
        lapsed = rebuild_review_state(2, [
            ReplayedReview(DAY, 4),
            ReplayedReview(DAY + timedelta(days=2), 0),
        ])

        assert lapsed.interval < spaced.interval
        assert lapsed.repetitions == 0


class TestPlanRebuild:
    def _seed_overwritten_row(self, card_id: int, review_days: int) -> None:
        """Log real history, then stamp a synthetic mastered state over it."""
        for offset in range(review_days):
            database.log_review(
                "Hiragana", card_id, 4, reviewed_on=DAY + timedelta(days=offset)
            )
        database.save_state(
            "Hiragana",
            ReviewState(
                card_id=card_id, repetitions=4, interval=38,
                next_review=DAY + timedelta(days=38), last_review=DAY,
            ),
        )

    def test_rebuilds_a_row_whose_state_the_log_does_not_explain(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        self._seed_overwritten_row(1, review_days=2)

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_rebuild(conn)

        assert len(plan.rebuilds) == 1
        rebuild = plan.rebuilds[0]
        assert rebuild.before.repetitions == 4
        assert rebuild.after.repetitions == 2
        assert rebuild.reviews == 2

    def test_skips_rows_the_log_already_explains(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        """A row the app maintained carries the date of its own last review."""
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review("Hiragana", 2, 4, reviewed_on=DAY)
        database.save_state(
            "Hiragana",
            ReviewState(card_id=2, repetitions=1, interval=2, last_review=DAY),
        )

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_rebuild(conn)

        assert plan.rebuilds == []
        assert plan.skipped_explained == 1

    def test_rebuilds_a_seeded_row_whose_repetitions_coincide(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        """Seeding writes repetitions=4, so a card with exactly four successful
        days agrees with its log by coincidence while its interval stays
        synthetic. The last_review gate has to catch it anyway."""
        _use_temp_db(tmp_path, monkeypatch)
        for offset in range(4):
            database.log_review(
                "Hiragana", 7, 4, reviewed_on=DAY + timedelta(days=offset * 3)
            )
        database.save_state(
            "Hiragana",
            ReviewState(
                card_id=7, repetitions=4, interval=38,
                next_review=DAY + timedelta(days=100),
                last_review=DAY + timedelta(days=62),  # seeded, not a review day
            ),
        )

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_rebuild(conn)

        assert len(plan.rebuilds) == 1
        rebuild = plan.rebuilds[0]
        assert rebuild.before.repetitions == rebuild.after.repetitions == 4
        assert rebuild.after.interval != 38
        assert rebuild.after.last_review == DAY + timedelta(days=9)

    def test_skips_rows_with_no_history_to_rebuild_from(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        database.save_state("Hiragana", ReviewState(card_id=3, repetitions=4, interval=38))

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_rebuild(conn)

        assert plan.rebuilds == []
        assert plan.skipped_no_events == 1

    def test_deck_filter_limits_the_plan(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        self._seed_overwritten_row(1, review_days=2)
        for offset in range(2):
            database.log_review("Katakana", 1, 4, reviewed_on=DAY + timedelta(days=offset))
        database.save_state("Katakana", ReviewState(card_id=1, repetitions=4, interval=38))

        with database._connect() as conn:  # type: ignore[attr-defined]
            hiragana_only = plan_rebuild(conn, deck="Hiragana")
            everything = plan_rebuild(conn)

        assert [r.deck for r in hiragana_only.rebuilds] == ["Hiragana"]
        assert len(everything.rebuilds) == 2


class TestSavedWeights:
    def test_replay_uses_saved_weights_and_restores_them(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        """The live app installs saved weights at startup, so a rebuild that
        ignored them would produce state the running app never would."""
        _use_temp_db(tmp_path, monkeypatch)
        reset_weights()
        from data.settings_repository import set_setting

        for offset in range(3):
            database.log_review("Hiragana", 1, 4, reviewed_on=DAY + timedelta(days=offset))
        database.save_state("Hiragana", ReviewState(card_id=1, repetitions=4, interval=38))

        with database._connect() as conn:  # type: ignore[attr-defined]
            default_plan = plan_rebuild(conn)

        # Distinctly different but still valid weights.
        set_setting("fsrs_weights", ",".join(str(0.5 + i * 0.1) for i in range(17)))
        weights_before = get_weights()

        with database._connect() as conn:  # type: ignore[attr-defined]
            custom_plan = plan_rebuild(conn)

        assert custom_plan.rebuilds[0].after.interval != default_plan.rebuilds[0].after.interval
        assert get_weights() == weights_before, "active weights must be restored"

    def test_malformed_saved_weights_fall_back_to_active(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        from data.settings_repository import set_setting

        set_setting("fsrs_weights", "not,enough,values")
        with database._connect() as conn:  # type: ignore[attr-defined]
            assert _load_saved_weights(conn) is None


class TestRunRebuild:
    def _overwritten(self, card_id: int = 1) -> None:
        for offset in range(3):
            database.log_review(
                "Hiragana", card_id, 4, reviewed_on=DAY + timedelta(days=offset)
            )
        database.save_state(
            "Hiragana",
            ReviewState(card_id=card_id, repetitions=4, interval=38, last_review=DAY),
        )

    def test_dry_run_writes_nothing(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        self._overwritten()

        plan = run_rebuild(apply=False)

        assert len(plan.rebuilds) == 1
        assert database.load_states("Hiragana", [1])[1].repetitions == 4
        assert database.load_states("Hiragana", [1])[1].interval == 38

    def test_apply_writes_the_rebuilt_state(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        self._overwritten()

        plan = run_rebuild(apply=True)
        expected = plan.rebuilds[0].after

        stored = database.load_states("Hiragana", [1])[1]
        assert stored.repetitions == expected.repetitions == 3
        assert stored.interval == expected.interval
        assert stored.next_review == expected.next_review
        assert stored.last_review == DAY + timedelta(days=2)
        assert stored.stability == expected.stability

    def test_apply_is_idempotent(self, tmp_path: Path, monkeypatch) -> None:
        """After rebuilding, the row follows from its log, so a second pass
        finds nothing to do."""
        _use_temp_db(tmp_path, monkeypatch)
        self._overwritten()

        run_rebuild(apply=True)
        second = run_rebuild(apply=True)

        assert second.rebuilds == []
        assert second.skipped_explained == 1
