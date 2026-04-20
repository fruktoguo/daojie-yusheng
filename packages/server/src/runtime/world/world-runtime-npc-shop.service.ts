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
exports.WorldRuntimeNpcShopService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_npc_shop_query_service_1 = require("./world-runtime-npc-shop-query.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { normalizeShopQuantity, formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** NPC 商店写路径服务：承接购买入队与结算。 */
let WorldRuntimeNpcShopService = class WorldRuntimeNpcShopService {
/**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * worldRuntimeNpcShopQueryService：对象字段。
 */

    worldRuntimeNpcShopQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeNpcShopQueryService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService, worldRuntimeNpcShopQueryService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcShopQueryService = worldRuntimeNpcShopQueryService;
    }    
    /**
 * enqueueBuyNpcShopItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        const itemId = typeof itemIdInput === 'string' ? itemIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!itemId) {
            throw new common_1.BadRequestException('itemId is required');
        }
        const quantity = normalizeShopQuantity(quantityInput);
        deps.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        deps.enqueuePendingCommand(playerId, { kind: 'buyNpcShopItem', npcId, itemId, quantity });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * dispatchBuyNpcShopItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps) {
        const validated = deps.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        this.playerRuntimeService.consumeInventoryItemByItemId(playerId, this.worldRuntimeNpcShopQueryService.getCurrencyItemId(), validated.totalCost);
        this.playerRuntimeService.receiveInventoryItem(playerId, validated.item);
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, 'success');
    }
};
exports.WorldRuntimeNpcShopService = WorldRuntimeNpcShopService;
exports.WorldRuntimeNpcShopService = WorldRuntimeNpcShopService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_npc_shop_query_service_1.WorldRuntimeNpcShopQueryService])
], WorldRuntimeNpcShopService);

export { WorldRuntimeNpcShopService };
