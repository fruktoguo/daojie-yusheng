/**
 * gm/admin-shortcuts.ts —— GM 管理快捷指令：机器人、迁移、修复、补偿、性能重置、堆快照。
 *
 * 从 gm.ts 抽取：removeSelectedBot/spawnBots/removeAllBots/
 * returnAllPlayersToDefaultSpawn/cleanupAllPlayersInvalidItems/
 * migrateAllPlayersRecoveryPills/repairMarketStorageItemIds/
 * migrateAiArtsStrengthDraftsV1ToV2/deleteEmptyCustomTechniqueBooks/
 * recoverEmptyCustomTechniqueBooks/repairQuestProgressPayloads/
 * refreshOnlineTechniqueTemplates/refillOnlineAndOfflineHangingPlayersStamina/
 * cleanupAbnormalTemporaryTiles/compensateAllPlayersCombatExp/
 * compensateAllPlayersFoundation/resetNetworkStats/
 * toggleNetworkPayloadCapture/activateNetworkStats/
 * ensureNetworkStatsActive/resetCpuStats/resetPathfindingStats/
 * triggerManualGc/writeHeapSnapshot/writeAndCopyHeapSnapshotSummary/
 * copyLatestHeapSnapshotSummary。
 * 对 gm.ts 的依赖通过 AdminShortcutsContext 显式注入。
 */

import {
  type GmCompatConversionRunRes,
  type GmHeapSnapshotRes,
  type GmHeapSnapshotSummaryRes,
  type GmManagedPlayerSummary,
  type GmManualGcRes,
  type GmRemoveBotsReq,
  type GmShortcutRunRes,
  type GmSpawnBotsReq,
} from '@mud/shared';

