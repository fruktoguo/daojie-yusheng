import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { WorldRuntimeUseItemService } from '../world-runtime-use-item.service';
import { WorldRuntimeEquipmentService } from '../world-runtime-equipment.service';
import { WorldRuntimeItemGroundService } from '../world-runtime-item-ground.service';
import { WorldRuntimeNavigationService } from '../world-runtime-navigation.service';
import { WorldRuntimeCombatCommandService } from '../combat/world-runtime-combat-command.service';
import { WorldRuntimeCultivationService } from '../world-runtime-cultivation.service';
import { WorldRuntimeAlchemyService } from '../world-runtime-alchemy.service';
import { WorldRuntimeEnhancementService } from '../world-runtime-enhancement.service';
import { WorldRuntimeRedeemCodeService } from '../world-runtime-redeem-code.service';
import { WorldRuntimeProgressionService } from '../world-runtime-progression.service';
import { WorldRuntimeNpcShopService } from '../world-runtime-npc-shop.service';
import { WorldRuntimeNpcQuestWriteService } from '../world-runtime-npc-quest-write.service';

const PLAYER_COMBAT_COMMAND_KINDS = new Set(['basicAttack', 'castSkill']);

function resolveActionsPerTurn(player) {
    const rawValue = Number(player?.attrs?.numericStats?.actionsPerTurn ?? 1);
    if (!Number.isFinite(rawValue)) {
        return 1;
    }
    return Math.max(1, Math.trunc(rawValue));
}

function normalizeCombatActionCounter(player, currentTick) {
    if (!player.combat) {
        player.combat = {};
    }
    const combat = player.combat;
    if (combat.combatActionTick !== currentTick) {
        combat.combatActionTick = currentTick;
        combat.combatActionsUsedThisTick = 0;
    }
    return Math.max(0, Math.trunc(Number(combat.combatActionsUsedThisTick ?? 0)));
}

function assertCombatActionReady(player, currentTick) {
    if (currentTick <= 0) {
        return;
    }
    const actionsPerTurn = resolveActionsPerTurn(player);
    const used = normalizeCombatActionCounter(player, currentTick);
    if (used >= actionsPerTurn) {
        throw new BadRequestException('本回合行动次数已用尽');
    }
}

function recordCombatAction(player, currentTick) {
    if (currentTick <= 0) {
        return;
    }
    const used = normalizeCombatActionCounter(player, currentTick);
    player.combat.combatActionsUsedThisTick = used + 1;
}

