/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
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
import { isLegacyItemInstanceId } from '@mud/shared';
import { Logger } from '@nestjs/common';

const logger = new Logger('ItemInstanceId:LegacyCompat');

/**
 * 若该物品当前缺失 itemInstanceId 或处于迁移期 fallback，则就地分配新 UUID。
 *
 * 行为：
 *   - null/undefined/非对象：不动，返回 false
 *   - 物品对象自带 instanceId：删除该错误字段，返回 true
 *   - 已有合法 UUID（不含 ":"）：除清理 instanceId 外不动
 *   - 缺失 / 迁移期 fallback：分配新 UUID，返回 true
 *
 * 规范：每个独立格子的物品都必须有独立的 itemInstanceId，无论物品类型。
 */
export function assignItemInstanceIdIfNeeded(item: ItemStack | null | undefined): boolean {
    if (!item || typeof item !== 'object') {
        return false;
    }
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(item, 'instanceId')) {
        delete (item as { instanceId?: unknown }).instanceId;
        changed = true;
    }
    const current = (item as { itemInstanceId?: unknown }).itemInstanceId;
    if (typeof current === 'string' && current.length > 0 && !isLegacyItemInstanceId(current)) {
        return changed;
    }
    if (typeof current === 'string' && isLegacyItemInstanceId(current)) {
        logger.warn(`物品水合期 legacy itemInstanceId 升级：old=${current} itemId=${(item as { itemId?: string }).itemId ?? 'unknown'}`);
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
 * 所有物品都需要重新分配；null/非对象原样返回。
 */
export function reassignItemInstanceId(item: ItemStack | null | undefined): string | undefined {
    if (!item || typeof item !== 'object') {
        return undefined;
    }
    const id = randomUUID();
    (item as { itemInstanceId?: string }).itemInstanceId = id;
    return id;
}

/**
 * 重新导出 isLegacyItemInstanceId，便于服务端层就近引用。
 *
 * （shared 工具的实现规范放在 packages/shared/src/item-stack.ts；
 *  服务端无需自己实现，统一从 shared 走以避免协议歧义）
 */
export { isLegacyItemInstanceId };

/**
 * 是否启用 itemInstanceId 硬校验模式。
 *
 * - false（默认，迁移期）：客户端 expectedItemInstanceId 与服务端实际 instanceId
 *   不匹配时只记录 warn 日志，不拒绝请求。让旧客户端、迁移期老装备能继续工作。
 * - true（迁移完成后）：mismatch 直接拒绝并返回明确文案给玩家。
 *
 * 通过环境变量 `ITEM_INSTANCE_ID_HARD_CHECK=true` / `=1` 启用。
 *
 * 上线节奏（参见方案 §14.3）：
 *   1. 第 1 周：上线代码（HARD_CHECK=false）；新装备分配 UUID；旧装备 lazy 升级；客户端发送 expected。
 *   2. 第 2 周：观察 warn 日志，确认 mismatch 频次 < 阈值。
 *   3. 第 3 周：开 HARD_CHECK=true。
 */
export function isItemInstanceIdHardCheckEnabled(): boolean {
    const raw = process.env.ITEM_INSTANCE_ID_HARD_CHECK;
    if (typeof raw !== 'string') {
        return false;
    }
    const trimmed = raw.trim().toLowerCase();
    return trimmed === 'true' || trimmed === '1' || trimmed === 'yes' || trimmed === 'on';
}

/**
 * 比对 expectedItemInstanceId 与服务端实际 instanceId。
 *
 * 返回值：
 *   - 'match'：一致（包括 expected 缺失时的兼容路径）
 *   - 'mismatch'：明确不匹配
 *   - 'skip'：跳过校验（actual 是 legacy fallback 形式，迁移期容忍）
 */
export function compareItemInstanceId(
    actualInstanceId: string | undefined | null,
    expectedInstanceId: string | undefined | null,
): 'match' | 'mismatch' | 'skip' {
    const actual = typeof actualInstanceId === 'string' ? actualInstanceId.trim() : '';
    const expected = typeof expectedInstanceId === 'string' ? expectedInstanceId.trim() : '';
    if (!expected) {
        // 旧客户端 / 非装备类目标 / 服务端不强制 → 兼容
        return 'match';
    }
    if (!actual) {
        // 服务端实际物品没有 instanceId（迁移期未升级），跳过校验
        return 'skip';
    }
    if (isLegacyItemInstanceId(actual)) {
        // 服务端是 fallback 形式，水合后才会升级，跳过校验
        logger.warn(`compareItemInstanceId 跳过校验：actual=${actual} 是 legacy 格式`);
        return 'skip';
    }
    return actual === expected ? 'match' : 'mismatch';
}
