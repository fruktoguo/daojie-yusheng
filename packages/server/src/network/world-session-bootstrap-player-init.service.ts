import { Inject, Injectable, Optional } from '@nestjs/common';

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
        await this.mailRuntimeService?.ensurePlayerMailbox(input.playerId);
        await this.mailRuntimeService?.ensureWelcomeMail(input.playerId);
        return player;
    }
}
