/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 任务运行时门面服务
 * 统一封装任务状态刷新、NPC 访问和自动接续的调用入口
 */
import { Injectable } from '@nestjs/common';
@Injectable()
export class WorldRuntimeQuestRuntimeFacadeService {
/**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
 */

    resolveAdjacentNpc(playerId, npcId, deps) {
        return deps.worldRuntimeNpcAccessService.resolveAdjacentNpc(playerId, npcId, deps);
    }
    /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @param forceDirty 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

    refreshQuestStates(playerId, forceDirty, deps) {
        deps.worldRuntimeQuestStateService.refreshQuestStates(playerId, forceDirty);
    }
    /**
 * tryAcceptNextQuest：执行tryAcceptNext任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param nextQuestId nextQuest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tryAcceptNext任务相关状态。
 */

    tryAcceptNextQuest(playerId, nextQuestId, deps) {
        return deps.worldRuntimeQuestStateService.tryAcceptNextQuest(playerId, nextQuestId);
    }
    /**
 * advanceKillQuestProgress：执行advanceKill任务进度相关逻辑。
 * @param playerId 玩家 ID。
 * @param monsterId monster ID。
 * @param monsterName 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advanceKill任务进度相关状态。
 */

    advanceKillQuestProgress(playerId, monsterId, monsterName, deps) {
        deps.worldRuntimeQuestStateService.advanceKillQuestProgress(playerId, monsterId, monsterName);
    }
    /**
 * advanceLearnTechniqueQuest：执行advanceLearn功法任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advanceLearn功法任务相关状态。
 */

    advanceLearnTechniqueQuest(playerId, techniqueId, deps) {
        deps.worldRuntimeQuestStateService.advanceLearnTechniqueQuest(playerId, techniqueId);
    }
    /**
 * canReceiveRewardItems：判断ReceiveReward道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param rewards 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成ReceiveReward道具的条件判断。
 */

    canReceiveRewardItems(playerId, rewards, deps) {
        return deps.worldRuntimeQuestStateService.canReceiveRewardItems(playerId, rewards);
    }
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

    getNpcForPlayerMap(playerId, npcId, deps) {
        return deps.worldRuntimeNpcAccessService.getNpcForPlayerMap(playerId, npcId, deps);
    }
};
