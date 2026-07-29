"""Generate ``domain/kanji_components.py`` from the EDRDG KRADFILE.

``domain/blocks.py`` orders the generated part of each kanji level deck so a
character follows the components it is built from. That needs a kanji → components
map, and ``domain/`` is pure — it cannot read a JSON file at import time — so the
map is baked into a checked-in module here, the same way
``domain/external_deck_data.py`` works.

The source file ships with the *optional* offline dictionary download
(``scripts/get_offline_dictionary.py``), which is gitignored. That is why the
generated module is committed rather than built at install time: the ordering has
to work for a user who never downloads the dictionary.

Usage:
    python scripts/generate_kanji_components.py
    python scripts/generate_kanji_components.py --check    # exit 1 on drift
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from domain.decks import ALL_DECKS  # noqa: E402

DICTIONARY_DIR = REPO_ROOT / "data" / "external_sources" / "offline_dictionary"
KRADFILE = DICTIONARY_DIR / "kradfile-3.6.2.json"
OUTPUT = REPO_ROOT / "domain" / "kanji_components.py"

KANJI_SLUGS: tuple[str, ...] = ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1")


def deck_characters() -> list[str]:
    """Every kanji the app teaches, deck order, deduplicated."""
    seen: dict[str, None] = {}
    for slug in KANJI_SLUGS:
        for card in ALL_DECKS[slug]().cards:
            seen.setdefault(card.character, None)
    return list(seen)


def load_components(characters: list[str]) -> dict[str, tuple[str, ...]]:
    """Map each deck kanji to its KRADFILE components, minus itself.

    A kanji is listed as its own component when it is also a radical (口, 女).
    Keeping that would make every such character depend on itself and stall the
    topological sort, so it is dropped here rather than guarded against later.
    """
    payload = json.loads(KRADFILE.read_text(encoding="utf-8"))
    krad = payload["kanji"]
    missing = [char for char in characters if char not in krad]
    if missing:
        raise ValueError(f"KRADFILE {payload['version']} is missing {len(missing)} deck kanji: {''.join(missing[:20])}")
    return {char: tuple(c for c in krad[char] if c != char) for char in characters}


def render(components: dict[str, tuple[str, ...]]) -> str:
    lines = [
        '"""Auto-generated kanji component data. Do not edit by hand."""',
        "",
        "# Generated from: data/external_sources/offline_dictionary/kradfile-3.6.2.json",
        "# Regenerate with: python scripts/generate_kanji_components.py",
        "",
        "# Visual components of every kanji the app teaches, from the EDRDG KRADFILE.",
        "# A character never lists itself, so the map is safe to sort topologically.",
        "KANJI_COMPONENTS: dict[str, tuple[str, ...]] = {",
    ]
    for char, parts in components.items():
        rendered = ", ".join(f"'{p}'" for p in parts)
        suffix = "," if len(parts) == 1 else ""
        lines.append(f"    '{char}': ({rendered}{suffix}),")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    check_mode = "--check" in sys.argv

    if not KRADFILE.exists():
        # The source is an optional download and the output is committed, so a
        # drift check on a machine without it has nothing to compare and must not
        # fail the aggregate run.
        if check_mode:
            print(f"skipped: {KRADFILE.relative_to(REPO_ROOT)} is not downloaded.")
            return 0
        print(f"error: {KRADFILE.relative_to(REPO_ROOT)} is missing.")
        print("Run: python scripts/get_offline_dictionary.py")
        return 1

    characters = deck_characters()
    components = load_components(characters)
    used = {part for parts in components.values() for part in parts}
    rendered = render(components)

    if check_mode:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != rendered:
            print(f"error: {OUTPUT.relative_to(REPO_ROOT)} is out of date.")
            print("Run: python scripts/generate_kanji_components.py")
            return 1
        print(f"ok: {OUTPUT.relative_to(REPO_ROOT)} is up to date.")
        return 0

    OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(REPO_ROOT)}")
    print(f"  {len(components)} kanji, {len(used)} distinct components")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
