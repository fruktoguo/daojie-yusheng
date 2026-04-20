export const NEXT_GM_BOT_ID_PREFIX = 'gm_bot_';
/**
 * isNextGmBotPlayerId：执行状态校验并返回判断结果。
 * @param playerId unknown 玩家 ID。
 * @returns boolean。
 */


export function isNextGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NEXT_GM_BOT_ID_PREFIX);
}
