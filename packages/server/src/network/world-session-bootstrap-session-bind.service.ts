import { Inject, Injectable, Optional } from '@nestjs/common';

import {
    BootstrapClientLike,
    BootstrapSessionInput,
    WorldSessionBootstrapContextHelper,
} from './world-session-bootstrap-context.helper';
import { WorldSessionBootstrapContractService } from './world-session-bootstrap-contract.service';
import { WorldSessionBinding, WorldSessionService } from './world-session.service';

interface BootstrapSessionBindResult {
    binding: WorldSessionBinding;
    requestedSessionId?: string;
}

interface BootstrapSocketLike extends BootstrapClientLike {
    id: string;
    emit(event: string, payload: unknown): void;
    disconnect(close?: boolean): void;
}

/** 负责 authenticated bootstrap 前置校验、requestedSessionId 裁定与 session 绑定。 */
@Injectable()
export class WorldSessionBootstrapSessionBindService {
    constructor(
        @Optional()
        @Inject(WorldSessionBootstrapContextHelper)
        private readonly contextHelper: WorldSessionBootstrapContextHelper | null = null,
        @Optional()
        @Inject(WorldSessionBootstrapContractService)
        private readonly contractService: WorldSessionBootstrapContractService | null = null,
        @Optional()
        private readonly worldSessionService: WorldSessionService | null = null,
    ) {}

    private getContextHelper() {
        return this.contextHelper ?? new WorldSessionBootstrapContextHelper();
    }

    private getContractService() {
        return this.contractService ?? new WorldSessionBootstrapContractService(this.getContextHelper(), this.worldSessionService);
    }

    prepareAuthenticatedBootstrap(client: BootstrapClientLike, input: BootstrapSessionInput): void {
        this.getContextHelper().rememberAuthenticatedBootstrapIdentity(client, input);
        const authenticatedBootstrapContractViolation = this.getContractService().resolveAuthenticatedBootstrapContractViolation(client, input);
        if (authenticatedBootstrapContractViolation) {
            throw new Error(authenticatedBootstrapContractViolation.stage);
        }
    }

    registerBootstrapSession(client: BootstrapClientLike, input: BootstrapSessionInput): BootstrapSessionBindResult {
        if (!this.worldSessionService) {
            throw new Error('bootstrap_session_service_unavailable');
        }

        const contractService = this.getContractService();
        const requestedSessionId = contractService.resolveBootstrapRequestedSessionId(client, input.requestedSessionId);
        const sessionReusePolicy = contractService.resolveBootstrapSessionReusePolicy(client);
        const binding = this.worldSessionService.registerSocket(client as BootstrapSocketLike, input.playerId, requestedSessionId, {
            allowImplicitDetachedResume: sessionReusePolicy.allowImplicitDetachedResume,
            allowRequestedDetachedResume: sessionReusePolicy.allowRequestedDetachedResume,
            allowConnectedSessionReuse: sessionReusePolicy.allowConnectedSessionReuse,
        });
        client.data.playerId = binding.playerId;
        client.data.sessionId = binding.sessionId;
        return {
            binding,
            requestedSessionId,
        };
    }
}
