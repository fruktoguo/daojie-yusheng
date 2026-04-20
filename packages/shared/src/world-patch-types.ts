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
/**
 * id：TickRenderEntityView 内部字段。
 */

  id: string;  
  /**
 * x：TickRenderEntityView 内部字段。
 */

  x: number;  
  /**
 * y：TickRenderEntityView 内部字段。
 */

  y: number;  
  /**
 * char：TickRenderEntityView 内部字段。
 */

  char?: string;  
  /**
 * color：TickRenderEntityView 内部字段。
 */

  color?: string;  
  /**
 * name：TickRenderEntityView 内部字段。
 */

  name?: string | null;  
  /**
 * kind：TickRenderEntityView 内部字段。
 */

  kind?: EntityKind | 'player' | null;  
  /**
 * monsterTier：TickRenderEntityView 内部字段。
 */

  monsterTier?: MonsterTier | null;  
  /**
 * monsterScale：TickRenderEntityView 内部字段。
 */

  monsterScale?: number | null;  
  /**
 * hp：TickRenderEntityView 内部字段。
 */

  hp?: number | null;  
  /**
 * maxHp：TickRenderEntityView 内部字段。
 */

  maxHp?: number | null;  
  /**
 * qi：TickRenderEntityView 内部字段。
 */

  qi?: number | null;  
  /**
 * maxQi：TickRenderEntityView 内部字段。
 */

  maxQi?: number | null;  
  /**
 * npcQuestMarker：TickRenderEntityView 内部字段。
 */

  npcQuestMarker?: NpcQuestMarker | null;  
  /**
 * observation：TickRenderEntityView 内部字段。
 */

  observation?: ObservationInsight | null;  
  /**
 * buffs：TickRenderEntityView 内部字段。
 */

  buffs?: VisibleBuffState[] | null;
}

/** 地面物品堆增量补丁。 */
export interface GroundItemPilePatchView {
/**
 * sourceId：GroundItemPilePatchView 内部字段。
 */

  sourceId: string;  
  /**
 * x：GroundItemPilePatchView 内部字段。
 */

  x: number;  
  /**
 * y：GroundItemPilePatchView 内部字段。
 */

  y: number;  
  /**
 * items：GroundItemPilePatchView 内部字段。
 */

  items?: GroundItemEntryView[] | null;
}

/** 视野内地块增量补丁。 */
export interface VisibleTilePatchView {
/**
 * x：VisibleTilePatchView 内部字段。
 */

  x: number;  
  /**
 * y：VisibleTilePatchView 内部字段。
 */

  y: number;  
  /**
 * tile：VisibleTilePatchView 内部字段。
 */

  tile: VisibleTile | null;
}

/** 世界增量中的玩家实体补丁。 */
export interface WorldPlayerPatchView {
/**
 * id：WorldPlayerPatchView 内部字段。
 */

  id: string;  
  /**
 * x：WorldPlayerPatchView 内部字段。
 */

  x?: number;  
  /**
 * y：WorldPlayerPatchView 内部字段。
 */

  y?: number;  
  /**
 * sc：WorldPlayerPatchView 内部字段。
 */

  sc?: number | null;  
  /**
 * rm：WorldPlayerPatchView 内部字段。
 */

  rm?: 1;
}

/** 世界增量中的怪物实体补丁。 */
export interface WorldMonsterPatchView {
/**
 * id：WorldMonsterPatchView 内部字段。
 */

  id: string;  
  /**
 * mid：WorldMonsterPatchView 内部字段。
 */

  mid?: string;  
  /**
 * x：WorldMonsterPatchView 内部字段。
 */

  x?: number;  
  /**
 * y：WorldMonsterPatchView 内部字段。
 */

  y?: number;  
  /**
 * hp：WorldMonsterPatchView 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：WorldMonsterPatchView 内部字段。
 */

  maxHp?: number;  
  /**
 * n：WorldMonsterPatchView 内部字段。
 */

