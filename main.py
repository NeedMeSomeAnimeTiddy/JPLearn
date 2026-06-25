"""JPLearn main entrypoint (GUI-forward)."""

from __future__ import annotations

import ctypes
import traceback

from startup import detach_console_for_gui_launch


def run() -> None:
    from ui.qt_app import run as ui_run

    ui_run()


def main() -> None:
    run()


def _show_startup_error(message: str) -> None:
    ctypes.windll.user32.MessageBoxW(0, message, "JPLearn startup error", 0x10)


def launch() -> None:
    detach_console_for_gui_launch()
    try:
        main()
    except Exception as exc:
        if isinstance(exc, ModuleNotFoundError) and exc.name == "PySide6":
            _show_startup_error(
                "A required package is not installed for the Python interpreter used to open this file.\n\n"
                "Run this once in the project folder:\n"
                "python -m pip install -r requirements.txt"
            )
            return
        details = "".join(
            traceback.format_exception_only(type(exc), exc)
        ).strip()
        _show_startup_error(f"JPLearn failed to start.\n\n{details}")


if __name__ == "__main__":
    launch()
