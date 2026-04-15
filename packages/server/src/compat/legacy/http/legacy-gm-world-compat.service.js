"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGmWorldCompatService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("../../../content/content-template.repository");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../../../runtime/map/map-template.repository");
/** runtime_map_config_service_1：定义该变量以承载业务值。 */
const runtime_map_config_service_1 = require("../../../runtime/map/runtime-map-config.service");
/** runtime_gm_state_service_1：定义该变量以承载业务值。 */
const runtime_gm_state_service_1 = require("../../../runtime/gm/runtime-gm-state.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../../../persistence/player-persistence.service");
/** player_progression_service_1：定义该变量以承载业务值。 */
const player_progression_service_1 = require("../../../runtime/player/player-progression.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../../../runtime/suggestion/suggestion-runtime.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../../../runtime/world/world-runtime.service");
/** legacy_gm_compat_constants_1：定义该变量以承载业务值。 */
const legacy_gm_compat_constants_1 = require("../legacy-gm-compat.constants");
/** legacy_managed_account_service_1：定义该变量以承载业务值。 */
const legacy_managed_account_service_1 = require("./legacy-managed-account.service");
/** LegacyGmWorldCompatService：定义该变量以承载业务值。 */
let LegacyGmWorldCompatService = class LegacyGmWorldCompatService {
    contentTemplateRepository;
    legacyManagedAccountService;
    runtimeGmStateService;
    mapTemplateRepository;
    playerPersistenceService;
    playerProgressionService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    runtimeMapConfigService;
    networkPerfStartedAt = Date.now();
    cpuPerfStartedAt = Date.now();
    pathfindingPerfStartedAt = Date.now();
    worldObserverIds = new Set();
/** 构造函数：执行实例初始化流程。 */
    constructor(contentTemplateRepository, legacyManagedAccountService, runtimeGmStateService, mapTemplateRepository, playerPersistenceService, playerProgressionService, playerRuntimeService, suggestionRuntimeService, worldRuntimeService, runtimeMapConfigService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.legacyManagedAccountService = legacyManagedAccountService;
        this.runtimeGmStateService = runtimeGmStateService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerPersistenceService = playerPersistenceService;
        this.playerProgressionService = playerProgressionService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.runtimeMapConfigService = runtimeMapConfigService;
    }
/** getState：执行对应的业务逻辑。 */
    async getState() {
/** perf：定义该变量以承载业务值。 */
        const perf = this.buildPerformanceSnapshot();
/** runtimePlayers：定义该变量以承载业务值。 */
        const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots();
/** persistedEntries：定义该变量以承载业务值。 */
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
/** accountIndex：定义该变量以承载业务值。 */
        const accountIndex = await this.legacyManagedAccountService.getManagedAccountIndex([
            ...runtimePlayers.map((entry) => entry.playerId),
            ...persistedEntries.map((entry) => entry.playerId),
        ]);
/** players：定义该变量以承载业务值。 */
        const players = runtimePlayers
            .map((snapshot) => this.toManagedPlayerSummary(snapshot, accountIndex.get(snapshot.playerId)))
            .sort(compareManagedPlayerSummary);
/** runtimePlayerIds：定义该变量以承载业务值。 */
        const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));
        for (const entry of persistedEntries) {
            if (runtimePlayerIds.has(entry.playerId)) {
                continue;
            }
            players.push(this.toManagedPlayerSummaryFromPersistence(entry.playerId, entry.snapshot, entry.updatedAt, accountIndex.get(entry.playerId)));
        }
        players.sort(compareManagedPlayerSummary);
        return {
            players,
            mapIds: this.mapTemplateRepository.listSummaries().map((entry) => entry.id).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
            botCount: players.reduce((count, snapshot) => count + (snapshot.meta.isBot ? 1 : 0), 0),
            perf,
        };
    }
/** getEditorCatalog：执行对应的业务逻辑。 */
    getEditorCatalog() {
        return {
            items: this.contentTemplateRepository.listItemTemplates(),
            techniques: this.contentTemplateRepository.listTechniqueTemplates(),
            realmLevels: this.playerProgressionService.listRealmLevels(),
            buffs: this.buildEditorBuffCatalog(),
        };
    }
