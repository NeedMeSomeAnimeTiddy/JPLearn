"""Onboarding after the setup wizard (audit 11, F7 and the design critic's M5).

The wizard runs whenever the downloads folder has no first-run marker, which also happens to a
learner who removed their downloads or moved to a new PC with their progress. Robbie: "Setup yes,
onboarding no" -- such a learner is not asked the onboarding questions again.
"""

from __future__ import annotations

from datetime import date

import pytest

from data import database
from data.settings_repository import get_setting, set_setting
from domain.scheduler import ReviewState
from scripts import desktop_bridge


@pytest.fixture(autouse=True)
def _schema() -> None:
    database.init_db()


def _mark() -> str | None:
    desktop_bridge.mark_onboarding_pending_handler()
    return get_setting("onboarding_complete")


def test_a_new_learner_is_asked() -> None:
    assert _mark() == "0"


def test_a_learner_with_reviews_is_not_asked_again() -> None:
    database.log_review("Hiragana", 1, 4, reviewed_on=date(2026, 10, 2), reviewed_at_utc="2026-10-02T08:00:00+00:00", script_tag="hiragana", prompt_text="あ")
    assert _mark() == "1"


def test_saved_schedules_without_reviews_count_as_history() -> None:
    # Expertise seeding saves schedules without logging a review.
    database.save_state("Hiragana", ReviewState(card_id=3, repetitions=2, interval=6, next_review=date(2026, 11, 1)))
    assert _mark() == "1"


def test_a_finished_onboarding_is_never_reset() -> None:
    set_setting("onboarding_complete", "1")
    assert _mark() == "1"


def test_a_pending_onboarding_with_history_is_finished() -> None:
    set_setting("onboarding_complete", "0")
    database.save_state("Hiragana", ReviewState(card_id=3, repetitions=2, interval=6, next_review=date(2026, 11, 1)))
    assert _mark() == "1"


def test_the_bridge_command_answers_with_the_status() -> None:
    code, payload = desktop_bridge._cmd_mark_onboarding_pending(["mark-onboarding-pending"])
    assert code == 0 and payload["onboarding_complete"] is False
