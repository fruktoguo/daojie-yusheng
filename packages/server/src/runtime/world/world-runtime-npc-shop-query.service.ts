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
exports.WorldRuntimeNpcShopQueryService = void 0;

const common_1 = require("@nestjs/common");

const content_template_repository_1 = require("../../content/content-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const NPC_SHOP_CURRENCY_ITEM_ID = 'spirit_stone';

/** NPC 商店只读查询服务：承接商店封装与购买前校验。 */
let WorldRuntimeNpcShopQueryService = class WorldRuntimeNpcShopQueryService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * getCurrencyItemId：读取Currency道具ID。
 * @returns 无返回值，完成Currency道具ID的读取/组装。
 */

    getCurrencyItemId() {
        return NPC_SHOP_CURRENCY_ITEM_ID;
    }    
    /**
 * getCurrencyItemName：读取Currency道具名称。
 * @returns 无返回值，完成Currency道具名称的读取/组装。
 */

    getCurrencyItemName() {
        return this.contentTemplateRepository.createItem(NPC_SHOP_CURRENCY_ITEM_ID, 1)?.name ?? NPC_SHOP_CURRENCY_ITEM_ID;
    }    
    /**
 * buildNpcShopView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCShop视图相关状态。
 */

    buildNpcShopView(playerId, npcId, deps) {
        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        return this.createEnvelopeForNpc(npc);
    }    
    /**
 * validateNpcShopPurchase：判断NPCShopPurchase是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成NPCShopPurchase的条件判断。
 */

    validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps) {
        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        return this.validatePurchaseForNpc(playerId, npc, itemId, quantity);
    }    
    /**
 * createEnvelopeForNpc：构建并返回目标对象。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新EnvelopeForNPC相关状态。
 */

    createEnvelopeForNpc(npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!npc.hasShop) {
            return {
                npcId: npc.npcId,
                shop: null,
                error: '对方现在没有经营商店',
            }; 
        }

        const shop = this.buildShopState(npc);
        if (!shop) {
            return {
                npcId: npc.npcId,
                shop: null,
                error: '商铺货架还没有可售物品',
            };
        }
        return {
            npcId: npc.npcId,
            shop,
        };
    }    
    /**
 * buildShopState：构建并返回目标对象。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新Shop状态相关状态。
 */

    buildShopState(npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const items = npc.shopItems
            .map((entry) => {

            const item = this.contentTemplateRepository.createItem(entry.itemId, 1);
            if (!item) {
                return null;
            }
            return {
                itemId: entry.itemId,
                item,
                unitPrice: entry.price,
            };
        })
            .filter((entry) => Boolean(entry));
        if (items.length === 0) {
            return null;
        }
        return {
            npcId: npc.npcId,
            npcName: npc.name,
            dialogue: npc.dialogue,
            currencyItemId: NPC_SHOP_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            items,
        };
    }    
    /**
 * validatePurchaseForNpc：判断PurchaseForNPC是否满足条件。
 * @param playerId 玩家 ID。
 * @param npc 参数说明。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 无返回值，完成PurchaseForNPC的条件判断。
 */

    validatePurchaseForNpc(playerId, npc, itemId, quantity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!npc.hasShop) {
            throw new common_1.BadRequestException('对方现在没有经营商店');
        }

        const shopItem = npc.shopItems.find((entry) => entry.itemId === itemId);
        if (!shopItem) {
            throw new common_1.NotFoundException('这位商人没有出售该物品');
        }

        const totalCost = quantity * shopItem.price;
        if (!Number.isSafeInteger(totalCost) || totalCost <= 0) {
            throw new common_1.BadRequestException('购买总价过大，暂时无法结算');
        }

        const item = this.contentTemplateRepository.createItem(itemId, quantity);
        if (!item) {
            throw new common_1.NotFoundException('商品配置异常，暂时无法购买');
        }
        if (!this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            throw new common_1.BadRequestException('背包空间不足，无法购买');
        }
        if (this.playerRuntimeService.getInventoryCountByItemId(playerId, NPC_SHOP_CURRENCY_ITEM_ID) < totalCost) {
            throw new common_1.BadRequestException(`${this.getCurrencyItemName()}不足`);
        }
        return {
            item,
            totalCost,
        };
    }
};
exports.WorldRuntimeNpcShopQueryService = WorldRuntimeNpcShopQueryService;
exports.WorldRuntimeNpcShopQueryService = WorldRuntimeNpcShopQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeNpcShopQueryService);

export { WorldRuntimeNpcShopQueryService };
