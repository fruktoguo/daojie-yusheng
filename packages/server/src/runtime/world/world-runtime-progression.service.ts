/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable } from '@nestjs/common';

import { PlayerRuntimeService } from '../player/player-runtime.service';

/** 进阶相关的 PlayerRuntime 端口接口 */
interface ProgressionPlayerRuntimePort {
  attemptBreakthrough(playerId: string, currentTick: number): unknown;
  refineRootFoundation(playerId: string, currentTick: number): unknown;
  handleHeavenGateAction(playerId: string, action: string, element: string | null | undefined, currentTick: number): unknown;
}

interface ProgressionDeps {
  resolveCurrentTickForPlayerId(playerId: string): number;
}

/** 修炼进阶调度：突破境界、淬炼根基、天门操作的统一入口 */
@Injectable()
export class WorldRuntimeProgressionService {
  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: ProgressionPlayerRuntimePort,
  ) {}

  dispatchBreakthrough(playerId: string, deps: ProgressionDeps): unknown {
    return this.playerRuntimeService.attemptBreakthrough(playerId, deps.resolveCurrentTickForPlayerId(playerId));
  }

  dispatchRootFoundationRefine(playerId: string, deps: ProgressionDeps): unknown {
    return this.playerRuntimeService.refineRootFoundation(playerId, deps.resolveCurrentTickForPlayerId(playerId));
  }

  dispatchHeavenGateAction(
    playerId: string,
    action: string,
    element: string | null | undefined,
    deps: ProgressionDeps,
  ): unknown {
    return this.playerRuntimeService.handleHeavenGateAction(
      playerId,
      action,
      element,
      deps.resolveCurrentTickForPlayerId(playerId),
    );
  }
}
