"""Conjugation drill payload generation backed by Fugashi/UniDic.

Splits cleanly from ``domain/conjugation.py``: the rules there are pure, and
everything that needs a tokenizer — deciding whether 帰る is godan or ichidan,
recovering a kana reading from a kanji surface — lives here.

The module refuses more than it guesses. A drill round grades a typed answer
against the vocabulary card's SRS state, so a word this module cannot classify
with confidence raises ``ValueError`` and the renderer falls back to an ordinary
round rather than asking a question it might mark wrong.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import random
from typing import Any

from fugashi import Tagger

from data.text_normalization import normalize_japanese_text
from domain.conjugation import (
    ConjugationError,
    WordClass,
    conjugate,
    forms_for_stage,
    is_verb_class,
)

GAME_TYPE = "conjugation_drill"

_KATAKANA_START = 0x30A1
_KATAKANA_END = 0x30F6
_KANA_SHIFT = 0x60

#: Non-る godan tails. A kana-only verb ending in one of these cannot be
#: ichidan, so it needs no tokenizer evidence to classify.
_UNAMBIGUOUS_GODAN_TAILS = ("う", "く", "ぐ", "す", "つ", "ぬ", "ぶ", "む")

#: る-final verbs written in kana are genuinely ambiguous (かえる is 帰る godan
#: or 変える ichidan), and the tokenizer's pick for a bare word is a coin flip.
#: These are the kana-only verbs the built-in N5 fallback deck ships, resolved
#: to the sense that deck teaches. Anything else る-final and kana-only is
#: refused rather than guessed.
_KANA_RU_VERB_CLASSES: dict[str, WordClass] = {
    "ある": "godan",
    "いる": "ichidan",
    "うる": "godan",
    "おきる": "ichidan",
    "おしえる": "ichidan",
    "おぼえる": "ichidan",
    "かえる": "godan",  # 帰る, "to return home"
    "かりる": "ichidan",
    "きる": "ichidan",  # 着る, "to wear"
    "しる": "godan",
    "すわる": "godan",
    "つくる": "godan",
    "でかける": "ichidan",
    "とる": "godan",
    "ねる": "ichidan",
    "のる": "godan",
    "はいる": "godan",
    "はしる": "godan",
    "みる": "ichidan",
    "わかる": "godan",
    "わすれる": "ichidan",
}

_tagger: Tagger | None = None


@dataclass(frozen=True)
class ConjugationDrillPayload:
    """One conjugation drill round."""

    game_type: str
    word: str
    reading: str
    word_class: str
    form: str
    form_label: str
    prompt: str
    expected: str
    expected_reading: str
    accepted: list[str] = field(default_factory=list)
    rule_hint: str = ""
    stage: int = 1


def _get_tagger() -> Tagger:
    global _tagger
    if _tagger is None:
        try:
            _tagger = Tagger()
        except Exception as exc:  # pragma: no cover - environment dependent
            raise RuntimeError(
                "Fugashi tokenizer failed to initialize. Ensure 'fugashi' and "
                "'unidic-lite' are installed."
            ) from exc
    return _tagger


def katakana_to_hiragana(text: str) -> str:
    """Fold UniDic's katakana readings down to the hiragana learners type."""
    return "".join(
        chr(ord(ch) - _KANA_SHIFT) if _KATAKANA_START <= ord(ch) <= _KATAKANA_END else ch
        for ch in text
    )


def _feature(word: Any, name: str) -> str:
    feature = getattr(word, "feature", None)
    if feature is None:
        return ""
    raw = getattr(feature, name, "")
    value = str(raw).strip()
    return "" if value == "*" else value


def _token_reading(word: Any) -> str:
    for attr in ("kana", "pron", "kanaBase", "pronBase"):
        value = _feature(word, attr)
        if value:
            return katakana_to_hiragana(value)
    return ""


def _has_kanji(text: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in text)


def _class_from_ctype(c_type: str, pos: str) -> WordClass | None:
    if c_type.startswith("五段"):
        return "godan"
    if "一段" in c_type:
        return "ichidan"
    if c_type.startswith("サ行変格"):
        return "suru"
    if c_type.startswith("カ行変格"):
        return "kuru"
    if pos == "形容詞":
        return "i_adjective"
    if pos == "形状詞":
        return "na_adjective"
    return None


def _class_from_kana_shape(word: str) -> WordClass | None:
    """Classify a kana-only word from its tail alone, or give up.

    Only る-final verbs are ambiguous between the two conjugation classes; every
    other verb tail determines godan outright.
    """
    if word.endswith("する"):
        return "suru"
    if word in {"くる", "来る"}:
        return "kuru"
    if word.endswith("る"):
        return _KANA_RU_VERB_CLASSES.get(word)
    if word.endswith(_UNAMBIGUOUS_GODAN_TAILS):
        return "godan"
    return None


