"use strict";
/** 路径规划辅助：负责坐标判定、A* 寻路与移动方向计算。 */
Object.defineProperty(exports, "__esModule", { value: true });

const shared_1 = require("@mud/shared-next");

const map_template_repository_1 = require("../map/map-template.repository");

const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
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
function buildGoalPoints(instance, targetX, targetY, allowNearestReachable) {
    return buildGoalPointsFromTemplate(instance.template, targetX, targetY, allowNearestReachable);
}
/** 按地图模板从目标坐标推导可达目标点集合。 */
function buildGoalPointsFromTemplate(template, targetX, targetY, allowNearestReachable) {

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

    const goals = [];
    for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            continue;
        }

        const x = centerX + offset.x;

        const y = centerY + offset.y;
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

    const template = instance.template;

    const blocked = new Uint8Array(template.width * template.height);
    instance.forEachPathingBlocker(playerId, (x, y) => {
        blocked[(0, map_template_repository_1.getTileIndex)(x, y, template.width)] = 1;
    });
    if (allowOccupiedGoals) {
        for (const goal of goals) {
            if (!isInBounds(goal.x, goal.y, template.width, template.height)) {
                continue;
            }
            blocked[(0, map_template_repository_1.getTileIndex)(goal.x, goal.y, template.width)] = 0;
        }
    }
    return blocked;
}
/** 计算路径总可行走代价，无穷大表示路径不可达。 */
function computePathCost(instance, path) {

    let cost = 0;
    for (const point of path) {
        const stepCost = instance.getTileTraversalCost(point.x, point.y);
        if (!Number.isFinite(stepCost) || stepCost <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        cost += stepCost;
    }
    return cost;
}
/** 将坐标打包为稳定的字符串 key。 */
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/** 优先复用客户端路径Hint，在当前状态可接续时返回剩余坐标序列。 */
function resolvePreferredClientPathHint(instance, playerId, currentX, currentY, goals, clientPathHint) {
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

    const template = instance.template;

    const goalKeys = new Set(goals.map((goal) => buildCoordKey(goal.x, goal.y)));

    const lastPoint = points[points.length - 1];
    if (!goalKeys.has(buildCoordKey(lastPoint.x, lastPoint.y))) {
        return null;
    }

    const blocked = buildPathingBlockMask(instance, playerId, goals, true);

    let previousX = currentX;

    let previousY = currentY;
    for (const point of points) {
        if (!isInBounds(point.x, point.y, template.width, template.height)) {
            return null;
        }

        const deltaX = point.x - previousX;

        const deltaY = point.y - previousY;
        if (Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
            return null;
        }

        const tileIndex = (0, map_template_repository_1.getTileIndex)(point.x, point.y, template.width);
        if (template.walkableMask[tileIndex] !== 1 || blocked[tileIndex] === 1) {
            return null;
        }

        const stepCost = instance.getTileTraversalCost(point.x, point.y);
        if (!Number.isFinite(stepCost) || stepCost <= 0) {
            return null;
        }
        previousX = point.x;
        previousY = point.y;
    }
    return {
        points,
        cost: computePathCost(instance, points),
    };
}
/** 在地图内执行寻路，返回最小代价路径。 */
function findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
    if (goals.length === 0) {
        return null;
    }

    const template = instance.template;

    const goalIndices = new Set();
    for (const goal of goals) {
        if (!isInBounds(goal.x, goal.y, template.width, template.height)) {
            continue;
        }
        goalIndices.add((0, map_template_repository_1.getTileIndex)(goal.x, goal.y, template.width));
    }
    if (goalIndices.size === 0) {
        return null;
    }

    const blocked = buildPathingBlockMask(instance, playerId, goals, allowOccupiedGoals);

    const size = template.width * template.height;

    const bestCost = new Float64Array(size);
    bestCost.fill(Number.POSITIVE_INFINITY);

    const previous = new Int32Array(size);
    previous.fill(-1);

    const heap = [];

    const startIndex = (0, map_template_repository_1.getTileIndex)(startX, startY, template.width);
    bestCost[startIndex] = 0;
    pushPathNode(heap, { index: startIndex, cost: 0 });
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
                points: reconstructPathPoints(previous, current, startIndex, template.width),
                cost: currentNode.cost,
            };
        }

        const x = current % template.width;

        const y = Math.trunc(current / template.width);
        for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
            const offset = DIRECTION_OFFSET[direction];
            if (!offset) {
                continue;
            }

            const nextX = x + offset.x;

            const nextY = y + offset.y;
            if (!isInBounds(nextX, nextY, template.width, template.height)) {
                continue;
            }

            const nextIndex = (0, map_template_repository_1.getTileIndex)(nextX, nextY, template.width);
            if (template.walkableMask[nextIndex] !== 1 || blocked[nextIndex] === 1) {
                continue;
            }

            const stepCost = instance.getTileTraversalCost(nextX, nextY);
            if (!Number.isFinite(stepCost) || stepCost <= 0) {
                continue;
            }

            const nextCost = currentNode.cost + stepCost;
            if (nextCost >= bestCost[nextIndex]) {
                continue;
            }
            bestCost[nextIndex] = nextCost;
            previous[nextIndex] = current;
            pushPathNode(heap, { index: nextIndex, cost: nextCost });
        }
    }
    return null;
}
/** 根据寻路结果读取下一步移动方向。 */
function findNextDirectionOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {

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
function reconstructPathPoints(previous, goalIndex, startIndex, width) {

    const path = [];

    let cursor = goalIndex;
    while (cursor !== -1 && cursor !== startIndex) {
        path.push({
            x: cursor % width,
            y: Math.trunc(cursor / width),
        });
        cursor = previous[cursor];
    }
    path.reverse();
    return path;
}
/** 往小顶堆中插入路径节点。 */
function pushPathNode(heap, node) {
    heap.push(node);

    let index = heap.length - 1;
    while (index > 0) {

        const parentIndex = Math.trunc((index - 1) / 2);
        if (heap[parentIndex].cost <= node.cost) {
            break;
        }
        heap[index] = heap[parentIndex];
        index = parentIndex;
    }
    heap[index] = node;
}
/** 弹出小顶堆中的最优路径节点。 */
function popPathNode(heap) {
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
        if (right < heap.length && heap[right].cost < heap[left].cost) {
            smallest = right;
        }
        if (heap[smallest].cost >= last.cost) {
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
    for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            continue;
        }
        if (startX + offset.x === nextX && startY + offset.y === nextY) {
            return direction;
        }
    }
    return null;
}
/** 按期望距离生成自动战斗移动目标点。 */
function buildAutoBattleGoalPoints(instance, targetX, targetY, range) {

    const normalizedRange = Math.max(1, Math.round(range));

    const goals = [];
    for (let y = targetY - normalizedRange; y <= targetY + normalizedRange; y += 1) {
        for (let x = targetX - normalizedRange; x <= targetX + normalizedRange; x += 1) {
            if (!isInBounds(x, y, instance.template.width, instance.template.height)) {
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
    if (view.self.x === x && view.self.y === y) {
        return true;
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
exports.findNextDirectionOnMap = findNextDirectionOnMap;
exports.findPathPointsOnMap = findPathPointsOnMap;
exports.reconstructPathPoints = reconstructPathPoints;
exports.pushPathNode = pushPathNode;
exports.popPathNode = popPathNode;
exports.directionFromStep = directionFromStep;
exports.buildAutoBattleGoalPoints = buildAutoBattleGoalPoints;
exports.isTileVisibleInView = isTileVisibleInView;
exports.DIRECTION_OFFSET = DIRECTION_OFFSET;


