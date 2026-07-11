/**
 * 传法台冒烟：自创功法残卷的专有流通渠道。
 *
 * 覆盖三件事：
 * 1. 残卷在普通坊市 order-book 的所有入口都被拒（挂售 / 求购 / 目录铺货）；
 * 2. 残卷经传法台寄售、成交后，买家拿到的实例仍带 learnTechniqueId（曾因 toFullItem
 *    白名单剥离该字段而退化成空书，使用时抛「功法书缺少功法 ID」）；
 * 3. 同 itemId 不同功法的两卷残卷各自独立成单，不会被盘口聚合成一条撮合。
 */
import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { runTransmissionAssertions } from './market-transmission-smoke.assertions';

type LooseRecord = Record<string, unknown>;

/** 只暴露 smoke 需要直接触碰的内部成员，避免整文件 ts-nocheck。 */
type MarketInternals = {
  openOrders: LooseRecord[];
  toFullItem(item: LooseRecord): LooseRecord;
  buildTransmissionListingsPage(playerId: string, payload: LooseRecord): {
    items: LooseRecord[];
    counts: { participate: number; mine: number; categoryCounts: LooseRecord };
    category: string;
    sort: string;
    total: number;
  };
  buyTransmissionLot(playerId: string, payload: LooseRecord): Promise<{ notices: LooseRecord[] }>;
};

function scroll(instanceId: string, techniqueId: string, name: string): LooseRecord {
  return {
    itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
    count: 1,
    itemInstanceId: instanceId,
    learnTechniqueId: techniqueId,
    learnTechniqueMaxLevel: 3,
    name,
    type: 'skill_book',
    grade: 'huang',
    level: 1,
  };
}

async function main(): Promise<void> {
  const sellerId = 'player:transmission-seller';
  const buyerId = 'player:transmission-buyer';
  const sellerPlayer = {
    playerId: sellerId,
    sessionId: 'session:transmission-seller',
    runtimeOwnerId: 'runtime:seller',
    sessionEpoch: 3,
    instanceId: 'instance:transmission',
    inventory: {
      items: [
        scroll('seller-scroll-a', 'gen_aaa', '《驭火诀》'),
        scroll('seller-scroll-b', 'gen_bbb', '《寒江引》'),
        { itemId: 'rat_tail', count: 1, name: '鼠尾', itemInstanceId: 'seller-rat-tail' },
        { ...scroll('seller-empty-book', '', '功法书'), learnTechniqueId: undefined },
      ] as LooseRecord[],
    },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 50, frozenBalance: 0, version: 1 }] },
  };
  const buyerPlayer = {
    playerId: buyerId,
    sessionId: 'session:transmission-buyer',
    runtimeOwnerId: 'runtime:buyer',
    sessionEpoch: 4,
    instanceId: 'instance:transmission',
    inventory: { items: [] as LooseRecord[] },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 100, frozenBalance: 0, version: 1 }] },
  };
  const runtimePlayers = new Map<string, typeof sellerPlayer>([[sellerId, sellerPlayer], [buyerId, buyerPlayer as never]]);

  const service = new MarketRuntimeService(
    {
      normalizeItem(item: LooseRecord) {
        return { ...item, count: Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1 };
      },
      getItemName(itemId: string) {
        return itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID ? '功法书' : itemId;
      },
      createItem(itemId: string, count = 1) {
        // 模板重建：与生产一致，恒不带 learnTechniqueId —— 这正是求购必造空书的根源。
        return { itemId, count, name: itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID ? '功法书' : itemId, type: itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID ? 'skill_book' : 'material' };
      },
      listItemTemplates() {
        return [{ itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID }, { itemId: 'rat_tail' }];
      },
      getItemSortLevel() {
        return 0;
      },
      // 与生产一致：残卷模板本身不绑定功法，子分类落到 other。
      getTechniqueCategoryForBookItem() {
        return null;
      },
      techniqueRegistry: {
        tryGetRef(techniqueId: string) {
          if (techniqueId === 'gen_aaa') {
            return { id: techniqueId, name: '驭火诀', category: 'arts', grade: 'earth', realmLv: 4 };
          }
          if (techniqueId === 'gen_bbb') {
            return { id: techniqueId, name: '寒江引', category: 'internal', grade: 'yellow', realmLv: 2 };
          }
          return undefined;
        },
      },
    } as never,
    {
      peekInventoryItemByInstanceId(pid: string, instanceId: string) {
        return runtimePlayers.get(pid)?.inventory?.items?.find((item) => item.itemInstanceId === instanceId) ?? null;
      },
      snapshot(pid: string) {
        return runtimePlayers.has(pid) ? structuredClone(runtimePlayers.get(pid)) : null;
      },
      getPlayerOrThrow(pid: string) {
        const player = runtimePlayers.get(pid);
        if (!player) {
          throw new Error(`unexpected player ${pid}`);
        }
        return player;
      },
      getPlayer(pid: string) {
        return runtimePlayers.get(pid) ?? null;
      },
      splitInventoryItemByInstanceId(pid: string, instanceId: string, quantity: number) {
        const player = runtimePlayers.get(pid);
        const slotIndex = player?.inventory?.items?.findIndex((entry) => entry.itemInstanceId === instanceId) ?? -1;
        const item = slotIndex >= 0 ? player?.inventory?.items?.[slotIndex] : null;
        if (!player || !item) {
          throw new Error(`unexpected split args: ${pid}/${instanceId}`);
        }
        item.count = Number(item.count ?? 0) - quantity;
        if (Number(item.count ?? 0) <= 0) {
          player.inventory.items.splice(slotIndex, 1);
        }
        return { ...item, itemInstanceId: instanceId, count: quantity };
      },
      canAffordWallet() {
        return true;
      },
      debitWallet(pid: string, _walletType: string, amount: number) {
        const player = runtimePlayers.get(pid);
        if (!player) {
          throw new Error(`unexpected debit ${pid}`);
        }
        player.wallet.balances[0].balance -= amount;
        return player;
      },
      creditWallet(pid: string, _walletType: string, amount: number) {
        const player = runtimePlayers.get(pid);
        if (!player) {
          throw new Error(`unexpected credit ${pid}`);
        }
        player.wallet.balances[0].balance += amount;
        return player;
      },
      canReceiveInventoryItem() {
        return true;
      },
      receiveInventoryItem(pid: string, item: LooseRecord) {
        const player = runtimePlayers.get(pid);
        if (!player) {
          throw new Error(`unexpected receive ${pid}`);
        }
        player.inventory.items.push({ ...item });
        return player;
      },
      replaceInventoryItems(pid: string, items: LooseRecord[]) {
        const player = runtimePlayers.get(pid);
        if (!player) {
          throw new Error(`unexpected replace ${pid}`);
        }
        player.inventory.items = items.map((entry) => ({ ...entry }));
        return player;
      },
      restoreSnapshot(snapshot: LooseRecord) {
        if (snapshot?.playerId && runtimePlayers.has(String(snapshot.playerId))) {
          runtimePlayers.set(String(snapshot.playerId), structuredClone(snapshot) as never);
        }
      },
    } as never,
    { persistMutation() { return undefined; } } as never,
    { isEnabled() { return false; } } as never,
    { isEnabled() { return false; } } as never,
  );

  const internals = service as unknown as MarketInternals;

  await runTransmissionAssertions(service, internals, { sellerId, buyerId, sellerPlayer, buyerPlayer });

  console.log(JSON.stringify({ ok: true, case: 'market-transmission' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
