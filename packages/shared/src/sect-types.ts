/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 宗门 ID。 */
export type SectId = string;

/** 宗门待审批申请默认分页大小。 */
export const SECT_APPLICATION_PAGE_DEFAULT_LIMIT = 20;

/** 宗门待审批申请单次请求上限。 */
export const SECT_APPLICATION_PAGE_MAX_LIMIT = 50;

/** 宗门待审批申请搜索词最大长度。 */
export const SECT_APPLICATION_SEARCH_MAX_LENGTH = 64;

/** 迁宗令道具 ID。 */
export const SECT_ENTRANCE_RELOCATION_ITEM_ID = 'sect_entrance_relocation_token';

/** 迁宗令消耗品使用行为。 */
export const SECT_ENTRANCE_RELOCATION_USE_BEHAVIOR = 'relocate_sect_entrance';

/** 宗门山门迁移冷却：绑定宗门，持续 3 天。 */
export const SECT_ENTRANCE_RELOCATION_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/** 宗门成员角色。 */
export type SectMemberRole = 'leader' | 'elder' | 'member';

/** 宗门状态。 */
export type SectStatus = 'active' | 'dissolved' | 'locked';

/** 宗门入口投影。 */
export interface SectEntranceView {
  id: string;
  kind: 'sect_entrance';
  sectId?: SectId;
  x: number;
  y: number;
  char: string;
  color: string;
  name: string;
}

/** 宗门印记，用一个可见字符作为地图和管理界面的短标识。 */
export type SectMark = string;

/** 宗门核心投影。 */
export interface SectCoreView {
  id: string;
  kind: 'sect_core';
  ownerSectId: SectId;
  x: number;
  y: number;
  char: string;
  color: string;
  name: string;
}

/** 宗门摘要。 */
export interface SectSummary {
  sectId: SectId;
  name: string;
  mark: SectMark;
  founderPlayerId: string;
  leaderPlayerId: string;
  status: SectStatus;
  entranceInstanceId: string;
  entranceX: number;
  entranceY: number;
  sectInstanceId: string;
  coreX: number;
  coreY: number;
  expansionRadius: number;
  mapMinX: number;
  mapMaxX: number;
  mapMinY: number;
  mapMaxY: number;
  createdAt: number;
  updatedAt: number;
}

/** 宗门成员摘要。 */
export interface SectMemberSummary {
  sectId: SectId;
  playerId: string;
  role: SectMemberRole;
  joinedAt: number;
  status: 'active' | 'left' | 'expelled';
}

/** 请求宗门待审批申请分页。宗门身份由当前登录玩家推导，不接受客户端指定。 */
export interface RequestSectApplicationPageView {
  /** 客户端请求 ID，用于拒绝迟到响应。 */
  requestId: string;
  /** 申请人姓名或玩家 ID 搜索词，服务端先搜索再分页。 */
  search?: string;
  /** 搜索结果偏移量。 */
  offset?: number;
  /** 本次请求数量。 */
  limit?: number;
}

/** 宗门待审批申请分页条目。 */
export interface SectApplicationPageItemView {
  playerId: string;
  name: string;
  appliedAt: number;
}

/** 宗门待审批申请分页响应。 */
export interface SectApplicationPageView {
  /** 客户端请求 ID 回显。 */
  requestId: string;
  /** 服务端按当前玩家身份解析出的宗门 ID。 */
  sectId: SectId;
  /** 服务端规范化后的搜索词。 */
  search: string;
  /** 搜索结果偏移量。 */
  offset: number;
  /** 本次请求数量上限。 */
  limit: number;
  /** 当前搜索条件下的待审批申请总数。 */
  total: number;
  /** 宗门权威版本，用于拒绝旧宗门状态生成的迟到响应。 */
  revision: number;
  /** 当前页待审批申请。 */
  items: SectApplicationPageItemView[];
}
