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

const movement_debug_1 = require("../debug/movement-debug");

const map_template_repository_1 = require("../runtime/map/map-template.repository");

const runtime_map_config_service_1 = require("../runtime/map/runtime-map-config.service");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const player_combat_config_helpers_1 = require("../runtime/player/player-combat-config.helpers");

const world_projector_service_1 = require("./world-projector.service");

const world_sync_quest_loot_service_1 = require("./world-sync-quest-loot.service");

const world_sync_minimap_service_1 = require("./world-sync-minimap.service");

const world_sync_map_snapshot_service_1 = require("./world-sync-map-snapshot.service");

const world_sync_map_static_aux_service_1 = require("./world-sync-map-static-aux.service");

const world_sync_threat_service_1 = require("./world-sync-threat.service");

const world_sync_protocol_service_1 = require("./world-sync-protocol.service");

const world_session_service_1 = require("./world-session.service");
/** 世界同步服务：把 runtime 视图投影成 next 协议增量包并维护同步缓存。 */
let WorldSyncService = class WorldSyncService {
    /** 世界 runtime，用于读取当前玩家视图和上下文动作。 */
    worldRuntimeService;
    /** 玩家 runtime，用于同步玩家对象与任务/背包状态。 */
    playerRuntimeService;
    /** 投影服务，把世界视图转成协议包。 */
    worldProjectorService;
    /** 会话管理入口，用于取在线 socket。 */
    worldSessionService;
    /** 地图模板仓库，用于解析可见区域和地形。 */
    templateRepository;
    /** 地图 runtime 配置。 */
    mapRuntimeConfigService;
    /** quest / loot 冷路径同步服务。 */
    worldSyncQuestLootService;
    /** minimap 冷路径同步服务。 */
    worldSyncMinimapService;
    /** map/static snapshot 构造服务。 */
    worldSyncMapSnapshotService;
    /** map/static aux cache 服务。 */
    worldSyncMapStaticAuxService;
    /** threat 冷路径同步服务。 */
    worldSyncThreatService;
    /** 协议下发辅助服务。 */
    worldSyncProtocolService;
    /** next 侧附加状态缓存。 */
    nextAuxStateByPlayerId = new Map();
    /** 同步日志，用于追踪初始包和增量包下发。 */
    logger = new common_1.Logger(WorldSyncService.name);
    constructor(worldRuntimeService, playerRuntimeService, worldProjectorService, worldSessionService, templateRepository, mapRuntimeConfigService, worldSyncQuestLootService, worldSyncMinimapService, worldSyncMapSnapshotService, worldSyncMapStaticAuxService, worldSyncThreatService, worldSyncProtocolService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldProjectorService = worldProjectorService;
        this.worldSessionService = worldSessionService;
        this.templateRepository = templateRepository;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldSyncQuestLootService = worldSyncQuestLootService;
        this.worldSyncMinimapService = worldSyncMinimapService;
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
        this.worldSyncMapStaticAuxService = worldSyncMapStaticAuxService;
        this.worldSyncThreatService = worldSyncThreatService;
        this.worldSyncProtocolService = worldSyncProtocolService;
    }
    /** 发送玩家的初始同步包。 */
    emitInitialSync(playerId, socketOverride = undefined) {

        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }

        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);

        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);

        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);

        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createInitialEnvelope(binding, view, player), view, player);
        this.logMovementEnvelope(playerId, 'initial', envelope);
        this.emitNextEnvelope(socket, envelope);
        this.emitNextInitialSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
    }
    /** 遍历所有在线玩家并刷新增量同步。 */
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

            const envelope = this.appendNextCombatEffects(this.worldProjectorService.createDeltaEnvelope(view, player), view, player);
            this.logMovementEnvelope(binding.playerId, 'delta', envelope);
            this.emitNextEnvelope(socket, envelope);
            this.emitNextDeltaSync(binding.playerId, socket, view, player);

            this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
            this.emitPendingNotices(binding.playerId, socket);
        }
    }
    /** 统一发送 next 协议封装包。 */
    emitNextEnvelope(socket, envelope) {
        this.worldSyncProtocolService.sendNextEnvelope(socket, envelope);
    }
    /** 组合战斗特效并附加到世界增量上。 */
    appendNextCombatEffects(envelope, view, player) {

        const effects = this.collectNextCombatEffects(view, player);
        if (effects.length === 0) {
            return envelope;
        }

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
    /** 从世界 runtime 收集当前可见范围内的战斗特效。 */
    collectNextCombatEffects(view, player) {

        const template = this.templateRepository.getOrThrow(view.instance.templateId);

        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterCombatEffects(this.worldRuntimeService.getCombatEffects(view.instance.instanceId), visibleTileKeys);
    }
    /** 在调试模式下记录同步包里是否带有位移信号。 */
    logMovementEnvelope(playerId, phase, envelope) {
        if (!(0, movement_debug_1.isServerNextMovementDebugEnabled)()) {
            return;
        }

        const worldSelfPatch = envelope?.worldDelta?.p?.find((patch) => patch?.id === playerId);

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

                    x: typeof worldSelfPatch.x === 'number' ? worldSelfPatch.x : null,

                    y: typeof worldSelfPatch.y === 'number' ? worldSelfPatch.y : null,
                    facing: worldSelfPatch.facing ?? null,
                }
                : null,
            selfDelta: envelope?.selfDelta
                ? {
                    mapId: envelope.selfDelta.mid ?? null,

                    x: typeof envelope.selfDelta.x === 'number' ? envelope.selfDelta.x : null,

                    y: typeof envelope.selfDelta.y === 'number' ? envelope.selfDelta.y : null,
                    facing: envelope.selfDelta.f ?? null,
                }
                : null,
        });
    }
    /** 清理断线玩家的同步缓存。 */
    clearDetachedPlayerCaches(playerId) {
        this.clearPlayerCaches(playerId, true);
    }
    /** 清理已 purge 玩家遗留的同步缓存。 */
    clearPurgedPlayerCaches() {

        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }
    /** 清理单个玩家的同步缓存，并按需脱离 runtime session。 */
    clearPlayerCaches(playerId, detachRuntimeSession) {
        this.worldProjectorService.clear(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.worldSyncQuestLootService.clearPlayerCache(playerId);
        this.worldSyncMapStaticAuxService.clearPlayerCache(playerId);
        this.nextAuxStateByPlayerId.delete(playerId);
    }
    emitLootWindowUpdate(playerId) {
        this.worldSyncQuestLootService.emitLootWindowUpdate(playerId);
    }
    openLootWindow(playerId, x, y) {
        return this.worldSyncQuestLootService.openLootWindow(playerId, x, y);
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

        const bootstrapPayload = this.buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState);
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
        else {
            if (mapStaticPlan.visibleMinimapMarkerAdds.length > 0 || mapStaticPlan.visibleMinimapMarkerRemoves.length > 0 || mapStaticPlan.tilePatches.length > 0) {
                this.worldSyncProtocolService.sendMapStatic(socket, this.buildMapStaticSyncPayload(template, {
                    tilePatches: mapStaticPlan.tilePatches.length > 0 ? mapStaticPlan.tilePatches : undefined,
                    visibleMinimapMarkerAdds: mapStaticPlan.visibleMinimapMarkerAdds.length > 0 ? mapStaticPlan.visibleMinimapMarkerAdds : undefined,
                    visibleMinimapMarkerRemoves: mapStaticPlan.visibleMinimapMarkerRemoves.length > 0 ? mapStaticPlan.visibleMinimapMarkerRemoves : undefined,
                }));
            }
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
    buildBootstrapSyncPayload(view, player, template, visibleTiles, renderEntities, visibleMinimapMarkers, minimapLibrary, timeState) {
        return {
            self: this.buildPlayerSyncState(player, view, minimapLibrary.map((entry) => entry.mapId)),
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
        return {
            realm,
        };
    }
    buildPlayerSyncState(player, view, unlockedMinimapIds) {
        return buildPlayerSyncState(player, view, unlockedMinimapIds);
    }
    getMapTimeConfig(mapId) {
        return this.mapRuntimeConfigService.getMapTimeConfig(mapId);
    }
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
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
    emitPendingNotices(playerId, socket) {

        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        this.worldSyncProtocolService.sendNotices(socket, items);
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
        world_sync_quest_loot_service_1.WorldSyncQuestLootService,
        world_sync_minimap_service_1.WorldSyncMinimapService,
        world_sync_map_snapshot_service_1.WorldSyncMapSnapshotService,
        world_sync_map_static_aux_service_1.WorldSyncMapStaticAuxService,
        world_sync_threat_service_1.WorldSyncThreatService,
        world_sync_protocol_service_1.WorldSyncProtocolService])
], WorldSyncService);
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
function isSameCraftSkill(left, right) {
    return (left?.level ?? null) === (right?.level ?? null)
        && (left?.exp ?? null) === (right?.exp ?? null)
        && (left?.expToNext ?? null) === (right?.expToNext ?? null);
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
        && (0, player_combat_config_helpers_1.isSameAutoUsePillList)(previous.autoUsePills ?? [], player.combat.autoUsePills ?? [])
        && (0, player_combat_config_helpers_1.isSameCombatTargetingRules)(previous.combatTargetingRules ?? null, player.combat.combatTargetingRules ?? null)
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
            autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
            combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
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

    const actions = diffActionEntries(previous.actions, normalizedActions);

    const removeActionIds = diffRemovedIds(previous.actions.map((entry) => entry.id), normalizedActions.map((entry) => entry.id));

    const topLevelChanged = previous.autoBattle !== player.combat.autoBattle
        || !(0, player_combat_config_helpers_1.isSameAutoUsePillList)(previous.autoUsePills ?? [], player.combat.autoUsePills ?? [])
        || !(0, player_combat_config_helpers_1.isSameCombatTargetingRules)(previous.combatTargetingRules ?? null, player.combat.combatTargetingRules ?? null)
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
        autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
        combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
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
        mapUnlockIds: entry.mapUnlockIds?.slice(),
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
function cloneRenderEntity(source) {
    return {
        ...source,
        npcQuestMarker: source.npcQuestMarker ? { ...source.npcQuestMarker } : undefined,
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
function hasNonZeroPartialNumericStats(stats) {
    if (!stats) {
        return false;
    }

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

        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
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
function clonePartialNumericStats(stats) {
    if (!stats) {
        return undefined;
    }

    const clone = {};

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
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
function filterCombatEffects(effects, visibleTiles) {
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
        && shallowEqualArray(left.mapUnlockIds, right.mapUnlockIds)
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
        && (left.skillsEnabled !== false) === (right.skillsEnabled !== false)
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
//# sourceMappingURL=world-sync.service.js.map
