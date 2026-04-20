/**
 * 详情投影视图类型：承接观察掉落预览与地块实体详情结构。
 */
import type { EntityKind, MonsterTier, VisibleBuffState } from './world-core-types';
import type { ItemType } from './item-runtime-types';
import type { ObservationInsight } from './observation-types';
import type { NpcQuestMarker } from './world-view-types';

/** 观察详情里的掉落预览条目。 */
export interface ObservationLootPreviewEntry {
/**
 * itemId：ObservationLootPreviewEntry 内部字段。
 */

  itemId: string;  
  /**
 * name：ObservationLootPreviewEntry 内部字段。
 */

  name: string;  
  /**
 * type：ObservationLootPreviewEntry 内部字段。
 */

  type: ItemType;  
  /**
 * count：ObservationLootPreviewEntry 内部字段。
 */

  count: number;  
  /**
 * chance：ObservationLootPreviewEntry 内部字段。
 */

  chance: number;
}

/** 观察详情里的掉落预览列表。 */
export interface ObservationLootPreview {
/**
 * entries：ObservationLootPreview 内部字段。
 */

  entries: ObservationLootPreviewEntry[];  
  /**
 * emptyText：ObservationLootPreview 内部字段。
 */

  emptyText?: string;
}

/** 地块详情里可见实体的汇总信息。 */
export interface ObservedTileEntityDetail {
/**
 * id：ObservedTileEntityDetail 内部字段。
 */

  id: string;  
  /**
 * name：ObservedTileEntityDetail 内部字段。
 */

  name?: string;  
  /**
 * kind：ObservedTileEntityDetail 内部字段。
 */

  kind?: EntityKind | 'player' | null;  
  /**
 * monsterTier：ObservedTileEntityDetail 内部字段。
 */

  monsterTier?: MonsterTier | null;  
  /**
 * monsterScale：ObservedTileEntityDetail 内部字段。
 */

  monsterScale?: number | null;  
  /**
 * hp：ObservedTileEntityDetail 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：ObservedTileEntityDetail 内部字段。
 */

  maxHp?: number;  
  /**
 * qi：ObservedTileEntityDetail 内部字段。
 */

  qi?: number;  
  /**
 * maxQi：ObservedTileEntityDetail 内部字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：ObservedTileEntityDetail 内部字段。
 */

  npcQuestMarker?: NpcQuestMarker | null;  
  /**
 * observation：ObservedTileEntityDetail 内部字段。
 */

  observation?: ObservationInsight | null;  
  /**
 * lootPreview：ObservedTileEntityDetail 内部字段。
 */

  lootPreview?: ObservationLootPreview | null;  
  /**
 * buffs：ObservedTileEntityDetail 内部字段。
 */

  buffs?: VisibleBuffState[] | null;
}
