/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable } from '@nestjs/common';
import { getFirstGrapheme, percentModifierToMultiplier } from '@mud/shared';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { WorldRuntimeLootContainerService } from '../world-runtime-loot-container.service';
import { WorldRuntimeNpcQuestInteractionQueryService } from './world-runtime-npc-quest-interaction-query.service';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';

const {
    compareStableStrings,
} = world_runtime_normalization_helpers_1;

/** 世界运行时玩家视图查询服务：承接玩家视野与已准备拾取窗口状态的只读拼装。 */
@Injectable()
export class WorldRuntimePlayerViewQueryService {
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

    constructor(
        playerRuntimeService: PlayerRuntimeService,
        worldRuntimeLootContainerService: WorldRuntimeLootContainerService,
        worldRuntimeNpcQuestInteractionQueryService: WorldRuntimeNpcQuestInteractionQueryService,
    ) {
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
        const player = this.playerRuntimeService.getPlayer(playerId);
        const derivedRadius = player?.attrs.numericStats.viewRange;
        const visionSuppressionPercent = typeof runtime.worldRuntimeFormationService?.resolveVisionSuppressionPercentAt === 'function'
            ? runtime.worldRuntimeFormationService.resolveVisionSuppressionPercentAt(location.instanceId, location.x ?? player?.x, location.y ?? player?.y)
            : 0;
        const radiusMultiplier = visionSuppressionPercent > 0
            ? percentModifierToMultiplier(-visionSuppressionPercent)
            : 1;
        const normalizedRadius = typeof derivedRadius === 'number' && Number.isFinite(derivedRadius)
            ? Math.max(1, Math.round(derivedRadius * radiusMultiplier))
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
        const view = this.getPlayerView(runtime, playerId, undefined);
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
                        enhanceLevel: entry.enhanceLevel,
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
        const localNpcs = this.decorateLocalNpcQuestMarkers(runtime, playerId, view.localNpcs);
        const decorated = localNpcs === view.localNpcs && localFormations.length === 0
            ? view
            : {
                ...view,
                localNpcs,
                localFormations,
            };
        return this.decoratePlayerViewPresentation(runtime, decorateOverlayParentView(runtime, decorated));
    }
    /** decoratePlayerViewPresentation：只追加玩家名牌展示所需的短字段。 */
    decoratePlayerViewPresentation(runtime, view) {
        if (!view || !runtime?.worldRuntimeSectService) {
            return view;
        }
        const self = this.getPlayerSectMarkEntry(runtime, view.self, view.playerId);
        let visiblePlayers = view.visiblePlayers;
        if (Array.isArray(view.visiblePlayers)) {
            for (let index = 0; index < view.visiblePlayers.length; index += 1) {
                const entry = view.visiblePlayers[index];
                const nextEntry = this.getPlayerSectMarkEntry(runtime, entry, entry?.playerId);
                if (nextEntry === entry) {
                    if (visiblePlayers !== view.visiblePlayers) {
                        visiblePlayers.push(entry);
                    }
                    continue;
                }
                if (visiblePlayers === view.visiblePlayers) {
                    visiblePlayers = view.visiblePlayers.slice(0, index);
                }
                visiblePlayers.push(nextEntry);
            }
        }
        return self !== view.self || visiblePlayers !== view.visiblePlayers
            ? { ...view, self, visiblePlayers }
            : view;
    }
    /** getPlayerSectMarkEntry：按玩家运行态宗门 ID 读取宗门单字印记。 */
    getPlayerSectMarkEntry(runtime, entry, playerId) {
        if (!entry) {
            return entry;
        }
        const sectMark = resolvePlayerSectMark(runtime, this.playerRuntimeService, playerId);
        if ((entry.sectMark ?? null) === sectMark) {
            return entry;
        }
        if (typeof entry !== 'object') {
            return freezeViewProjection({ ...entry, sectMark });
        }
        let byMark = sectMarkProjectionCache.get(entry);
        if (!byMark) {
            byMark = new Map();
            sectMarkProjectionCache.set(entry, byMark);
        }
        const cacheKey = sectMark ?? '';
        const cached = byMark.get(cacheKey);
        if (cached) {
            return cached;
        }
        const nextEntry = freezeViewProjection({ ...entry, sectMark });
        byMark.set(cacheKey, nextEntry);
        return nextEntry;
    }
    /** decorateLocalNpcQuestMarkers：只在 marker 非空或变化时创建 NPC 叠加条目。 */
    decorateLocalNpcQuestMarkers(runtime, playerId, localNpcs) {
        if (!Array.isArray(localNpcs) || localNpcs.length === 0) {
            return localNpcs;
        }
        let changed = false;
        const decorated = [];
        for (const entry of localNpcs) {
            const questMarker = this.worldRuntimeNpcQuestInteractionQueryService.resolveNpcQuestMarker(playerId, entry.npcId, runtime);
            if (!questMarker && !entry.questMarker) {
                decorated.push(entry);
                continue;
            }
            const nextEntry = this.getNpcQuestMarkerEntry(playerId, entry, questMarker ?? null);
            changed ||= nextEntry !== entry;
            decorated.push(nextEntry);
        }
        return changed ? decorated : localNpcs;
    }
    /** getNpcQuestMarkerEntry：复用玩家维度 NPC marker 投影。 */
    getNpcQuestMarkerEntry(playerId, entry, questMarker) {
        // 把 cache 挂在 player runtime 对象上，玩家从 PlayerRuntimeService 移除时整张 Map 跟随 GC，
        // 避免 service-level Map<playerId, ...> 在断线/迁移玩家积累后无法回收。
        const player: any = typeof this.playerRuntimeService.getPlayer === 'function'
            ? this.playerRuntimeService.getPlayer(playerId)
            : null;
        if (!player) {
            // 没有 runtime 玩家时不缓存，仅当次返回 spread 副本（保证语义）。
            return freezeViewProjection({ ...entry, questMarker });
        }
        let playerCache: Map<string, any> | undefined = player.npcQuestMarkerCache;
        if (!(playerCache instanceof Map)) {
            playerCache = new Map();
            player.npcQuestMarkerCache = playerCache;
        }
        const cached = playerCache.get(entry.npcId);
        if (cached
            && isSameNpcQuestMarkerEntry(cached, entry, questMarker)) {
            return cached;
        }
        const nextEntry = freezeViewProjection({ ...entry, questMarker });
        playerCache.set(entry.npcId, nextEntry);
        return nextEntry;
    }
};

