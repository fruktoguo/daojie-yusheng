"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacySessionBootstrapService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../../persistence/player-persistence.service");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../../runtime/mail/mail-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("../../network/world-session.service");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("../../network/world-sync.service");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("../../network/world-client-event.service");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("./legacy-auth.service");
/** runtime_gm_auth_service_1：定义该变量以承载业务值。 */
const runtime_gm_auth_service_1 = require("../../runtime/gm/runtime-gm-auth.service");
/** LegacySessionBootstrapService：定义该变量以承载业务值。 */
let LegacySessionBootstrapService = class LegacySessionBootstrapService {
    legacyAuthService;
    runtimeGmAuthService;
    playerPersistenceService;
    playerRuntimeService;
    mailRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldSessionService;
    worldSyncService;
    worldClientEventService;
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService, runtimeGmAuthService, playerPersistenceService, playerRuntimeService, mailRuntimeService, suggestionRuntimeService, worldRuntimeService, worldSessionService, worldSyncService, worldClientEventService) {
        this.legacyAuthService = legacyAuthService;
        this.runtimeGmAuthService = runtimeGmAuthService;
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.worldClientEventService = worldClientEventService;
    }
/** pickSocketToken：执行对应的业务逻辑。 */
    pickSocketToken(client) {
/** token：定义该变量以承载业务值。 */
        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }
/** pickSocketGmToken：执行对应的业务逻辑。 */
    pickSocketGmToken(client) {
/** token：定义该变量以承载业务值。 */
        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }
/** authenticateSocketToken：执行对应的业务逻辑。 */
    authenticateSocketToken(token) {
        return this.legacyAuthService.authenticateSocketToken(token);
    }
/** authenticateSocketGmToken：执行对应的业务逻辑。 */
    authenticateSocketGmToken(token) {
        return this.runtimeGmAuthService.validateAccessToken(token);
    }
/** bootstrapPlayerSession：执行对应的业务逻辑。 */
    async bootstrapPlayerSession(client, input) {
/** binding：定义该变量以承载业务值。 */
        const binding = this.worldSessionService.registerSocket(client, input.playerId, input.requestedSessionId);
        client.data.playerId = binding.playerId;
        client.data.sessionId = binding.sessionId;
/** player：定义该变量以承载业务值。 */
        const player = await this.playerRuntimeService.loadOrCreatePlayer(binding.playerId, binding.sessionId, input.loadSnapshot);
        this.playerRuntimeService.setIdentity(binding.playerId, {
            name: input.name,
            displayName: input.displayName,
        });
        await this.mailRuntimeService.ensurePlayerMailbox(binding.playerId);
        await this.mailRuntimeService.ensureWelcomeMail(binding.playerId);
        this.worldRuntimeService.connectPlayer({
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: input.mapId ?? (player.templateId || undefined),
            preferredX: input.preferredX ?? (player.templateId ? player.x : undefined),
            preferredY: input.preferredY ?? (player.templateId ? player.y : undefined),
        });
        this.worldSyncService.emitInitialSync(binding.playerId);
        this.worldClientEventService.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
        await this.worldClientEventService.emitMailSummaryForPlayer(client, binding.playerId);
        this.worldClientEventService.emitPendingLogbookMessages(client, binding.playerId);
    }
/** loadBootstrapSnapshot：执行对应的业务逻辑。 */
    async loadBootstrapSnapshot(playerId, allowLegacyFallback) {
/** nextSnapshot：定义该变量以承载业务值。 */
        const nextSnapshot = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (nextSnapshot || !allowLegacyFallback) {
            return nextSnapshot;
        }
        return this.legacyAuthService.loadLegacyPlayerSnapshot(playerId);
    }
};
exports.LegacySessionBootstrapService = LegacySessionBootstrapService;
exports.LegacySessionBootstrapService = LegacySessionBootstrapService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        runtime_gm_auth_service_1.RuntimeGmAuthService,
        player_persistence_service_1.PlayerPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService,
        world_client_event_service_1.WorldClientEventService])
], LegacySessionBootstrapService);
//# sourceMappingURL=legacy-session-bootstrap.service.js.map
