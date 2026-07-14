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
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import {
  destroyManagedInstance,
  isInstanceLeaseWritable,
  syncInstanceLease,
} from '../runtime/world/world-runtime-instance-lease.helpers';

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
          answers: 'with-db 下可验证实例 lease 认领、续约、回收目录复活与脏实例写链 fencing 保护',
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
  const destroyInstanceId = 'line:yunlai_town:peaceful:94';
  const upsertEpochInstanceId = 'line:yunlai_town:peaceful:95';
  const revivalIdentityInstanceId = 'smoke:instance-lease-revival:identity';
  const revivalSameNodeInstanceId = 'smoke:instance-lease-revival:same-node';
  const revivalRemoteNodeInstanceId = 'smoke:instance-lease-revival:remote-node';
  const revivalExpiredDestroyInstanceId = 'smoke:instance-lease-revival:expired-destroy-at';
  const upsertDestroyedInstanceId = 'smoke:instance-catalog-upsert:destroyed';
  const upsertStoppedInstanceId = 'smoke:instance-catalog-upsert:stopped';
  const upsertPastDestroyInstanceId = 'smoke:instance-catalog-upsert:past-destroy';
  const upsertFutureDestroyInstanceId = 'smoke:instance-catalog-upsert:future-destroy';
  const destroyAwaitRaceInstanceId = 'smoke:instance-destroy:await-race';
  const destroyReplacementInstanceId = 'smoke:instance-destroy:replacement';
  const destroyLatePlayerInstanceId = 'smoke:instance-destroy:late-player';
  const destroyUnassignedInstanceId = 'smoke:instance-destroy:unassigned';
  const fixtureInstanceIds = [
    fenceInstanceId,
    takeoverInstanceId,
    adoptInstanceId,
    destroyInstanceId,
    upsertEpochInstanceId,
    revivalIdentityInstanceId,
    revivalSameNodeInstanceId,
    revivalRemoteNodeInstanceId,
    revivalExpiredDestroyInstanceId,
    upsertDestroyedInstanceId,
    upsertStoppedInstanceId,
    upsertPastDestroyInstanceId,
    upsertFutureDestroyInstanceId,
    destroyAwaitRaceInstanceId,
    destroyReplacementInstanceId,
    destroyLatePlayerInstanceId,
    destroyUnassignedInstanceId,
  ];
  try {
    const worldRuntimeService = app.get(WorldRuntimeService);
    const nodeRegistryService = app.get(NodeRegistryService);
    const instanceCatalogService = app.get(InstanceCatalogService);
    const localNodeId = nodeRegistryService.getNodeId();

    await cleanupInstanceRows(pool, fixtureInstanceIds);

    const catalogRevivalProof = await verifyCatalogRevivalFence({
      pool,
      instanceCatalogService,
      localNodeId,
      identityInstanceId: revivalIdentityInstanceId,
      sameNodeInstanceId: revivalSameNodeInstanceId,
      remoteNodeInstanceId: revivalRemoteNodeInstanceId,
      expiredDestroyInstanceId: revivalExpiredDestroyInstanceId,
    });

    const catalogUpsertEpochProof = await verifyCatalogUpsertKeepsOwnershipEpochMonotonic({
      pool,
      worldRuntimeService,
      instanceId: upsertEpochInstanceId,
    });
    const catalogUpsertFenceProof = await verifyCatalogUpsertTombstoneFence({
      pool,
      instanceCatalogService,
      localNodeId,
      destroyedInstanceId: upsertDestroyedInstanceId,
      stoppedInstanceId: upsertStoppedInstanceId,
      pastDestroyInstanceId: upsertPastDestroyInstanceId,
      futureDestroyInstanceId: upsertFutureDestroyInstanceId,
    });

    const renewalDegradeProof = await verifyRenewFailureFence({
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
    const destroyFenceProof = await verifyDestroyFenceBeforeRuntimeCleanup({
      pool,
      worldRuntimeService,
      localNodeId,
      instanceId: destroyInstanceId,
    });
    const destroyConcurrencyProof = await verifyDestroyConcurrencyFences({
      pool,
      worldRuntimeService,
      instanceCatalogService,
      localNodeId,
      awaitRaceInstanceId: destroyAwaitRaceInstanceId,
      replacementInstanceId: destroyReplacementInstanceId,
      latePlayerInstanceId: destroyLatePlayerInstanceId,
    });
    const unassignedDestroyRejected = await verifyUnassignedCatalogDestroyRejected({
      pool,
      instanceCatalogService,
      instanceId: destroyUnassignedInstanceId,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          renewalDegradeProof,
          localAdoptionProof,
          takeoverProof,
          destroyFenceProof,
          destroyConcurrencyProof,
          unassignedDestroyRejected,
          catalogUpsertEpochProof,
          catalogUpsertFenceProof,
          catalogRevivalProof,
          answers: 'with-db 下已验证实例 runtime 会认领 persistent instance lease、接管过期 lease、在本节点重启导致内存 lease token 落后时采用 catalog 本地 lease 并续约，并在 lease 续约失败时进入 lease_degraded、在 lease 不再属于本节点时阻断 dirty map 写链；实例销毁在 catalog CAS 等待前同步关闭接入和写入，等待期间 lease 过期会拒绝 CAS，CAS 后出现玩家或 runtime replacement 会保留运行态并恢复 catalog lease，不会误删 replacement；实例销毁成功会递增 epoch 后再卸载；目录 upsert 不会把 ownership epoch 回退，也不能覆盖 destroyed、stopped 或已到 destroy_at 的 tombstone fence；未来 destroy_at 的活动实例仍可幂等 upsert、拒绝显式复活清空计划时间并可正常认领 lease；回收目录复活会精确校验 template/type/epoch，已到期 destroy_at 可修复尚未收敛的 active/running 行，同节点有效旧 lease 只允许匹配原 token 后轮换，异节点有效 lease 保持拒绝，成功后清除已到期 destroy_at 并递增 epoch。',
          excludes: '不证明真实多节点 socket 导流、跨节点 transfer、过期 lease 自动接管、split-brain 双活或玩家迁移缓冲',
          completionMapping: 'release:proof:with-db.instance-lease-runtime',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupInstanceRows(pool, fixtureInstanceIds).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    restoreEnv('SERVER_NODE_ID', previousNodeId);
  }
}

async function verifyCatalogRevivalFence(input: {
  pool: Pool;
  instanceCatalogService: InstanceCatalogService;
  localNodeId: string;
  identityInstanceId: string;
  sameNodeInstanceId: string;
  remoteNodeInstanceId: string;
  expiredDestroyInstanceId: string;
}): Promise<{
  identityCasRejected: boolean;
  revivedOwnershipEpoch: number;
  destroyAtCleared: boolean;
  leaseTokenRotated: boolean;
  sameNodeRequiresExactOldToken: boolean;
  remoteNodeLeaseRejected: boolean;
  expiredDestroyAtRevived: boolean;
}> {
  const templateId = 'tongtian_tower_layer_47';
  const instanceType = 'tower';
  const identityOldToken = `lease:${input.identityInstanceId}:expired`;
  const identityNewToken = `lease:${input.identityInstanceId}:revived`;
  const identityNewExpireAt = new Date(Date.now() + 120_000);
  await insertRevivalCatalogFixture({
    pool: input.pool,
    instanceId: input.identityInstanceId,
    templateId,
    instanceType,
    assignedNodeId: 'instance-lease-smoke:expired',
    leaseToken: identityOldToken,
    leaseExpireAt: new Date(Date.now() - 60_000),
    ownershipEpoch: 40,
  });

  const identityRowBefore = catalogFenceSnapshot(
    await requireInstanceRow(input.pool, input.identityInstanceId),
  );
  const rejectedIdentityInputs = [
    {
      expectedTemplateId: `${templateId}:wrong`,
      expectedInstanceType: instanceType,
      expectedOwnershipEpoch: 40,
    },
    {
      expectedTemplateId: templateId,
      expectedInstanceType: `${instanceType}:wrong`,
      expectedOwnershipEpoch: 40,
    },
    {
      expectedTemplateId: templateId,
      expectedInstanceType: instanceType,
      expectedOwnershipEpoch: 39,
    },
  ];
  for (const rejectedInput of rejectedIdentityInputs) {
    const rejected = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
      instanceId: input.identityInstanceId,
      ...rejectedInput,
      nodeId: input.localNodeId,
      leaseToken: identityNewToken,
      leaseExpireAt: identityNewExpireAt,
    });
    assert.deepEqual(rejected, { ok: false, ownershipEpoch: null });
    assert.deepEqual(
      catalogFenceSnapshot(await requireInstanceRow(input.pool, input.identityInstanceId)),
      identityRowBefore,
    );
  }

  const revived = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
    instanceId: input.identityInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    nodeId: input.localNodeId,
    leaseToken: identityNewToken,
    leaseExpireAt: identityNewExpireAt,
    expectedOwnershipEpoch: 40,
  });
  assert.deepEqual(revived, { ok: true, ownershipEpoch: 41 });
  const revivedRow = await requireInstanceRow(input.pool, input.identityInstanceId);
  assert.equal(revivedRow.status, 'active');
  assert.equal(revivedRow.runtime_status, 'leased');
  assert.equal(revivedRow.assigned_node_id, input.localNodeId);
  assert.equal(revivedRow.lease_token, identityNewToken);
  assert.notEqual(revivedRow.lease_token, identityOldToken);
  const persistedIdentityExpireAtMs = new Date(String(revivedRow.lease_expire_at)).getTime();
  assert.ok(
    Math.abs(persistedIdentityExpireAtMs - identityNewExpireAt.getTime()) < 1_000,
    'lease_expire_at 应只允许 PostgreSQL 列精度导致的亚秒舍入',
  );
  assert.equal(Number(revivedRow.ownership_epoch), 41);
  assert.ok(Number(revivedRow.metadata_version) >= 41);
  assert.equal(revivedRow.destroy_at, null);

  const sameNodeOldToken = `lease:${input.sameNodeInstanceId}:old`;
  const sameNodeNewToken = `lease:${input.sameNodeInstanceId}:new`;
  await insertRevivalCatalogFixture({
    pool: input.pool,
    instanceId: input.sameNodeInstanceId,
    templateId,
    instanceType,
    assignedNodeId: input.localNodeId,
    leaseToken: sameNodeOldToken,
    leaseExpireAt: new Date(Date.now() + 120_000),
    ownershipEpoch: 60,
  });
  const sameNodeRowBefore = catalogFenceSnapshot(
    await requireInstanceRow(input.pool, input.sameNodeInstanceId),
  );
  for (const expectedCurrentLeaseToken of [null, `${sameNodeOldToken}:wrong`]) {
    const rejected = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
      instanceId: input.sameNodeInstanceId,
      expectedTemplateId: templateId,
      expectedInstanceType: instanceType,
      expectedCurrentNodeId: input.localNodeId,
      expectedCurrentLeaseToken,
      nodeId: input.localNodeId,
      leaseToken: sameNodeNewToken,
      leaseExpireAt: new Date(Date.now() + 180_000),
      expectedOwnershipEpoch: 60,
    });
    assert.deepEqual(rejected, { ok: false, ownershipEpoch: null });
    assert.deepEqual(
      catalogFenceSnapshot(await requireInstanceRow(input.pool, input.sameNodeInstanceId)),
      sameNodeRowBefore,
    );
  }
  const sameNodeRevived = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
    instanceId: input.sameNodeInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    expectedCurrentNodeId: input.localNodeId,
    expectedCurrentLeaseToken: sameNodeOldToken,
    nodeId: input.localNodeId,
    leaseToken: sameNodeNewToken,
    leaseExpireAt: new Date(Date.now() + 180_000),
    expectedOwnershipEpoch: 60,
  });
  assert.deepEqual(sameNodeRevived, { ok: true, ownershipEpoch: 61 });
  const sameNodeRevivedRow = await requireInstanceRow(input.pool, input.sameNodeInstanceId);
  assert.equal(sameNodeRevivedRow.lease_token, sameNodeNewToken);
  assert.equal(Number(sameNodeRevivedRow.ownership_epoch), 61);
  assert.equal(sameNodeRevivedRow.destroy_at, null);

  const remoteNodeId = 'instance-lease-smoke:remote';
  const remoteNodeOldToken = `lease:${input.remoteNodeInstanceId}:remote`;
  await insertRevivalCatalogFixture({
    pool: input.pool,
    instanceId: input.remoteNodeInstanceId,
    templateId,
    instanceType,
    assignedNodeId: remoteNodeId,
    leaseToken: remoteNodeOldToken,
    leaseExpireAt: new Date(Date.now() + 120_000),
    ownershipEpoch: 70,
  });
  const remoteNodeRowBefore = catalogFenceSnapshot(
    await requireInstanceRow(input.pool, input.remoteNodeInstanceId),
  );
  const remoteNodeRejected = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
    instanceId: input.remoteNodeInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    expectedCurrentNodeId: remoteNodeId,
    expectedCurrentLeaseToken: remoteNodeOldToken,
    nodeId: input.localNodeId,
    leaseToken: `lease:${input.remoteNodeInstanceId}:local`,
    leaseExpireAt: new Date(Date.now() + 180_000),
    expectedOwnershipEpoch: 70,
  });
  assert.deepEqual(remoteNodeRejected, { ok: false, ownershipEpoch: null });
  assert.deepEqual(
    catalogFenceSnapshot(await requireInstanceRow(input.pool, input.remoteNodeInstanceId)),
    remoteNodeRowBefore,
  );

  await input.pool.query(
    `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
       instance_id, template_id, instance_type, persistent_policy,
       status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
       ownership_epoch, metadata_version, shard_key, route_domain, destroy_at,
       created_at, last_active_at
     ) VALUES (
       $1, $2, $3, 'persistent',
       'active', 'running', NULL, NULL, NULL,
       80, 80, $1, 'tower', now() - interval '60 second',
       now(), now()
     )`,
    [input.expiredDestroyInstanceId, templateId, instanceType],
  );
  const expiredDestroyRevived = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
    instanceId: input.expiredDestroyInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    nodeId: input.localNodeId,
    leaseToken: `lease:${input.expiredDestroyInstanceId}:revived`,
    leaseExpireAt: new Date(Date.now() + 180_000),
    expectedOwnershipEpoch: 80,
  });
  assert.deepEqual(expiredDestroyRevived, { ok: true, ownershipEpoch: 81 });
  const expiredDestroyRow = await requireInstanceRow(input.pool, input.expiredDestroyInstanceId);
  assert.equal(expiredDestroyRow.status, 'active');
  assert.equal(expiredDestroyRow.runtime_status, 'leased');
  assert.equal(expiredDestroyRow.assigned_node_id, input.localNodeId);
  assert.equal(Number(expiredDestroyRow.ownership_epoch), 81);
  assert.equal(expiredDestroyRow.destroy_at, null);

  return {
    identityCasRejected: true,
    revivedOwnershipEpoch: Number(revivedRow.ownership_epoch),
    destroyAtCleared: revivedRow.destroy_at === null,
    leaseTokenRotated: revivedRow.lease_token === identityNewToken,
    sameNodeRequiresExactOldToken: sameNodeRevivedRow.lease_token === sameNodeNewToken,
    remoteNodeLeaseRejected: true,
    expiredDestroyAtRevived: true,
  };
}

