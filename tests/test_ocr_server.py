"""Tests for the persistent OCR server loop (#74).

The load-bearing claim of the dedicated runtime is that a second extraction in
the same process does not rebuild the PaddleOCR engine. These tests drive the
server loop with a stubbed extractor to prove requests are served from one
process, and that a failure reports back instead of killing the loop.
"""

from __future__ import annotations

import io
import json

import pytest

from scripts import ocr_server


class _Sink(io.StringIO):
    """A stdout stand-in that records what the loop wrote, line by line."""

    def responses(self) -> list[dict]:
        return [json.loads(line) for line in self.getvalue().splitlines() if line.strip()]


def _requests(*payloads: dict) -> io.StringIO:
    return io.StringIO("".join(json.dumps(payload) + "\n" for payload in payloads))


class TestServeLoop:
    def test_two_requests_are_served_by_one_process(self, monkeypatch):
        # Engine reuse itself is covered by test_ocr_extraction.py's
        # _cached_engine tests; what matters here is that the loop keeps
        # serving so that cache can be hit at all.
        extractions: list[tuple[str, float]] = []

        def fake_extract(image_path: str, min_confidence: float = 0.30) -> dict[str, object]:
            extractions.append((image_path, min_confidence))
            return {"ok": True, "text": "日本語", "lineCount": 1, "lines": []}

        monkeypatch.setattr(ocr_server, "extract_assistant_chat_ocr_payload", fake_extract)
        sink = _Sink()

        exit_code = ocr_server.serve(
            _requests(
                {"id": 1, "image_path": "first.png", "min_confidence": 0.3},
                {"id": 2, "image_path": "second.png", "min_confidence": 0.5},
            ),
            sink,
        )

        assert exit_code == 0
        assert extractions == [("first.png", 0.3), ("second.png", 0.5)]
        assert sink.responses() == [
            {"id": 1, "ok": True, "payload": {"ok": True, "text": "日本語", "lineCount": 1, "lines": []}},
            {"id": 2, "ok": True, "payload": {"ok": True, "text": "日本語", "lineCount": 1, "lines": []}},
        ]

    def test_a_failed_extraction_is_reported_and_the_loop_keeps_serving(self, monkeypatch):
        def fake_extract(image_path: str, min_confidence: float = 0.30) -> dict[str, object]:
            if image_path == "broken.png":
                raise ValueError("Unsupported or corrupted image format: broken.png")
            return {"ok": True, "text": "fine", "lineCount": 1, "lines": []}

        monkeypatch.setattr(ocr_server, "extract_assistant_chat_ocr_payload", fake_extract)
        sink = _Sink()

        ocr_server.serve(
            _requests(
                {"id": 7, "image_path": "broken.png"},
                {"id": 8, "image_path": "ok.png"},
            ),
            sink,
        )

        responses = sink.responses()
        assert responses[0] == {
            "id": 7,
            "ok": False,
            "error": "Unsupported or corrupted image format: broken.png",
        }
        assert responses[1]["id"] == 8
        assert responses[1]["ok"] is True

    def test_malformed_lines_are_skipped_without_a_response(self, monkeypatch):
        monkeypatch.setattr(
            ocr_server,
            "extract_assistant_chat_ocr_payload",
            lambda image_path, min_confidence=0.30: {"ok": True, "text": "", "lineCount": 0, "lines": []},
        )
        sink = _Sink()

        ocr_server.serve(io.StringIO('not json\n\n"a string"\n{"id": 3, "image_path": "x.png"}\n'), sink)

        responses = sink.responses()
        assert len(responses) == 1
        assert responses[0]["id"] == 3


class TestHandleRequest:
    def test_a_missing_image_path_is_a_reported_error(self):
        assert ocr_server.handle_request({"id": 1}) == {
            "id": 1,
            "ok": False,
            "error": "image_path is required",
        }

    @pytest.mark.parametrize("bad_confidence", [-0.1, 1.5])
    def test_out_of_range_confidence_is_rejected(self, bad_confidence):
        response = ocr_server.handle_request({"id": 2, "image_path": "x.png", "min_confidence": bad_confidence})

        assert response["ok"] is False
        assert "between 0 and 1" in response["error"]

    def test_a_non_numeric_confidence_is_rejected(self):
        response = ocr_server.handle_request({"id": 3, "image_path": "x.png", "min_confidence": "high"})

        assert response["ok"] is False
        assert "must be a number" in response["error"]

    def test_confidence_defaults_to_the_bridge_default(self, monkeypatch):
        seen: list[float] = []
        monkeypatch.setattr(
            ocr_server,
            "extract_assistant_chat_ocr_payload",
            lambda image_path, min_confidence=0.30: seen.append(min_confidence) or {"ok": True},
        )

        ocr_server.handle_request({"id": 4, "image_path": "x.png"})

        assert seen == [0.30]
