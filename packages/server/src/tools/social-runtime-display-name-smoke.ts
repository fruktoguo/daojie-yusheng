import assert from 'node:assert/strict';
import { SocialRuntimeService } from '../runtime/social/social-runtime.service';

type QueryResult = { rows: any[]; rowCount?: number };

class InMemoryPool {
  constructor(
    private readonly selfPlayerId: string,
    private readonly targetPlayerId: string,
  ) {}

  query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    if (sql.includes('SELECT level FROM player_daoist_relation')) {
      return Promise.resolve({ rows: [{ level: 'dao_friend' }] });
    }
    if (sql.includes('FROM player_daoist_relation')) {
      return Promise.resolve({
        rows: [{
          player_a_id: this.selfPlayerId,
          player_b_id: this.targetPlayerId,
          level: 'dao_friend',
          created_at_ms: 1,
          updated_at_ms: 2,
        }],
      });
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
        // 模拟重启恢复后的离线运行态：名称尚未由登录 bootstrap 回填，仍是机器 ID。
        name: targetPlayerId,
        displayName: targetPlayerId,
        instanceId: 'real:social_smoke',
        x: 12,
        y: 10,
        sessionId: null,
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
    {
      getMemoryUserByPlayerId(playerId: string) {
        return playerId === targetPlayerId
          ? { playerName: '青竹客', pendingRoleName: '青竹客', displayName: '竹' }
          : null;
      },
    },
  );

  (service as any).pool = new InMemoryPool(selfPlayerId, targetPlayerId);
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

  const panel = await service.buildPanel(selfPlayerId, {
    getInstanceRuntime() {
      return { playersById: instancePlayers };
    },
  });
  assert.equal(panel.relations.length, 1);
  assert.equal(panel.relations[0].name, '青竹客');

  const directMessage = await service.createDirectMessage(selfPlayerId, targetPlayerId, '久违了');
  assert.equal(directMessage.ok, true);
  assert.equal(directMessage.message?.toName, '青竹客');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
