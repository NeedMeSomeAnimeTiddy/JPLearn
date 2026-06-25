"""tkinter GUI for JPLearn."""

import random
from functools import partial
from typing import Any
import tkinter as tk
from tkinter import font as tkfont

from data import database
from domain.cards import Card, Deck
from domain.decks import ALL_DECKS
from domain.scheduler import ReviewState, update, AGAIN, HARD, GOOD, EASY

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
BG = "#1a1a2e"
CARD_BG = "#16213e"
ACCENT = "#e94560"
FG = "#eaeaea"
FG_DIM = "#888888"
BTN_AGAIN = "#c0392b"
BTN_HARD = "#e67e22"
BTN_GOOD = "#27ae60"
BTN_EASY = "#2980b9"
BTN_FG = "#ffffff"
HIGHLIGHT = "#0f3460"

JP_FONT_CANDIDATES = ["Yu Gothic", "Meiryo", "MS Gothic", "Noto Sans CJK JP", "TkDefaultFont"]


def _jp_font(size: int, bold: bool = False) -> tuple:
    """Return the best available Japanese font."""
    available = tkfont.families()
    for name in JP_FONT_CANDIDATES:
        if name in available:
            weight = "bold" if bold else "normal"
            return (name, size, weight)
    return ("TkDefaultFont", size, "bold" if bold else "normal")


# ---------------------------------------------------------------------------
# Base frame helper
# ---------------------------------------------------------------------------
class AppFrame(tk.Frame):
    def __init__(self, master: "App"):
        super().__init__(master, bg=BG)
        self.app = master

    def show(self):
        self.place(relx=0, rely=0, relwidth=1, relheight=1)
        self.lift()

    def hide(self):
        self.place_forget()


# ---------------------------------------------------------------------------
# Home / deck selection screen
# ---------------------------------------------------------------------------
class HomeFrame(AppFrame):
    def __init__(self, master: "App"):
        super().__init__(master)

        tk.Label(self, text="JPLearn", font=_jp_font(36, bold=True),
                 bg=BG, fg=ACCENT).pack(pady=(50, 4))
        tk.Label(self, text="日本語を学ぼう", font=_jp_font(18),
                 bg=BG, fg=FG_DIM).pack(pady=(0, 40))

        tk.Label(self, text="Choose a deck", font=_jp_font(13),
                 bg=BG, fg=FG).pack(pady=(0, 16))

        btn_cfg: dict[str, Any] = dict(width=18, font=_jp_font(13, bold=True),
                                       fg=BTN_FG, relief="flat", cursor="hand2", pady=10)

        tk.Button(self, text="ひ  Hiragana", bg="#6c3483",
                  command=lambda: self.app.start_review("hiragana"),
                  **btn_cfg).pack(pady=6)

        tk.Button(self, text="カ  Katakana", bg="#1a5276",
                  command=lambda: self.app.start_review("katakana"),
                  **btn_cfg).pack(pady=6)

        tk.Label(self, text="", bg=BG).pack(pady=10)

        tk.Button(self, text="📊  View Progress", bg=HIGHLIGHT,
                  command=self.app.show_stats,
                  **btn_cfg).pack(pady=6)


