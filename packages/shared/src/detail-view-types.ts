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
 * chance：chance相关字段。
 */

  chance: number;
}

/** 观察详情里的掉落预览列表。 */
export interface ObservationLootPreview {
/**
 * entries：集合字段。
 */

  entries: ObservationLootPreviewEntry[];  
  /**
 * emptyText：emptyText名称或显示文本。
 */

  emptyText?: string;
}

/** 地块详情里可见实体的汇总信息。 */
export interface ObservedTileEntityDetail {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: EntityKind | 'player' | null;  
  /**
 * monsterTier：怪物Tier相关字段。
 */

  monsterTier?: MonsterTier | null;  
  /**
 * monsterScale：怪物Scale相关字段。
 */

  monsterScale?: number | null;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: NpcQuestMarker | null;  
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight | null;  
  /**
 * lootPreview：掉落Preview相关字段。
 */

  lootPreview?: ObservationLootPreview | null;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[] | null;
}
