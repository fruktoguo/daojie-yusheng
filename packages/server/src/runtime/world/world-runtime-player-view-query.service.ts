// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    }
    else {
        for (var i = decorators.length - 1; i >= 0; i--) {
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(k, v);
    }
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePlayerViewQueryService = void 0;

const common_1 = require("@nestjs/common");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_loot_container_service_1 = require("./world-runtime-loot-container.service");

const world_runtime_npc_quest_interaction_query_service_1 = require("./world-runtime-npc-quest-interaction-query.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const {
    compareStableStrings,
} = world_runtime_normalization_helpers_1;

/** 世界运行时玩家视图查询服务：承接玩家视野与已准备拾取窗口状态的只读拼装。 */
let WorldRuntimePlayerViewQueryService = class WorldRuntimePlayerViewQueryService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * worldRuntimeLootContainerService：世界运行态掉落Container服务引用。
 */

    worldRuntimeLootContainerService;    
    /**
 * worldRuntimeNpcQuestInteractionQueryService：世界运行态NPC任务InteractionQuery服务引用。
 */

    worldRuntimeNpcQuestInteractionQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeLootContainerService 参数说明。
 * @param worldRuntimeNpcQuestInteractionQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, worldRuntimeLootContainerService, worldRuntimeNpcQuestInteractionQueryService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeLootContainerService = worldRuntimeLootContainerService;
        this.worldRuntimeNpcQuestInteractionQueryService = worldRuntimeNpcQuestInteractionQueryService;
    }    
    /**
 * getPlayerView：读取玩家视图。
 * @param runtime 参数说明。
 * @param playerId 玩家 ID。
 * @param radius 影响半径。
 * @returns 无返回值，完成玩家视图的读取/组装。
 */

    getPlayerView(runtime, playerId, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = runtime.getPlayerLocation(playerId);
        if (!location) {
            return null;
        }
        const derivedRadius = this.playerRuntimeService.getPlayer(playerId)?.attrs.numericStats.viewRange;
        const normalizedRadius = typeof derivedRadius === 'number' && Number.isFinite(derivedRadius)
            ? Math.max(1, Math.round(derivedRadius))
            : undefined;
        const effectiveRadius = radius ?? normalizedRadius;
        const view = runtime.getInstanceRuntime(location.instanceId)?.buildPlayerView(playerId, effectiveRadius) ?? null;
        return view ? this.decoratePlayerViewNpcs(runtime, playerId, view) : null;
    }    
    /**
 * buildLootWindowSyncState：构建并返回目标对象。
 * @param runtime 参数说明。
 * @param playerId 玩家 ID。
 * @param tileX 参数说明。
 * @param tileY 参数说明。
 * @returns 无返回值，直接更新掉落窗口Sync状态相关状态。
 */

    buildLootWindowSyncState(runtime, playerId, tileX, tileY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        const view = this.getPlayerView(runtime, playerId);
        if (!player || !view || !player.instanceId) {
            return null;
        }
        if (Math.max(Math.abs(player.x - tileX), Math.abs(player.y - tileY)) > 1) {
            return null;
        }
        const instance = runtime.getInstanceRuntimeOrThrow(player.instanceId);
        const sources = [];
        const groundSources = view.localGroundPiles
            .filter((entry) => entry.x === tileX && entry.y === tileY && entry.items.length > 0)
            .sort((left, right) => compareStableStrings(left.sourceId, right.sourceId));
        for (const [index, pile] of groundSources.entries()) {
            sources.push({
                sourceId: pile.sourceId,
                kind: 'ground',
                title: index === 0 ? '地面物品' : `地面物品 ${index + 1}`,
                searchable: false,
                items: pile.items.map((entry) => ({
                    itemKey: entry.itemKey,
                    item: {
                        itemId: entry.itemId,
                        count: entry.count,
                        name: entry.name,
                        type: entry.type,
                        grade: entry.grade,
                        groundLabel: entry.groundLabel,
                    },
                })),
                emptyText: '地面上已经没有东西了。',
            });
        }
        const container = instance.getContainerAtTile(tileX, tileY);
        if (container) {
            const containerSource = this.worldRuntimeLootContainerService.getPreparedContainerLootSource(instance.meta.instanceId, container, player, instance.tick);
            if (containerSource) {
                sources.push(containerSource);
            }
        }
        if (sources.length === 0) {
            return null;
        }
        return {
            tileX,
            tileY,
            title: sources.some((source) => source.variant === 'herb') ? `采集 · (${tileX}, ${tileY})` : `搜索 · (${tileX}, ${tileY})`,
            sources,
        };
    }    
    /**
 * decoratePlayerViewNpcs：执行decorate玩家视图NPC相关逻辑。
 * @param runtime 参数说明。
 * @param playerId 玩家 ID。
 * @param view 参数说明。
 * @returns 无返回值，直接更新decorate玩家视图NPC相关状态。
 */

    decoratePlayerViewNpcs(runtime, playerId, view) {
        const localFormations = typeof runtime.worldRuntimeFormationService?.listRuntimeFormations === 'function'
            ? runtime.worldRuntimeFormationService.listRuntimeFormations(view.instance.instanceId)
                .filter((entry) => isFormationVisibleInView(view, entry))
            : [];
        const decorated = {
            ...view,
            localNpcs: view.localNpcs.map((entry) => ({
                ...entry,
                questMarker: this.worldRuntimeNpcQuestInteractionQueryService.resolveNpcQuestMarker(playerId, entry.npcId, runtime),
            })),
            localFormations,
        };
        return decorateOverlayParentView(runtime, decorated);
    }
};
exports.WorldRuntimePlayerViewQueryService = WorldRuntimePlayerViewQueryService;
exports.WorldRuntimePlayerViewQueryService = WorldRuntimePlayerViewQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_loot_container_service_1.WorldRuntimeLootContainerService,
        world_runtime_npc_quest_interaction_query_service_1.WorldRuntimeNpcQuestInteractionQueryService])
], WorldRuntimePlayerViewQueryService);

