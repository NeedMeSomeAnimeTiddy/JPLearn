"""Routing rules for the merged study engine.

Ported from the stage/recall-floor half of
``electron-frontend/src/lib/studyPlan.test.ts``.  The coverage-row half of that
file (grammar readiness, level-deck exclusion, track pooling) stays in
TypeScript, because those rows are still built in the renderer for the cassette
carousel — only the *decision* moved here.
"""
from __future__ import annotations

import pytest

from domain.study_route import (
    RECALL_DRILLS,
    choose_route,
    learner_stage,
    recall_floor,
    session_minutes,
    stage_minigame,
    target_mastery,
)

SECTIONS = [
    "hiragana",
    "katakana",
    "kanji_n5",
    "vocab_n5",
    "grammar_patterns",
    "sentence_examples",
]


class TestLearnerStage:
    def test_holds_at_starter_until_the_streak_reaches_two_days(self) -> None:
        assert learner_stage(0.9, 0) == "starter"
        assert learner_stage(0.9, 1) == "starter"
        assert learner_stage(0.9, 2) == "advanced"

    def test_holds_at_starter_below_25_percent_however_long_the_streak(self) -> None:
        assert learner_stage(0.0, 40) == "starter"
        assert learner_stage(0.24, 40) == "starter"

    def test_promotes_to_building_at_25_percent_and_advanced_at_65(self) -> None:
        assert learner_stage(0.25, 2) == "building"
        assert learner_stage(0.64, 2) == "building"
        assert learner_stage(0.65, 2) == "advanced"


class TestRecallFloor:
    # `learner_stage` is a whole-account average, so a learner can reach
    # `building` or `advanced` on the strength of tracks other than the one being
    # routed.  Without a per-track floor that sends them into a production drill
    # on a track they have never opened.
    def test_routes_an_untouched_vocabulary_track_to_recognition_at_building(self) -> None:
        route = choose_route("vocab_n5", "building", 0, 0.0, "balanced_review")
        assert route.minigame == "meaning_match"

    # Kanji leads with `character_match` where the other tracks lead with
    # `meaning_match`, because recognising the glyph is the apter first drill
    # there.  The fallback honours that by reusing the track's own `starter`
    # route instead of a fixed pair.
    def test_routes_an_untouched_kanji_track_to_its_own_recognition_drill(self) -> None:
        assert choose_route("kanji_n5", "advanced", 0, 0.0, "balanced_review").minigame == "character_match"
        assert choose_route("kanji_n5", "advanced", 1, 0.0, "balanced_review").minigame == "meaning_match"

    def test_falls_back_to_exactly_the_starter_route_of_the_same_track_and_index(self) -> None:
        gated_count = 0
        for section in SECTIONS:
            for stage in ("building", "advanced"):
                for index in (0, 1):
                    gated = choose_route(section, stage, index, 0.0, "balanced_review").minigame
                    # Only assert where the floor actually fires — the kana tracks
                    # reach `romaji_sprint`/`interleave_mix`, which are not recall
                    # drills, so an untouched track routes the same as a mastered one.
                    if gated == choose_route(section, stage, index, 1.0, "balanced_review").minigame:
                        continue
                    gated_count += 1
                    assert gated == stage_minigame(section, "starter", index)

        # Guards the loop against passing vacuously if the floor ever stops firing.
        # 12 of the 24 (6 tracks x 2 stages x 2 indices) combinations reach a
        # recall drill: none of the 8 kana ones, and 3 of 4 on each of the other four.
        assert gated_count == 12

    def test_gates_grammar_and_sentence_tracks_off_particle_cloze_while_untouched(self) -> None:
        assert choose_route("grammar_patterns", "building", 0, 0.0, "balanced_review").minigame == "meaning_match"
        assert choose_route("sentence_examples", "advanced", 1, 0.0, "balanced_review").minigame == "character_match"

    # The floor must sit strictly below the target mastery, or every gated drill
    # is dead code on this path.
    def test_leaves_every_gated_drill_reachable_below_its_track_target(self) -> None:
        def reachable(section: str) -> float:
            mastery = (recall_floor(section) + target_mastery(section)) / 2
            assert mastery < target_mastery(section)
            return mastery

        assert choose_route("kanji_n5", "building", 1, reachable("kanji_n5"), "balanced_review").minigame == "typed_recall"
        assert choose_route("kanji_n5", "advanced", 1, reachable("kanji_n5"), "balanced_review").minigame == "stroke_order"
        assert choose_route("vocab_n5", "building", 0, reachable("vocab_n5"), "balanced_review").minigame == "typed_recall"
        assert choose_route("vocab_n5", "advanced", 0, reachable("vocab_n5"), "balanced_review").minigame == "particle_cloze"

    @pytest.mark.parametrize("section", SECTIONS)
    def test_keeps_the_floor_below_the_target_for_every_track(self, section: str) -> None:
        assert 0 < recall_floor(section) < target_mastery(section)

    @pytest.mark.parametrize("section", SECTIONS)
    def test_leaves_the_starter_routes_untouched(self, section: str) -> None:
        expected = "character_match" if section == "kanji_n5" else "meaning_match"
        assert choose_route(section, "starter", 0, 0.0, "balanced_review").minigame == expected

    def test_leaves_the_kana_tracks_untouched(self) -> None:
        assert choose_route("hiragana", "building", 1, 0.0, "balanced_review").minigame == "romaji_sprint"
        assert choose_route("katakana", "advanced", 0, 0.0, "balanced_review").minigame == "interleave_mix"


