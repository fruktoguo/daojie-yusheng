/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * 数据库恢复协调服务。
 * 在数据库恢复前后协调运行时状态：刷盘所有玩家和地图、断开会话、
 * 清理缓存，恢复后重载世界运行时和相关子系统。
 */
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
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
import { NativePlayerAuthStoreService } from './native-player-auth-store.service';
/** 玩家快照最小接口。 */
interface PlayerSnapshotLike {
  playerId: string;
}

/** 过期断线绑定记录。 */
interface ExpiredBindingLike {
  playerId: string;
  sessionId?: string | null;
  sessionEpoch?: number | null;
  connected?: boolean;
  detachedAt?: number | null;
  expireAt?: number | null;
}

/** 世界会话服务端口。 */
interface WorldSessionServiceLike {
  purgeAllSessions(reason: string): string[];
  consumeExpiredBindings?(): ExpiredBindingLike[];
  requeueExpiredBinding?(binding: ExpiredBindingLike | null | undefined): boolean;
  acknowledgePurgedPlayerIds?(playerIds: string[]): void;
}

/** 世界运行时服务端口。 */
interface WorldRuntimeServiceLike {
  worldRuntimePlayerSessionService: {
    removePlayer(playerId: string, reason: string, deps: unknown): void;
  };
  rebuildPersistentRuntimeAfterRestore(options?: {
    restoreOfflinePlayers?: boolean;
    restoreInstanceDomains?: boolean;
    restoreCatalogInstances?: boolean;
    rewriteCatalogRuntimeStatus?: boolean;
  }): Promise<void>;
}

/** 世界同步服务端口。 */
interface WorldSyncServiceLike {
  clearDetachedPlayerCaches(playerId: string): void;
}

/** 刷盘服务端口。 */
interface FlushServiceLike {
  flushAllNow(): Promise<void>;
}

/** 玩家运行时服务端口。 */
interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
}

/** 邮件运行时服务端口。 */
interface MailRuntimeServiceLike {
  clearRuntimeCache(): void;
}

/** 市场运行时服务端口。 */
interface MarketRuntimeServiceLike {
  reloadFromPersistence(): Promise<void>;
}

/** GM 鉴权运行时服务端口。 */
interface RuntimeGmAuthServiceLike {
  reloadPasswordRecordFromPersistence(): Promise<void>;
}

interface NativePlayerAuthStoreServiceLike {
  reloadFromPersistence(): Promise<void>;
}

/** 数据库恢复协调服务：恢复前刷盘/断连/清理，恢复后重载运行时。 */
@Injectable()
export class NativeDatabaseRestoreCoordinatorService {
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
    @Inject(RuntimeGmAuthService) private readonly runtimeGmAuthService: RuntimeGmAuthServiceLike,
    @Inject(NativePlayerAuthStoreService) private readonly playerAuthStoreService: NativePlayerAuthStoreServiceLike,
  ) {}

  /** 恢复前准备：刷盘所有玩家/地图、断开会话、清理缓存和邮件。 */
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
  /** 恢复后重载：重建世界运行时、市场、建议、GM 鉴权和账号索引。 */
  async reloadAfterRestore(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (NATIVE_GM_RESTORE_CONTRACT.reloadWorldRuntimeAfterRestore) {
      await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore({
        restoreOfflinePlayers: true,
        restoreInstanceDomains: true,
        restoreCatalogInstances: true,
        rewriteCatalogRuntimeStatus: true,
      });
    }
    if (NATIVE_GM_RESTORE_CONTRACT.reloadMarketAfterRestore) {
      await this.marketRuntimeService.reloadFromPersistence();
    }

    this.mailRuntimeService.clearRuntimeCache();

    if (NATIVE_GM_RESTORE_CONTRACT.reloadGmAuthAfterRestore) {
      await this.runtimeGmAuthService.reloadPasswordRecordFromPersistence();
    }
    await this.playerAuthStoreService.reloadFromPersistence();
  }
}
