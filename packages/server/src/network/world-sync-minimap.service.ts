/**
 * Minimap 同步服务。
 * 负责 minimap marker 的构造、缓存、视野过滤与增量 diff 下发。
 */

import { Inject, Injectable } from '@nestjs/common';
import { composeTileTypeFromLayers, getMapCharFromTileType } from '@mud/shared';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

/** minimap 冷路径同步服务：负责 marker cache、构造、过滤与 diff。 */
@Injectable()
export class WorldSyncMinimapService {
    /** 地图级 minimap marker 缓存。 */
    minimapMarkersByMapId = new Map();

    private readonly mapTemplateRepository: MapTemplateRepository | null;

    constructor(
        @Inject(MapTemplateRepository) mapTemplateRepository?: MapTemplateRepository,
    ) {
        this.mapTemplateRepository = mapTemplateRepository ?? null;
    }

    /** 构造 minimap 静态快照。 */
    buildMinimapSnapshotSync(template) {
        return {
            width: template.width,
            height: template.height,
            terrainRows: buildLegacyTileRows(template),
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
        const resolveMapName = (mapId: string): string => {
            if (this.mapTemplateRepository?.has(mapId)) {
                return this.mapTemplateRepository.getOrThrow(mapId).name;
            }
            return mapId;
        };
        const markers = buildMinimapMarkers(template, resolveMapName);
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

function buildLegacyTileRows(template) {
    if (!hasTemplateLayerRows(template)
        && !Array.isArray(template?.surfaceRows)
        && !Array.isArray(template?.structureRows)
        && !Array.isArray(template?.interactableRows)) {
        return Array.isArray(template?.legacyTileRows) ? template.legacyTileRows.slice() : Array.isArray(template?.terrainRows) ? template.terrainRows.slice() : [];
    }
    const rows = [];
    const width = Math.max(0, Math.trunc(Number(template.width) || 0));
    const height = Math.max(0, Math.trunc(Number(template.height) || 0));
    for (let y = 0; y < height; y += 1) {
        let row = '';
        for (let x = 0; x < width; x += 1) {
            row += getMapCharFromTileType(composeTileTypeFromLayers(
                template.terrainRows?.[y]?.[x],
                template.surfaceRows?.[y]?.[x] ?? null,
                template.structureRows?.[y]?.[x] ?? null,
                template.interactableRows?.[y]?.[x] ?? [],
            ));
        }
        rows.push(row);
    }
    return rows;
}

function hasTemplateLayerRows(template) {
    return Array.isArray(template?.terrainRows?.[0]);
}
/**
 * buildMinimapMarkers：构建并返回目标对象。
 * @param template 参数说明。
 * @returns 无返回值，直接更新MinimapMarker相关状态。
 */

function buildMinimapMarkers(template, resolveMapName: (mapId: string) => string) {
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
            detail: resolveMapName(portal.targetMapId),
        });
    }
    markers.sort((left, right) => left.y - right.y || left.x - right.x || compareStableStrings(left.id, right.id));
    return markers;
}
/**
 * buildVisibleMinimapMarkers：构建并返回目标对象。
 * @param markers 参数说明。
 * @param visibleTiles 参数说明。
 * @returns 无返回值，直接更新可见MinimapMarker相关状态。
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
        visible.push(marker);
    }
    return visible;
}
/**
 * diffVisibleMinimapMarkers：判断diff可见MinimapMarker是否满足条件。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，直接更新diff可见MinimapMarker相关状态。
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
            adds.push(marker);
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
 * isSameMinimapMarker：判断SameMinimapMarker是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameMinimapMarker的条件判断。
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
 * @returns 无返回值，直接更新CoordKey相关状态。
 */

function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/**
 * compareStableStrings：执行compareStableString相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareStableString相关状态。
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
