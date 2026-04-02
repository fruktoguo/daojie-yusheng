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
const legacy_auth_service_1 = require("./compat/legacy/legacy-auth.service");
const legacy_account_http_service_1 = require("./compat/legacy/http/legacy-account-http.service");
const legacy_account_controller_1 = require("./compat/legacy/http/legacy-account.controller");
const legacy_auth_http_service_1 = require("./compat/legacy/http/legacy-auth-http.service");
const legacy_auth_controller_1 = require("./compat/legacy/http/legacy-auth.controller");
const legacy_gm_auth_controller_1 = require("./compat/legacy/http/legacy-gm-auth.controller");
const legacy_gm_http_auth_guard_1 = require("./compat/legacy/http/legacy-gm-http-auth.guard");
const legacy_gm_http_auth_service_1 = require("./compat/legacy/http/legacy-gm-http-auth.service");
const legacy_gm_admin_compat_service_1 = require("./compat/legacy/http/legacy-gm-admin-compat.service");
const legacy_database_restore_coordinator_service_1 = require("./compat/legacy/http/legacy-database-restore-coordinator.service");
const legacy_gm_admin_controller_1 = require("./compat/legacy/http/legacy-gm-admin.controller");
const legacy_gm_redeem_code_controller_1 = require("./compat/legacy/http/legacy-gm-redeem-code.controller");
const legacy_gm_http_compat_service_1 = require("./compat/legacy/http/legacy-gm-http-compat.service");
const legacy_gm_controller_1 = require("./compat/legacy/http/legacy-gm.controller");
const legacy_gm_compat_service_1 = require("./compat/legacy/legacy-gm-compat.service");
const legacy_gateway_compat_service_1 = require("./compat/legacy/legacy-gateway-compat.service");
const legacy_session_bootstrap_service_1 = require("./compat/legacy/legacy-session-bootstrap.service");
const legacy_socket_bridge_service_1 = require("./compat/legacy/legacy-socket-bridge.service");
const world_gateway_1 = require("./network/world.gateway");
const world_client_event_service_1 = require("./network/world-client-event.service");
const world_projector_service_1 = require("./network/world-projector.service");
const world_session_reaper_service_1 = require("./network/world-session-reaper.service");
const world_session_service_1 = require("./network/world-session.service");
const world_sync_service_1 = require("./network/world-sync.service");
const content_template_repository_1 = require("./content/content-template.repository");
const health_controller_1 = require("./health.controller");
const legacy_auth_readiness_warmup_service_1 = require("./health/legacy-auth-readiness-warmup.service");
const health_readiness_service_1 = require("./health/health-readiness.service");
const player_combat_service_1 = require("./runtime/combat/player-combat.service");
const map_template_repository_1 = require("./runtime/map/map-template.repository");
const player_attributes_service_1 = require("./runtime/player/player-attributes.service");
const player_progression_service_1 = require("./runtime/player/player-progression.service");
const map_persistence_flush_service_1 = require("./persistence/map-persistence-flush.service");
const map_persistence_service_1 = require("./persistence/map-persistence.service");
const mail_persistence_service_1 = require("./persistence/mail-persistence.service");
const market_persistence_service_1 = require("./persistence/market-persistence.service");
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
const world_runtime_service_1 = require("./runtime/world/world-runtime.service");
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
            legacy_account_controller_1.LegacyAccountController,
            legacy_auth_controller_1.LegacyAuthController,
            legacy_gm_auth_controller_1.LegacyGmAuthController,
            legacy_gm_controller_1.LegacyGmController,
            legacy_gm_admin_controller_1.LegacyGmAdminController,
            legacy_gm_redeem_code_controller_1.LegacyGmRedeemCodeController,
            world_runtime_controller_1.WorldRuntimeController,
        ],
        providers: [
            legacy_auth_service_1.LegacyAuthService,
            legacy_account_http_service_1.LegacyAccountHttpService,
            legacy_auth_http_service_1.LegacyAuthHttpService,
            legacy_gm_http_auth_service_1.LegacyGmHttpAuthService,
            legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard,
            legacy_database_restore_coordinator_service_1.LegacyDatabaseRestoreCoordinatorService,
            legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService,
            legacy_gm_http_compat_service_1.LegacyGmHttpCompatService,
            legacy_gm_compat_service_1.LegacyGmCompatService,
            legacy_gateway_compat_service_1.LegacyGatewayCompatService,
            legacy_socket_bridge_service_1.LegacySocketBridgeService,
            legacy_session_bootstrap_service_1.LegacySessionBootstrapService,
            content_template_repository_1.ContentTemplateRepository,
            legacy_auth_readiness_warmup_service_1.LegacyAuthReadinessWarmupService,
            health_readiness_service_1.HealthReadinessService,
            map_template_repository_1.MapTemplateRepository,
            player_combat_service_1.PlayerCombatService,
            map_persistence_service_1.MapPersistenceService,
            map_persistence_flush_service_1.MapPersistenceFlushService,
            mail_persistence_service_1.MailPersistenceService,
            market_persistence_service_1.MarketPersistenceService,
            player_persistence_service_1.PlayerPersistenceService,
            player_persistence_flush_service_1.PlayerPersistenceFlushService,
            suggestion_persistence_service_1.SuggestionPersistenceService,
            redeem_code_persistence_service_1.RedeemCodePersistenceService,
            player_attributes_service_1.PlayerAttributesService,
            player_progression_service_1.PlayerProgressionService,
            mail_runtime_service_1.MailRuntimeService,
            market_runtime_service_1.MarketRuntimeService,
            player_runtime_service_1.PlayerRuntimeService,
            suggestion_runtime_service_1.SuggestionRuntimeService,
            redeem_code_runtime_service_1.RedeemCodeRuntimeService,
            world_session_service_1.WorldSessionService,
            world_session_reaper_service_1.WorldSessionReaperService,
            world_client_event_service_1.WorldClientEventService,
            world_projector_service_1.WorldProjectorService,
            world_sync_service_1.WorldSyncService,
            world_runtime_service_1.WorldRuntimeService,
            world_tick_service_1.WorldTickService,
            world_gateway_1.WorldGateway,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
