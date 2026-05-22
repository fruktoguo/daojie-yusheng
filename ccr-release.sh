#!/usr/bin/env bash
# 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
# 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。

# 一体化发布脚本（适合 WSL）：
#   1. 交互式输入提交信息
#   2. git add -A && git commit && git push
#   3. CCR latest 完整构建 + 推送（client + server）
#   4. CCR prod   完整构建 + 推送（client + server）
#
# 用法：
#   ./ccr-release.sh
#
# 环境变量（可选）：
#   TENCENT_IMAGE_PREFIX  传给 docker-build-*.sh，默认沿用其内部默认值
#   SKIP_GIT=1            跳过 git 步骤，仅做 CCR 构建推送
#   SKIP_CONFIRM=1        跳过最终确认提示

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { printf '%b[INFO]%b %s\n'  "$GREEN"  "$NC" "$1"; }
log_warn()  { printf '%b[WARN]%b %s\n'  "$YELLOW" "$NC" "$1"; }
log_error() { printf '%b[ERROR]%b %s\n' "$RED"    "$NC" "$1" >&2; }
log_step()  { printf '\n%b==>%b %s\n'   "$BLUE"   "$NC" "$1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SKIP_GIT="${SKIP_GIT:-0}"
SKIP_CONFIRM="${SKIP_CONFIRM:-0}"

#------------------------------------------------------------------------------
# 0. 环境检查
#------------------------------------------------------------------------------
log_step "环境检查"

if ! command -v git >/dev/null 2>&1; then
  log_error "未找到 git，请先安装"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  log_error "未找到 docker，请先安装"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  log_error "Docker 不可用，请先启动 Docker Desktop / dockerd"
  exit 1
fi
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  log_error "当前目录不是 git 仓库: $SCRIPT_DIR"
  exit 1
fi

if [ ! -x "./docker-build-latest.sh" ]; then
  log_error "缺少可执行的 ./docker-build-latest.sh"
  exit 1
fi
if [ ! -x "./docker-build-prod.sh" ]; then
  log_error "缺少可执行的 ./docker-build-prod.sh"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log_info "工作目录: $SCRIPT_DIR"
log_info "当前分支: $CURRENT_BRANCH"
log_info "镜像前缀: ${TENCENT_IMAGE_PREFIX:-（脚本内默认）}"

#------------------------------------------------------------------------------
# 1. Git 状态 + 输入提交信息
#------------------------------------------------------------------------------
COMMIT_MSG=""
HAS_CHANGES=0

if [ "$SKIP_GIT" != "1" ]; then
  log_step "Git 状态"
  git status --short || true

  if [ -n "$(git status --porcelain)" ]; then
    HAS_CHANGES=1
  fi

  if [ "$HAS_CHANGES" -eq 1 ]; then
    log_step "输入提交信息（单行，回车确认；输入空内容则取消）"
    printf '提交信息: '
    IFS= read -r COMMIT_MSG || true
    # 去掉首尾空白
    COMMIT_MSG="$(printf '%s' "$COMMIT_MSG" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [ -z "$COMMIT_MSG" ]; then
      log_error "提交信息为空，已取消"
      exit 1
    fi
  else
    log_warn "工作区没有需要提交的改动，将跳过 commit，仍会执行 push 与 CCR 构建推送"
  fi
else
  log_warn "SKIP_GIT=1，跳过 git 步骤"
fi

#------------------------------------------------------------------------------
# 2. 最终确认
#------------------------------------------------------------------------------
log_step "即将执行"
if [ "$SKIP_GIT" != "1" ]; then
  if [ "$HAS_CHANGES" -eq 1 ]; then
    printf '  - git add -A\n'
    printf '  - git commit -m %q\n' "$COMMIT_MSG"
  fi
  printf '  - git push (branch: %s)\n' "$CURRENT_BRANCH"
fi
printf '  - ./docker-build-latest.sh   (client + server, tag: latest)\n'
printf '  - ./docker-build-prod.sh     (client + server, tag: prod)\n'

if [ "$SKIP_CONFIRM" != "1" ]; then
  printf '\n确认继续？[y/N] '
  IFS= read -r CONFIRM || true
  case "$CONFIRM" in
    y|Y|yes|YES) ;;
    *) log_warn "已取消"; exit 0 ;;
  esac
fi

#------------------------------------------------------------------------------
# 3. Git 提交 + 推送
#------------------------------------------------------------------------------
if [ "$SKIP_GIT" != "1" ]; then
  if [ "$HAS_CHANGES" -eq 1 ]; then
    log_step "git add -A"
    git add -A

    log_step "git commit"
    git commit -m "$COMMIT_MSG"
  fi

  log_step "git push"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
  else
    log_warn "当前分支没有上游，使用 -u origin $CURRENT_BRANCH"
    git push -u origin "$CURRENT_BRANCH"
  fi
fi

#------------------------------------------------------------------------------
# 4. CCR latest 构建 + 推送（client + server）
#------------------------------------------------------------------------------
log_step "CCR latest 构建 + 推送（client + server）"
log_warn "若推送失败，请先执行: docker login ccr.ccs.tencentyun.com"
./docker-build-latest.sh

#------------------------------------------------------------------------------
# 5. CCR prod 构建 + 推送（client + server）
#------------------------------------------------------------------------------
log_step "CCR prod 构建 + 推送（client + server）"
./docker-build-prod.sh

#------------------------------------------------------------------------------
# 完成
#------------------------------------------------------------------------------
printf '\n'
log_info "全部完成 ✅"
log_info "镜像 tag: latest, prod"
log_info "服务器侧的 daojie-ccr-auto-update.timer 会在约 60s 内拉取新 latest 镜像并自动更新 Swarm 服务"
