"""The Electron slug lists must agree with the Python deck registry (audit 2, F11).

``VALID_DECK_SLUGS`` (``ipc_security.cjs``) is the allowlist every deck IPC call
is checked against; a deck missing from it can never be opened by the app, with
no error beyond a rejected call. ``STARTUP_PRELOAD_DECK_SLUGS`` (``main.cjs``)
is warmed at startup and must only name allowed decks.

The lists live in JavaScript, so they are parsed with a regex over their
single-quoted slugs. A list that cannot be found fails the test rather than
passing on an empty set.
"""

from __future__ import annotations

import re
from pathlib import Path

from domain.decks import ALL_DECKS

_ELECTRON_DIR = Path(__file__).resolve().parents[1] / "electron-frontend" / "electron"

# Robbie decided on 2026-10-27 to keep Conjugation Training hidden for now: the
# deck exists on the Python side but is deliberately not offered by the app.
# Remove it from this set when the deck is exposed.
_HIDDEN_BY_DECISION = {"conjugation_training"}


def _slugs_in(path: Path, name: str, opener: str, closer: str) -> list[str]:
    """Return the single-quoted slugs of ``const <name> = <opener> ... <closer>``."""
    source = path.read_text(encoding="utf-8")
    declaration = re.search(
        rf"const\s+{name}\s*=\s*{re.escape(opener)}(.*?){re.escape(closer)}",
        source,
        re.DOTALL,
    )
    assert declaration, f"{name} not found in {path.name}; was it renamed or moved?"
    # Drop // comments first so a quoted word inside one is not read as a slug.
    body = re.sub(r"//[^\n]*", "", declaration.group(1))
    slugs = re.findall(r"'([^']+)'", body)
    assert slugs, f"{name} in {path.name} parsed as empty; the list format may have changed"
    assert len(slugs) == len(set(slugs)), f"{name} in {path.name} lists a slug twice"
    return slugs


def _valid_deck_slugs() -> set[str]:
    return set(_slugs_in(_ELECTRON_DIR / "ipc_security.cjs", "VALID_DECK_SLUGS", "new Set([", "])"))


def _startup_preload_slugs() -> set[str]:
    return set(_slugs_in(_ELECTRON_DIR / "main.cjs", "STARTUP_PRELOAD_DECK_SLUGS", "[", "]"))


def test_ipc_allowlist_matches_the_python_deck_registry() -> None:
    allowed = _valid_deck_slugs()
    expected = set(ALL_DECKS) - _HIDDEN_BY_DECISION
    assert allowed == expected, (
        f"VALID_DECK_SLUGS (ipc_security.cjs) and ALL_DECKS (domain/decks.py) differ. "
        f"Unopenable decks missing from the allowlist: {sorted(expected - allowed)}; "
        f"allowlisted slugs with no Python deck: {sorted(allowed - expected)}. "
        f"Hidden on purpose: {sorted(_HIDDEN_BY_DECISION)}."
    )


def test_startup_preload_slugs_are_allowed() -> None:
    unknown = _startup_preload_slugs() - _valid_deck_slugs()
    assert not unknown, (
        f"STARTUP_PRELOAD_DECK_SLUGS (main.cjs) names decks that VALID_DECK_SLUGS "
        f"rejects: {sorted(unknown)}"
    )


def test_the_summary_totals_leave_out_exactly_the_hidden_decks() -> None:
    """The Ledger's totals skip the decks the app hides (audit 3, F2); offering one must count it."""
    from scripts.desktop_bridge import _SUMMARY_UNSERVED_SLUGS

    assert set(_SUMMARY_UNSERVED_SLUGS) == _HIDDEN_BY_DECISION
