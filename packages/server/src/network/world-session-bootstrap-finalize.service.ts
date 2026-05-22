/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * Bootstrap 完成收口服务。
 * 负责 bootstrap 完成后的日志记录与 auth-trace 审计写入。
 */

import { Injectable, Logger } from '@nestjs/common';

import { recordAuthTrace } from './world-player-token.service';

/** 负责 bootstrap 完成后的日志与 auth-trace 收口。 */
@Injectable()
export class WorldSessionBootstrapFinalizeService {
    private readonly logger = new Logger(WorldSessionBootstrapFinalizeService.name);

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
        bootstrapRecovery: {
            recoveryReason?: string | null;
            identityPersistedSource?: string | null;
            snapshotPersistedSource?: string | null;
        } | null;
    }) {
        this.logger.debug(
            `会话引导已就绪：playerId=${input.playerId} sessionId=${input.sessionId} mapId=${input.mapId || '未知'} requestedSessionId=${input.requestedSessionId ?? ''} protocol=${input.protocol ?? '未知'} gm=${input.isGm === true} entryPath=${input.entryPath ?? '未知'} identitySource=${input.identitySource ?? '未知'}`,
        );
        recordAuthTrace({
            type: 'bootstrap',
            playerId: input.playerId,
            sessionId: input.sessionId,
            mapId: input.mapId || 'unknown',
            requestedSessionId: input.requestedSessionId ?? null,
            gm: input.isGm === true,
            protocol: input.protocol ?? 'unknown',
            entryPath: input.entryPath,
            identitySource: input.identitySource,
            identityPersistedSource: input.identityPersistedSource,
            snapshotSource: input.snapshotSource,
            snapshotPersistedSource: input.snapshotPersistedSource,
            linkedIdentitySource: input.identitySource,
            linkedSnapshotSource: input.snapshotSource,
            linkedSnapshotPersistedSource: input.snapshotPersistedSource,
            recoveryOutcome: input.bootstrapRecovery ? 'success' : null,
            recoveryReason: typeof input.bootstrapRecovery?.recoveryReason === 'string'
                ? input.bootstrapRecovery.recoveryReason
                : null,
            recoveryIdentityPersistedSource: typeof input.bootstrapRecovery?.identityPersistedSource === 'string'
                ? input.bootstrapRecovery.identityPersistedSource
                : null,
            recoverySnapshotPersistedSource: typeof input.bootstrapRecovery?.snapshotPersistedSource === 'string'
                ? input.bootstrapRecovery.snapshotPersistedSource
                : null,
        });
    }
}