/** buildEditorBuffCatalog：执行对应的业务逻辑。 */
    buildEditorBuffCatalog() {
/** catalog：定义该变量以承载业务值。 */
        const catalog = new Map();
/** register：定义该变量以承载业务值。 */
        const register = (input) => {
/** buffId：定义该变量以承载业务值。 */
            const buffId = typeof input?.buffId === 'string' ? input.buffId.trim() : '';
            if (!buffId || catalog.has(buffId)) {
                return;
            }
/** name：定义该变量以承载业务值。 */
            const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : buffId;
/** duration：定义该变量以承载业务值。 */
            const duration = Number.isFinite(input?.duration) ? Math.max(1, Math.trunc(Number(input.duration))) : 1;
/** maxStacks：定义该变量以承载业务值。 */
            const maxStacks = Number.isFinite(input?.maxStacks) ? Math.max(1, Math.trunc(Number(input.maxStacks))) : 1;
/** shortMark：定义该变量以承载业务值。 */
            const shortMark = typeof input?.shortMark === 'string' && input.shortMark.trim()
                ? input.shortMark.trim().slice(0, 1)
                : (name[0] ?? buffId[0] ?? '益');
            catalog.set(buffId, {
                buffId,
                name,
/** desc：定义该变量以承载业务值。 */
                desc: typeof input?.desc === 'string' ? input.desc : '',
                shortMark,
/** category：定义该变量以承载业务值。 */
                category: input?.category === 'debuff' ? 'debuff' : 'buff',
/** visibility：定义该变量以承载业务值。 */
                visibility: typeof input?.visibility === 'string' && input.visibility ? input.visibility : 'public',
                remainingTicks: duration,
                duration,
                stacks: 1,
                maxStacks,
/** sourceSkillId：定义该变量以承载业务值。 */
                sourceSkillId: typeof input?.sourceSkillId === 'string' && input.sourceSkillId.trim() ? input.sourceSkillId.trim() : 'gm:editor',
/** sourceSkillName：定义该变量以承载业务值。 */
                sourceSkillName: typeof input?.sourceSkillName === 'string' && input.sourceSkillName.trim() ? input.sourceSkillName.trim() : 'GM 编辑器',
                realmLv: Number.isFinite(input?.realmLv) ? Math.max(1, Math.trunc(Number(input.realmLv))) : 1,
/** color：定义该变量以承载业务值。 */
                color: typeof input?.color === 'string' && input.color.trim() ? input.color.trim() : undefined,
/** attrs：定义该变量以承载业务值。 */
                attrs: input?.attrs && typeof input.attrs === 'object' ? { ...input.attrs } : undefined,
                attrMode: input?.attrMode,
/** stats：定义该变量以承载业务值。 */
                stats: input?.stats && typeof input.stats === 'object' ? { ...input.stats } : undefined,
                statMode: input?.statMode,
                qiProjection: Array.isArray(input?.qiProjection) ? input.qiProjection.map((entry) => ({ ...entry })) : undefined,
            });
        };
        for (const technique of this.contentTemplateRepository.listTechniqueTemplates()) {
            for (const skill of technique.skills ?? []) {
                for (const effect of skill.effects ?? []) {
                    if (effect?.type !== 'buff') {
                        continue;
                    }
                    register({
                        ...effect,
                        sourceSkillId: skill.id,
                        sourceSkillName: skill.name,
                        realmLv: technique.realmLv,
/** category：定义该变量以承载业务值。 */
                        category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
                    });
                }
            }
        }
        for (const item of this.contentTemplateRepository.listItemTemplates()) {
            for (const buff of item.consumeBuffs ?? []) {
                register({
                    ...buff,
                    sourceSkillId: `item:${item.itemId}`,
                    sourceSkillName: item.name,
                    category: buff.category ?? 'buff',
                });
            }
            for (const effect of item.effects ?? []) {
                if (effect?.type !== 'timed_buff' || !effect.buff) {
                    continue;
                }
                register({
                    ...effect.buff,
                    sourceSkillId: `equip:${item.itemId}:${effect.effectId ?? 'effect'}`,
                    sourceSkillName: item.name,
                    category: effect.buff.category ?? 'buff',
                });
            }
        }
        return Array.from(catalog.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
    }
/** getPlayerDetail：执行对应的业务逻辑。 */
    async getPlayerDetail(playerId) {
/** account：定义该变量以承载业务值。 */
        const account = (await this.legacyManagedAccountService.getManagedAccountIndex([playerId])).get(playerId);
/** runtime：定义该变量以承载业务值。 */
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            return {
                player: this.toManagedPlayerRecord(runtime, this.playerRuntimeService.buildPersistenceSnapshot(playerId), account),
            };
        }
/** persisted：定义该变量以承载业务值。 */
        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            return null;
        }
        return {
            player: this.toManagedPlayerRecordFromPersistence(playerId, persisted, account),
        };
    }
