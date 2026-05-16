import assert from 'node:assert/strict';

import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';

function createPlayer() {
  return {
    inventory: {
      items: [
        {
          itemId: 'iron_sword',
          type: 'equipment',
          level: 1,
          count: 1,
          name: '铁剑',
          enhanceLevel: 0,
        },
        {
          itemId: 'spirit_stone',
          type: 'consumable',
          count: 3,
          name: '灵石',
        },
      ],
    },
    equipment: {
      slots: [
        {
          slot: 'weapon',
          item: {
            itemId: 'craft_tool',
            type: 'equipment',
            level: 1,
            count: 1,
            name: '百工锤',
            enhancementSpeedRate: 0,
            enhancementSuccessRate: 0,
          },
        },
      ],
    },
    enhancementSkill: {
      level: 1,
    },
    enhancementSkillLevel: 1,
    wallet: {
      balances: [
        {
          walletType: 'spirit_stone',
          // 灵石的 wallet.balance 由 syncWalletCacheFromInventory 全量镜像自
          // inventory.items 的 spirit_stone 总数，二者必须保持一致；这里也按
          // 同步后状态构造夹具，避免把"双视图同源"误用成"双账户相加"。
          balance: 3,
          frozenBalance: 0,
          version: 1,
        },
      ],
    },
  };
}

function main() {
  const service = new CraftPanelEnhancementQueryService(
    {
      getItemName(itemId: string) {
        return itemId;
      },
    } as never,
  );

  const player = createPlayer();
  const candidate = service.buildEnhancementCandidate(
    player as never,
    { source: 'inventory', slotIndex: 0 } as never,
    player.inventory.items[0] as never,
    new Map([
      ['iron_sword', {
        steps: [
          {
            targetEnhanceLevel: 1,
            materials: [{ itemId: 'spirit_stone', count: 4 }],
          },
        ],
      }],
    ]) as never,
  );

  assert.ok(candidate, 'expected enhancement candidate');
  assert.equal(candidate.materials.length, 1);
  assert.equal(candidate.materials[0]?.itemId, 'spirit_stone');
  // ownedCount 必须等同于"实际可消费量"，也就是 inventory 中 spirit_stone 的总数；
  // wallet.balances 是 inventory 的镜像缓存，不能被叠加（叠加会让玩家看到双倍灵石
  // 并误判材料充足）。
  assert.equal(candidate.materials[0]?.ownedCount, 3);

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'CraftPanelEnhancementQueryService 的 spirit_stone ownedCount 现按 inventory 真源计算，与 syncWalletCacheFromInventory 保持的镜像视图一致，不再叠加 wallet.balances。',
        completionMapping: 'release:proof:with-db.craft-enhancement-wallet-query',
      },
      null,
      2,
    ),
  );
}

main();
