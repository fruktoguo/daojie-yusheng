import type { Direction, EntityKind, GameTimeState, MonsterTier, VisibleBuffState, VisibleTile } from './world-core-types';
import type { CombatEffect } from './action-combat-types';
import type { GroundItemEntryView } from './loot-view-types';
import type { ObservationInsight } from './observation-types';
import type { NpcQuestMarker } from './world-view-types';

/**
 * 高频世界同步与局部 patch 共享视图。
 */

/** Tick 增量实体数据（支持 null 表示清除字段）。 */
export interface TickRenderEntityView {
  id: string;
  x: number;
  y: number;
  char?: string;
  color?: string;
  name?: string | null;
  kind?: EntityKind | 'player' | null;
  monsterTier?: MonsterTier | null;
  monsterScale?: number | null;
  hp?: number | null;
  maxHp?: number | null;
  qi?: number | null;
  maxQi?: number | null;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  buffs?: VisibleBuffState[] | null;
}

/** 地面物品堆增量补丁。 */
export interface GroundItemPilePatchView {
  sourceId: string;
  x: number;
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** 视野内地块增量补丁。 */
export interface VisibleTilePatchView {
  x: number;
  y: number;
  tile: VisibleTile | null;
}

/** 世界增量中的玩家实体补丁。 */
export interface WorldPlayerPatchView {
  id: string;
  x?: number;
  y?: number;
  sc?: number | null;
  rm?: 1;
}

/** 世界增量中的怪物实体补丁。 */
export interface WorldMonsterPatchView {
  id: string;
  mid?: string;
  x?: number;
  y?: number;
  hp?: number;
  maxHp?: number;
  n?: string;
  c?: string;
  tr?: MonsterTier;
  sc?: number | null;
  rm?: 1;
}

/** 世界增量中的 NPC 实体补丁。 */
export interface WorldNpcPatchView {
  id: string;
  x?: number;
  y?: number;
  n?: string;
  ch?: string;
  c?: string;
  sh?: 1;
  qm?: NpcQuestMarker | null;
  rm?: 1;
}

/** 世界增量中的传送点补丁。 */
export interface WorldPortalPatchView {
  id: string;
  x?: number;
  y?: number;
  tm?: string;
  tr?: 0 | 1;
  rm?: 1;
}

/** 世界增量中的地面掉落补丁。 */
export interface WorldGroundPatchView {
  sourceId: string;
  x: number;
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** 世界增量中的容器实体补丁。 */
export interface WorldContainerPatchView {
  id: string;
  x?: number;
  y?: number;
  n?: string;
  ch?: string;
  c?: string;
  rm?: 1;
}

/** 世界增量主体视图。 */
export interface WorldDeltaView {
  t: number;
  wr: number;
  sr: number;
  p?: WorldPlayerPatchView[];
  m?: WorldMonsterPatchView[];
  n?: WorldNpcPatchView[];
  o?: WorldPortalPatchView[];
  g?: WorldGroundPatchView[];
  c?: WorldContainerPatchView[];
  threatArrows?: [string, string][];
  threatArrowAdds?: [string, string][];
  threatArrowRemoves?: [string, string][];
  fx?: CombatEffect[];
  path?: [number, number][];
  dt?: number;
  time?: GameTimeState;
  auraLevelBaseValue?: number;
  v?: VisibleTile[][];
  tp?: VisibleTilePatchView[];
  mid?: string;
}

/** 自身状态增量视图。 */
export interface SelfDeltaView {
  sr: number;
  iid?: string;
  mid?: string;
  x?: number;
  y?: number;
  f?: Direction;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
}

/** 高频 tick 增量主体视图。 */
export interface TickView {
  p: TickRenderEntityView[];
  t?: VisibleTilePatchView[];
  e: TickRenderEntityView[];
  r?: string[];
  threatArrows?: [string, string][];
  threatArrowAdds?: [string, string][];
  threatArrowRemoves?: [string, string][];
  g?: GroundItemPilePatchView[];
  fx?: CombatEffect[];
  v?: VisibleTile[][];
  dt?: number;
  m?: string;
  path?: [number, number][];
  hp?: number;
  qi?: number;
  f?: Direction;
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}
