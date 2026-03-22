/**
 * AOI（Area of Interest）视野服务：基于 Shadowcasting 算法计算玩家可见区域
 */
import { Injectable } from '@nestjs/common';
import { PlayerState, VIEW_RADIUS, VisibleTile } from '@mud/shared';
import { MapService } from './map.service';

/** 视野快照：可见坐标集合与对应地块数据 */
export interface VisibilitySnapshot {
  visibleKeys: Set<string>;
  tiles: VisibleTile[][];
}

interface VisibilityCacheEntry {
  key: string;
  visibleKeys: Set<string>;
}

@Injectable()
export class AoiService {
  private readonly visibilityCache = new Map<string, VisibilityCacheEntry>();

  constructor(private readonly mapService: MapService) {}

  /** 判断目标坐标是否在玩家视野内 */
  inView(player: PlayerState, x: number, y: number, rangeOverride?: number): boolean {
    return this.getVisibleKeys(player, rangeOverride).has(`${x},${y}`);
  }

  /** 判断指定坐标是否在某位置的视野内（带缓存） */
  inViewAt(mapId: string, originX: number, originY: number, range: number, x: number, y: number, cacheId: string): boolean {
    return this.getVisibleKeysAt(mapId, originX, originY, range, cacheId).has(`${x},${y}`);
  }

  /** 获取玩家视野范围 */
  getViewport(player: PlayerState, rangeOverride?: number) {
    const range = rangeOverride ?? player.viewRange ?? VIEW_RADIUS;
    return {
      x: player.x - range,
      y: player.y - range,
      width: range * 2 + 1,
      height: range * 2 + 1,
    };
  }

  /** 获取玩家视野快照（可见坐标集 + 地块数据） */
  getVisibility(player: PlayerState, rangeOverride?: number): VisibilitySnapshot {
    const range = rangeOverride ?? player.viewRange ?? VIEW_RADIUS;
    const visibleKeys = this.getVisibleKeys(player, range);
    const tiles = this.mapService.getViewTiles(player.mapId, player.x, player.y, range, visibleKeys);
    return { visibleKeys, tiles };
  }

  /** 获取玩家视野内所有可见坐标 key 集合 */
  getVisibleKeys(player: PlayerState, rangeOverride?: number): Set<string> {
    const range = rangeOverride ?? player.viewRange ?? VIEW_RADIUS;
    return this.getVisibleKeysAt(player.mapId, player.x, player.y, range, player.id);
  }

  /** 计算指定位置的可见坐标集合（带缓存） */
  getVisibleKeysAt(mapId: string, originX: number, originY: number, range: number, cacheId: string): Set<string> {
    const cacheKey = this.buildCacheKey(mapId, originX, originY, range);
    const cached = this.visibilityCache.get(cacheId);
    if (cached?.key === cacheKey) {
      return cached.visibleKeys;
    }

    const visibleKeys = new Set<string>();
    const cx = originX;
    const cy = originY;
    visibleKeys.add(`${cx},${cy}`);

    const octants: Array<[number, number, number, number]> = [
      [1, 0, 0, 1],
      [0, 1, 1, 0],
      [0, -1, 1, 0],
      [-1, 0, 0, 1],
      [-1, 0, 0, -1],
      [0, -1, -1, 0],
      [0, 1, -1, 0],
      [1, 0, 0, -1],
    ];

    for (const [xx, xy, yx, yy] of octants) {
      this.castLight(mapId, cx, cy, 1, 1.0, 0.0, range, xx, xy, yx, yy, visibleKeys);
    }

    this.visibilityCache.set(cacheId, { key: cacheKey, visibleKeys });
    return visibleKeys;
  }

  private buildCacheKey(mapId: string, x: number, y: number, range: number): string {
    return [
      mapId,
      this.mapService.getVisibilityRevision(mapId),
      x,
      y,
      range,
    ].join(':');
  }

  /** Recursive Shadowcasting：递归计算单个八分区的可见格子 */
  private castLight(
    mapId: string,
    cx: number,
    cy: number,
    row: number,
    startSlope: number,
    endSlope: number,
    radius: number,
    xx: number,
    xy: number,
    yx: number,
    yy: number,
    visibleKeys: Set<string>,
  ) {
    if (startSlope < endSlope) return;

    let nextStartSlope = startSlope;
    for (let distance = row; distance <= radius; distance++) {
      let blocked = false;

      for (let deltaX = -distance, deltaY = -distance; deltaX <= 0; deltaX++) {
        const currentX = cx + deltaX * xx + deltaY * xy;
        const currentY = cy + deltaX * yx + deltaY * yy;
        const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
        const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);

        if (startSlope < rightSlope) continue;
        if (endSlope > leftSlope) break;

        const distanceSq = deltaX * deltaX + deltaY * deltaY;
        if (distanceSq <= radius * radius) {
          visibleKeys.add(`${currentX},${currentY}`);
        }

        const blocksSight = this.mapService.blocksSight(mapId, currentX, currentY);
        if (blocked) {
          if (blocksSight) {
            nextStartSlope = rightSlope;
            continue;
          }
          blocked = false;
          startSlope = nextStartSlope;
          continue;
        }

        if (blocksSight && distance < radius) {
          blocked = true;
          this.castLight(mapId, cx, cy, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, visibleKeys);
          nextStartSlope = rightSlope;
        }
      }

      if (blocked) break;
    }
  }
}
