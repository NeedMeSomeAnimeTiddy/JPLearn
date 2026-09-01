"""Teaching order for a vocabulary level that is not chunked into blocks.

Pure data transformation — analogous to :mod:`domain.kanji_ordering`, which does the
same job one level down by ordering kanji so a character follows its components.

WHY THIS EXISTS
---------------
Vocabulary levels stopped being cut into blocks (see ``domain.blocks``), which removed
the only thing that decided what a learner met next. A 2,699-word level still has to be
introduced in *some* order, and the corpus order is not it: the decks arrive in gojūon,
so N5 opens ああ・会う・青・青い・赤・赤い and N1's middle is an unbroken run of しょ
words. Learning the dictionary front to back is not a curriculum.

The two orders the reference apps use are frequency and source-chronology, and this app
has neither — ``_ExternalRow`` is ``(word, reading, meaning)`` and carries no rank. What
it does have is a kanji curriculum and a record of which characters the learner has
actually met, so the order can come from the learner instead of from a corpus:

    a word you can already read comes before a word you cannot.

That is computable from data already in the app, needs no import, and matches what a
learner would do anyway. It also makes the vocabulary and kanji halves cooperate rather
than run in parallel: every kanji block cleared re-sorts the vocabulary that uses it
toward the front.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It does not skip, hide or lock anything. Every card in the deck comes back, every time.
This is a running order, not a gate — the whole point of dropping blocks was to stop
making a sequence into a set of doors.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence

# The CJK ideograph range. Kana and punctuation are not gated on anything, so a word
# written entirely in kana has no unknown characters by construction and sorts to the
# front — which is correct: ともだち is readable before 友達 is.
_KANJI_MIN = 0x4E00
_KANJI_MAX = 0x9FFF

# ---------------------------------------------------------------------------
# How many new words a day
# ---------------------------------------------------------------------------
# The meter that replaced the block gate. A block said "these twenty, then the next
# twenty"; this says "this many today", which is the same pacing decision made once by
# the learner instead of ~137 times by the deck.
#
# TEN, because that is what the reference apps converge on for a learner who also has
# reviews to clear: Anki's own guidance is 15–20 new cards a day for people doing nothing
# else, jpdb declines to cap it at all, and this app is asking for vocabulary ON TOP OF a
# kanji curriculum and a daily game. Ten new words plus their reviews is a session; twenty
# plus everything else is how a backlog starts.
DEFAULT_NEW_PER_DAY = 10

# The floor is zero and it is a real setting, not a disabled one: "no new words today,
# just my reviews" is a thing a learner does deliberately when the backlog is up.
MIN_NEW_PER_DAY = 0
# The ceiling is not a judgement about what is possible, it is a guard on a text field
# that reaches this through a settings table — 200 new words is already past anything the
# SRS can schedule sanely, and past it the number is a typo rather than an intention.
MAX_NEW_PER_DAY = 200


def clamp_budget(value: object) -> int:
    """Return a usable daily budget from whatever the settings table held.

    Anything unreadable — absent, empty, a word, a float, a negative — comes back as the
    default rather than raising. A stored setting is user input that has been sitting in
    a database across upgrades, and a feed that refuses to run because the number is
    malformed fails worse than one that quietly uses ten.
    """
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return DEFAULT_NEW_PER_DAY
    return max(MIN_NEW_PER_DAY, min(MAX_NEW_PER_DAY, number))


def kanji_in(text: str) -> frozenset[str]:
    """Return the distinct kanji in ``text``.

    Kana, romaji, punctuation and the tilde used by pattern entries ("~だけ") are all
    ignored: they carry no prerequisite.
    """
    return frozenset(ch for ch in text if _KANJI_MIN <= ord(ch) <= _KANJI_MAX)


def unknown_count(text: str, known: Iterable[str]) -> int:
    """How many distinct kanji in ``text`` the learner has not met yet."""
    known_set = known if isinstance(known, (set, frozenset)) else frozenset(known)
    return len(kanji_in(text) - known_set)


def order_by_known_kanji(
    entries: Sequence[tuple[int, str]],
    known: Iterable[str],
) -> list[int]:
    """Return card ids in teaching order, easiest-to-read first.

    Args:
        entries: ``(card_id, written_form)`` in the deck's own order.
        known: the kanji characters the learner has already met.

    Returns:
        Every id in ``entries``, readable words first and, among those, the ones that
        use the most of what the learner has just learned.

    The four keys, in order and why:

    1. **Unknown kanji, fewest first.** The whole point. A word made only of characters
       you have met is readable today; one with two you have never seen is two lessons
       away.
    2. **Known kanji used, most first.** MEASURED, NOT CHOSEN. Ranking readable words by
       fewest kanji instead put every all-kana word ahead of every other, and since the
       tiebreak below is the deck's gojūon order, N5 opened on ああ・あそこ・あちら・
       あっち・あなた — two hundred kana words in alphabetical order, which is the exact
       failure this ordering exists to replace. Preferring words that EXERCISE known
       characters opens the same deck on 二十日・一日・五日・男の子・大人・女の子, all
       built from the kanji block the learner just cleared, and the first kana word
       still arrives at position 110 of 744 rather than being exiled.
    3. **Total kanji, fewest first.** Between two words that use the same number of
       known characters, the shorter one is the smaller step.
    4. **The deck's own position.** A stable tiebreak, so the order is deterministic and
       two runs with the same knowledge give the same list. `domain/` may not be random,
       and a feed that reshuffles itself between sessions is not a feed.

    What none of this has is a sense of which words are USEFUL — this app carries no
    frequency data, so an ordering can only reflect what the learner knows, never what
    the language does most often. That is a real limit and not a bug to be tuned around.
    """
    known_set = frozenset(known)
    ranked = []
    for position, (card_id, text) in enumerate(entries):
        used = kanji_in(text)
        ranked.append(
            (len(used - known_set), -len(used & known_set), len(used), position, card_id)
        )
    ranked.sort()
    return [card_id for *_, card_id in ranked]


def next_words(
    entries: Sequence[tuple[int, str]],
    known: Iterable[str],
    seen: Iterable[int],
    budget: int,
) -> list[int]:
    """Return up to ``budget`` card ids the learner has not started yet.

    The daily meter the reference apps use in place of chunking. ``seen`` is whatever
    the caller counts as already introduced — this module does not know or care how
    that is decided, which keeps the SRS state out of `domain/`.

    A budget of zero or less returns nothing rather than everything; "no new words
    today" is a real answer and the caller should not have to special-case it.
    """
    if budget <= 0:
        return []
    already = set(seen)
    fresh = [(cid, text) for cid, text in entries if cid not in already]
    return order_by_known_kanji(fresh, known)[:budget]
