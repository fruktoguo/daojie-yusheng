/**
 * 玩家移动能力聚合。
 *
 * 移动裁定只消费玩家当前能力；装备、法宝、Buff、技能等只是能力来源。
 */

export interface PlayerStaticObstacleIgnoreState {
  canIgnore: boolean;
}

export interface PlayerMovementCapabilities {
  staticObstacleIgnore: boolean;
}

export function resolvePlayerMovementCapabilities(player: any, _currentTick: unknown = null): PlayerMovementCapabilities {
  return {
    staticObstacleIgnore: resolvePlayerStaticObstacleIgnoreState(player).canIgnore,
  };
}

export function canPlayerIgnoreStaticObstacle(player: any, currentTick: unknown = null): boolean {
  return resolvePlayerMovementCapabilities(player, currentTick).staticObstacleIgnore === true;
}

export function refreshPlayerMovementCapabilities(player: any): boolean {
  if (!player || typeof player !== 'object') {
    return false;
  }
  const previousCapabilities = player.movementCapabilities && typeof player.movementCapabilities === 'object'
    ? player.movementCapabilities
    : {};
  const previousStaticObstacleIgnore = resolveDirectPlayerStaticObstacleIgnoreState(player).canIgnore;
  const nextStaticObstacleIgnore = resolveArtifactGrantedStaticObstacleIgnoreState(player).canIgnore;
  const nextCapabilities = {
    ...previousCapabilities,
    staticObstacleIgnore: nextStaticObstacleIgnore,
  };
  delete (nextCapabilities as any).ignoreStaticObstacle;
  player.movementCapabilities = nextCapabilities;
  return previousStaticObstacleIgnore !== nextStaticObstacleIgnore
    || previousCapabilities.staticObstacleIgnore !== nextStaticObstacleIgnore
    || Object.prototype.hasOwnProperty.call(previousCapabilities, 'ignoreStaticObstacle');
}

function resolvePlayerStaticObstacleIgnoreState(player: any): PlayerStaticObstacleIgnoreState {
  return resolveDirectPlayerStaticObstacleIgnoreState(player);
}

function resolveDirectPlayerStaticObstacleIgnoreState(player: any): PlayerStaticObstacleIgnoreState {
  const capabilities = player?.movementCapabilities;
  const staticObstacleIgnore = capabilities?.staticObstacleIgnore;
  if (staticObstacleIgnore === true || staticObstacleIgnore?.canIgnore === true) {
    return { canIgnore: true };
  }
  return { canIgnore: false };
}

function resolveArtifactGrantedStaticObstacleIgnoreState(player: any): PlayerStaticObstacleIgnoreState {
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
    return { canIgnore: true };
  }
  return { canIgnore: false };
}
