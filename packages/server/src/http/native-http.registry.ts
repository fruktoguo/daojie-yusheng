import { NativeDatabaseRestoreCoordinatorService } from './native/native-database-restore-coordinator.service';
import { NativeGmAdminService } from './native/native-gm-admin.service';
import { NativeGmEditorQueryService } from './native/native-gm-editor-query.service';
import { NativeGmMailService } from './native/native-gm-mail.service';
import { NativeGmMapQueryService } from './native/native-gm-map-query.service';
import { NativeGmMapRuntimeQueryService } from './native/native-gm-map-runtime-query.service';
import { NativeGmStateQueryService } from './native/native-gm-state-query.service';
import { NativeGmSuggestionQueryService } from './native/native-gm-suggestion-query.service';
import { NativeGmPlayerService } from './native/native-gm-player.service';
import { NativeGmWorldService } from './native/native-gm-world.service';
import { NativeGmAuthGuard } from './native/native-gm-auth.guard';
import { NativePlayerAuthStoreService } from './native/native-player-auth-store.service';
import { NativePlayerAuthService } from './native/native-player-auth.service';
import { NativeAuthRateLimitService } from './native/native-auth-rate-limit.service';
import { NativeManagedAccountService } from './native/native-managed-account.service';
import { NativeAuthController } from './native/native-auth.controller';
import { NativeAccountController } from './native/native-account.controller';
import { NativeGmAuthController } from './native/native-gm-auth.controller';
import { NativeGmController } from './native/native-gm.controller';
import { NativeGmAdminController } from './native/native-gm-admin.controller';
import { GM_HTTP_CONTRACT } from './native/native-gm-contract';

/** 原生主线 HTTP 路由与依赖注册清单（控制器 + 服务）。 */
export const NATIVE_HTTP_CONTRACT = Object.freeze({
  controllerShape: GM_HTTP_CONTRACT.controllerShape,
  authSurface: GM_HTTP_CONTRACT.authSurface,
  adminSurface: GM_HTTP_CONTRACT.adminSurface,
  restoreSurface: GM_HTTP_CONTRACT.restoreSurface,
});

/** 原生主线 HTTP 路由与依赖注册清单（控制器 + 服务）。 */
export const NATIVE_HTTP_CONTROLLERS = [
  NativeAuthController,
  NativeAccountController,
  NativeGmAuthController,
  NativeGmController,
  NativeGmAdminController,
];

/** 原生 HTTP 入口依赖：鉴权/GM/管理/数据库恢复服务的统一导出。 */
export const NATIVE_HTTP_PROVIDERS = [
  NativePlayerAuthStoreService,
  NativePlayerAuthService,
  NativeAuthRateLimitService,
  NativeManagedAccountService,
  NativeGmAuthGuard,
  NativeDatabaseRestoreCoordinatorService,
  NativeGmAdminService,
  NativeGmEditorQueryService,
  NativeGmMailService,
  NativeGmMapQueryService,
  NativeGmMapRuntimeQueryService,
  NativeGmStateQueryService,
  NativeGmSuggestionQueryService,
  NativeGmPlayerService,
  NativeGmWorldService,
];
