import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import {
    BootstrapClientLike,
    BootstrapRecoveryContext,
    BootstrapSessionInput,
    WorldSessionBootstrapContextHelper,
} from './world-session-bootstrap-context.helper';
import { WorldSessionBootstrapContractService } from './world-session-bootstrap-contract.service';
import { WorldSessionBootstrapFinalizeService } from './world-session-bootstrap-finalize.service';
import { WorldSessionBootstrapPostEmitService } from './world-session-bootstrap-post-emit.service';
import { WorldSessionBootstrapPlayerInitService } from './world-session-bootstrap-player-init.service';
import { WorldSessionBootstrapSessionBindService } from './world-session-bootstrap-session-bind.service';
import {
    BootstrapIdentityLike,
    BootstrapRecoveryNoticeResult,
    BootstrapSnapshotTraceResult,
    WorldSessionBootstrapSnapshotService,
} from './world-session-bootstrap-snapshot.service';
import { WorldSessionBootstrapRuntimeService } from './world-session-bootstrap-runtime.service';
import { WorldGmAuthService } from './world-gm-auth.service';
import { WorldPlayerAuthService } from './world-player-auth.service';
import { WorldPlayerSnapshotService } from './world-player-snapshot.service';
import { WorldSessionService } from './world-session.service';
import { WorldSyncService } from './world-sync.service';

interface SuggestionRuntimePort {
    getAll(): unknown[];
}

interface WorldClientEventPort {
    emitPendingLogbookNotice(client: BootstrapClientLike, notice: unknown): void;
    emitSuggestionUpdate(client: BootstrapClientLike, suggestions: unknown[]): void;
    emitMailSummaryForPlayer(client: BootstrapClientLike, playerId: string): Promise<void>;
    emitPendingLogbookMessages(client: BootstrapClientLike, playerId: string): void;
}

interface PlayerRuntimeInitPort {
    loadOrCreatePlayer(
        playerId: string,
        sessionId: string,
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>,
        options?: {
            forceRebind?: boolean;
            buildStarterSnapshot?: (playerId: string) => PersistedPlayerSnapshot | null;
            onSnapshotLoaded?: (snapshot: PersistedPlayerSnapshot | null) => void;
        },
    ): Promise<{
        instanceId?: string | null;
        templateId?: string | null;
        x: number;
        y: number;
    }>;
    setIdentity(playerId: string, input: {
        name?: string | null;
        displayName?: string | null;
    }): void;
    describePersistencePresence?(playerId: string): {
        online: boolean;
        inWorld: boolean;
        lastHeartbeatAt?: number | null;
        offlineSinceAt?: number | null;
        runtimeOwnerId?: string | null;
        sessionEpoch?: number | null;
        transferState?: string | null;
        transferTargetNodeId?: string | null;
        versionSeed?: number | null;
    } | null;
}

interface MailRuntimeInitPort {
    ensurePlayerMailbox(playerId: string): Promise<void>;
    ensureWelcomeMail(playerId: string): Promise<void>;
}

