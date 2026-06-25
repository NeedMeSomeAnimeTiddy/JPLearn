"""JPLearn Python entrypoint.

The Python desktop UI has been deprecated in favor of the Electron frontend.
"""

from __future__ import annotations

import ctypes

from startup import detach_console_for_gui_launch


DEPRECATION_MESSAGE = (
    "The Python GUI has been deprecated.\n\n"
    "Use the Electron frontend instead:\n"
    "1. cd electron-frontend\n"
    "2. npm run dev\n"
    "   or\n"
    "   npm run build && npm run start"
)


class PythonGuiDeprecatedError(RuntimeError):
    """Raised when the deprecated Python GUI entrypoint is invoked."""


def run() -> None:
    raise PythonGuiDeprecatedError(DEPRECATION_MESSAGE)


def main() -> None:
    run()


def _show_startup_error(message: str) -> None:
    ctypes.windll.user32.MessageBoxW(0, message, "JPLearn", 0x30)


def launch() -> None:
    detach_console_for_gui_launch()
    try:
        main()
    except PythonGuiDeprecatedError as exc:
        _show_startup_error(str(exc))


if __name__ == "__main__":
    launch()
