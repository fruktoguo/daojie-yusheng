"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_HTTP_PROVIDERS = exports.NEXT_HTTP_CONTROLLERS = void 0;
const compat_tokens_1 = require("../compat/compat.tokens");
const legacy_managed_account_service_1 = require("../compat/legacy/http/legacy-managed-account.service");
const legacy_gm_http_auth_guard_1 = require("../compat/legacy/http/legacy-gm-http-auth.guard");
const legacy_database_restore_coordinator_service_1 = require("../compat/legacy/http/legacy-database-restore-coordinator.service");
const legacy_gm_admin_compat_service_1 = require("../compat/legacy/http/legacy-gm-admin-compat.service");
const legacy_gm_mail_compat_service_1 = require("../compat/legacy/http/legacy-gm-mail-compat.service");
const legacy_gm_player_compat_service_1 = require("../compat/legacy/http/legacy-gm-player-compat.service");
const legacy_gm_world_compat_service_1 = require("../compat/legacy/http/legacy-gm-world-compat.service");
const next_player_auth_store_service_1 = require("./next/next-player-auth-store.service");
const next_player_auth_service_1 = require("./next/next-player-auth.service");
const next_managed_account_service_1 = require("./next/next-managed-account.service");
const next_auth_controller_1 = require("./next/next-auth.controller");
const next_account_controller_1 = require("./next/next-account.controller");
const next_gm_auth_controller_1 = require("./next/next-gm-auth.controller");
const next_gm_controller_1 = require("./next/next-gm.controller");
const next_gm_admin_controller_1 = require("./next/next-gm-admin.controller");
exports.NEXT_HTTP_CONTROLLERS = [
    next_auth_controller_1.NextAuthController,
    next_account_controller_1.NextAccountController,
    next_gm_auth_controller_1.NextGmAuthController,
    next_gm_controller_1.NextGmController,
    next_gm_admin_controller_1.NextGmAdminController,
];
exports.NEXT_HTTP_PROVIDERS = [
    next_player_auth_store_service_1.NextPlayerAuthStoreService,
    next_player_auth_service_1.NextPlayerAuthService,
    next_managed_account_service_1.NextManagedAccountService,
    legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard,
    legacy_database_restore_coordinator_service_1.LegacyDatabaseRestoreCoordinatorService,
    legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService,
    legacy_gm_mail_compat_service_1.LegacyGmMailCompatService,
    legacy_gm_player_compat_service_1.LegacyGmPlayerCompatService,
    legacy_gm_world_compat_service_1.LegacyGmWorldCompatService,
    {
        provide: compat_tokens_1.LEGACY_AUTH_STATE_SERVICE,
        useExisting: next_player_auth_store_service_1.NextPlayerAuthStoreService,
    },
    {
        provide: compat_tokens_1.LEGACY_AUTH_USER_COMPAT_SERVICE,
        useExisting: next_player_auth_store_service_1.NextPlayerAuthStoreService,
    },
    {
        provide: legacy_managed_account_service_1.LegacyManagedAccountService,
        useExisting: next_managed_account_service_1.NextManagedAccountService,
    },
];
