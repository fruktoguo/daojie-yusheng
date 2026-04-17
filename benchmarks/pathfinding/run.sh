#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENCH_DIR="$ROOT_DIR/benchmarks/pathfinding"
TS_BIN="$ROOT_DIR/node_modules/.pnpm/node_modules/typescript/bin/tsc"
RUST_MANIFEST="$BENCH_DIR/rust/Cargo.toml"
RUST_BINARY="$BENCH_DIR/rust/target/release/mud-pathfinding-bench"

if [[ ! -f "$TS_BIN" ]]; then
  echo "缺少 TypeScript 编译器: $TS_BIN" >&2
  exit 1
fi

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck source=/dev/null
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "未找到 cargo，请先安装 Rust toolchain。" >&2
  exit 1
fi

pnpm --dir "$ROOT_DIR" --filter @mud/shared-next build
node "$TS_BIN" -p "$BENCH_DIR/tsconfig.json"
cargo build --release --manifest-path "$RUST_MANIFEST"
node "$BENCH_DIR/dist/compare.js" --rust-binary "$RUST_BINARY" "$@"
