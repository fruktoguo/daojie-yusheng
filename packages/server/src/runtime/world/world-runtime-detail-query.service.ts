// @ts-nocheck
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
exports.WorldRuntimeDetailQueryService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");

const content_template_repository_1 = require("../../content/content-template.repository");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const player_buff_projection_helpers_1 = require("../player/player-buff-projection.helpers");
const world_runtime_qi_projection_helpers_1 = require("./world-runtime-qi-projection.helpers");

const {
    cloneVisibleBuff,
    buildPlayerObservation,
    buildMonsterObservation,
    buildMonsterLootPreview,
    buildNpcObservation,
    buildPortalTileEntityDetail,
    buildGroundTileEntityDetail,
    buildContainerTileEntityDetail,
    buildPortalId,
} = world_runtime_observation_helpers_1;

const {
    isTileVisibleInView,
} = world_runtime_path_planning_helpers_1;

/** 世界运行时详情查询服务：承接只读 detail / tile-detail 组装。 */
let WorldRuntimeDetailQueryService = class WorldRuntimeDetailQueryService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * templateRepository：template仓储引用。
 */

    templateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository, templateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * buildDetail：构建并返回目标对象。
 * @param context 上下文信息。
 * @param input 输入参数。
 * @returns 无返回值，直接更新详情相关状态。
 */

    buildDetail(context, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const { kind, id } = input;
        const { view, viewer, location, instance } = context;
        if (kind === 'npc') {
            if (!view.localNpcs.some((entry) => entry.npcId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const npc = instance.getNpc(id);
            if (!npc) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                npc: {
                    id: npc.npcId,
                    name: npc.name,
                    char: npc.char,
                    color: npc.color,
                    x: npc.x,
                    y: npc.y,
                    dialogue: npc.dialogue,
                    role: npc.role ?? undefined,
                    hasShop: npc.hasShop ? 1 : undefined,
                    questCount: npc.quests.length > 0 ? npc.quests.length : undefined,
                    questMarker: view.localNpcs.find((entry) => entry.npcId === npc.npcId)?.questMarker,
                    observation: buildNpcObservation(npc),
                },
            };
        }
        if (kind === 'monster') {
            if (!view.localMonsters.some((entry) => entry.runtimeId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const monster = instance.getMonster(id);
            if (!monster) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                monster: {
                    id: monster.runtimeId,
                    mid: monster.monsterId,
                    name: monster.name,
                    char: monster.char,
                    color: monster.color,
                    x: monster.x,
                    y: monster.y,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    qi: monster.qi,
                    maxQi: monster.maxQi,
                    level: monster.level,
                    tier: monster.tier,
                    alive: monster.alive,
                    respawnTicks: monster.respawnTicks,
                    observation: buildMonsterObservation(viewer.attrs.finalAttrs.spirit, monster),
                    buffs: monster.buffs.map((entry) => cloneVisibleBuff(entry)),
                },
            };
        }
        if (kind === 'player') {
            if (id !== viewer.playerId && !view.visiblePlayers.some((entry) => entry.playerId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const target = this.playerRuntimeService.getPlayer(id);
            if (!target || target.instanceId !== location.instanceId) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                player: {
                    id: target.playerId,
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    qi: target.qi,
                    maxQi: target.maxQi,
                    observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                    buffs: (0, player_buff_projection_helpers_1.projectVisiblePlayerBuffs)(target),
                },
            };
        }
        if (kind === 'portal') {

            const portal = view.localPortals.find((entry) => buildPortalId(entry) === id);
            if (!portal) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const targetMapName = this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : undefined;
            return {
                kind,
                id,
                portal: {
                    id,
                    x: portal.x,
                    y: portal.y,
                    kind: portal.kind,
                    targetMapId: portal.targetMapId,
                    targetMapName,
                    targetX: portal.targetX,
                    targetY: portal.targetY,
                    trigger: portal.trigger,
                    direction: portal.direction ?? 'two_way',
                },
            };
        }
        if (kind === 'container') {

            const containerId = id.startsWith('container:') ? id.slice('container:'.length).trim() : '';
            if (!containerId) {
                return { kind, id, error: '目标不存在' };
            }

            const container = instance.getContainerById(containerId);

            const viewRadius = Math.max(1, Math.round(viewer.attrs.numericStats.viewRange));
            if (!container || !isTileVisibleInView(view, container.x, container.y, viewRadius)) {
                return { kind, id, error: '目标不在当前视野内' };
            }
            return {
                kind,
                id,
                container: {
                    id,
                    name: container.name,
                    x: container.x,
                    y: container.y,
                    grade: container.grade,
                    desc: container.desc?.trim() || undefined,
                },
            };
        }
        if (!view.localGroundPiles.some((entry) => entry.sourceId === id)) {
            return { kind, id, error: '目标不在当前视野内' };
        }

        const pile = instance.getGroundPileBySourceId(id);
        if (!pile) {
            return { kind, id, error: '目标不存在' };
        }
        return {
            kind,
            id,
            ground: {
                sourceId: pile.sourceId,
                x: pile.x,
                y: pile.y,
                items: pile.items.map((entry) => ({ ...entry.item })),
            },
        };
    }    
    /**
 * buildTileDetail：构建并返回目标对象。
 * @param context 上下文信息。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Tile详情相关状态。
 */

    buildTileDetail(context, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const { x, y } = input;
        const { view, viewer, location, instance } = context;
        const viewRadius = Math.max(1, Math.round(viewer.attrs.numericStats.viewRange));
        if (!isTileVisibleInView(view, x, y, viewRadius)) {
            return {
                x,
                y,
                error: '目标不在当前视野内',
            };
        }

        const aura = instance.getTileAura(x, y);
        if (aura === null) {
            return {
                x,
                y,
                error: '目标不存在',
            };
        }

        const resources = buildTileRuntimeResources(instance.listTileResources?.(x, y) ?? [], aura, viewer);
        const groundPile = instance.getTileGroundPile(x, y);
        const portal = instance.getPortalAtTile(x, y);
        const safeZone = instance.getSafeZoneAtTile(x, y);
        const tileCombat = instance.getTileCombatState?.(x, y) ?? null;
        const container = instance.getContainerAtTile(x, y);
        const npcs = view.localNpcs.filter((entry) => entry.x === x && entry.y === y);
        const monsters = view.localMonsters.filter((entry) => entry.x === x && entry.y === y);
        const players = [
            ...(view.self.x === x && view.self.y === y ? [viewer.playerId] : []),
            ...view.visiblePlayers.filter((entry) => entry.x === x && entry.y === y).map((entry) => entry.playerId),
        ];

        const entities = [];
        if (portal) {
            entities.push(buildPortalTileEntityDetail(portal, this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : undefined));
        }
        if (container) {
            entities.push(buildContainerTileEntityDetail(container));
        }
        if (groundPile) {
            entities.push(buildGroundTileEntityDetail(groundPile));
        }
        for (const targetPlayerId of players) {
            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.instanceId !== location.instanceId) {
                continue;
            }
            entities.push({
                id: target.playerId,
                name: target.name,
                kind: 'player',
                hp: target.hp,
                maxHp: target.maxHp,
                qi: target.qi,
                maxQi: target.maxQi,
                observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                buffs: (0, player_buff_projection_helpers_1.projectVisiblePlayerBuffs)(target),
            });
        }
        for (const monsterView of monsters) {
            const monster = instance.getMonster(monsterView.runtimeId);
            if (!monster) {
                continue;
            }

            const observation = buildMonsterObservation(viewer.attrs.finalAttrs.spirit, monster);
            entities.push({
                id: monster.runtimeId,
                name: monster.name,
                kind: 'monster',
                monsterTier: monster.tier,
                hp: monster.hp,
                maxHp: monster.maxHp,
                qi: monster.qi,
                maxQi: monster.maxQi,
                observation,
                lootPreview: observation.clarity === 'complete'
                    ? buildMonsterLootPreview(this.contentTemplateRepository, viewer, monster)
                    : undefined,
                buffs: monster.buffs.map((entry) => cloneVisibleBuff(entry)),
            });
        }
        for (const npcView of npcs) {
            const npc = instance.getNpc(npcView.npcId);
            if (!npc) {
                continue;
            }
            entities.push({
                id: npc.npcId,
                name: npc.name,
                kind: 'npc',
                npcQuestMarker: npcView.questMarker ?? null,
                observation: buildNpcObservation(npc),
            });
        }
        return {
            x,
            y,
            aura: (() => {
                const auraLevel = buildTileRuntimeAuraLevel(resources, aura, viewer);
                return auraLevel > 0 ? auraLevel : undefined;
            })(),
            hp: tileCombat && tileCombat.destroyed !== true ? tileCombat.hp : undefined,
            maxHp: tileCombat && tileCombat.destroyed !== true ? tileCombat.maxHp : undefined,
            resources: resources.length > 0 ? resources : undefined,
            safeZone: safeZone
                ? {
                    x: safeZone.x,
                    y: safeZone.y,
                    radius: safeZone.radius,
                }
                : undefined,
            portal: portal
                ? {
                    id: buildPortalId(portal),
                    x: portal.x,
                    y: portal.y,
                    kind: portal.kind,
                    targetMapId: portal.targetMapId,
                    targetMapName: this.templateRepository.has(portal.targetMapId)
                        ? this.templateRepository.getOrThrow(portal.targetMapId).name
                        : undefined,
                    targetX: portal.targetX,
                    targetY: portal.targetY,
                    trigger: portal.trigger,
                    direction: portal.direction ?? 'two_way',
                }
                : undefined,
            ground: groundPile
                ? {
                    sourceId: groundPile.sourceId,
                    x: groundPile.x,
                    y: groundPile.y,
                    items: groundPile.items.map((entry) => ({ ...entry })),
                }
                : undefined,
            entities: entities.length > 0 ? entities : undefined,
        };
    }
};
exports.WorldRuntimeDetailQueryService = WorldRuntimeDetailQueryService;
exports.WorldRuntimeDetailQueryService = WorldRuntimeDetailQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeDetailQueryService);

