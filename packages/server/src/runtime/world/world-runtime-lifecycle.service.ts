// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeLifecycleService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const {
    buildPublicInstanceId,
    buildRealInstanceId,
} = world_runtime_normalization_helpers_1;

const LONG_LIVED_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;

/** world-runtime lifecycle seam：承接公共实例 bootstrap、持久化恢复与整体验证前 rebuild。 */
let WorldRuntimeLifecycleService = class WorldRuntimeLifecycleService {
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
        if (!deps.mapPersistenceService.isEnabled() && !domainPersistenceEnabled) {
            if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
                await deps.worldRuntimeSectService.restoreSects(deps);
            }
            return;
        }
        if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
            await deps.worldRuntimeSectService.restoreSects(deps);
        }
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (!instance.meta.persistent) {
                continue;
            }
            const legacySnapshot = deps.mapPersistenceService.isEnabled() && isLegacyMapSnapshotRestoreEnabled()
                ? await deps.mapPersistenceService.loadMapSnapshot(instanceId)
                : null;
            if (legacySnapshot) {
                hydrateInstanceFromCheckpoint(instance, legacySnapshot, deps, instanceId);
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
                    instance.patchTileResources(tileDiffs.map((entry) => ({
                        resourceKey: entry.resourceKey,
                        tileIndex: entry.tileIndex,
                        value: entry.value,
                    })));
                }
                const tileDamageStates = typeof domainPersistenceService.loadTileDamageStates === 'function'
                    ? await domainPersistenceService.loadTileDamageStates(instanceId)
                    : [];
                if (Array.isArray(tileDamageStates) && tileDamageStates.length > 0) {
                    instance.hydrateTileDamage(tileDamageStates);
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
                const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
                if (checkpoint) {
                    hydrateInstanceFromCheckpoint(instance, checkpoint, deps, instanceId);
                }
                if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                    const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
                    if (restoredFormations > 0) {
                        deps.logger.log(`实例阵法已恢复：${instanceId} x${restoredFormations}`);
                    }
                }
                if (legacySnapshot || watermark || (Array.isArray(eventStates) && eventStates.length > 0) || (Array.isArray(overlayChunks) && overlayChunks.length > 0) || checkpoint) {
                    deps.logger.log(`实例分域恢复已回填：${instanceId}`);
                }
                continue;
            }
            if (typeof deps.worldRuntimeFormationService?.restoreInstanceFormations === 'function') {
                const restoredFormations = await deps.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
                if (restoredFormations > 0) {
                    deps.logger.log(`实例阵法已恢复：${instanceId} x${restoredFormations}`);
                }
            }
            if (legacySnapshot) {
                deps.logger.log(`实例地图快照已恢复：${instanceId}`);
            }
        }
    }    
    /**
 * rebuildPersistentRuntimeAfterRestore：判断rebuildPersistent运行态AfterRestore是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新rebuildPersistent运行态AfterRestore相关状态。
 */

    async rebuildPersistentRuntimeAfterRestore(deps) {
        if (deps.instanceCatalogService?.isEnabled?.()) {
            if (typeof deps.worldRuntimeSectService?.restoreSectTemplates === 'function') {
                await deps.worldRuntimeSectService.restoreSectTemplates(deps);
            }
            const catalogEntries = await deps.instanceCatalogService.listInstanceCatalogEntries?.();
            for (const entry of Array.isArray(catalogEntries) ? catalogEntries : []) {
                if (!shouldRestoreCatalogEntry(entry)) {
                    continue;
                }
                const instanceId = typeof entry.instance_id === 'string' ? entry.instance_id.trim() : '';
                const templateId = typeof entry.template_id === 'string' ? entry.template_id.trim() : '';
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
                    deps.logger.warn(`实例目录引用的地图模板不存在，跳过恢复：${instanceId} -> ${templateId}`);
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
                    runtimeStatus: typeof entry.runtime_status === 'string' ? entry.runtime_status : 'running',
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
        if (typeof deps.worldRuntimeSectService?.restoreSects === 'function') {
            await deps.worldRuntimeSectService.restoreSects(deps);
        }
        await this.restorePublicInstancePersistence(deps);
    }
};
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService;
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeLifecycleService);

export { WorldRuntimeLifecycleService };
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

function isLegacyMapSnapshotRestoreEnabled() {
    const value = process.env.SERVER_MAP_LEGACY_SNAPSHOT_RESTORE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
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
        current.items.push({
            ...payload,
            itemId: typeof payload.itemId === 'string' ? payload.itemId : 'unknown',
            name: typeof payload.name === 'string' ? payload.name : undefined,
            count: Number.isFinite(Number(payload.count)) ? Math.max(1, Math.trunc(Number(payload.count))) : 1,
            grade: typeof payload.grade === 'string' ? payload.grade : undefined,
            type: typeof payload.type === 'string' ? payload.type : undefined,
        });
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
    if (typeof instance.hydrateTime === 'function') {
        instance.hydrateTime(snapshot.tick);
    }
    if (Array.isArray(snapshot.runtimeTileEntries) && typeof instance.hydrateRuntimeTiles === 'function') {
        instance.hydrateRuntimeTiles(snapshot.runtimeTileEntries);
    }
    if (Array.isArray(snapshot.tileResourceEntries) && snapshot.tileResourceEntries.length > 0) {
        instance.hydrateTileResources(snapshot.tileResourceEntries.map((entry) => ({
            resourceKey: typeof entry?.resourceKey === 'string' ? entry.resourceKey : '',
            tileIndex: Number.isFinite(Number(entry?.tileIndex)) ? Math.trunc(Number(entry.tileIndex)) : 0,
            value: Number.isFinite(Number(entry?.value)) ? Math.max(0, Math.trunc(Number(entry.value))) : 0,
        })).filter((entry) => entry.resourceKey));
    } else if (Array.isArray(snapshot.auraEntries) && snapshot.auraEntries.length > 0) {
        instance.hydrateTileResources(snapshot.auraEntries.map((entry) => ({
            resourceKey: 'aura.refined.neutral',
            tileIndex: Number.isFinite(Number(entry?.tileIndex)) ? Math.trunc(Number(entry.tileIndex)) : 0,
            value: Number.isFinite(Number(entry?.value)) ? Math.max(0, Math.trunc(Number(entry.value))) : 0,
        })).filter((entry) => entry.value > 0));
    }
    if (Array.isArray(snapshot.tileDamageEntries) && typeof instance.hydrateTileDamage === 'function') {
        instance.hydrateTileDamage(snapshot.tileDamageEntries);
    }
    if (Array.isArray(snapshot.groundPileEntries) && snapshot.groundPileEntries.length > 0) {
        instance.hydrateGroundPiles(snapshot.groundPileEntries);
    }
    if (Array.isArray(snapshot.containerStates)) {
        deps.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, snapshot.containerStates);
    }
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
