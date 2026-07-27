import assert from 'node:assert/strict';

import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';

function main(): void {
  let queued: Record<string, unknown> | null = null;
  const service = new WorldRuntimePlayerCombatService(
    {} as never,
    {
      queuePendingLogbookMessage(playerId: string, message: Record<string, unknown>) {
        assert.equal(playerId, 'player:victim');
        queued = message;
      },
    } as never,
  );

  service.queueOfflineDefeatLogbookMessage(
    { playerId: 'player:victim', instanceId: 'instance:a', templateId: 'map:a' },
    'monster:wolf',
    null,
    {
      instance: {
        template: { id: 'map:a', name: '青石谷' },
        getMonster: () => ({ monsterId: 'monster:wolf', name: '赤牙狼' }),
      },
    },
  );

  assert.ok(queued);
  assert.equal(queued.kind, 'system');
  assert.equal(queued.from, undefined);
  assert.match(String(queued.id), /^offline-defeat:/);
  assert.deepEqual(queued.structured, {
    key: 'notice.combat.offline-defeat',
    vars: { killerName: '赤牙狼', locationName: '青石谷' },
    pills: [
      { key: 'killerName', style: 'target' },
      { key: 'locationName', style: 'target' },
    ],
  });

  console.log(JSON.stringify({ ok: true, case: 'offline-defeat-logbook' }, null, 2));
}

main();