async function insertRevivalCatalogFixture(input: {
  pool: Pool;
  instanceId: string;
  templateId: string;
  instanceType: string;
  assignedNodeId: string;
  leaseToken: string;
  leaseExpireAt: Date;
  ownershipEpoch: number;
}): Promise<void> {
  await input.pool.query(
    `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
       instance_id, template_id, instance_type, persistent_policy,
       status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
       ownership_epoch, metadata_version, shard_key, route_domain, destroy_at,
       created_at, last_active_at
     ) VALUES (
       $1, $2, $3, 'long_lived',
       'destroyed', 'stopped', $4, $5, $6,
       $7, $7, $1, 'tower', now() - interval '60 second',
       now(), now()
     )`,
    [
      input.instanceId,
      input.templateId,
      input.instanceType,
      input.assignedNodeId,
      input.leaseToken,
      input.leaseExpireAt,
      input.ownershipEpoch,
    ],
  );
}

async function requireInstanceRow(pool: Pool, instanceId: string): Promise<Record<string, unknown>> {
  const row = await fetchInstanceRow(pool, instanceId);
  assert.ok(row, `instance catalog fixture missing: ${instanceId}`);
  return row;
}

function catalogFenceSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    instanceId: row.instance_id,
    templateId: row.template_id,
    instanceType: row.instance_type,
    status: row.status,
    runtimeStatus: row.runtime_status,
    assignedNodeId: row.assigned_node_id,
    leaseToken: row.lease_token,
    leaseExpireAt: toIsoStringOrNull(row.lease_expire_at),
    ownershipEpoch: Number(row.ownership_epoch),
    metadataVersion: Number(row.metadata_version),
    destroyAt: toIsoStringOrNull(row.destroy_at),
    lastActiveAt: toIsoStringOrNull(row.last_active_at),
  };
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(String(value)).toISOString();
}

