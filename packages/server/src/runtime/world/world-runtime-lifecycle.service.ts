/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 世界运行时生命周期服务
 * 管理实例的创建、销毁、TTL 过期清理和世界启动/关闭流程
 */
import { Injectable } from '@nestjs/common';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import {
    logPrunedBuildingAudit,
    recoverVaultsBeforePlacementPrune,
    releaseTimeChambersBeforePlacementPrune,
} from './building-placement-prune.helpers';
import { registerManagedInstanceCatalog } from './world-runtime-instance-lease.helpers';

const {
    buildPublicInstanceId,
    buildRealInstanceId,
} = world_runtime_normalization_helpers_1;

const LONG_LIVED_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;
const TONGTIAN_TOWER_INSTANCE_PREFIX = 'tower:tongtian:layer:';
const STARTUP_CATALOG_REGISTRATION_BATCH_SIZE = 16;

function isExpectedMissingOfflineRuntimeInstance(instanceId) {
    return typeof instanceId === 'string' && instanceId.trim().startsWith(TONGTIAN_TOWER_INSTANCE_PREFIX);
}

function logOfflineRestoreMissingInstance(deps, instanceId, playerId) {
    const message = `offline_restore_skipped_instance_missing instance=${instanceId} player=${playerId}`;
    if (isExpectedMissingOfflineRuntimeInstance(instanceId)) {
        deps.logger?.log?.(message);
        return;
    }
    deps.logger?.warn?.(message);
}

/**
 * 激活仍有离线挂机玩家驻留的通天塔层。
 *
 * 通天塔启动时只恢复模板，避免把所有历史层都注册进 tick；这里只对玩家位置真源实际
 * 引用的层 fresh load catalog 并物化，在加载玩家前完成 lease、hydrate 与 gate 裁定。
 * 普通缺失实例不走这条路径，catalog 缺失时也不创建空白塔层。
 */
