/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */

/**
 * 世界网关 presence helper。
 * 收敛心跳节流、在线态持久化和断线态 presence 刷新。
 */

import { Injectable, Logger } from '@nestjs/common';
import {
    PlayerDomainPersistenceService,
    nextPlayerPersistenceVersion,
    isConvergedPlayerPresenceFenceError,
} from '../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

const PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS = 5_000;

/** 世界 socket presence helper：收敛心跳节流、在线态和断线态持久化。 */
@Injectable()
class WorldGatewayPresenceHelper {
    private readonly logger = new Logger(WorldGatewayPresenceHelper.name);
    presenceHeartbeatPersistedAtByPlayerId = new Map<string, number>();
    private readonly presenceHeartbeatPersistInFlightByPlayerId = new Map<string, Promise<void>>();

    constructor(
        private readonly playerDomainPersistenceService: PlayerDomainPersistenceService,
        private readonly playerRuntimeService: PlayerRuntimeService,
    ) {}

    async persistOfflinePresence(binding) {
        this.presenceHeartbeatPersistedAtByPlayerId.delete(binding.playerId);
        const disconnectPresence = this.playerDomainPersistenceService?.isEnabled?.()
            ? this.playerRuntimeService.describePersistencePresence(binding.playerId)
            : null;
        if (!disconnectPresence) {
            return;
        }
        try {
            await this.playerDomainPersistenceService.savePlayerPresence(binding.playerId, {
                ...disconnectPresence,
                online: false,
                inWorld: Boolean(disconnectPresence.inWorld),
                offlineSinceAt: Number.isFinite(Number(disconnectPresence.offlineSinceAt))
                    ? Math.max(0, Math.trunc(Number(disconnectPresence.offlineSinceAt)))
                    : Date.now(),
                versionSeed: nextPlayerPersistenceVersion(),
            });
        } catch (error) {
            if (isConvergedPlayerPresenceFenceError(error)) {
                // 玩家已被更新会话接管，离线 presence 写入过期即良性收敛，跳过而非报错。
                this.logger.debug(`脱机在线状态已被更新会话取代（fence 收敛），跳过：${binding.playerId}`);
                return;
            }
            // 非围栏错误必须传播给 disconnect/shutdown 编排器，不能伪报 presence 已落盘。
            throw error;
        }
    }

    handleHeartbeat(client) {
        const playerId = typeof client?.data?.playerId === 'string' ? client.data.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        this.playerRuntimeService.markHeartbeat(playerId);
        const heartbeatPresence = this.playerDomainPersistenceService?.isEnabled?.()
            ? this.playerRuntimeService.describePersistencePresence(playerId)
            : null;
        const now = Date.now();
        if (
            !heartbeatPresence
            || !this.shouldPersistHeartbeatPresence(playerId, now)
            || this.presenceHeartbeatPersistInFlightByPlayerId.has(playerId)
        ) {
            return;
        }
        const capturedDomainRevision = this.playerRuntimeService.getPersistenceDomainRevision?.(playerId, 'presence') ?? null;
        const capturedRuntimeRevision = this.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
        const persistPromise = this.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...heartbeatPresence,
            online: heartbeatPresence.online === true,
            inWorld: Boolean(heartbeatPresence.inWorld),
            offlineSinceAt: heartbeatPresence.online === true
                ? null
                : (Number.isFinite(Number(heartbeatPresence.offlineSinceAt))
                    ? Math.max(0, Math.trunc(Number(heartbeatPresence.offlineSinceAt)))
                    : now),
            versionSeed: nextPlayerPersistenceVersion(now),
        }).then(() => {
            this.presenceHeartbeatPersistedAtByPlayerId.set(playerId, now);
            // IO 期间可能已断线或换绑；只清除本次实际捕获的 presence 修订。
            const currentDomainRevision = this.playerRuntimeService.getPersistenceDomainRevision?.(
                playerId,
                'presence',
            ) ?? capturedDomainRevision;
            if (currentDomainRevision === capturedDomainRevision) {
                this.playerRuntimeService.markPersisted?.(
                    playerId,
                    new Set(['presence']),
                    capturedRuntimeRevision,
                );
            }
        }).catch((error) => {
            // 失败时不启动节流、不清 dirty；下一次心跳或常规 flush 会继续重试。
            this.logger.error(`刷新心跳在线状态失败：${playerId}`, error instanceof Error ? error.stack : String(error));
        }).finally(() => {
            if (this.presenceHeartbeatPersistInFlightByPlayerId.get(playerId) === persistPromise) {
                this.presenceHeartbeatPersistInFlightByPlayerId.delete(playerId);
            }
        });
        this.presenceHeartbeatPersistInFlightByPlayerId.set(playerId, persistPromise);
        return persistPromise;
    }

    shouldPersistHeartbeatPresence(playerId, now = Date.now()) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        const lastPersistedAt = Number(this.presenceHeartbeatPersistedAtByPlayerId.get(normalizedPlayerId) ?? 0);
        return !Number.isFinite(lastPersistedAt)
            || lastPersistedAt <= 0
            || now - lastPersistedAt >= PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS;
    }

    clearHeartbeatPresencePersistThrottle(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (normalizedPlayerId) {
            this.presenceHeartbeatPersistedAtByPlayerId.delete(normalizedPlayerId);
        }
    }
}

export { WorldGatewayPresenceHelper };
