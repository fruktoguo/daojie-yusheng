import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { NativeGmWorldService } from '../http/native/native-gm-world.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import {
  GM_MAP_CONFIG_TABLE,
  GmMapConfigPersistenceService,
  type GmMapConfigRecord,
} from '../persistence/gm-map-config-persistence.service';
import { RuntimeMapConfigService } from '../runtime/map/runtime-map-config.service';

const databaseUrl = resolveServerDatabaseUrl();
const MAP_ID = `gm_map_config_smoke_${process.pid}_${Date.now()}`;
const STALE_MAP_ID = `${MAP_ID}_stale`;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下验证 GM 地图 tick/time 配置持久化、并发合并、默认值清理和启动恢复回填',
      excludes: '不证明 shadow、acceptance、full 或真实线上重启窗口',
      completionMapping: 'replace-ready:proof:with-db.gm-map-config-persistence',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const persistence = new GmMapConfigPersistenceService(provider);

  try {
    await cleanupRows(pool);
    await verifyPersistenceLifecycle(persistence, pool);
    await verifyNativeRestoreHook();
    await verifyNativeWritePath();
    console.log(JSON.stringify({
      ok: true,
      case: 'gm-map-config-persistence',
      answers: '已验证 GM 地图 tick/time 配置可落库、并发 partial merge 不互相覆盖、默认值会清理记录，并且 RuntimeMapConfigService 启动恢复不依赖 GM HTTP service 生命周期',
      excludes: '不证明 shadow、acceptance、full 或真实线上重启窗口',
      completionMapping: 'replace-ready:proof:with-db.gm-map-config-persistence',
    }, null, 2));
  } finally {
    await cleanupRows(pool).catch(() => undefined);
    await persistence.onModuleDestroy().catch(() => undefined);
    await provider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function verifyPersistenceLifecycle(
  persistence: GmMapConfigPersistenceService,
  pool: Pool,
): Promise<void> {
  const init = persistence.onModuleInit();
  await persistence.mergeMapConfig(MAP_ID, { speed: 2 });
  await init;

  await Promise.all([
    persistence.mergeMapConfig(MAP_ID, { speed: 5, paused: false }),
    persistence.mergeMapConfig(MAP_ID, { scale: 3, offsetTicks: 77 }),
  ]);

  const merged = await loadRecord(persistence, MAP_ID);
  assert.equal(merged.speed, 5);
  assert.equal(merged.paused, undefined);
  assert.equal(merged.scale, 3);
  assert.equal(merged.offsetTicks, 77);

  await persistence.mergeMapConfig(MAP_ID, {
    speed: 1,
    paused: false,
    scale: 1,
    offsetTicks: 0,
  });
  const defaultRow = await pool.query(
    `SELECT map_id FROM ${GM_MAP_CONFIG_TABLE} WHERE map_id = $1`,
    [MAP_ID],
  );
  assert.equal(defaultRow.rowCount, 0);

  await persistence.mergeMapConfig(STALE_MAP_ID, { speed: 9 });
  await persistence.pruneMapConfigs(new Set([MAP_ID]));
  const staleRow = await pool.query(
    `SELECT map_id FROM ${GM_MAP_CONFIG_TABLE} WHERE map_id = $1`,
    [STALE_MAP_ID],
  );
  assert.equal(staleRow.rowCount, 0);
}

async function verifyNativeRestoreHook(): Promise<void> {
  const prunedSets: string[][] = [];
  const records: GmMapConfigRecord[] = [
    {
      mapId: MAP_ID,
      speed: 8,
      scale: 4,
      offsetTicks: 33,
    },
  ];

  const service = new RuntimeMapConfigService(
    {
      listSummaries() {
        return [{ id: MAP_ID }];
      },
      getOrThrow(mapId: string) {
        if (mapId !== MAP_ID) {
          throw new Error(`unexpected mapId ${mapId}`);
        }
        return { source: { time: { scale: 1, offsetTicks: 0 } } };
      },
    } as never,
    {
      async loadAllMapConfigs() {
        return records;
      },
      async pruneMapConfigs(validMapIds: Set<string>) {
        prunedSets.push(Array.from(validMapIds).sort());
      },
      async mergeMapConfig() {
        return undefined;
      },
    } as never,
  );

  await service.onModuleInit();
  assert.deepEqual(prunedSets, [[MAP_ID]]);
  assert.equal(service.getMapTickSpeed(MAP_ID), 8);
  assert.equal(service.isMapPaused(MAP_ID), false);
  assert.deepEqual(service.getMapTimeConfig(MAP_ID, { scale: 1, offsetTicks: 0 }), {
    scale: 4,
    offsetTicks: 33,
  });
}

async function verifyNativeWritePath(): Promise<void> {
  const log: unknown[] = [];
  const service = new NativeGmWorldService(
    {} as never,
    {} as never,
    {
      getOrThrow(mapId: string) {
        if (mapId !== MAP_ID) {
          throw new Error(`unexpected mapId ${mapId}`);
        }
        return { source: { time: { scale: 1, offsetTicks: 0 } } };
      },
      listSummaries() {
        return [{ id: MAP_ID }];
      },
    } as never,
    {} as never,
    {
      updateMapTick(mapId: string, body: unknown) {
        log.push(['runtimeTick', mapId, body]);
      },
      updateMapTime(mapId: string, sourceTime: unknown, body: unknown) {
        log.push(['runtimeTime', mapId, sourceTime, body]);
      },
      pruneMapConfigs() {
        return undefined;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async ensureInitialized() {
        log.push(['ensureInitialized']);
      },
      isEnabled() {
        log.push(['isEnabled']);
        return true;
      },
      async mergeMapConfig(mapId: string, partial: unknown) {
        log.push(['mergeMapConfig', mapId, partial]);
      },
      async pruneMapConfigs() {
        return undefined;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await service.updateMapTick(MAP_ID, { speed: 6, paused: false });
  await service.updateMapTime(MAP_ID, { scale: 5, offsetTicks: 44 });
  assert.deepEqual(log, [
    ['ensureInitialized'],
    ['isEnabled'],
    ['mergeMapConfig', MAP_ID, { speed: 6, paused: false }],
    ['runtimeTick', MAP_ID, { speed: 6, paused: false }],
    ['ensureInitialized'],
    ['isEnabled'],
    ['mergeMapConfig', MAP_ID, { scale: 5, offsetTicks: 44 }],
    ['runtimeTime', MAP_ID, { scale: 1, offsetTicks: 0 }, { scale: 5, offsetTicks: 44 }],
  ]);
}

async function loadRecord(
  persistence: GmMapConfigPersistenceService,
  mapId: string,
): Promise<GmMapConfigRecord> {
  const records = await persistence.loadAllMapConfigs();
  const record = records.find((entry) => entry.mapId === mapId);
  assert.ok(record, `missing persisted GM map config for ${mapId}`);
  return record;
}

async function cleanupRows(pool: Pool): Promise<void> {
  await pool.query(
    `DELETE FROM ${GM_MAP_CONFIG_TABLE} WHERE map_id = ANY($1::varchar[])`,
    [[MAP_ID, STALE_MAP_ID]],
  ).catch(() => undefined);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
