/**
 * EphemeralActorIdentity：短期非持久化 actor 身份。
 *
 * 三种 ephemeral kind 共用同一身份模型，仅 playerId 前缀与 ownerPlayerId 不同：
 * - `bot`：远程 socket 驱动的压测/回归机器人，独立演化，无主玩家。
 * - `clone`：玩家分身，绑定主玩家身份；沿用主玩家某个时点的快照。
 * - `pet`：玩家宠物，绑定主玩家；战斗模板来自宠物配置而非玩家。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §5.2。
 *
 * 全链路检测原则：所有写持久化 / 写运营态（leaderboard、邮件、市场、outbox 等）的服务
 * 必须在写之前调用 `isEphemeralPlayerId(playerId)`（或 `getEphemeralKind`）做短路。
 */

/** Ephemeral actor 类型。 */
export type EphemeralActorKind = 'bot' | 'clone' | 'pet';

/** Bot ephemeral playerId 前缀。 */
export const EPHEMERAL_BOT_ID_PREFIX = 'bot_';

/** Clone（玩家分身）ephemeral playerId 前缀。 */
export const EPHEMERAL_CLONE_ID_PREFIX = 'clone_';

/** Pet（玩家宠物）ephemeral playerId 前缀。 */
export const EPHEMERAL_PET_ID_PREFIX = 'pet_';

/**
 * 全部 ephemeral 前缀的有序列表。
 * 注意：`gm_bot_` 是旧 GM bot 路径的兼容前缀，仍归入 `bot` 类别，
 * 第 2 批接入持久化拦截时由 isEphemeralPlayerId 统一识别。
 */
export const EPHEMERAL_ID_PREFIXES: readonly string[] = Object.freeze([
  EPHEMERAL_BOT_ID_PREFIX,
  EPHEMERAL_CLONE_ID_PREFIX,
  EPHEMERAL_PET_ID_PREFIX,
]);

/** 单个 ephemeral identity 的运行时记录。 */
export interface EphemeralActorIdentity {
  /** 全链路使用的 playerId（含前缀）。 */
  readonly playerId: string;
  /** 类型分类。 */
  readonly kind: EphemeralActorKind;
  /** 主玩家 ID；bot 为 null，clone/pet 必填。 */
  readonly ownerPlayerId: string | null;
  /** 关联的 ActorBlueprint ID；模板派生（如宠物配置）时可能为 null。 */
  readonly blueprintId: string | null;
  /** 签发时间（毫秒）。 */
  readonly issuedAtMs: number;
  /**
   * 失效时间（毫秒）。
   * - bot 推荐 2 小时
   * - clone / pet 玩法可能长期，由派发服务决定
   */
  readonly expiresAtMs: number;
  /**
   * 推荐 spawn 地图模板 ID；空字符串表示由 server 决定。
   */
  readonly preferredMapId: string;
  /** 推荐 spawn X 坐标。 */
  readonly preferredX: number;
  /** 推荐 spawn Y 坐标。 */
  readonly preferredY: number;
}

/** 通过 playerId 前缀快速判断是否为 ephemeral actor。 */
export function isEphemeralPlayerId(playerId: unknown): boolean {
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return false;
  }
  for (const prefix of EPHEMERAL_ID_PREFIXES) {
    if (playerId.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * 通过 playerId 前缀解析 ephemeral kind。
 * - 非 ephemeral playerId 返回 null
 */
export function getEphemeralKind(playerId: unknown): EphemeralActorKind | null {
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return null;
  }
  if (playerId.startsWith(EPHEMERAL_BOT_ID_PREFIX)) {
    return 'bot';
  }
  if (playerId.startsWith(EPHEMERAL_CLONE_ID_PREFIX)) {
    return 'clone';
  }
  if (playerId.startsWith(EPHEMERAL_PET_ID_PREFIX)) {
    return 'pet';
  }
  return null;
}
