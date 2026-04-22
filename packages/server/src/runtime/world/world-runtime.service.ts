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

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};

var WorldRuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

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

const world_runtime_quest_state_service_1 = require("./world-runtime-quest-state.service");

const world_runtime_detail_query_service_1 = require("./world-runtime-detail-query.service");

const world_runtime_context_action_query_service_1 = require("./world-runtime-context-action-query.service");

const world_runtime_player_view_query_service_1 = require("./world-runtime-player-view-query.service");

const world_runtime_metrics_service_1 = require("./world-runtime-metrics.service");

const world_runtime_frame_service_1 = require("./world-runtime-frame.service");
const world_runtime_lifecycle_service_1 = require("./world-runtime-lifecycle.service");
const world_runtime_persistence_state_service_1 = require("./world-runtime-persistence-state.service");
const world_runtime_player_session_service_1 = require("./world-runtime-player-session.service");
const world_runtime_command_intake_facade_service_1 = require("./world-runtime-command-intake-facade.service");
const world_runtime_gameplay_write_facade_service_1 = require("./world-runtime-gameplay-write-facade.service");
const world_runtime_instance_read_facade_service_1 = require("./world-runtime-instance-read-facade.service");
const world_runtime_quest_runtime_facade_service_1 = require("./world-runtime-quest-runtime-facade.service");
const world_runtime_read_facade_service_1 = require("./world-runtime-read-facade.service");
const world_runtime_state_facade_service_1 = require("./world-runtime-state-facade.service");
const world_runtime_tick_dispatch_service_1 = require("./world-runtime-tick-dispatch.service");
const world_runtime_world_access_service_1 = require("./world-runtime-world-access.service");

const world_runtime_instance_tick_orchestration_service_1 = require("./world-runtime-instance-tick-orchestration.service");

const world_runtime_movement_service_1 = require("./world-runtime-movement.service");

const world_runtime_summary_query_service_1 = require("./world-runtime-summary-query.service");

const world_runtime_instance_state_service_1 = require("./world-runtime-instance-state.service");

const world_runtime_instance_query_service_1 = require("./world-runtime-instance-query.service");

const world_runtime_pending_command_service_1 = require("./world-runtime-pending-command.service");

const world_runtime_player_location_service_1 = require("./world-runtime-player-location.service");

const world_runtime_tick_progress_service_1 = require("./world-runtime-tick-progress.service");

const world_runtime_npc_quest_interaction_query_service_1 = require("./world-runtime-npc-quest-interaction-query.service");

const world_runtime_npc_shop_service_1 = require("./world-runtime-npc-shop.service");

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");

const world_runtime_system_command_service_1 = require("./world-runtime-system-command.service");

const world_runtime_craft_tick_service_1 = require("./world-runtime-craft-tick.service");

const world_runtime_craft_mutation_service_1 = require("./world-runtime-craft-mutation.service");

const world_runtime_craft_interrupt_service_1 = require("./world-runtime-craft-interrupt.service");

const world_runtime_alchemy_service_1 = require("./world-runtime-alchemy.service");

const world_runtime_npc_quest_write_service_1 = require("./world-runtime-npc-quest-write.service");

const world_runtime_loot_container_service_1 = require("./world-runtime-loot-container.service");

const world_runtime_navigation_service_1 = require("./world-runtime-navigation.service");

const world_runtime_combat_effects_service_1 = require("./world-runtime-combat-effects.service");

const world_runtime_monster_action_apply_service_1 = require("./world-runtime-monster-action-apply.service");

const world_runtime_basic_attack_service_1 = require("./world-runtime-basic-attack.service");

const world_runtime_monster_system_command_service_1 = require("./world-runtime-monster-system-command.service");

const world_runtime_player_combat_outcome_service_1 = require("./world-runtime-player-combat-outcome.service");

const world_runtime_player_command_service_1 = require("./world-runtime-player-command.service");
const world_runtime_player_command_enqueue_service_1 = require("./world-runtime-player-command-enqueue.service");

const world_runtime_item_ground_service_1 = require("./world-runtime-item-ground.service");

const world_runtime_transfer_service_1 = require("./world-runtime-transfer.service");

const world_runtime_npc_access_service_1 = require("./world-runtime-npc-access.service");

const world_runtime_equipment_service_1 = require("./world-runtime-equipment.service");

const world_runtime_cultivation_service_1 = require("./world-runtime-cultivation.service");

const world_runtime_progression_service_1 = require("./world-runtime-progression.service");

const world_runtime_enhancement_service_1 = require("./world-runtime-enhancement.service");

const world_runtime_use_item_service_1 = require("./world-runtime-use-item.service");

const world_runtime_redeem_code_service_1 = require("./world-runtime-redeem-code.service");

const world_runtime_player_skill_dispatch_service_1 = require("./world-runtime-player-skill-dispatch.service");

const world_runtime_battle_engage_service_1 = require("./world-runtime-battle-engage.service");

