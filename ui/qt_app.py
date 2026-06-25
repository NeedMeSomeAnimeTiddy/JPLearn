"""PySide6 GUI for JPLearn."""

from __future__ import annotations

import random
import time
from functools import partial
from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QFont, QFontDatabase, QKeyEvent, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from data import study_pipeline
from domain.answer_check import assess_typed_answer
from domain.cards import Card, Deck
from domain.decks import ALL_DECKS
from domain.scheduler import AGAIN, GOOD, ReviewState

BG = "#1a1a2e"
CARD_BG = "#16213e"
ACCENT = "#e94560"
FG = "#eaeaea"
FG_DIM = "#888888"
BTN_AGAIN = "#c0392b"
BTN_HARD = "#e67e22"
BTN_GOOD = "#27ae60"
BTN_FG = "#ffffff"
HIGHLIGHT = "#0f3460"

DECK_THEMES: dict[str, dict[str, str]] = {
    "hiragana": {
        "prefix": "ひ",
        "flash_color": "#6c3483",
        "multiple_choice_color": "#8e44ad",
        "stats_color": "#6c3483",
    },
    "katakana": {
        "prefix": "カ",
        "flash_color": "#1a5276",
        "multiple_choice_color": "#2471a3",
        "stats_color": "#1a5276",
    },
    "kanji_n5": {
        "prefix": "漢",
        "flash_color": "#196f3d",
        "multiple_choice_color": "#229954",
        "stats_color": "#196f3d",
    },
    "kana_words": {
        "prefix": "語",
        "flash_color": "#7d6608",
        "multiple_choice_color": "#9a7d0a",
        "stats_color": "#7d6608",
    },
}

JP_FONT_CANDIDATES = [
    "Yu Gothic",
    "Meiryo",
    "MS Gothic",
    "Noto Sans CJK JP",
    "Segoe UI",
]


def _app_stylesheet(high_contrast: bool = False) -> str:
    bg = "#000000" if high_contrast else BG
    card_bg = "#111111" if high_contrast else CARD_BG
    fg = "#ffffff" if high_contrast else FG
    fg_dim = "#dddddd" if high_contrast else FG_DIM
    accent = "#ffd400" if high_contrast else ACCENT
    focus = "#00e5ff" if high_contrast else "#8ec5ff"
    return f"""
QWidget {{
    background: {bg};
    color: {fg};
    font-size: 14px;
}}
QPushButton {{
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    color: {BTN_FG};
    font-weight: 600;
}}
QPushButton:disabled {{
    opacity: 0.8;
}}
QPushButton:focus, QLineEdit:focus {{
    border: 2px solid {focus};
}}
QFrame#cardPanel {{
    background: {card_bg};
    border: 1px solid #2b3455;
    border-radius: 12px;
}}
QLabel#title {{
    color: {accent};
}}
QLabel#dim {{
    color: {fg_dim};
}}
"""


def _jp_font(size: int, bold: bool = False) -> QFont:
    families = QFontDatabase().families()
    for name in JP_FONT_CANDIDATES:
        if name in families:
            font = QFont(name, size)
            font.setBold(bold)
            return font
    fallback = QFont()
    fallback.setPointSize(size)
    fallback.setBold(bold)
    return fallback


def _format_elapsed(seconds: int) -> str:
    total = max(0, seconds)
    if total < 60:
        return f"{total}s"
    if total < 3600:
        minutes, secs = divmod(total, 60)
        return f"{minutes}m {secs:02d}s"
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}h {minutes:02d}m {secs:02d}s"


def _build_weakest_items(
    cards_by_id: dict[int, Card], struggle_counts: dict[int, int], limit: int = 3
) -> list[str]:
    ranked = sorted(struggle_counts.items(), key=lambda item: (-item[1], item[0]))
    weakest: list[str] = []
    for card_id, struggles in ranked[:limit]:
        card = cards_by_id.get(card_id)
        if card is None:
            continue
        weakest.append(f"{card.character} ({card.romaji}) - {struggles} struggle(s)")
    return weakest


def _build_multiple_choice_options(
    current_card: Card, cards: list[Card], option_count: int = 4
) -> list[str]:
    if option_count < 2:
        raise ValueError("option_count must be at least 2")
    distractor_pool = list(
        dict.fromkeys(
            card.romaji
            for card in cards
            if card.id != current_card.id and card.romaji != current_card.romaji
        )
    )
    distractor_count = min(option_count - 1, len(distractor_pool))
    distractors = random.sample(distractor_pool, k=distractor_count)
    options = [current_card.romaji, *distractors]
    random.shuffle(options)
    return options


def _button(text: str, color: str, handler: Callable[[], None], size: int = 13) -> QPushButton:
    button = QPushButton(text)
    button.setFont(_jp_font(size, bold=True))
    button.setStyleSheet(f"background: {color};")
    button.clicked.connect(handler)
    return button


