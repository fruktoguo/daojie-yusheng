/**
 * 玩家修炼进阶调度服务
 * 负责将突破、根基淬炼、天门操作等进阶意图转发给 PlayerRuntimeService 执行
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
