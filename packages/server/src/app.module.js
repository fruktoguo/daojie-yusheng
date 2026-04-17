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

const world_sync_service_1 = require("./network/world-sync.service");

const content_template_repository_1 = require("./content/content-template.repository");

const health_controller_1 = require("./health.controller");

const health_readiness_service_1 = require("./health/health-readiness.service");

const server_readiness_dependencies_service_1 = require("./health/server-readiness-dependencies.service");

const player_combat_service_1 = require("./runtime/combat/player-combat.service");

const runtime_gm_auth_service_1 = require("./runtime/gm/runtime-gm-auth.service");

const runtime_gm_state_service_1 = require("./runtime/gm/runtime-gm-state.service");

const craft_panel_runtime_service_1 = require("./runtime/craft/craft-panel-runtime.service");

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
            craft_panel_runtime_service_1.CraftPanelRuntimeService,
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
            world_sync_service_1.WorldSyncService,
            runtime_maintenance_service_1.RuntimeMaintenanceService,
            world_runtime_service_1.WorldRuntimeService,
            world_tick_service_1.WorldTickService,
            world_gateway_1.WorldGateway,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
