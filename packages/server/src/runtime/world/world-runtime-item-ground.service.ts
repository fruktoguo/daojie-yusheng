/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime item ground orchestration：承接丢弃/拾取地面与容器物品链路。 */
@Injectable()
export class WorldRuntimeItemGroundService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * dispatchDropItem：判断Drop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    dispatchDropItem(playerId, itemInstanceId, count, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const item = this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, count);
        const displayItem = normalizeGroundNoticeItem(this.playerRuntimeService, item);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const pile = instance.dropGroundItem(player.x, player.y, displayItem);
        if (!pile) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            throw new BadRequestException(`无法在 ${player.x},${player.y} 掉落物品`);
        }
        deps.refreshQuestStates(playerId);
        const itemLabel = formatItemStackLabel(displayItem);
        const n = buildStructuredNotice('info', 'notice.item.dropped', `放下 ${itemLabel}`, {
            vars: { itemName: itemLabel },
            pills: [{ key: 'itemName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    async dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        return deps.worldRuntimeLootContainerService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }
    /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    async dispatchTakeGroundAll(playerId, sourceId, deps) {
        return deps.worldRuntimeLootContainerService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }
    /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

    spawnGroundItem(instance, x, y, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new BadRequestException(`无法在 ${x},${y} 生成掉落`);
        }
    }
};

function normalizeGroundNoticeItem(playerRuntimeService, item) {
    const normalized = playerRuntimeService?.contentTemplateRepository?.normalizeItem?.(item);
    return normalized && typeof normalized === 'object' ? normalized : item;
}
