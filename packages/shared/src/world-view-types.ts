/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 世界视图共享类型：承接小地图、NPC 商店、建议系统等展示层结构。
 */
import type { MapMeta } from './world-core-types';
import type { ItemStack } from './item-runtime-types';
import type { QuestLine } from './quest-types';

/** 小地图标记类型 */
export type MapMinimapMarkerKind =
  | 'landmark'
  | 'container'
  | 'npc'
  | 'monster_spawn'
  | 'portal'
  | 'stairs';

/** 小地图标记 */
export interface MapMinimapMarker {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * kind：kind相关字段。
 */

  kind: MapMinimapMarkerKind;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * detail：详情状态或数据块。
 */

  detail?: string;
}

/** 小地图快照 */
export interface MapMinimapSnapshot {
/**
 * width：width相关字段。
 */

  width: number;  
  /**
 * height：height相关字段。
 */

  height: number;  
  /**
 * terrainRows：集合字段。
 */

  terrainRows: string[];  
  /**
 * markers：marker相关字段。
 */

  markers: MapMinimapMarker[];
}

/** minimapLibrary 版本协商：服务端告知的地图清单条目 */
export interface MinimapLibraryManifestEntry {
  /** 地图 ID */
  mapId: string;
  /** 服务端当前快照版本号（启动期计算的 hash） */
  version: number;
}

/** minimapLibrary 版本协商：客户端上报的本地缓存版本 */
export interface MinimapLibraryClientVersions {
  /** mapId → 本地缓存版本号，未缓存的不上报 */
  versions: Record<string, number>;
}

/** minimapLibrary 版本协商：服务端下发有变更的地图数据 */
export interface MinimapLibraryDelta {
  /** 有变更或客户端缺失的地图完整条目 */
  entries: MapMinimapArchiveEntry[];
}

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * version：快照版本号（服务端启动期计算的 hash）。
 */

  version?: number;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: MapMinimapSnapshot;
}

/** NPC 任务标记状态 */
export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

/** NPC 任务标记 */
export interface NpcQuestMarker {
/**
 * line：line相关字段。
 */

  line: QuestLine;  
  /**
 * state：状态状态或数据块。
 */

  state: NpcQuestMarkerState;
}

/** NPC 商店中的单件商品视图 */
export interface NpcShopItemView {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;  
  /**
 * remainingQuantity：remainingQuantity相关字段。
 */

  remainingQuantity?: number;  
  /**
 * stockLimit：stockLimit相关字段。
 */

  stockLimit?: number;  
  /**
 * refreshAt：refreshAt相关字段。
 */

  refreshAt?: number;
}

/** NPC 商店视图 */
export interface NpcShopView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * npcName：NPC名称名称或显示文本。
 */

  npcName: string;  
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;  
  /**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * items：集合字段。
 */

  items: NpcShopItemView[];
}
