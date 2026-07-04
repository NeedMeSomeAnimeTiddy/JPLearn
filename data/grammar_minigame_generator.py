"""Grammar minigame payload generation backed by Fugashi/MeCab tokens."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import random
from typing import Any

from fugashi import Tagger

from data.text_normalization import normalize_japanese_text

TARGET_PARTICLES = ("は", "が", "を", "に", "で")
_MOTION_LEMMAS = {"行く", "来る", "帰る", "向かう"}


@dataclass(frozen=True)
class ParsedToken:
    """One Fugashi token with fields needed by grammar minigames."""

    surface: str
    lemma: str
    part_of_speech: str
    reading: str | None


_tagger: Tagger | None = None


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


def _extract_pos(word: Any) -> str:
    """Return a stable top-level POS label from a Fugashi word."""
    raw_pos = getattr(word, "pos", None)
    if isinstance(raw_pos, (list, tuple)) and raw_pos:
        value = str(raw_pos[0]).strip()
        if value and value != "*":
            return value
    if isinstance(raw_pos, str):
        value = raw_pos.strip()
        if value and value != "*":
            return value

    feature = getattr(word, "feature", None)
    fallback = getattr(feature, "pos1", "") if feature is not None else ""
    value = str(fallback).strip()
    return value if value and value != "*" else ""


def _extract_lemma(word: Any) -> str:
    feature = getattr(word, "feature", None)
    raw = getattr(feature, "lemma", "") if feature is not None else ""
    value = str(raw).strip()
    if value and value != "*":
        return value
    return str(getattr(word, "surface", "")).strip()


def _extract_reading(word: Any) -> str | None:
    feature = getattr(word, "feature", None)
    if feature is None:
        return None
    for attr in ("kana", "pron", "pronBase", "reading"):
        raw = getattr(feature, attr, "")
        value = str(raw).strip()
        if value and value != "*":
            return value
    return None


def _is_particle(token: ParsedToken) -> bool:
    return "助詞" in token.part_of_speech and token.surface in TARGET_PARTICLES


def parse_sentence(sentence: str) -> list[dict[str, str | None]]:
    """Parse a Japanese sentence using Fugashi token attributes.

    Returns dictionaries to keep bridge JSON payload construction straightforward.
    """
    normalized = normalize_japanese_text(sentence)
    if not normalized:
        return []

    tagger = _get_tagger()
    tokens: list[dict[str, str | None]] = []
    for word in tagger(normalized):
        parsed = ParsedToken(
            surface=str(getattr(word, "surface", "")),
            lemma=_extract_lemma(word),
            part_of_speech=_extract_pos(word),
            reading=_extract_reading(word),
        )
        tokens.append(asdict(parsed))
    return tokens


def _build_particle_attached_chunks(tokens: list[dict[str, str | None]]) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    current_indices: list[int] = []

    for index, token in enumerate(tokens):
        current_indices.append(index)
        pos = str(token.get("part_of_speech", "") or "")
        surface = str(token.get("surface", "") or "")
        if "助詞" in pos and surface in TARGET_PARTICLES:
            chunk_id = f"chunk-{len(chunks)}"
            text = "".join(str(tokens[i].get("surface", "") or "") for i in current_indices)
            chunks.append({"id": chunk_id, "text": text, "token_indices": list(current_indices)})
            current_indices = []

    if current_indices:
        chunk_id = f"chunk-{len(chunks)}"
        text = "".join(str(tokens[i].get("surface", "") or "") for i in current_indices)
        chunks.append({"id": chunk_id, "text": text, "token_indices": list(current_indices)})

    if not chunks:
        for index, token in enumerate(tokens):
            chunks.append(
                {
                    "id": f"chunk-{index}",
                    "text": str(token.get("surface", "") or ""),
                    "token_indices": [index],
                }
            )

    return chunks


def generate_assembly_data(sentence: str, seed: int = 0) -> dict[str, object]:
    """Generate shuffled sentence chunks for drag-and-drop assembly."""
    tokens = parse_sentence(sentence)
    if not tokens:
        raise ValueError("Sentence has no parsable tokens")

    chunks = _build_particle_attached_chunks(tokens)
    shuffled_chunks = [dict(chunk) for chunk in chunks]
    random.Random(seed).shuffle(shuffled_chunks)

    return {
        "game_type": "sentence_assembly",
        "sentence": normalize_japanese_text(sentence),
        "tokens": tokens,
        "chunks": chunks,
        "shuffled_chunks": shuffled_chunks,
        "answer_order": [str(chunk["id"]) for chunk in chunks],
    }


def _contextual_distractor_pool(
    correct_particle: str,
    prev_lemma: str | None,
    next_pos: str | None,
) -> list[str]:
    pool = [particle for particle in TARGET_PARTICLES if particle != correct_particle]

    preferred: list[str] = []
    if prev_lemma in _MOTION_LEMMAS:
        preferred = [particle for particle in ("に", "で", "を") if particle in pool]
    elif next_pos is not None and "動詞" in next_pos:
        preferred = [particle for particle in ("を", "に", "で", "が") if particle in pool]

    ordered = preferred + [particle for particle in pool if particle not in preferred]
    return ordered


def generate_particle_cloze_data(sentence: str, seed: int = 0) -> dict[str, object]:
    """Generate a single-particle cloze prompt from a sentence."""
    tokens = parse_sentence(sentence)
    if not tokens:
        raise ValueError("Sentence has no parsable tokens")

    candidates = [
        index
        for index, token in enumerate(tokens)
        if "助詞" in str(token.get("part_of_speech", "") or "")
        and str(token.get("surface", "") or "") in TARGET_PARTICLES
    ]
    if not candidates:
        raise ValueError("Sentence does not contain target particles")

    rng = random.Random(seed)
    target_index = candidates[rng.randrange(len(candidates))]
    target_surface = str(tokens[target_index].get("surface", "") or "")
    prev_lemma = str(tokens[target_index - 1].get("lemma", "") or "") if target_index > 0 else None
    next_pos = (
        str(tokens[target_index + 1].get("part_of_speech", "") or "")
        if target_index + 1 < len(tokens)
        else None
    )

    distractor_pool = _contextual_distractor_pool(target_surface, prev_lemma, next_pos)
    options = [target_surface]
    options.extend(distractor_pool[:3])
    options = list(dict.fromkeys(options))
    while len(options) < 4:
        for particle in TARGET_PARTICLES:
            if particle not in options:
                options.append(particle)
            if len(options) >= 4:
                break
    rng.shuffle(options)

    display_tokens = [str(token.get("surface", "") or "") for token in tokens]
    display_tokens[target_index] = "___"

    return {
        "game_type": "particle_cloze",
        "sentence": normalize_japanese_text(sentence),
        "tokens": tokens,
        "target_token_index": target_index,
        "correct_particle": target_surface,
        "options": options,
        "display_tokens": display_tokens,
        "prompt": "".join(display_tokens),
    }


def generate_vibe_check_data(sentence: str) -> dict[str, object]:
    """Infer social register cues from sentence-ending token morphology."""
    tokens = parse_sentence(sentence)
    if not tokens:
        raise ValueError("Sentence has no parsable tokens")

    terminal = tokens[-1]
    terminal_surface = str(terminal.get("surface", "") or "")
    terminal_lemma = str(terminal.get("lemma", "") or "")

    sentence_text = normalize_japanese_text(sentence)
    if "ください" in sentence_text or terminal_surface.endswith("ください"):
        correct_label = "Formal Request"
        confidence = 0.95
    elif terminal_surface.endswith("です") or terminal_surface.endswith("ます") or terminal_lemma in {"です", "ます"}:
        correct_label = "Polite"
        confidence = 0.9
    else:
        correct_label = "Casual / Plain"
        confidence = 0.7

    options = ["Casual / Plain", "Polite", "Formal Request", "Unclear / Context Needed"]

    return {
        "game_type": "vibe_check",
        "sentence": sentence_text,
        "tokens": tokens,
        "prompt": "Which social context best fits this sentence?",
        "options": options,
        "correct_label": correct_label,
        "evidence": {
            "terminal_surface": terminal_surface,
            "terminal_lemma": terminal_lemma,
            "confidence": confidence,
        },
    }


def _mutate_verb_surface(surface: str, lemma: str) -> str | None:
    if not surface:
        return None
    if surface.endswith("ます"):
        return surface + "る"
    if surface.endswith("た") and lemma and lemma != surface:
        return f"{lemma}た"
    if surface.endswith("る"):
        return surface + "ます"
    return None


def generate_imposter_data(sentence: str, seed: int = 0) -> dict[str, object]:
    """Inject one controlled grammar error and return its exact location."""
    tokens = parse_sentence(sentence)
    if not tokens:
        raise ValueError("Sentence has no parsable tokens")

    rng = random.Random(seed)
    particle_candidates = [
        index
        for index, token in enumerate(tokens)
        if "助詞" in str(token.get("part_of_speech", "") or "")
        and str(token.get("surface", "") or "") in TARGET_PARTICLES
    ]
    verb_candidates = [
        index
        for index, token in enumerate(tokens)
        if "動詞" in str(token.get("part_of_speech", "") or "")
    ]

    mutation_type = "particle"
    target_index: int | None = None
    mutated_surface: str | None = None

    if particle_candidates and (not verb_candidates or rng.random() < 0.7):
        target_index = particle_candidates[rng.randrange(len(particle_candidates))]
        original = str(tokens[target_index].get("surface", "") or "")
        options = [particle for particle in TARGET_PARTICLES if particle != original]
        mutated_surface = options[rng.randrange(len(options))]
        mutation_type = "particle"
    elif verb_candidates:
        target_index = verb_candidates[rng.randrange(len(verb_candidates))]
        original = str(tokens[target_index].get("surface", "") or "")
        lemma = str(tokens[target_index].get("lemma", "") or "")
        mutated_surface = _mutate_verb_surface(original, lemma)
        if not mutated_surface or mutated_surface == original:
            if particle_candidates:
                target_index = particle_candidates[rng.randrange(len(particle_candidates))]
                original = str(tokens[target_index].get("surface", "") or "")
                options = [particle for particle in TARGET_PARTICLES if particle != original]
                mutated_surface = options[rng.randrange(len(options))]
                mutation_type = "particle"
            else:
                raise ValueError("Could not derive an imposter mutation from sentence tokens")
        else:
            mutation_type = "conjugation"
    else:
        raise ValueError("Sentence has no particle or verb candidate for imposter generation")

    if target_index is None or not mutated_surface:
        raise ValueError("Failed to generate imposter mutation")

    mutated_tokens = [str(token.get("surface", "") or "") for token in tokens]
    original_surface = mutated_tokens[target_index]
    mutated_tokens[target_index] = mutated_surface

    return {
        "game_type": "imposter",
        "sentence": normalize_japanese_text(sentence),
        "tokens": tokens,
        "mutated_tokens": mutated_tokens,
        "mutated_sentence": "".join(mutated_tokens),
        "error_token_index": target_index,
        "original_token": original_surface,
        "mutated_token": mutated_surface,
        "mutation_type": mutation_type,
    }
