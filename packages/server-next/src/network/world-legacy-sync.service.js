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
exports.WorldLegacySyncService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const world_sync_protocol_service_1 = require("./world-sync-protocol.service");
let WorldLegacySyncService = class WorldLegacySyncService {
    worldSyncProtocolService;
    constructor(worldSyncProtocolService) {
        this.worldSyncProtocolService = worldSyncProtocolService;
    }
    emitInitialSync(context) {
        const template = context.templateRepository.getOrThrow(context.view.instance.templateId);
        const visibleTiles = context.buildVisibleTilesSnapshot(context.view, context.player, template);
        const renderEntities = context.buildRenderEntitiesSnapshot(context.view, context.player);
        const groundPiles = context.toGroundPileMap(context.view.localGroundPiles);
        const path = context.worldRuntimeService.getLegacyNavigationPath(context.playerId);
        const threatArrows = context.buildThreatArrows(context.view);
        const allMinimapMarkers = context.buildMinimapMarkers(template);
        const visibleMinimapMarkers = context.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
        const minimapLibrary = context.buildMinimapLibrarySync(context.player, template.id);
        const timeState = context.buildGameTimeState(template, context.view, context.player);
        const initPayload = context.buildBootstrapSyncPayload(context.view, context.player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
        const mapStaticPayload = context.buildMapStaticSyncPayload(template, {
            mapMeta: initPayload.mapMeta,
            minimap: initPayload.minimap,
            visibleMinimapMarkers,
            minimapLibrary,
        });
        const { emitNext, emitLegacy } = this.worldSyncProtocolService.resolveEmission(context.socket);
        if (emitNext) {
            context.socket.emit(shared_1.NEXT_S2C.Bootstrap, initPayload);
        }
        this.worldSyncProtocolService.sendMapStatic(context.socket, mapStaticPayload);
        if (emitLegacy) {
            context.socket.emit(shared_1.S2C.Init, initPayload);
        }
        const realmPayload = context.buildRealmSyncPayload(context.player);
        this.worldSyncProtocolService.sendRealm(context.socket, realmPayload);
        const attrUpdate = context.buildAttrUpdate(null, context.player);
        if (attrUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.AttrUpdate, attrUpdate);
        }
        const inventoryUpdate = context.buildInventoryUpdate(null, context.player);
        if (inventoryUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.InventoryUpdate, inventoryUpdate);
        }
        const equipmentUpdate = context.buildEquipmentUpdate(null, context.player);
        if (equipmentUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.EquipmentUpdate, equipmentUpdate);
        }
        const techniqueUpdate = context.buildTechniqueUpdate(null, context.player);
        if (techniqueUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.TechniqueUpdate, techniqueUpdate);
        }
        const actionsUpdate = context.buildActionsUpdate(null, context.player);
        if (actionsUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.ActionsUpdate, actionsUpdate);
        }
        const lootWindow = context.buildLootWindowSyncState(context.playerId);
        this.worldSyncProtocolService.sendLootWindow(context.socket, { window: lootWindow });
        context.syncStateByPlayerId.set(context.playerId, context.captureSyncSnapshot(context.view, context.player, template, timeState, path, threatArrows, visibleMinimapMarkers, renderEntities, visibleTiles.byKey, groundPiles, lootWindow));
    }
    emitDeltaSync(context) {
        const previous = context.syncStateByPlayerId.get(context.playerId) ?? null;
        const template = context.templateRepository.getOrThrow(context.view.instance.templateId);
        const currentTiles = context.buildVisibleTilesSnapshot(context.view, context.player, template);
        const currentEntities = context.buildRenderEntitiesSnapshot(context.view, context.player);
        const currentGroundPiles = context.toGroundPileMap(context.view.localGroundPiles);
        const currentPath = context.worldRuntimeService.getLegacyNavigationPath(context.playerId);
        const currentThreatArrows = context.buildThreatArrows(context.view);
        const allMinimapMarkers = context.buildMinimapMarkers(template);
        const currentVisibleMinimapMarkers = context.buildVisibleMinimapMarkers(allMinimapMarkers, currentTiles.byKey);
        const currentEffects = context.filterLegacyCombatEffects(context.worldRuntimeService.getLegacyCombatEffects(context.view.instance.instanceId), currentTiles.byKey);
        const currentTimeState = context.buildGameTimeState(template, context.view, context.player);
        const { emitLegacy } = this.worldSyncProtocolService.resolveEmission(context.socket);
        const mapChanged = !previous
            || previous.mapId !== context.view.instance.templateId
            || previous.instanceId !== context.view.instance.instanceId;
        if (mapChanged) {
            const minimapLibrary = context.buildMinimapLibrarySync(context.player, template.id);
            this.worldSyncProtocolService.sendMapStatic(context.socket, {
                mapId: template.id,
                mapMeta: context.buildMapMetaSync(template),
                minimap: context.buildMinimapSnapshotSync(template),
                visibleMinimapMarkers: currentVisibleMinimapMarkers,
                minimapLibrary,
            });
        }
        else if (previous) {
            const markerPatch = context.diffVisibleMinimapMarkers(previous.visibleMinimapMarkers, currentVisibleMinimapMarkers);
            if (markerPatch.adds.length > 0 || markerPatch.removes.length > 0) {
                this.worldSyncProtocolService.sendMapStatic(context.socket, {
                    mapId: template.id,
                    visibleMinimapMarkerAdds: markerPatch.adds.length > 0 ? markerPatch.adds : undefined,
                    visibleMinimapMarkerRemoves: markerPatch.removes.length > 0 ? markerPatch.removes : undefined,
                });
            }
        }
        const tickPayload = context.buildTickPayload(previous, context.view, context.player, template, currentTimeState, currentEntities, currentTiles, currentGroundPiles, currentPath, currentThreatArrows, currentEffects, mapChanged);
        if (tickPayload && emitLegacy) {
            context.socket.emit(shared_1.S2C.Tick, tickPayload);
        }
        if (!previous || previous.attrRevision !== context.player.attrs.revision) {
            const attrUpdate = context.buildAttrUpdate(previous?.attrState ?? null, context.player);
            if (attrUpdate && emitLegacy) {
                context.socket.emit(shared_1.S2C.AttrUpdate, attrUpdate);
            }
        }
        if (!previous || !context.isSameRealmState(previous.realm, context.player.realm)) {
            this.worldSyncProtocolService.sendRealm(context.socket, context.buildRealmSyncPayload(context.player));
        }
        const inventoryUpdate = context.buildInventoryUpdate(previous, context.player);
        if (inventoryUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.InventoryUpdate, inventoryUpdate);
        }
        const equipmentUpdate = context.buildEquipmentUpdate(previous, context.player);
        if (equipmentUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.EquipmentUpdate, equipmentUpdate);
        }
        const techniqueUpdate = context.buildTechniqueUpdate(previous, context.player);
        if (techniqueUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.TechniqueUpdate, techniqueUpdate);
        }
        const actionsUpdate = context.buildActionsUpdate(previous, context.player);
        if (actionsUpdate && emitLegacy) {
            context.socket.emit(shared_1.S2C.ActionsUpdate, actionsUpdate);
        }
        const lootWindow = context.buildLootWindowSyncState(context.playerId);
        if (!context.isSameLootWindow(previous?.lootWindow ?? null, lootWindow)) {
            this.worldSyncProtocolService.sendLootWindow(context.socket, { window: lootWindow });
        }
        context.syncStateByPlayerId.set(context.playerId, context.captureSyncSnapshot(context.view, context.player, template, currentTimeState, currentPath, currentThreatArrows, currentVisibleMinimapMarkers, currentEntities, currentTiles.byKey, currentGroundPiles, lootWindow));
    }
};
exports.WorldLegacySyncService = WorldLegacySyncService;
exports.WorldLegacySyncService = WorldLegacySyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_sync_protocol_service_1.WorldSyncProtocolService])
], WorldLegacySyncService);
