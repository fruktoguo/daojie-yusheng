/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { isOreMinableTileType } from '@mud/shared';
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

function normalizeTechniqueActivityKind(kind) {
    return kind === 'forging'
        || kind === 'enhancement'
        || kind === 'transmission'
        || kind === 'gather'
        || kind === 'building'
        || kind === 'mining'
        || kind === 'formation'
        ? kind
        : 'alchemy';
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hasRunningTechniqueActivityJob(job) {
    return Boolean(job && (Number(job.remainingTicks) > 0 || Number(job.workRemainingTicks) > 0));
}

function isDuplicateTechniqueTransmissionStart(playerRuntimeService, teacherPlayerId, command) {
    if (command?.kind !== 'startTechniqueTransmission') {
        return false;
    }
    const mode = command.mode === 'scripture_recording' || command.mode === 'scripture_contemplation'
        ? command.mode
        : 'transmission';
    const learnerPlayerId = mode === 'transmission'
        ? normalizeText(command.learnerPlayerId)
        : teacherPlayerId;
    if (!learnerPlayerId || typeof playerRuntimeService?.getPlayer !== 'function') {
        return false;
    }
    const learner = playerRuntimeService.getPlayer(learnerPlayerId);
    const job = learner?.transmissionJob;
    if (!hasRunningTechniqueActivityJob(job)) {
        return false;
    }
    const jobType = normalizeText(job.jobType) || 'transmission';
    if (jobType !== mode) {
        return false;
    }
    if (mode === 'transmission') {
        return normalizeText(job.techniqueId) === normalizeText(command.techniqueId)
            && normalizeText(job.teacherPlayerId) === teacherPlayerId;
    }
    const buildingId = normalizeText(command.buildingId);
    if (!buildingId || normalizeText(job.buildingId) !== buildingId) {
        return false;
    }
    if (mode === 'scripture_recording') {
        return normalizeText(job.techniqueId) === normalizeText(command.techniqueId);
    }
    return true;
}

function removeTechniqueActivityQueueItem(player, queueId) {
    const normalizedQueueId = typeof queueId === 'string' ? queueId.trim() : '';
    if (!normalizedQueueId || !player || typeof player !== 'object') {
        return false;
    }
    let removed = false;
    if (Array.isArray(player.techniqueActivityQueue)) {
        const nextQueue = player.techniqueActivityQueue.filter((item) => item?.queueId !== normalizedQueueId);
        removed = nextQueue.length !== player.techniqueActivityQueue.length;
        player.techniqueActivityQueue = nextQueue;
    }
    for (const holder of [player.alchemyJob, player.forgingJob, player.enhancementJob]) {
        if (!Array.isArray(holder?.queuedJobs)) {
            continue;
        }
        const nextQueue = holder.queuedJobs.filter((item) => item?.queueId !== normalizedQueueId);
        if (nextQueue.length !== holder.queuedJobs.length) {
            holder.queuedJobs = nextQueue;
            removed = true;
        }
    }
    return removed;
}

function requestPlayerDeltaSync(deps, playerId) {
    deps?.requestPlayerDeltaSync?.(playerId);
}

function resolveTechniqueActivityJob(player, kind) {
    if (!player || typeof player !== 'object') {
        return null;
    }
    if (kind === 'forging') {
        return player.forgingJob ?? (player.alchemyJob?.jobType === 'forging' ? player.alchemyJob : null);
    }
    if (kind === 'enhancement') {
        return player.enhancementJob ?? null;
    }
    if (kind === 'transmission') {
        return player.transmissionJob ?? null;
    }
    if (kind === 'gather') {
        return player.gatherJob ?? null;
    }
    if (kind === 'building') {
        return player.buildingJob ?? null;
    }
    if (kind === 'formation') {
        return player.formationJob ?? null;
    }
    if (kind === 'mining') {
        return player.miningJob ?? null;
    }
    return player.alchemyJob?.jobType === 'forging' ? null : player.alchemyJob ?? null;
}

function resolveMiningJobTargetRef(job) {
    if (!job || !Number.isFinite(Number(job.targetX)) || !Number.isFinite(Number(job.targetY))) {
        return '';
    }
    return `tile:${Math.trunc(Number(job.targetX))}:${Math.trunc(Number(job.targetY))}`;
}

function resolveMiningCommandTargetRef(command) {
    const explicitRef = typeof command?.miningTargetRef === 'string' ? command.miningTargetRef.trim() : '';
    if (explicitRef) {
        return explicitRef;
    }
    const targetRef = typeof command?.targetRef === 'string' ? command.targetRef.trim() : '';
    if (targetRef) {
        return targetRef;
    }
    if (
        Number.isFinite(Number(command?.targetX))
        && Number.isFinite(Number(command?.targetY))
        && !command?.targetPlayerId
        && !command?.targetMonsterId
    ) {
        return `tile:${Math.trunc(Number(command.targetX))}:${Math.trunc(Number(command.targetY))}`;
    }
    return '';
}

function resolveMiningJobCommandMarker(player, command) {
    const jobRunId = typeof command?.miningJobRunId === 'string' ? command.miningJobRunId.trim() : '';
    const job = player?.miningJob;
    if (!jobRunId || job?.jobRunId !== jobRunId) {
        return null;
    }
    const expectedTargetRef = resolveMiningJobTargetRef(job);
    const commandTargetRef = resolveMiningCommandTargetRef(command);
    if (!expectedTargetRef || commandTargetRef !== expectedTargetRef) {
        return null;
    }
    return { jobRunId, targetRef: expectedTargetRef };
}

function hasMiningJobCommandMarker(command) {
    return typeof command?.miningJobRunId === 'string' && command.miningJobRunId.trim().length > 0;
}

function doesCancelRefMatchActiveJob(player, kind, cancelRef) {
    const expectedJobRunId = typeof cancelRef?.jobRunId === 'string' ? cancelRef.jobRunId.trim() : '';
    if (!expectedJobRunId) {
        return true;
    }
    return resolveTechniqueActivityJob(player, kind)?.jobRunId === expectedJobRunId;
}

function normalizeCancelRefTechniqueId(cancelRef) {
    return typeof cancelRef?.techId === 'string' && cancelRef.techId.trim() ? cancelRef.techId.trim() : '';
}

function resolveForcedAttackMiningPayload(player, command, deps) {
    if (command?.kind !== 'engageBattle' || command?.locked !== true) {
        return null;
    }
    if (resolveMiningJobCommandMarker(player, command)) {
        return null;
    }
    if (command.targetPlayerId || command.targetMonsterId) {
        return null;
    }
    if (!Number.isFinite(Number(command.targetX)) || !Number.isFinite(Number(command.targetY))) {
        return null;
    }
    const x = Math.trunc(Number(command.targetX));
    const y = Math.trunc(Number(command.targetY));
    const instance = player?.instanceId
        ? (typeof deps?.getInstanceRuntime === 'function'
            ? deps.getInstanceRuntime(player.instanceId)
            : (typeof deps?.getInstanceRuntimeOrThrow === 'function'
                ? deps.getInstanceRuntimeOrThrow(player.instanceId)
                : null))
        : null;
    const tileState = typeof instance?.getTileCombatState === 'function'
        ? instance.getTileCombatState(x, y)
        : null;
    if (!tileState || tileState.destroyed === true || !isOreMinableTileType(tileState.tileType)) {
        return null;
    }
    return { targetRef: `tile:${x}:${y}` };
}

async function runWithMiningJobCombatMarker(player, command, executor) {
    const marker = resolveMiningJobCommandMarker(player, command);
    if (!marker) {
        return executor();
    }
    const previousRunId = player.suppressCraftInterruptForMiningJobRunId;
    const previousTargetRef = player.suppressCraftInterruptForMiningTargetRef;
    player.suppressCraftInterruptForMiningJobRunId = marker.jobRunId;
    player.suppressCraftInterruptForMiningTargetRef = marker.targetRef;
    try {
        return await executor();
    }
    finally {
        if (previousRunId === undefined) {
            delete player.suppressCraftInterruptForMiningJobRunId;
        }
        else {
            player.suppressCraftInterruptForMiningJobRunId = previousRunId;
        }
        if (previousTargetRef === undefined) {
            delete player.suppressCraftInterruptForMiningTargetRef;
        }
        else {
            player.suppressCraftInterruptForMiningTargetRef = previousTargetRef;
        }
    }
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
            case 'transmission': {
                const learnerPlayerId = typeof payload?.learnerPlayerId === 'string' && payload.learnerPlayerId.trim()
                    ? payload.learnerPlayerId.trim()
                    : playerId;
                const learner = this.playerRuntimeService.getPlayerOrThrow(learnerPlayerId);
                const result = deps.craftPanelRuntimeService.startTechniqueActivity(
                    learner,
                    'transmission',
                    {
                        ...(payload ?? {}),
                        learnerPlayerId,
                        teacherPlayerId: typeof payload?.teacherPlayerId === 'string' && payload.teacherPlayerId.trim()
                            ? payload.teacherPlayerId.trim()
                            : playerId,
                    },
                    deps,
                );
                if (!result.ok) {
                    throw new BadRequestException(result.error ?? '启动传法失败');
                }
                deps.worldRuntimeCraftMutationService.flushCraftMutation(learnerPlayerId, result, 'transmission', deps);
                return;
            }
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.startTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'gather',
                        payload,
                        deps,
                    ),
                    'gather',
                    deps,
                );
                return;
            case 'mining':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.startTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'mining',
                        payload,
                        deps,
                    ),
                    'mining',
                    deps,
                );
                return;
            case 'building':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.startTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'building',
                        payload,
                        deps,
                    ),
                    'building',
                    deps,
                );
                return;
            case 'formation':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.startTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'formation',
                        payload,
                        deps,
                    ),
                    'formation',
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
            case 'transmission':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.cancelTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'transmission',
                        deps,
                    ),
                    'transmission',
                    deps,
                );
                return;
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.cancelTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'gather',
                        deps,
                    ),
                    'gather',
                    deps,
                );
                return;
            case 'mining':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.cancelTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'mining',
                        deps,
                    ),
                    'mining',
                    deps,
                );
                return;
            case 'building':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.cancelTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'building',
                        deps,
                    ),
                    'building',
                    deps,
                );
                return;
            case 'formation':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.craftPanelRuntimeService.cancelTechniqueActivity(
                        this.playerRuntimeService.getPlayerOrThrow(playerId),
                        'formation',
                        deps,
                    ),
                    'formation',
                    deps,
                );
                return;
        }
    }
    /** 统一任务列表取消入口：可取消队列项，也可按 jobRunId 保护性取消当前 job。 */
    async dispatchCancelTechniqueActivityByRef(playerId, cancelRef, deps) {
        const kind = normalizeTechniqueActivityKind(cancelRef?.kind);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const queueId = typeof cancelRef?.queueId === 'string' ? cancelRef.queueId.trim() : '';
        if (queueId) {
            if (removeTechniqueActivityQueueItem(player, queueId)) {
                this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
                this.playerRuntimeService.bumpPersistentRevision?.(player);
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    { ok: true, panelChanged: true, groundDrops: [], messages: [] },
                    kind,
                    deps,
                );
            }
            return;
        }
        if (!doesCancelRefMatchActiveJob(player, kind, cancelRef)) {
            return;
        }
        return this.dispatchCancelTechniqueActivity(playerId, kind, deps);
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
        if (player.combat?.pendingSkillCast && (command.kind === 'startAlchemy' || command.kind === 'startEnhancement' || command.kind === 'startGather' || command.kind === 'startMining' || command.kind === 'startBuilding' || command.kind === 'startFormationMaintenance')) {
            const pendingActivityText = command.kind === 'startEnhancement'
                ? '吟唱中无法分心强化。'
                : command.kind === 'startGather'
                    ? '吟唱中无法分心采集。'
                    : command.kind === 'startMining'
                        ? '吟唱中无法分心挖矿。'
                        : command.kind === 'startBuilding'
                            ? '吟唱中无法分心营造。'
                            : command.kind === 'startFormationMaintenance'
                                ? '吟唱中无法分心维护阵法。'
                                : '吟唱中无法分心炼丹。';
            deps.queuePlayerNotice?.(playerId, pendingActivityText, 'system');
            return;
        }
        switch (command.kind) {
            case 'useItem':
                await this.worldRuntimeUseItemService.dispatchUseItem(playerId, command.itemInstanceId, deps, command.payload);
                return;
            case 'createFormation':
                deps.worldRuntimeFormationService.dispatchCreateFormation(playerId, command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'setFormationActive':
                deps.worldRuntimeFormationService.dispatchSetFormationActive(playerId, command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'refillFormation':
                deps.worldRuntimeFormationService.dispatchRefillFormation(playerId, command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'equip':
                return this.worldRuntimeEquipmentService.dispatchEquipItem(playerId, command.itemInstanceId, deps);
                return;
            case 'setArtifactSlotEnabled':
                return this.worldRuntimeEquipmentService.dispatchSetArtifactSlotEnabled(playerId, command.slot, command.enabled, deps);
            case 'dropItem':
                this.worldRuntimeItemGroundService.dispatchDropItem(playerId, command.itemInstanceId, command.count, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'moveTo':
                this.worldRuntimeNavigationService.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint, command.mapId, deps);
                return;
            case 'basicAttack':
                if (hasMiningJobCommandMarker(command) && !resolveMiningJobCommandMarker(player, command)) {
                    return;
                }
                return this.dispatchCombatCommand(playerId, player, command, deps, () => runWithMiningJobCombatMarker(player, command, () => this.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, deps)));
            case 'engageBattle': {
                if (hasMiningJobCommandMarker(command) && !resolveMiningJobCommandMarker(player, command)) {
                    return;
                }
                const miningPayload = resolveForcedAttackMiningPayload(player, command, deps);
                if (miningPayload) {
                    if (player.combat?.pendingSkillCast) {
                        deps.queuePlayerNotice?.(playerId, '吟唱中无法分心挖矿。', 'system');
                        return;
                    }
                    return this.dispatchStartTechniqueActivity(playerId, 'mining', miningPayload, deps);
                }
                return this.dispatchCombatCommand(playerId, player, command, deps, () => runWithMiningJobCombatMarker(player, command, () => this.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked, deps)));
            }
            case 'takeGround':
                await this.worldRuntimeItemGroundService.dispatchTakeGround(playerId, command.sourceId, command.itemKey, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'takeGroundAll':
                await this.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, command.sourceId, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'unequip':
                return this.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, command.slot, deps, command.expectedItemInstanceId);
                return;
            case 'cultivate':
                this.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, command.techniqueId, deps);
                return;
            case 'forgetTechnique':
                this.worldRuntimeCultivationService.dispatchForgetTechnique(playerId, command.techniqueId, deps);
                return;
            case 'startTechniqueTransmission':
                if (isDuplicateTechniqueTransmissionStart(this.playerRuntimeService, playerId, command)) {
                    return;
                }
                if (command.mode === 'scripture_recording' || command.mode === 'scripture_contemplation') {
                    return this.dispatchStartTechniqueActivity(
                        playerId,
                        'transmission',
                        {
                            mode: command.mode,
                            learnerPlayerId: playerId,
                            techniqueId: command.techniqueId,
                            buildingId: command.buildingId,
                        },
                        deps,
                    );
                }
                return this.dispatchStartTechniqueActivity(
                    command.learnerPlayerId,
                    'transmission',
                    { learnerPlayerId: command.learnerPlayerId, teacherPlayerId: playerId, techniqueId: command.techniqueId },
                    deps,
                );
            case 'cancelTechniqueTransmission':
                return this.dispatchCancelTechniqueActivity(playerId, 'transmission', deps);
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
                await this.dispatchStartTechniqueActivity(playerId, 'gather', command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'cancelGather':
                await this.dispatchCancelTechniqueActivity(playerId, 'gather', deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'startMining':
                await this.dispatchStartTechniqueActivity(playerId, 'mining', command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'cancelMining':
                await this.dispatchCancelTechniqueActivity(playerId, 'mining', deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'startBuilding':
                await this.dispatchStartTechniqueActivity(playerId, 'building', { buildingId: command.buildingId }, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'cancelBuilding':
                await this.dispatchCancelTechniqueActivity(playerId, 'building', deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'startFormationMaintenance':
                await this.dispatchStartTechniqueActivity(playerId, 'formation', command.payload, deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'cancelFormationMaintenance':
                await this.dispatchCancelTechniqueActivity(playerId, 'formation', deps);
                requestPlayerDeltaSync(deps, playerId);
                return;
            case 'cancelTechniqueActivity':
                return this.dispatchCancelTechniqueActivityByRef(playerId, command.cancelRef, deps);
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
                if (hasMiningJobCommandMarker(command) && !resolveMiningJobCommandMarker(player, command)) {
                    return;
                }
                return this.dispatchCombatCommand(playerId, player, command, deps, () => runWithMiningJobCombatMarker(player, command, () => this.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef, deps)));
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
