/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 宗门 ID。 */
export type SectId = string;

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
