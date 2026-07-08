/**
 * 秘境生成器 demo：canvas 渲染、图例与格子检视。
 */
import type { ProcgenMapResult, ProcgenTileDef } from '../../../packages/shared/src/procgen/procgen-types';
import type { ProcgenTileCatalog } from '../../../packages/shared/src/procgen/procgen-catalog';

function tileOf(catalog: ProcgenTileCatalog, layer: string, id: string): ProcgenTileDef | undefined {
  return catalog.byLayerAndId.get(`${layer}:${id}`);
}

/** 主画布渲染：terrain 打底、surface 覆盖、structure 画块、传送阵与出生点标记。 */
export function renderMap(
  canvas: HTMLCanvasElement,
  result: ProcgenMapResult,
  catalog: ProcgenTileCatalog,
  cellSize: number,
): void {
  canvas.width = result.width * cellSize;
  canvas.height = result.height * cellSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const index = y * result.width + x;
      const terrain = tileOf(catalog, 'terrain', result.terrainIds[index]);
      ctx.fillStyle = terrain?.color ?? '#f0f';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      const surfaceId = result.surfaceIds[index];
      if (surfaceId !== null) {
        const surface = tileOf(catalog, 'surface', surfaceId);
        ctx.fillStyle = surface?.color ?? '#f0f';
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
      const structureId = result.structureIds[index];
      if (structureId !== null) {
        const structure = tileOf(catalog, 'structure', structureId);
        ctx.fillStyle = structure?.color ?? '#f0f';
        const inset = Math.max(1, Math.floor(cellSize * 0.18));
        ctx.fillRect(x * cellSize + inset, y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
      }
    }
  }
  if (cellSize >= 9) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= result.width; x += 1) {
      ctx.beginPath(); ctx.moveTo(x * cellSize + 0.5, 0); ctx.lineTo(x * cellSize + 0.5, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= result.height; y += 1) {
      ctx.beginPath(); ctx.moveTo(0, y * cellSize + 0.5); ctx.lineTo(canvas.width, y * cellSize + 0.5); ctx.stroke();
    }
  }
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
