"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;

const common_1 = require("@nestjs/common");

const config_1 = require("@nestjs/config");

const next_http_registry_1 = require("./http/next-http.registry");

const world_gateway_1 = require("./network/world.gateway");

const world_auth_registry_1 = require("./network/world-auth.registry");

const world_client_event_service_1 = require("./network/world-client-event.service");

const world_gm_socket_service_1 = require("./network/world-gm-socket.service");

const world_projector_service_1 = require("./network/world-projector.service");

const world_protocol_projection_service_1 = require("./network/world-protocol-projection.service");

const world_session_bootstrap_service_1 = require("./network/world-session-bootstrap.service");

const world_session_reaper_service_1 = require("./network/world-session-reaper.service");

const world_session_service_1 = require("./network/world-session.service");

const world_sync_protocol_service_1 = require("./network/world-sync-protocol.service");

const world_sync_quest_loot_service_1 = require("./network/world-sync-quest-loot.service");

const world_sync_minimap_service_1 = require("./network/world-sync-minimap.service");

const world_sync_map_snapshot_service_1 = require("./network/world-sync-map-snapshot.service");

const world_sync_map_static_aux_service_1 = require("./network/world-sync-map-static-aux.service");

const world_sync_threat_service_1 = require("./network/world-sync-threat.service");

const world_sync_service_1 = require("./network/world-sync.service");

const content_template_repository_1 = require("./content/content-template.repository");

const health_controller_1 = require("./health.controller");

const health_readiness_service_1 = require("./health/health-readiness.service");

const server_readiness_dependencies_service_1 = require("./health/server-readiness-dependencies.service");

const player_combat_service_1 = require("./runtime/combat/player-combat.service");

const runtime_gm_auth_service_1 = require("./runtime/gm/runtime-gm-auth.service");

const runtime_gm_state_service_1 = require("./runtime/gm/runtime-gm-state.service");

const craft_panel_runtime_service_1 = require("./runtime/craft/craft-panel-runtime.service");

const craft_panel_alchemy_query_service_1 = require("./runtime/craft/craft-panel-alchemy-query.service");

const craft_panel_enhancement_query_service_1 = require("./runtime/craft/craft-panel-enhancement-query.service");

const world_runtime_npc_shop_query_service_1 = require("./runtime/world/world-runtime-npc-shop-query.service");

const world_runtime_quest_query_service_1 = require("./runtime/world/world-runtime-quest-query.service");

const world_runtime_quest_state_service_1 = require("./runtime/world/world-runtime-quest-state.service");

const world_runtime_detail_query_service_1 = require("./runtime/world/world-runtime-detail-query.service");

const world_runtime_metrics_service_1 = require("./runtime/world/world-runtime-metrics.service");

const world_runtime_instance_tick_orchestration_service_1 = require("./runtime/world/world-runtime-instance-tick-orchestration.service");

const world_runtime_movement_service_1 = require("./runtime/world/world-runtime-movement.service");

const world_runtime_summary_query_service_1 = require("./runtime/world/world-runtime-summary-query.service");

const world_runtime_instance_state_service_1 = require("./runtime/world/world-runtime-instance-state.service");

const world_runtime_instance_query_service_1 = require("./runtime/world/world-runtime-instance-query.service");

const world_runtime_pending_command_service_1 = require("./runtime/world/world-runtime-pending-command.service");

const world_runtime_player_location_service_1 = require("./runtime/world/world-runtime-player-location.service");

const world_runtime_tick_progress_service_1 = require("./runtime/world/world-runtime-tick-progress.service");

const world_runtime_npc_quest_interaction_query_service_1 = require("./runtime/world/world-runtime-npc-quest-interaction-query.service");

const world_runtime_npc_shop_service_1 = require("./runtime/world/world-runtime-npc-shop.service");

const world_runtime_gm_queue_service_1 = require("./runtime/world/world-runtime-gm-queue.service");

const world_runtime_respawn_service_1 = require("./runtime/world/world-runtime-respawn.service");

const world_runtime_system_command_service_1 = require("./runtime/world/world-runtime-system-command.service");

const world_runtime_craft_tick_service_1 = require("./runtime/world/world-runtime-craft-tick.service");

const world_runtime_craft_mutation_service_1 = require("./runtime/world/world-runtime-craft-mutation.service");

const world_runtime_craft_interrupt_service_1 = require("./runtime/world/world-runtime-craft-interrupt.service");

const world_runtime_npc_quest_write_service_1 = require("./runtime/world/world-runtime-npc-quest-write.service");

const world_runtime_loot_container_service_1 = require("./runtime/world/world-runtime-loot-container.service");

const world_runtime_navigation_service_1 = require("./runtime/world/world-runtime-navigation.service");

const world_runtime_combat_effects_service_1 = require("./runtime/world/world-runtime-combat-effects.service");

