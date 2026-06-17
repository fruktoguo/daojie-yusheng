/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PLAYER_REALM_ORDER } from '@mud/shared';
import { ContentTemplateRepository } from '../../../content/content-template.repository';
import { MapTemplateRepository } from '../../map/map-template.repository';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';

const {
    toQuestRewardItem,
    normalizeQuestLine,
    normalizeQuestObjectiveType,
    normalizeQuestRequired,
    normalizeQuestRealmStage,
    resolveQuestTargetLabel,
    buildQuestRewardText,
    cloneQuestState,
    compareQuestViews,
} = world_runtime_normalization_helpers_1;

function getRealmStageOrderIndex(stage) {
    return PLAYER_REALM_ORDER.indexOf(stage);
}

function isRealmStageReached(currentStage, targetStage, strict) {
    const currentIndex = getRealmStageOrderIndex(currentStage);
    const targetIndex = getRealmStageOrderIndex(targetStage);
    if (currentIndex < 0 || targetIndex < 0) {
        return false;
    }
    return strict ? currentIndex > targetIndex : currentIndex >= targetIndex;
}

function findPlayerQuestById(playerQuests, questId) {
    for (const quest of playerQuests) {
        if (quest?.id === questId) {
            return quest;
        }
    }
    return undefined;
}

function hasIncompletePreviousNpcQuest(playerQuests, npcQuests, beforeIndex) {
    for (let index = 0; index < beforeIndex; index += 1) {
        const previousId = typeof npcQuests[index]?.id === 'string' ? npcQuests[index].id.trim() : '';
        if (!previousId) {
            continue;
        }
        if (findPlayerQuestById(playerQuests, previousId)?.status !== 'completed') {
            return true;
        }
    }
    return false;
}