async function verifyCatalogUpsertKeepsOwnershipEpochMonotonic(input: {
  pool: Pool;
  worldRuntimeService: any;
  instanceId: string;
}): Promise<{
  ownershipEpoch: number;
  metadataVersion: number;
}> {
  await input.pool.query(
    `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
       instance_id, template_id, instance_type, persistent_policy,
       status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
       ownership_epoch, metadata_version, shard_key, route_domain, created_at, last_active_at
     ) VALUES (
       $1, 'yunlai_town', 'public', 'persistent',
       'active', 'leased', 'node:expired', 'lease:expired', now() - interval '60 second',
       17, 17, $1, 'peaceful', now(), now()
     )`,
    [input.instanceId],
  );

  await input.worldRuntimeService.instanceCatalogService.upsertInstanceCatalog({
    instanceId: input.instanceId,
    templateId: 'yunlai_town',
    instanceType: 'public',
    persistentPolicy: 'persistent',
    status: 'active',
    runtimeStatus: 'running',
    assignedNodeId: null,
    leaseToken: null,
    leaseExpireAt: null,
    ownershipEpoch: 0,
    shardKey: input.instanceId,
    routeDomain: 'peaceful',
    preserveExistingLease: true,
  });

  const row = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(Number(row?.ownership_epoch), 17);
  assert.ok(Number(row?.metadata_version) >= 17);
  return {
    ownershipEpoch: Number(row?.ownership_epoch),
    metadataVersion: Number(row?.metadata_version),
  };
}

