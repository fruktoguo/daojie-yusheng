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
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * type：type相关字段。
 */

  type: ItemType;  
  /**
 * count：数量或计量字段。
 */

  count: number;  
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;  
  /**
 * groundLabel：groundLabel名称或显示文本。
 */

  groundLabel?: string;
}

/** 地面物品堆视图 */
export interface GroundItemPileView {
/**
 * sourceId：来源ID标识。
 */

  sourceId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * items：集合字段。
 */

  items: GroundItemEntryView[];
}

/** 搜索进度视图 */
export interface LootSearchProgressView {
/**
 * totalTicks：totaltick相关字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：remainingtick相关字段。
 */

  remainingTicks: number;  
  /**
 * elapsedTicks：elapsedtick相关字段。
 */

  elapsedTicks: number;
}

/** 拾取窗口物品视图 */
export interface LootWindowItemView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;
}

/** 拾取窗口来源视图 */
export interface LootWindowSourceView {
/**
 * sourceId：来源ID标识。
 */

  sourceId: string;  
  /**
 * kind：kind相关字段。
 */

  kind: LootSourceKind;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * desc：desc相关字段。
 */

  desc?: string;  
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;  
  /**
 * searchable：searchable相关字段。
 */

  searchable: boolean;  
  /**
 * search：search相关字段。
 */

  search?: LootSearchProgressView;  
  /**
 * items：集合字段。
 */

  items: LootWindowItemView[];  
  /**
 * emptyText：emptyText名称或显示文本。
 */

  emptyText?: string;
  /**
 * variant：来源附加变体标识。
 */

  variant?: 'herb';
  /**
 * herb：草药采集摘要。
 */

  herb?: {
    grade?: TechniqueGrade;
    level?: number;
    nativeGatherTicks?: number;
    gatherTicks?: number;
  };
  /**
 * destroyed：资源点是否已被摧毁。
 */

  destroyed?: boolean;
}

/** 拾取窗口状态 */
export interface LootWindowState {
/**
 * tileX：tileX相关字段。
 */

  tileX: number;  
  /**
 * tileY：tileY相关字段。
 */

  tileY: number;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * sources：来源相关字段。
 */

  sources: LootWindowSourceView[];
}
