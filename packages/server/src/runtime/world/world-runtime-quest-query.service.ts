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
exports.WorldRuntimeQuestQueryService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

const content_template_repository_1 = require("../../content/content-template.repository");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

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
    return shared_1.PLAYER_REALM_ORDER.indexOf(stage);
}

function isRealmStageReached(currentStage, targetStage, strict) {
    const currentIndex = getRealmStageOrderIndex(currentStage);
    const targetIndex = getRealmStageOrderIndex(targetStage);
    if (currentIndex < 0 || targetIndex < 0) {
        return false;
    }
    return strict ? currentIndex > targetIndex : currentIndex >= targetIndex;
}

/** 任务只读查询服务：承接任务视图构造、奖励解析与导航目标解析。 */
let WorldRuntimeQuestQueryService = class WorldRuntimeQuestQueryService {
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

    constructor(contentTemplateRepository, templateRepository, playerRuntimeService) {
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
        return {
            quests: this.playerRuntimeService.listQuests(playerId),
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

        const byQuestId = new Map(player.quests.quests.map((entry) => [entry.id, entry]));

        const result = [];
        for (let index = 0; index < npc.quests.length; index += 1) {
            const rawQuest = npc.quests[index];
            const existing = byQuestId.get(rawQuest.id);
            if (existing && existing.status !== 'completed') {
                result.push(cloneQuestState(existing));
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
                result.push(cloneQuestState(quest));
            }
        }
        return result.sort(compareQuestViews);
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
            throw new common_1.NotFoundException(`Quest ${questId} not found`);
        }

        const quest = source.quest;

        const objectiveType = normalizeQuestObjectiveType(quest.objectiveType);

        const required = normalizeQuestRequired(quest, objectiveType);

        const targetRealmStage = normalizeQuestRealmStage(quest.targetRealmStage);

        const targetNpcLocation = typeof quest.targetNpcId === 'string' && quest.targetNpcId.trim()
            ? this.templateRepository.getNpcLocation(quest.targetNpcId.trim())
            : null;

        const submitNpcLocation = typeof quest.submitNpcId === 'string' && quest.submitNpcId.trim()
            ? this.templateRepository.getNpcLocation(quest.submitNpcId.trim())
            : null;

        const rewardItems = this.buildQuestRewardItemsFromRecord(quest);

        const built = {
            id: source.quest.id,
            title: source.quest.title,
            desc: source.quest.desc,
            line: normalizeQuestLine(source.quest.line),
            chapter: typeof source.quest.chapter === 'string' ? source.quest.chapter : undefined,
            story: typeof source.quest.story === 'string' ? source.quest.story : undefined,
            status,
            objectiveType,
            objectiveText: typeof source.quest.objectiveText === 'string' ? source.quest.objectiveText : undefined,
            progress: 0,
            required,
            targetName: resolveQuestTargetLabel(objectiveType, source.quest, targetRealmStage, targetNpcLocation?.npcName, this.contentTemplateRepository.getItemName(typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : ''), this.contentTemplateRepository.getTechniqueName(typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : '')),
            targetTechniqueId: typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : undefined,
            targetRealmStage,
            rewardText: buildQuestRewardText(source.quest, rewardItems),
            targetMonsterId: typeof source.quest.targetMonsterId === 'string' ? source.quest.targetMonsterId : '',
            rewardItemId: typeof source.quest.rewardItemId === 'string' ? source.quest.rewardItemId : (rewardItems[0]?.itemId ?? ''),
            rewardItemIds: rewardItems.map((entry) => entry.itemId),
            rewards: rewardItems.map((entry) => ({ ...entry })),
            nextQuestId: typeof source.quest.nextQuestId === 'string' ? source.quest.nextQuestId : undefined,
            requiredItemId: typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : undefined,
            requiredItemCount: Number.isInteger(source.quest.requiredItemCount) ? Number(source.quest.requiredItemCount) : undefined,
            giverId: source.giverNpcId,
            giverName: source.giverNpcName,
            giverMapId: source.giverMapId,
            giverMapName: source.giverMapName,
            giverX: source.giverX,
            giverY: source.giverY,
            targetMapId: typeof source.quest.targetMapId === 'string' && source.quest.targetMapId.trim()
                ? source.quest.targetMapId.trim()
                : targetNpcLocation?.mapId,
            targetMapName: typeof source.quest.targetMapId === 'string' && this.templateRepository.has(source.quest.targetMapId.trim())
                ? this.templateRepository.getOrThrow(source.quest.targetMapId.trim()).name
                : targetNpcLocation?.mapName,
            targetX: Number.isInteger(source.quest.targetX) ? Number(source.quest.targetX) : targetNpcLocation?.x,
            targetY: Number.isInteger(source.quest.targetY) ? Number(source.quest.targetY) : targetNpcLocation?.y,
            targetNpcId: typeof source.quest.targetNpcId === 'string' ? source.quest.targetNpcId : undefined,
            targetNpcName: typeof source.quest.targetNpcName === 'string' ? source.quest.targetNpcName : targetNpcLocation?.npcName,
            submitNpcId: typeof source.quest.submitNpcId === 'string' ? source.quest.submitNpcId : undefined,
            submitNpcName: typeof source.quest.submitNpcName === 'string' ? source.quest.submitNpcName : submitNpcLocation?.npcName,
            submitMapId: typeof source.quest.submitMapId === 'string' && source.quest.submitMapId.trim()
                ? source.quest.submitMapId.trim()
                : submitNpcLocation?.mapId,
            submitMapName: typeof source.quest.submitMapId === 'string' && this.templateRepository.has(source.quest.submitMapId.trim())
                ? this.templateRepository.getOrThrow(source.quest.submitMapId.trim()).name
                : submitNpcLocation?.mapName,
            submitX: Number.isInteger(source.quest.submitX) ? Number(source.quest.submitX) : submitNpcLocation?.x,
            submitY: Number.isInteger(source.quest.submitY) ? Number(source.quest.submitY) : submitNpcLocation?.y,
            relayMessage: typeof source.quest.relayMessage === 'string' ? source.quest.relayMessage : undefined,
        };
        built.progress = this.resolveQuestProgress(playerId, built);
        if (status !== 'completed' && this.canQuestBecomeReady(playerId, built)) {
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
};
exports.WorldRuntimeQuestQueryService = WorldRuntimeQuestQueryService;
exports.WorldRuntimeQuestQueryService = WorldRuntimeQuestQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeQuestQueryService);

export { WorldRuntimeQuestQueryService };
