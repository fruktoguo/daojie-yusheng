"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** movement_debug_1：定义该变量以承载业务值。 */
const movement_debug_1 = require("../debug/movement-debug");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../runtime/map/map-template.repository");
/** runtime_map_config_service_1：定义该变量以承载业务值。 */
const runtime_map_config_service_1 = require("../runtime/map/runtime-map-config.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** world_projector_service_1：定义该变量以承载业务值。 */
const world_projector_service_1 = require("./world-projector.service");
/** world_sync_protocol_service_1：定义该变量以承载业务值。 */
const world_sync_protocol_service_1 = require("./world-sync-protocol.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("./world-session.service");
/** WorldSyncService：定义该变量以承载业务值。 */
let WorldSyncService = class WorldSyncService {
    worldRuntimeService;
    playerRuntimeService;
    worldProjectorService;
    worldSessionService;
    templateRepository;
    mapRuntimeConfigService;
    worldSyncProtocolService;
    lastQuestRevisionByPlayerId = new Map();
    lootWindowByPlayerId = new Map();
    nextAuxStateByPlayerId = new Map();
    logger = new common_1.Logger(WorldSyncService.name);
/** 构造函数：执行实例初始化流程。 */
    constructor(worldRuntimeService, playerRuntimeService, worldProjectorService, worldSessionService, templateRepository, mapRuntimeConfigService, worldSyncProtocolService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldProjectorService = worldProjectorService;
        this.worldSessionService = worldSessionService;
        this.templateRepository = templateRepository;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldSyncProtocolService = worldSyncProtocolService;
    }
/** emitInitialSync：执行对应的业务逻辑。 */
    emitInitialSync(playerId, socketOverride = undefined) {
/** binding：定义该变量以承载业务值。 */
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }
/** socket：定义该变量以承载业务值。 */
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
/** view：定义该变量以承载业务值。 */
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
/** player：定义该变量以承载业务值。 */
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
/** envelope：定义该变量以承载业务值。 */
        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createInitialEnvelope(binding, view, player), view, player);
        this.logMovementEnvelope(playerId, 'initial', envelope);
        this.emitNextEnvelope(socket, envelope);
        this.emitNextInitialSync(binding.playerId, socket, view, player);
        this.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
    }
/** flushConnectedPlayers：执行对应的业务逻辑。 */
    flushConnectedPlayers() {
        this.clearPurgedPlayerCaches();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            const view = this.worldRuntimeService.getPlayerView(binding.playerId);
            if (!socket || !view) {
                continue;
            }
            this.worldRuntimeService.refreshPlayerContextActions(binding.playerId, view);
/** player：定义该变量以承载业务值。 */
            const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
/** envelope：定义该变量以承载业务值。 */
            const envelope = this.appendNextCombatEffects(this.worldProjectorService.createDeltaEnvelope(view, player), view, player);
            this.logMovementEnvelope(binding.playerId, 'delta', envelope);
            this.emitNextEnvelope(socket, envelope);
            this.emitNextDeltaSync(binding.playerId, socket, view, player);
/** lastQuestRevision：定义该变量以承载业务值。 */
            const lastQuestRevision = this.lastQuestRevisionByPlayerId.get(binding.playerId) ?? 0;
            if (lastQuestRevision !== player.quests.revision) {
                this.emitQuestSync(socket, binding.playerId, player.quests.revision);
            }
            this.emitPendingNotices(binding.playerId, socket);
        }
    }
/** emitNextEnvelope：执行对应的业务逻辑。 */
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
/** appendNextCombatEffects：执行对应的业务逻辑。 */
    appendNextCombatEffects(envelope, view, player) {
/** effects：定义该变量以承载业务值。 */
        const effects = this.collectNextCombatEffects(view, player);
        if (effects.length === 0) {
            return envelope;
        }
/** nextEnvelope：定义该变量以承载业务值。 */
        const nextEnvelope = envelope ?? {};
        nextEnvelope.worldDelta = {
            t: view.tick,
            wr: view.worldRevision,
            sr: view.selfRevision,
            ...(nextEnvelope.worldDelta ?? {}),
            fx: effects.map((entry) => cloneCombatEffect(entry)),
        };
        return nextEnvelope;
    }
/** collectNextCombatEffects：执行对应的业务逻辑。 */
    collectNextCombatEffects(view, player) {
/** template：定义该变量以承载业务值。 */
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
/** visibleTileKeys：定义该变量以承载业务值。 */
        const visibleTileKeys = this.buildVisibleTileKeySet(view, player, template);
        return filterLegacyCombatEffects(this.worldRuntimeService.getLegacyCombatEffects(view.instance.instanceId), visibleTileKeys);
    }
/** logMovementEnvelope：执行对应的业务逻辑。 */
    logMovementEnvelope(playerId, phase, envelope) {
        if (!(0, movement_debug_1.isServerNextMovementDebugEnabled)()) {
            return;
        }
/** worldSelfPatch：定义该变量以承载业务值。 */
        const worldSelfPatch = envelope?.worldDelta?.p?.find((patch) => patch?.id === playerId);
/** hasMovementSignal：定义该变量以承载业务值。 */
        const hasMovementSignal = Boolean(envelope?.mapEnter
            || envelope?.initSession
            || envelope?.selfDelta?.mid
            || typeof envelope?.selfDelta?.x === 'number'
            || typeof envelope?.selfDelta?.y === 'number'
            || envelope?.selfDelta?.f !== undefined
            || (worldSelfPatch && (typeof worldSelfPatch.x === 'number'
                || typeof worldSelfPatch.y === 'number'
                || worldSelfPatch.facing !== undefined)));
        if (!hasMovementSignal) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, `sync.${phase}`, {
            playerId,
            initSession: envelope?.initSession
                ? { sessionId: envelope.initSession.sid ?? null }
                : null,
            mapEnter: envelope?.mapEnter
                ? {
                    mapId: envelope.mapEnter.mid ?? null,
                    x: envelope.mapEnter.x ?? null,
                    y: envelope.mapEnter.y ?? null,
                }
                : null,
            worldSelfPatch: worldSelfPatch
                ? {
/** x：定义该变量以承载业务值。 */
                    x: typeof worldSelfPatch.x === 'number' ? worldSelfPatch.x : null,
/** y：定义该变量以承载业务值。 */
                    y: typeof worldSelfPatch.y === 'number' ? worldSelfPatch.y : null,
                    facing: worldSelfPatch.facing ?? null,
                }
                : null,
            selfDelta: envelope?.selfDelta
                ? {
                    mapId: envelope.selfDelta.mid ?? null,
/** x：定义该变量以承载业务值。 */
                    x: typeof envelope.selfDelta.x === 'number' ? envelope.selfDelta.x : null,
/** y：定义该变量以承载业务值。 */
                    y: typeof envelope.selfDelta.y === 'number' ? envelope.selfDelta.y : null,
                    facing: envelope.selfDelta.f ?? null,
                }
                : null,
        });
    }
