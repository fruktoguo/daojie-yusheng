/**
 * 前后端共用的纯函数寻路核心与基础类型。
 */
import { CARDINAL_DIRECTION_STEPS } from './direction';
import { manhattanDistance } from './geometry';
import { PATHFINDING_MIN_STEP_COST } from './constants/gameplay/navigation';

/** PathResultFailureReason：定义该类型的结构与数据语义。 */
export type PathResultFailureReason =
  | 'no_path'
  | 'step_limit'
  | 'path_too_long'
  | 'target_too_far'
  | 'invalid_goal'
  | 'cancelled';

/** PathPoint：定义该接口的能力与字段约束。 */
export interface PathPoint {
  x: number;
  y: number;
}

/** PathfindingStaticGrid：定义该接口的能力与字段约束。 */
export interface PathfindingStaticGrid {
  mapId: string;
  mapRevision: number;
  width: number;
  height: number;
  walkable: Uint8Array;
  traversalCost: Uint16Array;
}

/** PathfindingSearchLimits：定义该接口的能力与字段约束。 */
export interface PathfindingSearchLimits {
  maxExpandedNodes: number;
  maxPathLength: number;
  maxGoalDistance?: number;
  allowPartialPath?: boolean;
}

/** PathfindingSearchSuccess：定义该接口的能力与字段约束。 */
export interface PathfindingSearchSuccess {
  status: 'success';
  path: PathPoint[];
  expandedNodes: number;
  reachedGoal: PathPoint;
  complete: boolean;
}

/** PathfindingSearchFailure：定义该接口的能力与字段约束。 */
export interface PathfindingSearchFailure {
  status: 'failed';
  reason: PathResultFailureReason;
  expandedNodes: number;
}

/** PathfindingSearchResult：定义该类型的结构与数据语义。 */
export type PathfindingSearchResult = PathfindingSearchSuccess | PathfindingSearchFailure;

/** HeapNode：定义该接口的能力与字段约束。 */
interface HeapNode {
  index: number;
  score: number;
}

/** PathfindingRunOptions：定义该接口的能力与字段约束。 */
interface PathfindingRunOptions {
  cancelFlag?: Int32Array;
  cancelCheckInterval?: number;
}

/** MinHeap：封装相关状态与行为。 */
class MinHeap {
  private readonly items: HeapNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: HeapNode): void {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const head = this.items[0];
    const tail = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = tail;
      this.bubbleDown(0);
    }
    return head;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= this.items[index].score) {
        break;
      }
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const last = this.items.length - 1;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left <= last && this.items[left].score < this.items[smallest].score) {
        smallest = left;
      }
      if (right <= last && this.items[right].score < this.items[smallest].score) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

/** toIndex：执行对应的业务逻辑。 */
function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/** reconstructPath：执行对应的业务逻辑。 */
function reconstructPath(parent: Int32Array, goalIndex: number, startIndex: number, width: number): PathPoint[] {
  const path: PathPoint[] = [];
  let current = goalIndex;
  while (current !== startIndex && current !== -1) {
    path.push({
      x: current % width,
      y: Math.floor(current / width),
    });
    current = parent[current];
  }
  path.reverse();
  return path;
}

/** failed：执行对应的业务逻辑。 */
function failed(reason: PathfindingSearchFailure['reason'], expandedNodes: number): PathfindingSearchFailure {
  return {
    status: 'failed',
    reason,
    expandedNodes,
  };
}

/** nearestGoalHeuristic：执行对应的业务逻辑。 */
function nearestGoalHeuristic(x: number, y: number, goals: PathPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const goal of goals) {
    const distance = manhattanDistance({ x, y }, goal);
    if (distance < best) {
      best = distance;
    }
  }
  if (!Number.isFinite(best)) {
    return Number.POSITIVE_INFINITY;
  }
  return best * PATHFINDING_MIN_STEP_COST;
}

/** isCancelled：执行对应的业务逻辑。 */
function isCancelled(cancelFlag?: Int32Array): boolean {
  if (!cancelFlag || cancelFlag.length === 0) {
    return false;
  }
  return Atomics.load(cancelFlag, 0) === 1;
}

/** validateGoals：执行对应的业务逻辑。 */
function validateGoals(
  grid: PathfindingStaticGrid,
  blocked: Uint8Array,
  goals: PathPoint[],
): { indices: Set<number>; goalByIndex: Map<number, PathPoint> } | PathfindingSearchFailure {
  const goalIndices = new Set<number>();
  const goalByIndex = new Map<number, PathPoint>();

  for (const goal of goals) {
    if (
      goal.x < 0
      || goal.x >= grid.width
      || goal.y < 0
      || goal.y >= grid.height
    ) {
      continue;
    }
    const index = toIndex(goal.x, goal.y, grid.width);
    if (grid.walkable[index] !== 1 || blocked[index] === 1) {
      continue;
    }
    goalIndices.add(index);
    goalByIndex.set(index, goal);
  }

  if (goalIndices.size === 0) {
    return failed('invalid_goal', 0);
  }

  return { indices: goalIndices, goalByIndex };
}

/** buildSuccess：执行对应的业务逻辑。 */
function buildSuccess(
  parent: Int32Array,
  goalIndex: number,
  startIndex: number,
  width: number,
  goal: PathPoint,
  expandedNodes: number,
  complete: boolean,
  maxPathLength?: number,
): PathfindingSearchResult {
  const fullPath = reconstructPath(parent, goalIndex, startIndex, width);
  return {
    status: 'success',
    path: !complete && typeof maxPathLength === 'number' ? fullPath.slice(0, maxPathLength) : fullPath,
    expandedNodes,
    reachedGoal: goal,
    complete,
  };
}

