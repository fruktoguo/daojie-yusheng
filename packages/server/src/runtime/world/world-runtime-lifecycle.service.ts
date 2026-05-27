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

const {
    buildPublicInstanceId,
    buildRealInstanceId,
} = world_runtime_normalization_helpers_1;

const LONG_LIVED_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;
const TONGTIAN_TOWER_INSTANCE_PREFIX = 'tower:tongtian:layer:';

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

/** world-runtime lifecycle seam：承接公共实例 bootstrap、持久化恢复与整体验证前 rebuild。 */
@Injectable()
export class WorldRuntimeLifecycleService {
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
                await deps.worldRuntimeSectService.restoreSects(deps);
            }
            for (const [instanceId, instance] of deps.listInstanceEntries()) {
                if (!instance.meta.persistent) {
                    continue;
                }
                if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                    const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
                    if (restoredFormations > 0) {
                        restoredFormationInstances += 1;
                        restoredFormationCount += restoredFormations;
                    }
                }
            }
            logInstanceRestoreSummary(deps, restoredDomainInstances, restoredFormationInstances, restoredFormationCount);
            return;
        }
        if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
            await deps.worldRuntimeSectService.restoreSects(deps);
        }
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (!instance.meta.persistent) {
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
                    instance.hydrateBuildingRoomFengShuiState(buildingRoomFengShuiState);
                }
                const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
                if (checkpoint) {
                    hydrateInstanceFromCheckpoint(instance, checkpoint, deps, instanceId);
                }
                if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                    const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
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
                const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
                if (restoredFormations > 0) {
                    restoredFormationInstances += 1;
                    restoredFormationCount += restoredFormations;
                }
            }
        }
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
        rewriteCatalogRuntimeStatus?: boolean;
    } = {}) {
        const restoreCatalogInstances = options.restoreCatalogInstances !== false;
        const restoreInstanceDomains = options.restoreInstanceDomains !== false;
        const rewriteCatalogRuntimeStatus = options.rewriteCatalogRuntimeStatus !== false;
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
                    if (typeof deps.worldRuntimeTongtianTowerService?.primeLayerInstanceCache === 'function') {
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
                if (deps.getInstanceRuntime(instanceId)) {
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
                deps.createInstance({
                    instanceId,
                    templateId,
                    kind: typeof entry.instance_type === 'string' && entry.instance_type.trim() ? entry.instance_type.trim() : 'public',
                    persistent: true,
                    linePreset: entry.route_domain === 'real' ? 'real' : 'peaceful',
                    lineIndex: 1,
                    instanceOrigin: 'catalog',
                    defaultEntry: false,
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
        if (deps.instanceCatalogService?.isEnabled?.() && rewriteCatalogRuntimeStatus) {
            for (const [instanceId, instance] of deps.listInstanceEntries()) {
                const kind = typeof instance?.kind === 'string' && instance.kind.trim() ? instance.kind.trim() : 'public';
                const templateId = instance?.template?.id ?? instance?.templateId ?? '';
                const shardKey = instance?.meta?.shardKey ?? instanceId;
                await deps.instanceCatalogService.updateInstanceStatus(instanceId, 'destroyed', 'stopped');
                await deps.instanceCatalogService.upsertInstanceCatalog({
                    instanceId,
                    templateId,
                    instanceType: kind,
                    persistentPolicy: normalizePersistentPolicy(
                        instance?.meta?.persistentPolicy
                        ?? (instance?.meta?.persistent === true || instance?.persistent === true ? 'persistent' : 'ephemeral'),
                    ),
                    ownerPlayerId: instance?.meta?.ownerPlayerId ?? null,
                    ownerSectId: instance?.meta?.ownerSectId ?? null,
                    partyId: instance?.meta?.partyId ?? null,
                    lineId: instance?.meta?.lineId ?? null,
                    status: 'destroyed',
                    runtimeStatus: 'stopped',
                    assignedNodeId: instance?.meta?.assignedNodeId ?? null,
                    leaseToken: null,
                    leaseExpireAt: null,
                    ownershipEpoch: instance?.meta?.ownershipEpoch ?? 0,
                    clusterId: instance?.meta?.clusterId ?? null,
                    shardKey,
                    routeDomain: instance?.meta?.routeDomain ?? null,
                    destroyAt: instance?.meta?.destroyAt ?? null,
                    lastActiveAt: instance?.meta?.lastActiveAt ?? null,
                    lastPersistedAt: instance?.meta?.lastPersistedAt ?? null,
                });
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
            await deps.worldRuntimeSectService.restoreSects(deps);
        }
        if (restoreInstanceDomains) {
            await this.restorePublicInstancePersistence(deps);
        }
        if (typeof deps.claimRecoverableCatalogInstances === 'function') {
            await deps.claimRecoverableCatalogInstances({
                allowForceReclaim: true,
                hydratePersistentSnapshot: restoreInstanceDomains,
            });
        }
        if (deps.instanceCatalogService?.isEnabled?.() && typeof deps.syncInstanceLease === 'function') {
            for (const [instanceId] of deps.listInstanceEntries()) {
                await deps.syncInstanceLease(instanceId, { allowForceReclaim: true });
            }
        }
        if (options.restoreOfflinePlayers !== false) {
            await this.restoreOfflineHangingPlayers(deps);
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
        const baseOfflineTimeoutMs = 48 * 60 * 60 * 1000;
        const monthCardOfflineTimeoutMs = 72 * 60 * 60 * 1000;
        // 先将超过权益时长的离线玩家标记为彻底离线
        try {
            const expiredCount = await persistenceService.expireOfflineHangingPlayers(baseOfflineTimeoutMs, activeMonthCardPlayerIds, monthCardOfflineTimeoutMs);
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
            positions = await persistenceService.listOfflineHangingPlayerPositions(baseOfflineTimeoutMs, activeMonthCardPlayerIds, monthCardOfflineTimeoutMs);
        } catch (error) {
            markSkipped('query_failed');
            deps.logger?.warn?.(`查询离线挂机玩家位置失败：${error instanceof Error ? error.message : String(error)}`);
            return result;
        }
        result.candidates = Array.isArray(positions) ? positions.length : 0;
        if (!positions || positions.length === 0) {
            return result;
        }
        let restored = 0;
        const BATCH_SIZE = 50;
        for (let i = 0; i < positions.length; i += BATCH_SIZE) {
            const batch = positions.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (entry) => {
                try {
                    const player = await deps.playerRuntimeService.restoreOfflineHangingPlayer(
                        entry.playerId,
                        persistenceService,
                    );
                    if (!player) {
                        markSkipped('player_snapshot_missing', entry);
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
                    restored++;
                } catch (error) {
                    markSkipped('restore_error', entry, error);
                    deps.logger?.warn?.(
                        `恢复离线挂机玩家失败：${entry.playerId} ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }));
        }
        result.restored = restored;
        if (restored > 0 || result.skipped > 0) {
            deps.logger?.log?.(`离线挂机玩家恢复完成：成功 ${restored}，跳过 ${result.skipped}，总计 ${positions.length}`);
        }
        return result;
    }
};

function shouldRestoreCatalogEntry(entry) {
    if (entry?.status === 'destroyed' || entry?.runtime_status === 'stopped') {
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
