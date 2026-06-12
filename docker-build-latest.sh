#!/usr/bin/env bash
# 本脚本负责构建并推送 latest 标签的客户端/服务端 Docker 镜像。
# 维护时重点确认 TENCENT_IMAGE_PREFIX、目标包 Dockerfile 和缓存破坏参数，避免把本地测试镜像误推到生产命名空间。

set -euo pipefail

IMAGE_PREFIX="${TENCENT_IMAGE_PREFIX:-ccr.ccs.tencentyun.com/yuohira}"
VERSION="latest"
MODE="all"
VERSION_SET=1
BUILD_CACHEBUST="${BUILD_CACHEBUST:-$(git rev-parse HEAD 2>/dev/null || date +%s)}"
PNPM_VERSION="${PNPM_VERSION:-10.29.1}"
NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { printf '%b[INFO]%b %s\n' "$GREEN" "$NC" "$1"; }
log_warn() { printf '%b[WARN]%b %s\n' "$YELLOW" "$NC" "$1"; }
log_error() { printf '%b[ERROR]%b %s\n' "$RED" "$NC" "$1" >&2; }

usage() {
  cat <<'USAGE'
用法:
  ./docker-build-latest.sh [--client-only|-c] [--server-only|-s]

环境变量:
  TENCENT_IMAGE_PREFIX  腾讯云 CCR 镜像命名空间，默认 ccr.ccs.tencentyun.com/tcb-100001011660-qtgo
  NPM_CONFIG_REGISTRY   Docker 构建期 npm/pnpm registry，默认 https://registry.npmmirror.com
  PNPM_VERSION          Docker 构建期 pnpm 版本，默认 10.29.1

示例:
  docker login ccr.ccs.tencentyun.com
  TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/namespace ./docker-build-latest.sh
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --client-only|-c)
      MODE="client-only"
      ;;
    --server-only|-s)
      MODE="server-only"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "latest 构建脚本不接收版本参数: $arg"
      usage
      exit 1
      ;;
  esac
done

case "$MODE" in
  all)
    TARGETS=("client" "server")
    ;;
  client-only)
    TARGETS=("client")
    ;;
  server-only)
    TARGETS=("server")
    ;;
  *)
    log_error "无效构建模式: $MODE"
    exit 1
    ;;
esac

get_image_name() {
  local target="$1"
  printf '%s/daojie-yusheng-%s:%s' "$IMAGE_PREFIX" "$target" "$VERSION"
}

build_image() {
  local target="$1"
  local dockerfile="packages/${target}/Dockerfile"

  log_info "构建 ${target} 镜像: $(get_image_name "$target")"
  docker build \
    --build-arg "BUILD_CACHEBUST=${BUILD_CACHEBUST}" \
    --build-arg "NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}" \
    --build-arg "PNPM_VERSION=${PNPM_VERSION}" \
    -t "$(get_image_name "$target")" \
    -f "$dockerfile" .
}

push_image() {
  local target="$1"

  log_info "推送 ${target} 镜像: $(get_image_name "$target")"
  docker push "$(get_image_name "$target")"
}

if ! docker info >/dev/null 2>&1; then
  log_error "当前 Docker 不可用，请先启动 Docker"
  exit 1
fi

log_info "镜像仓库前缀: ${IMAGE_PREFIX}"
log_warn "本脚本只构建并推送 Docker 镜像，不会部署服务器，也不会创建数据卷"

for target in "${TARGETS[@]}"; do
  build_image "$target"
done

for target in "${TARGETS[@]}"; do
  push_image "$target"
done

printf '\n'
log_info "完成，已推送镜像:"
for target in "${TARGETS[@]}"; do
  printf '  - %s\n' "$(get_image_name "$target")"
done
