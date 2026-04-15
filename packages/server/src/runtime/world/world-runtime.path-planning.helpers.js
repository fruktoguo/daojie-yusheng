"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../map/map-template.repository");
/** DIRECTION_OFFSET：定义该变量以承载业务值。 */
const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
/** chebyshevDistance：执行对应的业务逻辑。 */
function chebyshevDistance(leftX, leftY, rightX, rightY) {
    return Math.max(Math.abs(leftX - rightX), Math.abs(leftY - rightY));
}
/** isInBounds：执行对应的业务逻辑。 */
function isInBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x < width && y < height;
}
/** selectNearestPortal：执行对应的业务逻辑。 */
function selectNearestPortal(portals, targetMapId, fromX, fromY) {
/** best：定义该变量以承载业务值。 */
    let best = null;
/** bestDistance：定义该变量以承载业务值。 */
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const portal of portals) {
        if (portal.targetMapId !== targetMapId) {
            continue;
        }
/** distance：定义该变量以承载业务值。 */
        const distance = Math.abs(portal.x - fromX) + Math.abs(portal.y - fromY);
        if (distance < bestDistance) {
            best = portal;
            bestDistance = distance;
        }
    }
    return best;
}
/** buildGoalPoints：执行对应的业务逻辑。 */
function buildGoalPoints(instance, targetX, targetY, allowNearestReachable) {
    return buildGoalPointsFromTemplate(instance.template, targetX, targetY, allowNearestReachable);
}
/** buildGoalPointsFromTemplate：执行对应的业务逻辑。 */
function buildGoalPointsFromTemplate(template, targetX, targetY, allowNearestReachable) {
/** goals：定义该变量以承载业务值。 */
    const goals = [];
    if (isInBounds(targetX, targetY, template.width, template.height)) {
/** tileIndex：定义该变量以承载业务值。 */
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
/** tileIndex：定义该变量以承载业务值。 */
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
/** buildAdjacentGoalPoints：执行对应的业务逻辑。 */
function buildAdjacentGoalPoints(template, centerX, centerY) {
/** goals：定义该变量以承载业务值。 */
    const goals = [];
    for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            continue;
        }
/** x：定义该变量以承载业务值。 */
        const x = centerX + offset.x;
/** y：定义该变量以承载业务值。 */
        const y = centerY + offset.y;
        if (!isInBounds(x, y, template.width, template.height)) {
            continue;
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
        if (template.walkableMask[tileIndex] !== 1) {
            continue;
        }
        goals.push({ x, y });
    }
    return dedupeGoalPoints(goals);
}
/** dedupeGoalPoints：执行对应的业务逻辑。 */
function dedupeGoalPoints(goals) {
/** result：定义该变量以承载业务值。 */
    const result = [];
/** seen：定义该变量以承载业务值。 */
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
/** decodeClientPathHint：执行对应的业务逻辑。 */
function decodeClientPathHint(packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput) {
/** packedPath：定义该变量以承载业务值。 */
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
/** startX：定义该变量以承载业务值。 */
    const startX = Math.trunc(Number(pathStartXInput));
/** startY：定义该变量以承载业务值。 */
    const startY = Math.trunc(Number(pathStartYInput));
/** directions：定义该变量以承载业务值。 */
    const directions = (0, shared_1.unpackDirections)(packedPath, Math.trunc(Number(packedPathStepsInput)));
    if (!directions || directions.length === 0) {
        return null;
    }
/** points：定义该变量以承载业务值。 */
    const points = [];
/** currentX：定义该变量以承载业务值。 */
    let currentX = startX;
/** currentY：定义该变量以承载业务值。 */
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
/** resolveInitialRunLength：执行对应的业务逻辑。 */
function resolveInitialRunLength(path, startX, startY, direction) {
    if (!Array.isArray(path) || path.length === 0) {
        return 1;
    }
/** offset：定义该变量以承载业务值。 */
    const offset = DIRECTION_OFFSET[direction];
    if (!offset) {
        return 1;
    }
/** previousX：定义该变量以承载业务值。 */
    let previousX = startX;
/** previousY：定义该变量以承载业务值。 */
    let previousY = startY;
/** length：定义该变量以承载业务值。 */
    let length = 0;
    for (const step of path) {
        if (!step || typeof step.x !== 'number' || typeof step.y !== 'number') {
            break;
        }
/** deltaX：定义该变量以承载业务值。 */
        const deltaX = step.x - previousX;
/** deltaY：定义该变量以承载业务值。 */
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
/** buildPathingBlockMask：执行对应的业务逻辑。 */
function buildPathingBlockMask(instance, playerId, goals, allowOccupiedGoals = true) {
/** template：定义该变量以承载业务值。 */
    const template = instance.template;
/** blocked：定义该变量以承载业务值。 */
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
/** computePathCost：执行对应的业务逻辑。 */
function computePathCost(instance, path) {
/** cost：定义该变量以承载业务值。 */
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
/** buildCoordKey：执行对应的业务逻辑。 */
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/** resolvePreferredClientPathHint：执行对应的业务逻辑。 */
function resolvePreferredClientPathHint(instance, playerId, currentX, currentY, goals, clientPathHint) {
    if (!clientPathHint || !Array.isArray(clientPathHint.points) || clientPathHint.points.length === 0) {
        return null;
    }
/** points：定义该变量以承载业务值。 */
    let points = clientPathHint.points;
    if (clientPathHint.startX === currentX && clientPathHint.startY === currentY) {
        points = clientPathHint.points.slice();
    }
    else {
/** currentIndex：定义该变量以承载业务值。 */
        const currentIndex = clientPathHint.points.findIndex((point) => point.x === currentX && point.y === currentY);
        if (currentIndex < 0) {
            return null;
        }
        points = clientPathHint.points.slice(currentIndex + 1);
    }
    if (points.length === 0) {
        return null;
    }
/** template：定义该变量以承载业务值。 */
    const template = instance.template;
/** goalKeys：定义该变量以承载业务值。 */
    const goalKeys = new Set(goals.map((goal) => buildCoordKey(goal.x, goal.y)));
/** lastPoint：定义该变量以承载业务值。 */
    const lastPoint = points[points.length - 1];
    if (!goalKeys.has(buildCoordKey(lastPoint.x, lastPoint.y))) {
        return null;
    }
/** blocked：定义该变量以承载业务值。 */
    const blocked = buildPathingBlockMask(instance, playerId, goals, true);
/** previousX：定义该变量以承载业务值。 */
    let previousX = currentX;
/** previousY：定义该变量以承载业务值。 */
    let previousY = currentY;
    for (const point of points) {
        if (!isInBounds(point.x, point.y, template.width, template.height)) {
            return null;
        }
/** deltaX：定义该变量以承载业务值。 */
        const deltaX = point.x - previousX;
/** deltaY：定义该变量以承载业务值。 */
        const deltaY = point.y - previousY;
        if (Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
            return null;
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = (0, map_template_repository_1.getTileIndex)(point.x, point.y, template.width);
        if (template.walkableMask[tileIndex] !== 1 || blocked[tileIndex] === 1) {
            return null;
        }
/** stepCost：定义该变量以承载业务值。 */
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
/** findOptimalPathOnMap：执行对应的业务逻辑。 */
function findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
    if (goals.length === 0) {
        return null;
    }
/** template：定义该变量以承载业务值。 */
    const template = instance.template;
/** goalIndices：定义该变量以承载业务值。 */
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
/** blocked：定义该变量以承载业务值。 */
    const blocked = buildPathingBlockMask(instance, playerId, goals, allowOccupiedGoals);
/** size：定义该变量以承载业务值。 */
    const size = template.width * template.height;
/** bestCost：定义该变量以承载业务值。 */
    const bestCost = new Float64Array(size);
    bestCost.fill(Number.POSITIVE_INFINITY);
/** previous：定义该变量以承载业务值。 */
    const previous = new Int32Array(size);
    previous.fill(-1);
/** heap：定义该变量以承载业务值。 */
    const heap = [];
/** startIndex：定义该变量以承载业务值。 */
    const startIndex = (0, map_template_repository_1.getTileIndex)(startX, startY, template.width);
    bestCost[startIndex] = 0;
    pushPathNode(heap, { index: startIndex, cost: 0 });
    while (heap.length > 0) {
/** currentNode：定义该变量以承载业务值。 */
        const currentNode = popPathNode(heap);
        if (!currentNode) {
            break;
        }
/** current：定义该变量以承载业务值。 */
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
/** x：定义该变量以承载业务值。 */
        const x = current % template.width;
/** y：定义该变量以承载业务值。 */
        const y = Math.trunc(current / template.width);
        for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
            const offset = DIRECTION_OFFSET[direction];
            if (!offset) {
                continue;
            }
/** nextX：定义该变量以承载业务值。 */
            const nextX = x + offset.x;
/** nextY：定义该变量以承载业务值。 */
            const nextY = y + offset.y;
            if (!isInBounds(nextX, nextY, template.width, template.height)) {
                continue;
            }
/** nextIndex：定义该变量以承载业务值。 */
            const nextIndex = (0, map_template_repository_1.getTileIndex)(nextX, nextY, template.width);
            if (template.walkableMask[nextIndex] !== 1 || blocked[nextIndex] === 1) {
                continue;
            }
/** stepCost：定义该变量以承载业务值。 */
            const stepCost = instance.getTileTraversalCost(nextX, nextY);
            if (!Number.isFinite(stepCost) || stepCost <= 0) {
                continue;
            }
/** nextCost：定义该变量以承载业务值。 */
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
/** findNextDirectionOnMap：执行对应的业务逻辑。 */
function findNextDirectionOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
/** result：定义该变量以承载业务值。 */
    const result = findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals);
    if (!result || result.points.length === 0) {
        return null;
    }
    return directionFromStep(startX, startY, result.points[0].x, result.points[0].y);
}
/** findPathPointsOnMap：执行对应的业务逻辑。 */
function findPathPointsOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
/** result：定义该变量以承载业务值。 */
    const result = findOptimalPathOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals);
    return result?.points ?? null;
}
/** reconstructPathPoints：执行对应的业务逻辑。 */
function reconstructPathPoints(previous, goalIndex, startIndex, width) {
/** path：定义该变量以承载业务值。 */
    const path = [];
/** cursor：定义该变量以承载业务值。 */
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
/** pushPathNode：执行对应的业务逻辑。 */
function pushPathNode(heap, node) {
    heap.push(node);
/** index：定义该变量以承载业务值。 */
    let index = heap.length - 1;
    while (index > 0) {
/** parentIndex：定义该变量以承载业务值。 */
        const parentIndex = Math.trunc((index - 1) / 2);
        if (heap[parentIndex].cost <= node.cost) {
            break;
        }
        heap[index] = heap[parentIndex];
        index = parentIndex;
    }
    heap[index] = node;
}
/** popPathNode：执行对应的业务逻辑。 */
function popPathNode(heap) {
    if (heap.length === 0) {
        return null;
    }
/** root：定义该变量以承载业务值。 */
    const root = heap[0];
/** last：定义该变量以承载业务值。 */
    const last = heap.pop();
    if (!last || heap.length === 0) {
        return root;
    }
/** index：定义该变量以承载业务值。 */
    let index = 0;
    while (true) {
/** left：定义该变量以承载业务值。 */
        const left = index * 2 + 1;
/** right：定义该变量以承载业务值。 */
        const right = left + 1;
        if (left >= heap.length) {
            break;
        }
/** smallest：定义该变量以承载业务值。 */
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
/** directionFromStep：执行对应的业务逻辑。 */
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
/** buildAutoBattleGoalPoints：执行对应的业务逻辑。 */
function buildAutoBattleGoalPoints(instance, targetX, targetY, range) {
/** normalizedRange：定义该变量以承载业务值。 */
    const normalizedRange = Math.max(1, Math.round(range));
/** goals：定义该变量以承载业务值。 */
    const goals = [];
    for (let y = targetY - normalizedRange; y <= targetY + normalizedRange; y += 1) {
        for (let x = targetX - normalizedRange; x <= targetX + normalizedRange; x += 1) {
            if (!isInBounds(x, y, instance.template.width, instance.template.height)) {
                continue;
            }
            if (x === targetX && y === targetY) {
                continue;
            }
/** distance：定义该变量以承载业务值。 */
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
/** isTileVisibleInView：执行对应的业务逻辑。 */
function isTileVisibleInView(view, x, y, radius) {
    if (view.self.x === x && view.self.y === y) {
        return true;
    }
    if (Array.isArray(view.visibleTileIndices) && view.visibleTileIndices.length > 0) {
/** tileIndex：定义该变量以承载业务值。 */
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
