"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_HTTP_PROVIDERS = exports.NEXT_HTTP_CONTROLLERS = void 0;
const next_database_restore_coordinator_service_1 = require("./next/next-database-restore-coordinator.service");
const next_gm_admin_service_1 = require("./next/next-gm-admin.service");
const next_gm_mail_service_1 = require("./next/next-gm-mail.service");
const next_gm_player_service_1 = require("./next/next-gm-player.service");
const next_gm_world_service_1 = require("./next/next-gm-world.service");
const next_gm_auth_guard_1 = require("./next/next-gm-auth.guard");
const next_player_auth_store_service_1 = require("./next/next-player-auth-store.service");
const next_player_auth_service_1 = require("./next/next-player-auth.service");
const next_auth_rate_limit_service_1 = require("./next/next-auth-rate-limit.service");
const next_managed_account_service_1 = require("./next/next-managed-account.service");
const next_auth_controller_1 = require("./next/next-auth.controller");
const next_account_controller_1 = require("./next/next-account.controller");
const next_gm_auth_controller_1 = require("./next/next-gm-auth.controller");
const next_gm_controller_1 = require("./next/next-gm.controller");
const next_gm_admin_controller_1 = require("./next/next-gm-admin.controller");
// TODO(next:T13): 在 next HTTP contract 最终定稿后，复核这层 controller/provider 总入口是否还要继续承担迁移期 GM/auth/admin 聚合壳。

/** Next 体系 HTTP 路由与依赖注册清单（控制器 + 服务）。 */
exports.NEXT_HTTP_CONTROLLERS = [
    next_auth_controller_1.NextAuthController,
    next_account_controller_1.NextAccountController,
    next_gm_auth_controller_1.NextGmAuthController,
    next_gm_controller_1.NextGmController,
    next_gm_admin_controller_1.NextGmAdminController,
];

/** Next HTTP 入口依赖：鉴权/GM/管理/数据库恢复服务的统一导出。 */
exports.NEXT_HTTP_PROVIDERS = [
    next_player_auth_store_service_1.NextPlayerAuthStoreService,
    next_player_auth_service_1.NextPlayerAuthService,
    next_auth_rate_limit_service_1.NextAuthRateLimitService,
    next_managed_account_service_1.NextManagedAccountService,
    next_gm_auth_guard_1.NextGmAuthGuard,
    next_database_restore_coordinator_service_1.NextDatabaseRestoreCoordinatorService,
    next_gm_admin_service_1.NextGmAdminService,
    next_gm_mail_service_1.NextGmMailService,
    next_gm_player_service_1.NextGmPlayerService,
    next_gm_world_service_1.NextGmWorldService,
];
