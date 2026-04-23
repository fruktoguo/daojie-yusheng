import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const databaseUrl = resolveServerDatabaseUrl();
const PERSISTENT_DOCUMENTS_TABLE = 'persistent_documents';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 instance-domain 一次性迁移会把旧 persistent_documents 地图快照投影到 instance_* 分域表，并保留旧快照作为兜底',
          excludes: '不证明全量生产迁移回滚编排，也不证明多节点并发迁移冲突',
          completionMapping: 'replace-ready:proof:with-db.instance-domain-migration-smoke',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const instanceId = `public:instance-migration-${Date.now().toString(36)}`;
  const templateId = 'yunlai_town';
  const migrationScript = resolveMigrationScript();

  try {
    await cleanupRows(pool, instanceId);
    await seedLegacySnapshot(pool, instanceId, templateId);

    const result = spawnSync('node', [migrationScript, '--domains=instance-domain', `--instance-id=${instanceId}`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SERVER_DATABASE_URL: databaseUrl,
      },
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        [
          `migration exited with status ${result.status ?? 'null'}`,
          `stdout:\n${result.stdout ?? ''}`,
          `stderr:\n${result.stderr ?? ''}`,
        ].join('\n'),
      );
    }

    const migratedTileRows = await pool.query(
      'SELECT resource_key, tile_index, value FROM instance_tile_resource_state WHERE instance_id = $1 ORDER BY resource_key ASC, tile_index ASC',
      [instanceId],
    );
    assert.ok(migratedTileRows.rowCount && migratedTileRows.rowCount > 0);
    assert.equal(migratedTileRows.rows[0]?.resource_key, 'aura.refined.neutral');
    const checkpointRow = await pool.query(
      'SELECT checkpoint_payload FROM instance_checkpoint WHERE instance_id = $1 LIMIT 1',
      [instanceId],
    );
    assert.equal(checkpointRow.rowCount, 1);
    const recoveryRow = await pool.query(
      'SELECT watermark_payload FROM instance_recovery_watermark WHERE instance_id = $1 LIMIT 1',
      [instanceId],
    );
    assert.equal(recoveryRow.rowCount, 1);
    const legacyRow = await pool.query(
      'SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1',
      ['server_next_map_aura_v1', instanceId],
    );
    assert.equal(legacyRow.rowCount, 1);

    console.log(
      JSON.stringify(
        {
          ok: true,
          migratedTileCount: migratedTileRows.rowCount,
          checkpointPreserved: checkpointRow.rowCount === 1,
          recoveryWatermarkPreserved: recoveryRow.rowCount === 1,
          legacySnapshotRetained: legacyRow.rowCount === 1,
          answers: 'with-db 下已验证 instance-domain 迁移会把旧 persistent_documents 地图快照投影到 instance_* 分域表，并保留旧快照作为兜底 checkpoint',
          excludes: '不证明全量生产迁移回滚编排，也不证明多节点并发迁移冲突',
          completionMapping: 'replace-ready:proof:with-db.instance-domain-migration-smoke',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRows(pool, instanceId).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function resolveMigrationScript(): string {
  return `${process.cwd()}/packages/server/dist/tools/migrate-next-mainline-once.js`;
}

async function seedLegacySnapshot(pool: Pool, instanceId: string, templateId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO ${PERSISTENT_DOCUMENTS_TABLE}(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        "updatedAt" = now()
    `,
    ['server_next_map_aura_v1', instanceId, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      templateId,
      tileResourceEntries: [{ resourceKey: 'aura.refined.neutral', tileIndex: 3, value: 9 }],
      groundPileEntries: [{
        tileIndex: 13,
        items: [{ itemId: 'spirit_stone', count: 2 }],
      }],
      containerStates: [{
        id: 'legacy:container:1',
        sourceId: 'legacy:source:1',
        entries: [],
      }],
    })],
  );
}

async function cleanupRows(pool: Pool, instanceId: string): Promise<void> {
  await pool.query('DELETE FROM instance_tile_resource_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_checkpoint WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_recovery_watermark WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_ground_item WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_map_aura_v1', instanceId]).catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