/** emitQuestSync：执行对应的业务逻辑。 */
    emitQuestSync(socket, playerId, revision) {
/** payload：定义该变量以承载业务值。 */
        const payload = {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
        this.worldSyncProtocolService.sendQuestSync(socket, payload);
        this.lastQuestRevisionByPlayerId.set(playerId, revision);
    }
/** clearDetachedPlayerCaches：执行对应的业务逻辑。 */
    clearDetachedPlayerCaches(playerId) {
        this.clearPlayerCaches(playerId, true);
    }
/** clearPurgedPlayerCaches：执行对应的业务逻辑。 */
    clearPurgedPlayerCaches() {
/** purgedPlayerIds：定义该变量以承载业务值。 */
        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }
/** clearPlayerCaches：执行对应的业务逻辑。 */
    clearPlayerCaches(playerId, detachRuntimeSession) {
        this.worldProjectorService.clear(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.lastQuestRevisionByPlayerId.delete(playerId);
        this.lootWindowByPlayerId.delete(playerId);
        this.nextAuxStateByPlayerId.delete(playerId);
    }
/** emitLootWindowUpdate：执行对应的业务逻辑。 */
    emitLootWindowUpdate(playerId) {
/** socket：定义该变量以承载业务值。 */
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        if (!socket) {
            return;
        }
/** payload：定义该变量以承载业务值。 */
        const payload = {
            window: this.buildLootWindowSyncState(playerId),
        };
        const { emitNext } = this.worldSyncProtocolService.resolveEmission(socket);
        this.worldSyncProtocolService.sendLootWindow(socket, payload);
        if (emitNext) {
/** nextAux：定义该变量以承载业务值。 */
            const nextAux = this.nextAuxStateByPlayerId.get(playerId);
            if (nextAux) {
                this.nextAuxStateByPlayerId.set(playerId, {
                    ...nextAux,
                    lootWindow: cloneLootWindow(payload.window),
                });
            }
        }
    }
/** openLootWindow：执行对应的业务逻辑。 */
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
/** emitNextInitialSync：执行对应的业务逻辑。 */
    emitNextInitialSync(playerId, socket, view, player) {
/** template：定义该变量以承载业务值。 */
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
/** visibleTiles：定义该变量以承载业务值。 */
        const visibleTiles = this.buildVisibleTilesSnapshot(view, player, template);
/** renderEntities：定义该变量以承载业务值。 */
        const renderEntities = this.buildRenderEntitiesSnapshot(view, player);
/** allMinimapMarkers：定义该变量以承载业务值。 */
        const allMinimapMarkers = this.buildMinimapMarkers(template);
/** visibleMinimapMarkers：定义该变量以承载业务值。 */
        const visibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
/** minimapLibrary：定义该变量以承载业务值。 */
        const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
/** timeState：定义该变量以承载业务值。 */
        const timeState = this.buildGameTimeState(template, view, player);
/** threatArrows：定义该变量以承载业务值。 */
        const threatArrows = this.buildThreatArrows(view);
/** bootstrapPayload：定义该变量以承载业务值。 */
        const bootstrapPayload = this.buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
        socket.emit(shared_1.NEXT_S2C.Bootstrap, bootstrapPayload);
        this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
            mapMeta: bootstrapPayload.mapMeta,
            minimap: bootstrapPayload.minimap,
            tiles: visibleTiles.matrix,
            tilesOriginX: view.self.x - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
            tilesOriginY: view.self.y - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
            visibleMinimapMarkers,
            minimapLibrary,
        }));
        this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player));
/** lootWindow：定义该变量以承载业务值。 */
        const lootWindow = this.buildLootWindowSyncState(playerId);
        this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
        if (threatArrows.length > 0) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, {
                t: view.tick,
                wr: view.worldRevision,
                sr: view.selfRevision,
                threatArrows: cloneThreatArrows(threatArrows),
            });
        }
        this.nextAuxStateByPlayerId.set(playerId, {
            mapId: view.instance.templateId,
            instanceId: view.instance.instanceId,
            realm: cloneRealmState(player.realm),
            threatArrows: cloneThreatArrows(threatArrows),
            visibleTiles: new Map(Array.from(visibleTiles.byKey.entries(), ([key, tile]) => [key, cloneTile(tile)])),
            visibleMinimapMarkers: visibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
            lootWindow: cloneLootWindow(lootWindow),
        });
    }
/** emitNextDeltaSync：执行对应的业务逻辑。 */
    emitNextDeltaSync(playerId, socket, view, player) {
/** previous：定义该变量以承载业务值。 */
        const previous = this.nextAuxStateByPlayerId.get(playerId) ?? null;
        if (!previous) {
            this.emitNextInitialSync(playerId, socket, view, player);
            return;
        }
/** template：定义该变量以承载业务值。 */
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
/** visibleTiles：定义该变量以承载业务值。 */
        const visibleTiles = this.buildVisibleTilesSnapshot(view, player, template);
/** currentVisibleTileKeys：定义该变量以承载业务值。 */
        const currentVisibleTileKeys = this.buildVisibleTileKeySet(view, player, template);
/** allMinimapMarkers：定义该变量以承载业务值。 */
        const allMinimapMarkers = this.buildMinimapMarkers(template);
/** currentVisibleMinimapMarkers：定义该变量以承载业务值。 */
        const currentVisibleMinimapMarkers = this.buildVisibleMinimapMarkers(allMinimapMarkers, currentVisibleTileKeys);
/** currentThreatArrows：定义该变量以承载业务值。 */
        const currentThreatArrows = this.buildThreatArrows(view);
/** mapChanged：定义该变量以承载业务值。 */
        const mapChanged = previous.mapId !== view.instance.templateId
            || previous.instanceId !== view.instance.instanceId;
        if (mapChanged) {
/** minimapLibrary：定义该变量以承载业务值。 */
            const minimapLibrary = this.buildMinimapLibrarySync(player, template.id);
            this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
                mapMeta: this.buildMapMetaSync(template),
                minimap: this.buildMinimapSnapshotSync(template),
                tiles: visibleTiles.matrix,
                tilesOriginX: view.self.x - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
                tilesOriginY: view.self.y - Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
                visibleMinimapMarkers: currentVisibleMinimapMarkers,
                minimapLibrary,
            }));
        }
        else {
/** tilePatches：定义该变量以承载业务值。 */
            const tilePatches = diffVisibleTiles(previous.visibleTiles ?? null, visibleTiles.byKey);
/** markerPatch：定义该变量以承载业务值。 */
            const markerPatch = diffVisibleMinimapMarkers(previous.visibleMinimapMarkers, currentVisibleMinimapMarkers);
            if (markerPatch.adds.length > 0 || markerPatch.removes.length > 0 || tilePatches.length > 0) {
                this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
                    tilePatches: tilePatches.length > 0 ? tilePatches : undefined,
                    visibleMinimapMarkerAdds: markerPatch.adds.length > 0 ? markerPatch.adds : undefined,
                    visibleMinimapMarkerRemoves: markerPatch.removes.length > 0 ? markerPatch.removes : undefined,
                }));
            }
        }
