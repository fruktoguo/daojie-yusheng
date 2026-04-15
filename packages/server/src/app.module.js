"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** config_1：定义该变量以承载业务值。 */
const config_1 = require("@nestjs/config");
/** compat_http_registry_1：定义该变量以承载业务值。 */
const compat_http_registry_1 = require("./compat/compat-http.registry");
/** next_http_registry_1：定义该变量以承载业务值。 */
const next_http_registry_1 = require("./http/next-http.registry");
/** world_gateway_1：定义该变量以承载业务值。 */
const world_gateway_1 = require("./network/world.gateway");
/** world_auth_registry_1：定义该变量以承载业务值。 */
const world_auth_registry_1 = require("./network/world-auth.registry");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("./network/world-client-event.service");
/** world_gm_socket_service_1：定义该变量以承载业务值。 */
const world_gm_socket_service_1 = require("./network/world-gm-socket.service");
/** world_projector_service_1：定义该变量以承载业务值。 */
const world_projector_service_1 = require("./network/world-projector.service");
/** world_protocol_projection_service_1：定义该变量以承载业务值。 */
const world_protocol_projection_service_1 = require("./network/world-protocol-projection.service");
/** world_session_bootstrap_service_1：定义该变量以承载业务值。 */
const world_session_bootstrap_service_1 = require("./network/world-session-bootstrap.service");
/** world_session_reaper_service_1：定义该变量以承载业务值。 */
const world_session_reaper_service_1 = require("./network/world-session-reaper.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("./network/world-session.service");
/** world_sync_protocol_service_1：定义该变量以承载业务值。 */
const world_sync_protocol_service_1 = require("./network/world-sync-protocol.service");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("./network/world-sync.service");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("./content/content-template.repository");
/** health_controller_1：定义该变量以承载业务值。 */
const health_controller_1 = require("./health.controller");
/** health_readiness_service_1：定义该变量以承载业务值。 */
const health_readiness_service_1 = require("./health/health-readiness.service");
/** server_readiness_dependencies_service_1：定义该变量以承载业务值。 */
const server_readiness_dependencies_service_1 = require("./health/server-readiness-dependencies.service");
/** player_combat_service_1：定义该变量以承载业务值。 */
const player_combat_service_1 = require("./runtime/combat/player-combat.service");
/** runtime_gm_auth_service_1：定义该变量以承载业务值。 */
const runtime_gm_auth_service_1 = require("./runtime/gm/runtime-gm-auth.service");
/** runtime_gm_state_service_1：定义该变量以承载业务值。 */
const runtime_gm_state_service_1 = require("./runtime/gm/runtime-gm-state.service");
/** craft_panel_runtime_service_1：定义该变量以承载业务值。 */
const craft_panel_runtime_service_1 = require("./runtime/craft/craft-panel-runtime.service");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("./runtime/map/map-template.repository");
/** runtime_map_config_service_1：定义该变量以承载业务值。 */
const runtime_map_config_service_1 = require("./runtime/map/runtime-map-config.service");
/** player_attributes_service_1：定义该变量以承载业务值。 */
const player_attributes_service_1 = require("./runtime/player/player-attributes.service");
/** leaderboard_runtime_service_1：定义该变量以承载业务值。 */
const leaderboard_runtime_service_1 = require("./runtime/player/leaderboard-runtime.service");
/** player_progression_service_1：定义该变量以承载业务值。 */
const player_progression_service_1 = require("./runtime/player/player-progression.service");
/** map_persistence_flush_service_1：定义该变量以承载业务值。 */
const map_persistence_flush_service_1 = require("./persistence/map-persistence-flush.service");
/** map_persistence_service_1：定义该变量以承载业务值。 */
const map_persistence_service_1 = require("./persistence/map-persistence.service");
/** mail_persistence_service_1：定义该变量以承载业务值。 */
const mail_persistence_service_1 = require("./persistence/mail-persistence.service");
/** market_persistence_service_1：定义该变量以承载业务值。 */
const market_persistence_service_1 = require("./persistence/market-persistence.service");
/** player_identity_persistence_service_1：定义该变量以承载业务值。 */
const player_identity_persistence_service_1 = require("./persistence/player-identity-persistence.service");
/** player_persistence_flush_service_1：定义该变量以承载业务值。 */
const player_persistence_flush_service_1 = require("./persistence/player-persistence-flush.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("./persistence/player-persistence.service");
/** suggestion_persistence_service_1：定义该变量以承载业务值。 */
const suggestion_persistence_service_1 = require("./persistence/suggestion-persistence.service");
/** redeem_code_persistence_service_1：定义该变量以承载业务值。 */
const redeem_code_persistence_service_1 = require("./persistence/redeem-code-persistence.service");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("./runtime/mail/mail-runtime.service");
/** market_runtime_service_1：定义该变量以承载业务值。 */
const market_runtime_service_1 = require("./runtime/market/market-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("./runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("./runtime/suggestion/suggestion-runtime.service");
/** redeem_code_runtime_service_1：定义该变量以承载业务值。 */
const redeem_code_runtime_service_1 = require("./runtime/redeem/redeem-code-runtime.service");
/** world_tick_service_1：定义该变量以承载业务值。 */
const world_tick_service_1 = require("./runtime/tick/world-tick.service");
/** world_runtime_controller_1：定义该变量以承载业务值。 */
const world_runtime_controller_1 = require("./runtime/world/world-runtime.controller");
/** runtime_maintenance_service_1：定义该变量以承载业务值。 */
const runtime_maintenance_service_1 = require("./runtime/world/runtime-maintenance.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("./runtime/world/world-runtime.service");
/** AppModule：定义该变量以承载业务值。 */
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
            ...compat_http_registry_1.COMPAT_HTTP_CONTROLLERS,
            world_runtime_controller_1.WorldRuntimeController,
        ],
        providers: [
            ...next_http_registry_1.NEXT_HTTP_PROVIDERS,
            ...compat_http_registry_1.COMPAT_HTTP_PROVIDERS,
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
            world_sync_service_1.WorldSyncService,
            runtime_maintenance_service_1.RuntimeMaintenanceService,
            world_runtime_service_1.WorldRuntimeService,
            world_tick_service_1.WorldTickService,
            world_gateway_1.WorldGateway,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
