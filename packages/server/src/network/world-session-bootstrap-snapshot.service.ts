import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import {
    BootstrapClientLike,
    BootstrapRecoveryContext,
    WorldSessionBootstrapContextHelper,
} from './world-session-bootstrap-context.helper';
import { WorldPlayerAuthService } from './world-player-auth.service';
import { WorldPlayerSnapshotService } from './world-player-snapshot.service';
import { recordAuthTrace } from './world-player-token.service';

const STRICT_NATIVE_SNAPSHOT_ENV_KEYS = [
    'SERVER_AUTH_REQUIRE_NATIVE_SNAPSHOT',
    'NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
];

const NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS = [
    'SERVER_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
    'NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
];

const NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES = new Set([
    'token_seed',
]);

interface BootstrapIdentityLike {
    userId?: string | null;
    playerId: string;
    playerName?: string | null;
    displayName?: string | null;
    authSource?: string | null;
    persistedSource?: string | null;
}

interface BootstrapQueuedNotice {
    id: string;
    kind: 'system';
    text: string;
    from: 'system';
    at: number;
}

interface BootstrapRecoveryNoticeResult extends BootstrapRecoveryContext {
    queuedNotice: BootstrapQueuedNotice;
}

interface BootstrapSnapshotTraceResult {
    snapshot: PersistedPlayerSnapshot | null;
    source: string;
    persistedSource: string | null;
    fallbackReason: string | null;
    seedPersisted: boolean;
}

interface BootstrapSnapshotPolicy {
    fallbackReason: string;
}

interface BootstrapMissingSnapshotRecoveryPolicy {
    allowNativeRecovery: boolean;
    recoveryReason: string;
}

interface BootstrapNormalizationError extends Error {
    failureStage?: string;
}

interface PlayerRuntimeNoticePort {
    queuePendingLogbookMessage(playerId: string, notice: {
        id: string;
        kind: 'system';
        text: string;
        from: 'system';
        at: number;
    }): void;
}

interface PlayerIdentityPersistencePromotionPort {
    isEnabled(): boolean;
    savePlayerIdentity(identity: {
        userId: string;
        username: string;
        displayName: string;
        playerId: string;
        playerName: string;
        persistedSource: 'native' | 'token_seed';
        updatedAt: number;
        authSource?: string | null;
    }): Promise<{
        persistedSource?: string | null;
        authSource?: string | null;
    } | null>;
}

