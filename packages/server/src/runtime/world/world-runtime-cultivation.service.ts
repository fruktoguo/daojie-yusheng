/**
 * 修炼功法切换服务
 * 处理玩家设置/取消主修功法的意图，校验制作阻塞条件后委托 PlayerRuntime 执行
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

interface CultivationPlayerRuntimePort<TPlayer = unknown> {
  getPlayerOrThrow(playerId: string): TPlayer;
  cultivateTechnique(playerId: string, techniqueId: string | null): void;
  getTechniqueName(playerId: string, techniqueId: string): string | null | undefined;
}

interface CultivationDeps<TPlayer = unknown> {
  craftPanelRuntimeService: {
    getCultivationBlockReason(player: TPlayer): string | null | undefined;
  };
  queuePlayerNotice(playerId: string, message: string, kind: string, title?: unknown, icon?: unknown, structured?: unknown): void;
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
      const n = buildStructuredNotice('info', 'notice.cultivation.cleared', '已取消主修功法');
      deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
      return;
    }
    const techniqueName = this.playerRuntimeService.getTechniqueName(playerId, techniqueId) ?? techniqueId;
    const n = buildStructuredNotice('success', 'notice.cultivation.set-primary', `已设为主修 ${techniqueName}`, {
      vars: { techniqueName },
      pills: [{ key: 'techniqueName', style: 'target' }],
    });
    deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
  }
}