# ---------------------------------------------------------------------------
# Flashcard review screen
# ---------------------------------------------------------------------------
class FlashcardFrame(AppFrame):
    def __init__(self, master: "App"):
        super().__init__(master)
        self._deck: Deck | None = None
        self._queue: list[Card] = []
        self._states: dict[int, ReviewState] = {}
        self._current: Card | None = None
        self._correct = 0
        self._total = 0

        # ── header ──────────────────────────────────────────────────────────
        header = tk.Frame(self, bg=CARD_BG)
        header.pack(fill="x", pady=(0, 2))

        self._deck_label = tk.Label(header, text="", font=_jp_font(11),
                                    bg=CARD_BG, fg=FG_DIM)
        self._deck_label.pack(side="left", padx=14, pady=8)

        self._progress_label = tk.Label(header, text="", font=_jp_font(11),
                                        bg=CARD_BG, fg=FG_DIM)
        self._progress_label.pack(side="right", padx=14, pady=8)

        tk.Button(header, text="✕ Quit", font=_jp_font(10), bg=CARD_BG,
                  fg=FG_DIM, relief="flat", cursor="hand2",
                  command=self.app.go_home).pack(side="right", padx=4)

        # ── card panel ──────────────────────────────────────────────────────
        card_area = tk.Frame(self, bg=BG)
        card_area.pack(expand=True, fill="both", pady=20)

        self._char_label = tk.Label(card_area, text="", font=_jp_font(110, bold=True),
                                    bg=BG, fg=FG)
        self._char_label.pack(expand=True)

        self._romaji_label = tk.Label(card_area, text="", font=_jp_font(28),
                                      bg=BG, fg=ACCENT)
        self._romaji_label.pack()

        # ── bottom buttons ───────────────────────────────────────────────────
        self._reveal_btn = tk.Button(
            self, text="Reveal  ↩", font=_jp_font(13, bold=True),
            bg=ACCENT, fg=BTN_FG, relief="flat", cursor="hand2",
            pady=12, command=self._reveal,
        )
        self._reveal_btn.pack(fill="x", padx=60, pady=(0, 30))

        self._rating_frame = tk.Frame(self, bg=BG)
        self._rating_frame.pack(fill="x", padx=30, pady=(0, 30))

        rating_btns = [
            ("Again", BTN_AGAIN, AGAIN),
            ("Hard",  BTN_HARD,  HARD),
            ("Good",  BTN_GOOD,  GOOD),
            ("Easy",  BTN_EASY,  EASY),
        ]
        for label, colour, quality in rating_btns:
            tk.Button(
                self._rating_frame, text=label, font=_jp_font(12, bold=True),
                bg=colour, fg=BTN_FG, relief="flat", cursor="hand2",
                pady=10, command=partial(self._rate, quality),
            ).pack(side="left", expand=True, fill="x", padx=4)

        self._bind_keys()

    def _bind_keys(self):
        self.app.bind("<Return>", lambda _: self._reveal())
        self.app.bind("1", lambda _: self._rate(AGAIN))
        self.app.bind("2", lambda _: self._rate(HARD))
        self.app.bind("3", lambda _: self._rate(GOOD))
        self.app.bind("4", lambda _: self._rate(EASY))

    def _unbind_keys(self):
        for key in ("<Return>", "1", "2", "3", "4"):
            self.app.unbind(key)

    def load(self, deck: Deck) -> None:
        self._deck = deck
        database.init_db()
        card_ids = [c.id for c in deck.cards]
        self._states = database.load_states(deck.name, card_ids)
        self._queue = [c for c in deck.cards if self._states[c.id].is_due()]
        random.shuffle(self._queue)
        self._correct = 0
        self._total = len(self._queue)
        self._deck_label.config(text=deck.name)
        self._next_card()

    def _next_card(self) -> None:
        deck = self._deck
        if deck is None:
            return

        if not self._queue:
            self._unbind_keys()
            self.app.show_session_complete(self._correct, self._total, deck.name)
            return

        self._current = self._queue.pop(0)
        remaining = len(self._queue) + 1
        self._progress_label.config(text=f"{self._total - remaining + 1} / {self._total}")
        self._char_label.config(text=self._current.character)
        self._romaji_label.config(text="")
        self._reveal_btn.pack(fill="x", padx=60, pady=(0, 30))
        self._rating_frame.pack_forget()

    def _reveal(self) -> None:
        if self._current is None:
            return
        self._romaji_label.config(text=self._current.romaji)
        self._reveal_btn.pack_forget()
        self._rating_frame.pack(fill="x", padx=30, pady=(0, 30))

    def _rate(self, quality: int) -> None:
        deck = self._deck
        if self._current is None or deck is None or self._rating_frame.winfo_ismapped() == 0:
            return
        if quality >= GOOD:
            self._correct += 1
        state = update(self._states[self._current.id], quality)
        database.save_state(deck.name, state)
        self._next_card()

    def show(self):
        super().show()
        self._bind_keys()

    def hide(self):
        self._unbind_keys()
        super().hide()


# ---------------------------------------------------------------------------
# Session complete screen
# ---------------------------------------------------------------------------
class SessionCompleteFrame(AppFrame):
    def __init__(self, master: "App"):
        super().__init__(master)
        self._accuracy_var = tk.StringVar()
        self._score_var = tk.StringVar()
        self._deck_var = tk.StringVar()

        tk.Label(self, text="Session Complete!", font=_jp_font(28, bold=True),
                 bg=BG, fg=ACCENT).pack(pady=(70, 10))

        tk.Label(self, textvariable=self._deck_var, font=_jp_font(14),
                 bg=BG, fg=FG_DIM).pack()

        tk.Label(self, textvariable=self._accuracy_var, font=_jp_font(56, bold=True),
                 bg=BG, fg=FG).pack(pady=(30, 0))

        tk.Label(self, textvariable=self._score_var, font=_jp_font(16),
                 bg=BG, fg=FG_DIM).pack(pady=(4, 40))

        tk.Button(self, text="Back to Menu", font=_jp_font(13, bold=True),
                  bg=HIGHLIGHT, fg=BTN_FG, relief="flat", cursor="hand2",
                  pady=12, command=self.app.go_home).pack(padx=80, fill="x")

    def load(self, correct: int, total: int, deck_name: str) -> None:
        pct = round(correct / total * 100) if total else 0
        self._accuracy_var.set(f"{pct}%")
        self._score_var.set(f"{correct} / {total} correct")
        self._deck_var.set(deck_name)

        colour = BTN_GOOD if pct >= 70 else BTN_HARD if pct >= 40 else BTN_AGAIN
        for w in self.winfo_children():
            if isinstance(w, tk.Label) and w.cget("textvariable") == str(self._accuracy_var):
                w.config(fg=colour)
                break


