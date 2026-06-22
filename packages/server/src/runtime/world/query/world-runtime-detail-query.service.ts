/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable } from '@nestjs/common';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, getAuraLevel, parseQiResourceKey } from '@mud/shared';
import { ContentTemplateRepository } from '../../../content/content-template.repository';
import { NativePlayerAuthStoreService } from '../../../http/native/native-player-auth-store.service';
import { MapTemplateRepository } from '../../map/map-template.repository';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import * as world_runtime_observation_helpers_1 from './world-runtime.observation.helpers';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import { projectVisiblePlayerBuffs } from '../../player/player-buff-projection.helpers';
import { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } from '../world-runtime-qi-projection.helpers';

const {
    cloneVisibleBuff,
    buildPlayerObservation,
    buildMonsterObservation,
    buildMonsterLootPreview,
    buildNpcObservation,
    buildPortalTileEntityDetail,
    buildGroundTileEntityDetail,
    buildContainerTileEntityDetail,
    buildBuildingTileEntityDetail,
    buildPortalId,
} = world_runtime_observation_helpers_1;

const {
    isTileVisibleInView,
} = world_runtime_path_planning_helpers_1;

function projectObservableMonsterBuffs(buffs) {
    if (!Array.isArray(buffs) || buffs.length === 0) {
        return [];
    }
    return buffs
        .filter((entry) => entry
        && (entry.visibility === 'public' || entry.visibility === 'observe_only')
        && entry.remainingTicks > 0
        && entry.stacks > 0)
        .map((entry) => cloneVisibleBuff(entry))
        .sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
}

function uniqueMonsterViewsByRuntimeId(monsters) {
    const seen = new Set();
    const unique = [];
    for (const monster of monsters) {
        const runtimeId = typeof monster?.runtimeId === 'string' ? monster.runtimeId : '';
        if (!runtimeId || seen.has(runtimeId)) {
            continue;
        }
        seen.add(runtimeId);
        unique.push(monster);
    }
    return unique;
}

/** 世界运行时详情查询服务：承接只读 detail / tile-detail 组装。 */
@Injectable()
export class WorldRuntimeDetailQueryService {
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
 * playerAuthStore：账号身份存储引用。
 */

