/**
 * 本文件属于正式客户端主线，负责前端传法目标的显示派生。
 *
 * 只用于候选列表展示；最终距离与传授条件仍由服务端权威校验。
 */
import type { PlayerState } from '@mud/shared';
import type { MainRuntimeObservedEntity } from './main-runtime-view-types';

export type TransmissionTargetOption = { playerId: string; name: string };

export function resolveNearbyTransmissionTargets(
  player: Pick<PlayerState, 'id' | 'x' | 'y'> | null | undefined,
  entities: readonly MainRuntimeObservedEntity[],
): TransmissionTargetOption[] {
  if (!player) return [];
  return entities
    .filter((entity) => entity.kind === 'player' && entity.id !== player.id)
    .filter((entity) => Math.max(Math.abs(Math.floor(entity.wx) - Math.floor(player.x)), Math.abs(Math.floor(entity.wy) - Math.floor(player.y))) <= 2)
    .map((entity) => ({ playerId: entity.id, name: entity.name ?? entity.id }));
}
