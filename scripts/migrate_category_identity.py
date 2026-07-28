"""One-time collapse of per-card progress duplicated by the category decks.

Reports what would change and exits without writing. Pass ``--apply`` to write.

    python scripts/migrate_category_identity.py            # dry run (default)
    python scripts/migrate_category_identity.py --apply    # move the rows

Before issue #78 a thematic category was a separate deck with its own
``id_offset``, so one word could carry two FSRS schedules and two mastery
counters. This moves any progress stored under a category deck onto the parent
card it resolves to, keeping the further-along of the two.

``--apply`` backs the database up first (``jplearn.db.backup-pre-issue78-*``).
Re-running is a no-op — the source rows are gone after the first pass. See
``data/category_identity_migration.py`` for the policy and what is left alone.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.category_identity_migration import format_report, run_migration  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="move the rows (default is a dry run)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="database to migrate (defaults to this checkout's data/jplearn.db)",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="skip the pre-apply backup copy (not recommended)",
    )
    args = parser.parse_args()

    plan, backup_path = run_migration(
        apply=args.apply, db_path=args.db, backup=not args.no_backup
    )

    print(format_report(plan))
    if backup_path is not None:
        print(f"\nBacked up to {backup_path}")
    if not plan.is_empty and not args.apply:
        print("\nDry run — nothing written. Re-run with --apply to move these rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
