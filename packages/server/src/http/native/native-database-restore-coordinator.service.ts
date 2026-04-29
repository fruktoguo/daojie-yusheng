import { Inject, Injectable } from '@nestjs/common';
import { WorldSessionService } from '../../network/world-session.service';
import { WorldSyncService } from '../../network/world-sync.service';
import { MapPersistenceFlushService } from '../../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { PlayerSessionRouteService } from '../../persistence/player-session-route.service';
import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
import { MailRuntimeService } from '../../runtime/mail/mail-runtime.service';
import { MarketRuntimeService } from '../../runtime/market/market-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
import { NativePlayerAuthStoreService } from './native-player-auth-store.service';
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
 * ExpiredBindingLike：定义接口结构约束，明确可交付字段含义。
 */


interface ExpiredBindingLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
/**
 * sessionId：会话ID标识。
 */

  sessionId?: string | null;
/**
 * sessionEpoch：会话 epoch。
 */

  sessionEpoch?: number | null;
/**
 * connected：连接状态标记。
 */

  connected?: boolean;
/**
 * detachedAt：脱机时间戳。
 */

  detachedAt?: number | null;
/**
 * expireAt：过期时间戳。
 */

  expireAt?: number | null;
}
/**
 * WorldSessionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldSessionServiceLike {
  purgeAllSessions(reason: string): string[];
  consumeExpiredBindings?(): ExpiredBindingLike[];
  requeueExpiredBinding?(binding: ExpiredBindingLike | null | undefined): boolean;
  acknowledgePurgedPlayerIds?(playerIds: string[]): void;
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

interface NativePlayerAuthStoreServiceLike {
  reloadFromPersistence(): Promise<void>;
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
    @Inject(PlayerSessionRouteService) private readonly playerSessionRouteService: PlayerSessionRouteService,
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeServiceLike,
    @Inject(MarketRuntimeService) private readonly marketRuntimeService: MarketRuntimeServiceLike,
    @Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike,
    @Inject(RuntimeGmAuthService) private readonly runtimeGmAuthService: RuntimeGmAuthServiceLike,
    @Inject(NativePlayerAuthStoreService) private readonly playerAuthStoreService: NativePlayerAuthStoreServiceLike,
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
    const runtimePlayerIdSet = new Set(runtimePlayerIds);
    const purgedPlayerIds = NATIVE_GM_RESTORE_CONTRACT.purgeSessionsBeforeRestore
      ? this.worldSessionService.purgeAllSessions('database_restore')
      : [];
    const expiredDetachedBindings = (this.worldSessionService.consumeExpiredBindings?.() ?? [])
      .map((binding) => ({
        playerId: typeof binding?.playerId === 'string' ? binding.playerId.trim() : '',
        sessionId: typeof binding?.sessionId === 'string' ? binding.sessionId.trim() : '',
        sessionEpoch: Number.isFinite(binding?.sessionEpoch) ? Math.max(1, Math.trunc(Number(binding?.sessionEpoch))) : null,
        connected: Boolean(binding?.connected),
        detachedAt: Number.isFinite(binding?.detachedAt) ? Number(binding?.detachedAt) : null,
        expireAt: Number.isFinite(binding?.expireAt) ? Number(binding?.expireAt) : null,
      }))
      .filter((binding) => binding.playerId.length > 0 && !runtimePlayerIdSet.has(binding.playerId));
    const expiredDetachedPlayerIds = expiredDetachedBindings.map((binding) => binding.playerId);
    const detachedOnlyPurgedPlayerIds = purgedPlayerIds.filter((playerId) => !runtimePlayerIdSet.has(playerId));
    const detachedCleanupPlayerIds = Array.from(new Set([
      ...detachedOnlyPurgedPlayerIds,
      ...expiredDetachedPlayerIds,
    ]));
    if (detachedOnlyPurgedPlayerIds.length > 0 || expiredDetachedBindings.length > 0) {
      try {
        if (detachedOnlyPurgedPlayerIds.length > 0) {
          await this.playerSessionRouteService.clearLocalRoutes(detachedOnlyPurgedPlayerIds);
        }
        for (const binding of expiredDetachedBindings) {
          await this.playerSessionRouteService.clearLocalRoute(binding.playerId, binding.sessionEpoch);
        }
        if (NATIVE_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
          for (const playerId of detachedCleanupPlayerIds) {
            this.worldSyncService.clearDetachedPlayerCaches(playerId);
          }
        }
      } catch (error) {
        for (const binding of expiredDetachedBindings) {
          this.worldSessionService.requeueExpiredBinding?.(binding);
        }
        throw error;
      }
    }

    for (const playerId of runtimePlayerIds) {
      this.worldRuntimeService.worldRuntimePlayerSessionService.removePlayer(playerId, 'removed', this.worldRuntimeService);
      if (NATIVE_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
        this.worldSyncService.clearDetachedPlayerCaches(playerId);
      }
    }
    if (NATIVE_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
      this.worldSessionService.acknowledgePurgedPlayerIds?.(
        Array.from(new Set([...detachedOnlyPurgedPlayerIds, ...runtimePlayerIds])),
      );
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
    await this.playerAuthStoreService.reloadFromPersistence();
  }
}
