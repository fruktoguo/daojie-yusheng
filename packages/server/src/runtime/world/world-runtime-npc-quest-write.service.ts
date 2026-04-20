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
exports.WorldRuntimeNpcQuestWriteService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { cloneQuestState, buildNpcQuestProgressText } = world_runtime_normalization_helpers_1;

/** NPC quest 写路径叶子服务：承接交互推进、接取与提交三个直接写入动作。 */
let WorldRuntimeNpcQuestWriteService = class WorldRuntimeNpcQuestWriteService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * dispatchInteractNpcQuest：判断InteractNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新InteractNPC任务相关状态。
 */

    dispatchInteractNpcQuest(playerId, npcId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'talk') {
                continue;
            }
            if (quest.targetNpcId !== npc.npcId) {
                continue;
            }
            if (quest.targetMapId && quest.targetMapId !== player.templateId) {
                continue;
            }
            if (quest.progress >= quest.required) {
                continue;
            }
            quest.progress = quest.required;
            changed = true;
            deps.queuePlayerNotice(playerId, quest.relayMessage?.trim()
                ? `你向 ${npc.name} 传达了口信：“${quest.relayMessage.trim()}”`
                : `你向 ${npc.name} 传达了来意。`, 'info');
        }
        if (changed) {
            deps.refreshQuestStates(playerId, true);
        }
    }    
    /**
 * dispatchAcceptNpcQuest：判断AcceptNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    dispatchAcceptNpcQuest(playerId, npcId, questId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        const questsView = deps.createNpcQuestsEnvelope(playerId, npcId).quests;
        const quest = questsView.find((entry) => entry.id === questId && entry.status === 'available');
        if (!quest) {
            throw new common_1.NotFoundException('当前无法接取该任务');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === questId && entry.status !== 'completed')) {
            throw new common_1.BadRequestException('该任务已经接取');
        }
        player.quests.quests.push(cloneQuestState(quest, 'active'));
        this.playerRuntimeService.markQuestStateDirty(playerId);
        deps.refreshQuestStates(playerId, true);
        deps.queuePlayerNotice(playerId, `${npc.name}：${quest.story ?? quest.desc}`, 'success');
    }    
    /**
 * dispatchSubmitNpcQuest：判断SubmitNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    dispatchSubmitNpcQuest(playerId, npcId, questId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const quest = player.quests.quests.find((entry) => entry.id === questId);
        if (!quest || quest.status !== 'ready') {
            throw new common_1.NotFoundException('该任务当前无法提交');
        }
        if (quest.submitNpcId !== npcId) {
            throw new common_1.BadRequestException('当前不是该任务的提交目标');
        }
        const rewards = deps.buildQuestRewardItems(quest);
        if (!deps.canReceiveRewardItems(playerId, rewards)) {
            throw new common_1.BadRequestException('背包空间不足，无法领取奖励');
        }
        if (quest.requiredItemId && (quest.requiredItemCount ?? 1) > 0) {
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, quest.requiredItemId, quest.requiredItemCount ?? 1);
        }
        for (const reward of rewards) {
            this.playerRuntimeService.receiveInventoryItem(playerId, reward);
        }
        quest.status = 'completed';
        this.playerRuntimeService.markQuestStateDirty(playerId);
        const nextQuest = deps.tryAcceptNextQuest(playerId, quest.nextQuestId);
        deps.refreshQuestStates(playerId, true);
        deps.queuePlayerNotice(playerId, `${npc.name}：做得不错，这是你的奖励 ${quest.rewardText || '。'}`, 'success');
        if (nextQuest) {
            deps.queuePlayerNotice(playerId, `新的任务《${nextQuest.title}》已自动接取`, 'info');
        }
    }    
    /**
 * enqueueNpcInteraction：处理NPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

    enqueueNpcInteraction(playerId, actionIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!actionId.startsWith('npc:')) {
            throw new common_1.BadRequestException('npc actionId is required');
        }
        const npcId = actionId.slice('npc:'.length).trim();
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        deps.enqueuePendingCommand(playerId, { kind: 'npcInteraction', npcId });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * enqueueLegacyNpcInteraction：处理LegacyNPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新LegacyNPCInteraction相关状态。
 */

    enqueueLegacyNpcInteraction(playerId, actionIdInput, deps) {
        return this.enqueueNpcInteraction(playerId, actionIdInput, deps);
    }    
    /**
 * enqueueAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!questId) {
            throw new common_1.BadRequestException('questId is required');
        }
        deps.enqueuePendingCommand(playerId, { kind: 'acceptNpcQuest', npcId, questId });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * enqueueSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!questId) {
            throw new common_1.BadRequestException('questId is required');
        }
        deps.enqueuePendingCommand(playerId, { kind: 'submitNpcQuest', npcId, questId });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * executeNpcQuestAction：执行executeNPC任务Action相关逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新executeNPC任务Action相关状态。
 */

    executeNpcQuestAction(playerId, npcId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedNpcId = typeof npcId === 'string' ? npcId.trim() : '';
        if (!normalizedNpcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        const questsView = deps.buildNpcQuestsView(playerId, normalizedNpcId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const readyQuest = questsView.quests.find((entry) => entry.status === 'ready' && entry.submitNpcId === normalizedNpcId);
        if (readyQuest) {
            deps.enqueuePendingCommand(playerId, {
                kind: 'submitNpcQuest',
                npcId: normalizedNpcId,
                questId: readyQuest.id,
            });
            return { kind: 'npcQuests', npcQuests: questsView };
        }
        const availableQuest = questsView.quests.find((entry) => entry.status === 'available');
        if (availableQuest) {
            deps.enqueuePendingCommand(playerId, {
                kind: 'acceptNpcQuest',
                npcId: normalizedNpcId,
                questId: availableQuest.id,
            });
            return { kind: 'npcQuests', npcQuests: questsView };
        }
        const talkQuest = questsView.quests.find((entry) => entry.status === 'active'
            && entry.objectiveType === 'talk'
            && entry.targetNpcId === normalizedNpcId
            && (!entry.targetMapId || entry.targetMapId === player.templateId));
        if (talkQuest) {
            deps.enqueuePendingCommand(playerId, {
                kind: 'interactNpcQuest',
                npcId: normalizedNpcId,
            });
        }
        return { kind: 'npcQuests', npcQuests: questsView };
    }    
    /**
 * dispatchNpcInteraction：判断NPCInteraction是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

    dispatchNpcInteraction(playerId, npcId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        deps.refreshQuestStates(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const readyQuest = player.quests.quests.find((entry) => (entry.status === 'ready' && entry.submitNpcId === npcId && (!entry.submitMapId || entry.submitMapId === player.templateId)));
        if (readyQuest) {
            this.dispatchSubmitNpcQuest(playerId, npcId, readyQuest.id, deps);
            return;
        }
        const talkQuest = player.quests.quests.find((entry) => (entry.status === 'active' && entry.objectiveType === 'talk' && entry.targetNpcId === npcId && (!entry.targetMapId || entry.targetMapId === player.templateId)));
        if (talkQuest) {
            this.dispatchInteractNpcQuest(playerId, npcId, deps);
            return;
        }
        const questViews = deps.createNpcQuestsEnvelope(playerId, npcId).quests;
        const availableQuest = questViews.find((entry) => entry.status === 'available');
        if (availableQuest) {
            this.dispatchAcceptNpcQuest(playerId, npcId, availableQuest.id, deps);
            return;
        }
        const activeQuest = questViews.find((entry) => entry.status === 'active');
        if (activeQuest) {
            deps.queuePlayerNotice(playerId, `${npc.name}：${buildNpcQuestProgressText(activeQuest)}`, 'info');
            return;
        }
        deps.queuePlayerNotice(playerId, `${npc.name}：${npc.dialogue}`, 'info');
    }
};
exports.WorldRuntimeNpcQuestWriteService = WorldRuntimeNpcQuestWriteService;
exports.WorldRuntimeNpcQuestWriteService = WorldRuntimeNpcQuestWriteService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeNpcQuestWriteService);

export { WorldRuntimeNpcQuestWriteService };
