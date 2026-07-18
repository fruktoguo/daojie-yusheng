import assert from 'node:assert/strict';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { spawnTileDrops } from '../runtime/world/combat/tile-drop.helpers';

function main(): void {
  const player = {
    id: 'player:issue-000001',
    playerId: 'player:issue-000001',
    inventory: {
      capacity: 20,
      revision: 7,
      items: [{ itemId: 'spirit_stone', name: '灵石', type: 'material', count: 12 }],
    },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 12, frozenBalance: 0, version: 1 }],
    },
    attrs: { craftEffectStats: {} },
    dirtyDomains: new Set<string>(),
    persistentRevision: 3,
    selfRevision: 5,
  };
  const runtime = {
    contentTemplateRepository: {
      normalizeItem(item: unknown) {
        return item;
      },
    },
    playerProgressionService: { refreshPreview() {} },
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    captureOfflineGainBeforeTick() {
      return null;
    },
    recordAssetStatisticMutation() {},
    refreshWalletCacheFromInventory: PlayerRuntimeService.prototype.refreshWalletCacheFromInventory,
    bumpPersistentRevision: PlayerRuntimeService.prototype.bumpPersistentRevision,
    receiveInventoryItem: PlayerRuntimeService.prototype.receiveInventoryItem,
  };
  const notices: unknown[][] = [];

  spawnTileDrops({
    playerId: player.playerId,
    tileDrops: [{ itemId: 'spirit_stone', count: 3, reason: 'damage' }],
    deps: {
      contentTemplateRepository: {
        createItem(itemId: string, count: number) {
          return { itemId, count, name: '灵石', type: 'material' };
        },
      },
      playerRuntimeService: runtime,
      queuePlayerNotice(...args: unknown[]) {
        notices.push(args);
      },
    },
  });

  assert.equal(player.inventory.items.length, 1);
  assert.equal(player.inventory.items[0]?.count, 15);
  assert.equal(player.inventory.revision, 8);
  assert.equal(player.wallet.balances[0]?.balance, 15);
  assert.equal(player.selfRevision, 6);
  assert.equal(player.persistentRevision, 4);
  assert.equal(player.dirtyDomains.has('inventory'), true);
  assert.equal((notices[0]?.[5] as { key?: string } | undefined)?.key, 'notice.loot.tile-drop-inventory');

  console.log('REPAIR_PROOF:ISSUE-000001:CURRENT_CHAIN_PASS');
}

main();
