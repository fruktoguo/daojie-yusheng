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
exports.NextGmMapRuntimeQueryService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const map_template_repository_1 = require("../../runtime/map/map-template.repository");
const runtime_map_config_service_1 = require("../../runtime/map/runtime-map-config.service");
const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");
const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");
const next_gm_constants_1 = require("./next-gm.constants");
let NextGmMapRuntimeQueryService = class NextGmMapRuntimeQueryService {
    mapTemplateRepository;
    playerRuntimeService;
    worldRuntimeService;
    runtimeMapConfigService;
    constructor(mapTemplateRepository, playerRuntimeService, worldRuntimeService, runtimeMapConfigService) {
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.runtimeMapConfigService = runtimeMapConfigService;
    }
    getMapRuntime(mapId, x, y, w, h) {
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
        const tickSpeed = this.runtimeMapConfigService.getMapTickSpeed(mapId);
        const timeConfig = this.runtimeMapConfigService.getMapTimeConfig(mapId, template.source.time ?? {});
        return {
            mapId,
            mapName: template.name,
            width: template.width,
            height: template.height,
            tiles,
            entities,
            time: buildLegacyTimeState(template, runtimeInstance?.tick ?? this.worldRuntimeService.getRuntimeSummary().tick, shared_1.VIEW_RADIUS, timeConfig, tickSpeed),
            timeConfig,
            tickSpeed,
            tickPaused: this.runtimeMapConfigService.isMapPaused(mapId),
        };
    }
};
exports.NextGmMapRuntimeQueryService = NextGmMapRuntimeQueryService;
exports.NextGmMapRuntimeQueryService = NextGmMapRuntimeQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        runtime_map_config_service_1.RuntimeMapConfigService])
], NextGmMapRuntimeQueryService);
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
function isInRect(x, y, startX, startY, endX, endY) {
    return x >= startX && x < endX && y >= startY && y < endY;
}
function buildLegacyTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed) {
    const config = normalizeLegacyMapTimeConfig(overrideConfig ?? template.source.time);
    const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0 ? config.scale : 1;
    const timeScale = tickSpeed > 0 ? localTimeScale : 0;
    const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks) ? Math.round(config.offsetTicks) : 0;
    const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
    const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % shared_1.GAME_DAY_TICKS + shared_1.GAME_DAY_TICKS) % shared_1.GAME_DAY_TICKS;
    const phase = shared_1.GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
        ?? shared_1.GAME_TIME_PHASES[shared_1.GAME_TIME_PHASES.length - 1];
    const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base) ? config.light.base : 0;
    const timeInfluence = typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence) ? config.light.timeInfluence : 100;
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
