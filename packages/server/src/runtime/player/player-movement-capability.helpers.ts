/**
 * 玩家移动能力聚合。
 *
 * 移动裁定只消费玩家当前能力；装备、法宝、Buff、技能等只是能力来源。
 */

export interface PlayerStaticObstacleIgnoreState {
  canIgnore: boolean;
}

export interface PlayerMovementCapabilities {
  staticObstacleIgnore: PlayerStaticObstacleIgnoreState;
}

export function resolvePlayerMovementCapabilities(player: any, currentTick: unknown = null): PlayerMovementCapabilities {
  return {
    staticObstacleIgnore: resolvePlayerStaticObstacleIgnoreState(player, currentTick),
  };
}

export function canPlayerIgnoreStaticObstacle(player: any, currentTick: unknown = null): boolean {
  return resolvePlayerMovementCapabilities(player, currentTick).staticObstacleIgnore.canIgnore;
}

function resolvePlayerStaticObstacleIgnoreState(player: any, currentTick: unknown): PlayerStaticObstacleIgnoreState {
  const direct = resolveDirectPlayerStaticObstacleIgnoreState(player);
  if (direct.canIgnore) {
    return direct;
  }
  return resolveArtifactGrantedStaticObstacleIgnoreState(player, currentTick);
}

function resolveDirectPlayerStaticObstacleIgnoreState(player: any): PlayerStaticObstacleIgnoreState {
  const capabilities = player?.movementCapabilities;
  if (capabilities?.staticObstacleIgnore === true || capabilities?.ignoreStaticObstacle === true) {
    return { canIgnore: true };
  }
  return { canIgnore: false };
}

function resolveArtifactGrantedStaticObstacleIgnoreState(player: any, _currentTick: unknown): PlayerStaticObstacleIgnoreState {
  const slots = Array.isArray(player?.artifacts?.slots) ? player.artifacts.slots : [];
  for (const slot of slots) {
    if (!slot || slot.unlocked !== true || slot.enabled === false || !slot.item) {
      continue;
    }
    const effects = Array.isArray(slot.item.artifactEffects) ? slot.item.artifactEffects : [];
    const effect = effects.find((entry: any) => entry?.type === 'traverse_unwalkable');
    if (!effect) {
      continue;
    }
    const maxQi = Math.max(0, Number(slot.maxQi) || 0);
    if (maxQi > 0 && Number(slot.qi) > 0) {
      return { canIgnore: true };
    }
  }
  return { canIgnore: false };
}
