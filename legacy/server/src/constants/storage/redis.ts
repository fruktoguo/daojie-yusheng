/**
 * Redis 键名模板，便于统一管理缓存结构。
 */
/** 生成玩家 Redis 缓存的键名 */
export const PLAYER_KEY = (id: string) => `player:${id}`;
