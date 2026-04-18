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

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};

var WorldRuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const movement_debug_1 = require("../../debug/movement-debug");

const next_gm_constants_1 = require("../../http/next/next-gm.constants");

const content_template_repository_1 = require("../../content/content-template.repository");

const world_session_service_1 = require("../../network/world-session.service");

const world_client_event_service_1 = require("../../network/world-client-event.service");

const map_persistence_service_1 = require("../../persistence/map-persistence.service");

const redeem_code_runtime_service_1 = require("../redeem/redeem-code-runtime.service");

const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");

const world_runtime_npc_shop_query_service_1 = require("./world-runtime-npc-shop-query.service");

const world_runtime_quest_query_service_1 = require("./world-runtime-quest-query.service");

const world_runtime_detail_query_service_1 = require("./world-runtime-detail-query.service");

const world_runtime_metrics_service_1 = require("./world-runtime-metrics.service");

const world_runtime_instance_tick_orchestration_service_1 = require("./world-runtime-instance-tick-orchestration.service");

const world_runtime_movement_service_1 = require("./world-runtime-movement.service");

const world_runtime_summary_query_service_1 = require("./world-runtime-summary-query.service");

const world_runtime_instance_state_service_1 = require("./world-runtime-instance-state.service");

const world_runtime_instance_query_service_1 = require("./world-runtime-instance-query.service");

const world_runtime_pending_command_service_1 = require("./world-runtime-pending-command.service");

const world_runtime_player_location_service_1 = require("./world-runtime-player-location.service");

const world_runtime_tick_progress_service_1 = require("./world-runtime-tick-progress.service");

const world_runtime_npc_quest_interaction_query_service_1 = require("./world-runtime-npc-quest-interaction-query.service");

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");

const world_runtime_respawn_service_1 = require("./world-runtime-respawn.service");

const world_runtime_craft_service_1 = require("./world-runtime-craft.service");

const world_runtime_npc_quest_shop_service_1 = require("./world-runtime-npc-quest-shop.service");

const world_runtime_loot_container_service_1 = require("./world-runtime-loot-container.service");

const world_runtime_navigation_service_1 = require("./world-runtime-navigation.service");

const world_runtime_combat_effects_service_1 = require("./world-runtime-combat-effects.service");

const world_runtime_monster_action_apply_service_1 = require("./world-runtime-monster-action-apply.service");

const world_runtime_basic_attack_service_1 = require("./world-runtime-basic-attack.service");

const world_runtime_player_combat_service_1 = require("./world-runtime-player-combat.service");

const world_runtime_item_ground_service_1 = require("./world-runtime-item-ground.service");

const world_runtime_equipment_service_1 = require("./world-runtime-equipment.service");

const world_runtime_cultivation_service_1 = require("./world-runtime-cultivation.service");

const world_runtime_progression_service_1 = require("./world-runtime-progression.service");

const world_runtime_use_item_service_1 = require("./world-runtime-use-item.service");

const world_runtime_player_skill_dispatch_service_1 = require("./world-runtime-player-skill-dispatch.service");

const world_runtime_battle_engage_service_1 = require("./world-runtime-battle-engage.service");

const world_runtime_auto_combat_service_1 = require("./world-runtime-auto-combat.service");

const player_combat_service_1 = require("../combat/player-combat.service");

const map_instance_runtime_1 = require("../instance/map-instance.runtime");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const {
    normalizeRuntimeActionId,
    buildPublicInstanceId,
    formatItemStackLabel,
    formatItemListSummary,
    cloneCombatEffect,
    buildContainerSourceId,
    isContainerSourceId,
    parseContainerSourceId,
    createSyncedItemStackSignature,
    compareStableKeys,
    serializeStableComparableValue,
    groupContainerLootRows,
    hasHiddenContainerEntries,
    buildContainerWindowItems,
    cloneInventorySimulation,
    canReceiveContainerEntries,
    applyContainerEntriesToInventorySimulation,
    canReceiveContainerRow,
    removeContainerRowEntries,
    buildNpcQuestProgressText,
    canReceiveItemStack,
    toQuestRewardItem,
    roundDurationMs,
    pushDurationMetric,
    summarizeDurations,
    normalizeQuestLine,
    normalizeQuestObjectiveType,
    normalizeQuestRequired,
    normalizeQuestRealmStage,
    resolveQuestTargetLabel,
    buildQuestRewardText,
    cloneQuestState,
    compareQuestViews,
    compareStableStrings,
    parseDirection,
    normalizeSlotIndex,
    normalizeEquipSlot,
    normalizeTechniqueId,
    normalizeShopQuantity,
    normalizePositiveCount,
    normalizeCoordinate,
    normalizeRollCount,
    findPlayerSkill,
    isHostileSkill,
    getSkillEffectColor,
    resolveRuntimeSkillRange,
    resolveAutoBattleSkillQiCost,
} = world_runtime_normalization_helpers_1;
const {
    createTileCombatAttributes,
    createTileCombatNumericStats,
    createTileCombatRatioDivisors,
    computeResolvedDamage,
    formatCombatDamageBreakdown,
    formatCombatActionClause,
    formatCombatDamageType,
    resolveObservedDropChance,
    compareStableText,
    buildObservationInsight,
    computeObservationProgress,
    resolveObservationClarity,
    buildObservationVerdict,
    formatCurrentMaxObservation,
    buildPortalDisplayName,
    buildPortalKindLabel,
} = world_runtime_observation_helpers_1;
const {
    chebyshevDistance,
    isInBounds,
    selectNearestPortal,
    buildGoalPoints,
    buildGoalPointsFromTemplate,
    buildAdjacentGoalPoints,
    dedupeGoalPoints,
    decodeClientPathHint,
    resolveInitialRunLength,
    buildPathingBlockMask,
    computePathCost,
    buildCoordKey,
    resolvePreferredClientPathHint,
    findOptimalPathOnMap,
    findNextDirectionOnMap,
    findPathPointsOnMap,
    reconstructPathPoints,
    pushPathNode,
    popPathNode,
    directionFromStep,
    buildAutoBattleGoalPoints,
    DIRECTION_OFFSET,
} = world_runtime_path_planning_helpers_1;

/** DEFAULT_PLAYER_RESPAWN_MAP_ID：DEFAULTPLAYERRESPAWNMAPID。 */
const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** TICK_METRIC_WINDOW_SIZE：TICKMETRICWINDOWSIZE。 */
const TICK_METRIC_WINDOW_SIZE = 60;

/** STATIC_TOGGLE_CONTEXT_ACTIONS：STATICTOGGLECONTEXTACTIONS。 */
const STATIC_TOGGLE_CONTEXT_ACTIONS = [{
        id: 'toggle:auto_battle',
        name: '自动战斗',
        type: 'toggle',
        desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
    }, {
        id: 'toggle:auto_retaliate',
        name: '自动反击',
        type: 'toggle',
        desc: '控制被攻击时是否自动开战。',
    }, {
        id: 'toggle:auto_battle_stationary',
        name: '原地战斗',
        type: 'toggle',
        desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
    }, {
        id: 'toggle:allow_aoe_player_hit',
        name: '全体攻击',
        type: 'toggle',
        desc: '控制群体攻击是否会误伤其他玩家。',
    }, {
        id: 'toggle:auto_idle_cultivation',
        name: '闲置自动修炼',
        type: 'toggle',
        desc: '控制角色闲置一段时间后是否自动开始修炼。',
    }, {
        id: 'cultivation:toggle',
        name: '当前修炼',
        type: 'toggle',
        desc: '切换当前主修功法的修炼状态。',
    }, {
        id: 'toggle:auto_switch_cultivation',
        name: '修满自动切换',
        type: 'toggle',
        desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
    }, {
        id: 'sense_qi:toggle',
        name: '感气视角',
        type: 'toggle',
        desc: '切换感气视角，观察地块灵气层次与变化。',
    }];

