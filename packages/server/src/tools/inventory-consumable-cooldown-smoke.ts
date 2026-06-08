import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { ContentTemplateRepository } from '../content/content-template.repository';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

const repo = new ContentTemplateRepository();
repo.onModuleInit();

const minorHeal = repo.createItem('pill.minor_heal', 2);
assert.equal(minorHeal.cooldown, 5, '瞬回生命药应继承默认 5 息冷却');
const buffPill = repo.createItem('pill.crimson_bud_elixir', 2);
assert.equal(buffPill.cooldown, undefined, '增益丹药不应继承恢复药冷却');

const service = new PlayerRuntimeService(
  repo,
  {},
  { recalculate() {} },
  { refreshPreview() {} },
);

const playerId = 'player:consumable-cooldown-smoke';
const player: any = {
  playerId,
  persistentRevision: 1,
  hp: 50,
  maxHp: 100,
  qi: 0,
  maxQi: 100,
  lifeElapsedTicks: 10,
  inventory: {
    revision: 1,
    capacity: 20,
    items: [
      repo.createItem('pill.minor_heal', 2),
      repo.createItem('frost_heart_paste', 1),
      repo.createItem('minor_qi_pill', 1),
      repo.createItem('pill.crimson_bud_elixir', 2),
    ],
  },
  wallet: { balances: [] },
  buffs: { revision: 1, buffs: [] },
  attrs: {
    revision: 1,
    baseAttrs: {},
    finalAttrs: {},
    bonuses: [],
    numericStats: {},
    ratioDivisors: {},
  },
};
service.players.set(playerId, player);

service.useItem(playerId, 0);
assert.equal(player.hp, 72, '首次使用回春散应恢复气血');
assert.equal(player.inventory.items[0].count, 1, '首次使用应消耗一枚回春散');
assert.deepEqual(
  (player.inventory.cooldowns ?? []).map((entry: any) => entry.itemId).sort(),
  ['frost_heart_paste', 'pill.minor_heal'].sort(),
  '生命回复组冷却应覆盖当前背包内所有生命瞬回药',
);
assert.equal(player.inventory.serverTick, 10, '冷却同步应使用玩家 lifeElapsedTicks');

assert.throws(
  () => service.useItem(playerId, 1),
  (error: unknown) => error instanceof BadRequestException && /冷却中/.test(error.message),
  '同一生命回复组冷却中应拒绝再次用药',
);
assert.equal(player.inventory.items[1].count, 1, '冷却拒绝不能消耗第二种生命药');

service.useItem(playerId, 2);
assert.equal(player.qi, 22, '生命回复组冷却不应阻塞灵力回复药');

service.useItem(playerId, 2);
assert.equal(player.inventory.items[2].itemId, 'pill.crimson_bud_elixir', '灵力药消耗后增益丹药应位于当前槽位');
service.useItem(playerId, 2);
assert.equal(
  (player.inventory.cooldowns ?? []).some((entry: any) => entry.itemId === 'pill.crimson_bud_elixir'),
  false,
  '增益丹药连续使用不应写入冷却投影',
);

player.lifeElapsedTicks = 15;
service.useItem(playerId, 1);
assert.equal(player.hp, 100, '冷却结束后生命回复药应可再次使用');

const manualPlayerId = 'player:manual-use-item-cooldown-smoke';
async function testManualUseItemBranch() {
  const manualItem = repo.createItem('pill.crimson_bud_elixir', 2);
  manualItem.itemInstanceId = 'manual:buff-pill';
  const manualPlayer: any = {
    ...player,
    playerId: manualPlayerId,
    hp: 100,
    qi: 0,
    lifeElapsedTicks: 30,
    inventory: {
      revision: 1,
      capacity: 20,
      items: [manualItem],
    },
    buffs: { revision: 1, buffs: [] },
  };
  service.players.set(manualPlayerId, manualPlayer);
  const manualUseService = new WorldRuntimeUseItemService(repo, {}, service);
  const manualDeps = {
    refreshQuestStates() {},
    advanceLearnTechniqueQuest() {},
    queuePlayerNotice() {},
  };
  await manualUseService.dispatchUseItem(manualPlayerId, 'manual:buff-pill', manualDeps);
  await manualUseService.dispatchUseItem(manualPlayerId, 'manual:buff-pill', manualDeps);
  assert.equal(
    (manualPlayer.inventory.cooldowns ?? []).some((entry: any) => entry.itemId === 'pill.crimson_bud_elixir'),
    false,
    '手动 useItem 编排路径也不应让增益丹药产生冷却',
  );
}

const specialPlayerId = 'player:special-consumable-cooldown-smoke';
const specialPlayer: any = {
  ...player,
  playerId: specialPlayerId,
  hp: 100,
  qi: 100,
  lifeElapsedTicks: 35,
  inventory: {
    revision: 1,
    capacity: 20,
    items: [{
      itemId: 'pill.special_no_recovery',
      count: 1,
      name: '特殊丹',
      type: 'consumable',
      cooldown: 99,
      consumeBuffs: [{
        buffId: 'item_buff.special_no_recovery',
        name: '特殊丹效',
        desc: '非恢复特殊丹效',
        duration: 10,
        attrs: { attack: 1 },
      }],
    }],
  },
  buffs: { revision: 1, buffs: [] },
};
service.players.set(specialPlayerId, specialPlayer);
service.useItem(specialPlayerId, 0);
assert.deepEqual(specialPlayer.inventory.cooldowns ?? [], [], '显式 cooldown 的非恢复特殊药也不应写入冷却');

const legacyPlayerId = 'player:legacy-consumable-cooldown-smoke';
const legacyPlayer: any = {
  ...player,
  playerId: legacyPlayerId,
  hp: 50,
  maxHp: 100,
  lifeElapsedTicks: 40,
  inventory: {
    revision: 1,
    capacity: 20,
    items: [{
      itemId: 'pill.minor_heal',
      count: 2,
      name: '回春散',
      healAmount: 22,
    }],
  },
  buffs: { revision: 1, buffs: [] },
};
service.players.set(legacyPlayerId, legacyPlayer);
service.useItem(legacyPlayerId, 0);
assert.equal(legacyPlayer.inventory.items[0].count, 1, '旧实例首次使用应照常消耗');
assert.deepEqual(
  legacyPlayer.inventory.cooldowns,
  [{ itemId: 'pill.minor_heal', cooldown: 5, startedAtTick: 40 }],
  '缺少 type 的旧瞬回药实例也必须写入冷却投影',
);
assert.throws(
  () => service.useItem(legacyPlayerId, 0),
  (error: unknown) => error instanceof BadRequestException && /冷却中/.test(error.message),
  '缺少 type 的旧瞬回药实例也必须被冷却拦截',
);

async function main() {
  await testManualUseItemBranch();
  console.log('inventory-consumable-cooldown-smoke ok');
}

void main();
