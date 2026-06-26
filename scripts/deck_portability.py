from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data.deck_portability import export_progress_snapshot, import_progress_snapshot


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export/import JPLearn deck progress snapshots.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export progress snapshot to JSON")
    export_parser.add_argument("--output", type=Path, required=True, help="Output JSON path")

    import_parser = subparsers.add_parser("import", help="Import progress snapshot from JSON")
    import_parser.add_argument("--input", type=Path, required=True, help="Input JSON path")
    import_parser.add_argument(
        "--mode",
        choices=("merge", "overwrite"),
        default="merge",
        help="Conflict handling mode for import",
    )

    return parser


def _run_export(output_path: Path) -> int:
    payload = export_progress_snapshot()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported snapshot to {output_path}")
    return 0


def _run_import(input_path: Path, mode: str) -> int:
    if not input_path.exists():
        print(f"error: missing input snapshot {input_path}", file=sys.stderr)
        return 2
    try:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON snapshot: {exc}", file=sys.stderr)
        return 2

    try:
        summary = import_progress_snapshot(payload, conflict_mode=mode)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(
        "imported snapshot "
        f"(mode={mode}, review_states={summary['review_states']}, review_events={summary['review_events']}, "
        f"curriculum_stages={summary['curriculum_stages']}, leech_items={summary['leech_items']}, "
        f"session_goals={summary['session_goals']}, custom_decks={summary['custom_decks']})"
    )
    return 0


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "export":
        return _run_export(args.output)
    return _run_import(args.input, args.mode)


if __name__ == "__main__":
    raise SystemExit(main())