/** 世界会话引导服务：把 token、快照和 runtime 初始状态组装成可用会话。 */
@Injectable()
export class WorldSessionBootstrapService {
    /** 记录引导路径、身份来源和恢复结果。 */
    logger = new Logger(WorldSessionBootstrapService.name);
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
    /** bootstrap 上下文辅助。 */
    contextHelper;
    /** bootstrap 合同与 session 策略辅助。 */
    contractService;
    /** bootstrap runtime attach/detach 辅助。 */
    runtimeBootstrapService;
    /** bootstrap snapshot recovery 辅助。 */
    snapshotBootstrapService;
    /** bootstrap 初始同步后的事件下发辅助。 */
    postEmitBootstrapService;
    /** bootstrap 前置校验与 session 绑定辅助。 */
    sessionBindBootstrapService;
    /** bootstrap 玩家初始化辅助。 */
    playerInitBootstrapService;
    /** bootstrap 完成态日志与 trace 辅助。 */
    finalizeBootstrapService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldPlayerAuthService 参数说明。
 * @param worldPlayerSnapshotService 参数说明。
 * @param worldGmAuthService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param mailRuntimeService 参数说明。
 * @param suggestionRuntimeService 参数说明。
 * @param worldRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldSyncService 参数说明。
 * @param worldClientEventService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        worldPlayerAuthService: WorldPlayerAuthService,
        worldPlayerSnapshotService: WorldPlayerSnapshotService,
        @Inject(WorldGmAuthService)
        worldGmAuthService: unknown,
        @Inject(PlayerRuntimeService)
        playerRuntimeService: unknown,
        @Inject(MailRuntimeService)
        mailRuntimeService: unknown,
        @Inject(SuggestionRuntimeService)
        suggestionRuntimeService: unknown,
        @Inject(WorldRuntimeService)
        worldRuntimeService: unknown,
        worldSessionService: WorldSessionService,
        @Inject(WorldSyncService)
        worldSyncService: unknown,
        @Inject(WorldClientEventService)
        worldClientEventService: unknown,
        @Optional()
        @Inject(WorldSessionBootstrapContextHelper)
        contextHelper?: WorldSessionBootstrapContextHelper | null,
        @Optional()
        @Inject(WorldSessionBootstrapContractService)
        contractService?: WorldSessionBootstrapContractService | null,
        @Optional()
        @Inject(WorldSessionBootstrapRuntimeService)
        runtimeBootstrapService?: WorldSessionBootstrapRuntimeService | null,
        @Optional()
        @Inject(WorldSessionBootstrapSnapshotService)
        snapshotBootstrapService?: WorldSessionBootstrapSnapshotService | null,
        @Optional()
        @Inject(WorldSessionBootstrapPostEmitService)
        postEmitBootstrapService?: WorldSessionBootstrapPostEmitService | null,
        @Optional()
        @Inject(WorldSessionBootstrapSessionBindService)
        sessionBindBootstrapService?: WorldSessionBootstrapSessionBindService | null,
        @Optional()
        @Inject(WorldSessionBootstrapPlayerInitService)
        playerInitBootstrapService?: WorldSessionBootstrapPlayerInitService | null,
        @Optional()
        @Inject(WorldSessionBootstrapFinalizeService)
        finalizeBootstrapService?: WorldSessionBootstrapFinalizeService | null,
    ) {
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
        this.contextHelper = contextHelper ?? new WorldSessionBootstrapContextHelper();
        this.contractService = contractService ?? new WorldSessionBootstrapContractService(this.contextHelper, worldSessionService ?? null);
        this.runtimeBootstrapService = runtimeBootstrapService ?? new WorldSessionBootstrapRuntimeService(worldSessionService ?? null, this.contractService, this.contextHelper);
        this.snapshotBootstrapService = snapshotBootstrapService ?? new WorldSessionBootstrapSnapshotService(this.contextHelper, worldPlayerSnapshotService ?? null, worldPlayerAuthService ?? null, playerRuntimeService ?? null);
        this.postEmitBootstrapService = postEmitBootstrapService ?? new WorldSessionBootstrapPostEmitService(
            this.snapshotBootstrapService,
            suggestionRuntimeService as SuggestionRuntimePort,
            worldClientEventService as WorldClientEventPort,
        );
        this.sessionBindBootstrapService = sessionBindBootstrapService ?? new WorldSessionBootstrapSessionBindService(
            this.contextHelper,
            this.contractService,
            worldSessionService ?? null,
        );
        this.playerInitBootstrapService = playerInitBootstrapService ?? new WorldSessionBootstrapPlayerInitService(
            playerRuntimeService as PlayerRuntimeInitPort,
            null,
            null,
            mailRuntimeService as MailRuntimeInitPort,
        );
        this.finalizeBootstrapService = finalizeBootstrapService ?? new WorldSessionBootstrapFinalizeService();
    }
    /** 从握手信息中提取普通玩家 token。 */
    pickSocketToken(client: BootstrapClientLike) {
        return this.contextHelper.pickSocketToken(client);
    }
    /** 从握手信息中提取 GM token。 */
    pickSocketGmToken(client: BootstrapClientLike) {
        return this.contextHelper.pickSocketGmToken(client);
    }
    /** 校验并规范化客户端请求的 sessionId。 */
    inspectRequestedSessionId(rawSessionId: unknown, client: BootstrapClientLike, source = 'socket') {
        return this.contractService.inspectRequestedSessionId(rawSessionId, client, source);
    }
    /** 读取握手中的 sessionId 并做合法性检查。 */
    inspectSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.contractService.inspectSocketRequestedSessionId(client);
    }
    /** 返回已通过检查的请求 sessionId。 */
    pickSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.contractService.pickSocketRequestedSessionId(client);
    }
    /** 普通玩家 token 走 主线鉴权实现。 */
    authenticateSocketToken(token, options = undefined) {
        return this.worldPlayerAuthService.authenticatePlayerToken(token, options);
    }
    /** GM token 直接委托 GM 鉴权服务。 */
    authenticateSocketGmToken(token) {
        return this.worldGmAuthService.validateSocketGmToken(token);
    }
    /** 记录引导入口路径，便于排查是 token 还是 GM 入口。 */
    resolveBootstrapEntryPath(client: BootstrapClientLike) {
        return this.contextHelper.resolveBootstrapEntryPath(client);
    }
    /** 读取引导阶段记录的身份来源。 */
    resolveBootstrapIdentitySource(client: BootstrapClientLike) {
        return this.contextHelper.resolveBootstrapIdentitySource(client);
    }
    /** 读取引导阶段记录的持久化来源。 */
    resolveBootstrapIdentityPersistedSource(client: BootstrapClientLike) {
        return this.contextHelper.resolveBootstrapIdentityPersistedSource(client);
    }
    /** 读取引导阶段记录的快照来源。 */
    resolveBootstrapSnapshotSource(client: BootstrapClientLike) {
        return this.contextHelper.resolveBootstrapSnapshotSource(client);
    }
    /** 读取引导阶段记录的快照持久化来源。 */
    resolveBootstrapSnapshotPersistedSource(client: BootstrapClientLike) {
        return this.contextHelper.resolveBootstrapSnapshotPersistedSource(client);
    }
    /** 读取握手时记录的协议版本。 */
    resolveClientProtocol(client: BootstrapClientLike) {
        return this.contextHelper.resolveClientProtocol(client);
    }
    /** 解析鉴权后最终采用的身份来源。 */
    resolveAuthenticatedBootstrapIdentitySource(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        return this.contextHelper.resolveAuthenticatedBootstrapIdentitySource(client, input);
    }
    /** 解析鉴权后最终采用的持久化来源。 */
    resolveAuthenticatedBootstrapIdentityPersistedSource(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        return this.contextHelper.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
    }
    /** 在认证成功后回写身份来源，供后续同步和审计使用。 */
    rememberAuthenticatedBootstrapIdentity(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        this.contextHelper.rememberAuthenticatedBootstrapIdentity(client, input);
    }
    /** 统一解析 bootstrap 合同上下文，避免各入口重复各自判断。 */
    resolveBootstrapContractContext(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        return this.contractService.resolveBootstrapContractContext(client, input);
    }
    /** 校验 主线协议 bootstrap 是否越权使用了旧身份来源。 */
    resolveAuthenticatedBootstrapContractViolation(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        return this.contractService.resolveAuthenticatedBootstrapContractViolation(client, input);
    }
    /** 计算不同入口下的 session 复用策略。 */
    resolveBootstrapSessionReusePolicy(client: BootstrapClientLike) {
        return this.contractService.resolveBootstrapSessionReusePolicy(client);
    }
    /** 记录 bootstrap 阶段的 snapshot 来源。 */
    rememberBootstrapSnapshotContext(client: BootstrapClientLike, snapshotSource: string | null, snapshotPersistedSource: string | null = null) {
        this.contextHelper.rememberBootstrapSnapshotContext(client, snapshotSource, snapshotPersistedSource);
    }
    /** 记录 bootstrap 阶段的身份持久化来源。 */
    rememberBootstrapIdentityPersistedSource(client: BootstrapClientLike, identityPersistedSource: string | null | undefined) {
        this.contextHelper.rememberBootstrapIdentityPersistedSource(client, identityPersistedSource);
    }
    /** 当前入口是否允许隐式恢复断开会话。 */
    shouldAllowImplicitDetachedResume(client: BootstrapClientLike) {
        return this.contractService.shouldAllowImplicitDetachedResume(client);
    }
    /** 当前入口是否允许复用仍在线会话。 */
    shouldAllowConnectedSessionReuse(client: BootstrapClientLike) {
        return this.contractService.shouldAllowConnectedSessionReuse(client);
    }
    /** 当前入口是否允许按请求 sessionId 恢复断开会话。 */
    shouldAllowRequestedDetachedResume(client: BootstrapClientLike) {
        return this.contractService.shouldAllowRequestedDetachedResume(client);
    }
    /** 统一裁定 authenticated bootstrap 是否接受客户端携带的 requested sessionId。 */
    resolveBootstrapRequestedSessionId(client: BootstrapClientLike, requestedSessionId: string | null | undefined) {
        return this.contractService.resolveBootstrapRequestedSessionId(client, requestedSessionId);
    }
    /** 清理 bootstrap 阶段缓存的快照恢复结果。 */
    clearAuthenticatedSnapshotRecovery(client: BootstrapClientLike) {
        this.contextHelper.clearAuthenticatedSnapshotRecovery(client);
    }
    /** 记录 bootstrap 阶段的快照恢复结果。 */
    rememberAuthenticatedSnapshotRecovery(client: BootstrapClientLike, recovery: BootstrapRecoveryContext | null | undefined) {
        this.contextHelper.rememberAuthenticatedSnapshotRecovery(client, recovery);
    }
    /** 消费并清空快照恢复结果。 */
    consumeAuthenticatedSnapshotRecovery(client: BootstrapClientLike): BootstrapRecoveryContext | null {
        return this.contextHelper.consumeAuthenticatedSnapshotRecovery(client);
    }
    /** 当临时 recovery 上下文丢失时，尝试用 bootstrap 真源上下文回推恢复合同。 */
    resolveAuthenticatedSnapshotRecovery(client: BootstrapClientLike): BootstrapRecoveryContext | null {
        return this.snapshotBootstrapService.resolveAuthenticatedSnapshotRecovery(client);
    }
    /** 生成快照恢复提示文案。 */
    buildAuthenticatedSnapshotRecoveryMessage(recovery: BootstrapRecoveryContext | null | undefined) {
        return this.snapshotBootstrapService.buildAuthenticatedSnapshotRecoveryMessage(recovery);
    }
    /** 将快照恢复结果写入玩家日志书，供客户端确认。 */
    emitAuthenticatedSnapshotRecoveryNotice(client: BootstrapClientLike, playerId: string): BootstrapRecoveryNoticeResult | null {
        return this.snapshotBootstrapService.emitAuthenticatedSnapshotRecoveryNotice(client, playerId);
    }
    /** 在初始同步后统一下发 bootstrap 相关 notice、建议、邮件和日志书。 */
    async emitPostBootstrapState(client: BootstrapClientLike, playerId: string): Promise<BootstrapRecoveryNoticeResult | null> {
        return this.postEmitBootstrapService.emitPostBootstrapState(client, playerId);
    }
    /** 统一处理 bootstrap 阶段的 load/create、身份回写和邮箱预热。 */
    async initializeBootstrapPlayer(input: {
        playerId: string;
        sessionId: string;
        name?: string | null;
        displayName?: string | null;
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>;
        forceRuntimeSessionRebind?: boolean;
        onSnapshotContextResolved?: (context: {
            source: string | null;
            persistedSource: string | null;
        }) => void;
    }) {
        return this.playerInitBootstrapService.initializeBootstrapPlayer(input);
    }
    /** 统一收口 bootstrap 完成态日志与 auth-trace。 */
    finalizeBootstrap(input: {
        playerId: string;
        sessionId: string;
        mapId: string;
        requestedSessionId?: string | null;
        protocol: string | null | undefined;
        isGm: boolean;
        entryPath: string | null;
        identitySource: string | null;
        identityPersistedSource: string | null;
        snapshotSource: string | null;
        snapshotPersistedSource: string | null;
        bootstrapRecovery: BootstrapRecoveryNoticeResult | null;
    }) {
        this.finalizeBootstrapService.finalizeBootstrap(input);
    }
    /** 延迟一拍后再发初始同步，避免与握手流程抢时序。 */
    async deferInitialSyncEmission() {
        await new Promise((resolve) => setImmediate(resolve));
    }
    /** 兼容真实 runtime facade 与 proof stub 的 player session 入口。 */
    resolveWorldRuntimeBootstrapSessionPort() {
        return this.runtimeBootstrapService.resolveWorldRuntimeBootstrapSessionPort(this.worldRuntimeService);
    }
    /** 统一连接 bootstrap player 到 runtime。 */
    connectBootstrapRuntimePlayer(input: {
        playerId: string;
        sessionId?: string | null;
        instanceId?: string | null;
        mapId?: string | null;
        preferredX?: number;
        preferredY?: number;
    }) {
        return this.runtimeBootstrapService.connectBootstrapRuntimePlayer(this.worldRuntimeService, input);
    }
    /** 统一从 runtime 清理 bootstrap player 绑定。 */
    removeBootstrapRuntimePlayer(playerId: string, reason: string) {
        return this.runtimeBootstrapService.removeBootstrapRuntimePlayer(this.worldRuntimeService, playerId, reason);
    }
    /** 在 authenticated bootstrap 前回写身份来源并校验合同。 */
    prepareAuthenticatedBootstrap(client: BootstrapClientLike, input: BootstrapSessionInput) {
        this.sessionBindBootstrapService.prepareAuthenticatedBootstrap(client, input);
    }
    /** 引导前先按 session 复用策略处理 runtime 绑定。 */
    prepareBootstrapRuntime(client: BootstrapClientLike, playerId: string) {
        this.runtimeBootstrapService.prepareBootstrapRuntime(client, playerId, this.worldRuntimeService);
    }
    /** 统一裁定 requestedSessionId、绑定 session 并回写 client.data。 */
    registerBootstrapSession(client: BootstrapClientLike, input: BootstrapSessionInput) {
        return this.sessionBindBootstrapService.registerBootstrapSession(client, input);
    }
    /** 完成玩家会话引导，并把 runtime、同步和消息状态全部串起来。 */
    async bootstrapPlayerSession(client: BootstrapClientLike, input: BootstrapSessionInput): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.prepareAuthenticatedBootstrap(client, input);
        this.prepareBootstrapRuntime(client, input.playerId);
        const { binding, requestedSessionId } = this.registerBootstrapSession(client, input);

        const player = await this.initializeBootstrapPlayer({
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            name: input.name,
            displayName: input.displayName,
            loadSnapshot: input.loadSnapshot,
            onSnapshotContextResolved: (context) => {
                this.rememberBootstrapSnapshotContext(client, context.source, context.persistedSource);
            },
        });
        const bindingSessionEpoch = Number(this.playerRuntimeService.describePersistencePresence?.(binding.playerId)?.sessionEpoch ?? 0);
        if (Number.isFinite(bindingSessionEpoch) && bindingSessionEpoch > 0) {
            this.worldSessionService.rememberSessionEpoch(binding.playerId, bindingSessionEpoch);
        }
        this.connectBootstrapRuntimePlayer({
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            instanceId: input.instanceId ?? (player.instanceId || undefined),
            mapId: input.mapId ?? (player.templateId || undefined),
            preferredX: input.preferredX ?? (player.templateId ? player.x : undefined),
            preferredY: input.preferredY ?? (player.templateId ? player.y : undefined),
        });
        await this.deferInitialSyncEmission();
        this.worldSyncService.emitInitialSync(binding.playerId, client);

        const bootstrapRecovery = await this.emitPostBootstrapState(client, binding.playerId);

        const bootstrapEntryPath = this.resolveBootstrapEntryPath(client);

        const bootstrapIdentitySource = this.resolveBootstrapIdentitySource(client);

        const bootstrapIdentityPersistedSource = this.resolveBootstrapIdentityPersistedSource(client);

        const bootstrapSnapshotSource = this.resolveBootstrapSnapshotSource(client);

        const bootstrapSnapshotPersistedSource = this.resolveBootstrapSnapshotPersistedSource(client);
        this.finalizeBootstrap({
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: player.templateId || input.mapId || 'unknown',
            requestedSessionId,
            protocol: client.data.protocol,
            isGm: client.data.isGm === true,
            entryPath: bootstrapEntryPath,
            identitySource: bootstrapIdentitySource,
            identityPersistedSource: bootstrapIdentityPersistedSource,
            snapshotSource: bootstrapSnapshotSource,
            snapshotPersistedSource: bootstrapSnapshotPersistedSource,
            bootstrapRecovery,
        });
    }
    /** 读取玩家快照；authenticated 主链只记录 主线专用 miss，不再做 runtime compat 回退。 */
    async loadPlayerSnapshot(playerId: string): Promise<PersistedPlayerSnapshot | null> {
        return this.snapshotBootstrapService.loadPlayerSnapshot(playerId);
    }
    /** 读取玩家快照并带上来源追踪。 */
    async loadPlayerSnapshotWithTrace(playerId: string, fallbackReason: string | null = null): Promise<BootstrapSnapshotTraceResult> {
        return this.snapshotBootstrapService.loadPlayerSnapshotWithTrace(playerId, fallbackReason);
    }
    /** 计算 authenticated 主链的 主线专用快照策略。 */
    resolveAuthenticatedSnapshotPolicy(identity: BootstrapIdentityLike, client: BootstrapClientLike | undefined = undefined) {
        return this.snapshotBootstrapService.resolveAuthenticatedSnapshotPolicy(identity, client);
    }
    /** 计算缺失快照时是否允许原生补齐。 */
    resolveAuthenticatedMissingSnapshotRecovery(identity: BootstrapIdentityLike) {
        return this.snapshotBootstrapService.resolveAuthenticatedMissingSnapshotRecovery(identity);
    }
    /** 针对 token_seed 身份做原生提升。 */
    async promoteAuthenticatedTokenSeedIdentity(identity: BootstrapIdentityLike, client: BootstrapClientLike) {
        return this.snapshotBootstrapService.promoteAuthenticatedTokenSeedIdentity(identity, client);
    }
    /** 当 bootstrap 已选择 native 快照时，要求 token_seed 身份必须同步归一到主线/native。 */
    async requireAuthenticatedTokenSeedNativeNormalization(identity: BootstrapIdentityLike, client: BootstrapClientLike, recoveryReason = 'unknown') {
        return this.snapshotBootstrapService.requireAuthenticatedTokenSeedNativeNormalization(identity, client, recoveryReason);
    }
    /** 加载鉴权玩家快照，并在必要时做恢复或提示。 */
    async loadAuthenticatedPlayerSnapshot(identity: BootstrapIdentityLike, client: BootstrapClientLike | undefined = undefined): Promise<PersistedPlayerSnapshot | null> {
        return this.snapshotBootstrapService.loadAuthenticatedPlayerSnapshot(identity, client);
    }
}
