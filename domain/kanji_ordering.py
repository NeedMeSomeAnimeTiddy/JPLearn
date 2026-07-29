"""Order kanji so a character follows the components it is built from.

The generated part of each kanji level deck ran in raw deck order, so a character
could arrive before the parts it is built from. Ordering by components gives the
sequence a reason: you meet 日 and 月 before 明.

This orders; it does not name. KRADFILE decomposes visually, and the components
that are statistically distinctive within a block (｜, ノ, 儿) are strokes rather
than meanings — naming a block after one describes at best a third of its members.
Block names remain the authored category, or numbering.

Only dependencies *within the set being ordered* count. A component that is not
in the set is treated as already known: it is either a radical the app never
teaches as a card, or a kanji from another JLPT level, and neither can be
required first without reordering the whole curriculum across levels.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence


def order_by_components(
    characters: Sequence[str],
    components: Mapping[str, tuple[str, ...]],
) -> list[str]:
    """Return ``characters`` reordered so components precede what they build.

    A stable topological sort: among the characters whose in-set prerequisites
    are all placed, the one earliest in ``characters`` wins. That keeps the
    deck's curated order wherever the graph does not care, so the result stays
    close to the input rather than being reshuffled arbitrarily.

    Cycles cannot deadlock it. KRADFILE is not guaranteed acyclic, so when no
    character is ready the earliest unplaced one is emitted anyway, breaking the
    cycle at a deterministic point.
    """
    position = {char: index for index, char in enumerate(characters)}
    in_set = set(position)

    # Prerequisites, restricted to the set. Self-references are already stripped
    # by the generator, but a character absent from `components` simply has none.
    pending: dict[str, set[str]] = {
        char: {c for c in components.get(char, ()) if c in in_set and c != char}
        for char in position
    }

    dependents: dict[str, list[str]] = {char: [] for char in position}
    for char, prerequisites in pending.items():
        for prerequisite in prerequisites:
            dependents[prerequisite].append(char)

    ordered: list[str] = []
    remaining = set(position)
    while remaining:
        ready = [char for char in remaining if not pending[char]]
        # No ready character means a cycle; break it at the earliest one.
        candidate = min(ready or remaining, key=lambda char: position[char])
        ordered.append(candidate)
        remaining.discard(candidate)
        for dependent in dependents[candidate]:
            pending[dependent].discard(candidate)

    return ordered


def prerequisites_within(
    characters: Iterable[str],
    components: Mapping[str, tuple[str, ...]],
) -> dict[str, tuple[str, ...]]:
    """The in-set component dependencies the ordering actually acts on.

    Exposed for tests and for reasoning about how much of a deck the graph
    constrains: most kanji share no component with others in their own level, so
    the ordering moves far fewer characters than the corpus size suggests.
    """
    in_set = set(characters)
    return {
        char: tuple(c for c in components.get(char, ()) if c in in_set and c != char)
        for char in in_set
    }
