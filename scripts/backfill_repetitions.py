"""One-time correction of historical ``review_states.repetitions`` totals.

Reports what would change and exits without writing. Pass ``--apply`` to write.

    python scripts/backfill_repetitions.py            # dry run (default)
    python scripts/backfill_repetitions.py --apply    # write the corrections

Only rows the review log fully accounts for are touched; see
``domain/review_replay.py`` for why the rest are deliberately left alone.
Re-running is harmless: a corrected row no longer matches the old-rule checksum
and is skipped.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.repetitions_backfill import BackfillPlan, run_backfill  # noqa: E402

_PREVIEW_ROWS = 15


def _print_report(plan: BackfillPlan, *, applied: bool) -> None:
    examined = (
        len(plan.corrections)
        + plan.already_correct
        + plan.skipped_unexplained
        + plan.skipped_no_events
    )
    print(f"Examined {examined} review_states rows.\n")

    if plan.corrections:
        verb = "Corrected" if applied else "Would correct"
        print(f"{verb} {len(plan.corrections)} row(s), "
              f"removing {plan.total_reduction} inflated repetition(s).")
        if plan.newly_unmastered:
            print(f"  {plan.newly_unmastered} row(s) drop below the mastered "
                  f"rule's repetitions >= 3.")
        print()
        print(f"  {'deck':<24} {'card':>6} {'stored':>7} {'->':^4} {'new':>4} {'reviews':>8}")
        for correction in plan.corrections[:_PREVIEW_ROWS]:
            print(f"  {correction.deck[:24]:<24} {correction.card_id:>6} "
                  f"{correction.stored:>7} {'->':^4} {correction.corrected:>4} "
                  f"{correction.reviews:>8}")
        if len(plan.corrections) > _PREVIEW_ROWS:
            print(f"  ... and {len(plan.corrections) - _PREVIEW_ROWS} more")
        print()
    else:
        print("No rows need correcting.\n")

    print(f"Already correct:            {plan.already_correct}")
    print(f"Skipped, log incomplete:    {plan.skipped_unexplained}")
    print(f"Skipped, no logged reviews: {plan.skipped_no_events}")

    if plan.corrections and not applied:
        print("\nDry run — nothing written. Re-run with --apply to write these changes.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the corrections (default is a dry run)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="database to correct (defaults to this checkout's data/jplearn.db)",
    )
    args = parser.parse_args()

    plan = run_backfill(apply=args.apply, db_path=args.db)
    _print_report(plan, applied=args.apply and bool(plan.corrections))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