def _mode_label_text(mode: str) -> str:
    if mode == "flashcard":
        return "Flashcards"
    if mode == "multiple_choice":
        return "Multiple choice"
    if mode == "typed_answer":
        return "Typed answer"
    return mode


def _find_stroke_order_asset(character: str, search_dirs: list[Path] | None = None) -> Path | None:
    if not character:
        return None
    if search_dirs is None:
        search_dirs = [Path(__file__).resolve().parent.parent / "assets" / "stroke_order"]
    codepoint = ord(character)
    stem_candidates = [character, f"{codepoint:04x}", f"u{codepoint:04x}"]
    for assets_dir in search_dirs:
        if not assets_dir.exists():
            continue
        for stem in stem_candidates:
            for extension in ("png", "jpg", "jpeg", "webp", "gif"):
                candidate = assets_dir / f"{stem}.{extension}"
                if candidate.exists():
                    return candidate
    return None


class AppFrame(QWidget):
    def __init__(self, master: "App") -> None:
        super().__init__()
        self.app = master

    def on_show(self) -> None:
        return

    def on_hide(self) -> None:
        return


class HomeFrame(AppFrame):
    def __init__(self, master: "App") -> None:
        super().__init__(master)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(80, 40, 80, 40)
        layout.setSpacing(12)
        layout.addStretch(1)

        title = QLabel("JPLearn")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setFont(_jp_font(36, bold=True))
        layout.addWidget(title)

        subtitle = QLabel("日本語を学ぼう")
        subtitle.setObjectName("dim")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle.setFont(_jp_font(18))
        layout.addWidget(subtitle)

        prompt = QLabel("Choose a deck and mode")
        prompt.setAlignment(Qt.AlignmentFlag.AlignCenter)
        prompt.setFont(_jp_font(13))
        layout.addWidget(prompt)

        a11y_controls = QHBoxLayout()
        a11y_controls.addStretch(1)
        a11y_controls.addWidget(_button("A-", HIGHLIGHT, lambda: self.app.adjust_font_scale(-1), size=10))
        a11y_controls.addWidget(_button("A+", HIGHLIGHT, lambda: self.app.adjust_font_scale(1), size=10))
        a11y_controls.addWidget(_button("Contrast", HIGHLIGHT, self.app.toggle_high_contrast, size=10))
        a11y_controls.addStretch(1)
        layout.addLayout(a11y_controls)
        layout.addSpacing(8)

        for deck_key, loader in ALL_DECKS.items():
            deck = loader()
            theme = DECK_THEMES.get(
                deck_key,
                {
                    "prefix": "日",
                    "flash_color": HIGHLIGHT,
                    "multiple_choice_color": HIGHLIGHT,
                    "stats_color": HIGHLIGHT,
                },
            )
            prefix = theme["prefix"]
            layout.addWidget(
                _button(
                    f"{prefix}  {deck.name} - Flashcards",
                    theme["flash_color"],
                    partial(self.app.start_review, deck_key, mode="flashcard"),
                )
            )
            layout.addWidget(
                _button(
                    f"{prefix}  {deck.name} - Multiple Choice",
                    theme["multiple_choice_color"],
                    partial(self.app.start_review, deck_key, mode="multiple_choice"),
                )
            )
            layout.addWidget(
                _button(
                    f"{prefix}  {deck.name} - Typed Answer",
                    theme["multiple_choice_color"],
                    partial(self.app.start_review, deck_key, mode="typed_answer"),
                )
            )
        layout.addSpacing(12)
        layout.addWidget(_button("View Progress", HIGHLIGHT, self.app.show_stats))
        layout.addStretch(2)


