/**
 * map-instance-monster-advancer.ts
 *
 * 纯函数模块：从 MapInstanceRuntime 提取的妖兽 AI 推进逻辑。
 * 通过 MonsterAdvancerContext 接口获取实例只读状态，
 * 产出 MonsterAdvancerResult 描述妖兽移动和目标变更。
 */

import { Direction, isOffsetInRange } from '@mud/shared';

/** 切比雪夫距离（4 参数本地版本）。 */
function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

// ─── 妖兽丢失视野后追击记忆窗口 ───
const MONSTER_LOST_SIGHT_CHASE_TICKS = 3;

// ─── 妖兽运行态最小字段 ───

/** 妖兽运行态中 advancer 需要读写的字段。 */
export interface MonsterRuntimeState {
  runtimeId: string;
  monsterId: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  facing: Direction;
  alive: boolean;
  aggroRange: number;
  leashRange: number;
  wanderRadius: number;
  attackRange: number;
  attackCooldownTicks: number;
  attackReadyTick: number;
  aggroTargetPlayerId: string | null;
  lastSeenTargetX: number | undefined;
  lastSeenTargetY: number | undefined;
  lastSeenTargetTick: number | undefined;
}

/** advancer 需要的玩家位置信息。 */
export interface PlayerPositionState {
  playerId: string;
  x: number;
  y: number;
}

// ─── 实例上下文接口 ───

/** advancer 从实例读取的只读能力。 */
export interface MonsterAdvancerContext {
  /** 当前 tick。 */
  readonly tick: number;
  /** 实例 ID。 */
  readonly instanceId: string;

  /** 按 runtimeId 获取妖兽。 */
  getMonster(runtimeId: string): MonsterRuntimeState | undefined;
  /** 遍历所有妖兽。 */
  iterateMonsters(): Iterable<MonsterRuntimeState>;
  /** 按 playerId 获取玩家位置。 */
  getPlayer(playerId: string): PlayerPositionState | undefined;
  /** 遍历所有在线玩家。 */
  iteratePlayers(): Iterable<PlayerPositionState>;

  /** 收集视野内可见地块索引集合。 */
  collectVisibleTileIndices(originX: number, originY: number, radius: number): Set<number>;
  /** 坐标转地块索引。 */
  toTileIndex(x: number, y: number): number;
  /** 判断地块是否可占用（无玩家、无怪物、可行走）。 */
  isOpenTile(x: number, y: number): boolean;
}

// ─── 产出命令 ───

/** 妖兽移动命令。 */
export interface MonsterMoveCommand {
  kind: 'move';
  runtimeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  facing: Direction;
}

/** 妖兽目标记忆命令。 */
export interface MonsterRememberTargetCommand {
  kind: 'remember_target';
  runtimeId: string;
  targetPlayerId: string;
  targetX: number;
  targetY: number;
  tick: number;
}

/** 妖兽清除追击命令。 */
export interface MonsterClearPursuitCommand {
  kind: 'clear_pursuit';
  runtimeId: string;
}

export type MonsterAdvancerCommand =
  | MonsterMoveCommand
  | MonsterRememberTargetCommand
  | MonsterClearPursuitCommand;

/** advancer 单次推进的完整结果。 */
export interface MonsterAdvancerResult {
  commands: MonsterAdvancerCommand[];
  /** 需要标记持久化脏的 runtimeId 集合。 */
  dirtyRuntimeIds: Set<string>;
  /** 是否产生了任何状态变化。 */
  changed: boolean;
}

// ─── 目标解析结果 ───

interface ResolvedTarget {
  playerId: string;
  x: number;
  y: number;
}

// ─── 纯函数实现 ───

/** 解析妖兽的当前仇恨目标。 */
export function resolveMonsterTarget(
  monster: MonsterRuntimeState,
  ctx: MonsterAdvancerContext,
): ResolvedTarget | null {
  const aggroRange = Math.max(0, Math.trunc(Number(monster.aggroRange) || 0));
  const visibleTileIndices = ctx.collectVisibleTileIndices(monster.x, monster.y, aggroRange);

  if (monster.aggroTargetPlayerId) {
    const current = ctx.getPlayer(monster.aggroTargetPlayerId);
    if (
      current &&
      chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) <= monster.leashRange &&
      chebyshevDistance(monster.x, monster.y, current.x, current.y) <= aggroRange &&
      visibleTileIndices.has(ctx.toTileIndex(current.x, current.y))
    ) {
      return current;
    }
    if (
      !current ||
      chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) > monster.leashRange
    ) {
      return null; // caller should clear pursuit
    }
  }

  let best: PlayerPositionState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const player of ctx.iteratePlayers()) {
    if (chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) > monster.leashRange) {
      continue;
    }
    const distance = chebyshevDistance(monster.x, monster.y, player.x, player.y);
    if (distance > aggroRange || distance >= bestDistance) {
      continue;
    }
    if (!visibleTileIndices.has(ctx.toTileIndex(player.x, player.y))) {
      continue;
    }
    best = player;
    bestDistance = distance;
  }
  return best;
}

