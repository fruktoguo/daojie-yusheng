import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';

async function main(): Promise<void> {
  testFullInventoryCapacityUsesCompleteStackSignature();
  await testOnlineLootFallsToGroundWithStructuredNotice();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '满包容量判断使用完整堆叠签名：同强化等级可合并，不同强化等级不可误合并。',
      '玩家在线获得不可合并物品且背包已满时，物品落地并发送结构化背包已满提示。',
    ],
  }, null, 2));
}

function testFullInventoryCapacityUsesCompleteStackSignature(): void {
  const playerId = 'player:inventory-settlement-policy';
  const service = new PlayerRuntimeService(
    {
      normalizeItem(item: unknown) {
        return item;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  service.players.set(playerId, {
    playerId,
    inventory: {
      capacity: 1,
      items: [{
        itemId: 'equip.signature_sword',
        count: 1,
        enhanceLevel: 0,
      }],
    },
  });

  assert.equal(service.canReceiveInventoryItem(playerId, {
    itemId: 'equip.signature_sword',
    count: 1,
    enhanceLevel: 0,
  }), true);
  assert.equal(service.canReceiveInventoryItem(playerId, {
    itemId: 'equip.signature_sword',
    count: 1,
    enhanceLevel: 1,
  }), false);
}

async function testOnlineLootFallsToGroundWithStructuredNotice(): Promise<void> {
  const playerId = 'player:online-loot-full';
  const item = {
    itemId: 'equip.signature_sword',
    name: '试锋剑',
    count: 1,
    enhanceLevel: 1,
  };
  const instance = { meta: { instanceId: 'public:inventory-policy' } };
  const events: Array<{ type: string; payload: unknown }> = [];
  const service = new WorldRuntimePlayerCombatService(
    {} as never,
    {
      canReceiveInventoryItem(requestedPlayerId: string, requestedItem: typeof item) {
        assert.equal(requestedPlayerId, playerId);
        assert.equal(requestedItem, item);
        return false;
      },
    } as never,
  );

  await service.deliverMonsterLoot(playerId, instance, 7, 9, item, {
    spawnGroundItem(requestedInstance: unknown, x: number, y: number, droppedItem: unknown) {
      events.push({ type: 'ground', payload: { requestedInstance, x, y, droppedItem } });
    },
    queuePlayerNotice(
      requestedPlayerId: string,
      text: string,
      kind: string,
      _expiresAt: unknown,
      _source: unknown,
      structured: { key?: string } | undefined,
    ) {
      events.push({ type: 'notice', payload: { requestedPlayerId, text, kind, structured } });
    },
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    type: 'ground',
    payload: { requestedInstance: instance, x: 7, y: 9, droppedItem: item },
  });
  assert.equal((events[1]?.payload as { requestedPlayerId?: string }).requestedPlayerId, playerId);
  assert.equal((events[1]?.payload as { structured?: { key?: string } }).structured?.key, 'notice.loot.bag-full-ground');
}

void main();
