"""Tests for FSRS optimizer (domain) and optimization data layer."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from data import database
from data.fsrs_optimization import (
    load_review_sequences,
    load_saved_weights,
    reset_saved_weights,
    run_optimization,
    save_weights,
)
from domain.fsrs_optimizer import (
    DEFAULT_WEIGHTS,
    PARAM_BOUNDS,
    CardReviewSequence,
    ReviewLog,
    compute_loss,
    optimize_weights,
)
from domain.scheduler import ReviewState, reset_weights as reset_active_weights


@pytest.fixture(autouse=True)
def _restore_active_weights():
    """Keep this module's weight mutations from leaking into other tests.

    ``save_weights`` and ``run_optimization`` install their weights as the
    scheduler's module-global active set, so without this any later test that
    depends on the default FSRS weights sees whatever this file left behind.
    """
    yield
    reset_active_weights()


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test-fsrs.db")
    database.init_db()


# ── Domain tests ────────────────────────────────────────────────────────


class TestComputeLoss:
    def test_loss_positive_for_realistic_data(self) -> None:
        seq = CardReviewSequence(
            card_id=1,
            deck="test",
            logs=[
                ReviewLog(quality=4, elapsed_days=0),
                ReviewLog(quality=4, elapsed_days=1),
                ReviewLog(quality=3, elapsed_days=2),
            ],
        )
        loss = compute_loss(DEFAULT_WEIGHTS, [seq])
        assert loss > 0.0

    def test_loss_zero_for_empty_sequences(self) -> None:
        assert compute_loss(DEFAULT_WEIGHTS, []) == 0.0

    def test_loss_skips_first_review_no_prior_state(self) -> None:
        seq = CardReviewSequence(
            card_id=1, deck="test", logs=[ReviewLog(quality=4, elapsed_days=0)]
        )
        loss = compute_loss(DEFAULT_WEIGHTS, [seq])
        assert loss == 0.0

    def test_again_rating_correctly_counts_as_forgotten(self) -> None:
        """quality >= 3 maps to recalled (rating > 1), quality < 3 maps to forgotten."""
        recalled = CardReviewSequence(
            card_id=1, deck="test",
            logs=[ReviewLog(quality=4, elapsed_days=0), ReviewLog(quality=5, elapsed_days=1)],
        )
        forgotten = CardReviewSequence(
            card_id=2, deck="test",
            logs=[ReviewLog(quality=4, elapsed_days=0), ReviewLog(quality=0, elapsed_days=1)],
        )
        # Recalled at short interval = predicted R is high → low loss
        # Forgotten at short interval = predicted R is high → high loss
        loss_recalled = compute_loss(DEFAULT_WEIGHTS, [recalled])
        loss_forgotten = compute_loss(DEFAULT_WEIGHTS, [forgotten])
        assert loss_forgotten > loss_recalled


class TestOptimizeWeights:
    def test_optimizer_reduces_loss(self) -> None:
        seq = CardReviewSequence(
            card_id=1,
            deck="test",
            logs=[
                ReviewLog(quality=4, elapsed_days=0),
                ReviewLog(quality=4, elapsed_days=1),
                ReviewLog(quality=4, elapsed_days=2),
                ReviewLog(quality=3, elapsed_days=5),
                ReviewLog(quality=4, elapsed_days=10),
            ],
        )
        loss_before = compute_loss(DEFAULT_WEIGHTS, [seq])
        optimized = optimize_weights(DEFAULT_WEIGHTS, [seq], iterations=200, learning_rate=0.05)
        loss_after = compute_loss(optimized, [seq])
        assert loss_after <= loss_before + 0.01  # should not get worse

    def test_optimizer_respects_parameter_bounds(self) -> None:
        seq = CardReviewSequence(
            card_id=1,
            deck="test",
            logs=[
                ReviewLog(quality=4, elapsed_days=0),
                ReviewLog(quality=4, elapsed_days=1),
            ],
        )
        result = optimize_weights(DEFAULT_WEIGHTS, [seq], iterations=10)
        assert len(result) == 17
        for i, (low, high) in enumerate(PARAM_BOUNDS):
            assert low <= result[i] <= high, f"w[{i}] = {result[i]} out of [{low}, {high}]"

    def test_optimizer_returns_valid_weights_without_data(self) -> None:
        """With no sequences, the result should still be 17 valid bounded weights."""
        result = optimize_weights(DEFAULT_WEIGHTS, [], iterations=10)
        assert len(result) == 17
        for i, (low, high) in enumerate(PARAM_BOUNDS):
            assert low <= result[i] <= high, f"w[{i}] = {result[i]} out of [{low}, {high}]"


# ── Data-layer tests ─────────────────────────────────────────────────────


class TestLoadReviewSequences:
    def test_returns_empty_when_no_data(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        assert load_review_sequences() == []

    def test_returns_empty_when_only_one_review_per_card(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review(
            "Hiragana", 1, 4,
            reviewed_on=date(2026, 7, 1),
            reviewed_at_utc="2026-07-01T12:00:00+00:00",
            script_tag="hiragana", prompt_text="あ",
        )
        assert load_review_sequences() == []

    def test_returns_sequences_when_multiple_reviews(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review(
            "Hiragana", 1, 4,
            reviewed_on=date(2026, 7, 1),
            reviewed_at_utc="2026-07-01T12:00:00+00:00",
            script_tag="hiragana", prompt_text="あ",
        )
        database.log_review(
            "Hiragana", 1, 4,
            reviewed_on=date(2026, 7, 3),
            reviewed_at_utc="2026-07-03T12:00:00+00:00",
            script_tag="hiragana", prompt_text="あ",
        )
        database.log_review(
            "Hiragana", 2, 4,
            reviewed_on=date(2026, 7, 1),
            reviewed_at_utc="2026-07-01T12:00:00+00:00",
            script_tag="hiragana", prompt_text="い",
        )
        database.log_review(
            "Hiragana", 2, 2,
            reviewed_on=date(2026, 7, 5),
            reviewed_at_utc="2026-07-05T12:00:00+00:00",
            script_tag="hiragana", prompt_text="い",
        )

        seqs = load_review_sequences()
        assert len(seqs) == 2
        for seq in seqs:
            assert len(seq["logs"]) == 2
            assert seq["logs"][0]["elapsed_days"] == 0
            assert seq["logs"][1]["elapsed_days"] > 0

    def test_computes_elapsed_days_correctly(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review(
            "Hiragana", 1, 4,
            reviewed_on=date(2026, 7, 1),
            reviewed_at_utc="2026-07-01T12:00:00+00:00",
            script_tag="hiragana", prompt_text="あ",
        )
        database.log_review(
            "Hiragana", 1, 3,
            reviewed_on=date(2026, 7, 6),
            reviewed_at_utc="2026-07-06T12:00:00+00:00",
            script_tag="hiragana", prompt_text="あ",
        )

        seqs = load_review_sequences()
        assert len(seqs) == 1
        assert seqs[0]["logs"][0]["elapsed_days"] == 0
        assert seqs[0]["logs"][1]["elapsed_days"] == 5


class TestSaveLoadWeights:
    def test_round_trip(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        custom = tuple(round(0.5 + i * 0.1, 6) for i in range(17))
        save_weights(custom)
        loaded = load_saved_weights()
        assert loaded is not None
        assert len(loaded) == 17
        assert loaded == custom

    def test_load_returns_none_when_not_saved(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        assert load_saved_weights() is None

    def test_load_returns_none_for_malformed_data(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        from data.settings_repository import set_setting
        set_setting("fsrs_weights", "not,enough,values")
        assert load_saved_weights() is None

    def test_reset_clears_saved_weights(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        custom = tuple(0.5 for _ in range(17))
        save_weights(custom)
        assert load_saved_weights() is not None
        reset_saved_weights()
        assert load_saved_weights() is None


class TestRunOptimization:
    def test_returns_none_when_insufficient_data(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        assert run_optimization() is None

    def test_returns_summary_when_enough_data(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)

        for card_id in range(1, 6):
            for day_offset, quality in enumerate([4, 4, 3, 4], start=1):
                database.log_review(
                    "Hiragana", card_id, quality,
                    reviewed_on=date(2026, 7, day_offset),
                    reviewed_at_utc=f"2026-07-{day_offset:02d}T12:00:00+00:00",
                    script_tag="hiragana", prompt_text="あ",
                )

        result = run_optimization(iterations=50, learning_rate=0.05)
        assert result is not None
        assert "previous_weights" in result
        assert "new_weights" in result
        assert "loss_before" in result
        assert "loss_after" in result
        assert result["log_count"] > 0
        assert result["card_count"] == 5
        # Optimized weights should be at least as good
        assert result["loss_after"] <= result["loss_before"] + 0.01

        # Verify they were persisted
        saved = load_saved_weights()
        assert saved is not None
        assert len(saved) == 17

    def test_seeds_different_decks(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)

        for card_id in range(1, 4):
            for day_offset, quality in enumerate([4, 4, 3, 4, 5], start=1):
                database.log_review(
                    "Hiragana", card_id, quality,
                    reviewed_on=date(2026, 7, day_offset),
                    reviewed_at_utc=f"2026-07-{day_offset:02d}T12:00:00+00:00",
                    script_tag="hiragana", prompt_text="あ",
                )
            for day_offset, quality in enumerate([4, 2, 4, 3], start=1):
                database.log_review(
                    "Katakana", card_id, quality,
                    reviewed_on=date(2026, 7, day_offset),
                    reviewed_at_utc=f"2026-07-{day_offset:02d}T12:00:00+00:00",
                    script_tag="katakana", prompt_text="カ",
                )

        result = run_optimization(iterations=50, learning_rate=0.05)
        assert result is not None
        assert result["card_count"] == 6  # 3 Hiragana + 3 Katakana
