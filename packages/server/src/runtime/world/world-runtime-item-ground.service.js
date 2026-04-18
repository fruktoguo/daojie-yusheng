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
exports.WorldRuntimeItemGroundService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime item ground orchestration：承接丢弃/拾取地面与容器物品链路。 */
let WorldRuntimeItemGroundService = class WorldRuntimeItemGroundService {
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    dispatchDropItem(playerId, slotIndex, count, deps) {
        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const item = this.playerRuntimeService.splitInventoryItem(playerId, slotIndex, count);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const pile = instance.dropGroundItem(player.x, player.y, item);
        if (!pile) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            throw new common_1.BadRequestException(`Failed to drop item at ${player.x},${player.y}`);
        }
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `放下 ${formatItemStackLabel(item)}`, 'info');
    }
    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        deps.worldRuntimeLootContainerService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }
    dispatchTakeGroundAll(playerId, sourceId, deps) {
        deps.worldRuntimeLootContainerService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }
    spawnGroundItem(instance, x, y, item) {
        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new common_1.BadRequestException(`Failed to spawn loot at ${x},${y}`);
        }
    }
};
exports.WorldRuntimeItemGroundService = WorldRuntimeItemGroundService;
exports.WorldRuntimeItemGroundService = WorldRuntimeItemGroundService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeItemGroundService);
