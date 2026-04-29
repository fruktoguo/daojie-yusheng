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
exports.WorldRuntimeNpcQuestInteractionQueryService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_quest_query_service_1 = require("./world-runtime-quest-query.service");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");

const { chebyshevDistance } = world_runtime_path_planning_helpers_1;

/** NPC 任务交互查询服务：承接 quest marker 与 npc_quests 动作构造。 */
let WorldRuntimeNpcQuestInteractionQueryService = class WorldRuntimeNpcQuestInteractionQueryService {
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

    constructor(worldRuntimeQuestQueryService, playerRuntimeService) {
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
        const npcViews = this.worldRuntimeQuestQueryService.collectNpcQuestViews(playerId, npc);
        const available = npcViews.find((entry) => entry.status === 'available');
        return available ? { line: available.line, state: 'available' } : undefined;
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
exports.WorldRuntimeNpcQuestInteractionQueryService = WorldRuntimeNpcQuestInteractionQueryService;
exports.WorldRuntimeNpcQuestInteractionQueryService = WorldRuntimeNpcQuestInteractionQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_quest_query_service_1.WorldRuntimeQuestQueryService,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeNpcQuestInteractionQueryService);

export { WorldRuntimeNpcQuestInteractionQueryService };
