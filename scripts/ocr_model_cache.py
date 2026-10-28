"""Where JPLearn keeps PaddleOCR's weights, and the rule that using OCR never downloads them.

PaddleX fetches official models by name into its cache, ``~/.paddlex/official_models`` unless
``PADDLE_PDX_CACHE_HOME`` says otherwise, and fetches them again from the network whenever that
folder is missing. JPLearn points the cache inside its own assets folder, so "OCR installed" can
mean the weights are really there and uninstall removes them, and the OCR server refuses to
download: the weights arrive only when the learner installs OCR (audit 6 F7, Robbie's ruling
"offline only").

``configure_cache`` must run before ``paddleocr`` or ``paddlex`` is imported: PaddleX reads the
cache folder once, at import.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

# Each group is satisfied by either folder name; PaddleX has used both for the ONNX models.
REQUIRED_MODEL_GROUPS: tuple[tuple[str, ...], ...] = (
    ("PP-OCRv6_medium_det", "PP-OCRv6_medium_det_onnx"),
    ("PP-OCRv6_medium_rec", "PP-OCRv6_medium_rec_onnx"),
)
MISSING_WEIGHTS_MESSAGE = "OCR model files are missing. Reinstall OCR from Settings."


def legacy_models_dir() -> Path:
    """PaddleX's default cache, where installs before audit 6 left the weights."""
    return Path.home() / ".paddlex" / "official_models"


def assets_dir() -> Path | None:
    for name in ("JPLEARN_ASSETS_DIR", "JPLEARN_USER_DATA_DIR", "JPLEARN_DOCUMENTS_DIR"):
        value = os.environ.get(name, "").strip()
        if value:
            return Path(value)
    return None


def cache_home() -> Path | None:
    base = assets_dir()
    return base / "ocr" / "paddlex" if base is not None else None


def configure_cache() -> Path | None:
    """Point PaddleX's cache at the assets folder; return its official_models folder.

    Returns None when no assets folder is configured (a script run outside the app), leaving
    PaddleX's defaults alone.
    """
    home = cache_home()
    if home is None:
        return None
    os.environ["PADDLE_PDX_CACHE_HOME"] = str(home)
    return home / "official_models"


def adopt_legacy_weights(models_dir: Path, legacy_dir: Path | None = None) -> list[str]:
    """Copy required weights from PaddleX's default cache when the app's cache lacks them.

    Installs made before the cache moved have their weights only in ``~/.paddlex``; copying them
    spares a second download. The originals are left where they are. Each copy lands under a
    temporary name and is renamed into place, so an interrupted copy is never mistaken for a
    model. Returns the names copied.
    """
    source_dir = legacy_dir if legacy_dir is not None else legacy_models_dir()
    copied: list[str] = []
    for group in REQUIRED_MODEL_GROUPS:
        for name in group:
            target = models_dir / name
            source = source_dir / name
            if target.exists() or not source.is_dir():
                continue
            staging = models_dir / f"{name}.copying"
            if staging.exists():
                shutil.rmtree(staging)
            models_dir.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, staging)
            staging.rename(target)
            copied.append(name)
    return copied


def has_required_weights(models_dir: Path) -> bool:
    return all(any((models_dir / name).is_dir() for name in group) for group in REQUIRED_MODEL_GROUPS)


def forbid_downloads() -> None:
    """Leave PaddleX no model host, so a missing model fails instead of downloading.

    ``_ModelManager._get_hosters`` is private; if a PaddleX upgrade removes it, the check in
    ``prepare_offline_runtime`` still stops a missing model before PaddleX is asked for it.
    """
    try:
        from paddlex.inference.utils import official_models  # type: ignore
    except Exception:  # pragma: no cover - environment dependent
        return
    manager_cls = getattr(official_models, "_ModelManager", None)
    if manager_cls is not None and hasattr(manager_cls, "_get_hosters"):
        manager_cls._get_hosters = lambda self: []


def prepare_offline_runtime() -> None:
    """Run before the OCR engine is built: the cache in the app folder, and no downloads.

    Raises RuntimeError with a message the learner can act on when the weights are missing.
    Without an assets folder (the OCR server or the bridge run outside the app) the weights are
    read from PaddleX's default cache, under the same rule: use never downloads.
    """
    # Without this PaddleX probes four model hosts before it even looks at the cache.
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    models_dir = configure_cache()
    if models_dir is None:
        models_dir = legacy_models_dir()
    else:
        adopt_legacy_weights(models_dir)
    if not has_required_weights(models_dir):
        raise RuntimeError(MISSING_WEIGHTS_MESSAGE)
