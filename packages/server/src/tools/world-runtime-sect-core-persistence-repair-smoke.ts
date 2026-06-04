import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { repairPersistedSectCoreStateWithClient } from '../runtime/world/world-runtime-sect.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '宗门核心持久化自愈 smoke 需要真实 PostgreSQL 连接',
          excludes: '不证明运行中实例内存态重载，只证明数据库 server_sect 与 runtime_portals 历史坐标修复',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const sectId = `sect:core_persistence_repair_${suffix}`;
  const sectInstanceId = `sect:${sectId}:main`;
  const entranceInstanceId = `real:sect_core_persistence_repair_${suffix}`;

  try {
    if (!(await hasTable(pool, 'server_sect')) || !(await hasTable(pool, 'instance_overlay_chunk'))) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            reason: 'required sect/overlay tables missing',
            answers: '当前数据库尚未初始化宗门或 overlay 表，跳过真实 DB 自愈 smoke',
          },
          null,
          2,
        ),
      );
      return;
    }

    await cleanupFixture(pool, sectId, sectInstanceId);
    await pool.query(
      `
        INSERT INTO server_sect(
          sect_id,
          name,
          mark,
          founder_player_id,
          leader_player_id,
          status,
          entrance_instance_id,
          entrance_template_id,
          entrance_x,
          entrance_y,
          sect_instance_id,
          sect_template_id,
          created_at_ms,
          updated_at_ms,
          raw_payload,
          updated_at
        )
        VALUES ($1, '核心修复烟测宗', '修', 'player:repair-founder', 'player:repair-founder', 'active',
          $2, 'sect_core_repair_world', 7, 8, $3, $4, 1, 1, $5::jsonb, now())
      `,
      [
        sectId,
        entranceInstanceId,
        sectInstanceId,
        `sect_domain:${sectId}:x-2_2:y-2_2`,
        JSON.stringify({
          sectId,
          name: '核心修复烟测宗',
          mark: '修',
          founderPlayerId: 'player:repair-founder',
          leaderPlayerId: 'player:repair-founder',
          status: 'active',
          entranceInstanceId,
          entranceTemplateId: 'sect_core_repair_world',
          entranceX: 7,
          entranceY: 8,
          sectInstanceId,
          sectTemplateId: `sect_domain:${sectId}:x-2_2:y-2_2`,
          coreX: 2,
          coreY: 2,
          expansionRadius: 2,
          mapMinX: -2,
          mapMaxX: 2,
          mapMinY: -2,
          mapMaxY: 2,
          members: [{ playerId: 'player:repair-founder', name: '宗主', roleId: 'leader', joinedAt: 1 }],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
    );
    await pool.query(
      `
        INSERT INTO instance_overlay_chunk(instance_id, patch_kind, chunk_key, patch_version, patch_payload, updated_at)
        VALUES ($1, 'portal', 'runtime_portals', 1, $2::jsonb, now())
      `,
      [
        sectInstanceId,
        JSON.stringify({
          version: 1,
          portals: [
            {
              id: 'ordinary:1,1',
              x: 1,
              y: 1,
              targetMapId: 'sect_core_repair_world',
              targetX: 1,
              targetY: 1,
              direction: 'two_way',
              kind: 'portal',
              trigger: 'manual',
              hidden: false,
              name: '普通传送点',
            },
            {
              id: 'sect_core:2,2',
              x: 2,
              y: 2,
              targetMapId: 'sect_core_repair_world',
              targetInstanceId: entranceInstanceId,
              targetX: 7,
              targetY: 8,
              direction: 'two_way',
              kind: 'sect_core',
              trigger: 'manual',
              hidden: false,
              name: '核心修复烟测宗宗门核心',
              char: '宗',
              color: '#d8c37a',
              sectId,
            },
          ],
        }),
      ],
    );

    const client = await pool.connect();
    try {
      const report = await repairPersistedSectCoreStateWithClient(client);
      assert.ok(report.sectRowsUpdated >= 1);
      assert.ok(report.overlayRowsUpdated >= 1);
    } finally {
      client.release();
    }

    const row = await pool.query(
      `
        SELECT
          s.sect_template_id,
          s.raw_payload->>'coreX' AS core_x,
          s.raw_payload->>'coreY' AS core_y,
          s.raw_payload->>'sectTemplateId' AS raw_template_id,
          c.patch_payload
        FROM server_sect s
        JOIN instance_overlay_chunk c
          ON c.instance_id = s.sect_instance_id
         AND c.patch_kind = 'portal'
         AND c.chunk_key = 'runtime_portals'
        WHERE s.sect_id = $1
      `,
      [sectId],
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].sect_template_id, `sect_domain:${sectId}`);
    assert.equal(row.rows[0].core_x, '0');
    assert.equal(row.rows[0].core_y, '0');
    assert.equal(row.rows[0].raw_template_id, `sect_domain:${sectId}`);
    const portals = Array.isArray(row.rows[0].patch_payload?.portals) ? row.rows[0].patch_payload.portals : [];
    assert.equal(portals.some((portal: any) => portal?.name === '普通传送点'), true);
    const corePortals = portals.filter((portal: any) => portal?.sectId === sectId && portal?.kind === 'sect_core');
    assert.equal(corePortals.length, 1);
    assert.equal(corePortals[0].x, 0);
    assert.equal(corePortals[0].y, 0);
    assert.equal(corePortals[0].id, 'sect_core:0,0');

    console.log(
      JSON.stringify(
        {
          ok: true,
          answers: '宗门核心持久化自愈会全量修复历史 server_sect raw_payload/template 与宗门实例 runtime_portals，保留同 chunk 里的普通传送点。',
          excludes: '不证明运行中内存实例无需重启即可重载；当前修复在启动/恢复和持久化层生效。',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupFixture(pool, sectId, sectInstanceId).catch(() => undefined);
    await pool.end();
  }
}

async function hasTable(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query('SELECT to_regclass($1) AS table_name', [tableName]);
  return Boolean(result.rows?.[0]?.table_name);
}

async function cleanupFixture(pool: Pool, sectId: string, sectInstanceId: string): Promise<void> {
  await pool.query('DELETE FROM instance_overlay_chunk WHERE instance_id = $1', [sectInstanceId]).catch(() => undefined);
  await pool.query('DELETE FROM server_sect WHERE sect_id = $1', [sectId]).catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
