/**
 * 无限世界 demo：块缓存 + 世界坐标 tileAt。
 *
 * 玩家周围的块按需生成并缓存，远离相机的块按距离淘汰——这就是「玩家周围才生成、
 * 不一开始维护整张图」。tileAt(worldX,worldY) 统一从缓存取格（缺块即生成），
 * 渲染与 dual-grid 融合都走它，故跨块读邻格天然自洽、无缝。
 */
import { generateChunk, type InfiniteWorldSpec, type WorldChunk } from '../../../packages/shared/src/procgen/procgen-chunk';
import { composeTileTypeFromLayers } from '../../../packages/shared/src/map-layer-types';
import type { StructureType, SurfaceType, TerrainType } from '../../../packages/shared/src/map-layer-types';
import { doesTileTypeBlockSight, isTileTypeWalkable } from '../../../packages/shared/src/terrain';
import type { Tile } from '../../../packages/shared/src/world-core-types';

interface CachedChunk {
  chunk: WorldChunk;
  tiles: Tile[];
  lastUsed: number;
}

/** 把一块的三层平行数组转成逐格 Tile（drawTile 与 dual-grid 的 tileAt 共用同一份对象引用）。 */
function buildChunkTiles(chunk: WorldChunk): Tile[] {
  const n = chunk.size * chunk.size;
  const tiles = new Array<Tile>(n);
  for (let i = 0; i < n; i += 1) {
    const terrainType = chunk.terrainIds[i] as TerrainType;
    const surfaceType = chunk.surfaceIds[i] as SurfaceType | null;
    const structureType = chunk.structureIds[i] as StructureType | null;
    const type = composeTileTypeFromLayers(terrainType, surfaceType, structureType, []);
    tiles[i] = {
      type,
      walkable: isTileTypeWalkable(type),
      blocksSight: doesTileTypeBlockSight(type),
      aura: 0,
      occupiedBy: null,
      modifiedAt: null,
      terrainType,
      surfaceType,
      structureType,
      interactableKinds: [],
    };
  }
  return tiles;
}

export class InfiniteWorld {
  private readonly cache = new Map<string, CachedChunk>();
  private frame = 0;

  constructor(private spec: InfiniteWorldSpec) {}

  get chunkSize(): number {
    return this.spec.chunkSize;
  }

  get loadedChunks(): number {
    return this.cache.size;
  }

  /** 换 seed / 参数：清空缓存重来。 */
  reset(spec: InfiniteWorldSpec): void {
    this.spec = spec;
    this.cache.clear();
  }

  beginFrame(): void {
    this.frame += 1;
  }

  private chunkAt(cx: number, cy: number): CachedChunk {
    const key = `${cx},${cy}`;
    let entry = this.cache.get(key);
    if (!entry) {
      const chunk = generateChunk(this.spec, cx, cy);
      entry = { chunk, tiles: buildChunkTiles(chunk), lastUsed: this.frame };
      this.cache.set(key, entry);
    } else {
      entry.lastUsed = this.frame;
    }
    return entry;
  }

  /** 世界格坐标 → Tile（缺块即生成并缓存）。 */
  tileAt(worldX: number, worldY: number): Tile | null {
    const size = this.spec.chunkSize;
    const cx = Math.floor(worldX / size);
    const cy = Math.floor(worldY / size);
    const entry = this.chunkAt(cx, cy);
    const lx = worldX - cx * size;
    const ly = worldY - cy * size;
    return entry.tiles[ly * size + lx] ?? null;
  }

  /** 预取以 (centerCx,centerCy) 为中心、半径 radius 的块（避免走到边缘穿帮）。 */
  prefetch(centerCx: number, centerCy: number, radius: number): void {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        this.chunkAt(centerCx + dx, centerCy + dy);
      }
    }
  }

  /** 淘汰距中心块超过 keepRadius 的块——远处地图不再占内存。 */
  evict(centerCx: number, centerCy: number, keepRadius: number): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (Math.abs(entry.chunk.cx - centerCx) > keepRadius || Math.abs(entry.chunk.cy - centerCy) > keepRadius) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
