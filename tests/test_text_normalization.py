from data.text_normalization import normalize_japanese_text


def test_normalize_japanese_text_converts_halfwidth_kana() -> None:
    assert normalize_japanese_text(" ｶﾀｶﾅ ") == "カタカナ"


def test_normalize_japanese_text_normalizes_prolonged_sound_variants() -> None:
    assert normalize_japanese_text("パ—ティ") == "パーティ"


def test_normalize_japanese_text_normalizes_punctuation_variants() -> None:
    assert normalize_japanese_text("ｺｰﾋｰ､.") == "コーヒー、。"
