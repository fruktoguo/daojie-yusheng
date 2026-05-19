/** OffscreenCanvas 地图渲染 worker：绘制可见地块、实体与基础战斗特效。 */
import { TILE_VISUAL_BG_COLORS, TILE_VISUAL_GLYPHS, TILE_VISUAL_GLYPH_COLORS, type TileType } from '@mud/shared';
import { buildCanvasFont } from '../constants/ui/text';

type TileView = { type: TileType; hp?: number; maxHp?: number; hpVisible?: boolean };
type EntityView = { id: string; wx: number; wy: number; char: string; color?: string; name?: string };
type PlayerView = { id: string; x: number; y: number; char: string };
type CameraView = { x: number; y: number; offsetX: number; offsetY: number };
type FrameData = {
  camera: CameraView; progress: number; cellSize: number; displayRangeX: number; displayRangeY: number;
  player: PlayerView | null; terrain: { tileEntries: Array<[string, TileView]>; visibleTiles: string[]; time: unknown };
  entities: EntityView[]; groundPiles: Array<{ x: number; y: number; count?: number }>;
};
type WorkerEffect = {
  type: 'attack' | 'warning_zone' | 'float'; fromX?: number; fromY?: number; toX?: number; toY?: number;
  x?: number; y?: number; text?: string; color?: string; cells?: Array<{ x: number; y: number }>; durationMs?: number;
};
type TimedEffect = WorkerEffect & { startedAt: number; durationMs: number };
type RenderCommand = { type: 'init' | 'frame' | 'resize' | 'clear' | 'effect' | 'reset'; canvas?: OffscreenCanvas; width?: number; height?: number; frameData?: FrameData; effect?: WorkerEffect };

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
const effects: TimedEffect[] = [];

self.onmessage = (event: MessageEvent<RenderCommand>) => {
  const cmd = event.data;
  try {
    if (cmd.type === 'init') init(cmd.canvas);
    else if (cmd.type === 'frame') frame(cmd.frameData);
    else if (cmd.type === 'resize') resize(cmd.width, cmd.height);
    else if (cmd.type === 'clear') clear();
    else if (cmd.type === 'reset') { effects.length = 0; clear(); }
    else if (cmd.type === 'effect' && cmd.effect) effect(cmd.effect);
  } catch (err: unknown) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

function init(nextCanvas?: OffscreenCanvas): void {
  if (!nextCanvas) return;
  canvas = nextCanvas;
  ctx = canvas.getContext('2d');
  self.postMessage({ type: 'ready' });
}
function resize(width?: number, height?: number): void {
  if (!canvas) return;
  if (width) canvas.width = Math.max(1, Math.floor(width));
  if (height) canvas.height = Math.max(1, Math.floor(height));
}
function clear(): void { if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height); }
function effect(value: WorkerEffect): void { effects.push({ ...value, startedAt: performance.now(), durationMs: Math.max(250, Number(value.durationMs) || 900) }); }

function frame(data?: FrameData): void {
  if (!ctx || !canvas || !data) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!data.player) return;
  drawTiles(data, new Map(data.terrain.tileEntries), new Set(data.terrain.visibleTiles));
  drawGroundPiles(data);
  drawEffects(data);
  drawEntities(data);
  self.postMessage({ type: 'frame_done' });
}

function drawTiles(data: FrameData, tileCache: Map<string, TileView>, visibleTiles: Set<string>): void {
  if (!ctx || !canvas || !data.player) return;
  const { cellSize, camera, player, displayRangeX, displayRangeY } = data;
  const sw = canvas.width, sh = canvas.height, ox = sw / 2 - camera.x + camera.offsetX, oy = sh / 2 - camera.y + camera.offsetY;
  const startGX = Math.floor((camera.x - sw / 2) / cellSize) - 1;
  const startGY = Math.floor((camera.y - sh / 2) / cellSize) - 1;
  const endGX = Math.ceil((camera.x + sw / 2) / cellSize) + 1;
  const endGY = Math.ceil((camera.y + sh / 2) / cellSize) + 1;
  for (let gy = startGY; gy <= endGY; gy += 1) for (let gx = startGX; gx <= endGX; gx += 1) {
    const key = `${gx},${gy}`, tile = tileCache.get(key), visible = visibleTiles.has(key);
    if (!visible && Math.abs(gx - player.x) > displayRangeX) continue;
    if (!visible && Math.abs(gy - player.y) > displayRangeY) continue;
    if (!tile && !visible) continue;
    const sx = gx * cellSize + ox, sy = gy * cellSize + oy;
    if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
    drawTile(tile, sx, sy, cellSize, visible);
  }
}

