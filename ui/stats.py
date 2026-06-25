"""Progress and stats display."""

from rich.console import Console
from rich.table import Table

from data import database
from domain.cards import Deck

console = Console()


def show_deck_progress(deck: Deck) -> None:
    """Print a summary table of progress for a deck."""
    database.init_db()
    card_ids = [c.id for c in deck.cards]
    states = database.load_states(deck.name, card_ids)

    mastered = sum(1 for s in states.values() if s.repetitions >= 3 and s.interval >= 21)
    learning = sum(1 for s in states.values() if 0 < s.repetitions < 3)
    new = sum(1 for s in states.values() if s.repetitions == 0)
    due_today = sum(1 for s in states.values() if s.is_due())

    table = Table(title=f"{deck.name} Progress", show_header=True, header_style="bold cyan")
    table.add_column("Stat", style="bold")
    table.add_column("Count", justify="right")

    table.add_row("Total cards", str(len(deck.cards)))
    table.add_row("[green]Mastered[/green]", str(mastered))
    table.add_row("[yellow]Learning[/yellow]", str(learning))
    table.add_row("[dim]New[/dim]", str(new))
    table.add_row("[red]Due today[/red]", str(due_today))

    console.print(table)
