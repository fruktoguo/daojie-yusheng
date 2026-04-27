import type { Direction, EntityKind, GameTimeState, MonsterTier, VisibleBuffState, VisibleTile } from './world-core-types';
import type { CombatEffect } from './action-combat-types';
import type { FormationLifecycle, FormationRangeShape } from './formation-types';
import type { GroundItemEntryView } from './loot-view-types';
import type { ObservationInsight } from './observation-types';
import type { PlayerWalletState } from './player-runtime-types';
import type { MapMinimapMarker, NpcQuestMarker } from './world-view-types';

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
 * respawnRemainingTicks：回生/重生剩余 tick。
 */

  respawnRemainingTicks?: number | null;
  /**
 * respawnTotalTicks：回生/重生总 tick。
 */

  respawnTotalTicks?: number | null;
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
  /**
 * formationRadius：阵法影响半径。
 */

  formationRadius?: number | null;
  /**
 * formationRangeShape：阵法范围形状。
 */

  formationRangeShape?: FormationRangeShape | null;
  /**
 * formationRangeHighlightColor：感气范围高亮颜色。
 */

  formationRangeHighlightColor?: string | null;
  /**
 * formationBoundaryChar：阵法边界专用字符。
 */

  formationBoundaryChar?: string | null;
  /**
 * formationBoundaryColor：阵法边界专用颜色。
 */

  formationBoundaryColor?: string | null;
  /**
 * formationBoundaryRangeHighlightColor：阵法边界专用范围高亮色。
 */

  formationBoundaryRangeHighlightColor?: string | null;
  /**
 * formationEyeVisibleWithoutSenseQi：阵眼是否无需感气即可直接看见。
 */

  formationEyeVisibleWithoutSenseQi?: boolean | null;
  /**
 * formationRangeVisibleWithoutSenseQi：阵法范围是否无需感气即可直接看见。
 */

  formationRangeVisibleWithoutSenseQi?: boolean | null;
  /**
 * formationBoundaryVisibleWithoutSenseQi：阵法边界是否无需感气即可直接看见。
 */

  formationBoundaryVisibleWithoutSenseQi?: boolean | null;
  /**
 * formationShowText：阵法实体是否显示名称文本。
 */

  formationShowText?: boolean | null;
  /**
 * formationBlocksBoundary：阵法边界是否阻挡通行。
 */

  formationBlocksBoundary?: boolean | null;
  /** formationOwnerSectId：阵法所属宗门 ID。 */
  formationOwnerSectId?: string | null;
  /** formationOwnerPlayerId：阵法所属玩家 ID。 */
  formationOwnerPlayerId?: string | null;
  /**
 * formationActive：阵法是否开启。
 */

  formationActive?: boolean | null;
  /** formationLifecycle：阵法生命周期。 */
  formationLifecycle?: FormationLifecycle | null;
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
 * n：n相关字段。
 */

  n?: string;  
  /**
 * ch：ch相关字段。
 */

  ch?: string;  
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
 * n：n相关字段。
 */

  n?: string;  
  /**
 * ch：ch相关字段。
 */

  ch?: string;  
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
 * rr：容器回生剩余 tick。
 */

  rr?: number | null;
  /**
 * rm：rm相关字段。
 */

  rm?: 1;
}

/** 世界增量中的阵法实体补丁。 */
export interface WorldFormationPatchView {
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
 * ac：阵法是否开启。
 */

  ac?: 0 | 1;
  /**
 * rs：阵法影响半径。
 */

  rs?: number;
  /**
 * sh：阵法范围形状。
 */

  sh?: FormationRangeShape;
  /**
 * hl：感气范围高亮颜色。
 */

  hl?: string;
  /**
 * bch：边界字符。
 */

  bch?: string;
  /**
 * bc：边界颜色。
 */

  bc?: string;
  /**
 * bhl：边界范围高亮色。
 */

  bhl?: string;
  /**
 * ev：阵眼无需感气可见。
 */

  ev?: 0 | 1;
  /**
 * rv：阵法范围无需感气可见。
 */

  rv?: 0 | 1;
  /**
 * bv：阵法边界无需感气可见。
 */

  bv?: 0 | 1;
  /**
 * tx：是否显示阵法名称文本。
 */

  tx?: 0 | 1;
  /**
 * bd：边界是否阻挡通行。
 */

  bd?: 0 | 1;
  /** os：阵法所属宗门 ID。 */
  os?: string | null;
  /** op：阵法所属玩家 ID。 */
  op?: string | null;
  /** lt：阵法生命周期，1 表示持续性阵法。 */
  lt?: 0 | 1;
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
 * fmn：阵法实体补丁。
 */

  fmn?: WorldFormationPatchView[];
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
 * vma：可见MinimapMarkerAdd相关字段。
 */

  vma?: MapMinimapMarker[];
  /**
 * vmr：可见MinimapMarkerRemove相关字段。
 */

  vmr?: string[];
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
  /**
 * wallet：钱包相关字段。
 */

  wallet?: PlayerWalletState | null;
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
