/**
 * 前后端共用的纯函数寻路核心与基础类型。
 */
import { CARDINAL_DIRECTION_STEPS } from './direction';
import { manhattanDistance } from './geometry';
import { PATHFINDING_MIN_STEP_COST } from './constants/gameplay/navigation';

/** 寻路失败原因枚举：记录无法返回路径的终止条件。 */
export type PathResultFailureReason =
  | 'no_path'
  | 'step_limit'
  | 'path_too_long'
  | 'target_too_far'
  | 'invalid_goal'
  | 'cancelled';

/** 网格点：寻路使用的整点坐标。 */
export interface PathPoint {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
}

/** 寻路静态地图片段：记录可行走性与代价网格。 */
export interface PathfindingStaticGrid {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapRevision：地图Revision相关字段。
 */

  mapRevision: number;  
  /**
 * width：width相关字段。
 */

  width: number;  
  /**
 * height：height相关字段。
 */

  height: number;  
  /**
 * walkable：walkable相关字段。
 */

  walkable: Uint8Array;  
  /**
 * traversalCost：traversal消耗数值。
 */

  traversalCost: Uint16Array;
}

/** 寻路输入约束：限制路径长度、展开节点数和是否允许到达最近点。 */
export interface PathfindingSearchLimits {
/**
 * maxExpandedNodes：maxExpandedNode相关字段。
 */

  maxExpandedNodes: number;  
  /**
 * maxPathLength：数量或计量字段。
 */

  maxPathLength: number;  
  /**
 * maxGoalDistance：maxGoalDistance相关字段。
 */

  maxGoalDistance?: number;  
  /**
 * allowPartialPath：allowPartial路径相关字段。
 */

  allowPartialPath?: boolean;
}

/** 寻路成功结果：携带完整/截断路径与遍历统计。 */
export interface PathfindingSearchSuccess {
/**
 * status：statu状态或数据块。
 */

  status: 'success';  
  /**
 * path：路径相关字段。
 */

  path: PathPoint[];  
  /**
 * expandedNodes：expandedNode相关字段。
 */

  expandedNodes: number;  
  /**
 * reachedGoal：reachedGoal相关字段。
 */

  reachedGoal: PathPoint;  
  /**
 * complete：complete相关字段。
 */

  complete: boolean;
}

/** 寻路失败结果：用于提示目标不可达或提前终止。 */
export interface PathfindingSearchFailure {
/**
 * status：statu状态或数据块。
 */

  status: 'failed';  
  /**
 * reason：reason相关字段。
 */

  reason: PathResultFailureReason;  
  /**
 * expandedNodes：expandedNode相关字段。
 */

  expandedNodes: number;
}

/** 寻路结果：统一成功/失败两种返回形态。 */
export type PathfindingSearchResult = PathfindingSearchSuccess | PathfindingSearchFailure;

/** A* open set 的堆节点，保存索引和优先级分值。 */
interface HeapNode {
/**
 * index：index相关字段。
 */

  index: number;  
  /**
 * score：score数值。
 */

  score: number;
}

/** 寻路运行期附加选项。 */
interface PathfindingRunOptions {
/**
 * cancelFlag：cancelFlag相关字段。
 */

  cancelFlag?: Int32Array;  
  /**
 * cancelCheckInterval：cancelCheckInterval相关字段。
 */

  cancelCheckInterval?: number;
}

/** A* 搜索中管理 open set 的最小堆。 */
class MinHeap {
  /** 堆内节点数组。 */
  private readonly items: HeapNode[] = [];

  /** 当前堆元素数量。 */
  get size(): number {
    return this.items.length;
  }

  /** 向堆插入节点并保持最小堆性质。 */
  push(node: HeapNode): void {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  /** 取出分值最小的节点；堆为空则返回 undefined。 */
  pop(): HeapNode | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 新节点上浮，恢复父节点分值不大于子节点分值。 */
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

  /** 根节点下沉，恢复最小堆顺序。 */
  private bubbleDown(index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 按行优先把二维坐标映射到一维下标。 */
function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/** 根据父节点链回溯，重建起点到目标的路径。 */
function reconstructPath(parent: Int32Array, goalIndex: number, startIndex: number, width: number): PathPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 统一生成失败返回体，避免重复拼装。 */
function failed(reason: PathfindingSearchFailure['reason'], expandedNodes: number): PathfindingSearchFailure {
  return {
    status: 'failed',
    reason,
    expandedNodes,
  };
}

/** 计算当前点到目标集合的曼哈顿距离下界。 */
function nearestGoalHeuristic(x: number, y: number, goals: PathPoint[]): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 检查外部原子标记是否要求取消寻路。 */
function isCancelled(cancelFlag?: Int32Array): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!cancelFlag || cancelFlag.length === 0) {
    return false;
  }
  return Atomics.load(cancelFlag, 0) === 1;
}

/** 过滤目标点，只保留位于边界内且可走的坐标。 */
function validateGoals(
  grid: PathfindingStaticGrid,
  blocked: Uint8Array,
  goals: PathPoint[],
): {
/**
 * indices：indice相关字段。
 */
 indices: Set<number>;
 /**
 * goalByIndex：goalByIndex相关字段。
 */
 goalByIndex: Map<number, PathPoint> } | PathfindingSearchFailure {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 根据是否完整命中和长度限制组装成功结果。 */
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

/** 执行带上限的 A* 寻路，返回完整路径或允许的部分最优路径。 */
export function findBoundedPath(
  grid: PathfindingStaticGrid,
  blocked: Uint8Array,
  startX: number,
  startY: number,
  goals: PathPoint[],
  limits: PathfindingSearchLimits,
  options?: PathfindingRunOptions,
): PathfindingSearchResult {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
