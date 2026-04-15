/**
 * AOI（Area of Interest）视野服务：基于 Shadowcasting 算法计算玩家可见区域
 */
import { Injectable } from '@nestjs/common';
import { isOffsetInRange, PlayerState, VIEW_RADIUS, VisibleTile } from '@mud/shared';
import { MapService } from './map.service';

/** 视野快照：可见坐标集合与对应地块数据 */
export interface VisibilitySnapshot {
/** visibleKeys：定义该变量以承载业务值。 */
  visibleKeys: Set<string>;
/** tiles：定义该变量以承载业务值。 */
  tiles: VisibleTile[][];
}

/** VisibilityCacheEntry：定义该接口的能力与字段约束。 */
interface VisibilityCacheEntry {
/** key：定义该变量以承载业务值。 */
  key: string;
/** visibleKeys：定义该变量以承载业务值。 */
  visibleKeys: Set<string>;
}

@Injectable()
/** AoiService：封装相关状态与行为。 */
export class AoiService {
  private readonly visibilityCache = new Map<string, VisibilityCacheEntry>();

/** 构造函数：执行实例初始化流程。 */
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
/** range：定义该变量以承载业务值。 */
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
/** range：定义该变量以承载业务值。 */
    const range = rangeOverride ?? player.viewRange ?? VIEW_RADIUS;
/** visibleKeys：定义该变量以承载业务值。 */
    const visibleKeys = this.getVisibleKeys(player, range);
/** tiles：定义该变量以承载业务值。 */
    const tiles = this.mapService.getViewTiles(player.mapId, player.x, player.y, range, visibleKeys);
    return { visibleKeys, tiles };
  }

  /** 获取玩家视野内所有可见坐标 key 集合 */
  getVisibleKeys(player: PlayerState, rangeOverride?: number): Set<string> {
/** range：定义该变量以承载业务值。 */
    const range = rangeOverride ?? player.viewRange ?? VIEW_RADIUS;
    return this.getVisibleKeysAt(player.mapId, player.x, player.y, range, player.id);
  }

  /** 计算指定位置的可见坐标集合（带缓存） */
  getVisibleKeysAt(mapId: string, originX: number, originY: number, range: number, cacheId: string): Set<string> {
/** cacheKey：定义该变量以承载业务值。 */
    const cacheKey = this.buildCacheKey(mapId, originX, originY, range);
/** cached：定义该变量以承载业务值。 */
    const cached = this.visibilityCache.get(cacheId);
    if (cached?.key === cacheKey) {
      return cached.visibleKeys;
    }

/** visibleKeys：定义该变量以承载业务值。 */
    const visibleKeys = new Set<string>();
/** cx：定义该变量以承载业务值。 */
    const cx = originX;
/** cy：定义该变量以承载业务值。 */
    const cy = originY;
    visibleKeys.add(`${cx},${cy}`);

/** octants：定义该变量以承载业务值。 */
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

/** buildCacheKey：执行对应的业务逻辑。 */
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

/** nextStartSlope：定义该变量以承载业务值。 */
    let nextStartSlope = startSlope;
    for (let distance = row; distance <= radius; distance++) {
      let blocked = false;

      for (let deltaX = -distance, deltaY = -distance; deltaX <= 0; deltaX++) {
        const currentX = cx + deltaX * xx + deltaY * xy;
        const currentY = cy + deltaX * yx + deltaY * yy;
/** leftSlope：定义该变量以承载业务值。 */
        const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
/** rightSlope：定义该变量以承载业务值。 */
        const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);

        if (startSlope < rightSlope) continue;
        if (endSlope > leftSlope) break;

        if (isOffsetInRange(deltaX, deltaY, radius)) {
          visibleKeys.add(`${currentX},${currentY}`);
        }

/** blocksSight：定义该变量以承载业务值。 */
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

