/**
 * 世界关机 drain 协调器。
 * 固定顺序：停接入 -> 断开现有 socket -> flush 玩家/实例 -> 释放本节点 lease。
 */
import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { TongtianTowerPersistenceService } from '../persistence/tongtian-tower-persistence.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { WorldTickService } from '../runtime/tick/world-tick.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldGateway } from './world.gateway';

@Injectable()
export class WorldShutdownDrainService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(WorldShutdownDrainService.name);
  private draining = false;

  constructor(
    @Inject(WorldGateway) private readonly worldGateway: WorldGateway,
    @Inject(PlayerPersistenceFlushService) private readonly playerPersistenceFlushService: PlayerPersistenceFlushService,
    @Inject(MapPersistenceFlushService) private readonly mapPersistenceFlushService: MapPersistenceFlushService,
    @Inject(MarketRuntimeService) private readonly marketRuntimeService: MarketRuntimeService,
    @Inject(TongtianTowerPersistenceService) private readonly tongtianTowerPersistenceService: TongtianTowerPersistenceService,
    @Inject(WorldTickService) private readonly worldTickService: WorldTickService,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeService,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    return this.drain(signal);
  }

  async drain(signal?: string): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    this.logger.log(`开始执行世界关机 drain${signal ? ` signal=${signal}` : ''}`);

    this.worldGateway.setDraining(true);

    const detachedBindings = this.worldGateway.disconnectAllForShutdown('server_shutdown');
    for (const binding of detachedBindings) {
      await this.runStep(`drain_player:${binding.playerId}`, () => this.worldGateway.drainDetachedBinding(binding));
    }

    await this.runStep('release_instance_leases', async () => {
      const result = await this.worldRuntimeService.releaseLocalInstanceLeasesForShutdown();
      this.logger.log(`实例租约释放完成：released=${result?.released ?? 0} skipped=${result?.skipped ?? 0}`);
    });

    await this.runStep('stop_tick', () => this.worldTickService.stopForShutdown());
    await this.runStep('drain_market_queue', () => this.marketRuntimeService.drainForShutdown());
    await this.runStep('flush_players', () => this.playerPersistenceFlushService.flushAllNow());
    await this.runStep('flush_maps', () => this.mapPersistenceFlushService.flushAllNow());
    await this.runStep('flush_tongtian_tower', () => this.tongtianTowerPersistenceService.flushAllProgress());
  }

  private async runStep(name: string, action: () => Promise<void> | void): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.error(`关机 drain 步骤失败：${name}`, error instanceof Error ? error.stack : String(error));
    }
  }
}