/** world-runtime player-command orchestration：承接玩家命令路由与门禁。 */
@Injectable()
export class WorldRuntimePlayerCommandService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * worldRuntimeUseItemService：世界运行态Use道具服务引用。
 */

    worldRuntimeUseItemService;
    /**
 * worldRuntimeEquipmentService：世界运行态装备服务引用。
 */

    worldRuntimeEquipmentService;
    /**
 * worldRuntimeItemGroundService：世界运行态道具Ground服务引用。
 */

    worldRuntimeItemGroundService;
    /**
 * worldRuntimeNavigationService：世界运行态导航服务引用。
 */

    worldRuntimeNavigationService;
    /**
 * worldRuntimeCombatCommandService：世界运行态战斗Command服务引用。
 */

    worldRuntimeCombatCommandService;
    /**
 * worldRuntimeCultivationService：世界运行态Cultivation服务引用。
 */

    worldRuntimeCultivationService;
    /**
 * worldRuntimeAlchemyService：世界运行态炼丹服务引用。
 */

    worldRuntimeAlchemyService;
    /**
 * worldRuntimeEnhancementService：世界运行态强化服务引用。
 */

    worldRuntimeEnhancementService;
    /**
 * worldRuntimeRedeemCodeService：世界运行态RedeemCode服务引用。
 */

    worldRuntimeRedeemCodeService;
    /**
 * worldRuntimeProgressionService：世界运行态修炼进度服务引用。
 */

    worldRuntimeProgressionService;
    /**
 * worldRuntimeNpcShopService：世界运行态NPCShop服务引用。
 */

    worldRuntimeNpcShopService;
    /**
 * worldRuntimeNpcQuestWriteService：世界运行态NPC任务Write服务引用。
 */

    worldRuntimeNpcQuestWriteService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeUseItemService 参数说明。
 * @param worldRuntimeEquipmentService 参数说明。
 * @param worldRuntimeItemGroundService 参数说明。
 * @param worldRuntimeNavigationService 参数说明。
 * @param worldRuntimeCombatCommandService 参数说明。
 * @param worldRuntimeCultivationService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @param worldRuntimeRedeemCodeService 参数说明。
 * @param worldRuntimeProgressionService 参数说明。
 * @param worldRuntimeNpcShopService 参数说明。
 * @param worldRuntimeNpcQuestWriteService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldRuntimeUseItemService) worldRuntimeUseItemService: any,
        @Inject(WorldRuntimeEquipmentService) worldRuntimeEquipmentService: any,
        @Inject(WorldRuntimeItemGroundService) worldRuntimeItemGroundService: any,
        @Inject(WorldRuntimeNavigationService) worldRuntimeNavigationService: any,
        @Inject(WorldRuntimeCombatCommandService) worldRuntimeCombatCommandService: any,
        @Inject(WorldRuntimeCultivationService) worldRuntimeCultivationService: any,
        @Inject(WorldRuntimeAlchemyService) worldRuntimeAlchemyService: any,
        @Inject(WorldRuntimeEnhancementService) worldRuntimeEnhancementService: any,
        @Inject(WorldRuntimeRedeemCodeService) worldRuntimeRedeemCodeService: any,
        @Inject(WorldRuntimeProgressionService) worldRuntimeProgressionService: any,
        @Inject(WorldRuntimeNpcShopService) worldRuntimeNpcShopService: any,
        @Inject(WorldRuntimeNpcQuestWriteService) worldRuntimeNpcQuestWriteService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeUseItemService = worldRuntimeUseItemService;
        this.worldRuntimeEquipmentService = worldRuntimeEquipmentService;
        this.worldRuntimeItemGroundService = worldRuntimeItemGroundService;
        this.worldRuntimeNavigationService = worldRuntimeNavigationService;
        this.worldRuntimeCombatCommandService = worldRuntimeCombatCommandService;
        this.worldRuntimeCultivationService = worldRuntimeCultivationService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;
        this.worldRuntimeRedeemCodeService = worldRuntimeRedeemCodeService;
        this.worldRuntimeProgressionService = worldRuntimeProgressionService;
        this.worldRuntimeNpcShopService = worldRuntimeNpcShopService;
        this.worldRuntimeNpcQuestWriteService = worldRuntimeNpcQuestWriteService;
    }
    /**
 * dispatchStartTechniqueActivity：统一开始技艺活动命令分发。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    async dispatchStartTechniqueActivity(playerId, kind, payload, deps) {
        switch (kind) {
            case 'alchemy':
                return this.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, payload, deps);
            case 'forging':
                return this.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, { ...(payload ?? {}), kind: 'forging' }, deps);
            case 'enhancement':
                return this.worldRuntimeEnhancementService.dispatchStartEnhancement(playerId, payload, deps);
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.worldRuntimeLootContainerService.dispatchStartGather(playerId, payload, deps),
                    'gather',
                    deps,
                );
                return;
        }
    }
    /**
 * dispatchCancelTechniqueActivity：统一取消技艺活动命令分发。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    async dispatchCancelTechniqueActivity(playerId, kind, deps) {
        switch (kind) {
            case 'alchemy':
                return this.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps);
            case 'forging':
                return this.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps, 'forging');
            case 'enhancement':
                return this.worldRuntimeEnhancementService.dispatchCancelEnhancement(playerId, deps);
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.worldRuntimeLootContainerService.dispatchCancelGather(playerId, deps),
                    'gather',
                    deps,
                );
                return;
        }
    }
    /**
 * dispatchPlayerCommand：判断玩家Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Command相关状态。
 */

    async dispatchPlayerCommand(playerId, command, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0 && command.kind !== 'redeemCodes') {
            return;
        }
        if (player.combat?.pendingSkillCast && (command.kind === 'startAlchemy' || command.kind === 'startEnhancement' || command.kind === 'startGather' || command.kind === 'startBuilding')) {
            const pendingActivityText = command.kind === 'startEnhancement'
                ? '吟唱中无法分心强化。'
                : command.kind === 'startGather'
                    ? '吟唱中无法分心采集。'
                    : command.kind === 'startBuilding'
                        ? '吟唱中无法分心营造。'
                        : '吟唱中无法分心炼丹。';
            deps.queuePlayerNotice?.(playerId, pendingActivityText, 'system');
            return;
        }
        switch (command.kind) {
            case 'useItem':
                this.worldRuntimeUseItemService.dispatchUseItem(playerId, command.slotIndex, deps, command.payload);
                return;
            case 'createFormation':
                deps.worldRuntimeFormationService.dispatchCreateFormation(playerId, command.payload, deps);
                return;
            case 'setFormationActive':
                deps.worldRuntimeFormationService.dispatchSetFormationActive(playerId, command.payload, deps);
                return;
            case 'refillFormation':
                deps.worldRuntimeFormationService.dispatchRefillFormation(playerId, command.payload, deps);
                return;
            case 'equip':
                return this.worldRuntimeEquipmentService.dispatchEquipItem(playerId, command.slotIndex, deps);
                return;
            case 'dropItem':
                this.worldRuntimeItemGroundService.dispatchDropItem(playerId, command.slotIndex, command.count, deps);
                return;
            case 'moveTo':
                this.worldRuntimeNavigationService.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint, deps);
                return;
            case 'basicAttack':
                return this.dispatchCombatCommand(playerId, player, command, deps, () => this.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, deps));
            case 'engageBattle':
                return this.dispatchCombatCommand(playerId, player, command, deps, () => this.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked, deps));
            case 'takeGround':
                return this.worldRuntimeItemGroundService.dispatchTakeGround(playerId, command.sourceId, command.itemKey, deps);
            case 'takeGroundAll':
                return this.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, command.sourceId, deps);
            case 'unequip':
                return this.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, command.slot, deps);
                return;
            case 'cultivate':
                this.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, command.techniqueId, deps);
                return;
            case 'startAlchemy':
                return this.dispatchStartTechniqueActivity(playerId, 'alchemy', command.payload, deps);
            case 'cancelAlchemy':
                return this.dispatchCancelTechniqueActivity(playerId, 'alchemy', deps);
            case 'startForging':
                return this.dispatchStartTechniqueActivity(playerId, 'forging', command.payload, deps);
            case 'cancelForging':
                return this.dispatchCancelTechniqueActivity(playerId, 'forging', deps);
            case 'saveAlchemyPreset':
                this.worldRuntimeAlchemyService.dispatchSaveAlchemyPreset(playerId, command.payload, deps);
                return;
            case 'deleteAlchemyPreset':
                this.worldRuntimeAlchemyService.dispatchDeleteAlchemyPreset(playerId, command.presetId, deps);
                return;
            case 'startEnhancement':
                return this.dispatchStartTechniqueActivity(playerId, 'enhancement', command.payload, deps);
            case 'cancelEnhancement':
                return this.dispatchCancelTechniqueActivity(playerId, 'enhancement', deps);
            case 'startGather':
                this.dispatchStartTechniqueActivity(playerId, 'gather', command.payload, deps);
                return;
            case 'cancelGather':
                this.dispatchCancelTechniqueActivity(playerId, 'gather', deps);
                return;
            case 'startBuilding':
                deps.dispatchStartBuildingConstruction(playerId, command.buildingId);
                return;
            case 'redeemCodes':
                return this.worldRuntimeRedeemCodeService.dispatchRedeemCodes(playerId, command.codes, deps);
            case 'breakthrough':
                this.worldRuntimeProgressionService.dispatchBreakthrough(playerId, deps);
                return;
            case 'refineRootFoundation':
                this.worldRuntimeProgressionService.dispatchRootFoundationRefine(playerId, deps);
                return;
            case 'heavenGateAction':
                this.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, command.action, command.element, deps);
                return;
            case 'castSkill':
                return this.dispatchCombatCommand(playerId, player, command, deps, () => this.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef, deps));
            case 'buyNpcShopItem':
                return this.worldRuntimeNpcShopService.dispatchBuyNpcShopItem(playerId, command.npcId, command.itemId, command.quantity, deps);
                return;
            case 'npcInteraction':
                return this.worldRuntimeNpcQuestWriteService.dispatchNpcInteraction(playerId, command.npcId, deps);
                return;
            case 'interactNpcQuest':
                this.worldRuntimeNpcQuestWriteService.dispatchInteractNpcQuest(playerId, command.npcId, deps);
                return;
            case 'acceptNpcQuest':
                this.worldRuntimeNpcQuestWriteService.dispatchAcceptNpcQuest(playerId, command.npcId, command.questId, deps);
                return;
            case 'submitNpcQuest':
                return this.worldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuest(playerId, command.npcId, command.questId, deps);
                return;
        }
    }
    async dispatchCombatCommand(playerId, player, command, deps, executor) {
        const shouldCheckActionReady = PLAYER_COMBAT_COMMAND_KINDS.has(command.kind) && command.skipActionReadyCheck !== true;
        const currentTick = shouldCheckActionReady && typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? Math.max(0, Math.trunc(deps.resolveCurrentTickForPlayerId(playerId)))
            : 0;
        if (player.combat?.pendingSkillCast) {
            throw new BadRequestException(command.kind === 'castSkill'
                ? '正在吟唱中，无法继续施法。'
                : '正在吟唱中，无法执行战斗动作。');
        }
        if (shouldCheckActionReady) {
            assertCombatActionReady(player, currentTick);
        }
        const result = await executor();
        if (shouldCheckActionReady) {
            recordCombatAction(player, currentTick);
        }
        return result;
    }
};
