/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 物品使用结算服务
 * 处理丹药、技能书、传送符、灵石等各类物品的使用逻辑分支
 */
import { Inject, Injectable, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID, DEFAULT_QI_RESOURCE_DESCRIPTOR, MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS, MERIT_ETERNAL_POOL_GRANT, MERIT_ETERNAL_USE_BEHAVIOR, MERIT_MONTH_CARD_DURATION_DAYS, MERIT_MONTH_CARD_POOL_GRANT, MERIT_MONTH_CARD_USE_BEHAVIOR, SECT_ENTRANCE_RELOCATION_USE_BEHAVIOR, TECHNIQUE_FRAGMENT_ITEM_ID, buildQiResourceKey, calculateTechniqueBookCraftFragmentCost, calculateTechniqueBookDecomposeFragments, getItemDisplayName, getTechniqueMaxLevel, isCreatedTechniqueId, isTechniqueFullyMastered } from '@mud/shared';
import { randomUUID } from 'node:crypto';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { REFINED_SHA_RESOURCE_KEY } from '../../constants/gameplay/pvp';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import { ActivityRuntimeService, normalizeActivityError } from '../activity/activity-runtime.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import {
    isDurableCommitOutcomeUnknownError,
    reconcileDurableInventoryCommitOutcome,
} from './durable-source-asset-reconciliation.helpers';
import {
    buildGrantedInventorySnapshots,
    buildNextInventorySnapshots,
} from './world-runtime-inventory-grant.helpers';

const DEFAULT_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
const CURRENT_RESPAWN_BIND_USE_BEHAVIOR = 'bind_current_respawn';
const PUBLIC_RESPAWN_BIND_MAP_IDS = new Set(['yunlai_town', 'qizhen_crossing', 'yunxu_terrace']);

