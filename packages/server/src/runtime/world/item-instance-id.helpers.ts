/**
 * 装备稳定 InstanceID 工具集
 *
 * 提供 ItemStack.itemInstanceId 字段的统一分配 / 检测 / 升级行为。
 *
 * 设计口径：
 *   - 装备类（type === 'equipment'）必须带稳定 instanceId
 *   - 历史 fallback 形式 `inv:{playerId}:{slot}` / `equip:{playerId}:{slot}`
 *     （含 ":"）视为"未稳定"，由水合阶段或下一次接触 lazy 升级
 *   - 服务端独占生成（randomUUID v4），客户端只读
 *
 * 参见：docs/plans/装备稳定InstanceID改造计划.md §5 §10 §14
 */
import { randomUUID } from 'node:crypto';
import type { ItemStack } from '@mud/shared';
import { isItemInstanceTracked, isLegacyItemInstanceId } from '@mud/shared';

/**
 * 若该物品需要 itemInstanceId 但当前缺失或处于迁移期 fallback，则就地分配新 UUID。
 *
 * 行为：
 *   - 非装备类（不需要 instanceId）：不动，返回 false
 *   - 已有合法 UUID（不含 ":"）：不动，返回 false
 *   - 缺失 / 迁移期 fallback：分配新 UUID，返回 true
 *
 * 这是一次幂等写入：可在生成入口、水合入口、堆叠合并前等任意位置调用。
 */
export function assignItemInstanceIdIfNeeded(item: ItemStack | null | undefined): boolean {
    if (!item || typeof item !== 'object') {
        return false;
    }
    if (!isItemInstanceTracked(item)) {
        return false;
    }
    const current = (item as { itemInstanceId?: unknown }).itemInstanceId;
    if (typeof current === 'string' && current.length > 0 && !isLegacyItemInstanceId(current)) {
        return false;
    }
    (item as { itemInstanceId?: string }).itemInstanceId = randomUUID();
    return true;
}

/**
 * 强制分配新 itemInstanceId（无视当前是否已有合法值）。
 *
 * 用于"卖家挂单脱壳后买家成交需要新身份"这类边界场景：
 * 即使 source 仍带原 instanceId，也必须刷新成新值，避免买家收到的物品
 * 与卖家手里的某个历史副本共用 ID。
 *
 * 仅装备类物品需要重新分配；非装备类原样返回（不做改动）。
 */
export function reassignItemInstanceId(item: ItemStack | null | undefined): string | undefined {
    if (!item || typeof item !== 'object') {
        return undefined;
    }
    if (!isItemInstanceTracked(item)) {
        return undefined;
    }
    const id = randomUUID();
    (item as { itemInstanceId?: string }).itemInstanceId = id;
    return id;
}

/**
 * 重新导出 isLegacyItemInstanceId / isItemInstanceTracked，便于服务端层就近引用。
 *
 * （shared 工具的实现规范放在 packages/shared/src/item-stack.ts；
 *  服务端无需自己实现，统一从 shared 走以避免协议歧义）
 */
export { isItemInstanceTracked, isLegacyItemInstanceId };
