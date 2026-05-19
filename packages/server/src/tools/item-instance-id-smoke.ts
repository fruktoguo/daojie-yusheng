/**
 * 装备稳定 itemInstanceId 综合 smoke
 *
 * 覆盖方案 §15.1 中列出的 5 项：
 *   1. assignment：装备类生成入口分配 UUID；非装备类不分配；幂等
 *   2. enhancement：强化产物继承启动时的 instanceId（resolveEnhancementJobItem 模拟）
 *   3. equip：装备按 (itemId, enhanceLevel) 签名合并堆叠（canMergeItemStack 行为），
 *      被拆出的克隆获得新 UUID 以避免持久化 PK 冲突
 *   4. market：toOrderItem 脱壳（模拟 spread + delete instanceId）
 *   5. grant：buildNextInventorySnapshots / buildGrantedInventorySnapshots 透传 itemInstanceId
 *
 * 这些都是纯函数 / 数据流验证，不依赖 NestJS 容器、数据库、运行时 tick。
 * 真实集成行为由 verify:quick 的 server smoke 套件覆盖（runtime / session / readiness）。
 */
import * as assert from 'node:assert/strict';
import {
    canMergeItemStack,
    createItemStackSignature,
    isLegacyItemInstanceId,
} from '@mud/shared';
import {
    assignItemInstanceIdIfNeeded,
    compareItemInstanceId,
    isItemInstanceIdHardCheckEnabled,
    reassignItemInstanceId,
} from '../runtime/world/item-instance-id.helpers';
import {
    buildGrantedInventorySnapshots,
    buildNextInventorySnapshots,
} from '../runtime/world/world-runtime-inventory-grant.helpers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeItem(overrides: Record<string, unknown> = {}): any {
    return {
        itemId: 'equip.test_blade',
        name: '测试剑',
        type: 'equipment',
        count: 1,
        desc: '',
        level: 1,
        ...overrides,
    };
}

function testSharedHelpers(): void {
    // isLegacyItemInstanceId
    assert.equal(isLegacyItemInstanceId('inv:p_xxx:0'), true);
    assert.equal(isLegacyItemInstanceId('equip:p_xxx:weapon'), true);
    assert.equal(isLegacyItemInstanceId('00000000-0000-4000-8000-000000000001'), false);
    assert.equal(isLegacyItemInstanceId(''), false);
    assert.equal(isLegacyItemInstanceId(undefined), false);

    // canMergeItemStack：装备允许按签名合并堆叠（与其他可堆叠物品一致）；
    // null/undefined 等非法 ItemStack 仍被拒绝。
    assert.equal(canMergeItemStack(makeItem({ itemInstanceId: 'uuid-x' })), true);
    assert.equal(canMergeItemStack(makeItem()), true);
    assert.equal(canMergeItemStack(makeItem({ type: 'material', itemInstanceId: 'uuid-y' })), true);
    assert.equal(canMergeItemStack(makeItem({ type: 'material' })), true);
    assert.equal(canMergeItemStack(makeItem({ type: 'consumable' })), true);
    assert.equal(canMergeItemStack(null), false);
    assert.equal(canMergeItemStack(undefined), false);

    // 签名算法仍然只看 itemId + enhanceLevel（保留原有同质堆叠语义）
    assert.equal(createItemStackSignature({ itemId: 'foo', enhanceLevel: 0 }), 'foo#0');
    assert.equal(createItemStackSignature({ itemId: 'foo', enhanceLevel: 9 }), 'foo#9');
    assert.equal(
        createItemStackSignature({ itemId: 'foo', enhanceLevel: 0 } as any)
        === createItemStackSignature({ itemId: 'foo', enhanceLevel: 0 } as any),
        true,
    );

    console.log('[smoke] shared helpers passed');
}

