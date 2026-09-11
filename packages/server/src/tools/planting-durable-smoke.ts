import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PLANTED_HERB_DURATION_TICKS, type ItemStack } from '@mud/shared';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService, type GrantInventoryItemsInput } from '../persistence/durable-operation.service';
import type { DurableContainerStateSourceMutation } from '../persistence/loot-source-durable-persistence';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';
import { createPlantingContent, createPlantingInstance } from './planting-smoke-fixtures';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl) throw new Error('种植事务验证需要独立测试数据库');
  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const nodeId = 'node:planting-proof';
  const durable = new DurableOperationService({ getNodeId: () => nodeId } as never, provider);
  const persistence = new InstanceDomainPersistenceService(provider);
  const ledger = new FlushLedgerService(provider);
  const playerId = `plant_${randomUUID()}`;
  const instanceId = `instance:${playerId}`;
  const runtimeOwnerId = `runtime:${playerId}`;
  const leaseToken = `lease:${playerId}`;
  const content = createPlantingContent();
  const seed = content.createItem('seed.moondew_grass', 1) as unknown as ItemStack;
  const itemInstanceId = seed.itemInstanceId;
  const instance = createPlantingInstance(instanceId);
  Object.assign(instance.meta, { ownershipEpoch: 7, assignedNodeId: nodeId, leaseToken });
  const loot = new WorldRuntimeLootContainerService(content, {});
  const definition = content.plantingContent.bySeedItemId.get(seed.itemId)!;
  const container = { ...definition.container, id: `planted_${randomUUID()}`, x: 2, y: 2 };
  const plantedHerb = { ownerPlayerId: playerId, seedItemId: seed.itemId, farmlandBuildingId: 'farmland:proof',
    expiresAtTick: PLANTED_HERB_DURATION_TICKS, container };
  const state = loot.planPlantedHerbState(instance, container, plantedHerb);
  try {
    await durable.onModuleInit();
    await persistence.onModuleInit();
    await ledger.onModuleInit();
    await new InstanceCatalogService(provider).onModuleInit();
    await new PlayerDomainPersistenceService(null, provider, null).onModuleInit();
    await pool.query(`INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch)
      VALUES ($1, true, true, $2, $3, 5)`, [playerId, Date.now(), runtimeOwnerId]);
    await pool.query(`INSERT INTO player_inventory_item(item_instance_id, player_id, slot_index, item_id, count, raw_payload)
      VALUES ($1, $2, 0, $3, 1, $4::jsonb)`, [itemInstanceId, playerId, seed.itemId, JSON.stringify(seed)]);
    await pool.query(`INSERT INTO instance_catalog(instance_id, template_id, instance_type, persistent_policy,
      status, runtime_status, assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
      cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at)
      VALUES ($1, 'planting-proof', 'public', 'persistent', 'active', 'running', $2, $3,
      now() + interval '5 minutes', 7, 'default', $1, 'public', now(), now(), now())`, [instanceId, nodeId, leaseToken]);
    await ledger.upsertInstanceFlushLedger({ instanceId, domain: 'container_state', ownershipEpoch: 7,
      latestVersion: 10, priority: 'low', fencingToken: 'old-planting-claim',
      payloadJson: { kind: 'instance_domain_state', domain: 'container_state', payload: [] } });
    const [claim] = await ledger.claimInstanceFlushLedger({ workerId: 'planting-old-worker', id: instanceId,
      domain: 'container_state', ownershipEpoch: 7, limit: 1, payloadRequired: true });
    assert.ok(claim?.claimed_by);
    const request: GrantInventoryItemsInput = {
      operationId: `plant-seed:${playerId}`, playerId, expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 5, expectedInstanceId: instanceId, expectedAssignedNodeId: nodeId,
      expectedLeaseToken: leaseToken, expectedOwnershipEpoch: 7, sourceType: 'plant_seed_use',
      sourceRefId: itemInstanceId, inventoryAction: 'remove' as const,
      grantedItems: [{ itemId: seed.itemId, itemInstanceId, count: 1, rawPayload: seed }], nextInventoryItems: [],
      sourceMutation: loot.buildDurableContainerSourceMutation(instance, instanceId, state.sourceId, state) as DurableContainerStateSourceMutation,
    };
    await assert.rejects(durable.grantInventoryItems({ ...request, operationId: `${request.operationId}:stale`, expectedLeaseToken: 'stale' }), /instance_lease_fencing_conflict/);
    assert.equal((await persistence.loadContainerStates(instanceId)).length, 0);
    assert.equal((await pool.query('SELECT 1 FROM player_inventory_item WHERE player_id=$1', [playerId])).rowCount, 1);
    assert.equal((await durable.grantInventoryItems(request)).alreadyCommitted, false);
    assert.equal((await pool.query('SELECT 1 FROM player_inventory_item WHERE player_id=$1', [playerId])).rowCount, 0);
    let rows = await persistence.loadContainerStates(instanceId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sourceId, state.sourceId, '组合来源 ID 不能被数据库截断');
    assert.deepEqual((rows[0].statePayload as any).plantedHerb, plantedHerb);
    assert.deepEqual((rows[0].statePayload as any).herbGrowth, state.herbGrowth);
    assert.equal((await durable.grantInventoryItems(request)).alreadyCommitted, true);
    assert.equal(await persistence.replaceContainerStates(instanceId, [], { ownershipEpoch: 7, latestVersion: 10,
      claimOwnerId: String(claim.claimed_by), fencingToken: String(claim.fencing_token) }), false);
    await persistence.replaceContainerStates(instanceId, [{ ...state, herbGrowth: { ...state.herbGrowth, remainingWork: 12.25 } }]);
    rows = await persistence.loadContainerStates(instanceId);
    assert.equal(rows[0].sourceId, state.sourceId, '批量刷盘也必须保留完整来源 ID');
    assert.equal((rows[0].statePayload as any).herbGrowth.remainingWork, 12.25);
    assert.deepEqual((rows[0].statePayload as any).plantedHerb, plantedHerb);
    const restored = createPlantingInstance(instanceId);
    loot.hydrateContainerStates(instanceId, rows.map((row) => row.statePayload), restored);
    assert.equal(restored.getContainerAtTile(2, 2)?.name, '月露草');
    const audits = await pool.query('SELECT asset_type FROM asset_audit_log WHERE player_id=$1', [playerId]);
    assert.deepEqual(audits.rows.map((row) => row.asset_type).sort(), ['inventory', 'planted_herb']);
    await persistence.replaceContainerStates(instanceId, []);
    assert.equal((await persistence.loadContainerStates(instanceId)).length, 0);
    console.log('种植 PostgreSQL 验证通过：最后一枚消耗、同事务造物、lease 回滚、幂等、旧 flush 拒绝、恢复进度与清理。');
  } finally {
    try {
      for (const [table, column, id] of [
        ['outbox_event', 'partition_key', playerId], ['asset_audit_log', 'player_id', playerId],
        ['durable_operation_log', 'player_id', playerId], ['player_inventory_item', 'player_id', playerId],
        ['player_recovery_watermark', 'player_id', playerId], ['player_presence', 'player_id', playerId],
        ['instance_flush_ledger', 'instance_id', instanceId], ['instance_container_entry', 'instance_id', instanceId],
        ['instance_container_timer', 'instance_id', instanceId], ['instance_container_state', 'instance_id', instanceId],
        ['instance_catalog', 'instance_id', instanceId],
      ]) await pool.query(`DELETE FROM ${table} WHERE ${column}=$1`, [id]);
    } finally {
      await durable.onModuleDestroy();
      await provider.onModuleDestroy();
      await pool.end();
    }
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
