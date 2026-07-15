from domain.queue_builder import build_study_queue


def test_build_study_queue_includes_all_cards_once() -> None:
    queue, _ = build_study_queue(
        card_ids=[5, 1, 3, 2, 4],
        due_card_ids={1, 2},
        leech_card_ids={3},
        new_card_ids={4},
    )

    assert sorted(queue) == [1, 2, 3, 4, 5]
    assert len(queue) == 5


def test_build_study_queue_prioritizes_due_with_blended_leech_new() -> None:
    queue, _ = build_study_queue(
        card_ids=[1, 2, 3, 4, 5, 6, 7],
        due_card_ids={1, 2, 3, 4},
        leech_card_ids={5},
        new_card_ids={6},
    )

    assert queue[:3] == [1, 2, 3]
    assert queue[3] == 5
    assert queue[4] == 6


def test_build_study_queue_does_not_starve_review_cards() -> None:
    queue, _ = build_study_queue(
        card_ids=[1, 2, 3, 4, 5, 6, 7, 8],
        due_card_ids={1, 2, 3, 4},
        leech_card_ids={5},
        new_card_ids={6},
    )

    # Review cards remain in queue even when due/leech/new buckets are populated.
    assert 7 in queue
    assert 8 in queue


def test_game_misses_only_prioritize_ordinary_review_cards() -> None:
    queue, buckets = build_study_queue(
        card_ids=[1, 2, 3, 4, 5],
        due_card_ids={1},
        leech_card_ids={2},
        new_card_ids={3},
        game_miss_card_ids={1, 2, 5},
    )

    assert queue == [1, 2, 3, 5, 4]
    assert buckets.due == [1]
    assert buckets.leech == [2]
    assert buckets.review == [5, 4]
