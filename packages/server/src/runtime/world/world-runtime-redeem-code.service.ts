/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 兑换码运行时调度服务
 * 接收玩家兑换码请求，调用兑换码运行时执行并通过 socket 返回结果
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  AccountRedeemCodesRes,
  NoticeKind,
  RedeemCodesResultErrorCode,
  StructuredNoticePayload,
} from '@mud/shared';
import type { Socket } from 'socket.io';

import { WorldClientEventService } from '../../network/world-client-event.service';
import { WorldSessionService } from '../../network/world-session.service';
import { RedeemCodeRuntimeService } from '../redeem/redeem-code-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

interface RedeemCodeRuntimePort {
  redeemCodes(playerId: string, codes: string[]): Promise<AccountRedeemCodesRes>;
}

interface WorldSessionPort {
  getSocketByPlayerId(playerId: string): Socket | null | undefined;
}

interface WorldClientEventPort {
  emitRedeemCodesResult(socket: Socket, payload: {
    requestId: string;
    result: AccountRedeemCodesRes | null;
    errorCode?: RedeemCodesResultErrorCode;
  }): void;
}

interface RedeemCodeDeps {
  logger: {
    warn(message: string): void;
  };
  queuePlayerNotice(
    playerId: string,
    message: string,
    kind: NoticeKind,
    title?: unknown,
    icon?: unknown,
    structured?: StructuredNoticePayload,
  ): void;
}

@Injectable()
export class WorldRuntimeRedeemCodeService {
  constructor(
    @Inject(RedeemCodeRuntimeService)
    private readonly redeemCodeRuntimeService: RedeemCodeRuntimePort,
    @Inject(WorldSessionService)
    private readonly worldSessionService: WorldSessionPort,
    @Inject(WorldClientEventService)
    private readonly worldClientEventService: WorldClientEventPort,
  ) {}

  async dispatchRedeemCodes(
    playerId: string,
    codes: string[],
    requestId: string,
    deps: RedeemCodeDeps,
  ): Promise<void> {
    try {
      const payload = await this.redeemCodeRuntimeService.redeemCodes(playerId, codes);
      const socket = this.worldSessionService.getSocketByPlayerId(playerId);
      if (socket) {
        this.worldClientEventService.emitRedeemCodesResult(socket, { requestId, result: payload });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      deps.logger.warn(`处理玩家 ${playerId} 的兑换码失败：${message}`);
      const notice = buildStructuredNotice(
        'warn',
        'notice.redeem.execution-failed',
        '兑换执行失败，请先查看行囊再重试。',
      );
      deps.queuePlayerNotice(
        playerId,
        notice.text,
        notice.kind,
        undefined,
        undefined,
        notice.structured,
      );
      const socket = this.worldSessionService.getSocketByPlayerId(playerId);
      if (socket) {
        this.worldClientEventService.emitRedeemCodesResult(socket, {
          requestId,
          result: null,
          errorCode: 'execution_failed',
        });
      }
    }
  }
}
