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

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncMapSnapshotService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const map_template_repository_1 = require("../runtime/map/map-template.repository");

const runtime_map_config_service_1 = require("../runtime/map/runtime-map-config.service");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const world_sync_minimap_service_1 = require("./world-sync-minimap.service");

/** map/static snapshot 构造服务：承接 world-sync 的可见区域与静态展示构造。 */
let WorldSyncMapSnapshotService = class WorldSyncMapSnapshotService {
    worldRuntimeService;
    playerRuntimeService;
    templateRepository;
    mapRuntimeConfigService;
    worldSyncMinimapService;
    constructor(worldRuntimeService, playerRuntimeService, templateRepository, mapRuntimeConfigService, worldSyncMinimapService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.templateRepository = templateRepository;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldSyncMinimapService = worldSyncMinimapService;
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
    buildMinimapLibrarySync(player, currentMapId) {

        const mapIds = Array.from(new Set([...player.unlockedMapIds, currentMapId]))
            .filter((entry) => this.templateRepository.has(entry))
            .sort(compareStableStrings);
        return mapIds.map((mapId) => {

            const template = this.templateRepository.getOrThrow(mapId);
            return {
                mapId,
                mapMeta: this.buildMapMetaSync(template),
                snapshot: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
            };
        });
    }
    buildMapMetaSync(template) {
        return buildMapMetaSync(template);
    }
    buildGameTimeState(template, view, player) {
        return buildGameTimeState(template, view.tick, Math.max(1, Math.round(player.attrs.numericStats.viewRange)), this.mapRuntimeConfigService.getMapTimeConfig(view.instance.templateId), this.mapRuntimeConfigService.getMapTickSpeed(view.instance.templateId));
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
};
exports.WorldSyncMapSnapshotService = WorldSyncMapSnapshotService;
exports.WorldSyncMapSnapshotService = WorldSyncMapSnapshotService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_runtime_service_1.WorldRuntimeService))),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        map_template_repository_1.MapTemplateRepository,
        runtime_map_config_service_1.RuntimeMapConfigService,
        world_sync_minimap_service_1.WorldSyncMinimapService])
], WorldSyncMapSnapshotService);
function buildCoordKey(x, y) {
    return `${x},${y}`;
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
function getBuffPresentationScale(buffs) {

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
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
