"""Flashcard quiz mode using Rich for terminal display."""

import random
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich import print as rprint

from data import database
from domain.cards import Deck
from domain.scheduler import ReviewState, update, AGAIN, HARD, GOOD, EASY

console = Console()

_QUALITY_MAP = {
    "1": AGAIN,
    "2": HARD,
    "3": GOOD,
    "4": EASY,
}


def run_flashcard_session(deck: Deck) -> None:
    """Run a flashcard review session for cards due today."""
    database.init_db()
    card_ids = [c.id for c in deck.cards]
    states = database.load_states(deck.name, card_ids)

    due_cards = [c for c in deck.cards if states[c.id].is_due()]
    random.shuffle(due_cards)

    if not due_cards:
        rprint(f"\n[green]No cards due today in [bold]{deck.name}[/bold]! Come back tomorrow.[/green]")
        return

    console.rule(f"[bold cyan]{deck.name} — {len(due_cards)} cards due[/bold cyan]")

    correct = 0
    for i, card in enumerate(due_cards, 1):
        console.print(f"\n[dim]Card {i}/{len(due_cards)}[/dim]")
        console.print(
            Panel(f"[bold yellow]{card.character}[/bold yellow]", title="Character", expand=False)
        )
        Prompt.ask("[dim]Press Enter to reveal answer[/dim]", default="")

        console.print(
            Panel(
                f"[bold green]{card.romaji}[/bold green]"
                + (f"\n[dim]{card.example_word}[/dim]" if card.example_word else ""),
                title="Answer",
                expand=False,
            )
        )

        rating = None
        while rating not in _QUALITY_MAP:
            rating = Prompt.ask(
                "[cyan]How did you do?[/cyan]  [red]1=Again[/red]  [yellow]2=Hard[/yellow]  [green]3=Good[/green]  [blue]4=Easy[/blue]",
                default="3",
            )

        quality = _QUALITY_MAP[rating]
        if quality >= 3:
            correct += 1
        updated_state = update(states[card.id], quality)
        database.save_state(deck.name, updated_state)

    accuracy = round(correct / len(due_cards) * 100)
    console.rule()
    rprint(f"\n[bold]Session complete![/bold]  Accuracy: [cyan]{accuracy}%[/cyan]  ({correct}/{len(due_cards)})")
