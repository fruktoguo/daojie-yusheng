/**
 * 本文件收敛轻量物品同步视图的字段投影，避免不同网络入口各自维护字段白名单后发生漂移。
 */
import type { SyncedItemStack } from './synced-panel-types';
import { clonePlainValue } from './structured';

/**
 * 所有允许进入客户端物品视图的字段。新增 SyncedItemStack 字段时必须在这里显式决定是否下发。
 */
export const SYNCED_ITEM_STACK_VIEW_KEYS = [
  'itemId',
  'itemInstanceId',
  'count',
  'name',
  'type',
  'desc',
  'groundLabel',
  'grade',
  'level',
  'materialCategory',
  'materialValues',
  'equipSlot',
  'equipAttrs',
  'equipStats',
  'equipValueStats',
  'equipSpecialStats',
  'effects',
  'artifactMaxQiFactor',
  'artifactEffects',
  'healAmount',
  'healPercent',
  'baselineHealPercent',
  'baselineQiPercent',
  'qiPercent',
  'cooldown',
  'consumeBuffs',
  'tags',
  'contextActions',
  'enhanceLevel',
  'craftEffectStats',
  'mapUnlockId',
  'mapUnlockIds',
  'respawnBindMapId',
  'useBehavior',
  'tileAuraGainAmount',
  'tileResourceGains',
  'spiritualRootSeedTier',
  'allowBatchUse',
  'learnTechniqueId',
  'learnTechniqueMaxLevel',
] as const satisfies readonly (keyof SyncedItemStack)[];

type AssertNoMissingSyncedItemStackKey<T extends never> = T;
type SyncedItemStackMissingProjectionKey = AssertNoMissingSyncedItemStackKey<
  Exclude<keyof SyncedItemStack, (typeof SYNCED_ITEM_STACK_VIEW_KEYS)[number]>
>;

/** 只复制协议允许字段，并隔离嵌套数组与对象引用。 */
export function cloneSyncedItemStackView(source: SyncedItemStack): SyncedItemStack {
  const sourceRecord = source as unknown as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of SYNCED_ITEM_STACK_VIEW_KEYS) {
    const value = sourceRecord[key];
    if (value !== undefined) {
      projected[key] = clonePlainValue(value);
    }
  }
  return projected as unknown as SyncedItemStack;
}
