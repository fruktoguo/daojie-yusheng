import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import '../../debug/movement-debug';
import '../../http/native/native-gm.constants';
import '../../content/content-template.repository';
import { WorldSessionService } from '../../network/world-session.service';
import { WorldClientEventService } from '../../network/world-client-event.service';
import { InstanceDomainPersistenceService } from '../../persistence/instance-domain-persistence.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { RedeemCodeRuntimeService } from '../redeem/redeem-code-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeNpcShopQueryService } from './query/world-runtime-npc-shop-query.service';
import { WorldRuntimeQuestQueryService } from './query/world-runtime-quest-query.service';
import { WorldRuntimeQuestStateService } from './world-runtime-quest-state.service';
import { WorldRuntimeDetailQueryService } from './query/world-runtime-detail-query.service';
import { WorldRuntimeContextActionQueryService } from './query/world-runtime-context-action-query.service';
import { WorldRuntimePlayerViewQueryService } from './query/world-runtime-player-view-query.service';
import { WorldRuntimeMetricsService } from './world-runtime-metrics.service';
import { WorldRuntimeFrameService } from './world-runtime-frame.service';
import { WorldRuntimeLifecycleService } from './world-runtime-lifecycle.service';
import { WorldRuntimePersistenceStateService } from './world-runtime-persistence-state.service';
import { WorldRuntimePlayerSessionService } from './world-runtime-player-session.service';
import { WorldRuntimeCommandIntakeFacadeService } from './command/world-runtime-command-intake-facade.service';
import { WorldRuntimeGameplayWriteFacadeService } from './world-runtime-gameplay-write-facade.service';
import { WorldRuntimeInstanceReadFacadeService } from './query/world-runtime-instance-read-facade.service';
import { WorldRuntimeQuestRuntimeFacadeService } from './world-runtime-quest-runtime-facade.service';
import { WorldRuntimeReadFacadeService } from './query/world-runtime-read-facade.service';
import { WorldRuntimeStateFacadeService } from './world-runtime-state-facade.service';
import { WorldRuntimeTickDispatchService } from './world-runtime-tick-dispatch.service';
import { WorldRuntimeWorldAccessService } from './world-runtime-world-access.service';
import { WorldRuntimeInstanceTickOrchestrationService } from './world-runtime-instance-tick-orchestration.service';
import { WorldRuntimeMovementService } from './world-runtime-movement.service';
import { WorldRuntimeSummaryQueryService } from './query/world-runtime-summary-query.service';
import { WorldRuntimeInstanceStateService } from './world-runtime-instance-state.service';
import { WorldRuntimeInstanceQueryService } from './query/world-runtime-instance-query.service';
import { WorldRuntimePendingCommandService } from './command/world-runtime-pending-command.service';
import { WorldRuntimePlayerLocationService } from './world-runtime-player-location.service';
import { WorldRuntimeTickProgressService } from './world-runtime-tick-progress.service';
import { NodeRegistryService } from '../../persistence/node-registry.service';
import { WorldRuntimeNpcQuestInteractionQueryService } from './query/world-runtime-npc-quest-interaction-query.service';
import { WorldRuntimeNpcShopService } from './world-runtime-npc-shop.service';
import { WorldRuntimeGmQueueService } from './command/world-runtime-gm-queue.service';
import { WorldRuntimeSystemCommandService } from './command/world-runtime-system-command.service';
import { WorldRuntimeCraftTickService } from './world-runtime-craft-tick.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';
import { WorldRuntimeCraftInterruptService } from './world-runtime-craft-interrupt.service';
import { WorldRuntimeAlchemyService } from './world-runtime-alchemy.service';
import { WorldRuntimeNpcQuestWriteService } from './world-runtime-npc-quest-write.service';
import { WorldRuntimeLootContainerService } from './world-runtime-loot-container.service';
import { WorldRuntimeNavigationService } from './world-runtime-navigation.service';
import { WorldRuntimeCombatEffectsService } from './combat/world-runtime-combat-effects.service';
import { WorldRuntimeMonsterActionApplyService } from './combat/world-runtime-monster-action-apply.service';
import { WorldRuntimeBasicAttackService } from './combat/world-runtime-basic-attack.service';
import { WorldRuntimeMonsterSystemCommandService } from './command/world-runtime-monster-system-command.service';
import { WorldRuntimePlayerCombatOutcomeService } from './combat/world-runtime-player-combat-outcome.service';
import { WorldRuntimePlayerCommandService } from './command/world-runtime-player-command.service';
import { WorldRuntimePlayerCommandEnqueueService } from './command/world-runtime-player-command-enqueue.service';
import { WorldRuntimeItemGroundService } from './world-runtime-item-ground.service';
import { WorldRuntimeTransferService } from './world-runtime-transfer.service';
import { WorldRuntimeNpcAccessService } from './world-runtime-npc-access.service';
import { WorldRuntimeEquipmentService } from './world-runtime-equipment.service';
import { WorldRuntimeCultivationService } from './world-runtime-cultivation.service';
import { WorldRuntimeProgressionService } from './world-runtime-progression.service';
import { WorldRuntimeEnhancementService } from './world-runtime-enhancement.service';
import { WorldRuntimeUseItemService } from './world-runtime-use-item.service';
import { WorldRuntimeRedeemCodeService } from './world-runtime-redeem-code.service';
import { WorldRuntimePlayerSkillDispatchService } from './combat/world-runtime-player-skill-dispatch.service';
import { WorldRuntimeBattleEngageService } from './combat/world-runtime-battle-engage.service';
import { WorldRuntimeAutoCombatService } from './combat/world-runtime-auto-combat.service';
import { WorldRuntimeThreatService } from './combat/world-runtime-threat.service';
import { WorldRuntimeCombatCommandService } from './combat/world-runtime-combat-command.service';
import { WorldRuntimeActionExecutionService } from './command/world-runtime-action-execution.service';
import { WorldRuntimeFormationService } from './world-runtime-formation.service';
import { WorldRuntimeSectService } from './world-runtime-sect.service';
import { WorldRuntimeSystemCommandEnqueueService } from './command/world-runtime-system-command-enqueue.service';
import { WorldRuntimeTongtianTowerService } from './world-runtime-tongtian-tower.service';
import { MailRuntimeService } from '../mail/mail-runtime.service';
import { PlayerCombatService } from '../combat/player-combat.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { StartupBarrierService } from '../../lifecycle/startup-barrier.service';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import '../instance/map-instance.runtime';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import * as world_runtime_observation_helpers_1 from './query/world-runtime.observation.helpers';
import * as world_runtime_path_planning_helpers_1 from './world-runtime.path-planning.helpers';
import { buildCurrentRoomSummaryPatch, buildFengShuiObserveView, dispatchStartBuildingConstruction, handleBuildDeconstructIntent, handleBuildPlaceIntent, handleRoomSetRoleIntent, handleStartBuildingConstruction, interruptBuildingConstruction, listBuildingOperationAudit, tickBuildingConstruction } from './world-runtime-building.service';
import { claimRecoverableCatalogInstances, fenceInstanceRuntime, getInstanceLeaseStatus, hydratePersistentInstanceSnapshot, isInstanceLeaseWritable, migrateInstanceToNode, rebuildPersistentInstance, releaseLocalInstanceLeasesForShutdown, syncAllInstanceLeases, syncInstanceLease, syncManagedInstanceRegistration, unfreezeInstanceWriting } from './world-runtime-instance-lease.helpers';


