/**
 * 秘境生成器 demo 与游戏运行时图包的桥接层。
 *
 * 这里不复制任何贴图/dual-grid 算法：直接复用客户端 `RuntimeImagePack`（同一份 manifest 契约、
 * 同一套对偶网格自动图块与边缘羽化），只是把 manifest 换成 build 时内联的 data URI 版本，
 * 使 demo 保持单文件离线可用。因此 demo 里看到的地块外观与线上地图逐像素一致。
 *
 * 绘制必须与 gm-map-editor 一样分两遍（见 gm-map-editor.ts:3657-3671 与 :3710-3721）：
 *   第一遍 drawTile 逐格画实心基底（内部按 mask=15 取图集中心块，不做羽化）；
 *   第二遍 drawDualGridTiles 只在顶点叠加带 cellular 噪声的过渡边缘。
 * 少了第一遍，地块之间就没有底，边缘会显得生硬且层级错乱。
 */
import { RuntimeImagePack, type RuntimeTileVisualSource } from '../../../packages/client/src/renderer/runtime-image-pack';
import { composeTileTypeFromLayers } from '../../../packages/shared/src/map-layer-types';
import type { StructureType, SurfaceType, TerrainType } from '../../../packages/shared/src/map-layer-types';
import { doesTileTypeBlockSight, isTileTypeWalkable } from '../../../packages/shared/src/terrain';
import type { Tile } from '../../../packages/shared/src/world-core-types';
import type { ProcgenMapResult } from '../../../packages/shared/src/procgen/procgen-types';

const MANIFEST_ELEMENT_ID = 'image-pack-manifest';

let cachedPack: RuntimeImagePack | null | undefined;

/**
 * 懒初始化图包。build 未内联贴图（PROCGEN_DEMO_NO_SPRITES=1）时返回 null，调用方回退纯色渲染。
 * manifest 走 blob: URL —— RuntimeImagePack 内部 fetch 它，而条目 src 是 data:，
 * 两种 scheme 在 resolveRuntimeImagePackAssetUrl 与版本追加处均被短路，不会拼出相对路径。
 */
export function getImagePack(): RuntimeImagePack | null {
  if (cachedPack !== undefined) {
    return cachedPack;
  }
  const raw = document.getElementById(MANIFEST_ELEMENT_ID)?.textContent?.trim();
  if (!raw) {
    cachedPack = null;
    return null;
  }
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  cachedPack = new RuntimeImagePack(url);
  return cachedPack;
}

/**
 * 把 procgen 的三层平行数组转成逐格 Tile。Tile 是 RuntimeTileVisualSource 的结构超集，
 * 因此同一份数组既能喂 drawTile 也能喂 drawDualGridTiles 的 tileAt。
 *
 * 必须整图预构建并复用对象引用：drawDualGridTiles 内部用 WeakMap 按对象缓存 sprite key 索引，
 * 每次绘制新建对象会让缓存全 miss。
 */
export function buildVisualTiles(result: ProcgenMapResult): Tile[] {
  const tiles = new Array<Tile>(result.width * result.height);
  for (let index = 0; index < tiles.length; index += 1) {
    const terrainType = result.terrainIds[index] as TerrainType;
    const surfaceType = result.surfaceIds[index] as SurfaceType | null;
    const structureType = result.structureIds[index] as StructureType | null;
    const type = composeTileTypeFromLayers(terrainType, surfaceType, structureType, []);
    tiles[index] = {
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

/**
 * 第一遍：逐格画实心基底贴图。返回该格是否画上；未画上的格由调用方回退纯色，
 * 与 gm-map-editor 的 `runtimeTileDrawn` 分支同义。
 */
export function drawTileBase(
  pack: RuntimeImagePack,
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  cellSize: number,
): boolean {
  return pack.drawTile(ctx, tile, x * cellSize, y * cellSize, cellSize);
}

/** 第二遍：整图叠加对偶网格过渡边缘。画布左上角即地图原点，故 offset 为 0。 */
export function drawDualGridEdges(
  pack: RuntimeImagePack,
  ctx: CanvasRenderingContext2D,
  result: ProcgenMapResult,
  tiles: readonly Tile[],
  cellSize: number,
): boolean {
  return pack.drawDualGridTiles(ctx, {
    startGX: 0,
    startGY: 0,
    endGX: result.width - 1,
    endGY: result.height - 1,
    cellSize,
    offsetX: 0,
    offsetY: 0,
    tileAt: (x, y): RuntimeTileVisualSource | null => (
      x < 0 || y < 0 || x >= result.width || y >= result.height
        ? null
        : tiles[y * result.width + x] ?? null
    ),
  });
}
