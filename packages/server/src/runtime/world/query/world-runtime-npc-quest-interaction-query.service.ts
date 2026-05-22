/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable } from '@nestjs/common';
import { WorldRuntimeQuestQueryService } from './world-runtime-quest-query.service';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';

const { chebyshevDistance } = world_runtime_path_planning_helpers_1;

/** NPC 任务交互查询服务：承接 quest marker 与 npc_quests 动作构造。 */
@Injectable()
export class WorldRuntimeNpcQuestInteractionQueryService {
/**
 * worldRuntimeQuestQueryService：世界运行态任务Query服务引用。
 */

    worldRuntimeQuestQueryService;
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeQuestQueryService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeQuestQueryService: WorldRuntimeQuestQueryService, playerRuntimeService: PlayerRuntimeService) {
        this.worldRuntimeQuestQueryService = worldRuntimeQuestQueryService;
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * resolveNpcQuestMarker：规范化或转换NPC任务Marker。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPC任务Marker相关状态。
 */

    resolveNpcQuestMarker(playerId, npcId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return undefined;
        }

        const currentMapId = player.templateId;
        for (const quest of player.quests.quests) {
            if (quest.status === 'ready' && quest.submitNpcId === npcId && quest.submitMapId === currentMapId) {
                return { line: quest.line, state: 'ready' };
            }
        }
        for (const quest of player.quests.quests) {
            if (quest.status === 'active'
                && ((quest.objectiveType === 'talk' && quest.targetNpcId === npcId && (!quest.targetMapId || quest.targetMapId === currentMapId))
                    || quest.giverId === npcId)) {
                return { line: quest.line, state: 'active' };
            }
        }
        const npc = deps.getNpcForPlayerMap(playerId, npcId);
        if (!npc) {
            return undefined;
        }
        if (typeof this.worldRuntimeQuestQueryService.resolveAvailableNpcQuestMarkerForPlayer === 'function') {
            return this.worldRuntimeQuestQueryService.resolveAvailableNpcQuestMarkerForPlayer(player, npc);
        }
        return this.worldRuntimeQuestQueryService.resolveAvailableNpcQuestMarker(playerId, npc);
    }
    /**
 * buildNpcQuestContextAction：构建并返回目标对象。
 * @param view 参数说明。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新NPC任务上下文Action相关状态。
 */

    buildNpcQuestContextAction(view, npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!npc.questMarker || chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) > 1) {
            return null;
        }
        return {
            id: `npc_quests:${npc.npcId}`,
            name: npc.questMarker.state === 'ready' ? `交付任务：${npc.name}` : `任务：${npc.name}`,
            type: 'quest',
            desc: npc.questMarker.state === 'ready'
                ? `向 ${npc.name} 提交当前可完成的任务。`
                : `查看 ${npc.name} 相关的任务。`,
            cooldownLeft: 0,
        };
    }
};
