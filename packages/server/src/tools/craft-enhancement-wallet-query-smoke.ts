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
          balance: 12,
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
  assert.equal(candidate.materials[0]?.ownedCount, 15);

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'CraftPanelEnhancementQueryService 现已把 spirit_stone 材料候选的 ownedCount 对齐到真钱包可消费总额，并兼容库存回退',
        completionMapping: 'replace-ready:proof:with-db.craft-enhancement-wallet-query',
      },
      null,
      2,
    ),
  );
}

main();
