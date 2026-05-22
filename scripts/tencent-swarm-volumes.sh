#!/usr/bin/env bash
# 本脚本负责在腾讯云 Docker Swarm 环境预创建 PostgreSQL、Redis 和服务端备份卷。
# 维护时要保持卷名与部署栈配置一致，避免新环境启动后把数据库或备份数据落到错误卷里。

set -euo pipefail

PG_VOLUME="${DAOJIE_PG_VOLUME:-daojie_yusheng_pgdata}"
REDIS_VOLUME="${DAOJIE_REDIS_VOLUME:-daojie_yusheng_redisdata}"
SERVER_BACKUP_VOLUME="${DAOJIE_SERVER_BACKUP_VOLUME:-daojie_yusheng_server_backup_data}"

for volume in "$PG_VOLUME" "$REDIS_VOLUME" "$SERVER_BACKUP_VOLUME"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    printf 'volume exists: %s\n' "$volume"
    continue
  fi

  docker volume create "$volume" >/dev/null
  printf 'volume created: %s\n' "$volume"
done
