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
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

const PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS = 5_000;

/** 世界 socket presence helper：收敛心跳节流、在线态和断线态持久化。 */
@Injectable()
class WorldGatewayPresenceHelper {
    private readonly logger = new Logger(WorldGatewayPresenceHelper.name);
    presenceHeartbeatPersistedAtByPlayerId = new Map();

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
        await this.playerDomainPersistenceService.savePlayerPresence(binding.playerId, {
            ...disconnectPresence,
            online: false,
            inWorld: Boolean(disconnectPresence.inWorld),
            offlineSinceAt: Date.now(),
            versionSeed: Date.now(),
        }).catch((error) => {
            this.logger.error(`刷新脱机在线状态失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
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
        if (!heartbeatPresence || !this.shouldPersistHeartbeatPresence(playerId, now)) {
            return;
        }
        void this.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...heartbeatPresence,
            online: true,
            inWorld: Boolean(heartbeatPresence.inWorld),
            offlineSinceAt: null,
            versionSeed: now,
        }).catch((error) => {
            this.logger.error(`刷新心跳在线状态失败：${playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.presenceHeartbeatPersistedAtByPlayerId.set(playerId, now);
        this.playerRuntimeService.markPersisted?.(playerId, new Set(['presence']), null);
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
