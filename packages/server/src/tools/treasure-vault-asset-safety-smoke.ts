import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { ContentTemplateRepository } from '../content/content-template.repository';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { TreasureVaultRuntimeService } from '../runtime/building/treasure-vault-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下验证宝库库存独立落盘、完整 payload 邮件返还、地图丢失/临时实例清理孤儿回收，以及缺 owner 时不删除库存。',
      excludes: '无数据库时不证明真实 SQL 事务、索引迁移或邮件附件落库。',
      completionMapping: 'release:proof:with-db.treasure-vault-asset-safety',
    }, null, 2));
    return;
  }

  const stamp = Date.now().toString(36);
  const ownerId = `vault_owner_${stamp}`;
  const instanceId = `vault:asset:${stamp}`;
  const stoppedInstanceId = `vault:stopped:${stamp}`;
  const missingInstanceId = `vault:missing:${stamp}`;
  const blockedInstanceId = `vault:blocked:${stamp}`;
  const rollbackInstanceId = `vault:rollback:${stamp}`;
  const buildingId = `vault_building_${stamp}`;
  const stoppedBuildingId = `vault_stopped_${stamp}`;
  const missingBuildingId = `vault_missing_${stamp}`;
  const blockedBuildingId = `vault_blocked_${stamp}`;
  const rollbackBuildingId = `vault_rollback_${stamp}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const contentTemplateRepository = new ContentTemplateRepository();
  const mailPersistence = new MailPersistenceService(databasePoolProvider);
  const instanceCatalog = new InstanceCatalogService(databasePoolProvider);
  const instanceDomain = new InstanceDomainPersistenceService(databasePoolProvider);
  const playerRuntime = createPlayerRuntime(ownerId);
  const service = new TreasureVaultRuntimeService(
    databasePoolProvider,
    playerRuntime as never,
    contentTemplateRepository,
    { areRelated: async () => false } as never,
    { discardMailboxCache: () => undefined } as never,
  );

  contentTemplateRepository.onModuleInit();
  await mailPersistence.onModuleInit();
  await instanceCatalog.onModuleInit();
  await instanceDomain.onModuleInit();
  await service.onModuleInit();

  try {
    await cleanup(pool, ownerId, [instanceId, stoppedInstanceId, missingInstanceId, blockedInstanceId, rollbackInstanceId]);

    await seedInstanceCatalog(pool, instanceId, 'active', 'running', ownerId);
    await seedBuildingState(pool, instanceId, buildingId, ownerId, '宝库·主动');
    const activeRuntime = createRuntime(instanceId, buildingId, ownerId, '宝库·主动');
    const depositResult = await service.deposit(ownerId, { instanceId, buildingId, items: [
      { itemInstanceId: 'gem.active', count: 3 },
      { itemInstanceId: 'gem.batch', count: 2 },
    ] }, activeRuntime.runtime);
    assert.equal(depositResult.ok, true, `deposit failed: ${JSON.stringify(depositResult)}`);

    const activeRows = await fetchRows(pool, 'SELECT owner_player_id, building_name, raw_payload FROM instance_building_storage_item WHERE instance_id = $1 AND building_id = $2', [instanceId, buildingId]);
    assert.equal(activeRows.length, 2);
    assert.ok(activeRows.every((row) => row?.owner_player_id === ownerId));
    assert.ok(activeRows.every((row) => row?.building_name === '宝库·主动'));
    assert.equal(activeRows.find((row) => row?.raw_payload?.itemInstanceId === 'gem.active')?.raw_payload?.enhanceLevel, 7);
    assert.equal(activeRows.find((row) => row?.raw_payload?.itemInstanceId === 'gem.batch')?.raw_payload?.enhanceLevel, 5);

    const unauthorizedRename = await service.rename('vault_other_player', { instanceId, buildingId, name: '不可改名' }, activeRuntime.runtime);
    assert.equal(unauthorizedRename.ok, false);
    assert.equal(unauthorizedRename.reason, 'treasure_vault_owner_required');
    const renameResult = await service.rename(ownerId, { instanceId, buildingId, name: '宝库·新名' }, activeRuntime.runtime);
    assert.equal(renameResult.ok, true);
    assert.equal(renameResult.detail?.buildingName, '宝库·新名');
    assert.equal(activeRuntime.building.name, '宝库·新名');
    const renamedRows = await fetchRows(pool, 'SELECT building_name FROM instance_building_storage_item WHERE instance_id = $1 AND building_id = $2', [instanceId, buildingId]);
    assert.ok(renamedRows.every((row) => row?.building_name === '宝库·新名'));

    const directRecovery = await service.recoverVaultItemsToOwnerMail({ instanceId, buildingId, ownerPlayerId: ownerId, buildingName: '宝库·新名', reason: 'smoke_direct' });
    assert.equal(directRecovery.ok, true);
    assert.equal(directRecovery.itemCount, 2);
    await assertVaultEmpty(pool, instanceId, buildingId);
    await assertRecoveryMail(pool, ownerId, directRecovery.mailId, [
      { itemInstanceId: 'gem.active', count: 3 },
      { itemInstanceId: 'gem.batch', count: 2 },
    ], '宝库·新名');
    const repeatRecovery = await service.recoverVaultItemsToOwnerMail({ instanceId, buildingId, ownerPlayerId: ownerId, buildingName: '宝库·新名', reason: 'smoke_retry' });
    assert.equal(repeatRecovery.ok, true);
    assert.equal(repeatRecovery.itemCount, 0);

    await seedInstanceCatalog(pool, rollbackInstanceId, 'active', 'running', ownerId);
    await seedBuildingState(pool, rollbackInstanceId, rollbackBuildingId, ownerId, '宝库·批量回滚');
    const rollbackRuntime = createRuntime(rollbackInstanceId, rollbackBuildingId, ownerId, '宝库·批量回滚', 1).runtime;
    const rollbackResult = await service.deposit(ownerId, {
      instanceId: rollbackInstanceId,
      buildingId: rollbackBuildingId,
      items: [
        { itemInstanceId: 'gem.rollback.a', count: 1 },
        { itemInstanceId: 'gem.rollback.b', count: 1 },
      ],
    }, rollbackRuntime);
    assert.equal(rollbackResult.ok, false);
    assert.equal(rollbackResult.reason, 'treasure_vault_full');
    await assertVaultEmpty(pool, rollbackInstanceId, rollbackBuildingId);
    assert.ok(playerRuntime.peekInventoryItemByInstanceId(ownerId, 'gem.rollback.a'));
    assert.ok(playerRuntime.peekInventoryItemByInstanceId(ownerId, 'gem.rollback.b'));

    await seedInstanceCatalog(pool, stoppedInstanceId, 'active', 'stopped', ownerId);
    await seedBuildingState(pool, stoppedInstanceId, stoppedBuildingId, ownerId, '宝库·停止实例');
    await insertVaultRow(pool, stoppedInstanceId, stoppedBuildingId, ownerId, '宝库·停止实例', 'gem.stopped', 4, 8);
    const stoppedRecovery = await service.recoverVaultItemsForInstance({ instanceId: stoppedInstanceId, reason: 'smoke_stopped' });
    assert.equal(stoppedRecovery.ok, true);
    assert.equal(stoppedRecovery.recoveredVaults, 1);
    assert.equal(stoppedRecovery.recoveredItems, 1);
    await assertVaultEmpty(pool, stoppedInstanceId, stoppedBuildingId);
    await assertRecoveryMail(pool, ownerId, buildExpectedMailId(ownerId, stoppedInstanceId, stoppedBuildingId), [{ itemInstanceId: 'gem.stopped', count: 4 }], '宝库·停止实例');

    await insertVaultRow(pool, missingInstanceId, missingBuildingId, ownerId, '宝库·地图丢失', 'gem.missing', 5, 9);
    const orphanRecovery = await service.recoverOrphanedVaultItems({ reason: 'smoke_missing', limit: 20 });
    assert.equal(orphanRecovery.ok, true);
    assert.ok(orphanRecovery.recoveredVaults >= 1);
    await assertVaultEmpty(pool, missingInstanceId, missingBuildingId);
    await assertRecoveryMail(pool, ownerId, buildExpectedMailId(ownerId, missingInstanceId, missingBuildingId), [{ itemInstanceId: 'gem.missing', count: 5 }], '宝库·地图丢失');

    await seedInstanceCatalog(pool, blockedInstanceId, 'destroyed', 'stopped', null);
    await insertVaultRow(pool, blockedInstanceId, blockedBuildingId, null, '宝库·缺少建造者', 'gem.blocked', 6, 10);
    const blockedRecovery = await service.recoverOrphanedVaultItems({ reason: 'smoke_blocked', limit: 20 });
    assert.equal(blockedRecovery.ok, false);
    assert.ok(blockedRecovery.blockedVaults >= 1);
    const blockedRows = await fetchRows(pool, 'SELECT * FROM instance_building_storage_item WHERE instance_id = $1 AND building_id = $2', [blockedInstanceId, blockedBuildingId]);
    assert.equal(blockedRows.length, 1, '缺 owner 的异常库存必须保留，不能删除');

    console.log(JSON.stringify({
      ok: true,
      cases: [
        'batch_deposit_writes_all_items_in_one_transaction',
        'batch_deposit_failure_rolls_back_storage_and_inventory',
        'owner_only_rename_updates_runtime_and_recovery_metadata',
        'direct_recovery_writes_one_mail_then_deletes_storage',
        'retry_is_idempotent_without_duplicate_storage_loss',
        'stopped_instance_recovery_before_purge',
        'missing_instance_orphan_recovery',
        'missing_owner_blocks_and_keeps_storage',
      ],
      answers: '宝库批量存入会在同一事务写入全部物品，库存独立表保存 owner/buildingName/full item payload；主动/停止实例/地图丢失回收都会一封邮件返还全部物品；缺 owner 的异常库存不会被删除。',
      excludes: '不启动真实 socket 客户端，不证明玩家实际点击领取附件 UI。',
      completionMapping: 'release:proof:with-db.treasure-vault-asset-safety',
    }, null, 2));
  } finally {
    await cleanup(pool, ownerId, [instanceId, stoppedInstanceId, missingInstanceId, blockedInstanceId, rollbackInstanceId]);
    await pool.end();
    await databasePoolProvider.onModuleDestroy();
  }
}

function createPlayerRuntime(ownerId: string) {
  const player = {
    id: ownerId,
    playerId: ownerId,
    instanceId: '',
    inventory: {
      capacity: 20,
      items: [
        createGem('gem.active', 3, 7),
        createGem('gem.batch', 2, 5),
        createGem('gem.rollback.a', 1, 11),
        createGem('gem.rollback.b', 1, 12),
      ],
    },
  };
  return {
    getPlayer(playerId: string) {
      return playerId === ownerId ? player : null;
    },
    peekInventoryItemByInstanceId(playerId: string, itemInstanceId: string) {
      assert.equal(playerId, ownerId);
      return player.inventory.items.find((item) => item.itemInstanceId === itemInstanceId) ?? null;
    },
    splitInventoryItemByInstanceId(playerId: string, itemInstanceId: string, count: number) {
      assert.equal(playerId, ownerId);
      const index = player.inventory.items.findIndex((item) => item.itemInstanceId === itemInstanceId);
      assert.notEqual(index, -1, 'source inventory item must exist');
      const item = player.inventory.items[index];
      const take = Math.min(Math.max(1, Math.trunc(count)), item.count);
      item.count -= take;
      if (item.count <= 0) {
        player.inventory.items.splice(index, 1);
      }
      return { ...item, count: take };
    },
    receiveInventoryItem(_playerId: string, item: Record<string, unknown>) {
      player.inventory.items.push(item as any);
    },
  };
}

function createGem(itemInstanceId: string, count: number, enhanceLevel: number) {
  return {
    itemId: 'rat_tail',
    name: '烟测宝物',
    type: 'material',
    count,
    desc: '用于宝库资产安全烟测',
    itemInstanceId,
    enhanceLevel,
    materialCategory: 'exotic',
    tags: ['烟测', '宝库'],
    customMarker: `marker:${itemInstanceId}`,
  };
}

function createRuntime(instanceId: string, buildingId: string, ownerId: string, buildingName: string, capacity = 80) {
  const building = {
    id: buildingId,
    defId: 'treasure_vault',
    defHandle: 'treasure_vault',
    ownerPlayerId: ownerId,
    ownerSectId: null,
    name: buildingName,
    state: 'active',
    revision: 1,
  };
  const instance = {
    meta: { instanceId },
    buildingById: new Map([[buildingId, building]]),
    buildingCatalog: {
      defByHandle: {
        treasure_vault: { id: 'treasure_vault', name: buildingName, treasureVaultCapacity: capacity },
      },
      defById: new Map([['treasure_vault', { id: 'treasure_vault', name: buildingName, treasureVaultCapacity: capacity }]]),
    },
  };
  return {
    instance,
    building,
    runtime: {
      getInstanceRuntime(id: string) {
        return id === instanceId ? instance : null;
      },
    },
  };
}

async function seedInstanceCatalog(pool: Pool, instanceId: string, status: string, runtimeStatus: string, ownerPlayerId: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO instance_catalog(instance_id, template_id, instance_type, persistent_policy, owner_player_id, status, runtime_status, shard_key)
     VALUES ($1, 'smoke', 'test', 'persistent', $2, $3, $4, $1)
     ON CONFLICT (instance_id) DO UPDATE SET owner_player_id = EXCLUDED.owner_player_id, status = EXCLUDED.status, runtime_status = EXCLUDED.runtime_status`,
    [instanceId, ownerPlayerId, status, runtimeStatus],
  );
}

