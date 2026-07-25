"""Rebuild overwritten review_states rows by replaying their review log.

Reports what would change and exits without writing. Pass ``--apply`` to write.

    python scripts/rebuild_review_states.py --deck Hiragana
    python scripts/rebuild_review_states.py --deck Hiragana --apply

This reschedules cards: rows whose scheduling was overwritten by expertise
seeding get the state their real history is worth. Cards last reviewed long ago
come back due, which is correct. See ``domain/review_replay.py``.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.state_rebuild import RebuildPlan, run_rebuild  # noqa: E402

_PREVIEW_ROWS = 20


def _print_report(plan: RebuildPlan, *, applied: bool) -> None:
    today = date.today()
    examined = len(plan.rebuilds) + plan.skipped_explained + plan.skipped_no_events
    print(f"Examined {examined} review_states rows.\n")

    if not plan.rebuilds:
        print("No rows need rebuilding.\n")
    else:
        verb = "Rebuilt" if applied else "Would rebuild"
        print(f"{verb} {len(plan.rebuilds)} row(s) from logged history.")
        print(f"  due immediately after rebuild: {plan.due_after(today)}")
        print(f"  mastered -> not mastered:      {plan.losing_mastered}")
        print(f"  not mastered -> mastered:      {plan.gaining_mastered}")
        print()
        print(f"  {'card':>5} {'reviews':>8} | {'reps':>4} {'ivl':>6} {'next_review':>12}"
              f" -> {'reps':>4} {'ivl':>6} {'next_review':>12}")
        for r in plan.rebuilds[:_PREVIEW_ROWS]:
            print(f"  {r.card_id:>5} {r.reviews:>8} | "
                  f"{r.before.repetitions:>4} {r.before.interval:>6} "
                  f"{r.before.next_review.isoformat():>12} -> "
                  f"{r.after.repetitions:>4} {r.after.interval:>6} "
                  f"{r.after.next_review.isoformat():>12}")
        if len(plan.rebuilds) > _PREVIEW_ROWS:
            print(f"  ... and {len(plan.rebuilds) - _PREVIEW_ROWS} more")
        print()

    print(f"Skipped, log already explains row: {plan.skipped_explained}")
    print(f"Skipped, no logged reviews:        {plan.skipped_no_events}")

    if plan.rebuilds and not applied:
        print("\nDry run — nothing written. Re-run with --apply to write these changes.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true",
                        help="write the rebuilds (default is a dry run)")
    parser.add_argument("--deck", default=None,
                        help="limit to one deck (default: every deck)")
    parser.add_argument("--db", type=Path, default=None,
                        help="database to rebuild (defaults to this checkout's)")
    args = parser.parse_args()

    plan = run_rebuild(apply=args.apply, deck=args.deck, db_path=args.db)
    _print_report(plan, applied=args.apply and bool(plan.rebuilds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
