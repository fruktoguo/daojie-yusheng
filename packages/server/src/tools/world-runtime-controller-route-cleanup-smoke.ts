import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeController } from '../runtime/world/world-runtime.controller';

async function main(): Promise<void> {
  const calls: Array<unknown> = [];
  const controller = new WorldRuntimeController(
    {
      worldRuntimePlayerSessionService: {
        removePlayer(playerId: string, reason: string, deps: unknown) {
          calls.push({ kind: 'session-remove', playerId, reason, depsMatched: deps === controller['worldRuntimeService'] });
          return true;
        },
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = controller.removePlayer('player:controller-route');

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    {
      kind: 'session-remove',
      playerId: 'player:controller-route',
      reason: 'removed',
      depsMatched: true,
    },
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        calls,
        answers:
          'WorldRuntimeController.removePlayer 现在只委托 WorldRuntimePlayerSessionService.removePlayer，不会再额外直接 clearLocalRoute 抢先清理本地 route。',
        excludes: '不证明真实 DB route 删除、transfer handoff 或 gateway redirect，只证明 controller 层不会重复触发本地 route cleanup',
        completionMapping: 'replace-ready:proof:world-runtime.controller.remove-player-route-cleanup',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
