// @ts-nocheck
"use strict";
/** 路径规划辅助：负责坐标判定、A* 寻路与移动方向计算。 */
Object.defineProperty(exports, "__esModule", { value: true });

const shared_1 = require("@mud/shared");

const map_template_repository_1 = require("../map/map-template.repository");

const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
const PATH_DIRECTION_STEPS = [
    { direction: shared_1.Direction.North, x: 0, y: -1 },
    { direction: shared_1.Direction.South, x: 0, y: 1 },
    { direction: shared_1.Direction.East, x: 1, y: 0 },
    { direction: shared_1.Direction.West, x: -1, y: 0 },
];
const PATH_PLANNING_HEURISTIC_MIN_STEP_COST = 1;
/** 计算切比雪夫距离，统一用作格子距离与范围判断。 */
function chebyshevDistance(leftX, leftY, rightX, rightY) {
    return Math.max(Math.abs(leftX - rightX), Math.abs(leftY - rightY));
}
/** 判定坐标是否在地图宽高边界内。 */
function isInBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x < width && y < height;
}
/** 选择目标地图最近的传送门入口。 */
function selectNearestPortal(portals, targetMapId, fromX, fromY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let best = null;

    let bestDistance = Number.POSITIVE_INFINITY;
    for (const portal of portals) {
        if (portal.targetMapId !== targetMapId) {
            continue;
        }

        const distance = Math.abs(portal.x - fromX) + Math.abs(portal.y - fromY);
        if (distance < bestDistance) {
            best = portal;
            bestDistance = distance;
        }
    }
    return best;
}
/** 按目标点构建可达目标列表，必要时返回最近可替代坐标。 */
function buildGoalPoints(instance, targetX, targetY, allowNearestReachable, playerId = null) {
    const goals = [];
    if (instance.isInBounds?.(targetX, targetY) === true && instance.isWalkable(targetX, targetY, playerId)) {
        goals.push({ x: targetX, y: targetY });
    }
    if (goals.length > 0 || !allowNearestReachable) {
        return goals;
    }
    for (let radius = 1; radius <= 8; radius += 1) {
        for (let y = targetY - radius; y <= targetY + radius; y += 1) {
            for (let x = targetX - radius; x <= targetX + radius; x += 1) {
                if (instance.isInBounds?.(x, y) !== true || !instance.isWalkable(x, y, playerId)) {
                    continue;
                }
                goals.push({ x, y });
            }
        }
        if (goals.length > 0) {
            goals.sort((left, right) => (Math.abs(left.x - targetX) + Math.abs(left.y - targetY)) - (Math.abs(right.x - targetX) + Math.abs(right.y - targetY)));
            return dedupeGoalPoints(goals);
        }
    }
    return [];
}
/** 按地图模板从目标坐标推导可达目标点集合。 */
function buildGoalPointsFromTemplate(template, targetX, targetY, allowNearestReachable) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const goals = [];
    if (isInBounds(targetX, targetY, template.width, template.height)) {

        const tileIndex = (0, map_template_repository_1.getTileIndex)(targetX, targetY, template.width);
        if (template.walkableMask[tileIndex] === 1) {
            goals.push({ x: targetX, y: targetY });
        }
    }
    if (goals.length > 0 || !allowNearestReachable) {
        return goals;
    }
    for (let radius = 1; radius <= 8; radius += 1) {
        for (let y = targetY - radius; y <= targetY + radius; y += 1) {
            for (let x = targetX - radius; x <= targetX + radius; x += 1) {
                if (!isInBounds(x, y, template.width, template.height)) {
                    continue;
                }

                const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
                if (template.walkableMask[tileIndex] !== 1) {
                    continue;
                }
                goals.push({ x, y });
            }
        }
        if (goals.length > 0) {
            goals.sort((left, right) => (Math.abs(left.x - targetX) + Math.abs(left.y - targetY)) - (Math.abs(right.x - targetX) + Math.abs(right.y - targetY)));
            return dedupeGoalPoints(goals);
        }
    }
    return [];
}
/** 生成与给定坐标相邻且可行走的格子列表。 */
function buildAdjacentGoalPoints(template, centerX, centerY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const goals = [];
    for (const step of PATH_DIRECTION_STEPS) {
        const x = centerX + step.x;
        const y = centerY + step.y;
        if (!isInBounds(x, y, template.width, template.height)) {
            continue;
        }

        const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
        if (template.walkableMask[tileIndex] !== 1) {
            continue;
        }
        goals.push({ x, y });
    }
    return dedupeGoalPoints(goals);
}
/** 对目标点集合按坐标去重。 */
function dedupeGoalPoints(goals) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];

    const seen = new Set();
    for (const goal of goals) {
        const key = `${goal.x},${goal.y}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(goal);
    }
    return result;
}
/** 解析客户端压缩路径提示并还原坐标序列。 */
function decodeClientPathHint(packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const packedPath = typeof packedPathInput === 'string' ? packedPathInput.trim() : '';
    if (!packedPath) {
        return null;
    }
    if (!Number.isInteger(packedPathStepsInput) || packedPathStepsInput <= 0) {
        return null;
    }
    if (!Number.isFinite(pathStartXInput) || !Number.isFinite(pathStartYInput)) {
        return null;
    }

    const startX = Math.trunc(Number(pathStartXInput));

    const startY = Math.trunc(Number(pathStartYInput));

    const directions = (0, shared_1.unpackDirections)(packedPath, Math.trunc(Number(packedPathStepsInput)));
    if (!directions || directions.length === 0) {
        return null;
    }

    const points = [];

    let currentX = startX;

    let currentY = startY;
    for (const direction of directions) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            return null;
        }
        currentX += offset.x;
        currentY += offset.y;
        points.push({ x: currentX, y: currentY });
    }
    return {
        startX,
        startY,
        points,
    };
}
/** 统计路径开头连续同方向步数，用于路径提示优化。 */
function resolveInitialRunLength(path, startX, startY, direction) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(path) || path.length === 0) {
        return 1;
    }

    const offset = DIRECTION_OFFSET[direction];
    if (!offset) {
        return 1;
    }

    let previousX = startX;

    let previousY = startY;

    let length = 0;
    for (const step of path) {
        if (!step || typeof step.x !== 'number' || typeof step.y !== 'number') {
            break;
        }

        const deltaX = step.x - previousX;

        const deltaY = step.y - previousY;
        if (deltaX !== offset.x || deltaY !== offset.y) {
            break;
        }
        length += 1;
        previousX = step.x;
        previousY = step.y;
    }
    return Math.max(1, length);
}
/** 生成寻路阻塞掩码，按是否允许目标占用可回退目标格。 */
function buildPathingBlockMask(instance, playerId, goals, allowOccupiedGoals = true) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const blocked = new Set();
    instance.forEachPathingBlocker(playerId, (x, y) => {
        const tileIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(x, y) : -1;
        if (tileIndex >= 0) {
            blocked.add(tileIndex);
        }
    });
    if (allowOccupiedGoals) {
        for (const goal of goals) {
            const tileIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(goal.x, goal.y) : -1;
            if (tileIndex >= 0) {
                blocked.delete(tileIndex);
            }
        }
    }
    return blocked;
}
/** 计算路径总可行走代价，无穷大表示路径不可达。 */
function computePathCost(instance, path, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let cost = 0;
    for (const point of path) {
        const stepCost = instance.getTileTraversalCost(point.x, point.y, playerId);
        if (!Number.isFinite(stepCost) || stepCost <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        cost += stepCost;
    }
    return cost;
}
function resolvePathNodePriority(node) {
    return Number.isFinite(node?.priority) ? node.priority : node.cost;
}
function comparePathNodePriority(left, right) {
    const leftPriority = resolvePathNodePriority(left);
    const rightPriority = resolvePathNodePriority(right);
    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }
    return left.cost - right.cost;
}
function estimateChebyshevCostToGoals(x, y, goals) {
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const goal of goals) {
        const distance = chebyshevDistance(x, y, goal.x, goal.y);
        if (distance < bestDistance) {
            bestDistance = distance;
        }
    }
    return Number.isFinite(bestDistance)
        ? bestDistance * PATH_PLANNING_HEURISTIC_MIN_STEP_COST
        : 0;
}
function estimateChebyshevCostToTargetRange(x, y, targetX, targetY, stopDistance) {
    const remainingDistance = Math.max(0, chebyshevDistance(x, y, targetX, targetY) - Math.max(0, Math.round(stopDistance)));
    return remainingDistance * PATH_PLANNING_HEURISTIC_MIN_STEP_COST;
}
/** 将坐标打包为稳定的字符串 key。 */
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/** 优先复用客户端路径Hint，在当前状态可接续时返回剩余坐标序列。 */
function resolvePreferredClientPathHint(instance, playerId, currentX, currentY, goals, clientPathHint) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!clientPathHint || !Array.isArray(clientPathHint.points) || clientPathHint.points.length === 0) {
        return null;
    }

    let points = clientPathHint.points;
    if (clientPathHint.startX === currentX && clientPathHint.startY === currentY) {
        points = clientPathHint.points.slice();
    }
    else {

        const currentIndex = clientPathHint.points.findIndex((point) => point.x === currentX && point.y === currentY);
        if (currentIndex < 0) {
            return null;
        }
        points = clientPathHint.points.slice(currentIndex + 1);
    }
    if (points.length === 0) {
        return null;
    }

    const goalKeys = new Set(goals.map((goal) => buildCoordKey(goal.x, goal.y)));

    const lastPoint = points[points.length - 1];
    if (!goalKeys.has(buildCoordKey(lastPoint.x, lastPoint.y))) {
        return null;
    }

    const blocked = buildPathingBlockMask(instance, playerId, goals, true);

    let previousX = currentX;

    let previousY = currentY;
    for (const point of points) {
        if (instance.isInBounds?.(point.x, point.y) !== true) {
            return null;
        }

        const deltaX = point.x - previousX;

        const deltaY = point.y - previousY;
        if (Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
            return null;
        }

        const tileIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(point.x, point.y) : -1;
        if (tileIndex < 0 || !instance.isWalkable(point.x, point.y, playerId) || blocked.has(tileIndex)) {
            return null;
        }

        const stepCost = instance.getTileTraversalCost(point.x, point.y, playerId);
        if (!Number.isFinite(stepCost) || stepCost <= 0) {
            return null;
        }
        previousX = point.x;
        previousY = point.y;
    }
    return {
        points,
        cost: computePathCost(instance, points, playerId),
    };
}
/** 在地图内执行寻路，返回最小代价路径。 */
function findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (goals.length === 0) {
        return null;
    }

    const goalIndices = new Set();
    const validGoals = [];
    for (const goal of goals) {
        if (instance.isInBounds?.(goal.x, goal.y) !== true) {
            continue;
        }
        const tileIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(goal.x, goal.y) : -1;
        if (tileIndex >= 0) {
            goalIndices.add(tileIndex);
            validGoals.push({ x: goal.x, y: goal.y });
        }
    }
    if (goalIndices.size === 0) {
        return null;
    }

    const blocked = buildPathingBlockMask(instance, playerId, goals, allowOccupiedGoals);

    const size = Math.max(instance.occupancy?.length ?? 0, instance.tilePlane?.getCellCapacity?.() ?? 0, instance.template.width * instance.template.height);

    const bestCost = new Float64Array(size);
    bestCost.fill(Number.POSITIVE_INFINITY);

    const previous = new Int32Array(size);
    previous.fill(-1);

    const heap = [];

    const startIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(startX, startY) : -1;
    if (startIndex < 0 || startIndex >= size) {
        return null;
    }
    bestCost[startIndex] = 0;
    pushPathNode(heap, {
        index: startIndex,
        cost: 0,
        priority: estimateChebyshevCostToGoals(startX, startY, validGoals),
    });
    while (heap.length > 0) {

        const currentNode = popPathNode(heap);
        if (!currentNode) {
            break;
        }

        const current = currentNode.index;
        if (currentNode.cost !== bestCost[current]) {
            continue;
        }
        if (goalIndices.has(current)) {
            return {
                points: reconstructPathPoints(previous, current, startIndex, instance),
                cost: currentNode.cost,
            };
        }

        const x = resolveInstanceTileX(instance, current);

        const y = resolveInstanceTileY(instance, current);
        for (const step of PATH_DIRECTION_STEPS) {
            const nextX = x + step.x;
            const nextY = y + step.y;
            if (instance.isInBounds?.(nextX, nextY) !== true) {
                continue;
            }

            const nextIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(nextX, nextY) : -1;
            if (nextIndex < 0 || nextIndex >= size || !instance.isWalkable(nextX, nextY, playerId) || blocked.has(nextIndex)) {
                continue;
            }

            const stepCost = instance.getTileTraversalCost(nextX, nextY, playerId);
            if (!Number.isFinite(stepCost) || stepCost <= 0) {
                continue;
            }

            const nextCost = currentNode.cost + stepCost;
            if (nextCost >= bestCost[nextIndex]) {
                continue;
            }
            bestCost[nextIndex] = nextCost;
            previous[nextIndex] = current;
            pushPathNode(heap, {
                index: nextIndex,
                cost: nextCost,
                priority: nextCost + estimateChebyshevCostToGoals(nextX, nextY, validGoals),
            });
        }
    }
    return null;
}
/** 寻路到目标停止距离内，不预生成候选目标格。 */
function findPathToTargetWithinRangeOnMap(instance, playerId, startX, startY, targetX, targetY, stopDistance, allowOccupiedTarget = false) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (instance.isInBounds?.(targetX, targetY) !== true) {
        return null;
    }
    const normalizedStopDistance = Math.max(0, Math.round(stopDistance));
    const isStopNode = (x, y) => {
        if (normalizedStopDistance > 0 && x === targetX && y === targetY) {
            return false;
        }
        return chebyshevDistance(x, y, targetX, targetY) <= normalizedStopDistance;
    };
    if (isStopNode(startX, startY)) {
        return {
            points: [],
            cost: 0,
        };
    }

    const targetGoal = allowOccupiedTarget ? [{ x: targetX, y: targetY }] : [];
    const blocked = buildPathingBlockMask(instance, playerId, targetGoal, allowOccupiedTarget);
    const size = Math.max(instance.occupancy?.length ?? 0, instance.tilePlane?.getCellCapacity?.() ?? 0, instance.template.width * instance.template.height);

    const bestCost = new Float64Array(size);
    bestCost.fill(Number.POSITIVE_INFINITY);

    const previous = new Int32Array(size);
    previous.fill(-1);

    const heap = [];

    const startIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(startX, startY) : -1;
    if (startIndex < 0 || startIndex >= size) {
        return null;
    }
    bestCost[startIndex] = 0;
    pushPathNode(heap, {
        index: startIndex,
        cost: 0,
        priority: estimateChebyshevCostToTargetRange(startX, startY, targetX, targetY, normalizedStopDistance),
    });
    while (heap.length > 0) {
        const currentNode = popPathNode(heap);
        if (!currentNode) {
            break;
        }

        const current = currentNode.index;
        if (currentNode.cost !== bestCost[current]) {
            continue;
        }

        const x = resolveInstanceTileX(instance, current);
        const y = resolveInstanceTileY(instance, current);
        if (isStopNode(x, y)) {
            return {
                points: reconstructPathPoints(previous, current, startIndex, instance),
                cost: currentNode.cost,
            };
        }

        for (const step of PATH_DIRECTION_STEPS) {
            const nextX = x + step.x;
            const nextY = y + step.y;
            if (instance.isInBounds?.(nextX, nextY) !== true) {
                continue;
            }

            const nextIndex = typeof instance.toTileIndex === 'function' ? instance.toTileIndex(nextX, nextY) : -1;
            if (nextIndex < 0 || nextIndex >= size || !instance.isWalkable(nextX, nextY, playerId) || blocked.has(nextIndex)) {
                continue;
            }

            const stepCost = instance.getTileTraversalCost(nextX, nextY, playerId);
            if (!Number.isFinite(stepCost) || stepCost <= 0) {
                continue;
            }

            const nextCost = currentNode.cost + stepCost;
            if (nextCost >= bestCost[nextIndex]) {
                continue;
            }
            bestCost[nextIndex] = nextCost;
            previous[nextIndex] = current;
            pushPathNode(heap, {
                index: nextIndex,
                cost: nextCost,
                priority: nextCost + estimateChebyshevCostToTargetRange(nextX, nextY, targetX, targetY, normalizedStopDistance),
            });
        }
    }
    return null;
}
/** 根据寻路结果读取下一步移动方向。 */
function findNextDirectionOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals);
    if (!result || result.points.length === 0) {
        return null;
    }
    return directionFromStep(startX, startY, result.points[0].x, result.points[0].y);
}
/** 返回从起点到目标组的完整路径坐标序列。 */
function findPathPointsOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {

    const result = findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals);
    return result?.points ?? null;
}
/** 根据前驱表反向回放并恢复路径点顺序。 */
function reconstructPathPoints(previous, goalIndex, startIndex, instance) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const path = [];

    let cursor = goalIndex;
    while (cursor !== -1 && cursor !== startIndex) {
        path.push({
            x: resolveInstanceTileX(instance, cursor),
            y: resolveInstanceTileY(instance, cursor),
        });
        cursor = previous[cursor];
    }
    path.reverse();
    return path;
}
/** 往小顶堆中插入路径节点。 */
function pushPathNode(heap, node) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    heap.push(node);

    let index = heap.length - 1;
    while (index > 0) {

        const parentIndex = Math.trunc((index - 1) / 2);
        if (comparePathNodePriority(heap[parentIndex], node) <= 0) {
            break;
        }
        heap[index] = heap[parentIndex];
        index = parentIndex;
    }
    heap[index] = node;
}
/** 弹出小顶堆中的最优路径节点。 */
function popPathNode(heap) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (heap.length === 0) {
        return null;
    }

    const root = heap[0];

    const last = heap.pop();
    if (!last || heap.length === 0) {
        return root;
    }

    let index = 0;
    while (true) {

        const left = index * 2 + 1;

        const right = left + 1;
        if (left >= heap.length) {
            break;
        }

        let smallest = left;
        if (right < heap.length && comparePathNodePriority(heap[right], heap[left]) < 0) {
            smallest = right;
        }
        if (comparePathNodePriority(heap[smallest], last) >= 0) {
            break;
        }
        heap[index] = heap[smallest];
        index = smallest;
    }
    heap[index] = last;
    return root;
}
/** 通过起点与终点坐标计算当前步的方向。 */
function directionFromStep(startX, startY, nextX, nextY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const step of PATH_DIRECTION_STEPS) {
        if (startX + step.x === nextX && startY + step.y === nextY) {
            return step.direction;
        }
    }
    return null;
}
function resolveInstanceTileX(instance, tileIndex) {
    if (typeof instance?.tilePlane?.getX === 'function') {
        return instance.tilePlane.getX(tileIndex);
    }
    return tileIndex % instance.template.width;
}
function resolveInstanceTileY(instance, tileIndex) {
    if (typeof instance?.tilePlane?.getY === 'function') {
        return instance.tilePlane.getY(tileIndex);
    }
    return Math.trunc(tileIndex / instance.template.width);
}
/** 按期望距离生成自动战斗移动目标点。 */
function buildAutoBattleGoalPoints(instance, targetX, targetY, range) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalizedRange = Math.max(1, Math.round(range));

    const goals = [];
    for (let y = targetY - normalizedRange; y <= targetY + normalizedRange; y += 1) {
        for (let x = targetX - normalizedRange; x <= targetX + normalizedRange; x += 1) {
            if (instance.isInBounds?.(x, y) !== true) {
                continue;
            }
            if (x === targetX && y === targetY) {
                continue;
            }

            const distance = chebyshevDistance(x, y, targetX, targetY);
            if (distance > normalizedRange) {
                continue;
            }
            goals.push({ x, y });
        }
    }
    goals.sort((left, right) => (Math.abs(chebyshevDistance(left.x, left.y, targetX, targetY) - normalizedRange)
        - Math.abs(chebyshevDistance(right.x, right.y, targetX, targetY) - normalizedRange)) || (chebyshevDistance(left.x, left.y, targetX, targetY) - chebyshevDistance(right.x, right.y, targetX, targetY)) || left.y - right.y || left.x - right.x);
    return goals;
}
/** 基于视图内可见格判断目标地块是否可见。 */
function isTileVisibleInView(view, x, y, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (view.self.x === x && view.self.y === y) {
        return true;
    }
    if (Array.isArray(view.visibleTileKeys) && view.visibleTileKeys.length > 0) {
        return view.visibleTileKeys.includes(`${x},${y}`);
    }
    if (Array.isArray(view.visibleTileIndices) && view.visibleTileIndices.length > 0) {

        const tileIndex = x >= 0 && y >= 0 && x < view.instance.width && y < view.instance.height
            ? y * view.instance.width + x
            : -1;
        return view.visibleTileIndices.includes(tileIndex);
    }
    return view.visiblePlayers.some((entry) => entry.x === x && entry.y === y)
        || view.localMonsters.some((entry) => entry.x === x && entry.y === y)
        || view.localNpcs.some((entry) => entry.x === x && entry.y === y)
        || view.localPortals.some((entry) => entry.x === x && entry.y === y)
        || view.localGroundPiles.some((entry) => entry.x === x && entry.y === y)
        || chebyshevDistance(view.self.x, view.self.y, x, y) <= radius;
}
exports.chebyshevDistance = chebyshevDistance;
exports.isInBounds = isInBounds;
exports.selectNearestPortal = selectNearestPortal;
exports.buildGoalPoints = buildGoalPoints;
exports.buildGoalPointsFromTemplate = buildGoalPointsFromTemplate;
exports.buildAdjacentGoalPoints = buildAdjacentGoalPoints;
exports.dedupeGoalPoints = dedupeGoalPoints;
exports.decodeClientPathHint = decodeClientPathHint;
exports.resolveInitialRunLength = resolveInitialRunLength;
exports.buildPathingBlockMask = buildPathingBlockMask;
exports.computePathCost = computePathCost;
exports.buildCoordKey = buildCoordKey;
exports.resolvePreferredClientPathHint = resolvePreferredClientPathHint;
exports.findOptimalPathOnMap = findOptimalPathOnMap;
exports.findPathToTargetWithinRangeOnMap = findPathToTargetWithinRangeOnMap;
exports.findNextDirectionOnMap = findNextDirectionOnMap;
exports.findPathPointsOnMap = findPathPointsOnMap;
exports.reconstructPathPoints = reconstructPathPoints;
exports.pushPathNode = pushPathNode;
exports.popPathNode = popPathNode;
exports.directionFromStep = directionFromStep;
exports.buildAutoBattleGoalPoints = buildAutoBattleGoalPoints;
exports.isTileVisibleInView = isTileVisibleInView;
exports.DIRECTION_OFFSET = DIRECTION_OFFSET;
export {
    chebyshevDistance,
    isInBounds,
    selectNearestPortal,
    buildGoalPoints,
    buildGoalPointsFromTemplate,
    buildAdjacentGoalPoints,
    dedupeGoalPoints,
    decodeClientPathHint,
    resolveInitialRunLength,
    buildPathingBlockMask,
    computePathCost,
    buildCoordKey,
    resolvePreferredClientPathHint,
    findOptimalPathOnMap,
    findPathToTargetWithinRangeOnMap,
    findNextDirectionOnMap,
    findPathPointsOnMap,
    reconstructPathPoints,
    pushPathNode,
    popPathNode,
    directionFromStep,
    buildAutoBattleGoalPoints,
    isTileVisibleInView,
    DIRECTION_OFFSET,
};