async function activateOfflinePlayerTowerInstances(deps, positions) {
    const towerService = deps.worldRuntimeTongtianTowerService;
    if (typeof towerService?.materializeLayerInstanceForRestore !== 'function') {
        return 0;
    }
    const instanceIds = Array.from(new Set((Array.isArray(positions) ? positions : [])
        .map((entry) => typeof entry?.instanceId === 'string' ? entry.instanceId.trim() : '')
        .filter((instanceId) => isExpectedMissingOfflineRuntimeInstance(instanceId))));
    const batchSize = 16;
    let failed = 0;
    for (let index = 0; index < instanceIds.length; index += batchSize) {
        const batch = instanceIds.slice(index, index + batchSize);
        await Promise.all(batch.map(async (instanceId) => {
            try {
                const existing = deps.getInstanceRuntime(instanceId);
                const existingReadiness = existing && typeof deps.instanceReadyForPlayerAttach === 'function'
                    ? deps.instanceReadyForPlayerAttach(instanceId)
                    : null;
                if (existing && existingReadiness?.ok === true) {
                    return;
                }
                const instance = await towerService.materializeLayerInstanceForRestore(
                    { instanceId },
                    deps,
                    { allowCreateIfMissing: false },
                );
                if (!instance) {
                    failed++;
                    deps.logger?.warn?.(`离线挂机通天塔实例按需物化失败：${instanceId}`);
                    return;
                }
                const attachReady = typeof deps.instanceReadyForPlayerAttach === 'function'
                    ? deps.instanceReadyForPlayerAttach(instance.meta.instanceId)
                    : { ok: true, reason: 'ready', instance };
                if (!attachReady.ok) {
                    failed++;
                    return;
                }
            } catch (error) {
                failed++;
                deps.logger?.warn?.(
                    `离线挂机通天塔实例按需物化异常：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }));
    }
    return failed;
}

async function persistBuildingRoomStateAfterStartupRecovery(deps, domainPersistenceService, instanceId, instance, hydrateResult) {
    const skippedCount = Math.max(0, Math.trunc(Number(hydrateResult?.skippedUnknownDefCount) || 0));
    const skippedProtectedPlacementCount = Math.max(0, Math.trunc(Number(hydrateResult?.skippedProtectedPlacementCount) || 0));
    const restoredSkippedBuildingTileCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.restoredSkippedBuildingTileCellCount) || 0));
    const repairedBuildingCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.repairedBuildingCellCount) || 0));
    const repairedBuildingVisualCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.repairedBuildingVisualCellCount) || 0));
    const restoredStaleBuildingVisualCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.restoredStaleBuildingVisualCellCount) || 0));
    const runtimeTileCellRecoveryCount = restoredSkippedBuildingTileCellCount
        + repairedBuildingVisualCellCount
        + restoredStaleBuildingVisualCellCount;
    if (skippedCount <= 0
        && skippedProtectedPlacementCount <= 0
        && restoredSkippedBuildingTileCellCount <= 0
        && repairedBuildingCellCount <= 0) {
        return;
    }
    if (typeof domainPersistenceService?.saveBuildingRoomFengShuiState === 'function') {
        const state = typeof instance?.buildBuildingRoomFengShuiPersistenceState === 'function'
            ? instance.buildBuildingRoomFengShuiPersistenceState()
            : {
                buildings: typeof instance?.buildBuildingPersistenceEntries === 'function' ? instance.buildBuildingPersistenceEntries() : [],
                rooms: typeof instance?.listRoomSummaries === 'function' ? instance.listRoomSummaries() : [],
                roomCells: [],
                fengShui: [],
        };
        await domainPersistenceService.saveBuildingRoomFengShuiState(instanceId, state);
    }
    if (runtimeTileCellRecoveryCount > 0 && typeof domainPersistenceService?.replaceRuntimeTileCells === 'function') {
        await domainPersistenceService.replaceRuntimeTileCells(
            instanceId,
            typeof instance?.buildRuntimeTilePersistenceEntries === 'function' ? instance.buildRuntimeTilePersistenceEntries() : [],
        );
    }
    if (skippedCount > 0) {
        deps.logger?.warn?.(`启动清理了 ${skippedCount} 个未知建筑定义实例：${instanceId}`);
    }
    if (skippedProtectedPlacementCount > 0) {
        deps.logger?.warn?.(`启动清理了 ${skippedProtectedPlacementCount} 个违规保护点位建筑：${instanceId}`);
    }
    if (restoredSkippedBuildingTileCellCount > 0) {
        deps.logger?.warn?.(`启动恢复了 ${restoredSkippedBuildingTileCellCount} 个违规建筑占用地块：${instanceId}`);
    }
    if (repairedBuildingCellCount > 0) {
        deps.logger?.warn?.(`启动修复了 ${repairedBuildingCellCount} 个失配建筑占格：${instanceId}`);
    }
}

/** world-runtime lifecycle seam：承接公共实例 bootstrap、持久化恢复与整体验证前 rebuild。 */
@Injectable()
export class WorldRuntimeLifecycleService {
    private offlineRestoreRetryAttempt = 0;
    private offlineRestoreRetryAt = 0;

    consumeOfflineRestoreRetry(): boolean {
        if (this.offlineRestoreRetryAt <= 0 || Date.now() < this.offlineRestoreRetryAt) {
            return false;
        }
        const delayMs = Math.min(5 * 60_000, 10_000 * (2 ** Math.min(this.offlineRestoreRetryAttempt, 5)));
        this.offlineRestoreRetryAttempt++;
        this.offlineRestoreRetryAt = Date.now() + delayMs;
        return true;
    }

    private updateOfflineRestoreRetry(towerActivationFailures: number): void {
        if (towerActivationFailures <= 0) {
            this.offlineRestoreRetryAttempt = 0;
            this.offlineRestoreRetryAt = 0;
            return;
        }
        if (this.offlineRestoreRetryAt <= 0) {
            this.offlineRestoreRetryAt = Date.now() + 10_000;
        }
    }
/**
 * bootstrapPublicInstances：执行引导PublicInstance相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新bootstrapPublicInstance相关状态。
 */

    bootstrapPublicInstances(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const template of deps.templateRepository.list()) {
            if (template?.source?.sectMap === true || String(template?.id ?? '').startsWith('sect_domain:')) {
                continue;
            }
            if (String(template?.id ?? '').startsWith('tongtian_tower_layer_')) {
                continue;
            }
            deps.createInstance({
                instanceId: buildPublicInstanceId(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
                linePreset: 'peaceful',
                lineIndex: 1,
                instanceOrigin: 'bootstrap',
                defaultEntry: true,
            });
            deps.createInstance({
                instanceId: buildRealInstanceId(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
                linePreset: 'real',
                lineIndex: 1,
                instanceOrigin: 'bootstrap',
                defaultEntry: true,
            });
        }
        deps.logger.log(`已初始化 ${deps.getInstanceCount()} 个默认地图实例`);
    }    
    /**
 * restorePublicInstancePersistence：判断restorePublicInstancePersistence是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新restorePublicInstancePersistence相关状态。
 */

    async restorePublicInstancePersistence(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const domainPersistenceService = deps.instanceDomainPersistenceService;
        const domainPersistenceEnabled = typeof domainPersistenceService?.isEnabled === 'function'
            && domainPersistenceService.isEnabled();
        let restoredFormationInstances = 0;
        let restoredFormationCount = 0;
        let restoredDomainInstances = 0;
        if (!domainPersistenceEnabled) {
            if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
                await deps.worldRuntimeSectService.restoreSects(deps, { ensureGuardianFormations: false });
            }
            for (const [instanceId, instance] of deps.listInstanceEntries()) {
                if (!instance.meta.persistent) {
                    continue;
                }
                if (!(await preparePersistentInstanceHydration(deps, instanceId, instance))) {
                    deps.logger?.warn?.(`实例未取得本地 lease，跳过持久化水合：${instanceId}`);
                    continue;
                }
                if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                    const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId, instance);
                    if (restoredFormations > 0) {
                        restoredFormationInstances += 1;
                        restoredFormationCount += restoredFormations;
                    }
                }
            }
            await restoreSectGuardiansAfterFormationRestore(deps);
            logInstanceRestoreSummary(deps, restoredDomainInstances, restoredFormationInstances, restoredFormationCount);
            return;
        }
        if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
            await deps.worldRuntimeSectService.restoreSects(deps, { ensureGuardianFormations: false });
        }
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (!instance.meta.persistent) {
                continue;
            }
            if (!(await preparePersistentInstanceHydration(deps, instanceId, instance))) {
                deps.logger?.warn?.(`实例未取得本地 lease，跳过持久化水合：${instanceId}`);
                continue;
            }
            if (domainPersistenceEnabled) {
                const watermark = await domainPersistenceService.loadInstanceRecoveryWatermark(instanceId);
                const runtimeTileCells = typeof domainPersistenceService.loadRuntimeTileCells === 'function'
                    ? await domainPersistenceService.loadRuntimeTileCells(instanceId)
                    : [];
                if (Array.isArray(runtimeTileCells) && runtimeTileCells.length > 0 && typeof instance.hydrateRuntimeTiles === 'function') {
                    instance.hydrateRuntimeTiles(runtimeTileCells);
                }
                const tileDiffs = await domainPersistenceService.loadTileResourceDiffs(instanceId);
                if (Array.isArray(tileDiffs) && tileDiffs.length > 0) {
                    instance.patchTileResources(tileDiffs);
                }
                const tileDamageStates = typeof domainPersistenceService.loadTileDamageStates === 'function'
                    ? await domainPersistenceService.loadTileDamageStates(instanceId)
                    : [];
                if (Array.isArray(tileDamageStates) && tileDamageStates.length > 0) {
                    instance.hydrateTileDamage(tileDamageStates);
                }
                const temporaryTileStates = typeof domainPersistenceService.loadTemporaryTileStates === 'function'
                    ? await domainPersistenceService.loadTemporaryTileStates(instanceId)
                    : [];
                if (Array.isArray(temporaryTileStates) && temporaryTileStates.length > 0 && typeof instance.hydrateTemporaryTiles === 'function') {
                    instance.hydrateTemporaryTiles(temporaryTileStates);
                }
                const groundItems = await domainPersistenceService.loadGroundItems(instanceId);
                if (Array.isArray(groundItems) && groundItems.length > 0) {
                    instance.hydrateGroundPiles(groupGroundItemsByTile(groundItems));
                }
                const containerStates = await domainPersistenceService.loadContainerStates(instanceId);
                deps.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, normalizeLoadedContainerStates(containerStates ?? []));
                const monsterStates = await domainPersistenceService.loadMonsterRuntimeStates(instanceId);
                instance.hydrateMonsterRuntimeStates(monsterStates ?? []);
                const eventStates = await domainPersistenceService.loadEventStates(instanceId);
                const overlayChunks = await domainPersistenceService.loadOverlayChunks(instanceId);
                if (Array.isArray(overlayChunks) && overlayChunks.length > 0 && typeof instance.hydrateOverlayChunks === 'function') {
                    instance.hydrateOverlayChunks(overlayChunks);
                }
                const buildingRoomFengShuiState = typeof domainPersistenceService.loadBuildingRoomFengShuiState === 'function'
                    ? await domainPersistenceService.loadBuildingRoomFengShuiState(instanceId)
                    : null;
                if (buildingRoomFengShuiState
                    && (buildingRoomFengShuiState.buildings?.length > 0
                        || buildingRoomFengShuiState.rooms?.length > 0
                        || buildingRoomFengShuiState.fengShui?.length > 0)
                    && typeof instance.hydrateBuildingRoomFengShuiState === 'function') {
                    // 先返还即将被摧毁的宝库库存：删除建筑行后就取不到 owner 了；返还失败的宝库豁免摧毁。
                    const keepBuildingIds = await recoverVaultsBeforePlacementPrune(deps, instanceId, instance, buildingRoomFengShuiState, deps?.logger);
                    const keptTimeChambers = await releaseTimeChambersBeforePlacementPrune(deps, instanceId, instance, buildingRoomFengShuiState, deps?.logger);
                    for (const buildingId of keptTimeChambers) keepBuildingIds.add(buildingId);
                    const hydrateResult = instance.hydrateBuildingRoomFengShuiState(buildingRoomFengShuiState, { keepBuildingIds });
                    logPrunedBuildingAudit(instanceId, hydrateResult, deps?.logger);
                    await persistBuildingRoomStateAfterStartupRecovery(deps, domainPersistenceService, instanceId, instance, hydrateResult);
                }
                const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
                if (checkpoint) {
                    hydrateInstanceFromCheckpoint(instance, checkpoint, deps, instanceId);
                }
                if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                    const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId, instance);
                    if (restoredFormations > 0) {
                        restoredFormationInstances += 1;
                        restoredFormationCount += restoredFormations;
                    }
                }
                if (watermark || (Array.isArray(eventStates) && eventStates.length > 0) || (Array.isArray(overlayChunks) && overlayChunks.length > 0) || checkpoint) {
                    restoredDomainInstances += 1;
                }
                continue;
            }
            if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId, instance);
                if (restoredFormations > 0) {
                    restoredFormationInstances += 1;
                    restoredFormationCount += restoredFormations;
                }
            }
        }
        await restoreSectGuardiansAfterFormationRestore(deps);
        logInstanceRestoreSummary(deps, restoredDomainInstances, restoredFormationInstances, restoredFormationCount);
    }    
    /**
 * rebuildPersistentRuntimeAfterRestore：判断rebuildPersistent运行态AfterRestore是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新rebuildPersistent运行态AfterRestore相关状态。
 */

    async rebuildPersistentRuntimeAfterRestore(deps, options: {
        restoreOfflinePlayers?: boolean;
        restoreInstanceDomains?: boolean;
        restoreCatalogInstances?: boolean;
    } = {}) {
        const restoreCatalogInstances = options.restoreCatalogInstances !== false;
        const restoreInstanceDomains = options.restoreInstanceDomains !== false;
        let towerResetStarted = false;
        deps.worldRuntimeInstanceLeaseReadinessService?.reset?.();
        try {
        if (deps.instanceCatalogService?.isEnabled?.()
            && restoreCatalogInstances
            && typeof deps.worldRuntimeTongtianTowerService?.resetLayerInstanceCache === 'function') {
            towerResetStarted = true;
            await deps.worldRuntimeTongtianTowerService.resetLayerInstanceCache(deps);
        }
        const catalogEntries = deps.instanceCatalogService?.isEnabled?.() && restoreCatalogInstances
            ? await deps.instanceCatalogService.listInstanceCatalogEntries?.()
            : [];
        if (deps.instanceCatalogService?.isEnabled?.() && restoreCatalogInstances) {
            if (typeof deps.worldRuntimeSectService?.restoreSectTemplates === 'function') {
                await deps.worldRuntimeSectService.restoreSectTemplates(deps);
            }
            for (const entry of Array.isArray(catalogEntries) ? catalogEntries : []) {
                const instanceId = typeof entry.instance_id === 'string' ? entry.instance_id.trim() : '';
                const templateId = typeof entry.template_id === 'string' ? entry.template_id.trim() : '';
                const towerRestored = typeof deps.worldRuntimeTongtianTowerService?.restoreCatalogTowerTemplate === 'function'
                    && deps.worldRuntimeTongtianTowerService.restoreCatalogTowerTemplate(entry, deps);
                if (towerRestored) {
                    if (shouldRestoreCatalogEntry(entry)
                        && typeof deps.worldRuntimeTongtianTowerService?.primeLayerInstanceCache === 'function') {
                        await deps.worldRuntimeTongtianTowerService.primeLayerInstanceCache(entry, deps);
                    }
                    continue;
                }
                if (!shouldRestoreCatalogEntry(entry)) {
                    continue;
                }
                if (!instanceId || !templateId) {
                    continue;
                }
                if (typeof deps.templateRepository?.has === 'function'
                    && !deps.templateRepository.has(templateId)
                    && typeof deps.worldRuntimeSectService?.restoreCatalogSectTemplate === 'function') {
                    deps.worldRuntimeSectService.restoreCatalogSectTemplate(entry, deps);
                }
                if (typeof deps.templateRepository?.has === 'function' && !deps.templateRepository.has(templateId)) {
                    await markMissingTemplateCatalogEntry(deps, entry, instanceId, templateId, '恢复');
                    continue;
                }
            }
        }
        deps.worldRuntimeInstanceStateService.resetState();
        deps.worldRuntimePlayerLocationService.resetState();
        deps.worldRuntimePendingCommandService.resetState();
        deps.worldRuntimeGmQueueService.resetState();
        deps.worldRuntimeNavigationService.reset();
        deps.worldRuntimeTickProgressService.resetState();
        deps.worldRuntimeLootContainerService.reset();
        deps.worldRuntimeCombatEffectsService.resetAll();
        this.bootstrapPublicInstances(deps);
        if (deps.instanceCatalogService?.isEnabled?.() && restoreCatalogInstances && restoreInstanceDomains === false) {
            await restoreCatalogInstanceShellsAfterReset(deps, catalogEntries);
        }
        if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
            await deps.worldRuntimeSectService.restoreSects(deps, {
                ensureGuardianFormations: false,
                applyRuntimeState: false,
            });
        }
        applyStartupCatalogMetadata(deps, catalogEntries);
        await registerStartupRuntimeCatalogEntries(deps);
        if (typeof deps.claimRecoverableCatalogInstances === 'function') {
            await deps.claimRecoverableCatalogInstances({
                allowForceReclaim: true,
                hydratePersistentSnapshot: false,
            });
        } else if (deps.instanceCatalogService?.isEnabled?.()) {
            throw new Error('startup_instance_catalog_claim_unavailable');
        }
        if (deps.instanceCatalogService?.isEnabled?.() && typeof deps.syncInstanceLease === 'function') {
            for (const [instanceId] of deps.listInstanceEntries()) {
                await deps.syncInstanceLease(instanceId, {
                    allowForceReclaim: true,
                    hydratePersistentSnapshot: false,
                });
            }
        } else if (deps.instanceCatalogService?.isEnabled?.()) {
            throw new Error('startup_instance_lease_sync_unavailable');
        }
        if (restoreInstanceDomains) {
            await this.restorePublicInstancePersistence(deps);
        }
        if (towerResetStarted) {
            deps.worldRuntimeTongtianTowerService?.completeLayerInstanceCacheReset?.();
            towerResetStarted = false;
        }
        if (options.restoreOfflinePlayers !== false) {
            await this.restoreOfflineHangingPlayers(deps);
        }
        } finally {
            if (towerResetStarted) {
                deps.worldRuntimeTongtianTowerService?.completeLayerInstanceCacheReset?.();
            }
        }
    }

    /**
     * 启动时恢复离线挂机玩家到对应实例。
     *
     * 约束：这条链路必须尽量复用在线玩家的实例接管/创建逻辑，
     * 仅保留两处差异：离线时不走网络通讯；玩家死亡后直接离线。
     */
    async restoreOfflineHangingPlayers(deps) {
        const result = {
            enabled: false,
            expired: 0,
            candidates: 0,
            restored: 0,
            skipped: 0,
            skippedByReason: {},
            skippedPlayers: [],
        };
        const markSkipped = (reason, entry = null, error = null) => {
            result.skipped++;
            result.skippedByReason[reason] = (Number(result.skippedByReason[reason]) || 0) + 1;
            if (entry && result.skippedPlayers.length < 25) {
                result.skippedPlayers.push({
                    playerId: typeof entry.playerId === 'string' ? entry.playerId : '',
                    targetInstanceId: typeof entry.instanceId === 'string' ? entry.instanceId : '',
                    reason,
                    x: Number.isFinite(Number(entry.x)) ? Math.trunc(Number(entry.x)) : null,
                    y: Number.isFinite(Number(entry.y)) ? Math.trunc(Number(entry.y)) : null,
                    errorMessage: error instanceof Error ? error.message : null,
                });
            }
        };
        const persistenceService = deps.playerRuntimeService?.playerDomainPersistenceService;
        if (!persistenceService?.isEnabled?.() || typeof persistenceService.listOfflineHangingPlayerPositions !== 'function') {
            return result;
        }
        result.enabled = true;
        const activeMonthCardPlayerIds = typeof deps.activityRuntimeService?.listActiveMonthCardPlayerIds === 'function'
            ? await deps.activityRuntimeService.listActiveMonthCardPlayerIds()
            : [];
        const eternalMonthCardPlayerIds = typeof deps.activityRuntimeService?.listEternalMonthCardPlayerIds === 'function'
            ? await deps.activityRuntimeService.listEternalMonthCardPlayerIds()
            : [];
        const baseOfflineTimeoutMs = 48 * 60 * 60 * 1000;
        const monthCardOfflineTimeoutMs = 72 * 60 * 60 * 1000;
        // 先将超过权益时长的离线玩家标记为彻底离线
        try {
            const expiredCount = await persistenceService.expireOfflineHangingPlayers(baseOfflineTimeoutMs, activeMonthCardPlayerIds, monthCardOfflineTimeoutMs, eternalMonthCardPlayerIds);
            result.expired = Number.isFinite(Number(expiredCount)) ? Math.max(0, Math.trunc(Number(expiredCount))) : 0;
            if (result.expired > 0) {
                deps.logger?.log?.(`离线挂机超时离场：${result.expired} 名玩家已标记为彻底离线`);
            }
        } catch (error) {
            markSkipped('expire_failed');
            deps.logger?.warn?.(`清理超时离线玩家失败：${error instanceof Error ? error.message : String(error)}`);
        }
        // 恢复未超时的离线挂机玩家
        let positions: Array<{ playerId: string; instanceId: string; x: number; y: number }>;
        try {
            positions = await persistenceService.listOfflineHangingPlayerPositions(baseOfflineTimeoutMs, activeMonthCardPlayerIds, monthCardOfflineTimeoutMs, eternalMonthCardPlayerIds);
        } catch (error) {
            markSkipped('query_failed');
            this.updateOfflineRestoreRetry(1);
            deps.logger?.warn?.(`查询离线挂机玩家位置失败：${error instanceof Error ? error.message : String(error)}`);
            return result;
        }
        result.candidates = Array.isArray(positions) ? positions.length : 0;
        if (!positions || positions.length === 0) {
            this.updateOfflineRestoreRetry(0);
            return result;
        }
        const towerActivationFailures = await activateOfflinePlayerTowerInstances(deps, positions);
        let restored = 0;
        let restoreFailures = 0;
        const BATCH_SIZE = 50;
        for (let i = 0; i < positions.length; i += BATCH_SIZE) {
            const batch = positions.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (entry) => {
                try {
                    if (isOfflinePlayerAlreadyAttached(deps, entry.playerId)) {
                        const runtimeFence = deps.playerRuntimeService?.getSessionFence?.(entry.playerId);
                        const localNodeId = deps.nodeRegistryService?.getNodeId?.();
                        if (!runtimeFence?.sessionEpoch
                            || typeof localNodeId !== 'string'
                            || !localNodeId.trim()
                            || typeof deps.worldRuntimePlayerSessionService?.assignPlayerRoute !== 'function') {
                            throw new Error('offline_route_repair_unavailable');
                        }
                        await deps.worldRuntimePlayerSessionService.assignPlayerRoute({
                            playerId: entry.playerId,
                            nodeId: localNodeId.trim(),
                            sessionEpoch: runtimeFence.sessionEpoch,
                            routeStatus: 'offline',
                        });
                        markSkipped('already_attached', entry);
                        return;
                    }
                    const attachReady = typeof deps.instanceReadyForPlayerAttach === 'function'
                        ? deps.instanceReadyForPlayerAttach(entry.instanceId)
                        : { ok: true, reason: 'ready' };
                    if (!attachReady.ok) {
                        const reason = typeof attachReady.reason === 'string' && attachReady.reason.trim() ? attachReady.reason.trim() : 'attach_not_ready';
                        markSkipped(reason, entry);
                        if (reason === 'instance_missing') {
                            logOfflineRestoreMissingInstance(deps, entry.instanceId, entry.playerId);
                        } else if (reason === 'attach_gate_closed') {
                            deps.logger?.warn?.(`offline_restore_skipped_startup_attach_gate instance=${entry.instanceId} player=${entry.playerId}`);
                        } else if (reason === 'lease_not_local') {
                            deps.logger?.warn?.(`offline_restore_skipped_lease_not_local instance=${entry.instanceId} player=${entry.playerId}`);
                        } else {
                            deps.logger?.warn?.(`offline_restore_skipped_attach_not_ready instance=${entry.instanceId} player=${entry.playerId} reason=${reason}`);
                        }
                        return;
                    }
                    const instance = attachReady.instance ?? deps.getInstanceRuntime(entry.instanceId);
                    if (!instance) {
                        markSkipped('instance_missing', entry);
                        logOfflineRestoreMissingInstance(deps, entry.instanceId, entry.playerId);
                        return;
                    }
                    if (typeof deps.worldRuntimePlayerSessionService?.connectPlayer !== 'function') {
                        markSkipped('session_service_missing', entry);
                        deps.logger?.warn?.(`offline_restore_skipped_session_service_missing instance=${entry.instanceId} player=${entry.playerId}`);
                        return;
                    }
                    // 先裁定实例 lease，再加载并认领玩家；多节点启动扫描不能在 lease 判定前互抢 owner。
                    const player = await deps.playerRuntimeService.restoreOfflineHangingPlayer(
                        entry.playerId,
                        persistenceService,
                    );
                    if (!player) {
                        markSkipped('player_snapshot_missing', entry);
                        return;
                    }
                    if (hasOnlinePlayerSession(deps, entry.playerId, player)) {
                        markSkipped('player_became_online', entry);
                        return;
                    }
                    const runtimeFence = typeof deps.playerRuntimeService.ensureRuntimeOwnershipClaimed === 'function'
                        ? await deps.playerRuntimeService.ensureRuntimeOwnershipClaimed(entry.playerId)
                        : deps.playerRuntimeService.getSessionFence?.(entry.playerId);
                    if (!runtimeFence?.runtimeOwnerId || !runtimeFence?.sessionEpoch) {
                        markSkipped('runtime_ownership_claim_failed', entry);
                        deps.logger?.warn?.(`offline_restore_skipped_runtime_ownership_claim_failed instance=${entry.instanceId} player=${entry.playerId}`);
                        deps.playerRuntimeService.removePlayerRuntime?.(entry.playerId);
                        return;
                    }
                    // 认领 ownership 需要等待数据库；等待期间若登录链已绑定在线 session，
                    // 离线恢复不能复用该在线 fence 再把实例位置和 route 覆盖成 offline。
                    // 最后一次检查后到同步 connectPlayer 之间没有 await，保证本节点事件循环内不可插入登录。
                    if (hasOnlinePlayerSession(deps, entry.playerId, player)) {
                        markSkipped('player_became_online', entry);
                        return;
                    }
                    const requestedMapId = typeof player?.templateId === 'string' && player.templateId.trim()
                        ? player.templateId.trim()
                        : undefined;
                    deps.worldRuntimePlayerSessionService.connectPlayer({
                        playerId: entry.playerId,
                        sessionId: null,
                        instanceId: instance.meta.instanceId,
                        mapId: requestedMapId,
                        preferredX: entry.x,
                        preferredY: entry.y,
                        allowCreateFallback: false,
                    }, deps);
                    const localNodeId = deps.nodeRegistryService?.getNodeId?.();
                    if (
                        typeof localNodeId === 'string'
                        && localNodeId.trim()
                        && typeof deps.worldRuntimePlayerSessionService.assignPlayerRoute === 'function'
                    ) {
                        await deps.worldRuntimePlayerSessionService.assignPlayerRoute({
                            playerId: entry.playerId,
                            nodeId: localNodeId.trim(),
                            sessionEpoch: runtimeFence.sessionEpoch,
                            routeStatus: 'offline',
                        });
                    }
                    restored++;
                } catch (error) {
                    restoreFailures++;
                    markSkipped('restore_error', entry, error);
                    deps.logger?.warn?.(
                        `恢复离线挂机玩家失败：${entry.playerId} ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }));
        }
        this.updateOfflineRestoreRetry(towerActivationFailures + restoreFailures);
        result.restored = restored;
        if (restored > 0 || result.skipped > 0) {
            deps.logger?.log?.(`离线挂机玩家恢复完成：成功 ${restored}，跳过 ${result.skipped}，总计 ${positions.length}`);
        }
        return result;
    }
};

function hasOnlinePlayerSession(deps, playerId, fallbackPlayer = null) {
    const runtimePlayer = deps.playerRuntimeService?.getPlayer?.(playerId) ?? fallbackPlayer;
    if (typeof runtimePlayer?.sessionId === 'string' && runtimePlayer.sessionId.trim()) {
        return true;
    }
    const location = deps.getPlayerLocation?.(playerId);
    return typeof location?.sessionId === 'string' && location.sessionId.trim().length > 0;
}

function isOfflinePlayerAlreadyAttached(deps, playerId) {
    const runtimePlayer = deps.playerRuntimeService?.getPlayer?.(playerId);
    const location = deps.getPlayerLocation?.(playerId);
    const instance = typeof location?.instanceId === 'string'
        ? deps.getInstanceRuntime?.(location.instanceId)
        : null;
    return runtimePlayer?.sessionId === null
        && location?.sessionId === null
        && typeof instance?.getPlayerPosition === 'function'
        && instance.getPlayerPosition(playerId) != null;
}

function shouldRestoreCatalogEntry(entry) {
    if (entry?.status === 'destroyed'
        || entry?.runtime_status === 'stopped'
        || entry?.runtime_status === 'creating') {
        return false;
    }
    const destroyAt = entry?.destroy_at ? new Date(entry.destroy_at).getTime() : 0;
    if (Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now()) {
        return false;
    }
    const persistentPolicy = normalizePersistentPolicy(entry?.persistent_policy);
    if (persistentPolicy === 'persistent') {
        return true;
    }
    if (persistentPolicy !== 'long_lived') {
        return false;
    }
    const lastActiveAt = entry?.last_active_at ? new Date(entry.last_active_at).getTime() : 0;
    if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) {
        return false;
    }
    return Date.now() - lastActiveAt <= LONG_LIVED_INSTANCE_TTL_MS;
}

