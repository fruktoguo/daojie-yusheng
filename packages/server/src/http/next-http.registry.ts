import { NextDatabaseRestoreCoordinatorService } from './next/next-database-restore-coordinator.service';
import { NextGmAdminService } from './next/next-gm-admin.service';
import { NextGmEditorQueryService } from './next/next-gm-editor-query.service';
import { NextGmMailService } from './next/next-gm-mail.service';
import { NextGmMapQueryService } from './next/next-gm-map-query.service';
import { NextGmMapRuntimeQueryService } from './next/next-gm-map-runtime-query.service';
import { NextGmStateQueryService } from './next/next-gm-state-query.service';
import { NextGmSuggestionQueryService } from './next/next-gm-suggestion-query.service';
import { NextGmPlayerService } from './next/next-gm-player.service';
import { NextGmWorldService } from './next/next-gm-world.service';
import { NextGmAuthGuard } from './next/next-gm-auth.guard';
import { NextPlayerAuthStoreService } from './next/next-player-auth-store.service';
import { NextPlayerAuthService } from './next/next-player-auth.service';
import { NextAuthRateLimitService } from './next/next-auth-rate-limit.service';
import { NextManagedAccountService } from './next/next-managed-account.service';
import { NextAuthController } from './next/next-auth.controller';
import { NextAccountController } from './next/next-account.controller';
import { NextGmAuthController } from './next/next-gm-auth.controller';
import { NextGmController } from './next/next-gm.controller';
import { NextGmAdminController } from './next/next-gm-admin.controller';
import { GM_HTTP_CONTRACT } from './next/next-gm-contract';

/** Next 体系 HTTP 路由与依赖注册清单（控制器 + 服务）。 */
export const NEXT_HTTP_CONTRACT = Object.freeze({
  controllerShape: GM_HTTP_CONTRACT.controllerShape,
  authSurface: GM_HTTP_CONTRACT.authSurface,
  adminSurface: GM_HTTP_CONTRACT.adminSurface,
  restoreSurface: GM_HTTP_CONTRACT.restoreSurface,
});

/** Next 体系 HTTP 路由与依赖注册清单（控制器 + 服务）。 */
export const NEXT_HTTP_CONTROLLERS = [
  NextAuthController,
  NextAccountController,
  NextGmAuthController,
  NextGmController,
  NextGmAdminController,
];

/** Next HTTP 入口依赖：鉴权/GM/管理/数据库恢复服务的统一导出。 */
export const NEXT_HTTP_PROVIDERS = [
  NextPlayerAuthStoreService,
  NextPlayerAuthService,
  NextAuthRateLimitService,
  NextManagedAccountService,
  NextGmAuthGuard,
  NextDatabaseRestoreCoordinatorService,
  NextGmAdminService,
  NextGmEditorQueryService,
  NextGmMailService,
  NextGmMapQueryService,
  NextGmMapRuntimeQueryService,
  NextGmStateQueryService,
  NextGmSuggestionQueryService,
  NextGmPlayerService,
  NextGmWorldService,
];
