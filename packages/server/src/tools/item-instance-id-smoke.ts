/**
 * 装备稳定 itemInstanceId 综合 smoke
 *
 * 覆盖方案 §15.1 中列出的 5 项：
 *   1. assignment：装备类生成入口分配 UUID；非装备类不分配；幂等
 *   2. enhancement：强化产物继承启动时的 instanceId（resolveEnhancementJobItem 模拟）
 *   3. equip：装备永远独立成 slot，不参与同签名合并（canMergeItemStack 行为）
 *   4. market：toOrderItem 脱壳（模拟 spread + delete instanceId）
 *   5. grant：buildNextInventorySnapshots / buildGrantedInventorySnapshots 透传 itemInstanceId
 *
 * 这些都是纯函数 / 数据流验证，不依赖 NestJS 容器、数据库、运行时 tick。
 * 真实集成行为由 verify:quick 的 server smoke 套件覆盖（runtime / session / readiness）。
 */
import * as assert from 'node:assert/strict';
import {
    canMergeItemStack,
    canStackItemStacks,
    createItemStackSignature,
    isItemInstanceTracked,
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
    // isItemInstanceTracked 仅装备类 true
    assert.equal(isItemInstanceTracked(makeItem()), true);
    assert.equal(isItemInstanceTracked(makeItem({ type: 'consumable' })), false);
    assert.equal(isItemInstanceTracked(makeItem({ type: 'material' })), false);
    assert.equal(isItemInstanceTracked(null), false);
    assert.equal(isItemInstanceTracked(undefined), false);

    // isLegacyItemInstanceId
    assert.equal(isLegacyItemInstanceId('inv:p_xxx:0'), true);
    assert.equal(isLegacyItemInstanceId('equip:p_xxx:weapon'), true);
    assert.equal(isLegacyItemInstanceId('00000000-0000-4000-8000-000000000001'), false);
    assert.equal(isLegacyItemInstanceId(''), false);
    assert.equal(isLegacyItemInstanceId(undefined), false);

    // canMergeItemStack：装备永远不可合并
    assert.equal(canMergeItemStack(makeItem({ itemInstanceId: 'uuid-x' })), false);
    assert.equal(canMergeItemStack(makeItem()), false); // 装备即使没 instanceId 也不可合并
    assert.equal(canMergeItemStack(makeItem({ type: 'material', itemInstanceId: 'uuid-y' })), false); // 带 instanceId 的非装备
    assert.equal(canMergeItemStack(makeItem({ type: 'material' })), true); // 普通材料可合并
    assert.equal(canMergeItemStack(makeItem({ type: 'consumable' })), true);

    // 签名算法仍然只看 itemId + enhanceLevel（保留原有同质堆叠语义）
    assert.equal(createItemStackSignature({ itemId: 'foo', enhanceLevel: 0 }), 'foo#0');
    assert.equal(createItemStackSignature({ itemId: 'foo', enhanceLevel: 9 }), 'foo#9');
    assert.equal(canStackItemStacks(
        { itemId: 'foo', enhanceLevel: 0 } as any,
        { itemId: 'foo', enhanceLevel: 0 } as any,
    ), true);

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

    // 非装备类 → 不分配
    const consumable = makeItem({ type: 'consumable' });
    assert.equal(assignItemInstanceIdIfNeeded(consumable), false);
    assert.equal(consumable.itemInstanceId, undefined);

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

function testEquipNoMerge(): void {
    // 模拟 unequipItem 把装备返回背包：
    // 即便背包里已经有同 (itemId, enhanceLevel) 的另一件装备，新装备也必须独立成 slot
    const inventory: any[] = [];
    const existing = makeItem({ itemInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    inventory.push(existing);

    const unequipped = makeItem({ itemInstanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
    // canMergeItemStack(装备) === false → 永远独立 push
    if (canMergeItemStack(unequipped)) {
        const sig = createItemStackSignature(unequipped);
        const target = inventory.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === sig);
        if (target) {
            target.count += unequipped.count;
        } else {
            inventory.push(unequipped);
        }
    } else {
        inventory.push(unequipped);
    }

    assert.equal(inventory.length, 2, 'two distinct equipments must occupy two slots');
    assert.equal(inventory[0].itemInstanceId, existing.itemInstanceId);
    assert.equal(inventory[1].itemInstanceId, unequipped.itemInstanceId);

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

    console.log('[smoke] equip-no-merge passed');
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
    testEquipNoMerge();
    testMarketShed();
    testGrantPassthrough();
    testCompareItemInstanceId();
    console.log('[smoke] item-instance-id-smoke OK');
}

main().catch((error) => {
    console.error('[smoke] item-instance-id-smoke FAILED:', error);
    process.exit(1);
});
