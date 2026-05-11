/**
 * 修炼功法切换服务
 * 处理玩家设置/取消主修功法的意图，校验制作阻塞条件后委托 PlayerRuntime 执行
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { PlayerRuntimeService } from '../player/player-runtime.service';

interface CultivationPlayerRuntimePort<TPlayer = unknown> {
  getPlayerOrThrow(playerId: string): TPlayer;
  cultivateTechnique(playerId: string, techniqueId: string | null): void;
  getTechniqueName(playerId: string, techniqueId: string): string | null | undefined;
}

interface CultivationDeps<TPlayer = unknown> {
  craftPanelRuntimeService: {
    getCultivationBlockReason(player: TPlayer): string | null | undefined;
  };
  queuePlayerNotice(playerId: string, message: string, kind: 'info' | 'success' | 'warn' | 'error'): void;
}

/** 功法修炼切换调度，校验阻塞后执行切换并通知玩家 */
@Injectable()
export class WorldRuntimeCultivationService {
  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: CultivationPlayerRuntimePort,
  ) {}

  dispatchCultivateTechnique(playerId: string, techniqueId: string | null, deps: CultivationDeps): void {
    const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
    const blockReason = deps.craftPanelRuntimeService.getCultivationBlockReason(player);
    if (blockReason) {
      throw new BadRequestException(blockReason);
    }
    this.playerRuntimeService.cultivateTechnique(playerId, techniqueId);
    if (!techniqueId) {
      deps.queuePlayerNotice(playerId, '已取消主修功法', 'info');
      return;
    }
    const techniqueName = this.playerRuntimeService.getTechniqueName(playerId, techniqueId) ?? techniqueId;
    deps.queuePlayerNotice(playerId, `已设为主修 ${techniqueName}`, 'success');
  }
}
