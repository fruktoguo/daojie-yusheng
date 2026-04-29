import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { cleanupPostgresRestoreOrphanSectStateWithClient } from '../http/native/native-postgres-restore-cleanup';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下验证数据库导入后会以 server_sect 为真源清理 orphan 宗门派生状态',
          excludes: '不证明真实 pg_restore 文件内容、运行中玩家踢出或 runtime reload，只证明恢复后清理 SQL/JSONB 后处理的幂等性与保留有效宗门数据',
          completionMapping: 'replace-ready:proof:native-database-restore-sect-cleanup',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const provider = {
    getPool() {
      return pool;
    },
  };
  const catalogService = new InstanceCatalogService(provider as never);
  const domainService = new InstanceDomainPersistenceService(provider as never);
  const sectService = new WorldRuntimeSectService({} as never, { registerRuntimeMapTemplate() {} } as never, {} as never);
  const formationService = new WorldRuntimeFormationService({} as never, {} as never);
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const orphanSectId = `sect:restore_cleanup_orphan_${suffix}`;
  const validSectId = `sect:restore_cleanup_valid_${suffix}`;
  const orphanInstanceId = `sect:${orphanSectId}:main`;
  const validInstanceId = `sect:${validSectId}:main`;
  const publicInstanceId = `real:restore_cleanup_${suffix}`;
  const allSectIds = [orphanSectId, validSectId];
  const allInstanceIds = [orphanInstanceId, validInstanceId, publicInstanceId];

  try {
    await domainService.onModuleInit();
    await catalogService.onModuleInit();
    await (sectService as any).ensurePersistencePool();
    await (formationService as any).ensurePersistencePool();
    await cleanupFixture(pool, allSectIds, allInstanceIds);

    await insertValidSect(pool, validSectId, validInstanceId, publicInstanceId);
    await insertFormation(pool, {
      instanceId: publicInstanceId,
      formationInstanceId: `formation:sect_guardian:${orphanSectId}`,
      ownerSectId: orphanSectId,
    });
    await insertFormation(pool, {
      instanceId: publicInstanceId,
      formationInstanceId: `formation:sect_guardian:${validSectId}`,
      ownerSectId: validSectId,
    });
    await insertFormation(pool, {
      instanceId: orphanInstanceId,
      formationInstanceId: `formation:sect_instance:${orphanSectId}`,
      ownerSectId: orphanSectId,
    });
    await insertInstanceRows(pool, orphanInstanceId, orphanSectId);
    await insertInstanceRows(pool, validInstanceId, validSectId);
    await insertCatalogRow(pool, orphanInstanceId, orphanSectId);
    await insertCatalogRow(pool, validInstanceId, validSectId);
    await insertPublicPortalChunk(pool, publicInstanceId, orphanSectId, validSectId, validInstanceId);

    const report = await cleanupPostgresRestoreOrphanSectStateWithClient(pool);

    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_formation_state WHERE owner_sect_id = $1', [orphanSectId]), 0);
    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_formation_state WHERE owner_sect_id = $1', [validSectId]), 1);
    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_checkpoint WHERE instance_id = $1', [orphanInstanceId]), 0);
    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_checkpoint WHERE instance_id = $1', [validInstanceId]), 1);
    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_catalog WHERE instance_id = $1', [orphanInstanceId]), 0);
    assert.equal(await countRows(pool, 'SELECT count(*)::int AS count FROM instance_catalog WHERE instance_id = $1', [validInstanceId]), 1);

    const portalPayload = await fetchPortalPayload(pool, publicInstanceId);
    const portals = Array.isArray(portalPayload?.portals) ? portalPayload.portals : [];
    assert.equal(portals.some((portal: any) => portal?.sectId === orphanSectId), false);
    assert.equal(portals.some((portal: any) => portal?.sectId === validSectId), true);
    assert.equal(portals.some((portal: any) => portal?.name === '普通传送点'), true);
    assert.ok(report.formationRowsDeleted >= 2);
    assert.ok(report.catalogRowsDeleted >= 1);
    assert.ok(report.sectInstanceRowsDeleted >= 2);
    assert.ok(report.overlayPortalEntriesRemoved >= 1);

    const idempotentReport = await cleanupPostgresRestoreOrphanSectStateWithClient(pool);
    assert.equal(idempotentReport.formationRowsDeleted, 0);
    assert.equal(idempotentReport.catalogRowsDeleted, 0);
    assert.equal(idempotentReport.sectInstanceRowsDeleted, 0);
    assert.equal(idempotentReport.overlayPortalEntriesRemoved, 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          report,
          idempotentReport,
          answers:
            '数据库导入后的宗门派生清理会以 server_sect 为唯一真源：删除 owner_sect_id 不存在的阵法、目录和宗门实例分域状态，并从公共地图 runtime_portals 中移除 orphan 宗门入口；有效宗门及普通传送点会保留，重复执行不再产生删除。',
          excludes:
            '不证明 pg_restore 外部进程、备份 checksum、在线玩家踢出和 WorldRuntimeService.reloadAfterRestore；这些仍由 GM restore 协调器与既有 smoke 覆盖。',
          completionMapping: 'replace-ready:proof:native-database-restore-sect-cleanup',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupFixture(pool, allSectIds, allInstanceIds).catch(() => undefined);
    await cleanupPostgresRestoreOrphanSectStateWithClient(pool).catch(() => undefined);
    await (formationService as any).closePersistencePool?.().catch(() => undefined);
    await (sectService as any).closePersistencePool?.().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupFixture(pool: Pool, sectIds: string[], instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM instance_overlay_chunk WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = ANY($1::varchar[]) OR owner_sect_id = ANY($2::varchar[])', [instanceIds, sectIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_checkpoint WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_recovery_watermark WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_formation_state WHERE instance_id = ANY($1::varchar[]) OR owner_sect_id = ANY($2::varchar[])', [instanceIds, sectIds]).catch(() => undefined);
  await pool.query('DELETE FROM server_sect WHERE sect_id = ANY($1::varchar[])', [sectIds]).catch(() => undefined);
}

async function insertValidSect(pool: Pool, sectId: string, sectInstanceId: string, entranceInstanceId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO server_sect(
        sect_id, name, mark, founder_player_id, leader_player_id, status,
        entrance_instance_id, entrance_template_id, entrance_x, entrance_y,
        sect_instance_id, sect_template_id, created_at_ms, updated_at_ms, raw_payload, updated_at
      )
      VALUES ($1, '恢复清理验证宗', '验', 'player:restore-smoke', 'player:restore-smoke', 'active',
        $2, 'yunlai_town', 10, 10, $3, $4, $5, $5, $6::jsonb, now())
    `,
    [
      sectId,
      entranceInstanceId,
      sectInstanceId,
      `sect_domain:${sectId}:x-1_1:y-1_1`,
      Date.now(),
      JSON.stringify({
        sectId,
        name: '恢复清理验证宗',
        mark: '验',
        founderPlayerId: 'player:restore-smoke',
        leaderPlayerId: 'player:restore-smoke',
        status: 'active',
        entranceInstanceId,
        entranceTemplateId: 'yunlai_town',
        entranceX: 10,
        entranceY: 10,
        sectInstanceId,
        sectTemplateId: `sect_domain:${sectId}:x-1_1:y-1_1`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ],
  );
}

async function insertFormation(
  pool: Pool,
  input: { instanceId: string; formationInstanceId: string; ownerSectId: string },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO instance_formation_state(
        instance_id, formation_instance_id, owner_player_id, owner_sect_id, formation_id, lifecycle,
        disk_item_id, disk_tier, disk_multiplier, spirit_stone_count, qi_cost,
        x, y, eye_instance_id, eye_x, eye_y, allocation_payload, active,
        remaining_aura_budget, created_at_ms, updated_at_ms, updated_at
      )
      VALUES ($1, $2, 'player:restore-smoke', $3, 'sect_guardian_barrier', 'persistent',
        'formation_disk:restore_smoke', 'common', 1, 1, 0,
        10, 10, $1, 10, 10, '{}'::jsonb, true, 10, $4, $4, now())
    `,
    [input.instanceId, input.formationInstanceId, input.ownerSectId, Date.now()],
  );
}

