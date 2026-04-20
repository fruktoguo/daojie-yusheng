// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncMinimapService = void 0;

const common_1 = require("@nestjs/common");

/** minimap 冷路径同步服务：负责 marker cache、构造、过滤与 diff。 */
let WorldSyncMinimapService = class WorldSyncMinimapService {
    /** 地图级 minimap marker 缓存。 */
    minimapMarkersByMapId = new Map();
    /** 构造 minimap 静态快照。 */
    buildMinimapSnapshotSync(template) {
        return {
            width: template.width,
            height: template.height,
            terrainRows: template.terrainRows.slice(),
            markers: this.buildMinimapMarkers(template),
        };
    }
    /** 返回地图级 minimap markers，并复用缓存。 */
    buildMinimapMarkers(template) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const cached = this.minimapMarkersByMapId.get(template.id);
        if (cached) {
            return cached;
        }
        const markers = buildMinimapMarkers(template);
        this.minimapMarkersByMapId.set(template.id, markers);
        return markers;
    }
    /** 过滤当前视野内可见的 minimap markers。 */
    buildVisibleMinimapMarkers(markers, visibleTiles) {
        return buildVisibleMinimapMarkers(markers, visibleTiles);
    }
    /** 比较前后视野下的 minimap marker patch。 */
    diffVisibleMinimapMarkers(previous, current) {
        return diffVisibleMinimapMarkers(previous, current);
    }
};
exports.WorldSyncMinimapService = WorldSyncMinimapService;
exports.WorldSyncMinimapService = WorldSyncMinimapService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncMinimapService);
/**
 * buildMinimapMarkers：构建并返回目标对象。
 * @param template 参数说明。
 * @returns 函数返回值。
 */

function buildMinimapMarkers(template) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const markers = [];
    for (const landmark of template.landmarks) {
        markers.push({
            id: `landmark:${landmark.id}`,
            kind: 'landmark',
            x: landmark.x,
            y: landmark.y,
            label: landmark.name,
            detail: landmark.desc,
        });
    }
    for (const container of template.containers) {
        markers.push({
            id: `container:${container.id}`,
            kind: 'container',
            x: container.x,
            y: container.y,
            label: container.name,
            detail: container.desc?.trim() || '可搜索容器',
        });
    }
    for (const npc of template.npcs) {
        markers.push({
            id: `npc:${npc.id}`,
            kind: 'npc',
            x: npc.x,
            y: npc.y,
            label: npc.name,
        });
    }
    for (const portal of template.portals) {
        if (portal.hidden) {
            continue;
        }
        markers.push({
            id: `${portal.kind}:${portal.x},${portal.y}`,
            kind: portal.kind,
            x: portal.x,
            y: portal.y,
            label: portal.kind === 'stairs' ? '楼梯' : '传送点',
            detail: portal.targetMapId,
        });
    }
    markers.sort((left, right) => left.y - right.y || left.x - right.x || compareStableStrings(left.id, right.id));
    return markers;
}
/**
 * buildVisibleMinimapMarkers：构建并返回目标对象。
 * @param markers 参数说明。
 * @param visibleTiles 参数说明。
 * @returns 函数返回值。
 */

function buildVisibleMinimapMarkers(markers, visibleTiles) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (markers.length === 0 || visibleTiles.size === 0) {
        return [];
    }

    const visible = [];
    for (const marker of markers) {
        if (!visibleTiles.has(buildCoordKey(marker.x, marker.y))) {
            continue;
        }
        visible.push(cloneMinimapMarker(marker));
    }
    return visible;
}
/**
 * diffVisibleMinimapMarkers：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffVisibleMinimapMarkers(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const previousById = new Map(previous.map((entry) => [entry.id, entry]));

    const currentById = new Map(current.map((entry) => [entry.id, entry]));

    const adds = [];

    const removes = [];
    for (const [markerId, marker] of currentById.entries()) {
        const previousMarker = previousById.get(markerId);
        if (!previousMarker || !isSameMinimapMarker(previousMarker, marker)) {
            adds.push(cloneMinimapMarker(marker));
        }
    }
    for (const markerId of previousById.keys()) {
        if (!currentById.has(markerId)) {
            removes.push(markerId);
        }
    }
    return {
        adds,
        removes,
    };
}
/**
 * cloneMinimapMarker：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneMinimapMarker(source) {
    return {
        id: source.id,
        kind: source.kind,
        x: source.x,
        y: source.y,
        label: source.label,
        detail: source.detail,
    };
}
/**
 * isSameMinimapMarker：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameMinimapMarker(left, right) {
    return left.id === right.id
        && left.kind === right.kind
        && left.x === right.x
        && left.y === right.y
        && left.label === right.label
        && left.detail === right.detail;
}
/**
 * buildCoordKey：构建并返回目标对象。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/**
 * compareStableStrings：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function compareStableStrings(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

export { WorldSyncMinimapService };
