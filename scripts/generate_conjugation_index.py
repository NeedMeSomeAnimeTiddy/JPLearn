"""Generate the renderer's exact conjugation-drill eligibility index.

The renderer needs to know, synchronously, whether a card can be conjugated —
to gate the mode when a block contains no eligible cards, and to pick the
session's card pool from the ones that can actually produce a round. A
spelling heuristic gets that wrong in exactly the cases that hurt most
(おやすみなさい and ごめんなさい end in い but are not adjectives, and a small
themed block is *all* edge cases), and asking the tokenizer over the bridge
would make a synchronous render path async.

The built-in decks are static, so eligibility is precomputed here instead and
shipped as a generated set. Run after changing deck content:

    python scripts/generate_conjugation_index.py
    python scripts/generate_conjugation_index.py --check   # drift detection
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.conjugation_drill import classify_word  # noqa: E402
from domain.decks import ALL_DECKS  # noqa: E402

OUTPUT_FILE = (
    PROJECT_ROOT / "electron-frontend" / "src" / "generated" / "conjugationIndex.ts"
)

#: Decks the drill is offered against. Sentence decks hold whole sentences and
#: kana/kanji decks hold single characters — neither is a dictionary-form word.
SOURCE_DECK_PREFIXES = ("vocab_",)


def collect_drillable_words() -> list[str]:
    """Return every dictionary-form word the drill can build a round from."""
    words: set[str] = set()
    for slug, factory in ALL_DECKS.items():
        if not slug.startswith(SOURCE_DECK_PREFIXES):
            continue
        for card in factory().cards:
            character = card.character.strip()
            if not character or character in words:
                continue
            if classify_word(character) is not None:
                words.add(character)
    return sorted(words)


def render(words: list[str]) -> str:
    entries = "\n".join(f"  '{word}'," for word in words)
    return (
        "// AUTO-GENERATED — do not edit manually.\n"
        "// Run: python scripts/generate_conjugation_index.py\n"
        "//\n"
        "// Every built-in vocabulary word the conjugation drill can inflect, as\n"
        "// decided by the same tokenizer-backed classifier the bridge uses. Kept\n"
        "// as generated data so the renderer can gate the mode and build its card\n"
        "// pool synchronously, without guessing from spelling.\n"
        "\n"
        "const DRILLABLE_WORDS: readonly string[] = [\n"
        f"{entries}\n"
        "]\n"
        "\n"
        "export const CONJUGATION_DRILLABLE_WORDS: ReadonlySet<string> = new Set(DRILLABLE_WORDS)\n"
    )


def main(argv: list[str]) -> int:
    words = collect_drillable_words()
    rendered = render(words)

    if "--check" in argv:
        if not OUTPUT_FILE.exists():
            print(f"FAIL  {OUTPUT_FILE} does not exist — run without --check")
            return 1
        if OUTPUT_FILE.read_text(encoding="utf-8") != rendered:
            print(f"FAIL  {OUTPUT_FILE} is stale — run without --check")
            return 1
        print(f"OK    {OUTPUT_FILE.name} is up to date ({len(words)} words)")
        return 0

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(rendered, encoding="utf-8")
    print(f"OK    Written {OUTPUT_FILE.name} ({len(words)} words)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