/** getSuggestions：执行对应的业务逻辑。 */
    getSuggestions(query) {
/** page：定义该变量以承载业务值。 */
        const page = Math.max(1, Math.trunc(Number(query?.page) || 1));
/** pageSize：定义该变量以承载业务值。 */
        const pageSize = clamp(Math.trunc(Number(query?.pageSize) || 10), 1, 50);
/** keyword：定义该变量以承载业务值。 */
        const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';
/** normalizedKeyword：定义该变量以承载业务值。 */
        const normalizedKeyword = keyword.toLowerCase();
/** filtered：定义该变量以承载业务值。 */
        const filtered = this.suggestionRuntimeService.getAll().filter((entry) => {
            if (!normalizedKeyword) {
                return true;
            }
            return entry.title.toLowerCase().includes(normalizedKeyword)
                || entry.description.toLowerCase().includes(normalizedKeyword)
                || entry.authorName.toLowerCase().includes(normalizedKeyword)
                || entry.replies.some((reply) => reply.content.toLowerCase().includes(normalizedKeyword));
        });
/** total：定义该变量以承载业务值。 */
        const total = filtered.length;
/** totalPages：定义该变量以承载业务值。 */
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
/** safePage：定义该变量以承载业务值。 */
        const safePage = clamp(page, 1, totalPages);
/** start：定义该变量以承载业务值。 */
        const start = (safePage - 1) * pageSize;
/** items：定义该变量以承载业务值。 */
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
/** completeSuggestion：执行对应的业务逻辑。 */
    async completeSuggestion(id) {
/** updated：定义该变量以承载业务值。 */
        const updated = await this.suggestionRuntimeService.markCompleted(id);
        if (!updated) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
/** replySuggestion：执行对应的业务逻辑。 */
    async replySuggestion(id, body) {
/** updated：定义该变量以承载业务值。 */
        const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
        if (!updated) {
            throw new common_1.BadRequestException('回复失败');
        }
        return { ok: true };
    }
/** removeSuggestion：执行对应的业务逻辑。 */
    async removeSuggestion(id) {
/** removed：定义该变量以承载业务值。 */
        const removed = await this.suggestionRuntimeService.remove(id);
        if (!removed) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
/** getMaps：执行对应的业务逻辑。 */
    getMaps() {
        return {
            maps: this.mapTemplateRepository.list().map((template) => ({
                id: template.id,
                name: template.name,
                width: template.width,
                height: template.height,
                description: template.source.description,
                dangerLevel: template.source.dangerLevel,
                recommendedRealm: template.source.recommendedRealm,
                portalCount: template.portals.length,
                npcCount: template.npcs.length,
                monsterSpawnCount: template.source.monsterSpawns?.length ?? 0,
            })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN')),
        };
    }
/** getMapRuntime：执行对应的业务逻辑。 */
    getMapRuntime(mapId, x, y, w, h, viewerId) {
/** template：定义该变量以承载业务值。 */
        const template = this.mapTemplateRepository.getOrThrow(mapId);
/** clampedW：定义该变量以承载业务值。 */
        const clampedW = Math.min(20, Math.max(1, Math.trunc(Number(w) || 20)));
/** clampedH：定义该变量以承载业务值。 */
        const clampedH = Math.min(20, Math.max(1, Math.trunc(Number(h) || 20)));
/** startX：定义该变量以承载业务值。 */
        const startX = clamp(Math.trunc(Number(x) || 0), 0, Math.max(0, template.width - 1));
/** startY：定义该变量以承载业务值。 */
        const startY = clamp(Math.trunc(Number(y) || 0), 0, Math.max(0, template.height - 1));
/** endX：定义该变量以承载业务值。 */
        const endX = Math.min(template.width, startX + clampedW);
/** endY：定义该变量以承载业务值。 */
        const endY = Math.min(template.height, startY + clampedH);
/** instanceId：定义该变量以承载业务值。 */
        const instanceId = `public:${mapId}`;
/** runtimeInstance：定义该变量以承载业务值。 */
        const runtimeInstance = this.worldRuntimeService.getInstance(instanceId);
/** internalInstance：定义该变量以承载业务值。 */
        const internalInstance = this.worldRuntimeService.instances?.get(instanceId) ?? null;
        if (typeof viewerId === 'string' && viewerId.trim()) {
            this.worldObserverIds.add(viewerId.trim());
        }
/** tiles：定义该变量以承载业务值。 */
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
/** entities：定义该变量以承载业务值。 */
        const entities = [];
        if (runtimeInstance) {
            for (const entry of runtimeInstance.players) {
                if (!isInRect(entry.x, entry.y, startX, startY, endX, endY)) {
                    continue;
                }
/** player：定义该变量以承载业务值。 */
                const player = this.playerRuntimeService.getPlayer(entry.playerId);
                entities.push({
                    id: entry.playerId,
                    x: entry.x,
                    y: entry.y,
                    char: player?.displayName?.[0] ?? player?.name?.[0] ?? '人',
/** color：定义该变量以承载业务值。 */
                    color: typeof player?.sessionId === 'string' && player.sessionId.length > 0 ? '#4caf50' : '#888',
                    name: player?.name ?? entry.playerId,
                    kind: 'player',
                    hp: player?.hp,
                    maxHp: player?.maxHp,
/** dead：定义该变量以承载业务值。 */
                    dead: (player?.hp ?? 1) <= 0,
/** online：定义该变量以承载业务值。 */
                    online: typeof player?.sessionId === 'string' && player.sessionId.length > 0,
/** autoBattle：定义该变量以承载业务值。 */
                    autoBattle: player?.combat.autoBattle === true,
                    isBot: (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId),
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
/** dead：定义该变量以承载业务值。 */
                    dead: monster.alive !== true,
/** alive：定义该变量以承载业务值。 */
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
/** tickSpeed：定义该变量以承载业务值。 */
        const tickSpeed = this.getMapTickSpeed(mapId);
/** tickPaused：定义该变量以承载业务值。 */
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
/** updateMapTick：执行对应的业务逻辑。 */
    updateMapTick(mapId, body) {
        this.mapTemplateRepository.getOrThrow(mapId);
        this.runtimeMapConfigService.updateMapTick(mapId, body);
    }
/** updateMapTime：执行对应的业务逻辑。 */
    updateMapTime(mapId, body) {
/** template：定义该变量以承载业务值。 */
        const template = this.mapTemplateRepository.getOrThrow(mapId);
        this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
    }
/** reloadTickConfig：执行对应的业务逻辑。 */
    reloadTickConfig() {
        this.contentTemplateRepository.loadAll();
        this.mapTemplateRepository.loadAll();
/** validMapIds：定义该变量以承载业务值。 */
        const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
        this.runtimeMapConfigService.pruneMapConfigs(validMapIds);
        return { ok: true };
    }
/** clearWorldObservation：执行对应的业务逻辑。 */
    clearWorldObservation(viewerId) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
        if (!normalized) {
            return;
        }
        this.worldObserverIds.delete(normalized);
    }
/** resetNetworkPerf：执行对应的业务逻辑。 */
    resetNetworkPerf() {
        this.networkPerfStartedAt = Date.now();
    }
/** resetCpuPerf：执行对应的业务逻辑。 */
    resetCpuPerf() {
        this.cpuPerfStartedAt = Date.now();
    }
/** resetPathfindingPerf：执行对应的业务逻辑。 */
    resetPathfindingPerf() {
        this.pathfindingPerfStartedAt = Date.now();
    }
/** buildPerformanceSnapshot：执行对应的业务逻辑。 */
    buildPerformanceSnapshot() {
/** perf：定义该变量以承载业务值。 */
        const perf = this.runtimeGmStateService.buildPerformanceSnapshot();
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
/** sharedGmStatePerf：定义该变量以承载业务值。 */
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
/** getMapTickSpeed：执行对应的业务逻辑。 */
    getMapTickSpeed(mapId) {
        return this.runtimeMapConfigService.getMapTickSpeed(mapId);
    }
/** isMapPaused：执行对应的业务逻辑。 */
    isMapPaused(mapId) {
        return this.runtimeMapConfigService.isMapPaused(mapId);
    }
/** getMapTimeConfig：执行对应的业务逻辑。 */
    getMapTimeConfig(mapId) {
/** template：定义该变量以承载业务值。 */
        const template = this.mapTemplateRepository.getOrThrow(mapId);
        return this.runtimeMapConfigService.getMapTimeConfig(mapId, template.source.time ?? {});
    }
/** toManagedPlayerSummary：执行对应的业务逻辑。 */
    toManagedPlayerSummary(snapshot, account = null) {
/** player：定义该变量以承载业务值。 */
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
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: player.autoBattleStationary === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
/** isBot：定义该变量以承载业务值。 */
                isBot: player.isBot === true,
/** online：定义该变量以承载业务值。 */
                online: player.online === true,
/** inWorld：定义该变量以承载业务值。 */
                inWorld: player.inWorld !== false,
                dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
            },
        };
    }
/** toManagedPlayerSummaryFromPersistence：执行对应的业务逻辑。 */
    toManagedPlayerSummaryFromPersistence(playerId, snapshot, updatedAt, account = null) {
/** player：定义该变量以承载业务值。 */
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
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: player.autoBattleStationary === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
/** isBot：定义该变量以承载业务值。 */
                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : undefined,
                dirtyFlags: [],
            },
        };
    }
/** toManagedPlayerRecord：执行对应的业务逻辑。 */
    toManagedPlayerRecord(snapshot, persistedSnapshot, account = null) {
/** summary：定义该变量以承载业务值。 */
        const summary = this.toManagedPlayerSummary(snapshot, account);
        return {
            ...summary,
/** account：定义该变量以承载业务值。 */
            account: buildManagedAccountView(account, summary.meta.online === true),
            snapshot: this.toLegacyPlayerState(snapshot),
            persistedSnapshot: persistedSnapshot ?? null,
        };
    }
/** toManagedPlayerRecordFromPersistence：执行对应的业务逻辑。 */
    toManagedPlayerRecordFromPersistence(playerId, persistedSnapshot, account = null) {
/** player：定义该变量以承载业务值。 */
        const player = this.toLegacyPlayerStateFromPersistence(playerId, persistedSnapshot);
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
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: player.autoBattleStationary === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
/** isBot：定义该变量以承载业务值。 */
                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                dirtyFlags: [],
            },
            account: buildManagedAccountView(account, false),
            snapshot: player,
            persistedSnapshot,
        };
    }
/** toLegacyPlayerState：执行对应的业务逻辑。 */
    toLegacyPlayerState(snapshot) {
        return {
            id: snapshot.playerId,
            name: snapshot.name,
            displayName: snapshot.displayName,
            isBot: (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(snapshot.playerId),
/** online：定义该变量以承载业务值。 */
            online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
/** inWorld：定义该变量以承载业务值。 */
            inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
/** senseQiActive：定义该变量以承载业务值。 */
            senseQiActive: snapshot.combat.senseQiActive === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: snapshot.combat.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: snapshot.combat.autoBattleStationary === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
/** cultivationActive：定义该变量以承载业务值。 */
            cultivationActive: snapshot.combat.cultivationActive === true,
            realmLv: snapshot.realm?.realmLv ?? 1,
            realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
/** realmStage：定义该变量以承载业务值。 */
            realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
            realmReview: snapshot.realm?.review,
/** breakthroughReady：定义该变量以承载业务值。 */
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
/** dead：定义该变量以承载业务值。 */
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
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: snapshot.combat.autoBattle === true,
            autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,
/** combatTargetLocked：定义该变量以承载业务值。 */
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
/** toLegacyPlayerStateFromPersistence：执行对应的业务逻辑。 */
    toLegacyPlayerStateFromPersistence(playerId, snapshot) {
/** realm：定义该变量以承载业务值。 */
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
/** dead：定义该变量以承载业务值。 */
            dead: snapshot.vitals.hp <= 0,
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: snapshot.combat.autoBattle === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: snapshot.combat.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: snapshot.combat.autoBattleStationary === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
/** senseQiActive：定义该变量以承载业务值。 */
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
/** combatTargetLocked：定义该变量以承载业务值。 */
            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm,
        };
    }
/** resolveMapName：执行对应的业务逻辑。 */
    resolveMapName(mapId) {
        try {
            return this.mapTemplateRepository.getOrThrow(mapId).name;
        }
        catch {
            return mapId;
        }
    }
};
exports.LegacyGmWorldCompatService = LegacyGmWorldCompatService;
exports.LegacyGmWorldCompatService = LegacyGmWorldCompatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        legacy_managed_account_service_1.LegacyManagedAccountService,
        runtime_gm_state_service_1.RuntimeGmStateService,
        map_template_repository_1.MapTemplateRepository,
        player_persistence_service_1.PlayerPersistenceService,
        player_progression_service_1.PlayerProgressionService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        runtime_map_config_service_1.RuntimeMapConfigService])
], LegacyGmWorldCompatService);
/** projectLegacyRuntimeTile：执行对应的业务逻辑。 */
function projectLegacyRuntimeTile(input) {
/** aura：定义该变量以承载业务值。 */
    const aura = Number.isFinite(input?.aura) ? Math.trunc(input.aura) : 0;
/** projection：定义该变量以承载业务值。 */
    const projection = {
        aura,
        resources: [buildLegacyAuraResource(aura)],
    };
    if (typeof input?.mapChar === 'string') {
/** tileType：定义该变量以承载业务值。 */
        const tileType = (0, shared_1.getTileTypeFromMapChar)(input.mapChar[0] ?? '#');
        projection.type = tileType;
        projection.walkable = (0, shared_1.isTileTypeWalkable)(tileType);
    }
    return projection;
}
/** buildLegacyAuraResource：执行对应的业务逻辑。 */
function buildLegacyAuraResource(aura) {
    return {
        key: 'aura',
        label: '灵气',
        value: aura,
        effectiveValue: aura,
        level: (0, shared_1.getAuraLevel)(aura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE),
    };
}
/** buildManagedAccountView：执行对应的业务逻辑。 */
function buildManagedAccountView(account, online) {
    if (!account?.userId || !account.username) {
        return undefined;
    }
/** totalOnlineSeconds：定义该变量以承载业务值。 */
    let totalOnlineSeconds = Number.isFinite(account.totalOnlineSeconds) ? Math.max(0, Math.trunc(account.totalOnlineSeconds)) : 0;
    if (online && typeof account.currentOnlineStartedAt === 'string' && account.currentOnlineStartedAt) {
/** sessionStartedAt：定义该变量以承载业务值。 */
        const sessionStartedAt = Date.parse(account.currentOnlineStartedAt);
        if (Number.isFinite(sessionStartedAt)) {
            totalOnlineSeconds += Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
        }
    }
    return {
        userId: account.userId,
        username: account.username,
/** createdAt：定义该变量以承载业务值。 */
        createdAt: typeof account.createdAt === 'string' && account.createdAt ? account.createdAt : new Date(0).toISOString(),
        totalOnlineSeconds,
    };
}
/** clamp：执行对应的业务逻辑。 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/** compareManagedPlayerSummary：执行对应的业务逻辑。 */
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
/** isInRect：执行对应的业务逻辑。 */
function isInRect(x, y, startX, startY, endX, endY) {
    return x >= startX && x < endX && y >= startY && y < endY;
}
/** roundMetric：执行对应的业务逻辑。 */
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
/** buildLegacyTimeState：执行对应的业务逻辑。 */
function buildLegacyTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed) {
/** config：定义该变量以承载业务值。 */
    const config = normalizeLegacyMapTimeConfig(overrideConfig ?? template.source.time);
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
    const darknessStacks = resolveLegacyDarknessStacks(lightPercent);
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
/** normalizeLegacyMapTimeConfig：执行对应的业务逻辑。 */
function normalizeLegacyMapTimeConfig(input) {
/** candidate：定义该变量以承载业务值。 */
    const candidate = input ?? {};
    return {
        offsetTicks: candidate.offsetTicks,
        scale: candidate.scale,
        light: candidate.light,
        palette: candidate.palette,
    };
}
/** resolveLegacyDarknessStacks：执行对应的业务逻辑。 */
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
/** toLegacyEquipmentSlots：执行对应的业务逻辑。 */
function toLegacyEquipmentSlots(slots) {
/** bySlot：定义该变量以承载业务值。 */
    const bySlot = new Map(slots.map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));
    return {
        weapon: bySlot.get('weapon') ?? null,
        head: bySlot.get('head') ?? null,
        body: bySlot.get('body') ?? null,
        legs: bySlot.get('legs') ?? null,
        accessory: bySlot.get('accessory') ?? null,
    };
}
/** cloneTemporaryBuff：执行对应的业务逻辑。 */
function cloneTemporaryBuff(entry) {
    return {
        ...entry,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        stats: entry.stats ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
    };
}
/** cloneRatioDivisors：执行对应的业务逻辑。 */
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
