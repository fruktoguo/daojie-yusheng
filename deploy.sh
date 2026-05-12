#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 道劫余生 - 一键部署脚本（自包含）
# 用法：tmp="$(mktemp /tmp/daojie-deploy.XXXXXX.sh)" && curl -fsSL https://raw.githubusercontent.com/fruktoguo/daojie-yusheng/main/deploy.sh -o "$tmp" && sudo bash "$tmp"
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
    mkdir -p "$WATCHTOWER_CONFIG_DIR"
    cp "$DOCKER_AUTH_CONFIG_FILE" "$WATCHTOWER_CONFIG_FILE"
    chmod 600 "$WATCHTOWER_CONFIG_FILE"
    printf '      - %s:/config.json:ro\n' "$WATCHTOWER_CONFIG_FILE" > "$WATCHTOWER_AUTH_VOLUME_FILE"
    log_info "Watchtower 镜像仓库凭据已同步"
  else
    : > "$WATCHTOWER_AUTH_VOLUME_FILE"
    log_info "未检测到 Docker 镜像仓库登录信息；按公开镜像仓库继续部署"
    log_warn "如果该仓库实际是私有仓库，请先执行 sudo docker login ${registry} 后重跑"
  fi
}

DEPLOY_DIR="/opt/daojie-yusheng"
ENV_FILE="${DEPLOY_DIR}/prod.env"
STACK_FILE="${DEPLOY_DIR}/docker-stack.yml"
STACK_NAME="daojie-yusheng"
DEPLOY_SCRIPT_URL="${DEPLOY_SCRIPT_URL:-https://raw.githubusercontent.com/fruktoguo/daojie-yusheng/main/deploy.sh}"
DOCKER_AUTH_CONFIG_FILE="/root/.docker/config.json"
WATCHTOWER_CONFIG_DIR="${DEPLOY_DIR}/watchtower"
WATCHTOWER_CONFIG_FILE="${WATCHTOWER_CONFIG_DIR}/config.json"
WATCHTOWER_AUTH_VOLUME_FILE="${DEPLOY_DIR}/watchtower-volume.yml"

mkdir -p "$DEPLOY_DIR"

# ============================================================
# 前置检查
# ============================================================

log_step "检查环境"

if [ "$(id -u)" -ne 0 ]; then
  log_error "请使用 root 或 sudo 运行此脚本"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  log_warn "未安装 Docker，正在安装..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log_info "Docker 安装完成"
fi

if ! docker info &>/dev/null; then
  log_error "Docker 未运行"
  exit 1
fi

log_info "Docker 就绪"

# ============================================================
# 初始化 Swarm（幂等）
# ============================================================

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active"; then
  log_step "初始化 Docker Swarm"
  docker swarm leave --force 2>/dev/null || true
  docker swarm init 2>/dev/null || docker swarm init --advertise-addr "$(hostname -I | awk '{print $1}')"
  log_info "Swarm 初始化完成"
else
  log_info "Swarm 已激活"
fi

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

if [ -f "$ENV_FILE" ]; then
  log_info "已有配置: $ENV_FILE"
  set -a && . "$ENV_FILE" && set +a

  missing=0
  for var in TENCENT_IMAGE_PREFIX DB_PASSWORD SERVER_PLAYER_TOKEN_SECRET GM_PASSWORD; do
    if [ -z "${!var:-}" ]; then
      log_error "配置缺失: $var"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    log_error "请编辑 $ENV_FILE 补全后重新运行"
    exit 1
  fi
  log_info "配置验证通过"