export { WorldRuntimeDetailQueryService };

function buildTileRuntimeResources(entries, aura, viewer) {
    const resources = entries
        .filter((entry) => entry
        && typeof entry.resourceKey === 'string'
        && Number.isFinite(entry.value)
        && entry.value > 0)
        .map((entry) => {
        const parsed = (0, shared_1.parseQiResourceKey)(entry.resourceKey);
        const projection = parsed && viewer
            ? (0, world_runtime_qi_projection_helpers_1.resolvePlayerQiResourceProjection)(viewer, entry.resourceKey)
            : null;
        if (projection?.visibility === 'hidden') {
            return null;
        }
        const value = Math.max(0, Math.trunc(entry.value));
        const effectiveValue = projection
            ? (projection.visibility === 'absorbable'
                ? (0, world_runtime_qi_projection_helpers_1.projectPlayerQiResourceValue)(viewer, entry.resourceKey, value)
                : 0)
            : value;
        return {
            key: entry.resourceKey,
            label: resolveTileResourceLabel(entry.resourceKey, parsed),
            value,
            effectiveValue,
            level: projection?.visibility === 'absorbable'
                ? (0, shared_1.getAuraLevel)(effectiveValue, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE)
                : !projection && parsed
                    ? (0, shared_1.getAuraLevel)(value, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE)
                    : undefined,
            sourceValue: Number.isFinite(entry.sourceValue) ? Math.max(0, Math.trunc(entry.sourceValue)) : undefined,
        };
    }).filter((entry) => entry !== null);
    if (resources.length > 0) {
        return resources;
    }
    if (!Number.isFinite(aura) || aura <= 0) {
        return [];
    }
    const resourceKey = 'aura.refined.neutral';
    const value = Math.max(0, Math.trunc(aura));
    const effectiveValue = viewer
        ? (0, world_runtime_qi_projection_helpers_1.projectPlayerQiResourceValue)(viewer, resourceKey, value)
        : value;
    return [{
        key: resourceKey,
        label: '灵气',
        value,
        effectiveValue,
        level: (0, shared_1.getAuraLevel)(effectiveValue, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE),
    }];
}