/** currentRealm：定义该变量以承载业务值。 */
        const currentRealm = cloneRealmState(player.realm);
        if (!isSameRealmState(previous.realm, currentRealm)) {
            this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player, currentRealm));
        }
/** lootWindow：定义该变量以承载业务值。 */
        const lootWindow = this.buildLootWindowSyncState(playerId);
        if (!isSameLootWindow(previous.lootWindow ?? null, lootWindow)) {
            this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
        }
/** threatArrowPatch：定义该变量以承载业务值。 */
        const threatArrowPatch = diffThreatArrows(previous.threatArrows ?? null, currentThreatArrows, mapChanged);
        if (threatArrowPatch.full || threatArrowPatch.adds.length > 0 || threatArrowPatch.removes.length > 0) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, {
                t: view.tick,
                wr: view.worldRevision,
                sr: view.selfRevision,
                threatArrows: threatArrowPatch.full ?? undefined,
                threatArrowAdds: threatArrowPatch.full ? undefined : (threatArrowPatch.adds.length > 0 ? threatArrowPatch.adds : undefined),
                threatArrowRemoves: threatArrowPatch.full ? undefined : (threatArrowPatch.removes.length > 0 ? threatArrowPatch.removes : undefined),
            });
        }
        this.nextAuxStateByPlayerId.set(playerId, {
            mapId: view.instance.templateId,
            instanceId: view.instance.instanceId,
            realm: currentRealm,
            threatArrows: cloneThreatArrows(currentThreatArrows),
            visibleTiles: new Map(Array.from(visibleTiles.byKey.entries(), ([key, tile]) => [key, cloneTile(tile)])),
            visibleMinimapMarkers: currentVisibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
            lootWindow: cloneLootWindow(lootWindow),
        });
    }
/** buildBootstrapSyncPayload：执行对应的业务逻辑。 */
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
/** buildMapStaticSyncPayload：执行对应的业务逻辑。 */
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
        return {
            realm,
        };
    }
/** buildPlayerSyncState：执行对应的业务逻辑。 */
    buildPlayerSyncState(player, view, unlockedMinimapIds) {
        return buildPlayerSyncState(player, view, unlockedMinimapIds);
    }
/** buildMapMetaSync：执行对应的业务逻辑。 */
    buildMapMetaSync(template) {
        return buildMapMetaSync(template);
    }
/** buildMinimapSnapshotSync：执行对应的业务逻辑。 */
    buildMinimapSnapshotSync(template) {
        return buildMinimapSnapshotSync(template);
    }
/** buildMinimapMarkers：执行对应的业务逻辑。 */
    buildMinimapMarkers(template) {
        return buildMinimapMarkers(template);
    }
/** buildVisibleMinimapMarkers：执行对应的业务逻辑。 */
    buildVisibleMinimapMarkers(markers, visibleTiles) {
        return buildVisibleMinimapMarkers(markers, visibleTiles);
    }
/** getMapTimeConfig：执行对应的业务逻辑。 */
    getMapTimeConfig(mapId) {
        return this.mapRuntimeConfigService.getMapTimeConfig(mapId);
    }
/** getMapTickSpeed：执行对应的业务逻辑。 */
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
    }
/** buildGameTimeState：执行对应的业务逻辑。 */
    buildGameTimeState(template, view, player) {
        return buildGameTimeState(template, view.tick, Math.max(1, Math.round(player.attrs.numericStats.viewRange)), this.getMapTimeConfig(view.instance.templateId), this.getMapTickSpeed(view.instance.templateId));
    }
