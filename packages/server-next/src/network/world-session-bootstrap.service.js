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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionBootstrapService = void 0;
const common_1 = require("@nestjs/common");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_gm_auth_service_1 = require("./world-gm-auth.service");
const world_player_auth_service_1 = require("./world-player-auth.service");
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
const world_session_service_1 = require("./world-session.service");
const world_sync_service_1 = require("./world-sync.service");
const world_client_event_service_1 = require("./world-client-event.service");
const world_player_token_service_1 = require("./world-player-token.service");
const STRICT_NATIVE_SNAPSHOT_ENV_KEYS = [
    'SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
    'NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
];
const LEGACY_SNAPSHOT_FALLBACK_AUTH_SOURCES = new Set([
    'legacy_runtime',
]);
const IMPLICIT_DETACHED_RESUME_AUTH_SOURCES = new Set([
    'next',
    'token',
    'legacy_backfill',
]);
function isStrictNativeSnapshotRequired() {
    for (const key of STRICT_NATIVE_SNAPSHOT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
let WorldSessionBootstrapService = class WorldSessionBootstrapService {
    logger = new common_1.Logger(WorldSessionBootstrapService.name);
    worldPlayerAuthService;
    worldPlayerSnapshotService;
    worldGmAuthService;
    playerRuntimeService;
    mailRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldSessionService;
    worldSyncService;
    worldClientEventService;
    constructor(worldPlayerAuthService, worldPlayerSnapshotService, worldGmAuthService, playerRuntimeService, mailRuntimeService, suggestionRuntimeService, worldRuntimeService, worldSessionService, worldSyncService, worldClientEventService) {
        this.worldPlayerAuthService = worldPlayerAuthService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
        this.worldGmAuthService = worldGmAuthService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.worldClientEventService = worldClientEventService;
    }
    pickSocketToken(client) {
        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }
    pickSocketGmToken(client) {
        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }
    pickSocketRequestedSessionId(client) {
        const sessionId = client.handshake?.auth?.sessionId;
        return typeof sessionId === 'string' ? sessionId.trim() : '';
    }
    authenticateSocketToken(token) {
        return this.worldPlayerAuthService.authenticatePlayerToken(token);
    }
    authenticateSocketGmToken(token) {
        return this.worldGmAuthService.validateSocketGmToken(token);
    }
    resolveBootstrapEntryPath(client) {
        const entryPath = client?.data?.bootstrapEntryPath;
        return typeof entryPath === 'string' && entryPath.trim() ? entryPath.trim() : null;
    }
    resolveBootstrapIdentitySource(client) {
        const identitySource = client?.data?.bootstrapIdentitySource;
        return typeof identitySource === 'string' && identitySource.trim() ? identitySource.trim() : null;
    }
    shouldAllowImplicitDetachedResume(client) {
        const identitySource = this.resolveBootstrapIdentitySource(client);
        if (!identitySource) {
            return true;
        }
        return IMPLICIT_DETACHED_RESUME_AUTH_SOURCES.has(identitySource);
    }
    shouldAllowConnectedSessionReuse(client) {
        return this.shouldAllowImplicitDetachedResume(client);
    }
    shouldAllowRequestedDetachedResume(client) {
        return this.shouldAllowImplicitDetachedResume(client);
    }
    prepareBootstrapRuntime(client, playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        const existingBinding = this.worldSessionService.getBinding(normalizedPlayerId);
        if (!existingBinding) {
            return;
        }
        const shouldBreakConnectedSessionReuse = existingBinding.connected === true
            && !this.shouldAllowConnectedSessionReuse(client);
        const shouldBreakDetachedResume = existingBinding.connected !== true
            && !this.shouldAllowImplicitDetachedResume(client);
        if (!shouldBreakConnectedSessionReuse && !shouldBreakDetachedResume) {
            return;
        }
        this.worldRuntimeService.removePlayer(normalizedPlayerId, shouldBreakConnectedSessionReuse ? 'replaced' : 'removed');
    }
    async bootstrapPlayerSession(client, input) {
        this.prepareBootstrapRuntime(client, input.playerId);
        const binding = this.worldSessionService.registerSocket(client, input.playerId, input.requestedSessionId, {
            allowImplicitDetachedResume: this.shouldAllowImplicitDetachedResume(client),
            allowRequestedDetachedResume: this.shouldAllowRequestedDetachedResume(client),
            allowConnectedSessionReuse: this.shouldAllowConnectedSessionReuse(client),
        });
        client.data.playerId = binding.playerId;
        client.data.sessionId = binding.sessionId;
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
        const bootstrapEntryPath = this.resolveBootstrapEntryPath(client);
        const bootstrapIdentitySource = this.resolveBootstrapIdentitySource(client);
        this.logger.debug(`Bootstrap session ready: playerId=${binding.playerId} sessionId=${binding.sessionId} mapId=${player.templateId || input.mapId || 'unknown'} requestedSessionId=${input.requestedSessionId ?? ''} protocol=${client.data.protocol ?? 'unknown'} gm=${client.data.isGm === true} entryPath=${bootstrapEntryPath ?? 'unknown'} identitySource=${bootstrapIdentitySource ?? 'unknown'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'bootstrap',
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: player.templateId || input.mapId || 'unknown',
            requestedSessionId: input.requestedSessionId ?? null,
            gm: client.data.isGm === true,
            protocol: client.data.protocol ?? 'unknown',
            entryPath: bootstrapEntryPath,
            identitySource: bootstrapIdentitySource,
        });
    }
    async loadPlayerSnapshot(playerId, allowLegacyFallback) {
        return this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback);
    }
    resolveAuthenticatedLegacySnapshotFallback(identity) {
        const persistenceEnabled = this.worldPlayerSnapshotService.isPersistenceEnabled();
        if (persistenceEnabled && isStrictNativeSnapshotRequired()) {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'strict_native_snapshot_required',
            };
        }
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (persistenceEnabled) {
            return {
                allowLegacyFallback: false,
                fallbackReason: authSource ? `persistence_enabled_blocked:${authSource}` : 'persistence_enabled_blocked:unknown',
            };
        }
        if (LEGACY_SNAPSHOT_FALLBACK_AUTH_SOURCES.has(authSource)) {
            return {
                allowLegacyFallback: true,
                fallbackReason: `identity_source:${authSource}`,
            };
        }
        return {
            allowLegacyFallback: false,
            fallbackReason: authSource ? `identity_source:${authSource}` : 'identity_source:unknown',
        };
    }
    shouldAllowAuthenticatedLegacySnapshotFallback(identity) {
        return this.resolveAuthenticatedLegacySnapshotFallback(identity).allowLegacyFallback;
    }
    async loadAuthenticatedPlayerSnapshot(identity) {
        const fallbackPolicy = this.resolveAuthenticatedLegacySnapshotFallback(identity);
        const snapshot = await this.worldPlayerSnapshotService.loadPlayerSnapshot(identity.playerId, fallbackPolicy.allowLegacyFallback, fallbackPolicy.fallbackReason);
        if (snapshot
            || !this.worldPlayerSnapshotService.isPersistenceEnabled()) {
            return snapshot;
        }
        throw new Error(`Authenticated next player snapshot missing while persistence is enabled: playerId=${identity.playerId}`);
    }
};
exports.WorldSessionBootstrapService = WorldSessionBootstrapService;
exports.WorldSessionBootstrapService = WorldSessionBootstrapService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_auth_service_1.WorldPlayerAuthService,
        world_player_snapshot_service_1.WorldPlayerSnapshotService,
        world_gm_auth_service_1.WorldGmAuthService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService,
        world_client_event_service_1.WorldClientEventService])
], WorldSessionBootstrapService);
//# sourceMappingURL=world-session-bootstrap.service.js.map