async function insertInstanceRows(pool: Pool, instanceId: string, sectId: string): Promise<void> {
  await pool.query('INSERT INTO instance_checkpoint(instance_id, checkpoint_payload, updated_at) VALUES ($1, $2::jsonb, now())', [
    instanceId,
    JSON.stringify({ sectId }),
  ]);
  await pool.query('INSERT INTO instance_recovery_watermark(instance_id, watermark_payload, updated_at) VALUES ($1, $2::jsonb, now())', [
    instanceId,
    JSON.stringify({ sectId }),
  ]);
  await pool.query(
    `
      INSERT INTO instance_overlay_chunk(instance_id, patch_kind, chunk_key, patch_version, patch_payload, updated_at)
      VALUES ($1, 'portal', 'runtime_portals', 1, $2::jsonb, now())
    `,
    [
      instanceId,
      JSON.stringify({
        version: 1,
        portals: [{ x: 1, y: 1, sectId, targetInstanceId: instanceId, targetMapId: 'sect_domain', targetX: 0, targetY: 0 }],
      }),
    ],
  );
}

async function insertCatalogRow(pool: Pool, instanceId: string, sectId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO instance_catalog(
        instance_id, template_id, instance_type, persistent_policy, owner_sect_id,
        status, runtime_status, ownership_epoch, shard_key, created_at, last_active_at, last_persisted_at
      )
      VALUES ($1, 'sect_domain', 'sect', 'persistent', $2, 'active', 'idle', 0, $3, now(), now(), now())
    `,
    [instanceId, sectId, `instance:${instanceId}`],
  );
}

async function insertPublicPortalChunk(
  pool: Pool,
  publicInstanceId: string,
  orphanSectId: string,
  validSectId: string,
  validInstanceId: string,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO instance_overlay_chunk(instance_id, patch_kind, chunk_key, patch_version, patch_payload, updated_at)
      VALUES ($1, 'portal', 'runtime_portals', 1, $2::jsonb, now())
    `,
    [
      publicInstanceId,
      JSON.stringify({
        version: 1,
        portals: [
          { x: 1, y: 1, name: '孤儿宗门入口', sectId: orphanSectId, targetInstanceId: `sect:${orphanSectId}:main` },
          { x: 2, y: 2, name: '有效宗门入口', sectId: validSectId, targetInstanceId: validInstanceId },
          { x: 3, y: 3, name: '普通传送点', targetInstanceId: 'public:normal' },
        ],
      }),
    ],
  );
}

async function fetchPortalPayload(pool: Pool, instanceId: string): Promise<any> {
  const result = await pool.query(
    `
      SELECT patch_payload
      FROM instance_overlay_chunk
      WHERE instance_id = $1 AND patch_kind = 'portal' AND chunk_key = 'runtime_portals'
      LIMIT 1
    `,
    [instanceId],
  );
  return result.rows?.[0]?.patch_payload ?? null;
}

async function countRows(pool: Pool, sql: string, params: unknown[]): Promise<number> {
  const result = await pool.query(sql, params);
  return Number(result.rows?.[0]?.count ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
