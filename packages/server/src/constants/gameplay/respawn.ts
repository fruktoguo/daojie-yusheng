import { DEFAULT_PLAYER_MAP_ID } from '@mud/shared';

export const PLAYER_RESPAWN_MAP_IDS = [
  DEFAULT_PLAYER_MAP_ID,
  'qizhen_crossing',
] as const;

/** PlayerRespawnMapId：定义该类型的结构与数据语义。 */
export type PlayerRespawnMapId = typeof PLAYER_RESPAWN_MAP_IDS[number];

/** isPlayerRespawnMapId：执行对应的业务逻辑。 */
export function isPlayerRespawnMapId(value: unknown): value is PlayerRespawnMapId {
  return typeof value === 'string' && PLAYER_RESPAWN_MAP_IDS.includes(value as PlayerRespawnMapId);
}

