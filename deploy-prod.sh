#!/usr/bin/env bash
# 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
# 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
set -euo pipefail

# ============================================================
# 道劫余生 - 一键部署脚本（自包含）
# 用法：把本文件复制到服务器后执行 sudo bash deploy-prod.sh
# 幂等设计：重复运行安全，可用于首次部署 / 重新部署 / 重启
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { printf '%b[INFO]%b  %s\n' "$GREEN" "$NC" "$1"; }
log_warn()  { printf '%b[WARN]%b  %s\n' "$YELLOW" "$NC" "$1"; }
log_error() { printf '%b[ERROR]%b %s\n' "$RED" "$NC" "$1" >&2; }
log_step()  { printf '\n%b==> %s%b\n' "$CYAN" "$1" "$NC"; }

DEFAULT_TENCENT_IMAGE_PREFIX="ccr.ccs.tencentyun.com/tcb-100001011660-qtgo"
DEFAULT_SERVER_CORS_ORIGINS="https://daojie.yuohira.com"
DEPLOY_DIR="/opt/daojie-yusheng"
ENV_FILE="${DEPLOY_DIR}/prod.env"
STACK_FILE="${DEPLOY_DIR}/docker-stack.yml"
STACK_NAME="daojie-yusheng"
DOCKER_AUTH_CONFIG_FILE="/root/.docker/config.json"
AUTO_UPDATE_SCRIPT="${DEPLOY_DIR}/ccr-auto-update.sh"
AUTO_UPDATE_STATE_FILE="${DEPLOY_DIR}/ccr-auto-update.state"
AUTO_UPDATE_SERVICE_FILE="/etc/systemd/system/daojie-ccr-auto-update.service"
AUTO_UPDATE_TIMER_FILE="/etc/systemd/system/daojie-ccr-auto-update.timer"

write_env_var() {
  local key="$1"
  local value="$2"
  printf '%s=%q\n' "$key" "$value"
}

registry_host_from_prefix() {
  local prefix="$1"
  local first_part="${prefix%%/*}"
  if [ "$first_part" = "$prefix" ]; then
    return 0
  fi
  case "$first_part" in
    *.*|*:*|localhost)
      printf '%s' "$first_part"
      ;;
  esac
}

sync_registry_auth_if_available() {
  local registry
  registry="$(registry_host_from_prefix "${TENCENT_IMAGE_PREFIX}")"
  if [ -z "$registry" ]; then
    return 0
  fi

  if [ -s "$DOCKER_AUTH_CONFIG_FILE" ] && grep -Fq "\"${registry}\"" "$DOCKER_AUTH_CONFIG_FILE"; then
    log_info "已检测到 Docker 镜像仓库登录信息: ${registry}"
  else
    log_info "未检测到 Docker 镜像仓库登录信息；按公开镜像仓库继续部署"
    log_warn "如果该仓库实际是私有仓库，请先执行 sudo docker login ${registry} 后重跑"
  fi
}

install_base_packages() {
  local missing=()
  local package

  for package in ca-certificates curl gnupg lsb-release openssl iproute2; do
    if ! dpkg -s "$package" >/dev/null 2>&1; then
      missing+=("$package")
    fi
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    log_error "缺少基础命令且找不到 apt-get；此脚本只支持 Ubuntu/Debian 系发行版"
    exit 1
  fi

  log_step "安装基础依赖"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${missing[@]}"
}

enable_and_start_docker() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker || true
    systemctl start docker || true
  elif command -v service >/dev/null 2>&1; then
    service docker start || true
  fi
}

