import { Inject, Injectable, Optional } from '@nestjs/common';

import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

interface BootstrapRuntimePlayer {
    instanceId?: string | null;
    templateId?: string | null;
    x: number;
    y: number;
}

interface PlayerRuntimePort {
    loadOrCreatePlayer(
        playerId: string,
        sessionId: string,
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>,
    ): Promise<BootstrapRuntimePlayer>;
    setIdentity(playerId: string, input: {
        name?: string | null;
        displayName?: string | null;
    }): void;
    describePersistencePresence?(playerId: string): {
        online: boolean;
        inWorld: boolean;
        lastHeartbeatAt?: number | null;
        offlineSinceAt?: number | null;
        runtimeOwnerId?: string | null;
        sessionEpoch?: number | null;
        transferState?: string | null;
        transferTargetNodeId?: string | null;
        versionSeed?: number | null;
    } | null;
}

interface MailRuntimePort {
    ensurePlayerMailbox(playerId: string): Promise<void>;
    ensureWelcomeMail(playerId: string): Promise<void>;
}

/** 负责 bootstrap 阶段玩家初始化、身份回写与邮箱预热。 */
@Injectable()
export class WorldSessionBootstrapPlayerInitService {
    constructor(
        @Optional()
        @Inject(PlayerRuntimeService)
        private readonly playerRuntimeService: PlayerRuntimePort | null = null,
        @Optional()
        @Inject(PlayerDomainPersistenceService)
        private readonly playerDomainPersistenceService: PlayerDomainPersistenceService | null = null,
        @Optional()
        @Inject(MailRuntimeService)
        private readonly mailRuntimeService: MailRuntimePort | null = null,
    ) {}

    async initializeBootstrapPlayer(input: {
        playerId: string;
        sessionId: string;
        name?: string | null;
        displayName?: string | null;
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>;
    }): Promise<BootstrapRuntimePlayer> {
        if (!this.playerRuntimeService) {
            throw new Error('bootstrap_player_runtime_service_unavailable');
        }
        const player = await this.playerRuntimeService.loadOrCreatePlayer(
            input.playerId,
            input.sessionId,
            input.loadSnapshot,
        );
        this.playerRuntimeService.setIdentity(input.playerId, {
            name: input.name,
            displayName: input.displayName,
        });
        const presence = this.playerRuntimeService.describePersistencePresence?.(input.playerId) ?? null;
        if (presence) {
            await this.playerDomainPersistenceService?.savePlayerPresence(input.playerId, {
                ...presence,
                online: true,
                inWorld: Boolean(player.templateId),
                offlineSinceAt: null,
                versionSeed: Date.now(),
            });
        }
        await this.mailRuntimeService?.ensurePlayerMailbox(input.playerId);
        await this.mailRuntimeService?.ensureWelcomeMail(input.playerId);
        return player;
    }
}
