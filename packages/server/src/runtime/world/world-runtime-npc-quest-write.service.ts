/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * NPC 任务写路径服务
 * 处理任务交互推进、接取、提交三个直接写入动作
 */
import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { cloneQuestState, buildNpcQuestProgressText, normalizeQuestLine } = world_runtime_normalization_helpers_1;

function hasIncompleteQuestInLine(playerQuests, line, exceptQuestId = '') {
    for (const quest of Array.isArray(playerQuests) ? playerQuests : []) {
        if (!quest || quest.id === exceptQuestId || quest.status === 'completed') {
            continue;
        }
        if (normalizeQuestLine(quest.line) === line) {
            return true;
        }
    }
    return false;
}

function materializeQuestForNpcWrite(deps, playerId, quest) {
    return typeof deps?.worldRuntimeQuestQueryService?.materializeQuestView === 'function'
        ? deps.worldRuntimeQuestQueryService.materializeQuestView(playerId, quest)
        : quest;
}

/** NPC quest 写路径叶子服务：承接交互推进、接取与提交三个直接写入动作。 */
@Injectable()
export class WorldRuntimeNpcQuestWriteService {
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
            const questView = materializeQuestForNpcWrite(deps, playerId, quest);
            const relayText = questView.relayMessage?.trim()
                ? `你向 ${npc.name} 传达了口信：“${questView.relayMessage.trim()}”`
                : `你向 ${npc.name} 传达了来意。`;
            const nRelay = buildStructuredNotice('info', 'notice.quest.npc-relay', relayText, { vars: { npcName: npc.name, message: questView.relayMessage?.trim() || '' }, pills: [{ key: 'npcName', style: 'target' }] });
            deps.queuePlayerNotice(playerId, nRelay.text, nRelay.kind, undefined, undefined, nRelay.structured);
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
            throw new NotFoundException('当前无法接取该任务');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === questId && entry.status !== 'completed')) {
            throw new BadRequestException('该任务已经接取');
        }
        const questView = materializeQuestForNpcWrite(deps, playerId, quest);
        if (typeof deps?.worldRuntimeQuestQueryService?.isQuestUnlockedForPlayer === 'function'
            && !deps.worldRuntimeQuestQueryService.isQuestUnlockedForPlayer(player.quests.quests, questView.id)) {
            throw new BadRequestException('前置任务尚未完成');
        }
        if (normalizeQuestLine(questView.line) === 'main' && hasIncompleteQuestInLine(player.quests.quests, 'main', questId)) {
            throw new BadRequestException('当前已有进行中的主线任务');
        }
        player.quests.quests.push(cloneQuestState(questView, 'active'));
        this.playerRuntimeService.markQuestStateDirty(playerId);
        deps.refreshQuestStates(playerId, true);
        const nStory = buildStructuredNotice('success', 'notice.quest.npc-story', `${npc.name}：${questView.story ?? questView.desc}`, { vars: { npcName: npc.name, story: questView.story ?? questView.desc }, pills: [{ key: 'npcName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, nStory.text, nStory.kind, undefined, undefined, nStory.structured);
    }    
    /**
 * dispatchSubmitNpcQuest：判断SubmitNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    async dispatchSubmitNpcQuest(playerId, npcId, questId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        deps.refreshQuestStates(playerId);
        const quest = player.quests.quests.find((entry) => entry.id === questId);
        if (!quest || quest.status !== 'ready') {
            throw new NotFoundException('该任务当前无法提交');
        }
        if (quest.submitNpcId !== npcId) {
            throw new BadRequestException('当前不是该任务的提交目标');
        }
        const questView = materializeQuestForNpcWrite(deps, playerId, quest);
        const rewards = deps.buildQuestRewardItems(questView);
        const walletRewards = rewards.filter((reward) => isWalletRewardItemId(reward.itemId));
        const inventoryRewards = rewards.filter((reward) => !isWalletRewardItemId(reward.itemId));
        const requiredItemId = typeof quest.requiredItemId === 'string' ? quest.requiredItemId.trim() : '';
        const requiredItemCount = Math.max(0, Math.trunc(Number(quest.requiredItemCount ?? 0)));
        const nextInventoryItems = buildNextQuestInventorySnapshots(player.inventory.items, player.inventory.capacity, requiredItemId, requiredItemCount, inventoryRewards);
        if (nextInventoryItems == null) {
            throw new BadRequestException('背包空间不足，无法领取奖励');
        }
        if (requiredItemId && requiredItemCount > 0) {
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, requiredItemId, requiredItemCount);
        }
        for (const reward of inventoryRewards) {
            this.playerRuntimeService.receiveInventoryItem(playerId, reward);
        }
        for (const reward of walletRewards) {
            this.playerRuntimeService.creditWallet(playerId, reward.itemId, reward.count);
        }
        quest.status = 'completed';
        this.playerRuntimeService.markQuestStateDirty(playerId);
        const nextQuest = deps.tryAcceptNextQuest(playerId, questView.nextQuestId ?? quest.nextQuestId);
        deps.refreshQuestStates(playerId, true);
        const nReward = buildStructuredNotice('success', 'notice.quest.reward', `${npc.name}：做得不错，这是你的奖励 ${questView.rewardText || '。'}`, { vars: { npcName: npc.name, rewardText: questView.rewardText || '。' }, pills: [{ key: 'npcName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, nReward.text, nReward.kind, undefined, undefined, nReward.structured);
        if (nextQuest) {
            const nextQuestView = materializeQuestForNpcWrite(deps, playerId, nextQuest);
            const nAutoAccept = buildStructuredNotice('info', 'notice.quest.auto-accept', `新的任务《${nextQuestView.title}》已自动接取`, { vars: { questTitle: nextQuestView.title }, pills: [{ key: 'questTitle', style: 'target' }] });
            deps.queuePlayerNotice(playerId, nAutoAccept.text, nAutoAccept.kind, undefined, undefined, nAutoAccept.structured);
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
            throw new BadRequestException('场景人物动作 ID 不能为空');
        }
        const npcId = actionId.slice('npc:'.length).trim();
        if (!npcId) {
            throw new BadRequestException('场景人物 ID 不能为空');
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
            throw new BadRequestException('场景人物 ID 不能为空');
        }
        if (!questId) {
            throw new BadRequestException('任务 ID 不能为空');
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
            throw new BadRequestException('场景人物 ID 不能为空');
        }
        if (!questId) {
            throw new BadRequestException('任务 ID 不能为空');
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
            throw new BadRequestException('场景人物 ID 不能为空');
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

    async dispatchNpcInteraction(playerId, npcId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        deps.refreshQuestStates(playerId);
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const readyQuest = player.quests.quests.find((entry) => (entry.status === 'ready' && entry.submitNpcId === npcId && (!entry.submitMapId || entry.submitMapId === player.templateId)));
        if (readyQuest) {
            await this.dispatchSubmitNpcQuest(playerId, npcId, readyQuest.id, deps);
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
            const nProgress = buildStructuredNotice('info', 'notice.quest.progress', `${npc.name}：${buildNpcQuestProgressText(activeQuest)}`, { vars: { npcName: npc.name, progressText: buildNpcQuestProgressText(activeQuest) }, pills: [{ key: 'npcName', style: 'target' }] });
            deps.queuePlayerNotice(playerId, nProgress.text, nProgress.kind, undefined, undefined, nProgress.structured);
            return;
        }
        const nDialogue = buildStructuredNotice('info', 'notice.quest.npc-dialogue', `${npc.name}：${npc.dialogue}`, { vars: { npcName: npc.name, dialogue: npc.dialogue }, pills: [{ key: 'npcName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, nDialogue.text, nDialogue.kind, undefined, undefined, nDialogue.structured);
    }
};

function isWalletRewardItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}
function buildNextQuestInventorySnapshots(currentItems, capacity, requiredItemId, requiredItemCount, grantedItems) {
    const snapshot = Array.isArray(currentItems)
        ? currentItems.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            count: Math.max(0, Math.trunc(Number(entry?.count ?? 0))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId && entry.count > 0)
        : [];
    const normalizedRequiredItemId = typeof requiredItemId === 'string' ? requiredItemId.trim() : '';
    let remainingToConsume = Math.max(0, Math.trunc(Number(requiredItemCount ?? 0)));
    if (normalizedRequiredItemId && remainingToConsume > 0) {
        for (let index = snapshot.length - 1; index >= 0 && remainingToConsume > 0; index -= 1) {
            const entry = snapshot[index];
            if (entry.itemId !== normalizedRequiredItemId) {
                continue;
            }
            const consumed = Math.min(entry.count, remainingToConsume);
            entry.count -= consumed;
            remainingToConsume -= consumed;
            entry.rawPayload = entry.count > 0
                ? { ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count }
                : null;
        }
        if (remainingToConsume > 0) {
            throw new BadRequestException('任务提交物品不足');
        }
    }
    const compacted = snapshot.filter((entry) => entry.count > 0);
    for (const reward of Array.isArray(grantedItems) ? grantedItems : []) {
        const itemId = typeof reward?.itemId === 'string' ? reward.itemId.trim() : '';
        const count = Math.max(1, Math.trunc(Number(reward?.count ?? 1)));
        if (!itemId || count <= 0) {
            continue;
        }
        const existing = compacted.find((entry) => entry.itemId === itemId);
        if (existing) {
            existing.count += count;
            existing.rawPayload = { ...(existing.rawPayload ?? existing), itemId, count: existing.count };
            continue;
        }
        if (compacted.length >= Math.max(0, Math.trunc(Number(capacity ?? 0)))) {
            return null;
        }
        compacted.push({
            itemId,
            count,
            rawPayload: reward ? { ...reward, itemId, count } : { itemId, count },
        });
    }
    return compacted;
}
