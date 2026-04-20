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

/** DEFAULT_PLAYER_RESPAWN_MAP_ID：DEFAULTPLAYERRESPAWNMAPID。 */
const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** TICK_METRIC_WINDOW_SIZE：TICKMETRICWINDOWSIZE。 */
const TICK_METRIC_WINDOW_SIZE = 60;

let WorldRuntimeService = WorldRuntimeService_1 = class WorldRuntimeService {
/**
 * contentTemplateRepository：对象字段。
 */

    contentTemplateRepository;    
    /**
 * templateRepository：对象字段。
 */

    templateRepository;    
    /**
 * mapPersistenceService：对象字段。
 */

    mapPersistenceService;    
    /**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * playerCombatService：对象字段。
 */

    playerCombatService;    
    /**
 * worldSessionService：对象字段。
 */

    worldSessionService;    
    /**
 * worldClientEventService：对象字段。
 */

    worldClientEventService;    
    /**
 * redeemCodeRuntimeService：对象字段。
 */

    redeemCodeRuntimeService;    
    /**
 * craftPanelRuntimeService：对象字段。
 */

    craftPanelRuntimeService;    
    /**
 * worldRuntimeNpcShopQueryService：对象字段。
 */

    worldRuntimeNpcShopQueryService;    
    /**
 * worldRuntimeQuestQueryService：对象字段。
 */

    worldRuntimeQuestQueryService;    
    /**
 * worldRuntimeQuestStateService：对象字段。
 */

    worldRuntimeQuestStateService;    
    /**
 * worldRuntimeDetailQueryService：对象字段。
 */

    worldRuntimeDetailQueryService;    
    /**
 * worldRuntimeContextActionQueryService：对象字段。
 */

    worldRuntimeContextActionQueryService;    
    /**
 * worldRuntimePlayerViewQueryService：对象字段。
 */

    worldRuntimePlayerViewQueryService;    
    /**
 * worldRuntimeMetricsService：对象字段。
 */

    worldRuntimeMetricsService;    
    /**
 * worldRuntimeFrameService：对象字段。
 */

    worldRuntimeFrameService;    
    /**
 * worldRuntimeLifecycleService：对象字段。
 */

    worldRuntimeLifecycleService;    
    /**
 * worldRuntimePersistenceStateService：对象字段。
 */

    worldRuntimePersistenceStateService;    
    /**
 * worldRuntimePlayerSessionService：对象字段。
 */

    worldRuntimePlayerSessionService;    
    /**
 * worldRuntimeCommandIntakeFacadeService：对象字段。
 */

    worldRuntimeCommandIntakeFacadeService;    
    /**
 * worldRuntimeGameplayWriteFacadeService：对象字段。
 */

    worldRuntimeGameplayWriteFacadeService;    
    /**
 * worldRuntimeInstanceReadFacadeService：对象字段。
 */

    worldRuntimeInstanceReadFacadeService;    
    /**
 * worldRuntimeQuestRuntimeFacadeService：对象字段。
 */

    worldRuntimeQuestRuntimeFacadeService;    
    /**
 * worldRuntimeReadFacadeService：对象字段。
 */

    worldRuntimeReadFacadeService;    
    /**
 * worldRuntimeStateFacadeService：对象字段。
 */

    worldRuntimeStateFacadeService;    
    /**
 * worldRuntimeTickDispatchService：对象字段。
 */

    worldRuntimeTickDispatchService;    
    /**
 * worldRuntimeWorldAccessService：对象字段。
 */

    worldRuntimeWorldAccessService;    
    /**
 * worldRuntimeInstanceTickOrchestrationService：对象字段。
 */

    worldRuntimeInstanceTickOrchestrationService;    
    /**
 * worldRuntimeMovementService：对象字段。
 */

    worldRuntimeMovementService;    
    /**
 * worldRuntimeSummaryQueryService：对象字段。
 */

    worldRuntimeSummaryQueryService;    
    /**
 * worldRuntimeInstanceStateService：对象字段。
 */

    worldRuntimeInstanceStateService;    
    /**
 * worldRuntimeInstanceQueryService：对象字段。
 */

    worldRuntimeInstanceQueryService;    
    /**
 * worldRuntimePendingCommandService：对象字段。
 */

    worldRuntimePendingCommandService;    
    /**
 * worldRuntimePlayerLocationService：对象字段。
 */

    worldRuntimePlayerLocationService;    
    /**
 * worldRuntimeTickProgressService：对象字段。
 */

    worldRuntimeTickProgressService;    
    /**
 * worldRuntimeNpcQuestInteractionQueryService：对象字段。
 */

    worldRuntimeNpcQuestInteractionQueryService;    
    /**
 * worldRuntimeNpcShopService：对象字段。
 */

    worldRuntimeNpcShopService;    
    /**
 * worldRuntimeGmQueueService：对象字段。
 */

    worldRuntimeGmQueueService;    
    /**
 * worldRuntimeSystemCommandService：对象字段。
 */

    worldRuntimeSystemCommandService;    
    /**
 * worldRuntimeCraftTickService：对象字段。
 */

    worldRuntimeCraftTickService;    
    /**
 * worldRuntimeCraftMutationService：对象字段。
 */

    worldRuntimeCraftMutationService;    
    /**
 * worldRuntimeCraftInterruptService：对象字段。
 */

    worldRuntimeCraftInterruptService;    
    /**
 * worldRuntimeAlchemyService：对象字段。
 */

    worldRuntimeAlchemyService;    
    /**
 * worldRuntimeNpcQuestWriteService：对象字段。
 */

    worldRuntimeNpcQuestWriteService;    
    /**
 * worldRuntimeLootContainerService：对象字段。
 */

    worldRuntimeLootContainerService;    
    /**
 * worldRuntimeNavigationService：对象字段。
 */

    worldRuntimeNavigationService;    
    /**
 * worldRuntimeCombatEffectsService：对象字段。
 */

    worldRuntimeCombatEffectsService;    
    /**
 * worldRuntimeMonsterActionApplyService：对象字段。
 */

    worldRuntimeMonsterActionApplyService;    
    /**
 * worldRuntimeBasicAttackService：对象字段。
 */

    worldRuntimeBasicAttackService;    
    /**
 * worldRuntimeMonsterSystemCommandService：对象字段。
 */

    worldRuntimeMonsterSystemCommandService;    
    /**
 * worldRuntimePlayerCombatOutcomeService：对象字段。
 */

    worldRuntimePlayerCombatOutcomeService;    
    /**
 * worldRuntimePlayerCommandService：对象字段。
 */

    worldRuntimePlayerCommandService;    
    /**
 * worldRuntimePlayerCommandEnqueueService：对象字段。
 */

    worldRuntimePlayerCommandEnqueueService;    
    /**
 * worldRuntimeItemGroundService：对象字段。
 */

    worldRuntimeItemGroundService;    
    /**
 * worldRuntimeTransferService：对象字段。
 */

    worldRuntimeTransferService;    
    /**
 * worldRuntimeNpcAccessService：对象字段。
 */

    worldRuntimeNpcAccessService;    
    /**
 * worldRuntimeEquipmentService：对象字段。
 */

    worldRuntimeEquipmentService;    
    /**
 * worldRuntimeCultivationService：对象字段。
 */

    worldRuntimeCultivationService;    
    /**
 * worldRuntimeProgressionService：对象字段。
 */

    worldRuntimeProgressionService;    
    /**
 * worldRuntimeUseItemService：对象字段。
 */

    worldRuntimeUseItemService;    
    /**
 * worldRuntimeRedeemCodeService：对象字段。
 */

    worldRuntimeRedeemCodeService;    
    /**
 * worldRuntimePlayerSkillDispatchService：对象字段。
 */

    worldRuntimePlayerSkillDispatchService;    
    /**
 * worldRuntimeBattleEngageService：对象字段。
 */

    worldRuntimeBattleEngageService;    
    /**
 * worldRuntimeAutoCombatService：对象字段。
 */

    worldRuntimeAutoCombatService;    
    /**
 * worldRuntimeCombatCommandService：对象字段。
 */

    worldRuntimeCombatCommandService;    
    /**
 * worldRuntimeActionExecutionService：对象字段。
 */

    worldRuntimeActionExecutionService;    
    /**
 * worldRuntimeSystemCommandEnqueueService：对象字段。
 */

    worldRuntimeSystemCommandEnqueueService;    
    /**
 * logger：对象字段。
 */

    logger = new common_1.Logger(WorldRuntimeService_1.name);    
    /**
 * tick：对象字段。
 */

    tick = 0;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param templateRepository 参数说明。
 * @param mapPersistenceService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param playerCombatService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldClientEventService 参数说明。
 * @param redeemCodeRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeNpcShopQueryService 参数说明。
 * @param worldRuntimeQuestQueryService 参数说明。
 * @param worldRuntimeQuestStateService 参数说明。
 * @param worldRuntimeDetailQueryService 参数说明。
 * @param worldRuntimeContextActionQueryService 参数说明。
 * @param worldRuntimePlayerViewQueryService 参数说明。
 * @param worldRuntimeMetricsService 参数说明。
 * @param worldRuntimeFrameService 参数说明。
 * @param worldRuntimeLifecycleService 参数说明。
 * @param worldRuntimePersistenceStateService 参数说明。
 * @param worldRuntimePlayerSessionService 参数说明。
 * @param worldRuntimeCommandIntakeFacadeService 参数说明。
 * @param worldRuntimeGameplayWriteFacadeService 参数说明。
 * @param worldRuntimeInstanceReadFacadeService 参数说明。
 * @param worldRuntimeQuestRuntimeFacadeService 参数说明。
 * @param worldRuntimeReadFacadeService 参数说明。
 * @param worldRuntimeStateFacadeService 参数说明。
 * @param worldRuntimeTickDispatchService 参数说明。
 * @param worldRuntimeWorldAccessService 参数说明。
 * @param worldRuntimeInstanceTickOrchestrationService 参数说明。
 * @param worldRuntimeMovementService 参数说明。
 * @param worldRuntimeSummaryQueryService 参数说明。
 * @param worldRuntimeInstanceStateService 参数说明。
 * @param worldRuntimeInstanceQueryService 参数说明。
 * @param worldRuntimePendingCommandService 参数说明。
 * @param worldRuntimePlayerLocationService 参数说明。
 * @param worldRuntimeTickProgressService 参数说明。
 * @param worldRuntimeNpcQuestInteractionQueryService 参数说明。
 * @param worldRuntimeNpcShopService 参数说明。
 * @param worldRuntimeGmQueueService 参数说明。
 * @param worldRuntimeSystemCommandService 参数说明。
 * @param worldRuntimeCraftTickService 参数说明。
 * @param worldRuntimeCraftMutationService 参数说明。
 * @param worldRuntimeCraftInterruptService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @param worldRuntimeNpcQuestWriteService 参数说明。
 * @param worldRuntimeLootContainerService 参数说明。
 * @param worldRuntimeNavigationService 参数说明。
 * @param worldRuntimeCombatEffectsService 参数说明。
 * @param worldRuntimeMonsterActionApplyService 参数说明。
 * @param worldRuntimeBasicAttackService 参数说明。
 * @param worldRuntimeMonsterSystemCommandService 参数说明。
 * @param worldRuntimePlayerCombatOutcomeService 参数说明。
 * @param worldRuntimePlayerCommandService 参数说明。
 * @param worldRuntimePlayerCommandEnqueueService 参数说明。
 * @param worldRuntimeItemGroundService 参数说明。
 * @param worldRuntimeTransferService 参数说明。
 * @param worldRuntimeNpcAccessService 参数说明。
 * @param worldRuntimeEquipmentService 参数说明。
 * @param worldRuntimeCultivationService 参数说明。
 * @param worldRuntimeProgressionService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @param worldRuntimeUseItemService 参数说明。
 * @param worldRuntimeRedeemCodeService 参数说明。
 * @param worldRuntimePlayerSkillDispatchService 参数说明。
 * @param worldRuntimeBattleEngageService 参数说明。
 * @param worldRuntimeAutoCombatService 参数说明。
 * @param worldRuntimeCombatCommandService 参数说明。
 * @param worldRuntimeActionExecutionService 参数说明。
 * @param worldRuntimeSystemCommandEnqueueService 参数说明。
 * @returns 无返回值（构造函数）。
 */

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
    /**
 * lastTickDurationMs：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get lastTickDurationMs() {
        return this.worldRuntimeMetricsService.lastTickDurationMs;
    }    
    /**
 * lastSyncFlushDurationMs：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get lastSyncFlushDurationMs() {
        return this.worldRuntimeMetricsService.lastSyncFlushDurationMs;
    }    
    /**
 * lastTickPhaseDurations：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get lastTickPhaseDurations() {
        return this.worldRuntimeMetricsService.lastTickPhaseDurations;
    }    
    /**
 * tickDurationHistoryMs：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get tickDurationHistoryMs() {
        return this.worldRuntimeMetricsService.tickDurationHistoryMs;
    }    
    /**
 * syncFlushDurationHistoryMs：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get syncFlushDurationHistoryMs() {
        return this.worldRuntimeMetricsService.syncFlushDurationHistoryMs;
    }    
    /**
 * instanceTickProgressById：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    get instanceTickProgressById() {
        return this.worldRuntimeTickProgressService.instanceTickProgressById;
    }    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

    enqueuePendingCommand(playerId, command) {
        this.worldRuntimeStateFacadeService.enqueuePendingCommand(playerId, command, this);
    }    
    /**
 * getPendingCommand：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    getPendingCommand(playerId) {
        return this.worldRuntimeStateFacadeService.getPendingCommand(playerId, this);
    }    
    /**
 * hasPendingCommand：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    hasPendingCommand(playerId) {
        return this.worldRuntimeStateFacadeService.hasPendingCommand(playerId, this);
    }    
    /**
 * clearPendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    clearPendingCommand(playerId) {
        this.worldRuntimeStateFacadeService.clearPendingCommand(playerId, this);
    }    
    /**
 * getPendingCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getPendingCommandCount() {
        return this.worldRuntimeStateFacadeService.getPendingCommandCount(this);
    }    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    getPlayerLocation(playerId) {
        return this.worldRuntimeStateFacadeService.getPlayerLocation(playerId, this);
    }    
    /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

    setPlayerLocation(playerId, location) {
        this.worldRuntimeStateFacadeService.setPlayerLocation(playerId, location, this);
    }    
    /**
 * clearPlayerLocation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    clearPlayerLocation(playerId) {
        this.worldRuntimeStateFacadeService.clearPlayerLocation(playerId, this);
    }    
    /**
 * getPlayerLocationCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getPlayerLocationCount() {
        return this.worldRuntimeStateFacadeService.getPlayerLocationCount(this);
    }    
    /**
 * listConnectedPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listConnectedPlayerIds() {
        return this.worldRuntimeStateFacadeService.listConnectedPlayerIds(this);
    }    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

    getInstanceRuntime(instanceId) {
        return this.worldRuntimeStateFacadeService.getInstanceRuntime(instanceId, this);
    }    
    /**
 * setInstanceRuntime：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param instance 地图实例。
 * @returns 函数返回值。
 */

    setInstanceRuntime(instanceId, instance) {
        this.worldRuntimeStateFacadeService.setInstanceRuntime(instanceId, instance, this);
    }    
    /**
 * listInstanceRuntimes：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listInstanceRuntimes() {
        return this.worldRuntimeStateFacadeService.listInstanceRuntimes(this);
    }    
    /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listInstanceEntries() {
        return this.worldRuntimeStateFacadeService.listInstanceEntries(this);
    }    
    /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getInstanceCount() {
        return this.worldRuntimeStateFacadeService.getInstanceCount(this);
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
        return this.worldRuntimeInstanceReadFacadeService.listMapTemplates(this);
    }
    /** listInstances：列出实例。 */
    listInstances() {
        return this.worldRuntimeInstanceReadFacadeService.listInstances(this);
    }
    /** getInstance：读取指定实例。 */
    getInstance(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.getInstance(instanceId, this);
    }
    /** listInstanceMonsters：列出实例妖兽。 */
    listInstanceMonsters(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.listInstanceMonsters(instanceId, this);
    }
    /** getInstanceMonster：读取实例中的单只妖兽。 */
    getInstanceMonster(instanceId, runtimeId) {
        return this.worldRuntimeInstanceReadFacadeService.getInstanceMonster(instanceId, runtimeId, this);
    }
    /** getInstanceTileState：读取实例地块状态。 */
    getInstanceTileState(instanceId, x, y) {
        return this.worldRuntimeInstanceReadFacadeService.getInstanceTileState(instanceId, x, y, this);
    }
    /** getCombatEffects：读取当前实例战斗效果。 */
    getCombatEffects(instanceId) {
        return this.worldRuntimeInstanceReadFacadeService.getCombatEffects(instanceId, this);
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    connectPlayer(input) {
        return this.worldRuntimePlayerSessionService.connectPlayer(input, this);
    }
    /** disconnectPlayer：断开玩家与实例的挂接，并清理相关排队状态。 */
    disconnectPlayer(playerId) {
        return this.worldRuntimePlayerSessionService.disconnectPlayer(playerId, this);
    }
    /** removePlayer：注销玩家运行态，先清会话再断开实例。 */
    removePlayer(playerId, reason = 'removed') {
        return this.worldRuntimePlayerSessionService.removePlayer(playerId, reason, this);
    }
    /** enqueueMove：把方向移动请求排入下一次 tick 统一执行。 */
    enqueueMove(playerId, directionInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueMove(playerId, directionInput, this);
    }
    /** enqueueMoveTo：把点位导航请求排入下一次 tick 统一执行。 */
    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, this);
    }
    /** usePortal：把当前站位的传送请求排入下一次 tick。 */
    usePortal(playerId) {
        return this.worldRuntimeCommandIntakeFacadeService.usePortal(playerId, this);
    }
    /** navigateQuest：记录任务导航意图，供后续 tick 续跑路径。 */
    navigateQuest(playerId, questIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.navigateQuest(playerId, questIdInput, this);
    }
    /** enqueueBasicAttack：把排队Basic攻击请求排入下一次 tick。 */
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, this);
    }
    /** enqueueBattleTarget：把排队战斗目标请求排入下一次 tick。 */
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, this);
    }
    /** executeAction：根据动作 ID 分流到交互、战斗、修炼或传送流程。 */
    executeAction(playerId, actionIdInput, targetInput) {
        return this.worldRuntimeCommandIntakeFacadeService.executeAction(playerId, actionIdInput, targetInput, this);
    }
    /** executeLegacyNpcAction：兼容旧版 NPC 交互入口，自动转成任务或对话命令。 */
    executeLegacyNpcAction(playerId, npcId) {
        return this.worldRuntimeCommandIntakeFacadeService.executeLegacyNpcAction(playerId, npcId, this);
    }
    /** enqueueUseItem：把排队使用物品请求排入下一次 tick。 */
    enqueueUseItem(playerId, slotIndexInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueUseItem(playerId, slotIndexInput, this);
    }
    /** enqueueDropItem：把排队丢弃物品请求排入下一次 tick。 */
    enqueueDropItem(playerId, slotIndexInput, countInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueDropItem(playerId, slotIndexInput, countInput, this);
    }
    /** enqueueTakeGround：把排队拿取地面请求排入下一次 tick。 */
    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, this);
    }
    /** enqueueTakeGroundAll：把排队拿取地面All请求排入下一次 tick。 */
    enqueueTakeGroundAll(playerId, sourceIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueTakeGroundAll(playerId, sourceIdInput, this);
    }
    /** enqueueEquip：把排队装备请求排入下一次 tick。 */
    enqueueEquip(playerId, slotIndexInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueEquip(playerId, slotIndexInput, this);
    }
    /** enqueueUnequip：把排队卸下请求排入下一次 tick。 */
    enqueueUnequip(playerId, slotInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueUnequip(playerId, slotInput, this);
    }
    /** enqueueCultivate：把排队Cultivate请求排入下一次 tick。 */
    enqueueCultivate(playerId, techniqueIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueCultivate(playerId, techniqueIdInput, this);
    }
    /** enqueueStartAlchemy：把排队StartAlchemy请求排入下一次 tick。 */
    enqueueStartAlchemy(playerId, payload) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueStartAlchemy(playerId, payload, this);
    }
    /** enqueueCancelAlchemy：把排队取消Alchemy请求排入下一次 tick。 */
    enqueueCancelAlchemy(playerId) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueCancelAlchemy(playerId, this);
    }
    /** enqueueSaveAlchemyPreset：把排队保存炼制预设请求排入下一次 tick。 */
    enqueueSaveAlchemyPreset(playerId, payload) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueSaveAlchemyPreset(playerId, payload, this);
    }
    /** enqueueDeleteAlchemyPreset：把排队删除炼制预设请求排入下一次 tick。 */
    enqueueDeleteAlchemyPreset(playerId, presetId) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueDeleteAlchemyPreset(playerId, presetId, this);
    }
    /** enqueueStartEnhancement：把排队StartEnhancement请求排入下一次 tick。 */
    enqueueStartEnhancement(playerId, payload) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueStartEnhancement(playerId, payload, this);
    }
    /** enqueueCancelEnhancement：把排队取消Enhancement请求排入下一次 tick。 */
    enqueueCancelEnhancement(playerId) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueCancelEnhancement(playerId, this);
    }
    /** enqueueRedeemCodes：把排队RedeemCodes请求排入下一次 tick。 */
    enqueueRedeemCodes(playerId, codesInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueRedeemCodes(playerId, codesInput, this);
    }
    /** enqueueHeavenGateAction：把排队天门关卡动作请求排入下一次 tick。 */
    enqueueHeavenGateAction(playerId, actionInput, elementInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueHeavenGateAction(playerId, actionInput, elementInput, this);
    }
    /** enqueueCastSkill：把排队CastSkill请求排入下一次 tick。 */
    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput = null) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, this);
    }
    /** enqueueCastSkillTargetRef：把排队CastSkill目标Ref请求排入下一次 tick。 */
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, this);
    }
    /** buildNpcShopView：构建当前 NPC 的商店视图。 */
    buildNpcShopView(playerId, npcIdInput) {
        return this.worldRuntimeReadFacadeService.buildNpcShopView(playerId, npcIdInput, this);
    }
    /** buildQuestListView：构建玩家任务列表视图。 */
    buildQuestListView(playerId, _input) {
        return this.worldRuntimeReadFacadeService.buildQuestListView(playerId, _input, this);
    }
    /** buildNpcQuestsView：构建当前 NPC 相关的任务视图。 */
    buildNpcQuestsView(playerId, npcIdInput) {
        return this.worldRuntimeReadFacadeService.buildNpcQuestsView(playerId, npcIdInput, this);
    }
    /** buildDetail：构建目标详情，要求目标必须在当前视野内。 */
    buildDetail(playerId, input) {
        return this.worldRuntimeReadFacadeService.buildDetail(playerId, input, this);
    }
    /** buildTileDetail：构建指定地块的详情，汇总实体、灵气和战斗状态。 */
    buildTileDetail(playerId, input) {
        return this.worldRuntimeReadFacadeService.buildTileDetail(playerId, input, this);
    }
    /** buildLootWindowSyncState：构建拿取窗口同步状态，供前端按需增量刷新。 */
    buildLootWindowSyncState(playerId, tileX, tileY) {
        return this.worldRuntimeReadFacadeService.buildLootWindowSyncState(playerId, tileX, tileY, this);
    }
    /** refreshPlayerContextActions：根据当前视野和角色状态刷新上下文动作。 */
    refreshPlayerContextActions(playerId, view) {
        return this.worldRuntimeReadFacadeService.refreshPlayerContextActions(playerId, view, this);
    }
    /** enqueueBuyNpcShopItem：把 NPC 商店购买请求排入下一次 tick。 */
    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, this);
    }
    /** enqueueNpcInteraction：把 NPC 交互请求排入下一次 tick。 */
    enqueueNpcInteraction(playerId, actionIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueNpcInteraction(playerId, actionIdInput, this);
    }
    /** enqueueLegacyNpcInteraction：兼容旧版 NPC 交互入口。 */
    enqueueLegacyNpcInteraction(playerId, actionIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueLegacyNpcInteraction(playerId, actionIdInput, this);
    }
    /** enqueueAcceptNpcQuest：把 NPC 任务接取请求排入下一次 tick。 */
    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, this);
    }
    /** enqueueSubmitNpcQuest：把 NPC 任务提交请求排入下一次 tick。 */
    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, this);
    }
    /** enqueueSpawnMonsterLoot：把妖兽掉落生成请求排入系统命令队列。 */
    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, this);
    }
    /** enqueueDefeatMonster：把妖兽击败请求排入系统命令队列。 */
    enqueueDefeatMonster(instanceIdInput, runtimeIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueDefeatMonster(instanceIdInput, runtimeIdInput, this);
    }
    /** enqueueDamageMonster：把妖兽受伤请求排入系统命令队列。 */
    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, this);
    }
    /** enqueueDamagePlayer：把玩家受伤请求排入系统命令队列。 */
    enqueueDamagePlayer(playerIdInput, amountInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueDamagePlayer(playerIdInput, amountInput, this);
    }
    /** enqueueRespawnPlayer：把玩家复生请求排入系统命令队列。 */
    enqueueRespawnPlayer(playerIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueRespawnPlayer(playerIdInput, this);
    }
    /** enqueueResetPlayerSpawn：把玩家重置出生点请求排入系统命令队列。 */
    enqueueResetPlayerSpawn(playerIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueResetPlayerSpawn(playerIdInput, this);
    }
    /** enqueueGmUpdatePlayer：把 GM 更新玩家请求排入系统命令队列。 */
    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueGmUpdatePlayer(input, this);
    }
    /** enqueueGmResetPlayer：把 GM 重置玩家请求排入系统命令队列。 */
    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueGmResetPlayer(playerIdInput, this);
    }
    /** enqueueGmSpawnBots：把 GM 生成机器人请求排入系统命令队列。 */
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput, this);
    }
    /** enqueueGmRemoveBots：把 GM 移除机器人请求排入系统命令队列。 */
    enqueueGmRemoveBots(playerIdsInput, allInput) {
        return this.worldRuntimeCommandIntakeFacadeService.enqueueGmRemoveBots(playerIdsInput, allInput, this);
    }
    /** getPlayerView：读取玩家当前视野快照，并补上 NPC 任务标记。 */
    getPlayerView(playerId, radius) {
        return this.worldRuntimeReadFacadeService.getPlayerView(playerId, radius, this);
    }
    /** resolveCurrentTickForPlayerId：读取玩家所在实例的当前 tick。 */
    resolveCurrentTickForPlayerId(playerId) {
        return this.worldRuntimeWorldAccessService.resolveCurrentTickForPlayerId(playerId, this);
    }
    /** getLegacyNavigationPath：生成旧版导航预览路径，便于调试与兼容。 */
    getLegacyNavigationPath(playerId) {
        return this.worldRuntimeTickDispatchService.getLegacyNavigationPath(playerId, this);
    }
    /** getRuntimeSummary：汇总世界 tick、实例和同步耗时信息。 */
    getRuntimeSummary() {
        return this.worldRuntimeWorldAccessService.getRuntimeSummary(this);
    }
    /** listDirtyPersistentInstances：列出需要持久化刷新的实例。 */
    listDirtyPersistentInstances() {
        return this.worldRuntimeStateFacadeService.listDirtyPersistentInstances(this);
    }
    /** buildMapPersistenceSnapshot：构建地图持久化快照。 */
    buildMapPersistenceSnapshot(instanceId) {
        return this.worldRuntimeStateFacadeService.buildMapPersistenceSnapshot(instanceId, this);
    }
    /** markMapPersisted：标记地图快照已落盘。 */
    markMapPersisted(instanceId) {
        this.worldRuntimeStateFacadeService.markMapPersisted(instanceId, this);
    }
    /** tickAll：推进全部实例的默认一秒帧。 */
    tickAll() {
        return this.worldRuntimeStateFacadeService.tickAll(this);
    }
    /** advanceFrame：推进世界帧，统筹实例 tick、命令派发和耗时统计。 */
    advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {
        return this.worldRuntimeStateFacadeService.advanceFrame(frameDurationMs, getInstanceTickSpeed, this);
    }
    /** recordSyncFlushDuration：记录一次同步刷新耗时。 */
    recordSyncFlushDuration(durationMs) {
        this.worldRuntimeStateFacadeService.recordSyncFlushDuration(durationMs, this);
    }
    /** bootstrapPublicInstances：初始化所有公共地图实例。 */
    bootstrapPublicInstances() {
        this.worldRuntimeStateFacadeService.bootstrapPublicInstances(this);
    }
    /** restorePublicInstancePersistence：从持久化快照恢复公共实例状态。 */
    async restorePublicInstancePersistence() {
        await this.worldRuntimeStateFacadeService.restorePublicInstancePersistence(this);
    }
    /** rebuildPersistentRuntimeAfterRestore：在恢复持久化后重建世界运行态。 */
    async rebuildPersistentRuntimeAfterRestore() {
        await this.worldRuntimeStateFacadeService.rebuildPersistentRuntimeAfterRestore(this);
    }
    /** createInstance：创建地图实例并挂接到世界运行时。 */
    createInstance(input) {
        return this.worldRuntimeInstanceReadFacadeService.createInstance(input, this);
    }
    /** getOrCreatePublicInstance：读取或创建公共地图实例。 */
    getOrCreatePublicInstance(templateId) {
        return this.worldRuntimeWorldAccessService.getOrCreatePublicInstance(templateId, this);
    }
    /** resolveDefaultRespawnMapId：解析默认复生地图。 */
    resolveDefaultRespawnMapId() {
        return this.worldRuntimeWorldAccessService.resolveDefaultRespawnMapId(this);
    }
    /** findMapRoute：查找跨地图传送路线。 */
    findMapRoute(fromMapId, toMapId) {
        return this.worldRuntimeWorldAccessService.findMapRoute(fromMapId, toMapId, this);
    }
    /** getPlayerLocationOrThrow：读取玩家当前接入位置，不存在就抛错。 */
    getPlayerLocationOrThrow(playerId) {
        return this.worldRuntimeWorldAccessService.getPlayerLocationOrThrow(playerId, this);
    }
    /** getInstanceRuntimeOrThrow：读取实例运行时，不存在就抛错。 */
    getInstanceRuntimeOrThrow(instanceId) {
        return this.worldRuntimeWorldAccessService.getInstanceRuntimeOrThrow(instanceId, this);
    }
    /** cancelPendingInstanceCommand：取消当前实例中玩家待执行命令。 */
    cancelPendingInstanceCommand(playerId) {
        return this.worldRuntimeWorldAccessService.cancelPendingInstanceCommand(playerId, this);
    }
    /** interruptManualNavigation：中断手动导航并清掉自动战斗状态。 */
    interruptManualNavigation(playerId) {
        this.worldRuntimeWorldAccessService.interruptManualNavigation(playerId, this);
    }
    /** interruptManualCombat：中断手动战斗并清掉导航意图。 */
    interruptManualCombat(playerId) {
        this.worldRuntimeWorldAccessService.interruptManualCombat(playerId, this);
    }
    /** getPlayerViewOrThrow：读取玩家视野，不存在就抛错。 */
    getPlayerViewOrThrow(playerId) {
        return this.worldRuntimeWorldAccessService.getPlayerViewOrThrow(playerId, this);
    }
    /** applyTransfer：把跨图传送结果应用到目标实例。 */
    applyTransfer(transfer) {
        this.worldRuntimeTickDispatchService.applyTransfer(transfer, this);
    }
    /** materializeNavigationCommands：把导航意图落成可执行的移动或传送命令。 */
    materializeNavigationCommands() {
        this.worldRuntimeTickDispatchService.materializeNavigationCommands(this);
    }
    /** resolveNavigationStep：为当前导航目标计算下一步动作。 */
    resolveNavigationStep(playerId, intent) {
        return this.worldRuntimeTickDispatchService.resolveNavigationStep(playerId, intent, this);
    }
    /** resolveNavigationDestination：把点位导航或任务导航归一成可寻路目标。 */
    resolveNavigationDestination(playerId, intent) {
        return this.worldRuntimeTickDispatchService.resolveNavigationDestination(playerId, intent, this);
    }
    /** materializeAutoCombatCommands：把自动战斗意图落成当前 tick 的战斗命令。 */
    materializeAutoCombatCommands() {
        this.worldRuntimeTickDispatchService.materializeAutoCombatCommands(this);
    }
    /** buildAutoCombatCommand：为自动战斗构建移动、普攻或施法命令。 */
    buildAutoCombatCommand(instance, player) {
        return this.worldRuntimeTickDispatchService.buildAutoCombatCommand(instance, player, this);
    }
    /** selectAutoCombatTarget：从当前视野里选择自动战斗目标。 */
    selectAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeTickDispatchService.selectAutoCombatTarget(instance, player, visibleMonsters, this);
    }
    /** resolveTrackedAutoCombatTarget：解析已锁定的自动战斗目标。 */
    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters) {
        return this.worldRuntimeTickDispatchService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, this);
    }
    /** pickAutoBattleSkill：选择当前距离可用的自动战斗技能。 */
    pickAutoBattleSkill(player, distance) {
        return this.worldRuntimeTickDispatchService.pickAutoBattleSkill(player, distance, this);
    }
    /** resolveAutoBattleDesiredRange：计算自动战斗期望停留射程。 */
    resolveAutoBattleDesiredRange(player) {
        return this.worldRuntimeTickDispatchService.resolveAutoBattleDesiredRange(player, this);
    }
    /** dispatchPendingCommands：派发玩家待执行命令。 */
    dispatchPendingCommands() {
        this.worldRuntimeTickDispatchService.dispatchPendingCommands(this);
    }
    /** dispatchPendingSystemCommands：派发系统命令队列。 */
    dispatchPendingSystemCommands() {
        this.worldRuntimeTickDispatchService.dispatchPendingSystemCommands(this);
    }
    /** dispatchInstanceCommand：执行需要落到实例侧的移动或传送命令。 */
    dispatchInstanceCommand(playerId, command) {
        this.worldRuntimeTickDispatchService.dispatchInstanceCommand(playerId, command, this);
    }
    /** dispatchPlayerCommand：执行不依赖实例移动的玩家命令。 */
    dispatchPlayerCommand(playerId, command) {
        this.worldRuntimeTickDispatchService.dispatchPlayerCommand(playerId, command, this);
    }
    /** dispatchRedeemCodes：执行兑换码结算并把结果回推给客户端。 */
    dispatchRedeemCodes(playerId, codes) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchRedeemCodes(playerId, codes, this);
    }
    /** dispatchCastSkill：校验目标并把技能释放交给战斗服务。 */
    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, this);
    }
    /** resolveLegacySkillTargetRef：解析旧版技能目标引用。 */
    resolveLegacySkillTargetRef(attacker, skill, targetRef) {
        return this.worldRuntimeGameplayWriteFacadeService.resolveLegacySkillTargetRef(attacker, skill, targetRef, this);
    }
    /** dispatchEngageBattle：执行战斗锁定或普通攻击的入口。 */
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, this);
    }
    /** dispatchCastSkillToMonster：把技能结算到妖兽目标上。 */
    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, this);
    }
    /** dispatchCastSkillToTile：把技能结算到地块目标上。 */
    dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, this);
    }
    /** dispatchSystemCommand：执行世界层系统命令。 */
    dispatchSystemCommand(command) {
        this.worldRuntimeTickDispatchService.dispatchSystemCommand(command, this);
    }
    /** dispatchUseItem：执行物品使用结算。 */
    dispatchUseItem(playerId, slotIndex) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchUseItem(playerId, slotIndex, this);
    }
    /** dispatchBreakthrough：触发修为突破结算。 */
    dispatchBreakthrough(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBreakthrough(playerId, this);
    }
    /** dispatchHeavenGateAction：执行天门关卡动作。 */
    dispatchHeavenGateAction(playerId, action, element) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchHeavenGateAction(playerId, action, element, this);
    }
    /** dispatchMoveTo：执行点位导航的首步推进。 */
    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint = null) {
        this.worldRuntimeTickDispatchService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, this);
    }
    /** dispatchBasicAttack：执行普通攻击结算，目标可以是玩家、妖兽或地块。 */
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, this);
    }
    /** dispatchDropItem：执行丢弃物品结算。 */
    dispatchDropItem(playerId, slotIndex, count) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDropItem(playerId, slotIndex, count, this);
    }
    /** dispatchTakeGround：执行地面或容器拾取结算。 */
    dispatchTakeGround(playerId, sourceId, itemKey) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGround(playerId, sourceId, itemKey, this);
    }
    /** dispatchTakeGroundAll：执行一键拾取结算。 */
    dispatchTakeGroundAll(playerId, sourceId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGroundAll(playerId, sourceId, this);
    }
    /** dispatchBuyNpcShopItem：执行 NPC 商店购买结算。 */
    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, this);
    }
    /** dispatchNpcInteraction：执行 NPC 交互结算。 */
    dispatchNpcInteraction(playerId, npcId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchNpcInteraction(playerId, npcId, this);
    }
    /** dispatchEquipItem：执行装备穿戴结算。 */
    dispatchEquipItem(playerId, slotIndex) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchEquipItem(playerId, slotIndex, this);
    }
    /** dispatchUnequipItem：执行装备卸下结算。 */
    dispatchUnequipItem(playerId, slot) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchUnequipItem(playerId, slot, this);
    }
    /** dispatchCultivateTechnique：执行功法修炼切换。 */
    dispatchCultivateTechnique(playerId, techniqueId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCultivateTechnique(playerId, techniqueId, this);
    }
    /** dispatchStartAlchemy：启动炼丹流程。 */
    dispatchStartAlchemy(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchStartAlchemy(playerId, payload, this);
    }
    /** dispatchCancelAlchemy：取消炼丹流程。 */
    dispatchCancelAlchemy(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCancelAlchemy(playerId, this);
    }
    /** dispatchSaveAlchemyPreset：保存炼制预设。 */
    dispatchSaveAlchemyPreset(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSaveAlchemyPreset(playerId, payload, this);
    }
    /** dispatchDeleteAlchemyPreset：删除炼制预设。 */
    dispatchDeleteAlchemyPreset(playerId, presetId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDeleteAlchemyPreset(playerId, presetId, this);
    }
    /** dispatchStartEnhancement：启动强化流程。 */
    dispatchStartEnhancement(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchStartEnhancement(playerId, payload, this);
    }
    /** dispatchCancelEnhancement：取消强化流程。 */
    dispatchCancelEnhancement(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCancelEnhancement(playerId, this);
    }
    /** dispatchInteractNpcQuest：推进 NPC 对话型任务的交互进度。 */
    dispatchInteractNpcQuest(playerId, npcId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchInteractNpcQuest(playerId, npcId, this);
    }
    /** dispatchAcceptNpcQuest：接取 NPC 任务并写入玩家任务列表。 */
    dispatchAcceptNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchAcceptNpcQuest(playerId, npcId, questId, this);
    }
    /** dispatchSubmitNpcQuest：提交 NPC 任务并发放奖励。 */
    dispatchSubmitNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSubmitNpcQuest(playerId, npcId, questId, this);
    }
    /** dispatchSpawnMonsterLoot：按掉落表生成妖兽战利品。 */
    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, this);
    }
    /** dispatchDefeatMonster：直接结算妖兽被击败后的掉落。 */
    dispatchDefeatMonster(instanceId, runtimeId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDefeatMonster(instanceId, runtimeId, this);
    }
    /** dispatchDamagePlayer：对玩家直接施加伤害。 */
    dispatchDamagePlayer(playerId, amount) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDamagePlayer(playerId, amount, this);
    }
    /** dispatchDamageMonster：对妖兽直接施加伤害。 */
    dispatchDamageMonster(instanceId, runtimeId, amount) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDamageMonster(instanceId, runtimeId, amount, this);
    }
    /** spawnGroundItem：在地面上生成物品堆。 */
    spawnGroundItem(instance, x, y, item) {
        this.worldRuntimeTickDispatchService.spawnGroundItem(instance, x, y, item, this);
    }
    /** handlePlayerMonsterKill：处理玩家击杀妖兽后的奖励和进度。 */
    handlePlayerMonsterKill(instance, monster, killerPlayerId) {
        this.worldRuntimeGameplayWriteFacadeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, this);
    }
    /** resolveAdjacentNpc：校验并读取相邻 NPC。 */
    resolveAdjacentNpc(playerId, npcId) {
        return this.worldRuntimeQuestRuntimeFacadeService.resolveAdjacentNpc(playerId, npcId, this);
    }
    /** createNpcQuestsEnvelope：构建 NPC 任务封装结果。 */
    createNpcQuestsEnvelope(playerId, npcId) {
        return this.worldRuntimeReadFacadeService.createNpcQuestsEnvelope(playerId, npcId, this);
    }
    /** refreshQuestStates：根据当前运行态刷新任务进度和状态。 */
    refreshQuestStates(playerId, forceDirty = false) {
        this.worldRuntimeQuestRuntimeFacadeService.refreshQuestStates(playerId, forceDirty, this);
    }
    /** resolveQuestProgress：计算任务当前进度。 */
    resolveQuestProgress(playerId, quest) {
        return this.worldRuntimeReadFacadeService.resolveQuestProgress(playerId, quest, this);
    }
    /** canQuestBecomeReady：判断任务是否已经满足交付条件。 */
    canQuestBecomeReady(playerId, quest) {
        return this.worldRuntimeReadFacadeService.canQuestBecomeReady(playerId, quest, this);
    }
    /** createQuestStateFromSource：把模板任务展开成玩家运行时任务。 */
    createQuestStateFromSource(playerId, questId, status = 'active') {
        return this.worldRuntimeReadFacadeService.createQuestStateFromSource(playerId, questId, status, this);
    }
    /** tryAcceptNextQuest：尝试自动接取下一环任务。 */
    tryAcceptNextQuest(playerId, nextQuestId) {
        return this.worldRuntimeQuestRuntimeFacadeService.tryAcceptNextQuest(playerId, nextQuestId, this);
    }
    /** advanceKillQuestProgress：推进击杀类任务进度。 */
    advanceKillQuestProgress(playerId, monsterId, monsterName) {
        this.worldRuntimeQuestRuntimeFacadeService.advanceKillQuestProgress(playerId, monsterId, monsterName, this);
    }
    /** advanceLearnTechniqueQuest：推进学习功法类任务进度。 */
    advanceLearnTechniqueQuest(playerId, techniqueId) {
        this.worldRuntimeQuestRuntimeFacadeService.advanceLearnTechniqueQuest(playerId, techniqueId, this);
    }
    /** buildQuestRewardItems：构建任务奖励物品列表。 */
    buildQuestRewardItems(quest) {
        return this.worldRuntimeReadFacadeService.buildQuestRewardItems(quest, this);
    }
    /** buildQuestRewardItemsFromRecord：从任务原始记录构建奖励物品列表。 */
    buildQuestRewardItemsFromRecord(quest) {
        return this.worldRuntimeReadFacadeService.buildQuestRewardItemsFromRecord(quest, this);
    }
    /** canReceiveRewardItems：判断玩家是否还能接收任务奖励。 */
    canReceiveRewardItems(playerId, rewards) {
        return this.worldRuntimeQuestRuntimeFacadeService.canReceiveRewardItems(playerId, rewards, this);
    }
    /** resolveQuestNavigationTarget：解析任务对应的导航目标。 */
    resolveQuestNavigationTarget(quest) {
        return this.worldRuntimeReadFacadeService.resolveQuestNavigationTarget(quest, this);
    }
    /** getNpcForPlayerMap：读取玩家当前地图中的 NPC。 */
    getNpcForPlayerMap(playerId, npcId) {
        return this.worldRuntimeQuestRuntimeFacadeService.getNpcForPlayerMap(playerId, npcId, this);
    }
    /** validateNpcShopPurchase：校验 NPC 商店购买条件。 */
    validateNpcShopPurchase(playerId, npcId, itemId, quantity) {
        return this.worldRuntimeReadFacadeService.validateNpcShopPurchase(playerId, npcId, itemId, quantity, this);
    }
    /** buildContextActions：根据当前视野构建上下文动作列表。 */
    buildContextActions(view) {
        return this.worldRuntimeReadFacadeService.buildContextActions(view, this);
    }
    /** applyMonsterAction：应用实例 tick 产出的妖兽动作。 */
    applyMonsterAction(action) {
        this.worldRuntimeTickDispatchService.applyMonsterAction(action, this);
    }
    /** applyMonsterBasicAttack：把妖兽普通攻击结算到玩家身上。 */
    applyMonsterBasicAttack(action) {
        this.worldRuntimeTickDispatchService.applyMonsterBasicAttack(action, this);
    }
    /** applyMonsterSkill：把妖兽技能结算到玩家身上。 */
    applyMonsterSkill(action) {
        this.worldRuntimeTickDispatchService.applyMonsterSkill(action, this);
    }
    /** handlePlayerDefeat：标记玩家进入复生队列。 */
    handlePlayerDefeat(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.handlePlayerDefeat(playerId, this);
    }
    /** processPendingRespawns：处理等待复生的玩家。 */
    processPendingRespawns() {
        this.worldRuntimeGameplayWriteFacadeService.processPendingRespawns(this);
    }
    /** respawnPlayer：把玩家复生请求交给世界运行时处理。 */
    respawnPlayer(playerId) {
        this.worldRuntimeGameplayWriteFacadeService.respawnPlayer(playerId, this);
    }
    /** ensureAttackAllowed：校验当前角色是否允许发起攻击。 */
    ensureAttackAllowed(player, skill) {
        this.worldRuntimeTickDispatchService.ensureAttackAllowed(player, skill, this);
    }
    /** queuePlayerNotice：把通知排入玩家运行态消息队列。 */
    queuePlayerNotice(playerId, text, kind) {
        this.worldRuntimeTickDispatchService.queuePlayerNotice(playerId, text, kind, this);
    }
    /** pushCombatEffect：收集战斗特效，等待同步层统一发送。 */
    pushCombatEffect(instanceId, effect) {
        this.worldRuntimeTickDispatchService.pushCombatEffect(instanceId, effect, this);
    }
    /** pushActionLabelEffect：追加动作标签浮字特效。 */
    pushActionLabelEffect(instanceId, x, y, text) {
        this.worldRuntimeTickDispatchService.pushActionLabelEffect(instanceId, x, y, text, this);
    }
    /** pushDamageFloatEffect：追加伤害数字浮字特效。 */
    pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.worldRuntimeTickDispatchService.pushDamageFloatEffect(instanceId, x, y, damage, color, this);
    }
    /** pushAttackEffect：追加攻击轨迹特效。 */
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.worldRuntimeTickDispatchService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color, this);
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
