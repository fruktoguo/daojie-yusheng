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
import { NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
/**
 * PlayerSnapshotLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerSnapshotLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}
/**
 * WorldSessionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldSessionServiceLike {
  purgeAllSessions(reason: string): void;
}
/**
 * WorldRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldRuntimeServiceLike {
  worldRuntimePlayerSessionService: {
    removePlayer(playerId: string, reason: string, deps: unknown): void;
  };
  rebuildPersistentRuntimeAfterRestore(): Promise<void>;
}
/**
 * WorldSyncServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldSyncServiceLike {
  clearDetachedPlayerCaches(playerId: string): void;
}
/**
 * FlushServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface FlushServiceLike {
  flushAllNow(): Promise<void>;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
}
/**
 * MailRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface MailRuntimeServiceLike {
  clearRuntimeCache(): void;
}
/**
 * MarketRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface MarketRuntimeServiceLike {
  reloadFromPersistence(): Promise<void>;
}
/**
 * SuggestionRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionRuntimeServiceLike {
  reloadFromPersistence(): Promise<void>;
}
/**
 * RuntimeGmAuthServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmAuthServiceLike {
  reloadPasswordRecordFromPersistence(): Promise<void>;
}
/**
 * NativeDatabaseRestoreCoordinatorService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeDatabaseRestoreCoordinatorService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldSessionService WorldSessionServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @param worldSyncService WorldSyncServiceLike 参数说明。
 * @param playerPersistenceFlushService FlushServiceLike 参数说明。
 * @param mapPersistenceFlushService FlushServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @param mailRuntimeService MailRuntimeServiceLike 参数说明。
 * @param marketRuntimeService MarketRuntimeServiceLike 参数说明。
 * @param suggestionRuntimeService SuggestionRuntimeServiceLike 参数说明。
 * @param runtimeGmAuthService RuntimeGmAuthServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

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
  /**
 * prepareForRestore：执行prepareForRestore相关逻辑。
 * @returns 返回 Promise，完成后得到prepareForRestore。
 */


  async prepareForRestore(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (NATIVE_GM_RESTORE_CONTRACT.flushPlayersBeforeRestore) {
      await this.playerPersistenceFlushService.flushAllNow();
    }
    if (NATIVE_GM_RESTORE_CONTRACT.flushMapsBeforeRestore) {
      await this.mapPersistenceFlushService.flushAllNow();
    }

    const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots().map((entry) => entry.playerId);
    if (NATIVE_GM_RESTORE_CONTRACT.purgeSessionsBeforeRestore) {
      this.worldSessionService.purgeAllSessions('database_restore');
    }

    for (const playerId of runtimePlayerIds) {
      this.worldRuntimeService.worldRuntimePlayerSessionService.removePlayer(playerId, 'removed', this.worldRuntimeService);
      if (NATIVE_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
        this.worldSyncService.clearDetachedPlayerCaches(playerId);
      }
    }

    this.mailRuntimeService.clearRuntimeCache();
  }  
  /**
 * reloadAfterRestore：读取reloadAfterRestore并返回结果。
 * @returns 返回 Promise，完成后得到reloadAfterRestore。
 */


  async reloadAfterRestore(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (NATIVE_GM_RESTORE_CONTRACT.reloadWorldRuntimeAfterRestore) {
      await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore();
    }
    if (NATIVE_GM_RESTORE_CONTRACT.reloadMarketAfterRestore) {
      await this.marketRuntimeService.reloadFromPersistence();
    }

    this.mailRuntimeService.clearRuntimeCache();

    if (NATIVE_GM_RESTORE_CONTRACT.reloadSuggestionAfterRestore) {
      await this.suggestionRuntimeService.reloadFromPersistence();
    }
    if (NATIVE_GM_RESTORE_CONTRACT.reloadGmAuthAfterRestore) {
      await this.runtimeGmAuthService.reloadPasswordRecordFromPersistence();
    }
  }
}
