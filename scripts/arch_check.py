import ast
import sys
from pathlib import Path


RULES: dict[str, dict[str, list[str]]] = {
    "src": {"forbid": []},
    "domain": {"forbid": ["data", "ui"]},
    "data": {"forbid": ["ui"]},
    "ui": {"forbid": []},
}


def get_layer(path: Path) -> str | None:
    try:
        return path.relative_to(Path(".")).parts[0]
    except Exception:
        return None


def extract_imports(file_path: Path) -> set[str]:
    with open(file_path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=str(file_path))

    imports = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module.split(".")[0])
        elif isinstance(node, ast.Import):
            for n in node.names:
                imports.add(n.name.split(".")[0])

    return imports


def check_file(file_path: Path) -> list[str]:
    layer = get_layer(file_path)
    if not layer or layer not in RULES:
        return []

    forbidden = set(RULES[layer]["forbid"])
    imports = extract_imports(file_path)

    violations = []
    for imp in imports:
        if imp in forbidden:
            violations.append(
                f"{file_path}: {layer} layer cannot import {imp}"
            )

    return violations


def main():
    root = Path(".")
    errors = []

    for py_file in root.rglob("*.py"):
        if any(part in {"venv", ".venv", "__pycache__"} for part in py_file.parts):
            continue

        errors.extend(check_file(py_file))

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print("Import rules OK")


if __name__ == "__main__":
    main()