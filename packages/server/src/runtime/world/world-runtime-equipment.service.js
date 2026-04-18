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
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    dispatchEquipItem(playerId, slotIndex, deps) {
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
        deps.worldRuntimeCraftMutationService.emitCraftPanelUpdate(playerId, 'alchemy', deps);
        deps.worldRuntimeCraftMutationService.emitCraftPanelUpdate(playerId, 'enhancement', deps);
    }
    dispatchUnequipItem(playerId, slot, deps) {
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
        deps.worldRuntimeCraftMutationService.emitCraftPanelUpdate(playerId, 'alchemy', deps);
        deps.worldRuntimeCraftMutationService.emitCraftPanelUpdate(playerId, 'enhancement', deps);
    }
};
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService;
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeEquipmentService);
