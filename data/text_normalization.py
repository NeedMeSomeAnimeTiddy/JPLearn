"""Shared normalization helpers for persistence and import boundaries."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from fugashi import Tagger

_JAPANESE_SCRIPT_RE = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")


def contains_japanese_script(value: str) -> bool:
    """Return True if *value* contains Hiragana, Katakana, or CJK ideographs."""
    return bool(_JAPANESE_SCRIPT_RE.search(value))


_PROLONGED_SOUND_VARIANTS = str.maketrans(
    {
        "‐": "ー",
        "‑": "ー",
        "‒": "ー",
        "–": "ー",
        "—": "ー",
        "―": "ー",
        "−": "ー",
        "ｰ": "ー",
    }
)

_JAPANESE_PUNCTUATION_VARIANTS = str.maketrans(
    {
        ",": "、",
        "，": "、",
        "｡": "。",
        ".": "。",
        "．": "。",
        "･": "・",
    }
)


def normalize_storage_text(value: str) -> str:
    """Normalize generic persisted text with Unicode compatibility folding."""
    return unicodedata.normalize("NFKC", value).strip()


def normalize_japanese_text(value: str) -> str:
    """Normalize Japanese text with stable dash and punctuation forms."""
    normalized = normalize_storage_text(value)
    if not normalized:
        return ""
    normalized = normalized.translate(_PROLONGED_SOUND_VARIANTS)
    return normalized.translate(_JAPANESE_PUNCTUATION_VARIANTS)


@dataclass(frozen=True)
class JapaneseToken:
    """One morpheme produced by :func:`tokenize_japanese`.

    Attributes:
        surface: The token's surface form as it appeared in the text.
        lemma: The dictionary (base) form, e.g. "食べる" for "食べた".
        part_of_speech: Top-level part-of-speech tag (e.g. "動詞", "名詞", "助詞").
    """

    surface: str
    lemma: str
    part_of_speech: str


_tagger: Tagger | None = None


def _get_tagger() -> Tagger:
    global _tagger
    if _tagger is None:
        try:
            _tagger = Tagger()
        except Exception as exc:  # pragma: no cover - environment-dependent failure
            raise RuntimeError(
                "Fugashi tokenizer failed to initialize. Ensure the 'fugashi' and "
                "'unidic-lite' packages from requirements.txt are installed."
            ) from exc
    return _tagger


def tokenize_japanese(text: str) -> list[JapaneseToken]:
    """Split Japanese text into morphemes with lemma and part-of-speech info.

    Uses Fugashi/MeCab (required dependency); raises RuntimeError with an
    actionable message if the tokenizer cannot be initialized.
    """
    normalized = normalize_japanese_text(text)
    if not normalized:
        return []
    tagger = _get_tagger()
    tokens: list[JapaneseToken] = []
    for word in tagger(normalized):
        feature = word.feature
        part_of_speech = getattr(feature, "pos1", "") or ""
        lemma = getattr(feature, "lemma", "") or word.surface
        tokens.append(
            JapaneseToken(surface=word.surface, lemma=lemma, part_of_speech=part_of_speech)
        )
    return tokens