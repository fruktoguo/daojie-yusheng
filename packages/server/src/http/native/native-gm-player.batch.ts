/**
 * GM 玩家管理服务 — 批量/运营操作及配套私有方法。
 *
 * 从 native-gm-player.service.ts 拆分而来，使用模式 B 委托。
 * 维护时要保持批量操作幂等性和审计追踪。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_INVENTORY_CAPACITY,
  DUNGEON_MAX_STAMINA,
  VIEW_RADIUS,
  Direction,
  mergeItemStackInto,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { reassignItemInstanceId } from '../../runtime/world/item-instance-id.helpers';
import { MarketStorageItemIdConversion } from '../../gm/compat-conversions/conversions/market/market-storage-item-id';
import { releasePlayerFlushStartupStall } from '../../persistence/player-flush-startup-stall-release';
import { QuestProgressPayloadConversion } from '../../gm/compat-conversions/conversions/quest/quest-progress-payload';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { NATIVE_GM_PLAYER_MUTATION_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
import type { GmActorContext } from './native-gm-actor-context';
import {
  addRecoveryPillMigrationSummary,
  asGmItemRecord,
  clamp,
  createEmptyRecoveryPillMigrationSummary,
  hasRecoveryPillMigration,
  isLegacyRecoveryPillItemId,
  normalizeGmItemString,
  normalizeStableGmItemInstanceId,
  resolveRecoveryPillMigrationTarget,
  writeGmItemOwnProperty,
  type RecoveryPillMigrationSummary,
} from './native-gm-player.helpers';
import type {
  GmPlayerDatabaseTableViewLike,
  GmPlayerScopeOptions,
  PersistedPlayerEntryLike,
  PlayerDomainPersistenceServiceLike,
  PlayerProgressionServiceLike,
  PlayerRuntimeServiceLike,
  WorldRuntimeServiceLike,
} from './native-gm-player.ports';
import type { NativeGmPlayerService } from './native-gm-player.service';
import { GM_RESET_PLAYER_PERSISTENCE_DOMAINS } from './native-gm-player.service';

export async function returnAllPlayersToDefaultSpawnImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const template = self.mapTemplateRepository.getOrThrow('yunlai_town');
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;

    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));

    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    const persistedEntries = scopedPlayerIds.length > 0
      ? await self.listScopedOfflinePlayerPersistenceSnapshots(scopedPlayerIds, runtimePlayerIds)
      : await self.listPlayerPersistenceSnapshots();
    for (const runtime of runtimePlayers) {
      self.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmResetPlayer(runtime.playerId);
    }

    let updatedOfflinePlayers = 0;
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId)) {
        continue;
      }

      entry.snapshot.placement.templateId = template.id;
      entry.snapshot.placement.x = template.spawnX;
      entry.snapshot.placement.y = template.spawnY;
      entry.snapshot.placement.facing = Direction.South;
      entry.snapshot.vitals.hp = entry.snapshot.vitals.maxHp;
      entry.snapshot.vitals.qi = entry.snapshot.vitals.maxQi;
      entry.snapshot.buffs.buffs = [];
      entry.snapshot.buffs.revision = Math.max(1, (entry.snapshot.buffs.revision ?? 1) + 1);
      entry.snapshot.combat.autoBattle = false;
      entry.snapshot.combat.combatTargetId = null;
      entry.snapshot.combat.combatTargetLocked = false;
      await self.savePlayerPersistenceSnapshotDomains(
        entry.playerId,
        entry.snapshot,
        GM_RESET_PLAYER_PERSISTENCE_DOMAINS,
        { allowBuffEmptyOverwrite: true },
      );
      updatedOfflinePlayers += 1;
    }

    return {
      ok: true,
      totalPlayers: runtimePlayers.length + updatedOfflinePlayers,
      queuedRuntimePlayers: runtimePlayers.length,
      updatedOfflinePlayers,
      targetMapId: template.id,
      targetX: template.spawnX,
      targetY: template.spawnY,
    };
}

export async function cleanupAllPlayersInvalidItemsImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;
    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalInvalidInventoryStacksRemoved = 0;
    let totalInvalidMarketStorageStacksRemoved = 0;
    let totalInvalidEquipmentRemoved = 0;

    for (const runtime of runtimePlayers) {
      let summary;
      try {
        summary = await self.cleanupManagedPlayerInvalidItems(runtime.playerId);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!self.hasInvalidItems(summary)) {
        continue;
      }
      queuedRuntimePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    const persistedEntries = scopedPlayerIds.length > 0
      ? await self.listScopedOfflinePlayerPersistenceSnapshots(scopedPlayerIds, runtimePlayerIds)
      : await self.listPlayerPersistenceSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      let summary;
      try {
        summary = await self.cleanupManagedPlayerInvalidItems(entry.playerId);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!self.hasInvalidItems(summary)) {
        continue;
      }
      updatedOfflinePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalInvalidInventoryStacksRemoved,
      totalInvalidMarketStorageStacksRemoved,
      totalInvalidEquipmentRemoved,
    };
}

export async function migrateAllPlayersRecoveryPillsImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;
    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    const totals = createEmptyRecoveryPillMigrationSummary();

    for (const runtime of runtimePlayers) {
      let summary;
      try {
        summary = await self.migrateManagedPlayerRecoveryPills(runtime.playerId);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!hasRecoveryPillMigration(summary)) {
        continue;
      }
      queuedRuntimePlayers += 1;
      addRecoveryPillMigrationSummary(totals, summary);
    }

    const persistedEntries = scopedPlayerIds.length > 0
      ? await self.listScopedOfflinePlayerPersistenceSnapshots(scopedPlayerIds, runtimePlayerIds)
      : await self.listPlayerPersistenceSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      let summary;
      try {
        summary = await self.migrateManagedPlayerRecoveryPills(entry.playerId);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!hasRecoveryPillMigration(summary)) {
        continue;
      }
      updatedOfflinePlayers += 1;
      addRecoveryPillMigrationSummary(totals, summary);
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalRecoveryPillInventoryStacksMigrated: totals.inventoryStacksMigrated,
      totalRecoveryPillInventoryItemsMigrated: totals.inventoryItemsMigrated,
      totalRecoveryPillMarketStorageStacksMigrated: totals.marketStorageStacksMigrated,
      totalRecoveryPillMarketStorageItemsMigrated: totals.marketStorageItemsMigrated,
      totalRecoveryPillEquipmentMigrated: totals.equipmentMigrated,
    };
}

export async function refillOnlineAndOfflineHangingPlayersStaminaImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;
    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => self.isStaminaRefillRuntimePlayer(entry)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    const now = Date.now();
    for (const runtime of runtimePlayers) {
      try {
        await self.refillManagedPlayerStamina(runtime.playerId, now);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      queuedRuntimePlayers += 1;
    }

    const persistedOfflinePlayerIds = self.playerDomainPersistenceService.listOfflineHangingPlayerIds
      ? await self.playerDomainPersistenceService.listOfflineHangingPlayerIds(scopedPlayerIds)
      : [];
    for (const playerId of persistedOfflinePlayerIds) {
      if (runtimePlayerIds.has(playerId) || isNativeGmBotPlayerId(playerId)) {
        continue;
      }
      try {
        await self.refillManagedPlayerStamina(playerId, now);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      updatedOfflinePlayers += 1;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      staminaRefilledPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      staminaMaximum: DUNGEON_MAX_STAMINA,
    };
}

export async function repairMarketStorageItemIdsImpl(self: NativeGmPlayerService) {
    if (!self.databasePoolProvider) {
      throw new BadRequestException('数据库未启用，无法修复坊市托管仓 storage_item_id');
    }
    const conversion = new MarketStorageItemIdConversion(self.databasePoolProvider, self.gmAuditLogPersistenceService);
    const result = await conversion.run({ mode: 'apply' });
    return {
      ok: result.ok,
      totalPlayers: result.convertedRows,
      queuedRuntimePlayers: 0,
      updatedOfflinePlayers: result.convertedRows,
      repairedMarketStorageRows: result.convertedRows,
      repairedMarketStoragePlayers: result.convertedRows,
      marketStorageMismatchedRowsBefore: result.matchedRows,
      marketStorageMismatchedRowsAfter: 0,
      marketStorageInvalidSlotRowsBefore: result.skippedRows,
      marketStorageInvalidSlotRowsAfter: 0,
      repairedMarketStorageSample: result.samples ?? [],
      repairedAt: result.appliedAt ?? new Date().toISOString(),
    };
}

export async function releasePlayerFlushStartupStallImpl(self: NativeGmPlayerService, playerIdInput: string,
    options: { dryRun?: boolean } = {},
) {
    const pool = self.databasePoolProvider?.getPool('gm-release-flush-stall') ?? null;
    if (!pool) {
      throw new BadRequestException('数据库未启用，无法解除刷盘启动隔离');
    }
    return releasePlayerFlushStartupStall(pool, playerIdInput, { dryRun: options.dryRun === true });
}

export async function repairQuestProgressPayloadsImpl(self: NativeGmPlayerService, mode: 'dry-run' | 'apply', actor?: GmActorContext | null) {
    if (!self.databasePoolProvider) {
      throw new BadRequestException('数据库未启用，无法修复任务进度 payload');
    }
    const conversion = new QuestProgressPayloadConversion(self.databasePoolProvider, self.gmAuditLogPersistenceService);
    const result = await conversion.run({ mode, actor: actor ?? undefined });
    return {
      ok: result.ok,
      questProgressRepairMode: mode,
      questProgressScannedRows: result.matchedRows,
      questProgressKnownRows: result.matchedRows - result.skippedRows,
      questProgressUnknownRows: result.skippedRows,
      questProgressPatchedRows: result.convertedRows,
      questProgressUnknownQuestIds: [],
      questProgressSamplePatches: result.samples ?? [],
      repairedAt: result.appliedAt ?? new Date().toISOString(),
    };
}

export function refreshOnlinePlayerTechniqueTemplatesImpl(self: NativeGmPlayerService) {
    return self.playerRuntimeService.refreshOnlineTechniqueTemplates();
}

export function isStaminaRefillRuntimePlayerImpl(self: NativeGmPlayerService, entry: any) {
    if (!entry || isNativeGmBotPlayerId(entry.playerId)) {
      return false;
    }
    const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId.trim() : '';
    if (sessionId.length > 0) {
      return true;
    }
    const templateId = typeof entry.templateId === 'string' ? entry.templateId.trim() : '';
    const reapReadyAt = Number(entry.offlineHangingReapReadyAt);
    return templateId.length > 0 && !(Number.isFinite(reapReadyAt) && reapReadyAt > 0);
}

export async function compensateAllPlayersCombatExpImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;
    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalCombatExpGranted = 0;

    for (const runtime of runtimePlayers) {
      const amount = self.calculateCombatExpCompensationForRuntime(runtime);
      if (amount <= 0) {
        continue;
      }

      try {
        await self.addPlayerCombatExp(runtime.playerId, amount);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      queuedRuntimePlayers += 1;
      totalCombatExpGranted += amount;
    }

    const persistedEntries = scopedPlayerIds.length > 0
      ? await self.listScopedOfflinePlayerPersistenceSnapshots(scopedPlayerIds, runtimePlayerIds)
      : await self.listPlayerPersistenceSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      const amount = self.calculateCombatExpCompensationForPersistence(entry.snapshot);
      if (amount <= 0) {
        continue;
      }

      try {
        await self.addPlayerCombatExp(entry.playerId, amount);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      updatedOfflinePlayers += 1;
      totalCombatExpGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalCombatExpGranted,
    };
}

export async function compensateAllPlayersFoundationImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const scopedPlayerIds = self.normalizePlayerIdScope(options);
    const scopedPlayerIdSet = scopedPlayerIds.length > 0 ? new Set(scopedPlayerIds) : null;
    const runtimePlayers = self.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId)
        && (!scopedPlayerIdSet || scopedPlayerIdSet.has(entry.playerId)));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalFoundationGranted = 0;

    for (const runtime of runtimePlayers) {
      const amount = self.calculateFoundationCompensationForRuntime(runtime);
      if (amount <= 0) {
        continue;
      }

      try {
        await self.addPlayerFoundation(runtime.playerId, amount);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      queuedRuntimePlayers += 1;
      totalFoundationGranted += amount;
    }

    const persistedEntries = scopedPlayerIds.length > 0
      ? await self.listScopedOfflinePlayerPersistenceSnapshots(scopedPlayerIds, runtimePlayerIds)
      : await self.listPlayerPersistenceSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      const amount = self.calculateFoundationCompensationForPersistence(entry.snapshot);
      if (amount <= 0) {
        continue;
      }

      try {
        await self.addPlayerFoundation(entry.playerId, amount);
      } catch (error) {
        if (self.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      updatedOfflinePlayers += 1;
      totalFoundationGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalFoundationGranted,
    };
}

export function normalizePlayerIdScopeImpl(self: NativeGmPlayerService, options?: GmPlayerScopeOptions) {
    const source = Array.isArray(options?.playerIds)
      ? options?.playerIds
      : Array.isArray(options?.targetPlayerIds)
        ? options?.targetPlayerIds
        : [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const raw of source) {
      const playerId = typeof raw === 'string' ? raw.trim() : '';
      if (!playerId || seen.has(playerId) || isNativeGmBotPlayerId(playerId)) {
        continue;
      }
      seen.add(playerId);
      normalized.push(playerId);
    }
    return normalized;
}

export function migrateRecoveryPillsFromSnapshotImpl(self: NativeGmPlayerService, snapshot: any) {
    const summary = createEmptyRecoveryPillMigrationSummary();

    const inventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
    const migratedInventory = self.migrateRecoveryPillItemArray(inventoryItems);
    if (migratedInventory.changed && snapshot.inventory) {
      snapshot.inventory.items = migratedInventory.items;
      summary.inventoryStacksMigrated = migratedInventory.stacksMigrated;
      summary.inventoryItemsMigrated = migratedInventory.itemsMigrated;
      if (Number.isFinite(snapshot.inventory.revision)) {
        snapshot.inventory.revision = Math.max(1, Math.trunc(snapshot.inventory.revision) + 1);
      }
    }

    const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
    for (const entry of equipmentSlots) {
      if (!entry?.item) {
        continue;
      }
      const migrated = self.createMigratedRecoveryPillItem(entry.item);
      if (!migrated) {
        continue;
      }
      entry.item = migrated;
      summary.equipmentMigrated += 1;
    }
    if (summary.equipmentMigrated > 0 && snapshot.equipment && Number.isFinite(snapshot.equipment.revision)) {
      snapshot.equipment.revision = Math.max(1, Math.trunc(snapshot.equipment.revision) + 1);
    }

    return summary;
}

export function migrateRecoveryPillItemArrayImpl(self: NativeGmPlayerService, items: any[]) {
    const nextItems: any[] = [];
    let changed = false;
    let stacksMigrated = 0;
    let itemsMigrated = 0;
    for (const item of items) {
      const migrated = self.createMigratedRecoveryPillItem(item);
      if (!migrated) {
        mergeItemStackInto(nextItems, item);
        continue;
      }
      changed = true;
      stacksMigrated += 1;
      itemsMigrated += Math.max(1, Math.trunc(Number(item?.count ?? 1)));
      mergeItemStackInto(nextItems, migrated);
    }
    return {
      changed,
      items: nextItems,
      stacksMigrated,
      itemsMigrated,
    };
}

export function createMigratedRecoveryPillItemImpl(self: NativeGmPlayerService, item: any) {
    const sourceItemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
    const targetItemId = resolveRecoveryPillMigrationTarget(sourceItemId);
    if (!targetItemId) {
      return null;
    }
    const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
    const migrated = self.contentTemplateRepository.createItem(targetItemId, count)
      ?? {
        ...item,
        itemId: targetItemId,
        count,
      };
    if (typeof item?.itemInstanceId === 'string' && item.itemInstanceId.trim()) {
      migrated.itemInstanceId = item.itemInstanceId.trim();
    }
    if (Number.isFinite(Number(item?.enhanceLevel))) {
      migrated.enhanceLevel = Math.max(0, Math.trunc(Number(item.enhanceLevel)));
    }
    return migrated;
}

export function cleanupInvalidItemsFromSnapshotImpl(self: NativeGmPlayerService, snapshot) {
    const inventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
    const nextInventoryItems = inventoryItems.filter((entry) => self.isValidItem(entry?.itemId));
    const inventoryStacksRemoved = inventoryItems.length - nextInventoryItems.length;
    if (inventoryStacksRemoved > 0 && snapshot.inventory) {
      snapshot.inventory.items = nextInventoryItems;
      if (Number.isFinite(snapshot.inventory.revision)) {
        snapshot.inventory.revision = Math.max(1, Math.trunc(snapshot.inventory.revision) + 1);
      }
    }

    let equipmentRemoved = 0;
    const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
    for (const entry of equipmentSlots) {
      if (!entry?.item || self.isValidItem(entry.item.itemId)) {
        continue;
      }
      entry.item = null;
      equipmentRemoved += 1;
    }
    if (equipmentRemoved > 0 && snapshot.equipment && Number.isFinite(snapshot.equipment.revision)) {
      snapshot.equipment.revision = Math.max(1, Math.trunc(snapshot.equipment.revision) + 1);
    }

    return {
      inventoryStacksRemoved,
      marketStorageStacksRemoved: 0,
      equipmentRemoved,
    };
}

export function isManagedPlayerMissingErrorImpl(self: NativeGmPlayerService, error: unknown) {
    if (error instanceof NotFoundException) {
      return true;
    }
    return error instanceof Error && error.message.includes('目标玩家不存在');
}

export function isValidItemImpl(self: NativeGmPlayerService, itemId: unknown) {
    return typeof itemId === 'string'
      && itemId.trim().length > 0
      && (self.contentTemplateRepository.getItemName(itemId.trim()) !== null || isLegacyRecoveryPillItemId(itemId));
}

export function readMarketStorageCleanupItemIdImpl(self: NativeGmPlayerService, entry: any) {
    if (entry?.item && typeof entry.item === 'object') {
      return entry.item.itemId;
    }
    return entry?.itemId;
}

export function calculateCombatExpCompensationForRuntimeImpl(self: NativeGmPlayerService, player) {
    const realmExpToNext = self.normalizeNonNegativeInt(player.realm?.progressToNext);
    const bodyTrainingExpToNext = normalizeBodyTrainingState(player.bodyTraining).expToNext;
    return realmExpToNext + self.normalizeNonNegativeInt(bodyTrainingExpToNext);
}

export function calculateCombatExpCompensationForPersistenceImpl(self: NativeGmPlayerService, snapshot) {
    const realm = self.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );
    const bodyTraining = normalizeBodyTrainingState(snapshot.progression?.bodyTraining);
    return self.normalizeNonNegativeInt(realm.progressToNext) + self.normalizeNonNegativeInt(bodyTraining.expToNext);
}

export function calculateFoundationCompensationForRuntimeImpl(self: NativeGmPlayerService, player) {
    return self.normalizeNonNegativeInt(player.realm?.progressToNext) * 5;
}

export function calculateFoundationCompensationForPersistenceImpl(self: NativeGmPlayerService, snapshot) {
    const realm = self.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );
    return self.normalizeNonNegativeInt(realm.progressToNext) * 5;
}

export function hasInvalidItemsImpl(self: NativeGmPlayerService, summary: { inventoryStacksRemoved: number; marketStorageStacksRemoved: number; equipmentRemoved: number }) {
    return summary.inventoryStacksRemoved > 0
      || summary.marketStorageStacksRemoved > 0
      || summary.equipmentRemoved > 0;
}

