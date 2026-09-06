import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { resolveTechniqueStandardMaxHpRecoveryAmount } from '@mud/shared';
import { ContentTemplateRepository } from '../content/content-template.repository';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

const repo = new ContentTemplateRepository();
repo.onModuleInit();

const minorHeal = repo.createItem('pill.minor_heal', 2);
assert.equal(minorHeal.cooldown, 60, '瞬回生命药应使用 60 息通用冷却');
assert.equal(minorHeal.baselineHealPercent, 1, '回春散应按标准等级生命 100% 配置恢复');
const buffPill = repo.createItem('pill.crimson_bud_elixir', 2);
assert.equal(buffPill.cooldown, undefined, '增益丹药不应继承恢复药冷却');
const staminaPill = repo.createItem('pill.huiyuan', 1);
assert.equal(staminaPill.staminaAmount, 24, '回元丹应恢复 24 点副本体力');

const service = new PlayerRuntimeService(
  repo,
  {},
  { recalculate() { } },
  { refreshPreview() { } },
);

const playerId = 'player:consumable-cooldown-smoke';
const player: any = {
  playerId,
  persistentRevision: 1,
  hp: 50,
  maxHp: 10000,
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
assert.equal(
  player.hp,
  50 + resolveTechniqueStandardMaxHpRecoveryAmount(10, 1),
  '首次使用回春散应按标准 10 级最大生命的 100% 恢复，而不是按当前玩家上限恢复',
);
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
assert.equal(player.qi, 100, '生命回复组冷却不应阻塞灵力回复药，灵力恢复应封顶到当前最大灵力');

service.useItem(playerId, 2);
assert.equal(player.inventory.items[2].itemId, 'pill.crimson_bud_elixir', '灵力药消耗后增益丹药应位于当前槽位');
service.useItem(playerId, 2);
assert.equal(
  (player.inventory.cooldowns ?? []).some((entry: any) => entry.itemId === 'pill.crimson_bud_elixir'),
  false,
  '增益丹药连续使用不应写入冷却投影',
);

player.lifeElapsedTicks = 70;
service.useItem(playerId, 1);
assert.equal(player.hp, player.maxHp, '60 息冷却结束后生命回复药应可再次使用并封顶到当前最大气血');

const staminaPlayerId = 'player:stamina-pill-smoke';
const staminaPlayer: any = {
  ...player,
  playerId: staminaPlayerId,
  stamina: 100,
  staminaUpdatedAt: Date.now(),
  inventory: {
    revision: 1,
    capacity: 20,
    items: [repo.createItem('pill.huiyuan', 1)],
  },
  buffs: { revision: 1, buffs: [] },
};
service.players.set(staminaPlayerId, staminaPlayer);
service.useItem(staminaPlayerId, 0);
assert.equal(staminaPlayer.stamina, 124, '回元丹应立即恢复 24 点副本体力');
assert.equal(staminaPlayer.inventory.items.length, 0, '回元丹生效后应消耗一枚');

async function testDurableStaminaPillAndConcurrentDungeonEntry() {
  const playerId = 'player:durable-stamina-pill-dungeon-entry';
  const runtimeOwnerId = 'runtime:durable-stamina-pill-dungeon-entry';
  const sessionEpoch = 9;
  let persistedRuntimeOwnerId = runtimeOwnerId;
  let persistedSessionEpoch = sessionEpoch;
  const initialNow = Date.now();
  let persistedStamina = 0;
  let persistedStaminaUpdatedAt = initialNow;
  let persistedInventoryItemIds = ['pill.huiyuan'];
  let activeDungeonCommits = 0;
  let maxConcurrentDungeonCommits = 0;
  let releaseItemCommit = () => undefined;
  const itemCommitRelease = new Promise<void>((resolve) => { releaseItemCommit = resolve; });
  let enterItemCommit = () => undefined;
  const itemCommitEntered = new Promise<void>((resolve) => { enterItemCommit = resolve; });
  const persistence = {
    isEnabled: () => true,
    async loadPlayerPresence() {
      return { runtimeOwnerId: persistedRuntimeOwnerId, sessionEpoch: persistedSessionEpoch };
    },
    async savePlayerPresence(_playerId: string, presence: any) {
      persistedRuntimeOwnerId = presence.runtimeOwnerId;
      persistedSessionEpoch = presence.sessionEpoch;
    },
    async consumeDungeonStaminaForPlayersAtomic(playerIds: string[], cost: number, now: number, fences: Record<string, any>) {
      activeDungeonCommits += 1;
      maxConcurrentDungeonCommits = Math.max(maxConcurrentDungeonCommits, activeDungeonCommits);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(playerIds, [playerId]);
        assert.equal(fences[playerId]?.expectedRuntimeOwnerId, persistedRuntimeOwnerId);
        assert.equal(fences[playerId]?.expectedSessionEpoch, persistedSessionEpoch);
        if (persistedStamina < cost) {
          return {
            ok: false,
            reason: 'stamina_insufficient',
            views: { [playerId]: { current: persistedStamina, maximum: 240, updatedAt: persistedStaminaUpdatedAt } },
          };
        }
        persistedStamina -= cost;
        persistedStaminaUpdatedAt = now;
        return {
          ok: true,
          views: { [playerId]: { current: persistedStamina, maximum: 240, updatedAt: persistedStaminaUpdatedAt } },
        };
      }
      finally {
        activeDungeonCommits -= 1;
      }
    },
  };
  const durableService = new PlayerRuntimeService(
    repo,
    {},
    { recalculate() { } },
    { refreshPreview() { } },
    persistence,
  );
  const staminaItem = repo.createItem('pill.huiyuan', 1);
  staminaItem.itemInstanceId = 'item:durable-stamina-pill';
  const durablePlayer: any = {
    ...player,
    playerId,
    sessionId: 'session:durable-stamina-pill',
    runtimeOwnerId,
    sessionEpoch,
    stamina: 0,
    staminaUpdatedAt: initialNow,
    inventory: { revision: 1, capacity: 20, items: [staminaItem] },
    buffs: { revision: 1, buffs: [] },
  };
  durableService.players.set(playerId, durablePlayer);
  const durable = {
    isEnabled: () => true,
    async grantInventoryItems(input: any) {
      assert.equal(input.expectedRuntimeOwnerId, persistedRuntimeOwnerId);
      assert.equal(input.expectedSessionEpoch, persistedSessionEpoch);
      assert.equal(input.sourceType, 'item_stamina_restore');
      assert.equal(input.sourceMutation.expectedStamina, persistedStamina);
      assert.equal(input.sourceMutation.expectedStaminaUpdatedAt, persistedStaminaUpdatedAt);
      assert.deepEqual(persistedInventoryItemIds, ['pill.huiyuan']);
      enterItemCommit();
      await itemCommitRelease;
      persistedInventoryItemIds = input.nextInventoryItems.map((entry: any) => entry.itemId);
      persistedStamina = input.sourceMutation.nextStamina;
      persistedStaminaUpdatedAt = input.sourceMutation.nextStaminaUpdatedAt;
      return { ok: true, alreadyCommitted: false };
    },
  };
  const useItemService = new WorldRuntimeUseItemService(repo, {}, durableService);
  const pendingItemUse = useItemService.dispatchUseItem(playerId, staminaItem.itemInstanceId, {
    durableOperationService: durable,
    refreshQuestStates() { },
    queuePlayerNotice() { },
  });
  await itemCommitEntered;
  assert.equal(durablePlayer.stamina, 0, '耐久提交确认前不得提前抬高运行态体力');
  assert.equal(durablePlayer.inventory.items.length, 1, '耐久提交确认前不得提前移除体力丹');
  assert.equal(persistedStamina, 0, '耐久事务提交前数据库体力保持不变');
  assert.deepEqual(persistedInventoryItemIds, ['pill.huiyuan'], '耐久事务提交前数据库背包保持不变');
  releaseItemCommit();
  await pendingItemUse;
  assert.equal(durablePlayer.stamina, 24, '耐久提交后运行态应恢复一枚体力丹的 24 点体力');
  assert.equal(durablePlayer.inventory.items.length, 0, '耐久提交后运行态只消耗一枚体力丹');
  assert.equal(persistedStamina, 24, '同一耐久事务应提交体力后态');
  assert.deepEqual(persistedInventoryItemIds, [], '同一耐久事务应提交背包扣丹后态');

  const immediateEntry = await durableService.consumeDungeonStaminaForPlayersDurably([playerId], 4, initialNow + 10);
  assert.equal(immediateEntry.ok, true, '一枚体力丹耐久提交后应可立即进入副本');
  assert.equal(persistedStamina, 20, '立即进入副本应从耐久真源扣除 4 点体力');
  assert.equal(durablePlayer.stamina, 20, '副本扣除后运行态应回写耐久真源余额');

  const concurrentResults = await Promise.all([
    durableService.consumeDungeonStaminaForPlayersDurably([playerId], 16, initialNow + 20),
    durableService.consumeDungeonStaminaForPlayersDurably([playerId], 16, initialNow + 21),
  ]);
  assert.equal(concurrentResults.filter((result) => result.ok).length, 1, '并发副本扣除只能有一个成功');
  assert.equal(maxConcurrentDungeonCommits, 1, '同一玩家副本扣除必须由资产锁串行进入数据库事务');
  assert.equal(persistedStamina, 4, '并发扣除不得用旧运行态快照复活已扣体力');
  assert.equal(durablePlayer.stamina, 4, '并发扣除结束后运行态应保持最终耐久余额');
}

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
    refreshQuestStates() { },
    advanceLearnTechniqueQuest() { },
    queuePlayerNotice() { },
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
  [{ itemId: 'pill.minor_heal', cooldown: 60, startedAtTick: 40 }],
  '缺少 type 的旧瞬回药实例也必须写入 60 息冷却投影',
);
assert.throws(
  () => service.useItem(legacyPlayerId, 0),
  (error: unknown) => error instanceof BadRequestException && /冷却中/.test(error.message),
  '缺少 type 的旧瞬回药实例也必须被冷却拦截',
);

async function main() {
  await testManualUseItemBranch();
  await testDurableStaminaPillAndConcurrentDungeonEntry();
  console.log('inventory-consumable-cooldown-smoke ok');
}

void main();
