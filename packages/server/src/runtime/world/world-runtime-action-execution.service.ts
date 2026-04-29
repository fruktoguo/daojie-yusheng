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
exports.WorldRuntimeActionExecutionService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_npc_quest_write_service_1 = require("./world-runtime-npc-quest-write.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const pvp_1 = require("../../constants/gameplay/pvp");

const { normalizeRuntimeActionId, parseRuntimeInstanceDescriptor } = world_runtime_normalization_helpers_1;

/** world-runtime action execution orchestration：承接动作入口分流与低频 toggle/交互编排。 */
let WorldRuntimeActionExecutionService = class WorldRuntimeActionExecutionService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * worldRuntimeNpcQuestWriteService：世界运行态NPC任务Write服务引用。
 */

    worldRuntimeNpcQuestWriteService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeNpcQuestWriteService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, worldRuntimeNpcQuestWriteService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcQuestWriteService = worldRuntimeNpcQuestWriteService;
    }    
    /**
 * executeAction：执行executeAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param targetInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新executeAction相关状态。
 */

    executeAction(playerId, actionIdInput, targetInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        if (typeof deps.isInstanceLeaseWritable === 'function') {
            const location = deps.getPlayerLocation(playerId);
            const instance = location ? deps.getInstanceRuntime(location.instanceId) : null;
            if (instance && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instance.meta.instanceId, 'action_execution_lease_check_failed');
                }
                throw new common_1.ServiceUnavailableException(`instance ${instance.meta.instanceId} lease is not writable`);
            }
        }

        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);

        const rawActionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!rawActionId) {
            throw new common_1.BadRequestException('actionId is required');
        }
        if (rawActionId.startsWith('npc:')) {
            return this.executeLegacyNpcAction(playerId, rawActionId.slice('npc:'.length), deps);
        }

        const actionId = normalizeRuntimeActionId(rawActionId);
        if (actionId === 'portal:travel') {
            return {
                kind: 'queued',
                view: deps.usePortal(playerId),
            };
        }
        if (actionId === 'world:migrate') {
            return this.executeWorldMigration(playerId, targetInput, deps);
        }
        if (actionId === 'realm:breakthrough') {
            deps.enqueuePendingCommand(playerId, {
                kind: 'breakthrough',
            });
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'realm:refine_root_foundation') {
            deps.enqueuePendingCommand(playerId, {
                kind: 'refineRootFoundation',
            });
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'body_training:infuse') {
            const target = typeof targetInput === 'string' ? targetInput.trim() : '';
            const foundationAmount = Number.parseInt(target, 10);
            if (!Number.isFinite(foundationAmount) || foundationAmount <= 0) {
                throw new common_1.BadRequestException('foundation amount is required');
            }
            const result = this.playerRuntimeService.infuseBodyTraining(playerId, foundationAmount);
            deps.queuePlayerNotice(playerId, `你将 ${result.foundationSpent} 点底蕴灌入肉身，转化为 ${result.expGained} 点炼体经验`, 'success');
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_battle') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoBattle', deps);
        }
        if (actionId === 'toggle:auto_retaliate') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoRetaliate', deps);
        }
        if (actionId === 'toggle:auto_battle_stationary') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoBattleStationary', deps);
        }
        if (actionId === 'toggle:allow_aoe_player_hit') {
            return this.toggleCombatSetting(playerId, currentTick, 'allowAoePlayerHit', deps);
        }
        if (actionId === 'toggle:auto_idle_cultivation') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoIdleCultivation', deps);
        }
        if (actionId === 'cultivation:toggle') {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const nextActive = !player.combat.cultivationActive;
            this.playerRuntimeService.updateCombatSettings(playerId, { cultivationActive: nextActive }, currentTick);
            deps.queuePlayerNotice(playerId, nextActive ? '已恢复当前修炼' : '已停止当前修炼', 'info');
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_switch_cultivation') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoSwitchCultivation', deps);
        }
        if (actionId === 'sense_qi:toggle') {
            return this.toggleCombatSetting(playerId, currentTick, 'senseQiActive', deps);
        }
        if (actionId.startsWith('formation:toggle:')) {
            const formationInstanceId = actionId.slice('formation:toggle:'.length).trim();
            const formation = deps.worldRuntimeFormationService.findOwnedFormation(playerId, formationInstanceId);
            deps.worldRuntimeFormationService.dispatchSetFormationActive(playerId, {
                formationInstanceId,
                active: !formation.active,
            }, deps);
            deps.refreshPlayerContextActions(playerId);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('formation:refill:')) {
            const formationInstanceId = actionId.slice('formation:refill:'.length).trim();
            deps.worldRuntimeFormationService.dispatchRefillFormation(playerId, {
                formationInstanceId,
            }, deps);
            deps.refreshPlayerContextActions(playerId);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:')) {
            return deps.worldRuntimeSectService.executeSectAction(playerId, actionId, deps);
        }
        if (actionId.startsWith('npc_shop:')) {
            return {
                kind: 'npcShop',
                npcShop: deps.buildNpcShopView(playerId, actionId.slice('npc_shop:'.length)),
            };
        }
        if (actionId.startsWith('npc_quests:')) {
            const npcId = actionId.slice('npc_quests:'.length).trim();
            if (!npcId) {
                throw new common_1.BadRequestException('npcId is required');
            }
            return this.worldRuntimeNpcQuestWriteService.executeNpcQuestAction(playerId, npcId, deps);
        }
        throw new common_1.BadRequestException(`Unsupported actionId: ${actionId}`);
    }    
    /**
 * executeLegacyNpcAction：执行executeLegacyNPCAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新executeLegacyNPCAction相关状态。
 */

    executeLegacyNpcAction(playerId, npcId, deps) {
        return this.worldRuntimeNpcQuestWriteService.executeNpcQuestAction(playerId, npcId, deps);
    }    
    /**
 * executeWorldMigration：处理世界迁移动作，更新世界偏好并切换默认分线。
 * @param playerId 玩家 ID。
 * @param targetInput 目标分线。
 * @param deps 运行时依赖。
 * @returns 返回更新后的玩家视图。
 */

    executeWorldMigration(playerId, targetInput, deps) {
        const linePreset = normalizeWorldMigrationTarget(targetInput);
        if (!linePreset) {
            throw new common_1.BadRequestException('world migration target is required');
        }
        const currentView = deps.getPlayerViewOrThrow(playerId);
        if (!hasNearbyManualPortal(currentView)) {
            throw new common_1.BadRequestException('需要站在界门附近才能进行世界迁移');
        }
        if (linePreset === 'peaceful' && (this.playerRuntimeService.hasActiveBuff?.(playerId, pvp_1.PVP_SHA_INFUSION_BUFF_ID)
            || this.playerRuntimeService.hasActiveBuff?.(playerId, pvp_1.PVP_SHA_BACKLASH_BUFF_ID))) {
            throw new common_1.BadRequestException('煞气入体或煞气反噬期间无法迁回虚境');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.updateWorldPreference?.(playerId, linePreset);
        const currentLinePreset = resolveLinePresetFromInstanceId(currentView?.instance?.instanceId ?? player.instanceId);
        if (currentLinePreset === linePreset) {
            deps.queuePlayerNotice(playerId, buildWorldMigrationNotice(linePreset, true), 'success');
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        const targetMapId = typeof player.templateId === 'string' && player.templateId.trim()
            ? player.templateId.trim()
            : currentView?.instance?.templateId;
        if (!targetMapId) {
            throw new common_1.BadRequestException('当前未处于有效地图，无法切换世界');
        }
        deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
        deps.clearPendingCommand?.(playerId);
        const targetInstance = typeof deps.getOrCreateDefaultLineInstance === 'function'
            ? deps.getOrCreateDefaultLineInstance(targetMapId, linePreset)
            : deps.getOrCreatePublicInstance(targetMapId);
        const nextView = deps.worldRuntimePlayerSessionService.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? currentView?.sessionId ?? `session:${playerId}`,
            instanceId: targetInstance.meta.instanceId,
            preferredX: Number.isFinite(player.x) ? Math.trunc(player.x) : undefined,
            preferredY: Number.isFinite(player.y) ? Math.trunc(player.y) : undefined,
        }, deps);
        deps.queuePlayerNotice(playerId, buildWorldMigrationNotice(linePreset, false), 'success');
        return {
            kind: 'queued',
            view: nextView,
        };
    }    
    /**
 * toggleCombatSetting：执行toggle战斗Setting相关逻辑。
 * @param playerId 玩家 ID。
 * @param currentTick 参数说明。
 * @param key 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新toggle战斗Setting相关状态。
 */

    toggleCombatSetting(playerId, currentTick, key, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.updateCombatSettings(playerId, {
            [key]: !player.combat[key],
        }, currentTick);
        return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
    }
};
exports.WorldRuntimeActionExecutionService = WorldRuntimeActionExecutionService;
exports.WorldRuntimeActionExecutionService = WorldRuntimeActionExecutionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_npc_quest_write_service_1.WorldRuntimeNpcQuestWriteService])
], WorldRuntimeActionExecutionService);

