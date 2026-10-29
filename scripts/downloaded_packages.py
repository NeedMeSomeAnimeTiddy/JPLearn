"""Make the Python packages setup downloaded for an optional feature importable.

The installed app keeps them in JPLearn Assets, outside its version folder, which updates replace
(audit 13, F1/F2). The main process names the ready folders in JPLEARN_PYTHON_PACKAGES
(electron/python_packages.cjs). ``site.addsitedir`` appends them after the bundle's own packages, so
nothing already importable is shadowed, and processes any ``.pth`` files they hold. Running from
source the variable is unset and this does nothing.
"""
from __future__ import annotations

import os
import site
import sys


def activate() -> None:
    for folder in os.environ.get("JPLEARN_PYTHON_PACKAGES", "").split(os.pathsep):
        folder = folder.strip()
        if folder and folder not in sys.path and os.path.isdir(folder):
            site.addsitedir(folder)
