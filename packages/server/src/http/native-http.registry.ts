/**
 * 原生 HTTP 模块注册清单。
 * 集中导出所有原生 HTTP 控制器和服务提供者，供 NestJS 模块统一注册。
 */
import { BotTokenService } from '../auth/bot-token.service';
import { NativeDatabaseRestoreCoordinatorService } from './native/native-database-restore-coordinator.service';
import { NativeGmAdminService } from './native/native-gm-admin.service';
import { NativeGmEditorQueryService } from './native/native-gm-editor-query.service';
import { NativeGmDiagnosticsService } from './native/native-gm-diagnostics.service';
import { NativeGmMailService } from './native/native-gm-mail.service';
import { NativeGmMapQueryService } from './native/native-gm-map-query.service';
import { NativeGmMapRuntimeQueryService } from './native/native-gm-map-runtime-query.service';
import { NativeGmMarketTradeService } from './native/native-gm-market-trade.service';
import { NativeGmStateQueryService } from './native/native-gm-state-query.service';
import { NativeGmSuggestionQueryService } from './native/native-gm-suggestion-query.service';
import { NativeGmPlayerService } from './native/native-gm-player.service';
import { NativeGmWorkerService } from './native/native-gm-worker.service';
import { NativeGmWorldService } from './native/native-gm-world.service';
import { NativeGmAuthGuard } from './native/native-gm-auth.guard';
import { NativeBotController } from './native/native-bot.controller';
import { NativeBotService } from './native/native-bot.service';
import { NativePlayerAuthStoreService } from './native/native-player-auth-store.service';
import { NativePlayerAuthService } from './native/native-player-auth.service';
import { NativeAuthRateLimitService } from './native/native-auth-rate-limit.service';
import { NativeManagedAccountService } from './native/native-managed-account.service';
import { NativeAuthController } from './native/native-auth.controller';
import { NativeAccountController } from './native/native-account.controller';
import { NativeGmAuthController } from './native/native-gm-auth.controller';
import { NativeGmController } from './native/native-gm.controller';
import { NativeGmAdminController } from './native/native-gm-admin.controller';
import { NativeGmAiProviderController, NATIVE_GM_AI_PROVIDER_CONTROLLER_PROVIDERS } from './native/native-gm-ai-provider.controller';
import { NativeGmEnvironmentController } from './native/native-gm-environment.controller';
import { NativeGmSecretController } from './native/native-gm-secret.controller';
import { RuntimeEnvManagementService } from '../runtime/gm/runtime-env-management.service';
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
  NativeGmSecretController,
  NativeGmEnvironmentController,
  NativeGmAiProviderController,
  NativeBotController,
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
  NativeGmDiagnosticsService,
  NativeGmEditorQueryService,
  NativeGmMailService,
  NativeGmMapQueryService,
  NativeGmMapRuntimeQueryService,
  NativeGmMarketTradeService,
  NativeGmStateQueryService,
  NativeGmSuggestionQueryService,
  NativeGmPlayerService,
  NativeGmWorkerService,
  NativeGmWorldService,
  ...NATIVE_GM_AI_PROVIDER_CONTROLLER_PROVIDERS,
  RuntimeEnvManagementService,
  BotTokenService,
  NativeBotService,
];
