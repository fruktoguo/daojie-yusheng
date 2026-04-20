#!/bin/bash
# 用途：自动采集切换后机器可验证的只读证据，落盘到 .runtime。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

shadow_prepare_env
shadow_runtime_dir >/dev/null

REPORT_FILE="${SHADOW_RUNTIME_DIR}/cutover-postcheck-$(date +%Y%m%d-%H%M%S).json"
export CUTOVER_POSTCHECK_REPORT="${REPORT_FILE}"

echo "==> [cutover-auto-postcheck] collecting machine-checkable evidence"
node <<'NODE'
const fs = require('node:fs');

const baseUrl = String(process.env.SERVER_NEXT_SHADOW_URL || process.env.SERVER_NEXT_URL || 'http://127.0.0.1:11923').trim();
const password = String(process.env.SERVER_NEXT_GM_PASSWORD || process.env.GM_PASSWORD || '').trim();
const reportPath = String(process.env.CUTOVER_POSTCHECK_REPORT || '').trim();

if (!password) {
  throw new Error('missing SERVER_NEXT_GM_PASSWORD/GM_PASSWORD');
}
if (!reportPath) {
  throw new Error('missing CUTOVER_POSTCHECK_REPORT');
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`request failed ${path}: ${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const health = await fetchJson('/health');
  const login = await fetchJson('/api/auth/gm/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const token = String(login?.accessToken || '').trim();
  if (!token) {
    throw new Error(`gm login missing accessToken: ${JSON.stringify(login)}`);
  }

  const headers = { authorization: `Bearer ${token}` };
  const gmState = await fetchJson('/api/gm/state', { headers });
  const mapsPayload = await fetchJson('/api/gm/maps', { headers });
  const editorCatalog = await fetchJson('/api/gm/editor-catalog', { headers });
  const databaseState = await fetchJson('/api/gm/database/state', { headers });

  const maps = Array.isArray(mapsPayload)
    ? mapsPayload
    : (Array.isArray(mapsPayload?.maps) ? mapsPayload.maps : []);
  const pickedMap = Array.isArray(maps)
    ? (maps.find((entry) => entry && entry.id === 'yunlai_town') || maps[0] || null)
    : null;
  const mapId = typeof pickedMap?.id === 'string' && pickedMap.id.trim() ? pickedMap.id.trim() : 'yunlai_town';
  const mapRuntime = await fetchJson(`/api/gm/maps/${encodeURIComponent(mapId)}/runtime`, { headers });

  const report = {
    ok: true,
    at: new Date().toISOString(),
    baseUrl,
    health: {
      ok: health?.ok === true,
      ready: health?.readiness?.ok === true,
      maintenance: health?.readiness?.maintenance?.active === true,
      databaseConfigured: health?.readiness?.database?.configured === true,
      runtimeReady: health?.readiness?.runtime?.ready === true,
      playerCount: Number(health?.readiness?.runtime?.playerCount ?? 0),
      instanceCount: Number(health?.readiness?.runtime?.instanceCount ?? 0),
    },
    gmState: {
      playerCount: Array.isArray(gmState?.players) ? gmState.players.length : null,
      mapCount: Array.isArray(gmState?.mapIds) ? gmState.mapIds.length : null,
      botCount: Array.isArray(gmState?.players) ? gmState.players.filter((entry) => entry?.meta?.isBot === true).length : null,
    },
    maps: {
      count: maps.length,
      pickedMapId: mapId,
      pickedMapWidth: Number(pickedMap?.width ?? 0),
      pickedMapHeight: Number(pickedMap?.height ?? 0),
    },
    editorCatalog: {
      itemCount: Array.isArray(editorCatalog?.items) ? editorCatalog.items.length : null,
      techniqueCount: Array.isArray(editorCatalog?.techniques) ? editorCatalog.techniques.length : null,
      realmLevelCount: Array.isArray(editorCatalog?.realmLevels) ? editorCatalog.realmLevels.length : null,
      buffCount: Array.isArray(editorCatalog?.buffs) ? editorCatalog.buffs.length : null,
    },
    databaseState: {
      backupCount: Array.isArray(databaseState?.backups) ? databaseState.backups.length : null,
      runningJobType: databaseState?.runningJob?.type ?? null,
      runningJobStatus: databaseState?.runningJob?.status ?? null,
      lastJobType: databaseState?.lastJob?.type ?? null,
      lastJobStatus: databaseState?.lastJob?.status ?? null,
      lastJobPhase: databaseState?.lastJob?.phase ?? null,
      lastJobSourceBackupId: databaseState?.lastJob?.sourceBackupId ?? null,
      lastJobCheckpointBackupId: databaseState?.lastJob?.checkpointBackupId ?? null,
    },
    mapRuntime: {
      mapId,
      width: Number(mapRuntime?.width ?? mapRuntime?.map?.width ?? 0),
      height: Number(mapRuntime?.height ?? mapRuntime?.map?.height ?? 0),
      entityCount: Array.isArray(mapRuntime?.entities) ? mapRuntime.entities.length : null,
      tileRows: Array.isArray(mapRuntime?.tiles) ? mapRuntime.tiles.length : null,
      tileColumns: Array.isArray(mapRuntime?.tiles?.[0]) ? mapRuntime.tiles[0].length : null,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`report=${reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
NODE

echo "==> [cutover-auto-postcheck] done"