async function verifyCatalogUpsertTombstoneFence(input: {
  pool: Pool;
  instanceCatalogService: InstanceCatalogService;
  localNodeId: string;
  destroyedInstanceId: string;
  stoppedInstanceId: string;
  pastDestroyInstanceId: string;
  futureDestroyInstanceId: string;
}): Promise<{
  rejectedTombstoneKinds: string[];
  futureDestroyAtIdempotentUpsert: boolean;
  futureDestroyAtRevivalRejected: boolean;
  futureDestroyAtLeaseOwnershipEpoch: number;
}> {
  const templateId = 'tongtian_tower_layer_48';
  const instanceType = 'tower';
  const tombstones: Array<{
    kind: string;
    instanceId: string;
    status: string;
    runtimeStatus: string;
    destroyAt: Date | null;
    ownershipEpoch: number;
  }> = [
    {
      kind: 'destroyed',
      instanceId: input.destroyedInstanceId,
      status: 'destroyed',
      runtimeStatus: 'leased',
      destroyAt: null,
      ownershipEpoch: 81,
    },
    {
      kind: 'stopped',
      instanceId: input.stoppedInstanceId,
      status: 'active',
      runtimeStatus: 'stopped',
      destroyAt: null,
      ownershipEpoch: 82,
    },
    {
      kind: 'past_destroy_at',
      instanceId: input.pastDestroyInstanceId,
      status: 'active',
      runtimeStatus: 'leased',
      destroyAt: new Date(Date.now() - 60_000),
      ownershipEpoch: 83,
    },
  ];

  for (const tombstone of tombstones) {
    await insertCatalogUpsertFenceFixture({
      pool: input.pool,
      instanceId: tombstone.instanceId,
      templateId,
      instanceType,
      status: tombstone.status,
      runtimeStatus: tombstone.runtimeStatus,
      assignedNodeId: 'instance-lease-smoke:tombstone-owner',
      leaseToken: `lease:${tombstone.instanceId}:tombstone`,
      leaseExpireAt: new Date(Date.now() + 120_000),
      ownershipEpoch: tombstone.ownershipEpoch,
      destroyAt: tombstone.destroyAt,
      routeDomain: 'tower:tombstone',
    });
    const rowBefore = catalogFenceSnapshot(
      await requireInstanceRow(input.pool, tombstone.instanceId),
    );
    await input.instanceCatalogService.upsertInstanceCatalog({
      instanceId: tombstone.instanceId,
      templateId: `${templateId}:incoming`,
      instanceType: `${instanceType}:incoming`,
      persistentPolicy: 'long_lived',
      status: 'active',
      runtimeStatus: 'running',
      assignedNodeId: input.localNodeId,
      leaseToken: `lease:${tombstone.instanceId}:incoming`,
      leaseExpireAt: new Date(Date.now() + 180_000).toISOString(),
      ownershipEpoch: 0,
      metadataVersion: tombstone.ownershipEpoch + 100,
      shardKey: `${tombstone.instanceId}:incoming`,
      routeDomain: 'tower:incoming',
      destroyAt: new Date(Date.now() + 300_000).toISOString(),
      preserveExistingLease: false,
    });
    assert.deepEqual(
      catalogFenceSnapshot(await requireInstanceRow(input.pool, tombstone.instanceId)),
      rowBefore,
      `${tombstone.kind} catalog tombstone 不得被通用 upsert 覆盖`,
    );
  }

  const futureDestroyAt = new Date(Date.now() + 300_000);
  await insertCatalogUpsertFenceFixture({
    pool: input.pool,
    instanceId: input.futureDestroyInstanceId,
    templateId,
    instanceType,
    status: 'active',
    runtimeStatus: 'running',
    assignedNodeId: null,
    leaseToken: null,
    leaseExpireAt: null,
    ownershipEpoch: 90,
    destroyAt: futureDestroyAt,
    routeDomain: 'tower:scheduled-before-upsert',
  });
  const futureUpsertInput = {
    instanceId: input.futureDestroyInstanceId,
    templateId,
    instanceType,
    persistentPolicy: 'long_lived',
    status: 'active',
    runtimeStatus: 'running',
    assignedNodeId: null,
    leaseToken: null,
    leaseExpireAt: null,
    ownershipEpoch: 90,
    metadataVersion: 90,
    shardKey: input.futureDestroyInstanceId,
    routeDomain: 'tower:scheduled',
    destroyAt: futureDestroyAt.toISOString(),
    preserveExistingLease: false,
  };
  await input.instanceCatalogService.upsertInstanceCatalog(futureUpsertInput);
  const futureRowAfterFirstUpsert = await requireInstanceRow(input.pool, input.futureDestroyInstanceId);
  assert.equal(futureRowAfterFirstUpsert.route_domain, 'tower:scheduled');
  assert.ok(new Date(String(futureRowAfterFirstUpsert.destroy_at)).getTime() > Date.now());
  const futureFenceAfterFirstUpsert = catalogFenceSnapshot(futureRowAfterFirstUpsert);

  await input.instanceCatalogService.upsertInstanceCatalog(futureUpsertInput);
  assert.deepEqual(
    catalogFenceSnapshot(await requireInstanceRow(input.pool, input.futureDestroyInstanceId)),
    futureFenceAfterFirstUpsert,
    'future destroy_at 活动行重复 upsert 应保持幂等',
  );

  const futureRevivalRejected = await input.instanceCatalogService.reviveInstanceLeaseWithFence({
    instanceId: input.futureDestroyInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    expectedCurrentNodeId: null,
    expectedCurrentLeaseToken: null,
    nodeId: input.localNodeId,
    leaseToken: `lease:${input.futureDestroyInstanceId}:invalid-revival`,
    leaseExpireAt: new Date(Date.now() + 180_000),
    expectedOwnershipEpoch: 90,
  });
  assert.deepEqual(futureRevivalRejected, { ok: false, ownershipEpoch: null });
  assert.deepEqual(
    catalogFenceSnapshot(await requireInstanceRow(input.pool, input.futureDestroyInstanceId)),
    futureFenceAfterFirstUpsert,
    'future destroy_at 活动行不得被显式复活并清空计划销毁时间',
  );

  const futureLeaseToken = `lease:${input.futureDestroyInstanceId}:claimed`;
  const futureLease = await input.instanceCatalogService.claimInstanceLease({
    instanceId: input.futureDestroyInstanceId,
    expectedTemplateId: templateId,
    expectedInstanceType: instanceType,
    nodeId: input.localNodeId,
    leaseToken: futureLeaseToken,
    leaseExpireAt: new Date(Date.now() + 180_000),
    expectedOwnershipEpoch: 90,
  });
  assert.deepEqual(futureLease, { ok: true, ownershipEpoch: 91 });
  const futureLeasedRow = await requireInstanceRow(input.pool, input.futureDestroyInstanceId);
  assert.equal(futureLeasedRow.status, 'active');
  assert.equal(futureLeasedRow.runtime_status, 'leased');
  assert.equal(futureLeasedRow.assigned_node_id, input.localNodeId);
  assert.equal(futureLeasedRow.lease_token, futureLeaseToken);
  assert.equal(Number(futureLeasedRow.ownership_epoch), 91);
  assert.ok(new Date(String(futureLeasedRow.destroy_at)).getTime() > Date.now());

  return {
    rejectedTombstoneKinds: tombstones.map((entry) => entry.kind),
    futureDestroyAtIdempotentUpsert: true,
    futureDestroyAtRevivalRejected: true,
    futureDestroyAtLeaseOwnershipEpoch: Number(futureLeasedRow.ownership_epoch),
  };
}