class FlashcardFrame(AppFrame):
    def __init__(self, master: "App") -> None:
        super().__init__(master)
        self._deck: Deck | None = None
        self._queue: list[Card] = []
        self._states: dict[int, ReviewState] = {}
        self._current: Card | None = None
        self._correct = 0
        self._total = 0
        self._session_started_at: float | None = None
        self._struggle_counts: dict[int, int] = {}
        self._cards_by_id: dict[int, Card] = {}
        self._mode = "flashcard"
        self._mc_answered = False
        self._mc_options: list[str] = []
        self._typed_answered = False
        self._typed_needs_reveal = False
        self._stroke_order_visible = False

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 20, 24, 20)
        root.setSpacing(16)

        header = QFrame()
        header.setObjectName("cardPanel")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(16, 10, 16, 10)

        self._deck_label = QLabel("")
        self._deck_label.setObjectName("dim")
        self._deck_label.setFont(_jp_font(11))
        header_layout.addWidget(self._deck_label)

        self._mode_label = QLabel("")
        self._mode_label.setObjectName("dim")
        self._mode_label.setFont(_jp_font(11))
        header_layout.addWidget(self._mode_label)

        header_layout.addStretch(1)

        self._progress_label = QLabel("")
        self._progress_label.setObjectName("dim")
        self._progress_label.setFont(_jp_font(11))
        header_layout.addWidget(self._progress_label)

        self._switch_mode_btn = _button("Switch Mode", HIGHLIGHT, self._switch_mode, size=10)
        header_layout.addWidget(self._switch_mode_btn)
        header_layout.addWidget(_button("A-", HIGHLIGHT, lambda: self.app.adjust_font_scale(-1), size=10))
        header_layout.addWidget(_button("A+", HIGHLIGHT, lambda: self.app.adjust_font_scale(1), size=10))
        header_layout.addWidget(_button("Contrast", HIGHLIGHT, self.app.toggle_high_contrast, size=10))

        quit_btn = _button("Quit", CARD_BG, self.app.go_home, size=10)
        quit_btn.setObjectName("dim")
        quit_btn.setStyleSheet(f"background: {CARD_BG}; color: {FG_DIM};")
        header_layout.addWidget(quit_btn)
        root.addWidget(header)

        card_area = QVBoxLayout()
        card_area.setSpacing(8)
        card_area.addStretch(1)

        self._char_label = QLabel("")
        self._char_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._char_label.setFont(_jp_font(110, bold=True))
        card_area.addWidget(self._char_label)

        self._romaji_label = QLabel("")
        self._romaji_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._romaji_label.setFont(_jp_font(28))
        self._romaji_label.setStyleSheet(f"color: {ACCENT};")
        card_area.addWidget(self._romaji_label)

        self._stroke_toggle_btn = _button("Stroke Order", HIGHLIGHT, self._toggle_stroke_order, size=11)
        card_area.addWidget(self._stroke_toggle_btn)

        self._stroke_order_image = QLabel("")
        self._stroke_order_image.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_area.addWidget(self._stroke_order_image)

        self._stroke_order_hint = QLabel("")
        self._stroke_order_hint.setObjectName("dim")
        self._stroke_order_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._stroke_order_hint.setWordWrap(True)
        self._stroke_order_hint.setFont(_jp_font(10))
        card_area.addWidget(self._stroke_order_hint)

        card_area.addStretch(1)
        root.addLayout(card_area, stretch=1)

        self._shortcut_label = QLabel("")
        self._shortcut_label.setObjectName("dim")
        self._shortcut_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._shortcut_label.setFont(_jp_font(10))
        root.addWidget(self._shortcut_label)

        self._reveal_btn = _button("Reveal", ACCENT, self._reveal)
        root.addWidget(self._reveal_btn)

        self._fc_actions = QHBoxLayout()
        self._fc_correct_btn = _button("I knew it", BTN_GOOD, lambda: self._rate(GOOD))
        self._fc_again_btn = _button("Didn't know it", BTN_AGAIN, lambda: self._rate(AGAIN))
        self._fc_actions.addWidget(self._fc_correct_btn)
        self._fc_actions.addWidget(self._fc_again_btn)

        self._fc_actions_wrap = QWidget()
        self._fc_actions_wrap.setLayout(self._fc_actions)
        root.addWidget(self._fc_actions_wrap)

        self._mc_prompt = QLabel("Choose the correct romaji")
        self._mc_prompt.setObjectName("dim")
        self._mc_prompt.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._mc_prompt.setFont(_jp_font(11))
        root.addWidget(self._mc_prompt)

        self._mc_buttons: list[QPushButton] = []
        for index in range(4):
            def _handler(selected_index: int = index) -> None:
                self._answer_mc(selected_index)

            btn = _button(
                "",
                HIGHLIGHT,
                _handler,
                size=12,
            )
            self._mc_buttons.append(btn)
            root.addWidget(btn)

        self._mc_feedback = QLabel("")
        self._mc_feedback.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._mc_feedback.setFont(_jp_font(14, bold=True))
        root.addWidget(self._mc_feedback)

        self._mc_next_btn = _button("Next Question", ACCENT, self._advance_mc, size=15)
        root.addWidget(self._mc_next_btn)

        self._typed_prompt = QLabel("Type the romaji answer")
        self._typed_prompt.setObjectName("dim")
        self._typed_prompt.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._typed_prompt.setFont(_jp_font(11))
        root.addWidget(self._typed_prompt)

        self._typed_input = QLineEdit()
        self._typed_input.setPlaceholderText("Type romaji and press Enter")
        self._typed_input.setFont(_jp_font(14))
        self._typed_input.returnPressed.connect(self._submit_typed_answer)
        root.addWidget(self._typed_input)

        self._typed_submit_btn = _button("Submit", HIGHLIGHT, self._submit_typed_answer, size=12)
        root.addWidget(self._typed_submit_btn)

        self._typed_feedback = QLabel("")
        self._typed_feedback.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._typed_feedback.setFont(_jp_font(14, bold=True))
        root.addWidget(self._typed_feedback)

        self._typed_reveal_btn = _button("Reveal Answer", BTN_HARD, self._reveal_typed_answer, size=12)
        root.addWidget(self._typed_reveal_btn)

        self._typed_next_btn = _button("Next Question", ACCENT, self._advance_typed, size=15)
        root.addWidget(self._typed_next_btn)

        self._hide_all_bottom_widgets()

    def handle_key(self, key: int) -> None:
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if self._mode == "multiple_choice":
                if self._mc_answered:
                    self._advance_mc()
                return
            if self._mode == "typed_answer":
                if self._typed_answered:
                    if self._typed_needs_reveal:
                        self._reveal_typed_answer()
                    else:
                        self._advance_typed()
                    return
                self._submit_typed_answer()
                return
            self._reveal()
            return
        if key == Qt.Key.Key_Space and self._mode == "flashcard":
            self._reveal()
            return
        if key == Qt.Key.Key_1:
            if self._mode == "multiple_choice":
                self._answer_mc(0)
            elif self._mode == "typed_answer":
                self._submit_typed_answer()
            else:
                self._rate(GOOD)
            return
        if key == Qt.Key.Key_2:
            if self._mode == "multiple_choice":
                self._answer_mc(1)
            elif self._mode == "typed_answer":
                self._reveal_typed_answer()
            else:
                self._rate(AGAIN)
            return
        if key == Qt.Key.Key_3 and self._mode == "multiple_choice":
            self._answer_mc(2)
            return
        if key == Qt.Key.Key_4 and self._mode == "multiple_choice":
            self._answer_mc(3)
            return
        if key == Qt.Key.Key_N and self._mode == "typed_answer":
            self._advance_typed()

    def _hide_all_bottom_widgets(self) -> None:
        self._reveal_btn.hide()
        self._fc_actions_wrap.hide()
        self._mc_prompt.hide()
        for btn in self._mc_buttons:
            btn.hide()
        self._mc_feedback.hide()
        self._mc_next_btn.hide()
        self._typed_prompt.hide()
        self._typed_input.hide()
        self._typed_submit_btn.hide()
        self._typed_feedback.hide()
        self._typed_reveal_btn.hide()
        self._typed_next_btn.hide()

    def _show_flashcard_question(self) -> None:
        self._hide_all_bottom_widgets()
        self._shortcut_label.setText("Enter/Space reveal, 1 knew it, 2 again")
        self._reveal_btn.show()
        self._refresh_stroke_order()

    def _show_mc_question(self) -> None:
        self._hide_all_bottom_widgets()
        current = self._current
        deck = self._deck
        if current is None or deck is None:
            return
        self._shortcut_label.setText("1-4 answer, Enter next")
        self._mc_options = _build_multiple_choice_options(current, deck.cards)
        self._mc_answered = False
        self._mc_prompt.show()
        for i, btn in enumerate(self._mc_buttons):
            if i >= len(self._mc_options):
                btn.hide()
                continue
            btn.setText(f"{i + 1}.  {self._mc_options[i]}")
            btn.setEnabled(True)
            btn.setStyleSheet(f"background: {HIGHLIGHT}; color: {BTN_FG};")
            btn.show()
        self._refresh_stroke_order()

    def _show_typed_question(self) -> None:
        self._hide_all_bottom_widgets()
        self._shortcut_label.setText("Enter submit, 2 reveal, N next")
        self._typed_answered = False
        self._typed_needs_reveal = False
        self._typed_prompt.show()
        self._typed_input.clear()
        self._typed_input.setEnabled(True)
        self._typed_input.show()
        self._typed_submit_btn.show()
        self._typed_feedback.hide()
        self._typed_reveal_btn.hide()
        self._typed_next_btn.hide()
        self._typed_input.setFocus()
        self._refresh_stroke_order()

    def _toggle_stroke_order(self) -> None:
        self._stroke_order_visible = not self._stroke_order_visible
        self._refresh_stroke_order()

    def _refresh_stroke_order(self) -> None:
        current = self._current
        if current is None or not self._stroke_order_visible:
            self._stroke_order_image.hide()
            self._stroke_order_hint.hide()
            return

        asset = _find_stroke_order_asset(current.character)
        if asset is None:
            self._stroke_order_image.hide()
            self._stroke_order_hint.setText(
                f"No stroke-order asset for {current.character}. Add PNG/JPG/WEBP in assets/stroke_order/."
            )
            self._stroke_order_hint.show()
            return

        pixmap = QPixmap(str(asset))
        if pixmap.isNull():
            self._stroke_order_image.hide()
            self._stroke_order_hint.setText(f"Could not load stroke-order image: {asset.name}")
            self._stroke_order_hint.show()
            return

        scaled = pixmap.scaled(280, 280, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
        self._stroke_order_image.setPixmap(scaled)
        self._stroke_order_image.show()
        self._stroke_order_hint.setText(f"Stroke-order asset: {asset.name}")
        self._stroke_order_hint.show()

    def _switch_mode(self) -> None:
        modes = ["flashcard", "multiple_choice", "typed_answer"]
        if self._mode not in modes:
            self._mode = "flashcard"
        else:
            self._mode = modes[(modes.index(self._mode) + 1) % len(modes)]
        self._mode_label.setText(_mode_label_text(self._mode))
        self._romaji_label.setText("")
        if self._current is None:
            return
        if self._mode == "multiple_choice":
            self._char_label.setFont(_jp_font(86, bold=True))
            self._show_mc_question()
            return
        if self._mode == "typed_answer":
            self._char_label.setFont(_jp_font(98, bold=True))
            self._show_typed_question()
            return
        self._char_label.setFont(_jp_font(110, bold=True))
        self._show_flashcard_question()

    def load(self, deck: Deck, mode: str = "flashcard") -> None:
        self._deck = deck
        self._mode = mode
        card_ids = [card.id for card in deck.cards]
        self._states = study_pipeline.load_review_states(deck.name, card_ids)
        self._queue = [card for card in deck.cards if self._states[card.id].is_due()]
        self._cards_by_id = {card.id: card for card in deck.cards}
        random.shuffle(self._queue)
        self._correct = 0
        self._total = len(self._queue)
        self._session_started_at = time.perf_counter()
        self._struggle_counts = {}
        self._deck_label.setText(deck.name)
        self._mode_label.setText(_mode_label_text(mode))
        self._next_card()

    def _next_card(self) -> None:
        deck = self._deck
        if deck is None:
            return

        if not self._queue:
            elapsed_seconds = 0
            if self._session_started_at is not None:
                elapsed_seconds = round(time.perf_counter() - self._session_started_at)
            weakest_items = _build_weakest_items(self._cards_by_id, self._struggle_counts)
            self.app.show_session_complete(
                self._correct, self._total, deck.name, elapsed_seconds, weakest_items
            )
            return

        self._current = self._queue.pop(0)
        remaining = len(self._queue) + 1
        self._progress_label.setText(f"{self._total - remaining + 1} / {self._total}")
        self._char_label.setText(self._current.character)
        self._romaji_label.setText("")

        if self._mode == "multiple_choice":
            self._char_label.setFont(_jp_font(86, bold=True))
            self._show_mc_question()
        elif self._mode == "typed_answer":
            self._char_label.setFont(_jp_font(98, bold=True))
            self._show_typed_question()
        else:
            self._char_label.setFont(_jp_font(110, bold=True))
            self._show_flashcard_question()

    def _reveal(self) -> None:
        if self._mode != "flashcard" or self._current is None:
            return
        self._romaji_label.setText(self._current.romaji)
        self._reveal_btn.hide()
        self._fc_actions_wrap.show()

    def _rate(self, quality: int) -> None:
        current = self._current
        deck = self._deck
        if self._mode != "flashcard" or current is None or deck is None:
            return
        if quality == AGAIN:
            self._struggle_counts[current.id] = self._struggle_counts.get(current.id, 0) + 1
        else:
            self._correct += 1
        state = study_pipeline.review_card(deck.name, self._states[current.id], quality)
        self._states[current.id] = state
        self._next_card()

    def _answer_mc(self, option_index: int) -> None:
        current = self._current
        deck = self._deck
        if (
            self._mode != "multiple_choice"
            or current is None
            or deck is None
            or self._mc_answered
            or option_index < 0
            or option_index >= len(self._mc_options)
        ):
            return

        selected = self._mc_options[option_index]
        is_correct = selected == current.romaji
        quality = GOOD if is_correct else AGAIN

        if is_correct:
            self._correct += 1
        else:
            self._struggle_counts[current.id] = self._struggle_counts.get(current.id, 0) + 1

        state = study_pipeline.review_card(deck.name, self._states[current.id], quality)
        self._states[current.id] = state
        self._mc_answered = True

        for i, btn in enumerate(self._mc_buttons):
            if i >= len(self._mc_options):
                continue
            btn.setStyleSheet(
                f"background: {BTN_GOOD if self._mc_options[i] == current.romaji else BTN_AGAIN}; color: {BTN_FG};"
            )
            btn.setEnabled(False)

        if is_correct:
            self._mc_feedback.setText("Correct!")
            self._mc_feedback.setStyleSheet(f"color: {BTN_GOOD};")
        else:
            self._mc_feedback.setText(f"Not quite - the answer was {current.romaji}")
            self._mc_feedback.setStyleSheet(f"color: {BTN_AGAIN};")
        self._mc_feedback.show()
        self._mc_next_btn.show()

    def _advance_mc(self) -> None:
        if self._mode != "multiple_choice" or not self._mc_answered:
            return
        self._next_card()

    def _submit_typed_answer(self) -> None:
        current = self._current
        deck = self._deck
        if self._mode != "typed_answer" or current is None or deck is None or self._typed_answered:
            return

        user_answer = self._typed_input.text()
        assessment = assess_typed_answer(current.romaji, user_answer)
        quality = GOOD if assessment.state == "exact" else AGAIN

        if quality == GOOD:
            self._correct += 1
        else:
            self._struggle_counts[current.id] = self._struggle_counts.get(current.id, 0) + 1

        state = study_pipeline.review_card(deck.name, self._states[current.id], quality)
        self._states[current.id] = state
        self._typed_answered = True
        self._typed_input.setEnabled(False)
        self._typed_submit_btn.hide()

        if assessment.state == "exact":
            self._typed_feedback.setText("Exact match")
            self._typed_feedback.setStyleSheet(f"color: {BTN_GOOD};")
            self._typed_needs_reveal = False
            self._typed_next_btn.show()
        elif assessment.state == "near_miss":
            self._typed_feedback.setText("Near miss")
            self._typed_feedback.setStyleSheet(f"color: {BTN_HARD};")
            self._typed_needs_reveal = True
            self._typed_reveal_btn.show()
        else:
            self._typed_feedback.setText("Incorrect")
            self._typed_feedback.setStyleSheet(f"color: {BTN_AGAIN};")
            self._typed_needs_reveal = True
            self._typed_reveal_btn.show()
        self._typed_feedback.show()

    def _reveal_typed_answer(self) -> None:
        if self._mode != "typed_answer" or not self._typed_answered or not self._typed_needs_reveal:
            return
        current = self._current
        if current is None:
            return
        self._romaji_label.setText(current.romaji)
        self._typed_reveal_btn.hide()
        self._typed_needs_reveal = False
        self._typed_next_btn.show()

    def _advance_typed(self) -> None:
        if self._mode != "typed_answer" or not self._typed_answered or self._typed_needs_reveal:
            return
        self._next_card()

    def on_hide(self) -> None:
        self._hide_all_bottom_widgets()
        self._stroke_order_image.hide()
        self._stroke_order_hint.hide()


class SessionCompleteFrame(AppFrame):
    def __init__(self, master: "App") -> None:
        super().__init__(master)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(80, 50, 80, 50)
        layout.setSpacing(8)
        layout.addStretch(1)

        title = QLabel("Session Complete!")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setFont(_jp_font(28, bold=True))
        layout.addWidget(title)

        self._deck_label = QLabel("")
        self._deck_label.setObjectName("dim")
        self._deck_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._deck_label.setFont(_jp_font(14))
        layout.addWidget(self._deck_label)

        self._accuracy_label = QLabel("")
        self._accuracy_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._accuracy_label.setFont(_jp_font(56, bold=True))
        layout.addWidget(self._accuracy_label)

        self._score_label = QLabel("")
        self._score_label.setObjectName("dim")
        self._score_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._score_label.setFont(_jp_font(16))
        layout.addWidget(self._score_label)

        self._time_label = QLabel("")
        self._time_label.setObjectName("dim")
        self._time_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._time_label.setFont(_jp_font(13))
        layout.addWidget(self._time_label)

        weakest_title = QLabel("Weakest items")
        weakest_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        weakest_title.setFont(_jp_font(12, bold=True))
        layout.addWidget(weakest_title)

        self._weakest_label = QLabel("No weak items this session.")
        self._weakest_label.setObjectName("dim")
        self._weakest_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._weakest_label.setFont(_jp_font(12))
        self._weakest_label.setWordWrap(True)
        layout.addWidget(self._weakest_label)

        back = _button("Back to Menu", HIGHLIGHT, self.app.go_home)
        layout.addWidget(back)
        layout.addStretch(2)

    def load(
        self,
        correct: int,
        total: int,
        deck_name: str,
        elapsed_seconds: int,
        weakest_items: list[str],
    ) -> None:
        pct = round(correct / total * 100) if total else 0
        self._accuracy_label.setText(f"{pct}%")
        self._score_label.setText(f"{correct} / {total} correct")
        self._time_label.setText(f"Time spent: {_format_elapsed(elapsed_seconds)}")
        self._deck_label.setText(deck_name)
        self._weakest_label.setText(
            "\n".join(weakest_items) if weakest_items else "No weak items this session."
        )

        color = BTN_GOOD if pct >= 70 else BTN_HARD if pct >= 40 else BTN_AGAIN
        self._accuracy_label.setStyleSheet(f"color: {color};")


class StatsFrame(AppFrame):
    def __init__(self, master: "App") -> None:
        super().__init__(master)
        study_pipeline.init_study_db()

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 16, 24, 16)
        root.setSpacing(12)

        top = QHBoxLayout()
        top.addWidget(_button("Back to Menu", HIGHLIGHT, self.app.go_home, size=12))
        top.addStretch(1)
        top.addWidget(_button("A-", HIGHLIGHT, lambda: self.app.adjust_font_scale(-1), size=10))
        top.addWidget(_button("A+", HIGHLIGHT, lambda: self.app.adjust_font_scale(1), size=10))
        top.addWidget(_button("Contrast", HIGHLIGHT, self.app.toggle_high_contrast, size=10))
        root.addLayout(top)

        title = QLabel("Progress")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setFont(_jp_font(24, bold=True))
        root.addWidget(title)

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QFrame.Shape.NoFrame)
        self._scroll.setStyleSheet("QScrollArea { border: none; }")

        self._cards_root = QWidget()
        self._cards_layout = QVBoxLayout(self._cards_root)
        self._cards_layout.setContentsMargins(0, 0, 0, 0)
        self._cards_layout.setSpacing(12)
        self._cards_layout.addStretch(1)
        self._scroll.setWidget(self._cards_root)
        root.addWidget(self._scroll, stretch=1)

    def on_show(self) -> None:
        self._render_cards()

    def _render_cards(self) -> None:
        while self._cards_layout.count() > 1:
            item = self._cards_layout.takeAt(0)
            if item is None:
                continue
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()

        for key, loader in ALL_DECKS.items():
            deck = loader()
            deck_theme = DECK_THEMES.get(key, {"stats_color": HIGHLIGHT})
            card_ids = [card.id for card in deck.cards]
            states = study_pipeline.load_review_states(deck.name, card_ids)
            due_today, completed_today = study_pipeline.load_today_progress(deck.name, card_ids)

            mastered = sum(1 for state in states.values() if state.repetitions >= 3 and state.interval >= 21)
            learning = sum(1 for state in states.values() if 0 < state.repetitions < 3)
            new = sum(1 for state in states.values() if state.repetitions == 0)
            due = sum(1 for state in states.values() if state.is_due())
            total = len(deck.cards)
            pct = round(mastered / total * 100) if total else 0

            panel = QFrame()
            panel.setObjectName("cardPanel")
            panel_layout = QGridLayout(panel)
            panel_layout.setContentsMargins(20, 16, 20, 16)
            panel_layout.setHorizontalSpacing(18)
            panel_layout.setVerticalSpacing(5)

            deck_title = QLabel(deck.name)
            deck_title.setFont(_jp_font(16, bold=True))
            deck_title.setStyleSheet(f"color: {deck_theme['stats_color']};")
            panel_layout.addWidget(deck_title, 0, 0, 1, 2)

            bar = QFrame()
            bar.setFixedHeight(10)
            bar.setStyleSheet("background: #333355; border-radius: 5px;")
            fill = QFrame(bar)
            fill_width = max(1, round(300 * pct / 100))
            fill.setGeometry(0, 0, fill_width, 10)
            fill.setStyleSheet(f"background: {BTN_GOOD}; border-radius: 5px;")
            panel_layout.addWidget(bar, 1, 0, 1, 2)

            rows = [
                ("Total", str(total), FG),
                ("Mastered", str(mastered), BTN_GOOD),
                ("Learning", str(learning), BTN_HARD),
                ("New", str(new), FG_DIM),
                ("Due now", str(due), BTN_AGAIN),
                ("Due today", str(due_today), BTN_AGAIN),
                ("Completed today", str(completed_today), BTN_GOOD),
                ("Today progress", f"{completed_today}/{due_today}", FG),
            ]
            for row, (label_text, value_text, color) in enumerate(rows, start=2):
                label = QLabel(label_text)
                label.setObjectName("dim")
                label.setFont(_jp_font(11))
                value = QLabel(value_text)
                value.setAlignment(
                    Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
                )
                value.setFont(_jp_font(11, bold=True))
                value.setStyleSheet(f"color: {color};")
                panel_layout.addWidget(label, row, 0)
                panel_layout.addWidget(value, row, 1)

            self._cards_layout.insertWidget(self._cards_layout.count() - 1, panel)


