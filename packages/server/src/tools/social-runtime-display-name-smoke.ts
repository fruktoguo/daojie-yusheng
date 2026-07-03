import assert from 'node:assert/strict';
import { SocialRuntimeService } from '../runtime/social/social-runtime.service';

type QueryResult = { rows: any[]; rowCount?: number };

class InMemoryPool {
  query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    if (sql.includes('FROM player_daoist_relation')) {
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes('FROM player_daoist_request')) {
      return Promise.resolve({ rows: [] });
    }
    throw new Error(`unexpected query in social display-name smoke: ${sql}`);
  }
}

async function main(): Promise<void> {
  const selfPlayerId = 'player:self';
  const targetPlayerId = 'p_249e7839-c38f-4672-8e8d-189f331acf1a_1775607823345';
  const runtimePlayers = new Map<string, any>([
    [
      selfPlayerId,
      {
        playerId: selfPlayerId,
        name: '观星道人',
        displayName: '观星道人',
        instanceId: 'real:social_smoke',
        x: 10,
        y: 10,
        sessionId: 'session:self',
      },
    ],
    [
      targetPlayerId,
      {
        playerId: targetPlayerId,
        name: '青竹客',
        displayName: '青竹客',
        instanceId: 'real:social_smoke',
        x: 12,
        y: 10,
        sessionId: 'session:target',
      },
    ],
  ]);
  const instancePlayers = new Map<string, any>([
    [selfPlayerId, { playerId: selfPlayerId, x: 10, y: 10, sessionId: 'session:self' }],
    [targetPlayerId, { playerId: targetPlayerId, x: 12, y: 10, sessionId: 'session:target' }],
  ]);
  const service = new SocialRuntimeService(
    { getPool: () => null } as any,
    {
      getPlayer(playerId: string) {
        return runtimePlayers.get(playerId) ?? null;
      },
    } as any,
  );

  (service as any).pool = new InMemoryPool();
  (service as any).enabled = true;

  const candidates = await service.buildNearbyCandidates(selfPlayerId, {
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'real:social_smoke');
      return { playersById: instancePlayers };
    },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].playerId, targetPlayerId);
  assert.equal(candidates[0].name, '青竹客');
  assert.equal(candidates[0].distance, 2);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
