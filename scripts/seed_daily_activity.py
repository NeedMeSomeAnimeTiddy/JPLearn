"""Seed fake daily review activity for visual heatmap testing.

Usage: python scripts/seed_daily_activity.py [--days 365]

Inserts randomized daily review counts into review_events across the
requested lookback window. Useful for verifying the heatmap renders
correctly on a fresh or low-activity install.

This script touches the production database. Run with care.
"""

from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data import database
from data.text_normalization import normalize_storage_text


def _insert_reviews_for_day(day: date, count: int) -> None:
    decks = ["Hiragana", "Katakana", "Kanji", "Vocabulary N5", "Grammar Patterns"]
    for i in range(count):
        deck = random.choice(decks)
        quality = random.choices([4, 3, 1], weights=[60, 25, 15], k=1)[0]
        database.log_review(
            deck_name=deck,
            card_id=random.randint(1, 200),
            quality=quality,
            reviewed_on=day,
            script_tag=normalize_storage_text(deck).lower(),
            prompt_text=normalize_storage_text(random.choice(["あ", "い", "う", "え", "お", "人", "日", "本", "語"])),
            tags=["seeded", "dev"],
            session_id=f"seed-{day.isoformat()}",
        )


def main() -> None:
    days = 365
    if len(sys.argv) > 2 and sys.argv[1] == "--days":
        days = int(sys.argv[2])

    today = date.today()
    start = today - timedelta(days=days - 1)

    # Simulate a realistic study pattern: weekday bias, occasional gaps
    current = start
    while current <= today:
        if current.weekday() < 5:  # weekday
            count = random.randint(8, 30)
        else:  # weekend
            count = random.randint(0, 12) if random.random() > 0.3 else 0

        if count > 0:
            _insert_reviews_for_day(current, count)

        current += timedelta(days=1)

    print(f"Seeded {days} days of daily review activity into review_events.")


if __name__ == "__main__":
    main()
