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

/** loot/container 状态域服务：承接容器状态、翻找推进、持久化与容器拿取。 */
let WorldRuntimeLootContainerService = class WorldRuntimeLootContainerService {
    contentTemplateRepository;
    playerRuntimeService;
    containerStatesByInstanceId = new Map();
    dirtyContainerPersistenceInstanceIds = new Set();
    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }
    getDirtyInstanceIds() {
        return this.dirtyContainerPersistenceInstanceIds;
    }
    clearPersisted(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }
    reset() {
        this.containerStatesByInstanceId.clear();
        this.dirtyContainerPersistenceInstanceIds.clear();
    }
    buildContainerPersistenceStates(instanceId) {
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
    hydrateContainerStates(instanceId, entries) {
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
    buildContainerLootSource(instanceId, container, currentTick) {
        const containerState = this.ensureContainerState(instanceId, container, currentTick);
        if (!containerState.activeSearch && hasHiddenContainerEntries(containerState.entries)) {
            this.beginContainerSearch(containerState, container.grade);
            this.markContainerPersistenceDirty(instanceId);
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
    ensureContainerState(instanceId, container, currentTick) {
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
                existing.refreshAtTick = container.refreshTicks ? currentTick + container.refreshTicks : undefined;
                this.markContainerPersistenceDirty(instanceId);
            }
            return existing;
        }
        const created = {
            sourceId,
            containerId: container.id,
            entries: this.generateContainerEntries(container, currentTick),
            generatedAtTick: currentTick,
            refreshAtTick: container.refreshTicks ? currentTick + container.refreshTicks : undefined,
            activeSearch: undefined,
        };
        states.set(sourceId, created);
        this.markContainerPersistenceDirty(instanceId);
        return created;
    }
    generateContainerEntries(container, currentTick) {
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
    beginContainerSearch(state, grade) {
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
    advanceContainerSearches(instances, playerLocations, currentTick) {
        for (const [instanceId, states] of this.containerStatesByInstanceId) {
            const instance = instances.get(instanceId);
            if (!instance) {
                continue;
            }
            let changed = false;
            for (const state of states.values()) {
                const runtimeContainer = instance.template.containers.find((entry) => entry.id === state.containerId) ?? null;
                if (!runtimeContainer) {
                    continue;
                }
                if (!state.activeSearch) {
                    if (hasHiddenContainerEntries(state.entries) && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y, playerLocations)) {
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
                if (hasHiddenContainerEntries(state.entries) && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y, playerLocations)) {
                    this.beginContainerSearch(state, runtimeContainer.grade);
                }
            }
            if (changed) {
                this.markContainerPersistenceDirty(instanceId);
            }
        }
    }
    hasActiveContainerViewer(instanceId, tileX, tileY, playerLocations) {
        for (const [playerId, location] of playerLocations) {
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
    markContainerPersistenceDirty(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.add(instanceId);
    }
    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
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
    dispatchTakeGroundAll(playerId, sourceId, deps) {
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
    takeContainerItem(instanceId, playerId, player, sourceId, itemKey, deps) {
        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
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
    takeAllContainerItems(instanceId, playerId, player, sourceId, deps) {
        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps);
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
    resolveContainerStateForPlayer(instanceId, playerId, player, sourceId, deps) {
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
};
exports.WorldRuntimeLootContainerService = WorldRuntimeLootContainerService;
exports.WorldRuntimeLootContainerService = WorldRuntimeLootContainerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeLootContainerService);

function buildIsContainerSourceId(sourceId) {
    return typeof sourceId === 'string' && sourceId.startsWith('container:');
}
