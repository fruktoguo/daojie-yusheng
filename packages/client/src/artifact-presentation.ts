/**
 * 客户端法宝表现派生。这里只读取玩家状态，不承接任何服务端权威规则。
 */
import type { PlayerState } from '@mud/shared';

export function hasActiveArtifactSlot(artifacts: PlayerState['artifacts'] | null | undefined): boolean {
  return Array.isArray(artifacts?.slots)
    && artifacts.slots.some((slot) => slot.unlocked === true && slot.enabled === true && slot.item != null);
}

export function hasPlayerActiveArtifact(player: PlayerState | null | undefined): boolean {
  return hasActiveArtifactSlot(player?.artifacts);
}
