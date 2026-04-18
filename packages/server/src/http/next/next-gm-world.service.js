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
    networkPerfStartedAt = Date.now();
    cpuPerfStartedAt = Date.now();
    pathfindingPerfStartedAt = Date.now();
    worldObserverIds = new Set();
    constructor(contentTemplateRepository, nextManagedAccountService, runtimeGmStateService, mapTemplateRepository, playerPersistenceService, playerProgressionService, playerRuntimeService, suggestionRuntimeService, worldRuntimeService, runtimeMapConfigService, nextGmEditorQueryService, nextGmMapQueryService) {
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

        const page = Math.max(1, Math.trunc(Number(query?.page) || 1));

        const pageSize = clamp(Math.trunc(Number(query?.pageSize) || 10), 1, 50);

        const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';

        const normalizedKeyword = keyword.toLowerCase();

        const filtered = this.suggestionRuntimeService.getAll().filter((entry) => {
            if (!normalizedKeyword) {
                return true;
            }
            return entry.title.toLowerCase().includes(normalizedKeyword)
                || entry.description.toLowerCase().includes(normalizedKeyword)
                || entry.authorName.toLowerCase().includes(normalizedKeyword)
                || entry.replies.some((reply) => reply.content.toLowerCase().includes(normalizedKeyword));
        });

        const total = filtered.length;

        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        const safePage = clamp(page, 1, totalPages);

        const start = (safePage - 1) * pageSize;

        const items = filtered.slice(start, start + pageSize);
        return {
            items,
            total,
            page: safePage,
            pageSize,
            totalPages,
            keyword,
        };
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

        const template = this.mapTemplateRepository.getOrThrow(mapId);

        const clampedW = Math.min(20, Math.max(1, Math.trunc(Number(w) || 20)));

        const clampedH = Math.min(20, Math.max(1, Math.trunc(Number(h) || 20)));

        const startX = clamp(Math.trunc(Number(x) || 0), 0, Math.max(0, template.width - 1));

        const startY = clamp(Math.trunc(Number(y) || 0), 0, Math.max(0, template.height - 1));

        const endX = Math.min(template.width, startX + clampedW);

        const endY = Math.min(template.height, startY + clampedH);

        const instanceId = `public:${mapId}`;

        const runtimeInstance = this.worldRuntimeService.getInstance(instanceId);

        const internalInstance = this.worldRuntimeService.instances?.get(instanceId) ?? null;
        if (typeof viewerId === 'string' && viewerId.trim()) {
            this.worldObserverIds.add(viewerId.trim());
        }

        const tiles = [];
        for (let row = startY; row < endY; row += 1) {
            const line = [];
            const terrainRow = template.source.tiles[row] ?? '';
            for (let column = startX; column < endX; column += 1) {
                const aura = internalInstance?.getTileAura(column, row) ?? template.baseAuraByTile[(0, map_template_repository_1.getTileIndex)(column, row, template.width)] ?? 0;
                const tile = projectLegacyRuntimeTile({
                    mapChar: terrainRow[column] ?? '#',
                    aura,
                });
                line.push({
                    type: tile.type,
                    walkable: tile.walkable,
                    aura: tile.aura,
                });
            }
            tiles.push(line);
        }

        const entities = [];
        if (runtimeInstance) {
            for (const entry of runtimeInstance.players) {
                if (!isInRect(entry.x, entry.y, startX, startY, endX, endY)) {
                    continue;
                }

                const player = this.playerRuntimeService.getPlayer(entry.playerId);
                entities.push({
                    id: entry.playerId,
                    x: entry.x,
                    y: entry.y,
                    char: player?.displayName?.[0] ?? player?.name?.[0] ?? '人',

                    color: typeof player?.sessionId === 'string' && player.sessionId.length > 0 ? '#4caf50' : '#888',
                    name: player?.name ?? entry.playerId,
                    kind: 'player',
                    hp: player?.hp,
                    maxHp: player?.maxHp,

                    dead: (player?.hp ?? 1) <= 0,

                    online: typeof player?.sessionId === 'string' && player.sessionId.length > 0,

                    autoBattle: player?.combat.autoBattle === true,
                    isBot: (0, next_gm_constants_1.isNextGmBotPlayerId)(entry.playerId),
                });
            }
        }
        if (internalInstance) {
            for (const monster of internalInstance.listMonsters()) {
                if (!isInRect(monster.x, monster.y, startX, startY, endX, endY)) {
                    continue;
                }
                entities.push({
                    id: monster.runtimeId,
                    x: monster.x,
                    y: monster.y,
                    char: monster.char,
                    color: monster.color,
                    name: monster.name,
                    kind: 'monster',
                    hp: monster.hp,
                    maxHp: monster.maxHp,

                    dead: monster.alive !== true,

                    alive: monster.alive === true,
                    targetPlayerId: monster.aggroTargetPlayerId ?? undefined,
                    respawnLeft: monster.respawnLeft,
                });
            }
        }
        for (const npc of template.npcs) {
            if (!isInRect(npc.x, npc.y, startX, startY, endX, endY)) {
                continue;
            }
            entities.push({
                id: npc.id,
                x: npc.x,
                y: npc.y,
                char: npc.char,
                color: npc.color,
                name: npc.name,
                kind: 'npc',
            });
        }
        for (const container of template.containers) {
            if (!isInRect(container.x, container.y, startX, startY, endX, endY)) {
                continue;
            }
            entities.push({
                id: container.id,
                x: container.x,
                y: container.y,
                char: container.char,
                color: container.color,
                name: container.name,
                kind: 'container',
            });
        }

        const tickSpeed = this.getMapTickSpeed(mapId);

        const tickPaused = this.isMapPaused(mapId);
        return {
            mapId,
            mapName: template.name,
            width: template.width,
            height: template.height,
            tiles,
            entities,
            time: buildLegacyTimeState(template, runtimeInstance?.tick ?? this.worldRuntimeService.getRuntimeSummary().tick, shared_1.VIEW_RADIUS, this.getMapTimeConfig(mapId), tickSpeed),
            timeConfig: this.getMapTimeConfig(mapId),
            tickSpeed,
            tickPaused,
        };
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
    getMapTickSpeed(mapId) {
        return this.runtimeMapConfigService.getMapTickSpeed(mapId);
    }
    isMapPaused(mapId) {
        return this.runtimeMapConfigService.isMapPaused(mapId);
    }
    getMapTimeConfig(mapId) {

        const template = this.mapTemplateRepository.getOrThrow(mapId);
        return this.runtimeMapConfigService.getMapTimeConfig(mapId, template.source.time ?? {});
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
        next_gm_map_query_service_1.NextGmMapQueryService])
], NextGmWorldService);
function projectLegacyRuntimeTile(input) {

    const aura = Number.isFinite(input?.aura) ? Math.trunc(input.aura) : 0;

    const projection = {
        aura,
        resources: [buildLegacyAuraResource(aura)],
    };
    if (typeof input?.mapChar === 'string') {

        const tileType = (0, shared_1.getTileTypeFromMapChar)(input.mapChar[0] ?? '#');
        projection.type = tileType;
        projection.walkable = (0, shared_1.isTileTypeWalkable)(tileType);
    }
    return projection;
}
function buildLegacyAuraResource(aura) {
    return {
        key: 'aura',
        label: '灵气',
        value: aura,
        effectiveValue: aura,
        level: (0, shared_1.getAuraLevel)(aura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE),
    };
}
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
function isInRect(x, y, startX, startY, endX, endY) {
    return x >= startX && x < endX && y >= startY && y < endY;
}
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
function buildLegacyTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed) {

    const config = normalizeLegacyMapTimeConfig(overrideConfig ?? template.source.time);

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

    const darknessStacks = resolveLegacyDarknessStacks(lightPercent);

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
function normalizeLegacyMapTimeConfig(input) {

    const candidate = input ?? {};
    return {
        offsetTicks: candidate.offsetTicks,
        scale: candidate.scale,
        light: candidate.light,
        palette: candidate.palette,
    };
}
function resolveLegacyDarknessStacks(lightPercent) {
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