function buildTileRuntimeAuraLevel(resources, aura, viewer) {
    const rawAura = Number.isFinite(aura) ? Math.max(0, Math.trunc(aura)) : 0;
    if (Array.isArray(resources) && resources.length > 0) {
        let projectedQiValue = 0;
        let hasProjectableQiResource = false;
        for (const resource of resources) {
            const parsed = (0, shared_1.parseQiResourceKey)(resource.key);
            const effectiveValue = Math.max(0, Math.trunc(resource.effectiveValue ?? 0));
            if (!parsed || effectiveValue <= 0) {
                continue;
            }
            hasProjectableQiResource = true;
            projectedQiValue += effectiveValue;
        }
        if (hasProjectableQiResource) {
            return (0, shared_1.getAuraLevel)(projectedQiValue, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE);
        }
    }
    if (!viewer) {
        return (0, shared_1.getAuraLevel)(rawAura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE);
    }
    const effectiveValue = (0, world_runtime_qi_projection_helpers_1.projectPlayerQiResourceValue)(viewer, 'aura.refined.neutral', rawAura);
    return (0, shared_1.getAuraLevel)(effectiveValue, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE);
}

function resolveTileResourceLabel(resourceKey, parsed) {
    if (!parsed) {
        return resourceKey;
    }
    if (parsed.family === 'aura' && parsed.form === 'refined' && parsed.element === 'neutral') {
        return '灵气';
    }
    const elementLabel = parsed.element === 'neutral'
        ? ''
        : ({
            metal: '金',
            wood: '木',
            water: '水',
            fire: '火',
            earth: '土',
        }[parsed.element] ?? `${parsed.element}`);
    const formLabel = parsed.form === 'dispersed' ? '逸散' : '';
    const familyLabel = ({
        aura: '灵气',
        sha: '煞气',
        demonic: '魔气',
    }[parsed.family] ?? parsed.family);
    return `${elementLabel}${formLabel}${familyLabel}` || resourceKey;
}
