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
 * id：ID标识。
 */

  id: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * char：char相关字段。
 */

  char?: string;  
  /**
 * color：color相关字段。
 */

  color?: string;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string | null;  
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

  hp?: number | null;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number | null;  
  /**
 * qi：qi相关字段。
 */

  qi?: number | null;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi?: number | null;  
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: NpcQuestMarker | null;  
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight | null;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[] | null;
}

/** 地面物品堆增量补丁。 */
export interface GroundItemPilePatchView {
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

  items?: GroundItemEntryView[] | null;
}

/** 视野内地块增量补丁。 */
export interface VisibleTilePatchView {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * tile：tile相关字段。
 */

  tile: VisibleTile | null;
}

/** 世界增量中的玩家实体补丁。 */
export interface WorldPlayerPatchView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * sc：sc相关字段。
 */

  sc?: number | null;  
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量中的怪物实体补丁。 */
export interface WorldMonsterPatchView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * mid：mid标识。
 */

  mid?: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * n：n相关字段。
 */

  n?: string;  
  /**
 * c：c相关字段。
 */

  c?: string;  
  /**
 * tr：tr相关字段。
 */

  tr?: MonsterTier;  
  /**
 * sc：sc相关字段。
 */

  sc?: number | null;  
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量中的 NPC 实体补丁。 */
export interface WorldNpcPatchView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * n：n相关字段。
 */

  n?: string;  
  /**
 * ch：ch相关字段。
 */

  ch?: string;  
  /**
 * c：c相关字段。
 */

  c?: string;  
  /**
 * sh：sh相关字段。
 */

  sh?: 1;  
  /**
 * qm：qm相关字段。
 */

  qm?: NpcQuestMarker | null;  
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量中的传送点补丁。 */
export interface WorldPortalPatchView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * tm：tm相关字段。
 */

  tm?: string;  
  /**
 * tr：tr相关字段。
 */

  tr?: 0 | 1;  
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量中的地面掉落补丁。 */
export interface WorldGroundPatchView {
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

  items?: GroundItemEntryView[] | null;
}

/** 世界增量中的容器实体补丁。 */
export interface WorldContainerPatchView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * n：n相关字段。
 */

  n?: string;  
  /**
 * ch：ch相关字段。
 */

  ch?: string;  
  /**
 * c：c相关字段。
 */

  c?: string;  
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量主体视图。 */
export interface WorldDeltaView {
/**
 * t：t相关字段。
 */

  t: number;  
  /**
 * wr：wr相关字段。
 */

  wr: number;  
  /**
 * sr：sr相关字段。
 */

  sr: number;  
  /**
 * p：p相关字段。
 */

  p?: WorldPlayerPatchView[];  
  /**
 * m：m相关字段。
 */

  m?: WorldMonsterPatchView[];  
  /**
 * n：n相关字段。
 */

  n?: WorldNpcPatchView[];  
  /**
 * o：o相关字段。
 */

  o?: WorldPortalPatchView[];  
  /**
 * g：g相关字段。
 */

  g?: WorldGroundPatchView[];  
  /**
 * c：c相关字段。
 */

  c?: WorldContainerPatchView[];  
  /**
 * threatArrows：集合字段。
 */

  threatArrows?: [string, string][];  
  /**
 * threatArrowAdds：threatArrowAdd相关字段。
 */

  threatArrowAdds?: [string, string][];  
  /**
 * threatArrowRemoves：threatArrowRemove相关字段。
 */

  threatArrowRemoves?: [string, string][];  
  /**
 * fx：fx相关字段。
 */

  fx?: CombatEffect[];  
  /**
 * path：路径相关字段。
 */

  path?: [number, number][];  
  /**
 * dt：dt相关字段。
 */

  dt?: number;  
  /**
 * time：时间相关字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：aura等级Base值数值。
 */

  auraLevelBaseValue?: number;  
  /**
 * v：v相关字段。
 */

  v?: VisibleTile[][];  
  /**
 * tp：tp相关字段。
 */

  tp?: VisibleTilePatchView[];  
  /**
 * mid：mid标识。
 */

  mid?: string;
}

/** 自身状态增量视图。 */
export interface SelfDeltaView {
/**
 * sr：sr相关字段。
 */

  sr: number;  
  /**
 * iid：iid标识。
 */

  iid?: string;  
  /**
 * mid：mid标识。
 */

  mid?: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * f：f相关字段。
 */

  f?: Direction;  
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
}

/** 高频 tick 增量主体视图。 */
export interface TickView {
/**
 * p：p相关字段。
 */

  p: TickRenderEntityView[];  
  /**
 * t：t相关字段。
 */

  t?: VisibleTilePatchView[];  
  /**
 * e：e相关字段。
 */

  e: TickRenderEntityView[];  
  /**
 * r：r相关字段。
 */

  r?: string[];  
  /**
 * threatArrows：集合字段。
 */

  threatArrows?: [string, string][];  
  /**
 * threatArrowAdds：threatArrowAdd相关字段。
 */

  threatArrowAdds?: [string, string][];  
  /**
 * threatArrowRemoves：threatArrowRemove相关字段。
 */

  threatArrowRemoves?: [string, string][];  
  /**
 * g：g相关字段。
 */

  g?: GroundItemPilePatchView[];  
  /**
 * fx：fx相关字段。
 */

  fx?: CombatEffect[];  
  /**
 * v：v相关字段。
 */

  v?: VisibleTile[][];  
  /**
 * dt：dt相关字段。
 */

  dt?: number;  
  /**
 * m：m相关字段。
 */

  m?: string;  
  /**
 * path：路径相关字段。
 */

  path?: [number, number][];  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * f：f相关字段。
 */

  f?: Direction;  
  /**
 * time：时间相关字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：aura等级Base值数值。
 */

  auraLevelBaseValue?: number;
}
