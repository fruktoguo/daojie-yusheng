// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayPresenceHelper = void 0;

const PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS = 5_000;

/** 世界 socket presence helper：收敛心跳节流、在线态和断线态持久化。 */
class WorldGatewayPresenceHelper {
    gateway;
    presenceHeartbeatPersistedAtByPlayerId = new Map();

    constructor(gateway) {
        this.gateway = gateway;
    }

    async persistOfflinePresence(binding) {
        this.presenceHeartbeatPersistedAtByPlayerId.delete(binding.playerId);
        const disconnectPresence = this.gateway.playerDomainPersistenceService?.isEnabled?.()
            ? this.gateway.playerRuntimeService.describePersistencePresence(binding.playerId)
            : null;
        if (!disconnectPresence) {
            return;
        }
        await this.gateway.playerDomainPersistenceService.savePlayerPresence(binding.playerId, {
            ...disconnectPresence,
            online: false,
            inWorld: false,
            offlineSinceAt: Date.now(),
            versionSeed: Date.now(),
        }).catch((error) => {
            this.gateway.logger.error(`刷新脱机 presence 失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
    }

    handleHeartbeat(client) {
        const playerId = typeof client?.data?.playerId === 'string' ? client.data.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        this.gateway.playerRuntimeService.markHeartbeat(playerId);
        const heartbeatPresence = this.gateway.playerDomainPersistenceService?.isEnabled?.()
            ? this.gateway.playerRuntimeService.describePersistencePresence(playerId)
            : null;
        const now = Date.now();
        if (!heartbeatPresence || !this.shouldPersistHeartbeatPresence(playerId, now)) {
            return;
        }
        void this.gateway.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...heartbeatPresence,
            online: true,
            inWorld: Boolean(heartbeatPresence.inWorld),
            offlineSinceAt: null,
            versionSeed: now,
        }).catch((error) => {
            this.gateway.logger.error(`刷新心跳 presence 失败：${playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.presenceHeartbeatPersistedAtByPlayerId.set(playerId, now);
        this.gateway.playerRuntimeService.markPersisted?.(playerId);
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
exports.WorldGatewayPresenceHelper = WorldGatewayPresenceHelper;

export { WorldGatewayPresenceHelper };
