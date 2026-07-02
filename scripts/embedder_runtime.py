"""Optional real ONNX-based sentence embedding runtime for local retrieval.

This is the "real embedder" counterpart to the pure, dependency-free fallback
in domain/retrieval.py. It is intentionally isolated here in scripts/ (not
data/ or domain/) because it performs heavy, optional I/O — loading an ONNX
model file + tokenizer from disk and running inference — which is forbidden
in the domain layer (pure logic only) and out of scope for the data layer
(SQLite persistence only). This mirrors how other optional heavy runtimes
(e.g. faster-whisper in scripts/speech_recognition_server.py) are kept out of
the domain/data layers.

Requires the optional `onnxruntime` and `tokenizers` packages (see
requirements.txt) plus the model files downloaded by get_embedder_model.py.
If either is missing, `is_available()` returns False and callers (see
scripts/desktop_bridge.py) fall back to domain.retrieval.embed_text.

Usage (CLI, ad-hoc testing only):
    python scripts/embedder_runtime.py --tier e5_small --text "hello world"
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Mirrors CHATBOT_TIER_TO_EMBEDDER_TIER in electron-frontend/electron/setup_runtime.cjs.
# Keep these two mappings in sync if either changes.
CHATBOT_TIER_TO_EMBEDDER_TIER = {
    "low": "e5_small",
    "medium": "e5_base",
    "high": "e5_base",
    "ultra": "e5_large",
    "max": "e5_large",
}

_MODEL_CACHE: dict[str, tuple[object, object]] = {}


def _documents_base() -> Path:
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    return Path(docs_dir) if docs_dir else REPO_ROOT


def _embedder_dir(tier: str) -> Path:
    return _documents_base() / "models" / "embedders" / tier


def resolve_embedder_tier_for_chatbot_tier(chatbot_tier: str) -> str | None:
    return CHATBOT_TIER_TO_EMBEDDER_TIER.get(chatbot_tier)


def is_available(tier: str) -> bool:
    """True if onnxruntime/tokenizers are importable and the model files exist."""
    try:
        import onnxruntime  # noqa: F401
        import tokenizers  # noqa: F401
    except ImportError:
        return False

    embedder_dir = _embedder_dir(tier)
    return (
        (embedder_dir / "onnx" / "model_quantized.onnx").exists()
        and (embedder_dir / "tokenizer.json").exists()
    )


def _load_model(tier: str):
    if tier in _MODEL_CACHE:
        return _MODEL_CACHE[tier]

    import onnxruntime as ort
    from tokenizers import Tokenizer

    embedder_dir = _embedder_dir(tier)
    session = ort.InferenceSession(
        str(embedder_dir / "onnx" / "model_quantized.onnx"),
        providers=["CPUExecutionProvider"],
    )
    tokenizer = Tokenizer.from_file(str(embedder_dir / "tokenizer.json"))
    _MODEL_CACHE[tier] = (session, tokenizer)
    return session, tokenizer


def _mean_pool(last_hidden_state, attention_mask) -> list[list[float]]:
    """Mean-pool token embeddings over non-padding positions (per the e5 model card)."""
    pooled: list[list[float]] = []
    for sequence, mask in zip(last_hidden_state, attention_mask):
        dim = len(sequence[0])
        weighted_sum = [0.0] * dim
        count = 0
        for token_vector, keep in zip(sequence, mask):
            if not keep:
                continue
            count += 1
            for index in range(dim):
                weighted_sum[index] += float(token_vector[index])
        if count > 0:
            weighted_sum = [value / count for value in weighted_sum]
        pooled.append(weighted_sum)
    return pooled


def _l2_normalize(vectors: list[list[float]]) -> list[list[float]]:
    normalized = []
    for vector in vectors:
        norm = sum(value * value for value in vector) ** 0.5
        normalized.append([value / norm for value in vector] if norm > 0 else vector)
    return normalized


def encode_texts(texts: list[str], tier: str, is_query: bool = True) -> list[list[float]]:
    """Encode texts into e5 embedding vectors using the installed ONNX model.

    Raises if onnxruntime/tokenizers are missing or the model isn't installed;
    callers should check `is_available(tier)` first and fall back otherwise.
    e5 models require a "query: " / "passage: " prefix per their model card.
    """
    import numpy as np

    prefix = "query: " if is_query else "passage: "
    prefixed = [f"{prefix}{text}" for text in texts]

    session, tokenizer = _load_model(tier)
    encodings = [tokenizer.encode(text) for text in prefixed]
    max_len = max(len(encoding.ids) for encoding in encodings)

    input_ids: list[list[int]] = []
    attention_mask: list[list[int]] = []
    for encoding in encodings:
        ids = list(encoding.ids)
        mask = [1] * len(ids)
        pad_len = max_len - len(ids)
        ids.extend([0] * pad_len)
        mask.extend([0] * pad_len)
        input_ids.append(ids)
        attention_mask.append(mask)

    input_names = {item.name for item in session.get_inputs()}
    feed = {
        "input_ids": np.array(input_ids, dtype=np.int64),
        "attention_mask": np.array(attention_mask, dtype=np.int64),
    }
    if "token_type_ids" in input_names:
        feed["token_type_ids"] = np.zeros((len(encodings), max_len), dtype=np.int64)

    outputs = session.run(None, feed)
    last_hidden_state = outputs[0]

    pooled = _mean_pool(last_hidden_state, attention_mask)
    return _l2_normalize(pooled)


def encode_text(text: str, tier: str, is_query: bool = True) -> list[float]:
    return encode_texts([text], tier, is_query=is_query)[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", required=True, choices=sorted(set(CHATBOT_TIER_TO_EMBEDDER_TIER.values())))
    parser.add_argument("--text", required=True)
    args = parser.parse_args()

    if not is_available(args.tier):
        print(json.dumps({"ok": False, "error": "embedder runtime unavailable (missing deps or model files)"}))
        return 1

    vector = encode_text(args.text, args.tier)
    print(json.dumps({"ok": True, "dim": len(vector), "vector_preview": vector[:8]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
