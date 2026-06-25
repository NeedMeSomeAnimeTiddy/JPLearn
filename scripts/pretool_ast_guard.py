import ast
import sys
from pathlib import Path


RULES: dict[str, dict[str, set[str]]] = {
    "domain": {"forbid": {"data", "ui"}},
    "data": {"forbid": {"ui"}},
    "ui": {"forbid": set()},
}


LAYER_ORDER = ("domain", "data", "ui")


def detect_layer(path: Path) -> str | None:
    parts = set(path.parts)
    for layer in LAYER_ORDER:
        if layer in parts:
            return layer
    return None


def extract_imports(path: Path) -> set[str]:
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (SyntaxError, UnicodeDecodeError):
        return set()

    imports: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                imports.add(name.name.split(".")[0])

        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module.split(".")[0])

    return imports


def check_violation(layer: str, imports: set[str]) -> str | None:
    forbidden = RULES[layer]["forbid"]

    violated = forbidden.intersection(imports)

    if violated:
        return f"{layer} layer cannot import {', '.join(sorted(violated))}"

    return None


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(0)

    file_path = Path(sys.argv[1])

    if not file_path.exists():
        sys.exit(0)

    layer = detect_layer(file_path)

    if layer is None:
        sys.exit(0)

    imports = extract_imports(file_path)

    violation = check_violation(layer, imports)

    if violation:
        print(f"BLOCKED: {violation}")
        sys.exit(1)

    print("OK: layer constraints satisfied")
    sys.exit(0)


if __name__ == "__main__":
    main()