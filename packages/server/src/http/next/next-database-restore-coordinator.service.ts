import { Inject, Injectable } from '@nestjs/common';
import { WorldSessionService } from '../../network/world-session.service';
import { WorldSyncService } from '../../network/world-sync.service';
import { MapPersistenceFlushService } from '../../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
import { MailRuntimeService } from '../../runtime/mail/mail-runtime.service';
import { MarketRuntimeService } from '../../runtime/market/market-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { NEXT_GM_RESTORE_CONTRACT } from './next-gm-contract';

interface PlayerSnapshotLike {
  playerId: string;
}

interface WorldSessionServiceLike {
  purgeAllSessions(reason: string): void;
}

interface WorldRuntimeServiceLike {
  removePlayer(playerId: string): void;
  rebuildPersistentRuntimeAfterRestore(): Promise<void>;
}

interface WorldSyncServiceLike {
  clearDetachedPlayerCaches(playerId: string): void;
}

interface FlushServiceLike {
  flushAllNow(): Promise<void>;
}

interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
}

interface MailRuntimeServiceLike {
  clearRuntimeCache(): void;
}

interface MarketRuntimeServiceLike {
  reloadFromPersistence(): Promise<void>;
}

interface SuggestionRuntimeServiceLike {
  reloadFromPersistence(): Promise<void>;
}

interface RuntimeGmAuthServiceLike {
  reloadPasswordRecordFromPersistence(): Promise<void>;
}

@Injectable()
export class NextDatabaseRestoreCoordinatorService {
  constructor(
    @Inject(WorldSessionService) private readonly worldSessionService: WorldSessionServiceLike,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(WorldSyncService) private readonly worldSyncService: WorldSyncServiceLike,
    @Inject(PlayerPersistenceFlushService) private readonly playerPersistenceFlushService: FlushServiceLike,
    @Inject(MapPersistenceFlushService) private readonly mapPersistenceFlushService: FlushServiceLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeServiceLike,
    @Inject(MarketRuntimeService) private readonly marketRuntimeService: MarketRuntimeServiceLike,
    @Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike,
    @Inject(RuntimeGmAuthService) private readonly runtimeGmAuthService: RuntimeGmAuthServiceLike,
  ) {}

  async prepareForRestore(): Promise<void> {
    if (NEXT_GM_RESTORE_CONTRACT.flushPlayersBeforeRestore) {
      await this.playerPersistenceFlushService.flushAllNow();
    }
    if (NEXT_GM_RESTORE_CONTRACT.flushMapsBeforeRestore) {
      await this.mapPersistenceFlushService.flushAllNow();
    }

    const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots().map((entry) => entry.playerId);
    if (NEXT_GM_RESTORE_CONTRACT.purgeSessionsBeforeRestore) {
      this.worldSessionService.purgeAllSessions('database_restore');
    }

    for (const playerId of runtimePlayerIds) {
      this.worldRuntimeService.removePlayer(playerId);
      if (NEXT_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
        this.worldSyncService.clearDetachedPlayerCaches(playerId);
      }
    }

    this.mailRuntimeService.clearRuntimeCache();
  }

  async reloadAfterRestore(): Promise<void> {
    if (NEXT_GM_RESTORE_CONTRACT.reloadWorldRuntimeAfterRestore) {
      await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore();
    }
    if (NEXT_GM_RESTORE_CONTRACT.reloadMarketAfterRestore) {
      await this.marketRuntimeService.reloadFromPersistence();
    }

    this.mailRuntimeService.clearRuntimeCache();

    if (NEXT_GM_RESTORE_CONTRACT.reloadSuggestionAfterRestore) {
      await this.suggestionRuntimeService.reloadFromPersistence();
    }
    if (NEXT_GM_RESTORE_CONTRACT.reloadGmAuthAfterRestore) {
      await this.runtimeGmAuthService.reloadPasswordRecordFromPersistence();
    }
  }
}