wait_for_docker() {
  local attempt=1

  while [ "$attempt" -le 30 ]; do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

ensure_swarm_manager() {
  local local_state
  local control_available
  local advertise_addr

  local_state="$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"
  control_available="$(docker info --format '{{.Swarm.ControlAvailable}}' 2>/dev/null || true)"

  if [ "$local_state" = "active" ] && [ "$control_available" = "true" ]; then
    log_info "Swarm manager 已激活"
    return 0
  fi

  if [ "$local_state" = "active" ]; then
    log_warn "当前节点已加入 Swarm 但不是 manager，将重置为单节点 manager"
  else
    log_step "初始化 Docker Swarm"
  fi

  docker swarm leave --force 2>/dev/null || true
  advertise_addr="$(server_primary_ip)"
  if ! docker swarm init --advertise-addr "$advertise_addr"; then
    log_warn "使用 advertise-addr=${advertise_addr} 初始化失败，尝试 Docker 默认地址探测"
    docker swarm init
  fi
  log_info "Swarm manager 初始化完成"
}

server_primary_ip() {
  local ip
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  if [ -z "$ip" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "${ip:-127.0.0.1}"
}

read_with_default() {
  local prompt="$1"
  local default_value="$2"
  local output_var="$3"
  local input=""

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf "%s" "$prompt" >/dev/tty
    read -r input </dev/tty || input=""
  fi

  printf -v "$output_var" '%s' "${input:-$default_value}"
}

pull_required_image() {
  local name="$1"
  local image="$2"
  local registry

  log_info "拉取镜像 ${name}: ${image}"
  if ! docker pull "$image"; then
    log_error "镜像拉取失败: ${image}"
    registry="$(registry_host_from_prefix "${TENCENT_IMAGE_PREFIX:-}")"
    if [ -n "$registry" ]; then
      log_error "请确认镜像前缀/标签正确，服务器能访问镜像仓库；私有仓库需先执行 sudo docker login ${registry}"
    else
      log_error "请确认镜像前缀/标签正确，服务器能访问镜像仓库"
    fi
    exit 1
  fi
}

ensure_port_available() {
  local port="$1"
  local label="$2"

  if docker service ls --filter "name=${STACK_NAME}_${label}" --format '{{.Name}}' 2>/dev/null | grep -Fxq "${STACK_NAME}_${label}"; then
    return 0
  fi

  if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .; then
    log_error "${label} 端口已被占用: ${port}"
    log_error "请停止占用端口的服务，或在 ${ENV_FILE} 中设置对应 PUBLISHED_PORT 后重跑"
    exit 1
  fi
}

install_ccr_auto_update() {
  log_step "安装 CCR 自动更新器"

  cat > "$AUTO_UPDATE_SCRIPT" <<'AUTO_UPDATE_EOF'
#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/daojie-yusheng}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/prod.env}"
STACK_NAME="${STACK_NAME:-daojie-yusheng}"
LOCK_DIR="/tmp/daojie-ccr-auto-update.lock"
STATE_FILE="${STATE_FILE:-${DEPLOY_DIR}/ccr-auto-update.state}"

log() {
  printf '[daojie-ccr-auto-update] %s\n' "$1"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "已有更新任务正在运行，跳过本轮"
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT
mkdir -p "$DEPLOY_DIR"

if [ ! -f "$ENV_FILE" ]; then
  log "配置文件不存在: $ENV_FILE"
  exit 0
fi

set -a
. "$ENV_FILE"
set +a

CLIENT_IMAGE_TAG="${CLIENT_IMAGE_TAG:-latest}"
SERVER_IMAGE_TAG="${SERVER_IMAGE_TAG:-latest}"

if [ -z "${TENCENT_IMAGE_PREFIX:-}" ]; then
  log "TENCENT_IMAGE_PREFIX 未配置，跳过"
  exit 0
fi

# 拉取镜像并返回本地镜像 ID（穿透 registry 缓存）
pull_image_id() {
  local image="$1"
  local pulled_id

  if ! docker pull "$image" >/dev/null; then
    return 0
  fi

  pulled_id="$(docker image inspect "$image" --format '{{.Id}}' 2>/dev/null | head -n 1)"
  printf '%s\n' "$pulled_id"
}

# 获取服务运行中容器的镜像 ID（真实运行态，不依赖 service spec）
running_image_id() {
  local service="$1"
  local container_id
  container_id="$(docker ps --filter "label=com.docker.swarm.service.name=$service" --format '{{.ID}}' | head -n 1)"
  if [ -z "$container_id" ]; then
    return 0
  fi
  docker inspect "$container_id" --format '{{.Image}}' 2>/dev/null | head -n 1
}

service_exists() {
  docker service inspect "$1" >/dev/null 2>&1
}

update_service() {
  local service="$1"
  local image="$2"
  local pulled_id="$3"
  local running_id
  local updated_var="$4"

  if ! service_exists "$service"; then
    log "服务不存在，跳过: $service"
    return 0
  fi

  running_id="$(running_image_id "$service")"

  if [ -n "$running_id" ] && [ "$running_id" = "$pulled_id" ]; then
    log "$service 已是最新"
    return 0
  fi

  log "更新 $service: ${running_id:-none} -> $pulled_id"
  docker service update --with-registry-auth --detach=false --force --image "$image" "$service"
  printf -v "$updated_var" '%s' "1"
}

wait_http_ok() {
  local name="$1"
  local url="$2"
  local attempt=1

  while [ "$attempt" -le 30 ]; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "$url" >/dev/null 2>&1; then
        log "$name 健康检查通过: $url"
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -O /dev/null "$url" >/dev/null 2>&1; then
        log "$name 健康检查通过: $url"
        return 0
      fi
    else
      log "未找到 curl/wget，跳过 $name HTTP 健康检查"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  log "$name 健康检查超时: $url"
  return 1
}

server_image="${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server:${SERVER_IMAGE_TAG}"
client_image="${TENCENT_IMAGE_PREFIX}/daojie-yusheng-client:${CLIENT_IMAGE_TAG}"

log "拉取 server 镜像..."
server_pulled_id="$(pull_image_id "$server_image")"
if [ -z "$server_pulled_id" ]; then
  log "拉取 server 镜像失败: $server_image"
  exit 1
fi

log "拉取 client 镜像..."
client_pulled_id="$(pull_image_id "$client_image")"
if [ -z "$client_pulled_id" ]; then
  log "拉取 client 镜像失败: $client_image"
  exit 1
fi

updated_server=0
updated_server_worker=0
updated_client=0

update_service "${STACK_NAME}_server" "$server_image" "$server_pulled_id" updated_server
update_service "${STACK_NAME}_server_worker" "$server_image" "$server_pulled_id" updated_server_worker
update_service "${STACK_NAME}_client" "$client_image" "$client_pulled_id" updated_client

if [ "$updated_server" -eq 1 ]; then
  wait_http_ok "server" "http://127.0.0.1:${SERVER_PUBLISHED_PORT:-11922}/health"
else
  log "${STACK_NAME}_server 无需更新"
fi

if [ "$updated_client" -eq 1 ]; then
  wait_http_ok "client" "http://127.0.0.1:${CLIENT_PUBLISHED_PORT:-11921}/"
else
  log "${STACK_NAME}_client 无需更新"
fi

if [ "$updated_server" -eq 1 ] || [ "$updated_server_worker" -eq 1 ] || [ "$updated_client" -eq 1 ]; then
  log "清理旧镜像（保留最近 3 个版本）..."
  # 清理 dangling 镜像（无标签的中间层）
  docker image prune -f >/dev/null 2>&1 || true
  # 对每个仓库，保留最近 3 个镜像，删除更旧的
  for repo in "${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server" "${TENCENT_IMAGE_PREFIX}/daojie-yusheng-client"; do
    # 按创建时间倒序列出该仓库所有镜像 ID，跳过前 3 个，删除剩余
    old_images="$(docker images "$repo" --format '{{.ID}} {{.CreatedAt}}' | sort -k2 -r | tail -n +4 | awk '{print $1}')"
    if [ -n "$old_images" ]; then
      echo "$old_images" | xargs -r docker rmi -f 2>/dev/null || true
    fi
  done
fi

{
  printf 'last_checked_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'server_image=%s\n' "$server_image"
  printf 'server_image_id=%s\n' "$server_pulled_id"
  printf 'client_image=%s\n' "$client_image"
  printf 'client_image_id=%s\n' "$client_pulled_id"
  printf 'updated_server=%s\n' "$updated_server"
  printf 'updated_server_worker=%s\n' "$updated_server_worker"
  printf 'updated_client=%s\n' "$updated_client"
} > "$STATE_FILE"

log "本轮检查完成"
AUTO_UPDATE_EOF

  chmod 755 "$AUTO_UPDATE_SCRIPT"

  cat > "$AUTO_UPDATE_SERVICE_FILE" <<EOF
[Unit]
Description=Daojie Yusheng CCR Swarm auto update
After=docker.service docker.socket network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
Environment=DEPLOY_DIR=${DEPLOY_DIR}
Environment=ENV_FILE=${ENV_FILE}
Environment=STACK_NAME=${STACK_NAME}
Environment=STATE_FILE=${AUTO_UPDATE_STATE_FILE}
ExecStart=${AUTO_UPDATE_SCRIPT}
EOF

  cat > "$AUTO_UPDATE_TIMER_FILE" <<'EOF'
[Unit]
Description=Run Daojie Yusheng CCR Swarm auto update periodically

[Timer]
OnBootSec=90
OnUnitActiveSec=60
AccuracySec=10
Persistent=true

[Install]
WantedBy=timers.target
EOF

  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable --now daojie-ccr-auto-update.timer
    log_info "CCR 自动更新器已启用: daojie-ccr-auto-update.timer"
  else
    log_warn "未找到 systemctl，已写入自动更新脚本但未启用定时器: $AUTO_UPDATE_SCRIPT"
  fi
}

# ============================================================
# 前置检查
# ============================================================

log_step "检查环境"

if [ "$(id -u)" -ne 0 ]; then
  log_error "请使用 root 或 sudo 运行此脚本"
  exit 1
fi

if [ ! -f /etc/os-release ] || ! grep -qi '^ID=.*ubuntu\|^ID_LIKE=.*ubuntu\|^ID_LIKE=.*debian' /etc/os-release; then
  log_warn "未识别为 Ubuntu/Debian 系统；脚本会继续尝试，但自动安装依赖可能失败"
fi

install_base_packages
mkdir -p "$DEPLOY_DIR"

if ! command -v docker &>/dev/null; then
  log_warn "未安装 Docker，正在安装..."
  curl -fsSL https://get.docker.com | sh
  enable_and_start_docker
  log_info "Docker 安装完成"
else
  enable_and_start_docker
fi

if ! wait_for_docker; then
  log_error "Docker 未运行"
  exit 1
fi

log_info "Docker 就绪"

# ============================================================
# 初始化 Swarm manager（幂等）
# ============================================================

ensure_swarm_manager

# ============================================================
# 创建数据卷（幂等）
# ============================================================

log_step "检查数据卷"

for vol in daojie_yusheng_pgdata daojie_yusheng_redisdata daojie_yusheng_server_backup_data; do
  if docker volume inspect "$vol" &>/dev/null; then
    log_info "数据卷已存在: $vol"
  else
    docker volume create "$vol" >/dev/null
    log_info "数据卷已创建: $vol"
  fi
done

# ============================================================
# 环境变量配置（交互式，已有则跳过）
# ============================================================

log_step "检查配置"

generate_secret() {
  openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64
}

REQUESTED_CLIENT_IMAGE_TAG="prod"
REQUESTED_SERVER_IMAGE_TAG="prod"

ensure_generated_env_var() {
  local key="$1"
  local value

  if [ -n "${!key:-}" ]; then
    return 0
  fi

  value="$(generate_secret)"
  write_env_var "$key" "$value" >> "$ENV_FILE"
  printf -v "$key" '%s' "$value"
  export "$key"
  log_info "已自动生成缺失配置: $key"
}

set_env_var() {
  local key="$1"
  local value="$2"
  local encoded
  local tmp_file

  encoded="$(write_env_var "$key" "$value")"
  tmp_file="$(mktemp "${ENV_FILE}.XXXXXX")"

  if [ -f "$ENV_FILE" ] && grep -Eq "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v encoded="$encoded" '
      index($0, key "=") == 1 { print encoded; next }
      { print }
    ' "$ENV_FILE" > "$tmp_file"
  else
    if [ -f "$ENV_FILE" ]; then
      cp "$ENV_FILE" "$tmp_file"
    fi
    printf '%s\n' "$encoded" >> "$tmp_file"
  fi

  cat "$tmp_file" > "$ENV_FILE"
  rm -f "$tmp_file"
  printf -v "$key" '%s' "$value"
  export "$key"
}

if [ -f "$ENV_FILE" ]; then
  log_info "已有配置: $ENV_FILE"
  set -a && . "$ENV_FILE" && set +a

  if [ -z "${TENCENT_IMAGE_PREFIX:-}" ]; then
    TENCENT_IMAGE_PREFIX="$DEFAULT_TENCENT_IMAGE_PREFIX"
    export TENCENT_IMAGE_PREFIX
    write_env_var "TENCENT_IMAGE_PREFIX" "$TENCENT_IMAGE_PREFIX" >> "$ENV_FILE"
    log_info "已自动补齐缺失配置: TENCENT_IMAGE_PREFIX=${TENCENT_IMAGE_PREFIX}"
  fi

  ensure_generated_env_var "SERVER_GM_AUTH_SECRET"
  ensure_generated_env_var "SERVER_SECRET_ENCRYPTION_KEY"
  ensure_generated_env_var "DB_PASSWORD"
  ensure_generated_env_var "SERVER_PLAYER_TOKEN_SECRET"
  set_env_var "CLIENT_IMAGE_TAG" "$REQUESTED_CLIENT_IMAGE_TAG"
  set_env_var "SERVER_IMAGE_TAG" "$REQUESTED_SERVER_IMAGE_TAG"

  if [ -z "${GM_PASSWORD:-}" ]; then
    if [ -t 0 ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
      printf "  GM 管理密码: " >/dev/tty
      read -r GM_PASSWORD </dev/tty
      [ -z "$GM_PASSWORD" ] && log_error "GM_PASSWORD 不能为空" && exit 1
      export GM_PASSWORD
      write_env_var "GM_PASSWORD" "$GM_PASSWORD" >> "$ENV_FILE"
      log_info "已写入缺失配置: GM_PASSWORD"
    else
      log_error "配置缺失: GM_PASSWORD；非交互环境请提前设置 GM_PASSWORD 或编辑 $ENV_FILE"
      exit 1
    fi
  fi

  CLIENT_IMAGE_TAG="$REQUESTED_CLIENT_IMAGE_TAG"
  SERVER_IMAGE_TAG="$REQUESTED_SERVER_IMAGE_TAG"
  DB_USERNAME="${DB_USERNAME:-mud}"
  DB_DATABASE="${DB_DATABASE:-daojie_yusheng}"
  SERVER_CORS_ORIGINS="${SERVER_CORS_ORIGINS:-$DEFAULT_SERVER_CORS_ORIGINS}"
  CLIENT_PUBLISHED_PORT="${CLIENT_PUBLISHED_PORT:-11921}"
  SERVER_PUBLISHED_PORT="${SERVER_PUBLISHED_PORT:-11922}"
  export CLIENT_IMAGE_TAG SERVER_IMAGE_TAG DB_USERNAME DB_DATABASE SERVER_CORS_ORIGINS CLIENT_PUBLISHED_PORT SERVER_PUBLISHED_PORT
  log_info "配置验证通过"
else
  log_warn "首次部署，进入配置引导..."
  echo ""

  read_with_default "  腾讯云 CCR 镜像前缀 [回车默认 ${DEFAULT_TENCENT_IMAGE_PREFIX}]: " "$DEFAULT_TENCENT_IMAGE_PREFIX" input_prefix

  default_db_pass="$(generate_secret)"
  read_with_default "  数据库密码 [回车自动生成]: " "$default_db_pass" input_db_pass

  default_jwt="$(generate_secret)"
  read_with_default "  玩家 Token 密钥 [回车自动生成]: " "$default_jwt" input_jwt

  default_gm_auth_secret="$(generate_secret)"
  read_with_default "  GM Token 签名密钥 [回车自动生成]: " "$default_gm_auth_secret" input_gm_auth_secret

  default_secret_encryption_key="$(generate_secret)"
  read_with_default "  GM 密钥管理加密密钥 [回车自动生成]: " "$default_secret_encryption_key" input_secret_encryption_key

  default_gm_pass="$(generate_secret)"
  read_with_default "  GM 管理密码 [回车自动生成]: " "$default_gm_pass" input_gm_pass

  read_with_default "  前端域名（如 https://example.com）[回车默认 ${DEFAULT_SERVER_CORS_ORIGINS}]: " "$DEFAULT_SERVER_CORS_ORIGINS" input_cors

  {
    write_env_var "TENCENT_IMAGE_PREFIX" "$input_prefix"
    write_env_var "DB_USERNAME" "mud"
    write_env_var "DB_PASSWORD" "$input_db_pass"
    write_env_var "DB_DATABASE" "daojie_yusheng"
    write_env_var "SERVER_PLAYER_TOKEN_SECRET" "$input_jwt"
    write_env_var "SERVER_GM_AUTH_SECRET" "$input_gm_auth_secret"
    write_env_var "SERVER_SECRET_ENCRYPTION_KEY" "$input_secret_encryption_key"
    write_env_var "GM_PASSWORD" "$input_gm_pass"
    write_env_var "SERVER_CORS_ORIGINS" "$input_cors"
    write_env_var "CLIENT_PUBLISHED_PORT" "11921"
    write_env_var "SERVER_PUBLISHED_PORT" "11922"
    write_env_var "CLIENT_IMAGE_TAG" "$REQUESTED_CLIENT_IMAGE_TAG"
    write_env_var "SERVER_IMAGE_TAG" "$REQUESTED_SERVER_IMAGE_TAG"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log_info "配置已保存到 $ENV_FILE"
  set -a && . "$ENV_FILE" && set +a
fi

sync_registry_auth_if_available

CLIENT_PUBLISHED_PORT="${CLIENT_PUBLISHED_PORT:-11921}"
SERVER_PUBLISHED_PORT="${SERVER_PUBLISHED_PORT:-11922}"
export CLIENT_PUBLISHED_PORT SERVER_PUBLISHED_PORT
ensure_port_available "$CLIENT_PUBLISHED_PORT" "client"
ensure_port_available "$SERVER_PUBLISHED_PORT" "server"

pull_required_image "postgres" "postgres:16-alpine"
pull_required_image "redis" "redis:7-alpine"
pull_required_image "server" "${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server:${SERVER_IMAGE_TAG:-latest}"
pull_required_image "client" "${TENCENT_IMAGE_PREFIX}/daojie-yusheng-client:${CLIENT_IMAGE_TAG:-latest}"

# ============================================================
# 生成 Stack 文件（内嵌）
# ============================================================

log_step "生成部署文件"

cat > "$STACK_FILE" <<'STACK_EOF'
services:
  client:
    image: ${TENCENT_IMAGE_PREFIX}/daojie-yusheng-client:${CLIENT_IMAGE_TAG:-latest}
    environment:
      NGINX_WORKER_PROCESSES: auto
    ports:
      - target: 80
        published: ${CLIENT_PUBLISHED_PORT:-11921}
        protocol: tcp
        mode: ingress
    networks:
      - daojie_net
    healthcheck:
      test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:80 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
        window: 120s

  x-server-base: &server_base
    image: ${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server:${SERVER_IMAGE_TAG:-latest}
    environment: &server_env_base
      SERVER_HOST: 0.0.0.0
      SERVER_PORT: 13001
      SERVER_DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      SERVER_CORS_ORIGINS: ${SERVER_CORS_ORIGINS:-https://daojie.yuohira.com}
      SERVER_PLAYER_TOKEN_SECRET: ${SERVER_PLAYER_TOKEN_SECRET}
      SERVER_GM_AUTH_SECRET: ${SERVER_GM_AUTH_SECRET}
      SERVER_SECRET_ENCRYPTION_KEY: ${SERVER_SECRET_ENCRYPTION_KEY}
      SERVER_GM_PASSWORD: ${GM_PASSWORD}
      GM_PASSWORD: ${GM_PASSWORD}
      DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      SERVER_GM_DATABASE_BACKUP_DIR: /var/lib/server/gm-database-backups
      SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR: /var/lib/server
      SERVER_OUTBOX_RUNTIME_ENABLED: "1"
    volumes:
      - server_backup_data:/var/lib/server
    networks:
      - daojie_net
    stop_grace_period: 30s

  server:
    <<: *server_base
    environment:
      <<: *server_env_base
      SERVER_NODE_ID: daojie-yusheng-server:13001
      SERVER_RUNTIME_ROLE: api
      SERVER_FLUSH_TASK_RUNTIME_MODE: off
    ports:
      - target: 13001
        published: ${SERVER_PUBLISHED_PORT:-11922}
        protocol: tcp
        mode: ingress
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - |
          fetch('http://127.0.0.1:13001/live').then(async (response) => {
            const body = await response.json().catch(() => null);
            const alive = response.ok && body?.alive?.ok === true;
            process.exit(alive ? 0 : 1);
          }).catch(() => process.exit(1));
      interval: 10s
      timeout: 15s
      retries: 6
      start_period: 20s
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s
        order: stop-first
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: any
        delay: 5s
        max_attempts: 5
        window: 120s

  server_worker:
    <<: *server_base
    environment:
      <<: *server_env_base
      SERVER_NODE_ID: daojie-yusheng-server-worker
      SERVER_RUNTIME_ROLE: worker
      SERVER_FLUSH_TASK_RUNTIME_MODE: worker
    deploy:
      replicas: ${SERVER_WORKER_REPLICAS:-1}
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: any
        delay: 5s
        max_attempts: 5
        window: 120s

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USERNAME:-mud}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_DATABASE:-daojie_yusheng}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - daojie_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME:-mud} -d ${DB_DATABASE:-daojie_yusheng}"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      replicas: 1
      update_config:
        order: stop-first

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    networks:
      - daojie_net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      replicas: 1
      update_config:
        order: stop-first

volumes:
  pgdata:
    external: true
    name: daojie_yusheng_pgdata
  redisdata:
    external: true
    name: daojie_yusheng_redisdata
  server_backup_data:
    external: true
    name: daojie_yusheng_server_backup_data

networks:
  daojie_net:
    driver: overlay
    attachable: true
STACK_EOF

log_info "Stack 文件已生成: $STACK_FILE"

# ============================================================
# 部署
# ============================================================

log_step "部署服务"

docker stack deploy --with-registry-auth --prune -c "$STACK_FILE" "$STACK_NAME"
log_info "部署指令已发送"

install_ccr_auto_update

# ============================================================
# 等待服务就绪
# ============================================================

log_step "等待服务启动"

wait_for_service() {
  local service="$1"
  local attempt=1
  local replicas
  while [ "$attempt" -le 60 ]; do
    replicas="$(docker service ls --filter "name=${STACK_NAME}_${service}" --format '{{.Replicas}}' 2>/dev/null | head -n 1)"
    if [ -n "$replicas" ]; then
      ready_replicas="${replicas%%/*}"
      desired_replicas="${replicas##*/}"
      if [ "$ready_replicas" = "$desired_replicas" ] && [ "$desired_replicas" != "0" ]; then
        log_info "${service} 就绪 (${replicas})"
        return 0
      fi
    fi
    printf '.'
    sleep 2
    attempt=$((attempt + 1))
  done
  log_warn "${service} 启动超时"
  return 1
}

wait_failed=0
wait_for_service "postgres" || wait_failed=1
wait_for_service "redis" || wait_failed=1
wait_for_service "server" || wait_failed=1
wait_for_service "server_worker" || wait_failed=1
wait_for_service "client" || wait_failed=1

if [ "$wait_failed" -eq 1 ]; then
  log_error "服务未全部就绪，请执行 docker stack services ${STACK_NAME} 和 docker service ps ${STACK_NAME}_server --no-trunc 查看原因"
  exit 1
fi

# ============================================================
# 数据库建表（幂等）
# ============================================================

log_step "数据库预检"

sleep 5
container_id="$(docker ps --filter "label=com.docker.swarm.service.name=${STACK_NAME}_server" --format '{{.ID}}' | head -n 1)"

if [ -n "$container_id" ]; then
  docker exec "$container_id" node dist/tools/deploy-database-preflight.js --ensure-current-schema && \
    log_info "数据库 schema 就绪" || \
    log_warn "数据库预检失败，服务启动后会自动重试"
else
  log_warn "未找到 server 容器，跳过预检"
fi

# ============================================================
# 完成
# ============================================================

log_step "部署完成 ✓"

IP="$(server_primary_ip)"
echo ""
echo "  访问地址:"
echo "    前端: http://${IP}:${CLIENT_PUBLISHED_PORT}"
echo "    后端: http://${IP}:${SERVER_PUBLISHED_PORT}/health"
echo ""
echo "  管理命令:"
echo "    查看状态:  docker stack services ${STACK_NAME}"
echo "    查看日志:  docker service logs ${STACK_NAME}_server -f"
echo "    停止服务:  docker stack rm ${STACK_NAME}"
echo "    重新部署:  bash ${DEPLOY_DIR}/deploy-prod.sh"
echo ""
echo "  配置文件:  ${ENV_FILE}"
echo "  Stack文件: ${STACK_FILE}"
echo "  自动更新:  ${AUTO_UPDATE_SCRIPT}"
echo "  更新状态:  ${AUTO_UPDATE_STATE_FILE}"
echo ""
log_info "CCR 自动更新器已启用，推送新镜像后会定时检查并更新 Swarm service"

SOURCE_SCRIPT="${BASH_SOURCE[0]:-$0}"
if [ -r "$SOURCE_SCRIPT" ] && cp "$SOURCE_SCRIPT" "${DEPLOY_DIR}/deploy-prod.sh"; then
  chmod +x "${DEPLOY_DIR}/deploy-prod.sh"
  log_info "部署脚本已保存: ${DEPLOY_DIR}/deploy-prod.sh"
else
  log_warn "部署脚本保存失败；请保留当前脚本用于后续重跑"
fi
