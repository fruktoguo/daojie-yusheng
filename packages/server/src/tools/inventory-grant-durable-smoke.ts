import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import {
  nextPlayerPersistenceVersion,
  PlayerDomainPersistenceService,
} from '../persistence/player-domain-persistence.service';
import { buildSnapshot } from './player-domain-persistence-smoke-support/fixtures';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下 grantInventoryItems 会在同一事务内提交地面来源、player_inventory_item、watermark、outbox、audit，并执行 runtime_owner_id + session_epoch + instance lease fencing',
      excludes: '不证明真实战斗 tick 编排或容器 source 的完整运行态交互',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `invgrant_${now.toString(36)}`;
  const operationId = `op:${playerId}:inventory-grant:1`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const leasedInstanceId = `instance:${playerId}:lease`;
  const leaseToken = `lease:${leasedInstanceId}:4`;
  const flushLedgerVersion = now * 1_000 + 1;
  const sourceMutation = buildGroundSourceMutation(leasedInstanceId, 4, flushLedgerVersion);

  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new DurableOperationService({
    getNodeId() {
      return 'node:inventory-grant-smoke';
    },
  } as never, databasePoolProvider);
  const ledger = new FlushLedgerService(databasePoolProvider);
  const instancePersistence = new InstanceDomainPersistenceService(databasePoolProvider);
  const playerPersistence = new PlayerDomainPersistenceService(null, databasePoolProvider, null);

  try {
    await service.onModuleInit();
    await ledger.onModuleInit();
    await instancePersistence.onModuleInit();
    await playerPersistence.onModuleInit();
    await cleanupPlayer(pool, playerId);
    await seedInventoryGrantFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 9,
      now,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedInstanceId,
      assignedNodeId: 'node:inventory-grant-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 4,
    });
    await seedGroundItemFixture(pool, leasedInstanceId);
    await ledger.upsertInstanceFlushLedger({
      instanceId: leasedInstanceId,
      domain: 'ground_item',
      ownershipEpoch: 4,
      latestVersion: 10,
      priority: 'low',
      fencingToken: 'inventory-grant-smoke-ground-old',
      payloadJson: buildGroundFlushPayload(leasedInstanceId, 10, true),
    });
    const oldGroundClaims = await ledger.claimInstanceFlushLedger({
      workerId: 'inventory-grant-smoke-ground-old-worker',
      id: leasedInstanceId,
      domain: 'ground_item',
      ownershipEpoch: 4,
      limit: 1,
      payloadRequired: true,
    });
    const oldGroundClaim = oldGroundClaims[0];
    if (!oldGroundClaim?.claimed_by) {
      throw new Error('expected old ground payload claim before durable transfer');
    }

    let rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-owner`,
        playerId,
        expectedRuntimeOwnerId: `${runtimeOwnerId}:stale`,
        expectedSessionEpoch: 9,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedLeaseToken: leaseToken,
        expectedOwnershipEpoch: 4,
        sourceType: 'ground_take',
        sourceRefId: 'g:12:rat_tail',
        inventoryAction: 'transfer',
        sourceMutation,
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale owner rejection before inventory grant durable settlement');
    }

    rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-session`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 10,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedLeaseToken: leaseToken,
        expectedOwnershipEpoch: 4,
        sourceType: 'ground_take',
        sourceRefId: 'g:12:rat_tail',
        inventoryAction: 'transfer',
        sourceMutation,
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale session rejection before inventory grant durable settlement');
    }

    rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-lease`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 9,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedLeaseToken: `${leaseToken}:stale`,
        expectedOwnershipEpoch: 4,
        sourceType: 'ground_take',
        sourceRefId: 'g:12:rat_tail',
        inventoryAction: 'transfer',
        sourceMutation,
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale lease rejection before inventory grant durable settlement');
    }

    const rejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    if (
      rejectedInventoryRows.length !== 1
      || rejectedInventoryRows[0]?.item_id !== 'moon_grass'
      || Number(rejectedInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected inventory rows after rejection: ${JSON.stringify(rejectedInventoryRows)}`);
    }
    const rejectedGroundRows = await fetchRows(
      pool,
      'SELECT item_instance_payload FROM instance_ground_item WHERE instance_id = $1 AND tile_index = 12 ORDER BY ground_item_id ASC',
      [leasedInstanceId],
    );
    if (rejectedGroundRows.length !== 2) {
      throw new Error(`ground source changed after rejected grant: ${JSON.stringify(rejectedGroundRows)}`);
    }

    const firstResult = await service.grantInventoryItems({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:inventory-grant-smoke',
      expectedLeaseToken: leaseToken,
      expectedOwnershipEpoch: 4,
      sourceType: 'ground_take',
      sourceRefId: 'g:12:rat_tail',
      inventoryAction: 'transfer',
      sourceMutation,
      grantedItems: buildGrantedInventoryItems(),
      nextInventoryItems: buildNextInventoryItems(),
    });
    if (!firstResult.ok || firstResult.alreadyCommitted || firstResult.grantedCount !== 2) {
      throw new Error(`unexpected inventory grant durable result: ${JSON.stringify(firstResult)}`);
    }

    const lateGroundApplied = await instancePersistence.replaceGroundItemTiles(
      leasedInstanceId,
      [12],
      [{ tileIndex: 12, items: buildOriginalGroundItems(leasedInstanceId) }],
      {
        ownershipEpoch: 4,
        latestVersion: 10,
        claimOwnerId: String(oldGroundClaim.claimed_by),
        fencingToken: typeof oldGroundClaim.fencing_token === 'string' ? oldGroundClaim.fencing_token : null,
      },
    );
    if (lateGroundApplied) {
      throw new Error('stale claimed ground payload applied after durable source transaction');
    }
    if (await countGroundItemsAtTile(pool, leasedInstanceId, 12) !== 1) {
      throw new Error('stale ground payload restored already transferred items');
    }
    if (await countGroundItemsAtTile(pool, leasedInstanceId, 13) !== 0) {
      throw new Error('unrelated cumulative ground payload should remain pending before current worker replay');
    }

    const currentGroundClaims = await ledger.claimInstanceFlushLedger({
      workerId: 'inventory-grant-smoke-ground-current-worker',
      id: leasedInstanceId,
      domain: 'ground_item',
      ownershipEpoch: 4,
      limit: 1,
      payloadRequired: true,
    });
    const currentGroundClaim = currentGroundClaims[0];
    if (!currentGroundClaim?.claimed_by || Number(currentGroundClaim.latest_version) !== flushLedgerVersion) {
      throw new Error(`expected current cumulative ground payload claim: ${JSON.stringify(currentGroundClaim)}`);
    }
    const currentGroundPayload = currentGroundClaim.payload_jsonb as Record<string, unknown> | null;
    const currentGroundDelta = currentGroundPayload?.payload as Record<string, unknown> | null;
    const currentGroundApplied = await instancePersistence.replaceGroundItemTiles(
      leasedInstanceId,
      Array.isArray(currentGroundDelta?.tileIndices) ? currentGroundDelta.tileIndices.map(Number) : [],
      Array.isArray(currentGroundDelta?.entries)
        ? currentGroundDelta.entries as Array<{ tileIndex: number; items: unknown[] }>
        : [],
      {
        ownershipEpoch: 4,
        latestVersion: flushLedgerVersion,
        claimOwnerId: String(currentGroundClaim.claimed_by),
        fencingToken: typeof currentGroundClaim.fencing_token === 'string' ? currentGroundClaim.fencing_token : null,
      },
    );
    if (!currentGroundApplied || await countGroundItemsAtTile(pool, leasedInstanceId, 13) !== 1) {
      throw new Error('current cumulative ground payload did not replay unrelated dirty tile');
    }
    const groundMarkedFlushed = await ledger.markInstanceFlushLedgerFlushed({
      instanceId: leasedInstanceId,
      domain: 'ground_item',
      ownershipEpoch: 4,
      flushedVersion: flushLedgerVersion,
      claimOwnerId: String(currentGroundClaim.claimed_by),
      fencingToken: typeof currentGroundClaim.fencing_token === 'string' ? currentGroundClaim.fencing_token : null,
    });
    if (!groundMarkedFlushed) {
      throw new Error('current ground payload could not acknowledge flush ledger');
    }

    const replayResult = await service.grantInventoryItems({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:inventory-grant-smoke',
      expectedLeaseToken: leaseToken,
      expectedOwnershipEpoch: 4,
      sourceType: 'ground_take',
      sourceRefId: 'g:12:rat_tail',
      inventoryAction: 'transfer',
      sourceMutation,
      grantedItems: buildGrantedInventoryItems(),
      nextInventoryItems: buildNextInventoryItems(),
    });
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`unexpected inventory grant replay result: ${JSON.stringify(replayResult)}`);
    }

    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count, raw_payload FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const operationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [operationId],
    );
    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [operationId],
    );
    const auditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [operationId],
    );
    const watermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const groundRows = await fetchRows(
      pool,
      'SELECT item_instance_payload FROM instance_ground_item WHERE instance_id = $1 AND tile_index = 12 ORDER BY ground_item_id ASC',
      [leasedInstanceId],
    );

    if (
      inventoryRows.length !== 2
      || inventoryRows[0]?.item_id !== 'moon_grass'
      || Number(inventoryRows[0]?.count) !== 1
      || inventoryRows[1]?.item_id !== 'rat_tail'
      || Number(inventoryRows[1]?.count) !== 2
      || JSON.stringify(inventoryRows[0]?.raw_payload ?? null) !== '{}'
      || JSON.stringify(inventoryRows[1]?.raw_payload ?? null) !== '{}'
    ) {
      throw new Error(`unexpected granted inventory rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (
      groundRows.length !== 1
      || groundRows[0]?.item_instance_payload?.itemId !== 'wolf_fang'
      || Number(groundRows[0]?.item_instance_payload?.count) !== 1
    ) {
      throw new Error(`unexpected ground source rows after transfer: ${JSON.stringify(groundRows)}`);
    }
    if (!operationRow || operationRow.status !== 'committed' || !operationRow.committed_at) {
      throw new Error(`unexpected durable operation row: ${JSON.stringify(operationRow)}`);
    }
    if (
      outboxRows.length !== 1
      || outboxRows[0]?.topic !== 'player.inventory.transferred'
      || outboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected outbox rows: ${JSON.stringify(outboxRows)}`);
    }
    if (
      auditRows.length !== 1
      || auditRows[0]?.asset_type !== 'inventory'
      || auditRows[0]?.action !== 'transfer'
    ) {
      throw new Error(`unexpected audit rows: ${JSON.stringify(auditRows)}`);
    }
    if (!watermarkRow || Number(watermarkRow.inventory_version) <= 0) {
      throw new Error(`unexpected watermark row: ${JSON.stringify(watermarkRow)}`);
    }

    const staleFlushFence = await verifyDurableVersionGeneratedAfterPlayerLock({
      pool,
      service,
      playerPersistence,
      playerId,
      runtimeOwnerId,
      instanceId: leasedInstanceId,
      assignedNodeId: 'node:inventory-grant-smoke',
      ownershipEpoch: 4,
    });

    const containerResults = await verifyContainerSourceLedgerFence({
      pool,
      service,
      ledger,
      instancePersistence,
      playerId,
      instanceId: leasedInstanceId,
      runtimeOwnerId,
      assignedNodeId: 'node:inventory-grant-smoke',
      leaseToken,
      ownershipEpoch: 4,
      flushLedgerVersion: flushLedgerVersion + 1,
    });

    console.log(JSON.stringify({
      ok: true,
      case: 'inventory-grant-durable',
      answers: 'with-db 下 grantInventoryItems 已验证 runtime_owner_id + session_epoch + 精确 instance lease fencing、幂等回放和拒绝不污染真源；地面/容器来源与背包、watermark、outbox、audit 同事务提交；durable 版本在玩家锁后生成，等待锁期间已排队的旧运行态快照无法在提交后反向覆盖背包；已认领旧 payload 在事务后无法恢复旧来源，新累计 payload 可继续刷入其他脏地块和容器。',
      excludes: '不证明真实网络断线时 COMMIT 回包丢失或多节点同时续租；运行态锁与不确定回包收敛由对应 facade smoke 覆盖。',
      completionMapping: 'release:proof:with-db.inventory-grant-durable',
      firstResult,
      replayResult,
      staleFlushFence,
      containerResults,
    }, null, 2));
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await playerPersistence.onModuleDestroy().catch(() => undefined);
    await instancePersistence.onModuleDestroy().catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function verifyDurableVersionGeneratedAfterPlayerLock(input: {
  pool: Pool;
  service: DurableOperationService;
  playerPersistence: PlayerDomainPersistenceService;
  playerId: string;
  runtimeOwnerId: string;
  instanceId: string;
  assignedNodeId: string;
  ownershipEpoch: number;
}): Promise<{ staleProjectionVersion: number; committedWatermarkVersion: number }> {
  const blocker = await input.pool.connect();
  const operationId = `op:${input.playerId}:version-fence`;
  const committedItemInstanceId = '00000000-0000-4000-8000-000000000041';
  const staleItemInstanceId = '00000000-0000-4000-8000-000000000042';
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
      [7101, input.playerId],
    );

    const durablePromise = input.service.grantInventoryItems({
      operationId,
      playerId: input.playerId,
      expectedRuntimeOwnerId: input.runtimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: input.instanceId,
      expectedAssignedNodeId: input.assignedNodeId,
      expectedOwnershipEpoch: input.ownershipEpoch,
      sourceType: 'version_fence_smoke',
      sourceRefId: committedItemInstanceId,
      inventoryAction: 'grant',
      grantedItems: [{
        itemId: 'current_after_durable_lock',
        count: 1,
        itemInstanceId: committedItemInstanceId,
        rawPayload: {},
      }],
      nextInventoryItems: [{
        itemId: 'current_after_durable_lock',
        count: 1,
        itemInstanceId: committedItemInstanceId,
        rawPayload: {},
      }],
    });

    // 模拟 durable 等待玩家锁期间，普通 flush 已经为旧运行态快照分配了版本。
    const staleProjectionVersion = nextPlayerPersistenceVersion(Date.now() + 60_000);
    await blocker.query('COMMIT');
    await durablePromise;

    const staleSnapshot = buildSnapshot(staleProjectionVersion);
    staleSnapshot.inventory = {
      revision: 99,
      capacity: 20,
      items: [{
        itemId: 'stale_runtime_snapshot',
        count: 1,
        itemInstanceId: staleItemInstanceId,
      }],
      lockedItems: [],
    };
    await input.playerPersistence.savePlayerSnapshotProjectionDomains(
      input.playerId,
      staleSnapshot,
      ['inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: input.runtimeOwnerId,
        expectedSessionEpoch: 9,
        expectedProjectionVersion: staleProjectionVersion,
      },
    );

    const inventoryRows = await fetchRows(
      input.pool,
      'SELECT item_id, item_instance_id FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [input.playerId],
    );
    const watermark = await fetchSingleRow(
      input.pool,
      'SELECT inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [input.playerId],
    );
    const committedWatermarkVersion = Number(watermark?.inventory_version ?? 0);
    if (
      inventoryRows.length !== 1
      || inventoryRows[0]?.item_id !== 'current_after_durable_lock'
      || committedWatermarkVersion <= staleProjectionVersion
    ) {
      throw new Error(
        `stale player projection overwrote durable inventory after lock wait: inventory=${JSON.stringify(inventoryRows)}`
        + ` watermark=${JSON.stringify(watermark)} staleVersion=${staleProjectionVersion}`,
      );
    }
    return { staleProjectionVersion, committedWatermarkVersion };
  } finally {
    await blocker.query('ROLLBACK').catch(() => undefined);
    blocker.release();
  }
}

