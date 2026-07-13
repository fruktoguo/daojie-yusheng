import assert from 'node:assert/strict';

import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

interface CapturedNotice {
  playerId: string;
  text: string;
  kind: string;
  key: string | null;
}

async function main(): Promise<void> {
  const player = {
    playerId: 'player:casting-notice',
    hp: 100,
    combat: { pendingSkillCast: { skillId: 'skill:chanting' } },
  };
  const service = Object.create(WorldRuntimePlayerCommandService.prototype) as WorldRuntimePlayerCommandService & {
    playerRuntimeService: { getPlayer(playerId: string): typeof player | null };
  };
  service.playerRuntimeService = {
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
  };
  const notices: CapturedNotice[] = [];
  const deps = {
    queuePlayerNotice(
      playerId: string,
      text: string,
      kind: string,
      _title?: string,
      _icon?: string,
      structured?: { key?: string },
    ) {
      notices.push({ playerId, text, kind, key: structured?.key ?? null });
    },
  };
  const cases = [
    ['startAlchemy', 'notice.command.casting-busy-alchemy', '吟唱中无法分心炼丹。'],
    ['startEnhancement', 'notice.command.casting-busy-enhancement', '吟唱中无法分心强化。'],
    ['startGather', 'notice.command.casting-busy-gather', '吟唱中无法分心采集。'],
    ['startMining', 'notice.command.casting-busy-mining', '吟唱中无法分心挖矿。'],
    ['startBuilding', 'notice.command.casting-busy-building', '吟唱中无法分心营造。'],
    ['startFormationMaintenance', 'notice.command.casting-busy-formation-maintenance', '吟唱中无法分心维护阵法。'],
  ] as const;

  for (const [kind, expectedKey, expectedText] of cases) {
    await service.dispatchPlayerCommand(player.playerId, { kind } as never, deps as never);
    assert.deepEqual(notices.at(-1), {
      playerId: player.playerId,
      text: expectedText,
      kind: 'system',
      key: expectedKey,
    });
  }

  assert.equal(notices.length, cases.length, '每条被吟唱阻塞的技艺命令只能产生一条通知');
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-casting-activity-notice' }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
