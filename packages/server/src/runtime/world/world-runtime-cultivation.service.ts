/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 修炼功法切换服务
 * 处理玩家设置/取消主修功法的意图并委托 PlayerRuntime 执行。
 * 主修选择只修改修炼目标，不等同于开启闭关修炼，也不受技艺 job 阻塞。
 */
import { Inject, Injectable } from '@nestjs/common';
import { resolvePlayerFacingContentName } from '@mud/shared';

import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

interface CultivationPlayerRuntimePort {
  cultivateTechnique(playerId: string, techniqueId: string | null): void;
  forgetTechnique(playerId: string, techniqueId: string | null): string;
  discardPendingTechniqueComprehension(playerId: string, techniqueId: string | null): string;
  getTechniqueName(playerId: string, techniqueId: string): string | null | undefined;
}

interface CultivationDeps {
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
    this.playerRuntimeService.cultivateTechnique(playerId, techniqueId);
    if (!techniqueId) {
      const n = buildStructuredNotice('info', 'notice.cultivation.cleared', '已取消主修功法');
      deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
      return;
    }
    const techniqueName = resolvePlayerFacingContentName(
      techniqueId,
      '未知功法',
      this.playerRuntimeService.getTechniqueName(playerId, techniqueId),
    );
    const n = buildStructuredNotice('success', 'notice.cultivation.set-primary', `已设为主修 ${techniqueName}`, {
      vars: { techniqueName },
      pills: [{ key: 'techniqueName', style: 'target' }],
    });
    deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
  }

  dispatchForgetTechnique(playerId: string, techniqueId: string | null, deps: CultivationDeps): void {
    const techniqueName = resolvePlayerFacingContentName(
      techniqueId,
      '未知功法',
      this.playerRuntimeService.forgetTechnique(playerId, techniqueId),
    );
    const n = buildStructuredNotice('warn', 'notice.cultivation.technique-forgotten', '已遗忘功法', {
      vars: { techniqueName },
      pills: [{ key: 'techniqueName', style: 'skill' }],
    });
    deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
  }

  dispatchDiscardTechniqueComprehension(playerId: string, techniqueId: string | null, deps: CultivationDeps): void {
    const techniqueName = this.playerRuntimeService.discardPendingTechniqueComprehension(playerId, techniqueId);
    const n = buildStructuredNotice(
      'warn',
      'notice.cultivation.technique-comprehension-discarded',
      '已放弃未领悟功法',
      {
        vars: { techniqueName },
        pills: [{ key: 'techniqueName', style: 'skill' }],
      },
    );
    deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
  }
}
