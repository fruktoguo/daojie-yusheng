import type { PlayerState } from '@mud/shared';

/** 构造与地图实例绑定的聊天持久化作用域，避免同模板实例之间串读本地消息。 */
export function buildChatPersistenceScope(
  player: Pick<PlayerState, 'id' | 'mapId' | 'instanceId'>,
  fallback?: { mapId?: string; instanceId?: string },
): string {
  const playerId = String(player.id || 'anonymous').trim() || 'anonymous';
  const mapId = String(player.mapId || fallback?.mapId || 'unknown-map').trim() || 'unknown-map';
  const instanceId = String(player.instanceId || fallback?.instanceId || mapId).trim() || mapId;
  return `${playerId}|${mapId}|${instanceId}`;
}
