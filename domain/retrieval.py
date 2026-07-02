"""Deterministic text-embedding similarity ranking for assistant memory retrieval.

This module ranks candidate memory facts/summaries by similarity to a user
message so the tutor chat context favors semantically relevant items instead
of exact keyword overlap alone.

Embeddings are produced with a lightweight, dependency-free hashed
character-trigram vector (see ``embed_text``) rather than a neural network,
so this module has no ML runtime dependency and stays pure/deterministic as
required by the domain layer (no I/O, no hidden state, no randomness). The
similarity/ranking API below is agnostic to how a vector was produced, so a
real transformer-based encoder (e.g. the multilingual-e5 models installed by
scripts/get_embedder_model.py) can be substituted at the call site later
without changing this module.
"""

from __future__ import annotations

import math
import zlib
from dataclasses import dataclass

EMBEDDING_DIM = 256
_NGRAM_SIZE = 3


def embed_text(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """Deterministically embed text into a fixed-size unit vector.

    Uses hashed character trigrams (a bag-of-n-grams) so the same text always
    produces the same vector, independent of process/hash-seed randomization.
    """
    vector = [0.0] * dim
    normalized = text.lower().strip()
    if not normalized or dim <= 0:
        return vector

    padded = f"  {normalized}  "
    for index in range(len(padded) - _NGRAM_SIZE + 1):
        gram = padded[index : index + _NGRAM_SIZE]
        bucket = zlib.crc32(gram.encode("utf-8")) % dim
        vector[bucket] += 1.0

    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(vector_a: list[float], vector_b: list[float]) -> float:
    """Cosine similarity between two vectors of equal length."""
    if not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return 0.0
    dot_product = sum(a * b for a, b in zip(vector_a, vector_b))
    norm_a = math.sqrt(sum(a * a for a in vector_a))
    norm_b = math.sqrt(sum(b * b for b in vector_b))
    if norm_a <= 0 or norm_b <= 0:
        return 0.0
    return dot_product / (norm_a * norm_b)


@dataclass(frozen=True)
class RetrievedItem:
    """A ranked candidate: ``key`` identifies it, ``score`` is cosine similarity."""

    key: str
    score: float


def rank_by_similarity(
    query_vector: list[float],
    candidates: list[tuple[str, list[float]]],
    top_k: int,
) -> list[RetrievedItem]:
    """Rank ``(key, vector)`` candidates by similarity to ``query_vector``.

    Returns the top ``top_k`` items, best (highest similarity) first. Ties are
    broken by candidate order (stable sort), so callers can pre-order
    candidates by a secondary signal (e.g. recency) before ranking.
    """
    if top_k <= 0 or not candidates:
        return []
    scored = [
        RetrievedItem(key=key, score=cosine_similarity(query_vector, vector))
        for key, vector in candidates
    ]
    scored.sort(key=lambda item: item.score, reverse=True)
    return scored[:top_k]
