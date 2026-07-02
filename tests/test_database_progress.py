import sqlite3
from datetime import date, timedelta
from pathlib import Path

from data import database
from data import study_pipeline
from domain.scheduler import ReviewState
from domain.streaks import StreakState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def test_load_today_progress_with_empty_card_list(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    assert database.load_today_progress("Hiragana", []) == (0, 0)


def test_load_today_progress_counts_due_and_completed(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    # Card 1: already reviewed today, no longer due.
    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=1, interval=1, next_review=today + timedelta(days=1)),
    )
    database.log_review("Hiragana", 1, 4, reviewed_on=today)

    # Card 2: still due now and not completed yet today.
    database.save_state(
        "Hiragana",
        ReviewState(card_id=2, repetitions=0, interval=1, next_review=today - timedelta(days=1)),
    )

    due_today, completed_today = database.load_today_progress("Hiragana", [1, 2], on_date=today)
    assert due_today == 2
    assert completed_today == 1


def test_load_today_progress_counts_unique_completed_cards(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    database.save_state(
        "Katakana",
        ReviewState(card_id=10, repetitions=2, interval=6, next_review=today + timedelta(days=6)),
    )
    database.log_review("Katakana", 10, 2, reviewed_on=today)
    database.log_review("Katakana", 10, 4, reviewed_on=today)

    due_today, completed_today = database.load_today_progress("Katakana", [10], on_date=today)
    assert due_today == 1
    assert completed_today == 1


def test_large_card_id_lists_are_chunked_for_sqlite_queries(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()
    card_ids = list(range(1, 2501))

    # Persist sparse rows so loaders must query and also create defaults.
    for cid in (1, 1000, 2000, 2500):
        database.save_state(
            "Sentence Examples",
            ReviewState(card_id=cid, repetitions=1, interval=3, next_review=today),
        )

    for cid, stage in ((1, 1), (1000, 2), (2000, 3), (2500, 2)):
        database.save_curriculum_stage("Sentence Examples", cid, "context_cloze", stage)

    database.log_review("Sentence Examples", 1000, 4, reviewed_on=today)

    states = database.load_states("Sentence Examples", card_ids)
    assert len(states) == len(card_ids)
    assert states[1000].repetitions == 1

    stages = database.load_curriculum_stages("Sentence Examples", "context_cloze", card_ids)
    assert len(stages) == len(card_ids)
    assert stages[1000] == 2
    assert stages[1500] == 1

    due_today, completed_today = database.load_today_progress("Sentence Examples", card_ids, on_date=today)
    assert completed_today == 1
    assert due_today >= completed_today

    mastered_count, summary_due_today, summary_completed_today = database.load_deck_summary_counts(
        "Sentence Examples",
        card_ids,
        on_date=today,
    )
    assert mastered_count == 0
    assert summary_due_today == due_today
    assert summary_completed_today == completed_today


def test_streak_state_defaults_when_missing(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    streak = database.load_streak_state()
    assert streak.current_streak_days == 0
    assert streak.best_streak_days == 0
    assert streak.last_study_day_utc is None
    assert streak.last_study_day_local is None


def test_streak_state_persists_and_resets(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    state = StreakState(
        last_study_day_utc=date(2026, 2, 14),
        last_study_day_local=date(2026, 2, 14),
        current_streak_days=5,
        best_streak_days=9,
    )
    database.save_streak_state(state)

    loaded = database.load_streak_state()
    assert loaded == state

    database.reset_db()
    reset = database.load_streak_state()
    assert reset.current_streak_days == 0
    assert reset.best_streak_days == 0
    assert reset.last_study_day_utc is None
    assert reset.last_study_day_local is None


def test_review_card_updates_streak_by_local_day(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    state = ReviewState(card_id=1)
    study_pipeline.review_card(
        "Hiragana",
        state,
        quality=4,
        reviewed_on_local=date(2026, 3, 1),
        reviewed_on_utc=date(2026, 3, 1),
    )
    first = database.load_streak_state()
    assert first.current_streak_days == 1
    assert first.best_streak_days == 1

    study_pipeline.review_card(
        "Hiragana",
        state,
        quality=4,
        reviewed_on_local=date(2026, 3, 1),
        reviewed_on_utc=date(2026, 3, 1),
    )
    same_day = database.load_streak_state()
    assert same_day.current_streak_days == 1
    assert same_day.best_streak_days == 1

    study_pipeline.review_card(
        "Hiragana",
        state,
        quality=4,
        reviewed_on_local=date(2026, 3, 2),
        reviewed_on_utc=date(2026, 3, 2),
    )
    next_day = database.load_streak_state()
    assert next_day.current_streak_days == 2
    assert next_day.best_streak_days == 2


def test_load_activity_summary_aggregates_window_metrics(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    # In range for a 7-day window ending 2026-03-07.
    database.log_review("Hiragana", 1, 4, reviewed_on=date(2026, 3, 1))
    database.log_review("Hiragana", 2, 2, reviewed_on=date(2026, 3, 2))
    database.log_review("Katakana", 3, 5, reviewed_on=date(2026, 3, 2))

    # Out of range.
    database.log_review("Kanji", 4, 4, reviewed_on=date(2026, 2, 20))

    summary = database.load_activity_summary(7, on_date=date(2026, 3, 7))
    assert summary.days == 7
    assert summary.reviewed == 3
    assert summary.correct == 2
    assert summary.incorrect == 1
    assert summary.accuracy == 67
    assert summary.points_earned == 2
    assert summary.active_days == 2


def test_load_activity_summary_handles_empty_window(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    summary = database.load_activity_summary(30, on_date=date(2026, 4, 10))
    assert summary.days == 30
    assert summary.reviewed == 0
    assert summary.correct == 0
    assert summary.incorrect == 0
    assert summary.accuracy == 0
    assert summary.points_earned == 0
    assert summary.active_days == 0


def test_load_mistake_breakdown_orders_weakest_first(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    # hiragana: 3 attempts, 2 mistakes -> 67%
    database.log_review("Hiragana", 1, 2, script_tag="hiragana")
    database.log_review("Hiragana", 2, 1, script_tag="hiragana")
    database.log_review("Hiragana", 3, 4, script_tag="hiragana")

    # katakana: 3 attempts, 1 mistake -> 33%
    database.log_review("Katakana", 1, 2, script_tag="katakana")
    database.log_review("Katakana", 2, 4, script_tag="katakana")
    database.log_review("Katakana", 3, 5, script_tag="katakana")

    # kanji: 2 attempts, 2 mistakes -> 100%
    database.log_review("Kanji", 1, 0, script_tag="kanji")
    database.log_review("Kanji", 2, 1, script_tag="kanji")

    rows = database.load_mistake_breakdown(limit=3)
    assert [row.key for row in rows] == ["kanji", "hiragana", "katakana"]
    assert [row.error_rate for row in rows] == [100, 67, 33]


def test_load_mistake_breakdown_uses_unknown_when_script_missing(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    database.log_review("Deck", 1, 0)
    rows = database.load_mistake_breakdown(limit=3)
    assert rows[0].key == "unknown"


def test_load_mistake_breakdown_empty(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    assert database.load_mistake_breakdown(limit=5) == []


def test_load_raw_item_history_orders_events_newest_first(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.log_review(
        "Hiragana",
        1,
        4,
        reviewed_on=date(2026, 3, 1),
        reviewed_at_utc="2026-03-01T08:00:00+00:00",
        script_tag="hiragana",
    )
    database.log_review(
        "Hiragana",
        1,
        1,
        reviewed_on=date(2026, 3, 2),
        reviewed_at_utc="2026-03-02T08:00:00+00:00",
        script_tag="hiragana",
    )

    history = database.load_raw_item_history(limit_items=8, events_per_item=8)
    assert len(history) == 1
    assert history[0].events[0].reviewed_at_utc == "2026-03-02T08:00:00+00:00"
    assert history[0].events[1].reviewed_at_utc == "2026-03-01T08:00:00+00:00"


def test_load_raw_item_history_uses_first_non_empty_prompt(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.log_review(
        "Vocabulary N5",
        496,
        4,
        reviewed_on=date(2026, 3, 2),
        reviewed_at_utc="2026-03-02T08:00:00+00:00",
        script_tag="vocab_n5",
        prompt_text="",
    )
    database.log_review(
        "Vocabulary N5",
        496,
        1,
        reviewed_on=date(2026, 3, 1),
        reviewed_at_utc="2026-03-01T08:00:00+00:00",
        script_tag="vocab_n5",
        prompt_text="食べる",
    )

    history = database.load_raw_item_history(limit_items=8, events_per_item=8)
    assert len(history) == 1
    assert history[0].prompt == "食べる"


def test_log_review_normalizes_japanese_prompt_text_and_deck_name(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "jplearn-test.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    database.init_db()

    database.log_review(
        " ｶﾀｶﾅ ",
        1,
        4,
        prompt_text=" ﾊﾟｰﾃｨ—､｡ ",
        script_tag=" KATAKANA ",
    )

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT deck, prompt_text, script_tag FROM review_events"
        ).fetchone()

    assert row is not None
    assert row[0] == "カタカナ"
    assert row[1] == "パーティー、。"
    assert row[2] == "katakana"


def test_save_state_and_load_states_share_normalized_deck_key(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_state(
        " ｶﾀｶﾅ ",
        ReviewState(card_id=7, repetitions=2, interval=4, next_review=date(2026, 4, 4)),
    )

    states = database.load_states("カタカナ", [7])
    assert states[7].interval == 4


def test_load_raw_item_history_respects_item_and_event_limits(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for card_id in (1, 2, 3):
        database.log_review(
            "Hiragana",
            card_id,
            4,
            reviewed_on=date(2026, 3, card_id),
            reviewed_at_utc=f"2026-03-0{card_id}T08:00:00+00:00",
            script_tag="hiragana",
        )
    database.log_review(
        "Hiragana",
        3,
        2,
        reviewed_on=date(2026, 3, 4),
        reviewed_at_utc="2026-03-04T08:00:00+00:00",
        script_tag="hiragana",
    )

    history = database.load_raw_item_history(limit_items=2, events_per_item=1)
    assert len(history) == 2
    assert all(len(bucket.events) == 1 for bucket in history)


def test_load_item_history_applies_deterministic_trend(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    # Oldest -> newest outcomes: fail, fail, fail, pass, pass, pass (improving)
    outcomes = [1, 0, 2, 4, 5, 4]
    for index, quality in enumerate(outcomes, start=1):
        database.log_review(
            "Hiragana",
            9,
            quality,
            reviewed_on=date(2026, 3, index),
            reviewed_at_utc=f"2026-03-0{index}T08:00:00+00:00",
            script_tag="hiragana",
        )

    histories = study_pipeline.load_item_history(limit_items=8, events_per_item=8)
    assert histories[0].trend == "improving"


def test_leech_state_enters_and_exits_based_on_recent_attempts(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    state = ReviewState(card_id=42)
    # Enter leech state: 3 failures in 5 recent attempts.
    for quality in [0, 1, 2, 4, 4]:
        study_pipeline.review_card("Hiragana", state, quality=quality)

    active_ids = study_pipeline.load_active_leech_card_ids("Hiragana")
    assert 42 in active_ids

    # Exit leech state: push window toward successful outcomes.
    for quality in [4, 4, 4]:
        study_pipeline.review_card("Hiragana", state, quality=quality)

    active_ids_after = study_pipeline.load_active_leech_card_ids("Hiragana")
    assert 42 not in active_ids_after


def test_review_minigame_result_persists_quality_and_tags(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    updated = study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=99,
        is_correct=False,
        script_tag="hiragana",
        tags=["minigame", "interleave_mix"],
        reviewed_on_local=date(2026, 6, 25),
        reviewed_on_utc=date(2026, 6, 25),
    )
    assert updated.card_id == 99

    states = database.load_states("Hiragana", [99])
    assert states[99].repetitions == updated.repetitions

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT quality, script_tag, tags_csv
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 99),
        ).fetchone()

    assert row is not None
    assert row["quality"] == 1
    assert row["script_tag"] == "hiragana"
    assert row["tags_csv"] == "minigame,interleave_mix"


def test_review_minigame_result_uses_normalized_deck_for_default_script_tag(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name=" ｶﾀｶﾅ deck ",
        card_id=77,
        is_correct=True,
        script_tag="",
    )

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT script_tag
            FROM review_events
            WHERE card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            (77,),
        ).fetchone()

    assert row is not None
    assert row["script_tag"] == "カタカナ_deck"


def test_review_minigame_result_persists_curriculum_stage(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=17,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=3,
        script_tag="hiragana",
        tags=["minigame", "context_cloze"],
    )

    stages = study_pipeline.load_curriculum_stages("Hiragana", "context_cloze", [17])
    assert stages[17] == 3


def test_review_minigame_result_narrative_updates_context_cloze_stage(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=18,
        is_correct=True,
        minigame="narrative_story",
        curriculum_stage=2,
        script_tag="hiragana",
        tags=["minigame", "narrative_story", "chapter_2"],
    )

    stages = study_pipeline.load_curriculum_stages("Hiragana", "context_cloze", [18])
    assert stages[18] == 3


def test_load_curriculum_stage_summary_aggregates_distribution_and_accuracy(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=1,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=1,
        script_tag="hiragana",
        tags=["minigame", "context_cloze"],
    )
    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=2,
        is_correct=False,
        minigame="context_cloze",
        curriculum_stage=3,
        script_tag="hiragana",
        tags=["minigame", "context_cloze"],
    )

    summary = study_pipeline.load_curriculum_stage_summary("context_cloze")
    assert summary["mode"] == "context_cloze"
    assert summary["attempts"] == 2
    assert summary["accuracy"] == 50
    stage_distribution = summary["stage_distribution"]
    assert stage_distribution[2] == 2
    assert stage_distribution[1] == 0
    assert stage_distribution[3] == 0


def test_load_curriculum_stage_summary_supports_script_filter(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=11,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=1,
        script_tag="hiragana",
        tags=["minigame", "context_cloze"],
    )
    study_pipeline.review_minigame_result(
        deck_name="Kanji N5",
        card_id=12,
        is_correct=False,
        minigame="context_cloze",
        curriculum_stage=2,
        script_tag="kanji_n5",
        tags=["minigame", "context_cloze"],
    )

    hira = study_pipeline.load_curriculum_stage_summary("context_cloze", script_tag="hiragana")
    kanji = study_pipeline.load_curriculum_stage_summary("context_cloze", script_tag="kanji_n5")

    assert hira["attempts"] == 1
    assert hira["accuracy"] == 100
    assert kanji["attempts"] == 1
    assert kanji["accuracy"] == 0


def test_load_narrative_chapter_summary_aggregates_chapter_metrics(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=21,
        is_correct=True,
        minigame="narrative_story",
        curriculum_stage=1,
        script_tag="hiragana",
        tags=["minigame", "narrative_story", "chapter_1"],
    )
    study_pipeline.review_minigame_result(
        deck_name="Hiragana",
        card_id=22,
        is_correct=False,
        minigame="narrative_story",
        curriculum_stage=2,
        script_tag="hiragana",
        tags=["minigame", "narrative_story", "chapter_2"],
    )

    summary = database.load_narrative_chapter_summary(script_tag="hiragana")
    assert summary["mode"] == "narrative_story"
    assert summary["attempts"] == 2
    assert summary["accuracy"] == 50
    chapters = summary["chapters"]
    assert chapters["1"]["attempts"] == 1
    assert chapters["2"]["attempts"] == 1
    assert chapters["1"]["completion_rate"] == 100
    assert chapters["2"]["completion_rate"] == 50
    assert chapters["3"]["completion_rate"] == 0
