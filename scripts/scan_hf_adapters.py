"""Scan Hugging Face for LoRA/adapter candidates and rank useful options.

This script is intentionally lightweight (stdlib only) so it can run in the
existing project environment without additional dependencies.

Usage:
    python scripts/scan_hf_adapters.py
    python scripts/scan_hf_adapters.py --query "qwen japanese lora" --limit 60
    python scripts/scan_hf_adapters.py --json-out tmp_hf_adapter_scan.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Iterable

HF_API = "https://huggingface.co/api/models"
DEFAULT_QUERIES = [
    "qwen japanese lora adapter",
    "gemma japanese lora adapter",
    "yi lora adapter",
    "llm-jp adapter lora",
    "japanese peft adapter",
]


@dataclass(frozen=True)
class Candidate:
    model_id: str
    author: str
    downloads: int
    likes: int
    last_modified: str
    pipeline_tag: str
    tags: tuple[str, ...]


@dataclass(frozen=True)
class ScoredCandidate:
    candidate: Candidate
    score: float
    reasons: tuple[str, ...]


def _fetch_models(query: str, limit: int) -> list[dict]:
    params = {
        "search": query,
        "limit": str(limit),
        "full": "false",
    }
    url = f"{HF_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn-HF-Adapter-Scanner/1.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = response.read().decode("utf-8")
    parsed = json.loads(payload)
    return parsed if isinstance(parsed, list) else []


def _parse_candidate(raw: dict) -> Candidate | None:
    model_id = raw.get("id")
    if not isinstance(model_id, str) or not model_id.strip():
        return None
    tags = raw.get("tags")
    return Candidate(
        model_id=model_id,
        author=str(raw.get("author") or ""),
        downloads=int(raw.get("downloads") or 0),
        likes=int(raw.get("likes") or 0),
        last_modified=str(raw.get("lastModified") or ""),
        pipeline_tag=str(raw.get("pipeline_tag") or ""),
        tags=tuple(tag for tag in (tags if isinstance(tags, list) else []) if isinstance(tag, str)),
    )


def _days_since(last_modified: str) -> int | None:
    if not last_modified:
        return None
    try:
        cleaned = last_modified.replace("Z", "+00:00")
        then = dt.datetime.fromisoformat(cleaned)
        now = dt.datetime.now(dt.timezone.utc)
        if then.tzinfo is None:
            then = then.replace(tzinfo=dt.timezone.utc)
        return max(0, (now - then).days)
    except ValueError:
        return None


def _has_any(text: str, needles: Iterable[str]) -> bool:
    value = text.lower()
    return any(needle in value for needle in needles)


def _score(candidate: Candidate) -> ScoredCandidate:
    tags_lower = [tag.lower() for tag in candidate.tags]
    id_lower = candidate.model_id.lower()

    score = 0.0
    reasons: list[str] = []

    has_adapter_tag = any("adapter" in tag or "peft" in tag or "lora" in tag for tag in tags_lower)
    if has_adapter_tag:
        score += 34
        reasons.append("adapter/peft/lora tag")

    if _has_any(" ".join(tags_lower) + " " + id_lower, ["japanese", "ja"]):
        score += 20
        reasons.append("japanese signal")

    if _has_any(" ".join(tags_lower) + " " + id_lower, ["qwen", "gemma", "yi", "llm-jp"]):
        score += 14
        reasons.append("base-family overlap")

    if candidate.pipeline_tag == "text-generation":
        score += 8
        reasons.append("text-generation pipeline")
    elif candidate.pipeline_tag:
        score -= 6
        reasons.append(f"non-generation pipeline ({candidate.pipeline_tag})")

    if candidate.downloads > 0:
        download_points = min(18.0, math.log10(candidate.downloads + 1) * 8.0)
        score += download_points
        reasons.append(f"downloads={candidate.downloads}")

    if candidate.likes > 0:
        like_points = min(12.0, candidate.likes * 0.8)
        score += like_points
        reasons.append(f"likes={candidate.likes}")

    age_days = _days_since(candidate.last_modified)
    if age_days is not None:
        if age_days <= 45:
            score += 10
            reasons.append("fresh update")
        elif age_days <= 180:
            score += 6
            reasons.append("recent update")
        elif age_days > 540:
            score -= 5
            reasons.append("stale update")

    return ScoredCandidate(candidate=candidate, score=round(score, 2), reasons=tuple(reasons))


def run_scan(queries: list[str], limit: int) -> list[ScoredCandidate]:
    by_id: dict[str, Candidate] = {}
    for query in queries:
        rows = _fetch_models(query, limit)
        for raw in rows:
            candidate = _parse_candidate(raw)
            if not candidate:
                continue
            existing = by_id.get(candidate.model_id)
            if existing is None or candidate.downloads > existing.downloads:
                by_id[candidate.model_id] = candidate

    scored = [_score(candidate) for candidate in by_id.values()]
    scored.sort(key=lambda item: (item.score, item.candidate.downloads, item.candidate.likes), reverse=True)
    return scored


def _to_json_rows(scored: list[ScoredCandidate], top_k: int) -> list[dict]:
    rows: list[dict] = []
    for item in scored[:top_k]:
        rows.append(
            {
                "id": item.candidate.model_id,
                "author": item.candidate.author,
                "score": item.score,
                "downloads": item.candidate.downloads,
                "likes": item.candidate.likes,
                "last_modified": item.candidate.last_modified,
                "pipeline_tag": item.candidate.pipeline_tag,
                "reasons": list(item.reasons),
                "tags": list(item.candidate.tags),
            }
        )
    return rows


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", action="append", default=[], help="Custom query (repeatable)")
    parser.add_argument("--limit", type=int, default=40, help="Per-query HF API limit")
    parser.add_argument("--top", type=int, default=20, help="Rows to print")
    parser.add_argument("--json-out", default="", help="Optional path to write JSON results")
    args = parser.parse_args(argv)

    queries = args.query if args.query else DEFAULT_QUERIES
    scored = run_scan(queries=queries, limit=max(5, min(100, args.limit)))

    if not scored:
        print("No adapter candidates found.")
        return 0

    print("Top Hugging Face adapter candidates:")
    for index, item in enumerate(scored[: max(1, args.top)], start=1):
        print(
            f"{index:>2}. {item.candidate.model_id} | score={item.score:.2f} "
            f"| downloads={item.candidate.downloads} | likes={item.candidate.likes}"
        )
        print(f"    reasons: {', '.join(item.reasons) if item.reasons else 'none'}")

    if args.json_out:
        payload = {
            "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "queries": queries,
            "top": _to_json_rows(scored, max(1, args.top)),
        }
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        print(f"\nWrote JSON report: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
