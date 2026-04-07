"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPAT_HTTP_PROVIDERS = exports.COMPAT_HTTP_CONTROLLERS = void 0;
const legacy_auth_service_1 = require("./legacy/legacy-auth.service");
const legacy_account_http_service_1 = require("./legacy/http/legacy-account-http.service");
const legacy_account_controller_1 = require("./legacy/http/legacy-account.controller");
const legacy_auth_http_service_1 = require("./legacy/http/legacy-auth-http.service");
const legacy_auth_controller_1 = require("./legacy/http/legacy-auth.controller");
const legacy_gm_auth_controller_1 = require("./legacy/http/legacy-gm-auth.controller");
const legacy_gm_http_auth_guard_1 = require("./legacy/http/legacy-gm-http-auth.guard");
const legacy_gm_http_auth_service_1 = require("./legacy/http/legacy-gm-http-auth.service");
const legacy_gm_admin_compat_service_1 = require("./legacy/http/legacy-gm-admin-compat.service");
const legacy_database_restore_coordinator_service_1 = require("./legacy/http/legacy-database-restore-coordinator.service");
const legacy_gm_admin_controller_1 = require("./legacy/http/legacy-gm-admin.controller");
const legacy_gm_redeem_code_controller_1 = require("./legacy/http/legacy-gm-redeem-code.controller");
const legacy_gm_http_compat_service_1 = require("./legacy/http/legacy-gm-http-compat.service");
const legacy_gm_controller_1 = require("./legacy/http/legacy-gm.controller");
const legacy_gm_compat_service_1 = require("./legacy/legacy-gm-compat.service");
const legacy_session_bootstrap_service_1 = require("./legacy/legacy-session-bootstrap.service");
const legacy_auth_readiness_warmup_service_1 = require("../health/legacy-auth-readiness-warmup.service");
exports.COMPAT_HTTP_CONTROLLERS = [
    legacy_account_controller_1.LegacyAccountController,
    legacy_auth_controller_1.LegacyAuthController,
    legacy_gm_auth_controller_1.LegacyGmAuthController,
    legacy_gm_controller_1.LegacyGmController,
    legacy_gm_admin_controller_1.LegacyGmAdminController,
    legacy_gm_redeem_code_controller_1.LegacyGmRedeemCodeController,
];
exports.COMPAT_HTTP_PROVIDERS = [
    legacy_auth_service_1.LegacyAuthService,
    legacy_account_http_service_1.LegacyAccountHttpService,
    legacy_auth_http_service_1.LegacyAuthHttpService,
    legacy_gm_http_auth_service_1.LegacyGmHttpAuthService,
    legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard,
    legacy_database_restore_coordinator_service_1.LegacyDatabaseRestoreCoordinatorService,
    legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService,
    legacy_gm_http_compat_service_1.LegacyGmHttpCompatService,
    legacy_gm_compat_service_1.LegacyGmCompatService,
    legacy_session_bootstrap_service_1.LegacySessionBootstrapService,
    legacy_auth_readiness_warmup_service_1.LegacyAuthReadinessWarmupService,
];
