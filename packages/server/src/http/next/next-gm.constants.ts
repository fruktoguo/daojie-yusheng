export const NEXT_GM_BOT_ID_PREFIX = 'gm_bot_';
/**
 * isNextGmBotPlayerId：判断NextGMBot玩家ID是否满足条件。
 * @param playerId unknown 玩家 ID。
 * @returns 返回是否满足NextGMBot玩家ID条件。
 */


export function isNextGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NEXT_GM_BOT_ID_PREFIX);
}
