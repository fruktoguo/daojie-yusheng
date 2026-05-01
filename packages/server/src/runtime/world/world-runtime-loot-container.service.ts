// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeLootContainerService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const content_template_repository_1 = require("../../content/content-template.repository");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const {
    buildContainerSourceId,
    parseContainerSourceId,
    createSyncedItemStackSignature,
    groupContainerLootRows,
    hasHiddenContainerEntries,
    buildContainerWindowItems,
    cloneInventorySimulation,
    canReceiveContainerEntries,
    applyContainerEntriesToInventorySimulation,
    canReceiveContainerRow,
    removeContainerRowEntries,
    formatItemStackLabel,
    formatItemListSummary,
    compareStableStrings,
    canReceiveItemStack,
} = world_runtime_normalization_helpers_1;

const CONTAINER_SEARCH_TICKS_BY_GRADE = {
    mortal: 1,
    yellow: 1,
    mystic: 2,
    earth: 2,
    heaven: 3,
    spirit: 3,
    saint: 4,
    emperor: 4,
};

const HERB_GATHER_TIME_RATE = 0.5;
const GATHER_SPEED_PER_LEVEL = 0.02;
const DEFAULT_CRAFT_EXP_TO_NEXT = 60;

function normalizeHerbLevel(level) {
    return Math.max(1, Math.floor(Number(level) || 1));
}

function computeHerbNativeGatherTicks(container, row) {
    const item = row?.item ?? row;
    const grade = item?.grade ?? container?.grade;
    const level = normalizeHerbLevel(item?.level);
    const baseTicks = level + (0, shared_1.resolveAlchemyGradeValue)(grade) - 1;
    return Math.max(1, Math.ceil(baseTicks * HERB_GATHER_TIME_RATE));
}

function computeEffectiveHerbGatherTicks(player, container, row) {
    const nativeGatherTicks = computeHerbNativeGatherTicks(container, row);
    const gatherLevel = Math.max(1, Math.floor(Number(player?.gatherSkill?.level) || 1));
    return (0, shared_1.computeAdjustedCraftTicks)(nativeGatherTicks, gatherLevel * GATHER_SPEED_PER_LEVEL);
}

