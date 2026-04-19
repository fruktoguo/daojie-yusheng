#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import os
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

CODE_EXTENSIONS = {
    ".bash",
    ".c",
    ".cc",
    ".cjs",
    ".css",
    ".cpp",
    ".cs",
    ".cts",
    ".cxx",
    ".go",
    ".h",
    ".html",
    ".hpp",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".less",
    ".lua",
    ".mjs",
    ".mts",
    ".php",
    ".proto",
    ".py",
    ".rb",
    ".rs",
    ".sass",
    ".scala",
    ".scss",
    ".sh",
    ".sql",
    ".swift",
    ".ts",
    ".tsx",
    ".zsh",
}

EXCLUDED_DIR_NAMES = {
    ".cache",
    ".git",
    ".hg",
    ".idea",
    ".next",
    ".nuxt",
    ".pnpm-store",
    ".svn",
    ".turbo",
    ".venv",
    ".vscode",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
    "temp",
    "tmp",
    "vendor",
}

RC_FILE_GLOBS = {
    ".babelrc",
    ".babelrc.*",
    ".commitlintrc",
    ".commitlintrc.*",
    ".eslintrc",
    ".eslintrc.*",
    ".lintstagedrc",
    ".lintstagedrc.*",
    ".prettierrc",
    ".prettierrc.*",
    ".stylelintrc",
    ".stylelintrc.*",
}

AREA_NAMES = ("frontend", "backend", "shared", "other")


@dataclass
class Counters:
    files: int = 0
    lines: int = 0
    non_empty_lines: int = 0

    def add(self, line_count: int, non_empty_count: int) -> None:
        self.files += 1
        self.lines += line_count
        self.non_empty_lines += non_empty_count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="统计项目源码行数，并默认排除常见配置文件。",
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="要统计的目录，默认当前目录。",
    )
    parser.add_argument(
        "--all-files",
        action="store_true",
        help="忽略 git 跟踪范围，直接遍历文件系统。",
    )
    parser.add_argument(
        "--extra-exclude",
        action="append",
        default=[],
        help="追加排除 glob，按相对 root 的 posix 路径匹配，可重复传入。",
    )
    return parser.parse_args()


def run_git(args: list[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip()


def iter_git_files(root: Path) -> tuple[str, list[Path]] | None:
    repo_root_raw = run_git(["rev-parse", "--show-toplevel"], root)
    if not repo_root_raw:
        return None

    repo_root = Path(repo_root_raw).resolve()
    try:
        scope = root.resolve().relative_to(repo_root)
        pathspec = "." if str(scope) == "." else scope.as_posix()
    except ValueError:
        return None

    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "ls-files", "-z", "--", pathspec],
            check=True,
            capture_output=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None

    raw_paths = [entry for entry in result.stdout.decode("utf-8", errors="ignore").split("\0") if entry]
    files = [repo_root / entry for entry in raw_paths]
    return "git-tracked", files


def iter_filesystem_files(root: Path) -> tuple[str, list[Path]]:
    files: list[Path] = []
    for current_root, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in EXCLUDED_DIR_NAMES]
        current_path = Path(current_root)
        for filename in filenames:
            files.append(current_path / filename)
    return "filesystem", files


def is_hidden_or_excluded_dir(relative_path: PurePosixPath) -> bool:
    return any(part in EXCLUDED_DIR_NAMES for part in relative_path.parts[:-1])


def is_config_file(relative_path: PurePosixPath) -> bool:
    filename = relative_path.name
    lowercase_name = filename.lower()

    if any(fnmatch.fnmatch(filename, pattern) for pattern in RC_FILE_GLOBS):
        return True
    if any(fnmatch.fnmatch(lowercase_name, pattern) for pattern in ("*.config.*", "*.conf.*")):
        return True

    return False


def matches_extra_excludes(relative_path: PurePosixPath, extra_patterns: list[str]) -> bool:
    relative_text = relative_path.as_posix()
    return any(fnmatch.fnmatch(relative_text, pattern) for pattern in extra_patterns)


