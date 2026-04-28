import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
import { ContentTemplateRepository } from './content/content-template.repository';
import { HealthController } from './health.controller';
import { HealthReadinessService } from './health/health-readiness.service';
import { ServerReadinessDependenciesService } from './health/server-readiness-dependencies.service';
import { PlayerCombatService } from './runtime/combat/player-combat.service';
import { RuntimeGmAuthService } from './runtime/gm/runtime-gm-auth.service';
import { RuntimeGmStateService } from './runtime/gm/runtime-gm-state.service';
import { CraftPanelRuntimeService } from './runtime/craft/craft-panel-runtime.service';
import { CraftPanelAlchemyQueryService } from './runtime/craft/craft-panel-alchemy-query.service';
import { CraftPanelEnhancementQueryService } from './runtime/craft/craft-panel-enhancement-query.service';
import { WorldRuntimeNpcShopQueryService } from './runtime/world/world-runtime-npc-shop-query.service';
import { WorldRuntimeQuestQueryService } from './runtime/world/world-runtime-quest-query.service';
import { WorldRuntimeQuestStateService } from './runtime/world/world-runtime-quest-state.service';
import { WorldRuntimeDetailQueryService } from './runtime/world/world-runtime-detail-query.service';
import { WorldRuntimeContextActionQueryService } from './runtime/world/world-runtime-context-action-query.service';
import { WorldRuntimePlayerViewQueryService } from './runtime/world/world-runtime-player-view-query.service';
import { WorldRuntimeMetricsService } from './runtime/world/world-runtime-metrics.service';
import { WorldRuntimeFrameService } from './runtime/world/world-runtime-frame.service';
import { WorldRuntimeLifecycleService } from './runtime/world/world-runtime-lifecycle.service';
import { WorldRuntimePersistenceStateService } from './runtime/world/world-runtime-persistence-state.service';
import { WorldRuntimePlayerSessionService } from './runtime/world/world-runtime-player-session.service';
import { WorldRuntimeCommandIntakeFacadeService } from './runtime/world/world-runtime-command-intake-facade.service';
import { WorldRuntimeGameplayWriteFacadeService } from './runtime/world/world-runtime-gameplay-write-facade.service';
import { WorldRuntimeInstanceReadFacadeService } from './runtime/world/world-runtime-instance-read-facade.service';
import { WorldRuntimeQuestRuntimeFacadeService } from './runtime/world/world-runtime-quest-runtime-facade.service';
import { WorldRuntimeReadFacadeService } from './runtime/world/world-runtime-read-facade.service';
import { WorldRuntimeStateFacadeService } from './runtime/world/world-runtime-state-facade.service';
import { WorldRuntimeTickDispatchService } from './runtime/world/world-runtime-tick-dispatch.service';
import { WorldRuntimeWorldAccessService } from './runtime/world/world-runtime-world-access.service';
import { WorldRuntimeInstanceTickOrchestrationService } from './runtime/world/world-runtime-instance-tick-orchestration.service';
import { WorldRuntimeMovementService } from './runtime/world/world-runtime-movement.service';
import { WorldRuntimeSummaryQueryService } from './runtime/world/world-runtime-summary-query.service';
import { WorldRuntimeInstanceStateService } from './runtime/world/world-runtime-instance-state.service';
import { WorldRuntimeInstanceQueryService } from './runtime/world/world-runtime-instance-query.service';
import { WorldRuntimePendingCommandService } from './runtime/world/world-runtime-pending-command.service';
import { WorldRuntimePlayerLocationService } from './runtime/world/world-runtime-player-location.service';
import { WorldRuntimeTickProgressService } from './runtime/world/world-runtime-tick-progress.service';
import { WorldRuntimeNpcQuestInteractionQueryService } from './runtime/world/world-runtime-npc-quest-interaction-query.service';
import { WorldRuntimeNpcShopService } from './runtime/world/world-runtime-npc-shop.service';
import { WorldRuntimeGmQueueService } from './runtime/world/world-runtime-gm-queue.service';
import { WorldRuntimeRespawnService } from './runtime/world/world-runtime-respawn.service';
import { WorldRuntimeSystemCommandService } from './runtime/world/world-runtime-system-command.service';
import { WorldRuntimeCraftTickService } from './runtime/world/world-runtime-craft-tick.service';
import { WorldRuntimeCraftMutationService } from './runtime/world/world-runtime-craft-mutation.service';
import { WorldRuntimeCraftInterruptService } from './runtime/world/world-runtime-craft-interrupt.service';
import { WorldRuntimeNpcQuestWriteService } from './runtime/world/world-runtime-npc-quest-write.service';
import { WorldRuntimeLootContainerService } from './runtime/world/world-runtime-loot-container.service';
import { WorldRuntimeNavigationService } from './runtime/world/world-runtime-navigation.service';
import { WorldRuntimeCombatEffectsService } from './runtime/world/world-runtime-combat-effects.service';
import { WorldRuntimeMonsterActionApplyService } from './runtime/world/world-runtime-monster-action-apply.service';
import { WorldRuntimeBasicAttackService } from './runtime/world/world-runtime-basic-attack.service';
import { WorldRuntimeMonsterSystemCommandService } from './runtime/world/world-runtime-monster-system-command.service';
import { WorldRuntimePlayerCombatService } from './runtime/world/world-runtime-player-combat.service';
import { WorldRuntimePlayerCombatOutcomeService } from './runtime/world/world-runtime-player-combat-outcome.service';
import { WorldRuntimeGmSystemCommandService } from './runtime/world/world-runtime-gm-system-command.service';
import { WorldRuntimePlayerCommandService } from './runtime/world/world-runtime-player-command.service';
import { WorldRuntimePlayerCommandEnqueueService } from './runtime/world/world-runtime-player-command-enqueue.service';
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
import { WorldRuntimePlayerSkillDispatchService } from './runtime/world/world-runtime-player-skill-dispatch.service';
import { WorldRuntimeBattleEngageService } from './runtime/world/world-runtime-battle-engage.service';
import { WorldRuntimeAutoCombatService } from './runtime/world/world-runtime-auto-combat.service';
import { WorldRuntimeCombatCommandService } from './runtime/world/world-runtime-combat-command.service';
import { WorldRuntimeActionExecutionService } from './runtime/world/world-runtime-action-execution.service';
import { WorldRuntimeSystemCommandEnqueueService } from './runtime/world/world-runtime-system-command-enqueue.service';
import { MapTemplateRepository } from './runtime/map/map-template.repository';
import { RuntimeMapConfigService } from './runtime/map/runtime-map-config.service';
import { PlayerAttributesService } from './runtime/player/player-attributes.service';
import { LeaderboardRuntimeService } from './runtime/player/leaderboard-runtime.service';
import { PlayerProgressionService } from './runtime/player/player-progression.service';
import { MapPersistenceFlushService } from './persistence/map-persistence-flush.service';
import { DurableOperationService } from './persistence/durable-operation.service';
import { MapPersistenceService } from './persistence/map-persistence.service';
import { DatabasePoolProvider } from './persistence/database-pool.provider';
import { FlushWakeupService } from './persistence/flush-wakeup.service';
import { InstanceCatalogService } from './persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from './persistence/instance-domain-persistence.service';
import { MailPersistenceService } from './persistence/mail-persistence.service';
import { MarketPersistenceService } from './persistence/market-persistence.service';
import { PlayerDomainPersistenceService } from './persistence/player-domain-persistence.service';
import { FlushLedgerService } from './persistence/flush-ledger.service';
import { PlayerFlushLedgerService } from './persistence/player-flush-ledger.service';
import { PlayerIdentityPersistenceService } from './persistence/player-identity-persistence.service';
import { PlayerPersistenceFlushService } from './persistence/player-persistence-flush.service';
import { PlayerPersistenceService } from './persistence/player-persistence.service';
import { NodeRegistryService } from './persistence/node-registry.service';
import { GmMapConfigPersistenceService } from './persistence/gm-map-config-persistence.service';
import { NodeRegistryRuntimeService } from './persistence/node-registry-runtime.service';
import { PlayerSessionRouteService } from './persistence/player-session-route.service';
import { OutboxDispatcherService } from './persistence/outbox-dispatcher.service';
import { OutboxEventConsumerRegistryService } from './persistence/outbox-event-consumer-registry.service';
import { OutboxDispatcherRuntimeService } from './persistence/outbox-dispatcher-runtime.service';
import { SuggestionPersistenceService } from './persistence/suggestion-persistence.service';
import { RedeemCodePersistenceService } from './persistence/redeem-code-persistence.service';
import { MailRuntimeService } from './runtime/mail/mail-runtime.service';
import { MarketRuntimeService } from './runtime/market/market-runtime.service';
import { PlayerRuntimeService } from './runtime/player/player-runtime.service';
import { AssetAuditLogRetentionWorker } from './runtime/world/asset-audit-log-retention.worker';
import { MailSoftDeletePurgeWorker } from './runtime/world/mail-soft-delete-purge.worker';
import { PlayerAnchorCheckpointFlushWorker } from './runtime/world/player-anchor-checkpoint-flush.worker';
import { PlayerStateFlushWorker } from './runtime/world/player-state-flush.worker';
import { InstanceResourceFlushWorker } from './runtime/world/instance-resource-flush.worker';
import { InstanceGroundItemFlushWorker } from './runtime/world/instance-ground-item-flush.worker';
import { InstanceContainerFlushWorker } from './runtime/world/instance-container-flush.worker';
import { InstanceTileDamageFlushWorker } from './runtime/world/instance-tile-damage-flush.worker';
import { InstanceOverlayFlushWorker } from './runtime/world/instance-overlay-flush.worker';
import { InstanceMonsterRuntimeFlushWorker } from './runtime/world/instance-monster-runtime-flush.worker';
import { CheckpointCompactionWorker } from './runtime/world/checkpoint-compaction.worker';
import { SuggestionRuntimeService } from './runtime/suggestion/suggestion-runtime.service';
import { RedeemCodeRuntimeService } from './runtime/redeem/redeem-code-runtime.service';
import { WorldTickService } from './runtime/tick/world-tick.service';
import { WorldRuntimeController } from './runtime/world/world-runtime.controller';
import { RuntimeMaintenanceService } from './runtime/world/runtime-maintenance.service';
import { WorldRuntimeService } from './runtime/world/world-runtime.service';

