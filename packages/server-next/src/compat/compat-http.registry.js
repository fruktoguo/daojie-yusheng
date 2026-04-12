"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPAT_HTTP_PROVIDERS = exports.COMPAT_HTTP_CONTROLLERS = void 0;
/** compat_tokens_1：定义该变量以承载业务值。 */
const compat_tokens_1 = require("./compat.tokens");
/** ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT',
    'NEXT_ALLOW_LEGACY_HTTP_COMPAT',
];
/** isLegacyHttpCompatEnabled：执行对应的业务逻辑。 */
function isLegacyHttpCompatEnabled() {
    for (const key of ALLOW_LEGACY_HTTP_COMPAT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** buildCompatHttpBindings：执行对应的业务逻辑。 */
function buildCompatHttpBindings() {
    if (!isLegacyHttpCompatEnabled()) {
        return {
            controllers: [],
            providers: [],
        };
    }
    const { LegacyAuthService } = require("./legacy/legacy-auth.service");
    const { LegacyAccountHttpService } = require("./legacy/http/legacy-account-http.service");
    const { LegacyAccountController } = require("./legacy/http/legacy-account.controller");
    const { LegacyAuthUserCompatService } = require("./legacy/http/legacy-auth-user-compat.service");
    const { LegacyManagedAccountService } = require("./legacy/http/legacy-managed-account.service");
    const { LegacyNextIdentitySyncService } = require("./legacy/http/legacy-next-identity-sync.service");
    const { LegacyAuthController } = require("./legacy/http/legacy-auth.controller");
    const { LegacyGmAuthController } = require("./legacy/http/legacy-gm-auth.controller");
    const { LegacyGmHttpAuthGuard } = require("./legacy/http/legacy-gm-http-auth.guard");
    const { LegacyGmAdminCompatService } = require("./legacy/http/legacy-gm-admin-compat.service");
    const { LegacyDatabaseRestoreCoordinatorService } = require("./legacy/http/legacy-database-restore-coordinator.service");
    const { LegacyGmAdminController } = require("./legacy/http/legacy-gm-admin.controller");
    const { LegacyGmRedeemCodeController } = require("./legacy/http/legacy-gm-redeem-code.controller");
    const { LegacyGmMailCompatService } = require("./legacy/http/legacy-gm-mail-compat.service");
    const { LegacyGmPlayerCompatService } = require("./legacy/http/legacy-gm-player-compat.service");
    const { LegacyGmWorldCompatService } = require("./legacy/http/legacy-gm-world-compat.service");
    const { LegacyGmController } = require("./legacy/http/legacy-gm.controller");
    const { LegacySessionBootstrapService } = require("./legacy/legacy-session-bootstrap.service");
    const { LegacyAuthReadinessWarmupService } = require("../health/legacy-auth-readiness-warmup.service");
    return {
        controllers: [
            LegacyAccountController,
            LegacyAuthController,
            LegacyGmAuthController,
            LegacyGmController,
            LegacyGmAdminController,
            LegacyGmRedeemCodeController,
        ],
        providers: [
            LegacyAuthService,
            LegacyAccountHttpService,
            LegacyAuthUserCompatService,
            LegacyManagedAccountService,
            LegacyNextIdentitySyncService,
            LegacyGmHttpAuthGuard,
            LegacyDatabaseRestoreCoordinatorService,
            LegacyGmAdminCompatService,
            LegacyGmMailCompatService,
            LegacyGmPlayerCompatService,
            LegacyGmWorldCompatService,
            LegacySessionBootstrapService,
            LegacyAuthReadinessWarmupService,
            {
                provide: compat_tokens_1.LEGACY_AUTH_STATE_SERVICE,
                useExisting: LegacyAuthService,
            },
            {
                provide: compat_tokens_1.LEGACY_AUTH_USER_COMPAT_SERVICE,
                useExisting: LegacyAuthUserCompatService,
            },
        ],
    };
}
/** COMPAT_HTTP_BINDINGS：定义该变量以承载业务值。 */
const COMPAT_HTTP_BINDINGS = buildCompatHttpBindings();
exports.COMPAT_HTTP_CONTROLLERS = COMPAT_HTTP_BINDINGS.controllers;
/** COMPAT_HTTP_ONLY_PROVIDERS：定义该变量以承载业务值。 */
const COMPAT_HTTP_ONLY_PROVIDERS = COMPAT_HTTP_BINDINGS.providers;
exports.COMPAT_HTTP_PROVIDERS = [
    ...COMPAT_HTTP_ONLY_PROVIDERS,
];
