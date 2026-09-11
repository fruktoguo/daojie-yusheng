import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl) throw new Error('晶精事务验证需要独立测试数据库');
  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const nodeId = 'node:mineral-crystal-proof';
  const durable = new DurableOperationService({ getNodeId: () => nodeId } as never, provider);
  const persistence = new InstanceDomainPersistenceService(provider);
  const ledger = new FlushLedgerService(provider);
  const playerId = `crystal_${randomUUID()}`;
  const instanceId = `instance:${playerId}`;
  const itemInstanceId = randomUUID();
  const now = Date.now();
  const runtimeOwnerId = `runtime:${playerId}`;
  const leaseToken = `lease:${playerId}`;
  const item = { itemId: 'spirit_vein_crystal', itemInstanceId, count: 1 };
  try {
    await durable.onModuleInit();
    await persistence.onModuleInit();
    await ledger.onModuleInit();
    await new InstanceCatalogService(provider).onModuleInit();
    await new PlayerDomainPersistenceService(null, provider, null).onModuleInit();
    await pool.query(`INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch)
      VALUES ($1, true, true, $2, $3, 5)`, [playerId, now, runtimeOwnerId]);
    await pool.query(`INSERT INTO player_inventory_item(item_instance_id, player_id, slot_index, item_id, count, raw_payload)
      VALUES ($1, $2, 0, $3, 1, $4::jsonb)`, [itemInstanceId, playerId, item.itemId, JSON.stringify(item)]);
    await pool.query(`INSERT INTO instance_catalog(instance_id, template_id, instance_type, persistent_policy,
      status, runtime_status, assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
      cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at)
      VALUES ($1, 'crystal-proof', 'public', 'persistent', 'active', 'running', $2, $3,
      now() + interval '5 minutes', 7, 'default', $1, 'public', now(), now(), now())`, [instanceId, nodeId, leaseToken]);
    await ledger.upsertInstanceFlushLedger({
      instanceId, domain: 'temporary_tile', ownershipEpoch: 7, latestVersion: 10, priority: 'low',
      fencingToken: 'old-crystal-claim', payloadJson: { kind: 'instance_domain_state', domain: 'temporary_tile', payload: [] },
    });
    const [claim] = await ledger.claimInstanceFlushLedger({ workerId: 'crystal-old-worker', id: instanceId,
      domain: 'temporary_tile', ownershipEpoch: 7, limit: 1, payloadRequired: true });
    assert.ok(claim?.claimed_by);
    const request = {
      operationId: `mineral-crystal:${playerId}`, playerId, expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 5, expectedInstanceId: instanceId, expectedAssignedNodeId: nodeId,
      expectedLeaseToken: leaseToken, expectedOwnershipEpoch: 7, sourceType: 'mineral_crystal_use',
      sourceRefId: itemInstanceId, inventoryAction: 'remove' as const,
      grantedItems: [{ ...item, rawPayload: item }], nextInventoryItems: [],
      sourceMutation: { kind: 'mineral_crystal' as const, instanceId, ownershipEpoch: 7,
        flushLedgerVersion: now + 100, createdTileIndex: 20,
        entries: [{ tileIndex: 20, x: 2, y: 2, tileType: 'spirit_ore', hp: 100_000, maxHp: 100_000,
          expiresAtTick: 86_500, ownerPlayerId: playerId, sourceSkillId: null,
          sourceItemId: item.itemId, mineralLevel: 20, createdAt: now, modifiedAt: now }],
      },
    };
    await assert.rejects(durable.grantInventoryItems({ ...request, operationId: `${request.operationId}:stale`, expectedLeaseToken: 'stale' }), /instance_lease_fencing_conflict/);
    assert.equal((await persistence.loadTemporaryTileStates(instanceId)).length, 0);
    assert.equal(Number((await pool.query('SELECT count FROM player_inventory_item WHERE player_id=$1', [playerId])).rows[0].count), 1);
    assert.equal((await durable.grantInventoryItems(request)).alreadyCommitted, false);
    assert.equal((await pool.query('SELECT 1 FROM player_inventory_item WHERE player_id=$1', [playerId])).rowCount, 0, '最后一枚晶精可合法清空背包');
    const rows = await persistence.loadTemporaryTileStates(instanceId);
    assert.deepEqual(rows, request.sourceMutation.entries);
    assert.equal((await durable.grantInventoryItems(request)).alreadyCommitted, true);
    const applied = await persistence.replaceTemporaryTileStates(instanceId, [], {
      ownershipEpoch: 7, latestVersion: 10, claimOwnerId: String(claim.claimed_by), fencingToken: String(claim.fencing_token),
    });
    assert.equal(applied, false, '迟到的旧快照不能清掉已提交的矿脉');
    assert.deepEqual(await persistence.loadTemporaryTileStates(instanceId), rows);
    const damaged = rows.map((entry) => ({ ...entry, hp: 50_000 }));
    await persistence.replaceTemporaryTileStates(instanceId, damaged);
    assert.deepEqual(await persistence.loadTemporaryTileStates(instanceId), damaged, '正常刷盘保留来源、等级和截止 tick');
    const audits = await pool.query('SELECT asset_type FROM asset_audit_log WHERE player_id=$1', [playerId]);
    assert.deepEqual(audits.rows.map((row) => row.asset_type).sort(), ['inventory', 'temporary_tile']);
    await persistence.replaceTemporaryTileStates(instanceId, []);
    assert.equal((await persistence.loadTemporaryTileStates(instanceId)).length, 0);
    console.log('晶精 PostgreSQL 验证通过：最后一枚消耗、矿脉同事务保存、失效 lease 回滚、幂等、旧 flush 拒绝、回读与清理。');
  } finally {
    // 夹具按唯一玩家/实例清理；清理失败必须报告，不能隐藏残留。
    try {
      for (const [table, column, id] of [
        ['outbox_event', 'partition_key', playerId], ['asset_audit_log', 'player_id', playerId],
        ['durable_operation_log', 'player_id', playerId], ['player_inventory_item', 'player_id', playerId],
        ['player_recovery_watermark', 'player_id', playerId], ['player_presence', 'player_id', playerId],
        ['instance_flush_ledger', 'instance_id', instanceId], ['instance_temporary_tile_state', 'instance_id', instanceId],
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