async function verifyContainerSourceLedgerFence(input: {
  pool: Pool;
  service: DurableOperationService;
  ledger: FlushLedgerService;
  instancePersistence: InstanceDomainPersistenceService;
  playerId: string;
  instanceId: string;
  runtimeOwnerId: string;
  assignedNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
  flushLedgerVersion: number;
}) {
  const operationId = `op:${input.playerId}:container-transfer:1`;
  const sourceState = buildContainerState(input.instanceId, 'loot', [
    { itemId: 'rat_tail', count: 2 },
    { itemId: 'wolf_fang', count: 1 },
  ]);
  const nextSourceState = buildContainerState(input.instanceId, 'loot', [
    { itemId: 'wolf_fang', count: 1 },
  ]);
  const unrelatedPendingState = buildContainerState(input.instanceId, 'pending', [
    { itemId: 'moon_grass', count: 3 },
  ]);
  const sourceId = String(sourceState.sourceId);
  const sourceContainerId = String(sourceState.containerId);
  const seeded = await input.instancePersistence.replaceContainerStates(input.instanceId, [sourceState]);
  if (!seeded) {
    throw new Error('failed to seed container source state');
  }
  await input.ledger.upsertInstanceFlushLedger({
    instanceId: input.instanceId,
    domain: 'container_state',
    ownershipEpoch: input.ownershipEpoch,
    latestVersion: 20,
    priority: 'low',
    fencingToken: 'inventory-grant-smoke-container-old',
    payloadJson: buildContainerFlushPayload([sourceState], 20),
  });
  const oldClaims = await input.ledger.claimInstanceFlushLedger({
    workerId: 'inventory-grant-smoke-container-old-worker',
    id: input.instanceId,
    domain: 'container_state',
    ownershipEpoch: input.ownershipEpoch,
    limit: 1,
    payloadRequired: true,
  });
  const oldClaim = oldClaims[0];
  if (!oldClaim?.claimed_by) {
    throw new Error('expected old container payload claim before durable transfer');
  }

  const request = {
    operationId,
    playerId: input.playerId,
    expectedRuntimeOwnerId: input.runtimeOwnerId,
    expectedSessionEpoch: 9,
    expectedInstanceId: input.instanceId,
    expectedAssignedNodeId: input.assignedNodeId,
    expectedLeaseToken: input.leaseToken,
    expectedOwnershipEpoch: input.ownershipEpoch,
    sourceType: 'container_take',
    sourceRefId: `${sourceId}:rat_tail`,
    inventoryAction: 'transfer' as const,
    sourceMutation: {
      kind: 'container_state' as const,
      instanceId: input.instanceId,
      ownershipEpoch: input.ownershipEpoch,
      flushLedgerVersion: input.flushLedgerVersion,
      flushLedgerPayload: buildContainerFlushPayload(
        [nextSourceState, unrelatedPendingState],
        input.flushLedgerVersion,
      ),
      containerId: sourceContainerId,
      sourceId,
      statePayload: nextSourceState,
    },
    grantedItems: [{
      itemId: 'rat_tail',
      count: 2,
      rawPayload: { itemId: 'rat_tail', count: 2 },
    }],
    nextInventoryItems: [
      {
        itemId: 'moon_grass',
        count: 1,
        rawPayload: { itemId: 'moon_grass', count: 1 },
      },
      {
        itemId: 'rat_tail',
        count: 4,
        rawPayload: { itemId: 'rat_tail', count: 4 },
      },
    ],
  };
  const result = await input.service.grantInventoryItems(request);
  if (!result.ok || result.alreadyCommitted || result.grantedCount !== 2) {
    throw new Error(`unexpected container durable result: ${JSON.stringify(result)}`);
  }
  const sourceItemsAfterCommit = await readContainerItemIds(input.pool, input.instanceId, sourceContainerId);
  if (JSON.stringify(sourceItemsAfterCommit) !== JSON.stringify(['wolf_fang'])) {
    throw new Error(`unexpected container source after commit: ${JSON.stringify(sourceItemsAfterCommit)}`);
  }

  const lateApplied = await input.instancePersistence.replaceContainerStates(
    input.instanceId,
    [sourceState],
    {
      ownershipEpoch: input.ownershipEpoch,
      latestVersion: 20,
      claimOwnerId: String(oldClaim.claimed_by),
      fencingToken: typeof oldClaim.fencing_token === 'string' ? oldClaim.fencing_token : null,
    },
  );
  if (lateApplied) {
    throw new Error('stale claimed container payload applied after durable source transaction');
  }
  if (JSON.stringify(await readContainerItemIds(input.pool, input.instanceId, sourceContainerId)) !== JSON.stringify(['wolf_fang'])) {
    throw new Error('stale container payload restored already transferred entries');
  }
  if ((await readContainerItemIds(input.pool, input.instanceId, String(unrelatedPendingState.containerId))).length !== 0) {
    throw new Error('unrelated cumulative container payload should remain pending before current worker replay');
  }

  const currentClaims = await input.ledger.claimInstanceFlushLedger({
    workerId: 'inventory-grant-smoke-container-current-worker',
    id: input.instanceId,
    domain: 'container_state',
    ownershipEpoch: input.ownershipEpoch,
    limit: 1,
    payloadRequired: true,
  });
  const currentClaim = currentClaims[0];
  if (!currentClaim?.claimed_by || Number(currentClaim.latest_version) !== input.flushLedgerVersion) {
    throw new Error(`expected current cumulative container payload claim: ${JSON.stringify(currentClaim)}`);
  }
  const currentPayload = currentClaim.payload_jsonb as Record<string, unknown> | null;
  const currentStates = Array.isArray(currentPayload?.payload)
    ? currentPayload.payload as Array<{ containerId: string; sourceId: string; [key: string]: unknown }>
    : [];
  const currentApplied = await input.instancePersistence.replaceContainerStates(
    input.instanceId,
    currentStates,
    {
      ownershipEpoch: input.ownershipEpoch,
      latestVersion: input.flushLedgerVersion,
      claimOwnerId: String(currentClaim.claimed_by),
      fencingToken: typeof currentClaim.fencing_token === 'string' ? currentClaim.fencing_token : null,
    },
  );
  const unrelatedItems = await readContainerItemIds(
    input.pool,
    input.instanceId,
    String(unrelatedPendingState.containerId),
  );
  if (!currentApplied || JSON.stringify(unrelatedItems) !== JSON.stringify(['moon_grass'])) {
    throw new Error('current cumulative container payload did not replay unrelated dirty container');
  }
  const markedFlushed = await input.ledger.markInstanceFlushLedgerFlushed({
    instanceId: input.instanceId,
    domain: 'container_state',
    ownershipEpoch: input.ownershipEpoch,
    flushedVersion: input.flushLedgerVersion,
    claimOwnerId: String(currentClaim.claimed_by),
    fencingToken: typeof currentClaim.fencing_token === 'string' ? currentClaim.fencing_token : null,
  });
  if (!markedFlushed) {
    throw new Error('current container payload could not acknowledge flush ledger');
  }
  const replayResult = await input.service.grantInventoryItems(request);
  if (!replayResult.ok || !replayResult.alreadyCommitted) {
    throw new Error(`unexpected container durable replay result: ${JSON.stringify(replayResult)}`);
  }
  const ratTailInventory = await fetchSingleRow(
    input.pool,
    "SELECT count FROM player_inventory_item WHERE player_id = $1 AND item_id = 'rat_tail'",
    [input.playerId],
  );
  if (Number(ratTailInventory?.count) !== 4) {
    throw new Error(`container transfer replay changed inventory: ${JSON.stringify(ratTailInventory)}`);
  }
  return { result, replayResult };
}

