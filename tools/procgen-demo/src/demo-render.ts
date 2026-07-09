/**
 * 秘境生成器 demo：canvas 渲染、图例与格子检视。
 *
 * 地块外观走游戏运行时图包（dual-grid 自动图块），与线上地图一致；
 * 图包缺失、贴图未加载或该地块无图集条目时，按游戏同款分级回退到纯色。
 */
import type { RuntimeImagePack } from '../../../packages/client/src/renderer/runtime-image-pack';
import type { Tile } from '../../../packages/shared/src/world-core-types';
import type { ProcgenMapResult, ProcgenTileDef } from '../../../packages/shared/src/procgen/procgen-types';
import type { ProcgenTileCatalog } from '../../../packages/shared/src/procgen/procgen-catalog';
import { drawDualGridEdges, drawTileBase } from './demo-image-pack';

/** 贴图渲染上下文；pack 为 null 或 enabled 为 false 时整图走纯色。 */
export interface RenderSpriteContext {
  pack: RuntimeImagePack | null;
  enabled: boolean;
  tiles: readonly Tile[];
}

function tileOf(catalog: ProcgenTileCatalog, layer: string, id: string): ProcgenTileDef | undefined {
  return catalog.byLayerAndId.get(`${layer}:${id}`);
}

/** 纯色回退：terrain 满格 + surface 满格 + structure 内缩色块（该格没画上贴图时使用）。 */
function drawFlatCell(
  ctx: CanvasRenderingContext2D,
  result: ProcgenMapResult,
  catalog: ProcgenTileCatalog,
  index: number,
  x: number,
  y: number,
  cellSize: number,
): void {
  ctx.fillStyle = tileOf(catalog, 'terrain', result.terrainIds[index])?.color ?? '#f0f';
  ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  const surfaceId = result.surfaceIds[index];
  if (surfaceId !== null) {
    ctx.fillStyle = tileOf(catalog, 'surface', surfaceId)?.color ?? '#f0f';
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  }
  const structureId = result.structureIds[index];
  if (structureId !== null) {
    ctx.fillStyle = tileOf(catalog, 'structure', structureId)?.color ?? '#f0f';
    const inset = Math.max(1, Math.floor(cellSize * 0.18));
    ctx.fillRect(x * cellSize + inset, y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
  }
}

/**
 * 主画布渲染。贴图模式严格复刻 gm-map-editor 的两遍管线：
 *   1) 逐格 drawTile 画实心基底，画不上的格子回退纯色；
 *   2) drawDualGridTiles 整图叠加带噪声羽化的过渡边缘。
 * 顺序不能颠倒，也不能省掉第一遍 —— 否则地块之间没有底、边缘发硬。
 * 网格线与游戏一样画在两遍之间，让过渡边缘能盖住格线，避免切出硬直角。
 */
export function renderMap(
  canvas: HTMLCanvasElement,
  result: ProcgenMapResult,
  catalog: ProcgenTileCatalog,
  cellSize: number,
  sprite?: RenderSpriteContext,
): void {
  canvas.width = result.width * cellSize;
  canvas.height = result.height * cellSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pack = sprite?.enabled ? sprite.pack : null;
  let drewAnySprite = false;

  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const index = y * result.width + x;
      const tile = pack ? sprite!.tiles[index] : undefined;
      const drawn = pack && tile ? drawTileBase(pack, ctx, tile, x, y, cellSize) : false;
      if (drawn) drewAnySprite = true;
      else drawFlatCell(ctx, result, catalog, index, x, y, cellSize);
    }
  }

  if (cellSize >= 9) {
    ctx.strokeStyle = drewAnySprite ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= result.width; x += 1) {
      ctx.beginPath(); ctx.moveTo(x * cellSize + 0.5, 0); ctx.lineTo(x * cellSize + 0.5, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= result.height; y += 1) {
      ctx.beginPath(); ctx.moveTo(0, y * cellSize + 0.5); ctx.lineTo(canvas.width, y * cellSize + 0.5); ctx.stroke();
    }
  }

  if (pack) drawDualGridEdges(pack, ctx, result, sprite!.tiles, cellSize);

  // 传送阵：入口绿色圆环、出口紫色圆环
  for (const portal of result.portals) {
    const cx = (portal.x + 0.5) * cellSize;
    const cy = (portal.y + 0.5) * cellSize;
    ctx.strokeStyle = portal.role === 'entry' ? '#4ade80' : '#c084fc';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.18);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, cellSize * 0.42), 0, Math.PI * 2);
    ctx.stroke();
  }
  // 内容锚点：宝箱橙方块、怪物据点红三角
  for (const anchor of result.contentAnchors) {
    const cx = (anchor.x + 0.5) * cellSize;
    const cy = (anchor.y + 0.5) * cellSize;
    const size = Math.max(3, cellSize * 0.55);
    if (anchor.kind === 'chest') {
      ctx.fillStyle = '#f2a740';
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = '#7a4a10';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#e0574f';
      ctx.beginPath();
      ctx.moveTo(cx, cy - size / 2);
      ctx.lineTo(cx + size / 2, cy + size / 2);
      ctx.lineTo(cx - size / 2, cy + size / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** 图例：只列出本图实际用到的地块（按层分组，含数量）。 */
export function renderLegend(container: HTMLElement, result: ProcgenMapResult, catalog: ProcgenTileCatalog): void {
  container.innerHTML = '';
  const entries = Object.entries(result.stats.tileCounts).sort((a, b) => b[1] - a[1]);
  for (const [key, count] of entries) {
    const separator = key.indexOf(':');
    const layer = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const def = tileOf(catalog, layer, id);
    const item = document.createElement('span');
    item.className = 'item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = def?.color ?? '#f0f';
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(`${def?.name ?? id} ×${count}`));
    container.appendChild(item);
  }
  const markers = document.createElement('span');
  markers.className = 'item';
  markers.textContent = '◯绿=入口 ◯紫=出口 ■橙=宝箱锚点 ▲红=怪物据点';
  container.appendChild(markers);
}

/** 悬停检视：返回该格三层与可走信息的文本。 */
export function describeCell(result: ProcgenMapResult, catalog: ProcgenTileCatalog, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= result.width || y >= result.height) return '';
  const index = y * result.width + x;
  const terrain = tileOf(catalog, 'terrain', result.terrainIds[index]);
  const surfaceId = result.surfaceIds[index];
  const structureId = result.structureIds[index];
  const lines = [`(${x}, ${y})`];
  lines.push(`地形：${terrain?.name ?? result.terrainIds[index]}${terrain?.walkable ? '' : '（不可走）'}`);
  if (surfaceId !== null) lines.push(`铺装：${tileOf(catalog, 'surface', surfaceId)?.name ?? surfaceId}`);
  if (structureId !== null) {
    const structure = tileOf(catalog, 'structure', structureId);
    lines.push(`结构：${structure?.name ?? structureId}${structure?.blocksMove === false ? '' : '（阻挡）'}`);
  }
  const portal = result.portals.find((p) => p.x === x && p.y === y);
  if (portal) lines.push(portal.role === 'entry' ? '★ 入口传送阵（出生点）' : '★ 出口传送阵');
  const anchor = result.contentAnchors.find((a) => a.x === x && a.y === y);
  if (anchor) lines.push(anchor.kind === 'chest' ? '★ 宝箱锚点' : '★ 怪物据点锚点');
  return lines.join('\n');
}
