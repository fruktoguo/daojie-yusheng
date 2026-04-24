// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeReadFacadeService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { normalizeCoordinate } = world_runtime_normalization_helpers_1;

/** world-runtime read facade：承接高层读侧 envelope、详情与只读校验 facade。 */
let WorldRuntimeReadFacadeService = class WorldRuntimeReadFacadeService {
/**
 * buildNpcShopView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCShop视图相关状态。
 */

    buildNpcShopView(playerId, npcIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        return deps.worldRuntimeNpcShopQueryService.buildNpcShopView(playerId, npcId, deps);
    }    
    /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param _input 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务列表视图相关状态。
 */

    buildQuestListView(playerId, _input, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        deps.refreshQuestStates(playerId);
        return deps.worldRuntimeQuestQueryService.buildQuestListView(playerId);
    }    
    /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

    buildNpcQuestsView(playerId, npcIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        deps.refreshQuestStates(playerId);
        return deps.worldRuntimeQuestQueryService.buildNpcQuestsView(playerId, npcId, deps);
    }    
    /**
 * buildDetail：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新详情相关状态。
 */

    buildDetail(playerId, input, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocationOrThrow(playerId);
        const kind = input.kind;
        const id = typeof input.id === 'string' ? input.id.trim() : '';
        if (!id) {
            throw new common_1.BadRequestException('id is required');
        }
        if (kind !== 'npc' && kind !== 'monster' && kind !== 'ground' && kind !== 'player' && kind !== 'portal' && kind !== 'container') {
            throw new common_1.BadRequestException(`Unsupported detail kind: ${String(kind)}`);
        }
        const view = deps.getPlayerViewOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const viewer = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        return deps.worldRuntimeDetailQueryService.buildDetail({ view, viewer, location, instance }, { kind, id });
    }    
    /**
 * buildTileDetail：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Tile详情相关状态。
 */

    buildTileDetail(playerId, input, deps) {
        const location = deps.getPlayerLocationOrThrow(playerId);
        const x = normalizeCoordinate(typeof input.x === 'number' ? input.x : Number.NaN, 'x');
        const y = normalizeCoordinate(typeof input.y === 'number' ? input.y : Number.NaN, 'y');
        const view = deps.getPlayerViewOrThrow(playerId);
        const viewer = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        return deps.worldRuntimeDetailQueryService.buildTileDetail({ view, viewer, location, instance }, { x, y });
    }    
    /**
 * buildLootWindowSyncState：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param tileX 参数说明。
 * @param tileY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新掉落窗口Sync状态相关状态。
 */

    buildLootWindowSyncState(playerId, tileX, tileY, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return null;
        }
        if (Math.max(Math.abs(player.x - tileX), Math.abs(player.y - tileY)) > 1) {
            return null;
        }
        const view = deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId);
        if (!view) {
            return null;
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        const container = instance.getContainerAtTile(tileX, tileY);
        if (container) {
            deps.worldRuntimeLootContainerService.prepareContainerLootSource(instance.meta.instanceId, container, instance.tick);
        }
        return deps.worldRuntimePlayerViewQueryService.buildLootWindowSyncState(deps, playerId, tileX, tileY);
    }    
    /**
 * refreshPlayerContextActions：执行refresh玩家上下文Action相关逻辑。
 * @param playerId 玩家 ID。
 * @param view 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新refresh玩家上下文Action相关状态。
 */

    refreshPlayerContextActions(playerId, view, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const resolvedView = view ?? deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId);
        if (!resolvedView) {
            return null;
        }
        deps.playerRuntimeService.setContextActions(playerId, this.buildContextActions(resolvedView, deps), resolvedView.tick);
        return resolvedView;
    }    
    /**
 * getPlayerView：读取玩家视图。
 * @param playerId 玩家 ID。
 * @param radius 影响半径。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成玩家视图的读取/组装。
 */

    getPlayerView(playerId, radius, deps) {
        return deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId, radius);
    }    
    /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPC任务Envelope相关状态。
 */

    createNpcQuestsEnvelope(playerId, npcId, deps) {
        const npc = deps.worldRuntimeNpcAccessService.resolveAdjacentNpc(playerId, npcId, deps);
        return deps.worldRuntimeQuestQueryService.createNpcQuestsEnvelope(playerId, npc);
    }    
    /**
 * resolveQuestProgress：规范化或转换任务进度。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务进度相关状态。
 */

    resolveQuestProgress(playerId, quest, deps) {
        return deps.worldRuntimeQuestQueryService.resolveQuestProgress(playerId, quest);
    }    
    /**
 * canQuestBecomeReady：读取任务BecomeReady并返回结果。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成任务BecomeReady的条件判断。
 */

    canQuestBecomeReady(playerId, quest, deps) {
        return deps.worldRuntimeQuestQueryService.canQuestBecomeReady(playerId, quest);
    }    
    /**
 * createQuestStateFromSource：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param questId quest ID。
 * @param status 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务状态From来源相关状态。
 */

    createQuestStateFromSource(playerId, questId, status, deps) {
        return deps.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, questId, status);
    }    
    /**
 * buildQuestRewardItems：构建并返回目标对象。
 * @param quest 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务Reward道具相关状态。
 */

    buildQuestRewardItems(quest, deps) {
        return deps.worldRuntimeQuestQueryService.buildQuestRewardItems(quest);
    }    
    /**
 * buildQuestRewardItemsFromRecord：构建并返回目标对象。
 * @param quest 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务Reward道具FromRecord相关状态。
 */

    buildQuestRewardItemsFromRecord(quest, deps) {
        return deps.worldRuntimeQuestQueryService.buildQuestRewardItemsFromRecord(quest);
    }    
    /**
 * resolveQuestNavigationTarget：读取任务导航目标并返回结果。
 * @param quest 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新任务导航目标相关状态。
 */

    resolveQuestNavigationTarget(quest, deps) {
        return deps.worldRuntimeQuestQueryService.resolveQuestNavigationTarget(quest);
    }    
    /**
 * validateNpcShopPurchase：判断NPCShopPurchase是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成NPCShopPurchase的条件判断。
 */

    validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps) {
        return deps.worldRuntimeNpcShopQueryService.validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps);
    }    
    /**
 * buildContextActions：构建并返回目标对象。
 * @param view 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新上下文Action相关状态。
 */

    buildContextActions(view, deps) {
        return deps.worldRuntimeContextActionQueryService.buildContextActions(view);
    }
};
exports.WorldRuntimeReadFacadeService = WorldRuntimeReadFacadeService;
exports.WorldRuntimeReadFacadeService = WorldRuntimeReadFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeReadFacadeService);

export { WorldRuntimeReadFacadeService };
