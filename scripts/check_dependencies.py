#!/usr/bin/env python3
"""Check package import dependencies and common import orders."""
from __future__ import annotations

import ast
import os
import subprocess
import sys
from collections import defaultdict
from importlib.util import resolve_name
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
PACKAGE = APP / "novelhelper"


def module_name(path: Path) -> str:
    relative = path.relative_to(PACKAGE).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(("novelhelper", *parts))


MODULE_PATHS = {module_name(path): path for path in PACKAGE.rglob("*.py")}


def package_owner(module: str, path: Path) -> str:
    if path.name == "__init__.py":
        return module
    return module.rpartition(".")[0]


class ImportScanner(ast.NodeVisitor):
    def __init__(self, module: str, path: Path) -> None:
        self.module = module
        self.current_package = package_owner(module, path)
        self.owner = self.current_package
        self.edges: set[str] = set()
        self.function_imports = 0
        self.function_depth = 0
        self.private_crossings: set[tuple[str, int, str]] = set()

    def _record(self, target: str, line: int) -> None:
        if target not in MODULE_PATHS:
            return
        self.edges.add(target)
        imported_owner = package_owner(target, MODULE_PATHS[target])
        private = any(part.startswith("_") for part in target.split(".")[1:])
        if private and imported_owner != self.owner:
            self.private_crossings.add((self.module, line, target))

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.function_depth += 1
        self.generic_visit(node)
        self.function_depth -= 1

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Import(self, node: ast.Import) -> None:
        if self.function_depth:
            self.function_imports += 1
        for alias in node.names:
            candidate = alias.name
            while candidate and candidate not in MODULE_PATHS:
                candidate = candidate.rpartition(".")[0]
            if candidate:
                self._record(candidate, node.lineno)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if self.function_depth:
            self.function_imports += 1
        if node.level:
            base = resolve_name("." * node.level + (node.module or ""), self.current_package)
        else:
            base = node.module or ""
        self._record(base, node.lineno)
        for alias in node.names:
            if alias.name == "*":
                continue
            candidate = f"{base}.{alias.name}" if base else alias.name
            if candidate in MODULE_PATHS:
                self._record(candidate, node.lineno)


def strongly_connected_components(graph: dict[str, set[str]]) -> list[list[str]]:
    index = 0
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    components: list[list[str]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for target in graph.get(node, set()):
            if target not in indices:
                visit(target)
                lowlinks[node] = min(lowlinks[node], lowlinks[target])
            elif target in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[target])
        if lowlinks[node] == indices[node]:
            component = []
            while True:
                target = stack.pop()
                on_stack.remove(target)
                component.append(target)
                if target == node:
                    break
            if len(component) > 1 or node in graph.get(node, set()):
                components.append(sorted(component))

    for node in graph:
        if node not in indices:
            visit(node)
    return components


def check_dynamic_imports() -> bool:
    modules = [
        "novelhelper.server",
        "novelhelper.project",
        "novelhelper.store",
        "novelhelper.history",
        "novelhelper.logger",
        "novelhelper.app",
    ]
    checks = [
        ("关键模块导入顺序 A", modules),
        ("关键模块导入顺序 B", list(reversed(modules))),
    ]
    passed = True
    for label, requested in checks:
        code = "import importlib; " + "; ".join(
            f"importlib.import_module({name!r})" for name in requested
        )
        env = os.environ.copy()
        paths = [str(APP)]
        old_path = env.get("PYTHONPATH")
        if old_path:
            paths.append(old_path)
        env["PYTHONPATH"] = os.pathsep.join(paths)
        result = subprocess.run(
            [sys.executable, "-B", "-c", code],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            print(f"[PASS] {label}")
        else:
            passed = False
            print(f"[FAIL] {label}")
            if result.stdout:
                print(result.stdout.rstrip())
            if result.stderr:
                print(result.stderr.rstrip())
    return passed


def main() -> int:
    graph: dict[str, set[str]] = defaultdict(set)
    function_imports = 0
    private_crossings: set[tuple[str, int, str]] = set()
    for module, path in MODULE_PATHS.items():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        scanner = ImportScanner(module, path)
        scanner.visit(tree)
        graph[module].update(scanner.edges)
        function_imports += scanner.function_imports
        private_crossings.update(scanner.private_crossings)

    cycles = strongly_connected_components(graph)
    edge_count = sum(map(len, graph.values()))
    print(
        f"静态范围：{len(MODULE_PATHS)} 个 novelhelper Python 模块，"
        f"{edge_count} 条项目内依赖边；包含函数体内导入（{function_imports} 处）。"
    )
    if cycles:
        for component in cycles:
            print("[FAIL] 循环依赖: " + " -> ".join(component))
    else:
        print("[PASS] 未发现模块依赖环")
    if private_crossings:
        for source, line, target in sorted(private_crossings):
            print(f"[FAIL] 跨包导入私有模块: {source}:{line} -> {target}")
    else:
        print("[PASS] 未发现跨包导入私有模块")

    dynamic_passed = check_dynamic_imports()
    return 1 if cycles or private_crossings or not dynamic_passed else 0


if __name__ == "__main__":
    raise SystemExit(main())
