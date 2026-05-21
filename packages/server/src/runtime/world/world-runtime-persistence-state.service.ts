/**
 * 持久化状态检测与快照服务
 * 负责脏实例检测、持久化快照构造和落盘后标记回写
 */
import { Injectable } from '@nestjs/common';

/** world-runtime persistence-state seam：承接 dirty map 检测、快照构造与持久化落盘回标。 */
@Injectable()
export class WorldRuntimePersistenceStateService {
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
                continue;
            }
            const domains = new Set(typeof instance.getDirtyDomains === 'function'
                ? Array.from(instance.getDirtyDomains())
                : []);
            if (containerDirty.has(instanceId)) {
                domains.add('container_state');
            }
            if (domains.size > 0) {
                // 附带合并窗口元数据
                const domainMeta: Record<string, { firstMarkedAt?: number; highPriority?: boolean }> = {};
                for (const domain of domains) {
                    const normalizedDomain = typeof domain === 'string' ? domain.trim() : String(domain ?? '').trim();
                    if (!normalizedDomain) {
                        continue;
                    }
                    const firstMarkedAt = typeof instance.getDirtyDomainFirstMarkedAt === 'function'
                        ? instance.getDirtyDomainFirstMarkedAt(normalizedDomain)
                        : undefined;
                    const highPriority = typeof instance.isDirtyDomainHighPriority === 'function'
                        ? instance.isDirtyDomainHighPriority(normalizedDomain)
                        : false;
                    if (firstMarkedAt !== undefined || highPriority) {
                        domainMeta[normalizedDomain] = { firstMarkedAt, highPriority };
                    }
                }
                entries.push({
                    instanceId,
                    domains: Array.from(domains).sort(resolveStableStringComparer(deps)),
                    domainMeta: Object.keys(domainMeta).length > 0 ? domainMeta : undefined,
                });
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
            temporaryTileEntries: typeof instance.buildTemporaryTilePersistenceEntries === 'function'
                ? instance.buildTemporaryTilePersistenceEntries()
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
            const delta = typeof instance.buildTileResourcePersistenceDelta === 'function'
                ? instance.buildTileResourcePersistenceDelta()
                : null;
            if (delta && delta.fullReplace !== true && typeof persistence.saveTileResourceDelta === 'function') {
                await persistence.saveTileResourceDelta(instanceId, delta.upserts ?? [], delta.deletes ?? []);
            }
            else {
                throw new Error(`instance_domain_delta_required:${instanceId}:tile_resource`);
            }
            persistedDomains.push('tile_resource');
        }
        if (currentDomains.has('tile_damage')) {
            const delta = typeof instance.buildTileDamagePersistenceDelta === 'function'
                ? instance.buildTileDamagePersistenceDelta()
                : null;
            if (delta && delta.fullReplace !== true && typeof persistence.saveTileDamageDelta === 'function') {
                await persistence.saveTileDamageDelta(instanceId, delta.upserts ?? [], delta.deletes ?? []);
            }
            else if (delta?.fullReplace === true && typeof persistence.saveTileDamageStates === 'function') {
                await persistence.saveTileDamageStates(instanceId, typeof instance.buildTileDamagePersistenceEntries === 'function'
                    ? instance.buildTileDamagePersistenceEntries()
                    : []);
            }
            else {
                throw new Error(`instance_domain_delta_required:${instanceId}:tile_damage`);
            }
            persistedDomains.push('tile_damage');
        }
        if (currentDomains.has('temporary_tile')) {
            await persistence.replaceTemporaryTileStates(instanceId, typeof instance.buildTemporaryTilePersistenceEntries === 'function'
                ? instance.buildTemporaryTilePersistenceEntries()
                : []);
            persistedDomains.push('temporary_tile');
        }
        if (currentDomains.has('ground_item')) {
            const delta = typeof instance.buildGroundPersistenceDelta === 'function'
                ? instance.buildGroundPersistenceDelta()
                : null;
            if (delta && delta.fullReplace !== true && typeof persistence.replaceGroundItemTiles === 'function') {
                await persistence.replaceGroundItemTiles(instanceId, delta.tileIndices ?? [], delta.entries ?? []);
            }
            else {
                throw new Error(`instance_domain_delta_required:${instanceId}:ground_item`);
            }
            persistedDomains.push('ground_item');
        }
        if (currentDomains.has('container_state')) {
            const containerStates = deps.worldRuntimeLootContainerService.buildContainerPersistenceStates(instanceId);
            for (const state of containerStates) {
                await persistence.saveContainerState({
                    instanceId,
                    containerId: state.containerId,
                    sourceId: state.sourceId,
                    statePayload: state,
                });
            }
            persistedDomains.push('container_state');
        }
        if (currentDomains.has('overlay')) {
            const overlayChunks = typeof instance.buildOverlayPersistenceChunks === 'function'
                ? instance.buildOverlayPersistenceChunks()
                : [];
            for (const chunk of overlayChunks) {
                await persistence.saveOverlayChunk({
                    instanceId,
                    patchKind: chunk.patchKind,
                    chunkKey: chunk.chunkKey,
                    patchVersion: chunk.patchVersion,
                    patchPayload: chunk.patchPayload,
                });
            }
            persistedDomains.push('overlay');
        }
        if (currentDomains.has('monster_runtime')) {
            const delta = typeof instance.buildMonsterRuntimePersistenceDelta === 'function'
                ? instance.buildMonsterRuntimePersistenceDelta()
                : null;
            if (delta && delta.fullReplace !== true && typeof persistence.saveMonsterRuntimeDelta === 'function') {
                await persistence.saveMonsterRuntimeDelta(instanceId, delta.upserts ?? [], delta.deletes ?? []);
            }
            else if (delta?.fullReplace === true && typeof persistence.replaceMonsterRuntimeStates === 'function') {
                await persistence.replaceMonsterRuntimeStates(instanceId, typeof instance.buildMonsterRuntimePersistenceEntries === 'function'
                    ? instance.buildMonsterRuntimePersistenceEntries()
                    : []);
            }
            else {
                throw new Error(`instance_domain_delta_required:${instanceId}:monster_runtime`);
            }
            persistedDomains.push('monster_runtime');
        }
        if (currentDomains.has('building') || currentDomains.has('room') || currentDomains.has('fengshui')) {
            if (typeof persistence.saveBuildingRoomFengShuiState !== 'function') {
                throw new Error(`instance_building_domain_persistence_missing:${instanceId}`);
            }
            const state = typeof instance.buildBuildingRoomFengShuiPersistenceState === 'function'
                ? instance.buildBuildingRoomFengShuiPersistenceState()
                : {
                    buildings: typeof instance.buildBuildingPersistenceEntries === 'function'
                        ? instance.buildBuildingPersistenceEntries()
                        : [],
                    rooms: typeof instance.listRoomSummaries === 'function' ? instance.listRoomSummaries() : [],
                    fengShui: [],
                };
            await persistence.saveBuildingRoomFengShuiState(instanceId, state);
            for (const domain of ['building', 'room', 'fengshui']) {
                if (currentDomains.has(domain)) {
                    persistedDomains.push(domain);
                }
            }
        }
        if (currentDomains.has('time') && typeof persistence.saveInstanceCheckpoint === 'function') {
            await persistence.saveInstanceCheckpoint(instanceId, {
                kind: 'time_checkpoint',
                domains: ['time'],
                snapshot: buildTimeCheckpointSnapshot(instance),
            });
            persistedDomains.push('time');
        }
        const unsupportedDomains = Array.from(currentDomains).filter((domain) => !persistedDomains.includes(domain));
        if (unsupportedDomains.length > 0) {
            throw new Error(`unsupported_instance_persistence_domains:${instanceId}:${unsupportedDomains.join(',')}`);
        }
        if (persistedDomains.length > 0 && typeof persistence.saveInstanceRecoveryWatermark === 'function') {
            await persistence.saveInstanceRecoveryWatermark(instanceId, buildInstanceDomainRecoveryWatermark(instance, persistedDomains));
        }
        this.markMapDomainsPersisted(instanceId, persistedDomains, deps);
        return { persistedDomains, skipped: false };
    }

    /**
     * 批量收集指定 domain 的 delta 并返回，不直接写库。
     * 供 MapPersistenceFlushService 按 domain 分组后调用 batch API 写入。
     */
    buildDomainDeltaBatch(domain, instanceIds, deps) {
        const results = [];
        for (const instanceId of instanceIds) {
            const instance = deps.getInstanceRuntime(instanceId);
            if (!instance || !instance.meta.persistent) continue;
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) continue;
            const persistence = deps.instanceDomainPersistenceService;
            if (!persistence?.isEnabled?.()) continue;
            if (domain === 'tile_damage') {
                const delta = typeof instance.buildTileDamagePersistenceDelta === 'function'
                    ? instance.buildTileDamagePersistenceDelta() : null;
                if (delta && delta.fullReplace !== true) {
                    results.push({
                        instanceId,
                        domain: 'tile_damage',
                        upserts: delta.upserts ?? [],
                        deletes: delta.deletes ?? [],
                        watermarkPayload: buildInstanceDomainRecoveryWatermark(instance, ['tile_damage']),
                    });
                }
            } else if (domain === 'tile_resource') {
                const delta = typeof instance.buildTileResourcePersistenceDelta === 'function'
                    ? instance.buildTileResourcePersistenceDelta() : null;
                if (delta && delta.fullReplace !== true) {
                    results.push({
                        instanceId,
                        domain: 'tile_resource',
                        upserts: delta.upserts ?? [],
                        deletes: delta.deletes ?? [],
                        watermarkPayload: buildInstanceDomainRecoveryWatermark(instance, ['tile_resource']),
                    });
                }
            }
        }
        return results;
    }

    /**
     * 批量标记多个实例的指定 domain 为已持久化。
     */
    markDomainBatchPersisted(domain, instanceIds, deps) {
        for (const instanceId of instanceIds) {
            this.markMapDomainsPersisted(instanceId, [domain], deps);
        }
    }
};

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