async function insertCatalogUpsertFenceFixture(input: {
  pool: Pool;
  instanceId: string;
  templateId: string;
  instanceType: string;
  status: string;
  runtimeStatus: string;
  assignedNodeId: string | null;
  leaseToken: string | null;
  leaseExpireAt: Date | null;
  ownershipEpoch: number;
  destroyAt: Date | null;
  routeDomain: string;
}): Promise<void> {
  await input.pool.query(
    `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
       instance_id, template_id, instance_type, persistent_policy,
       status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
       ownership_epoch, metadata_version, shard_key, route_domain, destroy_at,
       created_at, last_active_at
     ) VALUES (
       $1, $2, $3, 'long_lived',
       $4, $5, $6, $7, $8,
       $9, $9, $1, $10, $11::timestamptz,
       now(), now()
     )`,
    [
      input.instanceId,
      input.templateId,
      input.instanceType,
      input.status,
      input.runtimeStatus,
      input.assignedNodeId,
      input.leaseToken,
      input.leaseExpireAt,
      input.ownershipEpoch,
      input.routeDomain,
      input.destroyAt,
    ],
  );
}

async function verifyDestroyFenceBeforeRuntimeCleanup(input: {
  pool: Pool;
  worldRuntimeService: any;
  localNodeId: string;
  instanceId: string;
}): Promise<{
  conflictPreservedRuntime: boolean;
  destroyedOwnershipEpoch: number;
}> {
  const template = input.worldRuntimeService.templateRepository.getOrThrow('yunlai_town');
  const monsterSpawns = input.worldRuntimeService.contentTemplateRepository.createRuntimeMonstersForMap(template.id);
  const localLeaseToken = `lease:${input.instanceId}:local`;
  const instance = new MapInstanceRuntime({
    instanceId: input.instanceId,
    template,
    monsterSpawns,
    kind: 'public',
    persistent: true,
    persistentPolicy: 'long_lived',
    createdAt: Date.now(),
    displayName: 'Lease Destroy Fence Smoke',
    linePreset: 'peaceful',
    lineIndex: 94,
    instanceOrigin: 'gm_manual',
    defaultEntry: false,
    supportsPvp: false,
    canDamageTile: true,
    assignedNodeId: input.localNodeId,
    leaseToken: localLeaseToken,
    leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
    ownershipEpoch: 3,
    runtimeStatus: 'leased',
    status: 'active',
    destroyAt: new Date(Date.now() - 1_000).toISOString(),
  });
  input.worldRuntimeService.worldRuntimeInstanceStateService.setInstanceRuntime(input.instanceId, instance);
  input.worldRuntimeService.worldRuntimeTickProgressService.initializeInstance(input.instanceId);
  await input.pool.query(
    `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
       instance_id, template_id, instance_type, persistent_policy,
       status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
       ownership_epoch, metadata_version, shard_key, route_domain, destroy_at, created_at, last_active_at
     ) VALUES (
       $1, 'yunlai_town', 'public', 'long_lived',
       'active', 'leased', 'node:remote', 'lease:remote', now() + interval '60 second',
       4, 4, $1, 'peaceful', now() - interval '1 second', now(), now()
     )`,
    [input.instanceId],
  );

  const rejected = await destroyManagedInstance(input.worldRuntimeService, input.instanceId, 'lease_destroy_smoke');
  assert.deepEqual(rejected, { ok: false, reason: 'instance_catalog_fence_failed' });
  assert.equal(input.worldRuntimeService.getInstanceRuntime(input.instanceId), instance);
  assert.equal(instance.meta.status, 'active');
  assert.equal(instance.meta.leaseToken, localLeaseToken);
  const retainedRow = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(retainedRow?.assigned_node_id, 'node:remote');
  assert.equal(retainedRow?.status, 'active');
  assert.equal(Number(retainedRow?.ownership_epoch), 4);

  await input.pool.query(
    `UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = $2,
            lease_token = $3,
            lease_expire_at = now() + interval '60 second',
            ownership_epoch = 4,
            metadata_version = GREATEST(metadata_version, 4)
      WHERE instance_id = $1`,
    [input.instanceId, input.localNodeId, localLeaseToken],
  );
  instance.meta.ownershipEpoch = 4;
  const destroyed = await destroyManagedInstance(input.worldRuntimeService, input.instanceId, 'lease_destroy_smoke');
  assert.deepEqual(destroyed, { ok: true });
  assert.equal(input.worldRuntimeService.getInstanceRuntime(input.instanceId), null);
  const destroyedRow = await fetchInstanceRow(input.pool, input.instanceId);
  assert.equal(destroyedRow?.status, 'destroyed');
  assert.equal(destroyedRow?.runtime_status, 'stopped');
  assert.equal(destroyedRow?.assigned_node_id, null);
  assert.equal(destroyedRow?.lease_token, null);
  assert.equal(Number(destroyedRow?.ownership_epoch), 5);
  assert.ok(Number(destroyedRow?.metadata_version) >= 5);

  return {
    conflictPreservedRuntime: true,
    destroyedOwnershipEpoch: Number(destroyedRow?.ownership_epoch),
  };
}