async function markMissingTemplateCatalogEntry(deps, entry, instanceId, templateId, phase) {
    if (entry?.runtime_status === 'template_missing') {
        return;
    }
    if (typeof deps.instanceCatalogService?.markInstanceTemplateMissing !== 'function') {
        deps.logger.warn(`实例目录引用的地图模板不存在，跳过${phase}：${instanceId} -> ${templateId}`);
        return;
    }
    const changed = await deps.instanceCatalogService.markInstanceTemplateMissing({ instanceId, templateId });
    if (changed) {
        deps.logger.warn(`实例目录引用的地图模板不存在，已标记为待内容恢复：${instanceId} -> ${templateId}`);
    }
}

function logInstanceRestoreSummary(deps, restoredDomainInstances, restoredFormationInstances, restoredFormationCount) {
    if (restoredDomainInstances <= 0 && restoredFormationInstances <= 0) {
        return;
    }
    deps.logger.log(
        `实例持久化恢复完成：分域回填 ${restoredDomainInstances} 个实例，阵法恢复 ${restoredFormationCount} 个 / ${restoredFormationInstances} 个实例`,
    );
}

async function restoreSectGuardiansAfterFormationRestore(deps) {
    if (typeof deps.worldRuntimeSectService?.restoreSects !== 'function') {
        return;
    }
    await deps.worldRuntimeSectService.restoreSects(deps, { ensureGuardianFormations: true });
}