  n?: string;  
  /**
 * c：WorldMonsterPatchView 内部字段。
 */

  c?: string;  
  /**
 * tr：WorldMonsterPatchView 内部字段。
 */

  tr?: MonsterTier;  
  /**
 * sc：WorldMonsterPatchView 内部字段。
 */

  sc?: number | null;  
  /**
 * rm：WorldMonsterPatchView 内部字段。
 */

  rm?: 1;
}

/** 世界增量中的 NPC 实体补丁。 */
export interface WorldNpcPatchView {
/**
 * id：WorldNpcPatchView 内部字段。
 */

  id: string;  
  /**
 * x：WorldNpcPatchView 内部字段。
 */

  x?: number;  
  /**
 * y：WorldNpcPatchView 内部字段。
 */

  y?: number;  
  /**
 * n：WorldNpcPatchView 内部字段。
 */

  n?: string;  
  /**
 * ch：WorldNpcPatchView 内部字段。
 */

  ch?: string;  
  /**
 * c：WorldNpcPatchView 内部字段。
 */

  c?: string;  
  /**
 * sh：WorldNpcPatchView 内部字段。
 */

  sh?: 1;  
  /**
 * qm：WorldNpcPatchView 内部字段。
 */

  qm?: NpcQuestMarker | null;  
  /**
 * rm：WorldNpcPatchView 内部字段。
 */

  rm?: 1;
}

/** 世界增量中的传送点补丁。 */
export interface WorldPortalPatchView {
/**
 * id：WorldPortalPatchView 内部字段。
 */

  id: string;  
  /**
 * x：WorldPortalPatchView 内部字段。
 */

  x?: number;  
  /**
 * y：WorldPortalPatchView 内部字段。
 */

  y?: number;  
  /**
 * tm：WorldPortalPatchView 内部字段。
 */

  tm?: string;  
  /**
 * tr：WorldPortalPatchView 内部字段。
 */

  tr?: 0 | 1;  
  /**
 * rm：WorldPortalPatchView 内部字段。
 */

  rm?: 1;
}

/** 世界增量中的地面掉落补丁。 */
export interface WorldGroundPatchView {
/**
 * sourceId：WorldGroundPatchView 内部字段。
 */

  sourceId: string;  
  /**
 * x：WorldGroundPatchView 内部字段。
 */

  x: number;  
  /**
 * y：WorldGroundPatchView 内部字段。
 */

  y: number;  
  /**
 * items：WorldGroundPatchView 内部字段。
 */

  items?: GroundItemEntryView[] | null;
}

/** 世界增量中的容器实体补丁。 */
export interface WorldContainerPatchView {
/**
 * id：WorldContainerPatchView 内部字段。
 */

  id: string;  
  /**
 * x：WorldContainerPatchView 内部字段。
 */

  x?: number;  
  /**
 * y：WorldContainerPatchView 内部字段。
 */

  y?: number;  
  /**
 * n：WorldContainerPatchView 内部字段。
 */

  n?: string;  
  /**
 * ch：WorldContainerPatchView 内部字段。
 */

  ch?: string;  
  /**
 * c：WorldContainerPatchView 内部字段。
 */

  c?: string;  
  /**
 * rm：WorldContainerPatchView 内部字段。
 */

  rm?: 1;
}

/** 世界增量主体视图。 */
export interface WorldDeltaView {
/**
 * t：WorldDeltaView 内部字段。
 */

  t: number;  
  /**
 * wr：WorldDeltaView 内部字段。
 */

  wr: number;  
  /**
 * sr：WorldDeltaView 内部字段。
 */

  sr: number;  
  /**
 * p：WorldDeltaView 内部字段。
 */

  p?: WorldPlayerPatchView[];  
  /**
 * m：WorldDeltaView 内部字段。
 */

  m?: WorldMonsterPatchView[];  
  /**
 * n：WorldDeltaView 内部字段。
 */

  n?: WorldNpcPatchView[];  
  /**
 * o：WorldDeltaView 内部字段。
 */