async function verifyUnassignedCatalogDestroyRejected(input: {
  pool: Pool;
  instanceCatalogService: InstanceCatalogService;
  instanceId: string;
}): Promise<true> {
  await insertCatalogUpsertFenceFixture({
    pool: input.pool,
    instanceId: input.instanceId,
    templateId: 'yunlai_town',
    instanceType: 'public',
    status: 'active',
    runtimeStatus: 'running',
    assignedNodeId: null,
    leaseToken: null,
    leaseExpireAt: null,
    ownershipEpoch: 8,
    destroyAt: null,
    routeDomain: 'peaceful',
  });
  const destroyed = await input.instanceCatalogService.destroyInstanceCatalogWithFence({
    instanceId: input.instanceId,
    assignedNodeId: null,
    leaseToken: null,
    expectedOwnershipEpoch: 8,
  });
  assert.equal(destroyed.ok, false, '未持有有效 lease 的 runtime 不得销毁活动 catalog 行');
  const row = await requireInstanceRow(input.pool, input.instanceId);
  assert.equal(row.status, 'active');
  assert.equal(row.runtime_status, 'running');
  assert.equal(Number(row.ownership_epoch), 8);
  return true;
}

async function verifyDestroyConcurrencyFences(input: {
  pool: Pool;
  worldRuntimeService: any;
  instanceCatalogService: InstanceCatalogService;
  localNodeId: string;
  awaitRaceInstanceId: string;
  replacementInstanceId: string;
  latePlayerInstanceId: string;
}): Promise<{
  attachBlockedBeforeCatalogCas: boolean;
  expiredLeaseCasRejected: boolean;
  replacementPreservedAndCompensated: boolean;
  latePlayerPreservedAndCompensated: boolean;
}> {
  const runtimeInstanceIds = [
    input.awaitRaceInstanceId,
    input.replacementInstanceId,
    input.latePlayerInstanceId,
  ];
  try {
    const awaitRaceToken = `lease:${input.awaitRaceInstanceId}:local`;
    const awaitRaceInstance = createDestroyConcurrencyRuntime({
      worldRuntimeService: input.worldRuntimeService,
      instanceId: input.awaitRaceInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: awaitRaceToken,
      ownershipEpoch: 120,
      lineIndex: 120,
    });
    await insertDestroyConcurrencyCatalogFixture({
      pool: input.pool,
      instanceId: input.awaitRaceInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: awaitRaceToken,
      ownershipEpoch: 120,
    });
    mountDestroyConcurrencyRuntime(input.worldRuntimeService, input.awaitRaceInstanceId, awaitRaceInstance);
    const awaitRaceRenewGate = installDelayedRenewCatalogLease(input.instanceCatalogService);
    const awaitRaceGate = installDelayedDestroyCatalogCas(
      input.instanceCatalogService,
      async () => {
        const expiredAt = new Date(Date.now() - 1_000);
        awaitRaceInstance.meta.leaseExpireAt = expiredAt.toISOString();
        await input.pool.query(
          `UPDATE ${INSTANCE_CATALOG_TABLE}
              SET lease_expire_at = $2
            WHERE instance_id = $1`,
          [input.awaitRaceInstanceId, expiredAt],
        );
      },
    );
    let awaitRaceResult;
    try {
      const syncPromise = syncInstanceLease(input.worldRuntimeService, input.awaitRaceInstanceId);
      await awaitRaceRenewGate.entered;
      const destroyingPromise = destroyManagedInstance(
        input.worldRuntimeService,
        input.awaitRaceInstanceId,
        'destroy_await_race_smoke',
      );
      await awaitRaceGate.entered;
      assert.equal(awaitRaceInstance.meta.runtimeStatus, 'destroying');
      awaitRaceRenewGate.release();
      await syncPromise;
      assert.equal(awaitRaceInstance.meta.runtimeStatus, 'destroying', '迟到的 lease sync 不得重开销毁中 runtime');
      assert.equal(isInstanceLeaseWritable(input.worldRuntimeService, awaitRaceInstance), false);
      assert.throws(
        () => awaitRaceInstance.connectPlayer({
          playerId: 'player:destroy-await-race',
          sessionId: 'session:destroy-await-race',
        }),
        /禁止玩家接入：destroying/,
      );
      awaitRaceGate.release();
      awaitRaceResult = await destroyingPromise;
    } finally {
      awaitRaceRenewGate.release();
      awaitRaceRenewGate.restore();
      awaitRaceGate.release();
      awaitRaceGate.restore();
    }
    assert.deepEqual(awaitRaceResult, { ok: false, reason: 'instance_catalog_fence_failed' });
    assert.equal(input.worldRuntimeService.getInstanceRuntime(input.awaitRaceInstanceId), awaitRaceInstance);
    assert.equal(awaitRaceInstance.meta.runtimeStatus, 'leased');
    assert.equal(awaitRaceInstance.meta.status, 'active');
    assert.equal(isInstanceLeaseWritable(input.worldRuntimeService, awaitRaceInstance), false);
    assert.throws(
      () => awaitRaceInstance.connectPlayer({
        playerId: 'player:expired-after-destroy',
        sessionId: 'session:expired-after-destroy',
      }),
      /租约已过期/,
    );
    const awaitRaceRow = await requireInstanceRow(input.pool, input.awaitRaceInstanceId);
    assert.equal(awaitRaceRow.status, 'active');
    assert.equal(awaitRaceRow.runtime_status, 'leased');
    assert.equal(awaitRaceRow.assigned_node_id, input.localNodeId);
    assert.equal(awaitRaceRow.lease_token, awaitRaceToken);
    assert.equal(Number(awaitRaceRow.ownership_epoch), 120);

    const replacementToken = `lease:${input.replacementInstanceId}:original`;
    const replacementOriginal = createDestroyConcurrencyRuntime({
      worldRuntimeService: input.worldRuntimeService,
      instanceId: input.replacementInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: replacementToken,
      ownershipEpoch: 130,
      lineIndex: 130,
    });
    await insertDestroyConcurrencyCatalogFixture({
      pool: input.pool,
      instanceId: input.replacementInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: replacementToken,
      ownershipEpoch: 130,
    });
    mountDestroyConcurrencyRuntime(input.worldRuntimeService, input.replacementInstanceId, replacementOriginal);
    const replacementGate = installDelayedDestroyCatalogCas(input.instanceCatalogService);
    let replacementResult;
    let replacement;
    try {
      const destroyingPromise = destroyManagedInstance(
        input.worldRuntimeService,
        input.replacementInstanceId,
        'destroy_replacement_smoke',
      );
      await replacementGate.entered;
      assert.equal(replacementOriginal.meta.runtimeStatus, 'destroying');
      replacement = createDestroyConcurrencyRuntime({
        worldRuntimeService: input.worldRuntimeService,
        instanceId: input.replacementInstanceId,
        localNodeId: input.localNodeId,
        leaseToken: `lease:${input.replacementInstanceId}:replacement-stale`,
        ownershipEpoch: 130,
        lineIndex: 131,
      });
      mountDestroyConcurrencyRuntime(input.worldRuntimeService, input.replacementInstanceId, replacement);
      replacementGate.release();
      replacementResult = await destroyingPromise;
    } finally {
      replacementGate.release();
      replacementGate.restore();
    }
    assert.equal(replacementResult?.ok, false);
    assert.equal(replacementResult?.reason, 'instance_replaced_after_catalog_fence');
    assert.equal(replacementResult?.compensated, true);
    assert.equal(input.worldRuntimeService.getInstanceRuntime(input.replacementInstanceId), replacement);
    assert.equal(replacement?.meta.runtimeStatus, 'leased');
    assert.equal(replacement?.meta.status, 'active');
    assert.equal(Number(replacement?.meta.ownershipEpoch), 132);
    assert.notEqual(replacement?.meta.leaseToken, replacementToken);
    const replacementRow = await requireInstanceRow(input.pool, input.replacementInstanceId);
    assert.equal(replacementRow.status, 'active');
    assert.equal(replacementRow.runtime_status, 'leased');
    assert.equal(replacementRow.assigned_node_id, input.localNodeId);
    assert.equal(replacementRow.lease_token, replacement?.meta.leaseToken);
    assert.equal(Number(replacementRow.ownership_epoch), 132);
    assert.equal(replacementRow.destroy_at, null);

    const latePlayerToken = `lease:${input.latePlayerInstanceId}:original`;
    const latePlayerInstance = createDestroyConcurrencyRuntime({
      worldRuntimeService: input.worldRuntimeService,
      instanceId: input.latePlayerInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: latePlayerToken,
      ownershipEpoch: 140,
      lineIndex: 140,
    });
    await insertDestroyConcurrencyCatalogFixture({
      pool: input.pool,
      instanceId: input.latePlayerInstanceId,
      localNodeId: input.localNodeId,
      leaseToken: latePlayerToken,
      ownershipEpoch: 140,
    });
    mountDestroyConcurrencyRuntime(input.worldRuntimeService, input.latePlayerInstanceId, latePlayerInstance);
    const latePlayerGate = installDelayedDestroyCatalogCas(input.instanceCatalogService);
    let latePlayerResult;
    try {
      const destroyingPromise = destroyManagedInstance(
        input.worldRuntimeService,
        input.latePlayerInstanceId,
        'destroy_late_player_smoke',
      );
      await latePlayerGate.entered;
      assert.equal(latePlayerInstance.meta.runtimeStatus, 'destroying');
      latePlayerInstance.playersById.set('player:late-destroy-race', {
        playerId: 'player:late-destroy-race',
      });
      latePlayerGate.release();
      latePlayerResult = await destroyingPromise;
    } finally {
      latePlayerGate.release();
      latePlayerGate.restore();
    }
    assert.equal(latePlayerResult?.ok, false);
    assert.equal(latePlayerResult?.reason, 'players_present_after_catalog_fence');
    assert.equal(latePlayerResult?.compensated, true);
    assert.deepEqual(latePlayerResult?.players, ['player:late-destroy-race']);
    assert.equal(input.worldRuntimeService.getInstanceRuntime(input.latePlayerInstanceId), latePlayerInstance);
    assert.equal(latePlayerInstance.meta.runtimeStatus, 'leased');
    assert.equal(latePlayerInstance.meta.status, 'active');
    assert.equal(Number(latePlayerInstance.meta.ownershipEpoch), 142);
    const latePlayerRow = await requireInstanceRow(input.pool, input.latePlayerInstanceId);
    assert.equal(latePlayerRow.status, 'active');
    assert.equal(latePlayerRow.runtime_status, 'leased');
    assert.equal(latePlayerRow.lease_token, latePlayerInstance.meta.leaseToken);
    assert.equal(Number(latePlayerRow.ownership_epoch), 142);
    assert.equal(latePlayerRow.destroy_at, null);

    return {
      attachBlockedBeforeCatalogCas: true,
      expiredLeaseCasRejected: true,
      replacementPreservedAndCompensated: true,
      latePlayerPreservedAndCompensated: true,
    };
  } finally {
    for (const instanceId of runtimeInstanceIds) {
      cleanupDestroyConcurrencyRuntime(input.worldRuntimeService, instanceId);
    }
  }
}

