import type { PlayerState, S2C_WorldDelta } from '@mud/shared';

export type WorldDeltaResetContext = {
  mapId?: string;
  instanceId?: string;
};

/** full/reset 世界快照必须使用包内空间上下文，不能只依赖先到达的 MapEnter 临时提示。 */
export function resolveWorldDeltaResetContext(
  data: Pick<S2C_WorldDelta, 'full' | 'reset' | 'mid' | 'iid'>,
  mapIdHint?: string,
  instanceIdHint?: string,
): WorldDeltaResetContext {
  const fullSnapshot = data.full === 1 || data.reset === 1;
  return {
    mapId: normalizeSpatialId(mapIdHint) ?? (fullSnapshot ? normalizeSpatialId(data.mid) : undefined),
    instanceId: normalizeSpatialId(instanceIdHint) ?? (fullSnapshot ? normalizeSpatialId(data.iid) : undefined),
  };
}

/** 构造与地图实例绑定的聊天持久化作用域，避免同模板实例之间串读本地消息。 */
export function buildChatPersistenceScope(
  player: Pick<PlayerState, 'id' | 'mapId' | 'instanceId' | 'sectId'>,
  fallback?: { mapId?: string; instanceId?: string },
): string {
  const playerId = String(player.id || 'anonymous').trim() || 'anonymous';
  const mapId = String(player.mapId || fallback?.mapId || 'unknown-map').trim() || 'unknown-map';
  const instanceId = String(player.instanceId || fallback?.instanceId || mapId).trim() || mapId;
  const sectId = String(player.sectId || 'none').trim() || 'none';
  return `${playerId}|${mapId}|${instanceId}|${sectId}`;
}

function normalizeSpatialId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}
