/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 物品使用结算服务
 * 处理丹药、技能书、传送符、灵石等各类物品的使用逻辑分支
 */
import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_QI_RESOURCE_DESCRIPTOR, MERIT_MONTH_CARD_DURATION_DAYS, MERIT_MONTH_CARD_POOL_GRANT, MERIT_MONTH_CARD_USE_BEHAVIOR, buildQiResourceKey, getItemDisplayName } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { REFINED_SHA_RESOURCE_KEY } from '../../constants/gameplay/pvp';
import { ActivityRuntimeService, normalizeActivityError } from '../activity/activity-runtime.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

const DEFAULT_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
const CURRENT_RESPAWN_BIND_USE_BEHAVIOR = 'bind_current_respawn';
const PUBLIC_RESPAWN_BIND_MAP_IDS = new Set(['yunlai_town', 'qizhen_crossing', 'yunxu_terrace']);

function normalizeOptionalStringSafe(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** world-runtime use-item orchestration：承接物品使用结算分支。 */
@Injectable()
export class WorldRuntimeUseItemService {
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
    activityRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(MapTemplateRepository) templateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(ActivityRuntimeService) activityRuntimeService: any = undefined,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.activityRuntimeService = activityRuntimeService;
    }    
    /**
 * dispatchUseItem：判断Use道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    async dispatchUseItem(playerId, itemInstanceId, deps, payload = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const inventoryItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
        if (!inventoryItem) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        const item = this.resolveUseItemView(inventoryItem);
        const count = normalizeUseItemCount(payload?.count, item);
        if (typeof item.formationDiskTier === 'string' && item.formationDiskTier.length > 0) {
            const n = buildStructuredNotice('info', 'notice.item.formation-hint', '阵盘需要通过背包中的布阵页面使用。', {});
            deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            return;
        }
        if (item.useBehavior === 'create_sect') {
            deps.worldRuntimeSectService.dispatchCreateSect(playerId, itemInstanceId, item, deps, payload);
            return;
        }
        if (item.useBehavior === CURRENT_RESPAWN_BIND_USE_BEHAVIOR) {
            this.handleCurrentRespawnBindItem(playerId, itemInstanceId, item, deps);
            return;
        }
        if (item.useBehavior === 'open_technique_generation') {
            const n = buildStructuredNotice('info', 'notice.item.open-panel', '打开功法领悟', {
                vars: { panel: 'technique_generation' },
            });
            deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            return;
        }
        if (item.useBehavior === MERIT_MONTH_CARD_USE_BEHAVIOR) {
            await this.handleMeritMonthCardItem(playerId, itemInstanceId, item, deps);
            return;
        }
        const learnedTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
        const mapUnlockIds = Array.isArray(item.mapUnlockIds) && item.mapUnlockIds.length > 0
            ? item.mapUnlockIds
            : item.mapUnlockId
                ? [item.mapUnlockId]
                : [];
        if (mapUnlockIds.length > 0) {
            const resolved = this.resolveMapUnlockTargets(mapUnlockIds);
            this.handleMapUnlockItem(playerId, itemInstanceId, item, resolved.mapIds, deps, resolved.label);
            return;
        }
        if (typeof item.respawnBindMapId === 'string' && item.respawnBindMapId.trim()) {
            this.handleRespawnBindItem(playerId, itemInstanceId, item, item.respawnBindMapId, deps);
            return;
        }
        if (this.resolveTileResourceGains(item).length > 0) {
            this.handleTileResourceItem(playerId, itemInstanceId, item, deps, count);
            return;
        }
        if (count > 1) {
            throw new BadRequestException('该物品不支持批量使用');
        }
        this.playerRuntimeService.useItemByInstanceId(playerId, itemInstanceId);
        if (learnedTechniqueId) {
            deps.refreshQuestStates(playerId);
            const itemName = getItemDisplayName(item);
            const n = buildStructuredNotice('success', 'notice.item.technique-comprehension-added', `参悟 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'skill' }] });
            deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            return;
        }
        deps.refreshQuestStates(playerId);
        const itemName = getItemDisplayName(item);
        const n = buildStructuredNotice('success', 'notice.item.used', `使用 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }    
    async handleMeritMonthCardItem(playerId, itemInstanceId, item, deps) {
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
        try {
            await this.activityRuntimeService.activateMeritMonthCard(playerId);
        }
        catch (error) {
            this.playerRuntimeService.receiveInventoryItem(playerId, { ...item, count: 1 });
            throw normalizeActivityError(error);
        }
        deps.refreshQuestStates(playerId);
        const itemName = getItemDisplayName(item);
        const n = buildStructuredNotice('success', 'notice.activity.month-card-activated', '已激活功德月卡，月卡总池已增加，领取时间已重置', {
            vars: { itemName, merit: MERIT_MONTH_CARD_POOL_GRANT, days: MERIT_MONTH_CARD_DURATION_DAYS },
            pills: [{ key: 'itemName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }

    resolveUseItemView(item) {
        const normalized = typeof this.contentTemplateRepository?.normalizeItem === 'function'
            ? this.contentTemplateRepository.normalizeItem(item)
            : null;
        return normalized && typeof normalized === 'object' ? normalized : item;
    }
    /**
 * handleMapUnlockItem：处理地图Unlock道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param item 道具。
 * @param mapUnlockIds mapUnlock ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Unlock道具相关状态。
 */

    resolveMapUnlockTargets(mapUnlockIds) {
        const resolvedMapIds = [];
        let expandedLabel = '';
        for (const mapRef of mapUnlockIds) {
            const normalizedRef = typeof mapRef === 'string' ? mapRef.trim() : '';
            if (!normalizedRef) {
                continue;
            }
            const groupMembers = typeof this.templateRepository.resolveMapGroupMembers === 'function'
                ? this.templateRepository.resolveMapGroupMembers(normalizedRef)
                : [];
            if (Array.isArray(groupMembers) && groupMembers.length > 0) {
                for (const mapId of groupMembers) {
                    if (!resolvedMapIds.includes(mapId)) {
                        resolvedMapIds.push(mapId);
                    }
                }
                if (!expandedLabel && groupMembers.length > 1 && typeof this.templateRepository.resolveMapGroupLabel === 'function') {
                    expandedLabel = this.templateRepository.resolveMapGroupLabel(normalizedRef);
                }
                continue;
            }
            if (!this.templateRepository.has(normalizedRef)) {
                throw new BadRequestException(`地图解锁目标不存在：${normalizedRef}`);
            }
            if (!resolvedMapIds.includes(normalizedRef)) {
                resolvedMapIds.push(normalizedRef);
            }
        }
        if (resolvedMapIds.length === 0) {
            throw new BadRequestException('地图解锁目标不存在');
        }
        return {
            mapIds: resolvedMapIds,
            label: expandedLabel,
        };
    }
    handleMapUnlockItem(playerId, itemInstanceId, item, mapUnlockIds, deps, targetLabelOverride = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const mapId of mapUnlockIds) {
            if (!this.templateRepository.has(mapId)) {
                throw new BadRequestException(`地图解锁目标不存在：${mapId}`);
            }
        }
        if (mapUnlockIds.every((mapId) => this.playerRuntimeService.hasUnlockedMap(playerId, mapId))) {
            throw new BadRequestException('地图已经解锁');
        }
        for (const mapId of mapUnlockIds) {
            if (!this.playerRuntimeService.hasUnlockedMap(playerId, mapId)) {
                this.playerRuntimeService.unlockMap(playerId, mapId);
            }
        }
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
        deps.refreshQuestStates(playerId);
        const targetLabel = targetLabelOverride || (mapUnlockIds.length === 1
            ? this.templateRepository.getOrThrow(mapUnlockIds[0]).name
            : `${item.name ?? '地图'}记载的区域`);
        const n = buildStructuredNotice('success', 'notice.item.map-unlocked', `已解锁地图：${targetLabel}`, { vars: { mapName: targetLabel }, pills: [{ key: 'mapName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }    
    /**
 * handleRespawnBindItem：处理复活点绑定道具。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param item 道具。
 * @param mapId 地图 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新复活绑定相关状态。
 */

    handleRespawnBindItem(playerId, itemInstanceId, item, mapId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
        if (!normalizedMapId || !this.templateRepository.has(normalizedMapId)) {
            throw new BadRequestException(`复活绑定目标不存在：${normalizedMapId || mapId}`);
        }
        const changed = this.playerRuntimeService.bindRespawnPoint(playerId, normalizedMapId);
        if (!changed) {
            throw new BadRequestException('已经绑定该复活点');
        }
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
        deps.refreshQuestStates(playerId);
        const targetLabel = this.templateRepository.getOrThrow(normalizedMapId).name;
        const n = buildStructuredNotice('success', 'notice.item.spawn-bound', `复活点与遁返落点已绑定：${targetLabel}`, { vars: { mapName: targetLabel }, pills: [{ key: 'mapName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    handleCurrentRespawnBindItem(playerId, itemInstanceId, item, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const target = this.resolveCurrentRespawnBindTarget(player, instance);
        if (!target.allowed) {
            throw new BadRequestException('命石只能在云来镇、栖真渡、云墟台或自己所属宗门使用');
        }
        const changed = this.playerRuntimeService.bindRespawnPointToPlacement(playerId, target.placement);
        if (!changed) {
            throw new BadRequestException('已经绑定该复活点');
        }
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
        deps.refreshQuestStates(playerId);
        const n = buildStructuredNotice('success', 'notice.item.spawn-bound', `复活点与遁返落点已绑定：${target.mapName}`, { vars: { mapName: target.mapName }, pills: [{ key: 'mapName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    resolveCurrentRespawnBindTarget(player, instance) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const templateId = typeof instance?.template?.id === 'string' ? instance.template.id.trim() : '';
        const instanceId = typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
        if (!templateId || !instanceId) {
            return { allowed: false };
        }
        const playerSectId = normalizeOptionalStringSafe(player?.sectId);
        const instanceSectId = normalizeOptionalStringSafe(instance?.meta?.ownerSectId)
            || normalizeOptionalStringSafe(instance?.template?.source?.sectId)
            || normalizeOptionalStringSafe(instance?.template?.sectId);
        const isOwnSectMap = Boolean(playerSectId && instanceSectId && playerSectId === instanceSectId);
        const isAllowedPublicMap = PUBLIC_RESPAWN_BIND_MAP_IDS.has(templateId);
        if (!isAllowedPublicMap && !isOwnSectMap) {
            return { allowed: false };
        }
        const spawnX = Number.isFinite(instance?.template?.spawnX) ? Math.trunc(Number(instance.template.spawnX)) : undefined;
        const spawnY = Number.isFinite(instance?.template?.spawnY) ? Math.trunc(Number(instance.template.spawnY)) : undefined;
        return {
            allowed: true,
            mapName: typeof instance?.template?.name === 'string' && instance.template.name.trim() ? instance.template.name.trim() : templateId,
            placement: {
                templateId,
                instanceId,
                x: spawnX,
                y: spawnY,
            },
        };
    }
    /**
 * handleTileResourceItem：处理Tile资源道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Tile资源道具相关状态。
 */

    handleTileResourceItem(playerId, itemInstanceId, item, deps, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const resourceGains = this.resolveTileResourceGains(item);
        const normalizedCount = normalizeUseItemCount(count, item);
        if (resourceGains.length <= 0) {
            throw new BadRequestException(`无法解析物品 ${item.itemId} 的地块资源效果`);
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        if (isProtectedTileResourceUseTile(instance, player.x, player.y)) {
            throw new BadRequestException('当前位于安全区、出生点、传送点或 NPC 附近，无法使用地块资源道具。');
        }
        const results = [];
        for (const entry of resourceGains) {
            const totalGain = entry.amount * normalizedCount;
            const nextValue = instance.addTileResource(entry.resourceKey, player.x, player.y, totalGain);
            if (nextValue === null) {
                throw new BadRequestException(`无法在 ${player.x},${player.y} 增加地块资源 ${entry.resourceKey}`);
            }
            results.push({ ...entry, amount: totalGain, nextValue });
        }
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, normalizedCount);
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, buildTileResourceUseNotice(item, normalizedCount, results), 'success');
    }
    /**
 * resolveTileResourceGains：解析地块资源增益列表。
 * @param item 道具。
 * @returns 返回地块资源增益列表。
 */

    resolveTileResourceGains(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (Array.isArray(item.tileResourceGains) && item.tileResourceGains.length > 0) {
            return item.tileResourceGains
                .filter((entry) => entry
                && typeof entry.resourceKey === 'string'
                && entry.resourceKey.length > 0
                && Number.isFinite(entry.amount)
                && entry.amount > 0)
                .map((entry) => ({
                resourceKey: entry.resourceKey,
                amount: Number(entry.amount),
            }));
        }
        if (Number.isFinite(item.tileAuraGainAmount) && item.tileAuraGainAmount > 0) {
            return [{
                resourceKey: DEFAULT_TILE_AURA_RESOURCE_KEY,
                amount: Number(item.tileAuraGainAmount),
            }];
        }
        return [];
    }
};

function normalizeUseItemCount(input, item) {
    const count = input === undefined || input === null
        ? 1
        : Math.trunc(Number(input));
    if (!Number.isFinite(count) || count <= 0) {
        throw new BadRequestException('使用数量无效');
    }
    if (count > 1 && item.allowBatchUse !== true) {
        throw new BadRequestException('该物品不支持批量使用');
    }
    const available = Math.trunc(Number(item.count ?? 1));
    if (Number.isFinite(available) && available > 0 && count > available) {
        throw new BadRequestException('物品数量不足');
    }
    return count;
}

function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function buildTileResourceUseNotice(item, count, results) {
    const countText = count > 1 ? ` x${count}` : '';
    if (results.length === 1) {
        const result = results[0];
        const resourceLabel = resolveTileResourceNoticeLabel(result.resourceKey);
        return `使用 ${item.name}${countText}，当前地块${resourceLabel}提升至 ${result.nextValue}`;
    }
    const summary = results
        .map((entry) => `${resolveTileResourceNoticeLabel(entry.resourceKey)} ${entry.nextValue}`)
        .join('，');
    return `使用 ${item.name}${countText}，当前地块资源提升：${summary}`;
}

function resolveTileResourceNoticeLabel(resourceKey) {
    if (resourceKey === REFINED_SHA_RESOURCE_KEY) {
        return '煞气';
    }
    if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
        return '灵气';
    }
    return '资源';
}

function isProtectedTileResourceUseTile(instance, x, y) {
    if (typeof instance?.isPointInSafeZone === 'function' && instance.isPointInSafeZone(x, y)) {
        return true;
    }
    if (typeof instance?.isSafeZoneTile === 'function' && instance.isSafeZoneTile(x, y)) {
        return true;
    }
    const template = instance?.template ?? {};
    if (isNearTile(x, y, template.spawnX, template.spawnY, true)) {
        return true;
    }
    const currentMapId = typeof template.id === 'string'
        ? template.id
        : typeof instance?.meta?.templateId === 'string'
            ? instance.meta.templateId
            : '';
    const portals = typeof instance?.listAllPortals === 'function'
        ? instance.listAllPortals()
        : Array.isArray(template.portals)
            ? template.portals
            : [];
    for (const portal of portals) {
        if (isNearTile(x, y, portal?.x, portal?.y, true)) {
            return true;
        }
        if ((!currentMapId || portal?.targetMapId === currentMapId) && isNearTile(x, y, portal?.targetX, portal?.targetY, true)) {
            return true;
        }
    }
    const npcs = Array.isArray(template.npcs) ? template.npcs : [];
    for (const npc of npcs) {
        if (isNearTile(x, y, npc?.x, npc?.y, false)) {
            return true;
        }
    }
    return false;
}

function isNearTile(x, y, centerX, centerY, includeCenter) {
    if (!Number.isFinite(Number(centerX)) || !Number.isFinite(Number(centerY))) {
        return false;
    }
    const dx = Math.abs(Math.trunc(Number(centerX)) - Math.trunc(Number(x)));
    const dy = Math.abs(Math.trunc(Number(centerY)) - Math.trunc(Number(y)));
    if (dx > 1 || dy > 1) {
        return false;
    }
    return includeCenter || dx > 0 || dy > 0;
}