function createDestroyConcurrencyRuntime(input: {
  worldRuntimeService: any;
  instanceId: string;
  localNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
  lineIndex: number;
}): MapInstanceRuntime {
  const template = input.worldRuntimeService.templateRepository.getOrThrow('yunlai_town');
  const monsterSpawns = input.worldRuntimeService.contentTemplateRepository.createRuntimeMonstersForMap(template.id);
  return new MapInstanceRuntime({
    instanceId: input.instanceId,
    template,
    monsterSpawns,
    kind: 'public',
    persistent: true,
    persistentPolicy: 'long_lived',
    createdAt: Date.now(),
    displayName: 'Destroy Concurrency Smoke',
    linePreset: 'peaceful',
    lineIndex: input.lineIndex,
    instanceOrigin: 'gm_manual',
    defaultEntry: false,
    supportsPvp: false,
    canDamageTile: true,
    assignedNodeId: input.localNodeId,
    leaseToken: input.leaseToken,
    leaseExpireAt: new Date(Date.now() + 120_000).toISOString(),
    ownershipEpoch: input.ownershipEpoch,
    runtimeStatus: 'leased',
    status: 'active',
    destroyAt: new Date(Date.now() - 1_000).toISOString(),
  });
}

async function insertDestroyConcurrencyCatalogFixture(input: {
  pool: Pool;
  instanceId: string;
  localNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
}): Promise<void> {
  await insertCatalogUpsertFenceFixture({
    pool: input.pool,
    instanceId: input.instanceId,
    templateId: 'yunlai_town',
    instanceType: 'public',
    status: 'active',
    runtimeStatus: 'leased',
    assignedNodeId: input.localNodeId,
    leaseToken: input.leaseToken,
    leaseExpireAt: new Date(Date.now() + 120_000),
    ownershipEpoch: input.ownershipEpoch,
    destroyAt: new Date(Date.now() - 1_000),
    routeDomain: 'peaceful',
  });
}

