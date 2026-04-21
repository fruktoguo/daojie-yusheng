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
const shared_1 = require("@mud/shared-next");
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

const DEFAULT_CRAFT_EXP_TO_NEXT = 60;

/** loot/container 状态域服务：承接容器状态、翻找推进、持久化与容器拿取。 */
let WorldRuntimeLootContainerService = class WorldRuntimeLootContainerService {
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
            next.set(entry.sourceId, {
                sourceId: entry.sourceId,
                containerId: entry.containerId,
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

    getPreparedContainerLootSource(instanceId, container) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const containerState = this.containerStatesByInstanceId.get(instanceId)?.get(buildContainerSourceId(instanceId, container.id));
        if (!containerState) {
            return null;
        }
        if (container.variant === 'herb') {
            const herbRows = groupContainerLootRows(containerState.entries);
            const primaryItem = herbRows[0]?.item ?? null;
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
                    : '这处草药已经采尽，正在等待重新生长。',
                variant: 'herb',
                herb: {
                    grade: container.grade,
                    level: Math.max(1, Math.floor(Number(primaryItem?.level) || 1)),
                    gatherTicks: CONTAINER_SEARCH_TICKS_BY_GRADE[container.grade] ?? 1,
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
                existing.entries = this.generateContainerEntries(container, currentTick);
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
        const totalTicks = CONTAINER_SEARCH_TICKS_BY_GRADE[resolved.container.grade] ?? 1;
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
            const state = this.ensureContainerState(location.instanceId, container, deps.tick);
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
            const state = this.ensureContainerState(location.instanceId, container, deps.tick);
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

    tickGather(playerId, deps) {
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
        const state = this.ensureContainerState(location.instanceId, container, deps.tick);
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
            const totalTicks = CONTAINER_SEARCH_TICKS_BY_GRADE[container.grade] ?? 1;
            state.activeSearch = {
                itemKey: nextRow.itemKey,
                totalTicks,
                remainingTicks: totalTicks,
            };
            job.totalTicks = totalTicks;
            job.remainingTicks = totalTicks;
        }
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
        removeContainerRowEntries(state.entries, harvestedRow.entries);
        state.activeSearch = undefined;
        this.playerRuntimeService.receiveInventoryItem(playerId, harvestedRow.item);
        const skillChanged = applyGatherSkillExp(player.gatherSkill, harvestedRow.item.level, job.totalTicks);
        deps.refreshQuestStates(playerId);
        const nextRow = groupContainerLootRows(state.entries)[0] ?? null;
        if (nextRow) {
            const totalTicks = CONTAINER_SEARCH_TICKS_BY_GRADE[container.grade] ?? 1;
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
        this.playerRuntimeService.bumpPersistentRevision(player);
        return buildContainerTickResult(false, [{
                kind: 'loot',
                text: `获得 ${formatItemStackLabel(harvestedRow.item)}`,
            }], true, false, Boolean(skillChanged));
    }    
    /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (buildIsContainerSourceId(sourceId)) {
            const item = this.takeContainerItem(location.instanceId, playerId, player, sourceId, itemKey, deps);
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            deps.refreshQuestStates(playerId);
            deps.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const item = instance.takeGroundItem(sourceId, itemKey, player.x, player.y);
        if (!item) {
            throw new common_1.NotFoundException(`Ground item ${itemKey} not found at ${sourceId}`);
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

    dispatchTakeGroundAll(playerId, sourceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (buildIsContainerSourceId(sourceId)) {
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
            throw new common_1.NotFoundException(`Ground source ${sourceId} not found`);
        }
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
            throw new common_1.NotFoundException(`Container item ${itemKey} not found at ${sourceId}`);
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
        return { container, state: this.ensureContainerState(instanceId, container, deps.tick) };
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
        return false;
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
    return applyCraftSkillExp(skill, gain);
}

export { WorldRuntimeLootContainerService };
