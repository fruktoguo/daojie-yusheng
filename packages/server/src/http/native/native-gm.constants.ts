/**
 * GM 机器人玩家标识常量与判定工具。
 * 用于区分 GM 测试机器人与真实玩家，避免机器人参与风控、邮件广播等逻辑。
 */

/** GM 机器人玩家 ID 统一前缀。 */
export const NATIVE_GM_BOT_ID_PREFIX = 'gm_bot_';

/** 判断给定 playerId 是否属于 GM 机器人。 */
export function isNativeGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NATIVE_GM_BOT_ID_PREFIX);
}
