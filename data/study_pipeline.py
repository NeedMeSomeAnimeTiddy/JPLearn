"""Review-flow orchestration used by the Qt UI."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from data import database
from data.database import CurriculumStageSummary, NarrativeChapterSummary
from data.text_normalization import normalize_storage_text
from domain.activity import ActivitySummary
from domain.assistant import compute_assistant_state, evaluate_assistant_events
from domain.curriculum import next_stage
from domain.history import ItemHistory, RawItemHistoryBucket, classify_review_trend
from domain.mistakes import MistakeBreakdownRow
from domain.retrieval import embed_text, rank_by_similarity
from domain.scheduler import ReviewState, update
from domain.session import SessionGoal, SessionSummary
from domain.streaks import StreakState, apply_study_day

PHASE3_CONTEXT_FACT_LIMIT = 4
PHASE3_CONTEXT_SUMMARY_LIMIT = 2
MEMORY_GRAPH_FACT_LIMIT = 6
MEMORY_GRAPH_SUMMARY_LIMIT = 3


def _format_strengths(activity_week: ActivitySummary, streak: StreakState) -> str:
    if activity_week.accuracy >= 82 and activity_week.reviewed >= 20:
        return "High recent consistency and accuracy in review flow."
    if streak.current_streak_days >= 5:
        return f"Reliable study rhythm with {streak.current_streak_days}-day streak."
    if activity_week.points_earned >= 20:
        return "Solid momentum with steady points earned this week."
    return "Early momentum in progress; preserve daily study cadence."


def _format_weaknesses(mistakes: list[MistakeBreakdownRow], leech_count: int) -> str:
    weakest = mistakes[0] if mistakes else None
    if weakest is None:
        if leech_count > 0:
            return f"Leech pressure remains active ({leech_count} cards)."
        return "No acute weak area detected in current window."

    suffix = f"; {leech_count} leech cards active" if leech_count > 0 else ""
    return f"Weakest area: {weakest.key} ({weakest.error_rate}% error){suffix}."


def _format_recent_activity(activity_week: ActivitySummary, item_history: list[ItemHistory]) -> str:
    recent_items = ", ".join(f"{item.script_tag}:{item.trend}" for item in item_history[:3])
    if not recent_items:
        recent_items = "no recent item trend snapshots"
    return (
        f"7d reviewed={activity_week.reviewed}, accuracy={activity_week.accuracy}%, "
        f"active_days={activity_week.active_days}; trends={recent_items}"
    )


def _format_goals(session_summary: SessionSummary | None) -> str:
    if session_summary is None:
        return "No active session goal context in memory."
    status = "met" if session_summary.goal_met else "in-progress"
    return (
        f"Session {session_summary.session_id} {status}: completed={session_summary.completed_items}/"
        f"{session_summary.target_items}, accuracy={session_summary.accuracy}%"
    )


def _format_commitments() -> str:
    commitments = database.load_recent_assistant_commitments(limit=3)
    if commitments:
        encoded = [
            f"{item['action_type'] or 'action'}:{item['target_mode'] or 'mode'}:{item['focus_area'] or 'general'}"
            for item in commitments
        ]
        return "; ".join(encoded)

    facts = database.load_assistant_memory_facts(limit=20)
    fact_map = {
        str(fact["fact_key"]): str(fact["fact_value"])
        for fact in facts
    }
    action = fact_map.get("coach.commitment.action", "")
    target = fact_map.get("coach.commitment.target_mode", "")
    focus = fact_map.get("coach.commitment.focus_area", "")
    if action or target or focus:
        return f"{action or 'action'}:{target or 'mode'}:{focus or 'general'}"
    return "No outstanding assistant commitments logged."


def _extract_query_terms(user_message: str | None) -> list[str]:
    if not user_message:
        return []
    tokens = re.findall(r"[a-z0-9_]+", user_message.lower())
    seen: list[str] = []
    for token in tokens:
        if len(token) < 3:
            continue
        if token in seen:
            continue
        seen.append(token)
    return seen[:10]


def _score_relevance(text: str, query_terms: list[str]) -> int:
    if not query_terms:
        return 0
    lowered = text.lower()
    return sum(1 for term in query_terms if term in lowered)


def _select_relevant_facts(
    facts: list[dict[str, str | int | None]],
    query_terms: list[str],
    max_items: int,
) -> list[dict[str, str | int | None]]:
    if max_items <= 0:
        return []

    ranked = sorted(
        facts,
        key=lambda fact: (
            _score_relevance(f"{fact['fact_key']} {fact['fact_value']}", query_terms),
            str(fact["updated_at_utc"]),
        ),
        reverse=True,
    )
    return ranked[:max_items]


def _select_relevant_summaries(
    summaries: list[dict[str, str | int]],
    query_terms: list[str],
    max_items: int,
) -> list[dict[str, str | int]]:
    if max_items <= 0:
        return []

    ranked = sorted(
        summaries,
        key=lambda summary: (
            _score_relevance(
                f"{summary.get('focus_tags', '')} {summary.get('latest_user_intent', '')} {summary.get('latest_coach_reply', '')}",
                query_terms,
            ),
            str(summary.get("created_at_utc", "")),
        ),
        reverse=True,
    )
    return ranked[:max_items]


def _format_memory_rollup(user_message: str | None = None) -> str:
    query_terms = _extract_query_terms(user_message)
    facts = database.load_assistant_memory_facts(limit=24)
    summaries = database.load_recent_assistant_chat_summaries(limit=8)

    selected_facts = _select_relevant_facts(facts, query_terms, PHASE3_CONTEXT_FACT_LIMIT)
    selected_summaries = _select_relevant_summaries(
        summaries,
        query_terms,
        PHASE3_CONTEXT_SUMMARY_LIMIT,
    )

    fact_fragments = [
        f"{fact['fact_key']}={fact['fact_value']}"
        for fact in selected_facts
    ]
    summary_fragments = [
        (
            f"focus={summary.get('focus_tags', 'general')};"
            f"intent={summary.get('latest_user_intent', '')}"
        )
        for summary in selected_summaries
    ]

    left = " | ".join(fact_fragments[:4]) if fact_fragments else "no semantic facts"
    right = " | ".join(summary_fragments[:2]) if summary_fragments else "no chat summaries"
    return f"facts[{left}] summaries[{right}]"


def _select_relevant_facts_by_embedding(
    facts: list[dict[str, str | int | None]],
    query_vector: list[float],
    max_items: int,
    embed_fn=embed_text,
) -> list[dict[str, str | int | None]]:
    if max_items <= 0 or not facts:
        return []
    candidates = [
        (str(index), embed_fn(f"{fact['fact_key']} {fact['fact_value']}"))
        for index, fact in enumerate(facts)
    ]
    ranked = rank_by_similarity(query_vector, candidates, top_k=max_items)
    return [facts[int(item.key)] for item in ranked]


def _select_relevant_summaries_by_embedding(
    summaries: list[dict[str, str | int]],
    query_vector: list[float],
    max_items: int,
    embed_fn=embed_text,
) -> list[dict[str, str | int]]:
    if max_items <= 0 or not summaries:
        return []
    candidates = [
        (
            str(index),
            embed_fn(
                f"{summary.get('focus_tags', '')} {summary.get('latest_user_intent', '')} "
                f"{summary.get('latest_coach_reply', '')}"
            ),
        )
        for index, summary in enumerate(summaries)
    ]
    ranked = rank_by_similarity(query_vector, candidates, top_k=max_items)
    return [summaries[int(item.key)] for item in ranked]


def _format_memory_rollup_v2(user_message: str | None = None, embed_fn=None) -> str:
    """Like ``_format_memory_rollup``, but ranks facts/summaries by embedding
    similarity to ``user_message`` instead of substring keyword overlap.

    ``embed_fn`` defaults to the pure, dependency-free fallback embedder in
    ``domain.retrieval``. Callers (see scripts/desktop_bridge.py) may inject a
    real ONNX-based embedder (scripts/embedder_runtime.py) when available.
    """
    encode = embed_fn or embed_text
    facts = database.load_assistant_memory_facts(limit=24)
    summaries = database.load_recent_assistant_chat_summaries(limit=8)

    if user_message and user_message.strip():
        query_vector = encode(user_message)
        selected_facts = _select_relevant_facts_by_embedding(facts, query_vector, PHASE3_CONTEXT_FACT_LIMIT, encode)
        selected_summaries = _select_relevant_summaries_by_embedding(
            summaries,
            query_vector,
            PHASE3_CONTEXT_SUMMARY_LIMIT,
            encode,
        )
    else:
        selected_facts = facts[:PHASE3_CONTEXT_FACT_LIMIT]
        selected_summaries = summaries[:PHASE3_CONTEXT_SUMMARY_LIMIT]

    fact_fragments = [
        f"{fact['fact_key']}={fact['fact_value']}"
        for fact in selected_facts
    ]
    summary_fragments = [
        (
            f"focus={summary.get('focus_tags', 'general')};"
            f"intent={summary.get('latest_user_intent', '')}"
        )
        for summary in selected_summaries
    ]

    left = " | ".join(fact_fragments[:4]) if fact_fragments else "no semantic facts"
    right = " | ".join(summary_fragments[:2]) if summary_fragments else "no chat summaries"
    embedder_tag = "onnx-e5" if embed_fn else "hashed-trigram-v1"
    return f"facts[{left}] summaries[{right}] (embedder={embedder_tag})"


def _load_assistant_chat_context_inputs(session_id: str | None = None) -> dict[str, object]:
    """Load shared context inputs once for chat context assembly."""
    profile = database.load_assistant_profile()
    state = database.load_latest_assistant_state()
    streak = database.load_streak_state()
    activity_week = database.load_activity_summary(7)
    mistakes = database.load_mistake_breakdown(limit=3)
    leech_count = database.load_active_leech_count()
    item_history = load_item_history(limit_items=4, events_per_item=3)
    session_summary = database.load_session_summary(session_id) if session_id else None
    return {
        "profile": profile,
        "state": state,
        "streak": streak,
        "activity_week": activity_week,
        "mistakes": mistakes,
        "leech_count": leech_count,
        "item_history": item_history,
        "session_summary": session_summary,
    }


def _format_unified_memory_graph(
    selected_facts: list[dict[str, str | int | None]],
    selected_summaries: list[dict[str, str | int]],
    context_inputs: dict[str, object],
) -> str:
    """Compose a compact learner memory graph from profile, signals, and memory hits.

    The graph is serialized as deterministic fragments so local LLM context
    receives one stable, compact memory representation across app surfaces.
    """
    profile = context_inputs["profile"]
    activity_week = context_inputs["activity_week"]
    streak = context_inputs["streak"]
    mistakes = context_inputs["mistakes"]
    leech_count = context_inputs["leech_count"]
    session_summary = context_inputs["session_summary"]

    fact_map = {
        str(fact["fact_key"]): str(fact["fact_value"])
        for fact in selected_facts
    }

    weakest_bucket = "none"
    if mistakes:
        weakest_bucket = str(mistakes[0].key)
    elif fact_map.get("study.weakest_bucket"):
        weakest_bucket = fact_map["study.weakest_bucket"]

    focus_area = fact_map.get("coach.focus_area", fact_map.get("coach.commitment.focus_area", "general"))
    commitment_action = fact_map.get("coach.commitment.action", "none")
    commitment_mode = fact_map.get("coach.commitment.target_mode", "none")

    summary_fragments = []
    for summary in selected_summaries[:MEMORY_GRAPH_SUMMARY_LIMIT]:
        summary_fragments.append(
            f"{summary.get('focus_tags', 'general')}:{summary.get('latest_user_intent', '')}"
        )

    memory_hits = [
        f"{fact['fact_key']}={fact['fact_value']}"
        for fact in selected_facts[:MEMORY_GRAPH_FACT_LIMIT]
    ]

    profile_node = (
        f"style={profile.get('persona_style', 'coach')},"
        f"backend={profile.get('llm_backend', 'llama.cpp')},"
        f"cadence={profile.get('popup_cadence', 'high')}"
    )
    performance_node = (
        f"acc7d={activity_week.accuracy},"
        f"reviewed7d={activity_week.reviewed},"
        f"streak={streak.current_streak_days}"
    )
    focus_node = (
        f"focus={focus_area},"
        f"weakest={weakest_bucket},"
        f"leech={leech_count}"
    )
    commitment_node = f"action={commitment_action},mode={commitment_mode}"
    goal_node = (
        "none"
        if session_summary is None
        else f"{session_summary.completed_items}/{session_summary.target_items}@{session_summary.accuracy}%"
    )
    summary_node = " | ".join(summary_fragments) if summary_fragments else "none"
    memory_node = " | ".join(memory_hits) if memory_hits else "none"

    return (
        f"profile[{''.join(profile_node)}] "
        f"performance[{''.join(performance_node)}] "
        f"focus[{''.join(focus_node)}] "
        f"commitments[{commitment_node}] "
        f"goal[{goal_node}] "
        f"summaries[{summary_node}] "
        f"facts[{memory_node}]"
    )


def init_study_db() -> None:
    """Ensure review-flow tables exist."""
    database.init_db()


def reset_study_db() -> None:
    """Clear all review-flow progress data from persistence."""
    database.reset_db()


def load_review_states(deck_name: str, card_ids: list[int]) -> dict[int, ReviewState]:
    """Load review states for deck cards, creating defaults for missing rows."""
    return database.load_states(deck_name, card_ids)


def review_card(
    deck_name: str,
    state: ReviewState,
    quality: int,
    script_tag: str = "",
    curriculum_stage: int | None = None,
    prompt_text: str = "",
    tags: list[str] | None = None,
    session_id: str = "",
    confidence_score: int | None = None,
    reviewed_on_local: date | None = None,
    reviewed_on_utc: date | None = None,
) -> ReviewState:
    """Apply one review outcome, persist state/event, and return updated state."""
    review_day_local = reviewed_on_local or date.today()
    review_day_utc = reviewed_on_utc or datetime.now(timezone.utc).date()
    review_timestamp_utc = (
        f"{review_day_utc.isoformat()}T00:00:00+00:00"
        if reviewed_on_utc is not None
        else datetime.now(timezone.utc).isoformat(timespec="seconds")
    )
    normalized_script_tag = normalize_storage_text(script_tag).lower()
    if not normalized_script_tag:
        normalized_script_tag = normalize_storage_text(deck_name).lower().replace(" ", "_")

    updated_state = update(state, quality, confidence=confidence_score)
    database.save_state(deck_name, updated_state)
    database.log_review(
        deck_name,
        updated_state.card_id,
        quality,
        reviewed_on=review_day_local,
        reviewed_at_utc=review_timestamp_utc,
        script_tag=normalized_script_tag,
        curriculum_stage=curriculum_stage,
        prompt_text=prompt_text,
        tags=tags,
        session_id=session_id,
        confidence_score=confidence_score,
    )
    database.update_leech_state_for_card(deck_name, updated_state.card_id)
    next_streak = apply_study_day(database.load_streak_state(), review_day_utc, review_day_local)
    database.save_streak_state(next_streak)
    return updated_state


def review_minigame_result(
    deck_name: str,
    card_id: int,
    is_correct: bool,
    minigame: str = "",
    curriculum_stage: int | None = None,
    script_tag: str = "",
    prompt_text: str = "",
    tags: list[str] | None = None,
    session_id: str = "",
    confidence_score: int | None = None,
    reviewed_on_local: date | None = None,
    reviewed_on_utc: date | None = None,
) -> ReviewState:
    """Persist one minigame outcome by mapping correctness to review quality."""
    state = load_review_states(deck_name, [card_id]).get(card_id, ReviewState(card_id=card_id))
    quality = 4 if is_correct else 1
    updated_state = review_card(
        deck_name,
        state,
        quality=quality,
        script_tag=script_tag,
        curriculum_stage=curriculum_stage,
        prompt_text=prompt_text,
        tags=tags,
        session_id=session_id,
        confidence_score=confidence_score,
        reviewed_on_local=reviewed_on_local,
        reviewed_on_utc=reviewed_on_utc,
    )
    normalized_minigame = minigame.strip().lower()
    stage_mode = (
        "context_cloze"
        if normalized_minigame in {"particle_cloze", "imposter"}
        else normalized_minigame
    )
    if curriculum_stage is not None and stage_mode:
        resolved_stage = next_stage(curriculum_stage, is_correct)
        database.save_curriculum_stage(deck_name, card_id, stage_mode, resolved_stage)
    return updated_state


def load_curriculum_stages(deck_name: str, mode: str, card_ids: list[int]) -> dict[int, int]:
    """Load persisted curriculum stages for one deck/mode."""
    return database.load_curriculum_stages(deck_name, mode, card_ids)


def load_curriculum_stage_summary(mode: str, script_tag: str | None = None) -> CurriculumStageSummary:
    """Return aggregate curriculum metrics for overview screens."""
    return database.load_curriculum_stage_summary(mode, script_tag=script_tag)


def load_narrative_chapter_summary(script_tag: str | None = None) -> NarrativeChapterSummary:
    """Return chapter-level narrative story metrics for overview screens."""
    return database.load_narrative_chapter_summary(script_tag=script_tag)


def load_today_progress(
    deck_name: str, card_ids: list[int], on_date: date | None = None
) -> tuple[int, int]:
    """Return ``(due_today, completed_today)`` for the selected deck cards."""
    return database.load_today_progress(deck_name, card_ids, on_date=on_date)


def load_deck_summary_counts(
    deck_name: str,
    card_ids: list[int],
    on_date: date | None = None,
) -> tuple[int, int, int]:
    """Return ``(mastered_count, due_today, completed_today)`` for summary screens."""
    return database.load_deck_summary_counts(deck_name, card_ids, on_date=on_date)


def load_streak_state() -> StreakState:
    """Return persisted daily streak information."""
    return database.load_streak_state()


def load_activity_summary(window_days: int, on_date: date | None = None) -> ActivitySummary:
    """Return aggregated activity metrics for a rolling day window."""
    return database.load_activity_summary(window_days, on_date=on_date)


def load_mistake_breakdown(limit: int = 6) -> list[MistakeBreakdownRow]:
    """Return grouped mistake metrics ordered by weakest buckets first."""
    return database.load_mistake_breakdown(limit=limit)


def load_item_history(limit_items: int = 8, events_per_item: int = 8) -> list[ItemHistory]:
    """Return per-item timeline payloads with deterministic trend classification."""
    raw: list[RawItemHistoryBucket] = database.load_raw_item_history(
        limit_items=limit_items,
        events_per_item=events_per_item,
    )

    histories: list[ItemHistory] = []
    for bucket in raw:
        # Data layer returns newest-first events; trend logic expects oldest-first.
        oldest_to_newest_successes = list(reversed(bucket.successes))
        trend = classify_review_trend(oldest_to_newest_successes)
        histories.append(
            ItemHistory(
                key=bucket.key,
                script_tag=bucket.script_tag,
                deck=bucket.deck,
                card_id=bucket.card_id,
                prompt=bucket.prompt,
                trend=trend,
                events=bucket.events,
            )
        )

    return histories


def load_active_leech_card_ids(deck_name: str) -> set[int]:
    """Return active leech card ids for one deck."""
    return database.load_active_leech_card_ids(deck_name)


def save_session_goal(
    session_id: str,
    target_items: int,
    target_minutes: int | None = None,
    target_accuracy: int | None = None,
    started_at_utc: str | None = None,
) -> SessionGoal:
    """Persist one session goal payload."""
    return database.save_session_goal(
        session_id=session_id,
        target_items=target_items,
        target_minutes=target_minutes,
        target_accuracy=target_accuracy,
        started_at_utc=started_at_utc,
    )


def load_session_summary(session_id: str) -> SessionSummary | None:
    """Load computed completion metrics for one session id."""
    return database.load_session_summary(session_id)


def load_assistant_snapshot(session_id: str | None = None) -> dict[str, object]:
    """Compute deterministic tutor state/events and persist a new snapshot."""
    profile = database.load_assistant_profile()
    popup_cadence = str(profile.get("popup_cadence", "high")).lower()
    if popup_cadence not in {"low", "medium", "high"}:
        popup_cadence = "high"

    dedup_window_by_cadence = {
        "high": 180,
        "medium": 240,
        "low": 360,
    }

    activity_week = database.load_activity_summary(7)
    streak = database.load_streak_state()
    mistakes = database.load_mistake_breakdown(limit=6)
    item_history = load_item_history(limit_items=8, events_per_item=8)
    leech_count = database.load_active_leech_count()
    curriculum_summary = database.load_curriculum_stage_summary(mode="context_cloze")
    session_summary = database.load_session_summary(session_id) if session_id else None
    latest_state = database.load_latest_assistant_state()
    prior_momentum = latest_state.momentum if latest_state is not None else 0
    long_horizon_momentum = database.load_assistant_long_horizon_momentum(limit=24)
    recent_dedup_keys = database.load_recent_assistant_event_dedup_keys(
        window_minutes=dedup_window_by_cadence[popup_cadence],
    )
    now_utc = datetime.now(timezone.utc)

    state = compute_assistant_state(
        activity_week=activity_week,
        streak=streak,
        mistakes=mistakes,
        item_history=item_history,
        leech_count=leech_count,
        session_summary=session_summary,
        prior_momentum=prior_momentum,
        long_horizon_momentum=long_horizon_momentum,
        curriculum_attempts=curriculum_summary["attempts"],
        curriculum_accuracy_7d=curriculum_summary["accuracy_7d"],
    )
    events = evaluate_assistant_events(
        state=state,
        activity_week=activity_week,
        streak=streak,
        mistakes=mistakes,
        leech_count=leech_count,
        session_summary=session_summary,
        now_utc=now_utc,
        popup_cadence=popup_cadence,
        recently_emitted_dedup_keys=recent_dedup_keys,
        curriculum_attempts=curriculum_summary["attempts"],
        curriculum_accuracy_7d=curriculum_summary["accuracy_7d"],
    )

    database.save_assistant_state_snapshot(state)
    database.enqueue_assistant_events(
        events,
        dedup_window_minutes=dedup_window_by_cadence[popup_cadence],
    )

    database.upsert_assistant_memory_fact("coach.focus_area", state.focus_area, source="snapshot")
    database.upsert_assistant_memory_fact("coach.last_major_event", state.last_major_event, source="snapshot")
    database.upsert_assistant_memory_fact("coach.mood", state.mood, source="snapshot")
    database.upsert_assistant_memory_fact("coach.momentum", str(state.momentum), source="snapshot")
    database.upsert_assistant_memory_fact("coach.confidence", str(state.confidence_level), source="snapshot")
    database.upsert_assistant_memory_fact("study.streak_days", str(streak.current_streak_days), source="signals")
    database.upsert_assistant_memory_fact("study.week_reviewed", str(activity_week.reviewed), source="signals")
    database.upsert_assistant_memory_fact("study.week_accuracy", str(activity_week.accuracy), source="signals")
    database.upsert_assistant_memory_fact("study.activity_days_7d", str(activity_week.active_days), source="signals")
    database.upsert_assistant_memory_fact("study.leech_count", str(leech_count), source="signals")
    database.upsert_assistant_memory_fact(
        "study.curriculum_accuracy_7d",
        str(curriculum_summary["accuracy_7d"]),
        source="signals",
    )
    if mistakes:
        database.upsert_assistant_memory_fact("study.weakest_bucket", mistakes[0].key, source="signals")
        database.upsert_assistant_memory_fact(
            "study.weakest_error_rate",
            str(mistakes[0].error_rate),
            source="signals",
        )
    if events:
        top_event = events[0]
        action_type = top_event.metadata.get("action_type", "")
        target_mode = top_event.metadata.get("target_mode", "")
        focus_area = top_event.metadata.get("focus_area", state.focus_area)
        if action_type:
            database.upsert_assistant_memory_fact("coach.commitment.action", action_type, source="events")
        if target_mode:
            database.upsert_assistant_memory_fact("coach.commitment.target_mode", target_mode, source="events")
        if focus_area:
            database.upsert_assistant_memory_fact("coach.commitment.focus_area", focus_area, source="events")

    database.prune_assistant_memory_facts(max_facts=120)
    database.compact_assistant_chat_memory(max_turns=20, summary_batch_size=12, max_summaries=40)

    return {
        "profile": profile,
        "state": {
            "mood": state.mood,
            "momentum": state.momentum,
            "confidence_level": state.confidence_level,
            "focus_area": state.focus_area,
            "last_major_event": state.last_major_event,
        },
        "events": [
            {
                "event_type": event.event_type,
                "priority": event.priority,
                "message_key": event.message_key,
                "metadata": event.metadata,
            }
            for event in events
        ],
    }


def load_pending_assistant_events(limit: int = 8) -> list[dict[str, object]]:
    """Return pending scripted tutor events for renderer consumption."""
    pending = database.load_pending_assistant_events(limit=limit)
    return [
        {
            "id": event_id,
            "event_type": event.event_type,
            "priority": event.priority,
            "message_key": event.message_key,
            "metadata": event.metadata,
        }
        for event_id, event in pending
    ]


def consume_assistant_events(event_ids: list[int]) -> None:
    """Acknowledge rendered tutor events so they are not replayed."""
    database.mark_assistant_events_consumed(event_ids)


def track_assistant_event_interaction(
    event_id: int,
    interaction_type: str,
    metadata: dict[str, str] | None = None,
) -> None:
    """Persist renderer telemetry for scripted tutor event interactions."""
    database.log_assistant_event_interaction(
        event_id=event_id,
        interaction_type=interaction_type,
        metadata=metadata,
    )


def append_assistant_chat_turn(role: str, content: str) -> None:
    """Persist one local tutor chat turn and enforce minimal retention."""
    database.append_assistant_chat_turn(role, content)
    database.compact_assistant_chat_memory(max_turns=20, summary_batch_size=12, max_summaries=40)


def load_recent_assistant_chat_turns(limit: int = 20) -> list[dict[str, str]]:
    """Load recent local tutor chat turns for context assembly."""
    return database.load_recent_assistant_chat_turns(limit=limit)


def clear_assistant_chat() -> int:
    """Remove all stored local tutor chat turns and summaries."""
    return database.clear_assistant_chat()



def _assemble_assistant_chat_context_base(context_inputs: dict[str, object]) -> dict[str, str]:
    """Build the memory-independent portion of chat context (shared by v1/v2)."""
    profile = context_inputs["profile"]
    state = context_inputs["state"]
    streak = context_inputs["streak"]
    activity_week = context_inputs["activity_week"]
    mistakes = context_inputs["mistakes"]
    leech_count = context_inputs["leech_count"]
    item_history = context_inputs["item_history"]
    session_summary = context_inputs["session_summary"]

    emotional_state = (
        f"mood={state.mood}, momentum={state.momentum}, confidence={state.confidence_level}, focus={state.focus_area}"
        if state is not None
        else "mood=coach_neutral, momentum=0, confidence=50, focus=general"
    )

    return {
        "persona": f"style={profile['persona_style']}, backend={profile['llm_backend']}",
        "emotional_state": emotional_state,
        "goals": _format_goals(session_summary),
        "strengths": _format_strengths(activity_week, streak),
        "weaknesses": _format_weaknesses(mistakes, leech_count),
        "recent_activity": _format_recent_activity(activity_week, item_history),
        "commitments": _format_commitments(),
    }


def assemble_assistant_chat_context(session_id: str | None = None, user_message: str | None = None) -> dict[str, str]:
    """Build deterministic, compact chat context from assistant memory tiers."""
    context_inputs = _load_assistant_chat_context_inputs(session_id)
    context = _assemble_assistant_chat_context_base(context_inputs)
    context["memory"] = _format_memory_rollup(user_message=user_message)

    query_terms = _extract_query_terms(user_message)
    facts = database.load_assistant_memory_facts(limit=28)
    summaries = database.load_recent_assistant_chat_summaries(limit=10)
    selected_facts = _select_relevant_facts(facts, query_terms, MEMORY_GRAPH_FACT_LIMIT)
    selected_summaries = _select_relevant_summaries(summaries, query_terms, MEMORY_GRAPH_SUMMARY_LIMIT)
    context["memory_graph"] = _format_unified_memory_graph(selected_facts, selected_summaries, context_inputs)
    return context


def assemble_assistant_chat_context_v2_with_embeddings(
    session_id: str | None = None,
    user_message: str | None = None,
    embed_fn=None,
) -> dict[str, str]:
    """Like ``assemble_assistant_chat_context``, but ranks memory facts and
    summaries by embedding similarity to ``user_message`` (see
    ``domain.retrieval``) instead of substring keyword overlap only.

    ``embed_fn``, if provided, is a ``str -> list[float]`` callable (e.g. a
    real ONNX-based encoder from scripts/embedder_runtime.py); otherwise the
    pure, dependency-free fallback embedder is used.
    """
    context_inputs = _load_assistant_chat_context_inputs(session_id)
    context = _assemble_assistant_chat_context_base(context_inputs)
    context["memory"] = _format_memory_rollup_v2(user_message=user_message, embed_fn=embed_fn)

    encode = embed_fn or embed_text
    facts = database.load_assistant_memory_facts(limit=28)
    summaries = database.load_recent_assistant_chat_summaries(limit=10)
    if user_message and user_message.strip():
        query_vector = encode(user_message)
        selected_facts = _select_relevant_facts_by_embedding(
            facts,
            query_vector,
            MEMORY_GRAPH_FACT_LIMIT,
            encode,
        )
        selected_summaries = _select_relevant_summaries_by_embedding(
            summaries,
            query_vector,
            MEMORY_GRAPH_SUMMARY_LIMIT,
            encode,
        )
    else:
        selected_facts = facts[:MEMORY_GRAPH_FACT_LIMIT]
        selected_summaries = summaries[:MEMORY_GRAPH_SUMMARY_LIMIT]

    context["memory_graph"] = _format_unified_memory_graph(selected_facts, selected_summaries, context_inputs)
    return context