function mountDestroyConcurrencyRuntime(worldRuntimeService: any, instanceId: string, instance: MapInstanceRuntime): void {
  worldRuntimeService.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, instance);
  worldRuntimeService.worldRuntimeTickProgressService.initializeInstance(instanceId);
}

function cleanupDestroyConcurrencyRuntime(worldRuntimeService: any, instanceId: string): void {
  worldRuntimeService.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
  worldRuntimeService.worldRuntimeTickProgressService.clearInstance(instanceId);
  worldRuntimeService.worldRuntimeLootContainerService.removeInstanceState(instanceId);
  worldRuntimeService.runtimeEventBusService?.discardInstance?.(instanceId);
  worldRuntimeService.worldRuntimeFormationService?.releaseInstance?.(instanceId);
}

function installDelayedDestroyCatalogCas(
  instanceCatalogService: InstanceCatalogService,
  beforeCas: () => Promise<void> = async () => undefined,
): {
  entered: Promise<void>;
  release: () => void;
  restore: () => void;
} {
  const originalDestroy = instanceCatalogService.destroyInstanceCatalogWithFence;
  const entered = createSmokeDeferred();
  const proceed = createSmokeDeferred();
  instanceCatalogService.destroyInstanceCatalogWithFence = async (destroyInput) => {
    entered.resolve();
    await proceed.promise;
    await beforeCas();
    return originalDestroy.call(instanceCatalogService, destroyInput);
  };
  return {
    entered: entered.promise,
    release: proceed.resolve,
    restore: () => {
      instanceCatalogService.destroyInstanceCatalogWithFence = originalDestroy;
    },
  };
}

function installDelayedRenewCatalogLease(instanceCatalogService: InstanceCatalogService): {
  entered: Promise<void>;
  release: () => void;
  restore: () => void;
} {
  const originalRenew = instanceCatalogService.renewInstanceLease;
  const entered = createSmokeDeferred();
  const proceed = createSmokeDeferred();
  instanceCatalogService.renewInstanceLease = async (renewInput) => {
    entered.resolve();
    await proceed.promise;
    return originalRenew.call(instanceCatalogService, renewInput);
  };
  return {
    entered: entered.promise,
    release: proceed.resolve,
    restore: () => {
      instanceCatalogService.renewInstanceLease = originalRenew;
    },
  };
}

function createSmokeDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
  degradedAfterRenewFailure: boolean;
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
  assert.equal(instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(instance.meta.status, 'active');

  return {
    claimedOwnershipEpoch: Math.trunc(Number(instance.meta.ownershipEpoch)),
    degradedAfterRenewFailure: true,
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
        remaining_qi_budget,
        remaining_spirit_stone_budget,
        created_at_ms,
        updated_at_ms,
        updated_at
      )
      VALUES (
        $1, $2, 'player:lease-smoke', NULL, 'spirit_gathering',
        'formation_disk.mortal', 'mortal', 1, 100, 1000,
        1, 1, $1, 1, 1,
        '{}'::jsonb, true, 10000, 10000, 100, 1, 1, now()
      )
      ON CONFLICT (instance_id, formation_instance_id)
      DO UPDATE SET
        remaining_aura_budget = EXCLUDED.remaining_aura_budget,
        remaining_qi_budget = EXCLUDED.remaining_qi_budget,
        remaining_spirit_stone_budget = EXCLUDED.remaining_spirit_stone_budget,
        updated_at = now()
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
