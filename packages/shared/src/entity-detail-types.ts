import type { MonsterTier, VisibleBuffState } from './world-core-types';
import type { ItemStack } from './item-runtime-types';
import type { ObservedTileEntityDetail } from './detail-view-types';
import type { ObservationInsight } from './observation-types';
import type { NpcQuestMarker } from './world-view-types';

/**
 * 低频实体/地块详情投影视图，供协议层和客户端详情面板共用。
 */

export interface PortalDetailView {
/**
 * id：PortalDetailView 内部字段。
 */

  id: string;  
  /**
 * x：PortalDetailView 内部字段。
 */

  x: number;  
  /**
 * y：PortalDetailView 内部字段。
 */

  y: number;  
  /**
 * kind：PortalDetailView 内部字段。
 */

  kind?: string;  
  /**
 * targetMapId：PortalDetailView 内部字段。
 */

  targetMapId: string;  
  /**
 * targetMapName：PortalDetailView 内部字段。
 */

  targetMapName?: string;  
  /**
 * targetX：PortalDetailView 内部字段。
 */

  targetX?: number;  
  /**
 * targetY：PortalDetailView 内部字段。
 */

  targetY?: number;  
  /**
 * trigger：PortalDetailView 内部字段。
 */

  trigger?: 'manual' | 'auto';
}
/**
 * GroundDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface GroundDetailView {
/**
 * sourceId：GroundDetailView 内部字段。
 */

  sourceId: string;  
  /**
 * x：GroundDetailView 内部字段。
 */

  x: number;  
  /**
 * y：GroundDetailView 内部字段。
 */

  y: number;  
  /**
 * items：GroundDetailView 内部字段。
 */

  items: ItemStack[];
}
/**
 * ContainerDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface ContainerDetailView {
/**
 * id：ContainerDetailView 内部字段。
 */

  id: string;  
  /**
 * name：ContainerDetailView 内部字段。
 */

  name: string;  
  /**
 * x：ContainerDetailView 内部字段。
 */

  x: number;  
  /**
 * y：ContainerDetailView 内部字段。
 */

  y: number;  
  /**
 * grade：ContainerDetailView 内部字段。
 */

  grade: number;  
  /**
 * desc：ContainerDetailView 内部字段。
 */

  desc?: string;
}
/**
 * NpcDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface NpcDetailView {
/**
 * id：NpcDetailView 内部字段。
 */

  id: string;  
  /**
 * name：NpcDetailView 内部字段。
 */

  name: string;  
  /**
 * char：NpcDetailView 内部字段。
 */

  char: string;  
  /**
 * color：NpcDetailView 内部字段。
 */

  color: string;  
  /**
 * x：NpcDetailView 内部字段。
 */

  x: number;  
  /**
 * y：NpcDetailView 内部字段。
 */

  y: number;  
  /**
 * dialogue：NpcDetailView 内部字段。
 */

  dialogue: string;  
  /**
 * role：NpcDetailView 内部字段。
 */

  role?: string;  
  /**
 * hasShop：NpcDetailView 内部字段。
 */

  hasShop?: 1;  
  /**
 * questCount：NpcDetailView 内部字段。
 */

  questCount?: number;  
  /**
 * questMarker：NpcDetailView 内部字段。
 */

  questMarker?: NpcQuestMarker | null;  
  /**
 * observation：NpcDetailView 内部字段。
 */

  observation?: ObservationInsight;
}
/**
 * MonsterDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface MonsterDetailView {
/**
 * id：MonsterDetailView 内部字段。
 */

  id: string;  
  /**
 * mid：MonsterDetailView 内部字段。
 */

  mid: string;  
  /**
 * name：MonsterDetailView 内部字段。
 */

  name: string;  
  /**
 * char：MonsterDetailView 内部字段。
 */

  char: string;  
  /**
 * color：MonsterDetailView 内部字段。
 */

  color: string;  
  /**
 * x：MonsterDetailView 内部字段。
 */

  x: number;  
  /**
 * y：MonsterDetailView 内部字段。
 */

  y: number;  
  /**
 * hp：MonsterDetailView 内部字段。
 */

  hp: number;  
  /**
 * maxHp：MonsterDetailView 内部字段。
 */

  maxHp: number;  
  /**
 * level：MonsterDetailView 内部字段。
 */

  level: number;  
  /**
 * tier：MonsterDetailView 内部字段。
 */

  tier: MonsterTier;  
  /**
 * alive：MonsterDetailView 内部字段。
 */

  alive: boolean;  
  /**
 * respawnTicks：MonsterDetailView 内部字段。
 */

  respawnTicks?: number;  
  /**
 * observation：MonsterDetailView 内部字段。
 */

  observation?: ObservationInsight;  
  /**
 * buffs：MonsterDetailView 内部字段。
 */

  buffs?: VisibleBuffState[];
}
/**
 * PlayerDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface PlayerDetailView {
/**
 * id：PlayerDetailView 内部字段。
 */

  id: string;  
  /**
 * x：PlayerDetailView 内部字段。
 */

  x: number;  
  /**
 * y：PlayerDetailView 内部字段。
 */

  y: number;  
  /**
 * hp：PlayerDetailView 内部字段。
 */

  hp: number;  
  /**
 * maxHp：PlayerDetailView 内部字段。
 */

  maxHp: number;  
  /**
 * qi：PlayerDetailView 内部字段。
 */

  qi: number;  
  /**
 * maxQi：PlayerDetailView 内部字段。
 */

  maxQi: number;  
  /**
 * observation：PlayerDetailView 内部字段。
 */

  observation?: ObservationInsight;  
  /**
 * buffs：PlayerDetailView 内部字段。
 */

  buffs?: VisibleBuffState[];
}
/**
 * TileDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface TileDetailView {
/**
 * x：TileDetailView 内部字段。
 */

  x: number;  
  /**
 * y：TileDetailView 内部字段。
 */

  y: number;  
  /**
 * aura：TileDetailView 内部字段。
 */

  aura?: number;  
  /**
 * safeZone：TileDetailView 内部字段。
 */

  safeZone?: {  
  /**
 * x：TileDetailView 内部字段。
 */

    x: number;    
    /**
 * y：TileDetailView 内部字段。
 */

    y: number;    
    /**
 * radius：TileDetailView 内部字段。
 */

    radius: number;
  };  
  /**
 * portal：TileDetailView 内部字段。
 */

  portal?: PortalDetailView;  
  /**
 * ground：TileDetailView 内部字段。
 */

  ground?: GroundDetailView;  
  /**
 * entities：TileDetailView 内部字段。
 */

  entities?: ObservedTileEntityDetail[];  
  /**
 * error：TileDetailView 内部字段。
 */

  error?: string;
}
