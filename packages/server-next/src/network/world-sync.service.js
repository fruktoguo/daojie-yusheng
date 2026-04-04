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
exports.WorldSyncService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const legacy_gm_http_compat_service_1 = require("../compat/legacy/http/legacy-gm-http-compat.service");
const map_template_repository_1 = require("../runtime/map/map-template.repository");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const world_projector_service_1 = require("./world-projector.service");
const world_session_service_1 = require("./world-session.service");
let WorldSyncService = class WorldSyncService {
    worldRuntimeService;
    playerRuntimeService;
    worldProjectorService;
    worldSessionService;
    templateRepository;
    mapRuntimeConfigService;
    lastQuestRevisionByPlayerId = new Map();
    syncStateByPlayerId = new Map();
    lootWindowByPlayerId = new Map();
    nextAuxStateByPlayerId = new Map();
    constructor(worldRuntimeService, playerRuntimeService, worldProjectorService, worldSessionService, templateRepository, mapRuntimeConfigService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldProjectorService = worldProjectorService;
        this.worldSessionService = worldSessionService;
        this.templateRepository = templateRepository;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
    }
    emitInitialSync(playerId) {
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
        const envelope = this.worldProjectorService.createInitialEnvelope(binding, view, player);
        const { protocol, emitNext } = resolveProtocolEmission(socket);
        if (emitNext) {
            this.emitNextEnvelope(socket, envelope);
        }
        if (protocol === 'next') {
            this.emitNextInitialSync(binding.playerId, socket, view, player);
        }
        else {
            this.emitCompatInitialSync(binding.playerId, socket, view, player);
        }
        this.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
    }
    flushConnectedPlayers() {
        this.clearPurgedPlayerCaches();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            const view = this.worldRuntimeService.getPlayerView(binding.playerId);
            if (!socket || !view) {
                continue;
            }
            this.worldRuntimeService.refreshPlayerContextActions(binding.playerId, view);
            const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
            const envelope = this.worldProjectorService.createDeltaEnvelope(view, player);
            const { protocol, emitNext } = resolveProtocolEmission(socket);
            if (emitNext) {
                this.emitNextEnvelope(socket, envelope);
            }
            if (protocol === 'next') {
                this.emitNextDeltaSync(binding.playerId, socket, view, player);
            }
            else {
                this.emitCompatDeltaSync(binding.playerId, socket, view, player);
            }
            const lastQuestRevision = this.lastQuestRevisionByPlayerId.get(binding.playerId) ?? 0;
            if (lastQuestRevision !== player.quests.revision) {
                this.emitQuestSync(socket, binding.playerId, player.quests.revision);
            }
            this.emitPendingNotices(binding.playerId, socket);
        }
    }
    emitNextEnvelope(socket, envelope) {
        if (envelope?.initSession) {
            socket.emit(shared_1.NEXT_S2C.InitSession, envelope.initSession);
        }
        if (envelope?.mapEnter) {
            socket.emit(shared_1.NEXT_S2C.MapEnter, envelope.mapEnter);
        }
        if (envelope?.worldDelta) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, envelope.worldDelta);
        }
        if (envelope?.selfDelta) {
            socket.emit(shared_1.NEXT_S2C.SelfDelta, envelope.selfDelta);
        }
        if (envelope?.panelDelta) {
            socket.emit(shared_1.NEXT_S2C.PanelDelta, envelope.panelDelta);
        }
    }
    emitQuestSync(socket, playerId, revision) {
        const payload = {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
        const { emitNext, emitLegacy } = resolveProtocolEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Quests, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.QuestUpdate, payload);
        }
        this.lastQuestRevisionByPlayerId.set(playerId, revision);
    }
    clearDetachedPlayerCaches(playerId) {
        this.clearPlayerCaches(playerId, true);
    }
    clearPurgedPlayerCaches() {
        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }
    clearPlayerCaches(playerId, detachRuntimeSession) {
        this.worldProjectorService.clear(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.lastQuestRevisionByPlayerId.delete(playerId);
        this.syncStateByPlayerId.delete(playerId);
        this.lootWindowByPlayerId.delete(playerId);
        this.nextAuxStateByPlayerId.delete(playerId);
    }
    emitLootWindowUpdate(playerId) {
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        if (!socket) {
            return;
        }
        const payload = {
            window: this.buildLootWindowSyncState(playerId),
        };
        const { emitNext, emitLegacy } = resolveProtocolEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
            const nextAux = this.nextAuxStateByPlayerId.get(playerId);
            if (nextAux) {
                this.nextAuxStateByPlayerId.set(playerId, {
                    ...nextAux,
                    lootWindow: cloneLootWindow(payload.window),
                });
            }
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.LootWindowUpdate, payload);
        }
    }
    openLootWindow(playerId, x, y) {
        this.lootWindowByPlayerId.set(playerId, {
            tileX: Math.trunc(x),
            tileY: Math.trunc(y),
        });
        this.playerRuntimeService.openLootWindow(playerId, Math.trunc(x), Math.trunc(y));
        return {
            window: this.buildLootWindowSyncState(playerId),
        };
    }
    emitNextInitialSync(playerId, socket, view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTiles = this.buildVisibleTilesSnapshot(view, player, template);
        const renderEntities = this.buildRenderEntitiesSnapshot(view, player);
        const allMinimapMarkers = this.buildMinimapMarkers(template);
        const visibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
        const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
        const timeState = this.buildGameTimeState(template, view, player);
        const bootstrapPayload = this.buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
        socket.emit(shared_1.NEXT_S2C.Bootstrap, bootstrapPayload);
        socket.emit(shared_1.NEXT_S2C.MapStatic, this.buildMapStaticSyncPayload(template, {
            mapMeta: bootstrapPayload.mapMeta,
            minimap: bootstrapPayload.minimap,
            visibleMinimapMarkers,
            minimapLibrary,
        }));
        socket.emit(shared_1.NEXT_S2C.Realm, this.buildRealmSyncPayload(player));
        const lootWindow = this.buildLootWindowSyncState(playerId);
        socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, { window: lootWindow });
        this.nextAuxStateByPlayerId.set(playerId, {
            mapId: view.instance.templateId,
            instanceId: view.instance.instanceId,
            realm: cloneRealmState(player.realm),
            visibleMinimapMarkers: visibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
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
        const currentVisibleTileKeys = this.buildVisibleTileKeySet(view, player, template);
        const allMinimapMarkers = this.buildMinimapMarkers(template);
        const currentVisibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, currentVisibleTileKeys);
        const mapChanged = previous.mapId !== view.instance.templateId
            || previous.instanceId !== view.instance.instanceId;
        if (mapChanged) {
            const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
            socket.emit(shared_1.NEXT_S2C.MapStatic, this.buildMapStaticSyncPayload(template, {
                mapMeta: this.buildMapMetaSync(template),
                minimap: this.buildMinimapSnapshotSync(template),
                visibleMinimapMarkers: currentVisibleMinimapMarkers,
                minimapLibrary,
            }));
        }
        else {
            const markerPatch = diffVisibleMinimapMarkers(previous.visibleMinimapMarkers, currentVisibleMinimapMarkers);
            if (markerPatch.adds.length > 0 || markerPatch.removes.length > 0) {
                socket.emit(shared_1.NEXT_S2C.MapStatic, this.buildMapStaticSyncPayload(template, {
                    visibleMinimapMarkerAdds: markerPatch.adds.length > 0 ? markerPatch.adds : undefined,
                    visibleMinimapMarkerRemoves: markerPatch.removes.length > 0 ? markerPatch.removes : undefined,
                }));
            }
        }
        const currentRealm = cloneRealmState(player.realm);
        if (!isSameRealmState(previous.realm, currentRealm)) {
            socket.emit(shared_1.NEXT_S2C.Realm, this.buildRealmSyncPayload(player, currentRealm));
        }
        const lootWindow = this.buildLootWindowSyncState(playerId);
        if (!isSameLootWindow(previous.lootWindow ?? null, lootWindow)) {
            socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, { window: lootWindow });
        }
        this.nextAuxStateByPlayerId.set(playerId, {
            mapId: view.instance.templateId,
            instanceId: view.instance.instanceId,
            realm: currentRealm,
            visibleMinimapMarkers: currentVisibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
            lootWindow: cloneLootWindow(lootWindow),
        });
    }
    emitCompatInitialSync(playerId, socket, view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTiles = this.buildVisibleTilesSnapshot(view, player, template);
        const renderEntities = this.buildRenderEntitiesSnapshot(view, player);
        const groundPiles = toGroundPileMap(view.localGroundPiles);
        const path = this.worldRuntimeService.getLegacyNavigationPath(playerId);
        const threatArrows = this.buildThreatArrows(view);
        const allMinimapMarkers = this.buildMinimapMarkers(template);
        const visibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
        const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
        const timeState = this.buildGameTimeState(template, view, player);
        const initPayload = this.buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
        const mapStaticPayload = this.buildMapStaticSyncPayload(template, {
            mapMeta: initPayload.mapMeta,
            minimap: initPayload.minimap,
            visibleMinimapMarkers,
            minimapLibrary,
        });
        const { emitNext, emitLegacy } = resolveProtocolEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Bootstrap, initPayload);
            socket.emit(shared_1.NEXT_S2C.MapStatic, mapStaticPayload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.Init, initPayload);
        }
        const realmPayload = this.buildRealmSyncPayload(player);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Realm, realmPayload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.RealmUpdate, realmPayload);
        }
        const attrUpdate = this.buildAttrUpdate(null, player);
        if (attrUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.AttrUpdate, attrUpdate);
        }
        const inventoryUpdate = this.buildInventoryUpdate(null, player);
        if (inventoryUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.InventoryUpdate, inventoryUpdate);
        }
        const equipmentUpdate = this.buildEquipmentUpdate(null, player);
        if (equipmentUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.EquipmentUpdate, equipmentUpdate);
        }
        const techniqueUpdate = this.buildTechniqueUpdate(null, player);
        if (techniqueUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.TechniqueUpdate, techniqueUpdate);
        }
        const actionsUpdate = this.buildActionsUpdate(null, player);
        if (actionsUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.ActionsUpdate, actionsUpdate);
        }
        const lootWindow = this.buildLootWindowSyncState(playerId);
        const lootPayload = {
            window: lootWindow,
        };
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, lootPayload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.LootWindowUpdate, lootPayload);
        }
        this.syncStateByPlayerId.set(playerId, captureSyncSnapshot(view, player, template, timeState, path, threatArrows, visibleMinimapMarkers, renderEntities, visibleTiles.byKey, groundPiles, lootWindow));
    }
    emitCompatDeltaSync(playerId, socket, view, player) {
        const previous = this.syncStateByPlayerId.get(playerId) ?? null;
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const currentTiles = this.buildVisibleTilesSnapshot(view, player, template);
        const currentEntities = this.buildRenderEntitiesSnapshot(view, player);
        const currentGroundPiles = toGroundPileMap(view.localGroundPiles);
        const currentPath = this.worldRuntimeService.getLegacyNavigationPath(playerId);
        const currentThreatArrows = this.buildThreatArrows(view);
        const allMinimapMarkers = this.buildMinimapMarkers(template);
        const currentVisibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, currentTiles.byKey);
        const currentEffects = filterLegacyCombatEffects(this.worldRuntimeService.getLegacyCombatEffects(view.instance.instanceId), currentTiles.byKey);
        const currentTimeState = this.buildGameTimeState(template, view, player);
        const { emitNext, emitLegacy } = resolveProtocolEmission(socket);
        const mapChanged = !previous
            || previous.mapId !== view.instance.templateId
            || previous.instanceId !== view.instance.instanceId;
        if (mapChanged) {
            const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
            const mapStaticPayload = {
                mapId: template.id,
                mapMeta: this.buildMapMetaSync(template),
                minimap: this.buildMinimapSnapshotSync(template),
                visibleMinimapMarkers: currentVisibleMinimapMarkers,
                minimapLibrary,
            };
            if (emitNext) {
                socket.emit(shared_1.NEXT_S2C.MapStatic, mapStaticPayload);
            }
            if (emitLegacy) {
                socket.emit(shared_1.S2C.MapStaticSync, mapStaticPayload);
            }
        }
        else if (previous) {
            const markerPatch = diffVisibleMinimapMarkers(previous.visibleMinimapMarkers, currentVisibleMinimapMarkers);
            if (markerPatch.adds.length > 0 || markerPatch.removes.length > 0) {
                const mapStaticPatch = {
                    mapId: template.id,
                    visibleMinimapMarkerAdds: markerPatch.adds.length > 0 ? markerPatch.adds : undefined,
                    visibleMinimapMarkerRemoves: markerPatch.removes.length > 0 ? markerPatch.removes : undefined,
                };
                if (emitNext) {
                    socket.emit(shared_1.NEXT_S2C.MapStatic, mapStaticPatch);
                }
                if (emitLegacy) {
                    socket.emit(shared_1.S2C.MapStaticSync, mapStaticPatch);
                }
            }
        }
        const tickPayload = this.buildTickPayload(previous, view, player, template, currentTimeState, currentEntities, currentTiles, currentGroundPiles, currentPath, currentThreatArrows, currentEffects, mapChanged);
        if (tickPayload && emitLegacy) {
            socket.emit(shared_1.S2C.Tick, tickPayload);
        }
        if (!previous || previous.attrRevision !== player.attrs.revision) {
            const attrUpdate = this.buildAttrUpdate(previous?.attrState ?? null, player);
            if (attrUpdate && emitLegacy) {
                socket.emit(shared_1.S2C.AttrUpdate, attrUpdate);
            }
        }
        if (!previous || !isSameRealmState(previous.realm, player.realm)) {
            const realmPayload = this.buildRealmSyncPayload(player);
            if (emitNext) {
                socket.emit(shared_1.NEXT_S2C.Realm, realmPayload);
            }
            if (emitLegacy) {
                socket.emit(shared_1.S2C.RealmUpdate, realmPayload);
            }
        }
        const inventoryUpdate = this.buildInventoryUpdate(previous, player);
        if (inventoryUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.InventoryUpdate, inventoryUpdate);
        }
        const equipmentUpdate = this.buildEquipmentUpdate(previous, player);
        if (equipmentUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.EquipmentUpdate, equipmentUpdate);
        }
        const techniqueUpdate = this.buildTechniqueUpdate(previous, player);
        if (techniqueUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.TechniqueUpdate, techniqueUpdate);
        }
        const actionsUpdate = this.buildActionsUpdate(previous, player);
        if (actionsUpdate && emitLegacy) {
            socket.emit(shared_1.S2C.ActionsUpdate, actionsUpdate);
        }
        const lootWindow = this.buildLootWindowSyncState(playerId);
        if (!isSameLootWindow(previous?.lootWindow ?? null, lootWindow)) {
            const lootPayload = {
                window: lootWindow,
            };
            if (emitNext) {
                socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, lootPayload);
            }
            if (emitLegacy) {
                socket.emit(shared_1.S2C.LootWindowUpdate, lootPayload);
            }
        }
        this.syncStateByPlayerId.set(playerId, captureSyncSnapshot(view, player, template, currentTimeState, currentPath, currentThreatArrows, currentVisibleMinimapMarkers, currentEntities, currentTiles.byKey, currentGroundPiles, lootWindow));
    }
    buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState) {
        return {
            self: this.buildPlayerSyncState(player, view, minimapLibrary.map((entry) => entry.mapId)),
            mapMeta: buildMapMetaSync(template),
            minimap: buildMinimapSnapshotSync(template),
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
            visibleMinimapMarkers: options.visibleMinimapMarkers,
            visibleMinimapMarkerAdds: options.visibleMinimapMarkerAdds,
            visibleMinimapMarkerRemoves: options.visibleMinimapMarkerRemoves,
        };
    }
    buildRealmSyncPayload(player, realm = cloneRealmState(player.realm)) {
        return {
            realm,
        };
    }
    buildPlayerSyncState(player, view, unlockedMinimapIds) {
        return buildPlayerSyncState(player, view, unlockedMinimapIds);
    }
    buildMapMetaSync(template) {
        return buildMapMetaSync(template);
    }
    buildMinimapSnapshotSync(template) {
        return buildMinimapSnapshotSync(template);
    }
    buildMinimapMarkers(template) {
        return buildMinimapMarkers(template);
    }
    buildVisibleMinimapMarkers(markers, visibleTiles) {
        return buildVisibleMinimapMarkers(markers, visibleTiles);
    }
    getMapTimeConfig(mapId) {
        return this.mapRuntimeConfigService.getMapTimeConfig(mapId);
    }
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
    }
    buildGameTimeState(template, view, player) {
        return buildGameTimeState(template, view.tick, Math.max(1, Math.round(player.attrs.numericStats.viewRange)), this.getMapTimeConfig(view.instance.templateId), this.getMapTickSpeed(view.instance.templateId));
    }
    buildVisibleTilesSnapshot(view, player, template) {
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const originX = view.self.x - radius;
        const originY = view.self.y - radius;
        const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
        const matrix = [];
        const byKey = new Map();
        for (let row = 0; row < radius * 2 + 1; row += 1) {
            const y = originY + row;
            const line = [];
            for (let column = 0; column < radius * 2 + 1; column += 1) {
                const x = originX + column;
                const tileIndex = x >= 0 && y >= 0 && x < template.width && y < template.height
                    ? (0, map_template_repository_1.getTileIndex)(x, y, template.width)
                    : -1;
                const tile = visibleTileIndices.size > 0 && !visibleTileIndices.has(tileIndex)
                    ? null
                    : this.buildTileSyncState(template, view.instance.instanceId, x, y);
                line.push(tile);
                if (tile) {
                    byKey.set(buildCoordKey(x, y), tile);
                }
            }
            matrix.push(line);
        }
        return {
            matrix,
            byKey,
        };
    }
    buildRenderEntitiesSnapshot(view, player) {
        const entities = new Map();
        entities.set(player.playerId, buildPlayerRenderEntity(player, '#ff0'));
        for (const visible of view.visiblePlayers) {
            const target = this.playerRuntimeService.getPlayer(visible.playerId);
            if (!target || target.instanceId !== player.instanceId) {
                continue;
            }
            entities.set(target.playerId, buildPlayerRenderEntity(target, '#0f0'));
        }
        for (const npc of view.localNpcs) {
            entities.set(npc.npcId, {
                id: npc.npcId,
                x: npc.x,
                y: npc.y,
                char: npc.char,
                color: npc.color,
                name: npc.name,
                kind: 'npc',
                npcQuestMarker: npc.questMarker ?? undefined,
            });
        }
        for (const monster of view.localMonsters) {
            entities.set(monster.runtimeId, {
                id: monster.runtimeId,
                x: monster.x,
                y: monster.y,
                char: monster.char,
                color: monster.color,
                name: monster.name,
                kind: 'monster',
                monsterTier: monster.tier,
                hp: monster.hp,
                maxHp: monster.maxHp,
            });
        }
        for (const container of view.localContainers) {
            entities.set(`container:${view.instance.templateId}:${container.id}`, {
                id: `container:${view.instance.templateId}:${container.id}`,
                x: container.x,
                y: container.y,
                char: container.char,
                color: container.color,
                name: container.name,
                kind: 'container',
            });
        }
        return entities;
    }
    buildMinimapLibrarySync(player, currentMapId) {
        const mapIds = Array.from(new Set([...player.unlockedMapIds, currentMapId]))
            .filter((entry) => this.templateRepository.has(entry))
            .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        return mapIds.map((mapId) => {
            const template = this.templateRepository.getOrThrow(mapId);
            return {
                mapId,
                mapMeta: this.buildMapMetaSync(template),
                snapshot: buildMinimapSnapshotSync(template),
            };
        });
    }
    buildTileSyncState(template, instanceId, x, y) {
        if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
            return null;
        }
        const state = this.worldRuntimeService.getInstanceTileState(instanceId, x, y);
        if (!state) {
            return null;
        }
        const tileType = (0, shared_1.getTileTypeFromMapChar)(template.terrainRows[y]?.[x] ?? '#');
        return {
            type: tileType,
            walkable: (0, shared_1.isTileTypeWalkable)(tileType),
            blocksSight: (0, shared_1.doesTileTypeBlockSight)(tileType),
            aura: state.aura,
            occupiedBy: null,
            modifiedAt: state.combat?.modifiedAt ?? null,
            hp: state.combat?.hp,
            maxHp: state.combat?.maxHp,
        };
    }
    buildAttrUpdate(previous, player) {
        return buildAttrUpdate(previous, player);
    }
    buildInventoryUpdate(previous, player) {
        return buildInventoryUpdate(previous, player);
    }
    buildEquipmentUpdate(previous, player) {
        return buildEquipmentUpdate(previous, player);
    }
    buildTechniqueUpdate(previous, player) {
        return buildTechniqueUpdate(previous, player);
    }
    buildActionsUpdate(previous, player) {
        return buildActionsUpdate(previous, player);
    }
    buildTickPayload(previous, view, player, template, timeState, renderEntities, visibleTiles, groundPiles, path, threatArrows, effects, mapChanged) {
        return buildTickPayload(previous, view, player, template, timeState, renderEntities, visibleTiles, groundPiles, path, threatArrows, effects, mapChanged);
    }
    buildVisibleTileKeySet(view, player, template) {
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const originX = view.self.x - radius;
        const originY = view.self.y - radius;
        const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
        const keys = new Set();
        for (let row = 0; row < radius * 2 + 1; row += 1) {
            const y = originY + row;
            for (let column = 0; column < radius * 2 + 1; column += 1) {
                const x = originX + column;
                if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
                    continue;
                }
                const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
                if (visibleTileIndices.size > 0 && !visibleTileIndices.has(tileIndex)) {
                    continue;
                }
                if (!this.worldRuntimeService.getInstanceTileState(view.instance.instanceId, x, y)) {
                    continue;
                }
                keys.add(buildCoordKey(x, y));
            }
        }
        return keys;
    }
    buildThreatArrows(view) {
        const visiblePlayerIds = new Set([
            view.playerId,
            ...view.visiblePlayers.map((entry) => entry.playerId),
        ]);
        const arrows = [];
        for (const monster of view.localMonsters) {
            const runtimeMonster = this.worldRuntimeService.getInstanceMonster(view.instance.instanceId, monster.runtimeId);
            if (!runtimeMonster?.alive || !runtimeMonster.aggroTargetPlayerId) {
                continue;
            }
            if (!visiblePlayerIds.has(runtimeMonster.aggroTargetPlayerId)) {
                continue;
            }
            arrows.push([monster.runtimeId, runtimeMonster.aggroTargetPlayerId]);
        }
        arrows.sort(compareThreatArrows);
        return arrows;
    }
    emitPendingNotices(playerId, socket) {
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        const protocol = getSocketProtocol(socket);
        if (protocol !== 'legacy') {
            socket.emit(shared_1.NEXT_S2C.Notice, { items });
        }
        if (protocol !== 'next') {
            for (const item of items) {
                socket.emit(shared_1.S2C.SystemMsg, {
                    text: item.text,
                    kind: mapLegacyNoticeKind(item.kind),
                });
            }
        }
    }
    buildLootWindowSyncState(playerId) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            this.lootWindowByPlayerId.delete(playerId);
            return null;
        }
        const target = this.playerRuntimeService.getLootWindowTarget(playerId) ?? this.lootWindowByPlayerId.get(playerId);
        if (!target) {
            return null;
        }
        const lootWindow = this.worldRuntimeService.buildLootWindowSyncState(playerId, target.tileX, target.tileY);
        if (!lootWindow) {
            this.playerRuntimeService.clearLootWindow(playerId);
            this.lootWindowByPlayerId.delete(playerId);
            return null;
        }
        return lootWindow;
    }
};
exports.WorldSyncService = WorldSyncService;
exports.WorldSyncService = WorldSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        world_projector_service_1.WorldProjectorService,
        world_session_service_1.WorldSessionService,
        map_template_repository_1.MapTemplateRepository,
        legacy_gm_http_compat_service_1.LegacyGmHttpCompatService])
], WorldSyncService);
function captureSyncSnapshot(view, player, template, timeState, path, threatArrows, visibleMinimapMarkers, renderEntities, visibleTiles, groundPiles, lootWindow) {
    const normalizedActions = player.actions.actions.map((entry) => normalizeActionEntry(entry));
    return {
        mapId: view.instance.templateId,
        instanceId: view.instance.instanceId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        hp: player.hp,
        qi: player.qi,
        attrRevision: player.attrs.revision,
        attrState: captureAttrState(player),
        inventoryRevision: player.inventory.revision,
        inventoryCapacity: player.inventory.capacity,
        inventoryItems: player.inventory.items.map((entry) => cloneSyncedItem(entry)),
        equipmentRevision: player.equipment.revision,
        equipmentSlots: player.equipment.slots.map((entry) => cloneEquipmentSlot(entry)),
        techniqueRevision: player.techniques.revision,
        cultivatingTechId: player.techniques.cultivatingTechId,
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
        actionRevision: player.actions.revision,
        actions: normalizedActions,
        realm: cloneRealmState(player.realm),
        autoBattle: player.combat.autoBattle,
        combatTargetId: player.combat.combatTargetId,
        combatTargetLocked: player.combat.combatTargetLocked,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
        timeState: cloneGameTimeState(timeState),
        auraLevelBaseValue: shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE,
        path: clonePathTuples(path),
        threatArrows: cloneThreatArrows(threatArrows),
        visibleMinimapMarkers: visibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
        renderEntities: new Map(Array.from(renderEntities.entries(), ([id, entry]) => [id, cloneRenderEntity(entry)])),
        visibleTiles: new Map(Array.from(visibleTiles.entries(), ([key, entry]) => [key, cloneTile(entry)])),
        groundPiles: new Map(Array.from(groundPiles.entries(), ([id, entry]) => [id, cloneGroundPile(entry)])),
        lootWindow: cloneLootWindow(lootWindow),
    };
}
function buildTickPayload(previous, view, player, template, timeState, renderEntities, visibleTiles, groundPiles, path, threatArrows, effects, mapChanged) {
    const entityPatch = diffRenderEntities(previous?.renderEntities ?? null, renderEntities, mapChanged);
    const tilePatches = mapChanged
        ? []
        : diffVisibleTiles(previous?.visibleTiles ?? null, visibleTiles.byKey);
    const groundPatches = diffGroundPiles(previous?.groundPiles ?? null, groundPiles, mapChanged);
    const pathChanged = mapChanged || !previous || !isSamePathTuples(previous.path, path);
    const threatArrowPatch = diffThreatArrows(previous?.threatArrows ?? null, threatArrows, mapChanged);
    const hpChanged = mapChanged || !previous || previous.hp !== player.hp;
    const qiChanged = mapChanged || !previous || previous.qi !== player.qi;
    const facingChanged = mapChanged || !previous || previous.facing !== player.facing;
    const moved = mapChanged || !previous || previous.x !== player.x || previous.y !== player.y;
    const timeChanged = mapChanged || !previous || !isSameGameTimeState(previous.timeState, timeState);
    const auraLevelBaseChanged = mapChanged || !previous || previous.auraLevelBaseValue !== shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE;
    if (!mapChanged
        && !moved
        && entityPatch.players.length === 0
        && entityPatch.entities.length === 0
        && entityPatch.removed.length === 0
        && tilePatches.length === 0
        && groundPatches.length === 0
        && !pathChanged
        && effects.length === 0
        && threatArrowPatch.full === null
        && threatArrowPatch.adds.length === 0
        && threatArrowPatch.removes.length === 0
        && !hpChanged
        && !qiChanged
        && !facingChanged
        && !timeChanged
        && !auraLevelBaseChanged) {
        return null;
    }
    const payload = {
        p: entityPatch.players,
        e: entityPatch.entities,
        dt: 1000,
    };
    if (entityPatch.removed.length > 0 && !mapChanged) {
        payload.r = entityPatch.removed;
    }
    if (mapChanged) {
        payload.m = view.instance.templateId;
        payload.v = visibleTiles.matrix;
    }
    else if (tilePatches.length > 0) {
        payload.t = tilePatches;
    }
    if (groundPatches.length > 0) {
        payload.g = groundPatches;
    }
    if (effects.length > 0) {
        payload.fx = effects.map((entry) => cloneCombatEffect(entry));
    }
    if (threatArrowPatch.full) {
        payload.threatArrows = threatArrowPatch.full;
    }
    else {
        if (threatArrowPatch.adds.length > 0) {
            payload.threatArrowAdds = threatArrowPatch.adds;
        }
        if (threatArrowPatch.removes.length > 0) {
            payload.threatArrowRemoves = threatArrowPatch.removes;
        }
    }
    if (hpChanged) {
        payload.hp = player.hp;
    }
    if (qiChanged) {
        payload.qi = player.qi;
    }
    if (facingChanged) {
        payload.f = player.facing;
    }
    if (pathChanged) {
        payload.path = clonePathTuples(path);
    }
    if (timeChanged) {
        payload.time = cloneGameTimeState(timeState);
    }
    if (auraLevelBaseChanged) {
        payload.auraLevelBaseValue = shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE;
    }
    return payload;
}
function buildAttrUpdate(previous, player) {
    const next = captureAttrState(player);
    if (!previous) {
        return next;
    }
    const patch = {};
    if (!isSameAttributes(previous.baseAttrs, next.baseAttrs)) {
        patch.baseAttrs = cloneAttributes(next.baseAttrs);
    }
    if (!isSameAttrBonuses(previous.bonuses, next.bonuses)) {
        patch.bonuses = next.bonuses.slice();
    }
    if (!isSameAttributes(previous.finalAttrs, next.finalAttrs)) {
        patch.finalAttrs = cloneAttributes(next.finalAttrs);
    }
    if (!isSameNumericRecord(previous.numericStats, next.numericStats)) {
        patch.numericStats = (0, shared_1.cloneNumericStats)(next.numericStats);
    }
    if (!isSameNumericRecord(previous.ratioDivisors, next.ratioDivisors)) {
        patch.ratioDivisors = (0, shared_1.cloneNumericRatioDivisors)(next.ratioDivisors);
    }
    if (previous.maxHp !== next.maxHp) {
        patch.maxHp = next.maxHp;
    }
    if (previous.qi !== next.qi) {
        patch.qi = next.qi;
    }
    if (!isSameSpecialStats(previous.specialStats, next.specialStats)) {
        patch.specialStats = cloneSpecialStats(next.specialStats);
    }
    if (previous.boneAgeBaseYears !== next.boneAgeBaseYears) {
        patch.boneAgeBaseYears = next.boneAgeBaseYears;
    }
    if (previous.lifeElapsedTicks !== next.lifeElapsedTicks) {
        patch.lifeElapsedTicks = next.lifeElapsedTicks;
    }
    if (previous.lifespanYears !== next.lifespanYears) {
        patch.lifespanYears = next.lifespanYears;
    }
    if (previous.realmProgress !== next.realmProgress) {
        patch.realmProgress = next.realmProgress;
    }
    if (previous.realmProgressToNext !== next.realmProgressToNext) {
        patch.realmProgressToNext = next.realmProgressToNext;
    }
    if (previous.realmBreakthroughReady !== next.realmBreakthroughReady) {
        patch.realmBreakthroughReady = next.realmBreakthroughReady;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
function captureAttrState(player) {
    return {
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
        ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
        maxHp: player.maxHp,
        qi: player.qi,
        specialStats: {
            foundation: player.foundation,
            combatExp: player.combatExp,
        },
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
    };
}
function buildInventoryUpdate(previous, player) {
    if (previous && previous.inventoryRevision === player.inventory.revision) {
        return null;
    }
    if (!previous) {
        return {
            inventory: {
                capacity: player.inventory.capacity,
                items: player.inventory.items.map((entry) => cloneSyncedItem(entry)),
            },
            capacity: player.inventory.capacity,
            size: player.inventory.items.length,
        };
    }
    const slots = diffInventorySlots(previous.inventoryItems, player.inventory.items);
    const capacityChanged = previous.inventoryCapacity !== player.inventory.capacity;
    const sizeChanged = previous.inventoryItems.length !== player.inventory.items.length;
    if (!capacityChanged && !sizeChanged && slots.length === 0) {
        return null;
    }
    return {
        capacity: capacityChanged ? player.inventory.capacity : undefined,
        size: sizeChanged ? player.inventory.items.length : undefined,
        slots: slots.length > 0 ? slots : undefined,
    };
}
function buildEquipmentUpdate(previous, player) {
    if (previous && previous.equipmentRevision === player.equipment.revision) {
        return null;
    }
    const slots = !previous
        ? player.equipment.slots.map((entry) => cloneEquipmentSlot(entry))
        : diffEquipmentSlots(previous.equipmentSlots, player.equipment.slots);
    return slots.length > 0 ? { slots } : null;
}
function buildTechniqueUpdate(previous, player) {
    if (previous && previous.techniqueRevision === player.techniques.revision) {
        return null;
    }
    if (!previous) {
        return {
            techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
            cultivatingTechId: player.techniques.cultivatingTechId,
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        };
    }
    const techniques = diffTechniqueEntries(previous.techniques, player.techniques.techniques);
    const removeTechniqueIds = diffRemovedIds(previous.techniques.map((entry) => entry.techId), player.techniques.techniques.map((entry) => entry.techId));
    const cultivatingChanged = previous.cultivatingTechId !== player.techniques.cultivatingTechId;
    const bodyTrainingChanged = !isSameBodyTrainingState(previous.bodyTraining ?? null, player.bodyTraining ?? null);
    if (techniques.length === 0 && removeTechniqueIds.length === 0 && !cultivatingChanged && !bodyTrainingChanged) {
        return null;
    }
    return {
        techniques,
        removeTechniqueIds: removeTechniqueIds.length > 0 ? removeTechniqueIds : undefined,
        cultivatingTechId: cultivatingChanged ? player.techniques.cultivatingTechId : undefined,
        bodyTraining: bodyTrainingChanged ? (player.bodyTraining ? { ...player.bodyTraining } : null) : undefined,
    };
}
function buildActionsUpdate(previous, player) {
    const normalizedActions = player.actions.actions.map((entry) => normalizeActionEntry(entry));
    if (previous
        && previous.actionRevision === player.actions.revision
        && previous.autoBattle === player.combat.autoBattle
        && previous.combatTargetId === player.combat.combatTargetId
        && previous.combatTargetLocked === player.combat.combatTargetLocked
        && previous.autoRetaliate === player.combat.autoRetaliate
        && previous.autoBattleStationary === player.combat.autoBattleStationary
        && previous.allowAoePlayerHit === player.combat.allowAoePlayerHit
        && previous.autoIdleCultivation === player.combat.autoIdleCultivation
        && previous.autoSwitchCultivation === player.combat.autoSwitchCultivation
        && previous.cultivationActive === player.combat.cultivationActive
        && previous.senseQiActive === player.combat.senseQiActive) {
        return null;
    }
    if (!previous) {
        return {
            actions: normalizedActions,
            actionOrder: normalizedActions.map((entry) => entry.id),
            autoBattle: player.combat.autoBattle,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            cultivationActive: player.combat.cultivationActive,
            senseQiActive: player.combat.senseQiActive,
        };
    }
    const actions = diffActionEntries(previous.actions, normalizedActions);
    const removeActionIds = diffRemovedIds(previous.actions.map((entry) => entry.id), normalizedActions.map((entry) => entry.id));
    const topLevelChanged = previous.autoBattle !== player.combat.autoBattle
        || previous.combatTargetId !== player.combat.combatTargetId
        || previous.combatTargetLocked !== player.combat.combatTargetLocked
        || previous.autoRetaliate !== player.combat.autoRetaliate
        || previous.autoBattleStationary !== player.combat.autoBattleStationary
        || previous.allowAoePlayerHit !== player.combat.allowAoePlayerHit
        || previous.autoIdleCultivation !== player.combat.autoIdleCultivation
        || previous.autoSwitchCultivation !== player.combat.autoSwitchCultivation
        || previous.cultivationActive !== player.combat.cultivationActive
        || previous.senseQiActive !== player.combat.senseQiActive;
    if (actions.length === 0 && removeActionIds.length === 0 && !topLevelChanged) {
        return null;
    }
    return {
        actions,
        removeActionIds: removeActionIds.length > 0 ? removeActionIds : undefined,
        actionOrder: normalizedActions.map((entry) => entry.id),
        autoBattle: player.combat.autoBattle,
        combatTargetId: player.combat.combatTargetId,
        combatTargetLocked: player.combat.combatTargetLocked,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
    };
}
function normalizeActionEntry(entry) {
    const normalizedId = entry.id.startsWith('npc_quests:')
        ? `npc:${entry.id.slice('npc_quests:'.length)}`
        : entry.id;
    if (normalizedId === entry.id) {
        return cloneActionEntry(entry);
    }
    return {
        ...cloneActionEntry(entry),
        id: normalizedId,
    };
}
function buildPlayerSyncState(player, view, unlockedMinimapIds) {
    return {
        id: player.playerId,
        name: player.name,
        displayName: player.displayName,
        online: true,
        inWorld: true,
        senseQiActive: player.combat.senseQiActive,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        mapId: view.instance.templateId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        viewRange: Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        dead: player.hp <= 0,
        foundation: player.foundation,
        combatExp: player.combatExp,
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        temporaryBuffs: player.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
        ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
        inventory: {
            capacity: player.inventory.capacity,
            items: player.inventory.items.map((entry) => toItemStackState(entry)),
        },
        marketStorage: {
            items: [],
        },
        equipment: buildEquipmentRecord(player.equipment.slots),
        techniques: player.techniques.techniques.map((entry) => toTechniqueState(entry)),
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : undefined,
        actions: player.actions.actions.map((entry) => toActionDefinition(entry)),
        quests: player.quests.quests.map((entry) => cloneQuestState(entry)),
        realm: cloneRealmState(player.realm) ?? undefined,
        realmLv: player.realm?.realmLv,
        realmName: player.realm?.name,
        realmStage: player.realm?.shortName || undefined,
        realmReview: player.realm?.review,
        breakthroughReady: player.realm?.breakthroughReady,
        heavenGate: cloneHeavenGateState(player.heavenGate) ?? undefined,
        spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots) ?? undefined,
        autoBattle: player.combat.autoBattle,
        autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
        combatTargetId: player.combat.combatTargetId ?? undefined,
        combatTargetLocked: player.combat.combatTargetLocked,
        cultivatingTechId: player.techniques.cultivatingTechId ?? undefined,
        unlockedMinimapIds,
    };
}
function buildMapMetaSync(template) {
    return {
        id: template.id,
        name: template.name,
        width: template.width,
        height: template.height,
        routeDomain: template.routeDomain,
        parentMapId: template.source.parentMapId,
        parentOriginX: template.source.parentOriginX,
        parentOriginY: template.source.parentOriginY,
        floorLevel: template.source.floorLevel,
        floorName: template.source.floorName,
        spaceVisionMode: template.source.spaceVisionMode,
        dangerLevel: template.source.dangerLevel,
        recommendedRealm: template.source.recommendedRealm,
        description: template.source.description,
    };
}
function buildMinimapSnapshotSync(template) {
    return {
        width: template.width,
        height: template.height,
        terrainRows: template.terrainRows.slice(),
        markers: buildMinimapMarkers(template),
    };
}
function buildMinimapMarkers(template) {
    const markers = [];
    for (const landmark of template.landmarks) {
        markers.push({
            id: `landmark:${landmark.id}`,
            kind: 'landmark',
            x: landmark.x,
            y: landmark.y,
            label: landmark.name,
            detail: landmark.desc,
        });
    }
    for (const container of template.containers) {
        markers.push({
            id: `container:${container.id}`,
            kind: 'container',
            x: container.x,
            y: container.y,
            label: container.name,
            detail: container.desc?.trim() || '可搜索容器',
        });
    }
    for (const npc of template.npcs) {
        markers.push({
            id: `npc:${npc.id}`,
            kind: 'npc',
            x: npc.x,
            y: npc.y,
            label: npc.name,
        });
    }
    for (const portal of template.portals) {
        if (portal.hidden) {
            continue;
        }
        markers.push({
            id: `${portal.kind}:${portal.x},${portal.y}`,
            kind: portal.kind,
            x: portal.x,
            y: portal.y,
            label: portal.kind === 'stairs' ? '楼梯' : '传送点',
            detail: portal.targetMapId,
        });
    }
    markers.sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN'));
    return markers;
}
function buildVisibleMinimapMarkers(markers, visibleTiles) {
    if (markers.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    const visible = [];
    for (const marker of markers) {
        if (!visibleTiles.has(buildCoordKey(marker.x, marker.y))) {
            continue;
        }
        visible.push(cloneMinimapMarker(marker));
    }
    return visible;
}
function diffVisibleMinimapMarkers(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    const currentById = new Map(current.map((entry) => [entry.id, entry]));
    const adds = [];
    const removes = [];
    for (const [markerId, marker] of currentById.entries()) {
        const previousMarker = previousById.get(markerId);
        if (!previousMarker || !isSameMinimapMarker(previousMarker, marker)) {
            adds.push(cloneMinimapMarker(marker));
        }
    }
    for (const markerId of previousById.keys()) {
        if (!currentById.has(markerId)) {
            removes.push(markerId);
        }
    }
    return {
        adds,
        removes,
    };
}
function buildGameTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed = 1) {
    const config = normalizeMapTimeConfig(overrideConfig ?? template.source.time);
    const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0
        ? config.scale
        : 1;
    const timeScale = tickSpeed > 0 ? localTimeScale : 0;
    const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks)
        ? Math.round(config.offsetTicks)
        : 0;
    const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
    const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % shared_1.GAME_DAY_TICKS + shared_1.GAME_DAY_TICKS) % shared_1.GAME_DAY_TICKS;
    const phase = shared_1.GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
        ?? shared_1.GAME_TIME_PHASES[shared_1.GAME_TIME_PHASES.length - 1];
    const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base)
        ? config.light.base
        : 0;
    const timeInfluence = typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence)
        ? config.light.timeInfluence
        : 100;
    const lightPercent = Math.max(0, Math.min(100, Math.round(baseLight + phase.skyLightPercent * (timeInfluence / 100))));
    const darknessStacks = resolveDarknessStacks(lightPercent);
    const visionMultiplier = shared_1.DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
    const palette = config.palette?.[phase.id];
    return {
        totalTicks,
        localTicks,
        dayLength: shared_1.GAME_DAY_TICKS,
        timeScale,
        phase: phase.id,
        phaseLabel: phase.label,
        darknessStacks,
        visionMultiplier,
        lightPercent,
        effectiveViewRange: Math.max(1, Math.ceil(Math.max(1, baseViewRange) * visionMultiplier)),
        tint: palette?.tint ?? phase.tint,
        overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, (100 - lightPercent) / 100 * 0.8),
    };
}
function normalizeMapTimeConfig(input) {
    const candidate = (input ?? {});
    return {
        offsetTicks: candidate.offsetTicks,
        scale: candidate.scale,
        light: candidate.light,
        palette: candidate.palette,
    };
}
function resolveDarknessStacks(lightPercent) {
    if (lightPercent >= 95)
        return 0;
    if (lightPercent >= 85)
        return 1;
    if (lightPercent >= 75)
        return 2;
    if (lightPercent >= 65)
        return 3;
    if (lightPercent >= 55)
        return 4;
    return 5;
}
function cloneGameTimeState(source) {
    return { ...source };
}
function isSameGameTimeState(left, right) {
    return left.totalTicks === right.totalTicks
        && left.localTicks === right.localTicks
        && left.dayLength === right.dayLength
        && left.timeScale === right.timeScale
        && left.phase === right.phase
        && left.phaseLabel === right.phaseLabel
        && left.darknessStacks === right.darknessStacks
        && left.visionMultiplier === right.visionMultiplier
        && left.lightPercent === right.lightPercent
        && left.effectiveViewRange === right.effectiveViewRange
        && left.tint === right.tint
        && left.overlayAlpha === right.overlayAlpha;
}
function buildPlayerRenderEntity(player, color) {
    return {
        id: player.playerId,
        x: player.x,
        y: player.y,
        char: (player.displayName.trim()[0] ?? player.name.trim()[0] ?? player.playerId.trim()[0] ?? '@'),
        color,
        name: player.name,
        kind: 'player',
        hp: player.hp,
        maxHp: player.maxHp,
    };
}
function diffRenderEntities(previous, current, fullSync) {
    const players = [];
    const entities = [];
    const removed = [];
    for (const [id, entry] of current) {
        const prev = fullSync ? null : (previous?.get(id) ?? null);
        const patch = buildRenderEntityPatch(prev, entry);
        if (!patch) {
            continue;
        }
        if (entry.kind === 'player') {
            players.push(patch);
        }
        else {
            entities.push(patch);
        }
    }
    if (!fullSync && previous) {
        for (const id of previous.keys()) {
            if (!current.has(id)) {
                removed.push(id);
            }
        }
    }
    return { players, entities, removed };
}
function buildRenderEntityPatch(previous, current) {
    if (!previous) {
        return toTickRenderEntity(current);
    }
    const patch = {
        id: current.id,
        x: current.x,
        y: current.y,
    };
    let changed = previous.x !== current.x || previous.y !== current.y;
    if (previous.char !== current.char) {
        patch.char = current.char;
        changed = true;
    }
    if (previous.color !== current.color) {
        patch.color = current.color;
        changed = true;
    }
    if (previous.name !== current.name) {
        patch.name = current.name ?? null;
        changed = true;
    }
    if (previous.kind !== current.kind) {
        patch.kind = current.kind ?? null;
        changed = true;
    }
    if (previous.monsterTier !== current.monsterTier) {
        patch.monsterTier = current.monsterTier ?? null;
        changed = true;
    }
    if (previous.hp !== current.hp) {
        patch.hp = current.hp ?? null;
        changed = true;
    }
    if (previous.maxHp !== current.maxHp) {
        patch.maxHp = current.maxHp ?? null;
        changed = true;
    }
    if (!isSameNpcQuestMarker(previous.npcQuestMarker ?? null, current.npcQuestMarker ?? null)) {
        patch.npcQuestMarker = current.npcQuestMarker ?? null;
        changed = true;
    }
    return changed ? patch : null;
}
function toTickRenderEntity(source) {
    return {
        id: source.id,
        x: source.x,
        y: source.y,
        char: source.char,
        color: source.color,
        name: source.name ?? null,
        kind: source.kind ?? null,
        monsterTier: source.monsterTier ?? null,
        hp: source.hp ?? null,
        maxHp: source.maxHp ?? null,
        npcQuestMarker: source.npcQuestMarker ?? null,
    };
}
function diffVisibleTiles(previous, current) {
    const patches = [];
    for (const [key, tile] of current) {
        const prev = previous?.get(key) ?? null;
        if (!prev || !isSameTile(prev, tile)) {
            const [x, y] = parseCoordKey(key);
            patches.push({ x, y, tile: cloneTile(tile) });
        }
    }
    if (previous) {
        for (const key of previous.keys()) {
            if (current.has(key)) {
                continue;
            }
            const [x, y] = parseCoordKey(key);
            patches.push({ x, y, tile: null });
        }
    }
    return patches;
}
function diffGroundPiles(previous, current, fullSync) {
    const patches = [];
    for (const [sourceId, pile] of current) {
        const prev = fullSync ? null : (previous?.get(sourceId) ?? null);
        if (!prev || !isSameGroundPile(prev, pile)) {
            patches.push({
                sourceId,
                x: pile.x,
                y: pile.y,
                items: pile.items.map((entry) => ({ ...entry })),
            });
        }
    }
    if (!fullSync && previous) {
        for (const [sourceId, pile] of previous) {
            if (current.has(sourceId)) {
                continue;
            }
            patches.push({
                sourceId,
                x: pile.x,
                y: pile.y,
                items: null,
            });
        }
    }
    return patches;
}
function diffInventorySlots(previous, current) {
    const patch = [];
    const maxLength = Math.max(previous.length, current.length);
    for (let index = 0; index < maxLength; index += 1) {
        const prev = previous[index] ?? null;
        const next = current[index] ?? null;
        if (!isSameSyncedItem(prev, next)) {
            patch.push({
                slotIndex: index,
                item: next ? cloneSyncedItem(next) : null,
            });
        }
    }
    return patch;
}
function diffEquipmentSlots(previous, current) {
    const previousBySlot = new Map(previous.map((entry) => [entry.slot, entry]));
    const patch = [];
    for (const entry of current) {
        const prev = previousBySlot.get(entry.slot) ?? null;
        if (!prev || !isSameSyncedItem(prev.item ?? null, entry.item ?? null)) {
            patch.push(cloneEquipmentSlot(entry));
        }
    }
    return patch;
}
function diffTechniqueEntries(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    const patch = [];
    for (const entry of current) {
        const prev = previousById.get(entry.techId) ?? null;
        if (!isSameTechniqueEntry(prev, entry)) {
            patch.push(cloneTechniqueEntry(entry));
        }
    }
    return patch;
}
function diffActionEntries(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    const patch = [];
    for (const entry of current) {
        const prev = previousById.get(entry.id) ?? null;
        if (!isSameActionEntry(prev, entry)) {
            patch.push(cloneActionEntry(entry));
        }
    }
    return patch;
}
function diffRemovedIds(previous, current) {
    const currentSet = new Set(current);
    return previous.filter((entry) => !currentSet.has(entry));
}
function buildEquipmentRecord(entries) {
    const record = {
        weapon: null,
        head: null,
        body: null,
        legs: null,
        accessory: null,
    };
    for (const slot of shared_1.EQUIP_SLOTS) {
        const entry = entries.find((candidate) => candidate.slot === slot);
        record[slot] = entry?.item ? toItemStackState(entry.item) : null;
    }
    return record;
}
function toTechniqueState(entry) {
    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
function toActionDefinition(entry) {
    const normalizedEntry = normalizeActionEntry(entry);
    return {
        id: normalizedEntry.id,
        name: normalizedEntry.name ?? normalizedEntry.id,
        type: normalizedEntry.type ?? 'interact',
        desc: normalizedEntry.desc ?? '',
        cooldownLeft: normalizedEntry.cooldownLeft ?? 0,
        range: normalizedEntry.range ?? undefined,
        requiresTarget: normalizedEntry.requiresTarget ?? undefined,
        targetMode: normalizedEntry.targetMode ?? undefined,
        autoBattleEnabled: normalizedEntry.autoBattleEnabled ?? undefined,
        autoBattleOrder: normalizedEntry.autoBattleOrder ?? undefined,
        skillEnabled: normalizedEntry.skillEnabled ?? undefined,
    };
}
function toItemStackState(entry) {
    return {
        itemId: entry.itemId,
        name: entry.name ?? entry.itemId,
        type: entry.type ?? 'material',
        count: entry.count,
        desc: entry.desc ?? '',
        groundLabel: entry.groundLabel,
        grade: entry.grade,
        level: entry.level,
        equipSlot: entry.equipSlot,
        equipAttrs: entry.equipAttrs ? { ...entry.equipAttrs } : undefined,
        equipStats: entry.equipStats ? { ...entry.equipStats } : undefined,
        equipValueStats: entry.equipValueStats ? { ...entry.equipValueStats } : undefined,
        effects: entry.effects?.map((effect) => ({ ...effect })),
        healAmount: entry.healAmount,
        healPercent: entry.healPercent,
        qiPercent: entry.qiPercent,
        consumeBuffs: entry.consumeBuffs?.map((buff) => ({ ...buff })),
        tags: entry.tags?.slice(),
        mapUnlockId: entry.mapUnlockId,
        tileAuraGainAmount: entry.tileAuraGainAmount,
        allowBatchUse: entry.allowBatchUse,
    };
}
function toGroundPileMap(input) {
    return new Map(input.map((entry) => [entry.sourceId, cloneGroundPile(entry)]));
}
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
function parseCoordKey(key) {
    const [x, y] = key.split(',');
    return [Number(x), Number(y)];
}
function cloneRenderEntity(source) {
    return {
        ...source,
        npcQuestMarker: source.npcQuestMarker ? { ...source.npcQuestMarker } : undefined,
    };
}
function cloneMinimapMarker(source) {
    return {
        id: source.id,
        kind: source.kind,
        x: source.x,
        y: source.y,
        label: source.label,
        detail: source.detail,
    };
}
function cloneTile(source) {
    return {
        ...source,
        hiddenEntrance: source.hiddenEntrance ? { ...source.hiddenEntrance } : undefined,
    };
}
function cloneGroundPile(source) {
    return {
        sourceId: source.sourceId,
        x: source.x,
        y: source.y,
        items: source.items.map((entry) => ({ ...entry })),
    };
}
function cloneThreatArrows(source) {
    return source.map(([ownerId, targetId]) => [ownerId, targetId]);
}
function cloneCombatEffect(source) {
    return { ...source };
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
function cloneSyncedItem(source) {
    return {
        ...source,
        equipAttrs: source.equipAttrs ? { ...source.equipAttrs } : undefined,
        equipStats: source.equipStats ? { ...source.equipStats } : undefined,
        equipValueStats: source.equipValueStats ? { ...source.equipValueStats } : undefined,
        effects: source.effects?.map((entry) => ({ ...entry })),
        consumeBuffs: source.consumeBuffs?.map((entry) => ({ ...entry })),
        tags: source.tags?.slice(),
    };
}
function cloneEquipmentSlot(source) {
    return {
        slot: source.slot,
        item: source.item ? cloneSyncedItem(source.item) : null,
    };
}
function cloneTechniqueEntry(source) {
    return {
        techId: source.techId,
        level: source.level,
        exp: source.exp,
        expToNext: source.expToNext,
        realmLv: source.realmLv,
        realm: source.realm,
        name: null,
        grade: source.grade ?? undefined,
        category: source.category ?? undefined,
        skills: source.skills?.map((entry) => cloneTechniqueSkill(entry)) ?? source.skills ?? undefined,
        layers: source.layers?.map((entry) => ({
            level: entry.level,
            expToNext: entry.expToNext,
            attrs: entry.attrs ? { ...entry.attrs } : undefined,
        })) ?? source.layers ?? undefined,
        attrCurves: source.attrCurves ? { ...source.attrCurves } : source.attrCurves ?? undefined,
    };
}
function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
function buildAttrBonuses(player) {
    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques.techniques) {
        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([toTechniqueState(technique)]);
        if (!hasNonZeroAttributes(techniqueAttrs)) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    for (const entry of player.equipment.slots) {
        const item = entry.item;
        if (!item?.equipAttrs || !hasNonZeroAttributes(item.equipAttrs)) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
        });
    }
    for (const buff of player.buffs.buffs) {
        if (!buff.attrs || !hasNonZeroAttributes(buff.attrs)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
        });
    }
    for (const bonus of player.runtimeBonuses ?? []) {
        if (!bonus?.attrs || !hasNonZeroAttributes(bonus.attrs) || isDerivedRuntimeBonusSource(bonus.source)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
        });
    }
    return bonuses;
}
function isDerivedRuntimeBonusSource(source) {
    if (typeof source !== 'string' || source.length === 0) {
        return true;
    }
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
function hasNonZeroAttributes(attrs) {
    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
function clonePartialAttributes(attrs) {
    const result = {};
    for (const key of shared_1.ATTR_KEYS) {
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
function cloneActionEntry(source) {
    return { ...source };
}
function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection?.map((entry) => ({ ...entry })),
    };
}
function cloneQuestState(source) {
    return {
        ...source,
        rewardItemIds: source.rewardItemIds.slice(),
        rewards: source.rewards.map((entry) => ({ ...entry })),
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
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (leftEntry.itemId !== rightEntry.itemId || leftEntry.count !== rightEntry.count) {
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
function clonePathTuples(source) {
    return source.map(([x, y]) => [x, y]);
}
function isSamePathTuples(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (leftEntry[0] !== rightEntry[0] || leftEntry[1] !== rightEntry[1]) {
            return false;
        }
    }
    return true;
}
function diffThreatArrows(previous, current, forceFull) {
    if (forceFull || !previous) {
        return {
            full: cloneThreatArrows(current),
            adds: [],
            removes: [],
        };
    }
    const previousKeys = new Set(previous.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));
    const currentKeys = new Set(current.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));
    const adds = current.filter(([ownerId, targetId]) => !previousKeys.has(buildThreatArrowKey(ownerId, targetId)));
    const removes = previous.filter(([ownerId, targetId]) => !currentKeys.has(buildThreatArrowKey(ownerId, targetId)));
    return {
        full: null,
        adds,
        removes,
    };
}
function buildThreatArrowKey(ownerId, targetId) {
    return `${ownerId}\n${targetId}`;
}
function compareThreatArrows(left, right) {
    if (left[0] !== right[0]) {
        return left[0].localeCompare(right[0], 'zh-Hans-CN');
    }
    return left[1].localeCompare(right[1], 'zh-Hans-CN');
}
function filterLegacyCombatEffects(effects, visibleTiles) {
    if (effects.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => effect.type === 'attack'
        ? visibleTiles.has(buildCoordKey(effect.fromX, effect.fromY)) || visibleTiles.has(buildCoordKey(effect.toX, effect.toY))
        : visibleTiles.has(buildCoordKey(effect.x, effect.y)))
        .map((entry) => cloneCombatEffect(entry));
}
function cloneAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}
function isSameAttributes(left, right) {
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
}
function isSameAttrBonuses(left, right) {
    if (left === right) {
        return true;
    }
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}
function isSameNumericRecord(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left === right;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        const leftValue = left[key];
        const rightValue = right[key];
        if (isPlainObject(leftValue) || isPlainObject(rightValue)) {
            if (!isPlainObject(leftValue) || !isPlainObject(rightValue) || !isSameNumericRecord(leftValue, rightValue)) {
                return false;
            }
            continue;
        }
        if (leftValue !== rightValue) {
            return false;
        }
    }
    return true;
}
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function cloneSpecialStats(source) {
    return {
        foundation: source.foundation,
        combatExp: source.combatExp,
    };
}
function isSameSpecialStats(left, right) {
    return left.foundation === right.foundation
        && left.combatExp === right.combatExp;
}
function isSameBodyTrainingState(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext;
}
function isSameTile(left, right) {
    return left.type === right.type
        && left.walkable === right.walkable
        && left.blocksSight === right.blocksSight
        && left.aura === right.aura
        && left.occupiedBy === right.occupiedBy
        && left.modifiedAt === right.modifiedAt
        && left.hp === right.hp
        && left.maxHp === right.maxHp;
}
function isSameMinimapMarker(left, right) {
    return left.id === right.id
        && left.kind === right.kind
        && left.x === right.x
        && left.y === right.y
        && left.label === right.label
        && left.detail === right.detail;
}
function isSameGroundPile(left, right) {
    if (left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
        return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
        const leftItem = left.items[index];
        const rightItem = right.items[index];
        if (!leftItem || !rightItem) {
            return false;
        }
        if (!isSameGroundItemEntry(leftItem, rightItem)) {
            return false;
        }
    }
    return true;
}
function isSameGroundItemEntry(left, right) {
    return left.itemKey === right.itemKey
        && left.itemId === right.itemId
        && left.name === right.name
        && left.type === right.type
        && left.count === right.count
        && left.grade === right.grade
        && left.groundLabel === right.groundLabel;
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
            const leftItem = leftSource.items[itemIndex];
            const rightItem = rightSource.items[itemIndex];
            if (!leftItem || !rightItem) {
                return false;
            }
            if (leftItem.itemKey !== rightItem.itemKey || !isSameSyncedItem(leftItem.item, rightItem.item)) {
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
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && left.allowBatchUse === right.allowBatchUse;
}
function isSameTechniqueEntry(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.techId === right.techId
        && left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext
        && left.realmLv === right.realmLv
        && left.realm === right.realm
        && left.name === right.name
        && left.grade === right.grade
        && left.category === right.category
        && shallowEqualArray(left.skills, right.skills)
        && shallowEqualArray(left.layers, right.layers)
        && shallowEqualRecord(left.attrCurves, right.attrCurves);
}
function isSameActionEntry(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.cooldownLeft === right.cooldownLeft
        && left.range === right.range
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && left.autoBattleEnabled === right.autoBattleEnabled
        && left.autoBattleOrder === right.autoBattleOrder
        && left.skillEnabled === right.skillEnabled;
}
function isSameNpcQuestMarker(left, right) {
    return left?.line === right?.line && left?.state === right?.state;
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
    const leftRecord = left;
    const rightRecord = right;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!isPlainEqual(leftRecord[key], rightRecord[key])) {
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
function mapLegacyNoticeKind(kind) {
    switch (kind) {
        case 'loot':
            return 'loot';
        case 'combat':
            return 'combat';
        default:
            return 'system';
    }
}
function getSocketProtocol(socket) {
    const protocol = socket?.data?.protocol;
    return protocol === 'next' || protocol === 'legacy' ? protocol : null;
}
function resolveProtocolEmission(socket) {
    const protocol = getSocketProtocol(socket);
    return {
        protocol,
        emitNext: protocol !== 'legacy',
        emitLegacy: protocol !== 'next',
    };
}
//# sourceMappingURL=world-sync.service.js.map