class TestReasonOverrides:
    # The reason is why the row exists, so it narrows the stage route. A learner
    # whose 7-day accuracy has collapsed must not be answered with a production
    # drill, however far along the rest of their account is.
    @pytest.mark.parametrize(
        "reason",
        ["high_error_rate", "new_content_ready", "progression_milestone", "streak_recovery"],
    )
    @pytest.mark.parametrize("section", SECTIONS)
    def test_recognition_reasons_force_the_starter_route(self, reason: str, section: str) -> None:
        route = choose_route(section, "advanced", 0, 1.0, reason)
        assert route.minigame == stage_minigame(section, "starter", 0)
        assert route.minigame not in RECALL_DRILLS

    def test_other_reasons_keep_the_stage_route(self) -> None:
        for reason in ("overdue_reviews", "weak_retention", "balanced_review"):
            route = choose_route("vocab_n5", "advanced", 0, 1.0, reason)
            assert route.minigame == "particle_cloze"

    # A row labelled "problem items" must actually study the problem items, so
    # it keeps the stage drill and turns leech focus on instead.
    def test_leeches_detected_enables_leech_focus_without_changing_the_drill(self) -> None:
        route = choose_route("vocab_n5", "advanced", 0, 1.0, "leeches_detected")
        assert route.minigame == "particle_cloze"
        assert route.overrides.leech_focus_enabled is True

    def test_no_other_reason_touches_session_preferences(self) -> None:
        for reason in ("overdue_reviews", "weak_retention", "balanced_review", "high_error_rate"):
            assert choose_route("vocab_n5", "building", 0, 1.0, reason).overrides.leech_focus_enabled is None

    # The floor outranks the reason: `leeches_detected` keeps the stage route,
    # but the stage route itself is still gated on an untouched track.
    def test_the_recall_floor_still_applies_under_a_leech_row(self) -> None:
        route = choose_route("vocab_n5", "advanced", 0, 0.0, "leeches_detected")
        assert route.minigame == "meaning_match"
        assert route.overrides.leech_focus_enabled is True


class TestSessionMinutes:
    # Replaces the renderer's estimate, which branched on reviews completed in
    # the past week — a number unrelated to what the rows actually hold.
    def test_scales_with_the_work_the_block_contains(self) -> None:
        assert session_minutes(0) == 10
        assert session_minutes(19) == 10
        assert session_minutes(20) == 15
        assert session_minutes(39) == 15
        assert session_minutes(40) == 20
        assert session_minutes(500) == 20
