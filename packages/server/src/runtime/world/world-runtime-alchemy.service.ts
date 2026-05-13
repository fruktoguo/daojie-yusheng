/**
 * 炼丹系统写路径服务
 * 处理炼丹启动、预设管理、材料消耗和面板状态刷新
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';

/** 炼丹写路径：启动炼丹、预设管理、材料校验和面板刷新 */
@Injectable()
export class WorldRuntimeAlchemyService {
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
 * interruptAlchemyForReason：执行interrupt炼丹ForReason相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新interrupt炼丹ForReason相关状态。
 */

    interruptAlchemyForReason(playerId, player, reason, deps) {
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptTechniqueActivity(player, 'alchemy', reason, deps), 'alchemy', deps);
    }    
    /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

    async dispatchStartAlchemy(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const activityKind = resolveAlchemyLikeActivityKind(payload);
        const activityLabel = activityKind === 'forging' ? '炼器' : '炼丹';
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        const result = this.craftPanelRuntimeService.startTechniqueActivity(player, activityKind, payload, deps);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? `启动${activityLabel}失败`);
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, activityKind, deps);
    }    
    /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

  async dispatchCancelAlchemy(playerId, deps, activityKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const normalizedActivityKind = activityKind === 'forging' ? 'forging' : 'alchemy';
        const activityLabel = normalizedActivityKind === 'forging' ? '炼器' : '炼丹';
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        const result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, normalizedActivityKind, deps);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? `取消${activityLabel}失败`);
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, normalizedActivityKind, deps);
    }    
    /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

    dispatchSaveAlchemyPreset(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.saveAlchemyPreset(player, payload);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '保存炼制预设失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'alchemy', deps);
    }    
    /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.deleteAlchemyPreset(player, presetId);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '删除炼制预设失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'alchemy', deps);
    }    
    /**
 * tickAlchemy：执行tick炼丹相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tick炼丹相关状态。
 */

    async tickAlchemy(playerId, player, deps, activityKind = undefined) {
        const normalizedActivityKind = normalizeAlchemyLikeActivityKind(activityKind ?? resolveActiveAlchemyLikeActivityKind(player));
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, normalizedActivityKind, deps), normalizedActivityKind, deps);
    }
};

function resolveAlchemyLikeActivityKind(payload) {
    return payload?.kind === 'forging' ? 'forging' : 'alchemy';
}

function normalizeAlchemyLikeActivityKind(value) {
    return value === 'forging' ? 'forging' : 'alchemy';
}

function resolveActiveAlchemyLikeActivityKind(player) {
    return player?.forgingJob ? 'forging' : player?.alchemyJob?.jobType === 'forging' ? 'forging' : 'alchemy';
}