async function seedBuildingState(pool: Pool, instanceId: string, buildingId: string, ownerId: string, buildingName: string): Promise<void> {
  void buildingName;
  await pool.query(
    `INSERT INTO instance_building_state(instance_id, building_id, def_id, x, y, rotation, owner_player_id, owner_sect_id, room_id, hp, max_hp, state, created_at_tick, updated_at_tick, revision)
     VALUES ($1, $2, 'treasure_vault', 1, 1, 0, $3, NULL, NULL, 100, 100, 'active', 1, 1, 1)
     ON CONFLICT (instance_id, building_id) DO UPDATE SET owner_player_id = EXCLUDED.owner_player_id, def_id = EXCLUDED.def_id`,
    [instanceId, buildingId, ownerId],
  );
}

async function insertVaultRow(pool: Pool, instanceId: string, buildingId: string, ownerId: string | null, buildingName: string, itemInstanceId: string, count: number, enhanceLevel: number): Promise<void> {
  const item = createGem(itemInstanceId, count, enhanceLevel);
  await pool.query(
    `INSERT INTO instance_building_storage_item(storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload, owner_player_id, building_name)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7::jsonb, $8, $9)
     ON CONFLICT (storage_item_id) DO NOTHING`,
    [`storage:${itemInstanceId}`, instanceId, buildingId, item.itemId, count, enhanceLevel, JSON.stringify(item), ownerId, buildingName],
  );
}

