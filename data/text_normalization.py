"""Shared normalization helpers for persistence and import boundaries."""

from __future__ import annotations

import unicodedata

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