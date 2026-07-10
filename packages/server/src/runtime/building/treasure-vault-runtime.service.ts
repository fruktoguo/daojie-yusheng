/**
 * 本文件属于服务端权威运行时，负责宝库建筑的权限裁定和低频库存转移。
 *
 * 宝库物品资产写入独立数据库表；建筑 payload 只保存权限配置。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createItemStackSignature,
  type TreasureVaultDetailView,
  type TreasureVaultItemView,
  type TreasureVaultOperationResultView,
  type TreasureVaultPermissionKind,
  type TreasureVaultPermissionMap,
  type TreasureVaultPermissionScope,
} from '@mud/shared';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { SocialRuntimeService } from '../social/social-runtime.service';
import { MailRuntimeService } from '../mail/mail-runtime.service';
import { resolvePlayerDisplayName } from '../player/player-display-name';

const TREASURE_VAULT_STORAGE_TABLE = 'instance_building_storage_item';
const PLAYER_MAIL_TABLE = 'player_mail';
const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const INSTANCE_CATALOG_TABLE = 'instance_catalog';
const INSTANCE_BUILDING_STATE_TABLE = 'instance_building_state';
const TREASURE_VAULT_DEF_ID = 'treasure_vault';
const DEFAULT_TREASURE_VAULT_CAPACITY = 80;
const DEFAULT_PERMISSIONS: TreasureVaultPermissionMap = {
  view: ['all'],
  deposit: ['all'],
  withdraw: [],
};
const PERMISSION_KINDS: TreasureVaultPermissionKind[] = ['view', 'deposit', 'withdraw'];
const PERMISSION_SCOPES = new Set<TreasureVaultPermissionScope>(['all', 'party', 'sect', 'dao_friend', 'close_friend']);

type PoolLike = {
  connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>; release(): void }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
};

@Injectable()
export class TreasureVaultRuntimeService {
  private readonly logger = new Logger(TreasureVaultRuntimeService.name);
  private pool: PoolLike | null = null;
  private enabled = false;

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(ContentTemplateRepository) private readonly contentTemplateRepository: ContentTemplateRepository,
    @Inject(SocialRuntimeService) private readonly socialRuntimeService: SocialRuntimeService,
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('宝库持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const pool = this.databasePoolProvider?.getPool?.('treasure-vault-runtime') as PoolLike | null;
    if (!pool) {
      this.logger.warn('宝库持久化已禁用：数据库连接池不可用');
      return;
    }
    try {
      await ensureTreasureVaultTables(pool);
      this.pool = pool;
      this.enabled = true;
      this.logger.log('宝库持久化已启用（instance_building_storage_item）');
    } catch (error) {
      this.logger.error('宝库持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async buildDetail(playerId: string, payload: { instanceId?: string; buildingId?: string }, runtime: any): Promise<TreasureVaultOperationResultView> {
    if (!this.pool || !this.enabled) {
      return { ok: false, operation: 'detail', reason: 'treasure_vault_persistence_disabled' };
    }
    const resolved = this.resolveVault(runtime, playerId, payload);
    if (resolved.ok !== true) {
      return { ok: false, operation: 'detail', reason: resolved.reason };
    }
    if (!await this.canUsePermission(playerId, resolved.instance, resolved.building, 'view')) {
      return { ok: false, operation: 'detail', reason: 'treasure_vault_permission_denied' };
    }
    return { ok: true, operation: 'detail', detail: await this.buildDetailView(playerId, resolved.instance, resolved.building) };
  }

  async deposit(playerId: string, payload: { instanceId?: string; buildingId?: string; itemInstanceId?: string; count?: number }, runtime: any): Promise<TreasureVaultOperationResultView> {
    if (!this.pool || !this.enabled) {
      return { ok: false, operation: 'deposit', reason: 'treasure_vault_persistence_disabled' };
    }
    const resolved = this.resolveVault(runtime, playerId, payload);
    if (resolved.ok !== true) {
      return { ok: false, operation: 'deposit', reason: resolved.reason };
    }
    if (!await this.canUsePermission(playerId, resolved.instance, resolved.building, 'deposit')) {
      return { ok: false, operation: 'deposit', reason: 'treasure_vault_permission_denied' };
    }
    const itemInstanceId = normalizeString(payload.itemInstanceId);
    const count = normalizePositiveCount(payload.count);
    if (!itemInstanceId || count <= 0) {
      return { ok: false, operation: 'deposit', reason: 'invalid_item' };
    }
    let extracted: any = null;
    try {
      extracted = this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, count);
      await this.storeItem(resolved.instance.meta.instanceId, resolved.building.id, extracted, resolved.capacity, resolved.building, resolved.instance);
      return { ok: true, operation: 'deposit', detail: await this.buildDetailView(playerId, resolved.instance, resolved.building) };
    } catch (error) {
      if (extracted) {
        try {
          this.playerRuntimeService.receiveInventoryItem(playerId, extracted);
        } catch (rollbackError) {
          this.logger.error('宝库存入失败后回滚背包失败', rollbackError instanceof Error ? rollbackError.stack : String(rollbackError));
        }
      }
      return { ok: false, operation: 'deposit', reason: error instanceof Error ? error.message : 'deposit_failed' };
    }
  }

  async withdraw(playerId: string, payload: { instanceId?: string; buildingId?: string; storageItemId?: string; count?: number }, runtime: any): Promise<TreasureVaultOperationResultView> {
    if (!this.pool || !this.enabled) {
      return { ok: false, operation: 'withdraw', reason: 'treasure_vault_persistence_disabled' };
    }
    const resolved = this.resolveVault(runtime, playerId, payload);
    if (resolved.ok !== true) {
      return { ok: false, operation: 'withdraw', reason: resolved.reason };
    }
    if (!await this.canUsePermission(playerId, resolved.instance, resolved.building, 'withdraw')) {
      return { ok: false, operation: 'withdraw', reason: 'treasure_vault_permission_denied' };
    }
    const storageItemId = normalizeString(payload.storageItemId);
    const count = normalizePositiveCount(payload.count);
    if (!storageItemId || count <= 0) {
      return { ok: false, operation: 'withdraw', reason: 'invalid_item' };
    }
    const row = await this.loadStorageRow(resolved.instance.meta.instanceId, resolved.building.id, storageItemId);
    if (!row) {
      return { ok: false, operation: 'withdraw', reason: 'storage_item_not_found' };
    }
    const available = Math.max(1, Math.trunc(Number(row.count) || 1));
    const takeCount = Math.min(count, available);
    const item = buildItemFromStorageRow(row, takeCount);
    if (!this.canReceiveInventoryItem(playerId, item)) {
      return { ok: false, operation: 'withdraw', reason: 'inventory_full' };
    }
    try {
      await this.removeStorageCount(resolved.instance.meta.instanceId, resolved.building.id, storageItemId, takeCount);
      this.playerRuntimeService.receiveInventoryItem(playerId, item);
      return { ok: true, operation: 'withdraw', detail: await this.buildDetailView(playerId, resolved.instance, resolved.building) };
    } catch (error) {
      try {
        await this.storeItem(resolved.instance.meta.instanceId, resolved.building.id, item, resolved.capacity, resolved.building, resolved.instance);
      } catch (rollbackError) {
        this.logger.error('宝库取出失败后回滚库内物品失败', rollbackError instanceof Error ? rollbackError.stack : String(rollbackError));
      }
      return { ok: false, operation: 'withdraw', reason: error instanceof Error ? error.message : 'withdraw_failed' };
    }
  }

  async updatePermissions(playerId: string, payload: { instanceId?: string; buildingId?: string; permissions?: Partial<TreasureVaultPermissionMap> }, runtime: any): Promise<TreasureVaultOperationResultView> {
    const resolved = this.resolveVault(runtime, playerId, payload);
    if (resolved.ok !== true) {
      return { ok: false, operation: 'permissions', reason: resolved.reason };
    }
    if (normalizeString(resolved.building.ownerPlayerId) !== normalizeString(playerId)) {
      return { ok: false, operation: 'permissions', reason: 'treasure_vault_owner_required' };
    }
    resolved.building.treasureVaultPermissions = normalizePermissionMap(payload.permissions, getBuildingPermissions(resolved.building));
    resolved.building.updatedAtTick = Math.max(0, Math.trunc(Number(resolved.instance.tick) || 0));
    resolved.building.revision = Math.max(1, Math.trunc(Number(resolved.building.revision) || 1)) + 1;
    resolved.instance.markAoiViewChangedAt?.(resolved.building.x, resolved.building.y);
    resolved.instance.worldRevision = Math.max(0, Math.trunc(Number(resolved.instance.worldRevision) || 0)) + 1;
    resolved.instance.persistentRevision = Math.max(0, Math.trunc(Number(resolved.instance.persistentRevision) || 0)) + 1;
    if (typeof resolved.instance.markPersistenceDirtyDomainsHighPriority === 'function') {
      resolved.instance.markPersistenceDirtyDomainsHighPriority(['building']);
    } else {
      resolved.instance.markPersistenceDirtyDomains?.(['building']);
    }
    return { ok: true, operation: 'permissions', detail: await this.buildDetailView(playerId, resolved.instance, resolved.building) };
  }

  async hasStoredItems(instanceId: string, buildingId: string): Promise<boolean> {
    const normalizedInstanceId = normalizeString(instanceId);
    const normalizedBuildingId = normalizeString(buildingId);
    if (!normalizedInstanceId || !normalizedBuildingId || !this.pool || !this.enabled) {
      return false;
    }
    const result = await this.pool.query(
      `SELECT 1 FROM ${TREASURE_VAULT_STORAGE_TABLE} WHERE instance_id = $1 AND building_id = $2 LIMIT 1`,
      [normalizedInstanceId, normalizedBuildingId],
    );
    return (result.rows ?? []).length > 0;
  }

  async recoverVaultItemsToOwnerMail(input: { instanceId?: string; buildingId?: string; buildingName?: string; ownerPlayerId?: string | null; reason?: string }): Promise<{ ok: boolean; itemCount: number; mailId?: string; reason?: string }> {
    const instanceId = normalizeString(input.instanceId);
    const buildingId = normalizeString(input.buildingId);
    if (!instanceId || !buildingId) {
      return { ok: false, itemCount: 0, reason: 'building_not_found' };
    }
    if (!this.pool || !this.enabled) {
      return { ok: false, itemCount: 0, reason: 'treasure_vault_persistence_disabled' };
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rowsResult = await client.query(
        `SELECT storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload, owner_player_id, building_name
           FROM ${TREASURE_VAULT_STORAGE_TABLE}
          WHERE instance_id = $1 AND building_id = $2
          ORDER BY slot_index ASC, storage_item_id ASC
          FOR UPDATE`,
        [instanceId, buildingId],
      );
      const rows = rowsResult.rows ?? [];
      if (rows.length === 0) {
        await client.query('COMMIT');
        return { ok: true, itemCount: 0 };
      }
      const ownerPlayerId = normalizeString(input.ownerPlayerId)
        || normalizeString(rows.find((row) => normalizeString(row.owner_player_id))?.owner_player_id);
      if (!ownerPlayerId) {
        await client.query('ROLLBACK');
        return { ok: false, itemCount: rows.length, reason: 'treasure_vault_owner_required' };
      }
      const createdAt = Date.now();
      const mailId = buildVaultRecoveryMailId(ownerPlayerId, instanceId, buildingId);
      const buildingName = normalizeString(input.buildingName)
        || normalizeString(rows.find((row) => normalizeString(row.building_name))?.building_name)
        || '宝库';
      const reason = normalizeString(input.reason) || 'deconstruct';
      await client.query(
        `INSERT INTO ${PLAYER_MAIL_TABLE}(
          mail_id, player_id, sender_type, sender_label, template_id, mail_type,
          title, body, source_type, source_ref_id, metadata_jsonb, mail_version,
          created_at, expire_at, first_seen_at, read_at, claimed_at, deleted_at, updated_at
        ) VALUES ($1, $2, 'system', $3, NULL, 'system', $4, $5, $6, $7, $8::jsonb, 1, $9, NULL, NULL, NULL, NULL, NULL, to_timestamp($10::double precision / 1000.0))
        ON CONFLICT (mail_id) DO NOTHING`,
        [
          mailId,
          ownerPlayerId,
          '司命台',
          `宝库物品返还：${buildingName}`,
          `你的宝库「${buildingName}」已被拆除或摧毁。为避免资产丢失，库内全部物品已随本邮件返还。`,
          'treasure_vault_recovery',
          `${instanceId}:${buildingId}`,
          JSON.stringify({ args: [], instanceId, buildingId, buildingName, reason }),
          createdAt,
          createdAt,
        ],
      );
      const existingAttachmentResult = await client.query(
        `SELECT 1 FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} WHERE mail_id = $1 LIMIT 1`,
        [mailId],
      );
      if ((existingAttachmentResult.rowCount ?? 0) === 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let parameterIndex = 1;
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const item = buildItemFromStorageRow(row, Math.max(1, Math.trunc(Number(row.count) || 1)));
          placeholders.push(
            `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, 'item', $${parameterIndex + 3}, $${parameterIndex + 4}, NULL, NULL, $${parameterIndex + 5}::jsonb, NULL, NULL, now())`,
          );
          values.push(
            `mail_attachment:${mailId}:${index}`,
            mailId,
            ownerPlayerId,
            normalizeString(item.itemId),
            normalizePositiveCount(item.count),
            JSON.stringify(buildRawPayloadForMail(item)),
          );
          parameterIndex += 6;
        }
        await client.query(
          `INSERT INTO ${PLAYER_MAIL_ATTACHMENT_TABLE}(
            attachment_id, mail_id, player_id, attachment_kind, item_id, count,
            currency_type, amount, item_payload_jsonb, claim_operation_id, claimed_at, created_at
          ) VALUES ${placeholders.join(',\n')}`,
          values,
        );
      }
      await client.query(
        `DELETE FROM ${TREASURE_VAULT_STORAGE_TABLE}
          WHERE instance_id = $1 AND building_id = $2`,
        [instanceId, buildingId],
      );
      await refreshMailCounters(client, ownerPlayerId, createdAt);
      await client.query('COMMIT');
      this.mailRuntimeService.discardMailboxCache(ownerPlayerId);
      return { ok: true, itemCount: rows.length, mailId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error('宝库物品返还邮件迁移失败，已保留宝库库存不删除', error instanceof Error ? error.stack : String(error));
      return { ok: false, itemCount: 0, reason: error instanceof Error ? error.message : 'treasure_vault_recovery_failed' };
    } finally {
      client.release();
    }
  }

  async recoverVaultItemsForInstance(input: { instanceId?: string; reason?: string; limit?: number }): Promise<{ ok: boolean; recoveredVaults: number; recoveredItems: number; blockedVaults: number; reason?: string }> {
    const instanceId = normalizeString(input.instanceId);
    if (!instanceId || !this.pool || !this.enabled) {
      return { ok: false, recoveredVaults: 0, recoveredItems: 0, blockedVaults: 0, reason: instanceId ? 'treasure_vault_persistence_disabled' : 'instance_not_found' };
    }
    const groups = await this.listVaultStorageGroupsForInstance(instanceId, input.limit);
    return this.recoverVaultStorageGroups(groups, normalizeString(input.reason) || 'instance_recovery');
  }

  async recoverOrphanedVaultItems(input: { limit?: number; reason?: string } = {}): Promise<{ ok: boolean; recoveredVaults: number; recoveredItems: number; blockedVaults: number; reason?: string }> {
    if (!this.pool || !this.enabled) {
      return { ok: false, recoveredVaults: 0, recoveredItems: 0, blockedVaults: 0, reason: 'treasure_vault_persistence_disabled' };
    }
    const limit = normalizePositiveLimit(input.limit, 100);
    const result = await this.pool.query(
      `SELECT storage.instance_id, storage.building_id,
              COALESCE(MAX(storage.owner_player_id), MAX(building.owner_player_id), MAX(catalog.owner_player_id)) AS owner_player_id,
              COALESCE(MAX(storage.building_name), MAX(building.def_id), '宝库') AS building_name,
              COUNT(*)::bigint AS item_count
         FROM ${TREASURE_VAULT_STORAGE_TABLE} storage
         LEFT JOIN ${INSTANCE_CATALOG_TABLE} catalog ON catalog.instance_id = storage.instance_id
         LEFT JOIN ${INSTANCE_BUILDING_STATE_TABLE} building ON building.instance_id = storage.instance_id AND building.building_id = storage.building_id
        WHERE catalog.instance_id IS NULL
           OR catalog.status = 'destroyed'
           OR catalog.runtime_status = 'stopped'
        GROUP BY storage.instance_id, storage.building_id
        ORDER BY storage.instance_id ASC, storage.building_id ASC
        LIMIT $1`,
      [limit],
    );
    return this.recoverVaultStorageGroups(result.rows ?? [], normalizeString(input.reason) || 'orphan_scan');
  }

  private async listVaultStorageGroupsForInstance(instanceId: string, limit?: number): Promise<any[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT storage.instance_id, storage.building_id,
              COALESCE(MAX(storage.owner_player_id), MAX(building.owner_player_id), MAX(catalog.owner_player_id)) AS owner_player_id,
              COALESCE(MAX(storage.building_name), MAX(building.def_id), '宝库') AS building_name,
              COUNT(*)::bigint AS item_count
         FROM ${TREASURE_VAULT_STORAGE_TABLE} storage
         LEFT JOIN ${INSTANCE_BUILDING_STATE_TABLE} building ON building.instance_id = storage.instance_id AND building.building_id = storage.building_id
         LEFT JOIN ${INSTANCE_CATALOG_TABLE} catalog ON catalog.instance_id = storage.instance_id
        WHERE storage.instance_id = $1
        GROUP BY storage.instance_id, storage.building_id
        ORDER BY storage.building_id ASC
        LIMIT $2`,
      [instanceId, normalizePositiveLimit(limit, 500)],
    );
    return result.rows ?? [];
  }

  private async recoverVaultStorageGroups(groups: any[], reason: string): Promise<{ ok: boolean; recoveredVaults: number; recoveredItems: number; blockedVaults: number; reason?: string }> {
    let recoveredVaults = 0;
    let recoveredItems = 0;
    let blockedVaults = 0;
    for (const group of groups) {
      const ownerPlayerId = normalizeString(group.owner_player_id);
      if (!ownerPlayerId) {
        blockedVaults += 1;
        this.logger.warn(`发现无法自动返还的宝库库存：缺少 owner_player_id instance=${normalizeString(group.instance_id)} building=${normalizeString(group.building_id)}`);
        continue;
      }
      const recovered = await this.recoverVaultItemsToOwnerMail({
        instanceId: group.instance_id,
        buildingId: group.building_id,
        ownerPlayerId,
        buildingName: group.building_name,
        reason,
      });
      if (recovered.ok === true) {
        if (recovered.itemCount > 0) {
          recoveredVaults += 1;
          recoveredItems += recovered.itemCount;
        }
        continue;
      }
      blockedVaults += 1;
      this.logger.warn(`宝库库存自动返还失败：instance=${normalizeString(group.instance_id)} building=${normalizeString(group.building_id)} reason=${recovered.reason ?? 'unknown'}`);
    }
    return {
      ok: blockedVaults === 0,
      recoveredVaults,
      recoveredItems,
      blockedVaults,
      ...(blockedVaults > 0 ? { reason: 'treasure_vault_recovery_blocked' } : {}),
    };
  }

  private async buildDetailView(playerId: string, instance: any, building: any): Promise<TreasureVaultDetailView> {
    const instanceId = normalizeString(instance?.meta?.instanceId);
    const buildingId = normalizeString(building?.id);
    const permissions = getBuildingPermissions(building);
    const rows = await this.loadStorageRows(instanceId, buildingId);
    return {
      instanceId,
      buildingId,
      buildingName: resolveBuildingName(instance, building),
      ownerPlayerId: normalizeString(building?.ownerPlayerId) || null,
      ownerName: resolveOwnerName(this.playerRuntimeService.getPlayer(normalizeString(building?.ownerPlayerId))),
      permissions,
      effectivePermissions: {
        view: await this.canUsePermission(playerId, instance, building, 'view'),
        deposit: await this.canUsePermission(playerId, instance, building, 'deposit'),
        withdraw: await this.canUsePermission(playerId, instance, building, 'withdraw'),
      },
      items: rows.map(projectStorageRow),
      capacity: resolveVaultCapacity(instance, building),
      revision: Math.max(1, Math.trunc(Number(building?.revision) || 1)),
    };
  }

  private resolveVault(runtime: any, playerId: string, payload: { instanceId?: string; buildingId?: string }): { ok: true; instance: any; building: any; capacity: number } | { ok: false; reason: string } {
    const buildingId = normalizeString(payload.buildingId);
    if (!buildingId) {
      return { ok: false, reason: 'building_not_found' };
    }
    const player = this.playerRuntimeService.getPlayer(playerId);
    const instanceId = normalizeString(payload.instanceId) || normalizeString(player?.instanceId);
    if (!instanceId || !runtime || typeof runtime.getInstanceRuntime !== 'function') {
      return { ok: false, reason: 'instance_not_found' };
    }
    const instance = runtime.getInstanceRuntime(instanceId);
    const building = instance?.buildingById?.get?.(buildingId);
    if (!instance || !building) {
      return { ok: false, reason: 'building_not_found' };
    }
    const capacity = resolveVaultCapacity(instance, building);
    if (capacity <= 0 || !isTreasureVaultBuilding(instance, building)) {
      return { ok: false, reason: 'not_treasure_vault' };
    }
    return { ok: true, instance, building, capacity };
  }

  private async canUsePermission(playerId: string, instance: any, building: any, kind: TreasureVaultPermissionKind): Promise<boolean> {
    const normalizedPlayerId = normalizeString(playerId);
    const ownerPlayerId = normalizeString(building?.ownerPlayerId);
    if (normalizedPlayerId && ownerPlayerId && normalizedPlayerId === ownerPlayerId) {
      return true;
    }
    const permissions = getBuildingPermissions(building);
    const scopes = permissions[kind] ?? [];
    if (scopes.includes('all')) {
      return true;
    }
    const player = this.playerRuntimeService.getPlayer(normalizedPlayerId);
    if (!player) {
      return false;
    }
    if (scopes.includes('party') && normalizeString(player.partyId) && normalizeString(player.partyId) === normalizeString(this.playerRuntimeService.getPlayer(ownerPlayerId)?.partyId)) {
      return true;
    }
    if (scopes.includes('sect') && normalizeString(player.sectId) && normalizeString(player.sectId) === normalizeString(building?.ownerSectId)) {
      return true;
    }
    if (ownerPlayerId && scopes.includes('close_friend') && await this.socialRuntimeService.areRelated(normalizedPlayerId, ownerPlayerId, 'close_friend')) {
      return true;
    }
    if (ownerPlayerId && scopes.includes('dao_friend') && await this.socialRuntimeService.areRelated(normalizedPlayerId, ownerPlayerId, 'dao_friend')) {
      return true;
    }
    return false;
  }

  private async storeItem(instanceId: string, buildingId: string, item: any, capacity: number, building?: any, instance?: any): Promise<void> {
    if (!this.pool || !this.enabled) {
      throw new Error('treasure_vault_persistence_disabled');
    }
    const rows = await this.loadStorageRows(instanceId, buildingId);
    const signature = createItemStackSignature(item);
    const ownerPlayerId = normalizeString(building?.ownerPlayerId);
    const buildingName = resolveBuildingName(instance, building);
    const existing = rows.find((row) => createItemStackSignature(buildItemFromStorageRow(row, Math.max(1, Math.trunc(Number(row.count) || 1)))) === signature);
    if (existing) {
      await this.pool.query(
        `UPDATE ${TREASURE_VAULT_STORAGE_TABLE}
            SET count = count + $4,
                updated_at = now(),
                raw_payload = raw_payload || $5::jsonb,
                owner_player_id = COALESCE(NULLIF($6, ''), owner_player_id),
                building_name = COALESCE(NULLIF($7, ''), building_name)
          WHERE instance_id = $1 AND building_id = $2 AND storage_item_id = $3`,
        [instanceId, buildingId, existing.storage_item_id, normalizePositiveCount(item.count), JSON.stringify(buildRawPayload(item)), ownerPlayerId, buildingName],
      );
      return;
    }
    if (rows.length >= capacity) {
      throw new Error('treasure_vault_full');
    }
    const slotIndex = resolveNextSlotIndex(rows);
    await this.pool.query(
      `INSERT INTO ${TREASURE_VAULT_STORAGE_TABLE}
        (storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload, owner_player_id, building_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULLIF($9, ''), NULLIF($10, ''))`,
      [
        randomUUID(),
        instanceId,
        buildingId,
        slotIndex,
        normalizeString(item.itemId),
        normalizePositiveCount(item.count),
        Number.isFinite(Number(item.enhanceLevel)) ? Math.max(0, Math.trunc(Number(item.enhanceLevel))) : null,
        JSON.stringify(buildRawPayload(item)),
        ownerPlayerId,
        buildingName,
      ],
    );
  }

  private async removeStorageCount(instanceId: string, buildingId: string, storageItemId: string, count: number): Promise<void> {
    if (!this.pool || !this.enabled) {
      throw new Error('treasure_vault_persistence_disabled');
    }
    const row = await this.loadStorageRow(instanceId, buildingId, storageItemId);
    if (!row) {
      throw new Error('storage_item_not_found');
    }
    const remaining = Math.max(0, Math.trunc(Number(row.count) || 0) - count);
    if (remaining <= 0) {
      await this.pool.query(
        `DELETE FROM ${TREASURE_VAULT_STORAGE_TABLE}
          WHERE instance_id = $1 AND building_id = $2 AND storage_item_id = $3`,
        [instanceId, buildingId, storageItemId],
      );
    } else {
      await this.pool.query(
        `UPDATE ${TREASURE_VAULT_STORAGE_TABLE}
            SET count = $4, updated_at = now()
          WHERE instance_id = $1 AND building_id = $2 AND storage_item_id = $3`,
        [instanceId, buildingId, storageItemId, remaining],
      );
    }
  }

  private async loadStorageRow(instanceId: string, buildingId: string, storageItemId: string): Promise<any | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload, owner_player_id, building_name
         FROM ${TREASURE_VAULT_STORAGE_TABLE}
        WHERE instance_id = $1 AND building_id = $2 AND storage_item_id = $3
        LIMIT 1`,
      [instanceId, buildingId, storageItemId],
    );
    return result.rows?.[0] ?? null;
  }

  private async loadStorageRows(instanceId: string, buildingId: string): Promise<any[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload, owner_player_id, building_name
         FROM ${TREASURE_VAULT_STORAGE_TABLE}
        WHERE instance_id = $1 AND building_id = $2
        ORDER BY slot_index ASC, storage_item_id ASC`,
      [instanceId, buildingId],
    );
    return result.rows ?? [];
  }

  private canReceiveInventoryItem(playerId: string, item: any): boolean {
    const player = this.playerRuntimeService.getPlayer(playerId);
    if (!player || !Array.isArray(player.inventory?.items)) {
      return false;
    }
    const signature = createItemStackSignature(item);
    if (player.inventory.items.some((entry: any) => createItemStackSignature(entry) === signature)) {
      return true;
    }
    return player.inventory.items.length < Math.max(0, Math.trunc(Number(player.inventory.capacity) || 0));
  }
}

async function ensureTreasureVaultTables(pool: PoolLike): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TREASURE_VAULT_STORAGE_TABLE} (
        storage_item_id varchar(160) PRIMARY KEY,
        instance_id varchar(160) NOT NULL,
        building_id varchar(160) NOT NULL,
        slot_index bigint NOT NULL,
        item_id varchar(160) NOT NULL,
        count bigint NOT NULL DEFAULT 1,
        enhance_level bigint,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        owner_player_id varchar(100),
        building_name varchar(160),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (instance_id, building_id, slot_index)
      )
    `);
    await client.query(`ALTER TABLE ${TREASURE_VAULT_STORAGE_TABLE} ADD COLUMN IF NOT EXISTS owner_player_id varchar(100)`);
    await client.query(`ALTER TABLE ${TREASURE_VAULT_STORAGE_TABLE} ADD COLUMN IF NOT EXISTS building_name varchar(160)`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_storage_item_building_idx
      ON ${TREASURE_VAULT_STORAGE_TABLE}(instance_id, building_id, slot_index ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_storage_item_item_idx
      ON ${TREASURE_VAULT_STORAGE_TABLE}(item_id, instance_id, building_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_storage_item_owner_idx
      ON ${TREASURE_VAULT_STORAGE_TABLE}(owner_player_id, instance_id, building_id)
    `);
  } finally {
    client.release();
  }
}

function getBuildingPermissions(building: any): TreasureVaultPermissionMap {
  return normalizePermissionMap(building?.treasureVaultPermissions, DEFAULT_PERMISSIONS);
}

function normalizePermissionMap(input: unknown, fallback: TreasureVaultPermissionMap): TreasureVaultPermissionMap {
  const source = input && typeof input === 'object' ? input as Partial<TreasureVaultPermissionMap> : {};
  const next: TreasureVaultPermissionMap = { view: [], deposit: [], withdraw: [] };
  for (const kind of PERMISSION_KINDS) {
    const rawScopes = Array.isArray(source[kind]) ? source[kind] : fallback[kind];
    next[kind] = Array.from(new Set(rawScopes.filter((scope): scope is TreasureVaultPermissionScope => PERMISSION_SCOPES.has(scope as TreasureVaultPermissionScope))));
  }
  return next;
}

function isTreasureVaultBuilding(instance: any, building: any): boolean {
  if (building?.defId === TREASURE_VAULT_DEF_ID || building?.defHandle === TREASURE_VAULT_DEF_ID) {
    return true;
  }
  const compiled = instance?.buildingCatalog?.defByHandle?.[building?.defHandle] ?? instance?.buildingCatalog?.defById?.get?.(building?.defId);
  return Math.max(0, Math.trunc(Number(compiled?.treasureVaultCapacity) || 0)) > 0;
}

function resolveVaultCapacity(instance: any, building: any): number {
  const compiled = instance?.buildingCatalog?.defByHandle?.[building?.defHandle] ?? instance?.buildingCatalog?.defById?.get?.(building?.defId);
  return Math.max(0, Math.trunc(Number(compiled?.treasureVaultCapacity) || (isTreasureVaultBuilding(instance, building) ? DEFAULT_TREASURE_VAULT_CAPACITY : 0)));
}

function resolveBuildingName(instance: any, building: any): string {
  const compiled = instance?.buildingCatalog?.defByHandle?.[building?.defHandle] ?? instance?.buildingCatalog?.defById?.get?.(building?.defId);
  return normalizeString(compiled?.name) || normalizeString(building?.name) || normalizeString(building?.defId) || '宝库';
}

function resolveOwnerName(player: any): string | undefined {
  return player ? resolvePlayerDisplayName(player, { playerId: player?.playerId ?? player?.id, fallback: '未知玩家' }) : undefined;
}

function projectStorageRow(row: any): TreasureVaultItemView {
  const item = buildItemFromStorageRow(row, Math.max(1, Math.trunc(Number(row.count) || 1)));
  return {
    ...item,
    storageItemId: normalizeString(row.storage_item_id),
    slotIndex: Math.max(0, Math.trunc(Number(row.slot_index) || 0)),
  };
}

function buildItemFromStorageRow(row: any, count: number): any {
  const raw = row?.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {};
  return {
    ...raw,
    itemId: normalizeString(row?.item_id),
    count: normalizePositiveCount(count),
    ...(Number.isFinite(Number(row?.enhance_level)) ? { enhanceLevel: Math.max(0, Math.trunc(Number(row.enhance_level))) } : {}),
  };
}

function buildRawPayload(item: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item ?? {})) {
    if (key === 'itemId' || key === 'count' || key === 'storageItemId' || key === 'slotIndex') {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function buildRawPayloadForMail(item: any): Record<string, unknown> {
  return {
    ...buildRawPayload(item),
    itemId: normalizeString(item?.itemId),
    count: normalizePositiveCount(item?.count),
  };
}

function buildVaultRecoveryMailId(ownerPlayerId: string, instanceId: string, buildingId: string): string {
  return `mail:treasure_vault_recovery:${normalizeMailIdPart(ownerPlayerId)}:${normalizeMailIdPart(instanceId)}:${normalizeMailIdPart(buildingId)}`;
}

function normalizeMailIdPart(value: unknown): string {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'unknown';
}

async function refreshMailCounters(client: any, playerId: string, latestMailAt: number): Promise<void> {
  const counters = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE read_at IS NULL AND deleted_at IS NULL AND (expire_at IS NULL OR expire_at > $2))::bigint AS unread_count,
       COUNT(*) FILTER (WHERE claimed_at IS NULL AND deleted_at IS NULL AND (expire_at IS NULL OR expire_at > $2) AND EXISTS (
         SELECT 1 FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
          WHERE attachment.mail_id = mail.mail_id AND attachment.claimed_at IS NULL
       ))::bigint AS unclaimed_count,
       MAX(created_at)::bigint AS latest_mail_at,
       COALESCE(MAX(mail_version), 1)::bigint AS mail_version
     FROM ${PLAYER_MAIL_TABLE} mail
     WHERE player_id = $1`,
    [playerId, Date.now()],
  );
  const row = counters.rows?.[0] ?? {};
  const unreadCount = Math.max(0, Math.trunc(Number(row.unread_count) || 0));
  const unclaimedCount = Math.max(0, Math.trunc(Number(row.unclaimed_count) || 0));
  const latest = Number.isFinite(Number(row.latest_mail_at)) ? Math.max(latestMailAt, Math.trunc(Number(row.latest_mail_at))) : latestMailAt;
  const version = Math.max(1, Math.trunc(Number(row.mail_version) || 1));
  await client.query(
    `INSERT INTO ${PLAYER_MAIL_COUNTER_TABLE}(player_id, unread_count, unclaimed_count, latest_mail_at, counter_version, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (player_id) DO UPDATE SET
       unread_count = EXCLUDED.unread_count,
       unclaimed_count = EXCLUDED.unclaimed_count,
       latest_mail_at = EXCLUDED.latest_mail_at,
       counter_version = GREATEST(${PLAYER_MAIL_COUNTER_TABLE}.counter_version, EXCLUDED.counter_version),
       updated_at = now()`,
    [playerId, unreadCount, unclaimedCount, latest, version],
  );
  await client.query(
    `INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(player_id, mail_version, mail_counter_version, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (player_id) DO UPDATE SET
       mail_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_version, EXCLUDED.mail_version),
       mail_counter_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_counter_version, EXCLUDED.mail_counter_version),
       updated_at = now()`,
    [playerId, version, version],
  );
}

function resolveNextSlotIndex(rows: any[]): number {
  const used = new Set(rows.map((row) => Math.max(0, Math.trunc(Number(row.slot_index) || 0))));
  let slot = 0;
  while (used.has(slot)) {
    slot += 1;
  }
  return slot;
}

function normalizePositiveCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1;
}

function normalizePositiveLimit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(10_000, Math.trunc(numeric)) : fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
