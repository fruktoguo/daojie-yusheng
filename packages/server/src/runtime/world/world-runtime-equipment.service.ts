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
exports.WorldRuntimeEquipmentService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");

/** world-runtime equipment orchestration：承接装备穿戴/卸下结算。 */
let WorldRuntimeEquipmentService = class WorldRuntimeEquipmentService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

    dispatchEquipItem(playerId, slotIndex, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = item.equipSlot
            ? deps.craftPanelRuntimeService.getLockedSlotReason(player, item.equipSlot)
            : null;
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        this.playerRuntimeService.equipItem(playerId, slotIndex);
        deps.queuePlayerNotice(playerId, `装备 ${item.name}`, 'success');
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }    
    /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

    dispatchUnequipItem(playerId, slot, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekEquippedItem(playerId, slot);
        if (!item) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} is empty`);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = deps.craftPanelRuntimeService.getLockedSlotReason(player, slot);
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        this.playerRuntimeService.unequipItem(playerId, slot);
        deps.queuePlayerNotice(playerId, `卸下 ${item.name}`, 'info');
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }
};
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService;
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeEquipmentService);

export { WorldRuntimeEquipmentService };
