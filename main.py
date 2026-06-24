"""JPLearn — Japanese learning app entry point."""

from rich.console import Console
from rich.prompt import Prompt
from rich import print as rprint

from src.decks import ALL_DECKS
from src.quiz import run_flashcard_session
from src.stats import show_deck_progress

console = Console()

DECK_MENU = {
    "1": "hiragana",
    "2": "katakana",
}


def select_deck():
    console.rule("[bold cyan]Select a Deck[/bold cyan]")
    rprint("  [bold]1[/bold]  Hiragana")
    rprint("  [bold]2[/bold]  Katakana")
    choice = Prompt.ask("\nDeck", choices=list(DECK_MENU.keys()))
    deck_key = DECK_MENU[choice]
    return ALL_DECKS[deck_key]()


def main_menu() -> None:
    console.clear()
    console.rule("[bold yellow]JPLearn[/bold yellow]")
    rprint("\n  [bold]1[/bold]  Flashcard review")
    rprint("  [bold]2[/bold]  View progress")
    rprint("  [bold]q[/bold]  Quit\n")
    return Prompt.ask("Choice", choices=["1", "2", "q"], default="1")


def main() -> None:
    while True:
        choice = main_menu()

        if choice == "q":
            rprint("\n[bold]Goodbye! 頑張って！[/bold]\n")
            break

        deck = select_deck()

        if choice == "1":
            run_flashcard_session(deck)
        elif choice == "2":
            show_deck_progress(deck)

        Prompt.ask("\n[dim]Press Enter to return to menu[/dim]", default="")


if __name__ == "__main__":
    main()