function isStrictNativeSnapshotRequired() {
    for (const key of STRICT_NATIVE_SNAPSHOT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}

function isNativeSnapshotRecoveryEnabled() {
    for (const key of NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}

/** 负责 authenticated bootstrap 的 snapshot recovery、notice 与 trace 辅助。 */
@Injectable()
export class WorldSessionBootstrapSnapshotService {
    private readonly logger = new Logger(WorldSessionBootstrapSnapshotService.name);
    private readonly playerRuntimeService: PlayerRuntimeNoticePort | null;

    constructor(
        @Optional()
        @Inject(WorldSessionBootstrapContextHelper)
        private readonly contextHelper: WorldSessionBootstrapContextHelper | null = null,
        @Optional()
        @Inject(WorldPlayerSnapshotService)
        private readonly worldPlayerSnapshotService: WorldPlayerSnapshotService | null = null,
        @Optional()
        @Inject(WorldPlayerAuthService)
        private readonly worldPlayerAuthService: WorldPlayerAuthService | null = null,
        @Optional()
        @Inject(PlayerRuntimeService)
        playerRuntimeService: unknown = null,
    ) {
        this.playerRuntimeService = playerRuntimeService as PlayerRuntimeNoticePort | null;
    }

    private getContextHelper() {
        return this.contextHelper ?? new WorldSessionBootstrapContextHelper();
    }

    private getPlayerIdentityPersistenceService(): PlayerIdentityPersistencePromotionPort | null {
        const authService = this.worldPlayerAuthService as unknown as {
            ['playerIdentityPersistenceService']?: PlayerIdentityPersistencePromotionPort | null;
        } | null;
        return authService?.['playerIdentityPersistenceService'] ?? null;
    }

    resolveAuthenticatedSnapshotRecovery(client: BootstrapClientLike): BootstrapRecoveryContext | null {
        const contextHelper = this.getContextHelper();
        const directRecovery = contextHelper.consumeAuthenticatedSnapshotRecovery(client);
        if (directRecovery) {
            return directRecovery;
        }
        const snapshotSource = contextHelper.resolveBootstrapSnapshotSource(client);
        const identityPersistedSource = contextHelper.resolveBootstrapIdentityPersistedSource(client);
        const snapshotPersistedSource = contextHelper.resolveBootstrapSnapshotPersistedSource(client);
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

    buildAuthenticatedSnapshotRecoveryMessage(recovery: BootstrapRecoveryContext | null | undefined) {
        const identityPersistedSource = typeof recovery?.identityPersistedSource === 'string' ? recovery.identityPersistedSource.trim() : '';
        if (identityPersistedSource === 'token_seed') {
            return '检测到你是首次以 next 真源入场，角色数据已自动补齐为初始快照。';
        }
        return '检测到角色快照缺失，已自动补齐为 next 初始快照。';
    }

    emitAuthenticatedSnapshotRecoveryNotice(client: BootstrapClientLike, playerId: string): BootstrapRecoveryNoticeResult | null {
        const recovery = this.resolveAuthenticatedSnapshotRecovery(client);
        const playerRuntimeService = this.playerRuntimeService;
        if (!recovery || !playerRuntimeService) {
            return null;
        }

        const message = this.buildAuthenticatedSnapshotRecoveryMessage(recovery);
        const queuedNotice: BootstrapQueuedNotice = {
            id: `snapshot_recovery:${playerId}:${typeof recovery.identityPersistedSource === 'string' ? recovery.identityPersistedSource : 'unknown'}`,
            kind: 'system',
            text: message,
            from: 'system',
            at: Date.now(),
        };
        playerRuntimeService.queuePendingLogbookMessage(playerId, queuedNotice);
        return {
            ...recovery,
            queuedNotice,
        };
    }

    async loadPlayerSnapshot(playerId: string): Promise<PersistedPlayerSnapshot | null> {
        return this.worldPlayerSnapshotService?.loadPlayerSnapshot(playerId) ?? null;
    }

    async loadPlayerSnapshotWithTrace(playerId: string, fallbackReason: string | null = null): Promise<BootstrapSnapshotTraceResult> {
        if (this.worldPlayerSnapshotService?.loadPlayerSnapshotResult) {
            return this.worldPlayerSnapshotService.loadPlayerSnapshotResult(playerId, fallbackReason);
        }

        const snapshot = this.worldPlayerSnapshotService
            ? await this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, fallbackReason)
            : null;
        return {
            snapshot,
            source: snapshot ? 'unknown' : 'miss',
            persistedSource: null,
            fallbackReason,
            seedPersisted: false,
        };
    }

    resolveAuthenticatedSnapshotPolicy(identity: BootstrapIdentityLike, client: BootstrapClientLike | undefined = undefined): BootstrapSnapshotPolicy {
        const persistenceEnabled = Boolean(this.worldPlayerSnapshotService?.isPersistenceEnabled?.());
        if (persistenceEnabled && isStrictNativeSnapshotRequired()) {
            return { fallbackReason: 'strict_native_snapshot_required' };
        }

        const protocol = this.getContextHelper().resolveClientProtocol(client);
        void protocol;

        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (persistenceEnabled) {
            return {
                fallbackReason: authSource ? `persistence_enabled_blocked:${authSource}` : 'persistence_enabled_blocked:unknown',
            };
        }
        return {
            fallbackReason: authSource ? `identity_source:${authSource}` : 'identity_source:unknown',
        };
    }

    resolveAuthenticatedMissingSnapshotRecovery(identity: BootstrapIdentityLike): BootstrapMissingSnapshotRecoveryPolicy {
        if (!this.worldPlayerSnapshotService?.isPersistenceEnabled?.()) {
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

    async promoteAuthenticatedTokenSeedIdentity(identity: BootstrapIdentityLike, client: BootstrapClientLike) {
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        const normalizedUserId = typeof identity?.userId === 'string' ? identity.userId.trim() : '';
        const normalizedPlayerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
        const persistenceService = this.getPlayerIdentityPersistenceService();
        if (persistedSource !== 'token_seed' || !persistenceService?.isEnabled || !persistenceService.isEnabled()) {
            return identity;
        }
        const normalizedPlayerName = typeof identity?.playerName === 'string' && identity.playerName.trim()
            ? identity.playerName.trim()
            : normalizedPlayerId;
        const normalizedDisplayName = typeof identity?.displayName === 'string' && identity.displayName.trim()
            ? identity.displayName.trim()
            : normalizedPlayerName;
        const normalizedUsername = typeof (identity as { username?: unknown })?.username === 'string'
            && (identity as { username?: string }).username?.trim()
            ? (identity as { username?: string }).username!.trim()
            : normalizedPlayerName;
        if (!normalizedUserId || !normalizedPlayerId) {
            this.logger.warn(`玩家身份 token_seed 原生提升缺少必要字段：userId=${normalizedUserId || '未知'} playerId=${normalizedPlayerId || '未知'}`);
            return identity;
        }

        let promotedIdentity = null;
        try {
            promotedIdentity = await persistenceService.savePlayerIdentity({
                userId: normalizedUserId,
                username: normalizedUsername,
                displayName: normalizedDisplayName,
                playerId: normalizedPlayerId,
                playerName: normalizedPlayerName,
                persistedSource: 'native',
                updatedAt: Date.now(),
                authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
            });
        }
        catch (error) {
            this.logger.warn(`玩家身份 token_seed 原生提升失败：userId=${normalizedUserId} playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return identity;
        }

        const promotedPersistedSource = typeof promotedIdentity?.persistedSource === 'string'
            ? promotedIdentity.persistedSource.trim()
            : '';
        if (promotedPersistedSource !== 'native') {
            this.logger.warn(`玩家身份 token_seed 原生提升返回了异常 persistedSource：userId=${normalizedUserId} playerId=${normalizedPlayerId} actual=${promotedPersistedSource || '未知'}`);
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

    async requireAuthenticatedTokenSeedNativeNormalization(identity: BootstrapIdentityLike, client: BootstrapClientLike, recoveryReason = 'unknown') {
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource !== 'token_seed') {
            return identity;
        }
        const persistenceService = this.getPlayerIdentityPersistenceService();
        const persistenceEnabled = Boolean(persistenceService?.isEnabled && persistenceService.isEnabled());
        const promotedIdentity = await this.promoteAuthenticatedTokenSeedIdentity(identity, client);
        const promotedPersistedSource = typeof promotedIdentity?.persistedSource === 'string' ? promotedIdentity.persistedSource.trim() : '';
        const promotedAuthSource = typeof promotedIdentity?.authSource === 'string' ? promotedIdentity.authSource.trim() : '';
        if (promotedPersistedSource === 'native' && promotedAuthSource === 'next') {
            return promotedIdentity;
        }
        const normalizedUserId = typeof identity?.userId === 'string' ? identity.userId.trim() : '';
        const normalizedPlayerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
        const failureStage = !persistenceEnabled
            ? 'token_seed_native_promotion_persistence_disabled'
            : promotedPersistedSource && promotedPersistedSource !== 'token_seed'
                ? 'token_seed_native_promotion_invalid_result'
                : 'token_seed_native_promotion_failed';
        this.getContextHelper().clearAuthenticatedSnapshotRecovery(client);
        this.logger.warn(`玩家身份 token_seed 原生归一失败：userId=${normalizedUserId} playerId=${normalizedPlayerId} recoveryReason=${recoveryReason} stage=${failureStage} authSource=${promotedAuthSource || '未知'} persistedSource=${promotedPersistedSource || '未知'}`);
        const normalizationError: BootstrapNormalizationError = new Error(`Authenticated next player identity normalization failed after native snapshot selection: playerId=${normalizedPlayerId || 'unknown'} recoveryReason=${recoveryReason} stage=${failureStage}`);
        normalizationError.failureStage = failureStage;
        throw normalizationError;
    }

    async loadAuthenticatedPlayerSnapshot(identity: BootstrapIdentityLike, client: BootstrapClientLike | undefined = undefined): Promise<PersistedPlayerSnapshot | null> {
        const contextHelper = this.getContextHelper();
        contextHelper.rememberBootstrapIdentityPersistedSource(client, identity?.persistedSource ?? null);

        const fallbackPolicy = this.resolveAuthenticatedSnapshotPolicy(identity, client);
        const snapshotResult = await this.loadPlayerSnapshotWithTrace(identity.playerId, fallbackPolicy.fallbackReason);
        contextHelper.rememberBootstrapSnapshotContext(client, snapshotResult.source, snapshotResult.persistedSource);

        const snapshot = snapshotResult.snapshot;
        const identityPersistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        const snapshotPersistedSource = typeof snapshotResult.persistedSource === 'string' ? snapshotResult.persistedSource.trim() : '';
        const shouldRememberPreseededRecovery = Boolean(snapshot)
            && identityPersistedSource === 'token_seed'
            && snapshotPersistedSource === 'native';
        if (snapshot || !this.worldPlayerSnapshotService?.isPersistenceEnabled?.()) {
            if (shouldRememberPreseededRecovery) {
                await this.requireAuthenticatedTokenSeedNativeNormalization(identity, client, `persisted_source:${identityPersistedSource}`);
                contextHelper.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource,
                    recoveryReason: `persisted_source:${identityPersistedSource}`,
                });
            }
            else {
                contextHelper.clearAuthenticatedSnapshotRecovery(client);
            }
            return snapshot;
        }

        const recoveryPolicy = this.resolveAuthenticatedMissingSnapshotRecovery(identity);
        if (recoveryPolicy.allowNativeRecovery) {
            const recoveredSnapshot = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(identity.playerId);
            if (recoveredSnapshot.ok && recoveredSnapshot.snapshot) {
                try {
                    await this.requireAuthenticatedTokenSeedNativeNormalization(identity, client, recoveryPolicy.recoveryReason);
                }
                catch (error) {
                    const normalizationError = error as BootstrapNormalizationError;
                    recordAuthTrace({
                        type: 'snapshot_recovery',
                        playerId: identity.playerId,
                        authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
                        identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                        outcome: 'failure',
                        reason: recoveryPolicy.recoveryReason,
                        persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                        failureStage: typeof normalizationError.failureStage === 'string' ? normalizationError.failureStage : 'token_seed_native_promotion_failed',
                    });
                    throw error;
                }
                recordAuthTrace({
                    type: 'snapshot_recovery',
                    playerId: identity.playerId,
                    authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
                    identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                    outcome: 'success',
                    reason: recoveryPolicy.recoveryReason,
                    persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                    failureStage: null,
                });
                contextHelper.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource: recoveredSnapshot.persistedSource ?? null,
                    recoveryReason: recoveryPolicy.recoveryReason,
                });
                contextHelper.rememberBootstrapSnapshotContext(client, 'recovery_native', recoveredSnapshot.persistedSource ?? null);
                return recoveredSnapshot.snapshot;
            }
            recordAuthTrace({
                type: 'snapshot_recovery',
                playerId: identity.playerId,
                authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
                identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                outcome: 'failure',
                reason: recoveryPolicy.recoveryReason,
                persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                failureStage: recoveredSnapshot.failureStage ?? 'unknown',
            });
            contextHelper.clearAuthenticatedSnapshotRecovery(client);
            throw new Error(`Authenticated next player snapshot recovery failed while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason} stage=${recoveredSnapshot.failureStage ?? 'unknown'}`);
        }
        recordAuthTrace({
            type: 'snapshot_recovery',
            playerId: identity.playerId,
            authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
            identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
            outcome: 'blocked',
            reason: recoveryPolicy.recoveryReason,
            persistedSource: null,
            failureStage: null,
        });
        contextHelper.clearAuthenticatedSnapshotRecovery(client);
        throw new Error(`Authenticated next player snapshot missing while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason}`);
    }
}

export type {
    BootstrapIdentityLike,
    BootstrapMissingSnapshotRecoveryPolicy,
    BootstrapRecoveryNoticeResult,
    BootstrapSnapshotPolicy,
    BootstrapSnapshotTraceResult,
};
