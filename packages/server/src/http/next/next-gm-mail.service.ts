import { Inject, Injectable } from '@nestjs/common';
import { PlayerPersistenceService } from '../../persistence/player-persistence.service';
import { MailRuntimeService } from '../../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { NEXT_GM_MAIL_RECIPIENT_CONTRACT } from './next-gm-contract';
import { isNextGmBotPlayerId } from './next-gm.constants';

interface PlayerSnapshotLike {
  playerId: string;
}

interface MailRuntimeServiceLike {
  createDirectMail(playerId: string, input: unknown): Promise<string>;
}

interface PlayerPersistenceServiceLike {
  listPlayerSnapshots(): Promise<PlayerSnapshotLike[]>;
}

interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
}

@Injectable()
export class NextGmMailService {
  constructor(
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeServiceLike,
    @Inject(PlayerPersistenceService) private readonly playerPersistenceService: PlayerPersistenceServiceLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
  ) {}

  async createDirectMail(playerId: string, input?: unknown) {
    return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
  }

  async collectBroadcastRecipientPlayerIds(): Promise<string[]> {
    const runtimePlayerIds: string[] = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNextGmBotPlayerId(entry.playerId))
      .map((entry) => entry.playerId);
    const deliveredPlayerIds = new Set(runtimePlayerIds);

    if (NEXT_GM_MAIL_RECIPIENT_CONTRACT.persistedFallbackRecipients !== 'persisted_non_runtime_non_bot_players') {
      return runtimePlayerIds;
    }

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const entry of persistedEntries) {
      if (isNextGmBotPlayerId(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
        continue;
      }
      deliveredPlayerIds.add(entry.playerId);
    }

    return Array.from(deliveredPlayerIds);
  }

  async createBroadcastMail(input?: unknown) {
    const deliveredMailIds: string[] = [];
    const batchId = `broadcast:${Date.now().toString(36)}`;

    for (const playerId of await this.collectBroadcastRecipientPlayerIds()) {
      deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
    }

    return {
      mailId: deliveredMailIds[0] ?? batchId,
      batchId,
      recipientCount: deliveredMailIds.length,
    };
  }
}