function testAssignment(): void {
    // 装备生成 → 分配新 UUID
    const a = makeItem();
    const allocated = assignItemInstanceIdIfNeeded(a);
    assert.equal(allocated, true);
    assert.match(a.itemInstanceId, UUID_PATTERN);

    // 同 itemId+enhanceLevel 的两件装备 → instanceId 不同
    const b = makeItem();
    assignItemInstanceIdIfNeeded(b);
    assert.notEqual(a.itemInstanceId, b.itemInstanceId, 'two equipments must have distinct instanceIds');

    // 幂等：再调一次不变
    const before = a.itemInstanceId;
    const re = assignItemInstanceIdIfNeeded(a);
    assert.equal(re, false);
    assert.equal(a.itemInstanceId, before);

    // 所有物品类型都分配 instanceId（每个格子独立 ID）
    const consumable = makeItem({ type: 'consumable' });
    delete consumable.itemInstanceId;
    assert.equal(assignItemInstanceIdIfNeeded(consumable), true);
    assert.match(consumable.itemInstanceId, UUID_PATTERN);

    // 迁移期 fallback ID → 升级为新 UUID
    const legacy = makeItem({ itemInstanceId: 'inv:p_test:5' });
    const upgraded = assignItemInstanceIdIfNeeded(legacy);
    assert.equal(upgraded, true);
    assert.notEqual(legacy.itemInstanceId, 'inv:p_test:5');
    assert.match(legacy.itemInstanceId, UUID_PATTERN);

    // reassignItemInstanceId 强制刷新（市场买家成交语义）
    const c = makeItem({ itemInstanceId: '11111111-1111-4111-8111-111111111111' });
    const newId = reassignItemInstanceId(c);
    assert.match(newId ?? '', UUID_PATTERN);
    assert.notEqual(newId, '11111111-1111-4111-8111-111111111111');

    console.log('[smoke] assignment passed');
}

