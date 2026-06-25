from domain.cards import Card
import main
from ui import qt_app


def test_main_launches_gui(monkeypatch) -> None:
    called = {"run": False}

    def _fake_run() -> None:
        called["run"] = True

    monkeypatch.setattr(main, "run", _fake_run)
    main.main()
    assert called["run"] is True


def test_format_elapsed_outputs_expected_shapes() -> None:
    assert qt_app._format_elapsed(9) == "9s"
    assert qt_app._format_elapsed(75) == "1m 15s"
    assert qt_app._format_elapsed(3670) == "1h 01m 10s"


def test_build_weakest_items_ranks_by_struggles_then_card_id() -> None:
    cards = {
        2: Card(id=2, character="い", romaji="i", meaning="i"),
        1: Card(id=1, character="あ", romaji="a", meaning="a"),
        3: Card(id=3, character="う", romaji="u", meaning="u"),
    }
    struggles = {2: 1, 1: 3, 3: 3}

    weakest = qt_app._build_weakest_items(cards, struggles, limit=2)
    assert weakest == [
        "あ (a) - 3 struggle(s)",
        "う (u) - 3 struggle(s)",
    ]


def test_build_multiple_choice_options_includes_answer_without_duplicates() -> None:
    cards = [
        Card(id=1, character="あ", romaji="a", meaning="a"),
        Card(id=2, character="い", romaji="i", meaning="i"),
        Card(id=3, character="う", romaji="u", meaning="u"),
        Card(id=4, character="え", romaji="e", meaning="e"),
        Card(id=5, character="お", romaji="o", meaning="o"),
    ]

    options = qt_app._build_multiple_choice_options(cards[0], cards, option_count=4)
    assert "a" in options
    assert len(options) == 4
    assert len(set(options)) == 4


def test_find_stroke_order_asset_prefers_character_file(tmp_path) -> None:
    stroke_dir = tmp_path / "stroke_order"
    stroke_dir.mkdir()
    expected = stroke_dir / "あ.png"
    expected.write_bytes(b"stub")

    result = qt_app._find_stroke_order_asset("あ", search_dirs=[stroke_dir])
    assert result == expected


def test_find_stroke_order_asset_falls_back_to_codepoint_name(tmp_path) -> None:
    stroke_dir = tmp_path / "stroke_order"
    stroke_dir.mkdir()
    expected = stroke_dir / "3042.webp"
    expected.write_bytes(b"stub")

    result = qt_app._find_stroke_order_asset("あ", search_dirs=[stroke_dir])
    assert result == expected


def test_find_stroke_order_asset_returns_none_when_missing(tmp_path) -> None:
    stroke_dir = tmp_path / "stroke_order"
    stroke_dir.mkdir()
    result = qt_app._find_stroke_order_asset("あ", search_dirs=[stroke_dir])
    assert result is None
