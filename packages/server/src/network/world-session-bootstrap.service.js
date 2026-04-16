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

const NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
    'NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
];

const NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES = new Set([
    'token_seed',
]);

const MAX_REQUESTED_SESSION_ID_LENGTH = 128;

const REQUESTED_SESSION_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;

const IMPLICIT_DETACHED_RESUME_AUTH_SOURCES = new Set([
    'next',
    'token',
]);

const AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS = new Set([
    'connect_token',
    'connect_gm_token',
]);

const AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES = new Set([
    'native',
]);

const AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES = new Set([
    'token_seed',
]);

const NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES = new Set([
    'next',
    'token',
]);

const NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES = new Set([
    'native',
]);
/** 是否强制只允许 native 快照，不接受兼容回填。 */
function isStrictNativeSnapshotRequired() {
    for (const key of STRICT_NATIVE_SNAPSHOT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** 是否允许从兼容数据恢复 native 快照。 */
function isNativeSnapshotRecoveryEnabled() {
    for (const key of NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}

/** 世界会话引导服务：把 token、快照和 runtime 初始状态组装成可用会话。 */
let WorldSessionBootstrapService = class WorldSessionBootstrapService {
    /** 记录引导路径、身份来源和恢复结果。 */
    logger = new common_1.Logger(WorldSessionBootstrapService.name);
    /** 普通玩家鉴权服务。 */
    worldPlayerAuthService;
    /** 玩家快照服务。 */
    worldPlayerSnapshotService;
    /** GM 鉴权服务。 */
    worldGmAuthService;
    /** 玩家 runtime。 */
    playerRuntimeService;
    /** 邮件 runtime。 */
    mailRuntimeService;
    /** 建议 runtime。 */
    suggestionRuntimeService;
    /** 世界 runtime。 */
    worldRuntimeService;
    /** 会话管理入口。 */
    worldSessionService;
    /** 同步服务。 */
    worldSyncService;
    /** 客户端事件服务。 */
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
    /** 从握手信息中提取普通玩家 token。 */
    pickSocketToken(client) {

        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }
    /** 从握手信息中提取 GM token。 */
    pickSocketGmToken(client) {

        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }
    /** 校验并规范化客户端请求的 sessionId。 */
    inspectRequestedSessionId(rawSessionId, client, source = 'socket') {
        if (typeof rawSessionId !== 'string') {
            return {
                sessionId: '',
                error: null,
            };
        }

        const normalizedSessionId = rawSessionId.trim();
        if (!normalizedSessionId) {
            return {
                sessionId: '',
                error: null,
            };
        }
        if (normalizedSessionId.length > MAX_REQUESTED_SESSION_ID_LENGTH) {
            this.logger.warn(`${source} 请求的 sessionId 过长，已拒绝：socket=${client?.id ?? '未知'} length=${normalizedSessionId.length}`);
            return {
                sessionId: '',
                error: 'too_long',
            };
        }
        if (!REQUESTED_SESSION_ID_PATTERN.test(normalizedSessionId)) {
            this.logger.warn(`${source} 请求的 sessionId 含非法字符，已拒绝：socket=${client?.id ?? '未知'}`);
            return {
                sessionId: '',
                error: 'invalid_chars',
            };
        }
        return {
            sessionId: normalizedSessionId,
            error: null,
        };
    }
    /** 读取握手中的 sessionId 并做合法性检查。 */
    inspectSocketRequestedSessionId(client) {
        return this.inspectRequestedSessionId(client.handshake?.auth?.sessionId, client, 'socket');
    }
    /** 返回已通过检查的请求 sessionId。 */
    pickSocketRequestedSessionId(client) {
        return this.inspectSocketRequestedSessionId(client).sessionId;
    }
    /** 普通玩家 token 走 next 鉴权实现。 */
    authenticateSocketToken(token, options = undefined) {
        return this.worldPlayerAuthService.authenticatePlayerToken(token, options);
    }
    /** GM token 直接委托 GM 鉴权服务。 */
    authenticateSocketGmToken(token) {
        return this.worldGmAuthService.validateSocketGmToken(token);
    }
    /** 记录引导入口路径，便于排查是 token 还是 GM 入口。 */
    resolveBootstrapEntryPath(client) {

        const entryPath = client?.data?.bootstrapEntryPath;
        return typeof entryPath === 'string' && entryPath.trim() ? entryPath.trim() : null;
    }
    /** 读取引导阶段记录的身份来源。 */
    resolveBootstrapIdentitySource(client) {

        const identitySource = client?.data?.bootstrapIdentitySource;
        return typeof identitySource === 'string' && identitySource.trim() ? identitySource.trim() : null;
    }
    /** 读取引导阶段记录的持久化来源。 */
    resolveBootstrapIdentityPersistedSource(client) {

        const identityPersistedSource = client?.data?.bootstrapIdentityPersistedSource;
        return typeof identityPersistedSource === 'string' && identityPersistedSource.trim() ? identityPersistedSource.trim() : null;
    }
    /** 读取引导阶段记录的快照来源。 */
    resolveBootstrapSnapshotSource(client) {

        const snapshotSource = client?.data?.bootstrapSnapshotSource;
        return typeof snapshotSource === 'string' && snapshotSource.trim() ? snapshotSource.trim() : null;
    }
    /** 读取引导阶段记录的快照持久化来源。 */
    resolveBootstrapSnapshotPersistedSource(client) {

        const snapshotPersistedSource = client?.data?.bootstrapSnapshotPersistedSource;
        return typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim() ? snapshotPersistedSource.trim() : null;
    }
    /** 读取握手时记录的协议版本。 */
    resolveClientProtocol(client) {

        const protocol = client?.data?.protocol;
        return typeof protocol === 'string' && protocol.trim() ? protocol.trim().toLowerCase() : null;
    }
    /** 解析鉴权后最终采用的身份来源。 */
    resolveAuthenticatedBootstrapIdentitySource(client, input = undefined) {

        const authSource = typeof input?.authSource === 'string' ? input.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        return this.resolveBootstrapIdentitySource(client);
    }
    /** 解析鉴权后最终采用的持久化来源。 */
    resolveAuthenticatedBootstrapIdentityPersistedSource(client, input = undefined) {

        const persistedSource = typeof input?.persistedSource === 'string' ? input.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        return this.resolveBootstrapIdentityPersistedSource(client);
    }
    /** 在认证成功后回写身份来源，供后续同步和审计使用。 */
    rememberAuthenticatedBootstrapIdentity(client, input = undefined) {
        if (!client?.data
            || !input
            || (typeof input?.authSource !== 'string' && typeof input?.persistedSource !== 'string')) {
            return;
        }
        client.data.bootstrapIdentitySource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
        client.data.bootstrapIdentityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
    }
    /** 统一解析 bootstrap 合同上下文，避免各入口重复各自判断。 */
    resolveBootstrapContractContext(client, input = undefined) {
        const entryPath = this.resolveBootstrapEntryPath(client);
        const protocol = this.resolveClientProtocol(client);
        const identitySource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
        const identityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
        const effectiveIdentitySource = identitySource === 'next' && identityPersistedSource === 'token_seed'
            ? 'token'
            : identitySource;
        return {
            entryPath,
            protocol,
            identitySource,
            identityPersistedSource,
            effectiveIdentitySource,
            isAuthenticatedEntry: AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS.has(entryPath ?? ''),
            isGm: client?.data?.isGm === true,
        };
    }
    /** 校验 next 协议 bootstrap 是否越权使用了旧身份来源。 */
    resolveAuthenticatedBootstrapContractViolation(client, input = undefined) {

        const contract = this.resolveBootstrapContractContext(client, input);
        if (!contract.isAuthenticatedEntry) {
            return null;
        }
        if (contract.protocol !== 'next') {
            return null;
        }
        const authSource = contract.identitySource;
        const persistedSource = contract.identityPersistedSource;
        if (!NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES.has(authSource ?? '')) {
            return {
                stage: 'next_bootstrap_identity_source_blocked',
                message: `NEXT 协议 bootstrap 不接受 ${authSource || 'unknown'} 身份来源`,
            };
        }
        if (!persistedSource) {
            return {
                stage: 'next_bootstrap_persisted_source_missing',
                message: 'NEXT 协议 bootstrap 缺少持久化身份来源',
            };
        }
        if (authSource === 'token' && !AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'next_bootstrap_token_persisted_source_invalid',
                message: `NEXT 协议 token 身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        if (authSource === 'next' && !NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'next_bootstrap_next_persisted_source_invalid',
                message: `NEXT 协议 next 身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        return null;
    }
    /** 计算不同入口下的 session 复用策略。 */
    resolveBootstrapSessionReusePolicy(client) {
        const contract = this.resolveBootstrapContractContext(client);
        if (contract.isGm) {
            return {
                allowImplicitDetachedResume: false,
                allowRequestedDetachedResume: false,
                allowConnectedSessionReuse: false,
            };
        }

        if (contract.isAuthenticatedEntry) {

            const allowAuthenticatedReuse = contract.effectiveIdentitySource === 'next'
                ? AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES.has(contract.identityPersistedSource ?? '')
                : contract.effectiveIdentitySource === 'token'
                    ? AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES.has(contract.identityPersistedSource ?? '')
                    : false;
            return {
                allowImplicitDetachedResume: allowAuthenticatedReuse,
                allowRequestedDetachedResume: allowAuthenticatedReuse,
                allowConnectedSessionReuse: allowAuthenticatedReuse,
            };
        }
        if (!contract.identitySource) {
            return {
                allowImplicitDetachedResume: true,
                allowRequestedDetachedResume: true,
                allowConnectedSessionReuse: true,
            };
        }
        return {
            allowImplicitDetachedResume: false,
            allowRequestedDetachedResume: false,
            allowConnectedSessionReuse: false,
        };
    }
    /** 记录 bootstrap 阶段的 snapshot 来源。 */
    rememberBootstrapSnapshotContext(client, snapshotSource, snapshotPersistedSource = null) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapSnapshotSource = typeof snapshotSource === 'string' && snapshotSource.trim()
            ? snapshotSource.trim()
            : null;
        client.data.bootstrapSnapshotPersistedSource = typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim()
            ? snapshotPersistedSource.trim()
            : null;
    }
    /** 记录 bootstrap 阶段的身份持久化来源。 */
    rememberBootstrapIdentityPersistedSource(client, identityPersistedSource) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapIdentityPersistedSource = typeof identityPersistedSource === 'string' && identityPersistedSource.trim()
            ? identityPersistedSource.trim()
            : null;
    }
    /** 当前入口是否允许隐式恢复断开会话。 */
    shouldAllowImplicitDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowImplicitDetachedResume;
    }
    /** 当前入口是否允许复用仍在线会话。 */
    shouldAllowConnectedSessionReuse(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowConnectedSessionReuse;
    }
    /** 当前入口是否允许按请求 sessionId 恢复断开会话。 */
    shouldAllowRequestedDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowRequestedDetachedResume;
    }
    /** 清理 bootstrap 阶段缓存的快照恢复结果。 */
    clearAuthenticatedSnapshotRecovery(client) {
        if (!client?.data) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = null;
        client.data.authenticatedSnapshotRecoveryFallback = null;
    }
    /** 记录 bootstrap 阶段的快照恢复结果。 */
    rememberAuthenticatedSnapshotRecovery(client, recovery) {
        if (!client?.data || !recovery) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = recovery;
        client.data.authenticatedSnapshotRecoveryFallback = { ...recovery };
    }
    /** 消费并清空快照恢复结果。 */
    consumeAuthenticatedSnapshotRecovery(client) {

        const recovery = client?.data?.authenticatedSnapshotRecovery ?? client?.data?.authenticatedSnapshotRecoveryFallback ?? null;
        if (client?.data) {
            client.data.authenticatedSnapshotRecovery = null;
            client.data.authenticatedSnapshotRecoveryFallback = null;
        }
        return recovery && typeof recovery === 'object' ? recovery : null;
    }
    /** 当临时 recovery 上下文丢失时，尝试用 bootstrap 真源上下文回推恢复合同。 */
    resolveAuthenticatedSnapshotRecovery(client) {
        const directRecovery = this.consumeAuthenticatedSnapshotRecovery(client);
        if (directRecovery) {
            return directRecovery;
        }
        const snapshotSource = this.resolveBootstrapSnapshotSource(client);
        const identityPersistedSource = this.resolveBootstrapIdentityPersistedSource(client);
        const snapshotPersistedSource = this.resolveBootstrapSnapshotPersistedSource(client);
        const matchesTokenSeedNativeRecovery = identityPersistedSource === 'token_seed'
            && snapshotPersistedSource === 'native';
        if (snapshotSource !== 'recovery_native' && !matchesTokenSeedNativeRecovery) {
            return null;
        }
        return {
            identityPersistedSource,
            snapshotPersistedSource,
            recoveryReason: snapshotSource === 'recovery_native'
                ? 'bootstrap_context:recovery_native'
                : 'bootstrap_context:token_seed_native',
        };
    }
    /** 生成快照恢复提示文案。 */
    buildAuthenticatedSnapshotRecoveryMessage(recovery) {

        const identityPersistedSource = typeof recovery?.identityPersistedSource === 'string' ? recovery.identityPersistedSource.trim() : '';
        if (identityPersistedSource === 'token_seed') {
            return '检测到你是首次以 next 真源入场，角色数据已自动补齐为初始快照。';
        }
        return '检测到角色快照缺失，已自动补齐为 next 初始快照。';
    }
    /** 将快照恢复结果写入玩家日志书，供客户端确认。 */
    emitAuthenticatedSnapshotRecoveryNotice(client, playerId) {

        const recovery = this.resolveAuthenticatedSnapshotRecovery(client);
        if (!recovery) {
            return null;
        }

        const message = this.buildAuthenticatedSnapshotRecoveryMessage(recovery);
        const queuedNotice = {
            id: `snapshot_recovery:${playerId}:${typeof recovery.identityPersistedSource === 'string' ? recovery.identityPersistedSource : 'unknown'}`,
            kind: 'system',
            text: message,
            from: 'system',
            at: Date.now(),
        };
        this.playerRuntimeService.queuePendingLogbookMessage(playerId, queuedNotice);
        return {
            ...recovery,
            queuedNotice,
        };
    }
    /** 延迟一拍后再发初始同步，避免与握手流程抢时序。 */
    async deferInitialSyncEmission() {
        await new Promise((resolve) => setImmediate(resolve));
    }
    /** 引导前先按 session 复用策略处理 runtime 绑定。 */
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
    /** 完成玩家会话引导，并把 runtime、同步和消息状态全部串起来。 */
    async bootstrapPlayerSession(client, input) {
        this.rememberAuthenticatedBootstrapIdentity(client, input);

        const authenticatedBootstrapContractViolation = this.resolveAuthenticatedBootstrapContractViolation(client, input);
        if (authenticatedBootstrapContractViolation) {
            throw new Error(authenticatedBootstrapContractViolation.stage);
        }
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
        await this.deferInitialSyncEmission();
        this.worldSyncService.emitInitialSync(binding.playerId, client);

        const bootstrapRecovery = this.emitAuthenticatedSnapshotRecoveryNotice(client, binding.playerId);
        if (bootstrapRecovery?.queuedNotice) {
            if (client?.data) {
                const existingPrefilledIds = client.data.prefilledPendingLogbookMessageIds instanceof Set
                    ? client.data.prefilledPendingLogbookMessageIds
                    : new Set();
                existingPrefilledIds.add(bootstrapRecovery.queuedNotice.id);
                client.data.prefilledPendingLogbookMessageIds = existingPrefilledIds;
            }
            this.worldClientEventService.emitPendingLogbookNotice(client, bootstrapRecovery.queuedNotice);
        }
        this.worldClientEventService.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
        await this.worldClientEventService.emitMailSummaryForPlayer(client, binding.playerId);
        this.worldClientEventService.emitPendingLogbookMessages(client, binding.playerId);

        const bootstrapEntryPath = this.resolveBootstrapEntryPath(client);

        const bootstrapIdentitySource = this.resolveBootstrapIdentitySource(client);

        const bootstrapIdentityPersistedSource = this.resolveBootstrapIdentityPersistedSource(client);

        const bootstrapSnapshotSource = this.resolveBootstrapSnapshotSource(client);

        const bootstrapSnapshotPersistedSource = this.resolveBootstrapSnapshotPersistedSource(client);
        this.logger.debug(`会话引导已就绪：playerId=${binding.playerId} sessionId=${binding.sessionId} mapId=${player.templateId || input.mapId || '未知'} requestedSessionId=${input.requestedSessionId ?? ''} protocol=${client.data.protocol ?? '未知'} gm=${client.data.isGm === true} entryPath=${bootstrapEntryPath ?? '未知'} identitySource=${bootstrapIdentitySource ?? '未知'}`);
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
            identityPersistedSource: bootstrapIdentityPersistedSource,
            snapshotSource: bootstrapSnapshotSource,
            snapshotPersistedSource: bootstrapSnapshotPersistedSource,
            linkedIdentitySource: bootstrapIdentitySource,
            linkedSnapshotSource: bootstrapSnapshotSource,
            linkedSnapshotPersistedSource: bootstrapSnapshotPersistedSource,
            recoveryOutcome: bootstrapRecovery ? 'success' : null,

            recoveryReason: typeof bootstrapRecovery?.recoveryReason === 'string' ? bootstrapRecovery.recoveryReason : null,

            recoveryIdentityPersistedSource: typeof bootstrapRecovery?.identityPersistedSource === 'string' ? bootstrapRecovery.identityPersistedSource : null,

            recoverySnapshotPersistedSource: typeof bootstrapRecovery?.snapshotPersistedSource === 'string' ? bootstrapRecovery.snapshotPersistedSource : null,
        });
    }
    /** 读取玩家快照；authenticated 主链只记录 next-only miss，不再做 runtime compat 回退。 */
    async loadPlayerSnapshot(playerId, allowLegacyFallback) {
        return this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback);
    }
    /** 读取玩家快照并带上来源追踪。 */
    async loadPlayerSnapshotWithTrace(playerId, allowLegacyFallback, fallbackReason = null) {
        if (this.worldPlayerSnapshotService?.loadPlayerSnapshotResult) {
            return this.worldPlayerSnapshotService.loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason);
        }

        const snapshot = await this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason);
        return {
            snapshot,
            source: snapshot ? 'unknown' : 'miss',
            persistedSource: null,
            fallbackReason,
            seedPersisted: false,
        };
    }
    /** 计算 authenticated 主链的 next-only 快照策略。 */
    resolveAuthenticatedSnapshotPolicy(identity, client = undefined) {

        const persistenceEnabled = this.worldPlayerSnapshotService.isPersistenceEnabled();
        if (persistenceEnabled && isStrictNativeSnapshotRequired()) {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'strict_native_snapshot_required',
            };
        }

        const protocol = this.resolveClientProtocol(client);

        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (persistenceEnabled) {
            return {
                allowLegacyFallback: false,
                fallbackReason: authSource ? `persistence_enabled_blocked:${authSource}` : 'persistence_enabled_blocked:unknown',
            };
        }
        if (authSource === 'legacy_runtime' && protocol === 'next') {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'next_protocol_blocked:legacy_identity',
            };
        }
        if (authSource === 'legacy_runtime') {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'runtime_migration_snapshot_blocked:legacy_identity',
            };
        }
        return {
            allowLegacyFallback: false,
            fallbackReason: authSource ? `identity_source:${authSource}` : 'identity_source:unknown',
        };
    }
    /** 计算缺失快照时是否允许原生补齐。 */
    resolveAuthenticatedMissingSnapshotRecovery(identity) {
        if (!this.worldPlayerSnapshotService.isPersistenceEnabled()) {
            return {
                allowNativeRecovery: false,
                recoveryReason: 'persistence_disabled',
            };
        }
        if (!isNativeSnapshotRecoveryEnabled()) {
            return {
                allowNativeRecovery: false,
                recoveryReason: 'native_snapshot_recovery_disabled',
            };
        }

        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource !== 'next' && authSource !== 'token') {
            return {
                allowNativeRecovery: false,
                recoveryReason: authSource ? `auth_source:${authSource}` : 'auth_source:unknown',
            };
        }

        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (!NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES.has(persistedSource)) {
            return {
                allowNativeRecovery: false,
                recoveryReason: persistedSource ? `persisted_source:${persistedSource}` : 'persisted_source:unknown',
            };
        }
        return {
            allowNativeRecovery: true,
            recoveryReason: `persisted_source:${persistedSource}`,
        };
    }
    /** 针对 token_seed 身份做原生提升。 */
    async promoteAuthenticatedTokenSeedIdentity(identity, client) {

        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource !== 'token_seed'
            || typeof this.worldPlayerAuthService?.promoteTokenSeedIdentityToNative !== 'function') {
            return identity;
        }

        const promotedIdentity = await this.worldPlayerAuthService.promoteTokenSeedIdentityToNative(identity);

        const promotedPersistedSource = typeof promotedIdentity?.persistedSource === 'string'
            ? promotedIdentity.persistedSource.trim()
            : '';
        if (promotedPersistedSource !== 'native') {
            return identity;
        }
        identity.persistedSource = promotedPersistedSource;
        identity.authSource = 'next';
        if (client?.data) {
            client.data.bootstrapIdentitySource = 'next';
            client.data.bootstrapIdentityPersistedSource = promotedPersistedSource;
        }
        return identity;
    }
    /** 加载鉴权玩家快照，并在必要时做恢复或提示。 */
    async loadAuthenticatedPlayerSnapshot(identity, client = undefined) {
        this.rememberBootstrapIdentityPersistedSource(client, identity?.persistedSource ?? null);

        const fallbackPolicy = this.resolveAuthenticatedSnapshotPolicy(identity, client);

        const snapshotResult = await this.loadPlayerSnapshotWithTrace(identity.playerId, fallbackPolicy.allowLegacyFallback, fallbackPolicy.fallbackReason);
        this.rememberBootstrapSnapshotContext(client, snapshotResult.source, snapshotResult.persistedSource);

        const snapshot = snapshotResult.snapshot;

        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';

        const identityPersistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';

        const snapshotPersistedSource = typeof snapshotResult.persistedSource === 'string' ? snapshotResult.persistedSource.trim() : '';

        const shouldRememberPreseededRecovery = Boolean(snapshot)
            && authSource === 'token'
            && identityPersistedSource === 'token_seed'
            && snapshotPersistedSource === 'native';
        if (snapshot
            || !this.worldPlayerSnapshotService.isPersistenceEnabled()) {
            if (shouldRememberPreseededRecovery) {
                await this.promoteAuthenticatedTokenSeedIdentity(identity, client);
                this.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource,
                    recoveryReason: `persisted_source:${identityPersistedSource}`,
                });
            }
            else {
                this.clearAuthenticatedSnapshotRecovery(client);
            }
            return snapshot;
        }

        const recoveryPolicy = this.resolveAuthenticatedMissingSnapshotRecovery(identity);
        if (recoveryPolicy.allowNativeRecovery) {

            const recoveredSnapshot = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(identity.playerId);
            if (recoveredSnapshot.ok && recoveredSnapshot.snapshot) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'snapshot_recovery',
                    playerId: identity.playerId,

                    authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,

                    identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                    outcome: 'success',
                    reason: recoveryPolicy.recoveryReason,

                    persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                    failureStage: null,
                });
                await this.promoteAuthenticatedTokenSeedIdentity(identity, client);
                this.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource: recoveredSnapshot.persistedSource ?? null,
                    recoveryReason: recoveryPolicy.recoveryReason,
                });
                this.rememberBootstrapSnapshotContext(client, 'recovery_native', recoveredSnapshot.persistedSource ?? null);
                return recoveredSnapshot.snapshot;
            }
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'snapshot_recovery',
                playerId: identity.playerId,

                authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,

                identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                outcome: 'failure',
                reason: recoveryPolicy.recoveryReason,

                persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                failureStage: recoveredSnapshot.failureStage ?? 'unknown',
            });
            this.clearAuthenticatedSnapshotRecovery(client);
            throw new Error(`Authenticated next player snapshot recovery failed while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason} stage=${recoveredSnapshot.failureStage ?? 'unknown'}`);
        }
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot_recovery',
            playerId: identity.playerId,

            authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,

            identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
            outcome: 'blocked',
            reason: recoveryPolicy.recoveryReason,
            persistedSource: null,
            failureStage: null,
        });
        this.clearAuthenticatedSnapshotRecovery(client);
        throw new Error(`Authenticated next player snapshot missing while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason}`);
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
