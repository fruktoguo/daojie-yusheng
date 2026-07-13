import assert from 'node:assert/strict';

import { SocialRuntimeService } from '../runtime/social/social-runtime.service';

type QueryResult = { rows: any[] };

class SocialInstanceNamePool {
  constructor(
    private readonly selfPlayerId: string,
    private readonly targetPlayerId: string,
  ) {}

  async query(sql: string): Promise<QueryResult> {
    if (sql.includes('FROM player_daoist_relation')) {
      return {
        rows: [{
          player_a_id: this.selfPlayerId,
          player_b_id: this.targetPlayerId,
          level: 'dao_friend',
          created_at_ms: 1,
          updated_at_ms: 2,
        }],
      };
    }
    if (sql.includes('FROM player_daoist_request')) {
      return { rows: [] };
    }
    throw new Error(`道友地域名称 smoke 收到未预期查询：${sql}`);
  }
}

async function main(): Promise<void> {
  const selfPlayerId = 'player:self';
  const targetPlayerId = 'p_34a88cf0-0c4c-44d9-a443-4400a8b696e5_1774164770651';
  const instanceId = 'sect:p_34a88cf0-0c4c-44d9-a443-4400a8b696e5_1774164770651:mps710ov';
  const players = new Map<string, any>([
    [selfPlayerId, { playerId: selfPlayerId, name: '观星道人', instanceId, sessionId: 'session:self', x: 1, y: 1 }],
    [targetPlayerId, { playerId: targetPlayerId, name: targetPlayerId, instanceId, sessionId: null, x: 2, y: 1 }],
  ]);
  const runtime = {
    getInstanceRuntime(requestedInstanceId: string) {
      assert.equal(requestedInstanceId, instanceId);
      return {
        template: { name: '天道宗' },
        meta: { instanceId },
        playersById: players,
      };
    },
  };
  const service = new SocialRuntimeService(
    { getPool: () => null } as any,
    { getPlayer: (playerId: string) => players.get(playerId) ?? null } as any,
    {
      getMemoryUserByPlayerId(playerId: string) {
        return playerId === targetPlayerId ? { playerName: '守山人' } : null;
      },
    } as any,
  );
  (service as any).pool = new SocialInstanceNamePool(selfPlayerId, targetPlayerId);
  (service as any).enabled = true;

  const panel = await service.buildPanel(selfPlayerId, runtime);
  assert.equal(panel.relations.length, 1);
  assert.equal(panel.relations[0]?.name, '守山人');
  assert.equal(panel.relations[0]?.instanceId, instanceId, '内部实例 ID 仍需保留给协议与定位');
  assert.equal(panel.relations[0]?.instanceName, '天道宗', '玩家界面必须展示地域名称');
  assert.notEqual(panel.relations[0]?.instanceName, instanceId);
  console.log(JSON.stringify({ ok: true, case: 'social-runtime-instance-name' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
