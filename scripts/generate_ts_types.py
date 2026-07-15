"""Generate TypeScript interfaces from Python dataclasses in desktop_bridge.py.

Usage:
  python scripts/generate_ts_types.py            # regenerate and write
  python scripts/generate_ts_types.py --check    # verify no drift; exit 1 if diff
"""

from __future__ import annotations

import ast
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BRIDGE_FILE = PROJECT_ROOT / "scripts" / "desktop_bridge.py"
OUTPUT_FILE = PROJECT_ROOT / "electron-frontend" / "src" / "generated" / "types.ts"

PYTHON_TO_TS: dict[str, str] = {
    "int": "number",
    "float": "number",
    "str": "string",
    "bool": "boolean",
    "None": "null",
    "object": "unknown",
}

# ---------------------------------------------------------------------------
# Type annotation → TypeScript string
# ---------------------------------------------------------------------------


def _ts_type(node: ast.expr) -> str:
    """Recursively convert a Python type annotation AST node to a TypeScript type."""

    # Simple names: int, str, bool, None, etc.
    if isinstance(node, ast.Name):
        return PYTHON_TO_TS.get(node.id, node.id)

    # Literal None in annotations (Python 3.8+)
    if isinstance(node, ast.Constant):
        if node.value is None:
            return "null"
        return str(node.value)

    # Generic subscripts: list[T], dict[K, V], Optional[T]
    if isinstance(node, ast.Subscript):
        outer = node.value
        inner = node.slice
        if isinstance(outer, ast.Name):
            if outer.id == "list":
                return f"{_ts_type(inner)}[]"
            if outer.id == "tuple":
                if isinstance(inner, ast.Tuple):
                    if (
                        len(inner.elts) == 2
                        and isinstance(inner.elts[1], ast.Constant)
                        and inner.elts[1].value is Ellipsis
                    ):
                        return f"{_ts_type(inner.elts[0])}[]"
                    return f"[{', '.join(_ts_type(element) for element in inner.elts)}]"
                return f"{_ts_type(inner)}[]"
            if outer.id == "dict":
                # dict[K, V] — inner is a Tuple of two elements
                if isinstance(inner, ast.Tuple) and len(inner.elts) == 2:
                    key_ts = _ts_type(inner.elts[0])
                    val_ts = _ts_type(inner.elts[1])
                    return f"Record<{key_ts}, {val_ts}>"
            if outer.id == "Optional":
                return f"{_ts_type(inner)} | null"
        return f"unknown /* {ast.unparse(node)} */"

    # Union via X | Y syntax (Python 3.10+)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left_ts = _ts_type(node.left)
        right_ts = _ts_type(node.right)
        return f"{left_ts} | {right_ts}"

    # Tuple of types — treat as union (rare in these dataclasses)
    if isinstance(node, ast.Tuple):
        return " | ".join(_ts_type(elt) for elt in node.elts)

    # Fallback: emit unknown with source hint
    try:
        source_hint = ast.unparse(node)
    except Exception:
        source_hint = repr(node)
    return f"unknown /* {source_hint} */"


# ---------------------------------------------------------------------------
# Dataclass detection
# ---------------------------------------------------------------------------


def _is_dataclass(class_def: ast.ClassDef) -> bool:
    for decorator in class_def.decorator_list:
        if isinstance(decorator, ast.Name) and decorator.id == "dataclass":
            return True
        if (
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Name)
            and decorator.func.id == "dataclass"
        ):
            return True
    return False


# ---------------------------------------------------------------------------
# Interface generation
# ---------------------------------------------------------------------------


def _generate_interface(class_def: ast.ClassDef) -> str:
    lines: list[str] = [f"export interface {class_def.name} {{"]
    for stmt in class_def.body:
        if (
            isinstance(stmt, ast.AnnAssign)
            and isinstance(stmt.target, ast.Name)
            and stmt.annotation is not None
        ):
            field = stmt.target.id
            ts = _ts_type(stmt.annotation)
            lines.append(f"  {field}: {ts}")
    lines.append("}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main generation logic
# ---------------------------------------------------------------------------


def generate() -> str:
    source = BRIDGE_FILE.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(BRIDGE_FILE))

    header = textwrap.dedent("""\
        // AUTO-GENERATED — do not edit manually.
        // Run: python scripts/generate_ts_types.py
        // Source: scripts/desktop_bridge.py
        //
        // These interfaces mirror the Python @dataclass types in desktop_bridge.py.
        // Any field-type change in Python should result in a changed file here.
        """)

    interfaces: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and _is_dataclass(node):
            interfaces.append(_generate_interface(node))

    return header + "\n\n".join(interfaces) + "\n"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    check_mode = "--check" in sys.argv

    try:
        content = generate()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if check_mode:
        if not OUTPUT_FILE.exists():
            print(
                f"FAIL  generated/types.ts does not exist — "
                f"run: python scripts/generate_ts_types.py",
                file=sys.stderr,
            )
            return 1
        existing = OUTPUT_FILE.read_text(encoding="utf-8")
        if existing == content:
            print("OK    electron-frontend/src/generated/types.ts is up to date")
            return 0
        print(
            "FAIL  electron-frontend/src/generated/types.ts is out of date — "
            "run: python scripts/generate_ts_types.py",
            file=sys.stderr,
        )
        return 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(content, encoding="utf-8")
    relative = OUTPUT_FILE.relative_to(PROJECT_ROOT)
    print(f"OK    Written {relative}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
