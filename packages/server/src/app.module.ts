/**
 * 应用根模块：注册全部 HTTP 控制器、Socket 网关、运行时服务和持久化服务。
 * 单模块扁平注册，NestJS DI 容器统一管理生命周期。
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { shouldStartHttpServer } from './config/runtime-role';
import { NATIVE_HTTP_CONTROLLERS, NATIVE_HTTP_PROVIDERS } from './http/native-http.registry';
import { WorldGateway } from './network/world.gateway';
import { WORLD_AUTH_PROVIDERS } from './network/world-auth.registry';
import { WorldClientEventService } from './network/world-client-event.service';
import { WorldGmSocketService } from './network/world-gm-socket.service';
import { WorldProjectorService } from './network/world-projector.service';
import { WorldProtocolProjectionService } from './network/world-protocol-projection.service';
import { WorldSessionBootstrapContextHelper } from './network/world-session-bootstrap-context.helper';
import { WorldSessionBootstrapContractService } from './network/world-session-bootstrap-contract.service';
import { WorldSessionBootstrapFinalizeService } from './network/world-session-bootstrap-finalize.service';
import { WorldSessionBootstrapPostEmitService } from './network/world-session-bootstrap-post-emit.service';
import { WorldSessionBootstrapPlayerInitService } from './network/world-session-bootstrap-player-init.service';
import { WorldSessionRecoveryQueueService } from './network/world-session-recovery-queue.service';
import { WorldSessionBootstrapRuntimeService } from './network/world-session-bootstrap-runtime.service';
import { WorldSessionBootstrapSessionBindService } from './network/world-session-bootstrap-session-bind.service';
import { WorldSessionBootstrapSnapshotService } from './network/world-session-bootstrap-snapshot.service';
import { WorldSessionBootstrapService } from './network/world-session-bootstrap.service';
import { WorldSessionReaperService } from './network/world-session-reaper.service';
import { WorldShutdownDrainService } from './network/world-shutdown-drain.service';
import { WorldSessionService } from './network/world-session.service';
import { WorldSyncProtocolService } from './network/world-sync-protocol.service';
import { WorldSyncQuestLootService } from './network/world-sync-quest-loot.service';
import { WorldSyncMinimapService } from './network/world-sync-minimap.service';
import { WorldSyncMapSnapshotService } from './network/world-sync-map-snapshot.service';
import { WorldSyncMapStaticAuxService } from './network/world-sync-map-static-aux.service';
import { WorldSyncThreatService } from './network/world-sync-threat.service';
import { WorldSyncAuxStateService } from './network/world-sync-aux-state.service';
import { WorldSyncEnvelopeService } from './network/world-sync-envelope.service';
import { WorldSyncPlayerStateService } from './network/world-sync-player-state.service';
import { WorldSyncService } from './network/world-sync.service';
import { WorldGatewayBuildingHelper } from './network/world-gateway-building.helper';
import { WorldGatewayClientEmitHelper } from './network/world-gateway-client-emit.helper';
import { WorldGatewayCraftHelper } from './network/world-gateway-craft.helper';
import { WorldGatewayGmSuggestionHelper } from './network/world-gateway-gm-suggestion.helper';
import { WorldGatewayGuardHelper } from './network/world-gateway-guard.helper';
import { WorldGatewayMovementHelper } from './network/world-gateway-movement.helper';
import { WorldGatewayNpcHelper } from './network/world-gateway-npc.helper';
import { WorldGatewayPresenceHelper } from './network/world-gateway-presence.helper';
import { WorldGatewayReadModelHelper } from './network/world-gateway-read-model.helper';
import { WorldGatewayContentHelper } from './network/world-gateway-content.helper';
import { WorldGatewaySessionStateHelper } from './network/world-gateway-session-state.helper';
import { WorldGatewaySuggestionHelper } from './network/world-gateway-suggestion.helper';
import { ContentTemplateRepository } from './content/content-template.repository';
import { BuffTemplateRegistry } from './content/registries/buff-template.registry';
import { DropTableRegistry } from './content/registries/drop-table.registry';
import { FormationTemplateRegistry } from './content/registries/formation-template.registry';
import { ItemTemplateRegistry } from './content/registries/item-template.registry';
import { MonsterTemplateRegistry } from './content/registries/monster-template.registry';
import { SkillTemplateRegistry } from './content/registries/skill-template.registry';
import { TechniqueTemplateRegistry } from './content/registries/technique-template.registry';
import { ContainerTemplateRegistry } from './runtime/map/registries/container-template.registry';
import { LandmarkTemplateRegistry } from './runtime/map/registries/landmark-template.registry';
import { NpcTemplateRegistry } from './runtime/map/registries/npc-template.registry';
import { QuestTemplateRegistry } from './runtime/map/registries/quest-template.registry';
import { TileTemplateRegistry } from './runtime/map/registries/tile-template.registry';
import { ActorBlueprintRegistryService } from './runtime/actor/actor-blueprint-registry.service';
import { ActorPersistencePolicyService } from './runtime/actor/actor-persistence-policy.service';
import { EphemeralActorIdentityService } from './runtime/actor/ephemeral-actor-identity.service';
import { HealthController } from './health.controller';
import { HealthReadinessService } from './health/health-readiness.service';
import { ServerReadinessDependenciesService } from './health/server-readiness-dependencies.service';
import { ServerLifecycleCoordinatorService } from './lifecycle/server-lifecycle-coordinator.service';
import { StartupBarrierService } from './lifecycle/startup-barrier.service';
import { ShutdownStatusService } from './lifecycle/shutdown-status.service';
import { StartupStatusService } from './lifecycle/startup-status.service';
import { PlayerCombatService } from './runtime/combat/player-combat.service';
import { RuntimeGmAuthService } from './runtime/gm/runtime-gm-auth.service';
import { RuntimeGmStateService } from './runtime/gm/runtime-gm-state.service';
import { CraftPanelRuntimeService } from './runtime/craft/craft-panel-runtime.service';
import { CraftPanelAlchemyQueryService } from './runtime/craft/craft-panel-alchemy-query.service';
import { CraftPanelEnhancementQueryService } from './runtime/craft/craft-panel-enhancement-query.service';
import { WorldRuntimeNpcShopQueryService } from './runtime/world/query/world-runtime-npc-shop-query.service';
import { WorldRuntimeQuestQueryService } from './runtime/world/query/world-runtime-quest-query.service';
import { WorldRuntimeQuestStateService } from './runtime/world/world-runtime-quest-state.service';
import { WorldRuntimeDetailQueryService } from './runtime/world/query/world-runtime-detail-query.service';
import { WorldRuntimeContextActionQueryService } from './runtime/world/query/world-runtime-context-action-query.service';
import { WorldRuntimePlayerViewQueryService } from './runtime/world/query/world-runtime-player-view-query.service';
import { WorldRuntimeMetricsService } from './runtime/world/world-runtime-metrics.service';
import { WorldRuntimeFrameService } from './runtime/world/world-runtime-frame.service';
import { WorldRuntimeLifecycleService } from './runtime/world/world-runtime-lifecycle.service';
import { WorldRuntimePersistenceStateService } from './runtime/world/world-runtime-persistence-state.service';
import { WorldRuntimePlayerSessionService } from './runtime/world/world-runtime-player-session.service';
import { WorldRuntimeCommandIntakeFacadeService } from './runtime/world/command/world-runtime-command-intake-facade.service';
import { WorldRuntimeGameplayWriteFacadeService } from './runtime/world/world-runtime-gameplay-write-facade.service';
import { WorldRuntimeInstanceReadFacadeService } from './runtime/world/query/world-runtime-instance-read-facade.service';
import { WorldRuntimeQuestRuntimeFacadeService } from './runtime/world/world-runtime-quest-runtime-facade.service';
import { WorldRuntimeReadFacadeService } from './runtime/world/query/world-runtime-read-facade.service';
import { WorldRuntimeStateFacadeService } from './runtime/world/world-runtime-state-facade.service';
import { WorldRuntimeTickDispatchService } from './runtime/world/world-runtime-tick-dispatch.service';
import { WorldRuntimeWorldAccessService } from './runtime/world/world-runtime-world-access.service';
import { WorldRuntimeInstanceTickOrchestrationService } from './runtime/world/world-runtime-instance-tick-orchestration.service';
import { WorldRuntimeMovementService } from './runtime/world/world-runtime-movement.service';
import { WorldRuntimeSummaryQueryService } from './runtime/world/query/world-runtime-summary-query.service';
import { WorldRuntimeInstanceStateService } from './runtime/world/world-runtime-instance-state.service';
import { WorldRuntimeInstanceQueryService } from './runtime/world/query/world-runtime-instance-query.service';
import { WorldRuntimePendingCommandService } from './runtime/world/command/world-runtime-pending-command.service';
import { WorldRuntimePlayerLocationService } from './runtime/world/world-runtime-player-location.service';
import { WorldRuntimeTickProgressService } from './runtime/world/world-runtime-tick-progress.service';
import { WorldRuntimeNpcQuestInteractionQueryService } from './runtime/world/query/world-runtime-npc-quest-interaction-query.service';
import { WorldRuntimeNpcShopService } from './runtime/world/world-runtime-npc-shop.service';
import { WorldRuntimeGmQueueService } from './runtime/world/command/world-runtime-gm-queue.service';
import { WorldRuntimeRespawnService } from './runtime/world/world-runtime-respawn.service';
import { WorldRuntimeSystemCommandService } from './runtime/world/command/world-runtime-system-command.service';
import { WorldRuntimeCraftTickService } from './runtime/world/world-runtime-craft-tick.service';
import { WorldRuntimeCraftMutationService } from './runtime/world/world-runtime-craft-mutation.service';
import { WorldRuntimeCraftInterruptService } from './runtime/world/world-runtime-craft-interrupt.service';
import { WorldRuntimeNpcQuestWriteService } from './runtime/world/world-runtime-npc-quest-write.service';
import { WorldRuntimeLootContainerService } from './runtime/world/world-runtime-loot-container.service';
import { WorldRuntimeNavigationService } from './runtime/world/world-runtime-navigation.service';
import { WorldRuntimeCombatEffectsService } from './runtime/world/combat/world-runtime-combat-effects.service';
import { WorldRuntimeCombatActionService } from './runtime/world/combat/world-runtime-combat-action.service';
import { WorldRuntimeMonsterActionApplyService } from './runtime/world/combat/world-runtime-monster-action-apply.service';
import { WorldRuntimeBasicAttackService } from './runtime/world/combat/world-runtime-basic-attack.service';
import { WorldRuntimeMonsterSystemCommandService } from './runtime/world/command/world-runtime-monster-system-command.service';
import { WorldRuntimePlayerCombatService } from './runtime/world/combat/world-runtime-player-combat.service';
import { WorldRuntimePlayerCombatOutcomeService } from './runtime/world/combat/world-runtime-player-combat-outcome.service';
import { WorldRuntimeGmSystemCommandService } from './runtime/world/command/world-runtime-gm-system-command.service';
import { WorldRuntimePlayerCommandService } from './runtime/world/command/world-runtime-player-command.service';
import { WorldRuntimePlayerCommandEnqueueService } from './runtime/world/command/world-runtime-player-command-enqueue.service';
import { WorldRuntimeItemGroundService } from './runtime/world/world-runtime-item-ground.service';
import { WorldRuntimeTransferService } from './runtime/world/world-runtime-transfer.service';
import { WorldRuntimeNpcAccessService } from './runtime/world/world-runtime-npc-access.service';
import { WorldRuntimeEquipmentService } from './runtime/world/world-runtime-equipment.service';
import { WorldRuntimeCultivationService } from './runtime/world/world-runtime-cultivation.service';
import { WorldRuntimeProgressionService } from './runtime/world/world-runtime-progression.service';
import { WorldRuntimeEnhancementService } from './runtime/world/world-runtime-enhancement.service';
import { WorldRuntimeAlchemyService } from './runtime/world/world-runtime-alchemy.service';
import { WorldRuntimeUseItemService } from './runtime/world/world-runtime-use-item.service';
import { WorldRuntimeRedeemCodeService } from './runtime/world/world-runtime-redeem-code.service';
import { WorldRuntimePlayerSkillDispatchService } from './runtime/world/combat/world-runtime-player-skill-dispatch.service';
import { WorldRuntimeBattleEngageService } from './runtime/world/combat/world-runtime-battle-engage.service';
import { WorldRuntimeAutoCombatService } from './runtime/world/combat/world-runtime-auto-combat.service';
import { WorldRuntimeThreatService } from './runtime/world/combat/world-runtime-threat.service';
import { WorldRuntimeCombatCommandService } from './runtime/world/combat/world-runtime-combat-command.service';
import { WorldRuntimeActionExecutionService } from './runtime/world/command/world-runtime-action-execution.service';
import { WorldRuntimeSystemCommandEnqueueService } from './runtime/world/command/world-runtime-system-command-enqueue.service';
import { WorldRuntimeTongtianTowerService } from './runtime/world/world-runtime-tongtian-tower.service';
import { MapTemplateRepository } from './runtime/map/map-template.repository';
import { RuntimeMapConfigService } from './runtime/map/runtime-map-config.service';
import { PlayerAttributesService } from './runtime/player/player-attributes.service';
import { LeaderboardRuntimeService } from './runtime/player/leaderboard-runtime.service';
import { PlayerProgressionService } from './runtime/player/player-progression.service';
import { MapPersistenceFlushService } from './persistence/map-persistence-flush.service';
import { DurableOperationService } from './persistence/durable-operation.service';
import { MapPersistenceService } from './persistence/map-persistence.service';
import { DatabasePoolProvider } from './persistence/database-pool.provider';
import { FlushDiagnosticsService } from './persistence/flush-diagnostics.service';
import { CombatAuditOutboxService } from './persistence/combat-audit-outbox.service';
import { FlushWakeupService } from './persistence/flush-wakeup.service';
import { InstanceCatalogService } from './persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from './persistence/instance-domain-persistence.service';
import { MailPersistenceService } from './persistence/mail-persistence.service';
import { MarketPersistenceService } from './persistence/market-persistence.service';
import { PlayerDomainPersistenceService } from './persistence/player-domain-persistence.service';
import { FlushLedgerService } from './persistence/flush-ledger.service';
import { FlushTaskRuntimeService } from './persistence/flush-task-runtime.service';
import { PlayerFlushLedgerService } from './persistence/player-flush-ledger.service';
import { PlayerIdentityPersistenceService } from './persistence/player-identity-persistence.service';
import { PlayerPersistenceFlushService } from './persistence/player-persistence-flush.service';
import { NodeRegistryService } from './persistence/node-registry.service';
import { GmRuntimeFlagPersistenceService } from './persistence/gm-runtime-flag-persistence.service';
import { GmConfigPersistenceService } from './persistence/gm-config-persistence.service';
import { GmAuditLogPersistenceService } from './persistence/gm-audit-log-persistence.service';
import { NodeRegistryRuntimeService } from './persistence/node-registry-runtime.service';
import { PlayerSessionRouteService } from './persistence/player-session-route.service';
import { OutboxDispatcherService } from './persistence/outbox-dispatcher.service';
import { OutboxEventConsumerRegistryService } from './persistence/outbox-event-consumer-registry.service';
import { OutboxDispatcherRuntimeService } from './persistence/outbox-dispatcher-runtime.service';
import { SuggestionPersistenceService } from './persistence/suggestion-persistence.service';
import { RedeemCodePersistenceService } from './persistence/redeem-code-persistence.service';
import { PlayerCountersPersistenceService } from './persistence/player-counters-persistence.service';
import { TongtianTowerPersistenceService } from './persistence/tongtian-tower-persistence.service';
import { MailRuntimeService } from './runtime/mail/mail-runtime.service';
import { MarketRuntimeService } from './runtime/market/market-runtime.service';
import { PlayerRuntimeService } from './runtime/player/player-runtime.service';
import { BackgroundWorkerRuntimeService } from './runtime/worker/background-worker-runtime.service';
import { AssetAuditLogRetentionWorker } from './runtime/world/worker/asset-audit-log-retention.worker';
import { FlushLedgerRetentionWorker } from './runtime/world/worker/flush-ledger-retention.worker';
import { InstanceStatePurgeWorker } from './runtime/world/worker/instance-state-purge.worker';
import { MailExpirationCleanupWorker } from './runtime/world/worker/mail-expiration-cleanup.worker';
import { MailSoftDeletePurgeWorker } from './runtime/world/worker/mail-soft-delete-purge.worker';
import { MarketTradeHistoryRetentionWorker } from './runtime/world/worker/market-trade-history-retention.worker';
import { PlayerAnchorCheckpointFlushWorker } from './runtime/world/worker/player-anchor-checkpoint-flush.worker';
import { PlayerStateFlushWorker } from './runtime/world/worker/player-state-flush.worker';
import { InstanceResourceFlushWorker } from './runtime/world/worker/instance-resource-flush.worker';
import { InstanceGroundItemFlushWorker } from './runtime/world/worker/instance-ground-item-flush.worker';
import { InstanceContainerFlushWorker } from './runtime/world/worker/instance-container-flush.worker';
import { InstanceTileDamageFlushWorker } from './runtime/world/worker/instance-tile-damage-flush.worker';
import { InstanceOverlayFlushWorker } from './runtime/world/worker/instance-overlay-flush.worker';
import { InstanceMonsterRuntimeFlushWorker } from './runtime/world/worker/instance-monster-runtime-flush.worker';
import { CheckpointCompactionWorker } from './runtime/world/worker/checkpoint-compaction.worker';
import { SuggestionRuntimeService } from './runtime/suggestion/suggestion-runtime.service';
import { RedeemCodeRuntimeService } from './runtime/redeem/redeem-code-runtime.service';
import { RuntimeEventBusMetricsService } from './runtime/event-bus/runtime-event-bus-metrics.service';
import { RuntimeEventBusService } from './runtime/event-bus/runtime-event-bus.service';
import { WorldTickService } from './runtime/tick/world-tick.service';
import { WorldRuntimeController } from './runtime/world/world-runtime.controller';
import { RuntimeMaintenanceService } from './runtime/world/runtime-maintenance.service';
import { WorldRuntimeService } from './runtime/world/world-runtime.service';
import { WorkerPoolModule } from './concurrency/worker-pool.module';
import { SchedulerGovernorService } from './scheduler/scheduler-governor.service';
import { SchedulerManagerService } from './scheduler/scheduler-manager.service';
import { SchedulerRegistryService } from './scheduler/scheduler-registry.service';
import { SchedulerStatePersistenceService } from './scheduler/scheduler-state-persistence.service';
import { SchedulerStateService } from './scheduler/scheduler-state.service';
import { AsyncPathfindingService } from './runtime/world/async-pathfinding.service';
import { AsyncFovService } from './runtime/world/async-fov.service';
import { WorldSyncWorkerEncodeService } from './network/world-sync-worker-encode.service';
import { AoiEnvelopeEncoderService } from './network/aoi-envelope-encoder.service';

const WORLD_GATEWAY_PROVIDERS = shouldStartHttpServer()
  ? [
    WorldShutdownDrainService,
    WorldGatewayBuildingHelper,
    WorldGatewayClientEmitHelper,
    WorldGatewayCraftHelper,
    WorldGatewayGmSuggestionHelper,
    WorldGatewayGuardHelper,
    WorldGatewayMovementHelper,
    WorldGatewayNpcHelper,
    WorldGatewayPresenceHelper,
    WorldGatewayReadModelHelper,
    WorldGatewayContentHelper,
    WorldGatewaySessionStateHelper,
    WorldGatewaySuggestionHelper,
    WorldGateway,
  ]
  : [];

/** 服务端主模块：统一注册 HTTP、Socket 入口和运行时/持久化服务。 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WorkerPoolModule,
  ],
  controllers: [
    HealthController,
    ...NATIVE_HTTP_CONTROLLERS,
    WorldRuntimeController,
  ],
  providers: [
    ...NATIVE_HTTP_PROVIDERS,
    ContentTemplateRepository,
    ItemTemplateRegistry,
    TechniqueTemplateRegistry,
    SkillTemplateRegistry,
    BuffTemplateRegistry,
    FormationTemplateRegistry,
    MonsterTemplateRegistry,
    DropTableRegistry,
    NpcTemplateRegistry,
    QuestTemplateRegistry,
    ContainerTemplateRegistry,
    LandmarkTemplateRegistry,
    TileTemplateRegistry,
    EphemeralActorIdentityService,
    ActorPersistencePolicyService,
    ActorBlueprintRegistryService,
    ServerReadinessDependenciesService,
    HealthReadinessService,
    StartupStatusService,
    ShutdownStatusService,
    StartupBarrierService,
    SchedulerGovernorService,
    SchedulerManagerService,
    SchedulerRegistryService,
    SchedulerStatePersistenceService,
    SchedulerStateService,
    ServerLifecycleCoordinatorService,
    MapTemplateRepository,
    RuntimeGmAuthService,
    RuntimeGmStateService,
    CraftPanelAlchemyQueryService,
    CraftPanelEnhancementQueryService,
    CraftPanelRuntimeService,
    WorldRuntimeNpcShopQueryService,
    WorldRuntimeQuestQueryService,
    WorldRuntimeQuestStateService,
    WorldRuntimeDetailQueryService,
    WorldRuntimeContextActionQueryService,
    WorldRuntimePlayerViewQueryService,
    WorldRuntimeMetricsService,
    WorldRuntimeFrameService,
    WorldRuntimeLifecycleService,
    WorldRuntimePersistenceStateService,
    WorldRuntimePlayerSessionService,
    WorldRuntimeCommandIntakeFacadeService,
    WorldRuntimeGameplayWriteFacadeService,
    WorldRuntimeInstanceReadFacadeService,
    WorldRuntimeQuestRuntimeFacadeService,
    WorldRuntimeReadFacadeService,
    WorldRuntimeStateFacadeService,
    WorldRuntimeTickDispatchService,
    WorldRuntimeWorldAccessService,
    WorldRuntimeInstanceTickOrchestrationService,
    WorldRuntimeMovementService,
    WorldRuntimeSummaryQueryService,
    WorldRuntimeInstanceStateService,
    WorldRuntimeInstanceQueryService,
    WorldRuntimePendingCommandService,
    WorldRuntimePlayerLocationService,
    WorldRuntimeTickProgressService,
    WorldRuntimeNpcQuestInteractionQueryService,
    WorldRuntimeNpcShopService,
    WorldRuntimeGmQueueService,
    WorldRuntimeRespawnService,
    WorldRuntimeSystemCommandService,
    WorldRuntimeCraftTickService,
    WorldRuntimeCraftMutationService,
    WorldRuntimeCraftInterruptService,
    WorldRuntimeNpcQuestWriteService,
    WorldRuntimeLootContainerService,
    WorldRuntimeNavigationService,
    WorldRuntimeCombatEffectsService,
    WorldRuntimeCombatActionService,
    WorldRuntimeMonsterActionApplyService,
    WorldRuntimeBasicAttackService,
    WorldRuntimeMonsterSystemCommandService,
    WorldRuntimePlayerCombatService,
    WorldRuntimePlayerCombatOutcomeService,
    WorldRuntimeGmSystemCommandService,
    WorldRuntimePlayerCommandService,
    WorldRuntimePlayerCommandEnqueueService,
    WorldRuntimeItemGroundService,
    WorldRuntimeTransferService,
    WorldRuntimeNpcAccessService,
    WorldRuntimeEquipmentService,
    WorldRuntimeCultivationService,
    WorldRuntimeProgressionService,
    WorldRuntimeEnhancementService,
    WorldRuntimeAlchemyService,
    WorldRuntimeUseItemService,
    WorldRuntimeRedeemCodeService,
    WorldRuntimePlayerSkillDispatchService,
    WorldRuntimeBattleEngageService,
    WorldRuntimeAutoCombatService,
    WorldRuntimeThreatService,
    WorldRuntimeCombatCommandService,
    WorldRuntimeActionExecutionService,
    WorldRuntimeSystemCommandEnqueueService,
    WorldRuntimeTongtianTowerService,
    RuntimeMapConfigService,
    PlayerCombatService,
    MapPersistenceService,
    DatabasePoolProvider,
    FlushDiagnosticsService,
    CombatAuditOutboxService,
    FlushWakeupService,
    InstanceCatalogService,
    InstanceDomainPersistenceService,
    MapPersistenceFlushService,
    DurableOperationService,
    NodeRegistryService,
    GmRuntimeFlagPersistenceService,
    GmConfigPersistenceService,
    GmAuditLogPersistenceService,
    NodeRegistryRuntimeService,
    PlayerSessionRouteService,
    OutboxDispatcherService,
    OutboxEventConsumerRegistryService,
    OutboxDispatcherRuntimeService,
    MailPersistenceService,
    MarketPersistenceService,
    PlayerDomainPersistenceService,
    FlushLedgerService,
    FlushTaskRuntimeService,
    PlayerFlushLedgerService,
    PlayerIdentityPersistenceService,
    PlayerPersistenceFlushService,
    SuggestionPersistenceService,
    RedeemCodePersistenceService,
    TongtianTowerPersistenceService,
    PlayerCountersPersistenceService,
    PlayerAttributesService,
    LeaderboardRuntimeService,
    PlayerProgressionService,
    MailRuntimeService,
    BackgroundWorkerRuntimeService,
    AssetAuditLogRetentionWorker,
    FlushLedgerRetentionWorker,
    InstanceStatePurgeWorker,
    MailExpirationCleanupWorker,
    MailSoftDeletePurgeWorker,
    MarketTradeHistoryRetentionWorker,
    MarketRuntimeService,
    PlayerRuntimeService,
    PlayerAnchorCheckpointFlushWorker,
    PlayerStateFlushWorker,
    InstanceResourceFlushWorker,
    InstanceGroundItemFlushWorker,
    InstanceContainerFlushWorker,
    InstanceTileDamageFlushWorker,
    InstanceOverlayFlushWorker,
    InstanceMonsterRuntimeFlushWorker,
    CheckpointCompactionWorker,
    SuggestionRuntimeService,
    RedeemCodeRuntimeService,
    ...WORLD_AUTH_PROVIDERS,
    WorldSessionService,
    WorldSessionBootstrapContextHelper,
    WorldSessionBootstrapContractService,
    WorldSessionBootstrapFinalizeService,
    WorldSessionBootstrapPostEmitService,
    WorldSessionBootstrapPlayerInitService,
    WorldSessionRecoveryQueueService,
    WorldSessionBootstrapRuntimeService,
    WorldSessionBootstrapSessionBindService,
    WorldSessionBootstrapSnapshotService,
    WorldSessionBootstrapService,
    WorldSessionReaperService,
    WorldClientEventService,
    WorldGmSocketService,
    WorldProtocolProjectionService,
    WorldProjectorService,
    WorldSyncProtocolService,
    WorldSyncQuestLootService,
    WorldSyncMinimapService,
    WorldSyncMapSnapshotService,
    WorldSyncMapStaticAuxService,
    WorldSyncThreatService,
    WorldSyncAuxStateService,
    WorldSyncEnvelopeService,
    WorldSyncPlayerStateService,
    WorldSyncService,
    RuntimeMaintenanceService,
    ...WORLD_GATEWAY_PROVIDERS,
    { provide: 'WORLD_RUNTIME_SERVICE', useExisting: WorldRuntimeService },
    WorldRuntimeService,
    AsyncPathfindingService,
    AsyncFovService,
    AoiEnvelopeEncoderService,
    WorldSyncWorkerEncodeService,
    RuntimeEventBusMetricsService,
    RuntimeEventBusService,
    WorldTickService,
  ],
})
export class AppModule {}