const world_runtime_auto_combat_service_1 = require("./world-runtime-auto-combat.service");
const world_runtime_combat_command_service_1 = require("./world-runtime-combat-command.service");
const world_runtime_action_execution_service_1 = require("./world-runtime-action-execution.service");
const world_runtime_system_command_enqueue_service_1 = require("./world-runtime-system-command-enqueue.service");

const player_combat_service_1 = require("../combat/player-combat.service");

const map_instance_runtime_1 = require("../instance/map-instance.runtime");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const {
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

const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

const TICK_METRIC_WINDOW_SIZE = 60;

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
    
    worldRuntimeQuestStateService;    
    
    worldRuntimeDetailQueryService;    
    
    worldRuntimeContextActionQueryService;    
    
    worldRuntimePlayerViewQueryService;    
    
    worldRuntimeMetricsService;    
    
    worldRuntimeFrameService;    
    
    worldRuntimeLifecycleService;    
    
    worldRuntimePersistenceStateService;    
    
    worldRuntimePlayerSessionService;    
    
    worldRuntimeCommandIntakeFacadeService;    
    
    worldRuntimeGameplayWriteFacadeService;    
    
    worldRuntimeInstanceReadFacadeService;    
    
    worldRuntimeQuestRuntimeFacadeService;    
    
    worldRuntimeReadFacadeService;    
    
    worldRuntimeStateFacadeService;    
    
    worldRuntimeTickDispatchService;    
    
    worldRuntimeWorldAccessService;    
    
    worldRuntimeInstanceTickOrchestrationService;    
    
    worldRuntimeMovementService;    
    
    worldRuntimeSummaryQueryService;    
    
    worldRuntimeInstanceStateService;    
    
    worldRuntimeInstanceQueryService;    
    
    worldRuntimePendingCommandService;    
    
    worldRuntimePlayerLocationService;    
    
    worldRuntimeTickProgressService;    
    
    worldRuntimeNpcQuestInteractionQueryService;    
    
    worldRuntimeNpcShopService;    
    
    worldRuntimeGmQueueService;    
    
    worldRuntimeSystemCommandService;    
    
    worldRuntimeCraftTickService;    
    
    worldRuntimeCraftMutationService;    
    
    worldRuntimeCraftInterruptService;    
    
    worldRuntimeAlchemyService;    
    
    worldRuntimeNpcQuestWriteService;    
    
    worldRuntimeLootContainerService;    
    
    worldRuntimeNavigationService;    
    
    worldRuntimeCombatEffectsService;    
    
    worldRuntimeMonsterActionApplyService;    
    
    worldRuntimeBasicAttackService;    
    
    worldRuntimeMonsterSystemCommandService;    
    
    worldRuntimePlayerCombatOutcomeService;    
    
    worldRuntimePlayerCommandService;    
    
    worldRuntimePlayerCommandEnqueueService;    
    
    worldRuntimeItemGroundService;    
    
    worldRuntimeTransferService;    
    
    worldRuntimeNpcAccessService;    
    
    worldRuntimeEquipmentService;    
    
    worldRuntimeCultivationService;    
    
    worldRuntimeProgressionService;    
    
    worldRuntimeUseItemService;    
    
    worldRuntimeRedeemCodeService;    
    
    worldRuntimePlayerSkillDispatchService;    
    
    worldRuntimeBattleEngageService;    
    
    worldRuntimeAutoCombatService;    
    
    worldRuntimeCombatCommandService;    
    
    worldRuntimeActionExecutionService;    
    
    worldRuntimeSystemCommandEnqueueService;    
    
    logger = new common_1.Logger(WorldRuntimeService_1.name);    
    
    tick = 0;    
    
    constructor(contentTemplateRepository, templateRepository, mapPersistenceService, playerRuntimeService, playerCombatService, worldSessionService, worldClientEventService, redeemCodeRuntimeService, craftPanelRuntimeService, worldRuntimeNpcShopQueryService, worldRuntimeQuestQueryService, worldRuntimeQuestStateService, worldRuntimeDetailQueryService, worldRuntimeContextActionQueryService, worldRuntimePlayerViewQueryService, worldRuntimeMetricsService, worldRuntimeFrameService, worldRuntimeLifecycleService, worldRuntimePersistenceStateService, worldRuntimePlayerSessionService, worldRuntimeCommandIntakeFacadeService, worldRuntimeGameplayWriteFacadeService, worldRuntimeInstanceReadFacadeService, worldRuntimeQuestRuntimeFacadeService, worldRuntimeReadFacadeService, worldRuntimeStateFacadeService, worldRuntimeTickDispatchService, worldRuntimeWorldAccessService, worldRuntimeInstanceTickOrchestrationService, worldRuntimeMovementService, worldRuntimeSummaryQueryService, worldRuntimeInstanceStateService, worldRuntimeInstanceQueryService, worldRuntimePendingCommandService, worldRuntimePlayerLocationService, worldRuntimeTickProgressService, worldRuntimeNpcQuestInteractionQueryService, worldRuntimeNpcShopService, worldRuntimeGmQueueService, worldRuntimeSystemCommandService, worldRuntimeCraftTickService, worldRuntimeCraftMutationService, worldRuntimeCraftInterruptService, worldRuntimeAlchemyService, worldRuntimeNpcQuestWriteService, worldRuntimeLootContainerService, worldRuntimeNavigationService, worldRuntimeCombatEffectsService, worldRuntimeMonsterActionApplyService, worldRuntimeBasicAttackService, worldRuntimeMonsterSystemCommandService, worldRuntimePlayerCombatOutcomeService, worldRuntimePlayerCommandService, worldRuntimePlayerCommandEnqueueService, worldRuntimeItemGroundService, worldRuntimeTransferService, worldRuntimeNpcAccessService, worldRuntimeEquipmentService, worldRuntimeCultivationService, worldRuntimeProgressionService, worldRuntimeEnhancementService, worldRuntimeUseItemService, worldRuntimeRedeemCodeService, worldRuntimePlayerSkillDispatchService, worldRuntimeBattleEngageService, worldRuntimeAutoCombatService, worldRuntimeCombatCommandService, worldRuntimeActionExecutionService, worldRuntimeSystemCommandEnqueueService) {
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
        this.worldRuntimeQuestStateService = worldRuntimeQuestStateService;
        this.worldRuntimeDetailQueryService = worldRuntimeDetailQueryService;
        this.worldRuntimeContextActionQueryService = worldRuntimeContextActionQueryService;
        this.worldRuntimePlayerViewQueryService = worldRuntimePlayerViewQueryService;
        this.worldRuntimeMetricsService = worldRuntimeMetricsService;
        this.worldRuntimeFrameService = worldRuntimeFrameService;
        this.worldRuntimeLifecycleService = worldRuntimeLifecycleService;
        this.worldRuntimePersistenceStateService = worldRuntimePersistenceStateService;
        this.worldRuntimePlayerSessionService = worldRuntimePlayerSessionService;
        this.worldRuntimeCommandIntakeFacadeService = worldRuntimeCommandIntakeFacadeService;
        this.worldRuntimeGameplayWriteFacadeService = worldRuntimeGameplayWriteFacadeService;
        this.worldRuntimeInstanceReadFacadeService = worldRuntimeInstanceReadFacadeService;
        this.worldRuntimeQuestRuntimeFacadeService = worldRuntimeQuestRuntimeFacadeService;
        this.worldRuntimeReadFacadeService = worldRuntimeReadFacadeService;
        this.worldRuntimeStateFacadeService = worldRuntimeStateFacadeService;
        this.worldRuntimeTickDispatchService = worldRuntimeTickDispatchService;
        this.worldRuntimeWorldAccessService = worldRuntimeWorldAccessService;
        this.worldRuntimeInstanceTickOrchestrationService = worldRuntimeInstanceTickOrchestrationService;
        this.worldRuntimeMovementService = worldRuntimeMovementService;
        this.worldRuntimeSummaryQueryService = worldRuntimeSummaryQueryService;
        this.worldRuntimeInstanceStateService = worldRuntimeInstanceStateService;
        this.worldRuntimeInstanceQueryService = worldRuntimeInstanceQueryService;
        this.worldRuntimePendingCommandService = worldRuntimePendingCommandService;
        this.worldRuntimePlayerLocationService = worldRuntimePlayerLocationService;
        this.worldRuntimeTickProgressService = worldRuntimeTickProgressService;
        this.worldRuntimeNpcQuestInteractionQueryService = worldRuntimeNpcQuestInteractionQueryService;
        this.worldRuntimeNpcShopService = worldRuntimeNpcShopService;
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimeSystemCommandService = worldRuntimeSystemCommandService;
        this.worldRuntimeCraftTickService = worldRuntimeCraftTickService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
        this.worldRuntimeCraftInterruptService = worldRuntimeCraftInterruptService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
        this.worldRuntimeNpcQuestWriteService = worldRuntimeNpcQuestWriteService;
        this.worldRuntimeLootContainerService = worldRuntimeLootContainerService;
        this.worldRuntimeNavigationService = worldRuntimeNavigationService;
        this.worldRuntimeCombatEffectsService = worldRuntimeCombatEffectsService;
        this.worldRuntimeMonsterActionApplyService = worldRuntimeMonsterActionApplyService;
        this.worldRuntimeBasicAttackService = worldRuntimeBasicAttackService;
        this.worldRuntimeMonsterSystemCommandService = worldRuntimeMonsterSystemCommandService;
        this.worldRuntimePlayerCombatOutcomeService = worldRuntimePlayerCombatOutcomeService;
        this.worldRuntimePlayerCommandService = worldRuntimePlayerCommandService;
        this.worldRuntimePlayerCommandEnqueueService = worldRuntimePlayerCommandEnqueueService;
        this.worldRuntimeItemGroundService = worldRuntimeItemGroundService;
        this.worldRuntimeTransferService = worldRuntimeTransferService;
        this.worldRuntimeNpcAccessService = worldRuntimeNpcAccessService;
        this.worldRuntimeEquipmentService = worldRuntimeEquipmentService;
        this.worldRuntimeCultivationService = worldRuntimeCultivationService;
        this.worldRuntimeProgressionService = worldRuntimeProgressionService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;
        this.worldRuntimeUseItemService = worldRuntimeUseItemService;
        this.worldRuntimeRedeemCodeService = worldRuntimeRedeemCodeService;
        this.worldRuntimePlayerSkillDispatchService = worldRuntimePlayerSkillDispatchService;
        this.worldRuntimeBattleEngageService = worldRuntimeBattleEngageService;
        this.worldRuntimeAutoCombatService = worldRuntimeAutoCombatService;
        this.worldRuntimeCombatCommandService = worldRuntimeCombatCommandService;
        this.worldRuntimeActionExecutionService = worldRuntimeActionExecutionService;
        this.worldRuntimeSystemCommandEnqueueService = worldRuntimeSystemCommandEnqueueService;
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
    
    get tickPhaseDurationHistoryMs() {
        return this.worldRuntimeMetricsService.tickPhaseDurationHistoryMs;
    }    
    
    get instanceTickProgressById() {
        return this.worldRuntimeTickProgressService.instanceTickProgressById;
    }    
    
    enqueuePendingCommand(playerId, command) {
        this.worldRuntimeStateFacadeService.enqueuePendingCommand(playerId, command, this);
    }    
    
    getPendingCommand(playerId) {
        return this.worldRuntimeStateFacadeService.getPendingCommand(playerId, this);
    }    
    
    hasPendingCommand(playerId) {
        return this.worldRuntimeStateFacadeService.hasPendingCommand(playerId, this);
    }    
    
    clearPendingCommand(playerId) {
        this.worldRuntimeStateFacadeService.clearPendingCommand(playerId, this);
    }    
    
    getPendingCommandCount() {
        return this.worldRuntimeStateFacadeService.getPendingCommandCount(this);
    }    
    
    getPlayerLocation(playerId) {
        return this.worldRuntimeStateFacadeService.getPlayerLocation(playerId, this);
    }    
    
    setPlayerLocation(playerId, location) {
        this.worldRuntimeStateFacadeService.setPlayerLocation(playerId, location, this);
    }    
    
    clearPlayerLocation(playerId) {
        this.worldRuntimeStateFacadeService.clearPlayerLocation(playerId, this);
    }    
    
    getPlayerLocationCount() {
        return this.worldRuntimeStateFacadeService.getPlayerLocationCount(this);
    }    
    
    listConnectedPlayerIds() {
        return this.worldRuntimeStateFacadeService.listConnectedPlayerIds(this);
    }    
    
    getInstanceRuntime(instanceId) {
        return this.worldRuntimeStateFacadeService.getInstanceRuntime(instanceId, this);
    }    
    
    setInstanceRuntime(instanceId, instance) {
        this.worldRuntimeStateFacadeService.setInstanceRuntime(instanceId, instance, this);
    }    
    
    listInstanceRuntimes() {
        return this.worldRuntimeStateFacadeService.listInstanceRuntimes(this);
    }    
    
    listInstanceEntries() {
        return this.worldRuntimeStateFacadeService.listInstanceEntries(this);
    }    
    
    getInstanceCount() {
        return this.worldRuntimeStateFacadeService.getInstanceCount(this);
    }
        async onModuleInit() {
        this.bootstrapPublicInstances();
    }
        async onApplicationBootstrap() {
        await this.rebuildPersistentRuntimeAfterRestore();
    }
        listMapTemplates() {
        return this.worldRuntimeInstanceReadFacadeService.listMapTemplates(this);
    }
        listInstances() {
        return this.worldRuntimeInstanceReadFacadeService.listInstances(this);
    }
        getInstance(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.getInstance(instanceId, this);
    }
        listInstanceMonsters(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.listInstanceMonsters(instanceId, this);
    }
        getInstanceMonster(instanceId, runtimeId) {
        return this.worldRuntimeInstanceReadFacadeService.getInstanceMonster(instanceId, runtimeId, this);
    }
        getInstanceTileState(instanceId, x, y) {
        return this.worldRuntimeInstanceReadFacadeService.getInstanceTileState(instanceId, x, y, this);
    }
        getCombatEffects(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.getCombatEffects(instanceId, this);
    }
        buildNpcShopView(playerId, npcIdInput) {
        return this.worldRuntimeReadFacadeService.buildNpcShopView(playerId, npcIdInput, this);
    }
        buildQuestListView(playerId, _input) {
        return this.worldRuntimeReadFacadeService.buildQuestListView(playerId, _input, this);
    }
        buildNpcQuestsView(playerId, npcIdInput) {
        return this.worldRuntimeReadFacadeService.buildNpcQuestsView(playerId, npcIdInput, this);
    }
        buildDetail(playerId, input) {
        return this.worldRuntimeReadFacadeService.buildDetail(playerId, input, this);
    }
        buildTileDetail(playerId, input) {
        return this.worldRuntimeReadFacadeService.buildTileDetail(playerId, input, this);
    }
        buildLootWindowSyncState(playerId, tileX, tileY) {
        return this.worldRuntimeReadFacadeService.buildLootWindowSyncState(playerId, tileX, tileY, this);
    }
        refreshPlayerContextActions(playerId, view) {
        return this.worldRuntimeReadFacadeService.refreshPlayerContextActions(playerId, view, this);
    }
        getPlayerView(playerId, radius) {
        return this.worldRuntimeReadFacadeService.getPlayerView(playerId, radius, this);
    }
        resolveCurrentTickForPlayerId(playerId) {
        return this.worldRuntimeWorldAccessService.resolveCurrentTickForPlayerId(playerId, this);
    }
        getLegacyNavigationPath(playerId) {
        return this.worldRuntimeTickDispatchService.getLegacyNavigationPath(playerId, this);
    }
        getRuntimeSummary() {
        return this.worldRuntimeWorldAccessService.getRuntimeSummary(this);
    }
        listDirtyPersistentInstances() {
        return this.worldRuntimeStateFacadeService.listDirtyPersistentInstances(this);
    }
        buildMapPersistenceSnapshot(instanceId) {
        return this.worldRuntimeStateFacadeService.buildMapPersistenceSnapshot(instanceId, this);
    }
        markMapPersisted(instanceId) {
        this.worldRuntimeStateFacadeService.markMapPersisted(instanceId, this);
    }
        tickAll() {
        return this.worldRuntimeStateFacadeService.tickAll(this);
    }
        advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {
        return this.worldRuntimeStateFacadeService.advanceFrame(frameDurationMs, getInstanceTickSpeed, this);
    }
        recordSyncFlushDuration(durationMs) {
        this.worldRuntimeStateFacadeService.recordSyncFlushDuration(durationMs, this);
    }
        bootstrapPublicInstances() {
        this.worldRuntimeStateFacadeService.bootstrapPublicInstances(this);
    }
        async restorePublicInstancePersistence() {
        await this.worldRuntimeStateFacadeService.restorePublicInstancePersistence(this);
    }
        async rebuildPersistentRuntimeAfterRestore() {
        await this.worldRuntimeStateFacadeService.rebuildPersistentRuntimeAfterRestore(this);
    }
        createInstance(input) {
        return this.worldRuntimeInstanceReadFacadeService.createInstance(input, this);
    }
        getOrCreatePublicInstance(templateId) {
        return this.worldRuntimeWorldAccessService.getOrCreatePublicInstance(templateId, this);
    }
        resolveDefaultRespawnMapId() {
        return this.worldRuntimeWorldAccessService.resolveDefaultRespawnMapId(this);
    }
        findMapRoute(fromMapId, toMapId) {
        return this.worldRuntimeWorldAccessService.findMapRoute(fromMapId, toMapId, this);
    }
        getPlayerLocationOrThrow(playerId) {
        return this.worldRuntimeWorldAccessService.getPlayerLocationOrThrow(playerId, this);
    }
        getInstanceRuntimeOrThrow(instanceId) {
        return this.worldRuntimeWorldAccessService.getInstanceRuntimeOrThrow(instanceId, this);
    }
        cancelPendingInstanceCommand(playerId) {
        return this.worldRuntimeWorldAccessService.cancelPendingInstanceCommand(playerId, this);
    }
        interruptManualNavigation(playerId) {
        this.worldRuntimeWorldAccessService.interruptManualNavigation(playerId, this);
    }
        interruptManualCombat(playerId) {
        this.worldRuntimeWorldAccessService.interruptManualCombat(playerId, this);
    }
        getPlayerViewOrThrow(playerId) {
        return this.worldRuntimeWorldAccessService.getPlayerViewOrThrow(playerId, this);
    }
        applyTransfer(transfer) {
        this.worldRuntimeTickDispatchService.applyTransfer(transfer, this);
    }
        materializeNavigationCommands() {
        this.worldRuntimeTickDispatchService.materializeNavigationCommands(this);
    }
        resolveNavigationStep(playerId, intent) {
        return this.worldRuntimeTickDispatchService.resolveNavigationStep(playerId, intent, this);
    }
        resolveNavigationDestination(playerId, intent) {
        return this.worldRuntimeTickDispatchService.resolveNavigationDestination(playerId, intent, this);
    }
        materializeAutoCombatCommands() {
        this.worldRuntimeTickDispatchService.materializeAutoCombatCommands(this);
    }
        buildAutoCombatCommand(instance, player) {
        return this.worldRuntimeTickDispatchService.buildAutoCombatCommand(instance, player, this);
    }
        selectAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeTickDispatchService.selectAutoCombatTarget(instance, player, visibleMonsters, this);
    }
        resolveTrackedAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeTickDispatchService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, this);
    }
        pickAutoBattleSkill(player, distance) {
        return this.worldRuntimeTickDispatchService.pickAutoBattleSkill(player, distance, this);
    }
        resolveAutoBattleDesiredRange(player) {
        return this.worldRuntimeTickDispatchService.resolveAutoBattleDesiredRange(player, this);
    }
        dispatchPendingCommands() {
        this.worldRuntimeTickDispatchService.dispatchPendingCommands(this);
    }
        dispatchPendingSystemCommands() {
        this.worldRuntimeTickDispatchService.dispatchPendingSystemCommands(this);
    }
        dispatchInstanceCommand(playerId, command) {
        this.worldRuntimeTickDispatchService.dispatchInstanceCommand(playerId, command, this);
    }
        dispatchPlayerCommand(playerId, command) {
        this.worldRuntimeTickDispatchService.dispatchPlayerCommand(playerId, command, this);
    }
        dispatchRedeemCodes(playerId, codes) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchRedeemCodes(playerId, codes, this);
    }
        dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, this);
    }
        resolveLegacySkillTargetRef(attacker, skill, targetRef) {
        return this.worldRuntimeGameplayWriteFacadeService.resolveLegacySkillTargetRef(attacker, skill, targetRef, this);
    }
        dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, this);
    }
        dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, this);
    }
        dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, this);
    }
        dispatchSystemCommand(command) {
        this.worldRuntimeTickDispatchService.dispatchSystemCommand(command, this);
    }
        dispatchUseItem(playerId, slotIndex) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchUseItem(playerId, slotIndex, this);
    }
        dispatchBreakthrough(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBreakthrough(playerId, this);
    }
        dispatchHeavenGateAction(playerId, action, element) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchHeavenGateAction(playerId, action, element, this);
    }
        dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint = null) {
        this.worldRuntimeTickDispatchService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, this);
    }
        dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, this);
    }
        dispatchDropItem(playerId, slotIndex, count) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDropItem(playerId, slotIndex, count, this);
    }
        dispatchTakeGround(playerId, sourceId, itemKey) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGround(playerId, sourceId, itemKey, this);
    }
        dispatchTakeGroundAll(playerId, sourceId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGroundAll(playerId, sourceId, this);
    }
        dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, this);
    }
        dispatchNpcInteraction(playerId, npcId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchNpcInteraction(playerId, npcId, this);
    }
        dispatchEquipItem(playerId, slotIndex) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchEquipItem(playerId, slotIndex, this);
    }
        dispatchUnequipItem(playerId, slot) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchUnequipItem(playerId, slot, this);
    }
        dispatchCultivateTechnique(playerId, techniqueId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCultivateTechnique(playerId, techniqueId, this);
    }
        dispatchStartTechniqueActivity(playerId, kind, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchStartTechniqueActivity(playerId, kind, payload, this);
    }
        dispatchCancelTechniqueActivity(playerId, kind) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCancelTechniqueActivity(playerId, kind, this);
    }
        dispatchStartAlchemy(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchStartAlchemy(playerId, payload, this);
    }
        dispatchCancelAlchemy(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCancelAlchemy(playerId, this);
    }
        dispatchSaveAlchemyPreset(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSaveAlchemyPreset(playerId, payload, this);
    }
        dispatchDeleteAlchemyPreset(playerId, presetId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDeleteAlchemyPreset(playerId, presetId, this);
    }
        dispatchStartEnhancement(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchStartEnhancement(playerId, payload, this);
    }
        dispatchCancelEnhancement(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCancelEnhancement(playerId, this);
    }
        dispatchInteractNpcQuest(playerId, npcId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchInteractNpcQuest(playerId, npcId, this);
    }
        dispatchAcceptNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchAcceptNpcQuest(playerId, npcId, questId, this);
    }
        dispatchSubmitNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSubmitNpcQuest(playerId, npcId, questId, this);
    }
        dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, this);
    }
        dispatchDefeatMonster(instanceId, runtimeId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDefeatMonster(instanceId, runtimeId, this);
    }
        dispatchDamagePlayer(playerId, amount) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDamagePlayer(playerId, amount, this);
    }
        dispatchDamageMonster(instanceId, runtimeId, amount) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDamageMonster(instanceId, runtimeId, amount, this);
    }
        spawnGroundItem(instance, x, y, item) {
        this.worldRuntimeTickDispatchService.spawnGroundItem(instance, x, y, item, this);
    }
        handlePlayerMonsterKill(instance, monster, killerPlayerId) {
        this.worldRuntimeGameplayWriteFacadeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, this);
    }
        resolveAdjacentNpc(playerId, npcId) {
        return this.worldRuntimeQuestRuntimeFacadeService.resolveAdjacentNpc(playerId, npcId, this);
    }
        createNpcQuestsEnvelope(playerId, npcId) {
        return this.worldRuntimeReadFacadeService.createNpcQuestsEnvelope(playerId, npcId, this);
    }
        refreshQuestStates(playerId, forceDirty = false) {
        this.worldRuntimeQuestRuntimeFacadeService.refreshQuestStates(playerId, forceDirty, this);
    }
        resolveQuestProgress(playerId, quest) {
        return this.worldRuntimeReadFacadeService.resolveQuestProgress(playerId, quest, this);
    }
        canQuestBecomeReady(playerId, quest) {
        return this.worldRuntimeReadFacadeService.canQuestBecomeReady(playerId, quest, this);
    }
        createQuestStateFromSource(playerId, questId, status = 'active') {
        return this.worldRuntimeReadFacadeService.createQuestStateFromSource(playerId, questId, status, this);
    }
        tryAcceptNextQuest(playerId, nextQuestId) {
        return this.worldRuntimeQuestRuntimeFacadeService.tryAcceptNextQuest(playerId, nextQuestId, this);
    }
        advanceKillQuestProgress(playerId, monsterId, monsterName) {
        this.worldRuntimeQuestRuntimeFacadeService.advanceKillQuestProgress(playerId, monsterId, monsterName, this);
    }
        advanceLearnTechniqueQuest(playerId, techniqueId) {
        this.worldRuntimeQuestRuntimeFacadeService.advanceLearnTechniqueQuest(playerId, techniqueId, this);
    }
        buildQuestRewardItems(quest) {
        return this.worldRuntimeReadFacadeService.buildQuestRewardItems(quest, this);
    }
        buildQuestRewardItemsFromRecord(quest) {
        return this.worldRuntimeReadFacadeService.buildQuestRewardItemsFromRecord(quest, this);
    }
        canReceiveRewardItems(playerId, rewards) {
        return this.worldRuntimeQuestRuntimeFacadeService.canReceiveRewardItems(playerId, rewards, this);
    }
        resolveQuestNavigationTarget(quest) {
        return this.worldRuntimeReadFacadeService.resolveQuestNavigationTarget(quest, this);
    }
        getNpcForPlayerMap(playerId, npcId) {
        return this.worldRuntimeQuestRuntimeFacadeService.getNpcForPlayerMap(playerId, npcId, this);
    }
        validateNpcShopPurchase(playerId, npcId, itemId, quantity) {
        return this.worldRuntimeReadFacadeService.validateNpcShopPurchase(playerId, npcId, itemId, quantity, this);
    }
        buildContextActions(view) {
        return this.worldRuntimeReadFacadeService.buildContextActions(view, this);
    }
        applyMonsterAction(action) {
        this.worldRuntimeTickDispatchService.applyMonsterAction(action, this);
    }
        applyMonsterBasicAttack(action) {
        this.worldRuntimeTickDispatchService.applyMonsterBasicAttack(action, this);
    }
        applyMonsterSkill(action) {
        this.worldRuntimeTickDispatchService.applyMonsterSkill(action, this);
    }
        handlePlayerDefeat(playerId, killerPlayerId = null) {
        this.worldRuntimeGameplayWriteFacadeService.handlePlayerDefeat(playerId, this, killerPlayerId);
    }
        processPendingRespawns() {
        this.worldRuntimeGameplayWriteFacadeService.processPendingRespawns(this);
    }
        respawnPlayer(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.respawnPlayer(playerId, this);
    }
        ensureAttackAllowed(player, skill) {
        this.worldRuntimeTickDispatchService.ensureAttackAllowed(player, skill, this);
    }
        queuePlayerNotice(playerId, text, kind) {
        this.worldRuntimeTickDispatchService.queuePlayerNotice(playerId, text, kind, this);
    }
        pushCombatEffect(instanceId, effect) {
        this.worldRuntimeTickDispatchService.pushCombatEffect(instanceId, effect, this);
    }
        pushActionLabelEffect(instanceId, x, y, text) {
        this.worldRuntimeTickDispatchService.pushActionLabelEffect(instanceId, x, y, text, this);
    }
        pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.worldRuntimeTickDispatchService.pushDamageFloatEffect(instanceId, x, y, damage, color, this);
    }
        pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.worldRuntimeTickDispatchService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color, this);
    }
};
exports.WorldRuntimeService = WorldRuntimeService;
exports.WorldRuntimeService = WorldRuntimeService = WorldRuntimeService_1 = __decorate([
    (0, common_1.Injectable)(),
        __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_client_event_service_1.WorldClientEventService))),
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
        world_runtime_quest_state_service_1.WorldRuntimeQuestStateService,
        world_runtime_detail_query_service_1.WorldRuntimeDetailQueryService,
        world_runtime_context_action_query_service_1.WorldRuntimeContextActionQueryService,
        world_runtime_player_view_query_service_1.WorldRuntimePlayerViewQueryService,
        world_runtime_metrics_service_1.WorldRuntimeMetricsService,
        world_runtime_frame_service_1.WorldRuntimeFrameService,
        world_runtime_lifecycle_service_1.WorldRuntimeLifecycleService,
        world_runtime_persistence_state_service_1.WorldRuntimePersistenceStateService,
        world_runtime_player_session_service_1.WorldRuntimePlayerSessionService,
        world_runtime_command_intake_facade_service_1.WorldRuntimeCommandIntakeFacadeService,
        world_runtime_gameplay_write_facade_service_1.WorldRuntimeGameplayWriteFacadeService,
        world_runtime_instance_read_facade_service_1.WorldRuntimeInstanceReadFacadeService,
        world_runtime_quest_runtime_facade_service_1.WorldRuntimeQuestRuntimeFacadeService,
        world_runtime_read_facade_service_1.WorldRuntimeReadFacadeService,
        world_runtime_state_facade_service_1.WorldRuntimeStateFacadeService,
        world_runtime_tick_dispatch_service_1.WorldRuntimeTickDispatchService,
        world_runtime_world_access_service_1.WorldRuntimeWorldAccessService,
        world_runtime_instance_tick_orchestration_service_1.WorldRuntimeInstanceTickOrchestrationService,
        world_runtime_movement_service_1.WorldRuntimeMovementService,
        world_runtime_summary_query_service_1.WorldRuntimeSummaryQueryService,
        world_runtime_instance_state_service_1.WorldRuntimeInstanceStateService,
        world_runtime_instance_query_service_1.WorldRuntimeInstanceQueryService,
        world_runtime_pending_command_service_1.WorldRuntimePendingCommandService,
        world_runtime_player_location_service_1.WorldRuntimePlayerLocationService,
        world_runtime_tick_progress_service_1.WorldRuntimeTickProgressService,
        world_runtime_npc_quest_interaction_query_service_1.WorldRuntimeNpcQuestInteractionQueryService,
        world_runtime_npc_shop_service_1.WorldRuntimeNpcShopService,
        world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
        world_runtime_system_command_service_1.WorldRuntimeSystemCommandService,
        world_runtime_craft_tick_service_1.WorldRuntimeCraftTickService,
        world_runtime_craft_mutation_service_1.WorldRuntimeCraftMutationService,
        world_runtime_craft_interrupt_service_1.WorldRuntimeCraftInterruptService,
        world_runtime_alchemy_service_1.WorldRuntimeAlchemyService,
        world_runtime_npc_quest_write_service_1.WorldRuntimeNpcQuestWriteService,
        world_runtime_loot_container_service_1.WorldRuntimeLootContainerService,
        world_runtime_navigation_service_1.WorldRuntimeNavigationService,
        world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService,
        world_runtime_monster_action_apply_service_1.WorldRuntimeMonsterActionApplyService,
        world_runtime_basic_attack_service_1.WorldRuntimeBasicAttackService,
        world_runtime_monster_system_command_service_1.WorldRuntimeMonsterSystemCommandService,
        world_runtime_player_combat_outcome_service_1.WorldRuntimePlayerCombatOutcomeService,
        world_runtime_player_command_service_1.WorldRuntimePlayerCommandService,
        world_runtime_player_command_enqueue_service_1.WorldRuntimePlayerCommandEnqueueService,
        world_runtime_item_ground_service_1.WorldRuntimeItemGroundService,
        world_runtime_transfer_service_1.WorldRuntimeTransferService,
        world_runtime_npc_access_service_1.WorldRuntimeNpcAccessService,
        world_runtime_equipment_service_1.WorldRuntimeEquipmentService,
        world_runtime_cultivation_service_1.WorldRuntimeCultivationService,
        world_runtime_progression_service_1.WorldRuntimeProgressionService,
        world_runtime_enhancement_service_1.WorldRuntimeEnhancementService,
        world_runtime_use_item_service_1.WorldRuntimeUseItemService,
        world_runtime_redeem_code_service_1.WorldRuntimeRedeemCodeService,
        world_runtime_player_skill_dispatch_service_1.WorldRuntimePlayerSkillDispatchService,
        world_runtime_battle_engage_service_1.WorldRuntimeBattleEngageService,
        world_runtime_auto_combat_service_1.WorldRuntimeAutoCombatService,
        world_runtime_combat_command_service_1.WorldRuntimeCombatCommandService,
        world_runtime_action_execution_service_1.WorldRuntimeActionExecutionService,
        world_runtime_system_command_enqueue_service_1.WorldRuntimeSystemCommandEnqueueService])
], WorldRuntimeService);
// helper functions were split into dedicated helper modules for maintainability.

export { WorldRuntimeService };
