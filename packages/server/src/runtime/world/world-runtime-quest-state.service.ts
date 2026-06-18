/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MailRuntimeService } from '../mail/mail-runtime.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeQuestQueryService } from './query/world-runtime-quest-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { cloneQuestState, normalizeQuestLine } = world_runtime_normalization_helpers_1;
const QUEST_REWARD_COMPENSATION_MAIL_TITLE = '任务奖励补发';
const QUEST_REWARD_COMPENSATION_MAIL_BODY = '检测到历史任务进度已推进，现补发未领取的任务奖励。';
const QUEST_REWARD_COMPENSATION_MAIL_SENDER = '司命台';

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

/** world-runtime quest-state helpers：承接任务状态刷新、自动接续与奖励背包校验。 */
@Injectable()
export class WorldRuntimeQuestStateService {
    logger = new Logger(WorldRuntimeQuestStateService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * worldRuntimeQuestQueryService：世界运行态任务Query服务引用。
 */

    worldRuntimeQuestQueryService;
    /**
 * mailRuntimeService：邮件运行时服务引用，用于历史任务链残留奖励补发。
 */

    mailRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeQuestQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        playerRuntimeService: PlayerRuntimeService,
        worldRuntimeQuestQueryService: WorldRuntimeQuestQueryService,
        @Optional() @Inject(MailRuntimeService) mailRuntimeService: any = null,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeQuestQueryService = worldRuntimeQuestQueryService;
        this.mailRuntimeService = mailRuntimeService;
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
        const compensationAttachmentsByItemId = new Map();
        const ownedQuestIds = new Set(player.quests.quests.map((entry) => entry.id));
        for (const quest of player.quests.quests) {
            const previousProgress = quest.progress;
            const previousStatus = quest.status;
            quest.progress = this.worldRuntimeQuestQueryService.resolveQuestProgress(playerId, quest);
            const nextQuestId = typeof this.worldRuntimeQuestQueryService.resolveQuestNextQuestId === 'function'
                ? this.worldRuntimeQuestQueryService.resolveQuestNextQuestId(quest)
                : typeof quest.nextQuestId === 'string'
                    ? quest.nextQuestId.trim()
                    : '';
            const completedByExistingNextQuest = quest.status !== 'completed' && nextQuestId && ownedQuestIds.has(nextQuestId);
            const nextStatus = quest.status === 'completed' || completedByExistingNextQuest
                ? 'completed'
                : this.worldRuntimeQuestQueryService.canQuestBecomeReady(playerId, quest)
                    ? 'ready'
                    : quest.status === 'ready'
                        ? 'active'
                        : quest.status;
            if (completedByExistingNextQuest && previousStatus !== 'completed') {
                this.collectQuestCompensationAttachments(quest, compensationAttachmentsByItemId);
            }
            if (quest.progress !== previousProgress || nextStatus !== previousStatus) {
                quest.status = nextStatus;
                changed = true;
            }
        }
        if (this.completeMissingQuestChainGaps(playerId, player, ownedQuestIds, compensationAttachmentsByItemId)) {
            changed = true;
        }
        if (changed) {
            this.playerRuntimeService.markQuestStateDirty(playerId);
        }
        this.deliverQuestCompensationMail(playerId, compensationAttachmentsByItemId);
    }
    completeMissingQuestChainGaps(playerId, player, ownedQuestIds, compensationAttachmentsByItemId) {
        if (typeof this.worldRuntimeQuestQueryService.resolveQuestChainGapToOwnedQuest !== 'function') {
            return false;
        }
        let changed = false;
        const completedGapQuestIds = new Set();
        for (const quest of player.quests.quests.slice()) {
            if (quest.status === 'completed') {
                continue;
            }
            const gap = this.worldRuntimeQuestQueryService.resolveQuestChainGapToOwnedQuest(quest, ownedQuestIds);
            if (!gap) {
                continue;
            }
            if (quest.status !== 'completed') {
                quest.status = 'completed';
                quest.progress = quest.required;
                this.collectQuestCompensationAttachments(quest, compensationAttachmentsByItemId);
                changed = true;
            }
            let insertIndex = player.quests.quests.findIndex((entry) => entry.id === gap.ownedQuestId);
            if (insertIndex < 0) {
                insertIndex = player.quests.quests.length;
            }
            for (const missingQuestId of gap.missingQuestIds) {
                if (ownedQuestIds.has(missingQuestId) || completedGapQuestIds.has(missingQuestId)) {
                    continue;
                }
                const missingQuest = this.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, missingQuestId, 'completed');
                missingQuest.progress = missingQuest.required;
                player.quests.quests.splice(insertIndex, 0, missingQuest);
                insertIndex += 1;
                ownedQuestIds.add(missingQuestId);
                completedGapQuestIds.add(missingQuestId);
                this.collectQuestCompensationAttachments(missingQuest, compensationAttachmentsByItemId);
                changed = true;
            }
        }
        return changed;
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
        if (typeof this.worldRuntimeQuestQueryService.isQuestUnlockedForPlayer === 'function'
            && !this.worldRuntimeQuestQueryService.isQuestUnlockedForPlayer(player.quests.quests, nextQuestId)) {
            return null;
        }
        const nextQuest = this.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, nextQuestId, 'active');
        if (normalizeQuestLine(nextQuest.line) === 'main' && hasIncompleteQuestInLine(player.quests.quests, 'main', nextQuest.id)) {
            return null;
        }
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
    /**
 * collectQuestCompensationAttachments：收集历史任务链残留自动完成时需要补发的任务奖励。
 * @param quest 任务状态。
 * @param attachmentsByItemId 附件汇总 Map。
 * @returns 无返回值，直接汇总附件。
 */

    collectQuestCompensationAttachments(quest, attachmentsByItemId) {
        const rewards = this.worldRuntimeQuestQueryService.buildQuestRewardItems(quest);
        for (const reward of Array.isArray(rewards) ? rewards : []) {
            const itemId = typeof reward?.itemId === 'string' ? reward.itemId.trim() : '';
            const count = Math.max(0, Math.trunc(Number(reward?.count ?? 0)));
            if (!itemId || count <= 0) {
                continue;
            }
            attachmentsByItemId.set(itemId, (attachmentsByItemId.get(itemId) ?? 0) + count);
        }
    }
    /**
 * deliverQuestCompensationMail：把一次刷新中收集到的历史任务奖励合并成一封补偿邮件。
 * @param playerId 玩家 ID。
 * @param attachmentsByItemId 附件汇总 Map。
 * @returns 无返回值，异步创建邮件。
 */

    deliverQuestCompensationMail(playerId, attachmentsByItemId) {
        if (attachmentsByItemId.size === 0 || typeof this.mailRuntimeService?.createDirectMail !== 'function') {
            return;
        }
        const attachments = Array.from(attachmentsByItemId.entries())
            .map(([itemId, count]) => ({ itemId, count }))
            .filter((entry) => entry.itemId && entry.count > 0);
        if (attachments.length === 0) {
            return;
        }
        void this.mailRuntimeService.createDirectMail(playerId, {
            senderLabel: QUEST_REWARD_COMPENSATION_MAIL_SENDER,
            fallbackTitle: QUEST_REWARD_COMPENSATION_MAIL_TITLE,
            fallbackBody: QUEST_REWARD_COMPENSATION_MAIL_BODY,
            attachments,
        }).catch((error) => {
            this.logger.warn(`任务奖励补发邮件发送失败：${error instanceof Error ? error.message : String(error)}`);
        });
    }
};
function isWalletRewardItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}