/** AdminShortcutsContext：admin-shortcuts 对 gm.ts 的依赖。 */
export interface AdminShortcutsContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  setPendingStatus(message: string): void;
  t(key: string, params?: Record<string, unknown>): string;
  delayRefresh(message?: string): Promise<void>;
  copyTextToClipboard(text: string): Promise<boolean>;
  formatBytes(bytes: number | undefined): string;
  formatSignedBytes(bytes: number | undefined): string;
  getSelectedPlayer(): GmManagedPlayerSummary | null;
  loadState(silent?: boolean, refreshDetail?: boolean, forceIncludePlayers?: boolean): Promise<void>;
  loadRuntimeFlags(): Promise<void>;
  getState(): { perf: { networkPayloadCaptureEnabled?: boolean; networkStatsEnabled?: boolean } } | null;
  getNetworkStatsActivationPending(): boolean;
  setNetworkStatsActivationPending(value: boolean): void;
  getEditorDirty(): boolean;
  setEditorDirty(value: boolean): void;
  spawnCountInput: HTMLInputElement;
  getLastNetworkInStructureKey(): string | null;
  setLastNetworkInStructureKey(value: string | null): void;
  getLastNetworkOutStructureKey(): string | null;
  setLastNetworkOutStructureKey(value: string | null): void;
  removeBotBtn: HTMLButtonElement;
  resetCpuStatsBtn: HTMLButtonElement;
  resetNetworkStatsBtn: HTMLButtonElement;
  resetPathfindingStatsBtn: HTMLButtonElement;
  toggleNetworkPayloadCaptureBtn: HTMLButtonElement;
  triggerManualGcBtn: HTMLButtonElement;
  writeHeapSnapshotBtn: HTMLButtonElement;
  copyHeapSnapshotSummaryBtn: HTMLButtonElement | null;
  copyLatestHeapSnapshotSummaryBtn: HTMLButtonElement | null;
  heapSnapshotMetaEl: HTMLDivElement;
}
export async function removeSelectedBot(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = ctx.getSelectedPlayer();
  if (!selected || !selected.meta.isBot) {
    ctx.setStatus(ctx.t('gm.bot.not-selected'), true);
    return;
  }

  ctx.removeBotBtn.disabled = true;
  try {
    ctx.setPendingStatus(ctx.t('gm.bot.removing', { name: selected.name }));
    await ctx.request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/bots/remove`, {
      method: 'POST',
      body: JSON.stringify({ playerIds: [selected.id] } satisfies GmRemoveBotsReq),
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.bot.removed', { name: selected.name }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.bot.remove.failed'), true);
  } finally {
    ctx.removeBotBtn.disabled = false;
  }
}

/** spawnBots：处理生成Bots。 */
export async function spawnBots(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = ctx.getSelectedPlayer();
  if (!selected) {
    ctx.setStatus(ctx.t('gm.bot.spawn.anchor-required'), true);
    return;
  }

  const count = Number(ctx.spawnCountInput.value);
  if (!Number.isFinite(count) || count <= 0) {
    ctx.setStatus(ctx.t('gm.bot.spawn.count-invalid'), true);
    return;
  }

  try {
    await ctx.request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/bots/spawn`, {
      method: 'POST',
      body: JSON.stringify({
        anchorPlayerId: selected.id,
        count,
      } satisfies GmSpawnBotsReq),
    });
    await ctx.delayRefresh(ctx.t('gm.bot.spawn.started', { name: selected.name, count: Math.floor(count) }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.bot.spawn.failed'), true);
  }
}

/** removeAllBots：处理remove All Bots。 */
export async function removeAllBots(ctx: AdminShortcutsContext): Promise<void> {
  try {
    ctx.setPendingStatus(ctx.t('gm.bot.remove-all.started'));
    await ctx.request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/bots/remove`, {
      method: 'POST',
      body: JSON.stringify({ all: true } satisfies GmRemoveBotsReq),
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.bot.remove-all.done'));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.bot.remove.failed'), true);
  }
}

/** returnAllPlayersToDefaultSpawn：处理return All Players To默认生成。 */
export async function returnAllPlayersToDefaultSpawn(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(ctx.t('gm.shortcut.return-all.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-return-all-to-default-spawn') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/players/return-all-to-default-spawn`, {
      method: 'POST',
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.shortcut.return-all.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** cleanupAllPlayersInvalidItems：处理cleanup All Players Invalid物品。 */
export async function cleanupAllPlayersInvalidItems(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(ctx.t('gm.shortcut.cleanup-invalid.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-cleanup-invalid-items') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/players/cleanup-invalid-items`, {
      method: 'POST',
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.shortcut.cleanup-invalid.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      removedInventoryStacks: Math.floor(result.totalInvalidInventoryStacksRemoved ?? 0),
      removedMarketStorageStacks: Math.floor(result.totalInvalidMarketStorageStacksRemoved ?? 0),
      removedEquipment: Math.floor(result.totalInvalidEquipmentRemoved ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function migrateAllPlayersRecoveryPills(ctx: AdminShortcutsContext): Promise<void> {
  if (!window.confirm(ctx.t('gm.shortcut.migrate-recovery-pills.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-migrate-recovery-pills') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/players/migrate-recovery-pills`, {
      method: 'POST',
    });
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.shortcut.migrate-recovery-pills.done', {
      totalPlayers: Math.floor(result.totalPlayers ?? 0),
      queuedRuntimePlayers: Math.floor(result.queuedRuntimePlayers ?? 0),
      updatedOfflinePlayers: Math.floor(result.updatedOfflinePlayers ?? 0),
      inventoryStacks: Math.floor(result.totalRecoveryPillInventoryStacksMigrated ?? 0),
      inventoryItems: Math.floor(result.totalRecoveryPillInventoryItemsMigrated ?? 0),
      marketStorageStacks: Math.floor(result.totalRecoveryPillMarketStorageStacksMigrated ?? 0),
      marketStorageItems: Math.floor(result.totalRecoveryPillMarketStorageItemsMigrated ?? 0),
      equipment: Math.floor(result.totalRecoveryPillEquipmentMigrated ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function repairMarketStorageItemIds(ctx: AdminShortcutsContext): Promise<void> {
  if (!window.confirm(ctx.t('gm.shortcut.repair-market-storage.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-repair-market-storage-item-ids') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/maintenance/repair-market-storage-item-ids`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.repair-market-storage.done', {
      before: Math.floor(result.marketStorageMismatchedRowsBefore ?? 0),
      repairedRows: Math.floor(result.repairedMarketStorageRows ?? 0),
      repairedPlayers: Math.floor(result.repairedMarketStoragePlayers ?? 0),
      after: Math.floor(result.marketStorageMismatchedRowsAfter ?? 0),
      invalidSlots: Math.floor(result.marketStorageInvalidSlotRowsAfter ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function migrateAiArtsStrengthDraftsV1ToV2(ctx: AdminShortcutsContext): Promise<void> {
  const button = document.getElementById('shortcut-migrate-ai-arts-strength-v1-to-v2') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    ctx.setPendingStatus(ctx.t('gm.shortcut.migrate-ai-arts.dry-run-started'));
    const preview = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/ai-arts-strength-v1-to-v2/dry-run`, {
      method: 'POST',
    });
    if (preview.convertedRows <= 0) {
      ctx.setStatus(ctx.t('gm.shortcut.migrate-ai-arts.noop', {
        skippedRows: Math.floor(preview.skippedRows),
      }), preview.failedRows > 0);
      return;
    }
    if (!window.confirm(ctx.t('gm.shortcut.migrate-ai-arts.confirm', {
      matchedRows: Math.floor(preview.matchedRows),
      convertedRows: Math.floor(preview.convertedRows),
      skippedRows: Math.floor(preview.skippedRows),
      failedRows: Math.floor(preview.failedRows),
    }))) {
      ctx.setStatus(ctx.t('gm.shortcut.migrate-ai-arts.cancelled'));
      return;
    }
    const result = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/ai-arts-strength-v1-to-v2/apply`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.migrate-ai-arts.done', {
      matchedRows: Math.floor(result.matchedRows),
      convertedRows: Math.floor(result.convertedRows),
      skippedRows: Math.floor(result.skippedRows),
      failedRows: Math.floor(result.failedRows),
      verifiedRows: Math.floor(result.verifiedRows),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function deleteEmptyCustomTechniqueBooks(ctx: AdminShortcutsContext): Promise<void> {
  const button = document.getElementById('shortcut-delete-empty-custom-technique-books') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    ctx.setPendingStatus(ctx.t('gm.shortcut.delete-empty-books.dry-run-started'));
    const preview = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/delete-empty-custom-technique-books/dry-run`, {
      method: 'POST',
    });
    if (preview.convertedRows <= 0) {
      ctx.setStatus(ctx.t('gm.shortcut.delete-empty-books.noop', {
        skippedRows: Math.floor(preview.skippedRows),
      }), preview.failedRows > 0);
      return;
    }
    if (!window.confirm(ctx.t('gm.shortcut.delete-empty-books.confirm', {
      matchedRows: Math.floor(preview.matchedRows),
      convertedRows: Math.floor(preview.convertedRows),
      skippedRows: Math.floor(preview.skippedRows),
    }))) {
      ctx.setStatus(ctx.t('gm.shortcut.delete-empty-books.cancelled'));
      return;
    }
    const result = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/delete-empty-custom-technique-books/apply`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.delete-empty-books.done', {
      matchedRows: Math.floor(result.matchedRows),
      convertedRows: Math.floor(result.convertedRows),
      skippedRows: Math.floor(result.skippedRows),
      failedRows: Math.floor(result.failedRows),
      verifiedRows: Math.floor(result.verifiedRows),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function recoverEmptyCustomTechniqueBooks(ctx: AdminShortcutsContext): Promise<void> {
  const button = document.getElementById('shortcut-recover-empty-custom-technique-books') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    ctx.setPendingStatus(ctx.t('gm.shortcut.recover-empty-books.dry-run-started'));
    const preview = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/recover-empty-custom-technique-books/dry-run`, {
      method: 'POST',
    });
    if (preview.convertedRows <= 0) {
      ctx.setStatus(ctx.t('gm.shortcut.recover-empty-books.noop', {
        matchedRows: Math.floor(preview.matchedRows),
        skippedRows: Math.floor(preview.skippedRows),
      }), preview.failedRows > 0 || preview.skippedRows > 0);
      return;
    }
    if (!window.confirm(ctx.t('gm.shortcut.recover-empty-books.confirm', {
      matchedRows: Math.floor(preview.matchedRows),
      convertedRows: Math.floor(preview.convertedRows),
      skippedRows: Math.floor(preview.skippedRows),
    }))) {
      ctx.setStatus(ctx.t('gm.shortcut.recover-empty-books.cancelled'));
      return;
    }
    const result = await ctx.request<GmCompatConversionRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/recover-empty-custom-technique-books/apply`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.recover-empty-books.done', {
      matchedRows: Math.floor(result.matchedRows),
      convertedRows: Math.floor(result.convertedRows),
      skippedRows: Math.floor(result.skippedRows),
      failedRows: Math.floor(result.failedRows),
      verifiedRows: Math.floor(result.verifiedRows),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function repairQuestProgressPayloads(ctx: AdminShortcutsContext): Promise<void> {
  const button = document.getElementById('shortcut-repair-quest-progress-payloads') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    ctx.setPendingStatus(ctx.t('gm.shortcut.repair-quest-progress.dry-run-started'));
    const preview = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/quest-progress-payloads/dry-run`, {
      method: 'POST',
    });
    const patchedRows = Math.floor(preview.questProgressPatchedRows ?? 0);
    const unknownRows = Math.floor(preview.questProgressUnknownRows ?? 0);
    if (patchedRows <= 0) {
      ctx.setStatus(ctx.t('gm.shortcut.repair-quest-progress.noop', {
        scannedRows: Math.floor(preview.questProgressScannedRows ?? 0),
        unknownRows,
      }), unknownRows > 0);
      return;
    }
    const unknownLabel = (preview.questProgressUnknownQuestIds ?? [])
      .slice(0, 6)
      .map((entry) => `${entry.questId} x${entry.count}`)
      .join('，') || '无';
    if (!window.confirm(ctx.t('gm.shortcut.repair-quest-progress.confirm', {
      scannedRows: Math.floor(preview.questProgressScannedRows ?? 0),
      patchedRows,
      unknownRows,
      unknownLabel,
    }))) {
      ctx.setStatus(ctx.t('gm.shortcut.repair-quest-progress.cancelled'));
      return;
    }
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compat/quest-progress-payloads/apply`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.repair-quest-progress.done', {
      scannedRows: Math.floor(result.questProgressScannedRows ?? 0),
      patchedRows: Math.floor(result.questProgressPatchedRows ?? 0),
      unknownRows: Math.floor(result.questProgressUnknownRows ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function refreshOnlineTechniqueTemplates(ctx: AdminShortcutsContext): Promise<void> {
  if (!window.confirm(ctx.t('gm.shortcut.refresh-online-technique-templates.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-refresh-online-technique-templates') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/players/refresh-online-technique-templates`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.refresh-online-technique-templates.done', {
      totalPlayers: Math.floor(result.totalPlayers ?? 0),
      refreshedOnlinePlayers: Math.floor(result.refreshedOnlinePlayers ?? 0),
      refreshedTechniques: Math.floor(result.refreshedTechniques ?? 0),
      missingTechniqueTemplates: Math.floor(result.missingTechniqueTemplates ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

export async function refillOnlineAndOfflineHangingPlayersStamina(ctx: AdminShortcutsContext): Promise<void> {
  if (!window.confirm(ctx.t('gm.shortcut.refill-stamina.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-refill-stamina') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/players/refill-stamina`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.refill-stamina.done', {
      totalPlayers: Math.floor(result.totalPlayers ?? 0),
      queuedRuntimePlayers: Math.floor(result.queuedRuntimePlayers ?? 0),
      updatedOfflinePlayers: Math.floor(result.updatedOfflinePlayers ?? 0),
      staminaMaximum: Math.floor(result.staminaMaximum ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** cleanupAbnormalTemporaryTiles：处理cleanup Abnormal Temporary Tiles。 */
export async function cleanupAbnormalTemporaryTiles(ctx: AdminShortcutsContext): Promise<void> {
  if (!window.confirm(ctx.t('gm.shortcut.cleanup-abnormal-temp.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-cleanup-abnormal-temporary-tiles') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/world/cleanup-abnormal-temporary-tiles`, {
      method: 'POST',
    });
    await ctx.delayRefresh(ctx.t('gm.shortcut.cleanup-abnormal-temp.done', {
      scannedInstances: Math.floor(result.scannedInstances ?? 0),
      affectedInstances: Math.floor(result.affectedInstances ?? 0),
      removedTemporaryTiles: Math.floor(result.removedTemporaryTiles ?? 0),
      flushedInstances: Math.floor(result.flushedInstances ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersCombatExp：处理compensate All Players战斗Exp。 */
export async function compensateAllPlayersCombatExp(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(ctx.t('gm.shortcut.combat-exp.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-compensate-combat-exp-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compensation/combat-exp-2026-04-09`, {
      method: 'POST',
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.shortcut.combat-exp.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      combatExp: Math.floor(result.totalCombatExpGranted ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersFoundation：处理compensate All Players Foundation。 */
export async function compensateAllPlayersFoundation(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(ctx.t('gm.shortcut.foundation.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-compensate-foundation-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await ctx.request<GmShortcutRunRes>(`${ctx.GM_API_BASE_PATH}/shortcuts/compensation/foundation-2026-04-09`, {
      method: 'POST',
    });
    /** ctx.getEditorDirty()：编辑器Dirty。 */
    ctx.setEditorDirty(false);
    await ctx.delayRefresh(ctx.t('gm.shortcut.foundation.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      foundation: Math.floor(result.totalFoundationGranted ?? 0),
    }));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetNetworkStats：重置Network属性。 */
export async function resetNetworkStats(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ctx.resetNetworkStatsBtn.disabled = true;
  try {
    await activateNetworkStats(ctx);
    ctx.setStatus(ctx.t('gm.perf.network.reset.done'));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.perf.network.reset.failed'), true);
  } finally {
    ctx.resetNetworkStatsBtn.disabled = false;
  }
}

export async function toggleNetworkPayloadCapture(ctx: AdminShortcutsContext): Promise<void> {
  const enabled = ctx.getState()?.perf.networkPayloadCaptureEnabled !== true;
  ctx.toggleNetworkPayloadCaptureBtn.disabled = true;
  try {
    if (enabled && ctx.getState()?.perf.networkStatsEnabled !== true) {
      await activateNetworkStats(ctx);
    }
    await ctx.request<{
      ok: true;
      enabled: boolean;
    }>(`${ctx.GM_API_BASE_PATH}/perf/network/payload-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await ctx.loadState(true);
    await ctx.loadRuntimeFlags();
    ctx.setStatus(enabled ? '已开启大包采样。' : '已关闭大包采样。');
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : '切换大包采样失败。', true);
  } finally {
    ctx.toggleNetworkPayloadCaptureBtn.disabled = false;
  }
}

export async function activateNetworkStats(ctx: AdminShortcutsContext): Promise<void> {
  ctx.setLastNetworkInStructureKey(null);
  ctx.setLastNetworkOutStructureKey(null);
  await ctx.request<{
    /**
 * ok：ok相关字段。
 */
    ok: true;
  }>(`${ctx.GM_API_BASE_PATH}/perf/network/reset`, {
    method: 'POST',
  });
  await ctx.loadState(true);
}

export async function ensureNetworkStatsActive(ctx: AdminShortcutsContext): Promise<void> {
  if (!ctx.getToken() || ctx.getNetworkStatsActivationPending() || ctx.getState()?.perf.networkStatsEnabled === true) {
    return;
  }
  ctx.setNetworkStatsActivationPending(true);
  ctx.resetNetworkStatsBtn.disabled = true;
  try {
    await activateNetworkStats(ctx);
  } finally {
    ctx.setNetworkStatsActivationPending(false);
    ctx.resetNetworkStatsBtn.disabled = false;
  }
}

/** resetCpuStats：重置Cpu属性。 */
export async function resetCpuStats(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ctx.resetCpuStatsBtn.disabled = true;
  try {
    await ctx.request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/perf/cpu/reset`, {
      method: 'POST',
    });
    await ctx.loadState(true);
    ctx.setStatus(ctx.t('gm.perf.cpu.reset.done'));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.perf.cpu.reset.failed'), true);
  } finally {
    ctx.resetCpuStatsBtn.disabled = false;
  }
}

/** resetPathfindingStats：重置Pathfinding属性。 */
export async function resetPathfindingStats(ctx: AdminShortcutsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ctx.resetPathfindingStatsBtn.disabled = true;
  try {
    await ctx.request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/perf/pathfinding/reset`, {
      method: 'POST',
    });
    await ctx.loadState(true);
    ctx.setStatus(ctx.t('gm.perf.pathfinding.reset.done'));
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : ctx.t('gm.perf.pathfinding.reset.failed'), true);
  } finally {
    ctx.resetPathfindingStatsBtn.disabled = false;
  }
}

export async function triggerManualGc(ctx: AdminShortcutsContext): Promise<void> {
  ctx.triggerManualGcBtn.disabled = true;
  ctx.writeHeapSnapshotBtn.disabled = true;
  ctx.heapSnapshotMetaEl.textContent = '正在触发手动 GC，服务端会短暂停顿...';
  try {
    const result = await ctx.request<GmManualGcRes>(
      `${ctx.GM_API_BASE_PATH}/perf/memory/gc`,
      { method: 'POST' },
      60_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '手动 GC 未执行';
      ctx.heapSnapshotMetaEl.textContent = message;
      ctx.setStatus(message, true);
      return;
    }
    const delta = result.delta;
    const durationMs = Math.max(0, Number(result.durationMs ?? 0));
    const detail = [
      `手动 GC 完成：${durationMs.toFixed(0)} ms`,
      `Heap 已用 ${ctx.formatSignedBytes(delta?.heapUsedBytes)}`,
      `Heap 总量 ${ctx.formatSignedBytes(delta?.heapTotalBytes)}`,
      `RSS ${ctx.formatSignedBytes(delta?.rssBytes)}`,
      `外部 ${ctx.formatSignedBytes(delta?.externalBytes)}`,
      `ArrayBuffer ${ctx.formatSignedBytes(delta?.arrayBuffersBytes)}`,
    ].join(' · ');
    ctx.heapSnapshotMetaEl.textContent = detail;
    ctx.setStatus('手动 GC 已完成，已刷新内存快照');
    await ctx.loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '手动 GC 失败';
    ctx.heapSnapshotMetaEl.textContent = message;
    ctx.setStatus(message, true);
  } finally {
    ctx.triggerManualGcBtn.disabled = false;
    ctx.writeHeapSnapshotBtn.disabled = false;
  }
}

export async function writeHeapSnapshot(ctx: AdminShortcutsContext): Promise<void> {
  ctx.writeHeapSnapshotBtn.disabled = true;
  ctx.heapSnapshotMetaEl.textContent = '正在生成 Heap Snapshot，服务端会短暂停顿...';
  try {
    // GB 级 heap 在服务端流式解析需要 60~180 秒；客户端默认 30 秒超时不够，这里放宽到 5 分钟。
    const result = await ctx.request<GmHeapSnapshotRes>(
      `${ctx.GM_API_BASE_PATH}/perf/memory/heap-snapshot`,
      { method: 'POST' },
      300_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '生成 Heap Snapshot 失败';
      ctx.heapSnapshotMetaEl.textContent = message;
      ctx.setStatus(message, true);
      return;
    }
    const summary = result.summary ?? null;
    const durationMs = typeof result.durationMs === 'number' ? result.durationMs : 0;
    if (summary) {
      const declared = summary.declaredNodeCount ?? 0;
      const totalMb = summary.totalSelfSizeBytes ? ctx.formatBytes(summary.totalSelfSizeBytes) : '?';
      ctx.heapSnapshotMetaEl.textContent = `Heap snapshot 已解析：节点 ${declared} 个 · 累计 ${totalMb} · 耗时 ${durationMs.toFixed(0)} ms（in-memory，未落盘）`;
      ctx.setStatus('Heap Snapshot 已解析为摘要');
    } else {
      ctx.heapSnapshotMetaEl.textContent = `Heap Snapshot 已生成（耗时 ${durationMs.toFixed(0)} ms）`;
      ctx.setStatus('Heap Snapshot 已生成');
    }
    await ctx.loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成 Heap Snapshot 失败';
    ctx.heapSnapshotMetaEl.textContent = message;
    ctx.setStatus(message, true);
  } finally {
    ctx.writeHeapSnapshotBtn.disabled = false;
  }
}

/**
 * writeAndCopyHeapSnapshotSummary：触发服务端生成 Heap Snapshot，
 * 解析完成后把 ~50 KB 摘要 JSON 复制到剪贴板，省去下载 GB 级 .heapsnapshot 的成本。
 */
export async function writeAndCopyHeapSnapshotSummary(ctx: AdminShortcutsContext): Promise<void> {
  if (!ctx.copyHeapSnapshotSummaryBtn) {
    return;
  }
  ctx.copyHeapSnapshotSummaryBtn.disabled = true;
  ctx.writeHeapSnapshotBtn.disabled = true;
  ctx.heapSnapshotMetaEl.textContent = '正在生成 Heap Snapshot 并解析摘要，服务端会短暂停顿（GB 级 heap 通常 60~180 秒）...';
  try {
    // 与 writeHeapSnapshot 同步：放宽到 5 分钟，以容纳 3+ GB heap 的解析时间。
    const result = await ctx.request<GmHeapSnapshotRes>(
      `${ctx.GM_API_BASE_PATH}/perf/memory/heap-snapshot`,
      { method: 'POST' },
      300_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '生成 Heap Snapshot 失败';
      ctx.heapSnapshotMetaEl.textContent = message;
      ctx.setStatus(message, true);
      return;
    }
    if (!result.summary) {
      const reason = result.summaryError ? `（${result.summaryError}）` : '';
      const message = `Heap Snapshot 已生成，但摘要解析未完成${reason}，可点"复制最近摘要"重试`;
      ctx.heapSnapshotMetaEl.textContent = message;
      ctx.setStatus(message, true);
      return;
    }
    const text = JSON.stringify(result.summary, null, 2);
    const ok = await ctx.copyTextToClipboard(text);
    if (ok) {
      const detail = `摘要已复制到剪贴板（${text.length} 字节，${(typeof result.durationMs === 'number' ? result.durationMs : 0).toFixed(0)} ms，未落盘）`;
      ctx.heapSnapshotMetaEl.textContent = detail;
      ctx.setStatus('Heap Snapshot 摘要已复制到剪贴板');
    } else {
      ctx.heapSnapshotMetaEl.textContent = '摘要已生成但写入剪贴板失败，请改用"复制最近摘要"或检查浏览器权限';
      ctx.setStatus('剪贴板写入失败，请改用"复制最近摘要"按钮重试', true);
    }
    await ctx.loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成 Heap Snapshot 摘要失败';
    ctx.heapSnapshotMetaEl.textContent = message;
    ctx.setStatus(message, true);
  } finally {
    ctx.copyHeapSnapshotSummaryBtn.disabled = false;
    ctx.writeHeapSnapshotBtn.disabled = false;
  }
}

/**
 * copyLatestHeapSnapshotSummary：读取服务端最近一次 Heap Snapshot 摘要并复制到剪贴板，
 * 不重新生成（不会让 V8 暂停）；如果尚未生成过会提示运维先点"生成并复制摘要"。
 */
export async function copyLatestHeapSnapshotSummary(ctx: AdminShortcutsContext): Promise<void> {
  if (!ctx.copyLatestHeapSnapshotSummaryBtn) {
    return;
  }
  ctx.copyLatestHeapSnapshotSummaryBtn.disabled = true;
  try {
    const result = await ctx.request<GmHeapSnapshotSummaryRes>(`${ctx.GM_API_BASE_PATH}/perf/memory/heap-snapshot/summary`);
    if (!result.ok || !result.summary) {
      const message = result.hint ?? result.reason ?? '尚未生成过 Heap Snapshot 摘要';
      ctx.heapSnapshotMetaEl.textContent = message;
      ctx.setStatus(message, true);
      return;
    }
    const text = JSON.stringify(result.summary, null, 2);
    const ok = await ctx.copyTextToClipboard(text);
    if (ok) {
      const fileLabel = result.fileName ?? '最近一份摘要';
      const sizeLabel = typeof result.bytes === 'number' && result.bytes > 0 ? ctx.formatBytes(result.bytes) : `${text.length}`;
      ctx.heapSnapshotMetaEl.textContent = `${fileLabel} · ${sizeLabel} 已复制到剪贴板`;
      ctx.setStatus('Heap Snapshot 摘要已复制到剪贴板');
    } else {
      ctx.heapSnapshotMetaEl.textContent = '剪贴板写入失败，请检查浏览器权限或在 https / localhost 下重试';
      ctx.setStatus('剪贴板写入失败', true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取 Heap Snapshot 摘要失败';
    ctx.heapSnapshotMetaEl.textContent = message;
    ctx.setStatus(message, true);
  } finally {
    ctx.copyLatestHeapSnapshotSummaryBtn.disabled = false;
  }
}