export function buildTimeCheckpointSnapshot(instance) {
    // 构建 dungeonDescriptor（通天塔）
    let dungeonDescriptor = undefined;
    if (instance?.tongtianTowerState && instance?.meta?.kind === 'tower') {
        const layer = instance.tongtianTowerState.layer;
        if (Number.isFinite(layer) && layer > 0) {
            dungeonDescriptor = { type: 'tower', params: { layer } };
        }
    }
    return {
        version: 2,
        savedAt: Date.now(),
        templateId: typeof instance?.template?.id === 'string' ? instance.template.id : '',
        tick: Number.isFinite(Number(instance?.tick)) ? Math.max(0, Math.trunc(Number(instance.tick))) : 0,
        tickSpeed: Number.isFinite(Number(instance?.tickSpeed)) ? Math.max(0, Number(instance.tickSpeed)) : 1,
        paused: instance?.paused === true,
        dungeonState: instance?.tongtianTowerState ?? undefined,
        dungeonDescriptor,
        persistenceRevision: typeof instance?.getPersistenceRevision === 'function'
            ? instance.getPersistenceRevision()
            : undefined,
    };
}

function buildInstanceDomainRecoveryWatermark(instance, persistedDomains) {
    const persistenceRevision = typeof instance?.getPersistenceRevision === 'function'
        ? instance.getPersistenceRevision()
        : undefined;
    return {
        kind: 'domain_flush',
        domains: Array.from(new Set((Array.isArray(persistedDomains) ? persistedDomains : [])
            .filter((domain) => typeof domain === 'string' && domain.trim())
            .map((domain) => domain.trim()))).sort(compareStableStrings),
        flushedAt: Date.now(),
        tick: Number.isFinite(Number(instance?.tick)) ? Math.max(0, Math.trunc(Number(instance.tick))) : 0,
        persistenceRevision,
    };
}
