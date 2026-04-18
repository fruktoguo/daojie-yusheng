"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmWorldService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const content_template_repository_1 = require("../../content/content-template.repository");

const map_template_repository_1 = require("../../runtime/map/map-template.repository");

const runtime_map_config_service_1 = require("../../runtime/map/runtime-map-config.service");

const runtime_gm_state_service_1 = require("../../runtime/gm/runtime-gm-state.service");

const player_persistence_service_1 = require("../../persistence/player-persistence.service");

const player_progression_service_1 = require("../../runtime/player/player-progression.service");

const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");

const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");

const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");

const next_gm_constants_1 = require("./next-gm.constants");

const next_managed_account_service_1 = require("./next-managed-account.service");

const next_gm_editor_query_service_1 = require("./next-gm-editor-query.service");

const next_gm_map_query_service_1 = require("./next-gm-map-query.service");

const next_gm_map_runtime_query_service_1 = require("./next-gm-map-runtime-query.service");

const next_gm_suggestion_query_service_1 = require("./next-gm-suggestion-query.service");

let NextGmWorldService = class NextGmWorldService {
    contentTemplateRepository;
    nextManagedAccountService;
    runtimeGmStateService;
    mapTemplateRepository;
    playerPersistenceService;
    playerProgressionService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    runtimeMapConfigService;
    nextGmEditorQueryService;
    nextGmMapQueryService;
    nextGmMapRuntimeQueryService;
    nextGmSuggestionQueryService;
    networkPerfStartedAt = Date.now();
    cpuPerfStartedAt = Date.now();
    pathfindingPerfStartedAt = Date.now();
    worldObserverIds = new Set();
    constructor(contentTemplateRepository, nextManagedAccountService, runtimeGmStateService, mapTemplateRepository, playerPersistenceService, playerProgressionService, playerRuntimeService, suggestionRuntimeService, worldRuntimeService, runtimeMapConfigService, nextGmEditorQueryService, nextGmMapQueryService, nextGmMapRuntimeQueryService, nextGmSuggestionQueryService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.nextManagedAccountService = nextManagedAccountService;
        this.runtimeGmStateService = runtimeGmStateService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerPersistenceService = playerPersistenceService;
        this.playerProgressionService = playerProgressionService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.runtimeMapConfigService = runtimeMapConfigService;
        this.nextGmEditorQueryService = nextGmEditorQueryService;
        this.nextGmMapQueryService = nextGmMapQueryService;
        this.nextGmMapRuntimeQueryService = nextGmMapRuntimeQueryService;
        this.nextGmSuggestionQueryService = nextGmSuggestionQueryService;
    }
    collectManagedPlayerIds(runtimePlayers, persistedEntries) {
        return [
            ...runtimePlayers.map((entry) => entry.playerId),
            ...persistedEntries.map((entry) => entry.playerId),
        ];
    }
    buildManagedPlayers(runtimePlayers, persistedEntries, accountIndex) {

        const players = runtimePlayers
            .map((snapshot) => this.toManagedPlayerSummary(snapshot, accountIndex.get(snapshot.playerId)))
            .sort(compareManagedPlayerSummary);
        const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));
        for (const entry of persistedEntries) {
            if (runtimePlayerIds.has(entry.playerId)) {
                continue;
            }
            players.push(this.toManagedPlayerSummaryFromPersistence(entry.playerId, entry.snapshot, entry.updatedAt, accountIndex.get(entry.playerId)));
        }
        players.sort(compareManagedPlayerSummary);
        return players;
    }
    async getState() {

        const perf = this.buildPerformanceSnapshot();

        const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots();

        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();

        const accountIndex = await this.nextManagedAccountService.getManagedAccountIndex(this.collectManagedPlayerIds(runtimePlayers, persistedEntries));
        const players = this.buildManagedPlayers(runtimePlayers, persistedEntries, accountIndex);
        return {
            players,
            mapIds: this.mapTemplateRepository.listSummaries().map((entry) => entry.id).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
            botCount: players.reduce((count, snapshot) => count + (snapshot.meta.isBot ? 1 : 0), 0),
            perf,
        };
    }
    getEditorCatalog() {
        return this.nextGmEditorQueryService.getEditorCatalog();
    }
    getSuggestions(query) {
        return this.nextGmSuggestionQueryService.getSuggestions(query);
    }
    async completeSuggestion(id) {

        const updated = await this.suggestionRuntimeService.markCompleted(id);
        if (!updated) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    async replySuggestion(id, body) {

        const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
        if (!updated) {
            throw new common_1.BadRequestException('回复失败');
        }
        return { ok: true };
    }
    async removeSuggestion(id) {

        const removed = await this.suggestionRuntimeService.remove(id);
        if (!removed) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    getMaps() {
        return this.nextGmMapQueryService.getMaps();
    }
    getMapRuntime(mapId, x, y, w, h, viewerId) {
        if (typeof viewerId === 'string' && viewerId.trim()) {
            this.worldObserverIds.add(viewerId.trim());
        }
        return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
    }
    updateMapTick(mapId, body) {
        this.mapTemplateRepository.getOrThrow(mapId);
        this.runtimeMapConfigService.updateMapTick(mapId, body);
    }
    updateMapTime(mapId, body) {

        const template = this.mapTemplateRepository.getOrThrow(mapId);
        this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
    }
    reloadTickConfig() {
        this.contentTemplateRepository.loadAll();
        this.mapTemplateRepository.loadAll();

        const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
        this.runtimeMapConfigService.pruneMapConfigs(validMapIds);
        return { ok: true };
    }
    clearWorldObservation(viewerId) {

        const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
        if (!normalized) {
            return;
        }
        this.worldObserverIds.delete(normalized);
    }
    resetNetworkPerf() {
        this.networkPerfStartedAt = Date.now();
    }
    resetCpuPerf() {
        this.cpuPerfStartedAt = Date.now();
    }
    resetPathfindingPerf() {
        this.pathfindingPerfStartedAt = Date.now();
    }
    buildPerformanceSnapshot() {

        const perf = this.runtimeGmStateService.buildPerformanceSnapshot();

        const now = Date.now();

        const sharedGmStatePerf = this.runtimeGmStateService.buildSharedGmStatePerf();
        return {
            ...perf,
            cpu: {
                ...perf.cpu,
                profileStartedAt: this.cpuPerfStartedAt,
                profileElapsedSec: roundMetric(Math.max(0, (now - this.cpuPerfStartedAt) / 1000)),
            },
            pathfinding: {
                ...perf.pathfinding,
                ...sharedGmStatePerf,
                statsStartedAt: this.pathfindingPerfStartedAt,
                statsElapsedSec: roundMetric(Math.max(0, (now - this.pathfindingPerfStartedAt) / 1000)),
            },
            networkStatsStartedAt: this.networkPerfStartedAt,
            networkStatsElapsedSec: roundMetric(Math.max(0, (now - this.networkPerfStartedAt) / 1000)),
        };
    }
    toManagedPlayerSummary(snapshot, account = null) {

        const player = this.toLegacyPlayerState(snapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,

            autoBattleStationary: player.autoBattleStationary === true,

            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,

                isBot: player.isBot === true,

                online: player.online === true,

                inWorld: player.inWorld !== false,
                dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
            },
        };
    }
    toManagedPlayerSummaryFromPersistence(playerId, snapshot, updatedAt, account = null) {

        const player = this.toLegacyPlayerStateFromPersistence(playerId, snapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,

            autoBattleStationary: player.autoBattleStationary === true,

            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,

                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : undefined,
                dirtyFlags: [],
            },
        };
    }
    toLegacyPlayerState(snapshot) {
        return {
            id: snapshot.playerId,
            name: snapshot.name,
            displayName: snapshot.displayName,
            isBot: (0, next_gm_constants_1.isNextGmBotPlayerId)(snapshot.playerId),

            online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,

            inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,

            senseQiActive: snapshot.combat.senseQiActive === true,

            autoRetaliate: snapshot.combat.autoRetaliate !== false,

            autoBattleStationary: snapshot.combat.autoBattleStationary === true,

            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,

            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,

            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,

            cultivationActive: snapshot.combat.cultivationActive === true,
            realmLv: snapshot.realm?.realmLv ?? 1,
            realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',

            realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
            realmReview: snapshot.realm?.review,

            breakthroughReady: snapshot.realm?.breakthroughReady === true,
            heavenGate: snapshot.heavenGate,
            spiritualRoots: snapshot.spiritualRoots,
            boneAgeBaseYears: snapshot.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.lifeElapsedTicks,
            lifespanYears: snapshot.lifespanYears,
            mapId: snapshot.templateId,
            x: snapshot.x,
            y: snapshot.y,
            facing: snapshot.facing,
            viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
            hp: snapshot.hp,
            maxHp: snapshot.maxHp,
            qi: snapshot.qi,

            dead: snapshot.hp <= 0,
            foundation: snapshot.foundation,
            combatExp: snapshot.combatExp,
            baseAttrs: { ...snapshot.attrs.baseAttrs },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            finalAttrs: { ...snapshot.attrs.finalAttrs },
            numericStats: { ...snapshot.attrs.numericStats },
            ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: snapshot.inventory.items.map((entry) => ({ ...entry })),
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
            actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
            quests: snapshot.quests.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            })),

            autoBattle: snapshot.combat.autoBattle === true,
            autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,

            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm: snapshot.realm ? {
                ...snapshot.realm,
                heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
                breakthrough: snapshot.realm.breakthrough ? {
                    ...snapshot.realm.breakthrough,
                    requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                        ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                        : [],
                } : snapshot.realm.breakthrough,
            } : undefined,
        };
    }
    toLegacyPlayerStateFromPersistence(playerId, snapshot) {

        const realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.progression?.realm?.realmLv ?? 1, snapshot.progression?.realm?.progress ?? 0);
        return {
            id: playerId,
            name: playerId,
            displayName: playerId,
            mapId: snapshot.placement.templateId,
            x: snapshot.placement.x,
            y: snapshot.placement.y,
            facing: snapshot.placement.facing,
            viewRange: shared_1.VIEW_RADIUS,
            hp: snapshot.vitals.hp,
            maxHp: snapshot.vitals.maxHp,
            qi: snapshot.vitals.qi,

            dead: snapshot.vitals.hp <= 0,

            autoBattle: snapshot.combat.autoBattle === true,

            autoRetaliate: snapshot.combat.autoRetaliate !== false,

            autoBattleStationary: snapshot.combat.autoBattleStationary === true,

            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,

            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,

            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,

            senseQiActive: snapshot.combat.senseQiActive === true,
            realmLv: realm.realmLv,
            realmName: realm.displayName,
            realmStage: realm.stage,
            realmReview: realm.review,
            breakthroughReady: realm.breakthroughReady,
            heavenGate: snapshot.progression.heavenGate ?? null,
            spiritualRoots: snapshot.progression.spiritualRoots ?? null,
            boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
            lifespanYears: snapshot.progression.lifespanYears,
            foundation: snapshot.progression.foundation,
            combatExp: snapshot.progression.combatExp,
            baseAttrs: { ...shared_1.DEFAULT_BASE_ATTRS },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: Array.isArray(snapshot.techniques.techniques) ? snapshot.techniques.techniques.map((entry) => ({ ...entry })) : [],
            actions: [],
            quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
            autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills) ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })) : [],
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,

            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm,
        };
    }
    resolveMapName(mapId) {
        try {
            return this.mapTemplateRepository.getOrThrow(mapId).name;
        }
        catch {
            return mapId;
        }
    }
};
exports.NextGmWorldService = NextGmWorldService;
exports.NextGmWorldService = NextGmWorldService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        next_managed_account_service_1.NextManagedAccountService,
        runtime_gm_state_service_1.RuntimeGmStateService,
        map_template_repository_1.MapTemplateRepository,
        player_persistence_service_1.PlayerPersistenceService,
        player_progression_service_1.PlayerProgressionService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        runtime_map_config_service_1.RuntimeMapConfigService,
        next_gm_editor_query_service_1.NextGmEditorQueryService,
        next_gm_map_query_service_1.NextGmMapQueryService,
        next_gm_map_runtime_query_service_1.NextGmMapRuntimeQueryService,
        next_gm_suggestion_query_service_1.NextGmSuggestionQueryService])
], NextGmWorldService);
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function compareManagedPlayerSummary(left, right) {
    if (left.meta.isBot !== right.meta.isBot) {
        return left.meta.isBot ? 1 : -1;
    }
    if (left.meta.online !== right.meta.online) {
        return left.meta.online ? -1 : 1;
    }
    if (left.mapName !== right.mapName) {
        return left.mapName.localeCompare(right.mapName, 'zh-Hans-CN');
    }
    return left.roleName.localeCompare(right.roleName, 'zh-Hans-CN');
}
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
function toLegacyEquipmentSlots(slots) {

    const bySlot = new Map(slots.map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));
    return {
        weapon: bySlot.get('weapon') ?? null,
        head: bySlot.get('head') ?? null,
        body: bySlot.get('body') ?? null,
        legs: bySlot.get('legs') ?? null,
        accessory: bySlot.get('accessory') ?? null,
    };
}
function cloneTemporaryBuff(entry) {
    return {
        ...entry,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        stats: entry.stats ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
    };
}
function cloneRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
    };
}
