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
exports.WorldSyncAuxStateService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const map_template_repository_1 = require("../runtime/map/map-template.repository");
const world_sync_map_snapshot_service_1 = require("./world-sync-map-snapshot.service");
const world_sync_map_static_aux_service_1 = require("./world-sync-map-static-aux.service");
const world_sync_minimap_service_1 = require("./world-sync-minimap.service");
const world_sync_protocol_service_1 = require("./world-sync-protocol.service");
const world_sync_quest_loot_service_1 = require("./world-sync-quest-loot.service");
const world_sync_threat_service_1 = require("./world-sync-threat.service");
const world_sync_player_state_service_1 = require("./world-sync-player-state.service");
/** next 首包/增量附加状态服务：承接 aux cache、bootstrap/map-static/realm/loot/threat 编排。 */
let WorldSyncAuxStateService = class WorldSyncAuxStateService {
    templateRepository;
    worldSyncMapSnapshotService;
    worldSyncMapStaticAuxService;
    worldSyncMinimapService;
    worldSyncProtocolService;
    worldSyncQuestLootService;
    worldSyncThreatService;
    worldSyncPlayerStateService;
    nextAuxStateByPlayerId = new Map();
    constructor(templateRepository, worldSyncMapSnapshotService, worldSyncMapStaticAuxService, worldSyncMinimapService, worldSyncProtocolService, worldSyncQuestLootService, worldSyncThreatService, worldSyncPlayerStateService) {
        this.templateRepository = templateRepository;
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
        this.worldSyncMapStaticAuxService = worldSyncMapStaticAuxService;
        this.worldSyncMinimapService = worldSyncMinimapService;
        this.worldSyncProtocolService = worldSyncProtocolService;
        this.worldSyncQuestLootService = worldSyncQuestLootService;
        this.worldSyncThreatService = worldSyncThreatService;
        this.worldSyncPlayerStateService = worldSyncPlayerStateService;
    }
    clearPlayerCache(playerId) {
        this.worldSyncMapStaticAuxService.clearPlayerCache(playerId);
        this.nextAuxStateByPlayerId.delete(playerId);
    }
    emitNextInitialSync(playerId, socket, view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const mapStaticState = this.worldSyncMapStaticAuxService.buildInitialMapStaticState(view, player, template);
        const visibleTiles = mapStaticState.visibleTiles;
        const visibleMinimapMarkers = mapStaticState.visibleMinimapMarkers;
        const renderEntities = this.worldSyncMapSnapshotService.buildRenderEntitiesSnapshot(view, player);
        const minimapLibrary = this.worldSyncMapSnapshotService.buildMinimapLibrarySync(player, template.id);
        const timeState = this.worldSyncMapSnapshotService.buildGameTimeState(template, view, player);
        const threatArrows = this.worldSyncThreatService.buildThreatArrows(view);
        const bootstrapPayload = this.buildBootstrapSyncPayload(this.worldSyncPlayerStateService.buildPlayerSyncState(player, view, minimapLibrary.map((entry) => entry.mapId)), template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
        this.worldSyncProtocolService.sendBootstrap(socket, bootstrapPayload);
        this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
            tiles: visibleTiles.matrix,
            tilesOriginX: view.self.x - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
            tilesOriginY: view.self.y - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
        }));
        this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player));
        const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
        this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
        this.worldSyncThreatService.emitInitialThreatSync(socket, view, threatArrows);
        this.worldSyncMapStaticAuxService.commitPlayerCache(playerId, mapStaticState.cacheState);
        this.nextAuxStateByPlayerId.set(playerId, {
            realm: cloneRealmState(player.realm),
            threatArrows: cloneThreatArrows(threatArrows),
            lootWindow: cloneLootWindow(lootWindow),
        });
    }
    emitNextDeltaSync(playerId, socket, view, player) {
        const previous = this.nextAuxStateByPlayerId.get(playerId) ?? null;
        if (!previous) {
            this.emitNextInitialSync(playerId, socket, view, player);
            return;
        }
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const mapStaticPlan = this.worldSyncMapStaticAuxService.buildDeltaMapStaticPlan(playerId, view, player, template);
        const visibleTiles = mapStaticPlan.visibleTiles;
        const currentVisibleMinimapMarkers = mapStaticPlan.visibleMinimapMarkers;
        const mapChanged = mapStaticPlan.mapChanged;
        if (mapChanged) {
            const minimapLibrary = this.worldSyncMapSnapshotService.buildMinimapLibrarySync(player, template.id);
            this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
                mapMeta: this.worldSyncMapSnapshotService.buildMapMetaSync(template),
                minimap: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
                tiles: visibleTiles.matrix,
                tilesOriginX: view.self.x - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
                tilesOriginY: view.self.y - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
                visibleMinimapMarkers: currentVisibleMinimapMarkers,
                minimapLibrary,
            }));
        }
        else if (mapStaticPlan.visibleMinimapMarkerAdds.length > 0 || mapStaticPlan.visibleMinimapMarkerRemoves.length > 0 || mapStaticPlan.tilePatches.length > 0) {
            this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
                tilePatches: mapStaticPlan.tilePatches.length > 0 ? mapStaticPlan.tilePatches : undefined,
                visibleMinimapMarkerAdds: mapStaticPlan.visibleMinimapMarkerAdds.length > 0 ? mapStaticPlan.visibleMinimapMarkerAdds : undefined,
                visibleMinimapMarkerRemoves: mapStaticPlan.visibleMinimapMarkerRemoves.length > 0 ? mapStaticPlan.visibleMinimapMarkerRemoves : undefined,
            }));
        }
        const currentRealm = cloneRealmState(player.realm);
        if (!isSameRealmState(previous.realm, currentRealm)) {
            this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player, currentRealm));
        }
        const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
        if (!isSameLootWindow(previous.lootWindow ?? null, lootWindow)) {
            this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
        }
        const currentThreatArrows = this.worldSyncThreatService.emitDeltaThreatSync(socket, view, previous.threatArrows ?? null, mapChanged);
        this.worldSyncMapStaticAuxService.commitPlayerCache(playerId, mapStaticPlan.cacheState);
        this.nextAuxStateByPlayerId.set(playerId, {
            realm: currentRealm,
            threatArrows: cloneThreatArrows(currentThreatArrows),
            lootWindow: cloneLootWindow(lootWindow),
        });
    }
    buildBootstrapSyncPayload(self, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState) {
        return {
            self,
            mapMeta: this.worldSyncMapSnapshotService.buildMapMetaSync(template),
            minimap: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
            visibleMinimapMarkers,
            minimapLibrary,
            tiles: visibleTiles.matrix,
            players: Array.from(renderEntities.values(), (entry) => cloneRenderEntity(entry)),
            time: cloneGameTimeState(timeState),
            auraLevelBaseValue: shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE,
        };
    }
    buildMapStaticSyncPayload(template, options = {}) {
        return {
            mapId: template.id,
            mapMeta: options.mapMeta,
            minimap: options.minimap,
            minimapLibrary: options.minimapLibrary,
            tiles: options.tiles,
            tilesOriginX: options.tilesOriginX,
            tilesOriginY: options.tilesOriginY,
            tilePatches: options.tilePatches,
            visibleMinimapMarkers: options.visibleMinimapMarkers,
            visibleMinimapMarkerAdds: options.visibleMinimapMarkerAdds,
            visibleMinimapMarkerRemoves: options.visibleMinimapMarkerRemoves,
        };
    }
    buildRealmSyncPayload(player, realm = cloneRealmState(player.realm)) {
        return { realm };
    }
};
exports.WorldSyncAuxStateService = WorldSyncAuxStateService;
exports.WorldSyncAuxStateService = WorldSyncAuxStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [map_template_repository_1.MapTemplateRepository,
        world_sync_map_snapshot_service_1.WorldSyncMapSnapshotService,
        world_sync_map_static_aux_service_1.WorldSyncMapStaticAuxService,
        world_sync_minimap_service_1.WorldSyncMinimapService,
        world_sync_protocol_service_1.WorldSyncProtocolService,
        world_sync_quest_loot_service_1.WorldSyncQuestLootService,
        world_sync_threat_service_1.WorldSyncThreatService,
        world_sync_player_state_service_1.WorldSyncPlayerStateService])
], WorldSyncAuxStateService);
function cloneGameTimeState(source) {
    return { ...source };
}
function cloneRenderEntity(source) {
    return {
        ...source,
        npcQuestMarker: source.npcQuestMarker ? { ...source.npcQuestMarker } : undefined,
    };
}
function cloneThreatArrows(source) {
    return source.map(([ownerId, targetId]) => [ownerId, targetId]);
}
function cloneLootWindow(source) {
    if (!source) {
        return null;
    }
    return {
        tileX: source.tileX,
        tileY: source.tileY,
        title: source.title,
        sources: source.sources.map((entry) => ({
            sourceId: entry.sourceId,
            kind: entry.kind,
            title: entry.title,
            desc: entry.desc,
            grade: entry.grade,
            searchable: entry.searchable,
            search: entry.search ? { ...entry.search } : undefined,
            items: entry.items.map((item) => ({
                itemKey: item.itemKey,
                item: { ...item.item },
            })),
            emptyText: entry.emptyText,
        })),
    };
}
function cloneRealmState(source) {
    if (!source) {
        return null;
    }
    return {
        ...source,
        breakthroughItems: source.breakthroughItems.map((entry) => ({ ...entry })),
        breakthrough: source.breakthrough
            ? {
                ...source.breakthrough,
                requirements: source.breakthrough.requirements.map((entry) => ({ ...entry })),
            }
            : undefined,
        heavenGate: cloneHeavenGateState(source.heavenGate),
    };
}
function isSameRealmState(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return left.stage === right.stage
        && left.realmLv === right.realmLv
        && left.displayName === right.displayName
        && left.name === right.name
        && left.shortName === right.shortName
        && left.path === right.path
        && left.narrative === right.narrative
        && left.review === right.review
        && left.lifespanYears === right.lifespanYears
        && left.progress === right.progress
        && left.progressToNext === right.progressToNext
        && left.breakthroughReady === right.breakthroughReady
        && left.nextStage === right.nextStage
        && left.minTechniqueLevel === right.minTechniqueLevel
        && left.minTechniqueRealm === right.minTechniqueRealm
        && isSameBreakthroughItemList(left.breakthroughItems, right.breakthroughItems)
        && isSameBreakthroughPreview(left.breakthrough, right.breakthrough)
        && isSameHeavenGateState(left.heavenGate, right.heavenGate);
}
function isSameBreakthroughItemList(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index].itemId !== right[index].itemId || left[index].count !== right[index].count) {
            return false;
        }
    }
    return true;
}
function isSameBreakthroughPreview(left, right) {
    if (!left || !right) {
        return left === right;
    }
    if (left.targetRealmLv !== right.targetRealmLv
        || left.targetDisplayName !== right.targetDisplayName
        || left.totalRequirements !== right.totalRequirements
        || left.completedRequirements !== right.completedRequirements
        || left.allCompleted !== right.allCompleted
        || left.canBreakthrough !== right.canBreakthrough
        || left.blockingRequirements !== right.blockingRequirements
        || left.completedBlockingRequirements !== right.completedBlockingRequirements
        || left.blockedReason !== right.blockedReason
        || left.requirements.length !== right.requirements.length) {
        return false;
    }
    for (let index = 0; index < left.requirements.length; index += 1) {
        const leftEntry = left.requirements[index];
        const rightEntry = right.requirements[index];
        if (leftEntry.id !== rightEntry.id
            || leftEntry.type !== rightEntry.type
            || leftEntry.label !== rightEntry.label
            || leftEntry.completed !== rightEntry.completed
            || leftEntry.hidden !== rightEntry.hidden
            || leftEntry.optional !== rightEntry.optional
            || leftEntry.blocksBreakthrough !== rightEntry.blocksBreakthrough
            || leftEntry.increasePct !== rightEntry.increasePct
            || leftEntry.detail !== rightEntry.detail) {
            return false;
        }
    }
    return true;
}
function isSameHeavenGateState(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return left.unlocked === right.unlocked
        && left.entered === right.entered
        && left.averageBonus === right.averageBonus
        && isSameStringArray(left.severed, right.severed)
        && isSameHeavenGateRoots(left.roots, right.roots);
}
function isSameHeavenGateRoots(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return left.metal === right.metal
        && left.wood === right.wood
        && left.water === right.water
        && left.fire === right.fire
        && left.earth === right.earth;
}
function isSameStringArray(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}
function cloneHeavenGateState(source) {
    if (!source) {
        return null;
    }
    return {
        unlocked: source.unlocked,
        severed: source.severed.slice(),
        roots: cloneHeavenGateRoots(source.roots),
        entered: source.entered,
        averageBonus: source.averageBonus,
    };
}
function cloneHeavenGateRoots(source) {
    if (!source) {
        return null;
    }
    return {
        metal: source.metal,
        wood: source.wood,
        water: source.water,
        fire: source.fire,
        earth: source.earth,
    };
}
function isSameLootWindow(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    if (left.tileX !== right.tileX || left.tileY !== right.tileY || left.title !== right.title || left.sources.length !== right.sources.length) {
        return false;
    }
    for (let index = 0; index < left.sources.length; index += 1) {
        const leftSource = left.sources[index];
        const rightSource = right.sources[index];
        if (!leftSource || !rightSource) {
            return false;
        }
        if (leftSource.sourceId !== rightSource.sourceId
            || leftSource.kind !== rightSource.kind
            || leftSource.title !== rightSource.title
            || leftSource.desc !== rightSource.desc
            || leftSource.grade !== rightSource.grade
            || leftSource.searchable !== rightSource.searchable
            || leftSource.emptyText !== rightSource.emptyText
            || leftSource.items.length !== rightSource.items.length) {
            return false;
        }
        if (Boolean(leftSource.search) !== Boolean(rightSource.search)) {
            return false;
        }
        if (leftSource.search && rightSource.search) {
            if (leftSource.search.totalTicks !== rightSource.search.totalTicks
                || leftSource.search.remainingTicks !== rightSource.search.remainingTicks
                || leftSource.search.elapsedTicks !== rightSource.search.elapsedTicks) {
                return false;
            }
        }
        for (let itemIndex = 0; itemIndex < leftSource.items.length; itemIndex += 1) {
            if (leftSource.items[itemIndex].itemKey !== rightSource.items[itemIndex].itemKey
                || !isSameSyncedItem(leftSource.items[itemIndex].item, rightSource.items[itemIndex].item)) {
                return false;
            }
        }
    }
    return true;
}
function isSameSyncedItem(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemId === right.itemId
        && left.count === right.count
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.groundLabel === right.groundLabel
        && left.grade === right.grade
        && left.level === right.level
        && left.equipSlot === right.equipSlot
        && shallowEqualRecord(left.equipAttrs, right.equipAttrs)
        && shallowEqualRecord(left.equipStats, right.equipStats)
        && shallowEqualRecord(left.equipValueStats, right.equipValueStats)
        && shallowEqualArray(left.effects, right.effects)
        && left.healAmount === right.healAmount
        && left.healPercent === right.healPercent
        && left.qiPercent === right.qiPercent
        && shallowEqualArray(left.consumeBuffs, right.consumeBuffs)
        && shallowEqualArray(left.tags, right.tags)
        && left.mapUnlockId === right.mapUnlockId
        && shallowEqualArray(left.mapUnlockIds, right.mapUnlockIds)
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && left.allowBatchUse === right.allowBatchUse;
}
function shallowEqualArray(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isPlainEqual(left[index], right[index])) {
            return false;
        }
    }
    return true;
}
function shallowEqualRecord(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!isPlainEqual(left[key], right[key])) {
            return false;
        }
    }
    return true;
}
function isPlainEqual(left, right) {
    if (left === right) {
        return true;
    }
    if (typeof left !== typeof right) {
        return false;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return shallowEqualArray(left, right);
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        return shallowEqualRecord(left, right);
    }
    return false;
}