function normalizeOptionalStringSafe(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function findPlayerLearnedTechnique(player, techniqueId) {
    const normalizedTechniqueId = normalizeOptionalStringSafe(techniqueId);
    if (!normalizedTechniqueId) {
        return null;
    }
    const learned = Array.isArray(player?.techniques?.techniques)
        ? player.techniques.techniques
        : Array.isArray(player?.techniques)
            ? player.techniques
            : [];
    return learned.find((entry) => {
        const entryTechniqueId = normalizeOptionalStringSafe(entry?.techId)
            ?? normalizeOptionalStringSafe(entry?.techniqueId)
            ?? normalizeOptionalStringSafe(entry?.id);
        return entryTechniqueId === normalizedTechniqueId;
    }) ?? null;
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
            await deps.worldRuntimeSectService.dispatchCreateSect(playerId, itemInstanceId, item, deps, payload);
            return;
        }
        if (item.useBehavior === SECT_ENTRANCE_RELOCATION_USE_BEHAVIOR) {
            await deps.worldRuntimeSectService.dispatchRelocateSectEntrance(playerId, itemInstanceId, item, deps);
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
            await this.handleMeritMonthCardItem(playerId, itemInstanceId, item, deps, count);
            return;
        }
        if (item.useBehavior === MERIT_ETERNAL_USE_BEHAVIOR) {
            await this.handleMeritEternalItem(playerId, itemInstanceId, item, deps, count);
            return;
        }
        const learnedTechniqueId = this.resolveLearnTechniqueId(item);
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
            await this.handleTileResourceItem(playerId, itemInstanceId, item, deps, count);
            return;
        }
        if (count > 1) {
            throw new BadRequestException('该物品不支持批量使用');
        }
        if (item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID) {
            if (!learnedTechniqueId) {
                throw new NotFoundException('功法书缺少功法 ID');
            }
            this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
            this.playerRuntimeService.addPendingTechniqueComprehensionById(
                playerId,
                learnedTechniqueId,
                'normal',
                null,
                { maxLevel: item.learnTechniqueMaxLevel },
            );
        }
        else {
            this.playerRuntimeService.useItemByInstanceId(playerId, itemInstanceId);
        }
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
    async handleMeritMonthCardItem(playerId, itemInstanceId, item, deps, count = 1) {
        const normalizedCount = normalizeUseItemCount(count, item);
        try {
            await this.activityRuntimeService.activateMeritMonthCardFromInventoryItem(
                playerId,
                itemInstanceId,
                item,
                normalizedCount,
                Date.now(),
            );
        }
        catch (error) {
            throw normalizeActivityError(error);
        }
        deps.refreshQuestStates(playerId);
        const itemName = getItemDisplayName(item);
        const n = buildStructuredNotice('success', 'notice.activity.month-card-activated', '已激活功德月卡，月卡总池已增加，领取时间已重置', {
            vars: {
                itemName,
                count: normalizedCount,
                merit: MERIT_MONTH_CARD_POOL_GRANT * normalizedCount,
                days: MERIT_MONTH_CARD_DURATION_DAYS,
            },
            pills: [{ key: 'itemName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }

    async handleMeritEternalItem(playerId, itemInstanceId, item, deps, count = 1) {
        const normalizedCount = normalizeUseItemCount(count, item);
        try {
            await this.activityRuntimeService.activateEternalMonthCardFromInventoryItem(
                playerId,
                itemInstanceId,
                item,
                normalizedCount,
                Date.now(),
            );
        }
        catch (error) {
            throw normalizeActivityError(error);
        }
        deps.refreshQuestStates(playerId);
        const itemName = getItemDisplayName(item);
        const n = buildStructuredNotice('success', 'notice.activity.eternal-activated', '已激活永恒，永久拥有功德月卡权益', {
            vars: {
                itemName,
                count: normalizedCount,
                merit: MERIT_ETERNAL_POOL_GRANT * normalizedCount,
                dailySignInFixedMerit: MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS * normalizedCount,
            },
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
    resolveLearnTechniqueId(item) {
        const explicit = typeof item?.learnTechniqueId === 'string' && item.learnTechniqueId.trim()
            ? item.learnTechniqueId.trim()
            : '';
        return explicit || this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
    }
    dispatchCraftTechniqueBook(playerId, techniqueIdInput, maxLevelInput, deps) {
        this.assertNearTechniqueRefiningTable(playerId, deps);
        const techniqueId = typeof techniqueIdInput === 'string' && techniqueIdInput.trim() ? techniqueIdInput.trim() : '';
        if (!techniqueId) {
            throw new BadRequestException('功法 ID 不能为空');
        }
        if (!isCreatedTechniqueId(techniqueId)) {
            throw new BadRequestException('只能抄录自创功法');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const learnedTechnique = findPlayerLearnedTechnique(player, techniqueId);
        if (!learnedTechnique) {
            throw new BadRequestException('只能抄录已掌握功法');
        }
        const technique = this.contentTemplateRepository.createTechniqueState(techniqueId);
        if (!technique) {
            throw new NotFoundException(`功法不存在：${techniqueId}`);
        }
        if (technique.category === 'divine') {
            throw new BadRequestException('神通不能抄录为功法书');
        }
        if (!isTechniqueFullyMastered({
            level: Math.max(1, Math.trunc(Number(learnedTechnique.level) || 1)),
            layers: Array.isArray(technique.layers) ? technique.layers : undefined,
        })) {
            throw new BadRequestException('只有修至原功法满层后才能抄录');
        }
        const maxTemplateLevel = getTechniqueMaxLevel(Array.isArray(technique.layers) ? technique.layers : undefined, technique.level ?? 1);
        const maxLevel = Number.isFinite(Number(maxLevelInput))
            ? Math.max(1, Math.min(maxTemplateLevel, Math.trunc(Number(maxLevelInput))))
            : maxTemplateLevel;
        const cost = calculateTechniqueBookCraftFragmentCost({
            realmLv: technique.realmLv,
            grade: technique.grade,
            maxLevel,
            totalMaxLevel: maxTemplateLevel,
        });
        const consumed = this.playerRuntimeService.consumeItemByItemId(playerId, TECHNIQUE_FRAGMENT_ITEM_ID, cost);
        if (!consumed) {
            throw new BadRequestException('功法残页不足');
        }
        this.playerRuntimeService.receiveInventoryItem(playerId, {
            itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
            count: 1,
            learnTechniqueId: techniqueId,
            ...(maxLevel < maxTemplateLevel ? { learnTechniqueMaxLevel: maxLevel } : {}),
            name: maxLevel >= maxTemplateLevel ? `《${technique.name}》` : `《${technique.name}》残卷`,
            type: 'skill_book',
            desc: maxLevel >= maxTemplateLevel
                ? `完整记载${technique.name}。`
                : `记载${technique.name}前 ${maxLevel} 层的残卷。`,
            grade: technique.grade,
            level: technique.realmLv,
        });
        deps.refreshQuestStates?.(playerId);
        const n = buildStructuredNotice('success', 'notice.item.technique-book-crafted', '功法书已抄录', {
            vars: { techniqueName: technique.name ?? techniqueId, count: cost, maxLevel },
            pills: [{ key: 'techniqueName', style: 'skill' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    dispatchDecomposeTechniqueBook(playerId, itemInstanceId, deps, countInput = 1) {
        this.assertNearTechniqueRefiningTable(playerId, deps);
        const item = this.resolveUseItemView(this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId));
        if (!item || item.type !== 'skill_book') {
            throw new BadRequestException('只能分解功法书');
        }
        const count = Math.max(1, Math.min(Math.trunc(Number(item.count) || 1), Math.trunc(Number(countInput) || 1)));
        const techniqueId = this.resolveLearnTechniqueId(item);
        const technique = techniqueId ? this.contentTemplateRepository.createTechniqueState(techniqueId) : null;
        if (!technique) {
            throw new BadRequestException('功法书缺少有效功法模板');
        }
        const templateMaxLevel = technique
            ? getTechniqueMaxLevel(Array.isArray(technique.layers) ? technique.layers : undefined, technique.level ?? 1)
            : undefined;
        const effectiveMaxLevel = Number.isFinite(Number(item.learnTechniqueMaxLevel))
            ? item.learnTechniqueMaxLevel
            : templateMaxLevel;
        const fragmentsPerBook = calculateTechniqueBookDecomposeFragments({
            realmLv: technique?.realmLv ?? item.level,
            grade: technique?.grade ?? item.grade,
            maxLevel: effectiveMaxLevel,
            totalMaxLevel: templateMaxLevel,
        });
        const fragments = fragmentsPerBook * count;
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, count);
        this.playerRuntimeService.receiveInventoryItem(playerId, { itemId: TECHNIQUE_FRAGMENT_ITEM_ID, count: fragments });
        const itemName = getItemDisplayName(item);
        const n = buildStructuredNotice('success', 'notice.item.technique-book-decomposed', '功法书已分解', {
            vars: { itemName, count: fragments },
            pills: [{ key: 'itemName', style: 'skill' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    assertNearTechniqueRefiningTable(playerId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instanceId = typeof player?.instanceId === 'string' && player.instanceId.trim()
            ? player.instanceId.trim()
            : normalizeOptionalStringSafe(deps.getPlayerLocationOrThrow?.(playerId)?.instanceId);
        const instance = instanceId
            ? (deps.getInstanceRuntime?.(instanceId) ?? deps.getInstanceRuntimeOrThrow?.(instanceId))
            : null;
        const buildings = instance?.buildingById?.values?.();
        if (!buildings || typeof buildings[Symbol.iterator] !== 'function') {
            throw new BadRequestException('需要在炼法台 1 格范围内操作');
        }
        const playerX = Math.floor(Number(player?.x) || 0);
        const playerY = Math.floor(Number(player?.y) || 0);
        for (const building of buildings) {
            if (building?.defId !== 'technique_refining_table' || building?.state !== 'active') {
                continue;
            }
            const dx = Math.abs(playerX - Math.floor(Number(building.x) || 0));
            const dy = Math.abs(playerY - Math.floor(Number(building.y) || 0));
            if (Math.max(dx, dy) <= 1) {
                return;
            }
        }
        throw new BadRequestException('需要在炼法台 1 格范围内操作');
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
        if (isOwnSectMap) {
            return {
                allowed: true,
                mapName: typeof instance?.template?.name === 'string' && instance.template.name.trim() ? instance.template.name.trim() : templateId,
                placement: {
                    templateId: instanceSectId ? `sect_domain:${instanceSectId}` : templateId,
                    instanceId,
                    x: 0,
                    y: 0,
                },
            };
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

    async handleTileResourceItem(playerId, itemInstanceId, item, deps, count = 1) {
        return this.runExclusiveTileResourceUse(playerId, deps, async (location, instance) => {
            const currentInventoryItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
            if (!currentInventoryItem) {
                throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
            }
            const currentItem = this.resolveUseItemView(currentInventoryItem);
            if (currentItem.itemId !== item.itemId) {
                throw new BadRequestException('地块资源物品已变化，请重试');
            }
            const resourceGains = this.resolveTileResourceGains(currentItem);
            const normalizedCount = normalizeUseItemCount(count, currentItem);
            if (resourceGains.length <= 0) {
                throw new BadRequestException(`无法解析物品 ${currentItem.itemId} 的地块资源效果`);
            }
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (isProtectedTileResourceUseTile(instance, player.x, player.y)) {
                throw new BadRequestException('当前位于安全区、出生点、传送点或 NPC 附近，无法使用地块资源道具。');
            }
            const durable = deps?.durableOperationService ?? null;
            if (durable?.isEnabled?.() !== true) {
                if (resolveServerDatabaseUrl().trim() && !isTileResourceVolatileFallbackAllowed()) {
                    throw new ServiceUnavailableException('地块资源资产事务暂不可用，请稍后重试');
                }
                this.applyVolatileTileResourceUse(
                    playerId,
                    itemInstanceId,
                    currentItem,
                    normalizedCount,
                    resourceGains,
                    player,
                    instance,
                    deps,
                );
                return;
            }
            await this.commitTileResourceUseDurably({
                playerId,
                itemInstanceId,
                item: currentItem,
                count: normalizedCount,
                resourceGains,
                location,
                player,
                instance,
                deps,
                durable,
            });
        });
    }

    async runExclusiveTileResourceUse(playerId, deps, action) {
        const runWithInstanceDomain = async () => {
            const location = deps.getPlayerLocationOrThrow(playerId);
            const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
            const coordinator = instance?.runExclusivePersistenceDomainMutation;
            if (typeof coordinator !== 'function') {
                return action(location, instance);
            }
            return coordinator.call(instance, ['tile_resource'], () => action(location, instance));
        };
        const playerCoordinator = this.playerRuntimeService?.runExclusiveAssetMutation;
        if (typeof playerCoordinator !== 'function') {
            return runWithInstanceDomain();
        }
        return playerCoordinator.call(this.playerRuntimeService, [playerId], runWithInstanceDomain);
    }

    applyVolatileTileResourceUse(playerId, itemInstanceId, item, count, resourceGains, player, instance, deps) {
        if (resourceGains.length <= 0) {
            throw new BadRequestException(`无法解析物品 ${item.itemId} 的地块资源效果`);
        }
        const results = [];
        for (const entry of resourceGains) {
            const totalGain = entry.amount * count;
            const nextValue = instance.addTileResource(entry.resourceKey, player.x, player.y, totalGain);
            if (nextValue === null) {
                throw new BadRequestException(`无法在 ${player.x},${player.y} 增加地块资源 ${entry.resourceKey}`);
            }
            results.push({ ...entry, amount: totalGain, nextValue });
        }
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, count);
        deps.refreshQuestStates(playerId);
        queueTileResourceUseNotice(deps, playerId, item, count, results);
    }

    async commitTileResourceUseDurably(input) {
        const { playerId, itemInstanceId, item, count, resourceGains, player, instance, deps, durable } = input;
        if (
            typeof durable?.grantInventoryItems !== 'function'
            || typeof instance?.toTileIndex !== 'function'
            || typeof instance?.getTileResource !== 'function'
            || typeof instance?.capturePersistenceDomainFlushSnapshot !== 'function'
            || typeof instance?.buildTileResourcePersistenceDelta !== 'function'
        ) {
            throw new BadRequestException('地块资源资产事务暂不可用，请稍后重试');
        }
        const instanceId = typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
        const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
        const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
        const ownershipEpoch = Number.isFinite(Number(instance?.meta?.ownershipEpoch))
            ? Math.max(0, Math.trunc(Number(instance.meta.ownershipEpoch)))
            : 0;
        if (
            !instanceId
            || instanceId !== input.location.instanceId
            || !assignedNodeId
            || !leaseToken
            || ownershipEpoch <= 0
            || (typeof deps?.isInstanceLeaseWritable === 'function' && deps.isInstanceLeaseWritable(instance) !== true)
        ) {
            throw new BadRequestException('当前地图实例资产事务围栏暂不可用，请稍后重试');
        }
        const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' ? player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(Number(player?.sessionEpoch))
            ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            throw new BadRequestException('玩家资产事务围栏暂不可用，请稍后重试');
        }
        const tileIndex = instance.toTileIndex(player.x, player.y);
        const plannedGains = planTileResourceGains(instance, resourceGains, count, player.x, player.y, tileIndex);
        const flushSnapshot = instance.capturePersistenceDomainFlushSnapshot(['tile_resource']);
        const domainRevisionBeforeCommit = typeof instance.getPersistenceDomainRevision === 'function'
            ? instance.getPersistenceDomainRevision('tile_resource')
            : null;
        const pendingDelta = instance.buildTileResourcePersistenceDelta(flushSnapshot);
        if (!pendingDelta || pendingDelta.fullReplace === true) {
            throw new BadRequestException('地块资源持久化正在收敛，请稍后重试');
        }
        const nextRuntimeInventoryItems = buildInventoryAfterConsume(
            player.inventory?.items,
            itemInstanceId,
            count,
        );
        const sourceMutation = buildDurableTileResourceSourceMutation({
            instanceId,
            ownershipEpoch,
            flushLedgerVersion: nextPlayerPersistenceVersion(),
            pendingDelta,
            plannedGains,
        });
        const durableInput = {
            operationId: `tile-resource-use:${playerId}:${randomUUID()}`,
            playerId,
            expectedRuntimeOwnerId: runtimeOwnerId,
            expectedSessionEpoch: sessionEpoch,
            expectedInstanceId: instanceId,
            expectedAssignedNodeId: assignedNodeId,
            expectedLeaseToken: leaseToken,
            expectedOwnershipEpoch: ownershipEpoch,
            sourceType: 'tile_resource_use',
            sourceRefId: `${item.itemId}:${itemInstanceId}:${tileIndex}`,
            inventoryAction: 'remove',
            sourceMutation,
            grantedItems: buildGrantedInventorySnapshots([{ ...item, count }]),
            nextInventoryItems: buildNextInventorySnapshots(nextRuntimeInventoryItems),
        };
        const releaseHold = typeof instance.acquirePersistenceDomainHold === 'function'
            ? instance.acquirePersistenceDomainHold('tile_resource')
            : () => undefined;
        let committedInventoryItems = nextRuntimeInventoryItems;
        try {
            if (!await this.syncCurrentPlayerPresence(playerId)) {
                throw new BadRequestException('玩家资产事务围栏暂不可用，请稍后重试');
            }
            const currentFence = this.playerRuntimeService.getSessionFence?.(playerId)
                ?? this.playerRuntimeService.describePersistencePresence?.(playerId)
                ?? null;
            if (!currentFence?.runtimeOwnerId || !currentFence?.sessionEpoch) {
                throw new BadRequestException('玩家资产事务围栏暂不可用，请稍后重试');
            }
            durableInput.expectedRuntimeOwnerId = currentFence.runtimeOwnerId;
            durableInput.expectedSessionEpoch = Math.max(1, Math.trunc(Number(currentFence.sessionEpoch)));
            try {
                await durable.grantInventoryItems(durableInput);
            }
            catch (error) {
                if (!isDurableCommitOutcomeUnknownError(error)) {
                    throw error;
                }
                const reconciliation = await reconcileDurableInventoryCommitOutcome(durable, durableInput);
                if (reconciliation.outcome === 'failed') {
                    throw reconciliation.error;
                }
                if (reconciliation.outcome === 'unknown') {
                    throw error;
                }
                committedInventoryItems = reconciliation.inventoryItems;
            }
            const concurrentDomainMutation = domainRevisionBeforeCommit !== null
                && typeof instance.getPersistenceDomainRevision === 'function'
                && instance.getPersistenceDomainRevision('tile_resource') !== domainRevisionBeforeCommit;
            const results = [];
            for (const gain of plannedGains) {
                const nextValue = instance.addTileResource(gain.resourceKey, player.x, player.y, gain.amount);
                if (nextValue === null) {
                    throw new Error(`tile_resource_runtime_apply_failed:${gain.resourceKey}:${tileIndex}`);
                }
                results.push({ resourceKey: gain.resourceKey, amount: gain.amount, nextValue });
            }
            this.playerRuntimeService.replaceInventoryItems(playerId, committedInventoryItems);
            if (!concurrentDomainMutation && results.every((entry, index) => entry.nextValue === plannedGains[index]?.nextValue)) {
                const committedSnapshot = instance.capturePersistenceDomainFlushSnapshot(['tile_resource']);
                instance.markPersistenceDomainsPersisted?.(['tile_resource'], committedSnapshot);
            }
            deps.refreshQuestStates(playerId);
            queueTileResourceUseNotice(deps, playerId, item, count, results);
        }
        finally {
            releaseHold();
        }
    }

    async syncCurrentPlayerPresence(playerId) {
        const persistence = this.playerRuntimeService?.playerDomainPersistenceService;
        if (!persistence?.isEnabled?.()) {
            return false;
        }
        const persistedPresence = typeof persistence.loadPlayerPresence === 'function'
            ? await persistence.loadPlayerPresence(playerId)
            : null;
        let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        const persistedSessionEpoch = Number.isFinite(Number(persistedPresence?.sessionEpoch))
            ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
            : 0;
        const persistedRuntimeOwnerId = typeof persistedPresence?.runtimeOwnerId === 'string'
            ? persistedPresence.runtimeOwnerId.trim()
            : '';
        const runtimeSessionEpoch = Math.max(0, Math.trunc(Number(presence.sessionEpoch ?? 0)));
        const runtimeOwnerId = typeof presence.runtimeOwnerId === 'string' ? presence.runtimeOwnerId.trim() : '';
        if (
            typeof this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast === 'function'
            && persistedSessionEpoch > 0
            && (
                runtimeSessionEpoch <= persistedSessionEpoch
                || (persistedRuntimeOwnerId && persistedRuntimeOwnerId !== runtimeOwnerId)
            )
        ) {
            this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
            presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        }
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        await persistence.savePlayerPresence(playerId, {
            ...presence,
            versionSeed: nextPlayerPersistenceVersion(),
        });
        return true;
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

function isTileResourceVolatileFallbackAllowed() {
    const runtimeEnv = [process.env.SERVER_RUNTIME_ENV, process.env.APP_ENV, process.env.NODE_ENV]
        .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
        .find(Boolean) ?? '';
    return runtimeEnv === 'test'
        || runtimeEnv === 'verify'
        || runtimeEnv === 'smoke'
        || runtimeEnv === 'development'
        || runtimeEnv === 'dev';
}

function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function buildInventoryAfterConsume(items, itemInstanceId, count) {
    const normalizedItemInstanceId = normalizeInventoryItemInstanceId(itemInstanceId);
    const normalizedCount = Math.max(1, Math.trunc(Number(count) || 0));
    const nextItems = Array.isArray(items) ? items.map((entry) => ({ ...entry })) : [];
    const index = nextItems.findIndex((entry) => normalizeInventoryItemInstanceId(entry?.itemInstanceId) === normalizedItemInstanceId);
    if (index < 0) {
        throw new NotFoundException(`背包物品不存在：${normalizedItemInstanceId || 'unknown'}`);
    }
    const available = Math.max(1, Math.trunc(Number(nextItems[index]?.count ?? 1)));
    if (available < normalizedCount) {
        throw new BadRequestException('物品数量不足');
    }
    if (available === normalizedCount) {
        nextItems.splice(index, 1);
    }
    else {
        nextItems[index] = { ...nextItems[index], count: available - normalizedCount };
    }
    return nextItems;
}

function planTileResourceGains(instance, resourceGains, count, x, y, tileIndex) {
    const amountByResourceKey = new Map();
    for (const entry of resourceGains) {
        const resourceKey = typeof entry?.resourceKey === 'string' ? entry.resourceKey.trim() : '';
        const amount = Number(entry?.amount) * count;
        if (!resourceKey || !Number.isFinite(amount) || amount <= 0) {
            continue;
        }
        amountByResourceKey.set(resourceKey, (amountByResourceKey.get(resourceKey) ?? 0) + amount);
    }
    const planned = [];
    for (const [resourceKey, amount] of amountByResourceKey.entries()) {
        const currentValue = Number(instance.getTileResource(resourceKey, x, y));
        if (!Number.isFinite(currentValue)) {
            throw new BadRequestException(`无法读取当前地块资源 ${resourceKey}`);
        }
        planned.push({
            resourceKey,
            tileIndex,
            amount,
            nextValue: Math.max(0, currentValue + amount),
        });
    }
    planned.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
    if (planned.length <= 0) {
        throw new BadRequestException('地块资源效果无效');
    }
    return planned;
}

function buildDurableTileResourceSourceMutation(input) {
    const upsertByKey = new Map();
    for (const entry of Array.isArray(input.pendingDelta?.upserts) ? input.pendingDelta.upserts : []) {
        const resourceKey = typeof entry?.resourceKey === 'string' ? entry.resourceKey.trim() : '';
        const tileIndex = Math.trunc(Number(entry?.tileIndex));
        const value = Number(entry?.value);
        if (resourceKey && Number.isSafeInteger(tileIndex) && tileIndex >= 0 && Number.isFinite(value) && value >= 0) {
            upsertByKey.set(`${resourceKey}\u0000${tileIndex}`, { resourceKey, tileIndex, value });
        }
    }
    for (const gain of input.plannedGains) {
        upsertByKey.set(`${gain.resourceKey}\u0000${gain.tileIndex}`, {
            resourceKey: gain.resourceKey,
            tileIndex: gain.tileIndex,
            value: gain.nextValue,
        });
    }
    const deletes = (Array.isArray(input.pendingDelta?.deletes) ? input.pendingDelta.deletes : [])
        .map((entry) => ({
            resourceKey: typeof entry?.resourceKey === 'string' ? entry.resourceKey.trim() : '',
            tileIndex: Math.trunc(Number(entry?.tileIndex)),
        }))
        .filter((entry) => entry.resourceKey
            && Number.isSafeInteger(entry.tileIndex)
            && entry.tileIndex >= 0
            && !upsertByKey.has(`${entry.resourceKey}\u0000${entry.tileIndex}`));
    return {
        kind: 'tile_resource',
        instanceId: input.instanceId,
        ownershipEpoch: input.ownershipEpoch,
        flushLedgerVersion: input.flushLedgerVersion,
        upserts: Array.from(upsertByKey.values()),
        deletes,
        gains: input.plannedGains.map((entry) => ({ ...entry })),
    };
}

function buildTileResourceUseNotice(item, count, results) {
    const itemName = getItemDisplayName(item);
    if (results.length === 1) {
        const result = results[0];
        const resourceKind = resolveTileResourceNoticeKind(result.resourceKey);
        return buildStructuredNotice(
            'success',
            count > 1
                ? `notice.item.tile-${resourceKind.keySegment}-used-batch`
                : `notice.item.tile-${resourceKind.keySegment}-used`,
            `使用 ${itemName}${count > 1 ? ` x${count}` : ''}，当前地块${resourceKind.fallbackLabel}提升至 ${result.nextValue}`,
            {
                vars: { itemName, count, nextValue: result.nextValue },
                pills: [{ key: 'itemName', style: 'target' }],
            },
        );
    }
    const summary = results
        .map((entry) => `${resolveTileResourceNoticeKind(entry.resourceKey).fallbackLabel} ${entry.nextValue}`)
        .join('，');
    return buildStructuredNotice(
        'success',
        count > 1 ? 'notice.item.tile-resources-used-batch' : 'notice.item.tile-resources-used',
        `使用 ${itemName}${count > 1 ? ` x${count}` : ''}，当前地块资源提升：${summary}`,
        {
            vars: { itemName, count, resourceCount: results.length },
            pills: [{ key: 'itemName', style: 'target' }],
        },
    );
}

function queueTileResourceUseNotice(deps, playerId, item, count, results) {
    const notice = buildTileResourceUseNotice(item, count, results);
    deps.queuePlayerNotice(
        playerId,
        notice.text,
        notice.kind,
        undefined,
        undefined,
        notice.structured,
    );
}

function resolveTileResourceNoticeKind(resourceKey) {
    if (resourceKey === REFINED_SHA_RESOURCE_KEY) {
        return { keySegment: 'sha', fallbackLabel: '煞气' };
    }
    if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
        return { keySegment: 'aura', fallbackLabel: '灵气' };
    }
    return { keySegment: 'resource', fallbackLabel: '资源' };
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