function canHydratePersistentInstance(deps, instance) {
    if (!deps.instanceCatalogService?.isEnabled?.()) {
        return true;
    }
    const nodeId = typeof deps.nodeRegistryService?.getNodeId === 'function'
        ? String(deps.nodeRegistryService.getNodeId()).trim()
        : '';
    const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string'
        ? instance.meta.assignedNodeId.trim()
        : '';
    const leaseToken = typeof instance?.meta?.leaseToken === 'string'
        ? instance.meta.leaseToken.trim()
        : '';
    const leaseExpireAt = instance?.meta?.leaseExpireAt
        ? new Date(instance.meta.leaseExpireAt).getTime()
        : 0;
    const ownershipEpoch = Number(instance?.meta?.ownershipEpoch);
    return instance?.meta?.runtimeStatus === 'leased'
        && Boolean(nodeId)
        && assignedNodeId === nodeId
        && Boolean(leaseToken)
        && Number.isFinite(leaseExpireAt)
        && leaseExpireAt > Date.now()
        && Number.isSafeInteger(ownershipEpoch)
        && ownershipEpoch >= 0;
}

async function preparePersistentInstanceHydration(deps, instanceId, instance) {
    if (!deps.instanceCatalogService?.isEnabled?.()) {
        return true;
    }
    if (typeof deps.syncInstanceLease !== 'function') {
        return false;
    }
    try {
        // 启动可能恢复上万实例；首轮统一 claim 后，逐实例在真正水合前续租，避免前排 lease
        // 在长队列中先过期，导致后续清理/回写落在无所有权窗口。
        await deps.syncInstanceLease(instanceId, {
            allowForceReclaim: true,
            hydratePersistentSnapshot: false,
        });
    } catch (error) {
        deps.logger?.warn?.(
            `实例水合前续租失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
    }
    return canHydratePersistentInstance(deps, instance);
}

function applyStartupCatalogMetadata(deps, catalogEntries) {
    if (!deps.instanceCatalogService?.isEnabled?.()) {
        return;
    }
    const entriesByInstanceId = new Map();
    for (const entry of Array.isArray(catalogEntries) ? catalogEntries : []) {
        const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
        if (instanceId) {
            entriesByInstanceId.set(instanceId, entry);
        }
    }
    for (const [instanceId, instance] of deps.listInstanceEntries?.() ?? []) {
        const entry = entriesByInstanceId.get(instanceId);
        if (!entry || !instance?.meta) {
            continue;
        }
        instance.meta.assignedNodeId = typeof entry.assigned_node_id === 'string'
            ? entry.assigned_node_id
            : null;
        instance.meta.leaseToken = typeof entry.lease_token === 'string'
            ? entry.lease_token
            : null;
        instance.meta.leaseExpireAt = normalizeCatalogTimestamp(entry.lease_expire_at);
        instance.meta.ownershipEpoch = Math.max(
            normalizeCatalogOwnershipEpoch(instance.meta.ownershipEpoch),
            normalizeCatalogOwnershipEpoch(entry.ownership_epoch),
        );
        instance.meta.runtimeStatus = entry.runtime_status === 'template_missing'
            ? 'running'
            : (typeof entry.runtime_status === 'string' ? entry.runtime_status : instance.meta.runtimeStatus);
        if (typeof entry.cluster_id === 'string') instance.meta.clusterId = entry.cluster_id;
        if (typeof entry.shard_key === 'string' && entry.shard_key.trim()) instance.meta.shardKey = entry.shard_key;
        if (typeof entry.route_domain === 'string') instance.meta.routeDomain = entry.route_domain;
        instance.meta.destroyAt = normalizeCatalogTimestamp(entry.destroy_at);
        instance.meta.lastActiveAt = normalizeCatalogTimestamp(entry.last_active_at);
        instance.meta.lastPersistedAt = normalizeCatalogTimestamp(entry.last_persisted_at);
    }
}

function normalizeCatalogOwnershipEpoch(value) {
    const epoch = Number(value);
    return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}

function normalizeCatalogTimestamp(value) {
    if (!value) {
        return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function registerStartupRuntimeCatalogEntries(deps) {
    if (!deps.instanceCatalogService?.isEnabled?.()) {
        return;
    }
    const entries = Array.from(deps.listInstanceEntries?.() ?? []) as Array<[string, any]>;
    for (let index = 0; index < entries.length; index += STARTUP_CATALOG_REGISTRATION_BATCH_SIZE) {
        const batch = entries.slice(index, index + STARTUP_CATALOG_REGISTRATION_BATCH_SIZE);
        await Promise.all(batch.map(([instanceId, instance]) => (
            registerManagedInstanceCatalog(deps, instanceId, instance)
        )));
    }
}

async function restoreCatalogInstanceShellsAfterReset(deps, catalogEntries) {
    for (const entry of Array.isArray(catalogEntries) ? catalogEntries : []) {
        const instanceId = typeof entry.instance_id === 'string' ? entry.instance_id.trim() : '';
        const templateId = typeof entry.template_id === 'string' ? entry.template_id.trim() : '';
        if (!shouldRestoreCatalogEntry(entry) || !instanceId || !templateId || deps.getInstanceRuntime(instanceId)) {
            continue;
        }
        if (typeof deps.templateRepository?.has === 'function'
            && !deps.templateRepository.has(templateId)
            && typeof deps.worldRuntimeSectService?.restoreCatalogSectTemplate === 'function') {
            deps.worldRuntimeSectService.restoreCatalogSectTemplate(entry, deps);
        }
        if (typeof deps.templateRepository?.has === 'function' && !deps.templateRepository.has(templateId)) {
            await markMissingTemplateCatalogEntry(deps, entry, instanceId, templateId, '轻量启动');
            continue;
        }
        const descriptor = parseRuntimeInstanceDescriptorForStartup(instanceId);
        deps.createInstance({
            instanceId,
            templateId,
            kind: typeof entry.instance_type === 'string' && entry.instance_type.trim() ? entry.instance_type.trim() : 'public',
            persistent: true,
            linePreset: descriptor?.linePreset ?? (entry.route_domain === 'real' ? 'real' : 'peaceful'),
            lineIndex: descriptor?.lineIndex ?? 1,
            instanceOrigin: descriptor?.instanceOrigin ?? 'catalog',
            defaultEntry: descriptor?.defaultEntry !== false,
            ownerPlayerId: typeof entry.owner_player_id === 'string' ? entry.owner_player_id : null,
            ownerSectId: typeof entry.owner_sect_id === 'string' ? entry.owner_sect_id : null,
            partyId: typeof entry.party_id === 'string' ? entry.party_id : null,
            status: typeof entry.status === 'string' ? entry.status : 'active',
            runtimeStatus: entry.runtime_status === 'template_missing'
                ? 'running'
                : (typeof entry.runtime_status === 'string' ? entry.runtime_status : 'running'),
            assignedNodeId: typeof entry.assigned_node_id === 'string' ? entry.assigned_node_id : null,
            leaseToken: typeof entry.lease_token === 'string' ? entry.lease_token : null,
            leaseExpireAt: entry.lease_expire_at ? new Date(entry.lease_expire_at).toISOString() : null,
            ownershipEpoch: Number.isFinite(Number(entry.ownership_epoch)) ? Math.trunc(Number(entry.ownership_epoch)) : 0,
            clusterId: typeof entry.cluster_id === 'string' ? entry.cluster_id : null,
            shardKey: typeof entry.shard_key === 'string' && entry.shard_key.trim() ? entry.shard_key.trim() : instanceId,
            routeDomain: typeof entry.route_domain === 'string' ? entry.route_domain : null,
            destroyAt: entry.destroy_at ? new Date(entry.destroy_at).toISOString() : null,
            lastActiveAt: entry.last_active_at ? new Date(entry.last_active_at).toISOString() : null,
            lastPersistedAt: entry.last_persisted_at ? new Date(entry.last_persisted_at).toISOString() : null,
        });
    }
}

function parseRuntimeInstanceDescriptorForStartup(instanceId) {
    const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (normalized.startsWith('real:')) {
        return { linePreset: 'real', lineIndex: 1, instanceOrigin: 'bootstrap', defaultEntry: true };
    }
    if (normalized.startsWith('public:')) {
        return { linePreset: 'peaceful', lineIndex: 1, instanceOrigin: 'bootstrap', defaultEntry: true };
    }
    return null;
}

function normalizeLoadedContainerStates(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
        const payload = row?.statePayload && typeof row.statePayload === 'object' ? row.statePayload : {};
        return {
            ...payload,
            sourceId: typeof row?.sourceId === 'string' && row.sourceId.trim() ? row.sourceId : payload.sourceId,
            containerId: typeof row?.containerId === 'string' && row.containerId.trim() ? row.containerId : payload.containerId,
        };
    });
}
function normalizePersistentPolicy(value) {
    return value === 'persistent' || value === 'long_lived' || value === 'session' || value === 'ephemeral'
        ? value
        : 'persistent';
}
/** groupGroundItemsByTile：按地块归并地面物品。 */
function groupGroundItemsByTile(items) {
    const piles = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const tileIndex = Number.isFinite(Number(item?.tileIndex)) ? Math.trunc(Number(item.tileIndex)) : -1;
        if (tileIndex < 0) {
            continue;
        }
        const current = piles.get(tileIndex) ?? {
            tileIndex,
            items: [],
        };
        const payload = item.itemPayload && typeof item.itemPayload === 'object' ? item.itemPayload : {};
        current.items.push(payload);
        piles.set(tileIndex, current);
    }
    return Array.from(piles.values(), (pile) => ({
        tileIndex: pile.tileIndex,
        items: pile.items,
    }));
}

function hydrateInstanceFromCheckpoint(instance, checkpoint, deps, instanceId) {
    if (!checkpoint || typeof checkpoint !== 'object') {
        return;
    }
    const snapshot = resolveCheckpointSnapshot(checkpoint);
    if (!snapshot) {
        return;
    }
    const tickSpeed = snapshot.tickSpeed;
    const paused = snapshot.paused;
    if (typeof instance.hydrateTime === 'function') {
        instance.hydrateTime(snapshot.tick, {
            tickSpeed,
            paused,
        });
    }
    // 恢复通天塔波次状态
    if (snapshot.dungeonState && typeof snapshot.dungeonState === 'object') {
        instance.tongtianTowerState = snapshot.dungeonState;
    }
    // Phase 5：根据 dungeonDescriptor.type 确保模板生成器已注册
    if (snapshot.dungeonDescriptor && typeof snapshot.dungeonDescriptor === 'object') {
        const descriptor = snapshot.dungeonDescriptor;
        if (descriptor.type === 'tower' && typeof deps.worldRuntimeTongtianTowerService?.restoreCatalogTowerTemplate === 'function') {
            const params = descriptor.params;
            const layer = params && Number.isFinite(Number(params.layer)) ? Math.trunc(Number(params.layer)) : 0;
            if (layer > 0) {
                deps.worldRuntimeTongtianTowerService.restoreCatalogTowerTemplate(
                    { template_id: `tongtian_tower_layer_${layer}`, instance_id: instanceId },
                    deps,
                );
            }
        }
        // 后续秘境类型在此扩展：random_cave、trial 等
    }
    void instanceId;
}

function resolveCheckpointSnapshot(checkpoint) {
    if (!checkpoint || typeof checkpoint !== 'object') {
        return null;
    }
    if (checkpoint.snapshot && typeof checkpoint.snapshot === 'object') {
        return checkpoint.snapshot;
    }
    return checkpoint;
}
