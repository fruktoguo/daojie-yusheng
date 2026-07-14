import assert from 'node:assert/strict';

import { WorldRuntimeRedeemCodeService } from '../runtime/world/world-runtime-redeem-code.service';

type LogEntry = unknown[];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function testAwaitsRedeemBeforeEmit(): Promise<void> {
  const log: LogEntry[] = [];
  let resolveRedeem = (): void => {};
  const service = new WorldRuntimeRedeemCodeService({
    redeemCodes(playerId: string, codes: string[]): Promise<unknown> {
      log.push(['redeemCodes', playerId, codes]);
      return new Promise((resolve) => {
        resolveRedeem = (): void => {
          log.push(['redeemCodes:resolved', playerId]);
          resolve({ results: [{ code: String(codes[0] ?? ''), ok: true }] });
        };
      });
    },
  } as never, {
    getSocketByPlayerId(playerId: string): unknown {
      log.push(['getSocketByPlayerId', playerId]);
      return { id: 'socket:redeem' };
    },
  } as never, {
    emitRedeemCodesResult(socket: { id: string }, payload: {
      requestId: string;
      result: { results?: unknown[] } | null;
      errorCode?: string;
    }): void {
      log.push([
        'emitRedeemCodesResult',
        socket.id,
        payload.requestId,
        payload.result?.results?.length ?? null,
        payload.errorCode ?? null,
      ]);
    },
  } as never);
  const deps = {
    logger: {
      warn(): void {},
    },
    queuePlayerNotice(): void {
      throw new Error('成功兑换不应发送失败通知');
    },
  };

  const pendingDispatch = service.dispatchRedeemCodes('player:1', ['CODE-1'], 'redeem:req:1', deps);
  await nextTick();
  assert.deepEqual(log, [
    ['redeemCodes', 'player:1', ['CODE-1']],
  ]);

  resolveRedeem();
  await pendingDispatch;
  assert.deepEqual(log, [
    ['redeemCodes', 'player:1', ['CODE-1']],
    ['redeemCodes:resolved', 'player:1'],
    ['getSocketByPlayerId', 'player:1'],
    ['emitRedeemCodesResult', 'socket:redeem', 'redeem:req:1', 1, null],
  ]);
}

async function testSanitizesRedeemFailureNotice(): Promise<void> {
  const log: LogEntry[] = [];
  const service = new WorldRuntimeRedeemCodeService({
    async redeemCodes(): Promise<never> {
      throw new Error('database host=internal-db durable commit failed');
    },
  } as never, {
    getSocketByPlayerId(): unknown {
      log.push(['getSocketByPlayerId']);
      return { id: 'socket:redeem' };
    },
  } as never, {
    emitRedeemCodesResult(socket: { id: string }, payload: {
      requestId: string;
      result: unknown;
      errorCode?: string;
    }): void {
      log.push(['emitRedeemCodesResult', socket.id, payload.requestId, payload.result, payload.errorCode]);
    },
  } as never);
  const deps = {
    logger: {
      warn(): void {},
      error(message: string): void {
        log.push(['error', message]);
      },
    },
    queuePlayerNotice(
      playerId: string,
      message: string,
      tone: string,
      _title?: unknown,
      _icon?: unknown,
      structured?: { key?: string },
    ): void {
      log.push(['queuePlayerNotice', playerId, message, tone, structured?.key ?? null]);
    },
  };

  await service.dispatchRedeemCodes('player:2', ['CODE-2'], 'redeem:req:2', deps as never);

  assert.deepEqual(log, [
    ['error', '处理玩家 player:2 的兑换码失败：database host=internal-db durable commit failed'],
    [
      'queuePlayerNotice',
      'player:2',
      '兑换执行失败，请先查看行囊再重试。',
      'warn',
      'notice.redeem.execution-failed',
    ],
    ['getSocketByPlayerId'],
    ['emitRedeemCodesResult', 'socket:redeem', 'redeem:req:2', null, 'execution_failed'],
  ]);
  const playerNotice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.equal(JSON.stringify(playerNotice).includes('internal-db'), false);
}

async function main(): Promise<void> {
  await testAwaitsRedeemBeforeEmit();
  await testSanitizesRedeemFailureNotice();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-redeem-code',
    answers: [
      'WorldRuntimeRedeemCodeService 会等待 durable 结果，并对成功与失败终态回显同一 requestId。',
      '兑换执行异常只在服务端日志保留原始错误，玩家通知使用稳定结构化 key，不泄露数据库或 durable 内部信息。',
    ],
    excludes: '不证明 quest submit 奖励已统一走同一条组合事务链。',
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