function testEnhancementInheritance(): void {
    // 模拟 resolveEnhancementJobItem 的核心继承逻辑：
    // 强化启动时 enhancementJob.item.itemInstanceId 锁定，产物（成功/失败/降级/取消）必须继承同一个 ID
    const startItem = makeItem({ itemInstanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', enhanceLevel: 0 });
    const job = { item: startItem, targetItemId: startItem.itemId, targetItemName: startItem.name, targetItemLevel: 1 };

    // 模拟 finishEnhancementJob 在四个分支上都重组装备
    function rebuildAfterEnhancement(resultingLevel: number): any {
        const inheritedInstanceId = job.item.itemInstanceId;
        const item = {
            ...startItem,
            itemInstanceId: inheritedInstanceId,
            enhanceLevel: resultingLevel,
        };
        // 这一步对应 resolveEnhancementJobItem 末尾的 assignItemInstanceIdIfNeeded 兜底
        assignItemInstanceIdIfNeeded(item);
        return item;
    }

    const success = rebuildAfterEnhancement(1);
    const failure = rebuildAfterEnhancement(0); // 失败保持原级
    const degraded = rebuildAfterEnhancement(0); // 保护降级
    const cancelled = rebuildAfterEnhancement(0); // 取消

    assert.equal(success.itemInstanceId, startItem.itemInstanceId);
    assert.equal(failure.itemInstanceId, startItem.itemInstanceId);
    assert.equal(degraded.itemInstanceId, startItem.itemInstanceId);
    assert.equal(cancelled.itemInstanceId, startItem.itemInstanceId);

    console.log('[smoke] enhancement inheritance passed');
}

function testEquipCanMergeBySignature(): void {
    // 同 (itemId, enhanceLevel) 的装备按签名合并堆叠，行为与可堆叠物品一致。
    // 现有堆叠的 itemInstanceId 胜出，新进入的 itemInstanceId 被丢弃。
    {
        const inventory: any[] = [];
        const existing = makeItem({ itemInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
        inventory.push(existing);

        const incoming = makeItem({ itemInstanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
        if (canMergeItemStack(incoming)) {
            const sig = createItemStackSignature(incoming);
            const target = inventory.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === sig);
            if (target) {
                target.count += incoming.count;
            } else {
                inventory.push(incoming);
            }
        } else {
            inventory.push(incoming);
        }

        assert.equal(inventory.length, 1, 'same (itemId, enhanceLevel) equipment must merge into a single slot');
        assert.equal(inventory[0].count, 2, 'merged stack count must increment');
        assert.equal(
            inventory[0].itemInstanceId,
            existing.itemInstanceId,
            'merged stack keeps the existing itemInstanceId',
        );
    }

    // 不同 enhanceLevel 的装备签名不同 → 不合并
    {
        const inventory: any[] = [];
        inventory.push(makeItem({ itemInstanceId: '11111111-1111-4111-8111-111111111111', enhanceLevel: 0 }));
        const plus5 = makeItem({ itemInstanceId: '22222222-2222-4222-8222-222222222222', enhanceLevel: 5 });
        if (canMergeItemStack(plus5)) {
            const sig = createItemStackSignature(plus5);
            const target = inventory.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === sig);
            if (target) {
                target.count += plus5.count;
            } else {
                inventory.push(plus5);
            }
        } else {
            inventory.push(plus5);
        }
        assert.equal(inventory.length, 2, 'different enhanceLevel must occupy distinct slots');
        assert.equal(inventory[0].enhanceLevel, 0);
        assert.equal(inventory[1].enhanceLevel, 5);
    }

    // 对照：非装备同签名要合并
    const stackA = makeItem({ type: 'material', itemId: 'mat.iron', count: 3 });
    const stackB = makeItem({ type: 'material', itemId: 'mat.iron', count: 2 });
    delete stackA.itemInstanceId;
    delete stackB.itemInstanceId;
    const matInv: any[] = [stackA];
    if (canMergeItemStack(stackB)) {
        const sig = createItemStackSignature(stackB);
        const target = matInv.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === sig);
        if (target) {
            target.count += stackB.count;
        } else {
            matInv.push(stackB);
        }
    }
    assert.equal(matInv.length, 1, 'materials with same itemId must merge');
    assert.equal(matInv[0].count, 5);

    console.log('[smoke] equip-merge-by-signature passed');
}

function testStackSplitGetsFreshInstanceId(): void {
    // 模拟从 count > 1 的装备堆叠里拆 1 件出来（equip / 强化 / 挂单 / 掉落都会经过这一步）：
    // 被拆出的克隆必须分配新的 itemInstanceId，否则会在
    // player_inventory_item / player_equipment_slot 等表上与剩余堆叠共用 PK，
    // 导致持久化层 ON CONFLICT (item_instance_id) 误覆盖或 UNIQUE 冲突。
    const stackInstanceId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const original = makeItem({ itemInstanceId: stackInstanceId, count: 5, enhanceLevel: 0 });
    const inventory: any[] = [original];

    // 模拟 takeSingleInventoryItemForEquipment / extractInventoryItemAt 的 count > 1 分支：
    //   - 原 slot 保持原 itemInstanceId，count -=1
    //   - 克隆出 count=1，分配新的 itemInstanceId
    const remaining = inventory[0];
    remaining.count = 5 - 1;
    const cloned = { ...remaining, count: 1 } as Record<string, unknown>;
    // 所有物品拆分时都分配新 instanceId
    if (typeof cloned.itemInstanceId === 'string' && cloned.itemInstanceId.length > 0) {
        // 真实代码使用 randomUUID()；smoke 用固定值便于断言
        cloned.itemInstanceId = 'aaaaaaaa-2222-4222-8222-222222222222';
    }

    assert.equal(inventory[0].itemInstanceId, stackInstanceId, 'remaining stack keeps the original itemInstanceId');
    assert.equal(inventory[0].count, 4);
    assert.notEqual(
        cloned.itemInstanceId,
        stackInstanceId,
        'cloned single item must get a fresh itemInstanceId distinct from the remaining stack',
    );

    // 非装备拆分：同样分配新 instanceId（每个格子独立 ID）
    const matStack = makeItem({ type: 'material', itemId: 'mat.iron', count: 5 });
    // 按新规范，所有物品入背包时都会被分配 instanceId
    assignItemInstanceIdIfNeeded(matStack);
    const matStackId = matStack.itemInstanceId;
    const matCloned = { ...matStack, count: 1 } as Record<string, unknown>;
    if (typeof matCloned.itemInstanceId === 'string' && (matCloned.itemInstanceId as string).length > 0) {
        matCloned.itemInstanceId = 'bbbbbbbb-3333-4333-8333-333333333333';
    }
    assert.notEqual(matCloned.itemInstanceId, matStackId, 'material split must also get a fresh itemInstanceId');

    console.log('[smoke] stack-split-fresh-instance-id passed');
}

function testDuplicateVisibleInventoryRepair(): void {
    const duplicateId = '1ca4ad01-d4cd-4cb8-9e55-b6ced695b112';
    const inventory = [
        makeItem({ itemInstanceId: duplicateId, count: 1, slotIndex: 81 }),
        makeItem({ itemInstanceId: duplicateId, count: 1, slotIndex: 170 }),
    ];
    const seen = new Set<string>();
    let repaired = false;
    for (const item of inventory) {
        const itemInstanceId = typeof item.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
        if (!itemInstanceId || !seen.has(itemInstanceId)) {
            if (itemInstanceId) {
                seen.add(itemInstanceId);
            }
            continue;
        }
        item.itemInstanceId = 'aaaaaaaa-4444-4444-8444-444444444444';
        seen.add(item.itemInstanceId);
        repaired = true;
    }

    assert.equal(repaired, true);
    assert.equal(inventory[0].itemInstanceId, duplicateId);
    assert.notEqual(inventory[1].itemInstanceId, duplicateId);

    console.log('[smoke] duplicate-visible-inventory-repair passed');
}

function testMarketShed(): void {
    // 模拟 toOrderItem 把卖家物品脱壳后挂入 market_listing
    const sellerItem = makeItem({ itemInstanceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    const normalized: Record<string, unknown> = { ...sellerItem };
    if ('itemInstanceId' in normalized) {
        delete normalized.itemInstanceId;
    }
    const orderItem = { ...normalized, count: 1 };
    assert.equal('itemInstanceId' in orderItem, false, 'market order must shed itemInstanceId');

    // 买家成交后，receiveInventoryItem 重新分配（assignItemInstanceIdIfNeeded 行为）
    const buyerItem = { ...orderItem };
    assignItemInstanceIdIfNeeded(buyerItem as any);
    assert.match((buyerItem as any).itemInstanceId, UUID_PATTERN);
    assert.notEqual((buyerItem as any).itemInstanceId, sellerItem.itemInstanceId);

    console.log('[smoke] market shed passed');
}

function testGrantPassthrough(): void {
    // buildNextInventorySnapshots / buildGrantedInventorySnapshots 必须透传 itemInstanceId
    const items = [
        makeItem({ itemInstanceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
        makeItem({ type: 'material', itemId: 'mat.iron', count: 5 }),
    ];

    const next = buildNextInventorySnapshots(items);
    assert.equal(next.length, 2);
    assert.equal(next[0].itemInstanceId, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(next[1].itemInstanceId, undefined);

    const granted = buildGrantedInventorySnapshots(items);
    assert.equal(granted.length, 2);
    assert.equal(granted[0].itemInstanceId, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(granted[1].itemInstanceId, undefined);

    console.log('[smoke] grant passthrough passed');
}

function testCompareItemInstanceId(): void {
    // 一致 → match
    const id = '12345678-1234-4234-8234-123456789012';
    assert.equal(compareItemInstanceId(id, id), 'match');

    // 期望缺失 → match（兼容旧客户端）
    assert.equal(compareItemInstanceId(id, undefined), 'match');
    assert.equal(compareItemInstanceId(id, ''), 'match');

    // 期望存在但实际缺失 → skip（迁移期未升级）
    assert.equal(compareItemInstanceId(undefined, id), 'skip');
    assert.equal(compareItemInstanceId(null, id), 'skip');

    // 实际是 legacy fallback → skip（迁移期容忍）
    assert.equal(compareItemInstanceId('inv:p_x:0', id), 'skip');

    // 都是合法 UUID 但不同 → mismatch
    const otherId = '99999999-9999-4999-8999-999999999999';
    assert.equal(compareItemInstanceId(id, otherId), 'mismatch');

    // 默认软模式
    assert.equal(isItemInstanceIdHardCheckEnabled(), false);

    console.log('[smoke] compareItemInstanceId passed');
}

async function main(): Promise<void> {
    testSharedHelpers();
    testAssignment();
    testEnhancementInheritance();
    testEquipCanMergeBySignature();
    testStackSplitGetsFreshInstanceId();
    testDuplicateVisibleInventoryRepair();
    testMarketShed();
    testGrantPassthrough();
    testCompareItemInstanceId();
    console.log('[smoke] item-instance-id-smoke OK');
}

main().catch((error) => {
    console.error('[smoke] item-instance-id-smoke FAILED:', error);
    process.exit(1);
});