const {
    buildPublicInstanceId,
    parseRuntimeInstanceDescriptor,
    normalizeRuntimeInstancePersistentPolicy,
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
const INSTANCE_LEASE_RENEW_SKEW_MS = 5_000;
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

@Injectable()
export class WorldRuntimeService {

    contentTemplateRepository;

    templateRepository;

    instanceDomainPersistenceService;
    instanceCatalogService;

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
    worldRuntimeEnhancementService;

    worldRuntimeUseItemService;

    worldRuntimeRedeemCodeService;

    worldRuntimePlayerSkillDispatchService;

    worldRuntimeBattleEngageService;

    worldRuntimeAutoCombatService;
    worldRuntimeThreatService;

    worldRuntimeCombatCommandService;

    worldRuntimeActionExecutionService;

    worldRuntimeFormationService;
    worldRuntimeSectService;

    worldRuntimeSystemCommandEnqueueService;

    worldRuntimeTongtianTowerService;

    nodeRegistryService;

    playerPersistenceFlushService;

    mailRuntimeService;

    durableOperationService;

    runtimeEventBusService;

    databasePoolProvider;
    startupBarrierService;

    instanceLeaseSyncTimer = null;

    logger = new Logger(WorldRuntimeService.name);

    tick = 0;
    buildingOperationResultsByKey = new Map();
    buildingOperationAuditLog = [];
    combatDiagnostics = [];

    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: ContentTemplateRepository,
        @Inject(MapTemplateRepository) templateRepository: MapTemplateRepository,
        @Inject(InstanceDomainPersistenceService) instanceDomainPersistenceService: InstanceDomainPersistenceService,
        @Inject(InstanceCatalogService) instanceCatalogService: InstanceCatalogService,
        @Inject(PlayerRuntimeService) playerRuntimeService: PlayerRuntimeService,
        @Inject(PlayerCombatService) playerCombatService: PlayerCombatService,
        @Inject(WorldSessionService) worldSessionService: WorldSessionService,
        @Inject(forwardRef(() => WorldClientEventService)) worldClientEventService: WorldClientEventService,
        @Inject(RedeemCodeRuntimeService) redeemCodeRuntimeService: RedeemCodeRuntimeService,
        @Inject(CraftPanelRuntimeService) craftPanelRuntimeService: CraftPanelRuntimeService,
        @Inject(WorldRuntimeNpcShopQueryService) worldRuntimeNpcShopQueryService: WorldRuntimeNpcShopQueryService,
        @Inject(WorldRuntimeQuestQueryService) worldRuntimeQuestQueryService: WorldRuntimeQuestQueryService,
        @Inject(WorldRuntimeQuestStateService) worldRuntimeQuestStateService: WorldRuntimeQuestStateService,
        @Inject(WorldRuntimeDetailQueryService) worldRuntimeDetailQueryService: WorldRuntimeDetailQueryService,
        @Inject(WorldRuntimeContextActionQueryService) worldRuntimeContextActionQueryService: WorldRuntimeContextActionQueryService,
        @Inject(WorldRuntimePlayerViewQueryService) worldRuntimePlayerViewQueryService: WorldRuntimePlayerViewQueryService,
        @Inject(WorldRuntimeMetricsService) worldRuntimeMetricsService: WorldRuntimeMetricsService,
        @Inject(WorldRuntimeFrameService) worldRuntimeFrameService: WorldRuntimeFrameService,
        @Inject(WorldRuntimeLifecycleService) worldRuntimeLifecycleService: WorldRuntimeLifecycleService,
        @Inject(WorldRuntimePersistenceStateService) worldRuntimePersistenceStateService: WorldRuntimePersistenceStateService,
        @Inject(WorldRuntimePlayerSessionService) worldRuntimePlayerSessionService: WorldRuntimePlayerSessionService,
        @Inject(WorldRuntimeCommandIntakeFacadeService) worldRuntimeCommandIntakeFacadeService: WorldRuntimeCommandIntakeFacadeService,
        @Inject(WorldRuntimeGameplayWriteFacadeService) worldRuntimeGameplayWriteFacadeService: WorldRuntimeGameplayWriteFacadeService,
        @Inject(WorldRuntimeInstanceReadFacadeService) worldRuntimeInstanceReadFacadeService: WorldRuntimeInstanceReadFacadeService,
        @Inject(WorldRuntimeQuestRuntimeFacadeService) worldRuntimeQuestRuntimeFacadeService: WorldRuntimeQuestRuntimeFacadeService,
        @Inject(WorldRuntimeReadFacadeService) worldRuntimeReadFacadeService: WorldRuntimeReadFacadeService,
        @Inject(WorldRuntimeStateFacadeService) worldRuntimeStateFacadeService: WorldRuntimeStateFacadeService,
        @Inject(WorldRuntimeTickDispatchService) worldRuntimeTickDispatchService: WorldRuntimeTickDispatchService,
        @Inject(WorldRuntimeWorldAccessService) worldRuntimeWorldAccessService: WorldRuntimeWorldAccessService,
        @Inject(WorldRuntimeInstanceTickOrchestrationService) worldRuntimeInstanceTickOrchestrationService: WorldRuntimeInstanceTickOrchestrationService,
        @Inject(WorldRuntimeMovementService) worldRuntimeMovementService: WorldRuntimeMovementService,
        @Inject(WorldRuntimeSummaryQueryService) worldRuntimeSummaryQueryService: WorldRuntimeSummaryQueryService,
        @Inject(WorldRuntimeInstanceStateService) worldRuntimeInstanceStateService: WorldRuntimeInstanceStateService,
        @Inject(WorldRuntimeInstanceQueryService) worldRuntimeInstanceQueryService: WorldRuntimeInstanceQueryService,
        @Inject(WorldRuntimePendingCommandService) worldRuntimePendingCommandService: WorldRuntimePendingCommandService,
        @Inject(WorldRuntimePlayerLocationService) worldRuntimePlayerLocationService: WorldRuntimePlayerLocationService,
        @Inject(WorldRuntimeTickProgressService) worldRuntimeTickProgressService: WorldRuntimeTickProgressService,
        @Inject(WorldRuntimeNpcQuestInteractionQueryService) worldRuntimeNpcQuestInteractionQueryService: WorldRuntimeNpcQuestInteractionQueryService,
        @Inject(WorldRuntimeNpcShopService) worldRuntimeNpcShopService: WorldRuntimeNpcShopService,
        @Inject(WorldRuntimeGmQueueService) worldRuntimeGmQueueService: WorldRuntimeGmQueueService,
        @Inject(WorldRuntimeSystemCommandService) worldRuntimeSystemCommandService: WorldRuntimeSystemCommandService,
        @Inject(WorldRuntimeCraftTickService) worldRuntimeCraftTickService: WorldRuntimeCraftTickService,
        @Inject(WorldRuntimeCraftMutationService) worldRuntimeCraftMutationService: WorldRuntimeCraftMutationService,
        @Inject(WorldRuntimeCraftInterruptService) worldRuntimeCraftInterruptService: WorldRuntimeCraftInterruptService,
        @Inject(WorldRuntimeAlchemyService) worldRuntimeAlchemyService: WorldRuntimeAlchemyService,
        @Inject(WorldRuntimeNpcQuestWriteService) worldRuntimeNpcQuestWriteService: WorldRuntimeNpcQuestWriteService,
        @Inject(WorldRuntimeLootContainerService) worldRuntimeLootContainerService: WorldRuntimeLootContainerService,
        @Inject(WorldRuntimeNavigationService) worldRuntimeNavigationService: WorldRuntimeNavigationService,
        @Inject(WorldRuntimeCombatEffectsService) worldRuntimeCombatEffectsService: WorldRuntimeCombatEffectsService,
        @Inject(WorldRuntimeMonsterActionApplyService) worldRuntimeMonsterActionApplyService: WorldRuntimeMonsterActionApplyService,
        @Inject(WorldRuntimeBasicAttackService) worldRuntimeBasicAttackService: WorldRuntimeBasicAttackService,
        @Inject(WorldRuntimeMonsterSystemCommandService) worldRuntimeMonsterSystemCommandService: WorldRuntimeMonsterSystemCommandService,
        @Inject(WorldRuntimePlayerCombatOutcomeService) worldRuntimePlayerCombatOutcomeService: WorldRuntimePlayerCombatOutcomeService,
        @Inject(WorldRuntimePlayerCommandService) worldRuntimePlayerCommandService: WorldRuntimePlayerCommandService,
        @Inject(WorldRuntimePlayerCommandEnqueueService) worldRuntimePlayerCommandEnqueueService: WorldRuntimePlayerCommandEnqueueService,
        @Inject(WorldRuntimeItemGroundService) worldRuntimeItemGroundService: WorldRuntimeItemGroundService,
        @Inject(WorldRuntimeTransferService) worldRuntimeTransferService: WorldRuntimeTransferService,
        @Inject(WorldRuntimeNpcAccessService) worldRuntimeNpcAccessService: WorldRuntimeNpcAccessService,
        @Inject(WorldRuntimeEquipmentService) worldRuntimeEquipmentService: WorldRuntimeEquipmentService,
        @Inject(WorldRuntimeCultivationService) worldRuntimeCultivationService: WorldRuntimeCultivationService,
        @Inject(WorldRuntimeProgressionService) worldRuntimeProgressionService: WorldRuntimeProgressionService,
        @Inject(WorldRuntimeEnhancementService) worldRuntimeEnhancementService: WorldRuntimeEnhancementService,
        @Inject(WorldRuntimeUseItemService) worldRuntimeUseItemService: WorldRuntimeUseItemService,
        @Inject(WorldRuntimeRedeemCodeService) worldRuntimeRedeemCodeService: WorldRuntimeRedeemCodeService,
        @Inject(WorldRuntimePlayerSkillDispatchService) worldRuntimePlayerSkillDispatchService: WorldRuntimePlayerSkillDispatchService,
        @Inject(WorldRuntimeBattleEngageService) worldRuntimeBattleEngageService: WorldRuntimeBattleEngageService,
        @Inject(WorldRuntimeAutoCombatService) worldRuntimeAutoCombatService: WorldRuntimeAutoCombatService,
        @Inject(WorldRuntimeThreatService) worldRuntimeThreatService: WorldRuntimeThreatService,
        @Inject(WorldRuntimeCombatCommandService) worldRuntimeCombatCommandService: WorldRuntimeCombatCommandService,
        @Inject(WorldRuntimeActionExecutionService) worldRuntimeActionExecutionService: WorldRuntimeActionExecutionService,
        @Inject(WorldRuntimeSystemCommandEnqueueService) worldRuntimeSystemCommandEnqueueService: WorldRuntimeSystemCommandEnqueueService,
        @Inject(WorldRuntimeTongtianTowerService) worldRuntimeTongtianTowerService: WorldRuntimeTongtianTowerService,
        @Inject(NodeRegistryService) nodeRegistryService: NodeRegistryService,
        @Inject(PlayerPersistenceFlushService) playerPersistenceFlushService: PlayerPersistenceFlushService,
        @Inject(MailRuntimeService) mailRuntimeService: MailRuntimeService,
        @Inject(DurableOperationService) durableOperationService: DurableOperationService,
        @Inject(RuntimeEventBusService) runtimeEventBusService: RuntimeEventBusService = undefined,
        @Inject(DatabasePoolProvider) databasePoolProvider: DatabasePoolProvider = undefined,
        @Optional() @Inject(StartupBarrierService) startupBarrierService?: StartupBarrierService,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.instanceDomainPersistenceService = instanceDomainPersistenceService;
        this.instanceCatalogService = instanceCatalogService;
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
        this.worldRuntimeThreatService = worldRuntimeThreatService;
        this.worldRuntimeCombatCommandService = worldRuntimeCombatCommandService;
        this.worldRuntimeActionExecutionService = worldRuntimeActionExecutionService;
        this.worldRuntimeFormationService = new WorldRuntimeFormationService(contentTemplateRepository, playerRuntimeService, databasePoolProvider);
        this.worldRuntimeSectService = new WorldRuntimeSectService(contentTemplateRepository, templateRepository, playerRuntimeService, mailRuntimeService, databasePoolProvider);
        this.worldRuntimeSystemCommandEnqueueService = worldRuntimeSystemCommandEnqueueService;
        this.worldRuntimeTongtianTowerService = worldRuntimeTongtianTowerService;
        this.nodeRegistryService = nodeRegistryService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.mailRuntimeService = mailRuntimeService;
        this.durableOperationService = durableOperationService;
        this.runtimeEventBusService = runtimeEventBusService;
        this.databasePoolProvider = databasePoolProvider;
        this.startupBarrierService = startupBarrierService ?? null;
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
        syncManagedInstanceRegistration(this, instanceId, instance);
    }

    isInstanceLeaseWritable(instance) {
        return isInstanceLeaseWritable(this, instance);
    }

    /**
     * 暴露建筑幂等结果与审计日志的当前规模，供监控/GM 面板读取，
     * 配合 SERVER_BUILDING_OPERATION_RESULTS_LIMIT 调优观察。
     */
    getBuildingOperationMetrics() {
        return {
            resultsCacheSize: this.buildingOperationResultsByKey.size,
            auditLogSize: this.buildingOperationAuditLog.length,
        };
    }

    fenceInstanceRuntime(instanceId, reason = 'lease_lost') {
        fenceInstanceRuntime(this, instanceId, reason);
    }

    freezeInstanceWriting(instanceId, reason = 'gm_freeze') {
        this.fenceInstanceRuntime(instanceId, reason);
    }

    unfreezeInstanceWriting(instanceId) {
        return unfreezeInstanceWriting(this, instanceId);
    }

    async syncInstanceLease(instanceId, opts?) {
        return syncInstanceLease(this, instanceId, opts);
    }

    async releaseLocalInstanceLeasesForShutdown() {
        return releaseLocalInstanceLeasesForShutdown(this);
    }

    async rebuildPersistentInstance(instanceId) {
        return rebuildPersistentInstance(this, instanceId);
    }

    async migrateInstanceToNode(instanceId, targetNodeId) {
        return migrateInstanceToNode(this, instanceId, targetNodeId);
    }

    async migratePlayerToNode(playerId, targetNodeId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
        if (!normalizedPlayerId) {
            return { ok: false, reason: 'player_required' };
        }
        if (!normalizedTargetNodeId) {
            return { ok: false, reason: 'target_node_required' };
        }
        const player = this.playerRuntimeService?.getPlayer?.(normalizedPlayerId);
        if (!player) {
            return { ok: false, reason: 'player_not_found' };
        }
        if (typeof this.playerPersistenceFlushService?.flushPlayer === 'function') {
            await this.playerPersistenceFlushService.flushPlayer(normalizedPlayerId);
        }
        if (!this.playerRuntimeService?.beginTransfer) {
            player.transferState = 'in_transfer';
            player.transferTargetNodeId = normalizedTargetNodeId;
            player.transferStartedAt = new Date().toISOString();
            return { ok: true };
        }
        this.playerRuntimeService.beginTransfer(player, normalizedTargetNodeId);
        const routeSessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (routeSessionEpoch > 0 && typeof this.worldSessionService?.rememberSessionEpoch === 'function') {
            this.worldSessionService.rememberSessionEpoch(normalizedPlayerId, routeSessionEpoch);
        }
        if (routeSessionEpoch > 0 && typeof this.worldRuntimePlayerSessionService?.assignPlayerRoute === 'function') {
            await this.worldRuntimePlayerSessionService.assignPlayerRoute({
                playerId: normalizedPlayerId,
                nodeId: normalizedTargetNodeId,
                sessionEpoch: routeSessionEpoch,
                routeStatus: 'assigned',
            });
        }
        if (typeof this.playerRuntimeService?.beginTransfer === 'function') {
            return { ok: true };
        }
        return { ok: true };
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
    recordCombatDiagnostic(entry) {
        if (!entry) return;
        this.combatDiagnostics.push(entry);
        if (this.combatDiagnostics.length > 200) this.combatDiagnostics.splice(0, this.combatDiagnostics.length - 200);
    }
    listCombatDiagnostics(limit = 50) {
        const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
        return this.combatDiagnostics.slice(-safeLimit);
    }
        async onModuleInit() {
        this.logger.log('世界运行时已注册，等待启动链路编排器恢复实例');
    }
    async onApplicationBootstrap() {
        this.logger.log('世界运行时恢复已交由启动链路编排器执行');
    }
    startInstanceLeaseSyncForLifecycleCoordinator() {
        if (this.instanceLeaseSyncTimer) {
            clearInterval(this.instanceLeaseSyncTimer);
        }
        this.instanceLeaseSyncTimer = setInterval(() => {
            void this.syncAllInstanceLeases().catch((error) => {
                this.logger.warn(`实例租约周期同步失败：${error instanceof Error ? error.message : String(error)}`);
            });
        }, INSTANCE_LEASE_RENEW_SKEW_MS * 2);
        this.instanceLeaseSyncTimer.unref?.();
    }
    async onModuleDestroy() {
        if (this.instanceLeaseSyncTimer) {
            clearInterval(this.instanceLeaseSyncTimer);
            this.instanceLeaseSyncTimer = null;
        }
        if (typeof this.worldRuntimeFormationService?.closePersistencePool === 'function') {
            await this.worldRuntimeFormationService.closePersistencePool();
        }
        if (typeof this.worldRuntimeSectService?.closePersistencePool === 'function') {
            await this.worldRuntimeSectService.closePersistencePool();
        }
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
        handleBuildPlaceIntent(playerId, payload) {
        return handleBuildPlaceIntent(this, playerId, payload);
    }
        handleBuildDeconstructIntent(playerId, payload) {
        return handleBuildDeconstructIntent(this, playerId, payload);
    }
        handleStartBuildingConstruction(playerId, buildingId) {
        return handleStartBuildingConstruction(this, playerId, buildingId);
    }
        dispatchStartBuildingConstruction(playerId, buildingId) {
        return dispatchStartBuildingConstruction(this, playerId, buildingId);
    }
        interruptBuildingConstruction(playerId, reason) {
        return interruptBuildingConstruction(this, playerId, reason);
    }
        tickBuildingConstruction(playerId) {
        return tickBuildingConstruction(this, playerId);
    }
        listBuildingOperationAudit(limit = 50) {
        return listBuildingOperationAudit(this, limit);
    }
        handleRoomSetRoleIntent(playerId, payload) {
        return handleRoomSetRoleIntent(this, playerId, payload);
    }
        buildCurrentRoomSummaryPatch(playerId) {
        return buildCurrentRoomSummaryPatch(this, playerId);
    }
        buildFengShuiObserveView(playerId, payload) {
        return buildFengShuiObserveView(this, playerId, payload);
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
    async getInstanceLeaseStatus(instanceId) {
        return getInstanceLeaseStatus(this, instanceId);
    }
        listDirtyPersistentInstances() {
        return this.worldRuntimeStateFacadeService.listDirtyPersistentInstances(this);
    }
        listDirtyPersistentInstanceDomains() {
        return this.worldRuntimeStateFacadeService.listDirtyPersistentInstanceDomains(this);
    }
        buildMapPersistenceSnapshot(instanceId) {
        return this.worldRuntimeStateFacadeService.buildMapPersistenceSnapshot(instanceId, this);
    }
        markMapPersisted(instanceId) {
        this.worldRuntimeStateFacadeService.markMapPersisted(instanceId, this);
    }
        markMapDomainsPersisted(instanceId, domains) {
        this.worldRuntimeStateFacadeService.markMapDomainsPersisted(instanceId, domains, this);
    }
        async flushInstanceDomains(instanceId, domains = null) {
        return this.worldRuntimeStateFacadeService.flushInstanceDomains(instanceId, domains, this);
    }
        /** 批量收集指定 domain 的 delta，不写库。 */
        buildDomainDeltaBatch(domain, instanceIds) {
        return this.worldRuntimeStateFacadeService.buildDomainDeltaBatch(domain, instanceIds, this);
    }
        /** 批量标记多个实例的指定 domain 为已持久化。 */
        markDomainBatchPersisted(domain, instanceIds) {
        this.worldRuntimeStateFacadeService.markDomainBatchPersisted(domain, instanceIds, this);
    }
        async tickAll() {
        return this.worldRuntimeStateFacadeService.tickAll(this);
    }
        async advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {
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
        async rebuildPersistentRuntimeAfterRestore(options = {}) {
        await this.worldRuntimeStateFacadeService.rebuildPersistentRuntimeAfterRestore(this, options);
        this.startInstanceLeaseSyncForLifecycleCoordinator();
    }
    async restoreOfflineHangingPlayersForStartup() {
        await this.worldRuntimeLifecycleService.restoreOfflineHangingPlayers(this);
    }
    async syncAllInstanceLeases() {
        return syncAllInstanceLeases(this);
    }
    async claimRecoverableCatalogInstances(opts?) {
        return claimRecoverableCatalogInstances(this, opts);
    }
    async hydratePersistentInstanceSnapshot(instanceId, instance) {
        return hydratePersistentInstanceSnapshot(this, instanceId, instance);
    }
        createInstance(input) {
        return this.worldRuntimeInstanceReadFacadeService.createInstance(input, this);
    }
        getOrCreatePublicInstance(templateId) {
        return this.worldRuntimeWorldAccessService.getOrCreatePublicInstance(templateId, this);
    }
        getOrCreateDefaultLineInstance(templateId, linePreset) {
        return this.worldRuntimeWorldAccessService.getOrCreateDefaultLineInstance(templateId, linePreset, this);
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
        materializeAutoUsePills() {
        this.worldRuntimeTickDispatchService.materializeAutoUsePills(this);
    }
        buildAutoCombatCommand(instance, player, options = undefined) {
        return this.worldRuntimeTickDispatchService.buildAutoCombatCommand(instance, player, this, options);
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
        async dispatchPendingCommands() {
        return this.worldRuntimeTickDispatchService.dispatchPendingCommands(this);
    }
        dispatchPendingSystemCommands() {
        this.worldRuntimeTickDispatchService.dispatchPendingSystemCommands(this);
    }
        dispatchInstanceCommand(playerId, command) {
        this.worldRuntimeTickDispatchService.dispatchInstanceCommand(playerId, command, this);
    }
        async dispatchPlayerCommand(playerId, command) {
        return this.worldRuntimeTickDispatchService.dispatchPlayerCommand(playerId, command, this);
    }
        async dispatchRedeemCodes(playerId, codes) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchRedeemCodes(playerId, codes, this);
    }
        async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, this);
    }
        resolveLegacySkillTargetRef(attacker, skill, targetRef) {
        return this.worldRuntimeGameplayWriteFacadeService.resolveLegacySkillTargetRef(attacker, skill, targetRef, this);
    }
        async dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, this);
    }
        async dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, this);
    }
        async dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, this);
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
        async dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, this);
    }
        dispatchDropItem(playerId, slotIndex, count) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDropItem(playerId, slotIndex, count, this);
    }
        async dispatchTakeGround(playerId, sourceId, itemKey) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGround(playerId, sourceId, itemKey, this);
    }
        async dispatchTakeGroundAll(playerId, sourceId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchTakeGroundAll(playerId, sourceId, this);
    }
        async dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, this);
    }
        async dispatchNpcInteraction(playerId, npcId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchNpcInteraction(playerId, npcId, this);
    }
        async dispatchEquipItem(playerId, slotIndex) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchEquipItem(playerId, slotIndex, this);
    }
        async dispatchUnequipItem(playerId, slot) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchUnequipItem(playerId, slot, this);
    }
        dispatchCultivateTechnique(playerId, techniqueId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchCultivateTechnique(playerId, techniqueId, this);
    }
        async dispatchStartTechniqueActivity(playerId, kind, payload) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchStartTechniqueActivity(playerId, kind, payload, this);
    }
        async dispatchCancelTechniqueActivity(playerId, kind) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCancelTechniqueActivity(playerId, kind, this);
    }
        async dispatchStartAlchemy(playerId, payload) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchStartAlchemy(playerId, payload, this);
    }
        async dispatchCancelAlchemy(playerId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCancelAlchemy(playerId, this);
    }
        dispatchSaveAlchemyPreset(playerId, payload) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchSaveAlchemyPreset(playerId, payload, this);
    }
        dispatchDeleteAlchemyPreset(playerId, presetId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchDeleteAlchemyPreset(playerId, presetId, this);
    }
        async dispatchStartEnhancement(playerId, payload) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchStartEnhancement(playerId, payload, this);
    }
        async dispatchCancelEnhancement(playerId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchCancelEnhancement(playerId, this);
    }
        dispatchInteractNpcQuest(playerId, npcId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchInteractNpcQuest(playerId, npcId, this);
    }
        dispatchAcceptNpcQuest(playerId, npcId, questId) {
        this.worldRuntimeGameplayWriteFacadeService.dispatchAcceptNpcQuest(playerId, npcId, questId, this);
    }
        async dispatchSubmitNpcQuest(playerId, npcId, questId) {
        return this.worldRuntimeGameplayWriteFacadeService.dispatchSubmitNpcQuest(playerId, npcId, questId, this);
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
        async handlePlayerMonsterKill(instance, monster, killerPlayerId) {
        return this.worldRuntimeGameplayWriteFacadeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, this);
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
        materializeQuestView(playerId, quest) {
        return this.worldRuntimeReadFacadeService.materializeQuestView(playerId, quest, this);
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
        async handlePlayerDefeat(playerId, killerPlayerId = null) {
        return this.worldRuntimeGameplayWriteFacadeService.handlePlayerDefeat(playerId, this, killerPlayerId);
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
        queuePlayerNotice(playerId, text, kind, castId, combat = undefined, structured = undefined) {
        this.worldRuntimeTickDispatchService.queuePlayerNotice(playerId, text, kind, this, castId, combat, structured);
    }
        pushCombatEffect(instanceId, effect) {
        this.worldRuntimeTickDispatchService.pushCombatEffect(instanceId, effect, this);
    }
        pushActionLabelEffect(instanceId, x, y, text, options = undefined) {
        this.worldRuntimeTickDispatchService.pushActionLabelEffect(instanceId, x, y, text, this, options);
    }
        pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.worldRuntimeTickDispatchService.pushDamageFloatEffect(instanceId, x, y, damage, color, this);
    }
        pushCombatTextFloatEffect(instanceId, x, y, text, color, durationMs = undefined) {
        this.worldRuntimeTickDispatchService.pushCombatTextFloatEffect(instanceId, x, y, text, color, this, durationMs);
    }
        pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.worldRuntimeTickDispatchService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color, this);
    }
};
