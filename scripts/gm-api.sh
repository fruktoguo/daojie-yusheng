#!/usr/bin/env bash
# 正式服 GM API 助手：登录换 token、缓存复用、封装常用只读/运维端点。
# 密码永不写死，从 prod.env（gitignored）或环境变量读取。
# 用法见 .claude/skills/prod-gm-api/SKILL.md
set -euo pipefail

# ---- 可配置项（均有生产友好默认值）----
BASE_URL="${GM_BASE_URL:-https://dj.faith.wang}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${GM_ENV_FILE:-$REPO_ROOT/prod.env}"
CACHE_DIR="${GM_CACHE_DIR:-$REPO_ROOT/.runtime}"
CACHE_FILE="$CACHE_DIR/.gm-api-token"
TOKEN_MAX_AGE="${GM_TOKEN_MAX_AGE:-39600}"   # 11h，服务端默认 12h TTL
CURL_TIMEOUT="${GM_CURL_TIMEOUT:-30}"

die() { echo "[gm-api] $*" >&2; exit 1; }
command -v curl >/dev/null || die "缺少 curl"
command -v jq >/dev/null || die "缺少 jq"

# ---- 读取密码：优先环境变量，其次 prod.env ----
read_password() {
  if [ -n "${SERVER_GM_PASSWORD:-}" ]; then printf '%s' "$SERVER_GM_PASSWORD"; return; fi
  if [ -n "${GM_PASSWORD:-}" ]; then printf '%s' "$GM_PASSWORD"; return; fi
  [ -f "$ENV_FILE" ] || die "找不到密码：环境变量未设，且 $ENV_FILE 不存在"
  local val
  val="$(grep -E '^SERVER_GM_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  [ -z "$val" ] && val="$(grep -E '^GM_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  [ -z "$val" ] && die "在 $ENV_FILE 中找不到 GM_PASSWORD"
  printf '%s' "$val"
}

# ---- 登录换取 accessToken 并写缓存 ----
login() {
  local pw resp token
  pw="$(read_password)"
  resp="$(curl -s --max-time "$CURL_TIMEOUT" -X POST "$BASE_URL/api/auth/gm/login" \
    -H 'Content-Type: application/json' \
    --data "$(jq -nc --arg p "$pw" '{password:$p}')")" \
    || die "登录请求失败（网络/域名不可达）"
  token="$(printf '%s' "$resp" | jq -r '.accessToken // empty')"
  [ -z "$token" ] && die "登录失败，响应：$resp"
  mkdir -p "$CACHE_DIR"
  ( umask 177; printf '%s' "$token" > "$CACHE_FILE" )
  printf '%s' "$token"
}

# ---- 取有效 token：缓存新鲜则复用，否则重新登录 ----
ensure_token() {
  if [ -f "$CACHE_FILE" ]; then
    local now mtime age
    now="$(date +%s)"; mtime="$(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)"
    age=$(( now - mtime ))
    if [ "$age" -lt "$TOKEN_MAX_AGE" ] && [ -s "$CACHE_FILE" ]; then
      cat "$CACHE_FILE"; return
    fi
  fi
  login
}

# ---- 带鉴权请求；遇 401 自动重登一次 ----
# api METHOD PATH [JSON_BODY]
api() {
  local method="$1" path="$2" body="${3:-}" token out code body_out
  token="$(ensure_token)"
  _call() {
    local tk="$1"
    local args=(-s --max-time "$CURL_TIMEOUT" -w '\n%{http_code}' -X "$method"
      -H "Authorization: Bearer $tk")
    if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' --data "$body"); fi
    curl "${args[@]}" "$BASE_URL$path"
  }
  out="$(_call "$token")" || die "请求失败：$method $path"
  code="$(printf '%s' "$out" | tail -n1)"
  body_out="$(printf '%s' "$out" | sed '$d')"
  if [ "$code" = "401" ]; then
    token="$(login)"
    out="$(_call "$token")" || die "请求失败：$method $path"
    code="$(printf '%s' "$out" | tail -n1)"
    body_out="$(printf '%s' "$out" | sed '$d')"
  fi
  # 非 2xx 时把状态码打到 stderr，但仍输出响应体，便于诊断
  case "$code" in 2*) ;; *) echo "[gm-api] HTTP $code: $method $path" >&2 ;; esac
  if printf '%s' "$body_out" | jq . >/dev/null 2>&1; then
    printf '%s' "$body_out" | jq .
  else
    printf '%s\n' "$body_out"
  fi
}