const world_runtime_monster_action_apply_service_1 = require("./runtime/world/world-runtime-monster-action-apply.service");

const world_runtime_basic_attack_service_1 = require("./runtime/world/world-runtime-basic-attack.service");

const world_runtime_monster_system_command_service_1 = require("./runtime/world/world-runtime-monster-system-command.service");

const world_runtime_player_combat_service_1 = require("./runtime/world/world-runtime-player-combat.service");

const world_runtime_player_command_service_1 = require("./runtime/world/world-runtime-player-command.service");

const world_runtime_item_ground_service_1 = require("./runtime/world/world-runtime-item-ground.service");

const world_runtime_transfer_service_1 = require("./runtime/world/world-runtime-transfer.service");

const world_runtime_npc_access_service_1 = require("./runtime/world/world-runtime-npc-access.service");

const world_runtime_equipment_service_1 = require("./runtime/world/world-runtime-equipment.service");

const world_runtime_cultivation_service_1 = require("./runtime/world/world-runtime-cultivation.service");

const world_runtime_progression_service_1 = require("./runtime/world/world-runtime-progression.service");

const world_runtime_enhancement_service_1 = require("./runtime/world/world-runtime-enhancement.service");

const world_runtime_alchemy_service_1 = require("./runtime/world/world-runtime-alchemy.service");

const world_runtime_use_item_service_1 = require("./runtime/world/world-runtime-use-item.service");

const world_runtime_redeem_code_service_1 = require("./runtime/world/world-runtime-redeem-code.service");

const world_runtime_player_skill_dispatch_service_1 = require("./runtime/world/world-runtime-player-skill-dispatch.service");

const world_runtime_battle_engage_service_1 = require("./runtime/world/world-runtime-battle-engage.service");

const world_runtime_auto_combat_service_1 = require("./runtime/world/world-runtime-auto-combat.service");

const map_template_repository_1 = require("./runtime/map/map-template.repository");

const runtime_map_config_service_1 = require("./runtime/map/runtime-map-config.service");

const player_attributes_service_1 = require("./runtime/player/player-attributes.service");

const leaderboard_runtime_service_1 = require("./runtime/player/leaderboard-runtime.service");

const player_progression_service_1 = require("./runtime/player/player-progression.service");

const map_persistence_flush_service_1 = require("./persistence/map-persistence-flush.service");

const map_persistence_service_1 = require("./persistence/map-persistence.service");

const mail_persistence_service_1 = require("./persistence/mail-persistence.service");

const market_persistence_service_1 = require("./persistence/market-persistence.service");

const player_identity_persistence_service_1 = require("./persistence/player-identity-persistence.service");

const player_persistence_flush_service_1 = require("./persistence/player-persistence-flush.service");

const player_persistence_service_1 = require("./persistence/player-persistence.service");

const suggestion_persistence_service_1 = require("./persistence/suggestion-persistence.service");

const redeem_code_persistence_service_1 = require("./persistence/redeem-code-persistence.service");

const mail_runtime_service_1 = require("./runtime/mail/mail-runtime.service");

const market_runtime_service_1 = require("./runtime/market/market-runtime.service");

const player_runtime_service_1 = require("./runtime/player/player-runtime.service");

const suggestion_runtime_service_1 = require("./runtime/suggestion/suggestion-runtime.service");

const redeem_code_runtime_service_1 = require("./runtime/redeem/redeem-code-runtime.service");

const world_tick_service_1 = require("./runtime/tick/world-tick.service");

const world_runtime_controller_1 = require("./runtime/world/world-runtime.controller");

const runtime_maintenance_service_1 = require("./runtime/world/runtime-maintenance.service");

const world_runtime_service_1 = require("./runtime/world/world-runtime.service");