export { WorldRuntimePlayerViewQueryService };

function isFormationVisibleInView(view, formation) {
    const x = Math.trunc(Number(formation?.x));
    const y = Math.trunc(Number(formation?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }
    const width = Math.max(1, Math.trunc(Number(view?.instance?.width ?? 1)));
    const index = y * width + x;
    return Array.isArray(view?.visibleTileIndices) && view.visibleTileIndices.includes(index);
}

function decorateOverlayParentView(runtime, view) {
    const sourceInstance = runtime.getInstanceRuntime?.(view?.instance?.instanceId) ?? null;
    const context = buildOverlayParentContext(runtime, sourceInstance, view);
    if (!context) {
        return view;
    }
    const { parentInstance, parentVisibleTileIndices, parentCenterX, parentCenterY, radius, originX, originY } = context;
    const project = (entry) => ({
        ...entry,
        x: Math.trunc(Number(entry.x)) - originX,
        y: Math.trunc(Number(entry.y)) - originY,
        instanceId: parentInstance.meta?.instanceId,
        templateId: parentInstance.template?.id,
        projectedFromParentMap: true,
    });
    return {
        ...view,
        visiblePlayers: view.visiblePlayers.concat(
            parentInstance.collectVisiblePlayers(
                { playerId: '', x: parentCenterX, y: parentCenterY },
                radius,
                parentVisibleTileIndices,
            ).map(project),
        ),
        localMonsters: view.localMonsters.concat(
            parentInstance.collectLocalMonsters(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
        localNpcs: view.localNpcs.concat(
            parentInstance.collectLocalNpcs(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
        localPortals: view.localPortals.concat(
            parentInstance.collectLocalPortals(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
        localLandmarks: view.localLandmarks.concat(
            parentInstance.collectLocalLandmarks(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
        localContainers: view.localContainers.concat(
            parentInstance.collectLocalContainers(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
        localGroundPiles: view.localGroundPiles.concat(
            parentInstance.collectLocalGroundPiles(parentCenterX, parentCenterY, radius, parentVisibleTileIndices).map(project),
        ),
    };
}

function buildOverlayParentContext(runtime, sourceInstance, view) {
    const source = sourceInstance?.template?.source ?? {};
    if (source.spaceVisionMode !== 'parent_overlay') {
        return null;
    }
    const parentMapId = typeof source.parentMapId === 'string' ? source.parentMapId.trim() : '';
    if (!parentMapId || !Number.isInteger(source.parentOriginX) || !Number.isInteger(source.parentOriginY)) {
        return null;
    }
    const originX = Number(source.parentOriginX);
    const originY = Number(source.parentOriginY);
    const parentInstanceId = buildOverlayParentInstanceId(sourceInstance.meta ?? {}, parentMapId);
    const parentInstance = runtime.getInstanceRuntime?.(parentInstanceId) ?? null;
    if (!parentInstance) {
        return null;
    }
    const visibleKeys = Array.isArray(view.visibleTileKeys) ? view.visibleTileKeys : [];
    if (visibleKeys.length === 0) {
        return null;
    }
    const parentVisibleTileIndices = new Set();
    let radius = 1;
    const parentCenterX = Math.trunc(Number(view.self.x)) + originX;
    const parentCenterY = Math.trunc(Number(view.self.y)) + originY;
    for (const key of visibleKeys) {
        const point = parseCoordKey(key);
        if (!point) {
            continue;
        }
        if (sourceInstance.isInBounds?.(point.x, point.y) === true) {
            continue;
        }
        const parentX = point.x + originX;
        const parentY = point.y + originY;
        if (!parentInstance.isInBounds?.(parentX, parentY)) {
            continue;
        }
        parentVisibleTileIndices.add(parentInstance.toTileIndex(parentX, parentY));
        radius = Math.max(radius, Math.abs(parentX - parentCenterX), Math.abs(parentY - parentCenterY));
    }
    if (parentVisibleTileIndices.size === 0) {
        return null;
    }
    return {
        parentInstance,
        parentVisibleTileIndices,
        parentCenterX,
        parentCenterY,
        radius,
        originX,
        originY,
    };
}

function parseCoordKey(key) {
    if (typeof key !== 'string') {
        return null;
    }
    const separatorIndex = key.indexOf(',');
    if (separatorIndex < 0) {
        return null;
    }
    const x = Number(key.slice(0, separatorIndex));
    const y = Number(key.slice(separatorIndex + 1));
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return null;
    }
    return { x, y };
}

function buildOverlayParentInstanceId(sourceMeta, parentTemplateId) {
    const preset = sourceMeta?.linePreset === 'real' ? 'real' : 'peaceful';
    const lineIndex = Number.isFinite(Number(sourceMeta?.lineIndex))
        ? Math.max(1, Math.trunc(Number(sourceMeta.lineIndex)))
        : 1;
    if (lineIndex > 1) {
        return `line:${parentTemplateId}:${preset}:${lineIndex}`;
    }
    return preset === 'real' ? `real:${parentTemplateId}` : `public:${parentTemplateId}`;
}