/** findBoundedPath：执行对应的业务逻辑。 */
export function findBoundedPath(
  grid: PathfindingStaticGrid,
  blocked: Uint8Array,
  startX: number,
  startY: number,
  goals: PathPoint[],
  limits: PathfindingSearchLimits,
  options?: PathfindingRunOptions,
): PathfindingSearchResult {
  if (
    startX < 0
    || startX >= grid.width
    || startY < 0
    || startY >= grid.height
  ) {
    return failed('invalid_goal', 0);
  }

  const startIndex = toIndex(startX, startY, grid.width);
  const goalValidation = validateGoals(grid, blocked, goals);
  if ('status' in goalValidation) {
    return goalValidation;
  }

  if (goalValidation.indices.has(startIndex)) {
    return {
      status: 'success',
      path: [],
      expandedNodes: 0,
      reachedGoal: goalValidation.goalByIndex.get(startIndex) ?? { x: startX, y: startY },
      complete: true,
    };
  }

  if (typeof limits.maxGoalDistance === 'number' && Number.isFinite(limits.maxGoalDistance)) {
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const goal of goals) {
      nearestDistance = Math.min(nearestDistance, manhattanDistance({ x: startX, y: startY }, goal));
    }
    if (nearestDistance > limits.maxGoalDistance) {
      return failed('target_too_far', 0);
    }
  }

  const total = grid.width * grid.height;
  const gScore = new Float64Array(total);
  gScore.fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(total);
  parent.fill(-1);
  const closed = new Uint8Array(total);
  const stepDepth = new Int32Array(total);
  stepDepth.fill(-1);
  const heap = new MinHeap();

  gScore[startIndex] = 0;
  stepDepth[startIndex] = 0;
  heap.push({
    index: startIndex,
    score: nearestGoalHeuristic(startX, startY, goals),
  });

  let expandedNodes = 0;
  let bestPartialIndex = -1;
  let bestPartialGoal: PathPoint | null = null;
  let bestPartialHeuristic = Number.POSITIVE_INFINITY;
  let bestPartialCost = Number.POSITIVE_INFINITY;
  const cancelCheckInterval = Math.max(1, options?.cancelCheckInterval ?? 32);

  while (heap.size > 0) {
    if (expandedNodes > 0 && expandedNodes % cancelCheckInterval === 0 && isCancelled(options?.cancelFlag)) {
      return failed('cancelled', expandedNodes);
    }

    const current = heap.pop();
    if (!current) {
      break;
    }
    if (closed[current.index] === 1) {
      continue;
    }
    closed[current.index] = 1;
    expandedNodes += 1;

    if (goalValidation.indices.has(current.index)) {
      const path = reconstructPath(parent, current.index, startIndex, grid.width);
      if (path.length > limits.maxPathLength) {
        if (limits.allowPartialPath) {
          return {
            status: 'success',
            path: path.slice(0, limits.maxPathLength),
            expandedNodes,
            reachedGoal: goalValidation.goalByIndex.get(current.index) ?? path[path.length - 1] ?? { x: startX, y: startY },
            complete: false,
          };
        }
        return failed('path_too_long', expandedNodes);
      }
      return {
        status: 'success',
        path,
        expandedNodes,
        reachedGoal: goalValidation.goalByIndex.get(current.index) ?? path[path.length - 1] ?? { x: startX, y: startY },
        complete: true,
      };
    }

    const x = current.index % grid.width;
    const y = Math.floor(current.index / grid.width);
    const currentHeuristic = nearestGoalHeuristic(x, y, goals);
    if (
      limits.allowPartialPath
      && stepDepth[current.index] > 0
      && (
        currentHeuristic < bestPartialHeuristic
        || (currentHeuristic === bestPartialHeuristic && gScore[current.index] < bestPartialCost)
      )
    ) {
      bestPartialIndex = current.index;
      bestPartialGoal = { x, y };
      bestPartialHeuristic = currentHeuristic;
      bestPartialCost = gScore[current.index];
    }

    if (expandedNodes > limits.maxExpandedNodes) {
      if (limits.allowPartialPath && bestPartialIndex !== -1 && bestPartialGoal) {
        return buildSuccess(parent, bestPartialIndex, startIndex, grid.width, bestPartialGoal, expandedNodes, false, limits.maxPathLength);
      }
      return failed('step_limit', expandedNodes);
    }

    for (const { dx, dy } of CARDINAL_DIRECTION_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) {
        continue;
      }
      const nextIndex = toIndex(nx, ny, grid.width);
      if (closed[nextIndex] === 1 || grid.walkable[nextIndex] !== 1 || blocked[nextIndex] === 1) {
        continue;
      }
      const stepCost = grid.traversalCost[nextIndex];
      if (!Number.isFinite(stepCost) || stepCost <= 0) {
        continue;
      }
      const nextDepth = stepDepth[current.index] + 1;
      const nextScore = gScore[current.index] + stepCost;
      if (nextScore >= gScore[nextIndex]) {
        continue;
      }
      gScore[nextIndex] = nextScore;
      parent[nextIndex] = current.index;
      stepDepth[nextIndex] = nextDepth;
      heap.push({
        index: nextIndex,
        score: nextScore + nearestGoalHeuristic(nx, ny, goals),
      });
    }
  }

  if (isCancelled(options?.cancelFlag)) {
    return failed('cancelled', expandedNodes);
  }

  if (limits.allowPartialPath && bestPartialIndex !== -1 && bestPartialGoal) {
    return buildSuccess(parent, bestPartialIndex, startIndex, grid.width, bestPartialGoal, expandedNodes, false, limits.maxPathLength);
  }

  return failed('no_path', expandedNodes);
}