class NoDueFrame(AppFrame):
    def __init__(self, master: "App") -> None:
        super().__init__(master)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(80, 80, 80, 80)
        layout.setSpacing(10)
        layout.addStretch(1)

        title = QLabel("All done!")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setFont(_jp_font(28, bold=True))
        title.setStyleSheet(f"color: {BTN_GOOD};")
        layout.addWidget(title)

        self._deck_label = QLabel("")
        self._deck_label.setObjectName("dim")
        self._deck_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._deck_label.setFont(_jp_font(14))
        layout.addWidget(self._deck_label)

        text = QLabel("No cards due today.\nCome back tomorrow!")
        text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        text.setFont(_jp_font(14))
        layout.addWidget(text)

        back = _button("Back", HIGHLIGHT, self.app.go_home)
        layout.addWidget(back)
        layout.addStretch(2)

    def load(self, deck_name: str) -> None:
        self._deck_label.setText(deck_name)


class App(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("JPLearn")
        self.setMinimumSize(900, 700)
        self.resize(1100, 820)
        self._font_scale_steps = 0
        self._high_contrast = False

        root = QWidget()
        self.setCentralWidget(root)
        self._stack_layout = QVBoxLayout(root)
        self._stack_layout.setContentsMargins(0, 0, 0, 0)

        self._frames: dict[str, AppFrame] = {
            "home": HomeFrame(self),
            "flashcard": FlashcardFrame(self),
            "complete": SessionCompleteFrame(self),
            "stats": StatsFrame(self),
            "no_due": NoDueFrame(self),
        }
        self._active_frame: AppFrame | None = None

        for frame in self._frames.values():
            frame.hide()
            self._stack_layout.addWidget(frame)

        view_menu = self.menuBar().addMenu("View")
        zoom_in = QAction("Increase Font Size", self)
        zoom_in.setShortcut("Ctrl+=")
        zoom_in.triggered.connect(lambda: self.adjust_font_scale(1))
        view_menu.addAction(zoom_in)

        zoom_out = QAction("Decrease Font Size", self)
        zoom_out.setShortcut("Ctrl+-")
        zoom_out.triggered.connect(lambda: self.adjust_font_scale(-1))
        view_menu.addAction(zoom_out)

        contrast_action = QAction("Toggle High Contrast", self)
        contrast_action.setShortcut("F8")
        contrast_action.triggered.connect(self.toggle_high_contrast)
        view_menu.addAction(contrast_action)

        self._show_frame("home")

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if isinstance(self._active_frame, FlashcardFrame):
            self._active_frame.handle_key(event.key())
            event.accept()
            return
        super().keyPressEvent(event)

    def _show_frame(self, key: str) -> None:
        frame = self._frames[key]
        if self._active_frame is not None:
            self._active_frame.on_hide()
            self._active_frame.hide()
        self._active_frame = frame
        frame.show()
        frame.on_show()

    def go_home(self) -> None:
        self._show_frame("home")

    def start_review(self, deck_key: str, mode: str = "flashcard") -> None:
        deck = ALL_DECKS[deck_key]()
        due = [
            card for card in deck.cards
            if study_pipeline.load_review_states(deck.name, [card.id])[card.id].is_due()
        ]
        if not due:
            no_due = self._frames["no_due"]
            assert isinstance(no_due, NoDueFrame)
            no_due.load(deck.name)
            self._show_frame("no_due")
            return

        flashcard = self._frames["flashcard"]
        assert isinstance(flashcard, FlashcardFrame)
        flashcard.load(deck, mode=mode)
        self._show_frame("flashcard")

    def show_session_complete(
        self,
        correct: int,
        total: int,
        deck_name: str,
        elapsed_seconds: int,
        weakest_items: list[str],
    ) -> None:
        complete = self._frames["complete"]
        assert isinstance(complete, SessionCompleteFrame)
        complete.load(correct, total, deck_name, elapsed_seconds, weakest_items)
        self._show_frame("complete")

    def show_stats(self) -> None:
        self._show_frame("stats")

    def adjust_font_scale(self, delta: int) -> None:
        if delta == 0:
            return
        next_steps = max(-3, min(6, self._font_scale_steps + delta))
        if next_steps == self._font_scale_steps:
            return
        self._font_scale_steps = next_steps
        for widget in self.findChildren(QWidget):
            font = widget.font()
            current_size = font.pointSizeF()
            if current_size <= 0:
                continue
            base_size = widget.property("_base_point_size")
            if base_size is None:
                base_size = current_size - (self._font_scale_steps - delta)
                widget.setProperty("_base_point_size", base_size)
            scaled_size = max(8.0, float(base_size) + self._font_scale_steps)
            font.setPointSizeF(scaled_size)
            widget.setFont(font)

    def toggle_high_contrast(self) -> None:
        self._high_contrast = not self._high_contrast
        app = QApplication.instance()
        if isinstance(app, QApplication):
            app.setStyleSheet(_app_stylesheet(self._high_contrast))


def run() -> None:
    app_instance = QApplication.instance()
    app: QApplication
    if isinstance(app_instance, QApplication):
        app = app_instance
    else:
        app = QApplication([])
    app.setStyleSheet(_app_stylesheet())
    window = App()
    window.show()
    app.exec()
