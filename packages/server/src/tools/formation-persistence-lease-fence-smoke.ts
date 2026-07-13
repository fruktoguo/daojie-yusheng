import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import {
  persistDurableSectMutation,
  type DurableInstanceLeaseFence,
} from '../persistence/sect-durable-persistence';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface FormationFixture extends Record<string, unknown> {
  remainingAuraBudget: number;
  remainingQiBudget: number;
  remainingSpiritStoneBudget: number;
  updatedAt: number;
}

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下普通阵法和宗门阵法 writer 会在同一事务校验实例 node/token/epoch/expiry。',
    }, null, 2));
    return;
  }

  const serial = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const instanceId = `instance:formation-fence:${serial}`;
  const formationInstanceId = `formation:${instanceId}:1`;
  const nodeA = 'node:formation-fence:a';
  const nodeB = 'node:formation-fence:b';
  const fenceA = buildFence(instanceId, nodeA, `lease:${serial}:a`, 4);
  const fenceB = buildFence(instanceId, nodeB, `lease:${serial}:b`, 5);
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new WorldRuntimeFormationService({}, {}, databasePoolProvider);

  try {
    await service.onModuleInit();
    await cleanupFixture(pool, instanceId, formationInstanceId);
    await seedCatalogLease(pool, fenceA);

    const formation = buildFormation(formationInstanceId, instanceId, Date.now(), 100, 1_000);
    service.formationsByInstanceId.set(instanceId, [formation]);
    await service.saveFormationSnapshot(formation, fenceA);
    await assertFormationState(pool, formationInstanceId, formation.updatedAt, 100, 1_000);

    formation.remainingSpiritStoneBudget = 90;
    formation.remainingQiBudget = 900;
    formation.remainingAuraBudget = 900;
    formation.updatedAt += 10;
    await handoffCatalogLease(pool, fenceB);

    await assert.rejects(
      service.saveFormationSnapshot(formation, fenceA),
      /formation_instance_lease_fencing_conflict/,
    );
    await assert.rejects(
      service.saveInstanceFormations(instanceId, fenceA),
      /formation_instance_lease_fencing_conflict/,
    );
    await assertFormationState(pool, formationInstanceId, formation.updatedAt - 10, 100, 1_000);

    const durableSnapshot = service.serializeFormationForDurableMutation(formation);
    await assert.rejects(
      persistDurableSectMutation(pool, {
        sectWrites: [],
        formationWrites: [{
          instanceId,
          formationInstanceId,
          snapshot: durableSnapshot,
          instanceFences: [fenceA],
        }],
      }),
      /sect_instance_lease_fencing_conflict/,
    );
    await assertFormationState(pool, formationInstanceId, formation.updatedAt - 10, 100, 1_000);

    await persistDurableSectMutation(pool, {
      sectWrites: [],
      formationWrites: [{
        instanceId,
        formationInstanceId,
        snapshot: durableSnapshot,
        instanceFences: [fenceB],
      }],
    });
    await assertFormationState(pool, formationInstanceId, formation.updatedAt, 90, 900);

    formation.updatedAt += 10;
    await assert.rejects(
      service.deleteFormationSnapshot(formation, fenceA),
      /formation_instance_lease_fencing_conflict/,
    );
    await assertFormationState(pool, formationInstanceId, formation.updatedAt - 10, 90, 900);

    await service.deleteFormationSnapshot(formation, fenceB);
    const deleted = await pool.query(
      'SELECT 1 FROM instance_formation_state WHERE formation_instance_id = $1',
      [formationInstanceId],
    );
    assert.equal(deleted.rowCount, 0);

    const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
    process.env.SERVER_RUNTIME_ENV = 'production';
    try {
      const unfencedService = new WorldRuntimeFormationService({}, {}, databasePoolProvider);
      unfencedService.formationsByInstanceId.set(instanceId, [formation]);
      await assert.rejects(
        unfencedService.saveFormationSnapshot(formation),
        /formation_instance_lease_fence_missing/,
      );
    } finally {
      if (previousRuntimeEnv === undefined) delete process.env.SERVER_RUNTIME_ENV;
      else process.env.SERVER_RUNTIME_ENV = previousRuntimeEnv;
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'formation-persistence-lease-fence',
      answers: [
        '普通单体、批量和删除 writer 在 handoff 后均拒绝旧 node/token/epoch，数据库阵法后态不变。',
        '宗门跨域阵法 writer 使用相同实例租约围栏，旧节点拒绝、新节点成功。',
        '生产数据库环境缺失显式阵法租约 fence 时失败关闭。',
      ],
    }, null, 2));
  } finally {
    await cleanupFixture(pool, instanceId, formationInstanceId).catch(() => undefined);
    await service.closePersistencePool().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildFence(
  instanceId: string,
  assignedNodeId: string,
  leaseToken: string,
  ownershipEpoch: number,
): DurableInstanceLeaseFence {
  return { instanceId, assignedNodeId, leaseToken, ownershipEpoch };
}

function buildFormation(
  formationInstanceId: string,
  instanceId: string,
  updatedAt: number,
  remainingSpiritStoneBudget: number,
  remainingQiBudget: number,
): FormationFixture {
  return {
    instanceId,
    id: formationInstanceId,
    ownerPlayerId: 'player:formation-fence',
    ownerSectId: null,
    formationId: 'spirit_gathering',
    lifecycle: 'deployed',
    diskItemId: 'formation_disk.mortal',
    diskTier: 'mortal',
    diskMultiplier: 1,
    spiritStoneCount: 100,
    qiCost: 100,
    x: 1,
    y: 1,
    eyeInstanceId: instanceId,
    eyeX: 1,
    eyeY: 1,
    allocation: {},
    stats: { radius: 1 },
    active: true,
    remainingAuraBudget: remainingQiBudget,
    remainingQiBudget,
    remainingSpiritStoneBudget,
    createdAt: updatedAt - 1,
    updatedAt,
  };
}

async function seedCatalogLease(pool: Pool, fence: DurableInstanceLeaseFence): Promise<void> {
  await pool.query(
    `INSERT INTO instance_catalog(
       instance_id, template_id, instance_type, persistent_policy, status, runtime_status,
       assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
       cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
     )
     VALUES ($1, 'yunlai_town', 'public', 'persistent', 'active', 'leased',
       $2, $3, $4::timestamptz, $5, 'cluster:default', $1, 'world', now(), now(), now())`,
    [
      fence.instanceId,
      fence.assignedNodeId,
      fence.leaseToken,
      new Date(Date.now() + 60_000).toISOString(),
      fence.ownershipEpoch,
    ],
  );
}

async function handoffCatalogLease(pool: Pool, fence: DurableInstanceLeaseFence): Promise<void> {
  await pool.query(
    `UPDATE instance_catalog
     SET assigned_node_id = $2,
         lease_token = $3,
         lease_expire_at = $4::timestamptz,
         ownership_epoch = $5,
         status = 'active',
         runtime_status = 'leased'
     WHERE instance_id = $1`,
    [
      fence.instanceId,
      fence.assignedNodeId,
      fence.leaseToken,
      new Date(Date.now() + 60_000).toISOString(),
      fence.ownershipEpoch,
    ],
  );
}

async function assertFormationState(
  pool: Pool,
  formationInstanceId: string,
  expectedUpdatedAt: number,
  expectedSpiritStoneBudget: number,
  expectedQiBudget: number,
): Promise<void> {
  const result = await pool.query<{
    updated_at_ms: string | number;
    remaining_spirit_stone_budget: string | number;
    remaining_qi_budget: string | number;
  }>(
    `SELECT updated_at_ms, remaining_spirit_stone_budget, remaining_qi_budget
     FROM instance_formation_state
     WHERE formation_instance_id = $1`,
    [formationInstanceId],
  );
  const row = result.rows[0] ?? null;
  assert.ok(row);
  assert.equal(Number(row.updated_at_ms), expectedUpdatedAt);
  assert.equal(Number(row.remaining_spirit_stone_budget), expectedSpiritStoneBudget);
  assert.equal(Number(row.remaining_qi_budget), expectedQiBudget);
}

async function cleanupFixture(
  pool: Pool,
  instanceId: string,
  formationInstanceId: string,
): Promise<void> {
  await pool.query(
    'DELETE FROM instance_formation_state WHERE formation_instance_id = $1',
    [formationInstanceId],
  ).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = $1', [instanceId]).catch(() => undefined);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
