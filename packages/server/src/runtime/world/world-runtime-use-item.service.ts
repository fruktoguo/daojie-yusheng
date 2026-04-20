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

const content_template_repository_1 = require("../../content/content-template.repository");
const map_template_repository_1 = require("../map/map-template.repository");
const player_runtime_service_1 = require("../player/player-runtime.service");

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

    dispatchUseItem(playerId, slotIndex, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
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
        if (item.tileAuraGainAmount) {
            this.handleTileAuraItem(playerId, slotIndex, item, deps);
            return;
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
                throw new common_1.BadRequestException(`Unknown map unlock target: ${mapId}`);
            }
        }
        if (mapUnlockIds.every((mapId) => this.playerRuntimeService.hasUnlockedMap(playerId, mapId))) {
            throw new common_1.BadRequestException('Map already unlocked');
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
 * handleTileAuraItem：处理TileAura道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TileAura道具相关状态。
 */

    handleTileAuraItem(playerId, slotIndex, item, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const nextAura = instance.addTileAura(player.x, player.y, item.tileAuraGainAmount);
        if (nextAura === null) {
            throw new common_1.BadRequestException(`Failed to add aura at ${player.x},${player.y}`);
        }
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `使用 ${item.name}，当前地块灵气提升至 ${nextAura}`, 'success');
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