export { WorldRuntimeActionExecutionService };

function normalizeWorldMigrationTarget(targetInput) {
    const normalized = typeof targetInput === 'string' ? targetInput.trim() : '';
    return normalized === 'real' || normalized === 'peaceful' ? normalized : '';
}

function hasNearbyManualPortal(view) {
    const self = view?.self;
    const portals = Array.isArray(view?.localPortals) ? view.localPortals : [];
    if (!self || !Number.isFinite(self.x) || !Number.isFinite(self.y)) {
        return false;
    }
    return portals.some((portal) => portal?.trigger === 'manual'
        && Number.isFinite(portal.x)
        && Number.isFinite(portal.y)
        && Math.max(Math.abs(portal.x - self.x), Math.abs(portal.y - self.y)) <= 1);
}

function resolveLinePresetFromInstanceId(instanceId) {
    const descriptor = parseRuntimeInstanceDescriptor(typeof instanceId === 'string' ? instanceId : '');
    return descriptor?.linePreset === 'real' ? 'real' : 'peaceful';
}

function buildWorldMigrationNotice(linePreset, alreadyThere) {
    if (linePreset === 'real') {
        return alreadyThere
            ? '默认世界已保持为现世，后续跨图会继续进入现世线。'
            : '你已切入现世，后续跨图会默认进入现世线。';
    }
    return alreadyThere
        ? '默认世界已保持为虚境，后续跨图会继续进入虚境线。'
        : '你已切入虚境，后续跨图会默认进入虚境线。';
}
