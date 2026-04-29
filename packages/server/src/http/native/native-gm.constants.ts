export const NATIVE_GM_BOT_ID_PREFIX = 'gm_bot_';
/**
 * isNativeGmBotPlayerId：判断NativeGMBot玩家ID是否满足条件。
 * @param playerId unknown 玩家 ID。
 * @returns 返回是否满足NativeGMBot玩家ID条件。
 */


export function isNativeGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NATIVE_GM_BOT_ID_PREFIX);
}
