#!/usr/bin/env bash

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
