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
  id: string;
  kind: MapMinimapMarkerKind;
  x: number;
  y: number;
  label: string;
  detail?: string;
}

/** 小地图快照 */
export interface MapMinimapSnapshot {
  width: number;
  height: number;
  terrainRows: string[];
  markers: MapMinimapMarker[];
}

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
  mapId: string;
  mapMeta: MapMeta;
  snapshot: MapMinimapSnapshot;
}

/** NPC 任务标记状态 */
export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

/** NPC 任务标记 */
export interface NpcQuestMarker {
  line: QuestLine;
  state: NpcQuestMarkerState;
}

/** NPC 商店中的单件商品视图 */
export interface NpcShopItemView {
  itemId: string;
  item: ItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NPC 商店视图 */
export interface NpcShopView {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: NpcShopItemView[];
}

/** 意见状态 */
export type SuggestionStatus = 'pending' | 'completed';

/** 意见回复作者类型 */
export type SuggestionReplyAuthorType = 'author' | 'gm';

/** 意见回复数据结构 */
export interface SuggestionReply {
  id: string;
  authorType: SuggestionReplyAuthorType;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
}

/** 意见数据结构 */
export interface Suggestion {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: string[];
  downvotes: string[];
  replies: SuggestionReply[];
  authorLastReadGmReplyAt: number;
  createdAt: number;
}

/** 意见分页结果 */
export interface SuggestionPage {
  items: Suggestion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  keyword: string;
}
