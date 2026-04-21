import { Inject, Injectable, Optional } from '@nestjs/common';

import { WorldSessionService } from './world-session.service';
import {
    BootstrapClientLike,
    WorldSessionBootstrapContextHelper,
} from './world-session-bootstrap-context.helper';
import { WorldSessionBootstrapContractService } from './world-session-bootstrap-contract.service';

interface WorldRuntimeBootstrapSessionPort {
    connectPlayer(input: {
        playerId: string;
        sessionId?: string | null;
        instanceId?: string | null;
        mapId?: string | null;
        preferredX?: number;
        preferredY?: number;
    }, deps: unknown): unknown;
    removePlayer(playerId: string, reason: string, deps: unknown): unknown;
}

interface WorldRuntimeBootstrapLike {
    worldRuntimePlayerSessionService?: WorldRuntimeBootstrapSessionPort | null;
}

/** 负责 bootstrap 前后的 runtime player attach/detach 编排辅助。 */
@Injectable()
export class WorldSessionBootstrapRuntimeService {
    constructor(
        @Optional()
        private readonly worldSessionService: WorldSessionService | null = null,
        @Optional()
        @Inject(WorldSessionBootstrapContractService)
        private readonly contractService: WorldSessionBootstrapContractService | null = null,
        @Optional()
        @Inject(WorldSessionBootstrapContextHelper)
        private readonly contextHelper: WorldSessionBootstrapContextHelper | null = null,
    ) {}

    private getContractService() {
        return this.contractService ?? new WorldSessionBootstrapContractService(this.contextHelper, this.worldSessionService);
    }

    resolveWorldRuntimeBootstrapSessionPort(worldRuntimeService: unknown): WorldRuntimeBootstrapSessionPort | null {
        const runtime = worldRuntimeService as WorldRuntimeBootstrapLike | null | undefined;
        if (!runtime?.worldRuntimePlayerSessionService) {
            return null;
        }
        return runtime.worldRuntimePlayerSessionService;
    }

    connectBootstrapRuntimePlayer(
        worldRuntimeService: unknown,
        input: {
            playerId: string;
            sessionId?: string | null;
            instanceId?: string | null;
            mapId?: string | null;
            preferredX?: number;
            preferredY?: number;
        },
    ) {
        const port = this.resolveWorldRuntimeBootstrapSessionPort(worldRuntimeService);
        if (!port || typeof port.connectPlayer !== 'function') {
            throw new Error('bootstrap_runtime_connect_player_unavailable');
        }
        return port.connectPlayer(input, worldRuntimeService);
    }

    removeBootstrapRuntimePlayer(worldRuntimeService: unknown, playerId: string, reason: string) {
        const port = this.resolveWorldRuntimeBootstrapSessionPort(worldRuntimeService);
        if (!port || typeof port.removePlayer !== 'function') {
            throw new Error('bootstrap_runtime_remove_player_unavailable');
        }
        return port.removePlayer(playerId, reason, worldRuntimeService);
    }

    prepareBootstrapRuntime(client: BootstrapClientLike, playerId: string, worldRuntimeService: unknown) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.worldSessionService) {
            return;
        }

        const existingBinding = this.worldSessionService.getBinding(normalizedPlayerId);
        if (!existingBinding) {
            return;
        }

        const contractService = this.getContractService();
        const shouldBreakConnectedSessionReuse = existingBinding.connected === true
            && !contractService.shouldAllowConnectedSessionReuse(client);
        const shouldBreakDetachedResume = existingBinding.connected !== true
            && !contractService.shouldAllowImplicitDetachedResume(client);
        if (!shouldBreakConnectedSessionReuse && !shouldBreakDetachedResume) {
            return;
        }

        this.removeBootstrapRuntimePlayer(
            worldRuntimeService,
            normalizedPlayerId,
            shouldBreakConnectedSessionReuse ? 'replaced' : 'removed',
        );
    }
}
