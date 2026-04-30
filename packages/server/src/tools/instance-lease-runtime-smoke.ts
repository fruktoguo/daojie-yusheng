import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { NodeRegistryService } from '../persistence/node-registry.service';

const databaseUrl = resolveServerDatabaseUrl();
const INSTANCE_CATALOG_TABLE = 'instance_catalog';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证实例 lease 认领、续约与脏实例写链 fencing 保护',
          excludes: '不证明真实多节点 socket 导流、跨节点 transfer、过期 lease 自动接管、split-brain 双活或玩家迁移缓冲',
          completionMapping: 'release:proof:with-db.instance-lease-runtime',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousNodeId = process.env.SERVER_NODE_ID;
  process.env.SERVER_NODE_ID = 'instance-lease-smoke:local';

  const pool = new Pool({ connectionString: databaseUrl });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const fenceInstanceId = 'line:yunlai_town:peaceful:91';
  const adoptInstanceId = 'line:yunlai_town:peaceful:93';
  const takeoverInstanceId = 'line:yunlai_town:peaceful:92';
  try {
    const worldRuntimeService = app.get(WorldRuntimeService);
    const nodeRegistryService = app.get(NodeRegistryService);
    const localNodeId = nodeRegistryService.getNodeId();

    await cleanupInstanceRows(pool, [fenceInstanceId, takeoverInstanceId, adoptInstanceId]);

    const fenceProof = await verifyRenewFailureFence({
      pool,
      worldRuntimeService,
      localNodeId,
      instanceId: fenceInstanceId,
    });
    const localAdoptionProof = await verifyLocalCatalogLeaseAdoption({
      pool,
      worldRuntimeService,
      localNodeId,
      instanceId: adoptInstanceId,
    });
    const takeoverProof = await verifyTakeoverAndDirtyWriteGuard({
      pool,
      worldRuntimeService,
      localNodeId,
      instanceId: takeoverInstanceId,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          fenceProof,
          localAdoptionProof,
          takeoverProof,
          answers: 'with-db 下已验证实例 runtime 会认领 persistent instance lease、接管过期 lease、在本节点重启导致内存 lease token 落后时采用 catalog 本地 lease 并续约，并在 lease 不再属于本节点时阻断 dirty map 写链',
          excludes: '不证明真实多节点 socket 导流、跨节点 transfer、过期 lease 自动接管、split-brain 双活或玩家迁移缓冲',
          completionMapping: 'release:proof:with-db.instance-lease-runtime',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupInstanceRows(pool, [fenceInstanceId, takeoverInstanceId, adoptInstanceId]).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    restoreEnv('SERVER_NODE_ID', previousNodeId);
  }
}

async function verifyLocalCatalogLeaseAdoption(input: {
  pool: Pool;
  worldRuntimeService: any;
  localNodeId: string;
  instanceId: string;
}): Promise<{
  adoptedCatalogLeaseToken: boolean;
  runtimeStatus: string;
}> {
  const template = input.worldRuntimeService.templateRepository.getOrThrow('yunlai_town');
  const monsterSpawns = input.worldRuntimeService.contentTemplateRepository.createRuntimeMonstersForMap(template.id);
  const staleToken = `lease:${input.instanceId}:stale-runtime`;
  const catalogToken = `lease:${input.instanceId}:catalog-local`;
  const instance = new MapInstanceRuntime({
    instanceId: input.instanceId,
    template,
    monsterSpawns,
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: 'Lease Smoke Peaceful-93',
    linePreset: 'peaceful',
    lineIndex: 93,
    instanceOrigin: 'gm_manual',
    defaultEntry: false,
    supportsPvp: false,
    canDamageTile: true,
    assignedNodeId: input.localNodeId,
    leaseToken: staleToken,
    leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
    ownershipEpoch: 3,
    runtimeStatus: 'leased',
    status: 'active',
  });
  input.worldRuntimeService.worldRuntimeInstanceStateService.setInstanceRuntime(input.instanceId, instance);
  input.worldRuntimeService.worldRuntimeTickProgressService.initializeInstance(input.instanceId);
  await input.pool.query(
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
        $2, $3, now() + interval '60 second', 3,
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
    [input.instanceId, input.localNodeId, catalogToken],
  );

  await input.worldRuntimeService.syncInstanceLease(input.instanceId);
  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.equal(instance.meta.assignedNodeId, input.localNodeId);
  assert.equal(instance.meta.leaseToken, catalogToken);
  const row = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(row?.lease_token, catalogToken);
  assert.equal(row?.assigned_node_id, input.localNodeId);

  return {
    adoptedCatalogLeaseToken: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyRenewFailureFence(input: {
  pool: Pool;
  worldRuntimeService: any;
  localNodeId: string;
  instanceId: string;
}): Promise<{
  claimedOwnershipEpoch: number;
  fencedAfterRenewFailure: boolean;
}> {
  const template = input.worldRuntimeService.templateRepository.getOrThrow('yunlai_town');
  const monsterSpawns = input.worldRuntimeService.contentTemplateRepository.createRuntimeMonstersForMap(template.id);
  const instance = new MapInstanceRuntime({
    instanceId: input.instanceId,
    template,
    monsterSpawns,
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: 'Lease Smoke Peaceful-91',
    linePreset: 'peaceful',
    lineIndex: 91,
    instanceOrigin: 'gm_manual',
    defaultEntry: false,
    supportsPvp: false,
    canDamageTile: true,
    assignedNodeId: input.localNodeId,
    leaseToken: `lease:${input.instanceId}:local`,
    leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
    ownershipEpoch: 1,
    runtimeStatus: 'leased',
    status: 'active',
  });
  input.worldRuntimeService.worldRuntimeInstanceStateService.setInstanceRuntime(input.instanceId, instance);
  input.worldRuntimeService.worldRuntimeTickProgressService.initializeInstance(input.instanceId);
  await input.pool.query(
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
        $2, $3, now() + interval '30 second', 1,
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
    [input.instanceId, input.localNodeId, `lease:${input.instanceId}:local`],
  );

  await input.worldRuntimeService.syncInstanceLease(input.instanceId);
  assert.ok(instance);
  assert.equal(instance.meta.assignedNodeId, input.localNodeId);
  assert.ok(Number(instance.meta.ownershipEpoch) > 0);
  await input.pool.query(
    `
      UPDATE ${INSTANCE_CATALOG_TABLE}
      SET assigned_node_id = $2,
          lease_token = $3,
          lease_expire_at = now() + interval '60 second',
          ownership_epoch = ownership_epoch + 1
      WHERE instance_id = $1
    `,
    [input.instanceId, 'node:remote', 'lease:remote'],
  );
  const stolenRow = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(stolenRow?.assigned_node_id, 'node:remote');

  await input.worldRuntimeService.syncInstanceLease(input.instanceId);
  assert.equal(instance.meta.runtimeStatus, 'fenced');
  assert.equal(instance.meta.status, 'lease_lost');

  return {
    claimedOwnershipEpoch: Math.trunc(Number(instance.meta.ownershipEpoch)),
    fencedAfterRenewFailure: true,
  };
}

async function verifyTakeoverAndDirtyWriteGuard(input: {
  pool: Pool;
  worldRuntimeService: any;
  localNodeId: string;
  instanceId: string;
}): Promise<{
  takeoverOwnershipEpoch: number;
  dirtyWriteGuardBlocked: boolean;
  formationRestoredDuringTakeover: boolean;
}> {
  const formationInstanceId = `formation:${input.instanceId}:lease-smoke`;
  await input.pool.query(
    `
      INSERT INTO instance_formation_state(
        instance_id,
        formation_instance_id,
        owner_player_id,
        owner_sect_id,
        formation_id,
        disk_item_id,
        disk_tier,
        disk_multiplier,
        spirit_stone_count,
        qi_cost,
        x,
        y,
        eye_instance_id,
        eye_x,
        eye_y,
        allocation_payload,
        active,
        remaining_aura_budget,
        created_at_ms,
        updated_at_ms,
        updated_at
      )
      VALUES (
        $1, $2, 'player:lease-smoke', NULL, 'spirit_gathering',
        'formation_disk.mortal', 'mortal', 1, 100, 1000,
        1, 1, $1, 1, 1,
        '{}'::jsonb, true, 10000, 1, 1, now()
      )
      ON CONFLICT (instance_id, formation_instance_id)
      DO UPDATE SET remaining_aura_budget = EXCLUDED.remaining_aura_budget, updated_at = now()
    `,
    [input.instanceId, formationInstanceId],
  );
  await input.pool.query(
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
        'node:dead', 'lease:expired', now() - interval '5 second', 7,
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
    [input.instanceId],
  );

  const rowBeforeClaim = await fetchInstanceRow(input.pool, input.instanceId);
  await input.worldRuntimeService.claimRecoverableCatalogInstances();
  const rowAfterClaim = await fetchInstanceRow(input.pool, input.instanceId);
  const recovered = input.worldRuntimeService.getInstanceRuntime(input.instanceId);
  if (!recovered) {
    throw new Error(`expected recovered runtime, rowBefore=${JSON.stringify(rowBeforeClaim)} rowAfter=${JSON.stringify(rowAfterClaim)}`);
  }
  assert.equal(recovered.meta.assignedNodeId, input.localNodeId);
  assert.ok(Number(recovered.meta.ownershipEpoch) > 7);
  const restoredFormation = input.worldRuntimeService.worldRuntimeFormationService.findFormationInInstance(
    input.instanceId,
    formationInstanceId,
  );
  assert.equal(restoredFormation?.id, formationInstanceId);

  recovered.dropGroundItem(0, 0, { itemId: 'wood', count: 1 });
  recovered.meta.assignedNodeId = 'node:remote';
  recovered.meta.leaseToken = 'lease:stale';
  recovered.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
  recovered.meta.runtimeStatus = 'running';

  const dirtyInstanceIds = input.worldRuntimeService.listDirtyPersistentInstances();
  assert.ok(!dirtyInstanceIds.includes(input.instanceId));
  assert.equal(input.worldRuntimeService.buildMapPersistenceSnapshot(input.instanceId), null);
  assert.equal(recovered.meta.runtimeStatus, 'fenced');

  const row = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(row?.assigned_node_id, input.localNodeId);

  return {
    takeoverOwnershipEpoch: Math.trunc(Number(row?.ownership_epoch ?? 0)),
    dirtyWriteGuardBlocked: true,
    formationRestoredDuringTakeover: true,
  };
}

async function fetchInstanceRow(pool: Pool, instanceId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${INSTANCE_CATALOG_TABLE} WHERE instance_id = $1 LIMIT 1`, [instanceId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function cleanupInstanceRows(pool: Pool, instanceIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM ${INSTANCE_CATALOG_TABLE} WHERE instance_id = ANY($1::varchar[])`, [instanceIds]);
  await pool.query('DELETE FROM instance_formation_state WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
