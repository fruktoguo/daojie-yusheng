import assert from 'node:assert/strict';

import { WorldRuntimeNavigationService } from '../runtime/world/world-runtime-navigation.service';

interface NavigationProbe {
  navigationIntents: Map<string, unknown>;
  resolveNavigationStepAsync(playerId: string): Promise<unknown>;
}

interface CapturedNotice {
  playerId: string;
  text: string;
  kind: string;
  key: string | null;
}

async function main(): Promise<void> {
  const players = new Map([
    ['player:resolve-failure', createPlayer('player:resolve-failure')],
    ['player:enqueue-failure', createPlayer('player:enqueue-failure')],
    ['player:expected-reject', createPlayer('player:expected-reject')],
  ]);
  const service = new WorldRuntimeNavigationService(
    {} as never,
    {
      getPlayer(playerId: string): ReturnType<typeof createPlayer> | null {
        return players.get(playerId) ?? null;
      },
    } as never,
  );
  const probe = service as unknown as NavigationProbe;
  probe.navigationIntents.set('player:resolve-failure', createIntent('resolve-failure'));
  probe.navigationIntents.set('player:enqueue-failure', createIntent('enqueue-failure'));
  probe.navigationIntents.set('player:expected-reject', createIntent('expected-reject'));
  probe.resolveNavigationStepAsync = async (playerId: string): Promise<unknown> => {
    if (playerId === 'player:resolve-failure') {
      throw new Error('worker host=path-worker-3 queue secret failed');
    }
    if (playerId === 'player:expected-reject') {
      throw new Error('目标超出地图范围');
    }
    return {
      kind: 'move',
      direction: 'east',
      maxSteps: 1,
      path: [[2, 1]],
    };
  };

  const notices: CapturedNotice[] = [];
  await service.materializeNavigationCommands({
    hasPendingCommand(): boolean {
      return false;
    },
    enqueuePendingCommand(playerId: string): void {
      if (playerId === 'player:enqueue-failure') {
        throw new Error('pending queue storage key=private failed');
      }
    },
    queuePlayerNotice(
      playerId: string,
      text: string,
      kind: string,
      _title?: unknown,
      _icon?: unknown,
      structured?: { key?: string },
    ): void {
      notices.push({ playerId, text, kind, key: structured?.key ?? null });
    },
    logger: {
      debug(): void {},
      log(): void {},
      warn(): void {},
      error(): void {},
    },
  } as never);

  assert.deepEqual(notices, [
    {
      playerId: 'player:resolve-failure',
      text: '导航暂时不可用，请稍后重试。',
      kind: 'warn',
      key: 'notice.navigation.failed',
    },
    {
      playerId: 'player:enqueue-failure',
      text: '导航暂时不可用，请稍后重试。',
      kind: 'warn',
      key: 'notice.navigation.failed',
    },
    {
      playerId: 'player:expected-reject',
      text: '目标超出地图范围。',
      kind: 'warn',
      key: 'notice.navigation.target-out-of-bounds',
    },
  ]);
  assert.equal(JSON.stringify(notices).includes('path-worker-3'), false);
  assert.equal(JSON.stringify(notices).includes('storage key=private'), false);
  assert.equal(probe.navigationIntents.size, 0);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-navigation-notice',
    answers: [
      '异步寻路计算与待执行队列异常只进入服务端日志，玩家收到稳定的结构化导航失败通知。',
      '确定性的越界拒绝保留明确玩家语义，同时不把内部 worker、存储键或异常文本发往客户端。',
      '所有失败都会清理原导航意图，避免每息重复报错。',
    ],
  }, null, 2));
}

function createPlayer(playerId: string): {
  playerId: string;
  instanceId: string;
  hp: number;
  x: number;
  y: number;
} {
  return {
    playerId,
    instanceId: 'instance:navigation-notice',
    hp: 100,
    x: 1,
    y: 1,
  };
}

function createIntent(id: string): Record<string, unknown> {
  return {
    kind: 'point',
    mapId: 'map:navigation-notice',
    x: 2,
    y: 1,
    id,
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