function buildContainerState(
  instanceId: string,
  suffix: string,
  items: Array<{ itemId: string; count: number }>,
) {
  const containerId = `chest:${suffix}`;
  return {
    containerId,
    sourceId: `container:${instanceId}:${containerId}`,
    generatedAtTick: 30,
    refreshAtTick: 300,
    entries: items.map((item, index) => ({
      item: { ...item },
      createdTick: 30 + index,
      visible: true,
    })),
  };
}

function buildContainerFlushPayload(states: Array<Record<string, unknown>>, revision: number) {
  return {
    kind: 'instance_domain_state',
    domain: 'container_state',
    payload: states,
    revision,
    domainRevisions: { container_state: 2 },
    stagedDomains: ['container_state'],
    stagingGenerationId: `durable-source:container_state:${revision}`,
    containerRevision: 2,
  };
}

function buildGrantedInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildNextInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 1,
      rawPayload: {
        itemId: 'moon_grass',
        count: 1,
      },
    },
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildGroundSourceMutation(instanceId: string, ownershipEpoch: number, flushLedgerVersion: number) {
  const remainingItems = buildRemainingGroundItems(instanceId);
  return {
    kind: 'ground_tile' as const,
    instanceId,
    ownershipEpoch,
    flushLedgerVersion,
    flushLedgerPayload: buildGroundFlushPayload(instanceId, flushLedgerVersion, false),
    tileIndex: 12,
    remainingItems,
  };
}

