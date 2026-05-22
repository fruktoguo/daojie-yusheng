/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * Bootstrap 会话绑定服务。
 * 负责 authenticated bootstrap 前置校验、requestedSessionId 裁定与 session 注册绑定。
 */

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
    forceRuntimeSessionRebind?: boolean;
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
        @Inject(WorldSessionService)
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
        const previousBinding = this.worldSessionService.getBinding(input.playerId);
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
            forceRuntimeSessionRebind: previousBinding?.connected === true
                && typeof previousBinding.socketId === 'string'
                && previousBinding.socketId !== client.id,
        };
    }
}
