// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePersistenceStateService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime persistence-state seam：承接 dirty map 检测、快照构造与持久化落盘回标。 */
let WorldRuntimePersistenceStateService = class WorldRuntimePersistenceStateService {
/**
 * listDirtyPersistentInstances：读取DirtyPersistentInstance并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成DirtyPersistentInstance的读取/组装。
 */

    listDirtyPersistentInstances(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const dirty = new Set(deps.worldRuntimeLootContainerService.getDirtyInstanceIds());
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instanceId, 'persistence_dirty_scan_lease_check_failed');
                }
                dirty.delete(instanceId);
                continue;
            }
            if (instance.meta.persistent && instance.isPersistentDirty()) {
                dirty.add(instanceId);
            }
        }
        return Array.from(dirty).sort(resolveStableStringComparer(deps));
    }    
    /** listDirtyPersistentInstanceDomains：按实例列出需要落库的持久化域。 */
    listDirtyPersistentInstanceDomains(deps) {
        const entries = [];
        const containerDirty = new Set(deps.worldRuntimeLootContainerService.getDirtyInstanceIds());
        const instanceIds = new Set();
        for (const instanceId of containerDirty) {
            instanceIds.add(instanceId);
        }
        for (const [instanceId] of deps.listInstanceEntries()) {
            instanceIds.add(instanceId);
        }
        for (const instanceId of instanceIds) {
            const instance = deps.getInstanceRuntime(instanceId);
            if (!instance?.meta?.persistent) {
                continue;
            }
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instanceId, 'persistence_dirty_domain_scan_lease_check_failed');
                }
                continue;
            }
            const domains = new Set(typeof instance.getDirtyDomains === 'function'
                ? Array.from(instance.getDirtyDomains())
                : []);
            if (containerDirty.has(instanceId)) {
                domains.add('container_state');
            }
            if (domains.size > 0) {
                entries.push({ instanceId, domains: Array.from(domains).sort(resolveStableStringComparer(deps)) });
            }
        }
        entries.sort((left, right) => resolveStableStringComparer(deps)(left.instanceId, right.instanceId));
        return entries;
    }
    /**
 * buildMapPersistenceSnapshot：构建并返回目标对象。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Persistence快照相关状态。
 */

    buildMapPersistenceSnapshot(instanceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance || !instance.meta.persistent) {
            return null;
        }
        if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
            if (typeof deps.fenceInstanceRuntime === 'function') {
                deps.fenceInstanceRuntime(instanceId, 'build_map_persistence_snapshot_lease_check_failed');
            }
            return null;
        }
        return {
            version: 1,
            savedAt: Date.now(),
            templateId: instance.template.id,
            tick: instance.tick,
            persistenceRevision: typeof instance.getPersistenceRevision === 'function'
                ? instance.getPersistenceRevision()
                : undefined,
            runtimeTileEntries: typeof instance.buildRuntimeTilePersistenceEntries === 'function'
                ? instance.buildRuntimeTilePersistenceEntries()
                : [],
            auraEntries: instance.buildAuraPersistenceEntries(),
            tileResourceEntries: instance.buildTileResourcePersistenceEntries(),
            tileDamageEntries: typeof instance.buildTileDamagePersistenceEntries === 'function'
                ? instance.buildTileDamagePersistenceEntries()
                : [],
            groundPileEntries: instance.buildGroundPersistenceEntries(),
            containerStates: deps.worldRuntimeLootContainerService.buildContainerPersistenceStates(instanceId),
        };
    }    
    /**
 * markMapPersisted：判断地图Persisted是否满足条件。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Persisted相关状态。
 */

    markMapPersisted(instanceId, deps) {
        deps.getInstanceRuntime(instanceId)?.markAuraPersisted();
        deps.worldRuntimeLootContainerService.clearPersisted(instanceId);
    }

    /** markMapDomainsPersisted：只回标指定实例域，避免一个域落库清空所有 dirty。 */
    markMapDomainsPersisted(instanceId, domains, deps) {
        const normalizedDomains = Array.isArray(domains) ? domains.filter((domain) => typeof domain === 'string' && domain.trim()) : [];
        deps.getInstanceRuntime(instanceId)?.markPersistenceDomainsPersisted?.(normalizedDomains);
        if (normalizedDomains.includes('container_state')) {
            deps.worldRuntimeLootContainerService.clearPersisted(instanceId);
        }
    }

    /** flushInstanceDomains：按实例分域写入结构化真源。 */
    async flushInstanceDomains(instanceId, domains, deps) {
        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance || !instance.meta.persistent) {
            return { persistedDomains: [], skipped: true };
        }
        if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
            if (typeof deps.fenceInstanceRuntime === 'function') {
                deps.fenceInstanceRuntime(instanceId, 'flush_instance_domains_lease_check_failed');
            }
            return { persistedDomains: [], skipped: true };
        }
        const persistence = deps.instanceDomainPersistenceService;
        if (!persistence?.isEnabled?.()) {
            return { persistedDomains: [], skipped: true };
        }
        const currentDomains = new Set(Array.isArray(domains) && domains.length > 0
            ? domains
            : (this.listDirtyPersistentInstanceDomains(deps).find((entry) => entry.instanceId === instanceId)?.domains ?? []));
        const persistedDomains = [];
        if (currentDomains.has('tile_cell')) {
            await persistence.replaceRuntimeTileCells(instanceId, typeof instance.buildRuntimeTilePersistenceEntries === 'function'
                ? instance.buildRuntimeTilePersistenceEntries()
                : []);
            persistedDomains.push('tile_cell');
        }
        if (currentDomains.has('tile_resource')) {
            await persistence.saveTileResourceDiffs(instanceId, instance.buildTileResourcePersistenceEntries());
            persistedDomains.push('tile_resource');
        }
        if (currentDomains.has('tile_damage')) {
            await persistence.saveTileDamageStates(instanceId, typeof instance.buildTileDamagePersistenceEntries === 'function'
                ? instance.buildTileDamagePersistenceEntries()
                : []);
            persistedDomains.push('tile_damage');
        }
        if (currentDomains.has('ground_item')) {
            await persistence.replaceGroundItems(instanceId, instance.buildGroundPersistenceEntries());
            persistedDomains.push('ground_item');
        }
        if (currentDomains.has('container_state')) {
            await persistence.replaceContainerStates(instanceId, deps.worldRuntimeLootContainerService.buildContainerPersistenceStates(instanceId));
            persistedDomains.push('container_state');
        }
        if (currentDomains.has('overlay')) {
            await persistence.replaceOverlayChunks(instanceId, typeof instance.buildOverlayPersistenceChunks === 'function'
                ? instance.buildOverlayPersistenceChunks()
                : []);
            persistedDomains.push('overlay');
        }
        if (currentDomains.has('monster_runtime')) {
            await persistence.replaceMonsterRuntimeStates(instanceId, typeof instance.buildMonsterRuntimePersistenceEntries === 'function'
                ? instance.buildMonsterRuntimePersistenceEntries()
                : []);
            persistedDomains.push('monster_runtime');
        }
        const unsupportedDomains = Array.from(currentDomains).filter((domain) => !persistedDomains.includes(domain));
        if (unsupportedDomains.length > 0 && typeof persistence.saveInstanceCheckpoint === 'function') {
            const snapshot = this.buildMapPersistenceSnapshot(instanceId, deps);
            await persistence.saveInstanceCheckpoint(instanceId, {
                kind: 'domain_fallback_checkpoint',
                domains: unsupportedDomains,
                snapshot,
            });
            persistedDomains.push(...unsupportedDomains);
        }
        this.markMapDomainsPersisted(instanceId, persistedDomains, deps);
        return { persistedDomains, skipped: false };
    }
};
exports.WorldRuntimePersistenceStateService = WorldRuntimePersistenceStateService;
exports.WorldRuntimePersistenceStateService = WorldRuntimePersistenceStateService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimePersistenceStateService);

function resolveStableStringComparer(deps) {
    if (typeof deps?.compareStableStrings === 'function') {
        return deps.compareStableStrings;
    }
    return compareStableStrings;
}

function compareStableStrings(left, right) {
    const leftText = typeof left === 'string' ? left : String(left ?? '');
    const rightText = typeof right === 'string' ? right : String(right ?? '');
    if (leftText < rightText) {
        return -1;
    }
    if (leftText > rightText) {
        return 1;
    }
    return 0;
}

export { WorldRuntimePersistenceStateService };
