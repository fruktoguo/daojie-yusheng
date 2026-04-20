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
exports.WorldRuntimeItemGroundService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime item ground orchestration：承接丢弃/拾取地面与容器物品链路。 */
let WorldRuntimeItemGroundService = class WorldRuntimeItemGroundService {
/**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * dispatchDropItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDropItem(playerId, slotIndex, count, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * dispatchTakeGround：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        deps.worldRuntimeLootContainerService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }    
    /**
 * dispatchTakeGroundAll：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchTakeGroundAll(playerId, sourceId, deps) {
        deps.worldRuntimeLootContainerService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }    
    /**
 * spawnGroundItem：执行核心业务逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 函数返回值。
 */

    spawnGroundItem(instance, x, y, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

export { WorldRuntimeItemGroundService };
