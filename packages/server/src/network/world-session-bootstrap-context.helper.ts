import { Injectable, Logger } from '@nestjs/common';

import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';

const MAX_REQUESTED_SESSION_ID_LENGTH = 128;

const REQUESTED_SESSION_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;

interface BootstrapRecoveryContext {
    identityPersistedSource: string | null;
    snapshotPersistedSource: string | null;
    recoveryReason: string;
}

interface BootstrapClientData {
    protocol?: string | null;
    isGm?: boolean;
    playerId?: string;
    sessionId?: string;
    userId?: string;
    bootstrapEntryPath?: string | null;
    bootstrapIdentitySource?: string | null;
    bootstrapIdentityPersistedSource?: string | null;
    bootstrapSnapshotSource?: string | null;
    bootstrapSnapshotPersistedSource?: string | null;
    authenticatedSnapshotRecovery?: BootstrapRecoveryContext | null;
    authenticatedSnapshotRecoveryFallback?: BootstrapRecoveryContext | null;
    prefilledPendingLogbookMessageIds?: Set<string> | null;
}

interface BootstrapClientLike {
    id?: string;
    data?: BootstrapClientData;
    handshake?: {
        auth?: {
            token?: unknown;
            gmToken?: unknown;
            sessionId?: unknown;
        };
    };
}

interface BootstrapSessionInput {
    playerId: string;
    requestedSessionId?: string | null;
    authSource?: string | null;
    persistedSource?: string | null;
    name?: string | null;
    displayName?: string | null;
    instanceId?: string | null;
    mapId?: string | null;
    preferredX?: number | null;
    preferredY?: number | null;
    loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>;
}

interface BootstrapContractContext {
    entryPath: string | null;
    protocol: string | null;
    identitySource: string | null;
    identityPersistedSource: string | null;
    effectiveIdentitySource: string | null;
    isAuthenticatedEntry: boolean;
    isGm: boolean;
}

interface BootstrapContractViolation {
    stage: string;
    message: string;
}

interface BootstrapSessionReusePolicy {
    allowImplicitDetachedResume: boolean;
    allowRequestedDetachedResume: boolean;
    allowConnectedSessionReuse: boolean;
}

interface BootstrapRequestedSessionInspection {
    sessionId: string;
    error: 'too_long' | 'invalid_chars' | null;
}

/** 负责 bootstrap 阶段 socket/client data 的轻量上下文解析与缓存读写。 */
@Injectable()
export class WorldSessionBootstrapContextHelper {
    private readonly logger = new Logger(WorldSessionBootstrapContextHelper.name);

    pickSocketToken(client: BootstrapClientLike) {
        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }

    pickSocketGmToken(client: BootstrapClientLike) {
        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }

    inspectRequestedSessionId(rawSessionId: unknown, client: BootstrapClientLike, source = 'socket'): BootstrapRequestedSessionInspection {
        if (typeof rawSessionId !== 'string') {
            return { sessionId: '', error: null };
        }
        const normalizedSessionId = rawSessionId.trim();
        if (!normalizedSessionId) {
            return { sessionId: '', error: null };
        }
        if (normalizedSessionId.length > MAX_REQUESTED_SESSION_ID_LENGTH) {
            this.logger.warn(`${source} 请求的 sessionId 过长，已拒绝：socket=${client?.id ?? '未知'} length=${normalizedSessionId.length}`);
            return { sessionId: '', error: 'too_long' };
        }
        if (!REQUESTED_SESSION_ID_PATTERN.test(normalizedSessionId)) {
            this.logger.warn(`${source} 请求的 sessionId 含非法字符，已拒绝：socket=${client?.id ?? '未知'}`);
            return { sessionId: '', error: 'invalid_chars' };
        }
        return { sessionId: normalizedSessionId, error: null };
    }

    inspectSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.inspectRequestedSessionId(client.handshake?.auth?.sessionId, client, 'socket');
    }

    pickSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.inspectSocketRequestedSessionId(client).sessionId;
    }

    resolveBootstrapEntryPath(client: BootstrapClientLike) {
        const entryPath = client?.data?.bootstrapEntryPath;
        return typeof entryPath === 'string' && entryPath.trim() ? entryPath.trim() : null;
    }

    resolveBootstrapIdentitySource(client: BootstrapClientLike) {
        const identitySource = client?.data?.bootstrapIdentitySource;
        return typeof identitySource === 'string' && identitySource.trim() ? identitySource.trim() : null;
    }

    resolveBootstrapIdentityPersistedSource(client: BootstrapClientLike) {
        const identityPersistedSource = client?.data?.bootstrapIdentityPersistedSource;
        return typeof identityPersistedSource === 'string' && identityPersistedSource.trim() ? identityPersistedSource.trim() : null;
    }

    resolveBootstrapSnapshotSource(client: BootstrapClientLike) {
        const snapshotSource = client?.data?.bootstrapSnapshotSource;
        return typeof snapshotSource === 'string' && snapshotSource.trim() ? snapshotSource.trim() : null;
    }

    resolveBootstrapSnapshotPersistedSource(client: BootstrapClientLike) {
        const snapshotPersistedSource = client?.data?.bootstrapSnapshotPersistedSource;
        return typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim() ? snapshotPersistedSource.trim() : null;
    }

    resolveClientProtocol(client: BootstrapClientLike) {
        const protocol = client?.data?.protocol;
        return typeof protocol === 'string' && protocol.trim() ? protocol.trim().toLowerCase() : null;
    }

    resolveAuthenticatedBootstrapIdentitySource(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        const authSource = typeof input?.authSource === 'string' ? input.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        return this.resolveBootstrapIdentitySource(client);
    }

    resolveAuthenticatedBootstrapIdentityPersistedSource(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        const persistedSource = typeof input?.persistedSource === 'string' ? input.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        return this.resolveBootstrapIdentityPersistedSource(client);
    }

    rememberAuthenticatedBootstrapIdentity(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined) {
        if (!client?.data
            || !input
            || (typeof input?.authSource !== 'string' && typeof input?.persistedSource !== 'string')) {
            return;
        }
        client.data.bootstrapIdentitySource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
        client.data.bootstrapIdentityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
    }

    rememberBootstrapSnapshotContext(client: BootstrapClientLike, snapshotSource: string | null, snapshotPersistedSource: string | null = null) {
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

    rememberBootstrapIdentityPersistedSource(client: BootstrapClientLike, identityPersistedSource: string | null | undefined) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapIdentityPersistedSource = typeof identityPersistedSource === 'string' && identityPersistedSource.trim()
            ? identityPersistedSource.trim()
            : null;
    }

    clearAuthenticatedSnapshotRecovery(client: BootstrapClientLike) {
        if (!client?.data) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = null;
        client.data.authenticatedSnapshotRecoveryFallback = null;
    }

    rememberAuthenticatedSnapshotRecovery(client: BootstrapClientLike, recovery: BootstrapRecoveryContext | null | undefined) {
        if (!client?.data || !recovery) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = recovery;
        client.data.authenticatedSnapshotRecoveryFallback = { ...recovery };
    }

    consumeAuthenticatedSnapshotRecovery(client: BootstrapClientLike): BootstrapRecoveryContext | null {
        const recovery = client?.data?.authenticatedSnapshotRecovery ?? client?.data?.authenticatedSnapshotRecoveryFallback ?? null;
        if (client?.data) {
            client.data.authenticatedSnapshotRecovery = null;
            client.data.authenticatedSnapshotRecoveryFallback = null;
        }
        return recovery && typeof recovery === 'object' ? recovery : null;
    }
}

export type {
    BootstrapClientLike,
    BootstrapContractContext,
    BootstrapContractViolation,
    BootstrapRecoveryContext,
    BootstrapSessionInput,
    BootstrapSessionReusePolicy,
};
