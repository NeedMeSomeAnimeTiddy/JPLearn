from __future__ import annotations

from pathlib import Path

from scripts import import_external_lists


def _write_source(path: Path, count: int, prefix: str) -> None:
    lines = ["character,romaji,meaning"]
    for idx in range(count):
        lines.append(f"{prefix}{idx},r{idx},meaning {idx}")
    path.write_text("\n".join(lines), encoding="utf-8")


def _kanji_sources(tmp_path: Path) -> tuple[Path, Path, Path, Path, Path]:
    kanji_n5_csv = tmp_path / "kanji_n5.csv"
    kanji_n4_csv = tmp_path / "kanji_n4.csv"
    kanji_n3_csv = tmp_path / "kanji_n3.csv"
    kanji_n2_csv = tmp_path / "kanji_n2.csv"
    kanji_n1_csv = tmp_path / "kanji_n1.csv"
    _write_source(kanji_n5_csv, 80, "漢N5")
    _write_source(kanji_n4_csv, 20, "漢N4")
    _write_source(kanji_n3_csv, 20, "漢N3")
    _write_source(kanji_n2_csv, 20, "漢N2")
    _write_source(kanji_n1_csv, 20, "漢N1")
    return kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv


def _phase1_sources(tmp_path: Path) -> Path:
    conjugation_training_csv = tmp_path / "conjugation_training.csv"
    _write_source(conjugation_training_csv, 20, "活用")
    return conjugation_training_csv


def test_generate_external_deck_module_from_csv_sources(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    conjugation_training_csv = _phase1_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    _write_source(words_n5_csv, 80, "単語N5")
    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    (
        words_n5_count,
        words_n4_count,
        words_n3_count,
        words_n2_count,
        words_n1_count,
        conversational_count,
        kanji_n5_count,
        kanji_n4_count,
        kanji_n3_count,
        kanji_n2_count,
        kanji_n1_count,
    ) = import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        conjugation_training_csv=conjugation_training_csv,
        output_module=output_py,
    )

    assert words_n5_count == 80
    assert words_n4_count == 80
    assert words_n3_count == 80
    assert words_n2_count == 80
    assert words_n1_count == 80
    assert conversational_count == 40
    assert kanji_n5_count == 80
    assert kanji_n4_count == 20
    assert kanji_n3_count == 20
    assert kanji_n2_count == 20
    assert kanji_n1_count == 20
    content = output_py.read_text(encoding="utf-8")
    assert "VOCAB_N5_EXTERNAL_DATA" in content
    assert "VOCAB_N4_EXTERNAL_DATA" in content
    assert "VOCAB_N3_EXTERNAL_DATA" in content
    assert "VOCAB_N2_EXTERNAL_DATA" in content
    assert "VOCAB_N1_EXTERNAL_DATA" in content
    assert "GRAMMAR_PATTERNS_EXTERNAL_DATA" in content
    assert "KANJI_N5_EXTERNAL_DATA" in content
    assert "KANJI_N4_EXTERNAL_DATA" in content
    assert "KANJI_N3_EXTERNAL_DATA" in content
    assert "KANJI_N2_EXTERNAL_DATA" in content
    assert "KANJI_N1_EXTERNAL_DATA" in content
    assert "SENTENCE_EXAMPLES_EXTERNAL_DATA" not in content
    assert "CONJUGATION_TRAINING_EXTERNAL_DATA" in content