/** loot/container 状态域服务：承接容器状态、翻找推进、持久化与容器拿取。 */
let WorldRuntimeLootContainerService = class WorldRuntimeLootContainerService {
    logger = new common_1.Logger(WorldRuntimeLootContainerService.name);
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * containerStatesByInstanceId：container状态ByInstanceID标识。
 */

    containerStatesByInstanceId = new Map();    
    /**
 * dirtyContainerPersistenceInstanceIds：dirtyContainerPersistenceInstanceID相关字段。
 */

    dirtyContainerPersistenceInstanceIds = new Set();    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * getDirtyInstanceIds：读取DirtyInstanceID。
 * @returns 无返回值，完成DirtyInstanceID的读取/组装。
 */

    getDirtyInstanceIds() {
        return this.dirtyContainerPersistenceInstanceIds;
    }    
    /**
 * clearPersisted：判断clearPersisted是否满足条件。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新clearPersisted相关状态。
 */

    clearPersisted(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }    
    /**
 * removeInstanceState：删除单个实例的容器状态与脏标记。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新单个实例容器状态相关状态。
 */

    removeInstanceState(instanceId) {
        this.containerStatesByInstanceId.delete(instanceId);
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }    
    /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
 */

    reset() {
        this.containerStatesByInstanceId.clear();
        this.dirtyContainerPersistenceInstanceIds.clear();
    }    
    /**
 * buildContainerPersistenceStates：构建并返回目标对象。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新ContainerPersistence状态相关状态。
 */

    buildContainerPersistenceStates(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const containerStates = this.containerStatesByInstanceId.get(instanceId);
        if (!containerStates || containerStates.size === 0) {
            return [];
        }
        return Array.from(containerStates.values(), (state) => ({
            sourceId: state.sourceId,
            containerId: state.containerId,
            generatedAtTick: state.generatedAtTick,
            refreshAtTick: state.refreshAtTick,
            entries: state.entries.map((entry) => ({
                item: { ...entry.item },
                createdTick: entry.createdTick,
                visible: entry.visible,
            })),
            activeSearch: state.activeSearch
                ? {
                    itemKey: state.activeSearch.itemKey,
                    totalTicks: state.activeSearch.totalTicks,
                    remainingTicks: state.activeSearch.remainingTicks,
                }
                : undefined,
        })).sort((left, right) => compareStableStrings(left.sourceId, right.sourceId));
    }    
    /**
 * hydrateContainerStates：执行hydrateContainer状态相关逻辑。
 * @param instanceId instance ID。
 * @param entries 参数说明。
 * @returns 无返回值，直接更新hydrateContainer状态相关状态。
 */

    hydrateContainerStates(instanceId, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (entries.length === 0) {
            this.containerStatesByInstanceId.delete(instanceId);
            this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
            return;
        }
        const next = new Map();
        for (const entry of entries) {
            const parsedSource = typeof entry?.sourceId === 'string' ? parseContainerSourceId(entry.sourceId) : null;
            const containerId = typeof entry?.containerId === 'string' && entry.containerId.trim()
                ? entry.containerId.trim()
                : parsedSource?.containerId ?? '';
            if (!containerId) {
                continue;
            }
            const sourceId = buildContainerSourceId(instanceId, containerId);
            next.set(sourceId, {
                sourceId,
                containerId,
                generatedAtTick: entry.generatedAtTick,
                refreshAtTick: entry.refreshAtTick,
                entries: entry.entries.map((item) => ({
                    item: { ...item.item },
                    createdTick: item.createdTick,
                    visible: item.visible,
                })),
                activeSearch: entry.activeSearch
                    ? {
                        itemKey: entry.activeSearch.itemKey,
                        totalTicks: entry.activeSearch.totalTicks,
                        remainingTicks: entry.activeSearch.remainingTicks,
                    }
                    : undefined,
            });
        }
        this.containerStatesByInstanceId.set(instanceId, next);
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }    
    /**
 * prepareContainerLootSource：执行prepareContainer掉落来源相关逻辑。
 * @param instanceId instance ID。
 * @param container 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新prepareContainer掉落来源相关状态。
 */

    prepareContainerLootSource(instanceId, container, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const containerState = this.ensureContainerState(instanceId, container, currentTick);
        if (container.variant !== 'herb'
            && !containerState.activeSearch
            && hasHiddenContainerEntries(containerState.entries)) {
            this.beginContainerSearch(containerState, container.grade);
            this.markContainerPersistenceDirty(instanceId);
        }
        return containerState;
    }    
    /**
 * getPreparedContainerLootSource：读取PreparedContainer掉落来源。
 * @param instanceId instance ID。
 * @param container 参数说明。
 * @returns 无返回值，完成PreparedContainer掉落来源的读取/组装。
 */

    getPreparedContainerLootSource(instanceId, container, player = null, currentTick = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const containerState = this.containerStatesByInstanceId.get(instanceId)?.get(buildContainerSourceId(instanceId, container.id));
        if (!containerState) {
            return null;
        }
        if (container.variant === 'herb') {
            const herbRows = groupContainerLootRows(containerState.entries);
            const primaryItem = herbRows[0]?.item ?? null;
            const respawnRemainingTicks = getContainerRespawnRemainingTicks(containerState, currentTick);
            return {
                sourceId: containerState.sourceId,
                kind: 'container',
                title: container.name,
                desc: container.desc,
                grade: container.grade,
                searchable: true,
                search: containerState.activeSearch
                    ? {
                        totalTicks: containerState.activeSearch.totalTicks,
                        remainingTicks: containerState.activeSearch.remainingTicks,
                        elapsedTicks: containerState.activeSearch.totalTicks - containerState.activeSearch.remainingTicks,
                    }
                    : undefined,
                items: herbRows.map((entry) => ({
                    itemKey: entry.itemKey,
                    item: { ...entry.item },
                })),
                emptyText: herbRows.length > 0
                    ? '当前可继续采集此处草药。'
                    : respawnRemainingTicks !== undefined
                        ? `这处草药药性回生中，还需 ${Math.max(1, respawnRemainingTicks)} 息。`
                        : '这处草药已经采尽，正在等待重新生长。',
                variant: 'herb',
                herb: {
                    grade: container.grade,
                    level: Math.max(1, Math.floor(Number(primaryItem?.level) || 1)),
                    nativeGatherTicks: primaryItem ? computeHerbNativeGatherTicks(container, primaryItem) : undefined,
                    gatherTicks: primaryItem ? computeEffectiveHerbGatherTicks(player, container, primaryItem) : undefined,
                    respawnRemainingTicks: respawnRemainingTicks !== undefined
                        ? Math.max(0, respawnRemainingTicks)
                        : undefined,
                },
                destroyed: herbRows.length <= 0,
            };
        }
        return {
            sourceId: containerState.sourceId,
            kind: 'container',
            title: container.name,
            desc: container.desc,
            grade: container.grade,
            searchable: true,
            search: containerState.activeSearch
                ? {
                    totalTicks: containerState.activeSearch.totalTicks,
                    remainingTicks: containerState.activeSearch.remainingTicks,
                    elapsedTicks: containerState.activeSearch.totalTicks - containerState.activeSearch.remainingTicks,
                }
                : undefined,
            items: buildContainerWindowItems(containerState.entries),
            emptyText: hasHiddenContainerEntries(containerState.entries)
                ? '正在翻找，每完成一轮搜索会显露一件物品。'
                : '容器里已经空了。',
        };
    }    
    /**
 * ensureContainerState：执行ensureContainer状态相关逻辑。
 * @param instanceId instance ID。
 * @param container 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新ensureContainer状态相关状态。
 */

    ensureContainerState(instanceId, container, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let states = this.containerStatesByInstanceId.get(instanceId);
        if (!states) {
            states = new Map();
            this.containerStatesByInstanceId.set(instanceId, states);
        }
        const sourceId = buildContainerSourceId(instanceId, container.id);
        const existing = states.get(sourceId);
        if (existing) {
            if (typeof existing.refreshAtTick === 'number' && existing.refreshAtTick <= currentTick && !existing.activeSearch) {
                const refreshedEntries = this.generateContainerEntries(container, currentTick);
                if (container.variant === 'herb') {
                    mergeContainerEntries(existing.entries, refreshedEntries);
                }
                else {
                    existing.entries = refreshedEntries;
                }
                existing.generatedAtTick = currentTick;
                existing.refreshAtTick = resolveContainerRefreshAtTick(container, currentTick);
                this.markContainerPersistenceDirty(instanceId);
            }
            return existing;
        }
        const created = {
            sourceId,
            containerId: container.id,
            entries: this.generateContainerEntries(container, currentTick),
            generatedAtTick: currentTick,
            refreshAtTick: resolveContainerRefreshAtTick(container, currentTick),
            activeSearch: undefined,
        };
        states.set(sourceId, created);
        this.markContainerPersistenceDirty(instanceId);
        return created;
    }    
    /**
 * generateContainerEntries：执行generateContainer条目相关逻辑。
 * @param container 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新generateContainer条目相关状态。
 */

    generateContainerEntries(container, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const entries = [];
        for (const pool of container.lootPools) {
            const items = this.contentTemplateRepository.rollLootPoolItems({
                rolls: pool.rolls,
                chance: pool.chance,
                minLevel: pool.minLevel,
                maxLevel: pool.maxLevel,
                minGrade: pool.minGrade,
                maxGrade: pool.maxGrade,
                tagGroups: pool.tagGroups?.map((group) => group.slice()),
                countMin: pool.countMin,
                countMax: pool.countMax,
                allowDuplicates: pool.allowDuplicates,
            });
            for (const item of items) {
                entries.push({ item, createdTick: currentTick, visible: false });
            }
        }
        if (entries.length > 0 || container.lootPools.length > 0) {
            return entries;
        }
        for (const drop of container.drops) {
            const chance = typeof drop.chance === 'number' ? Math.max(0, Math.min(1, drop.chance)) : 1;
            if (chance <= 0 || Math.random() > chance) {
                continue;
            }
            const item = this.contentTemplateRepository.createItem(drop.itemId, drop.count) ?? {
                itemId: drop.itemId,
                count: Math.max(1, Math.trunc(drop.count)),
                name: drop.name,
                type: drop.type,
            };
            entries.push({ item, createdTick: currentTick, visible: false });
        }
        return entries;
    }    
    /**
 * beginContainerSearch：执行开始ContainerSearch相关逻辑。
 * @param state 状态对象。
 * @param grade 参数说明。
 * @returns 无返回值，直接更新beginContainerSearch相关状态。
 */

    beginContainerSearch(state, grade) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (state.activeSearch) {
            return;
        }
        const nextHidden = groupContainerLootRows(state.entries.filter((entry) => !entry.visible))[0];
        if (!nextHidden) {
            return;
        }
        const totalTicks = CONTAINER_SEARCH_TICKS_BY_GRADE[grade] ?? 1;
        state.activeSearch = {
            itemKey: nextHidden.itemKey,
            totalTicks,
            remainingTicks: totalTicks,
        };
    }    
    /**
 * advanceContainerSearches：执行advanceContainerSearche相关逻辑。
 * @param instanceAccess 参数说明。
 * @param playerLocationIndex 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新advanceContainerSearche相关状态。
 */

    advanceContainerSearches(instanceAccess, playerLocationIndex, currentTick) {
        for (const [instanceId, states] of this.containerStatesByInstanceId) {
            const instance = instanceAccess.getInstanceRuntime(instanceId);
            if (!instance) {
                continue;
            }
            let changed = false;
            for (const state of states.values()) {
                const runtimeContainer = instance.template.containers.find((entry) => entry.id === state.containerId) ?? null;
                if (!runtimeContainer) {
                    continue;
                }
                if (runtimeContainer.variant === 'herb') {
                    continue;
                }
                if (!state.activeSearch) {
                    if (hasHiddenContainerEntries(state.entries) && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y, playerLocationIndex)) {
                        this.beginContainerSearch(state, runtimeContainer.grade);
                        changed = true;
                    }
                    continue;
                }
                state.activeSearch.remainingTicks -= 1;
                changed = true;
                if (state.activeSearch.remainingTicks > 0) {
                    continue;
                }
                const target = state.entries.find((entry) => !entry.visible && createSyncedItemStackSignature(entry.item) === state.activeSearch?.itemKey);
                if (target) {
                    target.visible = true;
                }
                state.activeSearch = undefined;
                if (hasHiddenContainerEntries(state.entries) && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y, playerLocationIndex)) {
                    this.beginContainerSearch(state, runtimeContainer.grade);
                }
            }
            if (changed) {
                this.markContainerPersistenceDirty(instanceId);
            }
        }
    }    
    /**
 * hasActiveContainerViewer：判断激活ContainerViewer是否满足条件。
 * @param instanceId instance ID。
 * @param tileX 参数说明。
 * @param tileY 参数说明。
 * @param playerLocationIndex 参数说明。
 * @returns 无返回值，完成激活ContainerViewer的条件判断。
 */

    hasActiveContainerViewer(instanceId, tileX, tileY, playerLocationIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const playerId of playerLocationIndex.listConnectedPlayerIds()) {
            const location = playerLocationIndex.getPlayerLocation(playerId);
            if (!location) {
                continue;
            }
            if (location.instanceId !== instanceId) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            const lootWindowTarget = this.playerRuntimeService.getLootWindowTarget(playerId);
            if (!player || !lootWindowTarget) {
                continue;
            }
            if (Math.max(Math.abs(player.x - lootWindowTarget.tileX), Math.abs(player.y - lootWindowTarget.tileY)) > 1) {
                continue;
            }
            if (lootWindowTarget.tileX === tileX && lootWindowTarget.tileY === tileY) {
                return true;
            }
        }
        return false;
    }    
    /**
 * markContainerPersistenceDirty：判断ContainerPersistenceDirty是否满足条件。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新ContainerPersistenceDirty相关状态。
 */

    markContainerPersistenceDirty(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.add(instanceId);
    }    
    /**
 * dispatchStartGather：开始草药采集。
 * @param playerId 玩家 ID。
 * @param payload 采集载荷。
 * @param deps 运行时依赖。
 * @returns 返回统一 mutation 结果。
 */

    dispatchStartGather(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.gatherJob && Number(player.gatherJob.remainingTicks) > 0) {
            return buildContainerMutationResult('当前已有采集任务在进行中。');
        }
        const sourceId = typeof payload?.sourceId === 'string' ? payload.sourceId.trim() : '';
        const itemKey = typeof payload?.itemKey === 'string' ? payload.itemKey.trim() : '';
        const resolved = this.resolveHerbContainerStateForPlayer(location.instanceId, playerId, player, sourceId, deps);
        const herbRows = groupContainerLootRows(resolved.state.entries);
        const nextRow = (itemKey
            ? herbRows.find((entry) => entry.itemKey === itemKey)
            : herbRows[0]) ?? null;
        if (!nextRow) {
            return buildContainerMutationResult('当前没有可采集的草药。');
        }
        const totalTicks = computeEffectiveHerbGatherTicks(player, resolved.container, nextRow);
        resolved.state.activeSearch = {
            itemKey: nextRow.itemKey,
            totalTicks,
            remainingTicks: totalTicks,
        };
        player.gatherJob = {
            resourceNodeId: resolved.container.id,
            resourceNodeName: resolved.container.name,
            startedAt: Date.now(),
            totalTicks,
            remainingTicks: totalTicks,
            pausedTicks: 0,
            successRate: 1,
            spiritStoneCost: 0,
            phase: 'gathering',
        };
        this.playerRuntimeService.bumpPersistentRevision(player);
        this.markContainerPersistenceDirty(location.instanceId);
        return buildContainerTickResult(false, [{
                kind: 'info',
                text: `你开始采集 ${resolved.container.name}。`,
            }]);
    }    
    /**
 * dispatchCancelGather：取消当前草药采集。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 返回统一 mutation 结果。
 */

    dispatchCancelGather(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const job = player.gatherJob;
        if (!job || Number(job.remainingTicks) <= 0) {
            return buildContainerMutationResult('当前没有可取消的采集任务。');
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const container = instance.getContainerById(job.resourceNodeId);
        if (container) {
            const state = this.ensureContainerState(location.instanceId, container, instance.tick);
            state.activeSearch = undefined;
            this.markContainerPersistenceDirty(location.instanceId);
        }
        player.gatherJob = null;
        this.playerRuntimeService.bumpPersistentRevision(player);
        return buildContainerTickResult(false, [{
                kind: 'info',
                text: `你停止了 ${job.resourceNodeName} 的采集。`,
            }]);
    }    
    /**
 * damageHerbContainerAtTile：按地块攻击口径打落一朵草药。
 * @param instanceId instance ID。
 * @param container 容器记录。
 * @param currentTick 当前 tick。
 * @returns 返回草药攻击结果；非草药目标返回 null。
 */

    damageHerbContainerAtTile(instanceId, container, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!container || container.variant !== 'herb') {
            return null;
        }
        const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
        const state = this.ensureContainerState(instanceId, container, normalizedTick);
        const herbRows = groupContainerLootRows(state.entries);
        const targetRow = herbRows.find((entry) => Math.max(0, Math.trunc(Number(entry.item?.count) || 0)) > 0) ?? null;
        if (!targetRow) {
            if (typeof state.refreshAtTick !== 'number') {
                state.refreshAtTick = resolveContainerRefreshAtTick(container, normalizedTick);
                this.markContainerPersistenceDirty(instanceId);
            }
            return {
                title: container.name,
                appliedDamage: 0,
                remainingCount: 0,
                respawnRemainingTicks: getContainerRespawnRemainingTicks(state, normalizedTick),
            };
        }
        const removed = removeSingleContainerRowItem(state.entries, targetRow);
        if (!removed) {
            return {
                title: container.name,
                appliedDamage: 0,
                remainingCount: countContainerEntryItems(state.entries),
                respawnRemainingTicks: getContainerRespawnRemainingTicks(state, normalizedTick),
            };
        }
        const remainingCount = countContainerEntryItems(state.entries);
        if (remainingCount <= 0) {
            state.activeSearch = undefined;
            if (typeof state.refreshAtTick !== 'number') {
                state.refreshAtTick = resolveContainerRefreshAtTick(container, normalizedTick);
            }
        }
        this.markContainerPersistenceDirty(instanceId);
        return {
            title: container.name,
            item: removed,
            appliedDamage: 1,
            remainingCount,
            respawnRemainingTicks: remainingCount <= 0 ? getContainerRespawnRemainingTicks(state, normalizedTick) : undefined,
        };
    }

    damageAttackableContainerAtTile(instanceId, container, currentTick) {
        return this.damageHerbContainerAtTile(instanceId, container, currentTick);
    }

    getHerbContainerWorldProjection(instanceId, container, currentTick) {
        if (!container || container.variant !== 'herb') {
            return null;
        }
        const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
        const state = this.ensureContainerState(instanceId, container, normalizedTick);
        const remainingCount = countContainerEntryItems(state.entries);
        if (remainingCount > 0) {
            return { remainingCount, respawnRemainingTicks: undefined };
        }
        return {
            remainingCount: 0,
            respawnRemainingTicks: getContainerRespawnRemainingTicks(state, normalizedTick),
        };
    }

    getAttackableContainerCombatStateAtTile(instanceId, container, currentTick) {
        const projection = this.getHerbContainerWorldProjection(instanceId, container, currentTick);
        if (!projection || Math.max(0, Math.trunc(Number(projection.remainingCount) || 0)) <= 0) {
            return null;
        }
        return {
            kind: 'container',
            id: container.id,
            name: container.name,
            hp: Math.max(1, Math.trunc(Number(projection.remainingCount) || 0)),
            remainingCount: projection.remainingCount,
            supportsSkill: false,
        };
    }
    /**
 * interruptGather：因移动或出手中断采集。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param reason 中断原因。
 * @param deps 运行时依赖。
 * @returns 返回统一 tick 结果。
 */

    interruptGather(playerId, player, reason, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const job = player.gatherJob;
        if (!job || Number(job.remainingTicks) <= 0) {
            return buildContainerTickResult();
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const container = instance.getContainerById(job.resourceNodeId);
        if (container) {
            const state = this.ensureContainerState(location.instanceId, container, instance.tick);
            state.activeSearch = undefined;
            this.markContainerPersistenceDirty(location.instanceId);
        }
        player.gatherJob = null;
        this.playerRuntimeService.bumpPersistentRevision(player);
        return buildContainerTickResult(false, [{
                kind: 'system',
                text: `${job.resourceNodeName} 的采集被${reason === 'move' ? '移动' : '出手'}打断。`,
            }]);
    }    
    /**
 * tickGather：推进当前草药采集。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 返回统一 tick 结果。
 */

    async tickGather(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        const job = player?.gatherJob;
        if (!player || !job || Number(job.remainingTicks) <= 0) {
            return buildContainerTickResult();
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const container = instance.getContainerById(job.resourceNodeId);
        if (!container || container.variant !== 'herb') {
            player.gatherJob = null;
            this.playerRuntimeService.bumpPersistentRevision(player);
            return buildContainerTickResult(false, [{
                    kind: 'warn',
                    text: '采集目标已经不存在。',
                }]);
        }
        const lootWindowTarget = this.playerRuntimeService.getLootWindowTarget(playerId);
        if (!lootWindowTarget
            || lootWindowTarget.tileX !== container.x
            || lootWindowTarget.tileY !== container.y
            || Math.max(Math.abs(player.x - container.x), Math.abs(player.y - container.y)) > 1) {
            player.gatherJob = null;
            this.playerRuntimeService.bumpPersistentRevision(player);
            return buildContainerTickResult(false, [{
                    kind: 'warn',
                    text: '你已离开草药采集范围。',
                }]);
        }
        const state = this.ensureContainerState(location.instanceId, container, instance.tick);
        if (!state.activeSearch) {
            const nextRow = groupContainerLootRows(state.entries)[0] ?? null;
            if (!nextRow) {
                player.gatherJob = null;
                this.playerRuntimeService.bumpPersistentRevision(player);
                return buildContainerTickResult(false, [{
                        kind: 'info',
                        text: `${container.name} 已经采尽。`,
                    }]);
            }
            const totalTicks = computeEffectiveHerbGatherTicks(player, container, nextRow);
            state.activeSearch = {
                itemKey: nextRow.itemKey,
                totalTicks,
                remainingTicks: totalTicks,
            };
            job.totalTicks = totalTicks;
            job.remainingTicks = totalTicks;
        }
        const gatherContainerRollbackState = cloneContainerState(state);
        const gatherJobRollbackState = player?.gatherJob ? structuredClone(player.gatherJob) : player?.gatherJob ?? null;
        const gatherDirtyBefore = this.dirtyContainerPersistenceInstanceIds.has(location.instanceId);
        state.activeSearch.remainingTicks -= 1;
        job.remainingTicks = Math.max(0, state.activeSearch.remainingTicks);
        this.markContainerPersistenceDirty(location.instanceId);
        if (state.activeSearch.remainingTicks > 0) {
            this.playerRuntimeService.bumpPersistentRevision(player);
            return buildContainerTickResult();
        }
        const harvestedRow = groupContainerLootRows(state.entries)
            .find((entry) => entry.itemKey === state.activeSearch?.itemKey) ?? null;
        if (!harvestedRow) {
            state.activeSearch = undefined;
            player.gatherJob = null;
            this.playerRuntimeService.bumpPersistentRevision(player);
            return buildContainerTickResult(false, [{
                    kind: 'warn',
                    text: `${container.name} 当前没有可收取的草药。`,
                }]);
        }
        const harvestedItem = removeSingleContainerRowItem(state.entries, harvestedRow);
        if (!harvestedItem) {
            state.activeSearch = undefined;
            player.gatherJob = null;
            this.playerRuntimeService.bumpPersistentRevision(player);
            return buildContainerTickResult(false, [{
                    kind: 'warn',
                    text: `${container.name} 当前没有可收取的草药。`,
                }]);
        }
        state.activeSearch = undefined;
        if (this.canUseDurableInventoryGrant(player, deps)) {
            return await this.completeGatherDurably({
                playerId,
                player,
                deps,
                instanceId: location.instanceId,
                state,
                harvestedRow: {
                    ...harvestedRow,
                    item: harvestedItem,
                    entries: [],
                },
                container,
                job,
                containerStateRollback: gatherContainerRollbackState,
                gatherJobRollbackState,
                dirtyBefore: gatherDirtyBefore,
            });
        }
        this.playerRuntimeService.receiveInventoryItem(playerId, harvestedItem);
        const skillExpResult = applyGatherSkillExp(player.gatherSkill, harvestedItem.level, job.totalTicks);
        const skillChanged = skillExpResult.changed;
        const craftRealmChanged = grantCraftRealmProgress(this.playerRuntimeService, player, skillExpResult.gain / 2);
        deps.refreshQuestStates(playerId);
        const nextRow = groupContainerLootRows(state.entries)[0] ?? null;
        if (nextRow) {
            const totalTicks = computeEffectiveHerbGatherTicks(player, container, nextRow);
            state.activeSearch = {
                itemKey: nextRow.itemKey,
                totalTicks,
                remainingTicks: totalTicks,
            };
            player.gatherJob = {
                ...job,
                startedAt: Date.now(),
                totalTicks,
                remainingTicks: totalTicks,
                pausedTicks: 0,
                phase: 'gathering',
            };
        }
        else {
            player.gatherJob = null;
        }
        const dirtyDomains = ['inventory'];
        if (skillChanged) {
            dirtyDomains.push('profession');
        }
        this.playerRuntimeService.markPersistenceDirtyDomains(player, dirtyDomains);
        this.playerRuntimeService.bumpPersistentRevision(player);
        return buildContainerTickResult(false, [{
                kind: 'loot',
                text: `获得 ${formatItemStackLabel(harvestedItem)}`,
            }], true, false, Boolean(skillChanged || craftRealmChanged));
    }    
    /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    async dispatchTakeGround(playerId, sourceId, itemKey, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (buildIsContainerSourceId(sourceId)) {
            if (this.canUseDurableInventoryGrant(player, deps)) {
                const containerRollbackState = this.captureContainerStateRollback(location.instanceId, playerId, player, sourceId, deps);
                const item = this.takeContainerItem(location.instanceId, playerId, player, sourceId, itemKey, deps);
                await this.grantLootItemsDurably({
                    playerId,
                    player,
                    items: [item],
                    deps,
                    instance: null,
                    sourceType: 'container_take',
                    sourceRefId: `${sourceId}:${itemKey}`,
                    successNotice: `获得 ${formatItemStackLabel(item)}`,
                    restoreOnFailure: () => this.restoreContainerStateRollback(location.instanceId, containerRollbackState),
                    failureNotice: '拿取失败，物品仍保留在容器中。',
                });
                return;
            }
            const item = this.takeContainerItem(location.instanceId, playerId, player, sourceId, itemKey, deps);
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            deps.refreshQuestStates(playerId);
            deps.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const pile = instance.getGroundPileBySourceId(sourceId);
        if (this.canUseDurableInventoryGrant(player, deps) && pile) {
            const targetEntry = Array.isArray(pile.items) ? pile.items.find((entry) => entry?.itemKey === itemKey) : null;
            const originalX = Number.isFinite(Number(pile.x)) ? Math.trunc(Number(pile.x)) : player.x;
            const originalY = Number.isFinite(Number(pile.y)) ? Math.trunc(Number(pile.y)) : player.y;
            if (!targetEntry?.item) {
                throw new common_1.NotFoundException(`地面物品不存在：${itemKey}，来源 ${sourceId}`);
            }
            const taken = instance.takeGroundItem(sourceId, itemKey, player.x, player.y);
            if (!taken) {
                throw new common_1.NotFoundException(`地面物品不存在：${itemKey}，来源 ${sourceId}`);
            }
            await this.grantLootItemsDurably({
                playerId,
                player,
                items: [taken],
                deps,
                instance,
                originalPosition: { x: originalX, y: originalY },
                sourceType: 'ground_take',
                sourceRefId: `${sourceId}:${itemKey}`,
                successNotice: `获得 ${formatItemStackLabel(taken)}`,
            });
            return;
        }
        const item = instance.takeGroundItem(sourceId, itemKey, player.x, player.y);
        if (!item) {
            throw new common_1.NotFoundException(`地面物品不存在：${itemKey}，来源 ${sourceId}`);
        }
        this.playerRuntimeService.receiveInventoryItem(playerId, item);
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
    }    
    /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    async dispatchTakeGroundAll(playerId, sourceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (buildIsContainerSourceId(sourceId)) {
            if (this.canUseDurableInventoryGrant(player, deps)) {
                const containerRollbackState = this.captureContainerStateRollback(location.instanceId, playerId, player, sourceId, deps);
                const takenItems = this.takeAllContainerItems(location.instanceId, playerId, player, sourceId, deps);
                if (takenItems.length === 0) {
                    throw new common_1.BadRequestException('当前没有可拿取的物品');
                }
                await this.grantLootItemsDurably({
                    playerId,
                    player,
                    items: takenItems,
                    deps,
                    instance: null,
                    sourceType: 'container_take_all',
                    sourceRefId: sourceId,
                    successNotice: `获得 ${formatItemListSummary(takenItems)}`,
                    restoreOnFailure: () => this.restoreContainerStateRollback(location.instanceId, containerRollbackState),
                    failureNotice: '拿取失败，物品仍保留在容器中。',
                });
                return;
            }
            const takenItems = this.takeAllContainerItems(location.instanceId, playerId, player, sourceId, deps);
            if (takenItems.length === 0) {
                throw new common_1.BadRequestException('当前没有可拿取的物品');
            }
            for (const item of takenItems) {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
            }
            deps.refreshQuestStates(playerId);
            deps.queuePlayerNotice(playerId, `获得 ${formatItemListSummary(takenItems)}`, 'loot');
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const pile = instance.getGroundPileBySourceId(sourceId);
        if (!pile || pile.items.length === 0) {
            throw new common_1.NotFoundException(`地面来源不存在：${sourceId}`);
        }
        const originalX = Number.isFinite(Number(pile.x)) ? Math.trunc(Number(pile.x)) : player.x;
        const originalY = Number.isFinite(Number(pile.y)) ? Math.trunc(Number(pile.y)) : player.y;
        const takenItems = [];
        for (const entry of pile.items) {
            if (!canReceiveItemStack(player, entry.item)) {
                if (takenItems.length === 0) {
                    throw new common_1.BadRequestException('背包空间不足，无法继续拿取');
                }
                break;
            }
            const taken = instance.takeGroundItem(sourceId, entry.itemKey, player.x, player.y);
            if (!taken) {
                continue;
            }
            this.playerRuntimeService.receiveInventoryItem(playerId, taken);
            takenItems.push(taken);
        }
        if (takenItems.length === 0) {
            throw new common_1.BadRequestException('当前没有可拿取的物品');
        }
        if (this.canUseDurableInventoryGrant(player, deps)) {
            await this.grantLootItemsDurably({
                playerId,
                player,
                items: takenItems,
                deps,
                instance,
                originalPosition: { x: originalX, y: originalY },
                sourceType: 'ground_take_all',
                sourceRefId: sourceId,
                successNotice: `获得 ${formatItemListSummary(takenItems)}`,
                partialNotice: takenItems.length < pile.items.length ? '背包空间不足，剩余物品暂时拿不下。' : '',
            });
            return;
        }
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `获得 ${formatItemListSummary(takenItems)}`, 'loot');
        if (takenItems.length < pile.items.length) {
            deps.queuePlayerNotice(playerId, '背包空间不足，剩余物品暂时拿不下。', 'info');
        }
    }    
    /**
 * takeContainerItem：执行takeContainer道具相关逻辑。
 * @param instanceId instance ID。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新takeContainer道具相关状态。
 */

    takeContainerItem(instanceId, playerId, player, sourceId, itemKey, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
        if (resolved.container.variant === 'herb') {
            throw new common_1.BadRequestException('草药采集请使用采集动作');
        }
        const row = groupContainerLootRows(resolved.state.entries.filter((entry) => entry.visible)).find((entry) => entry.itemKey === itemKey);
        if (!row) {
            throw new common_1.NotFoundException(`容器物品不存在：${itemKey}，来源 ${sourceId}`);
        }
        if (!canReceiveContainerRow(player, row.entries)) {
            throw new common_1.BadRequestException('背包空间不足，无法拿取该物品');
        }
        removeContainerRowEntries(resolved.state.entries, row.entries);
        if (!resolved.state.activeSearch && hasHiddenContainerEntries(resolved.state.entries)) {
            this.beginContainerSearch(resolved.state, resolved.container.grade);
        }
        this.markContainerPersistenceDirty(instanceId);
        return { ...row.item };
    }    
    /**
 * takeAllContainerItems：执行takeAllContainer道具相关逻辑。
 * @param instanceId instance ID。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新takeAllContainer道具相关状态。
 */

    takeAllContainerItems(instanceId, playerId, player, sourceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
        if (resolved.container.variant === 'herb') {
            throw new common_1.BadRequestException('草药采集请使用采集动作');
        }
        const rows = groupContainerLootRows(resolved.state.entries.filter((entry) => entry.visible));
        if (rows.length === 0) {
            return [];
        }
        const takenItems = [];
        const simulatedInventory = cloneInventorySimulation(player.inventory.items);
        for (const row of rows) {
            if (!canReceiveContainerEntries(simulatedInventory, player.inventory.capacity, row.entries)) {
                break;
            }
            applyContainerEntriesToInventorySimulation(simulatedInventory, row.entries);
            removeContainerRowEntries(resolved.state.entries, row.entries);
            takenItems.push({ ...row.item });
        }
        if (takenItems.length > 0) {
            if (!resolved.state.activeSearch && hasHiddenContainerEntries(resolved.state.entries)) {
                this.beginContainerSearch(resolved.state, resolved.container.grade);
            }
            this.markContainerPersistenceDirty(instanceId);
        }
        return takenItems;
    }    

    canUseDurableInventoryGrant(player, deps) {
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' ? player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(player?.sessionEpoch) ? Math.max(1, Math.trunc(Number(player.sessionEpoch))) : 0;
        return Boolean(durableOperationService?.isEnabled?.() && typeof durableOperationService?.grantInventoryItems === 'function' && runtimeOwnerId && sessionEpoch > 0);
    }

    captureContainerStateRollback(instanceId, playerId, player, sourceId, deps) {
        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
        return {
            dirtyBefore: this.dirtyContainerPersistenceInstanceIds.has(instanceId),
            sourceId: resolved.state.sourceId,
            state: cloneContainerState(resolved.state),
        };
    }

    restoreContainerStateRollback(instanceId, rollbackState) {
        let states = this.containerStatesByInstanceId.get(instanceId);
        if (!states) {
            states = new Map();
            this.containerStatesByInstanceId.set(instanceId, states);
        }
        states.set(rollbackState.sourceId, cloneContainerState(rollbackState.state));
        if (rollbackState.dirtyBefore) {
            this.dirtyContainerPersistenceInstanceIds.add(instanceId);
        }
        else {
            this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
        }
    }

    async grantLootItemsDurably(input) {
        const rollbackState = captureInventoryGrantRollbackState(input.player);
        input.player.suppressImmediateDomainPersistence = true;
        try {
            for (const item of input.items) {
                this.playerRuntimeService.receiveInventoryItem(input.playerId, item);
            }
            const leaseContext = await resolveLootInstanceLeaseContext(input.player.instanceId, input.deps);
            await input.deps.durableOperationService.grantInventoryItems({
                operationId: buildLootInventoryGrantOperationId(input.playerId, input.sourceType, input.sourceRefId, input.items),
                playerId: input.playerId,
                expectedRuntimeOwnerId: input.player.runtimeOwnerId,
                expectedSessionEpoch: Math.max(1, Math.trunc(Number(input.player.sessionEpoch ?? 1))),
                expectedInstanceId: input.player.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                sourceType: input.sourceType,
                sourceRefId: input.sourceRefId,
                grantedItems: buildGrantedInventorySnapshots(input.items),
                nextInventoryItems: buildNextInventorySnapshots(input.player.inventory?.items ?? []),
            });
        }
        catch (error) {
            restoreInventoryGrantRollbackState(input.player, rollbackState, this.playerRuntimeService);
            if (typeof input.restoreOnFailure === 'function') {
                try {
                    input.restoreOnFailure();
                }
                catch (restoreError) {
                    this.logger.warn(`容器/地面物品 durable 拿取回滚失败：${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
                }
            }
            else if (input.instance && input.originalPosition) {
                for (const item of input.items) {
                    try {
                        input.instance.dropGroundItem(input.originalPosition.x, input.originalPosition.y, item);
                    }
                    catch (restoreError) {
                        this.logger.warn(`地面物品 durable 拿取回滚失败：${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
                    }
                }
            }
            input.deps.queuePlayerNotice(input.playerId, input.failureNotice ?? '拿取失败，物品已留在原地。', 'warn');
            return;
        }
        finally {
            input.player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
        }
        input.deps.refreshQuestStates(input.playerId);
        input.deps.queuePlayerNotice(input.playerId, input.successNotice, 'loot');
        if (input.partialNotice) {
            input.deps.queuePlayerNotice(input.playerId, input.partialNotice, 'info');
        }
    }

    async completeGatherDurably(input) {
        const inventoryRollbackState = captureInventoryGrantRollbackState(input.player);
        const gatherSkillRollbackState = input.player?.gatherSkill ? structuredClone(input.player.gatherSkill) : input.player?.gatherSkill ?? null;
        input.player.suppressImmediateDomainPersistence = true;
        let skillChanged = false;
        try {
            this.playerRuntimeService.receiveInventoryItem(input.playerId, input.harvestedRow.item);
            const skillExpResult = applyGatherSkillExp(input.player.gatherSkill, input.harvestedRow.item.level, input.job.totalTicks);
            skillChanged = skillExpResult.changed;
            const nextRow = groupContainerLootRows(input.state.entries)[0] ?? null;
            if (nextRow) {
                const totalTicks = computeEffectiveHerbGatherTicks(input.player, input.container, nextRow);
                input.state.activeSearch = {
                    itemKey: nextRow.itemKey,
                    totalTicks,
                    remainingTicks: totalTicks,
                };
                input.player.gatherJob = {
                    ...input.job,
                    startedAt: Date.now(),
                    totalTicks,
                    remainingTicks: totalTicks,
                    pausedTicks: 0,
                    phase: 'gathering',
                };
            }
            else {
                input.player.gatherJob = null;
            }
            const dirtyDomains = ['inventory'];
            if (skillChanged) {
                dirtyDomains.push('profession');
            }
            this.playerRuntimeService.markPersistenceDirtyDomains(input.player, dirtyDomains);
            this.playerRuntimeService.bumpPersistentRevision(input.player);
            const leaseContext = await resolveLootInstanceLeaseContext(input.player.instanceId, input.deps);
            await input.deps.durableOperationService.grantInventoryItems({
                operationId: buildLootInventoryGrantOperationId(input.playerId, 'gather_completion', `${input.state.sourceId}:${input.harvestedRow.itemKey}`, [input.harvestedRow.item]),
                playerId: input.playerId,
                expectedRuntimeOwnerId: input.player.runtimeOwnerId,
                expectedSessionEpoch: Math.max(1, Math.trunc(Number(input.player.sessionEpoch ?? 1))),
                expectedInstanceId: input.player.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                sourceType: 'gather_completion',
                sourceRefId: `${input.state.sourceId}:${input.harvestedRow.itemKey}`,
                grantedItems: buildGrantedInventorySnapshots([input.harvestedRow.item]),
                nextInventoryItems: buildNextInventorySnapshots(input.player.inventory?.items ?? []),
            });
            grantCraftRealmProgress(this.playerRuntimeService, input.player, skillExpResult.gain / 2);
        }
        catch (_error) {
            restoreInventoryGrantRollbackState(input.player, inventoryRollbackState, this.playerRuntimeService);
            input.player.gatherSkill = gatherSkillRollbackState ? structuredClone(gatherSkillRollbackState) : gatherSkillRollbackState;
            input.player.gatherJob = input.gatherJobRollbackState ? structuredClone(input.gatherJobRollbackState) : input.gatherJobRollbackState;
            let states = this.containerStatesByInstanceId.get(input.instanceId);
            if (!states) {
                states = new Map();
                this.containerStatesByInstanceId.set(input.instanceId, states);
            }
            states.set(input.containerStateRollback.sourceId, cloneContainerState(input.containerStateRollback));
            if (input.dirtyBefore) {
                this.dirtyContainerPersistenceInstanceIds.add(input.instanceId);
            }
            else {
                this.dirtyContainerPersistenceInstanceIds.delete(input.instanceId);
            }
            return buildContainerTickResult(false, [{
                    kind: 'warn',
                    text: '采集失败，草药仍保留在原处。',
                }]);
        }
        finally {
            input.player.suppressImmediateDomainPersistence = inventoryRollbackState.suppressImmediateDomainPersistence === true;
        }
        input.deps.refreshQuestStates(input.playerId);
        return buildContainerTickResult(false, [{
                kind: 'loot',
                text: `获得 ${formatItemStackLabel(input.harvestedRow.item)}`,
            }], true, false, Boolean(skillChanged));
    }

    /**
 * resolveContainerStateForPlayer：规范化或转换Container状态For玩家。
 * @param instanceId instance ID。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Container状态For玩家相关状态。
 */

    resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const lootWindowTarget = this.playerRuntimeService.getLootWindowTarget(playerId);
        if (!lootWindowTarget) {
            throw new common_1.BadRequestException('请先打开拿取界面');
        }
        if (Math.max(Math.abs(player.x - lootWindowTarget.tileX), Math.abs(player.y - lootWindowTarget.tileY)) > 1) {
            this.playerRuntimeService.clearLootWindow(playerId);
            throw new common_1.BadRequestException('你已离开拿取范围');
        }
        const parsedSource = parseContainerSourceId(sourceId);
        if (!parsedSource) {
            throw new common_1.BadRequestException('非法容器来源');
        }
        if (parsedSource.instanceId !== instanceId) {
            throw new common_1.BadRequestException('目标容器不在当前实例中');
        }
        const instance = deps.getInstanceRuntimeOrThrow(instanceId);
        const container = instance.getContainerById(parsedSource.containerId);
        if (!container) {
            this.playerRuntimeService.clearLootWindow(playerId);
            throw new common_1.NotFoundException('目标容器不存在');
        }
        if (container.x !== lootWindowTarget.tileX || container.y !== lootWindowTarget.tileY) {
            throw new common_1.BadRequestException('当前拿取界面与目标容器不一致');
        }
        const expectedSourceId = buildContainerSourceId(instanceId, container.id);
        if (sourceId !== expectedSourceId) {
            throw new common_1.BadRequestException('当前拿取界面与目标容器不一致');
        }
        return { container, state: this.ensureContainerState(instanceId, container, instance.tick) };
    }    
    /**
 * resolveHerbContainerStateForPlayer：解析草药容器状态。
 * @param instanceId instance ID。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 返回草药容器与状态。
 */

    resolveHerbContainerStateForPlayer(instanceId, playerId, player, sourceId, deps) {
        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
        if (resolved.container.variant !== 'herb') {
            throw new common_1.BadRequestException('当前目标不是草药采集点');
        }
        return resolved;
    }
};
exports.WorldRuntimeLootContainerService = WorldRuntimeLootContainerService;
exports.WorldRuntimeLootContainerService = WorldRuntimeLootContainerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeLootContainerService);
/**
 * buildIsContainerSourceId：构建并返回目标对象。
 * @param sourceId source ID。
 * @returns 无返回值，直接更新IContainer来源ID相关状态。
 */


function buildIsContainerSourceId(sourceId) {
    return typeof sourceId === 'string' && sourceId.startsWith('container:');
}

function resolveContainerRefreshAtTick(container, currentTick) {
    const fixedRefreshTicks = Number.isInteger(container.refreshTicks) && Number(container.refreshTicks) > 0
        ? Number(container.refreshTicks)
        : undefined;
    if (fixedRefreshTicks) {
        return currentTick + fixedRefreshTicks;
    }
    const refreshTicksMin = Number.isInteger(container.refreshTicksMin) && Number(container.refreshTicksMin) > 0
        ? Number(container.refreshTicksMin)
        : undefined;
    const refreshTicksMax = Number.isInteger(container.refreshTicksMax) && Number(container.refreshTicksMax) > 0
        ? Number(container.refreshTicksMax)
        : undefined;
    if (!refreshTicksMin && !refreshTicksMax) {
        return undefined;
    }
    const min = refreshTicksMin ?? refreshTicksMax ?? 1;
    const max = Math.max(min, refreshTicksMax ?? min);
    return currentTick + randomIntInclusive(min, max);
}

function randomIntInclusive(min, max) {
    const normalizedMin = Math.max(1, Math.floor(Number(min) || 1));
    const normalizedMax = Math.max(normalizedMin, Math.floor(Number(max) || normalizedMin));
    return normalizedMin + Math.floor(Math.random() * ((normalizedMax - normalizedMin) + 1));
}

function buildContainerMutationResult(error) {
    return {
        ok: false,
        error,
        messages: [],
        panelChanged: false,
    };
}

function buildContainerTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = []) {
    return {
        ok: true,
        panelChanged,
        inventoryChanged,
        equipmentChanged,
        attrChanged,
        messages,
        groundDrops,
    };
}