else
  log_warn "首次部署，进入配置引导..."
  echo ""

  printf "  腾讯云 CCR 镜像前缀: "
  read -r input_prefix </dev/tty
  [ -z "$input_prefix" ] && log_error "不能为空" && exit 1

  default_db_pass="$(generate_secret)"
  printf "  数据库密码 [回车自动生成]: "
  read -r input_db_pass </dev/tty
  input_db_pass="${input_db_pass:-$default_db_pass}"

  default_jwt="$(generate_secret)"
  printf "  玩家 Token 密钥 [回车自动生成]: "
  read -r input_jwt </dev/tty
  input_jwt="${input_jwt:-$default_jwt}"

  printf "  GM 管理密码: "
  read -r input_gm_pass </dev/tty
  [ -z "$input_gm_pass" ] && log_error "不能为空" && exit 1

  printf "  前端域名（如 https://example.com）[回车默认不限制]: "
  read -r input_cors </dev/tty
  input_cors="${input_cors:-*}"

  {
    write_env_var "TENCENT_IMAGE_PREFIX" "$input_prefix"
    write_env_var "DB_PASSWORD" "$input_db_pass"
    write_env_var "SERVER_PLAYER_TOKEN_SECRET" "$input_jwt"
    write_env_var "GM_PASSWORD" "$input_gm_pass"
    write_env_var "SERVER_CORS_ORIGINS" "$input_cors"
    write_env_var "CLIENT_IMAGE_TAG" "latest"
    write_env_var "SERVER_IMAGE_TAG" "latest"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log_info "配置已保存到 $ENV_FILE"
  set -a && . "$ENV_FILE" && set +a
fi

sync_registry_auth_if_available

# ============================================================
# 生成 Stack 文件（内嵌）
# ============================================================

log_step "生成部署文件"

cat > "$STACK_FILE" <<'STACK_EOF'
services:
  client:
    image: ${TENCENT_IMAGE_PREFIX}/daojie-yusheng-client:${CLIENT_IMAGE_TAG:-latest}
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    environment:
      NGINX_WORKER_PROCESSES: auto
    ports:
      - target: 80
        published: 11921
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

  server:
    image: ${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server:${SERVER_IMAGE_TAG:-latest}
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    environment:
      SERVER_HOST: 0.0.0.0
      SERVER_PORT: 13001
      SERVER_NODE_ID: daojie-yusheng-server:13001
      SERVER_DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      SERVER_CORS_ORIGINS: ${SERVER_CORS_ORIGINS:-*}
      SERVER_PLAYER_TOKEN_SECRET: ${SERVER_PLAYER_TOKEN_SECRET}
      SERVER_GM_PASSWORD: ${GM_PASSWORD}
      GM_PASSWORD: ${GM_PASSWORD}
      DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      SERVER_GM_DATABASE_BACKUP_DIR: /var/lib/server/gm-database-backups
      SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR: /var/lib/server
    ports:
      - target: 13001
        published: 11922
        protocol: tcp
        mode: ingress
    volumes:
      - server_backup_data:/var/lib/server
    networks:
      - daojie_net
    stop_grace_period: 30s
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

  backup-worker:
    image: ${TENCENT_IMAGE_PREFIX}/daojie-yusheng-server:${SERVER_IMAGE_TAG:-latest}
    command: ["node", "dist/tools/database-backup-worker.js"]
    environment:
      SERVER_DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      DATABASE_URL: postgres://${DB_USERNAME:-mud}:${DB_PASSWORD}@postgres:5432/${DB_DATABASE:-daojie_yusheng}
      SERVER_GM_DATABASE_BACKUP_DIR: /var/lib/server/gm-database-backups
      SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR: /var/lib/server
    volumes:
      - server_backup_data:/var/lib/server
    networks:
      - daojie_net
    stop_grace_period: 30s
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

  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      # WATCHTOWER_AUTH_VOLUME_PLACEHOLDER
    environment:
      WATCHTOWER_POLL_INTERVAL: 60
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_LABEL_ENABLE: "true"
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

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

tmp_stack_file="${STACK_FILE}.tmp"
watchtower_auth_volume="$(cat "$WATCHTOWER_AUTH_VOLUME_FILE")"
awk -v replacement="$watchtower_auth_volume" '
  /^[[:space:]]*#[[:space:]]*WATCHTOWER_AUTH_VOLUME_PLACEHOLDER$/ {
    if (replacement != "") {
      print replacement
    }
    next
  }
  { print }
' "$STACK_FILE" > "$tmp_stack_file"
mv "$tmp_stack_file" "$STACK_FILE"

log_info "Stack 文件已生成: $STACK_FILE"

# ============================================================
# 部署
# ============================================================

log_step "部署服务"

WATCHTOWER_CONFIG_FILE="$WATCHTOWER_CONFIG_FILE" docker stack deploy --with-registry-auth -c "$STACK_FILE" "$STACK_NAME"
log_info "部署指令已发送"

# ============================================================
# 等待服务就绪
# ============================================================

log_step "等待服务启动"

wait_for_service() {
  local service="$1"
  local attempt=1
  while [ "$attempt" -le 30 ]; do
    if docker service ps "${STACK_NAME}_${service}" --filter desired-state=running --format '{{.CurrentState}}' 2>/dev/null | grep -q "Running"; then
      log_info "${service} 就绪"
      return 0
    fi
    printf '.'
    sleep 2
    attempt=$((attempt + 1))
  done
  log_warn "${service} 启动超时"
  return 1
}

wait_for_service "postgres"
wait_for_service "server"
wait_for_service "client"

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

IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "  访问地址:"
echo "    前端: http://${IP}:11921"
echo "    后端: http://${IP}:11922/health"
echo ""
echo "  管理命令:"
echo "    查看状态:  docker stack services ${STACK_NAME}"
echo "    查看日志:  docker service logs ${STACK_NAME}_server -f"
echo "    停止服务:  docker stack rm ${STACK_NAME}"
echo "    重新部署:  bash ${DEPLOY_DIR}/deploy.sh"
echo ""
echo "  配置文件:  ${ENV_FILE}"
echo "  Stack文件: ${STACK_FILE}"
echo ""
log_info "Watchtower 已启用，推送新镜像后 60 秒内自动更新"

# 保存部署脚本，方便后续重新运行
if curl -fsSL "$DEPLOY_SCRIPT_URL" -o "${DEPLOY_DIR}/deploy.sh"; then
  chmod +x "${DEPLOY_DIR}/deploy.sh"
  log_info "部署脚本已保存: ${DEPLOY_DIR}/deploy.sh"
else
  log_warn "部署脚本保存失败；可再次通过远程一键命令重新运行"
fi
