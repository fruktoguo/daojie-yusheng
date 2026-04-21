import { DEFAULT_PLAYER_MAP_ID } from '@mud/shared';

/** PLAYER_RESPAWN_MAP_IDS：定义该变量以承载业务值。 */
export const PLAYER_RESPAWN_MAP_IDS = [
  DEFAULT_PLAYER_MAP_ID,
  'qizhen_crossing',
  'prison',
] as const;

/** PlayerRespawnMapId：定义该类型的结构与数据语义。 */
export type PlayerRespawnMapId = typeof PLAYER_RESPAWN_MAP_IDS[number];

/** isPlayerRespawnMapId：执行对应的业务逻辑。 */
export function isPlayerRespawnMapId(value: unknown): value is PlayerRespawnMapId {
  return typeof value === 'string' && PLAYER_RESPAWN_MAP_IDS.includes(value as PlayerRespawnMapId);
}

/** resolveRuntimeRespawnMapId：按当前位置解析运行时实际复活/遁返落点。 */
export function resolveRuntimeRespawnMapId(
  currentMapId?: string | null,
  preferredMapId?: string | null,
): string | null | undefined {
  if (currentMapId === 'prison') {
    return 'prison';
  }
  return preferredMapId;
}
