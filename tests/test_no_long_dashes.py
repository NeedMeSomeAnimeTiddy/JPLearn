"""No em or en dashes in anything the app shows (Robbie, 2026-10-29).

The Python half of ``electron-frontend/src/lib/noLongDashes.test.ts``: every string literal in
``domain/`` and ``data/`` that is not a docstring, and every line of ``data/external_sources/*.csv``,
must be free of U+2013 and U+2014. Block names, drill hints and deck meanings reach the screen from
here. Copy is reworded with a comma, colon, full stop or brackets; ranges take a hyphen; an empty
value is the Japanese dash ― (U+2015). Comments are not literals, so they are never read.
"""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LONG_DASHES = ("–", "—")

# Literals that match dashes, or never reach the app. A one-character ``text`` must equal the
# literal; a longer one is a piece of it, so an entry follows its line when the file changes.
ALLOWED: tuple[tuple[str, str, str], ...] = (
    ("data/text_normalization.py", "–",
     "_PROLONGED_SOUND_VARIANTS: folds an en dash typed in Japanese to the long vowel mark"),
    ("data/text_normalization.py", "—",
     "_PROLONGED_SOUND_VARIANTS: folds an em dash typed in Japanese to the long vowel mark"),
    ("data/dictionary_repository.py", "‒–—―",
     "_normalize_kanji_reading_for_match: strips dash variants from a reading before matching"),
    ("data/category_identity_migration.py", "Left alone — ",
     "format_report: printed by scripts/migrate_category_identity.py in a terminal, never the app"),
    ("domain/decks.py", "before importing more rows — ",
     "a developer error raised when a deck outgrows its reserved card ids"),
    ("domain/decks.py", "in domain/decks.py — overflowing",
     "a developer error raised when a category outgrows its reserved card ids"),
)


def _docstring_nodes(tree: ast.AST) -> set[int]:
    found: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                found.add(id(first.value))
    return found


def find_long_dashes(source: str) -> list[tuple[int, str]]:
    """(line, value) for every non-docstring string literal in *source* that holds a long dash."""
    if not any(dash in source for dash in LONG_DASHES):
        return []
    tree = ast.parse(source)
    docstrings = _docstring_nodes(tree)
    hits = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and id(node) not in docstrings
            and any(dash in node.value for dash in LONG_DASHES)
        ):
            hits.append((node.lineno, node.value))
    return sorted(hits)


def find_long_dashes_in_lines(text: str) -> list[tuple[int, str]]:
    return [(n, line) for n, line in enumerate(text.splitlines(), 1) if any(d in line for d in LONG_DASHES)]


def _allowed(file: str, value: str) -> tuple[str, str, str] | None:
    for entry in ALLOWED:
        path, text, _reason = entry
        if path == file and (value == text if len(text) == 1 else text in value):
            return entry
    return None


def test_a_planted_dash_is_caught_and_docstrings_and_comments_are_not() -> None:
    planted = (
        '"""Module docstring — not shown."""\n'
        "# a comment — not a literal\n"
        "NAME = 'Hello — world'\n"
        "def f(n):\n"
        '    """Function docstring – not shown."""\n'
        "    return f'Sentences {n}–{n + 1}'\n"
    )
    assert [line for line, _ in find_long_dashes(planted)] == [3, 6]
    assert find_long_dashes(planted.replace("—", "―").replace("–", "-")) == []
    assert find_long_dashes_in_lines("character,romaji,meaning\n〜へ,e,Direction — toward\n") == [
        (2, "〜へ,e,Direction — toward")
    ]


def test_no_long_dashes_outside_the_allowlist() -> None:
    used: set[tuple[str, str, str]] = set()
    offenders: list[str] = []
    for folder in ("domain", "data"):
        for path in sorted((ROOT / folder).rglob("*.py")):
            file = path.relative_to(ROOT).as_posix()
            for line, value in find_long_dashes(path.read_text(encoding="utf-8")):
                entry = _allowed(file, value)
                if entry:
                    used.add(entry)
                else:
                    offenders.append(f"{file}:{line}  {value[:120]!r}")
    for path in sorted((ROOT / "data" / "external_sources").glob("*.csv")):
        file = path.relative_to(ROOT).as_posix()
        for line, text in find_long_dashes_in_lines(path.read_text(encoding="utf-8")):
            offenders.append(f"{file}:{line}  {text[:120]!r}")
    assert offenders == []
    # an entry nothing matches any more is stale and would quietly let a new dash through
    assert [f"{entry[0]}: {entry[1]!r}" for entry in ALLOWED if entry not in used] == []