def classify_word(word: str) -> tuple[WordClass, str] | None:
    """Return ``(word_class, kana reading)`` for a dictionary-form word.

    ``None`` means "not confidently a conjugatable word in dictionary form" —
    a noun, an inflected form, an unparsable string, or a kana-only る-verb
    whose class cannot be recovered from spelling.
    """
    normalized = normalize_japanese_text(word).strip()
    if not normalized:
        return None

    # The curated table wins outright for kana-only words: the tokenizer reads a
    # bare ある as the adnominal 或る, and みる/かえる as whichever homograph it
    # ranks first, so its answer is worth less here than the deck's own sense.
    curated = _KANA_RU_VERB_CLASSES.get(normalized) if not _has_kanji(normalized) else None
    if curated is not None:
        return curated, normalized

    tokens = list(_get_tagger()(normalized))
    if not tokens:
        return None
    if "".join(str(getattr(token, "surface", "")) for token in tokens) != normalized:
        return None
    # A multi-token word is only a dictionary form when it is noun + する
    # (勉強する). Anything else that happens to tokenize cleanly is inflected —
    # 高くない is 高く + ない, whose final token is itself a valid i-adjective.
    if any(_feature(token, "pos1") not in {"名詞", "接頭辞"} for token in tokens[:-1]):
        return None

    final = tokens[-1]
    pos = _feature(final, "pos1")
    c_type = _feature(final, "cType")
    c_form = _feature(final, "cForm")
    reading = "".join(_token_reading(token) for token in tokens)

    if pos not in {"動詞", "形容詞", "形状詞"}:
        return None
    # Only drill from a dictionary form; an already-inflected input would make
    # the prompt lie about what it is asking the learner to produce. 終止形 and
    # 連体形 are the two whose surface *is* the dictionary form — UniDic labels a
    # bare 食べる as 連体形 — and any genuinely inflected input ends in an
    # auxiliary (食べた → 食べ + た/助動詞), which the part-of-speech check above
    # has already rejected.
    if pos in {"動詞", "形容詞"} and c_form and not c_form.startswith(("終止形", "連体形")):
        return None

    if _has_kanji(normalized):
        word_class = _class_from_ctype(c_type, pos)
    else:
        word_class = (
            _class_from_kana_shape(normalized)
            if pos == "動詞"
            else _class_from_ctype(c_type, pos)
        )

    if word_class is None:
        return None
    if not reading:
        reading = normalized if not _has_kanji(normalized) else ""
    if not reading:
        return None
    return word_class, reading


_RULE_HINTS: dict[WordClass, str] = {
    "godan": "Godan verb: the final kana shifts row before the ending attaches.",
    "ichidan": "Ichidan verb: drop る, then attach the ending.",
    "suru": "する verb: する becomes し- (or で- in the potential).",
    "kuru": "来る is irregular — the kanji stays put while the reading shifts.",
    "i_adjective": "i-adjective: drop い, then attach the ending.",
    "na_adjective": "na-adjective: the ending attaches straight to the stem.",
}


def generate_conjugation_drill_data(
    word: str,
    *,
    stage: int = 1,
    seed: int = 0,
) -> ConjugationDrillPayload:
    """Build one drill round for ``word``.

    Raises:
        ValueError: when the word is not a conjugatable dictionary form, or no
            form is unlocked at this stage — both mean "fall back to another
            minigame for this card".
    """
    classified = classify_word(word)
    if classified is None:
        raise ValueError(f"'{word}' is not a conjugatable dictionary form")

    word_class, reading = classified
    normalized_word = normalize_japanese_text(word).strip()

    candidates = forms_for_stage(word_class, reading, stage)
    if not candidates:
        raise ValueError(f"No conjugation forms are available for '{word}'")

    rng = random.Random(seed)
    form = candidates[rng.randrange(len(candidates))]
    try:
        result = conjugate(normalized_word, reading, word_class, form)
    except ConjugationError as exc:
        raise ValueError(str(exc)) from exc

    kind = "verb" if is_verb_class(word_class) else "adjective"
    return ConjugationDrillPayload(
        game_type=GAME_TYPE,
        word=normalized_word,
        reading=reading,
        word_class=word_class,
        form=form,
        form_label=result.label,
        prompt=f"Put this {kind} into its {result.label}.",
        expected=result.surface,
        expected_reading=result.reading,
        accepted=list(result.accepted),
        rule_hint=_RULE_HINTS[word_class],
        stage=max(1, min(3, stage)),
    )