# ---- 二进制备份下载；避免通用 api() 将响应装入 shell 变量而损坏内容 ----
# download_backup BACKUP_ID DESTINATION
download_backup() {
  local backup_id="$1" destination="$2" token status temp_file
  [ -n "$backup_id" ] || die "备份 ID 不能为空"
  [ -n "$destination" ] || die "下载目标不能为空"
  [ ! -e "$destination" ] || die "下载目标已存在：$destination"
  mkdir -p "$(dirname "$destination")"
  temp_file="$(mktemp "${destination}.tmp.XXXXXX")"
  token="$(ensure_token)"
  _download() {
    local tk="$1"
    curl -sS --max-time "$CURL_TIMEOUT" -o "$temp_file" -w '%{http_code}' \
      -H "Authorization: Bearer $tk" \
      "$BASE_URL/api/gm/database/backups/$backup_id/download"
  }
  status="$(_download "$token")" || {
    rm -f "$temp_file"
    die "备份下载失败：$backup_id"
  }
  if [ "$status" = "401" ]; then
    token="$(login)"
    status="$(_download "$token")" || {
      rm -f "$temp_file"
      die "备份下载失败：$backup_id"
    }
  fi
  case "$status" in
    2*) mv "$temp_file" "$destination" ;;
    *)
      rm -f "$temp_file"
      die "备份下载失败：HTTP $status，备份 $backup_id"
      ;;
  esac
  printf '%s\n' "$destination"
}

# ---- 诊断查询（只读 SQL / 内置指令）----
diag() {
  local cmd="$1" limit="${2:-100}"
  api POST /api/gm/diagnostics/query \
    "$(jq -nc --arg c "$cmd" --argjson l "$limit" '{command:$c,limit:$l}')"
}

usage() {
  cat >&2 <<'EOF'
用法: bash scripts/gm-api.sh <子命令> [参数]

  token                 打印当前有效 accessToken（必要时自动登录）
  login                 强制重新登录刷新缓存
  get  <path>           鉴权 GET，如 get /api/gm/state
  post <path> [json]    鉴权 POST，json 为请求体字符串
  raw  <METHOD> <path> [json]   任意方法
  download-backup <id> <path>   下载数据库备份到指定本地路径

  logs [limit] [before] 服务端控制台日志（默认 100 条）
  state                 全服运行态总览
  players [search]      玩家列表（可搜索）
  player <id>           单玩家详情
  workers               worker/outbox/备份心跳
  dbstate               数据库连接与备份列表

  diag "<command>"      诊断指令：help|tables|presence all|player <id>|inventory <id>...
  sql  "<SELECT...>"    只读 SQL（自动加只读围栏）
  tables                列出所有表
  presence              在线玩家（presence all）

环境变量: GM_BASE_URL(默认 https://dj.faith.wang) GM_ENV_FILE GM_PASSWORD
EOF
  exit 1
}

# ---- 分发 ----
cmd="${1:-}"; shift || true
case "$cmd" in
  token)    ensure_token; echo ;;
  login)    login >/dev/null && echo "已刷新 token 缓存" ;;
  get)      [ $# -ge 1 ] || usage; api GET "$1" ;;
  post)     [ $# -ge 1 ] || usage; api POST "$1" "${2:-}" ;;
  raw)      [ $# -ge 2 ] || usage; api "$1" "$2" "${3:-}" ;;
  download-backup) [ $# -ge 2 ] || usage; download_backup "$1" "$2" ;;
  logs)     p="/api/gm/logs?limit=${1:-100}"; [ -n "${2:-}" ] && p="$p&before=$2"; api GET "$p" ;;
  state)    api GET /api/gm/state ;;
  players)  if [ -n "${1:-}" ]; then api GET "/api/gm/players?search=$1"; else api GET /api/gm/players; fi ;;
  player)   [ $# -ge 1 ] || usage; api GET "/api/gm/players/$1" ;;
  workers)  api GET /api/gm/workers ;;
  dbstate)  api GET /api/gm/database/state ;;
  diag)     [ $# -ge 1 ] || usage; diag "$1" "${2:-100}" ;;
  sql)      [ $# -ge 1 ] || usage; diag "sql $1" "${2:-100}" ;;
  tables)   diag "tables" ;;
  presence) diag "presence all" ;;
  ""|-h|--help) usage ;;
  *)        echo "[gm-api] 未知子命令: $cmd" >&2; usage ;;
esac
