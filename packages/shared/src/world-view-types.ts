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

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
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

/** 意见状态 */
export type SuggestionStatus = 'pending' | 'completed';

/** 意见回复作者类型 */
export type SuggestionReplyAuthorType = 'author' | 'gm';

/** 意见回复数据结构 */
export interface SuggestionReply {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * authorType：authorType相关字段。
 */

  authorType: SuggestionReplyAuthorType;  
  /**
 * authorId：authorID标识。
 */

  authorId: string;  
  /**
 * authorName：author名称名称或显示文本。
 */

  authorName: string;  
  /**
 * content：内容相关字段。
 */

  content: string;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;
}

/** 意见数据结构 */
export interface Suggestion {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * authorId：authorID标识。
 */

  authorId: string;  
  /**
 * authorName：author名称名称或显示文本。
 */

  authorName: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * description：description相关字段。
 */

  description: string;  
  /**
 * status：statu状态或数据块。
 */

  status: SuggestionStatus;  
  /**
 * upvotes：upvote相关字段。
 */

  upvotes: string[];  
  /**
 * downvotes：downvote相关字段。
 */

  downvotes: string[];  
  /**
 * replies：reply相关字段。
 */

  replies: SuggestionReply[];  
  /**
 * authorLastReadGmReplyAt：authorLastReadGMReplyAt相关字段。
 */

  authorLastReadGmReplyAt: number;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;
}

/** 意见分页结果 */
export interface SuggestionPage {
/**
 * items：集合字段。
 */

  items: Suggestion[];  
  /**
 * total：数量或计量字段。
 */

  total: number;  
  /**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize: number;  
  /**
 * totalPages：totalPage相关字段。
 */

  totalPages: number;  
  /**
 * keyword：keyword相关字段。
 */

  keyword: string;
}
