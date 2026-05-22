/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 强化系统写路径服务
 * 处理装备强化启动、材料消耗、成功/失败结算和面板刷新
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';

/** 强化写路径：启动强化、材料校验、结果结算和面板刷新 */
@Injectable()
export class WorldRuntimeEnhancementService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;    
    /**
 * worldRuntimeCraftMutationService：世界运行态炼制Mutation服务引用。
 */

    worldRuntimeCraftMutationService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeCraftMutationService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(CraftPanelRuntimeService) craftPanelRuntimeService: any,
        @Inject(WorldRuntimeCraftMutationService) worldRuntimeCraftMutationService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
    }    
    /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

    async dispatchStartEnhancement(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        const result = this.craftPanelRuntimeService.startTechniqueActivity(player, 'enhancement', payload, deps);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '启动强化失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
    }    
    /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

    async dispatchCancelEnhancement(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        const result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, 'enhancement', deps);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '取消强化失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
    }    
    /**
 * tickEnhancement：执行tick强化相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tick强化相关状态。
 */

    async tickEnhancement(playerId, player, deps) {
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, 'enhancement', deps), 'enhancement', deps);
    }
};