let WorldRuntimeService = WorldRuntimeService_1 = class WorldRuntimeService {
    contentTemplateRepository;
    templateRepository;
    mapPersistenceService;
    playerRuntimeService;
    playerCombatService;
    worldSessionService;
    worldClientEventService;
    redeemCodeRuntimeService;
    craftPanelRuntimeService;
    worldRuntimeNpcShopQueryService;
    worldRuntimeQuestQueryService;
    worldRuntimeDetailQueryService;
    worldRuntimeMetricsService;
    worldRuntimeInstanceTickOrchestrationService;
    worldRuntimeMovementService;
    worldRuntimeSummaryQueryService;
    worldRuntimeInstanceStateService;
    worldRuntimeInstanceQueryService;
    worldRuntimePendingCommandService;
    worldRuntimePlayerLocationService;
    worldRuntimeTickProgressService;
    worldRuntimeNpcQuestInteractionQueryService;
    worldRuntimeGmQueueService;
    worldRuntimeRespawnService;
    worldRuntimeCraftService;
    worldRuntimeNpcQuestShopService;
    worldRuntimeLootContainerService;
    worldRuntimeNavigationService;
    worldRuntimeCombatEffectsService;
    worldRuntimeMonsterActionApplyService;
    worldRuntimeBasicAttackService;
    worldRuntimePlayerCombatService;
    worldRuntimeItemGroundService;
    worldRuntimeEquipmentService;
    worldRuntimeCultivationService;
    worldRuntimeProgressionService;
    worldRuntimeUseItemService;
    worldRuntimePlayerSkillDispatchService;
    worldRuntimeBattleEngageService;
    worldRuntimeAutoCombatService;
    logger = new common_1.Logger(WorldRuntimeService_1.name);
    tick = 0;
    constructor(contentTemplateRepository, templateRepository, mapPersistenceService, playerRuntimeService, playerCombatService, worldSessionService, worldClientEventService, redeemCodeRuntimeService, craftPanelRuntimeService, worldRuntimeNpcShopQueryService, worldRuntimeQuestQueryService, worldRuntimeDetailQueryService, worldRuntimeMetricsService, worldRuntimeInstanceTickOrchestrationService, worldRuntimeMovementService, worldRuntimeSummaryQueryService, worldRuntimeInstanceStateService, worldRuntimeInstanceQueryService, worldRuntimePendingCommandService, worldRuntimePlayerLocationService, worldRuntimeTickProgressService, worldRuntimeNpcQuestInteractionQueryService, worldRuntimeGmQueueService, worldRuntimeRespawnService, worldRuntimeCraftService, worldRuntimeNpcQuestShopService, worldRuntimeLootContainerService, worldRuntimeNavigationService, worldRuntimeCombatEffectsService, worldRuntimeMonsterActionApplyService, worldRuntimeBasicAttackService, worldRuntimePlayerCombatService, worldRuntimeItemGroundService, worldRuntimeEquipmentService, worldRuntimeCultivationService, worldRuntimeProgressionService, worldRuntimeUseItemService, worldRuntimePlayerSkillDispatchService, worldRuntimeBattleEngageService, worldRuntimeAutoCombatService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.mapPersistenceService = mapPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeNpcShopQueryService = worldRuntimeNpcShopQueryService;
        this.worldRuntimeQuestQueryService = worldRuntimeQuestQueryService;
        this.worldRuntimeDetailQueryService = worldRuntimeDetailQueryService;
        this.worldRuntimeMetricsService = worldRuntimeMetricsService;
        this.worldRuntimeInstanceTickOrchestrationService = worldRuntimeInstanceTickOrchestrationService;
        this.worldRuntimeMovementService = worldRuntimeMovementService;
        this.worldRuntimeSummaryQueryService = worldRuntimeSummaryQueryService;
        this.worldRuntimeInstanceStateService = worldRuntimeInstanceStateService;
        this.worldRuntimeInstanceQueryService = worldRuntimeInstanceQueryService;
        this.worldRuntimePendingCommandService = worldRuntimePendingCommandService;
        this.worldRuntimePlayerLocationService = worldRuntimePlayerLocationService;
        this.worldRuntimeTickProgressService = worldRuntimeTickProgressService;
        this.worldRuntimeNpcQuestInteractionQueryService = worldRuntimeNpcQuestInteractionQueryService;
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimeRespawnService = worldRuntimeRespawnService;
        this.worldRuntimeCraftService = worldRuntimeCraftService;
        this.worldRuntimeNpcQuestShopService = worldRuntimeNpcQuestShopService;
        this.worldRuntimeLootContainerService = worldRuntimeLootContainerService;
        this.worldRuntimeNavigationService = worldRuntimeNavigationService;
        this.worldRuntimeCombatEffectsService = worldRuntimeCombatEffectsService;
        this.worldRuntimeMonsterActionApplyService = worldRuntimeMonsterActionApplyService;
        this.worldRuntimeBasicAttackService = worldRuntimeBasicAttackService;
        this.worldRuntimePlayerCombatService = worldRuntimePlayerCombatService;
        this.worldRuntimeItemGroundService = worldRuntimeItemGroundService;
        this.worldRuntimeEquipmentService = worldRuntimeEquipmentService;
        this.worldRuntimeCultivationService = worldRuntimeCultivationService;
        this.worldRuntimeProgressionService = worldRuntimeProgressionService;
        this.worldRuntimeUseItemService = worldRuntimeUseItemService;
        this.worldRuntimePlayerSkillDispatchService = worldRuntimePlayerSkillDispatchService;
        this.worldRuntimeBattleEngageService = worldRuntimeBattleEngageService;
        this.worldRuntimeAutoCombatService = worldRuntimeAutoCombatService;
    }
    get pendingCommands() {
        return this.worldRuntimePendingCommandService.pendingCommands;
    }
    get lastTickDurationMs() {
        return this.worldRuntimeMetricsService.lastTickDurationMs;
    }
    get lastSyncFlushDurationMs() {
        return this.worldRuntimeMetricsService.lastSyncFlushDurationMs;
    }
    get lastTickPhaseDurations() {
        return this.worldRuntimeMetricsService.lastTickPhaseDurations;
    }
    get tickDurationHistoryMs() {
        return this.worldRuntimeMetricsService.tickDurationHistoryMs;
    }
    get syncFlushDurationHistoryMs() {
        return this.worldRuntimeMetricsService.syncFlushDurationHistoryMs;
    }
    get instances() {
        return this.worldRuntimeInstanceStateService.instances;
    }
    get playerLocations() {
        return this.worldRuntimePlayerLocationService.playerLocations;
    }
    get instanceTickProgressById() {
        return this.worldRuntimeTickProgressService.instanceTickProgressById;
    }
    /** onModuleInit：初始化公共实例的基础结构。 */
    async onModuleInit() {
        this.bootstrapPublicInstances();
    }
    /** onApplicationBootstrap：在应用启动后重建持久化相关运行态。 */
    async onApplicationBootstrap() {
        await this.rebuildPersistentRuntimeAfterRestore();
    }
    /** listMapTemplates：列出地图模板。 */
    listMapTemplates() {
        return this.templateRepository.listSummaries();
    }
    /** listInstances：列出实例。 */
    listInstances() {
        return this.worldRuntimeInstanceQueryService.listInstances(this.instances);
    }
    /** getInstance：读取指定实例。 */
    getInstance(instanceId) {
        return this.worldRuntimeInstanceQueryService.getInstance(this.instances, instanceId);
    }
    /** listInstanceMonsters：列出实例妖兽。 */
    listInstanceMonsters(instanceId) {
        return this.worldRuntimeInstanceQueryService.listInstanceMonsters(this.getInstanceRuntimeOrThrow(instanceId));
    }
    /** getInstanceMonster：读取实例中的单只妖兽。 */
    getInstanceMonster(instanceId, runtimeId) {
        return this.worldRuntimeInstanceQueryService.getInstanceMonster(this.getInstanceRuntimeOrThrow(instanceId), runtimeId);
    }
    /** getInstanceTileState：读取实例地块状态。 */
    getInstanceTileState(instanceId, x, y) {

        const instance = this.instances.get(instanceId);
        if (!instance) {
            return null;
        }
        return this.worldRuntimeInstanceQueryService.getInstanceTileState(instance, x, y);
    }
    /** getCombatEffects：读取当前实例战斗效果。 */
    getCombatEffects(instanceId) {
        return this.worldRuntimeCombatEffectsService.getCombatEffects(instanceId).map((entry) => cloneCombatEffect(entry));
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    connectPlayer(input) {

        const playerId = input.playerId.trim();
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }

        const mapId = input.mapId?.trim() || this.resolveDefaultRespawnMapId();
        if (!mapId) {
            throw new common_1.NotFoundException('No map template available');
        }

        const sessionId = input.sessionId?.trim() || `session:${playerId}`;

        const targetInstance = this.getOrCreatePublicInstance(mapId);

        const previous = this.playerLocations.get(playerId);
        if (previous && previous.instanceId !== targetInstance.meta.instanceId) {
            this.instances.get(previous.instanceId)?.disconnectPlayer(playerId);
        }

        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId,
            preferredX: input.preferredX,
            preferredY: input.preferredY,
        });

        const playerState = this.playerRuntimeService.ensurePlayer(playerId, sessionId);
        targetInstance.setPlayerMoveSpeed(playerId, playerState.attrs.numericStats.moveSpeed);
        this.playerLocations.set(playerId, {
            instanceId: targetInstance.meta.instanceId,
            sessionId: runtimePlayer.sessionId,
        });
        this.worldRuntimeGmQueueService.clearPendingRespawn(playerId);
        this.logger.debug(`玩家 ${playerId} 已附着到实例 ${targetInstance.meta.instanceId}`);
        return this.getPlayerViewOrThrow(playerId);
    }
    /** disconnectPlayer：断开玩家与实例的挂接，并清理相关排队状态。 */
    disconnectPlayer(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return false;
        }
        this.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.pendingCommands.delete(playerId);
        this.worldRuntimeGmQueueService.clearPendingRespawn(playerId);

        const disconnected = this.instances.get(location.instanceId)?.disconnectPlayer(playerId) ?? false;
        this.playerLocations.delete(playerId);
        return disconnected;
    }
    /** removePlayer：注销玩家运行态，先清会话再断开实例。 */
    removePlayer(playerId, reason = 'removed') {

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        this.worldSessionService.purgePlayerSession(normalizedPlayerId, reason);
        this.worldRuntimeNavigationService.clearNavigationIntent(normalizedPlayerId);
        this.pendingCommands.delete(normalizedPlayerId);
        this.worldRuntimeGmQueueService.clearPendingRespawn(normalizedPlayerId);

        const disconnected = this.disconnectPlayer(normalizedPlayerId);

        const runtimePlayer = this.playerRuntimeService.getPlayer(normalizedPlayerId);
        if (!runtimePlayer) {
            return disconnected;
        }
        this.playerRuntimeService.removePlayerRuntime(normalizedPlayerId);
        return true;
    }
    /** enqueueMove：把方向移动请求排入下一次 tick 统一执行。 */
    enqueueMove(playerId, directionInput) {
        return this.worldRuntimeNavigationService.enqueueMove(playerId, directionInput, this);
    }
    /** enqueueMoveTo：把点位导航请求排入下一次 tick 统一执行。 */
    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput) {
        return this.worldRuntimeNavigationService.enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, this);
    }
    /** usePortal：把当前站位的传送请求排入下一次 tick。 */
    usePortal(playerId) {
        return this.worldRuntimeNavigationService.usePortal(playerId, this);
    }
    /** navigateQuest：记录任务导航意图，供后续 tick 续跑路径。 */
    navigateQuest(playerId, questIdInput) {
        return this.worldRuntimeNavigationService.navigateQuest(playerId, questIdInput, this);
    }
    /** enqueueBasicAttack：把排队Basic攻击请求排入下一次 tick。 */
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.interruptManualCombat(playerId);

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const hasTileTarget = Number.isFinite(targetXInput) && Number.isFinite(targetYInput);
        if (!targetPlayerId && !targetMonsterId && !hasTileTarget) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'basicAttack',
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetX: hasTileTarget ? normalizeCoordinate(targetXInput ?? Number.NaN, 'x') : null,
            targetY: hasTileTarget ? normalizeCoordinate(targetYInput ?? Number.NaN, 'y') : null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueBattleTarget：把排队战斗目标请求排入下一次 tick。 */
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.interruptManualCombat(playerId);

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const hasTileTarget = Number.isFinite(targetXInput) && Number.isFinite(targetYInput);
        if (!targetPlayerId && !targetMonsterId && !hasTileTarget) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'engageBattle',
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetX: hasTileTarget ? normalizeCoordinate(targetXInput ?? Number.NaN, 'x') : null,
            targetY: hasTileTarget ? normalizeCoordinate(targetYInput ?? Number.NaN, 'y') : null,
            locked,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** executeAction：根据动作 ID 分流到交互、战斗、修炼或传送流程。 */
    executeAction(playerId, actionIdInput, targetInput) {
        this.getPlayerLocationOrThrow(playerId);

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);

        const rawActionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!rawActionId) {
            throw new common_1.BadRequestException('actionId is required');
        }
        if (rawActionId.startsWith('npc:')) {
            return this.executeLegacyNpcAction(playerId, rawActionId.slice('npc:'.length));
        }

        const actionId = normalizeRuntimeActionId(rawActionId);
        if (actionId === 'portal:travel') {
            return {
                kind: 'queued',
                view: this.usePortal(playerId),
            };
        }
        if (actionId === 'realm:breakthrough') {
            this.pendingCommands.set(playerId, {
                kind: 'breakthrough',
            });
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'body_training:infuse') {

            const target = typeof targetInput === 'string' ? targetInput.trim() : '';

            const foundationAmount = Number.parseInt(target, 10);
            if (!Number.isFinite(foundationAmount) || foundationAmount <= 0) {
                throw new common_1.BadRequestException('foundation amount is required');
            }

            const result = this.playerRuntimeService.infuseBodyTraining(playerId, foundationAmount);
            this.queuePlayerNotice(playerId, `你将 ${result.foundationSpent} 点底蕴灌入肉身，转化为 ${result.expGained} 点炼体经验`, 'success');
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_battle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattle: !player.combat.autoBattle,
            }, currentTick);
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_retaliate') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoRetaliate: !player.combat.autoRetaliate,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_battle_stationary') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattleStationary: !player.combat.autoBattleStationary,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:allow_aoe_player_hit') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                allowAoePlayerHit: !player.combat.allowAoePlayerHit,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_idle_cultivation') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoIdleCultivation: !player.combat.autoIdleCultivation,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'cultivation:toggle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (!player.techniques.cultivatingTechId) {
                throw new common_1.BadRequestException('当前没有主修功法');
            }

            const nextActive = !player.combat.cultivationActive;
            this.playerRuntimeService.cultivateTechnique(playerId, nextActive ? player.techniques.cultivatingTechId : null);
            this.queuePlayerNotice(playerId, nextActive ? '已恢复当前修炼' : '已停止当前修炼', 'info');
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_switch_cultivation') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoSwitchCultivation: !player.combat.autoSwitchCultivation,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'sense_qi:toggle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                senseQiActive: !player.combat.senseQiActive,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('npc_shop:')) {
            return {
                kind: 'npcShop',
                npcShop: this.buildNpcShopView(playerId, actionId.slice('npc_shop:'.length)),
            };
        }
        if (actionId.startsWith('npc_quests:')) {
            const npcId = actionId.slice('npc_quests:'.length).trim();
            if (!npcId) {
                throw new common_1.BadRequestException('npcId is required');
            }
            return this.worldRuntimeNpcQuestShopService.executeNpcQuestAction(playerId, npcId, this);
        }
        throw new common_1.BadRequestException(`Unsupported actionId: ${actionId}`);
    }
    /** executeLegacyNpcAction：兼容旧版 NPC 交互入口，自动转成任务或对话命令。 */
    executeLegacyNpcAction(playerId, npcId) {
        return this.worldRuntimeNpcQuestShopService.executeNpcQuestAction(playerId, npcId, this);
    }
    /** enqueueUseItem：把排队使用物品请求排入下一次 tick。 */
    enqueueUseItem(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'useItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueDropItem：把排队丢弃物品请求排入下一次 tick。 */
    enqueueDropItem(playerId, slotIndexInput, countInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'dropItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
            count: normalizePositiveCount(countInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueTakeGround：把排队拿取地面请求排入下一次 tick。 */
    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) {
        this.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';

        const itemKey = typeof itemKeyInput === 'string' ? itemKeyInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        if (!itemKey) {
            throw new common_1.BadRequestException('itemKey is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'takeGround',
            sourceId,
            itemKey,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueTakeGroundAll：把排队拿取地面All请求排入下一次 tick。 */
    enqueueTakeGroundAll(playerId, sourceIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'takeGroundAll',
            sourceId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueEquip：把排队装备请求排入下一次 tick。 */
    enqueueEquip(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'equip',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueUnequip：把排队卸下请求排入下一次 tick。 */
    enqueueUnequip(playerId, slotInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCultivate：把排队Cultivate请求排入下一次 tick。 */
    enqueueCultivate(playerId, techniqueIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cultivate',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueStartAlchemy：把排队StartAlchemy请求排入下一次 tick。 */
    enqueueStartAlchemy(playerId, payload) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'startAlchemy',
            payload: payload && typeof payload === 'object'
                ? {
                    ...payload,
                    ingredients: Array.isArray(payload.ingredients)
                        ? payload.ingredients.map((entry) => ({ ...entry }))
                        : [],
                }
                : {},
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCancelAlchemy：把排队取消Alchemy请求排入下一次 tick。 */
    enqueueCancelAlchemy(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cancelAlchemy',
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueSaveAlchemyPreset：把排队保存炼制预设请求排入下一次 tick。 */
    enqueueSaveAlchemyPreset(playerId, payload) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'saveAlchemyPreset',
            payload: payload && typeof payload === 'object'
                ? {
                    ...payload,
                    ingredients: Array.isArray(payload.ingredients)
                        ? payload.ingredients.map((entry) => ({ ...entry }))
                        : [],
                }
                : {},
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueDeleteAlchemyPreset：把排队删除炼制预设请求排入下一次 tick。 */
    enqueueDeleteAlchemyPreset(playerId, presetId) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'deleteAlchemyPreset',
            presetId: typeof presetId === 'string' ? presetId : '',
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueStartEnhancement：把排队StartEnhancement请求排入下一次 tick。 */
    enqueueStartEnhancement(playerId, payload) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'startEnhancement',
            payload: payload && typeof payload === 'object'
                ? {
                    ...payload,
                    target: payload.target && typeof payload.target === 'object'
                        ? { ...payload.target }
                        : payload.target,
                    protection: payload.protection && typeof payload.protection === 'object'
                        ? { ...payload.protection }
                        : payload.protection,
                }
                : {},
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCancelEnhancement：把排队取消Enhancement请求排入下一次 tick。 */
    enqueueCancelEnhancement(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cancelEnhancement',
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueRedeemCodes：把排队RedeemCodes请求排入下一次 tick。 */
    enqueueRedeemCodes(playerId, codesInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'redeemCodes',
            codes: Array.isArray(codesInput) ? codesInput.filter((entry) => typeof entry === 'string') : [],
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueHeavenGateAction：把排队天门关卡动作请求排入下一次 tick。 */
    enqueueHeavenGateAction(playerId, actionInput, elementInput) {
        this.getPlayerLocationOrThrow(playerId);

        const action = typeof actionInput === 'string' ? actionInput.trim() : '';
        if (action !== 'sever' && action !== 'restore' && action !== 'open' && action !== 'reroll' && action !== 'enter') {
            throw new common_1.BadRequestException('heaven gate action is required');
        }

        const element = typeof elementInput === 'string' ? elementInput.trim() : '';
        this.pendingCommands.set(playerId, {
            kind: 'heavenGateAction',
            action,

            element: element === 'metal' || element === 'wood' || element === 'water' || element === 'fire' || element === 'earth'
                ? element
                : undefined,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCastSkill：把排队CastSkill请求排入下一次 tick。 */
    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput = null) {
        this.getPlayerLocationOrThrow(playerId);

        const skillId = typeof skillIdInput === 'string' ? skillIdInput.trim() : '';

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const targetRef = typeof targetRefInput === 'string' ? targetRefInput.trim() : '';
        if (!skillId) {
            throw new common_1.BadRequestException('skillId is required');
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const action = player.actions.actions.find((entry) => entry.id === skillId && entry.type === 'skill');
        if (!action) {
            throw new common_1.NotFoundException(`Skill action ${skillId} not found`);
        }
        if (!targetPlayerId && !targetMonsterId && !targetRef && action.requiresTarget !== false) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'castSkill',
            skillId,
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetRef: targetRef || null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCastSkillTargetRef：把排队CastSkill目标Ref请求排入下一次 tick。 */
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) {
        return this.enqueueCastSkill(playerId, skillIdInput, null, null, targetRefInput);
    }
    /** buildNpcShopView：构建当前 NPC 的商店视图。 */
    buildNpcShopView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return this.worldRuntimeNpcShopQueryService.createEnvelopeForNpc(npc);
    }
    /** buildQuestListView：构建玩家任务列表视图。 */
    buildQuestListView(playerId, _input) {
        this.getPlayerLocationOrThrow(playerId);
        this.refreshQuestStates(playerId);
        return {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
    }
    /** buildNpcQuestsView：构建当前 NPC 相关的任务视图。 */
    buildNpcQuestsView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        this.refreshQuestStates(playerId);
        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return this.worldRuntimeQuestQueryService.createNpcQuestsEnvelope(playerId, npc);
    }
    /** buildDetail：构建目标详情，要求目标必须在当前视野内。 */
    buildDetail(playerId, input) {
        const location = this.getPlayerLocationOrThrow(playerId);

        const kind = input.kind;

        const id = typeof input.id === 'string' ? input.id.trim() : '';
        if (!id) {
            throw new common_1.BadRequestException('id is required');
        }
        if (kind !== 'npc' && kind !== 'monster' && kind !== 'ground' && kind !== 'player' && kind !== 'portal' && kind !== 'container') {
            throw new common_1.BadRequestException(`Unsupported detail kind: ${String(kind)}`);
        }

        const view = this.getPlayerViewOrThrow(playerId);
        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);
        const viewer = this.playerRuntimeService.getPlayerOrThrow(playerId);
        return this.worldRuntimeDetailQueryService.buildDetail({ view, viewer, location, instance }, { kind, id });
    }
    /** buildTileDetail：构建指定地块的详情，汇总实体、灵气和战斗状态。 */
    buildTileDetail(playerId, input) {
        const location = this.getPlayerLocationOrThrow(playerId);

        const x = normalizeCoordinate(typeof input.x === 'number' ? input.x : Number.NaN, 'x');

        const y = normalizeCoordinate(typeof input.y === 'number' ? input.y : Number.NaN, 'y');

        const view = this.getPlayerViewOrThrow(playerId);

        const viewer = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);
        return this.worldRuntimeDetailQueryService.buildTileDetail({ view, viewer, location, instance }, { x, y });
    }
    /** buildLootWindowSyncState：构建拿取窗口同步状态，供前端按需增量刷新。 */
    buildLootWindowSyncState(playerId, tileX, tileY) {

        const player = this.playerRuntimeService.getPlayer(playerId);

        const view = this.getPlayerView(playerId);
        if (!player || !view || !player.instanceId) {
            return null;
        }
        if (Math.max(Math.abs(player.x - tileX), Math.abs(player.y - tileY)) > 1) {
            return null;
        }

        const instance = this.getInstanceRuntimeOrThrow(player.instanceId);

        const sources = [];

        const groundSources = view.localGroundPiles
            .filter((entry) => entry.x === tileX && entry.y === tileY && entry.items.length > 0)
            .sort((left, right) => compareStableStrings(left.sourceId, right.sourceId));
        for (const [index, pile] of groundSources.entries()) {
            sources.push({
                sourceId: pile.sourceId,
                kind: 'ground',

                title: index === 0 ? '地面物品' : `地面物品 ${index + 1}`,
                searchable: false,
                items: pile.items.map((entry) => ({
                    itemKey: entry.itemKey,
                    item: {
                        itemId: entry.itemId,
                        count: entry.count,
                        name: entry.name,
                        type: entry.type,
                        grade: entry.grade,
                        groundLabel: entry.groundLabel,
                    },
                })),
                emptyText: '地面上已经没有东西了。',
            });
        }

        const container = instance.getContainerAtTile(tileX, tileY);
        if (container) {
            sources.push(this.worldRuntimeLootContainerService.buildContainerLootSource(instance.meta.instanceId, container, this.tick));
        }
        if (sources.length === 0) {
            return null;
        }
        return {
            tileX,
            tileY,
            title: `拿取 · (${tileX}, ${tileY})`,
            sources,
        };
    }
    /** refreshPlayerContextActions：根据当前视野和角色状态刷新上下文动作。 */
    refreshPlayerContextActions(playerId, view) {

        const resolvedView = view ?? this.getPlayerView(playerId);
        if (!resolvedView) {
            return null;
        }
        this.playerRuntimeService.setContextActions(playerId, this.buildContextActions(resolvedView), resolvedView.tick);
        return resolvedView;
    }
    /** enqueueBuyNpcShopItem：把 NPC 商店购买请求排入下一次 tick。 */
    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) {
        return this.worldRuntimeNpcQuestShopService.enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, this);
    }
    /** enqueueNpcInteraction：把 NPC 交互请求排入下一次 tick。 */
    enqueueNpcInteraction(playerId, actionIdInput) {
        return this.worldRuntimeNpcQuestShopService.enqueueNpcInteraction(playerId, actionIdInput, this);
    }
    /** enqueueLegacyNpcInteraction：兼容旧版 NPC 交互入口。 */
    enqueueLegacyNpcInteraction(playerId, actionIdInput) {
        return this.worldRuntimeNpcQuestShopService.enqueueLegacyNpcInteraction(playerId, actionIdInput, this);
    }
    /** enqueueAcceptNpcQuest：把 NPC 任务接取请求排入下一次 tick。 */
    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) {
        return this.worldRuntimeNpcQuestShopService.enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, this);
    }
    /** enqueueSubmitNpcQuest：把 NPC 任务提交请求排入下一次 tick。 */
    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) {
        return this.worldRuntimeNpcQuestShopService.enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, this);
    }
    /** enqueueSpawnMonsterLoot：把妖兽掉落生成请求排入系统命令队列。 */
    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const monsterId = typeof monsterIdInput === 'string' ? monsterIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!monsterId) {
            throw new common_1.BadRequestException('monsterId is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'spawnMonsterLoot',
            instanceId,
            monsterId,
            x: normalizeCoordinate(xInput, 'x'),
            y: normalizeCoordinate(yInput, 'y'),
            rolls: normalizeRollCount(rollsInput),
        });
    }
    /** enqueueDefeatMonster：把妖兽击败请求排入系统命令队列。 */
    enqueueDefeatMonster(instanceIdInput, runtimeIdInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'defeatMonster',
            instanceId,
            runtimeId,
        });
    }
    /** enqueueDamageMonster：把妖兽受伤请求排入系统命令队列。 */
    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'damageMonster',
            instanceId,
            runtimeId,
            amount,
        });
    }
    /** enqueueDamagePlayer：把玩家受伤请求排入系统命令队列。 */
    enqueueDamagePlayer(playerIdInput, amountInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'damagePlayer',
            playerId,
            amount,
        });
    }
    /** enqueueRespawnPlayer：把玩家复生请求排入系统命令队列。 */
    enqueueRespawnPlayer(playerIdInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'respawnPlayer',
            playerId,
        });
    }
    /** enqueueResetPlayerSpawn：把玩家重置出生点请求排入系统命令队列。 */
    enqueueResetPlayerSpawn(playerIdInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'resetPlayerSpawn',
            playerId,
        });
    }
    /** enqueueGmUpdatePlayer：把 GM 更新玩家请求排入系统命令队列。 */
    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeGmQueueService.enqueueGmUpdatePlayer(input);
    }
    /** enqueueGmResetPlayer：把 GM 重置玩家请求排入系统命令队列。 */
    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeGmQueueService.enqueueGmResetPlayer(playerIdInput);
    }
    /** enqueueGmSpawnBots：把 GM 生成机器人请求排入系统命令队列。 */
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeGmQueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    /** enqueueGmRemoveBots：把 GM 移除机器人请求排入系统命令队列。 */
    enqueueGmRemoveBots(playerIdsInput, allInput) {
        return this.worldRuntimeGmQueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
    /** getPlayerView：读取玩家当前视野快照，并补上 NPC 任务标记。 */
    getPlayerView(playerId, radius) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return null;
        }

        const derivedRadius = this.playerRuntimeService.getPlayer(playerId)?.attrs.numericStats.viewRange;

        const normalizedRadius = typeof derivedRadius === 'number' && Number.isFinite(derivedRadius)
            ? Math.max(1, Math.round(derivedRadius))
            : undefined;

        const effectiveRadius = radius ?? normalizedRadius;

        const view = this.instances.get(location.instanceId)?.buildPlayerView(playerId, effectiveRadius) ?? null;
        return view ? this.decoratePlayerViewNpcs(playerId, view) : null;
    }
    /** resolveCurrentTickForPlayerId：读取玩家所在实例的当前 tick。 */
    resolveCurrentTickForPlayerId(playerId) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return this.tick;
        }
        return this.instances.get(player.instanceId)?.tick ?? this.tick;
    }
    /** getLegacyNavigationPath：生成旧版导航预览路径，便于调试与兼容。 */
    getLegacyNavigationPath(playerId) {
        return this.worldRuntimeNavigationService.getLegacyNavigationPath(playerId, this);
    }
    /** getRuntimeSummary：汇总世界 tick、实例和同步耗时信息。 */
    getRuntimeSummary() {

        /** instances：当前已加载的地图实例集合。 */
        const instances = this.listInstances();
        return this.worldRuntimeSummaryQueryService.buildRuntimeSummary({
            tick: this.tick,
            lastTickDurationMs: this.lastTickDurationMs,
            lastSyncFlushDurationMs: this.lastSyncFlushDurationMs,
            mapTemplateCount: this.templateRepository.list().length,
            playerCount: this.playerLocations.size,
            pendingCommandCount: this.pendingCommands.size,
            pendingSystemCommandCount: this.worldRuntimeGmQueueService.getPendingSystemCommandCount(),
            tickDurationHistoryMs: this.tickDurationHistoryMs,
            syncFlushDurationHistoryMs: this.syncFlushDurationHistoryMs,
            lastTickPhaseDurations: this.lastTickPhaseDurations,
            instances,
        });
    }
    /** listDirtyPersistentInstances：列出需要持久化刷新的实例。 */
    listDirtyPersistentInstances() {
        const dirty = new Set(this.worldRuntimeLootContainerService.getDirtyInstanceIds());
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.meta.persistent && instance.isPersistentDirty()) {
                dirty.add(instanceId);
            }
        }
        return Array.from(dirty).sort(compareStableStrings);
    }
    /** buildMapPersistenceSnapshot：构建地图持久化快照。 */
    buildMapPersistenceSnapshot(instanceId) {

        const instance = this.instances.get(instanceId);
        if (!instance || !instance.meta.persistent) {
            return null;
        }
        return {
            version: 1,
            savedAt: Date.now(),
            templateId: instance.template.id,
            auraEntries: instance.buildAuraPersistenceEntries(),
            groundPileEntries: instance.buildGroundPersistenceEntries(),
            containerStates: this.worldRuntimeLootContainerService.buildContainerPersistenceStates(instanceId),
        };
    }
    /** markMapPersisted：标记地图快照已落盘。 */
    markMapPersisted(instanceId) {
        this.instances.get(instanceId)?.markAuraPersisted();
        this.worldRuntimeLootContainerService.clearPersisted(instanceId);
    }
    /** tickAll：推进全部实例的默认一秒帧。 */
    tickAll() {
        return this.advanceFrame(1000);
    }
    /** advanceFrame：推进世界帧，统筹实例 tick、命令派发和耗时统计。 */
    advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {
        return this.worldRuntimeInstanceTickOrchestrationService.advanceFrame(this, frameDurationMs, getInstanceTickSpeed);
    }
    /** recordSyncFlushDuration：记录一次同步刷新耗时。 */
    recordSyncFlushDuration(durationMs) {
        this.worldRuntimeMetricsService.recordSyncFlushDuration(durationMs);
    }
    /** bootstrapPublicInstances：初始化所有公共地图实例。 */
    bootstrapPublicInstances() {
        for (const template of this.templateRepository.list()) {
            this.createInstance({
                instanceId: buildPublicInstanceId(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
            });
        }
        this.logger.log(`已初始化 ${this.instances.size} 个公共实例`);
    }
    /** restorePublicInstancePersistence：从持久化快照恢复公共实例状态。 */
    async restorePublicInstancePersistence() {
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }
        for (const [instanceId, instance] of this.instances) {
            if (!instance.meta.persistent) {
                continue;
            }

            const snapshot = await this.mapPersistenceService.loadMapSnapshot(instanceId);
            if (!snapshot || snapshot.templateId !== instance.template.id) {
                continue;
            }
            instance.hydrateAura(snapshot.auraEntries);
            instance.hydrateGroundPiles(snapshot.groundPileEntries);
            this.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, snapshot.containerStates ?? []);
        }
    }
    /** rebuildPersistentRuntimeAfterRestore：在恢复持久化后重建世界运行态。 */
    async rebuildPersistentRuntimeAfterRestore() {
        this.worldRuntimeInstanceStateService.resetState();
        this.worldRuntimePlayerLocationService.resetState();
        this.worldRuntimePendingCommandService.resetState();
        this.worldRuntimeGmQueueService.resetState();
        this.worldRuntimeNavigationService.reset();
        this.worldRuntimeTickProgressService.resetState();
        this.worldRuntimeLootContainerService.reset();
        this.worldRuntimeCombatEffectsService.resetAll();
        this.bootstrapPublicInstances();
        await this.restorePublicInstancePersistence();
    }
    /** createInstance：创建地图实例并挂接到世界运行时。 */
    createInstance(input) {

        const existing = this.instances.get(input.instanceId);
        if (existing) {
            return existing;
        }

        /** template：当前实例使用的地图模板。 */
        const template = this.templateRepository.getOrThrow(input.templateId);

        const instance = new map_instance_runtime_1.MapInstanceRuntime({
            instanceId: input.instanceId,
            template,
            monsterSpawns: this.contentTemplateRepository.createRuntimeMonstersForMap(template.id),
            kind: input.kind,
            persistent: input.persistent,
            createdAt: Date.now(),
        });
        this.instances.set(input.instanceId, instance);
        this.worldRuntimeTickProgressService.initializeInstance(input.instanceId);
        return instance;
    }
    /** getOrCreatePublicInstance：读取或创建公共地图实例。 */
    getOrCreatePublicInstance(templateId) {
        if (!this.templateRepository.has(templateId)) {
            throw new common_1.NotFoundException(`Unknown map template: ${templateId}`);
        }
        return this.createInstance({
            instanceId: buildPublicInstanceId(templateId),
            templateId,
            kind: 'public',
            persistent: true,
        });
    }
    /** resolveDefaultRespawnMapId：解析默认复生地图。 */
    resolveDefaultRespawnMapId() {
        if (this.templateRepository.has(DEFAULT_PLAYER_RESPAWN_MAP_ID)) {
            return DEFAULT_PLAYER_RESPAWN_MAP_ID;
        }

        const fallback = this.templateRepository.list()[0]?.id;
        if (!fallback) {
            throw new common_1.NotFoundException('No map template available');
        }
        return fallback;
    }
    /** findMapRoute：查找跨地图传送路线。 */
    findMapRoute(fromMapId, toMapId) {
        return this.worldRuntimeNavigationService.findMapRoute(fromMapId, toMapId);
    }
    /** getPlayerLocationOrThrow：读取玩家当前接入位置，不存在就抛错。 */
    getPlayerLocationOrThrow(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            throw new common_1.NotFoundException(`Player ${playerId} is not connected`);
        }
        return location;
    }
    /** getInstanceRuntimeOrThrow：读取实例运行时，不存在就抛错。 */
    getInstanceRuntimeOrThrow(instanceId) {

        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new common_1.NotFoundException(`Instance ${instanceId} not found`);
        }
        return instance;
    }
    /** cancelPendingInstanceCommand：取消当前实例中玩家待执行命令。 */
    cancelPendingInstanceCommand(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return false;
        }
        return this.instances.get(location.instanceId)?.cancelPendingCommand(playerId) ?? false;
    }
    /** interruptManualNavigation：中断手动导航并清掉自动战斗状态。 */
    interruptManualNavigation(playerId) {
        this.worldRuntimeNavigationService.interruptManualNavigation(playerId, this);
    }
    /** interruptManualCombat：中断手动战斗并清掉导航意图。 */
    interruptManualCombat(playerId) {
        this.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.cancelPendingInstanceCommand(playerId);
    }
    /** getPlayerViewOrThrow：读取玩家视野，不存在就抛错。 */
    getPlayerViewOrThrow(playerId) {

        const view = this.getPlayerView(playerId);
        if (!view) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return view;
    }
    /** applyTransfer：把跨图传送结果应用到目标实例。 */
    applyTransfer(transfer) {

        const source = this.instances.get(transfer.fromInstanceId);
        if (!source) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.transfer.apply', {
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            fromInstanceId: transfer.fromInstanceId,
            toMapId: transfer.targetMapId,
            targetX: transfer.targetX,
            targetY: transfer.targetY,
            reason: transfer.reason,
        });
        source.disconnectPlayer(transfer.playerId);

        const target = this.getOrCreatePublicInstance(transfer.targetMapId);
        target.connectPlayer({
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            preferredX: transfer.targetX,
            preferredY: transfer.targetY,
        });

        const runtimePlayer = this.playerRuntimeService.getPlayer(transfer.playerId);
        target.setPlayerMoveSpeed(transfer.playerId, runtimePlayer?.attrs.numericStats.moveSpeed ?? 0);
        this.playerLocations.set(transfer.playerId, {
            instanceId: target.meta.instanceId,
            sessionId: transfer.sessionId,
        });

        this.worldRuntimeNavigationService.handleTransfer(transfer, this);
    }
    /** materializeNavigationCommands：把导航意图落成可执行的移动或传送命令。 */
    materializeNavigationCommands() {
        this.worldRuntimeNavigationService.materializeNavigationCommands(this);
    }
    /** resolveNavigationStep：为当前导航目标计算下一步动作。 */
    resolveNavigationStep(playerId, intent) {
        return this.worldRuntimeNavigationService.resolveNavigationStep(playerId, intent, this);
    }
    /** resolveNavigationDestination：把点位导航或任务导航归一成可寻路目标。 */
    resolveNavigationDestination(playerId, intent) {
        return this.worldRuntimeNavigationService.resolveNavigationDestination(playerId, intent, this);
    }
    /** materializeAutoCombatCommands：把自动战斗意图落成当前 tick 的战斗命令。 */
    materializeAutoCombatCommands() {
        this.worldRuntimeAutoCombatService.materializeAutoCombatCommands(this);
    }
    /** buildAutoCombatCommand：为自动战斗构建移动、普攻或施法命令。 */
    buildAutoCombatCommand(instance, player) {
        return this.worldRuntimeAutoCombatService.buildAutoCombatCommand(instance, player, this);
    }
    /** selectAutoCombatTarget：从当前视野里选择自动战斗目标。 */
    selectAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeAutoCombatService.selectAutoCombatTarget(instance, player, visibleMonsters, this);
    }
    /** resolveTrackedAutoCombatTarget：解析已锁定的自动战斗目标。 */
    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeAutoCombatService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, this);
    }
    /** pickAutoBattleSkill：选择当前距离可用的自动战斗技能。 */
    pickAutoBattleSkill(player, distance) {
        return this.worldRuntimeAutoCombatService.pickAutoBattleSkill(player, distance);
    }
    /** resolveAutoBattleDesiredRange：计算自动战斗期望停留射程。 */
    resolveAutoBattleDesiredRange(player) {
        return this.worldRuntimeAutoCombatService.resolveAutoBattleDesiredRange(player);
    }
    /** dispatchPendingCommands：派发玩家待执行命令。 */
    dispatchPendingCommands() {
        this.worldRuntimePendingCommandService.dispatchPendingCommands(this);
    }
    /** dispatchPendingSystemCommands：派发系统命令队列。 */
    dispatchPendingSystemCommands() {
        if (this.worldRuntimeGmQueueService.getPendingSystemCommandCount() === 0) {
            return;
        }

        const commands = this.worldRuntimeGmQueueService.drainPendingSystemCommands();
        for (const command of commands) {
            try {
                this.dispatchSystemCommand(command);
            }
            catch (error) {

                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`处理系统指令 ${command.kind} 失败：${message}`);
            }
        }
    }
    /** dispatchInstanceCommand：执行需要落到实例侧的移动或传送命令。 */
    dispatchInstanceCommand(playerId, command) {
        this.worldRuntimeMovementService.dispatchInstanceCommand(playerId, command, this);
    }
    /** dispatchPlayerCommand：执行不依赖实例移动的玩家命令。 */
    dispatchPlayerCommand(playerId, command) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0 && command.kind !== 'redeemCodes') {
            return;
        }
        switch (command.kind) {
            case 'useItem':
                this.dispatchUseItem(playerId, command.slotIndex);
                return;
            case 'equip':
                this.dispatchEquipItem(playerId, command.slotIndex);
                return;
            case 'dropItem':
                this.dispatchDropItem(playerId, command.slotIndex, command.count);
                return;
            case 'moveTo':
                this.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint);
                return;
            case 'basicAttack':
                this.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY);
                return;
            case 'engageBattle':
                this.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked);
                return;
            case 'takeGround':
                this.dispatchTakeGround(playerId, command.sourceId, command.itemKey);
                return;
            case 'takeGroundAll':
                this.dispatchTakeGroundAll(playerId, command.sourceId);
                return;
            case 'unequip':
                this.dispatchUnequipItem(playerId, command.slot);
                return;
            case 'cultivate':
                this.dispatchCultivateTechnique(playerId, command.techniqueId);
                return;
            case 'startAlchemy':
                this.dispatchStartAlchemy(playerId, command.payload);
                return;
            case 'cancelAlchemy':
                this.dispatchCancelAlchemy(playerId);
                return;
            case 'saveAlchemyPreset':
                this.dispatchSaveAlchemyPreset(playerId, command.payload);
                return;
            case 'deleteAlchemyPreset':
                this.dispatchDeleteAlchemyPreset(playerId, command.presetId);
                return;
            case 'startEnhancement':
                this.dispatchStartEnhancement(playerId, command.payload);
                return;
            case 'cancelEnhancement':
                this.dispatchCancelEnhancement(playerId);
                return;
            case 'redeemCodes':
                this.dispatchRedeemCodes(playerId, command.codes);
                return;
            case 'breakthrough':
                this.dispatchBreakthrough(playerId);
                return;
            case 'heavenGateAction':
                this.dispatchHeavenGateAction(playerId, command.action, command.element);
                return;
            case 'castSkill':
                this.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef);
                return;
            case 'buyNpcShopItem':
                this.dispatchBuyNpcShopItem(playerId, command.npcId, command.itemId, command.quantity);
                return;
            case 'npcInteraction':
                this.dispatchNpcInteraction(playerId, command.npcId);
                return;
            case 'interactNpcQuest':
                this.dispatchInteractNpcQuest(playerId, command.npcId);
                return;
            case 'acceptNpcQuest':
                this.dispatchAcceptNpcQuest(playerId, command.npcId, command.questId);
                return;
            case 'submitNpcQuest':
                this.dispatchSubmitNpcQuest(playerId, command.npcId, command.questId);
                return;
        }
    }
    /** dispatchRedeemCodes：执行兑换码结算并把结果回推给客户端。 */
    dispatchRedeemCodes(playerId, codes) {
        this.redeemCodeRuntimeService.redeemCodes(playerId, codes)
            .then((payload) => {

            const socket = this.worldSessionService.getSocketByPlayerId(playerId);
            if (socket) {
                this.worldClientEventService.emitRedeemCodesResult(socket, { result: payload });
            }
        })
            .catch((error) => {

            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`处理玩家 ${playerId} 的兑换码失败：${message}`);
            this.queuePlayerNotice(playerId, message, 'warn');
        });
    }
    /** dispatchCastSkill：校验目标并把技能释放交给战斗服务。 */
    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, this);
    }
    /** resolveLegacySkillTargetRef：解析旧版技能目标引用。 */
    resolveLegacySkillTargetRef(attacker, skill, targetRef) {
        return this.worldRuntimePlayerSkillDispatchService.resolveLegacySkillTargetRef(attacker, skill, targetRef, this);
    }
    /** dispatchEngageBattle：执行战斗锁定或普通攻击的入口。 */
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
        this.worldRuntimeBattleEngageService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, this);
    }
    /** dispatchCastSkillToMonster：把技能结算到妖兽目标上。 */
    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, this);
    }
    /** dispatchCastSkillToTile：把技能结算到地块目标上。 */
    dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, this);
    }
    /** dispatchSystemCommand：执行世界层系统命令。 */
    dispatchSystemCommand(command) {
        switch (command.kind) {
            case 'spawnMonsterLoot':
                this.dispatchSpawnMonsterLoot(command.instanceId, command.x, command.y, command.monsterId, command.rolls);
                return;
            case 'damageMonster':
                this.dispatchDamageMonster(command.instanceId, command.runtimeId, command.amount);
                return;
            case 'defeatMonster':
                this.dispatchDefeatMonster(command.instanceId, command.runtimeId);
                return;
            case 'damagePlayer':
                this.dispatchDamagePlayer(command.playerId, command.amount);
                return;
            case 'respawnPlayer':
                this.respawnPlayer(command.playerId);
                return;
            case 'resetPlayerSpawn':
                this.respawnPlayer(command.playerId);
                return;
            case 'gmUpdatePlayer':
                this.worldRuntimeGmQueueService.dispatchGmUpdatePlayer(command, {
                    playerRuntimeService: this.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => this.resolveDefaultRespawnMapId(),
                    getOrCreatePublicInstance: (mapId) => this.getOrCreatePublicInstance(mapId),
                    playerLocations: this.playerLocations,
                    instances: this.instances,
                    getPlayerViewOrThrow: (playerId) => this.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => this.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => this.resolveCurrentTickForPlayerId(playerId),
                });
                return;
            case 'gmResetPlayer':
                this.respawnPlayer(command.playerId);
                return;
            case 'gmSpawnBots':
                this.worldRuntimeGmQueueService.dispatchGmSpawnBots(command.anchorPlayerId, command.count, {
                    playerRuntimeService: this.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => this.resolveDefaultRespawnMapId(),
                    connectPlayer: (input) => this.connectPlayer(input),
                    getPlayerViewOrThrow: (playerId) => this.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => this.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => this.resolveCurrentTickForPlayerId(playerId),
                });
                return;
            case 'gmRemoveBots':
                this.worldRuntimeGmQueueService.dispatchGmRemoveBots(command.playerIds, command.all, {
                    playerRuntimeService: this.playerRuntimeService,
                    removePlayer: (playerId) => this.removePlayer(playerId),
                });
                return;
        }
    }
    /** dispatchUseItem：执行物品使用结算。 */
    dispatchUseItem(playerId, slotIndex) {
        this.worldRuntimeUseItemService.dispatchUseItem(playerId, slotIndex, this);
    }
    /** dispatchBreakthrough：触发修为突破结算。 */
    dispatchBreakthrough(playerId) {
        this.worldRuntimeProgressionService.dispatchBreakthrough(playerId, this);
    }
    /** dispatchHeavenGateAction：执行天门关卡动作。 */
    dispatchHeavenGateAction(playerId, action, element) {
        this.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, action, element, this);
    }
    /** dispatchMoveTo：执行点位导航的首步推进。 */
    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint = null) {
        this.worldRuntimeNavigationService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, this);
    }
    /** dispatchBasicAttack：执行普通攻击结算，目标可以是玩家、妖兽或地块。 */
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
        this.worldRuntimeBasicAttackService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, this);
    }
    /** dispatchDropItem：执行丢弃物品结算。 */
    dispatchDropItem(playerId, slotIndex, count) {
        this.worldRuntimeItemGroundService.dispatchDropItem(playerId, slotIndex, count, this);
    }
    /** dispatchTakeGround：执行地面或容器拾取结算。 */
    dispatchTakeGround(playerId, sourceId, itemKey) {
        this.worldRuntimeItemGroundService.dispatchTakeGround(playerId, sourceId, itemKey, this);
    }
    /** dispatchTakeGroundAll：执行一键拾取结算。 */
    dispatchTakeGroundAll(playerId, sourceId) {
        this.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, sourceId, this);
    }
    /** dispatchBuyNpcShopItem：执行 NPC 商店购买结算。 */
    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
        this.worldRuntimeNpcQuestShopService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, this);
    }
    /** dispatchNpcInteraction：执行 NPC 交互结算。 */
    dispatchNpcInteraction(playerId, npcId) {
        this.worldRuntimeNpcQuestShopService.dispatchNpcInteraction(playerId, npcId, this);
    }
    /** dispatchEquipItem：执行装备穿戴结算。 */
    dispatchEquipItem(playerId, slotIndex) {
        this.worldRuntimeEquipmentService.dispatchEquipItem(playerId, slotIndex, this);
    }
    /** dispatchUnequipItem：执行装备卸下结算。 */
    dispatchUnequipItem(playerId, slot) {
        this.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, slot, this);
    }
    /** dispatchCultivateTechnique：执行功法修炼切换。 */
    dispatchCultivateTechnique(playerId, techniqueId) {
        this.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, techniqueId, this);
    }
    /** dispatchStartAlchemy：启动炼丹流程。 */
    dispatchStartAlchemy(playerId, payload) {
        this.worldRuntimeCraftService.dispatchStartAlchemy(playerId, payload, this);
    }
    /** dispatchCancelAlchemy：取消炼丹流程。 */
    dispatchCancelAlchemy(playerId) {
        this.worldRuntimeCraftService.dispatchCancelAlchemy(playerId, this);
    }
    /** dispatchSaveAlchemyPreset：保存炼制预设。 */
    dispatchSaveAlchemyPreset(playerId, payload) {
        this.worldRuntimeCraftService.dispatchSaveAlchemyPreset(playerId, payload, this);
    }
    /** dispatchDeleteAlchemyPreset：删除炼制预设。 */
    dispatchDeleteAlchemyPreset(playerId, presetId) {
        this.worldRuntimeCraftService.dispatchDeleteAlchemyPreset(playerId, presetId, this);
    }
    /** dispatchStartEnhancement：启动强化流程。 */
    dispatchStartEnhancement(playerId, payload) {
        this.worldRuntimeCraftService.dispatchStartEnhancement(playerId, payload, this);
    }
    /** dispatchCancelEnhancement：取消强化流程。 */
    dispatchCancelEnhancement(playerId) {
        this.worldRuntimeCraftService.dispatchCancelEnhancement(playerId, this);
    }
    /** dispatchInteractNpcQuest：推进 NPC 对话型任务的交互进度。 */
    dispatchInteractNpcQuest(playerId, npcId) {
        this.worldRuntimeNpcQuestShopService.dispatchInteractNpcQuest(playerId, npcId, this);
    }
    /** dispatchAcceptNpcQuest：接取 NPC 任务并写入玩家任务列表。 */
    dispatchAcceptNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeNpcQuestShopService.dispatchAcceptNpcQuest(playerId, npcId, questId, this);
    }
    /** dispatchSubmitNpcQuest：提交 NPC 任务并发放奖励。 */
    dispatchSubmitNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeNpcQuestShopService.dispatchSubmitNpcQuest(playerId, npcId, questId, this);
    }
    /** dispatchSpawnMonsterLoot：按掉落表生成妖兽战利品。 */
    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const items = this.contentTemplateRepository.rollMonsterDrops(monsterId, rolls);
        if (items.length === 0) {
            throw new common_1.NotFoundException(`Monster ${monsterId} produced no loot`);
        }
        for (const item of items) {
            this.spawnGroundItem(instance, x, y, item);
        }
    }
    /** dispatchDefeatMonster：直接结算妖兽被击败后的掉落。 */
    dispatchDefeatMonster(instanceId, runtimeId) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const monster = instance.defeatMonster(runtimeId);
        if (!monster) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found or already dead`);
        }

        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1);
        for (const item of items) {
            this.spawnGroundItem(instance, monster.x, monster.y, item);
        }
    }
    /** dispatchDamagePlayer：对玩家直接施加伤害。 */
    dispatchDamagePlayer(playerId, amount) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.hp <= 0) {
            this.handlePlayerDefeat(playerId);
            return;
        }

        const updated = this.playerRuntimeService.applyDamage(playerId, amount);
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            this.handlePlayerDefeat(playerId);
        }
    }
    /** dispatchDamageMonster：对妖兽直接施加伤害。 */
    dispatchDamageMonster(instanceId, runtimeId, amount) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const target = instance.getMonster(runtimeId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found`);
        }

        const outcome = instance.applyDamageToMonster(runtimeId, amount);
        if (!outcome?.defeated) {
            return;
        }

        const items = this.contentTemplateRepository.rollMonsterDrops(target.monsterId, 1);
        for (const item of items) {
            this.spawnGroundItem(instance, target.x, target.y, item);
        }
    }
    /** spawnGroundItem：在地面上生成物品堆。 */
    spawnGroundItem(instance, x, y, item) {

        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new common_1.BadRequestException(`Failed to spawn loot at ${x},${y}`);
        }
    }
    /** handlePlayerMonsterKill：处理玩家击杀妖兽后的奖励和进度。 */
    handlePlayerMonsterKill(instance, monster, killerPlayerId) {
        this.worldRuntimePlayerCombatService.handlePlayerMonsterKill(instance, monster, killerPlayerId, this);
    }
    /** createNpcShopEnvelope：构建 NPC 商店封装结果。 */
    createNpcShopEnvelope(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return this.worldRuntimeNpcShopQueryService.createEnvelopeForNpc(npc);
    }
    /** resolveAdjacentNpc：校验并读取相邻 NPC。 */
    resolveAdjacentNpc(playerId, npcId) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const npc = instance.getAdjacentNpc(playerId, npcId);
        if (!npc) {
            throw new common_1.NotFoundException('你离这位商人太远了');
        }
        return npc;
    }
    /** buildNpcShopState：构建 NPC 商店的可售状态。 */
    buildNpcShopState(npc) {
        return this.worldRuntimeNpcShopQueryService.buildShopState(npc);
    }
    /** createNpcQuestsEnvelope：构建 NPC 任务封装结果。 */
    createNpcQuestsEnvelope(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return this.worldRuntimeQuestQueryService.createNpcQuestsEnvelope(playerId, npc);
    }
    /** collectNpcQuestViews：收集玩家在该 NPC 处可见的任务。 */
    collectNpcQuestViews(playerId, npc) {
        return this.worldRuntimeQuestQueryService.collectNpcQuestViews(playerId, npc);
    }
    /** refreshQuestStates：根据当前运行态刷新任务进度和状态。 */
    refreshQuestStates(playerId, forceDirty = false) {

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
                : this.canQuestBecomeReady(playerId, quest)
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
    /** resolveQuestProgress：计算任务当前进度。 */
    resolveQuestProgress(playerId, quest) {
        return this.worldRuntimeQuestQueryService.resolveQuestProgress(playerId, quest);
    }
    /** canQuestBecomeReady：判断任务是否已经满足交付条件。 */
    canQuestBecomeReady(playerId, quest) {
        return this.worldRuntimeQuestQueryService.canQuestBecomeReady(playerId, quest);
    }
    /** createQuestStateFromSource：把模板任务展开成玩家运行时任务。 */
    createQuestStateFromSource(playerId, questId, status = 'active') {
        return this.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, questId, status);
    }
    /** tryAcceptNextQuest：尝试自动接取下一环任务。 */
    tryAcceptNextQuest(playerId, nextQuestId) {
        if (!nextQuestId) {
            return null;
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === nextQuestId)) {
            return null;
        }

        const nextQuest = this.createQuestStateFromSource(playerId, nextQuestId, 'active');
        player.quests.quests.push(nextQuest);
        this.playerRuntimeService.markQuestStateDirty(playerId);
        return cloneQuestState(nextQuest);
    }
    /** advanceKillQuestProgress：推进击杀类任务进度。 */
    advanceKillQuestProgress(playerId, monsterId, monsterName) {

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
    /** advanceLearnTechniqueQuest：推进学习功法类任务进度。 */
    advanceLearnTechniqueQuest(playerId, techniqueId) {

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
    /** buildQuestRewardItems：构建任务奖励物品列表。 */
    buildQuestRewardItems(quest) {
        return this.worldRuntimeQuestQueryService.buildQuestRewardItems(quest);
    }
    /** buildQuestRewardItemsFromRecord：从任务原始记录构建奖励物品列表。 */
    buildQuestRewardItemsFromRecord(quest) {
        return this.worldRuntimeQuestQueryService.buildQuestRewardItemsFromRecord(quest);
    }
    /** canReceiveRewardItems：判断玩家是否还能接收任务奖励。 */
    canReceiveRewardItems(playerId, rewards) {

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
    /** resolveQuestNavigationTarget：解析任务对应的导航目标。 */
    resolveQuestNavigationTarget(quest) {
        return this.worldRuntimeQuestQueryService.resolveQuestNavigationTarget(quest);
    }
    /** resolveNpcQuestMarker：解析 NPC 头顶的任务标记。 */
    resolveNpcQuestMarker(playerId, npcId) {
        const npc = this.getNpcForPlayerMap(playerId, npcId);
        return this.worldRuntimeNpcQuestInteractionQueryService.resolveNpcQuestMarker(playerId, npcId, npc);
    }
    /** getNpcForPlayerMap：读取玩家当前地图中的 NPC。 */
    getNpcForPlayerMap(playerId, npcId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return null;
        }
        return this.instances.get(location.instanceId)?.getNpc(npcId) ?? null;
    }
    /** validateNpcShopPurchase：校验 NPC 商店购买条件。 */
    validateNpcShopPurchase(playerId, npcId, itemId, quantity) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return this.worldRuntimeNpcShopQueryService.validatePurchaseForNpc(playerId, npc, itemId, quantity);
    }
    /** getNpcShopCurrencyName：读取 NPC 商店货币名称。 */
    getNpcShopCurrencyName() {
        return this.worldRuntimeNpcShopQueryService.getCurrencyItemName();
    }
    /** decoratePlayerViewNpcs：为玩家视野中的 NPC 补充任务标记。 */
    decoratePlayerViewNpcs(playerId, view) {
        return {
            ...view,
            localNpcs: view.localNpcs.map((entry) => ({
                ...entry,
                questMarker: this.resolveNpcQuestMarker(playerId, entry.npcId),
            })),
        };
    }
    /** buildContextActions：根据当前视野构建上下文动作列表。 */
    buildContextActions(view) {

        const actions = [];

        const player = this.playerRuntimeService.getPlayer(view.playerId);
        actions.push({
            id: 'battle:force_attack',
            name: '强制攻击',
            type: 'battle',
            desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
            cooldownLeft: 0,
            range: Math.max(1, Math.round(player?.attrs.numericStats.viewRange ?? 1)),
            requiresTarget: true,
            targetMode: 'any',
        });
        actions.push({
            id: 'travel:return_spawn',
            name: '遁返云来',
            type: 'travel',
            desc: '催动归引灵符，立即返回当前角色的默认落脚点。',
            cooldownLeft: 0,
        });
        for (const action of STATIC_TOGGLE_CONTEXT_ACTIONS) {
            actions.push({
                id: action.id,
                name: action.name,
                type: action.type,
                desc: action.desc,
                cooldownLeft: 0,
            });
        }
        for (const portal of view.localPortals) {
            if (portal.trigger !== 'manual' || portal.x !== view.self.x || portal.y !== view.self.y) {
                continue;
            }

            const targetName = this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : portal.targetMapId;
            actions.push({
                id: 'portal:travel',
                name: `传送至：${targetName}`,
                type: 'travel',
                desc: `踏入对应界门，前往 ${targetName}。`,
                cooldownLeft: 0,
            });
        }
        for (const npc of view.localNpcs) {
            if (chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) <= 1) {
                actions.push({
                    id: `npc:${npc.npcId}`,
                    name: `交谈：${npc.name}`,
                    type: 'interact',
                    desc: npc.dialogue?.trim() ? npc.dialogue.trim() : `与 ${npc.name} 交谈。`,
                    cooldownLeft: 0,
                });
            }
            const npcQuestAction = this.worldRuntimeNpcQuestInteractionQueryService.buildNpcQuestContextAction(view, npc);
            if (npcQuestAction) {
                actions.push(npcQuestAction);
            }
            if (!npc.hasShop || chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) > 1) {
                continue;
            }
            actions.push({
                id: `npc_shop:${npc.npcId}`,
                name: `商店：${npc.name}`,
                type: 'interact',
                desc: `查看 ${npc.name} 当前出售的货物。`,
                cooldownLeft: 0,
            });
        }
        if (player?.realm?.breakthroughReady) {

            const preview = player.realm.breakthrough;
            actions.push({
                id: 'realm:breakthrough',
                name: `突破至 ${preview?.targetDisplayName ?? '下一境界'}`,
                type: 'breakthrough',
                desc: preview?.blockedReason ?? `当前境界已圆满，点击查看 ${preview?.targetDisplayName ?? '下一境界'} 的突破要求。`,
                cooldownLeft: 0,
            });
        }

        const weapon = player?.equipment?.slots?.find((entry) => entry.slot === 'weapon')?.item ?? null;
        if (weapon?.tags?.includes('alchemy_furnace') || player?.alchemyJob) {
            actions.push({
                id: 'alchemy:open',
                name: '炼丹',
                type: 'interact',
                desc: weapon?.tags?.includes('alchemy_furnace')
                    ? '查看当前丹炉、丹方目录与炼制状态。'
                    : '查看当前炼丹状态。',
                cooldownLeft: 0,
            });
        }
        if (weapon?.tags?.includes('enhancement_hammer') || player?.enhancementJob) {
            actions.push({
                id: 'enhancement:open',
                name: '强化',
                type: 'interact',
                desc: weapon?.tags?.includes('enhancement_hammer')
                    ? '查看当前强化候选、保护材料与强化状态。'
                    : '查看当前强化状态。',
                cooldownLeft: 0,
            });
        }
        actions.sort((left, right) => compareStableStrings(left.id, right.id));
        return actions;
    }
    /** applyMonsterAction：应用实例 tick 产出的妖兽动作。 */
    applyMonsterAction(action) {
        this.worldRuntimeMonsterActionApplyService.applyMonsterAction(action, this);
    }
    /** applyMonsterBasicAttack：把妖兽普通攻击结算到玩家身上。 */
    applyMonsterBasicAttack(action) {
        this.worldRuntimeMonsterActionApplyService.applyMonsterBasicAttack(action, this);
    }
    /** applyMonsterSkill：把妖兽技能结算到玩家身上。 */
    applyMonsterSkill(action) {
        this.worldRuntimeMonsterActionApplyService.applyMonsterSkill(action, this);
    }
    /** handlePlayerDefeat：标记玩家进入复生队列。 */
    handlePlayerDefeat(playerId) {
        this.worldRuntimePlayerCombatService.handlePlayerDefeat(playerId, this);
    }
    /** processPendingRespawns：处理等待复生的玩家。 */
    processPendingRespawns() {
        this.worldRuntimeRespawnService.processPendingRespawns(this);
    }
    /** respawnPlayer：把玩家复生请求交给世界运行时处理。 */
    respawnPlayer(playerId) {
        this.worldRuntimeRespawnService.respawnPlayer(playerId, this);
    }
    /** ensureAttackAllowed：校验当前角色是否允许发起攻击。 */
    ensureAttackAllowed(player, skill) {
        if (skill && !isHostileSkill(skill)) {
            return;
        }
        if (!player.instanceId) {
            return;
        }

        const instance = this.instances.get(player.instanceId);
        if (!instance || !instance.isPointInSafeZone(player.x, player.y)) {
            return;
        }
        throw new common_1.BadRequestException('安全区内无法发起攻击。');
    }
    /** queuePlayerNotice：把通知排入玩家运行态消息队列。 */
    queuePlayerNotice(playerId, text, kind) {
        try {
            this.playerRuntimeService.enqueueNotice(playerId, {
                text,
                kind,
            });
        }
        catch {
            // 玩家已经不在线时忽略通知，避免影响主流程。
        }
    }
    /** pushCombatEffect：收集战斗特效，等待同步层统一发送。 */
    pushCombatEffect(instanceId, effect) {
        this.worldRuntimeCombatEffectsService.pushCombatEffect(instanceId, effect);
    }
    /** pushActionLabelEffect：追加动作标签浮字特效。 */
    pushActionLabelEffect(instanceId, x, y, text) {
        this.worldRuntimeCombatEffectsService.pushActionLabelEffect(instanceId, x, y, text);
    }
    /** pushDamageFloatEffect：追加伤害数字浮字特效。 */
    pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.worldRuntimeCombatEffectsService.pushDamageFloatEffect(instanceId, x, y, damage, color);
    }
    /** pushAttackEffect：追加攻击轨迹特效。 */
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.worldRuntimeCombatEffectsService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color);
    }
};
exports.WorldRuntimeService = WorldRuntimeService;
exports.WorldRuntimeService = WorldRuntimeService = WorldRuntimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    /** __param：param。 */
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_client_event_service_1.WorldClientEventService))),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        map_persistence_service_1.MapPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService,
        redeem_code_runtime_service_1.RedeemCodeRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_runtime_npc_shop_query_service_1.WorldRuntimeNpcShopQueryService,
        world_runtime_quest_query_service_1.WorldRuntimeQuestQueryService,
        world_runtime_detail_query_service_1.WorldRuntimeDetailQueryService,
        world_runtime_metrics_service_1.WorldRuntimeMetricsService,
        world_runtime_instance_tick_orchestration_service_1.WorldRuntimeInstanceTickOrchestrationService,
        world_runtime_movement_service_1.WorldRuntimeMovementService,
        world_runtime_summary_query_service_1.WorldRuntimeSummaryQueryService,
        world_runtime_instance_state_service_1.WorldRuntimeInstanceStateService,
        world_runtime_instance_query_service_1.WorldRuntimeInstanceQueryService,
        world_runtime_pending_command_service_1.WorldRuntimePendingCommandService,
        world_runtime_player_location_service_1.WorldRuntimePlayerLocationService,
        world_runtime_tick_progress_service_1.WorldRuntimeTickProgressService,
        world_runtime_npc_quest_interaction_query_service_1.WorldRuntimeNpcQuestInteractionQueryService,
        world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
        world_runtime_respawn_service_1.WorldRuntimeRespawnService,
        world_runtime_craft_service_1.WorldRuntimeCraftService,
        world_runtime_npc_quest_shop_service_1.WorldRuntimeNpcQuestShopService,
        world_runtime_loot_container_service_1.WorldRuntimeLootContainerService,
        world_runtime_navigation_service_1.WorldRuntimeNavigationService,
        world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService,
        world_runtime_monster_action_apply_service_1.WorldRuntimeMonsterActionApplyService,
        world_runtime_basic_attack_service_1.WorldRuntimeBasicAttackService,
        world_runtime_player_combat_service_1.WorldRuntimePlayerCombatService,
        world_runtime_item_ground_service_1.WorldRuntimeItemGroundService,
        world_runtime_equipment_service_1.WorldRuntimeEquipmentService,
        world_runtime_cultivation_service_1.WorldRuntimeCultivationService,
        world_runtime_progression_service_1.WorldRuntimeProgressionService,
        world_runtime_use_item_service_1.WorldRuntimeUseItemService,
        world_runtime_player_skill_dispatch_service_1.WorldRuntimePlayerSkillDispatchService,
        world_runtime_battle_engage_service_1.WorldRuntimeBattleEngageService,
        world_runtime_auto_combat_service_1.WorldRuntimeAutoCombatService])
], WorldRuntimeService);
// helper functions were split into dedicated helper modules for maintainability.
//# sourceMappingURL=world-runtime.service.js.map
