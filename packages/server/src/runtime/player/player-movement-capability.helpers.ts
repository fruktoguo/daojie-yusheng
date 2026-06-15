/**
 * 玩家移动能力聚合。
 *
 * 移动裁定只消费玩家当前能力；装备、法宝、Buff、技能等只是能力来源。
 */

type StaticObstacleIgnoreCost =
  | {
      kind: 'artifact_qi';
      slot: Record<string, unknown>;
      cost: number;
      normalizedTick: number;
    }
  | null;

export interface PlayerStaticObstacleIgnoreState {
  canIgnore: boolean;
  cost: StaticObstacleIgnoreCost;
  alreadyPaidThisTick: boolean;
}

export interface PlayerMovementCapabilities {
  staticObstacleIgnore: PlayerStaticObstacleIgnoreState;
}

export interface PlayerMovementCostConsumeResult {
  consumed: boolean;
  dirtyDomains: string[];
}

export function resolvePlayerMovementCapabilities(player: any, currentTick: unknown = null): PlayerMovementCapabilities {
  return {
    staticObstacleIgnore: resolvePlayerStaticObstacleIgnoreState(player, currentTick),
  };
}

export function canPlayerIgnoreStaticObstacle(player: any, currentTick: unknown = null): boolean {
  return resolvePlayerMovementCapabilities(player, currentTick).staticObstacleIgnore.canIgnore;
}

export function consumePlayerStaticObstacleIgnoreCost(player: any, currentTick: unknown = null): PlayerMovementCostConsumeResult {
  const state = resolvePlayerMovementCapabilities(player, currentTick).staticObstacleIgnore;
  if (!state.canIgnore) {
    return { consumed: false, dirtyDomains: [] };
  }
  if (state.alreadyPaidThisTick || !state.cost) {
    return { consumed: true, dirtyDomains: [] };
  }
  if (state.cost.kind === 'artifact_qi') {
    const slot = state.cost.slot;
    slot.qi = Math.max(0, Number(slot.qi) - state.cost.cost);
    slot.lastTraverseUnwalkableTick = state.cost.normalizedTick;
    if (player?.artifacts) {
      player.artifacts.revision = Math.max(1, Math.trunc(Number(player.artifacts.revision ?? 1) || 1)) + 1;
    }
    return { consumed: true, dirtyDomains: ['artifact'] };
  }
  return { consumed: false, dirtyDomains: [] };
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
    return { canIgnore: true, cost: null, alreadyPaidThisTick: false };
  }
  return { canIgnore: false, cost: null, alreadyPaidThisTick: false };
}

function resolveArtifactGrantedStaticObstacleIgnoreState(player: any, currentTick: unknown): PlayerStaticObstacleIgnoreState {
  const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
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
    if (Math.trunc(Number(slot.lastTraverseUnwalkableTick) || -1) === normalizedTick) {
      return { canIgnore: true, cost: null, alreadyPaidThisTick: true };
    }
    const maxQi = Math.max(0, Number(slot.maxQi) || 0);
    const ratio = Number(effect.costMaxQiRatio);
    const cost = Number.isFinite(ratio) && ratio > 0
      ? Math.max(1, Math.ceil(maxQi * ratio))
      : 0;
    if (cost > 0 && maxQi > 0 && Number(slot.qi) >= cost) {
      return {
        canIgnore: true,
        cost: { kind: 'artifact_qi', slot, cost, normalizedTick },
        alreadyPaidThisTick: false,
      };
    }
  }
  return { canIgnore: false, cost: null, alreadyPaidThisTick: false };
}
