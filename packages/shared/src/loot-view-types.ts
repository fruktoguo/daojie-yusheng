/**
 * 拾取共享视图类型：承接地面掉落、搜索进度与拾取窗口结构。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { ItemStack, ItemType } from './item-runtime-types';

/** 拾取来源类型 */
export type LootSourceKind = 'ground' | 'container';

/** 地面物品条目视图 */
export interface GroundItemEntryView {
/**
 * itemKey：GroundItemEntryView 内部字段。
 */

  itemKey: string;  
  /**
 * itemId：GroundItemEntryView 内部字段。
 */

  itemId: string;  
  /**
 * name：GroundItemEntryView 内部字段。
 */

  name: string;  
  /**
 * type：GroundItemEntryView 内部字段。
 */

  type: ItemType;  
  /**
 * count：GroundItemEntryView 内部字段。
 */

  count: number;  
  /**
 * grade：GroundItemEntryView 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * groundLabel：GroundItemEntryView 内部字段。
 */

  groundLabel?: string;
}

/** 地面物品堆视图 */
export interface GroundItemPileView {
/**
 * sourceId：GroundItemPileView 内部字段。
 */

  sourceId: string;  
  /**
 * x：GroundItemPileView 内部字段。
 */

  x: number;  
  /**
 * y：GroundItemPileView 内部字段。
 */

  y: number;  
  /**
 * items：GroundItemPileView 内部字段。
 */

  items: GroundItemEntryView[];
}

/** 搜索进度视图 */
export interface LootSearchProgressView {
/**
 * totalTicks：LootSearchProgressView 内部字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：LootSearchProgressView 内部字段。
 */

  remainingTicks: number;  
  /**
 * elapsedTicks：LootSearchProgressView 内部字段。
 */

  elapsedTicks: number;
}

/** 拾取窗口物品视图 */
export interface LootWindowItemView {
/**
 * itemKey：LootWindowItemView 内部字段。
 */

  itemKey: string;  
  /**
 * item：LootWindowItemView 内部字段。
 */

  item: ItemStack;
}

/** 拾取窗口来源视图 */
export interface LootWindowSourceView {
/**
 * sourceId：LootWindowSourceView 内部字段。
 */

  sourceId: string;  
  /**
 * kind：LootWindowSourceView 内部字段。
 */

  kind: LootSourceKind;  
  /**
 * title：LootWindowSourceView 内部字段。
 */

  title: string;  
  /**
 * desc：LootWindowSourceView 内部字段。
 */

  desc?: string;  
  /**
 * grade：LootWindowSourceView 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * searchable：LootWindowSourceView 内部字段。
 */

  searchable: boolean;  
  /**
 * search：LootWindowSourceView 内部字段。
 */

  search?: LootSearchProgressView;  
  /**
 * items：LootWindowSourceView 内部字段。
 */

  items: LootWindowItemView[];  
  /**
 * emptyText：LootWindowSourceView 内部字段。
 */

  emptyText?: string;
}

/** 拾取窗口状态 */
export interface LootWindowState {
/**
 * tileX：LootWindowState 内部字段。
 */

  tileX: number;  
  /**
 * tileY：LootWindowState 内部字段。
 */

  tileY: number;  
  /**
 * title：LootWindowState 内部字段。
 */

  title: string;  
  /**
 * sources：LootWindowState 内部字段。
 */

  sources: LootWindowSourceView[];
}
