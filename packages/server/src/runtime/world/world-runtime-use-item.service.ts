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
exports.WorldRuntimeUseItemService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");

const content_template_repository_1 = require("../../content/content-template.repository");
const pvp_1 = require("../../constants/gameplay/pvp");
const map_template_repository_1 = require("../map/map-template.repository");
const player_runtime_service_1 = require("../player/player-runtime.service");

const DEFAULT_TILE_AURA_RESOURCE_KEY = (0, shared_1.buildQiResourceKey)(shared_1.DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** world-runtime use-item orchestration：承接物品使用结算分支。 */
let WorldRuntimeUseItemService = class WorldRuntimeUseItemService {
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
 * dispatchUseItem：判断Use道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    dispatchUseItem(playerId, slotIndex, deps, payload = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`背包槽位不存在：${slotIndex}`);
        }
        const count = normalizeUseItemCount(payload?.count, item);
        if (typeof item.formationDiskTier === 'string' && item.formationDiskTier.length > 0) {
            deps.queuePlayerNotice(playerId, '阵盘需要通过背包中的布阵页面使用。', 'info');
            return;
        }
        if (item.useBehavior === 'create_sect') {
            deps.worldRuntimeSectService.dispatchCreateSect(playerId, slotIndex, item, deps, payload);
            return;
        }
        const learnedTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
        const mapUnlockIds = Array.isArray(item.mapUnlockIds) && item.mapUnlockIds.length > 0
            ? item.mapUnlockIds
            : item.mapUnlockId
                ? [item.mapUnlockId]
                : [];
        if (mapUnlockIds.length > 0) {
            this.handleMapUnlockItem(playerId, slotIndex, item, mapUnlockIds, deps);
            return;
        }
        if (typeof item.respawnBindMapId === 'string' && item.respawnBindMapId.trim()) {
            this.handleRespawnBindItem(playerId, slotIndex, item, item.respawnBindMapId, deps);
            return;
        }
        if (this.resolveTileResourceGains(item).length > 0) {
            this.handleTileResourceItem(playerId, slotIndex, item, deps, count);
            return;
        }
        if (count > 1) {
            throw new common_1.BadRequestException('该物品不支持批量使用');
        }
        this.playerRuntimeService.useItem(playerId, slotIndex);
        if (learnedTechniqueId) {
            deps.advanceLearnTechniqueQuest(playerId, learnedTechniqueId);
        }
        else {
            deps.refreshQuestStates(playerId);
        }
        deps.queuePlayerNotice(playerId, `使用 ${item.name}`, 'success');
    }    
    /**
 * handleMapUnlockItem：处理地图Unlock道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param item 道具。
 * @param mapUnlockIds mapUnlock ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Unlock道具相关状态。
 */

    handleMapUnlockItem(playerId, slotIndex, item, mapUnlockIds, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const mapId of mapUnlockIds) {
            if (!this.templateRepository.has(mapId)) {
                throw new common_1.BadRequestException(`地图解锁目标不存在：${mapId}`);
            }
        }
        if (mapUnlockIds.every((mapId) => this.playerRuntimeService.hasUnlockedMap(playerId, mapId))) {
            throw new common_1.BadRequestException('地图已经解锁');
        }
        for (const mapId of mapUnlockIds) {
            if (!this.playerRuntimeService.hasUnlockedMap(playerId, mapId)) {
                this.playerRuntimeService.unlockMap(playerId, mapId);
            }
        }
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
        deps.refreshQuestStates(playerId);
        const targetLabel = mapUnlockIds.length === 1
            ? this.templateRepository.getOrThrow(mapUnlockIds[0]).name
            : `${item.name ?? '地图'}记载的区域`;
        deps.queuePlayerNotice(playerId, `已解锁地图：${targetLabel}`, 'success');
    }    
    /**
 * handleRespawnBindItem：处理复活点绑定道具。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param item 道具。
 * @param mapId 地图 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新复活绑定相关状态。
 */

    handleRespawnBindItem(playerId, slotIndex, item, mapId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
        if (!normalizedMapId || !this.templateRepository.has(normalizedMapId)) {
            throw new common_1.BadRequestException(`复活绑定目标不存在：${normalizedMapId || mapId}`);
        }
        const changed = this.playerRuntimeService.bindRespawnPoint(playerId, normalizedMapId);
        if (!changed) {
            throw new common_1.BadRequestException('已经绑定该复活点');
        }
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
        deps.refreshQuestStates(playerId);
        const targetLabel = this.templateRepository.getOrThrow(normalizedMapId).name;
        deps.queuePlayerNotice(playerId, `复活点与遁返落点已绑定：${targetLabel}`, 'success');
    }
    /**
 * handleTileResourceItem：处理Tile资源道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Tile资源道具相关状态。
 */

    handleTileResourceItem(playerId, slotIndex, item, deps, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const resourceGains = this.resolveTileResourceGains(item);
        const normalizedCount = normalizeUseItemCount(count, item);
        if (resourceGains.length <= 0) {
            throw new common_1.BadRequestException(`无法解析物品 ${item.itemId} 的地块资源效果`);
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const results = [];
        for (const entry of resourceGains) {
            const totalGain = entry.amount * normalizedCount;
            const nextValue = instance.addTileResource(entry.resourceKey, player.x, player.y, totalGain);
            if (nextValue === null) {
                throw new common_1.BadRequestException(`无法在 ${player.x},${player.y} 增加地块资源 ${entry.resourceKey}`);
            }
            results.push({ ...entry, amount: totalGain, nextValue });
        }
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, normalizedCount);
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
exports.WorldRuntimeUseItemService = WorldRuntimeUseItemService;
exports.WorldRuntimeUseItemService = WorldRuntimeUseItemService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeUseItemService);

export { WorldRuntimeUseItemService };

function normalizeUseItemCount(input, item) {
    const count = input === undefined || input === null
        ? 1
        : Math.trunc(Number(input));
    if (!Number.isFinite(count) || count <= 0) {
        throw new common_1.BadRequestException('使用数量无效');
    }
    if (count > 1 && item.allowBatchUse !== true) {
        throw new common_1.BadRequestException('该物品不支持批量使用');
    }
    const available = Math.trunc(Number(item.count ?? 1));
    if (Number.isFinite(available) && available > 0 && count > available) {
        throw new common_1.BadRequestException('物品数量不足');
    }
    return count;
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
    if (resourceKey === pvp_1.REFINED_SHA_RESOURCE_KEY) {
        return '煞气';
    }
    if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
        return '灵气';
    }
    return '资源';
}
