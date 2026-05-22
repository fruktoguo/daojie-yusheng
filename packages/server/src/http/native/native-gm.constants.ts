/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
export const NATIVE_GM_BOT_ID_PREFIX = 'gm_bot_';

/** 判断给定 playerId 是否属于 GM 机器人。 */
export function isNativeGmBotPlayerId(playerId: unknown): boolean {
  return typeof playerId === 'string' && playerId.startsWith(NATIVE_GM_BOT_ID_PREFIX);
}
