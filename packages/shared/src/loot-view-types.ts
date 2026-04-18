/**
 * 拾取共享视图类型：承接地面掉落、搜索进度与拾取窗口结构。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { ItemStack, ItemType } from './item-runtime-types';

/** 拾取来源类型 */
export type LootSourceKind = 'ground' | 'container';

/** 地面物品条目视图 */
export interface GroundItemEntryView {
  itemKey: string;
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  grade?: TechniqueGrade;
  groundLabel?: string;
}

/** 地面物品堆视图 */
export interface GroundItemPileView {
  sourceId: string;
  x: number;
  y: number;
  items: GroundItemEntryView[];
}

/** 搜索进度视图 */
export interface LootSearchProgressView {
  totalTicks: number;
  remainingTicks: number;
  elapsedTicks: number;
}

/** 拾取窗口物品视图 */
export interface LootWindowItemView {
  itemKey: string;
  item: ItemStack;
}

/** 拾取窗口来源视图 */
export interface LootWindowSourceView {
  sourceId: string;
  kind: LootSourceKind;
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
  searchable: boolean;
  search?: LootSearchProgressView;
  items: LootWindowItemView[];
  emptyText?: string;
}

/** 拾取窗口状态 */
export interface LootWindowState {
  tileX: number;
  tileY: number;
  title: string;
  sources: LootWindowSourceView[];
}
