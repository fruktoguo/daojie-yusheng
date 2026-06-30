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

const TREASURE_VAULT_STORAGE_TABLE = 'instance_building_storage_item';
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
      await this.storeItem(resolved.instance.meta.instanceId, resolved.building.id, extracted, resolved.capacity);
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
        await this.storeItem(resolved.instance.meta.instanceId, resolved.building.id, item, resolved.capacity);
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

  private async storeItem(instanceId: string, buildingId: string, item: any, capacity: number): Promise<void> {
    if (!this.pool || !this.enabled) {
      throw new Error('treasure_vault_persistence_disabled');
    }
    const rows = await this.loadStorageRows(instanceId, buildingId);
    const signature = createItemStackSignature(item);
    const existing = rows.find((row) => createItemStackSignature(buildItemFromStorageRow(row, Math.max(1, Math.trunc(Number(row.count) || 1)))) === signature);
    if (existing) {
      await this.pool.query(
        `UPDATE ${TREASURE_VAULT_STORAGE_TABLE}
            SET count = count + $4, updated_at = now(), raw_payload = raw_payload || $5::jsonb
          WHERE instance_id = $1 AND building_id = $2 AND storage_item_id = $3`,
        [instanceId, buildingId, existing.storage_item_id, normalizePositiveCount(item.count), JSON.stringify(buildRawPayload(item))],
      );
      return;
    }
    if (rows.length >= capacity) {
      throw new Error('treasure_vault_full');
    }
    const slotIndex = resolveNextSlotIndex(rows);
    await this.pool.query(
      `INSERT INTO ${TREASURE_VAULT_STORAGE_TABLE}
        (storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        randomUUID(),
        instanceId,
        buildingId,
        slotIndex,
        normalizeString(item.itemId),
        normalizePositiveCount(item.count),
        Number.isFinite(Number(item.enhanceLevel)) ? Math.max(0, Math.trunc(Number(item.enhanceLevel))) : null,
        JSON.stringify(buildRawPayload(item)),
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
      `SELECT storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload
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
      `SELECT storage_item_id, instance_id, building_id, slot_index, item_id, count, enhance_level, raw_payload
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
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (instance_id, building_id, slot_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_storage_item_building_idx
      ON ${TREASURE_VAULT_STORAGE_TABLE}(instance_id, building_id, slot_index ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_storage_item_item_idx
      ON ${TREASURE_VAULT_STORAGE_TABLE}(item_id, instance_id, building_id)
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
  return normalizeString(player?.displayName) || normalizeString(player?.name) || normalizeString(player?.playerId) || undefined;
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

function normalizeString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
