/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { WorldRuntimeNpcQuestWriteService } from '../world-runtime-npc-quest-write.service';
import { buildStructuredNotice } from '../structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';
import { PVP_SHA_BACKLASH_BUFF_ID, PVP_SHA_INFUSION_BUFF_ID } from '../../../constants/gameplay/pvp';

const { normalizeRuntimeActionId, parseRuntimeInstanceDescriptor } = world_runtime_normalization_helpers_1;

/** world-runtime action execution orchestration：承接动作入口分流与低频 toggle/交互编排。 */
@Injectable()
export class WorldRuntimeActionExecutionService {
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

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldRuntimeNpcQuestWriteService) worldRuntimeNpcQuestWriteService: any,
    ) {
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
                throw new ServiceUnavailableException(`地图实例 ${instance.meta.instanceId} 租约不可写`);
            }
        }

        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);

        const rawActionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!rawActionId) {
            throw new BadRequestException('动作 ID 不能为空');
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
        if (actionId.startsWith('tower:tongtian:')) {
            const view = deps.worldRuntimeTongtianTowerService?.executeAction?.(playerId, actionId, deps);
            if (!view) {
                throw new BadRequestException('未知的通天塔动作');
            }
            if (typeof deps.refreshPlayerContextActions === 'function') {
                deps.refreshPlayerContextActions(playerId, view);
            }
            return {
                kind: 'queued',
                view,
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
                throw new BadRequestException('底蕴数量不能为空');
            }
            const result = this.playerRuntimeService.infuseBodyTraining(playerId, foundationAmount);
            const nBodyTraining = buildStructuredNotice('success', 'notice.action.body-training-convert', `你将 ${result.foundationSpent} 点底蕴灌入肉身，转化为 ${result.expGained} 点炼体经验`, {
                vars: { foundationSpent: result.foundationSpent, expGained: result.expGained },
            });
            deps.queuePlayerNotice(playerId, nBodyTraining.text, nBodyTraining.kind, undefined, undefined, nBodyTraining.structured);
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
            if (nextActive) {
                deps.worldRuntimeCraftInterruptService?.interruptCraftForReason(playerId, player, 'cultivate', deps);
            }
            this.playerRuntimeService.updateCombatSettings(playerId, { cultivationActive: nextActive }, currentTick);
            const cultText = nextActive ? '已恢复当前修炼' : '已停止当前修炼';
            const nCult = buildStructuredNotice('info', 'notice.action.cultivation-toggled', cultText, {
                vars: { state: nextActive ? 'resumed' : 'stopped' },
            });
            deps.queuePlayerNotice(playerId, nCult.text, nCult.kind, undefined, undefined, nCult.structured);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_switch_cultivation') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoSwitchCultivation', deps);
        }
        if (actionId === 'realm:auto_refine_root_foundation' || actionId.startsWith('realm:auto_refine_root_foundation:')) {
            const mode = actionId.slice('realm:auto_refine_root_foundation'.length).replace(/^:/, '');
            const enabled = mode === 'on'
                || (mode !== 'off' && (targetInput === true
                || targetInput === 1
                || targetInput === '1'
                || targetInput === 'true'
                || targetInput === 'on'));
            let player = null;
            if (typeof this.playerRuntimeService.updateAutoRootFoundation === 'function') {
                player = this.playerRuntimeService.updateAutoRootFoundation(playerId, enabled, currentTick);
            }
            else {
                player = this.playerRuntimeService.updateCombatSettings(playerId, { autoRootFoundation: enabled }, currentTick);
            }
            const enabledAfterUpdate = player?.combat?.autoRootFoundation === true;
            deps.queuePlayerNotice(
                playerId,
                enabledAfterUpdate
                    ? '已开启自动凝练根基，修为和材料满足时会每息检测并自动凝练。'
                    : enabled
                        ? '根基已达当前境界上限，已关闭自动凝练根基。'
                        : '已关闭自动凝练根基。',
                'info',
            );
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'sense_qi:toggle') {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const nextActive = !player.combat.senseQiActive;
            this.playerRuntimeService.updateCombatSettings(playerId, { senseQiActive: nextActive, wangQiActive: nextActive ? false : player.combat.wangQiActive === true }, currentTick);
            const senseText = nextActive ? '已开启感气视角' : '已关闭感气视角';
            const nSense = buildStructuredNotice('info', 'notice.action.aura-sense-toggled', senseText, {
                vars: { state: nextActive ? 'on' : 'off' },
            });
            deps.queuePlayerNotice(playerId, nSense.text, nSense.kind, undefined, undefined, nSense.structured);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'wang_qi:toggle') {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (!hasEquippedItem(player, 'equip.copper_luopan')) {
                const nCompass = buildStructuredNotice('warn', 'notice.action.compass-required', '需要装备铜罗盘才能望气');
                deps.queuePlayerNotice(playerId, nCompass.text, nCompass.kind, undefined, undefined, nCompass.structured);
                return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
            }
            const nextActive = !player.combat.wangQiActive;
            this.playerRuntimeService.updateCombatSettings(playerId, { wangQiActive: nextActive, senseQiActive: nextActive ? false : player.combat.senseQiActive === true }, currentTick);
            const wangText = nextActive ? '已开启望气视角' : '已关闭望气视角';
            const nWang = buildStructuredNotice('info', 'notice.action.qi-sense-toggled', wangText, {
                vars: { state: nextActive ? 'on' : 'off' },
            });
            deps.queuePlayerNotice(playerId, nWang.text, nWang.kind, undefined, undefined, nWang.structured);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
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
        if (actionId.startsWith('building:start:')) {
            const buildingId = actionId.slice('building:start:'.length).trim();
            if (!buildingId) {
                throw new BadRequestException('建筑 ID 不能为空');
            }
            deps.enqueuePendingCommand(playerId, {
                kind: 'startBuilding',
                buildingId,
            });
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
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
                throw new BadRequestException('场景人物 ID 不能为空');
            }
            return this.worldRuntimeNpcQuestWriteService.executeNpcQuestAction(playerId, npcId, deps);
        }
        throw new BadRequestException(`不支持的动作：${actionId}`);
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
            throw new BadRequestException('跨界目标不能为空');
        }
        const currentView = deps.getPlayerViewOrThrow(playerId);
        if (!hasNearbyManualPortal(currentView)) {
            throw new BadRequestException('需要站在界门附近才能进行世界迁移');
        }
        if (linePreset === 'peaceful' && (this.playerRuntimeService.hasActiveBuff?.(playerId, PVP_SHA_INFUSION_BUFF_ID)
            || this.playerRuntimeService.hasActiveBuff?.(playerId, PVP_SHA_BACKLASH_BUFF_ID))) {
            throw new BadRequestException('煞气入体或煞气反噬期间无法迁回虚境');
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
            throw new BadRequestException('当前未处于有效地图，无法切换世界');
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

function hasEquippedItem(player, itemId) {
    return (player?.equipment?.slots ?? []).some((entry) => entry?.item?.itemId === itemId);
}

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