def is_code_file(relative_path: PurePosixPath) -> bool:
    suffix = Path(relative_path.name).suffix.lower()
    return suffix in CODE_EXTENSIONS


def count_file_lines(path: Path) -> tuple[int, int]:
    content = path.read_text(encoding="utf-8", errors="ignore")
    lines = content.splitlines()
    non_empty = sum(1 for line in lines if line.strip())
    return len(lines), non_empty


def format_row(extension: str, counters: Counters) -> str:
    return (
        f"{extension:<8}"
        f"{counters.files:>6} files"
        f"{counters.lines:>10} lines"
        f"{counters.non_empty_lines:>10} non-empty"
    )


def format_area_row(area: str, counters: Counters) -> str:
    return (
        f"{area:<10}"
        f"{counters.files:>6} files"
        f"{counters.lines:>10} lines"
        f"{counters.non_empty_lines:>10} non-empty"
    )


def detect_area(relative_path: PurePosixPath) -> str:
    parts = relative_path.parts
    if len(parts) >= 2 and parts[0] == "packages":
        package_name = parts[1]
        if package_name in {"client", "config-editor"}:
            return "frontend"
        if package_name in {"server"}:
            return "backend"
        if package_name in {"shared"}:
            return "shared"
    return "other"


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    if not root.exists():
        print(f"目录不存在: {root}", file=sys.stderr)
        return 1
    if not root.is_dir():
        print(f"目标不是目录: {root}", file=sys.stderr)
        return 1

    discovery = None if args.all_files else iter_git_files(root)
    if discovery is None:
        mode, files = iter_filesystem_files(root)
    else:
        mode, files = discovery

    total = Counters()
    by_extension: dict[str, Counters] = defaultdict(Counters)
    by_area: dict[str, Counters] = {area: Counters() for area in AREA_NAMES}
    by_area_extension: dict[str, dict[str, Counters]] = {
        area: defaultdict(Counters) for area in AREA_NAMES
    }
    excluded_config_files = 0

    for path in files:
        try:
            relative_path = PurePosixPath(path.resolve().relative_to(root).as_posix())
        except ValueError:
            continue

        if is_hidden_or_excluded_dir(relative_path):
            continue
        if matches_extra_excludes(relative_path, args.extra_exclude):
            continue
        if not is_code_file(relative_path):
            continue
        if is_config_file(relative_path):
            excluded_config_files += 1
            continue

        try:
            line_count, non_empty_count = count_file_lines(path)
        except OSError as exc:
            print(f"跳过无法读取的文件: {relative_path} ({exc})", file=sys.stderr)
            continue

        extension = Path(relative_path.name).suffix.lower()
        area = detect_area(relative_path)
        total.add(line_count, non_empty_count)
        by_extension[extension].add(line_count, non_empty_count)
        by_area[area].add(line_count, non_empty_count)
        by_area_extension[area][extension].add(line_count, non_empty_count)

    print(f"统计目录: {root}")
    print(f"扫描模式: {mode}")
    print(f"代码文件数: {total.files}")
    print(f"总行数: {total.lines}")
    print(f"非空行数: {total.non_empty_lines}")
    print(f"排除的配置代码文件: {excluded_config_files}")

    if not by_extension:
        return 0

    print("\n按区域汇总:")
    for area in AREA_NAMES:
        counters = by_area[area]
        if counters.files == 0:
            continue
        print(format_area_row(area, counters))

    print("\n按扩展名汇总:")
    for extension, counters in sorted(
        by_extension.items(),
        key=lambda item: (-item[1].lines, item[0]),
    ):
        print(format_row(extension, counters))

    for area in AREA_NAMES:
        area_extensions = by_area_extension[area]
        if not area_extensions:
            continue
        print(f"\n{area} 按扩展名汇总:")
        for extension, counters in sorted(
            area_extensions.items(),
            key=lambda item: (-item[1].lines, item[0]),
        ):
            print(format_row(extension, counters))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
