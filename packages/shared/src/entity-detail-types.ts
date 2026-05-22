/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import type { MonsterTier, VisibleBuffState } from './world-core-types';
import type { ItemStack } from './item-runtime-types';
import type { ObservedTileEntityDetail } from './detail-view-types';
import type { ObservationInsight } from './observation-types';
import type { TileRuntimeResourceView } from './service-sync-types';
import type { NpcQuestMarker } from './world-view-types';
import type { InteractableKind, StructureType, SurfaceType, TerrainType } from './map-layer-types';
import type { TileType } from './world-core-types';

/**
 * 低频实体/地块详情投影视图，供协议层和客户端详情面板共用。
 */

export interface PortalDetailView {
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
 * kind：kind相关字段。
 */

  kind?: string;  
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId: string;  
  /**
 * targetMapName：目标地图名称名称或显示文本。
 */

  targetMapName?: string;  
  /**
 * targetX：目标X相关字段。
 */

  targetX?: number;  
  /**
 * targetY：目标Y相关字段。
 */

  targetY?: number;  
  /**
 * trigger：trigger相关字段。
 */

  trigger?: 'manual' | 'auto';
  /**
 * direction：传送方向。
 */

  direction?: 'two_way' | 'one_way';
}
/**
 * GroundDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface GroundDetailView {
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

  items: ItemStack[];
}
/**
 * ContainerDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface ContainerDetailView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * grade：grade相关字段。
 */

  grade: number;  
  /**
 * desc：desc相关字段。
 */

  desc?: string;
}
/**
 * NpcDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface NpcDetailView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;  
  /**
 * role：role相关字段。
 */

  role?: string;  
  /**
 * hasShop：启用开关或状态标识。
 */

  hasShop?: 1;  
  /**
 * questCount：数量或计量字段。
 */

  questCount?: number;  
  /**
 * questMarker：任务Marker相关字段。
 */

  questMarker?: NpcQuestMarker | null;  
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight;
}
/**
 * MonsterDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface MonsterDetailView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * mid：mid标识。
 */

  mid: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;  
  /**
   * qi：qi相关字段。
   */

  qi: number;
  /**
   * maxQi：maxQi相关字段。
   */

  maxQi: number;
  /**
   * level：等级数值。
   */

  level: number;  
  /**
 * tier：tier相关字段。
 */

  tier: MonsterTier;  
  /**
 * alive：alive相关字段。
 */

  alive: boolean;  
  /**
 * respawnTicks：重生tick相关字段。
 */

  respawnTicks?: number;  
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
}
/**
 * PlayerDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface PlayerDetailView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：玩家角色名称。
 */

  name: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;  
  /**
 * qi：qi相关字段。
 */

  qi: number;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi: number;  
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
}
/**
 * TileDetailView：定义接口结构约束，明确可交付字段含义。
 */


export interface TileDetailView {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * type：服务端权威的当前生效地块类型。
 */

  type?: TileType;  
  /**
 * walkable：服务端权威通行结果。
 */

  walkable?: boolean;  
  /**
 * blocksSight：服务端权威视线遮挡结果。
 */

  blocksSight?: boolean;  
  /**
 * movementCost：服务端权威实际移动消耗。
 */

  movementCost?: number;  
  /**
 * qiDrainPerTick：当前地块每息灵力消耗。
 */

  qiDrainPerTick?: number;  
  /**
 * terrainType：服务端权威底层地形。
 */

  terrainType?: TerrainType;  
  /**
 * surfaceType：服务端权威地表铺装。
 */

  surfaceType?: SurfaceType | null;  
  /**
 * structureType：服务端权威地上结构。
 */

  structureType?: StructureType | null;  
  /**
 * interactableKinds：服务端权威交互对象种类。
 */

  interactableKinds?: InteractableKind[];  
  /**
 * aura：aura相关字段。
 */

  aura?: number;  
  /**
 * hp：地块剩余生命值。
 */

  hp?: number;  
  /**
 * maxHp：地块最大生命值。
 */

  maxHp?: number;  
  /**
 * resources：resource相关字段。
 */

  resources?: TileRuntimeResourceView[];  
  /**
 * safeZone：safeZone相关字段。
 */

  safeZone?: {  
  /**
 * x：x相关字段。
 */

    x: number;    
    /**
 * y：y相关字段。
 */

    y: number;    
    /**
 * radius：radiu相关字段。
 */

    radius: number;
  };  
  /**
 * portal：portal相关字段。
 */

  portal?: PortalDetailView;  
  /**
 * ground：ground相关字段。
 */

  ground?: GroundDetailView;  
  /**
 * entities：entity相关字段。
 */

  entities?: ObservedTileEntityDetail[];  
  /**
 * error：error相关字段。
 */

  error?: string;
}
