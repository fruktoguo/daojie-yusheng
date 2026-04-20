// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};

var WorldGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGateway = void 0;

const websockets_1 = require("@nestjs/websockets");

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const socket_io_1 = require("socket.io");

const server_cors_1 = require("../config/server-cors");

const health_readiness_service_1 = require("../health/health-readiness.service");

const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");

const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");

const market_runtime_service_1 = require("../runtime/market/market-runtime.service");

const craft_panel_runtime_service_1 = require("../runtime/craft/craft-panel-runtime.service");

const leaderboard_runtime_service_1 = require("../runtime/player/leaderboard-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const world_client_event_service_1 = require("./world-client-event.service");

const world_gm_socket_service_1 = require("./world-gm-socket.service");

const world_protocol_projection_service_1 = require("./world-protocol-projection.service");

const world_session_bootstrap_service_1 = require("./world-session-bootstrap.service");

const world_session_service_1 = require("./world-session.service");

const world_gateway_bootstrap_helper_1 = require("./world-gateway-bootstrap.helper");

const world_gateway_gm_command_helper_1 = require("./world-gateway-gm-command.helper");

const world_gateway_gm_suggestion_helper_1 = require("./world-gateway-gm-suggestion.helper");

const world_gateway_suggestion_helper_1 = require("./world-gateway-suggestion.helper");

const world_gateway_movement_helper_1 = require("./world-gateway-movement.helper");

const world_gateway_inventory_helper_1 = require("./world-gateway-inventory.helper");

const world_gateway_mail_helper_1 = require("./world-gateway-mail.helper");

const world_gateway_player_controls_helper_1 = require("./world-gateway-player-controls.helper");

const world_gateway_action_helper_1 = require("./world-gateway-action.helper");

const world_gateway_npc_helper_1 = require("./world-gateway-npc.helper");

const world_gateway_craft_helper_1 = require("./world-gateway-craft.helper");

const world_gateway_market_helper_1 = require("./world-gateway-market.helper");

const world_gateway_read_model_helper_1 = require("./world-gateway-read-model.helper");
const world_gateway_client_emit_helper_1 = require("./world-gateway-client-emit.helper");
const world_gateway_guard_helper_1 = require("./world-gateway-guard.helper");
const world_gateway_session_state_helper_1 = require("./world-gateway-session-state.helper");

/** 鉴权后请求 sessionId 只允许从 next/token 两类来源带入。 */
const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
const GUEST_HELLO_IDENTITY_OVERRIDE_KEYS = Object.freeze([
    'playerId',
    'requestedPlayerId',
]);
const AUTHENTICATED_CONNECT_CONTRACT = Object.freeze({
    protocolRequiredCode: 'AUTH_PROTOCOL_REQUIRED',
    unsupportedProtocolCode: 'AUTH_PROTOCOL_UNSUPPORTED',
    invalidSessionIdCode: 'AUTH_SESSION_ID_INVALID',
    authFailCode: 'AUTH_FAIL',
    legacyProtocolDisabledCode: 'LEGACY_PROTOCOL_DISABLED',
});
const GM_CONNECT_CONTRACT = Object.freeze({
    authFailCode: 'GM_AUTH_FAIL',
    playerAuthRequiredCode: 'GM_PLAYER_AUTH_REQUIRED',
    sessionIdForbiddenCode: 'GM_SESSION_ID_FORBIDDEN',
});
const GUEST_HELLO_CONTRACT = Object.freeze({
    protocolMismatchCode: 'HELLO_PROTOCOL_MISMATCH',
    unsupportedProtocolCode: 'HELLO_PROTOCOL_UNSUPPORTED',
    authBootstrapForbiddenCode: 'HELLO_AUTH_BOOTSTRAP_FORBIDDEN',
    sessionIdInvalidCode: 'HELLO_SESSION_ID_INVALID',
    identityOverrideForbiddenCode: 'HELLO_IDENTITY_OVERRIDE_FORBIDDEN',
    helloFailedCode: 'HELLO_FAILED',
});

/** 世界 Socket 入口：负责鉴权、会话引导、GM 操作和 gameplay 命令分发。 */
let WorldGateway = WorldGateway_1 = class WorldGateway {
    /** GM Socket 入口。 */
    worldGmSocketService;
    /** 协议投影服务。 */
    worldProtocolProjectionService;
    /** 会话引导服务。 */
    sessionBootstrapService;
    /** readiness 检查服务。 */
    healthReadinessService;
    /** 玩家刷盘服务。 */
    playerPersistenceFlushService;
    /** 玩家 runtime。 */
    playerRuntimeService;
    /** 邮件 runtime。 */
    mailRuntimeService;
    /** 坊市 runtime。 */
    marketRuntimeService;
    /** 采集/锻造面板 runtime。 */
    craftPanelRuntimeService;
    /** 建议 runtime。 */
    suggestionRuntimeService;
    /** 排行榜 runtime。 */
    leaderboardRuntimeService;
    /** 世界 runtime。 */
    worldRuntimeService;
    /** 客户端事件服务。 */
    worldClientEventService;
    /** 会话管理入口。 */
    worldSessionService;
    /** 连接/hello 引导 helper。 */
    gatewayBootstrapHelper;
    /** GM command helper。 */
    gatewayGmCommandHelper;    
    /**
 * gatewayGmSuggestionHelper：gatewayGMSuggestion辅助函数引用。
 */

    gatewayGmSuggestionHelper;    
    /**
 * gatewaySuggestionHelper：gatewaySuggestion辅助函数引用。
 */

    gatewaySuggestionHelper;    
    /**
 * gatewayMovementHelper：gatewayMovement辅助函数引用。
 */

    gatewayMovementHelper;    
    /**
 * gatewayInventoryHelper：gateway背包辅助函数引用。
 */

    gatewayInventoryHelper;    
    /**
 * gatewayMailHelper：gateway邮件辅助函数引用。
 */

    gatewayMailHelper;    
    /**
 * gatewayPlayerControlsHelper：gateway玩家Control辅助函数引用。
 */

    gatewayPlayerControlsHelper;    
    /**
 * gatewayNpcHelper：gatewayNPC辅助函数引用。
 */

    gatewayNpcHelper;    
    /**
 * gatewayCraftHelper：gateway炼制辅助函数引用。
 */

    gatewayCraftHelper;    
    /**
 * gatewayMarketHelper：gateway坊市辅助函数引用。
 */

    gatewayMarketHelper;    
    /**
 * gatewayReadModelHelper：gatewayReadModel辅助函数引用。
 */

    gatewayReadModelHelper;    
    /**
 * gatewayActionHelper：gatewayAction辅助函数引用。
 */

    gatewayActionHelper;    
    /**
 * gatewayClientEmitHelper：gatewayClientEmit辅助函数引用。
 */

    gatewayClientEmitHelper;    
    /**
 * gatewayGuardHelper：gatewayGuard辅助函数引用。
 */

    gatewayGuardHelper;    
    /**
 * gatewaySessionStateHelper：gatewaySession状态辅助函数引用。
 */

    gatewaySessionStateHelper;
    /** Socket.IO server 实例。 */
    server;
    /** 入口日志。 */
    logger = new common_1.Logger(WorldGateway_1.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldGmSocketService 参数说明。
 * @param worldProtocolProjectionService 参数说明。
 * @param sessionBootstrapService 参数说明。
 * @param healthReadinessService 参数说明。
 * @param playerPersistenceFlushService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param mailRuntimeService 参数说明。
 * @param marketRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param suggestionRuntimeService 参数说明。
 * @param leaderboardRuntimeService 参数说明。
 * @param worldRuntimeService 参数说明。
 * @param worldClientEventService 参数说明。
 * @param worldSessionService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldGmSocketService, worldProtocolProjectionService, sessionBootstrapService, healthReadinessService, playerPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, craftPanelRuntimeService, suggestionRuntimeService, leaderboardRuntimeService, worldRuntimeService, worldClientEventService, worldSessionService) {
        this.worldGmSocketService = worldGmSocketService;
        this.worldProtocolProjectionService = worldProtocolProjectionService;
        this.sessionBootstrapService = sessionBootstrapService;
        this.healthReadinessService = healthReadinessService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.leaderboardRuntimeService = leaderboardRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldClientEventService = worldClientEventService;
        this.worldSessionService = worldSessionService;
        this.gatewayBootstrapHelper = new world_gateway_bootstrap_helper_1.WorldGatewayBootstrapHelper(this);
        this.gatewayGmCommandHelper = new world_gateway_gm_command_helper_1.WorldGatewayGmCommandHelper(this);
        this.gatewayGmSuggestionHelper = new world_gateway_gm_suggestion_helper_1.WorldGatewayGmSuggestionHelper(this);
        this.gatewaySuggestionHelper = new world_gateway_suggestion_helper_1.WorldGatewaySuggestionHelper(this);
        this.gatewayMovementHelper = new world_gateway_movement_helper_1.WorldGatewayMovementHelper(this);
        this.gatewayInventoryHelper = new world_gateway_inventory_helper_1.WorldGatewayInventoryHelper(this);
        this.gatewayMailHelper = new world_gateway_mail_helper_1.WorldGatewayMailHelper(this);
        this.gatewayPlayerControlsHelper = new world_gateway_player_controls_helper_1.WorldGatewayPlayerControlsHelper(this);
        this.gatewayNpcHelper = new world_gateway_npc_helper_1.WorldGatewayNpcHelper(this);
        this.gatewayCraftHelper = new world_gateway_craft_helper_1.WorldGatewayCraftHelper(this);
        this.gatewayMarketHelper = new world_gateway_market_helper_1.WorldGatewayMarketHelper(this);
        this.gatewayReadModelHelper = new world_gateway_read_model_helper_1.WorldGatewayReadModelHelper(this);
        this.gatewayActionHelper = new world_gateway_action_helper_1.WorldGatewayActionHelper(this);
        this.gatewayClientEmitHelper = new world_gateway_client_emit_helper_1.WorldGatewayClientEmitHelper(this);
        this.gatewayGuardHelper = new world_gateway_guard_helper_1.WorldGatewayGuardHelper(this);
        this.gatewaySessionStateHelper = new world_gateway_session_state_helper_1.WorldGatewaySessionStateHelper(this);
    }
    /** 处理 socket 连接：校验协议、阻断未就绪流量并触发鉴权引导。 */
    async handleConnection(client) {
        return this.gatewayBootstrapHelper.handleConnection(client);
    }
    /** 处理 socket 断开：解绑会话、清理订阅并刷盘离线玩家。 */
    async handleDisconnect(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        this.gatewaySessionStateHelper.clearDisconnectedPlayerState(binding);
        if (binding.connected) {
            return;
        }
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`刷新脱机玩家失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket 已脱离：${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
    /** 处理 hello：确认协议上下文后进入游客或鉴权 bootstrap。 */
    async handleHello(client, payload) {
        return this.gatewayBootstrapHelper.handleHello(client, payload);
    }    
    /**
 * handleNextHeartbeat：处理NextHeartbeat并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextHeartbeat相关状态。
 */

    handleNextHeartbeat(client, _payload) {
        if (!this.gatewayGuardHelper.requirePlayerId(client)) {
            return;
        }
    }    
    /**
 * handleNextGmGetState：读取NextGMGet状态并返回结果。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextGMGet状态相关状态。
 */

    handleNextGmGetState(client, _payload) {
        return this.gatewayGmCommandHelper.handleGmGetState(client, _payload);
    }    
    /**
 * handleNextGmSpawnBots：处理NextGMSpawnBot并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMSpawnBot相关状态。
 */

    handleNextGmSpawnBots(client, payload) {
        return this.gatewayGmCommandHelper.handleGmSpawnBots(client, payload);
    }    
    /**
 * handleNextGmRemoveBots：处理NextGMRemoveBot并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMRemoveBot相关状态。
 */

    handleNextGmRemoveBots(client, payload) {
        return this.gatewayGmCommandHelper.handleGmRemoveBots(client, payload);
    }    
    /**
 * handleNextGmUpdatePlayer：处理NextGMUpdate玩家并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMUpdate玩家相关状态。
 */

    handleNextGmUpdatePlayer(client, payload) {
        return this.gatewayGmCommandHelper.handleGmUpdatePlayer(client, payload);
    }    
    /**
 * handleNextGmResetPlayer：处理NextGMReset玩家并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMReset玩家相关状态。
 */

    handleNextGmResetPlayer(client, payload) {
        return this.gatewayGmCommandHelper.handleGmResetPlayer(client, payload);
    }    
    /**
 * handleNextMoveTo：处理NextMoveTo并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextMoveTo相关状态。
 */

    handleNextMoveTo(client, payload) {
        return this.gatewayMovementHelper.handleNextMoveTo(client, payload);
    }    
    /**
 * handleNextNavigateQuest：处理NextNavigate任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextNavigate任务相关状态。
 */

    handleNextNavigateQuest(client, payload) {
        return this.gatewayMovementHelper.handleNextNavigateQuest(client, payload);
    }    
    /**
 * handleMove：处理Move并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Move相关状态。
 */

    handleMove(client, payload) {
        return this.gatewayMovementHelper.handleMove(client, payload);
    }    
    /**
 * handleNextDestroyItem：处理NextDestroy道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDestroy道具相关状态。
 */

    handleNextDestroyItem(client, payload) {
        return this.gatewayInventoryHelper.handleNextDestroyItem(client, payload);
    }    
    /**
 * handleNextSortInventory：处理NextSort背包并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextSort背包相关状态。
 */

    handleNextSortInventory(client, _payload) {
        return this.gatewayInventoryHelper.handleNextSortInventory(client, _payload);
    }    
    /**
 * handleNextChat：处理NextChat并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextChat相关状态。
 */

    handleNextChat(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextChat(client, payload);
    }    
    /**
 * handleNextAckSystemMessages：处理NextAckSystemMessage并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextAckSystemMessage相关状态。
 */

    handleNextAckSystemMessages(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextAckSystemMessages(client, payload);
    }    
    /**
 * handleNextDebugResetSpawn：处理NextDebugResetSpawn并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextDebugResetSpawn相关状态。
 */

    handleNextDebugResetSpawn(client, _payload) {
        return this.gatewayPlayerControlsHelper.handleNextDebugResetSpawn(client, _payload);
    }    
    /**
 * handleNextUpdateAutoBattleSkills：处理NextUpdateAutoBattle技能并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoBattle技能相关状态。
 */

    handleNextUpdateAutoBattleSkills(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextUpdateAutoBattleSkills(client, payload);
    }    
    /**
 * handleNextUpdateAutoUsePills：处理NextUpdateAutoUsePill并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoUsePill相关状态。
 */

    handleNextUpdateAutoUsePills(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextUpdateAutoUsePills(client, payload);
    }    
    /**
 * handleNextUpdateCombatTargetingRules：读取NextUpdate战斗TargetingRule并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdate战斗TargetingRule相关状态。
 */

    handleNextUpdateCombatTargetingRules(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextUpdateCombatTargetingRules(client, payload);
    }    
    /**
 * handleNextUpdateAutoBattleTargetingMode：读取NextUpdateAutoBattleTargetingMode并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoBattleTargetingMode相关状态。
 */

    handleNextUpdateAutoBattleTargetingMode(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextUpdateAutoBattleTargetingMode(client, payload);
    }    
    /**
 * handleNextUpdateTechniqueSkillAvailability：处理NextUpdate功法技能Availability并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdate功法技能Availability相关状态。
 */

    handleNextUpdateTechniqueSkillAvailability(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextUpdateTechniqueSkillAvailability(client, payload);
    }    
    /**
 * handleNextHeavenGateAction：处理NextHeavenGateAction并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextHeavenGateAction相关状态。
 */

    handleNextHeavenGateAction(client, payload) {
        return this.gatewayPlayerControlsHelper.handleNextHeavenGateAction(client, payload);
    }    
    /**
 * handleUseAction：处理UseAction并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新UseAction相关状态。
 */

    handleUseAction(client, payload) {
        return this.gatewayActionHelper.handleUseAction(client, payload);
    }    
    /**
 * handleRequestQuests：处理Request任务并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新Request任务相关状态。
 */

    handleRequestQuests(client, _payload) {
        return this.gatewayPlayerControlsHelper.handleRequestQuests(client, _payload);
    }    
    /**
 * handleNextRequestMailSummary：处理NextRequest邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest邮件摘要相关状态。
 */

    async handleNextRequestMailSummary(client, payload) {
        return this.gatewayMailHelper.handleNextRequestMailSummary(client, payload);
    }    
    /**
 * handleNextRequestSuggestions：处理NextRequestSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestSuggestion相关状态。
 */

    handleNextRequestSuggestions(client, payload) {
        return this.gatewaySuggestionHelper.handleNextRequestSuggestions(client, payload);
    }    
    /**
 * handleNextRequestMailPage：处理NextRequest邮件Page并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest邮件Page相关状态。
 */

    async handleNextRequestMailPage(client, payload) {
        return this.gatewayMailHelper.handleNextRequestMailPage(client, payload);
    }    
    /**
 * handleNextRequestMailDetail：处理NextRequest邮件详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest邮件详情相关状态。
 */

    async handleNextRequestMailDetail(client, payload) {
        return this.gatewayMailHelper.handleNextRequestMailDetail(client, payload);
    }    
    /**
 * handleNextRedeemCodes：处理NextRedeemCode并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRedeemCode相关状态。
 */

    handleNextRedeemCodes(client, payload) {
        return this.gatewayActionHelper.handleNextRedeemCodes(client, payload);
    }    
    /**
 * handleNextRequestMarket：处理NextRequest坊市并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市相关状态。
 */

    handleNextRequestMarket(client, payload) {
        return this.gatewayMarketHelper.handleNextRequestMarket(client, payload);
    }    
    /**
 * handleNextRequestMarketListings：读取NextRequest坊市Listing并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市Listing相关状态。
 */

    handleNextRequestMarketListings(client, payload) {
        return this.gatewayMarketHelper.handleNextRequestMarketListings(client, payload);
    }    
    /**
 * handleNextMarkMailRead：读取NextMark邮件Read并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextMark邮件Read相关状态。
 */

    async handleNextMarkMailRead(client, payload) {
        return this.gatewayMailHelper.handleNextMarkMailRead(client, payload);
    }    
    /**
 * handleNextCreateSuggestion：构建NextCreateSuggestion。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreateSuggestion相关状态。
 */

    async handleNextCreateSuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleNextCreateSuggestion(client, payload);
    }    
    /**
 * handleNextVoteSuggestion：处理NextVoteSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextVoteSuggestion相关状态。
 */

    async handleNextVoteSuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleNextVoteSuggestion(client, payload);
    }    
    /**
 * handleNextReplySuggestion：处理NextReplySuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextReplySuggestion相关状态。
 */

    async handleNextReplySuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleNextReplySuggestion(client, payload);
    }    
    /**
 * handleNextMarkSuggestionRepliesRead：读取NextMarkSuggestionReplyRead并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextMarkSuggestionReplyRead相关状态。
 */

    async handleNextMarkSuggestionRepliesRead(client, payload) {
        await this.gatewaySuggestionHelper.handleNextMarkSuggestionRepliesRead(client, payload);
    }    
    /**
 * handleNextGmMarkSuggestionCompleted：处理NextGMMarkSuggestionCompleted并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMMarkSuggestionCompleted相关状态。
 */

    async handleNextGmMarkSuggestionCompleted(client, payload) {
        await this.gatewayGmSuggestionHelper.handleGmMarkSuggestionCompleted(client, payload);
    }    
    /**
 * handleNextGmRemoveSuggestion：处理NextGMRemoveSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextGMRemoveSuggestion相关状态。
 */

    async handleNextGmRemoveSuggestion(client, payload) {
        await this.gatewayGmSuggestionHelper.handleGmRemoveSuggestion(client, payload);
    }    
    /**
 * handleNextClaimMailAttachments：处理NextClaim邮件Attachment并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextClaim邮件Attachment相关状态。
 */

    async handleNextClaimMailAttachments(client, payload) {
        return this.gatewayMailHelper.handleNextClaimMailAttachments(client, payload);
    }    
    /**
 * handleNextDeleteMail：处理NextDelete邮件并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDelete邮件相关状态。
 */

    async handleNextDeleteMail(client, payload) {
        return this.gatewayMailHelper.handleNextDeleteMail(client, payload);
    }    
    /**
 * handleNextRequestMarketItemBook：处理NextRequest坊市道具Book并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市道具Book相关状态。
 */

    handleNextRequestMarketItemBook(client, payload) {
        return this.gatewayMarketHelper.handleNextRequestMarketItemBook(client, payload);
    }    
    /**
 * handleNextRequestMarketTradeHistory：判断NextRequest坊市Trade历史是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市TradeHistory相关状态。
 */

    handleNextRequestMarketTradeHistory(client, payload) {
        return this.gatewayMarketHelper.handleNextRequestMarketTradeHistory(client, payload);
    }    
    /**
 * handleNextRequestAttrDetail：处理NextRequestAttr详情并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequestAttr详情相关状态。
 */

    handleNextRequestAttrDetail(client, _payload) {
        return this.gatewayReadModelHelper.handleNextRequestAttrDetail(client, _payload);
    }    
    /**
 * handleNextRequestAlchemyPanel：处理NextRequest炼丹面板并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest炼丹面板相关状态。
 */

    handleNextRequestAlchemyPanel(client, payload) {
        return this.gatewayCraftHelper.handleNextRequestAlchemyPanel(client, payload);
    }    
    /**
 * handleNextRequestEnhancementPanel：处理NextRequest强化面板并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest强化面板相关状态。
 */

    handleNextRequestEnhancementPanel(client, _payload) {
        return this.gatewayCraftHelper.handleNextRequestEnhancementPanel(client, _payload);
    }    
    /**
 * handleNextStartAlchemy：处理Next开始炼丹并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextStart炼丹相关状态。
 */

    handleNextStartAlchemy(client, payload) {
        return this.gatewayCraftHelper.handleNextStartAlchemy(client, payload);
    }    
    /**
 * handleNextCancelAlchemy：判断NextCancel炼丹是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel炼丹相关状态。
 */

    handleNextCancelAlchemy(client, _payload) {
        return this.gatewayCraftHelper.handleNextCancelAlchemy(client, _payload);
    }    
    /**
 * handleNextSaveAlchemyPreset：处理NextSave炼丹Preset并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextSave炼丹Preset相关状态。
 */

    handleNextSaveAlchemyPreset(client, payload) {
        return this.gatewayCraftHelper.handleNextSaveAlchemyPreset(client, payload);
    }    
    /**
 * handleNextDeleteAlchemyPreset：处理NextDelete炼丹Preset并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDelete炼丹Preset相关状态。
 */

    handleNextDeleteAlchemyPreset(client, payload) {
        return this.gatewayCraftHelper.handleNextDeleteAlchemyPreset(client, payload);
    }    
    /**
 * handleNextStartEnhancement：处理Next开始强化并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextStart强化相关状态。
 */

    handleNextStartEnhancement(client, payload) {
        return this.gatewayCraftHelper.handleNextStartEnhancement(client, payload);
    }    
    /**
 * handleNextCancelEnhancement：判断NextCancel强化是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel强化相关状态。
 */

    handleNextCancelEnhancement(client, _payload) {
        return this.gatewayCraftHelper.handleNextCancelEnhancement(client, _payload);
    }    
    /**
 * handleNextRequestLeaderboard：处理NextRequestLeaderboard并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestLeaderboard相关状态。
 */

    handleNextRequestLeaderboard(client, payload) {
        return this.gatewayReadModelHelper.handleNextRequestLeaderboard(client, payload);
    }    
    /**
 * handleNextRequestWorldSummary：处理NextRequest世界摘要并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest世界摘要相关状态。
 */

    handleNextRequestWorldSummary(client, _payload) {
        return this.gatewayReadModelHelper.handleNextRequestWorldSummary(client, _payload);
    }    
    /**
 * handleRequestDetail：处理Request详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Request详情相关状态。
 */

    handleRequestDetail(client, payload) {
        return this.gatewayReadModelHelper.handleRequestDetail(client, payload);
    }    
    /**
 * handleRequestTileDetail：处理RequestTile详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestTile详情相关状态。
 */

    handleRequestTileDetail(client, payload) {
        return this.gatewayReadModelHelper.handleRequestTileDetail(client, payload);
    }    
    /**
 * handleUsePortal：处理Use传送门并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新UsePortal相关状态。
 */

    handleUsePortal(client) {
        return this.gatewayActionHelper.handleUsePortal(client);
    }    
    /**
 * handleNextUseItem：处理NextUse道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUse道具相关状态。
 */

    handleNextUseItem(client, payload) {
        return this.gatewayInventoryHelper.handleNextUseItem(client, payload);
    }    
    /**
 * handleNextDropItem：处理NextDrop道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDrop道具相关状态。
 */

    handleNextDropItem(client, payload) {
        return this.gatewayInventoryHelper.handleNextDropItem(client, payload);
    }    
    /**
 * handleTakeGround：处理Take地面并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    handleTakeGround(client, payload) {
        return this.gatewayInventoryHelper.handleTakeGround(client, payload);
    }    
    /**
 * handleNextEquip：处理NextEquip并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextEquip相关状态。
 */

    handleNextEquip(client, payload) {
        return this.gatewayInventoryHelper.handleNextEquip(client, payload);
    }    
    /**
 * handleNextUnequip：处理NextUnequip并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUnequip相关状态。
 */

    handleNextUnequip(client, payload) {
        return this.gatewayInventoryHelper.handleNextUnequip(client, payload);
    }    
    /**
 * handleNextCultivate：处理NextCultivate并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCultivate相关状态。
 */

    handleNextCultivate(client, payload) {
        return this.gatewayActionHelper.handleNextCultivate(client, payload);
    }    
    /**
 * handleCastSkill：处理Cast技能并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

    handleCastSkill(client, payload) {
        return this.gatewayActionHelper.handleCastSkill(client, payload);
    }    
    /**
 * handleNextRequestNpcShop：处理NextRequestNPCShop并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestNPCShop相关状态。
 */

    handleNextRequestNpcShop(client, payload) {
        return this.gatewayNpcHelper.handleNextRequestNpcShop(client, payload);
    }    
    /**
 * handleNextCreateMarketSellOrder：构建NextCreate坊市Sell订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreate坊市Sell订单相关状态。
 */

    async handleNextCreateMarketSellOrder(client, payload) {
        return this.gatewayMarketHelper.handleNextCreateMarketSellOrder(client, payload);
    }    
    /**
 * handleNextCreateMarketBuyOrder：构建NextCreate坊市Buy订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreate坊市Buy订单相关状态。
 */

    async handleNextCreateMarketBuyOrder(client, payload) {
        return this.gatewayMarketHelper.handleNextCreateMarketBuyOrder(client, payload);
    }    
    /**
 * handleNextBuyMarketItem：处理NextBuy坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextBuy坊市道具相关状态。
 */

    async handleNextBuyMarketItem(client, payload) {
        return this.gatewayMarketHelper.handleNextBuyMarketItem(client, payload);
    }    
    /**
 * handleNextSellMarketItem：处理NextSell坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextSell坊市道具相关状态。
 */

    async handleNextSellMarketItem(client, payload) {
        return this.gatewayMarketHelper.handleNextSellMarketItem(client, payload);
    }    
    /**
 * handleNextCancelMarketOrder：判断NextCancel坊市订单是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCancel坊市订单相关状态。
 */

    async handleNextCancelMarketOrder(client, payload) {
        return this.gatewayMarketHelper.handleNextCancelMarketOrder(client, payload);
    }    
    /**
 * handleNextClaimMarketStorage：处理NextClaim坊市Storage并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextClaim坊市Storage相关状态。
 */

    async handleNextClaimMarketStorage(client, payload) {
        return this.gatewayMarketHelper.handleNextClaimMarketStorage(client, payload);
    }    
    /**
 * handleRequestNpcQuests：处理RequestNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestNPC任务相关状态。
 */

    handleRequestNpcQuests(client, payload) {
        return this.gatewayNpcHelper.handleRequestNpcQuests(client, payload);
    }    
    /**
 * handleAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    handleAcceptNpcQuest(client, payload) {
        return this.gatewayNpcHelper.handleAcceptNpcQuest(client, payload);
    }    
    /**
 * handleSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    handleSubmitNpcQuest(client, payload) {
        return this.gatewayNpcHelper.handleSubmitNpcQuest(client, payload);
    }    
    /**
 * handleNextBuyNpcShopItem：处理NextBuyNPCShop道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextBuyNPCShop道具相关状态。
 */

    handleNextBuyNpcShopItem(client, payload) {
        return this.gatewayNpcHelper.handleNextBuyNpcShopItem(client, payload);
    }    
    /**
 * handlePing：处理Ping并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Ping相关状态。
 */

    handlePing(client, payload) {
        this.worldClientEventService.emitPong(client, payload);
    }
};
exports.WorldGateway = WorldGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WorldGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Hello),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleHello", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextSortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoUsePills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoUsePills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateCombatTargetingRules),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateCombatTargetingRules", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleTargetingMode),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleTargetingMode", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateTechniqueSkillAvailability),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateTechniqueSkillAvailability", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketListings),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketListings", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestAttrDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestAttrDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestAlchemyPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestAlchemyPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestEnhancementPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestEnhancementPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.StartAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextStartAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCancelAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SaveAlchemyPreset),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextSaveAlchemyPreset", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DeleteAlchemyPreset),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDeleteAlchemyPreset", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.StartEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextStartEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCancelEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestLeaderboard),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestLeaderboard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestWorldSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestWorldSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestTileDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestTileDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UsePortal),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUsePortal", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUseItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.TakeGround),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleTakeGround", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CastSkill),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCastSkill", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AcceptNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleAcceptNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SubmitNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSubmitNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyNpcShopItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextBuyNpcShopItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handlePing", null);
exports.WorldGateway = WorldGateway = WorldGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: (0, server_cors_1.resolveServerNextCorsOptions)(),
        path: '/socket.io',
    }),
    __metadata("design:paramtypes", [world_gm_socket_service_1.WorldGmSocketService,
        world_protocol_projection_service_1.WorldProtocolProjectionService,
        world_session_bootstrap_service_1.WorldSessionBootstrapService,
        health_readiness_service_1.HealthReadinessService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        leaderboard_runtime_service_1.LeaderboardRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_client_event_service_1.WorldClientEventService,
        world_session_service_1.WorldSessionService])
], WorldGateway);
/**
 * buildAttrDetailBonuses：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Attr详情Bonuse相关状态。
 */

function buildAttrDetailBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const bonuses = [];

    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;

    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {

        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([toTechniqueState(technique)]);
        if (!hasNonZeroAttributes(techniqueAttrs)) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {

        const item = entry.item;
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(resolveItemNumericStats(item)))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(resolveItemNumericStats(item)),
        });
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
        });
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !Array.isArray(bonus.qiProjection)
            && !isPlainObject(bonus.meta)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}
/**
 * buildAttrDetailNumericStatBreakdowns：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Attr详情NumericStatBreakdown相关状态。
 */

function buildAttrDetailNumericStatBreakdowns(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const stage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;

    const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];

    const realmBaseStats = template?.stats ? (0, shared_1.cloneNumericStats)(template.stats) : (0, shared_1.createNumericStats)();

    const baseStats = (0, shared_1.cloneNumericStats)(realmBaseStats);

    const flatBuffStats = (0, shared_1.createNumericStats)();

    const attrMultipliers = (0, shared_1.createNumericStats)();

    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    if (finalAttrs) {
        for (const key of shared_1.ATTR_KEYS) {

            const value = Number(finalAttrs[key] ?? 0);
            if (value === 0) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(baseStats, scalePartialNumericStats(shared_1.ATTR_TO_NUMERIC_WEIGHTS[key], value));
            (0, shared_1.addPartialNumericStats)(attrMultipliers, scalePartialNumericStats(shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    for (const entry of player.equipment?.slots ?? []) {

        const item = entry.item;
        if (!item) {
            continue;
        }
        (0, shared_1.addPartialNumericStats)(baseStats, resolveItemNumericStats(item));
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            (0, shared_1.addPartialNumericStats)(baseStats, bonus.stats);
        }
    }

    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        (0, shared_1.addPartialNumericStats)(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (buff?.stats) {
            (0, shared_1.addPartialNumericStats)(flatBuffStats, buff.stats);
        }
    }

    const preMultiplierStats = (0, shared_1.cloneNumericStats)(baseStats);
    (0, shared_1.addPartialNumericStats)(preMultiplierStats, flatBuffStats);

    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;

    const breakdowns = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {

        const realmBaseValue = getNumericStatValue(realmBaseStats, key);

        const baseValue = getNumericStatValue(baseStats, key);

        const flatBuffValue = getNumericStatValue(flatBuffStats, key);
        breakdowns[key] = {
            realmBaseValue,
            bonusBaseValue: baseValue - realmBaseValue,
            baseValue,
            flatBuffValue,
            preMultiplierValue: getNumericStatValue(preMultiplierStats, key),
            attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
            realmMultiplier: 1,
            buffMultiplierPct: 0,
            pillMultiplierPct: 0,
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}
/**
 * getNumericStatValue：读取NumericStat值。
 * @param stats 参数说明。
 * @param key 参数说明。
 * @returns 无返回值，完成NumericStat值的读取/组装。
 */

function getNumericStatValue(stats, key) {

    const value = stats?.[key];
    return typeof value === 'number' ? value : 0;
}
/**
 * scalePartialNumericStats：执行scalePartialNumericStat相关逻辑。
 * @param stats 参数说明。
 * @param factor 参数说明。
 * @returns 无返回值，直接更新scalePartialNumericStat相关状态。
 */

function scalePartialNumericStats(stats, factor) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats || factor === 0) {
        return undefined;
    }

    const result = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {

        const value = stats[key];
        if (value !== undefined) {
            result[key] = value * factor;
        }
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {

        const group = stats[groupKey];
        if (!isPlainObject(group)) {
            continue;
        }

        const scaledGroup = {};
        for (const key of shared_1.ELEMENT_KEYS) {

            const value = group[key];
            if (value !== undefined) {
                scaledGroup[key] = value * factor;
            }
        }
        if (Object.keys(scaledGroup).length > 0) {
            result[groupKey] = scaledGroup;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
/**
 * collectProjectedRuntimeBonuses：执行Projected运行态Bonuse相关逻辑。
 * @param runtimeBonuses 参数说明。
 * @returns 无返回值，直接更新Projected运行态Bonuse相关状态。
 */

function collectProjectedRuntimeBonuses(runtimeBonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(runtimeBonuses) || runtimeBonuses.length === 0) {
        return [];
    }
    return runtimeBonuses.filter((entry) => {

        const source = typeof entry?.source === 'string' ? entry.source : '';
        return Boolean(source && !isDerivedRuntimeBonusSource(source) && (entry.attrs || entry.stats));
    });
}
/**
 * resolveVitalBaselineBonus：规范化或转换VitalBaselineBonu。
 * @param runtimeBonuses 参数说明。
 * @returns 无返回值，直接更新VitalBaselineBonu相关状态。
 */

function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
/**
 * isDerivedRuntimeBonusSource：判断Derived运行态Bonu来源是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，完成Derived运行态Bonu来源的条件判断。
 */

function isDerivedRuntimeBonusSource(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof source !== 'string' || source.length === 0) {
        return true;
    }
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
/**
 * resolveItemNumericStats：规范化或转换道具NumericStat。
 * @param item 道具。
 * @returns 无返回值，直接更新道具NumericStat相关状态。
 */

function resolveItemNumericStats(item) {
    return item?.equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(item.equipValueStats) : item?.equipStats;
}
/**
 * hasNonZeroAttributes：判断NonZeroAttribute是否满足条件。
 * @param attrs 参数说明。
 * @returns 无返回值，完成NonZeroAttribute的条件判断。
 */

function hasNonZeroAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
/**
 * hasNonZeroPartialNumericStats：判断NonZeroPartialNumericStat是否满足条件。
 * @param stats 参数说明。
 * @returns 无返回值，完成NonZeroPartialNumericStat的条件判断。
 */

function hasNonZeroPartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return false;
    }
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (Number(stats[key] ?? 0) !== 0) {
            return true;
        }
    }
    return ['elementDamageBonus', 'elementDamageReduce'].some((groupKey) => {

        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
}
/**
 * clonePartialAttributes：构建PartialAttribute。
 * @param attrs 参数说明。
 * @returns 无返回值，直接更新PartialAttribute相关状态。
 */

function clonePartialAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = {};
    for (const key of shared_1.ATTR_KEYS) {

        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
/**
 * clonePartialNumericStats：构建PartialNumericStat。
 * @param stats 参数说明。
 * @returns 无返回值，直接更新PartialNumericStat相关状态。
 */

function clonePartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return undefined;
    }

    const clone = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (stats[key] !== undefined) {
            clone[key] = stats[key];
        }
    }
    if (isPlainObject(stats.elementDamageBonus)) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (isPlainObject(stats.elementDamageReduce)) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/**
 * cloneQiProjectionModifiers：构建QiProjectionModifier。
 * @param source 来源对象。
 * @returns 无返回值，直接更新QiProjectionModifier相关状态。
 */

function cloneQiProjectionModifiers(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    return source.map((entry) => ({
        ...entry,
        selector: entry.selector
            ? {
                ...entry.selector,
                resourceKeys: entry.selector.resourceKeys ? entry.selector.resourceKeys.slice() : undefined,
                families: entry.selector.families ? entry.selector.families.slice() : undefined,
                forms: entry.selector.forms ? entry.selector.forms.slice() : undefined,
                elements: entry.selector.elements ? entry.selector.elements.slice() : undefined,
            }
            : undefined,
    }));
}
/**
 * toTechniqueState：执行to功法状态相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新to功法状态相关状态。
 */

function toTechniqueState(entry) {

    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
/**
 * cloneTechniqueSkill：构建功法技能。
 * @param source 来源对象。
 * @returns 无返回值，直接更新功法技能相关状态。
 */

function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
/**
 * isPlainObject：判断PlainObject是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成PlainObject的条件判断。
 */

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export { WorldGateway };
