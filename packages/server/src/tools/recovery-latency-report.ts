import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { Direction } from '@mud/shared';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { NodeRegistryService } from '../persistence/node-registry.service';

const databaseUrl = resolveServerDatabaseUrl();
const INSTANCE_CATALOG_TABLE = 'instance_catalog';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出单玩家 / 单实例恢复耗时，并作为阶段 6.1 的恢复指标入口',
      excludes: '不证明真实多节点 kill -9 或 socket 导流',
      completionMapping: 'release:proof:stage6.recovery-latency',
    }, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = new Pool({ connectionString: databaseUrl });
  const bootstrapService = app.get(WorldSessionBootstrapPlayerInitService);
  const worldRuntimeService = app.get(WorldRuntimeService);
  const playerRuntimeService = app.get(PlayerRuntimeService);
  const nodeRegistry = app.get(NodeRegistryService);
  const localNodeId = nodeRegistry.getNodeId();

  const playerId = `recover_player_${Date.now().toString(36)}`;
  const sessionId = `recover_session_${Date.now().toString(36)}`;
  const instanceId = `line:yunlai_town:peaceful:${Date.now().toString(36)}`;
  try {
    const playerStartedAt = performance.now();
    const player = await bootstrapService.initializeBootstrapPlayer({
      playerId,
      sessionId,
      loadSnapshot: async () => {
        await sleep(25);
        return playerRuntimeService.buildFreshPersistenceSnapshot(playerId, {
          templateId: 'yunlai_town',
          instanceId: 'public:yunlai_town',
          x: 10,
          y: 10,
          facing: Direction.South,
        }) as PersistedPlayerSnapshot;
      },
    });
    const playerDurationMs = performance.now() - playerStartedAt;
    assert.ok(player);

    await seedRecoverableInstance(pool, instanceId, localNodeId);
    const instanceStartedAt = performance.now();
    await worldRuntimeService.claimRecoverableCatalogInstances();
    const instanceDurationMs = performance.now() - instanceStartedAt;
    const recoveredInstance = worldRuntimeService.getInstanceRuntime(instanceId);
    assert.ok(recoveredInstance);

    console.log(JSON.stringify({
      ok: true,
      playerDurationMs: round6(playerDurationMs),
      instanceDurationMs: round6(instanceDurationMs),
      playerInstanceId: player.instanceId,
      playerTemplateId: player.templateId,
      recoveredInstanceId: recoveredInstance.meta.instanceId,
      answers: '当前已可直接输出单玩家/单实例恢复耗时，并作为阶段 6.1 的恢复指标入口',
      excludes: '不证明真实多节点 kill -9 或 socket 导流',
      completionMapping: 'release:proof:stage6.recovery-latency',
    }, null, 2));
  } finally {
    await pool.query(`DELETE FROM ${INSTANCE_CATALOG_TABLE} WHERE instance_id = $1`, [instanceId]).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function seedRecoverableInstance(pool: Pool, instanceId: string, nodeId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO ${INSTANCE_CATALOG_TABLE}(
        instance_id, template_id, instance_type, persistent_policy,
        status, runtime_status,
        assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
        shard_key, route_domain, created_at, last_active_at
      )
      VALUES (
        $1, 'yunlai_town', 'public', 'persistent',
        'active', 'leased',
        $2, $3, now() - interval '5 second', 7,
        $1, 'peaceful', now(), now()
      )
      ON CONFLICT (instance_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        instance_type = EXCLUDED.instance_type,
        persistent_policy = EXCLUDED.persistent_policy,
        status = EXCLUDED.status,
        runtime_status = EXCLUDED.runtime_status,
        assigned_node_id = EXCLUDED.assigned_node_id,
        lease_token = EXCLUDED.lease_token,
        lease_expire_at = EXCLUDED.lease_expire_at,
        ownership_epoch = EXCLUDED.ownership_epoch,
        shard_key = EXCLUDED.shard_key,
        route_domain = EXCLUDED.route_domain,
        last_active_at = EXCLUDED.last_active_at
    `,
    [instanceId, nodeId, `lease:${instanceId}`],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