/** 解析妖兽丢失视野后的短暂追击落点。 */
export function resolveMonsterLostSightChaseTarget(
  monster: MonsterRuntimeState,
  ctx: MonsterAdvancerContext,
): { x: number; y: number } | null {
  const { aggroTargetPlayerId, lastSeenTick, lastSeenX, lastSeenY } = {
    aggroTargetPlayerId: monster.aggroTargetPlayerId,
    lastSeenTick: monster.lastSeenTargetTick,
    lastSeenX: monster.lastSeenTargetX,
    lastSeenY: monster.lastSeenTargetY,
  };
  if (
    typeof aggroTargetPlayerId !== 'string' ||
    !Number.isInteger(lastSeenTick) ||
    !Number.isInteger(lastSeenX) ||
    !Number.isInteger(lastSeenY)
  ) {
    return null;
  }
  if (ctx.tick > Number(lastSeenTick) + MONSTER_LOST_SIGHT_CHASE_TICKS) {
    return null;
  }
  const target = ctx.getPlayer(aggroTargetPlayerId);
  if (!target || chebyshevDistance(monster.spawnX, monster.spawnY, target.x, target.y) > monster.leashRange) {
    return null;
  }
  const normalizedX = Math.trunc(Number(lastSeenX));
  const normalizedY = Math.trunc(Number(lastSeenY));
  if (chebyshevDistance(monster.x, monster.y, normalizedX, normalizedY) <= 1) {
    return null;
  }
  return { x: normalizedX, y: normalizedY };
}

/** 记录妖兽最后一次看见目标的位置。 */
export function rememberMonsterTargetSight(
  monster: MonsterRuntimeState,
  target: PlayerPositionState,
  tick: number,
): MonsterRememberTargetCommand {
  return {
    kind: 'remember_target',
    runtimeId: monster.runtimeId,
    targetPlayerId: target.playerId,
    targetX: target.x,
    targetY: target.y,
    tick,
  };
}

/** 清理妖兽追击状态。 */
export function clearMonsterTargetPursuit(monster: MonsterRuntimeState): MonsterClearPursuitCommand {
  return {
    kind: 'clear_pursuit',
    runtimeId: monster.runtimeId,
  };
}

/** 判断妖兽是否仍在活动范围内。 */
export function isMonsterWithinWanderRange(monster: MonsterRuntimeState, x: number, y: number): boolean {
  const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
  return isOffsetInRange(x - monster.spawnX, y - monster.spawnY, radius);
}

/** 选择妖兽下一步移动候选。 */
function chooseMonsterStep(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): Array<{ x: number; y: number; facing: Direction }> {
  const dx = Math.sign(targetX - fromX);
  const dy = Math.sign(targetY - fromY);
  const candidates: Array<{ x: number; y: number; facing: Direction }> = [];
  if (Math.abs(targetX - fromX) >= Math.abs(targetY - fromY) && dx !== 0) {
    candidates.push({ x: fromX + dx, y: fromY, facing: dx > 0 ? Direction.East : Direction.West });
  }
  if (dy !== 0) {
    candidates.push({ x: fromX, y: fromY + dy, facing: dy > 0 ? Direction.South : Direction.North });
  }
  if (Math.abs(targetX - fromX) < Math.abs(targetY - fromY) && dx !== 0) {
    candidates.push({ x: fromX + dx, y: fromY, facing: dx > 0 ? Direction.East : Direction.West });
  }
  return candidates;
}

/** 让无目标妖兽在活动范围内随机闲逛一步。 */
export function stepMonsterIdleRoam(
  monster: MonsterRuntimeState,
  ctx: MonsterAdvancerContext,
): MonsterMoveCommand | null {
  const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
  if (radius <= 0) {
    return null;
  }
  const directions: Array<{ dx: number; dy: number; facing: Direction }> = [
    { dx: 1, dy: 0, facing: Direction.East },
    { dx: -1, dy: 0, facing: Direction.West },
    { dx: 0, dy: 1, facing: Direction.South },
    { dx: 0, dy: -1, facing: Direction.North },
  ];
  const startIndex = Math.floor(Math.random() * directions.length);
  for (let offset = 0; offset < directions.length; offset += 1) {
    const direction = directions[(startIndex + offset) % directions.length]!;
    const nextX = monster.x + direction.dx;
    const nextY = monster.y + direction.dy;
    if (!isMonsterWithinWanderRange(monster, nextX, nextY)) {
      continue;
    }
    if (!ctx.isOpenTile(nextX, nextY)) {
      continue;
    }
    return {
      kind: 'move',
      runtimeId: monster.runtimeId,
      fromX: monster.x,
      fromY: monster.y,
      toX: nextX,
      toY: nextY,
      facing: direction.facing,
    };
  }
  return null;
}

/** 尝试让妖兽朝目标移动一步。 */
export function tryMoveMonsterToward(
  monster: MonsterRuntimeState,
  targetX: number,
  targetY: number,
  ctx: MonsterAdvancerContext,
): MonsterMoveCommand | null {
  const candidates = chooseMonsterStep(monster.x, monster.y, targetX, targetY);
  for (const candidate of candidates) {
    if (!ctx.isOpenTile(candidate.x, candidate.y)) {
      continue;
    }
    return {
      kind: 'move',
      runtimeId: monster.runtimeId,
      fromX: monster.x,
      fromY: monster.y,
      toX: candidate.x,
      toY: candidate.y,
      facing: candidate.facing,
    };
  }
  return null;
}
