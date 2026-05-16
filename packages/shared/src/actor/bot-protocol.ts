/**
 * Bot HTTP 协议契约。
 *
 * 提供给 bot-runner（独立进程）以及 GM 控制台调用的 HTTP DTO。
 * 配合 `/api/gm/bot/*` 路由使用，所有路由受 NativeGmAuthGuard 保护。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §6。
 */

import type { EphemeralActorKind } from './ephemeral-actor-identity';

/** Bot 蓝图签发请求体。 */
export interface GmBotIssueBlueprintReq {
  /** 模板玩家 ID（必填，来源玩家）。 */
  sourcePlayerId: string;
  /** 一次性签发的 bot 数量。 */
  count: number;
  /** 推荐 spawn 地图；省略时使用源玩家所在地图。 */
  spawnMapId?: string;
  /** 推荐 spawn 坐标。 */
  spawnAnchor?: { x: number; y: number };
  /** 行为脚本预设名（仅记录在 bot-runner 侧使用，不影响 server）。 */
  behaviorProfile?: string;
  /** Token TTL（分钟），默认由 server 决定。 */
  ttlMinutes?: number;
  /** 生命值/灵力初始化策略，默认 full。 */
  vitalsPolicy?: 'full_hp_qi' | 'inherit';
}

/** 单个 bot 的签发结果。 */
export interface GmBotIssuedToken {
  /** Bot playerId（前缀 `bot_`）。 */
  playerId: string;
  /** Ephemeral kind，固定 `bot`。 */
  kind: EphemeralActorKind;
  /** 一次性登录 token，bot 客户端在 socket 鉴权时使用。 */
  loginToken: string;
  /** Token 失效时间（毫秒）。 */
  expiresAtMs: number;
  /** 推荐 spawn 地图。 */
  spawnMapId: string;
  /** 推荐 spawn X 坐标。 */
  x: number;
  /** 推荐 spawn Y 坐标。 */
  y: number;
}

/** Bot 蓝图签发响应体。 */
export interface GmBotIssueBlueprintRes {
  /** 是否成功（接口语义化字段，便于前端 UI 短路）。 */
  ok: boolean;
  /**
   * 蓝图唯一 ID。
   * - 第 1 批阶段：未实现 fromPlayer 真实克隆，返回 null。
   * - 第 2 批落地后改为非空字符串，bot 客户端登录时会基于此 ID 应用蓝图。
   */
  blueprintId: string | null;
  /** 蓝图源玩家 ID。 */
  sourcePlayerId: string;
  /** 签发的 bot token 列表。 */
  issuedTokens: GmBotIssuedToken[];
}

/** Bot 释放请求体。 */
export interface GmBotReleaseReq {
  /** 待释放的 bot playerId 列表。 */
  playerIds?: string[];
  /** 是否释放当前进程内全部 bot；与 playerIds 二选一。 */
  all?: boolean;
}

/** Bot 释放响应体。 */
export interface GmBotReleaseRes {
  /** 是否成功。 */
  ok: boolean;
  /** 实际被释放的 bot playerId 列表。 */
  releasedPlayerIds: string[];
  /** 跳过的 playerId 列表（不存在或类型不匹配）。 */
  skippedPlayerIds: string[];
}