function cloneContainerState(state) {
    return {
        sourceId: state.sourceId,
        containerId: state.containerId,
        generatedAtTick: state.generatedAtTick,
        refreshAtTick: state.refreshAtTick,
        entries: Array.isArray(state.entries)
            ? state.entries.map((entry) => ({
                item: entry?.item ? { ...entry.item } : entry.item,
                createdTick: entry?.createdTick,
                visible: entry?.visible,
            }))
            : [],
        activeSearch: state.activeSearch
            ? {
                itemKey: state.activeSearch.itemKey,
                totalTicks: state.activeSearch.totalTicks,
                remainingTicks: state.activeSearch.remainingTicks,
            }
            : undefined,
    };
}

function mergeContainerEntries(entries, nextEntries) {
    for (const nextEntry of nextEntries) {
        const signature = createSyncedItemStackSignature(nextEntry.item);
        const existing = entries.find((entry) => entry.visible === nextEntry.visible && createSyncedItemStackSignature(entry.item) === signature);
        if (existing) {
            existing.item.count = Math.max(0, Math.trunc(Number(existing.item.count) || 0))
                + Math.max(1, Math.trunc(Number(nextEntry.item.count) || 1));
            existing.createdTick = Math.min(existing.createdTick, nextEntry.createdTick);
            continue;
        }
        entries.push({
            item: { ...nextEntry.item },
            createdTick: nextEntry.createdTick,
            visible: nextEntry.visible,
        });
    }
}