function buildGroundFlushPayload(instanceId: string, revision: number, includeTransferredItem: boolean) {
  return {
    kind: 'instance_domain_state',
    domain: 'ground_item',
    payload: {
      fullReplace: false,
      tileIndices: [12, 13],
      entries: [
        {
          tileIndex: 12,
          items: includeTransferredItem ? buildOriginalGroundItems(instanceId) : buildRemainingGroundItems(instanceId),
        },
        {
          tileIndex: 13,
          items: [{
            itemId: 'moon_grass',
            count: 3,
            itemInstanceId: `ground:${instanceId}:moon_grass:pending`,
          }],
        },
      ],
    },
    revision,
    domainRevisions: { ground_item: 2 },
    stagedDomains: ['ground_item'],
    stagingGenerationId: `durable-source:ground_item:${revision}`,
  };
}

function buildOriginalGroundItems(instanceId: string) {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      itemInstanceId: `ground:${instanceId}:rat_tail`,
    },
    ...buildRemainingGroundItems(instanceId),
  ];
}

function buildRemainingGroundItems(instanceId: string) {
  return [{
    itemId: 'wolf_fang',
    count: 1,
    itemInstanceId: `ground:${instanceId}:wolf_fang`,
  }];
}

async function seedInventoryGrantFixture(
  pool: Pool,
  input: { playerId: string; runtimeOwnerId: string; sessionEpoch: number; now: number },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, 0, $3, $4, $5::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        input.playerId,
        'moon_grass',
        1,
        JSON.stringify({
          itemId: 'moon_grass',
          count: 1,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedInstanceCatalogFixture(
  pool: Pool,
  input: {
    instanceId: string;
    assignedNodeId: string;
    leaseExpireAt: string;
    ownershipEpoch: number;
  },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO instance_catalog(
        instance_id,
        template_id,
        instance_type,
        persistent_policy,
        status,
        runtime_status,
        assigned_node_id,
        lease_token,
        lease_expire_at,
        ownership_epoch,
        cluster_id,
        shard_key,
        route_domain,
        created_at,
        last_active_at,
        last_persisted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11, $12, $13, now(), now(), now())
      ON CONFLICT (instance_id)
      DO UPDATE SET
        assigned_node_id = EXCLUDED.assigned_node_id,
        lease_token = EXCLUDED.lease_token,
        lease_expire_at = EXCLUDED.lease_expire_at,
        ownership_epoch = EXCLUDED.ownership_epoch,
        status = EXCLUDED.status,
        runtime_status = EXCLUDED.runtime_status,
        last_active_at = now(),
        last_persisted_at = now()
    `,
    [
      input.instanceId,
      'public:yunlai_town',
      'public',
      'persistent',
      'active',
      'running',
      input.assignedNodeId,
      `lease:${input.instanceId}:${input.ownershipEpoch}`,
      input.leaseExpireAt,
      input.ownershipEpoch,
      'default',
      input.instanceId,
      'public',
    ],
  );
}

async function seedGroundItemFixture(pool: Pool, instanceId: string): Promise<void> {
  await pool.query('DELETE FROM instance_ground_item WHERE instance_id = $1', [instanceId]);
  await pool.query(
    `
      INSERT INTO instance_ground_item(
        ground_item_id,
        instance_id,
        tile_index,
        item_instance_payload,
        expire_at,
        updated_at
      )
      VALUES
        ($1, $3, 12, $4::jsonb, NULL, now()),
        ($2, $3, 12, $5::jsonb, NULL, now())
    `,
    [
      `ground:${instanceId}:rat_tail`,
      `ground:${instanceId}:wolf_fang`,
      instanceId,
      JSON.stringify({ itemId: 'rat_tail', count: 2, itemInstanceId: `ground:${instanceId}:rat_tail` }),
      JSON.stringify({ itemId: 'wolf_fang', count: 1, itemInstanceId: `ground:${instanceId}:wolf_fang` }),
    ],
  );
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const instanceId = `instance:${playerId}:lease`;
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_ground_item WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_entry WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_timer WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE shard_key = $1', [instanceId]).catch(() => undefined);
}

async function countGroundItemsAtTile(pool: Pool, instanceId: string, tileIndex: number): Promise<number> {
  const row = await fetchSingleRow(
    pool,
    'SELECT COUNT(*)::int AS count FROM instance_ground_item WHERE instance_id = $1 AND tile_index = $2',
    [instanceId, tileIndex],
  );
  return Number(row?.count ?? 0);
}

async function readContainerItemIds(pool: Pool, instanceId: string, containerId: string): Promise<string[]> {
  const rows = await fetchRows(
    pool,
    `SELECT item_payload
     FROM instance_container_entry
     WHERE instance_id = $1 AND container_id = $2
     ORDER BY entry_index ASC`,
    [instanceId, containerId],
  );
  return rows.map((row) => String(row.item_payload?.itemId ?? ''));
}

async function fetchRows(pool: Pool, sql: string, params: readonly unknown[]) {
  const result = await pool.query(sql, [...params]);
  return Array.isArray(result.rows) ? result.rows : [];
}

async function fetchSingleRow(pool: Pool, sql: string, params: readonly unknown[]) {
  const rows = await fetchRows(pool, sql, params);
  return rows[0] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