const overlayProjectionCache = new WeakMap<object, Map<string, unknown>>();
const sectMarkProjectionCache = new WeakMap<object, Map<string, unknown>>();

function resolvePlayerSectMark(runtime, playerRuntimeService, playerId) {
    const normalizedPlayerId = normalizeOptionalString(playerId);
    if (!normalizedPlayerId) {
        return null;
    }
    const player = typeof playerRuntimeService.getPlayer === 'function'
        ? playerRuntimeService.getPlayer(normalizedPlayerId)
        : null;
    const sectId = normalizeOptionalString(player?.sectId);
    if (!sectId || typeof runtime.worldRuntimeSectService?.findSectById !== 'function') {
        return null;
    }
    const sect = runtime.worldRuntimeSectService.findSectById(sectId);
    if (!sect || normalizeOptionalString(sect.status) === 'dissolved') {
        return null;
    }
    const mark = normalizeOptionalString(sect.mark) || normalizeOptionalString(sect.name);
    return mark ? getFirstGrapheme(mark) || null : null;
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().normalize('NFC');
    return normalized ? normalized : null;
}

function isFormationVisibleInView(view, formation) {
    const x = Math.trunc(Number(formation?.x));
    const y = Math.trunc(Number(formation?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }
    const width = Math.max(1, Math.trunc(Number(view?.instance?.width ?? 1)));
    const visibleTileIndices = Array.isArray(view?.visibleTileIndices) ? view.visibleTileIndices : [];
    const visibleTileKeys = Array.isArray(view?.visibleTileKeys) ? view.visibleTileKeys : [];
    if (visibleTileKeys.includes(`${x},${y}`)) {
        return true;
    }
    const index = y * width + x;
    if (visibleTileIndices.includes(index)) {
        return true;
    }
    const radius = Math.max(0, Math.trunc(Number(formation?.radius) || 0));
    if (radius <= 0) {
        return false;
    }
    for (const key of visibleTileKeys) {
        const point = parseCoordKey(key);
        if (point && isTileInsideFormationRange(formation, x, y, point.x, point.y, radius)) {
            return true;
        }
    }
    for (const rawIndex of visibleTileIndices) {
        const tileIndex = Math.trunc(Number(rawIndex));
        if (!Number.isFinite(tileIndex) || tileIndex < 0) {
            continue;
        }
        const visibleX = tileIndex % width;
        const visibleY = Math.floor(tileIndex / width);
        if (isTileInsideFormationRange(formation, x, y, visibleX, visibleY, radius)) {
            return true;
        }
    }
    return false;
}

function isTileInsideFormationRange(formation, centerX, centerY, x, y, radius) {
    const dx = Math.trunc(x) - centerX;
    const dy = Math.trunc(y) - centerY;
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
        return false;
    }
    if (formation?.rangeShape === 'circle') {
        return (dx * dx) + (dy * dy) <= radius * radius;
    }
    if (formation?.rangeShape === 'checkerboard') {
        return ((Math.trunc(x) + Math.trunc(y)) % 2) === 0;
    }
    return true;
}

