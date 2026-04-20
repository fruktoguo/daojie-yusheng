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
exports.WorldRuntimeQuestStateService = void 0;

const common_1 = require("@nestjs/common");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_quest_query_service_1 = require("./world-runtime-quest-query.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { cloneQuestState } = world_runtime_normalization_helpers_1;

/** world-runtime quest-state helpers：承接任务状态刷新、自动接续与奖励背包校验。 */
let WorldRuntimeQuestStateService = class WorldRuntimeQuestStateService {
/**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * worldRuntimeQuestQueryService：对象字段。
 */

    worldRuntimeQuestQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeQuestQueryService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService, worldRuntimeQuestQueryService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeQuestQueryService = worldRuntimeQuestQueryService;
    }    
    /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param forceDirty 参数说明。
 * @returns 函数返回值。
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
 * tryAcceptNextQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param nextQuestId nextQuest ID。
 * @returns 函数返回值。
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
 * advanceKillQuestProgress：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param monsterId monster ID。
 * @param monsterName 参数说明。
 * @returns 函数返回值。
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
 * advanceLearnTechniqueQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
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
 * canReceiveRewardItems：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @param rewards 参数说明。
 * @returns 函数返回值。
 */

    canReceiveRewardItems(playerId, rewards) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        let freeSlots = Math.max(0, player.inventory.capacity - player.inventory.items.length);
        const seenNewItemIds = new Set();
        for (const reward of rewards) {
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
exports.WorldRuntimeQuestStateService = WorldRuntimeQuestStateService;
exports.WorldRuntimeQuestStateService = WorldRuntimeQuestStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_quest_query_service_1.WorldRuntimeQuestQueryService])
], WorldRuntimeQuestStateService);

export { WorldRuntimeQuestStateService };