/** server-next 主模块：统一注册 HTTP、Socket 入口和运行时/持久化服务。 */
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
        ],
        controllers: [
            health_controller_1.HealthController,
            ...next_http_registry_1.NEXT_HTTP_CONTROLLERS,
            world_runtime_controller_1.WorldRuntimeController,
        ],
        providers: [
            ...next_http_registry_1.NEXT_HTTP_PROVIDERS,
            content_template_repository_1.ContentTemplateRepository,
            server_readiness_dependencies_service_1.ServerReadinessDependenciesService,
            health_readiness_service_1.HealthReadinessService,
            map_template_repository_1.MapTemplateRepository,
            runtime_gm_auth_service_1.RuntimeGmAuthService,
            runtime_gm_state_service_1.RuntimeGmStateService,
            craft_panel_alchemy_query_service_1.CraftPanelAlchemyQueryService,
            craft_panel_enhancement_query_service_1.CraftPanelEnhancementQueryService,
            craft_panel_runtime_service_1.CraftPanelRuntimeService,
            world_runtime_npc_shop_query_service_1.WorldRuntimeNpcShopQueryService,
            world_runtime_quest_query_service_1.WorldRuntimeQuestQueryService,
            world_runtime_quest_state_service_1.WorldRuntimeQuestStateService,
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
            world_runtime_npc_shop_service_1.WorldRuntimeNpcShopService,
            world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
            world_runtime_respawn_service_1.WorldRuntimeRespawnService,
            world_runtime_system_command_service_1.WorldRuntimeSystemCommandService,
            world_runtime_craft_tick_service_1.WorldRuntimeCraftTickService,
            world_runtime_craft_mutation_service_1.WorldRuntimeCraftMutationService,
            world_runtime_craft_interrupt_service_1.WorldRuntimeCraftInterruptService,
            world_runtime_npc_quest_write_service_1.WorldRuntimeNpcQuestWriteService,
            world_runtime_loot_container_service_1.WorldRuntimeLootContainerService,
            world_runtime_navigation_service_1.WorldRuntimeNavigationService,
            world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService,
            world_runtime_monster_action_apply_service_1.WorldRuntimeMonsterActionApplyService,
            world_runtime_basic_attack_service_1.WorldRuntimeBasicAttackService,
            world_runtime_monster_system_command_service_1.WorldRuntimeMonsterSystemCommandService,
            world_runtime_player_combat_service_1.WorldRuntimePlayerCombatService,
            world_runtime_player_command_service_1.WorldRuntimePlayerCommandService,
            world_runtime_item_ground_service_1.WorldRuntimeItemGroundService,
            world_runtime_transfer_service_1.WorldRuntimeTransferService,
            world_runtime_npc_access_service_1.WorldRuntimeNpcAccessService,
            world_runtime_equipment_service_1.WorldRuntimeEquipmentService,
            world_runtime_cultivation_service_1.WorldRuntimeCultivationService,
            world_runtime_progression_service_1.WorldRuntimeProgressionService,
            world_runtime_enhancement_service_1.WorldRuntimeEnhancementService,
            world_runtime_alchemy_service_1.WorldRuntimeAlchemyService,
            world_runtime_use_item_service_1.WorldRuntimeUseItemService,
            world_runtime_redeem_code_service_1.WorldRuntimeRedeemCodeService,
            world_runtime_player_skill_dispatch_service_1.WorldRuntimePlayerSkillDispatchService,
            world_runtime_battle_engage_service_1.WorldRuntimeBattleEngageService,
            world_runtime_auto_combat_service_1.WorldRuntimeAutoCombatService,
            runtime_map_config_service_1.RuntimeMapConfigService,
            player_combat_service_1.PlayerCombatService,
            map_persistence_service_1.MapPersistenceService,
            map_persistence_flush_service_1.MapPersistenceFlushService,
            mail_persistence_service_1.MailPersistenceService,
            market_persistence_service_1.MarketPersistenceService,
            player_identity_persistence_service_1.PlayerIdentityPersistenceService,
            player_persistence_service_1.PlayerPersistenceService,
            player_persistence_flush_service_1.PlayerPersistenceFlushService,
            suggestion_persistence_service_1.SuggestionPersistenceService,
            redeem_code_persistence_service_1.RedeemCodePersistenceService,
            player_attributes_service_1.PlayerAttributesService,
            leaderboard_runtime_service_1.LeaderboardRuntimeService,
            player_progression_service_1.PlayerProgressionService,
            mail_runtime_service_1.MailRuntimeService,
            market_runtime_service_1.MarketRuntimeService,
            player_runtime_service_1.PlayerRuntimeService,
            suggestion_runtime_service_1.SuggestionRuntimeService,
            redeem_code_runtime_service_1.RedeemCodeRuntimeService,
            ...world_auth_registry_1.WORLD_AUTH_PROVIDERS,
            world_session_service_1.WorldSessionService,
            world_session_bootstrap_service_1.WorldSessionBootstrapService,
            world_session_reaper_service_1.WorldSessionReaperService,
            world_client_event_service_1.WorldClientEventService,
            world_gm_socket_service_1.WorldGmSocketService,
            world_protocol_projection_service_1.WorldProtocolProjectionService,
            world_projector_service_1.WorldProjectorService,
            world_sync_protocol_service_1.WorldSyncProtocolService,
            world_sync_quest_loot_service_1.WorldSyncQuestLootService,
            world_sync_minimap_service_1.WorldSyncMinimapService,
            world_sync_map_snapshot_service_1.WorldSyncMapSnapshotService,
            world_sync_map_static_aux_service_1.WorldSyncMapStaticAuxService,
            world_sync_threat_service_1.WorldSyncThreatService,
            world_sync_service_1.WorldSyncService,
            runtime_maintenance_service_1.RuntimeMaintenanceService,
            world_runtime_service_1.WorldRuntimeService,
            world_tick_service_1.WorldTickService,
            world_gateway_1.WorldGateway,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