# ---------------------------------------------------------------------------
# Stats screen
# ---------------------------------------------------------------------------
class StatsFrame(AppFrame):
    def __init__(self, master: "App"):
        super().__init__(master)
        database.init_db()

        tk.Label(self, text="Progress", font=_jp_font(24, bold=True),
                 bg=BG, fg=ACCENT).pack(pady=(40, 20))

        self._cards_frame = tk.Frame(self, bg=BG)
        self._cards_frame.pack(expand=True)

        tk.Button(self, text="← Back", font=_jp_font(12, bold=True),
                  bg=HIGHLIGHT, fg=BTN_FG, relief="flat", cursor="hand2",
                  pady=10, command=self.app.go_home).pack(padx=100, fill="x", pady=30)

    def show(self):
        for w in self._cards_frame.winfo_children():
            w.destroy()

        deck_colours = {"hiragana": "#6c3483", "katakana": "#1a5276"}

        for key, loader in ALL_DECKS.items():
            deck = loader()
            card_ids = [c.id for c in deck.cards]
            states = database.load_states(deck.name, card_ids)

            mastered = sum(1 for s in states.values() if s.repetitions >= 3 and s.interval >= 21)
            learning = sum(1 for s in states.values() if 0 < s.repetitions < 3)
            new = sum(1 for s in states.values() if s.repetitions == 0)
            due = sum(1 for s in states.values() if s.is_due())
            total = len(deck.cards)
            pct = round(mastered / total * 100)

            panel = tk.Frame(self._cards_frame, bg=CARD_BG, padx=24, pady=16)
            panel.pack(fill="x", padx=40, pady=10, ipadx=10, ipady=6)

            colour = deck_colours.get(key, HIGHLIGHT)
            tk.Label(panel, text=deck.name, font=_jp_font(16, bold=True),
                     bg=CARD_BG, fg=colour).grid(row=0, column=0, columnspan=2, sticky="w")

            # Progress bar (canvas)
            bar_canvas = tk.Canvas(panel, height=10, bg="#333355",
                                   highlightthickness=0, width=300)
            bar_canvas.grid(row=1, column=0, columnspan=2, sticky="w", pady=(6, 10))
            bar_width = max(1, round(300 * pct / 100))
            bar_canvas.create_rectangle(0, 0, bar_width, 10, fill=BTN_GOOD, outline="")

            rows = [
                ("Total",    str(total),    FG),
                ("Mastered", str(mastered), BTN_GOOD),
                ("Learning", str(learning), BTN_HARD),
                ("New",      str(new),      FG_DIM),
                ("Due today",str(due),      BTN_AGAIN),
            ]
            for r, (label, val, colour_fg) in enumerate(rows, start=2):
                tk.Label(panel, text=label, font=_jp_font(11),
                         bg=CARD_BG, fg=FG_DIM, anchor="w").grid(
                    row=r, column=0, sticky="w", padx=(0, 30))
                tk.Label(panel, text=val, font=_jp_font(11, bold=True),
                         bg=CARD_BG, fg=colour_fg).grid(row=r, column=1, sticky="e")

        super().show()


# ---------------------------------------------------------------------------
# No-cards-due screen
# ---------------------------------------------------------------------------
class NoDueFrame(AppFrame):
    def __init__(self, master: "App"):
        super().__init__(master)
        self._deck_var = tk.StringVar()

        tk.Label(self, text="All done!", font=_jp_font(28, bold=True),
                 bg=BG, fg=BTN_GOOD).pack(pady=(80, 10))
        tk.Label(self, textvariable=self._deck_var, font=_jp_font(14),
                 bg=BG, fg=FG_DIM).pack()
        tk.Label(self, text="No cards due today.\nCome back tomorrow!",
                 font=_jp_font(14), bg=BG, fg=FG, justify="center").pack(pady=30)
        tk.Button(self, text="← Back", font=_jp_font(13, bold=True),
                  bg=HIGHLIGHT, fg=BTN_FG, relief="flat", cursor="hand2",
                  pady=12, command=self.app.go_home).pack(padx=100, fill="x")

    def load(self, deck_name: str):
        self._deck_var.set(deck_name)


# ---------------------------------------------------------------------------
# App (root window + navigation controller)
# ---------------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("JPLearn")
        self.geometry("520x680")
        self.resizable(False, False)
        self.configure(bg=BG)

        self._home = HomeFrame(self)
        self._flashcard = FlashcardFrame(self)
        self._complete = SessionCompleteFrame(self)
        self._stats = StatsFrame(self)
        self._no_due = NoDueFrame(self)

        self._home.show()

    def go_home(self):
        for frame in (self._flashcard, self._complete, self._stats, self._no_due):
            frame.hide()
        self._home.show()

    def start_review(self, deck_key: str):
        deck = ALL_DECKS[deck_key]()
        database.init_db()
        due = [c for c in deck.cards
               if database.load_states(deck.name, [c.id])[c.id].is_due()]
        if not due:
            self._home.hide()
            self._no_due.load(deck.name)
            self._no_due.show()
            return

        self._home.hide()
        self._flashcard.load(deck)
        self._flashcard.show()

    def show_session_complete(self, correct: int, total: int, deck_name: str):
        self._flashcard.hide()
        self._complete.load(correct, total, deck_name)
        self._complete.show()

    def show_stats(self):
        self._home.hide()
        self._stats.show()


def run():
    app = App()
    app.mainloop()
