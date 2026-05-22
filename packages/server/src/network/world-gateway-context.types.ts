/**
 * 本文件定义服务端网络上下文或网关辅助类型，用于连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
import type { Logger } from '@nestjs/common';
import type { HealthReadinessService } from '../health/health-readiness.service';
import type { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import type { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import type { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import type { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import type { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import type { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import type { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import type { LeaderboardRuntimeService } from '../runtime/player/leaderboard-runtime.service';
import type { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import type { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import type { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import type { WorldClientEventService } from './world-client-event.service';
import type { WorldGmSocketService } from './world-gm-socket.service';
import type { WorldProtocolProjectionService } from './world-protocol-projection.service';
import type { WorldSessionBootstrapService } from './world-session-bootstrap.service';
import type { WorldSessionService } from './world-session.service';
import type { WorldSyncService } from './world-sync.service';
import type { WorldGatewayActionHelper } from './world-gateway-action.helper';
import type { WorldGatewayBootstrapHelper } from './world-gateway-bootstrap.helper';
import type { WorldGatewayBuildingHelper } from './world-gateway-building.helper';
import type { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import type { WorldGatewayCraftHelper } from './world-gateway-craft.helper';
import type { WorldGatewayGmCommandHelper } from './world-gateway-gm-command.helper';
import type { WorldGatewayGmSuggestionHelper } from './world-gateway-gm-suggestion.helper';
import type { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import type { WorldGatewayInventoryHelper } from './world-gateway-inventory.helper';
import type { WorldGatewayMailHelper } from './world-gateway-mail.helper';
import type { WorldGatewayMarketHelper } from './world-gateway-market.helper';
import type { WorldGatewayMovementHelper } from './world-gateway-movement.helper';
import type { WorldGatewayNpcHelper } from './world-gateway-npc.helper';
import type { WorldGatewayPlayerControlsHelper } from './world-gateway-player-controls.helper';
import type { WorldGatewayPresenceHelper } from './world-gateway-presence.helper';
import type { WorldGatewayReadModelHelper } from './world-gateway-read-model.helper';
import type { WorldGatewaySessionStateHelper } from './world-gateway-session-state.helper';
import type { WorldGatewaySuggestionHelper } from './world-gateway-suggestion.helper';

export interface WorldGatewayHelperContext {
  logger: Logger;
  worldGmSocketService: WorldGmSocketService;
  worldProtocolProjectionService: WorldProtocolProjectionService;
  sessionBootstrapService: WorldSessionBootstrapService;
  healthReadinessService: HealthReadinessService;
  playerDomainPersistenceService: PlayerDomainPersistenceService;
  playerPersistenceFlushService: PlayerPersistenceFlushService;
  playerRuntimeService: PlayerRuntimeService;
  mailRuntimeService: MailRuntimeService;
  marketRuntimeService: MarketRuntimeService;
  craftPanelRuntimeService: CraftPanelRuntimeService;
  suggestionRuntimeService: SuggestionRuntimeService;
  leaderboardRuntimeService: LeaderboardRuntimeService;
  runtimeGmStateService: RuntimeGmStateService;
  worldRuntimeService: WorldRuntimeService;
  worldClientEventService: WorldClientEventService;
  worldSessionService: WorldSessionService;
  playerSessionRouteService: PlayerSessionRouteService;
  worldSyncService: WorldSyncService;
  flushMarketResult(result: unknown): Promise<void>;
  gatewayBootstrapHelper: WorldGatewayBootstrapHelper;
  gatewayGmCommandHelper: WorldGatewayGmCommandHelper;
  gatewayGmSuggestionHelper: WorldGatewayGmSuggestionHelper;
  gatewaySuggestionHelper: WorldGatewaySuggestionHelper;
  gatewayMovementHelper: WorldGatewayMovementHelper;
  gatewayInventoryHelper: WorldGatewayInventoryHelper;
  gatewayMailHelper: WorldGatewayMailHelper;
  gatewayPlayerControlsHelper: WorldGatewayPlayerControlsHelper;
  gatewayNpcHelper: WorldGatewayNpcHelper;
  gatewayCraftHelper: WorldGatewayCraftHelper;
  gatewayMarketHelper: WorldGatewayMarketHelper;
  gatewayReadModelHelper: WorldGatewayReadModelHelper;
  gatewayActionHelper: WorldGatewayActionHelper;
  gatewayBuildingHelper: WorldGatewayBuildingHelper;
  gatewayClientEmitHelper: WorldGatewayClientEmitHelper;
  gatewayGuardHelper: WorldGatewayGuardHelper;
  gatewaySessionStateHelper: WorldGatewaySessionStateHelper;
  gatewayPresenceHelper: WorldGatewayPresenceHelper;
}
