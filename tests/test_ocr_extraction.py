"""Tests for the OCR extraction module split out of desktop_bridge.py (#74)."""

from __future__ import annotations

import inspect

import pytest

from scripts import ocr_extraction


@pytest.fixture(autouse=True)
def _clear_engine_cache():
    ocr_extraction.reset_engine_cache()
    yield
    ocr_extraction.reset_engine_cache()


class TestEngineCache:
    """The whole point of the dedicated runtime: build the engine once."""

    def test_repeat_calls_with_the_same_key_reuse_the_built_engine(self):
        calls = []

        def build():
            calls.append(1)
            return ("engine", False, inspect.signature(lambda: None))

        first = ocr_extraction._cached_engine("models/a", build)
        second = ocr_extraction._cached_engine("models/a", build)

        assert len(calls) == 1
        assert first is second

    def test_a_changed_model_configuration_rebuilds_the_engine(self):
        calls = []

        def build():
            calls.append(1)
            return (f"engine-{len(calls)}", False, inspect.signature(lambda: None))

        ocr_extraction._cached_engine("models/a", build)
        ocr_extraction._cached_engine("models/b", build)
        ocr_extraction._cached_engine("models/b", build)

        assert len(calls) == 2

    def test_reset_forces_a_rebuild(self):
        calls = []

        def build():
            calls.append(1)
            return ("engine", False, inspect.signature(lambda: None))

        ocr_extraction._cached_engine("models/a", build)
        ocr_extraction.reset_engine_cache()
        ocr_extraction._cached_engine("models/a", build)

        assert len(calls) == 2


class TestParseOcrLines:
    def test_parses_the_paddleocr_v3_result_dict(self):
        result = [{"rec_texts": ["日本語", "", "text"], "rec_scores": [0.91234, 0.5, 0.4]}]

        assert ocr_extraction._parse_ocr_lines(result) == [
            {"text": "日本語", "confidence": 0.9123},
            {"text": "text", "confidence": 0.4},
        ]

    def test_parses_the_legacy_nested_list_result(self):
        result = [[[[[0, 0], [1, 0], [1, 1], [0, 1]], ("こんにちは", 0.8)]]]

        assert ocr_extraction._parse_ocr_lines(result) == [
            {"text": "こんにちは", "confidence": 0.8},
        ]

    def test_non_numeric_scores_degrade_to_zero_confidence(self):
        result = [{"rec_texts": ["あ"], "rec_scores": ["not-a-number"]}]

        assert ocr_extraction._parse_ocr_lines(result) == [{"text": "あ", "confidence": 0.0}]

    def test_empty_and_malformed_results_produce_no_lines(self):
        assert ocr_extraction._parse_ocr_lines(None) == []
        assert ocr_extraction._parse_ocr_lines([]) == []
        assert ocr_extraction._parse_ocr_lines(["nonsense"]) == []


class TestBuildOcrPayloadFromLines:
    def test_low_confidence_japanese_lines_are_kept(self):
        lines = [
            {"text": "日本語", "confidence": 0.10},
            {"text": "clear", "confidence": 0.95},
        ]

        payload = ocr_extraction._build_ocr_payload_from_lines(lines, min_confidence=0.5)

        assert payload["text"] == "日本語\nclear"
        assert payload["lineCount"] == 2
        assert payload["lines"] is lines
        assert payload["ok"] is True

    def test_low_confidence_latin_lines_are_dropped(self):
        lines = [
            {"text": "aaa", "confidence": 0.10},
            {"text": "bbb", "confidence": 0.95},
            {"text": "ccc", "confidence": 0.95},
            {"text": "ddd", "confidence": 0.95},
        ]

        payload = ocr_extraction._build_ocr_payload_from_lines(lines, min_confidence=0.5)

        assert payload["text"] == "bbb\nccc\nddd"
        assert payload["lineCount"] == 3

    def test_falls_back_to_every_line_when_retention_drops_below_the_guard(self):
        # Only 1 of 3 lines survives the confidence filter (0.33 < 0.55), so the
        # filter is treated as untrustworthy and every line is kept instead.
        lines = [
            {"text": "aaa", "confidence": 0.10},
            {"text": "bbb", "confidence": 0.10},
            {"text": "ccc", "confidence": 0.95},
        ]

        payload = ocr_extraction._build_ocr_payload_from_lines(lines, min_confidence=0.5)

        assert payload["text"] == "aaa\nbbb\nccc"
        assert payload["lineCount"] == 3

    def test_no_lines_yields_an_empty_payload(self):
        payload = ocr_extraction._build_ocr_payload_from_lines([], min_confidence=0.3)

        assert payload == {"ok": True, "text": "", "lineCount": 0, "lines": []}


class TestJoinOcrLinesForTranslation:
    def test_preserves_line_boundaries_and_drops_blanks(self):
        assert ocr_extraction._join_ocr_lines_for_translation(["  a ", "", "   ", "b"]) == "a\nb"

    def test_collapses_consecutive_duplicate_lines(self):
        assert ocr_extraction._join_ocr_lines_for_translation(["a", "a", "b", "a"]) == "a\nb\na"

    def test_empty_input_yields_an_empty_string(self):
        assert ocr_extraction._join_ocr_lines_for_translation([]) == ""


class TestIsSupportedImageMagic:
    @pytest.mark.parametrize(
        "header",
        [
            b"\x89PNG\r\n\x1a\n",
            b"\xff\xd8\xff\xe0",
            b"BM____",
            b"GIF87a",
            b"GIF89a",
            b"II*\x00",
            b"MM\x00*",
        ],
    )
    def test_accepts_known_image_signatures(self, tmp_path, header):
        path = tmp_path / "image.bin"
        path.write_bytes(header + b"0" * 32)

        assert ocr_extraction._is_supported_image_magic(path) is True

    def test_accepts_webp_via_the_riff_container(self, tmp_path):
        path = tmp_path / "image.webp"
        path.write_bytes(b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"0" * 16)

        assert ocr_extraction._is_supported_image_magic(path) is True

    def test_rejects_a_riff_container_that_is_not_webp(self, tmp_path):
        path = tmp_path / "audio.wav"
        path.write_bytes(b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"0" * 16)

        assert ocr_extraction._is_supported_image_magic(path) is False

    def test_rejects_arbitrary_bytes_and_missing_files(self, tmp_path):
        path = tmp_path / "notes.txt"
        path.write_bytes(b"just some text")

        assert ocr_extraction._is_supported_image_magic(path) is False
        assert ocr_extraction._is_supported_image_magic(tmp_path / "missing.png") is False


class TestExtractPayloadGuards:
    def test_rejects_a_missing_file_before_importing_paddleocr(self, tmp_path):
        with pytest.raises(ValueError, match="Image file does not exist"):
            ocr_extraction.extract_assistant_chat_ocr_payload(str(tmp_path / "nope.png"))

    def test_rejects_a_file_whose_bytes_are_not_an_image(self, tmp_path):
        path = tmp_path / "fake.png"
        path.write_bytes(b"definitely not a png")

        with pytest.raises(ValueError, match="Unsupported or corrupted image format"):
            ocr_extraction.extract_assistant_chat_ocr_payload(str(path))
