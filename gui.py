"""Legacy Python GUI entrypoint.

This entrypoint is deprecated and now delegates to ``main.py`` which surfaces
an Electron migration message.
"""

from __future__ import annotations

from main import launch


def main() -> None:
    launch()


if __name__ == "__main__":
    main()
