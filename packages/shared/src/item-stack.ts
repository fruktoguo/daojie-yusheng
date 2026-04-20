/**
 * 物品堆叠判定工具：通过签名比较判断两个 ItemStack 能否合并。
 */
import { ItemStack } from './item-runtime-types';

/** 可比较值类型：用于统一签名序列化时的递归数据结构。 */
type ComparableValue =
  | null
  | boolean
  | number
  | string
  | ComparableValue[]
  | { [key: string]: ComparableValue };

/** normalizeComparableValue：规范化Comparable值。 */
function normalizeComparableValue(value: unknown): ComparableValue | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableValue(entry) ?? null);
  }
  if (typeof value !== 'object') {
    return String(value);
  }

  const normalizedEntries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entry]) => [key, normalizeComparableValue(entry)] as const)
    .filter(([, entry]) => entry !== undefined);

  return Object.fromEntries(normalizedEntries) as { [key: string]: ComparableValue };
}

/** 物品叠加签名：忽略数量，其余字段全部参与比较。 */
export function createItemStackSignature(item: ItemStack): string {
  const comparableEntries = Object.entries(item as unknown as Record<string, unknown>)
    .filter(([key, value]) => key !== 'count' && value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => [key, normalizeComparableValue(value)] as const)
    .filter(([, value]) => value !== undefined);

  return JSON.stringify(Object.fromEntries(comparableEntries));
}

/** 判断两个物品堆叠是否可合并（签名一致即可叠加） */
export function canStackItemStacks(left: ItemStack, right: ItemStack): boolean {
  return createItemStackSignature(left) === createItemStackSignature(right);
}