function removeSingleContainerRowItem(entries, row) {
    const target = row.entries.find((entry) => Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)) > 0) ?? null;
    if (!target) {
        return null;
    }
    const harvestedItem = {
        ...target.item,
        count: 1,
    };
    target.item.count = Math.max(0, Math.trunc(Number(target.item.count) || 0)) - 1;
    if (target.item.count <= 0) {
        const index = entries.indexOf(target);
        if (index >= 0) {
            entries.splice(index, 1);
        }
    }
    return harvestedItem;
}

function countContainerEntryItems(entries) {
    return entries.reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)), 0);
}

function getContainerRespawnRemainingTicks(state, currentTick) {
    if (typeof state?.refreshAtTick !== 'number' || !Number.isFinite(Number(currentTick))) {
        return undefined;
    }
    return Math.max(0, Math.trunc(state.refreshAtTick) - Math.max(0, Math.trunc(Number(currentTick) || 0)));
}

function buildNextInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

function buildGrantedInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((item) => ({
            itemId: typeof item?.itemId === 'string' ? item.itemId : '',
            count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
            rawPayload: item ? { ...item } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

function captureInventoryGrantRollbackState(player) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: buildNextInventorySnapshots(player.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}

function restoreInventoryGrantRollbackState(player, rollbackState, playerRuntimeService) {
    player.inventory.items = Array.isArray(rollbackState.inventoryItems)
        ? rollbackState.inventoryItems.map((entry) => ({ ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count }))
        : [];
    player.inventory.revision = rollbackState.inventoryRevision;
    player.persistentRevision = rollbackState.persistentRevision;
    player.selfRevision = rollbackState.selfRevision;
    player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
    player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
    playerRuntimeService.playerProgressionService.refreshPreview(player);
}

async function resolveLootInstanceLeaseContext(instanceId, deps) {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!normalizedInstanceId || !deps?.instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const row = await deps.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
    if (!row) {
        return null;
    }
    const assignedNodeId = typeof row.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row.ownership_epoch)) ? Math.max(1, Math.trunc(Number(row.ownership_epoch))) : 0;
    if (!assignedNodeId || ownershipEpoch <= 0) {
        return null;
    }
    return {
        assignedNodeId,
        ownershipEpoch,
    };
}

function buildLootInventoryGrantOperationId(playerId, sourceType, sourceRefId, items) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedSourceType = typeof sourceType === 'string' && sourceType.trim() ? sourceType.trim() : 'inventory';
    const normalizedSourceRefId = typeof sourceRefId === 'string' && sourceRefId.trim() ? sourceRefId.trim() : 'source';
    const normalizedItemSignature = Array.isArray(items)
        ? items.map((item) => {
            const itemId = typeof item?.itemId === 'string' && item.itemId.trim() ? item.itemId.trim() : 'item';
            const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
            return `${itemId}:x${count}`;
        }).join('|')
        : 'items';
    return `op:${normalizedPlayerId}:${normalizedSourceType}:${normalizedSourceRefId}:${normalizedItemSignature}`;
}

function getCraftSkillExpToNextByLevel(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(DEFAULT_CRAFT_EXP_TO_NEXT, DEFAULT_CRAFT_EXP_TO_NEXT + ((normalizedLevel - 1) * 12));
}

function applyCraftSkillExp(skill, amount) {
    if (!skill) {
        return false;
    }
    let changed = false;
    skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = getCraftSkillExpToNextByLevel(skill.level);
        changed = true;
    }
    return changed || amount > 0;
}

function applyGatherSkillExp(skill, targetLevel, baseActionTicks) {
    if (!skill) {
        return { changed: false, gain: 0 };
    }
    const gain = shared_1.computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel,
        baseActionTicks,
        getExpToNextByLevel: getCraftSkillExpToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    }).finalGain;
    return {
        changed: applyCraftSkillExp(skill, gain),
        gain,
    };
}

function grantCraftRealmProgress(playerRuntimeService, player, amount) {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return false;
    }
    const result = playerRuntimeService.playerProgressionService?.grantCraftRealmExp?.(player, normalized);
    if (!result) {
        return false;
    }
    playerRuntimeService.applyProgressionResult?.(player, result);
    return result.changed === true;
}

export { WorldRuntimeLootContainerService };
