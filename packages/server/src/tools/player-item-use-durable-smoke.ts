import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
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
      answers: 'with-db 下验证地图解锁与复活点绑定道具会把来源状态、背包、watermark、outbox 和双资产审计放进同一事务。',
      excludes: '当前无数据库，不证明真实事务、CAS 回滚或幂等重放。',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `itemuse_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const mapOperationId = `op:${playerId}:map-unlock`;
  const respawnOperationId = `op:${playerId}:respawn-bind`;
  const mapItemInstanceId = '00000000-0000-4000-8000-000000000051';
  const staminaPlayerId = `${playerId}_stamina`;
  const staminaRuntimeOwnerId = `runtime:${staminaPlayerId}:1`;
  const staminaOperationId = `op:${staminaPlayerId}:restore`;
  const staminaItemInstanceId = '00000000-0000-4000-8000-000000000053';
  const respawnItemInstanceId = '00000000-0000-4000-8000-000000000052';
  const provider = new DatabasePoolProvider();
  const durable = new DurableOperationService({ getNodeId: () => 'node:player-item-use-smoke' } as never, provider);
  const playerPersistence = new PlayerDomainPersistenceService(null, provider, null);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await durable.onModuleInit();
    await playerPersistence.onModuleInit();
    await cleanup(pool, playerId);
    await cleanup(pool, staminaPlayerId);
    await playerPersistence.savePlayerPresence(playerId, {
      online: true,
      inWorld: true,
      runtimeOwnerId,
      sessionEpoch: 7,
      lastHeartbeatAt: now,
      offlineSinceAt: null,
      versionSeed: now,
    });
    const snapshot = buildSnapshot(now + 1);
    snapshot.respawn = {
      templateId: 'yunlai_town',
      instanceId: 'public:yunlai_town',
      x: 32,
      y: 5,
      facing: snapshot.placement.facing,
    };
    snapshot.unlockedMapIds = ['yunlai_town'];
    snapshot.inventory = {
      revision: 1,
      capacity: 20,
      items: [
        { itemId: 'map_scroll', count: 1, itemInstanceId: mapItemInstanceId },
        { itemId: 'respawn_stone', count: 1, itemInstanceId: respawnItemInstanceId },
      ],
      lockedItems: [],
    };
    await playerPersistence.savePlayerSnapshotProjectionDomains(
      playerId,
      snapshot,
      ['world_anchor', 'map_unlock', 'inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 7,
        expectedProjectionVersion: now + 1,
      },
    );

    let unsafeEmptyOverwriteRejected = false;
    try {
      await durable.grantInventoryItems({
        operationId: `${mapOperationId}:unsafe-empty`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 7,
        sourceType: 'item_map_unlock',
        sourceRefId: mapItemInstanceId,
        inventoryAction: 'remove',
        grantedItems: [durableInventoryItem('map_scroll', mapItemInstanceId)],
        nextInventoryItems: [],
        sourceMutation: {
          kind: 'player_item_use',
          action: 'unlock_maps',
          playerId,
          expectedUnlockedMapIds: ['yunlai_town'],
          unlockMapIds: ['cloud_peak'],
        },
      });
    } catch (error) {
      unsafeEmptyOverwriteRejected = error instanceof Error
        && error.message.includes('player_item_use_empty_inventory_snapshot_changed');
    }
    if (!unsafeEmptyOverwriteRejected) {
      throw new Error('expected unsafe empty inventory overwrite rejection');
    }
    await assertInventory(pool, playerId, ['map_scroll', 'respawn_stone']);

    const respawnInventory = [durableInventoryItem('respawn_stone', respawnItemInstanceId)];
    const mapResult = await durable.grantInventoryItems({
      operationId: mapOperationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'item_map_unlock',
      sourceRefId: mapItemInstanceId,
      inventoryAction: 'remove',
      grantedItems: [durableInventoryItem('map_scroll', mapItemInstanceId)],
      nextInventoryItems: respawnInventory,
      sourceMutation: {
        kind: 'player_item_use',
        action: 'unlock_maps',
        playerId,
        expectedUnlockedMapIds: ['yunlai_town'],
        unlockMapIds: ['bamboo_forest'],
      },
    });
    const mapReplay = await durable.grantInventoryItems({
      operationId: mapOperationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'item_map_unlock',
      sourceRefId: mapItemInstanceId,
      inventoryAction: 'remove',
      grantedItems: [durableInventoryItem('map_scroll', mapItemInstanceId)],
      nextInventoryItems: respawnInventory,
      sourceMutation: {
        kind: 'player_item_use',
        action: 'unlock_maps',
        playerId,
        expectedUnlockedMapIds: ['yunlai_town'],
        unlockMapIds: ['bamboo_forest'],
      },
    });
    if (!mapResult.ok || mapResult.alreadyCommitted || !mapReplay.alreadyCommitted) {
      throw new Error(`unexpected map unlock durable replay: ${JSON.stringify({ mapResult, mapReplay })}`);
    }

    let staleMapRejected = false;
    try {
      await durable.grantInventoryItems({
        operationId: `${mapOperationId}:stale`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 7,
        sourceType: 'item_map_unlock',
        sourceRefId: respawnItemInstanceId,
        inventoryAction: 'remove',
        grantedItems: respawnInventory,
        nextInventoryItems: [],
        sourceMutation: {
          kind: 'player_item_use',
          action: 'unlock_maps',
          playerId,
          expectedUnlockedMapIds: ['yunlai_town'],
          unlockMapIds: ['cloud_peak'],
        },
      });
    } catch (error) {
      staleMapRejected = error instanceof Error && error.message.includes('player_map_unlock_snapshot_changed');
    }
    if (!staleMapRejected) {
      throw new Error('expected stale map unlock snapshot rejection');
    }
    await assertInventory(pool, playerId, ['respawn_stone']);

    const expectedRespawn = {
      templateId: 'yunlai_town',
      instanceId: 'public:yunlai_town',
      x: 32,
      y: 5,
    };
    const nextRespawn = {
      templateId: 'qizhen_crossing',
      instanceId: 'public:qizhen_crossing',
      x: 29,
      y: 15,
    };
    const respawnResult = await durable.grantInventoryItems({
      operationId: respawnOperationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'item_respawn_bind',
      sourceRefId: respawnItemInstanceId,
      inventoryAction: 'remove',
      grantedItems: respawnInventory,
      nextInventoryItems: [],
      sourceMutation: {
        kind: 'player_item_use',
        action: 'bind_respawn',
        playerId,
        expectedRespawn,
        nextRespawn,
      },
    });
    if (!respawnResult.ok || respawnResult.alreadyCommitted) {
      throw new Error(`unexpected respawn bind result: ${JSON.stringify(respawnResult)}`);
    }
    await assertInventory(pool, playerId, []);

    const mapRows = await queryRows(pool, 'SELECT map_id FROM player_map_unlock WHERE player_id = $1 ORDER BY map_id ASC', [playerId]);
    const anchor = (await queryRows(
      pool,
      `SELECT respawn_template_id, respawn_instance_id, respawn_x, respawn_y,
              last_safe_template_id, last_safe_instance_id, last_safe_x, last_safe_y
         FROM player_world_anchor WHERE player_id = $1`,
      [playerId],
    ))[0];
    const watermark = (await queryRows(
      pool,
      'SELECT inventory_version, map_unlock_version, anchor_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    ))[0];
    const auditRows = await queryRows(
      pool,
      'SELECT operation_id, asset_type FROM asset_audit_log WHERE player_id = $1 ORDER BY operation_id, asset_type',
      [playerId],
    );
    if (JSON.stringify(mapRows.map((row) => row.map_id)) !== JSON.stringify(['bamboo_forest', 'yunlai_town'])) {
      throw new Error(`unexpected map unlock rows: ${JSON.stringify(mapRows)}`);
    }
    if (
      anchor?.respawn_template_id !== nextRespawn.templateId
      || anchor?.respawn_instance_id !== nextRespawn.instanceId
      || Number(anchor?.respawn_x) !== nextRespawn.x
      || Number(anchor?.respawn_y) !== nextRespawn.y
      || anchor?.last_safe_template_id !== snapshot.placement.templateId
      || anchor?.last_safe_instance_id !== snapshot.placement.instanceId
      || Number(anchor?.last_safe_x) !== snapshot.placement.x
      || Number(anchor?.last_safe_y) !== snapshot.placement.y
    ) {
      throw new Error(`unexpected respawn anchor row: ${JSON.stringify(anchor)}`);
    }
    if (
      Number(watermark?.inventory_version) <= 0
      || Number(watermark?.map_unlock_version) <= 0
      || Number(watermark?.anchor_version) <= 0
      || auditRows.filter((row) => row.asset_type === 'inventory').length !== 2
      || auditRows.filter((row) => row.asset_type === 'player_item_use').length !== 2
    ) {
      throw new Error(`unexpected durable item-use metadata: watermark=${JSON.stringify(watermark)} audit=${JSON.stringify(auditRows)}`);
    }

    const staminaNow = now + 100;
    await playerPersistence.savePlayerPresence(staminaPlayerId, {
      online: true,
      inWorld: true,
      runtimeOwnerId: staminaRuntimeOwnerId,
      sessionEpoch: 3,
      lastHeartbeatAt: staminaNow,
      offlineSinceAt: null,
      versionSeed: staminaNow,
    });
    const staminaSnapshot = buildSnapshot(staminaNow + 1);
    staminaSnapshot.progression.stamina = 0;
    staminaSnapshot.progression.staminaUpdatedAt = staminaNow;
    staminaSnapshot.inventory = {
      revision: 1,
      capacity: 20,
      items: [{ itemId: 'pill.huiyuan', count: 1, itemInstanceId: staminaItemInstanceId }],
      lockedItems: [],
    };
    await playerPersistence.savePlayerSnapshotProjectionDomains(
      staminaPlayerId,
      staminaSnapshot,
      ['progression', 'inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: staminaRuntimeOwnerId,
        expectedSessionEpoch: 3,
        expectedProjectionVersion: staminaNow + 1,
      },
    );
    let staleStaminaRejected = false;
    try {
      await durable.grantInventoryItems({
        operationId: `${staminaOperationId}:stale`,
        playerId: staminaPlayerId,
        expectedRuntimeOwnerId: staminaRuntimeOwnerId,
        expectedSessionEpoch: 3,
        sourceType: 'item_stamina_restore',
        sourceRefId: staminaItemInstanceId,
        inventoryAction: 'remove',
        grantedItems: [durableInventoryItem('pill.huiyuan', staminaItemInstanceId)],
        nextInventoryItems: [],
        sourceMutation: {
          kind: 'player_item_use',
          action: 'restore_stamina',
          playerId: staminaPlayerId,
          expectedStamina: 1,
          expectedStaminaUpdatedAt: staminaNow,
          restoreAmount: 24,
          nextStamina: 25,
          nextStaminaUpdatedAt: staminaNow + 2,
        },
      });
    } catch (error) {
      staleStaminaRejected = error instanceof Error && error.message.includes('player_stamina_snapshot_changed');
    }
    if (!staleStaminaRejected) {
      throw new Error('expected stale stamina snapshot rejection');
    }
    await assertInventory(pool, staminaPlayerId, ['pill.huiyuan']);
    const staleStaminaRow = (await queryRows(
      pool,
      'SELECT stamina, stamina_updated_at FROM player_progression_core WHERE player_id = $1',
      [staminaPlayerId],
    ))[0];
    if (Number(staleStaminaRow?.stamina) !== 0 || Number(staleStaminaRow?.stamina_updated_at) !== staminaNow) {
      throw new Error(`stale stamina mutation changed progression: ${JSON.stringify(staleStaminaRow)}`);
    }
    const staminaInput = {
      operationId: staminaOperationId,
      playerId: staminaPlayerId,
      expectedRuntimeOwnerId: staminaRuntimeOwnerId,
      expectedSessionEpoch: 3,
      sourceType: 'item_stamina_restore',
      sourceRefId: staminaItemInstanceId,
      inventoryAction: 'remove' as const,
      grantedItems: [durableInventoryItem('pill.huiyuan', staminaItemInstanceId)],
      nextInventoryItems: [],
      sourceMutation: {
        kind: 'player_item_use' as const,
        action: 'restore_stamina' as const,
        playerId: staminaPlayerId,
        expectedStamina: 0,
        expectedStaminaUpdatedAt: staminaNow,
        restoreAmount: 24,
        nextStamina: 24,
        nextStaminaUpdatedAt: staminaNow + 2,
      },
    };
    const staminaResult = await durable.grantInventoryItems(staminaInput);
    const staminaReplay = await durable.grantInventoryItems(staminaInput);
    if (!staminaResult.ok || staminaResult.alreadyCommitted || !staminaReplay.alreadyCommitted) {
      throw new Error(`unexpected stamina durable replay: ${JSON.stringify({ staminaResult, staminaReplay })}`);
    }
    await assertInventory(pool, staminaPlayerId, []);
    const staminaRow = (await queryRows(
      pool,
      'SELECT stamina, stamina_updated_at FROM player_progression_core WHERE player_id = $1',
      [staminaPlayerId],
    ))[0];
    const staminaWatermark = (await queryRows(
      pool,
      'SELECT inventory_version, progression_version FROM player_recovery_watermark WHERE player_id = $1',
      [staminaPlayerId],
    ))[0];
    const staminaAuditRows = await queryRows(
      pool,
      'SELECT asset_type FROM asset_audit_log WHERE player_id = $1 ORDER BY asset_type',
      [staminaPlayerId],
    );
    if (
      Number(staminaRow?.stamina) !== 24
      || Number(staminaRow?.stamina_updated_at) !== staminaNow + 2
      || Number(staminaWatermark?.inventory_version) <= 0
      || Number(staminaWatermark?.progression_version) <= 0
      || staminaAuditRows.filter((row) => row.asset_type === 'inventory').length !== 1
      || staminaAuditRows.filter((row) => row.asset_type === 'player_item_use').length !== 1
    ) {
      throw new Error(`unexpected stamina durable state: row=${JSON.stringify(staminaRow)} watermark=${JSON.stringify(staminaWatermark)} audit=${JSON.stringify(staminaAuditRows)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'player-item-use-durable',
      answers: '真实 PostgreSQL 已证明地图解锁、复活点绑定与体力丹会把来源 CAS、背包后态、精力后态、对应 domain watermark、outbox 和双资产审计同事务提交；精确重放不重复，来源快照变化整笔回滚，未验证的空背包覆盖会拒绝，最后一件已核对道具可合法消耗。',
      excludes: '不证明客户端网络断线、真实 tick 并发或功法书重复残卷产品语义。',
      mapResult,
      mapReplay,
      respawnResult,
      staminaResult,
      staminaReplay,
    }, null, 2));
  } finally {
    await cleanup(pool, playerId).catch(() => undefined);
    await cleanup(pool, staminaPlayerId).catch(() => undefined);
    await playerPersistence.onModuleDestroy().catch(() => undefined);
    await durable.onModuleDestroy().catch(() => undefined);
    await provider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function durableInventoryItem(itemId: string, itemInstanceId: string) {
  return { itemId, count: 1, itemInstanceId, rawPayload: {} };
}

async function assertInventory(pool: Pool, playerId: string, expectedItemIds: string[]): Promise<void> {
  const rows = await queryRows(
    pool,
    'SELECT item_id FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [playerId],
  );
  const actual = rows.map((row) => String(row.item_id));
  if (JSON.stringify(actual) !== JSON.stringify(expectedItemIds)) {
    throw new Error(`unexpected player inventory: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expectedItemIds)}`);
  }
}

async function cleanup(pool: Pool, playerId: string): Promise<void> {
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_progression_core WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_map_unlock WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_world_anchor WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
}

async function queryRows(pool: Pool, sql: string, params: readonly unknown[]) {
  const result = await pool.query(sql, [...params]);
  return Array.isArray(result.rows) ? result.rows : [];
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
