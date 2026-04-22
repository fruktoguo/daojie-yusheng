import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { WorldSessionService } from './world-session.service';
import {
    BootstrapClientLike,
    BootstrapContractContext,
    BootstrapContractViolation,
    BootstrapSessionInput,
    BootstrapSessionReusePolicy,
    WorldSessionBootstrapContextHelper,
} from './world-session-bootstrap-context.helper';

const AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS = new Set([
    'connect_token',
    'connect_gm_token',
]);

const AUTHENTICATED_REUSE_PERSISTED_SOURCES = new Set([
    'native',
]);

const AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES = new Set([
    'token_seed',
]);

const BOOTSTRAP_ALLOWED_IDENTITY_SOURCES = new Set([
    'mainline',
    'token',
]);

const BOOTSTRAP_ALLOWED_MAINLINE_PERSISTED_SOURCES = new Set([
    'native',
]);

/** 负责 bootstrap 合同、session 复用策略和 requestedSessionId 裁定。 */
@Injectable()
export class WorldSessionBootstrapContractService {
    private readonly logger = new Logger(WorldSessionBootstrapContractService.name);

    constructor(
        @Optional()
        @Inject(WorldSessionBootstrapContextHelper)
        private readonly contextHelper: WorldSessionBootstrapContextHelper | null = null,
        @Optional()
        private readonly worldSessionService: WorldSessionService | null = null,
    ) {}

    private getContextHelper() {
        return this.contextHelper ?? new WorldSessionBootstrapContextHelper();
    }

    inspectRequestedSessionId(rawSessionId: unknown, client: BootstrapClientLike, source = 'socket') {
        return this.getContextHelper().inspectRequestedSessionId(rawSessionId, client, source);
    }

    inspectSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.getContextHelper().inspectSocketRequestedSessionId(client);
    }

    pickSocketRequestedSessionId(client: BootstrapClientLike) {
        return this.getContextHelper().pickSocketRequestedSessionId(client);
    }

    resolveBootstrapContractContext(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined): BootstrapContractContext {
        const contextHelper = this.getContextHelper();
        const entryPath = contextHelper.resolveBootstrapEntryPath(client);
        const protocol = contextHelper.resolveClientProtocol(client);
        const identitySource = contextHelper.resolveAuthenticatedBootstrapIdentitySource(client, input);
        const identityPersistedSource = contextHelper.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
        const effectiveIdentitySource = identitySource === 'mainline' && identityPersistedSource === 'token_seed'
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

    resolveAuthenticatedBootstrapContractViolation(client: BootstrapClientLike, input: BootstrapSessionInput | undefined = undefined): BootstrapContractViolation | null {
        const contract = this.resolveBootstrapContractContext(client, input);
        if (!contract.isAuthenticatedEntry || contract.protocol !== 'mainline') {
            return null;
        }
        const authSource = contract.identitySource;
        const persistedSource = contract.identityPersistedSource;
        if (!BOOTSTRAP_ALLOWED_IDENTITY_SOURCES.has(authSource ?? '')) {
            return {
                stage: 'mainline_bootstrap_identity_source_blocked',
                message: `主线协议 bootstrap 不接受 ${authSource || 'unknown'} 身份来源`,
            };
        }
        if (!persistedSource) {
            return {
                stage: 'mainline_bootstrap_persisted_source_missing',
                message: '主线协议 bootstrap 缺少持久化身份来源',
            };
        }
        if (authSource === 'token' && !AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'mainline_bootstrap_token_persisted_source_invalid',
                message: `主线协议 token 身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        if (authSource === 'mainline' && !BOOTSTRAP_ALLOWED_MAINLINE_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'mainline_bootstrap_mainline_persisted_source_invalid',
                message: `主线协议主线身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        return null;
    }

    resolveBootstrapSessionReusePolicy(client: BootstrapClientLike): BootstrapSessionReusePolicy {
        const contract = this.resolveBootstrapContractContext(client);
        if (contract.isGm) {
            return {
                allowImplicitDetachedResume: false,
                allowRequestedDetachedResume: false,
                allowConnectedSessionReuse: false,
            };
        }
        if (contract.isAuthenticatedEntry) {
            const allowAuthenticatedReuse = contract.effectiveIdentitySource === 'mainline'
                && AUTHENTICATED_REUSE_PERSISTED_SOURCES.has(contract.identityPersistedSource ?? '');
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

    shouldAllowImplicitDetachedResume(client: BootstrapClientLike) {
        return this.resolveBootstrapSessionReusePolicy(client).allowImplicitDetachedResume;
    }

    shouldAllowConnectedSessionReuse(client: BootstrapClientLike) {
        return this.resolveBootstrapSessionReusePolicy(client).allowConnectedSessionReuse;
    }

    shouldAllowRequestedDetachedResume(client: BootstrapClientLike) {
        return this.resolveBootstrapSessionReusePolicy(client).allowRequestedDetachedResume;
    }

    resolveBootstrapRequestedSessionId(client: BootstrapClientLike, requestedSessionId: string | null | undefined) {
        const normalizedSessionId = this.worldSessionService?.normalizeRequestedSessionId
            ? this.worldSessionService.normalizeRequestedSessionId(requestedSessionId)
            : this.inspectRequestedSessionId(requestedSessionId, client, 'bootstrap').sessionId;
        if (!normalizedSessionId) {
            return undefined;
        }
        if (!this.shouldAllowRequestedDetachedResume(client)) {
            this.logger.debug(`bootstrap requested sessionId 已忽略：socket=${client?.id ?? '未知'} sessionId=${normalizedSessionId}`);
            return undefined;
        }
        return normalizedSessionId;
    }
}
