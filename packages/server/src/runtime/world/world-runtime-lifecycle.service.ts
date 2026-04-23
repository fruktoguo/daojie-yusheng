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
            return;
        }
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (!instance.meta.persistent) {
                continue;
            }
            const legacySnapshot = deps.mapPersistenceService.isEnabled()
                ? await deps.mapPersistenceService.loadMapSnapshot(instanceId)
                : null;
            if (legacySnapshot) {
                hydrateInstanceFromCheckpoint(instance, legacySnapshot, deps, instanceId);
            }
            if (domainPersistenceEnabled) {
                const watermark = await domainPersistenceService.loadInstanceRecoveryWatermark(instanceId);
                const tileDiffs = await domainPersistenceService.loadTileResourceDiffs(instanceId);
                if (Array.isArray(tileDiffs) && tileDiffs.length > 0) {
                    instance.patchTileResources(tileDiffs.map((entry) => ({
                        resourceKey: entry.resourceKey,
                        tileIndex: entry.tileIndex,
                        value: entry.value,
                    })));
                }
                const groundItems = await domainPersistenceService.loadGroundItems(instanceId);
                if (Array.isArray(groundItems) && groundItems.length > 0) {
                    instance.hydrateGroundPiles(groupGroundItemsByTile(groundItems));
                }
                const containerStates = await domainPersistenceService.loadContainerStates(instanceId);
                deps.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, containerStates ?? []);
                const monsterStates = await domainPersistenceService.loadMonsterRuntimeStates(instanceId);
                instance.hydrateMonsterRuntimeStates(monsterStates ?? []);
                const eventStates = await domainPersistenceService.loadEventStates(instanceId);
                const overlayChunks = await domainPersistenceService.loadOverlayChunks(instanceId);
                const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
                if (checkpoint) {
                    hydrateInstanceFromCheckpoint(instance, checkpoint, deps, instanceId);
                }
                if (legacySnapshot || watermark || (Array.isArray(eventStates) && eventStates.length > 0) || (Array.isArray(overlayChunks) && overlayChunks.length > 0) || checkpoint) {
                    deps.logger.log(`实例分域恢复已回填：${instanceId}`);
                }
                continue;
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
        await this.restorePublicInstancePersistence(deps);
    }
};
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService;
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeLifecycleService);

export { WorldRuntimeLifecycleService };
function shouldRestoreCatalogEntry(entry) {
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
        current.items.push({
            itemKey: typeof item.groundItemId === 'string' ? item.groundItemId : `g:${tileIndex}`,
            item: {
                itemId: typeof item.itemPayload?.itemId === 'string' ? item.itemPayload.itemId : 'unknown',
                name: typeof item.itemPayload?.name === 'string' ? item.itemPayload.name : undefined,
                count: Number.isFinite(Number(item.itemPayload?.count)) ? Math.max(1, Math.trunc(Number(item.itemPayload.count))) : 1,
                grade: typeof item.itemPayload?.grade === 'string' ? item.itemPayload.grade : undefined,
                type: typeof item.itemPayload?.type === 'string' ? item.itemPayload.type : undefined,
            },
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
    const snapshot = checkpoint;
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
    if (Array.isArray(snapshot.groundPileEntries) && snapshot.groundPileEntries.length > 0) {
        instance.hydrateGroundPiles(snapshot.groundPileEntries);
    }
    if (Array.isArray(snapshot.containerStates)) {
        deps.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, snapshot.containerStates);
    }
}
