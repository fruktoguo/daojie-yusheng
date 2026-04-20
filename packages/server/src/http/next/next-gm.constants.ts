export const NEXT_GM_BOT_ID_PREFIX = 'gm_bot_';

export function isNextGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NEXT_GM_BOT_ID_PREFIX);
}
