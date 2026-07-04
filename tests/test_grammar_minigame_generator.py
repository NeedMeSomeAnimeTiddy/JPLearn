from data.grammar_minigame_generator import (
    generate_assembly_data,
    generate_imposter_data,
    generate_particle_cloze_data,
    generate_vibe_check_data,
    parse_sentence,
)


def test_parse_sentence_exposes_surface_pos_and_lemma() -> None:
    tokens = parse_sentence("日本語を勉強します")

    assert len(tokens) >= 3
    surfaces = [str(token["surface"]) for token in tokens]
    assert "勉強" in surfaces
    particle = next(token for token in tokens if token["surface"] == "を")
    assert "助詞" in str(particle["part_of_speech"])
    verb = next(token for token in tokens if token["surface"] in {"勉強", "し", "ます"})
    assert isinstance(verb["lemma"], str)
    assert len(str(verb["lemma"])) > 0


def test_generate_assembly_data_returns_deterministic_shuffled_chunks() -> None:
    payload = generate_assembly_data("私は日本語を勉強します", seed=7)

    assert payload["game_type"] == "sentence_assembly"
    assert len(payload["chunks"]) >= 2
    assert len(payload["answer_order"]) == len(payload["chunks"])
    shuffled_ids = [chunk["id"] for chunk in payload["shuffled_chunks"]]
    canonical_ids = payload["answer_order"]
    assert set(shuffled_ids) == set(canonical_ids)


def test_generate_particle_cloze_data_targets_particle_and_options_include_answer() -> None:
    payload = generate_particle_cloze_data("私は学校で日本語を勉強します", seed=3)

    assert payload["game_type"] == "particle_cloze"
    assert payload["correct_particle"] in {"は", "が", "を", "に", "で"}
    assert payload["correct_particle"] in payload["options"]
    assert len(payload["options"]) == 4
    assert "___" in payload["prompt"]


def test_generate_vibe_check_data_classifies_polite_endings() -> None:
    payload = generate_vibe_check_data("今日はいい天気です")

    assert payload["game_type"] == "vibe_check"
    assert payload["correct_label"] in {"Polite", "Formal Request", "Casual / Plain"}
    assert "Polite" in payload["options"]


def test_generate_imposter_data_injects_single_marked_error() -> None:
    payload = generate_imposter_data("私は図書館で日本語を勉強します", seed=1)

    assert payload["game_type"] == "imposter"
    assert isinstance(payload["error_token_index"], int)
    assert payload["original_token"] != payload["mutated_token"]
    assert payload["mutated_sentence"] != payload["sentence"]
