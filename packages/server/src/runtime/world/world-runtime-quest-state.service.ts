/**
 * 任务状态刷新与自动接续服务
 * 负责刷新玩家任务进度、自动接取后续任务、校验奖励背包空间
 */
import { Injectable } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeQuestQueryService } from './query/world-runtime-quest-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { cloneQuestState } = world_runtime_normalization_helpers_1;

/** world-runtime quest-state helpers：承接任务状态刷新、自动接续与奖励背包校验。 */
@Injectable()
export class WorldRuntimeQuestStateService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * worldRuntimeQuestQueryService：世界运行态任务Query服务引用。
 */

    worldRuntimeQuestQueryService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeQuestQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService: PlayerRuntimeService, worldRuntimeQuestQueryService: WorldRuntimeQuestQueryService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeQuestQueryService = worldRuntimeQuestQueryService;
    }
    /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @param forceDirty 参数说明。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

    refreshQuestStates(playerId, forceDirty = false) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        let changed = forceDirty;
        for (const quest of player.quests.quests) {
            const previousProgress = quest.progress;
            const previousStatus = quest.status;
            quest.progress = this.worldRuntimeQuestQueryService.resolveQuestProgress(playerId, quest);
            const nextStatus = quest.status === 'completed'
                ? 'completed'
                : this.worldRuntimeQuestQueryService.canQuestBecomeReady(playerId, quest)
                    ? 'ready'
                    : quest.status === 'ready'
                        ? 'active'
                        : quest.status;
            if (quest.progress !== previousProgress || nextStatus !== previousStatus) {
                quest.status = nextStatus;
                changed = true;
            }
        }
        if (changed) {
            this.playerRuntimeService.markQuestStateDirty(playerId);
        }
    }
    /**
 * tryAcceptNextQuest：执行tryAcceptNext任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param nextQuestId nextQuest ID。
 * @returns 无返回值，直接更新tryAcceptNext任务相关状态。
 */

    tryAcceptNextQuest(playerId, nextQuestId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!nextQuestId) {
            return null;
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === nextQuestId)) {
            return null;
        }
        const nextQuest = this.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, nextQuestId, 'active');
        player.quests.quests.push(nextQuest);
        this.playerRuntimeService.markQuestStateDirty(playerId);
        return cloneQuestState(nextQuest);
    }
    /**
 * advanceKillQuestProgress：执行advanceKill任务进度相关逻辑。
 * @param playerId 玩家 ID。
 * @param monsterId monster ID。
 * @param monsterName 参数说明。
 * @returns 无返回值，直接更新advanceKill任务进度相关状态。
 */

    advanceKillQuestProgress(playerId, monsterId, monsterName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'kill' || quest.targetMonsterId !== monsterId) {
                continue;
            }
            const nextProgress = Math.min(quest.required, quest.progress + 1);
            if (nextProgress !== quest.progress) {
                quest.progress = nextProgress;
                if (!quest.targetName || quest.targetName === quest.targetMonsterId) {
                    quest.targetName = monsterName;
                }
                changed = true;
            }
        }
        if (changed) {
            this.refreshQuestStates(playerId, true);
        }
    }
    /**
 * advanceLearnTechniqueQuest：执行advanceLearn功法任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新advanceLearn功法任务相关状态。
 */

    advanceLearnTechniqueQuest(playerId, techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'learn_technique' || quest.targetTechniqueId !== techniqueId) {
                continue;
            }
            if (quest.progress !== quest.required) {
                quest.progress = quest.required;
                changed = true;
            }
        }
        if (changed) {
            this.refreshQuestStates(playerId, true);
            return;
        }
        this.refreshQuestStates(playerId);
    }
    /**
 * canReceiveRewardItems：判断ReceiveReward道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param rewards 参数说明。
 * @returns 无返回值，完成ReceiveReward道具的条件判断。
 */

    canReceiveRewardItems(playerId, rewards) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        let freeSlots = Math.max(0, player.inventory.capacity - player.inventory.items.length);
        const seenNewItemIds = new Set();
        for (const reward of rewards) {
            if (isWalletRewardItemId(reward?.itemId)) {
                continue;
            }
            if (player.inventory.items.some((entry) => entry.itemId === reward.itemId) || seenNewItemIds.has(reward.itemId)) {
                continue;
            }
            if (freeSlots <= 0) {
                return false;
            }
            seenNewItemIds.add(reward.itemId);
            freeSlots -= 1;
        }
        return true;
    }
};
function isWalletRewardItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}
