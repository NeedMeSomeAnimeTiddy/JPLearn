"""`fsrs-reload-weights` re-reads saved weights into the long-lived bridge worker."""

from __future__ import annotations

import pytest

from data.database import init_db
from data.fsrs_optimization import reset_saved_weights, save_weights
from domain import scheduler
from domain.fsrs_optimizer import DEFAULT_WEIGHTS
from scripts import desktop_bridge

_CUSTOM = tuple(round(w + 0.1, 6) for w in DEFAULT_WEIGHTS)


@pytest.fixture(autouse=True)
def _restore_scheduler_weights():
    before = scheduler.get_weights()
    yield
    scheduler.set_weights(before)


def _simulate_optimize_in_other_process() -> None:
    """Save weights as the one-shot `fsrs-optimize` process does, then drop the
    in-memory activation so only the persisted copy differs from this worker."""
    save_weights(_CUSTOM)
    scheduler.reset_weights()


def test_reload_activates_weights_saved_by_another_process() -> None:
    init_db()
    _simulate_optimize_in_other_process()
    assert scheduler.get_weights() != _CUSTOM

    code, payload = desktop_bridge._COMMAND_HANDLERS["fsrs-reload-weights"]([])

    assert code == 0
    assert payload == {"ok": True, "is_custom": True}
    assert scheduler.get_weights() == _CUSTOM


def test_reload_reverts_to_defaults_when_nothing_is_saved() -> None:
    init_db()
    save_weights(_CUSTOM)
    reset_saved_weights()
    scheduler.set_weights(_CUSTOM)

    code, payload = desktop_bridge._COMMAND_HANDLERS["fsrs-reload-weights"]([])

    assert code == 0
    assert payload == {"ok": True, "is_custom": False}
    assert scheduler.get_weights() == DEFAULT_WEIGHTS


def test_reload_reports_failure_instead_of_swallowing_it(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom():
        raise RuntimeError("settings unreadable")

    monkeypatch.setattr(desktop_bridge, "load_fsrs_weights", boom)
    scheduler.set_weights(_CUSTOM)

    code, payload = desktop_bridge._COMMAND_HANDLERS["fsrs-reload-weights"]([])

    assert code == 2
    assert "settings unreadable" in payload["error"]
    assert scheduler.get_weights() == _CUSTOM