function decorateOverlayParentView(runtime, view) {
    const sourceInstance = runtime.getInstanceRuntime?.(view?.instance?.instanceId) ?? null;
    const context = buildOverlayParentContext(runtime, sourceInstance, view);
    if (!context) {
        return view;
    }
    const { parentInstance, parentVisibleTileIndices, parentCenterX, parentCenterY, radius, originX, originY } = context;
    const projection = {
        instanceId: parentInstance.meta?.instanceId,
        templateId: parentInstance.template?.id,
        originX,
        originY,
    };
    const visiblePlayers = appendProjectedParentEntries(
        view.visiblePlayers,
        parentInstance.collectVisiblePlayers(
            { playerId: '', x: parentCenterX, y: parentCenterY },
            radius,
            parentVisibleTileIndices,
        ),
        projection,
    );
    const localMonsters = appendProjectedParentEntries(
        view.localMonsters,
        parentInstance.collectLocalMonsters(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localNpcs = appendProjectedParentEntries(
        view.localNpcs,
        parentInstance.collectLocalNpcs(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localPortals = appendProjectedParentEntries(
        view.localPortals,
        parentInstance.collectLocalPortals(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localLandmarks = appendProjectedParentEntries(
        view.localLandmarks,
        parentInstance.collectLocalLandmarks(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localContainers = appendProjectedParentEntries(
        view.localContainers,
        parentInstance.collectLocalContainers(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localGroundPiles = appendProjectedParentEntries(
        view.localGroundPiles,
        parentInstance.collectLocalGroundPiles(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    const localBuildings = appendProjectedParentEntries(
        view.localBuildings,
        parentInstance.collectLocalBuildings(parentCenterX, parentCenterY, radius, parentVisibleTileIndices),
        projection,
    );
    return {
        ...view,
        visiblePlayers,
        localMonsters,
        localNpcs,
        localPortals,
        localLandmarks,
        localContainers,
        localGroundPiles,
        localBuildings,
    };
}

function appendProjectedParentEntries(baseEntries, parentEntries, projection) {
    if (!Array.isArray(parentEntries) || parentEntries.length === 0) {
        return baseEntries;
    }
    const result = Array.isArray(baseEntries) && baseEntries.length > 0
        ? baseEntries.slice()
        : [];
    for (const entry of parentEntries) {
        result.push(projectOverlayParentEntry(entry, projection));
    }
    return result;
}

function projectOverlayParentEntry(entry, projection) {
    if (!entry || typeof entry !== 'object') {
        return entry;
    }
    const cacheKey = `${projection.instanceId}|${projection.templateId}|${projection.originX}|${projection.originY}`;
    let byProjection = overlayProjectionCache.get(entry);
    if (!byProjection) {
        byProjection = new Map();
        overlayProjectionCache.set(entry, byProjection);
    }
    const cached = byProjection.get(cacheKey);
    if (cached) {
        return cached;
    }
    const projected = freezeViewProjection({
        ...entry,
        x: Math.trunc(Number(entry.x)) - projection.originX,
        y: Math.trunc(Number(entry.y)) - projection.originY,
        instanceId: projection.instanceId,
        templateId: projection.templateId,
        projectedFromParentMap: true,
    });
    byProjection.set(cacheKey, projected);
    return projected;
}

function isSameNpcQuestMarkerProjection(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.kind === right.kind
        && left.line === right.line
        && left.state === right.state
}

function isSameNpcQuestMarkerEntry(cached, source, questMarker) {
    return cached.npcId === source.npcId
        && cached.name === source.name
        && cached.char === source.char
        && cached.color === source.color
        && cached.x === source.x
        && cached.y === source.y
        && cached.hasShop === source.hasShop
        && cached.projectedFromParentMap === source.projectedFromParentMap
        && cached.instanceId === source.instanceId
        && cached.templateId === source.templateId
        && isSameNpcQuestMarkerProjection(cached.questMarker, questMarker);
}

function freezeViewProjection(entry) {
    if (entry && process.env.NODE_ENV !== 'production') {
        Object.freeze(entry);
    }
    return entry;
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