async function assertVaultEmpty(pool: Pool, instanceId: string, buildingId: string): Promise<void> {
  const rows = await fetchRows(pool, 'SELECT * FROM instance_building_storage_item WHERE instance_id = $1 AND building_id = $2', [instanceId, buildingId]);
  assert.equal(rows.length, 0, `vault storage must be empty: ${JSON.stringify(rows)}`);
}

async function assertRecoveryMail(
  pool: Pool,
  ownerId: string,
  mailId: string | undefined,
  expectedItems: Array<{ itemInstanceId: string; count: number }>,
  buildingName: string,
): Promise<void> {
  assert.ok(mailId, 'recovery mail id required');
  const mail = await fetchSingleRow(pool, 'SELECT mail_id, player_id, title, body, source_type, source_ref_id FROM player_mail WHERE mail_id = $1', [mailId]);
  assert.equal(mail?.player_id, ownerId);
  assert.equal(mail?.source_type, 'treasure_vault_recovery');
  assert.match(String(mail?.title ?? ''), /宝库物品返还/);
  assert.match(String(mail?.body ?? ''), new RegExp(buildingName));
  const attachments = await fetchRows(pool, 'SELECT item_id, count, item_payload_jsonb FROM player_mail_attachment WHERE mail_id = $1 ORDER BY attachment_id ASC', [mailId]);
  assert.equal(attachments.length, expectedItems.length);
  for (const expected of expectedItems) {
    const attachment = attachments.find((entry) => entry?.item_payload_jsonb?.itemInstanceId === expected.itemInstanceId);
    assert.equal(attachment?.item_id, 'rat_tail');
    assert.equal(Number(attachment?.count), expected.count);
    assert.equal(attachment?.item_payload_jsonb?.customMarker, `marker:${expected.itemInstanceId}`);
  }
}