/** 任务只读查询服务：承接任务视图构造、奖励解析与导航目标解析。 */
@Injectable()
export class WorldRuntimeQuestQueryService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * templateRepository：template仓储引用。
 */

    templateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        contentTemplateRepository: ContentTemplateRepository,
        templateRepository: MapTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新任务列表视图相关状态。
 */

    buildQuestListView(playerId) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        return {
            r: player?.quests?.revision,
            full: 1,
            quests: this.playerRuntimeService.listQuests(playerId).map((quest) => this.materializeQuestView(playerId, quest)),
        };
    }    
    /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

    buildNpcQuestsView(playerId, npcId, deps) {
        const npc = deps.resolveAdjacentNpc(playerId, npcId);
        return this.createNpcQuestsEnvelope(playerId, npc);
    }    
    /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新NPC任务Envelope相关状态。
 */

    createNpcQuestsEnvelope(playerId, npc) {
        return {
            npcId: npc.npcId,
            npcName: npc.name,
            quests: this.collectNpcQuestViews(playerId, npc),
        };
    }    
    /**
 * collectNpcQuestViews：执行NPC任务视图相关逻辑。
 * @param playerId 玩家 ID。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

    collectNpcQuestViews(playerId, npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const byQuestId = new Map<string, any>(player.quests.quests.map((entry) => [entry.id, entry]));

        const result = [];
        for (let index = 0; index < npc.quests.length; index += 1) {
            const rawQuest = npc.quests[index];
            const existing = byQuestId.get(rawQuest.id);
            if (existing && existing.status !== 'completed') {
                result.push(this.materializeQuestView(playerId, existing));
                continue;
            }
            if (existing?.status === 'completed') {
                continue;
            }

            const blockedByPrevious = npc.quests
                .slice(0, index)
                .some((candidate) => byQuestId.get(candidate.id)?.status !== 'completed');
            if (blockedByPrevious) {
                break;
            }
            result.push(this.createQuestStateFromSource(playerId, rawQuest.id, 'available'));
        }
        for (const quest of player.quests.quests) {
            if (result.some((entry) => entry.id === quest.id)) {
                continue;
            }
            if (quest.targetNpcId === npc.npcId || quest.submitNpcId === npc.npcId) {
                result.push(this.materializeQuestView(playerId, quest));
            }
        }
        return result.sort(compareQuestViews);
    }    
    resolveAvailableNpcQuestMarker(playerId, npc) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        return this.resolveAvailableNpcQuestMarkerForPlayer(player, npc);
    }
    resolveAvailableNpcQuestMarkerForPlayer(player, npc) {
        const playerQuests = Array.isArray(player?.quests?.quests) ? player.quests.quests : [];
        for (let index = 0; index < npc.quests.length; index += 1) {
            const rawQuest = npc.quests[index];
            const questId = typeof rawQuest?.id === 'string' ? rawQuest.id.trim() : '';
            if (!questId) {
                continue;
            }
            const existing = findPlayerQuestById(playerQuests, questId);
            if (existing && existing.status !== 'completed') {
                return undefined;
            }
            if (existing?.status === 'completed') {
                continue;
            }
            if (hasIncompletePreviousNpcQuest(playerQuests, npc.quests, index)) {
                return undefined;
            }
            const source = this.templateRepository.getQuestSource(questId);
            if (source?.giverNpcId && source.giverNpcId !== npc.npcId) {
                return undefined;
            }
            return { line: normalizeQuestLine(source?.quest?.line ?? rawQuest.line), state: 'available' };
        }
        return undefined;
    }
    /**
 * resolveQuestProgress：规范化或转换任务进度。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务进度相关状态。
 */

    resolveQuestProgress(playerId, quest) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (quest.status === 'completed') {
            return quest.required;
        }
        switch (quest.objectiveType) {
            case 'submit_item':
                return quest.requiredItemId
                    ? Math.min(quest.required, this.playerRuntimeService.getInventoryCountByItemId(playerId, quest.requiredItemId))
                    : quest.progress;
            case 'learn_technique':
                return quest.targetTechniqueId
                    && this.playerRuntimeService.getTechniqueName(playerId, quest.targetTechniqueId)
                    ? quest.required
                    : 0;
            case 'realm_stage': {
                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                return quest.targetRealmStage !== undefined && isRealmStageReached(player.attrs.stage, quest.targetRealmStage, false)
                    ? quest.required
                    : quest.progress;
            }
            case 'realm_progress': {
                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                return quest.targetRealmStage !== undefined && isRealmStageReached(player.attrs.stage, quest.targetRealmStage, true)
                    ? quest.required
                    : quest.progress;
            }
            default:
                return quest.progress;
        }
    }    
    /**
 * canQuestBecomeReady：读取任务BecomeReady并返回结果。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 无返回值，完成任务BecomeReady的条件判断。
 */

    canQuestBecomeReady(playerId, quest) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (quest.progress < quest.required) {
            return false;
        }
        return !quest.requiredItemId || this.playerRuntimeService.getInventoryCountByItemId(playerId, quest.requiredItemId) >= (quest.requiredItemCount ?? 1);
    }    
    /**
 * createQuestStateFromSource：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param questId quest ID。
 * @param status 参数说明。
 * @returns 无返回值，直接更新任务状态From来源相关状态。
 */

    createQuestStateFromSource(playerId, questId, status = 'active') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const source = this.templateRepository.getQuestSource(questId);
        if (!source) {
            throw new NotFoundException(`任务不存在：${questId}`);
        }

        const quest = source.quest;

        const objectiveType = normalizeQuestObjectiveType(quest.objectiveType);

        const required = normalizeQuestRequired(quest, objectiveType);

        const targetRealmStage = normalizeQuestRealmStage(quest.targetRealmStage);

        const targetNpcId = typeof quest.targetNpcId === 'string' ? quest.targetNpcId.trim() : '';
        const submitNpcId = typeof quest.submitNpcId === 'string' ? quest.submitNpcId.trim() : '';
        const targetNpcLocation = targetNpcId ? this.templateRepository.getNpcLocation(targetNpcId) : null;
        const submitNpcLocation = submitNpcId ? this.templateRepository.getNpcLocation(submitNpcId) : null;

        const built = cloneQuestState({
            id: source.quest.id,
            line: normalizeQuestLine(source.quest.line),
            status,
            objectiveType,
            progress: 0,
            required,
            targetName: resolveQuestTargetLabel(objectiveType, source.quest, targetRealmStage, targetNpcLocation?.npcName, this.contentTemplateRepository.getItemName(typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : ''), this.contentTemplateRepository.getTechniqueName(typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : '')),
            targetTechniqueId: typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : undefined,
            targetRealmStage,
            targetMonsterId: typeof source.quest.targetMonsterId === 'string' ? source.quest.targetMonsterId : '',
            nextQuestId: typeof source.quest.nextQuestId === 'string' ? source.quest.nextQuestId : undefined,
            requiredItemId: typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : undefined,
            requiredItemCount: Number.isInteger(source.quest.requiredItemCount) ? Number(source.quest.requiredItemCount) : undefined,
            giverId: source.giverNpcId,
            guideFlowId: typeof source.quest.guideFlowId === 'string' ? source.quest.guideFlowId : undefined,
            targetMapId: typeof source.quest.targetMapId === 'string' && source.quest.targetMapId.trim()
                ? source.quest.targetMapId.trim()
                : targetNpcLocation?.mapId,
            targetNpcId: targetNpcId || undefined,
            submitNpcId: submitNpcId || undefined,
            submitMapId: typeof source.quest.submitMapId === 'string' && source.quest.submitMapId.trim()
                ? source.quest.submitMapId.trim()
                : submitNpcLocation?.mapId,
        });
        built.progress = this.resolveQuestProgress(playerId, built);
        // 未接（available）任务不应晋升为 ready：ready 的语义是“已接且可提交”，
        // 若把未接任务标成 ready，executeNpcQuestAction / dispatchNpcInteraction 会把它误当已接任务去 submit，
        // 而 dispatchAcceptNpcQuest 又因 status !== 'available' 拒绝接取，表现为“接任务前已达境界 → 无法完成”。
        // 已接（active）任务达标晋升 ready 的行为保持不变，由调用方传入 'active' 触发。
        if (status === 'active' && this.canQuestBecomeReady(playerId, built)) {
            built.status = 'ready';
        }
        return built;
    }    
    /**
 * buildQuestRewardItems：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务Reward道具相关状态。
 */

    buildQuestRewardItems(quest) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        quest = this.materializeQuestView('', quest);
        if (quest.rewards.length > 0) {
            return quest.rewards.map((entry) => toQuestRewardItem(this.contentTemplateRepository.createItem(entry.itemId, entry.count), {
                itemId: entry.itemId,
                name: entry.name ?? entry.itemId,
                type: entry.type ?? 'material',
                count: entry.count,
                desc: entry.desc ?? (entry.name ?? entry.itemId),
            }));
        }
        if (!quest.rewardItemId) {
            return [];
        }

        const item = this.contentTemplateRepository.createItem(quest.rewardItemId, 1);
        return [toQuestRewardItem(item, {
            itemId: quest.rewardItemId,
            name: quest.rewardItemId,
            type: 'material',
            count: 1,
            desc: quest.rewardItemId,
        })];
    }    
    /**
 * buildQuestRewardItemsFromRecord：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务Reward道具FromRecord相关状态。
 */

    buildQuestRewardItemsFromRecord(quest) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const rewards = [];
        const rewardList = Array.isArray(quest.reward) ? quest.reward : [];
        for (const entry of rewardList) {
            const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
            if (!itemId) {
                continue;
            }

            const count = Number.isInteger(entry.count) ? Math.max(1, Number(entry.count)) : 1;
            rewards.push(toQuestRewardItem(this.contentTemplateRepository.createItem(itemId, count), {
                itemId,
                name: itemId,
                type: 'material',
                count,
                desc: itemId,
            }));
        }
        if (rewards.length > 0) {
            return rewards;
        }

        const rewardItemId = typeof quest.rewardItemId === 'string' ? quest.rewardItemId.trim() : '';
        if (!rewardItemId) {
            return [];
        }

        const item = this.contentTemplateRepository.createItem(rewardItemId, 1);
        return [toQuestRewardItem(item, {
            itemId: rewardItemId,
            name: rewardItemId,
            type: 'material',
            count: 1,
            desc: rewardItemId,
        })];
    }    
    /**
 * resolveQuestNavigationTarget：读取任务导航目标并返回结果。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务导航目标相关状态。
 */

    resolveQuestNavigationTarget(quest) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        quest = this.materializeQuestView('', quest);
        if (quest.status === 'ready') {
            if (quest.submitMapId && Number.isInteger(quest.submitX) && Number.isInteger(quest.submitY)) {
                return {
                    mapId: quest.submitMapId,
                    x: Number(quest.submitX),
                    y: Number(quest.submitY),
                    adjacent: true,
                };
            }
            if (quest.submitNpcId) {
                const location = this.templateRepository.getNpcLocation(quest.submitNpcId);
                if (location) {
                    return {
                        mapId: location.mapId,
                        x: location.x,
                        y: location.y,
                        adjacent: true,
                    };
                }
            }
        }
        if (quest.objectiveType === 'talk' && quest.targetNpcId) {
            const location = this.templateRepository.getNpcLocation(quest.targetNpcId);
            if (location) {
                return {
                    mapId: location.mapId,
                    x: location.x,
                    y: location.y,
                    adjacent: true,
                };
            }
        }
        if (quest.targetMapId && Number.isInteger(quest.targetX) && Number.isInteger(quest.targetY)) {
            return {
                mapId: quest.targetMapId,
                x: Number(quest.targetX),
                y: Number(quest.targetY),
                adjacent: Boolean(quest.targetNpcId),
            };
        }
        if (quest.objectiveType === 'kill' && quest.targetMonsterId && quest.targetMapId) {
            const spawn = this.contentTemplateRepository.createRuntimeMonstersForMap(quest.targetMapId)
                .find((entry) => entry.monsterId === quest.targetMonsterId);
            if (spawn) {
                return {
                    mapId: quest.targetMapId,
                    x: spawn.x,
                    y: spawn.y,
                    adjacent: true,
                };
            }
        }
        if (quest.giverMapId && Number.isInteger(quest.giverX) && Number.isInteger(quest.giverY)) {
            return {
                mapId: quest.giverMapId,
                x: Number(quest.giverX),
                y: Number(quest.giverY),
                adjacent: true,
            };
        }
        return null;
    }
    materializeQuestView(playerId, quest) {
        const source = this.templateRepository.getQuestSource(quest.id);
        if (!source) {
            return {
                ...quest,
                title: quest.title ?? quest.id,
                desc: quest.desc ?? '',
                targetName: quest.targetName ?? quest.targetMonsterId ?? quest.id,
                rewardText: quest.rewardText ?? '',
                rewardItemId: quest.rewardItemId ?? '',
                rewardItemIds: Array.isArray(quest.rewardItemIds) ? quest.rewardItemIds.slice() : [],
                rewards: Array.isArray(quest.rewards) ? quest.rewards.map((entry) => ({ ...entry })) : [],
            };
        }

        const sourceQuest = source.quest;
        const objectiveType = normalizeQuestObjectiveType(quest.objectiveType ?? sourceQuest.objectiveType);
        const targetRealmStage = normalizeQuestRealmStage(quest.targetRealmStage ?? sourceQuest.targetRealmStage);
        const targetNpcId = typeof quest.targetNpcId === 'string' && quest.targetNpcId.trim()
            ? quest.targetNpcId.trim()
            : typeof sourceQuest.targetNpcId === 'string' && sourceQuest.targetNpcId.trim()
                ? sourceQuest.targetNpcId.trim()
                : undefined;
        const submitNpcId = typeof quest.submitNpcId === 'string' && quest.submitNpcId.trim()
            ? quest.submitNpcId.trim()
            : typeof sourceQuest.submitNpcId === 'string' && sourceQuest.submitNpcId.trim()
                ? sourceQuest.submitNpcId.trim()
                : undefined;
        const targetNpcLocation = targetNpcId ? this.templateRepository.getNpcLocation(targetNpcId) : null;
        const submitNpcLocation = submitNpcId ? this.templateRepository.getNpcLocation(submitNpcId) : null;
        const rewardItems = this.buildQuestRewardItemsFromRecord(sourceQuest);
        const targetMapId = typeof quest.targetMapId === 'string' && quest.targetMapId.trim()
            ? quest.targetMapId.trim()
            : typeof sourceQuest.targetMapId === 'string' && sourceQuest.targetMapId.trim()
                ? sourceQuest.targetMapId.trim()
                : targetNpcLocation?.mapId;
        const submitMapId = typeof quest.submitMapId === 'string' && quest.submitMapId.trim()
            ? quest.submitMapId.trim()
            : typeof sourceQuest.submitMapId === 'string' && sourceQuest.submitMapId.trim()
                ? sourceQuest.submitMapId.trim()
                : submitNpcLocation?.mapId;

        const targetNameSource = quest.targetName
            ? {
                targetName: quest.targetName,
                title: sourceQuest.title,
                objectiveType: sourceQuest.objectiveType,
                targetNpcId: sourceQuest.targetNpcId,
                requiredItemId: sourceQuest.requiredItemId,
                targetTechniqueId: sourceQuest.targetTechniqueId,
                targetMonsterId: sourceQuest.targetMonsterId,
            }
            : sourceQuest;

        return {
            ...quest,
            title: sourceQuest.title,
            desc: sourceQuest.desc,
            line: normalizeQuestLine(quest.line ?? sourceQuest.line),
            chapter: typeof sourceQuest.chapter === 'string' ? sourceQuest.chapter : undefined,
            story: typeof sourceQuest.story === 'string' ? sourceQuest.story : undefined,
            objectiveType,
            objectiveText: typeof sourceQuest.objectiveText === 'string' ? sourceQuest.objectiveText : undefined,
            required: Number.isInteger(quest.required) ? Number(quest.required) : normalizeQuestRequired(sourceQuest, objectiveType),
            targetName: resolveQuestTargetLabel(objectiveType, targetNameSource, targetRealmStage, targetNpcLocation?.npcName, this.contentTemplateRepository.getItemName(typeof sourceQuest.requiredItemId === 'string' ? sourceQuest.requiredItemId : ''), this.contentTemplateRepository.getTechniqueName(typeof sourceQuest.targetTechniqueId === 'string' ? sourceQuest.targetTechniqueId : '')),
            targetTechniqueId: typeof quest.targetTechniqueId === 'string' ? quest.targetTechniqueId : sourceQuest.targetTechniqueId,
            targetRealmStage,
            rewardText: buildQuestRewardText(sourceQuest, rewardItems),
            targetMonsterId: typeof quest.targetMonsterId === 'string' ? quest.targetMonsterId : (typeof sourceQuest.targetMonsterId === 'string' ? sourceQuest.targetMonsterId : ''),
            rewardItemId: typeof sourceQuest.rewardItemId === 'string' ? sourceQuest.rewardItemId : (rewardItems[0]?.itemId ?? ''),
            rewardItemIds: rewardItems.map((entry) => entry.itemId),
            rewards: rewardItems.map((entry) => ({ ...entry })),
            nextQuestId: typeof quest.nextQuestId === 'string' ? quest.nextQuestId : sourceQuest.nextQuestId,
            requiredItemId: typeof quest.requiredItemId === 'string' ? quest.requiredItemId : sourceQuest.requiredItemId,
            requiredItemCount: Number.isInteger(quest.requiredItemCount) ? Number(quest.requiredItemCount) : sourceQuest.requiredItemCount,
            giverId: typeof quest.giverId === 'string' ? quest.giverId : source.giverNpcId,
            giverName: source.giverNpcName,
            giverMapId: source.giverMapId,
            giverMapName: source.giverMapName,
            giverX: source.giverX,
            giverY: source.giverY,
            targetMapId,
            targetMapName: typeof targetMapId === 'string' && this.templateRepository.has(targetMapId)
                ? this.templateRepository.getOrThrow(targetMapId).name
                : targetNpcLocation?.mapName,
            targetX: Number.isInteger(sourceQuest.targetX) ? Number(sourceQuest.targetX) : targetNpcLocation?.x,
            targetY: Number.isInteger(sourceQuest.targetY) ? Number(sourceQuest.targetY) : targetNpcLocation?.y,
            targetNpcId,
            targetNpcName: typeof sourceQuest.targetNpcName === 'string' ? sourceQuest.targetNpcName : targetNpcLocation?.npcName,
            submitNpcId,
            submitNpcName: typeof sourceQuest.submitNpcName === 'string' ? sourceQuest.submitNpcName : submitNpcLocation?.npcName,
            submitMapId,
            submitMapName: typeof submitMapId === 'string' && this.templateRepository.has(submitMapId)
                ? this.templateRepository.getOrThrow(submitMapId).name
                : submitNpcLocation?.mapName,
            submitX: Number.isInteger(sourceQuest.submitX) ? Number(sourceQuest.submitX) : submitNpcLocation?.x,
            submitY: Number.isInteger(sourceQuest.submitY) ? Number(sourceQuest.submitY) : submitNpcLocation?.y,
            relayMessage: typeof sourceQuest.relayMessage === 'string' ? sourceQuest.relayMessage : undefined,
            guideFlowId: typeof quest.guideFlowId === 'string' && quest.guideFlowId.trim()
                ? quest.guideFlowId.trim()
                : typeof sourceQuest.guideFlowId === 'string' && sourceQuest.guideFlowId.trim()
                    ? sourceQuest.guideFlowId.trim()
                    : undefined,
        };
    }
};