function drawTile(tile: TileView | undefined, sx: number, sy: number, cellSize: number, visible: boolean): void {
  if (!ctx) return;
  const tileType = tile?.type ?? ('floor' as TileType);
  ctx.fillStyle = TILE_VISUAL_BG_COLORS[tileType] ?? '#333';
  ctx.fillRect(sx, sy, cellSize, cellSize);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5; ctx.strokeRect(sx, sy, cellSize, cellSize);
  const glyph = TILE_VISUAL_GLYPHS[tileType];
  if (glyph) {
    ctx.fillStyle = TILE_VISUAL_GLYPH_COLORS[tileType] ?? 'rgba(0,0,0,0.35)';
    ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, sx + cellSize / 2, sy + cellSize / 2 + 1);
  }
  if (!visible) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx, sy, cellSize, cellSize); }
  if (tile && (tile.hpVisible ?? false) && (tile.maxHp ?? 0) > 0) {
    const ratio = Math.max(0, Math.min(1, (tile.hp ?? 0) / Math.max(tile.maxHp ?? 1, 1)));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx + 3, sy + 2, cellSize - 6, 3);
    ctx.fillStyle = '#d6c8ae'; ctx.fillRect(sx + 3, sy + 2, (cellSize - 6) * ratio, 3);
  }
}

function drawEntities(data: FrameData): void {
  for (const entity of data.entities) drawActor(data, entity.wx, entity.wy, entity.char, entity.color ?? '#f8e7b5', entity.name);
  if (data.player) drawActor(data, data.player.x, data.player.y, data.player.char, '#f5d76e', '你');
}
function drawActor(data: FrameData, x: number, y: number, char: string, color: string, label?: string): void {
  if (!ctx) return;
  const { sx, sy } = toScreen(data, x, y), size = data.cellSize;
  ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.arc(sx + size / 2, sy + size / 2, size * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.font = buildCanvasFont('entityGlyph', size * 0.72); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(char || '?', sx + size / 2, sy + size / 2 + 1);
  if (label) { ctx.font = buildCanvasFont('label', Math.max(10, size * 0.28)); ctx.fillStyle = 'rgba(255,255,255,0.84)'; ctx.fillText(label, sx + size / 2, sy - 4); }
}
function drawGroundPiles(data: FrameData): void {
  if (!ctx) return;
  for (const pile of data.groundPiles) { const { sx, sy } = toScreen(data, pile.x, pile.y); ctx.fillStyle = 'rgba(255,212,112,0.85)'; ctx.beginPath(); ctx.arc(sx + data.cellSize * 0.78, sy + data.cellSize * 0.78, Math.max(3, data.cellSize * 0.12), 0, Math.PI * 2); ctx.fill(); }
}

function drawEffects(data: FrameData): void {
  const now = performance.now();
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const e = effects[i], age = now - e.startedAt;
    if (age > e.durationMs) { effects.splice(i, 1); continue; }
    const alpha = 1 - age / e.durationMs;
    if (e.type === 'attack') drawAttack(data, e, alpha); else if (e.type === 'warning_zone') drawWarning(data, e, alpha); else drawFloat(data, e, alpha, age);
  }
}
function drawAttack(data: FrameData, e: TimedEffect, alpha: number): void {
  if (!ctx || e.fromX === undefined || e.fromY === undefined || e.toX === undefined || e.toY === undefined) return;
  const from = toCenter(data, e.fromX, e.fromY), to = toCenter(data, e.toX, e.toY);
  ctx.strokeStyle = withAlpha(e.color ?? '#ff6b4a', alpha); ctx.lineWidth = Math.max(2, data.cellSize * 0.08); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
}
function drawWarning(data: FrameData, e: TimedEffect, alpha: number): void {
  if (!ctx) return;
  for (const cell of e.cells ?? []) { const { sx, sy } = toScreen(data, cell.x, cell.y); ctx.fillStyle = withAlpha(e.color ?? '#ef4444', 0.28 * alpha); ctx.fillRect(sx + 1, sy + 1, data.cellSize - 2, data.cellSize - 2); }
}
function drawFloat(data: FrameData, e: TimedEffect, alpha: number, age: number): void {
  if (!ctx || e.x === undefined || e.y === undefined || !e.text) return;
  const pos = toCenter(data, e.x, e.y); ctx.font = buildCanvasFont('floatingDamage', Math.max(12, data.cellSize * 0.34)); ctx.fillStyle = withAlpha(e.color ?? '#fff4c2', alpha); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.text, pos.x, pos.y - data.cellSize * 0.55 - age * 0.025);
}
function toScreen(data: FrameData, x: number, y: number): { sx: number; sy: number } {
  const sw = ctx?.canvas.width ?? 0, sh = ctx?.canvas.height ?? 0;
  return { sx: x * data.cellSize + sw / 2 - data.camera.x + data.camera.offsetX, sy: y * data.cellSize + sh / 2 - data.camera.y + data.camera.offsetY };
}
function toCenter(data: FrameData, x: number, y: number): { x: number; y: number } { const p = toScreen(data, x, y); return { x: p.sx + data.cellSize / 2, y: p.sy + data.cellSize / 2 }; }
function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const hex = color.slice(1), expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, value = Number.parseInt(expanded, 16);
  return Number.isFinite(value) ? `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})` : color;
}
