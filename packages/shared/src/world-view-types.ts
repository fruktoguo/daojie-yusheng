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
 * id：MapMinimapMarker 内部字段。
 */

  id: string;  
  /**
 * kind：MapMinimapMarker 内部字段。
 */

  kind: MapMinimapMarkerKind;  
  /**
 * x：MapMinimapMarker 内部字段。
 */

  x: number;  
  /**
 * y：MapMinimapMarker 内部字段。
 */

  y: number;  
  /**
 * label：MapMinimapMarker 内部字段。
 */

  label: string;  
  /**
 * detail：MapMinimapMarker 内部字段。
 */

  detail?: string;
}

/** 小地图快照 */
export interface MapMinimapSnapshot {
/**
 * width：MapMinimapSnapshot 内部字段。
 */

  width: number;  
  /**
 * height：MapMinimapSnapshot 内部字段。
 */

  height: number;  
  /**
 * terrainRows：MapMinimapSnapshot 内部字段。
 */

  terrainRows: string[];  
  /**
 * markers：MapMinimapSnapshot 内部字段。
 */

  markers: MapMinimapMarker[];
}

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
/**
 * mapId：MapMinimapArchiveEntry 内部字段。
 */

  mapId: string;  
  /**
 * mapMeta：MapMinimapArchiveEntry 内部字段。
 */

  mapMeta: MapMeta;  
  /**
 * snapshot：MapMinimapArchiveEntry 内部字段。
 */

  snapshot: MapMinimapSnapshot;
}

/** NPC 任务标记状态 */
export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

/** NPC 任务标记 */
export interface NpcQuestMarker {
/**
 * line：NpcQuestMarker 内部字段。
 */

  line: QuestLine;  
  /**
 * state：NpcQuestMarker 内部字段。
 */

  state: NpcQuestMarkerState;
}

/** NPC 商店中的单件商品视图 */
export interface NpcShopItemView {
/**
 * itemId：NpcShopItemView 内部字段。
 */

  itemId: string;  
  /**
 * item：NpcShopItemView 内部字段。
 */

  item: ItemStack;  
  /**
 * unitPrice：NpcShopItemView 内部字段。
 */

  unitPrice: number;  
  /**
 * remainingQuantity：NpcShopItemView 内部字段。
 */

  remainingQuantity?: number;  
  /**
 * stockLimit：NpcShopItemView 内部字段。
 */

  stockLimit?: number;  
  /**
 * refreshAt：NpcShopItemView 内部字段。
 */

  refreshAt?: number;
}

/** NPC 商店视图 */
export interface NpcShopView {
/**
 * npcId：NpcShopView 内部字段。
 */

  npcId: string;  
  /**
 * npcName：NpcShopView 内部字段。
 */

  npcName: string;  
  /**
 * dialogue：NpcShopView 内部字段。
 */

  dialogue: string;  
  /**
 * currencyItemId：NpcShopView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：NpcShopView 内部字段。
 */

  currencyItemName: string;  
  /**
 * items：NpcShopView 内部字段。
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
 * id：SuggestionReply 内部字段。
 */

  id: string;  
  /**
 * authorType：SuggestionReply 内部字段。
 */

  authorType: SuggestionReplyAuthorType;  
  /**
 * authorId：SuggestionReply 内部字段。
 */

  authorId: string;  
  /**
 * authorName：SuggestionReply 内部字段。
 */

  authorName: string;  
  /**
 * content：SuggestionReply 内部字段。
 */

  content: string;  
  /**
 * createdAt：SuggestionReply 内部字段。
 */

  createdAt: number;
}

/** 意见数据结构 */
export interface Suggestion {
/**
 * id：Suggestion 内部字段。
 */

  id: string;  
  /**
 * authorId：Suggestion 内部字段。
 */

  authorId: string;  
  /**
 * authorName：Suggestion 内部字段。
 */

  authorName: string;  
  /**
 * title：Suggestion 内部字段。
 */

  title: string;  
  /**
 * description：Suggestion 内部字段。
 */

  description: string;  
  /**
 * status：Suggestion 内部字段。
 */

  status: SuggestionStatus;  
  /**
 * upvotes：Suggestion 内部字段。
 */

  upvotes: string[];  
  /**
 * downvotes：Suggestion 内部字段。
 */

  downvotes: string[];  
  /**
 * replies：Suggestion 内部字段。
 */

  replies: SuggestionReply[];  
  /**
 * authorLastReadGmReplyAt：Suggestion 内部字段。
 */

  authorLastReadGmReplyAt: number;  
  /**
 * createdAt：Suggestion 内部字段。
 */

  createdAt: number;
}

/** 意见分页结果 */
export interface SuggestionPage {
/**
 * items：SuggestionPage 内部字段。
 */

  items: Suggestion[];  
  /**
 * total：SuggestionPage 内部字段。
 */

  total: number;  
  /**
 * page：SuggestionPage 内部字段。
 */

  page: number;  
  /**
 * pageSize：SuggestionPage 内部字段。
 */

  pageSize: number;  
  /**
 * totalPages：SuggestionPage 内部字段。
 */

  totalPages: number;  
  /**
 * keyword：SuggestionPage 内部字段。
 */

  keyword: string;
}
