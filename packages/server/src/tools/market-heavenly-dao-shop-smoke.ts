import assert from 'node:assert/strict';

import { HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID } from '@mud/shared';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

type SmokeItem = {
  itemId: string;
  count: number;
  name?: string;
  type?: string;
};

type SmokePlayer = {
  playerId: string;
  inventory: { items: SmokeItem[]; capacity: number; revision?: number };
  wallet: { balances: Array<{ walletType: string; balance: number; frozenBalance?: number; version?: number }> };
};

function normalizeCount(value: unknown): number {
  const numeric = Number(value ?? 1);
  return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1;
}

function createContentRepository() {
  const names = new Map<string, string>([
    [HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, '功德'],
    ['spirit_stone', '灵石'],
    ['pill.ningxiang', '凝相丹'],
  ]);
  return {
    normalizeItem(item: SmokeItem): SmokeItem {
      return { ...item, count: normalizeCount(item?.count), name: item?.name ?? names.get(item?.itemId) ?? item?.itemId };
    },
    createItem(itemId: string, count = 1): SmokeItem | null {
      const name = names.get(itemId);
      if (!name) {
        return null;
      }
      return { itemId, count: normalizeCount(count), name, type: 'consumable' };
    },
    getItemName(itemId: string): string {
      return names.get(itemId) ?? itemId;
    },
    listItemTemplates(): SmokeItem[] {
      return [];
    },
  };
}

function createPlayerRuntimeService(runtimePlayers: Map<string, SmokePlayer>) {
  function getPlayerOrThrow(playerId: string): SmokePlayer {
    const player = runtimePlayers.get(playerId);
    if (!player) {
      throw new Error(`unexpected player ${playerId}`);
    }
    return player;
  }
  function syncWalletFromInventory(player: SmokePlayer, itemId: string): void {
    const balance = player.inventory.items
      .filter((entry) => entry.itemId === itemId)
      .reduce((sum, entry) => sum + normalizeCount(entry.count), 0);
    const wallet = player.wallet.balances.find((entry) => entry.walletType === itemId);
    if (wallet) {
      wallet.balance = balance;
      return;
    }
    player.wallet.balances.push({ walletType: itemId, balance });
  }
  return {
    snapshot(playerId: string): SmokePlayer | null {
      const player = runtimePlayers.get(playerId);
      return player ? structuredClone(player) : null;
    },
    restoreSnapshot(snapshot: SmokePlayer): void {
      if (snapshot?.playerId && runtimePlayers.has(snapshot.playerId)) {
        runtimePlayers.set(snapshot.playerId, structuredClone(snapshot));
      }
    },
    getPlayer(playerId: string): SmokePlayer | null {
      return runtimePlayers.get(playerId) ?? null;
    },
    getPlayerOrThrow,
    canAffordWallet(playerId: string, walletType: string, amount: number): boolean {
      const player = getPlayerOrThrow(playerId);
      const balance = player.inventory.items
        .filter((entry) => entry.itemId === walletType)
        .reduce((sum, entry) => sum + normalizeCount(entry.count), 0);
      return balance >= Math.max(0, Math.trunc(Number(amount ?? 0)));
    },
    debitWallet(playerId: string, walletType: string, amount: number): SmokePlayer {
      const player = getPlayerOrThrow(playerId);
      let remaining = Math.max(0, Math.trunc(Number(amount ?? 0)));
      for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const item = player.inventory.items[index];
        if (item?.itemId !== walletType) {
          continue;
        }
        const consumed = Math.min(normalizeCount(item.count), remaining);
        item.count = normalizeCount(item.count) - consumed;
        remaining -= consumed;
        if (item.count <= 0) {
          player.inventory.items.splice(index, 1);
        }
      }
      if (remaining > 0) {
        throw new Error(`${walletType} balance not enough`);
      }
      syncWalletFromInventory(player, walletType);
      return player;
    },
    canReceiveInventoryItem(playerId: string, itemId: string): boolean {
      const player = getPlayerOrThrow(playerId);
      return player.inventory.items.some((entry) => entry.itemId === itemId)
        || player.inventory.items.length < player.inventory.capacity;
    },
    receiveInventoryItem(playerId: string, item: SmokeItem): SmokePlayer {
      const player = getPlayerOrThrow(playerId);
      const count = normalizeCount(item?.count);
      const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
      if (existing) {
        existing.count = normalizeCount(existing.count) + count;
      } else {
        player.inventory.items.push({ ...item, count });
      }
      syncWalletFromInventory(player, item.itemId);
      return player;
    },
  };
}

async function main(): Promise<void> {
  const playerId = 'player:heavenly-dao-shop';
  const runtimePlayer: SmokePlayer = {
    playerId,
    inventory: {
      capacity: 10,
      items: [{ itemId: HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, count: 150, name: '功德', type: 'consumable' }],
    },
    wallet: { balances: [{ walletType: HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, balance: 150 }] },
  };
  const runtimePlayers = new Map([[playerId, runtimePlayer]]);
  const service = new MarketRuntimeService(
    createContentRepository() as never,
    createPlayerRuntimeService(runtimePlayers) as never,
    { async persistMutation() { return undefined; } } as never,
    { isEnabled() { return false; } } as never,
    null as never,
  );

  const success = await service.buyHeavenlyDaoShopItem(playerId, { itemId: 'spirit_stone', quantity: 1 });
  const playerAfterSuccess = runtimePlayers.get(playerId)!;
  assert.equal(playerAfterSuccess.inventory.items.find((entry) => entry.itemId === HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.count, 50);
  assert.equal(playerAfterSuccess.wallet.balances.find((entry) => entry.walletType === HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.balance, 50);
  assert.equal(playerAfterSuccess.inventory.items.find((entry) => entry.itemId === 'spirit_stone')?.count, 240);
  assert.equal(success.notices[0]?.structured?.key, 'notice.market.heavenly-dao-shop.purchased');

  const rejected = await service.buyHeavenlyDaoShopItem(playerId, { itemId: 'pill.ningxiang', quantity: 1 });
  const playerAfterReject = runtimePlayers.get(playerId)!;
  assert.equal(playerAfterReject.inventory.items.find((entry) => entry.itemId === HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.count, 50);
  assert.equal(playerAfterReject.inventory.items.find((entry) => entry.itemId === 'pill.ningxiang'), undefined);
  assert.equal(rejected.notices[0]?.text, '功德不足，无法购买。');

  console.log('market-heavenly-dao-shop-smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
