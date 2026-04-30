#!/usr/bin/env bash

set -euo pipefail

IMAGE_PREFIX="${TENCENT_IMAGE_PREFIX:-ccr.ccs.tencentyun.com/tcb-100001011660-qtgo}"
VERSION="latest"
MODE="all"
VERSION_SET=0

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
  ./docker-build-tencent.sh [版本号] [--client-only|-c] [--server-only|-s]

环境变量:
  TENCENT_IMAGE_PREFIX  腾讯云 CCR 镜像命名空间，默认 ccr.ccs.tencentyun.com/tcb-100001011660-qtgo

示例:
  docker login ccr.ccs.tencentyun.com
  TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/namespace ./docker-build-tencent.sh latest
  ./docker-build-tencent.sh 2026-04-30-1 --server-only
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
      if [ "$VERSION_SET" -eq 0 ]; then
        VERSION="$arg"
        VERSION_SET=1
      else
        log_error "无法识别参数: $arg"
        usage
        exit 1
      fi
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
  docker build -t "$(get_image_name "$target")" -f "$dockerfile" .
}

push_image() {
  local target="$1"

  log_info "推送 ${target} 镜像: $(get_image_name "$target")"
  docker push "$(get_image_name "$target")"
}

tag_latest_image() {
  local target="$1"
  local version_image="${IMAGE_PREFIX}/daojie-yusheng-${target}:${VERSION}"
  local latest_image="${IMAGE_PREFIX}/daojie-yusheng-${target}:latest"

  log_info "同步 latest 标签: ${latest_image}"
  docker tag "$version_image" "$latest_image"
  docker push "$latest_image"
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

if [ "$VERSION" != "latest" ]; then
  for target in "${TARGETS[@]}"; do
    tag_latest_image "$target"
  done
fi

printf '\n'
log_info "完成，已推送镜像:"
for target in "${TARGETS[@]}"; do
  printf '  - %s\n' "$(get_image_name "$target")"
done
