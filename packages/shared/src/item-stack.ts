/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 物品堆叠判定工具：通过签名比较判断两个 ItemStack 能否合并。
 *
 * 设计口径：
 * 签名 = itemId + 所有实例态字段的规范化拼接。
 * 实例态字段由 ITEM_INSTANCE_PAYLOAD_KEYS 白名单定义（与持久化层 rawPayload 同步）。
 * 只要 itemId 相同且所有实例态字段完全一致（key-value 相等，顺序无关），就视为可合并。
 * 新增实例态字段时只需在白名单中加一项，签名自动生效。
 */
import { ItemStack } from './item-runtime-types';

/**
 * 实例态字段白名单：这些字段会被持久化到 raw_payload jsonb，
 * 且参与堆叠签名判定。值不同则不能合并。
 *
 * 与 server 侧 buildPersistedInventoryItemRawPayload 保持同步：
 * 新增 rawPayload 字段时同步加到这里即可，签名自动包含。
 */
export const ITEM_INSTANCE_PAYLOAD_KEYS: readonly string[] = ['enhanceLevel'];

/** 规范化单个实例态字段值：数字取整、其余类型 JSON 序列化。 */
function normalizePayloadValue(key: string, value: unknown): string {
  if (value == null) {
    return key === 'enhanceLevel' ? '0' : '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(Math.trunc(value)) : '';
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * 物品叠加签名：由 itemId + 所有实例态字段的排序拼接构成。
 * 签名相同则视为"同一类物品"，count 可合并。
 */
export function createItemStackSignature(item: ItemStack | { itemId?: string; [key: string]: unknown }): string {
  const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
  const parts: string[] = [itemId];
  for (const key of ITEM_INSTANCE_PAYLOAD_KEYS) {
    parts.push(normalizePayloadValue(key, (item as Record<string, unknown>)?.[key]));
  }
  return parts.join('#');
}

/**
 * 是否是迁移期 fallback 形式的 itemInstanceId（含 ":" 的伪 ID，例如
 * `inv:p_xxx:0` 或 `equip:p_xxx:weapon`）。
 *
 * 历史持久化层为了让 PG 行有稳定主键，会用这种格式兜底；新版改造后这类值
 * 视为"未稳定"，水合时会被 lazy 升级为新 UUID。
 */
export function isLegacyItemInstanceId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.length > 0 && id.includes(':');
}

/**
 * 是否允许该物品参与"按签名找现有堆叠合并 count"的逻辑。
 *
 * 当前规则：所有合法的 ItemStack 都按 (itemId, enhanceLevel) 签名合并堆叠。
 * 装备类同样允许按签名合并：玩家手中同 itemId + 同强化等级的装备会合到同一 slot，
 * 与其他可堆叠物品视觉一致；这也是 itemInstanceId 引入前的玩家可见行为。
 *
 * itemInstanceId 仅用作"行身份 / 实例追踪标签"：
 *   - 合并时由现有堆叠的 itemInstanceId 胜出，新进入的 itemInstanceId 被丢弃
 *   - 当玩家从堆叠里拆 1 件做装备/强化/挂单/掉落时，被拆出的那件必须分配新 instanceId，
 *     避免与剩余堆叠共用主键（见 reassignItemInstanceId 调用点）
 *
 * 不参与合并的边界场景目前没有；保留函数签名是为了：
 *   - 让所有"找现有堆叠合并 count"的代码继续走统一入口，便于将来需要再切回独立时只改一处
 *   - null/undefined 等非法 ItemStack 直接拒绝，防止 NPE 透传到 push/find
 */
export function canMergeItemStack(item: Pick<ItemStack, 'type' | 'itemInstanceId'> | null | undefined): boolean {
  return Boolean(item);
}

/**
 * 锁定空间中的物品：物品在强化/市场等操作期间移入此区域，
 * 不参与正常背包操作（不合并、不展示、不可使用/装备/丢弃/交易）。
 *
 * 锁定物品保留完整的实例态字段和 itemInstanceId，保证进出一致。
 */
export interface LockedItem {
  /** 物品实例唯一标识，作为锁定空间索引键。 */
  itemInstanceId: string;
  /** 物品模板 ID。 */
  itemId: string;
  /** 数量（装备类恒为 1）。 */
  count: number;
  /** 锁定来源标识，如 "enhancement:{jobRunId}" / "market:{orderId}"。 */
  lockedBy: string;
  /** 锁定时间戳（Date.now()）。 */
  lockedAt: number;
  /** 物品原始实例态字段快照（enhanceLevel 等），保证进出一致。 */
  [key: string]: unknown;
}
