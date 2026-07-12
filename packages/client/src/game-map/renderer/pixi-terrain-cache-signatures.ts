/**
 * 本文件集中定义 Pixi 地形分块缓存的失效签名。
 *
 * 静态层只跟地形贴图输入变化，动态覆盖层只跟生命条、可见性和望气着色输入变化，
 * 避免高频运行态数据错误地销毁重建 GPU 静态缓存。
 */
import {
  normalizeAuraLevelBaseValue,
  resolveSenseQiOverlaySignal,
  type Tile,
} from '@mud/shared';

export const PIXI_TERRAIN_CHUNK_SIZE = 16;

function buildStaticTileSignature(tile: Tile): string {
  return [
    tile.type,
    tile.terrainType ?? '',
    tile.surfaceType ?? '',
    tile.structureType ?? '',
    Array.isArray(tile.interactableKinds) ? tile.interactableKinds.join('+') : '',
  ].join(':');
}

function buildHpVisibilitySignature(tile: Tile | null | undefined): string {
  if (!tile || tile.hpVisible === undefined) return '';
  return tile.hpVisible ? '1' : '0';
}

function buildSenseQiSignalSignature(tile: Tile | null | undefined, levelBaseValue: number): string {
  const signal = resolveSenseQiOverlaySignal(tile?.aura, tile?.resources, levelBaseValue);
  return `${signal.family}:${signal.value}`;
}

export function buildPixiTerrainChunkStaticSignature(
  tileCache: ReadonlyMap<string, Tile>,
  cx: number,
  cy: number,
  cellSize: number,
  renderRuntimeTileSprites: boolean,
  terrainTextMode: boolean,
  runtimeTileSpriteRevision: number,
): string {
  const startX = cx * PIXI_TERRAIN_CHUNK_SIZE;
  const startY = cy * PIXI_TERRAIN_CHUNK_SIZE;
  let signature = `${cellSize}|${renderRuntimeTileSprites ? 1 : 0}|${terrainTextMode ? 1 : 0}|${runtimeTileSpriteRevision}`;
  for (let y = startY - 1; y <= startY + PIXI_TERRAIN_CHUNK_SIZE; y += 1) {
    for (let x = startX - 1; x <= startX + PIXI_TERRAIN_CHUNK_SIZE; x += 1) {
      const key = `${x},${y}`;
      const tile = tileCache.get(key);
      if (!tile) continue;
      signature += `|${key}:${buildStaticTileSignature(tile)}`;
    }
  }
  return signature;
}

export function buildPixiTerrainChunkOverlaySignature(
  tileCache: ReadonlyMap<string, Tile>,
  visibleTiles: ReadonlySet<string>,
  cx: number,
  cy: number,
  cellSize: number,
  terrainOverlaySignature: string,
  senseQiLevelBaseValue: number | null,
): string {
  const startX = cx * PIXI_TERRAIN_CHUNK_SIZE;
  const startY = cy * PIXI_TERRAIN_CHUNK_SIZE;
  const normalizedLevelBaseValue = senseQiLevelBaseValue === null
    ? null
    : normalizeAuraLevelBaseValue(senseQiLevelBaseValue);
  let signature = `${cellSize}|${terrainOverlaySignature}`;
  for (let y = startY; y < startY + PIXI_TERRAIN_CHUNK_SIZE; y += 1) {
    for (let x = startX; x < startX + PIXI_TERRAIN_CHUNK_SIZE; x += 1) {
      const key = `${x},${y}`;
      const tile = tileCache.get(key);
      signature += [
        '',
        key,
        visibleTiles.has(key) ? 1 : 0,
        tile ? 1 : 0,
        tile?.hp ?? '',
        tile?.maxHp ?? '',
        buildHpVisibilitySignature(tile),
        normalizedLevelBaseValue === null ? '' : buildSenseQiSignalSignature(tile, normalizedLevelBaseValue),
      ].join(':');
    }
  }
  return signature;
}