  o?: WorldPortalPatchView[];  
  /**
 * g：WorldDeltaView 内部字段。
 */

  g?: WorldGroundPatchView[];  
  /**
 * c：WorldDeltaView 内部字段。
 */

  c?: WorldContainerPatchView[];  
  /**
 * threatArrows：WorldDeltaView 内部字段。
 */

  threatArrows?: [string, string][];  
  /**
 * threatArrowAdds：WorldDeltaView 内部字段。
 */

  threatArrowAdds?: [string, string][];  
  /**
 * threatArrowRemoves：WorldDeltaView 内部字段。
 */

  threatArrowRemoves?: [string, string][];  
  /**
 * fx：WorldDeltaView 内部字段。
 */

  fx?: CombatEffect[];  
  /**
 * path：WorldDeltaView 内部字段。
 */

  path?: [number, number][];  
  /**
 * dt：WorldDeltaView 内部字段。
 */

  dt?: number;  
  /**
 * time：WorldDeltaView 内部字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：WorldDeltaView 内部字段。
 */

  auraLevelBaseValue?: number;  
  /**
 * v：WorldDeltaView 内部字段。
 */

  v?: VisibleTile[][];  
  /**
 * tp：WorldDeltaView 内部字段。
 */

  tp?: VisibleTilePatchView[];  
  /**
 * mid：WorldDeltaView 内部字段。
 */

  mid?: string;
}

/** 自身状态增量视图。 */
export interface SelfDeltaView {
/**
 * sr：SelfDeltaView 内部字段。
 */

  sr: number;  
  /**
 * iid：SelfDeltaView 内部字段。
 */

  iid?: string;  
  /**
 * mid：SelfDeltaView 内部字段。
 */

  mid?: string;  
  /**
 * x：SelfDeltaView 内部字段。
 */

  x?: number;  
  /**
 * y：SelfDeltaView 内部字段。
 */

  y?: number;  
  /**
 * f：SelfDeltaView 内部字段。
 */

  f?: Direction;  
  /**
 * hp：SelfDeltaView 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：SelfDeltaView 内部字段。
 */

  maxHp?: number;  
  /**
 * qi：SelfDeltaView 内部字段。
 */

  qi?: number;  
  /**
 * maxQi：SelfDeltaView 内部字段。
 */

  maxQi?: number;
}

/** 高频 tick 增量主体视图。 */
export interface TickView {
/**
 * p：TickView 内部字段。
 */

  p: TickRenderEntityView[];  
  /**
 * t：TickView 内部字段。
 */

  t?: VisibleTilePatchView[];  
  /**
 * e：TickView 内部字段。
 */

  e: TickRenderEntityView[];  
  /**
 * r：TickView 内部字段。
 */

  r?: string[];  
  /**
 * threatArrows：TickView 内部字段。
 */

  threatArrows?: [string, string][];  
  /**
 * threatArrowAdds：TickView 内部字段。
 */

  threatArrowAdds?: [string, string][];  
  /**
 * threatArrowRemoves：TickView 内部字段。
 */

  threatArrowRemoves?: [string, string][];  
  /**
 * g：TickView 内部字段。
 */

  g?: GroundItemPilePatchView[];  
  /**
 * fx：TickView 内部字段。
 */

  fx?: CombatEffect[];  
  /**
 * v：TickView 内部字段。
 */

  v?: VisibleTile[][];  
  /**
 * dt：TickView 内部字段。
 */

  dt?: number;  
  /**
 * m：TickView 内部字段。
 */

  m?: string;  
  /**
 * path：TickView 内部字段。
 */

  path?: [number, number][];  
  /**
 * hp：TickView 内部字段。
 */

  hp?: number;  
  /**
 * qi：TickView 内部字段。
 */

  qi?: number;  
  /**
 * f：TickView 内部字段。
 */

  f?: Direction;  
  /**
 * time：TickView 内部字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：TickView 内部字段。
 */

  auraLevelBaseValue?: number;
}
