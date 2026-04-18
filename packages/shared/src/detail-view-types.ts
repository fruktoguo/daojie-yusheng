/**
 * 详情投影视图类型：承接观察掉落预览与地块实体详情结构。
 */
import type { EntityKind, MonsterTier, VisibleBuffState } from './world-core-types';
import type { ItemType } from './item-runtime-types';
import type { ObservationInsight } from './observation-types';
import type { NpcQuestMarker } from './world-view-types';

/** 观察详情里的掉落预览条目。 */
export interface ObservationLootPreviewEntry {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance: number;
}

/** 观察详情里的掉落预览列表。 */
export interface ObservationLootPreview {
  entries: ObservationLootPreviewEntry[];
  emptyText?: string;
}

/** 地块详情里可见实体的汇总信息。 */
export interface ObservedTileEntityDetail {
  id: string;
  name?: string;
  kind?: EntityKind | 'player' | null;
  monsterTier?: MonsterTier | null;
  monsterScale?: number | null;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  lootPreview?: ObservationLootPreview | null;
  buffs?: VisibleBuffState[] | null;
}