function buildExpectedMailId(ownerId: string, instanceId: string, buildingId: string): string {
  return `mail:treasure_vault_recovery:${normalizeMailIdPart(ownerId)}:${normalizeMailIdPart(instanceId)}:${normalizeMailIdPart(buildingId)}`;
}

function normalizeMailIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'unknown';
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows ?? [];
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<any | null> {
  return (await fetchRows(pool, sql, params))[0] ?? null;
}

async function cleanup(pool: Pool, ownerId: string, instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM player_mail_attachment WHERE player_id = $1 OR mail_id LIKE $2', [ownerId, 'mail:treasure_vault_recovery:%']);
  await pool.query('DELETE FROM player_mail WHERE player_id = $1 OR mail_id LIKE $2', [ownerId, 'mail:treasure_vault_recovery:%']);
  await pool.query('DELETE FROM player_mail_counter WHERE player_id = $1', [ownerId]);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [ownerId]);
  for (const instanceId of instanceIds) {
    await pool.query('DELETE FROM instance_building_storage_item WHERE instance_id = $1', [instanceId]);
    await pool.query('DELETE FROM instance_building_state WHERE instance_id = $1', [instanceId]);
    await pool.query('DELETE FROM instance_catalog WHERE instance_id = $1', [instanceId]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