def test_generate_external_deck_module_enforces_minimum_rows(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    _write_source(words_n5_csv, 10, "単語N5")
    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    try:
        import_external_lists.generate_external_deck_module(
            words_n5_csv=words_n5_csv,
            words_n4_csv=words_n4_csv,
            words_n3_csv=words_n3_csv,
            words_n2_csv=words_n2_csv,
            words_n1_csv=words_n1_csv,
            conversational_csv=conversational_csv,
            kanji_n5_csv=kanji_n5_csv,
            kanji_n4_csv=kanji_n4_csv,
            kanji_n3_csv=kanji_n3_csv,
            kanji_n2_csv=kanji_n2_csv,
            kanji_n1_csv=kanji_n1_csv,
            output_module=output_py,
        )
    except ValueError as exc:
        assert "at least 80 rows" in str(exc)
    else:
        raise AssertionError("Expected ValueError for too-small words list")


def test_generate_external_deck_module_validates_required_headers(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    words_n5_csv.write_text("wrong,headers,here\na,b,c\n", encoding="utf-8")
    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    try:
        import_external_lists.generate_external_deck_module(
            words_n5_csv=words_n5_csv,
            words_n4_csv=words_n4_csv,
            words_n3_csv=words_n3_csv,
            words_n2_csv=words_n2_csv,
            words_n1_csv=words_n1_csv,
            conversational_csv=conversational_csv,
            kanji_n5_csv=kanji_n5_csv,
            kanji_n4_csv=kanji_n4_csv,
            kanji_n3_csv=kanji_n3_csv,
            kanji_n2_csv=kanji_n2_csv,
            kanji_n1_csv=kanji_n1_csv,
            output_module=output_py,
        )
    except ValueError as exc:
        assert "must have exact headers" in str(exc)
        assert "character, romaji, meaning" in str(exc)
    else:
        raise AssertionError("Expected ValueError for invalid CSV headers")


def test_generate_external_deck_module_rejects_non_exact_headers(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    words_n5_csv.write_text("character,romaji,meaning,extra\na,b,c,d\n", encoding="utf-8")
    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    try:
        import_external_lists.generate_external_deck_module(
            words_n5_csv=words_n5_csv,
            words_n4_csv=words_n4_csv,
            words_n3_csv=words_n3_csv,
            words_n2_csv=words_n2_csv,
            words_n1_csv=words_n1_csv,
            conversational_csv=conversational_csv,
            kanji_n5_csv=kanji_n5_csv,
            kanji_n4_csv=kanji_n4_csv,
            kanji_n3_csv=kanji_n3_csv,
            kanji_n2_csv=kanji_n2_csv,
            kanji_n1_csv=kanji_n1_csv,
            output_module=output_py,
        )
    except ValueError as exc:
        assert "must have exact headers" in str(exc)
        assert "extra" in str(exc)
    else:
        raise AssertionError("Expected ValueError for non-exact headers")


def test_generate_external_deck_module_dedupes_character_and_romaji_pairs(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    words_lines = ["character,romaji,meaning"]
    for idx in range(80):
        words_lines.append(f"語{idx},r{idx},meaning {idx}")
    words_lines.append("語0,r0,duplicate meaning")
    words_n5_csv.write_text("\n".join(words_lines), encoding="utf-8")
    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")

    conversational_lines = ["character,romaji,meaning"]
    for idx in range(40):
        conversational_lines.append(f"話{idx},g{idx},grammar {idx}")
    conversational_lines.append("話0,g0,duplicate grammar")
    conversational_csv.write_text("\n".join(conversational_lines), encoding="utf-8")

    (
        words_n5_count,
        words_n4_count,
        words_n3_count,
        words_n2_count,
        words_n1_count,
        conversational_count,
        kanji_n5_count,
        kanji_n4_count,
        kanji_n3_count,
        kanji_n2_count,
        kanji_n1_count,
    ) = import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        output_module=output_py,
    )

    assert words_n5_count == 80
    assert words_n4_count == 80
    assert words_n3_count == 80
    assert words_n2_count == 80
    assert words_n1_count == 80
    assert conversational_count == 40
    assert kanji_n5_count == 80
    assert kanji_n4_count == 20
    assert kanji_n3_count == 20
    assert kanji_n2_count == 20
    assert kanji_n1_count == 20


def test_generate_external_deck_module_normalizes_japanese_character_variants(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    words_lines = ["character,romaji,meaning", " ｶｰﾄﾞ—､｡ ,ka-do,card"]
    for idx in range(79):
        words_lines.append(f"語{idx},r{idx},meaning {idx}")
    words_n5_csv.write_text("\n".join(words_lines), encoding="utf-8")

    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        output_module=output_py,
    )

    content = output_py.read_text(encoding="utf-8")
    assert "('カードー、。', 'ka-do', 'card')" in content


def test_generate_external_deck_module_reports_deduplication_metadata(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    words_lines = ["character,romaji,meaning"]
    for idx in range(80):
        words_lines.append(f"語{idx},r{idx},meaning {idx}")
    words_lines.append("語0,r0,meaning 0")
    words_n5_csv.write_text("\n".join(words_lines), encoding="utf-8")

    _write_source(words_n4_csv, 80, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        output_module=output_py,
    )

    content = output_py.read_text(encoding="utf-8")
    assert "# Ingestion report:" in content
    assert "# - duplicates removed within lists: 1" in content


def test_generate_external_deck_module_reports_cross_list_conflicts(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    _write_source(words_n5_csv, 81, "単語N5")
    _write_source(words_n4_csv, 81, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    words_n5_lines = words_n5_csv.read_text(encoding="utf-8").splitlines()
    words_n5_lines[1] = "共通,kyoutsuu,shared meaning"
    words_n5_csv.write_text("\n".join(words_n5_lines), encoding="utf-8")

    words_n4_lines = words_n4_csv.read_text(encoding="utf-8").splitlines()
    words_n4_lines[1] = "共通,kyoutsuu,different meaning"
    words_n4_csv.write_text("\n".join(words_n4_lines), encoding="utf-8")

    try:
        import_external_lists.generate_external_deck_module(
            words_n5_csv=words_n5_csv,
            words_n4_csv=words_n4_csv,
            words_n3_csv=words_n3_csv,
            words_n2_csv=words_n2_csv,
            words_n1_csv=words_n1_csv,
            conversational_csv=conversational_csv,
            kanji_n5_csv=kanji_n5_csv,
            kanji_n4_csv=kanji_n4_csv,
            kanji_n3_csv=kanji_n3_csv,
            kanji_n2_csv=kanji_n2_csv,
            kanji_n1_csv=kanji_n1_csv,
            output_module=output_py,
        )
    except ValueError as exc:
        message = str(exc)
        assert "Conflicting entries found across imported lists" in message
        assert "共通/kyoutsuu" in message
        assert "words_n5" in message
        assert "words_n4" in message
    else:
        raise AssertionError("Expected ValueError for conflicting cross-list meanings")


def test_generate_external_deck_module_keep_first_resolves_conflicts(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    _write_source(words_n5_csv, 81, "単語N5")
    _write_source(words_n4_csv, 81, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    words_n5_lines = words_n5_csv.read_text(encoding="utf-8").splitlines()
    words_n5_lines[1] = "共通,kyoutsuu,first meaning"
    words_n5_csv.write_text("\n".join(words_n5_lines), encoding="utf-8")

    words_n4_lines = words_n4_csv.read_text(encoding="utf-8").splitlines()
    words_n4_lines[1] = "共通,kyoutsuu,last meaning"
    words_n4_csv.write_text("\n".join(words_n4_lines), encoding="utf-8")

    import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        output_module=output_py,
        conflict_policy="keep-first",
    )

    content = output_py.read_text(encoding="utf-8")
    assert "('共通', 'kyoutsuu', 'first meaning')" in content
    assert "('共通', 'kyoutsuu', 'last meaning')" not in content


def test_generate_external_deck_module_keep_last_resolves_conflicts(tmp_path: Path) -> None:
    words_n5_csv = tmp_path / "words_n5.csv"
    words_n4_csv = tmp_path / "words_n4.csv"
    words_n3_csv = tmp_path / "words_n3.csv"
    words_n2_csv = tmp_path / "words_n2.csv"
    words_n1_csv = tmp_path / "words_n1.csv"
    conversational_csv = tmp_path / "conversational.csv"
    kanji_n5_csv, kanji_n4_csv, kanji_n3_csv, kanji_n2_csv, kanji_n1_csv = _kanji_sources(tmp_path)
    output_py = tmp_path / "external_deck_data.py"

    _write_source(words_n5_csv, 81, "単語N5")
    _write_source(words_n4_csv, 81, "単語N4")
    _write_source(words_n3_csv, 80, "単語N3")
    _write_source(words_n2_csv, 80, "単語N2")
    _write_source(words_n1_csv, 80, "単語N1")
    _write_source(conversational_csv, 40, "会話")

    words_n5_lines = words_n5_csv.read_text(encoding="utf-8").splitlines()
    words_n5_lines[1] = "共通,kyoutsuu,first meaning"
    words_n5_csv.write_text("\n".join(words_n5_lines), encoding="utf-8")

    words_n4_lines = words_n4_csv.read_text(encoding="utf-8").splitlines()
    words_n4_lines[1] = "共通,kyoutsuu,last meaning"
    words_n4_csv.write_text("\n".join(words_n4_lines), encoding="utf-8")

    import_external_lists.generate_external_deck_module(
        words_n5_csv=words_n5_csv,
        words_n4_csv=words_n4_csv,
        words_n3_csv=words_n3_csv,
        words_n2_csv=words_n2_csv,
        words_n1_csv=words_n1_csv,
        conversational_csv=conversational_csv,
        kanji_n5_csv=kanji_n5_csv,
        kanji_n4_csv=kanji_n4_csv,
        kanji_n3_csv=kanji_n3_csv,
        kanji_n2_csv=kanji_n2_csv,
        kanji_n1_csv=kanji_n1_csv,
        output_module=output_py,
        conflict_policy="keep-last",
    )

    content = output_py.read_text(encoding="utf-8")
    assert "('共通', 'kyoutsuu', 'first meaning')" not in content
    assert "('共通', 'kyoutsuu', 'last meaning')" in content