/** buildVisibleTilesSnapshot：执行对应的业务逻辑。 */
    buildVisibleTilesSnapshot(view, player, template) {
/** radius：定义该变量以承载业务值。 */
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
/** originX：定义该变量以承载业务值。 */
        const originX = view.self.x - radius;
/** originY：定义该变量以承载业务值。 */
        const originY = view.self.y - radius;
/** visibleTileIndices：定义该变量以承载业务值。 */
        const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
/** matrix：定义该变量以承载业务值。 */
        const matrix = [];
/** byKey：定义该变量以承载业务值。 */
        const byKey = new Map();
        for (let row = 0; row < radius * 2 + 1; row += 1) {
            const y = originY + row;
            const line = [];
            for (let column = 0; column < radius * 2 + 1; column += 1) {
                const x = originX + column;
                const tileIndex = x >= 0 && y >= 0 && x < template.width && y < template.height
                    ? (0, map_template_repository_1.getTileIndex)(x, y, template.width)
                    : -1;
/** tile：定义该变量以承载业务值。 */
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
/** buildRenderEntitiesSnapshot：执行对应的业务逻辑。 */
    buildRenderEntitiesSnapshot(view, player) {
/** entities：定义该变量以承载业务值。 */
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
                monsterScale: getBuffPresentationScale(monster.buffs),
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
/** buildMinimapLibrarySync：执行对应的业务逻辑。 */
    buildMinimapLibrarySync(player, currentMapId) {
/** mapIds：定义该变量以承载业务值。 */
        const mapIds = Array.from(new Set([...player.unlockedMapIds, currentMapId]))
            .filter((entry) => this.templateRepository.has(entry))
            .sort(compareStableStrings);
        return mapIds.map((mapId) => {
/** template：定义该变量以承载业务值。 */
            const template = this.templateRepository.getOrThrow(mapId);
            return {
                mapId,
                mapMeta: this.buildMapMetaSync(template),
                snapshot: buildMinimapSnapshotSync(template),
            };
        });
    }
/** buildTileSyncState：执行对应的业务逻辑。 */
    buildTileSyncState(template, instanceId, x, y) {
        if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
            return null;
        }
/** state：定义该变量以承载业务值。 */
        const state = this.worldRuntimeService.getInstanceTileState(instanceId, x, y);
        if (!state) {
            return null;
        }
/** tileType：定义该变量以承载业务值。 */
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
/** buildAttrUpdate：执行对应的业务逻辑。 */
    buildAttrUpdate(previous, player) {
        return buildAttrUpdate(previous, player);
    }
/** buildInventoryUpdate：执行对应的业务逻辑。 */
    buildInventoryUpdate(previous, player) {
        return buildInventoryUpdate(previous, player);
    }
/** buildEquipmentUpdate：执行对应的业务逻辑。 */
    buildEquipmentUpdate(previous, player) {
        return buildEquipmentUpdate(previous, player);
    }
/** buildTechniqueUpdate：执行对应的业务逻辑。 */
    buildTechniqueUpdate(previous, player) {
        return buildTechniqueUpdate(previous, player);
    }
/** buildActionsUpdate：执行对应的业务逻辑。 */
    buildActionsUpdate(previous, player) {
        return buildActionsUpdate(previous, player);
    }
/** buildVisibleTileKeySet：执行对应的业务逻辑。 */
    buildVisibleTileKeySet(view, player, template) {
/** radius：定义该变量以承载业务值。 */
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
/** originX：定义该变量以承载业务值。 */
        const originX = view.self.x - radius;
/** originY：定义该变量以承载业务值。 */
        const originY = view.self.y - radius;
/** visibleTileIndices：定义该变量以承载业务值。 */
        const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
/** keys：定义该变量以承载业务值。 */
        const keys = new Set();
        for (let row = 0; row < radius * 2 + 1; row += 1) {
            const y = originY + row;
            for (let column = 0; column < radius * 2 + 1; column += 1) {
                const x = originX + column;
                if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
                    continue;
                }
/** tileIndex：定义该变量以承载业务值。 */
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
/** buildThreatArrows：执行对应的业务逻辑。 */
    buildThreatArrows(view) {
/** visiblePlayerIds：定义该变量以承载业务值。 */
        const visiblePlayerIds = new Set([
            view.playerId,
            ...view.visiblePlayers.map((entry) => entry.playerId),
        ]);
/** visibleMonsterIds：定义该变量以承载业务值。 */
        const visibleMonsterIds = new Set(view.localMonsters.map((entry) => entry.runtimeId));
/** visibleEntityIds：定义该变量以承载业务值。 */
        const visibleEntityIds = new Set([...visiblePlayerIds, ...visibleMonsterIds]);
/** arrows：定义该变量以承载业务值。 */
        const arrows = [];
/** seen：定义该变量以承载业务值。 */
        const seen = new Set();
/** pushArrow：定义该变量以承载业务值。 */
        const pushArrow = (ownerId, targetId) => {
            if (!targetId || ownerId === targetId) {
                return;
            }
            if (!visibleEntityIds.has(ownerId) || !visibleEntityIds.has(targetId)) {
                return;
            }
/** key：定义该变量以承载业务值。 */
            const key = `${ownerId}->${targetId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            arrows.push([ownerId, targetId]);
        };
        for (const playerId of visiblePlayerIds) {
            const runtimePlayer = this.playerRuntimeService.getPlayer(playerId);
            const targetRef = runtimePlayer?.combat?.combatTargetId;
            if (typeof targetRef !== 'string' || targetRef.length === 0) {
                continue;
            }
/** targetId：定义该变量以承载业务值。 */
            const targetId = targetRef.startsWith('player:')
                ? targetRef.slice('player:'.length)
                : targetRef.startsWith('tile:') || targetRef.startsWith('container:')
                    ? null
                    : targetRef;
            pushArrow(playerId, targetId);
        }
        for (const monster of view.localMonsters) {
            const runtimeMonster = this.worldRuntimeService.getInstanceMonster(view.instance.instanceId, monster.runtimeId);
            if (!runtimeMonster?.alive || !runtimeMonster.aggroTargetPlayerId) {
                continue;
            }
            pushArrow(monster.runtimeId, runtimeMonster.aggroTargetPlayerId);
        }
        arrows.sort(compareThreatArrows);
        return arrows;
    }
/** emitPendingNotices：执行对应的业务逻辑。 */
    emitPendingNotices(playerId, socket) {
/** items：定义该变量以承载业务值。 */
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        this.worldSyncProtocolService.sendNotices(socket, items);
    }
/** buildLootWindowSyncState：执行对应的业务逻辑。 */
    buildLootWindowSyncState(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            this.lootWindowByPlayerId.delete(playerId);
            return null;
        }
/** target：定义该变量以承载业务值。 */
        const target = this.playerRuntimeService.getLootWindowTarget(playerId) ?? this.lootWindowByPlayerId.get(playerId);
        if (!target) {
            return null;
        }
/** lootWindow：定义该变量以承载业务值。 */
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
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_runtime_service_1.WorldRuntimeService))),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        world_projector_service_1.WorldProjectorService,
        world_session_service_1.WorldSessionService,
        map_template_repository_1.MapTemplateRepository,
        runtime_map_config_service_1.RuntimeMapConfigService,
        world_sync_protocol_service_1.WorldSyncProtocolService])
], WorldSyncService);
/** buildAttrUpdate：执行对应的业务逻辑。 */
function buildAttrUpdate(previous, player) {
/** next：定义该变量以承载业务值。 */
    const next = captureAttrState(player);
    if (!previous) {
        return next;
    }
/** patch：定义该变量以承载业务值。 */
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
    if (!isSameCraftSkill(previous.alchemySkill, next.alchemySkill)) {
        patch.alchemySkill = next.alchemySkill ? { ...next.alchemySkill } : undefined;
    }
    if (!isSameCraftSkill(previous.gatherSkill, next.gatherSkill)) {
        patch.gatherSkill = next.gatherSkill ? { ...next.gatherSkill } : undefined;
    }
    if (!isSameCraftSkill(previous.enhancementSkill, next.enhancementSkill)) {
        patch.enhancementSkill = next.enhancementSkill ? { ...next.enhancementSkill } : undefined;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
/** captureAttrState：执行对应的业务逻辑。 */
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
        alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
        gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
        enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
    };
}
/** isSameCraftSkill：执行对应的业务逻辑。 */
function isSameCraftSkill(left, right) {
    return (left?.level ?? null) === (right?.level ?? null)
        && (left?.exp ?? null) === (right?.exp ?? null)
        && (left?.expToNext ?? null) === (right?.expToNext ?? null);
}
/** buildInventoryUpdate：执行对应的业务逻辑。 */
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
/** slots：定义该变量以承载业务值。 */
    const slots = diffInventorySlots(previous.inventoryItems, player.inventory.items);
/** capacityChanged：定义该变量以承载业务值。 */
    const capacityChanged = previous.inventoryCapacity !== player.inventory.capacity;
/** sizeChanged：定义该变量以承载业务值。 */
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
/** buildEquipmentUpdate：执行对应的业务逻辑。 */
function buildEquipmentUpdate(previous, player) {
    if (previous && previous.equipmentRevision === player.equipment.revision) {
        return null;
    }
/** slots：定义该变量以承载业务值。 */
    const slots = !previous
        ? player.equipment.slots.map((entry) => cloneEquipmentSlot(entry))
        : diffEquipmentSlots(previous.equipmentSlots, player.equipment.slots);
    return slots.length > 0 ? { slots } : null;
}
/** buildTechniqueUpdate：执行对应的业务逻辑。 */
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
/** techniques：定义该变量以承载业务值。 */
    const techniques = diffTechniqueEntries(previous.techniques, player.techniques.techniques);
/** removeTechniqueIds：定义该变量以承载业务值。 */
    const removeTechniqueIds = diffRemovedIds(previous.techniques.map((entry) => entry.techId), player.techniques.techniques.map((entry) => entry.techId));
/** cultivatingChanged：定义该变量以承载业务值。 */
    const cultivatingChanged = previous.cultivatingTechId !== player.techniques.cultivatingTechId;
/** bodyTrainingChanged：定义该变量以承载业务值。 */
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
/** buildActionsUpdate：执行对应的业务逻辑。 */
function buildActionsUpdate(previous, player) {
/** normalizedActions：定义该变量以承载业务值。 */
    const normalizedActions = player.actions.actions.map((entry) => normalizeActionEntry(entry));
    if (previous
        && previous.actionRevision === player.actions.revision
        && previous.autoBattle === player.combat.autoBattle
        && JSON.stringify(previous.autoUsePills ?? []) === JSON.stringify(player.combat.autoUsePills ?? [])
        && JSON.stringify(previous.combatTargetingRules ?? null) === JSON.stringify(player.combat.combatTargetingRules ?? null)
        && previous.autoBattleTargetingMode === player.combat.autoBattleTargetingMode
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
            autoUsePills: player.combat.autoUsePills.map((entry) => ({
                ...entry,
                conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
            })),
            combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
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
/** actions：定义该变量以承载业务值。 */
    const actions = diffActionEntries(previous.actions, normalizedActions);
/** removeActionIds：定义该变量以承载业务值。 */
    const removeActionIds = diffRemovedIds(previous.actions.map((entry) => entry.id), normalizedActions.map((entry) => entry.id));
/** topLevelChanged：定义该变量以承载业务值。 */
    const topLevelChanged = previous.autoBattle !== player.combat.autoBattle
        || JSON.stringify(previous.autoUsePills ?? []) !== JSON.stringify(player.combat.autoUsePills ?? [])
        || JSON.stringify(previous.combatTargetingRules ?? null) !== JSON.stringify(player.combat.combatTargetingRules ?? null)
        || previous.autoBattleTargetingMode !== player.combat.autoBattleTargetingMode
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
        autoUsePills: player.combat.autoUsePills.map((entry) => ({
            ...entry,
            conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
        })),
        combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
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
/** normalizeActionEntry：执行对应的业务逻辑。 */
function normalizeActionEntry(entry) {
/** normalizedId：定义该变量以承载业务值。 */
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
/** buildPlayerSyncState：执行对应的业务逻辑。 */
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
/** dead：定义该变量以承载业务值。 */
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
        alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
        gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
        enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
        enhancementSkillLevel: player.enhancementSkillLevel,
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
        autoUsePills: player.combat.autoUsePills.map((entry) => ({
            ...entry,
            conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
        })),
        combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
        combatTargetId: player.combat.combatTargetId ?? undefined,
        combatTargetLocked: player.combat.combatTargetLocked,
        cultivatingTechId: player.techniques.cultivatingTechId ?? undefined,
        unlockedMinimapIds,
    };
}
/** buildMapMetaSync：执行对应的业务逻辑。 */
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
/** buildMinimapSnapshotSync：执行对应的业务逻辑。 */
function buildMinimapSnapshotSync(template) {
    return {
        width: template.width,
        height: template.height,
        terrainRows: template.terrainRows.slice(),
        markers: buildMinimapMarkers(template),
    };
}
/** buildMinimapMarkers：执行对应的业务逻辑。 */
function buildMinimapMarkers(template) {
/** markers：定义该变量以承载业务值。 */
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
/** label：定义该变量以承载业务值。 */
            label: portal.kind === 'stairs' ? '楼梯' : '传送点',
            detail: portal.targetMapId,
        });
    }
    markers.sort((left, right) => left.y - right.y || left.x - right.x || compareStableStrings(left.id, right.id));
    return markers;
}
/** buildVisibleMinimapMarkers：执行对应的业务逻辑。 */
function buildVisibleMinimapMarkers(markers, visibleTiles) {
    if (markers.length === 0 || visibleTiles.size === 0) {
        return [];
    }
/** visible：定义该变量以承载业务值。 */
    const visible = [];
    for (const marker of markers) {
        if (!visibleTiles.has(buildCoordKey(marker.x, marker.y))) {
            continue;
        }
        visible.push(cloneMinimapMarker(marker));
    }
    return visible;
}
/** diffVisibleMinimapMarkers：执行对应的业务逻辑。 */
function diffVisibleMinimapMarkers(previous, current) {
/** previousById：定义该变量以承载业务值。 */
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
/** currentById：定义该变量以承载业务值。 */
    const currentById = new Map(current.map((entry) => [entry.id, entry]));
/** adds：定义该变量以承载业务值。 */
    const adds = [];
/** removes：定义该变量以承载业务值。 */
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
/** buildGameTimeState：执行对应的业务逻辑。 */
function buildGameTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed = 1) {
/** config：定义该变量以承载业务值。 */
    const config = normalizeMapTimeConfig(overrideConfig ?? template.source.time);
/** localTimeScale：定义该变量以承载业务值。 */
    const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0
        ? config.scale
        : 1;
/** timeScale：定义该变量以承载业务值。 */
    const timeScale = tickSpeed > 0 ? localTimeScale : 0;
/** offsetTicks：定义该变量以承载业务值。 */
    const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks)
        ? Math.round(config.offsetTicks)
        : 0;
/** effectiveTicks：定义该变量以承载业务值。 */
    const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
/** localTicks：定义该变量以承载业务值。 */
    const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % shared_1.GAME_DAY_TICKS + shared_1.GAME_DAY_TICKS) % shared_1.GAME_DAY_TICKS;
/** phase：定义该变量以承载业务值。 */
    const phase = shared_1.GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
        ?? shared_1.GAME_TIME_PHASES[shared_1.GAME_TIME_PHASES.length - 1];
/** baseLight：定义该变量以承载业务值。 */
    const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base)
        ? config.light.base
        : 0;
/** timeInfluence：定义该变量以承载业务值。 */
    const timeInfluence = typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence)
        ? config.light.timeInfluence
        : 100;
/** lightPercent：定义该变量以承载业务值。 */
    const lightPercent = Math.max(0, Math.min(100, Math.round(baseLight + phase.skyLightPercent * (timeInfluence / 100))));
/** darknessStacks：定义该变量以承载业务值。 */
    const darknessStacks = resolveDarknessStacks(lightPercent);
/** visionMultiplier：定义该变量以承载业务值。 */
    const visionMultiplier = shared_1.DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
/** palette：定义该变量以承载业务值。 */
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
/** normalizeMapTimeConfig：执行对应的业务逻辑。 */
function normalizeMapTimeConfig(input) {
/** candidate：定义该变量以承载业务值。 */
    const candidate = (input ?? {});
    return {
        offsetTicks: candidate.offsetTicks,
        scale: candidate.scale,
        light: candidate.light,
        palette: candidate.palette,
    };
}
/** resolveDarknessStacks：执行对应的业务逻辑。 */
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
/** cloneGameTimeState：执行对应的业务逻辑。 */
function cloneGameTimeState(source) {
    return { ...source };
}
/** isSameGameTimeState：执行对应的业务逻辑。 */
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
/** getBuffPresentationScale：执行对应的业务逻辑。 */
function getBuffPresentationScale(buffs) {
/** scale：定义该变量以承载业务值。 */
    let scale = 1;
    for (const buff of buffs ?? []) {
        if ((buff?.remainingTicks ?? 0) <= 0 || (buff?.stacks ?? 0) <= 0) {
            continue;
        }
        if (Number.isFinite(buff.presentationScale) && Number(buff.presentationScale) > scale) {
            scale = Number(buff.presentationScale);
        }
    }
    return scale;
}
/** buildPlayerRenderEntity：执行对应的业务逻辑。 */
function buildPlayerRenderEntity(player, color) {
    return {
        id: player.playerId,
        x: player.x,
        y: player.y,
        char: (player.displayName.trim()[0] ?? player.name.trim()[0] ?? player.playerId.trim()[0] ?? '@'),
        color,
        name: player.name,
        kind: 'player',
        monsterScale: getBuffPresentationScale(player.buffs?.buffs),
        hp: player.hp,
        maxHp: player.maxHp,
    };
}
/** diffRenderEntities：执行对应的业务逻辑。 */
function diffRenderEntities(previous, current, fullSync) {
/** players：定义该变量以承载业务值。 */
    const players = [];
/** entities：定义该变量以承载业务值。 */
    const entities = [];
/** removed：定义该变量以承载业务值。 */
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
/** buildRenderEntityPatch：执行对应的业务逻辑。 */
function buildRenderEntityPatch(previous, current) {
    if (!previous) {
        return toTickRenderEntity(current);
    }
/** patch：定义该变量以承载业务值。 */
        const patch = {
            id: current.id,
            x: current.x,
            y: current.y,
        };
/** changed：定义该变量以承载业务值。 */
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
    if (previous.monsterScale !== current.monsterScale) {
        patch.monsterScale = current.monsterScale ?? null;
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
/** toTickRenderEntity：执行对应的业务逻辑。 */
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
        monsterScale: source.monsterScale ?? null,
        hp: source.hp ?? null,
        maxHp: source.maxHp ?? null,
        npcQuestMarker: source.npcQuestMarker ?? null,
    };
}
/** diffVisibleTiles：执行对应的业务逻辑。 */
function diffVisibleTiles(previous, current) {
/** patches：定义该变量以承载业务值。 */
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
/** diffGroundPiles：执行对应的业务逻辑。 */
function diffGroundPiles(previous, current, fullSync) {
/** patches：定义该变量以承载业务值。 */
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
/** diffInventorySlots：执行对应的业务逻辑。 */
function diffInventorySlots(previous, current) {
/** patch：定义该变量以承载业务值。 */
    const patch = [];
/** maxLength：定义该变量以承载业务值。 */
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
/** diffEquipmentSlots：执行对应的业务逻辑。 */
function diffEquipmentSlots(previous, current) {
/** previousBySlot：定义该变量以承载业务值。 */
    const previousBySlot = new Map(previous.map((entry) => [entry.slot, entry]));
/** patch：定义该变量以承载业务值。 */
    const patch = [];
    for (const entry of current) {
        const prev = previousBySlot.get(entry.slot) ?? null;
        if (!prev || !isSameSyncedItem(prev.item ?? null, entry.item ?? null)) {
            patch.push(cloneEquipmentSlot(entry));
        }
    }
    return patch;
}
/** diffTechniqueEntries：执行对应的业务逻辑。 */
function diffTechniqueEntries(previous, current) {
/** previousById：定义该变量以承载业务值。 */
    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
/** patch：定义该变量以承载业务值。 */
    const patch = [];
    for (const entry of current) {
        const prev = previousById.get(entry.techId) ?? null;
        if (!isSameTechniqueEntry(prev, entry)) {
            patch.push(cloneTechniqueEntry(entry));
        }
    }
    return patch;
}
/** diffActionEntries：执行对应的业务逻辑。 */
function diffActionEntries(previous, current) {
/** previousById：定义该变量以承载业务值。 */
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
/** patch：定义该变量以承载业务值。 */
    const patch = [];
    for (const entry of current) {
        const prev = previousById.get(entry.id) ?? null;
        if (!isSameActionEntry(prev, entry)) {
            patch.push(cloneActionEntry(entry));
        }
    }
    return patch;
}
/** diffRemovedIds：执行对应的业务逻辑。 */
function diffRemovedIds(previous, current) {
/** currentSet：定义该变量以承载业务值。 */
    const currentSet = new Set(current);
    return previous.filter((entry) => !currentSet.has(entry));
}
/** buildEquipmentRecord：执行对应的业务逻辑。 */
function buildEquipmentRecord(entries) {
/** record：定义该变量以承载业务值。 */
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
/** toTechniqueState：执行对应的业务逻辑。 */
function toTechniqueState(entry) {
/** skills：定义该变量以承载业务值。 */
    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
/** skillsEnabled：定义该变量以承载业务值。 */
        skillsEnabled: entry.skillsEnabled !== false,
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
/** toActionDefinition：执行对应的业务逻辑。 */
function toActionDefinition(entry) {
/** normalizedEntry：定义该变量以承载业务值。 */
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
/** toItemStackState：执行对应的业务逻辑。 */
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
        mapUnlockIds: entry.mapUnlockIds?.slice(),
        tileAuraGainAmount: entry.tileAuraGainAmount,
        allowBatchUse: entry.allowBatchUse,
    };
}
/** toGroundPileMap：执行对应的业务逻辑。 */
function toGroundPileMap(input) {
    return new Map(input.map((entry) => [entry.sourceId, cloneGroundPile(entry)]));
}
/** buildCoordKey：执行对应的业务逻辑。 */
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/** parseCoordKey：执行对应的业务逻辑。 */
function parseCoordKey(key) {
/** separatorIndex：定义该变量以承载业务值。 */
    const separatorIndex = key.indexOf(',');
    if (separatorIndex < 0) {
        return [0, 0];
    }
    return [
        Number(key.slice(0, separatorIndex)),
        Number(key.slice(separatorIndex + 1)),
    ];
}
/** cloneRenderEntity：执行对应的业务逻辑。 */
function cloneRenderEntity(source) {
    return {
        ...source,
        npcQuestMarker: source.npcQuestMarker ? { ...source.npcQuestMarker } : undefined,
    };
}
/** cloneMinimapMarker：执行对应的业务逻辑。 */
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
/** cloneTile：执行对应的业务逻辑。 */
function cloneTile(source) {
    return {
        ...source,
        hiddenEntrance: source.hiddenEntrance ? { ...source.hiddenEntrance } : undefined,
    };
}
/** cloneGroundPile：执行对应的业务逻辑。 */
function cloneGroundPile(source) {
    return {
        sourceId: source.sourceId,
        x: source.x,
        y: source.y,
        items: source.items.map((entry) => ({ ...entry })),
    };
}
/** cloneThreatArrows：执行对应的业务逻辑。 */
function cloneThreatArrows(source) {
    return source.map(([ownerId, targetId]) => [ownerId, targetId]);
}
/** cloneCombatEffect：执行对应的业务逻辑。 */
function cloneCombatEffect(source) {
    return { ...source };
}
/** cloneLootWindow：执行对应的业务逻辑。 */
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
/** cloneSyncedItem：执行对应的业务逻辑。 */
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
/** cloneEquipmentSlot：执行对应的业务逻辑。 */
function cloneEquipmentSlot(source) {
    return {
        slot: source.slot,
        item: source.item ? cloneSyncedItem(source.item) : null,
    };
}
/** cloneTechniqueEntry：执行对应的业务逻辑。 */
function cloneTechniqueEntry(source) {
    return {
        techId: source.techId,
        level: source.level,
        exp: source.exp,
        expToNext: source.expToNext,
        realmLv: source.realmLv,
        realm: source.realm,
/** skillsEnabled：定义该变量以承载业务值。 */
        skillsEnabled: source.skillsEnabled !== false,
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
/** cloneTechniqueSkill：执行对应的业务逻辑。 */
function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
/** buildAttrBonuses：执行对应的业务逻辑。 */
function buildAttrBonuses(player) {
/** bonuses：定义该变量以承载业务值。 */
    const bonuses = [];
/** realmStage：定义该变量以承载业务值。 */
    const realmStage = player.realm?.stage ?? player.attrs.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** realmConfig：定义该变量以承载业务值。 */
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
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(item.equipStats))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(item.equipStats),
        });
    }
    for (const buff of player.buffs.buffs) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
        });
    }
    for (const bonus of player.runtimeBonuses ?? []) {
        if (!bonus || isDerivedRuntimeBonusSource(bonus.source)) {
            continue;
        }
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !Array.isArray(bonus.qiProjection)
            && !isPlainObject(bonus.meta)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}
/** isDerivedRuntimeBonusSource：执行对应的业务逻辑。 */
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
/** hasNonZeroAttributes：执行对应的业务逻辑。 */
function hasNonZeroAttributes(attrs) {
    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
/** hasNonZeroPartialNumericStats：执行对应的业务逻辑。 */
function hasNonZeroPartialNumericStats(stats) {
    if (!stats) {
        return false;
    }
/** scalarKeys：定义该变量以承载业务值。 */
    const scalarKeys = [
        'maxHp',
        'maxQi',
        'physAtk',
        'spellAtk',
        'physDef',
        'spellDef',
        'hit',
        'dodge',
        'crit',
        'critDamage',
        'breakPower',
        'resolvePower',
        'maxQiOutputPerTick',
        'qiRegenRate',
        'hpRegenRate',
        'cooldownSpeed',
        'auraCostReduce',
        'auraPowerRate',
        'playerExpRate',
        'techniqueExpRate',
        'realmExpPerTick',
        'techniqueExpPerTick',
        'lootRate',
        'rareLootRate',
        'viewRange',
        'moveSpeed',
        'extraAggroRate',
        'extraRange',
        'extraArea',
    ];
    for (const key of scalarKeys) {
        if (Number(stats[key] ?? 0) !== 0) {
            return true;
        }
    }
    return ['elementDamageBonus', 'elementDamageReduce'].some((groupKey) => {
/** group：定义该变量以承载业务值。 */
        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
}
/** clonePartialAttributes：执行对应的业务逻辑。 */
function clonePartialAttributes(attrs) {
/** result：定义该变量以承载业务值。 */
    const result = {};
    for (const key of shared_1.ATTR_KEYS) {
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
/** clonePartialNumericStats：执行对应的业务逻辑。 */
function clonePartialNumericStats(stats) {
    if (!stats) {
        return undefined;
    }
/** clone：定义该变量以承载业务值。 */
    const clone = {};
/** scalarKeys：定义该变量以承载业务值。 */
    const scalarKeys = [
        'maxHp',
        'maxQi',
        'physAtk',
        'spellAtk',
        'physDef',
        'spellDef',
        'hit',
        'dodge',
        'crit',
        'critDamage',
        'breakPower',
        'resolvePower',
        'maxQiOutputPerTick',
        'qiRegenRate',
        'hpRegenRate',
        'cooldownSpeed',
        'auraCostReduce',
        'auraPowerRate',
        'playerExpRate',
        'techniqueExpRate',
        'realmExpPerTick',
        'techniqueExpPerTick',
        'lootRate',
        'rareLootRate',
        'viewRange',
        'moveSpeed',
        'extraAggroRate',
        'extraRange',
        'extraArea',
    ];
    for (const key of scalarKeys) {
        if (stats[key] !== undefined) {
            clone[key] = stats[key];
        }
    }
    if (isPlainObject(stats.elementDamageBonus)) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (isPlainObject(stats.elementDamageReduce)) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/** cloneQiProjectionModifiers：执行对应的业务逻辑。 */
function cloneQiProjectionModifiers(source) {
    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    return source.map((entry) => ({
        ...entry,
        selector: entry.selector
            ? {
                ...entry.selector,
                resourceKeys: entry.selector.resourceKeys ? entry.selector.resourceKeys.slice() : undefined,
                families: entry.selector.families ? entry.selector.families.slice() : undefined,
                forms: entry.selector.forms ? entry.selector.forms.slice() : undefined,
                elements: entry.selector.elements ? entry.selector.elements.slice() : undefined,
            }
            : undefined,
    }));
}
/** cloneActionEntry：执行对应的业务逻辑。 */
function cloneActionEntry(source) {
    return { ...source };
}
/** cloneTemporaryBuff：执行对应的业务逻辑。 */
function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection?.map((entry) => ({ ...entry })),
    };
}
/** cloneQuestState：执行对应的业务逻辑。 */
function cloneQuestState(source) {
    return {
        ...source,
        rewardItemIds: source.rewardItemIds.slice(),
        rewards: source.rewards.map((entry) => ({ ...entry })),
    };
}
/** cloneRealmState：执行对应的业务逻辑。 */
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
/** isSameRealmState：执行对应的业务逻辑。 */
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
/** isSameBreakthroughItemList：执行对应的业务逻辑。 */
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
/** isSameBreakthroughPreview：执行对应的业务逻辑。 */
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
/** isSameHeavenGateState：执行对应的业务逻辑。 */
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
/** isSameHeavenGateRoots：执行对应的业务逻辑。 */
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
/** isSameStringArray：执行对应的业务逻辑。 */
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
/** cloneHeavenGateState：执行对应的业务逻辑。 */
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
/** cloneHeavenGateRoots：执行对应的业务逻辑。 */
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
/** clonePathTuples：执行对应的业务逻辑。 */
function clonePathTuples(source) {
    return source.map(([x, y]) => [x, y]);
}
/** isSamePathTuples：执行对应的业务逻辑。 */
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
/** diffThreatArrows：执行对应的业务逻辑。 */
function diffThreatArrows(previous, current, forceFull) {
    if (forceFull || !previous) {
        return {
            full: cloneThreatArrows(current),
            adds: [],
            removes: [],
        };
    }
/** previousKeys：定义该变量以承载业务值。 */
    const previousKeys = new Set(previous.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));
/** currentKeys：定义该变量以承载业务值。 */
    const currentKeys = new Set(current.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));
/** adds：定义该变量以承载业务值。 */
    const adds = current.filter(([ownerId, targetId]) => !previousKeys.has(buildThreatArrowKey(ownerId, targetId)));
/** removes：定义该变量以承载业务值。 */
    const removes = previous.filter(([ownerId, targetId]) => !currentKeys.has(buildThreatArrowKey(ownerId, targetId)));
    return {
        full: null,
        adds,
        removes,
    };
}
/** buildThreatArrowKey：执行对应的业务逻辑。 */
function buildThreatArrowKey(ownerId, targetId) {
    return `${ownerId}\n${targetId}`;
}
/** compareThreatArrows：执行对应的业务逻辑。 */
function compareThreatArrows(left, right) {
    if (left[0] !== right[0]) {
        return compareStableStrings(left[0], right[0]);
    }
    return compareStableStrings(left[1], right[1]);
}
/** compareStableStrings：执行对应的业务逻辑。 */
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** filterLegacyCombatEffects：执行对应的业务逻辑。 */
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
/** cloneAttributes：执行对应的业务逻辑。 */
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
/** isSameAttributes：执行对应的业务逻辑。 */
function isSameAttributes(left, right) {
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
}
/** isSameAttrBonuses：执行对应的业务逻辑。 */
function isSameAttrBonuses(left, right) {
    if (left === right) {
        return true;
    }
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (!leftEntry || !rightEntry
            || leftEntry.source !== rightEntry.source
            || leftEntry.label !== rightEntry.label
            || !isSameNumericRecord(leftEntry.attrs, rightEntry.attrs)
            || !isSameNumericRecord(leftEntry.stats, rightEntry.stats)
            || !isSameNumericRecord(leftEntry.meta, rightEntry.meta)
            || !isSameNumericRecord(leftEntry.qiProjection, rightEntry.qiProjection)) {
            return false;
        }
    }
    return true;
}
/** isSameNumericRecord：执行对应的业务逻辑。 */
function isSameNumericRecord(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left === right;
    }
/** leftKeys：定义该变量以承载业务值。 */
    const leftKeys = Object.keys(left);
/** rightKeys：定义该变量以承载业务值。 */
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
/** isPlainObject：执行对应的业务逻辑。 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** cloneSpecialStats：执行对应的业务逻辑。 */
function cloneSpecialStats(source) {
    return {
        foundation: source.foundation,
        combatExp: source.combatExp,
    };
}
/** isSameSpecialStats：执行对应的业务逻辑。 */
function isSameSpecialStats(left, right) {
    return left.foundation === right.foundation
        && left.combatExp === right.combatExp;
}
/** isSameBodyTrainingState：执行对应的业务逻辑。 */
function isSameBodyTrainingState(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext;
}
/** isSameTile：执行对应的业务逻辑。 */
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
/** isSameMinimapMarker：执行对应的业务逻辑。 */
function isSameMinimapMarker(left, right) {
    return left.id === right.id
        && left.kind === right.kind
        && left.x === right.x
        && left.y === right.y
        && left.label === right.label
        && left.detail === right.detail;
}
/** isSameGroundPile：执行对应的业务逻辑。 */
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
/** isSameGroundItemEntry：执行对应的业务逻辑。 */
function isSameGroundItemEntry(left, right) {
    return left.itemKey === right.itemKey
        && left.itemId === right.itemId
        && left.name === right.name
        && left.type === right.type
        && left.count === right.count
        && left.grade === right.grade
        && left.groundLabel === right.groundLabel;
}
/** isSameLootWindow：执行对应的业务逻辑。 */
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
/** isSameSyncedItem：执行对应的业务逻辑。 */
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
/** isSameTechniqueEntry：执行对应的业务逻辑。 */
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
        && (left.skillsEnabled !== false) === (right.skillsEnabled !== false)
        && left.name === right.name
        && left.grade === right.grade
        && left.category === right.category
        && shallowEqualArray(left.skills, right.skills)
        && shallowEqualArray(left.layers, right.layers)
        && shallowEqualRecord(left.attrCurves, right.attrCurves);
}
/** isSameActionEntry：执行对应的业务逻辑。 */
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
/** isSameNpcQuestMarker：执行对应的业务逻辑。 */
function isSameNpcQuestMarker(left, right) {
    return left?.line === right?.line && left?.state === right?.state;
}
/** shallowEqualArray：执行对应的业务逻辑。 */
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
/** shallowEqualRecord：执行对应的业务逻辑。 */
function shallowEqualRecord(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
/** leftRecord：定义该变量以承载业务值。 */
    const leftRecord = left;
/** rightRecord：定义该变量以承载业务值。 */
    const rightRecord = right;
/** leftKeys：定义该变量以承载业务值。 */
    const leftKeys = Object.keys(leftRecord);
/** rightKeys：定义该变量以承载业务值。 */
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
/** isPlainEqual：执行对应的业务逻辑。 */
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
//# sourceMappingURL=world-sync.service.js.map
