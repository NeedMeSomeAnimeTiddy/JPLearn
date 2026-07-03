from data.text_normalization import normalize_japanese_text, tokenize_japanese


def test_normalize_japanese_text_converts_halfwidth_kana() -> None:
    assert normalize_japanese_text(" ｶﾀｶﾅ ") == "カタカナ"


def test_normalize_japanese_text_normalizes_prolonged_sound_variants() -> None:
    assert normalize_japanese_text("パ—ティ") == "パーティ"


def test_normalize_japanese_text_normalizes_punctuation_variants() -> None:
    assert normalize_japanese_text("ｺｰﾋｰ､.") == "コーヒー、。"


def test_tokenize_japanese_splits_words_with_surface_and_lemma() -> None:
    tokens = tokenize_japanese("私は日本語を勉強した")
    surfaces = [t.surface for t in tokens]
    assert "私" in surfaces
    assert "勉強" in surfaces
    # "した" (did) should resolve to the dictionary verb lemma "為る".
    conjugated = next(t for t in tokens if t.surface == "し")
    assert conjugated.lemma == "為る"


def test_tokenize_japanese_tags_particles() -> None:
    tokens = tokenize_japanese("私は学校へ行く")
    particle = next(t for t in tokens if t.surface == "は")
    assert particle.part_of_speech == "助詞"


def test_tokenize_japanese_empty_string_returns_no_tokens() -> None:
    assert tokenize_japanese("") == []
    assert tokenize_japanese("   ") == []