/** server 主模块：统一注册 HTTP、Socket 入口和运行时/持久化服务。 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [
    HealthController,
    ...NATIVE_HTTP_CONTROLLERS,
    WorldRuntimeController,
  ],
  providers: [
    ...NATIVE_HTTP_PROVIDERS,
    ContentTemplateRepository,
    ServerReadinessDependenciesService,
    HealthReadinessService,
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
    WorldRuntimeCombatCommandService,
    WorldRuntimeActionExecutionService,
    WorldRuntimeSystemCommandEnqueueService,
    RuntimeMapConfigService,
    PlayerCombatService,
    MapPersistenceService,
    DatabasePoolProvider,
    FlushWakeupService,
    InstanceCatalogService,
    InstanceDomainPersistenceService,
    MapPersistenceFlushService,
    DurableOperationService,
    NodeRegistryService,
    GmMapConfigPersistenceService,
    NodeRegistryRuntimeService,
    PlayerSessionRouteService,
    OutboxDispatcherService,
    OutboxEventConsumerRegistryService,
    OutboxDispatcherRuntimeService,
    MailPersistenceService,
    MarketPersistenceService,
    PlayerDomainPersistenceService,
    FlushLedgerService,
    PlayerFlushLedgerService,
    PlayerIdentityPersistenceService,
    PlayerPersistenceService,
    PlayerPersistenceFlushService,
    SuggestionPersistenceService,
    RedeemCodePersistenceService,
    PlayerAttributesService,
    LeaderboardRuntimeService,
    PlayerProgressionService,
    MailRuntimeService,
    AssetAuditLogRetentionWorker,
    MailSoftDeletePurgeWorker,
    MarketRuntimeService,
    PlayerRuntimeService,
    AssetAuditLogRetentionWorker,
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
    { provide: 'WORLD_RUNTIME_SERVICE', useExisting: WorldRuntimeService },
    WorldRuntimeService,
    WorldTickService,
    WorldGateway,
  ],
})
export class AppModule {}