    playerAuthStore;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param playerAuthStore 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        contentTemplateRepository: ContentTemplateRepository,
        templateRepository: MapTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
        playerAuthStore: NativePlayerAuthStoreService,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.playerAuthStore = playerAuthStore;
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
                    buffs: projectObservableMonsterBuffs(monster.buffs),
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
                    name: resolveObservedPlayerName(target, this.playerAuthStore),
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    qi: target.qi,
                    maxQi: target.maxQi,
                    observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                    buffs: projectVisiblePlayerBuffs(target),
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
        const tileLayerState = instance.getTileLayerState?.(x, y) ?? null;
        const tileType = instance.getEffectiveTileType?.(x, y);
        const walkable = instance.isWalkable?.(x, y, viewer.playerId);
        const blocksSight = instance.isTileSightBlocked?.(x, y);
        const movementCost = instance.getTileTraversalCost?.(x, y, viewer.playerId);
        const qiDrainPerTick = instance.getTileQiDrainPerTick?.(x, y);
        const playerOverlap = instance.isPlayerOverlapTile?.(x, y);
        const container = instance.getContainerAtTile(x, y);
        const buildings = typeof instance.getBuildingsAtTile === 'function'
            ? instance.getBuildingsAtTile(x, y)
            : [];
        const npcs = view.localNpcs.filter((entry) => entry.x === x && entry.y === y);
        const monsters = uniqueMonsterViewsByRuntimeId(view.localMonsters.filter((entry) => entry.x === x && entry.y === y));
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
        for (const entry of buildings) {
            if (!entry?.building) {
                continue;
            }
            entities.push(buildBuildingTileEntityDetail(entry.building, entry.compiled));
        }
        for (const targetPlayerId of players) {
            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.instanceId !== location.instanceId) {
                continue;
            }
            entities.push({
                id: target.playerId,
                name: resolveObservedPlayerName(target, this.playerAuthStore),
                kind: 'player',
                hp: target.hp,
                maxHp: target.maxHp,
                qi: target.qi,
                maxQi: target.maxQi,
                observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                buffs: projectVisiblePlayerBuffs(target),
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
                buffs: projectObservableMonsterBuffs(monster.buffs),
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
            type: tileType,
            walkable: typeof walkable === 'boolean' ? walkable : undefined,
            blocksSight: typeof blocksSight === 'boolean' ? blocksSight : undefined,
            movementCost: Number.isFinite(movementCost) ? Math.trunc(movementCost) : undefined,
            qiDrainPerTick: Number.isFinite(qiDrainPerTick) && qiDrainPerTick > 0 ? Math.trunc(qiDrainPerTick) : undefined,
            playerOverlap: playerOverlap === true ? true : undefined,
            terrainType: tileLayerState?.terrain,
            surfaceType: tileLayerState ? tileLayerState.surface ?? null : undefined,
            structureType: tileLayerState ? tileLayerState.structure ?? null : undefined,
            interactableKinds: tileLayerState && Array.isArray(tileLayerState.interactableKinds)
                ? [...tileLayerState.interactableKinds]
                : undefined,
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

function resolveObservedPlayerName(player, authStore) {
    const accountName = resolveObservedAccountPlayerName(player, authStore);
    return accountName
        || normalizeObservedPlayerName(player?.name, player?.playerId)
        || normalizeObservedPlayerName(player?.displayName, player?.playerId)
        || '修士';
}

function resolveObservedAccountPlayerName(player, authStore) {
    if (!player || typeof player !== 'object') {
        return '';
    }
    const playerId = normalizeObservedPlayerIdentity(player?.playerId);
    if (!playerId) {
        return '';
    }
    const account = typeof authStore?.getMemoryUserByPlayerId === 'function'
        ? authStore.getMemoryUserByPlayerId(playerId)
        : null;
    if (!account) {
        return '';
    }
    return normalizeObservedPlayerName(account.pendingRoleName, playerId)
        || normalizeObservedPlayerName(account.playerName, playerId)
        || normalizeObservedPlayerName(account.displayName, playerId);
}

function normalizeObservedPlayerName(value, playerId) {
    const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    if (!normalized || normalized === normalizeObservedPlayerIdentity(playerId) || isRuntimePlayerIdLike(normalized)) {
        return '';
    }
    return normalized;
}

function normalizeObservedPlayerIdentity(value) {
    return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function isRuntimePlayerIdLike(value) {
    return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(value) || /^player[:_-]/i.test(value);
}

function buildTileRuntimeResources(entries, aura, viewer) {
    const resources = entries
        .filter((entry) => entry
        && typeof entry.resourceKey === 'string'
        && Number.isFinite(entry.value)
        && entry.value > 0)
        .map((entry) => {
        const parsed = parseQiResourceKey(entry.resourceKey);
        const projection = parsed && viewer
            ? resolvePlayerQiResourceProjection(viewer, entry.resourceKey)
            : null;
        if (projection?.visibility === 'hidden') {
            return null;
        }
        const value = Math.max(0, Number(entry.value) || 0);
        const effectiveValue = projection
            ? (projection.visibility === 'absorbable'
                ? projectPlayerQiResourceValue(viewer, entry.resourceKey, value)
                : 0)
            : value;
        return {
            key: entry.resourceKey,
            label: resolveTileResourceLabel(entry.resourceKey, parsed),
            value,
            effectiveValue,
            level: projection?.visibility === 'absorbable'
                ? getAuraLevel(effectiveValue, DEFAULT_AURA_LEVEL_BASE_VALUE)
                : !projection && parsed
                    ? getAuraLevel(value, DEFAULT_AURA_LEVEL_BASE_VALUE)
                    : undefined,
            sourceValue: Number.isFinite(entry.sourceValue) ? Math.max(0, Number(entry.sourceValue) || 0) : undefined,
        };
    }).filter((entry) => entry !== null);
    if (resources.length > 0) {
        return resources;
    }
    if (!Number.isFinite(aura) || aura <= 0) {
        return [];
    }
    const resourceKey = 'aura.refined.neutral';
    const value = Math.max(0, Number(aura) || 0);
    const effectiveValue = viewer
        ? projectPlayerQiResourceValue(viewer, resourceKey, value)
        : value;
    return [{
        key: resourceKey,
        label: '灵气',
        value,
        effectiveValue,
        level: getAuraLevel(effectiveValue, DEFAULT_AURA_LEVEL_BASE_VALUE),
    }];
}

function buildTileRuntimeAuraLevel(resources, aura, viewer) {
    const rawAura = Number.isFinite(aura) ? Math.max(0, Number(aura) || 0) : 0;
    if (Array.isArray(resources) && resources.length > 0) {
        let projectedQiValue = 0;
        let hasProjectableQiResource = false;
        for (const resource of resources) {
            const parsed = parseQiResourceKey(resource.key);
            const effectiveValue = Math.max(0, Number(resource.effectiveValue ?? 0) || 0);
            if (!parsed || effectiveValue <= 0) {
                continue;
            }
            hasProjectableQiResource = true;
            projectedQiValue += effectiveValue;
        }
        if (hasProjectableQiResource) {
            return getAuraLevel(projectedQiValue, DEFAULT_AURA_LEVEL_BASE_VALUE);
        }
    }
    if (!viewer) {
        return getAuraLevel(rawAura, DEFAULT_AURA_LEVEL_BASE_VALUE);
    }
    const effectiveValue = projectPlayerQiResourceValue(viewer, 'aura.refined.neutral', rawAura);
    return getAuraLevel(effectiveValue, DEFAULT_AURA_LEVEL_BASE_VALUE);
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
