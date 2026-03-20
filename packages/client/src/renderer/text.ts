import { IRenderer, TargetingOverlayState } from './types';
import { Tile, TileType } from '@mud/shared';
import { Camera } from './camera';
import { getCellSize } from '../display';

const TILE_BG: Record<TileType, string> = {
  [TileType.Floor]: '#ddd8cf',
  [TileType.Wall]: '#3e3a35',
  [TileType.Door]: '#8b7355',
  [TileType.Portal]: '#5c3d7a',
  [TileType.Grass]: '#c2cba8',
  [TileType.Water]: '#6e9ab8',
  [TileType.Tree]: '#4d6b3a',
  [TileType.Stone]: '#7a7570',
};

const TILE_CHAR: Record<TileType, string> = {
  [TileType.Floor]: '·',
  [TileType.Wall]: '▓',
  [TileType.Door]: '门',
  [TileType.Portal]: '阵',
  [TileType.Grass]: '草',
  [TileType.Water]: '水',
  [TileType.Tree]: '木',
  [TileType.Stone]: '石',
};

const CHAR_COLOR: Record<TileType, string> = {
  [TileType.Floor]: 'rgba(0,0,0,0.15)',
  [TileType.Wall]: 'rgba(255,255,255,0.2)',
  [TileType.Door]: '#f0e0c0',
  [TileType.Portal]: '#d0b0f0',
  [TileType.Grass]: 'rgba(50,80,30,0.35)',
  [TileType.Water]: 'rgba(30,50,80,0.4)',
  [TileType.Tree]: 'rgba(20,40,15,0.5)',
  [TileType.Stone]: 'rgba(40,35,30,0.35)',
};

const PATH_FILL_COLOR = 'rgba(88, 180, 214, 0.24)';
const PATH_STROKE_COLOR = 'rgba(151, 236, 255, 0.78)';
const PATH_ARROW_COLOR = 'rgba(179, 244, 255, 0.95)';
const PATH_TARGET_FILL_COLOR = 'rgba(244, 144, 64, 0.34)';
const PATH_TARGET_STROKE_COLOR = 'rgba(255, 216, 138, 0.96)';
const PATH_TARGET_CORE_COLOR = 'rgba(255, 244, 219, 0.98)';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface AnimEntity {
  id: string;
  oldWX: number;
  oldWY: number;
  targetWX: number;
  targetWY: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  hp?: number;
  maxHp?: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
  duration: number;
}

interface AttackTrail {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  createdAt: number;
  duration: number;
}

export class TextRenderer implements IRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private entities: Map<string, AnimEntity> = new Map();
  private pathCells: { x: number; y: number }[] = [];
  private pathKeys = new Set<string>();
  private pathIndexByKey = new Map<string, number>();
  private pathTargetKey: string | null = null;
  private targetingOverlay: TargetingOverlayState | null = null;
  private targetingAffectedKeys = new Set<string>();
  private floatingTexts: FloatingText[] = [];
  private attackTrails: AttackTrail[] = [];
  private nextFloatingTextId = 1;
  private nextAttackTrailId = 1;

  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  clear() {
    if (!this.ctx) return;
    const { width, height } = this.ctx.canvas;
    this.ctx.fillStyle = '#1a1816';
    this.ctx.fillRect(0, 0, width, height);
  }

  setPathHighlight(cells: { x: number; y: number }[]) {
    this.pathCells = cells;
    this.pathKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    this.pathIndexByKey = new Map(cells.map((cell, index) => [`${cell.x},${cell.y}`, index]));
    this.pathTargetKey = cells.length > 0 ? `${cells[cells.length - 1].x},${cells[cells.length - 1].y}` : null;
  }

  setTargetingOverlay(state: TargetingOverlayState | null) {
    this.targetingOverlay = state;
    this.targetingAffectedKeys = new Set((state?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
  }

  renderWorld(camera: Camera, tileCache: Map<string, Tile>, visibleTiles: Set<string>, playerX: number, playerY: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();

    // 屏幕可见格子范围
    const camWorldX = camera.x - sw / 2;
    const camWorldY = camera.y - sh / 2;
    const startGX = Math.floor(camWorldX / cellSize) - 1;
    const startGY = Math.floor(camWorldY / cellSize) - 1;
    const endGX = Math.ceil((camWorldX + sw) / cellSize) + 1;
    const endGY = Math.ceil((camWorldY + sh) / cellSize) + 1;

    for (let gy = startGY; gy <= endGY; gy++) {
      for (let gx = startGX; gx <= endGX; gx++) {
        const { sx, sy } = camera.worldToScreen(gx * cellSize, gy * cellSize, sw, sh);
        if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;

        const key = `${gx},${gy}`;
        const tile = tileCache.get(key);
        const isVisible = visibleTiles.has(key);

        if (!isVisible && Math.abs(gx - playerX) > 10) continue;
        if (!isVisible && Math.abs(gy - playerY) > 10) continue;

        if (tile) {
          ctx.fillStyle = TILE_BG[tile.type] ?? '#333';
          ctx.fillRect(sx, sy, cellSize, cellSize);

          // 路径高亮
          if (this.pathKeys.has(key)) {
            const isTargetCell = key === this.pathTargetKey;
            ctx.fillStyle = isTargetCell ? PATH_TARGET_FILL_COLOR : PATH_FILL_COLOR;
            ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
            ctx.strokeStyle = isTargetCell ? PATH_TARGET_STROKE_COLOR : PATH_STROKE_COLOR;
            ctx.lineWidth = isTargetCell ? 2 : 1.5;
            ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
            if (isTargetCell) {
              ctx.fillStyle = PATH_TARGET_CORE_COLOR;
              ctx.beginPath();
              ctx.arc(sx + cellSize / 2, sy + cellSize / 2, Math.max(3, cellSize * 0.12), 0, Math.PI * 2);
              ctx.fill();
            }
          }

          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellSize, cellSize);

          const ch = TILE_CHAR[tile.type];
          if (ch) {
            ctx.fillStyle = CHAR_COLOR[tile.type] ?? 'rgba(0,0,0,0.2)';
            ctx.font = `${cellSize * 0.6}px "Ma Shan Zheng", cursive`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2 + 1);
          }

          if ((tile.maxHp ?? 0) > 0 && tile.hpVisible) {
            const ratio = Math.max(0, Math.min(1, (tile.hp ?? 0) / Math.max(tile.maxHp ?? 1, 1)));
            const barX = sx + 3;
            const barY = sy + 2;
            const barW = cellSize - 6;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, 3);
            ctx.fillStyle = '#d6c8ae';
            ctx.fillRect(barX, barY, barW * ratio, 3);
          }

          if (this.targetingOverlay) {
            const dx = gx - this.targetingOverlay.originX;
            const dy = gy - this.targetingOverlay.originY;
            const distanceSq = dx * dx + dy * dy;
            const hovered = gx === this.targetingOverlay.hoverX && gy === this.targetingOverlay.hoverY;
            const affected = this.targetingAffectedKeys.has(key);
            const inCastRange = distanceSq > 0 && distanceSq <= this.targetingOverlay.range * this.targetingOverlay.range;
            if (inCastRange || affected) {
              ctx.fillStyle = affected
                ? (hovered ? 'rgba(208, 76, 56, 0.42)' : 'rgba(198, 72, 48, 0.3)')
                : (hovered ? 'rgba(208, 76, 56, 0.34)' : 'rgba(212, 164, 71, 0.18)');
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
              ctx.strokeStyle = affected
                ? (hovered ? 'rgba(150, 28, 24, 0.98)' : 'rgba(171, 56, 36, 0.9)')
                : (hovered ? 'rgba(166, 37, 31, 0.92)' : 'rgba(123, 91, 20, 0.55)');
              ctx.lineWidth = hovered || affected ? 2 : 1;
              ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
            }
          }
        } else {
          ctx.fillStyle = '#0d0b0a';
          ctx.fillRect(sx, sy, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(255,255,255,0.02)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellSize, cellSize);
        }

        if (!isVisible) {
          ctx.fillStyle = tile ? 'rgba(12, 10, 8, 0.72)' : 'rgba(8, 6, 5, 0.94)';
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }
      }
    }

    this.renderPathArrows(camera, visibleTiles, playerX, playerY);
  }

  updateEntities(
    list: { id: string; wx: number; wy: number; char: string; color: string; name?: string; kind?: string; hp?: number; maxHp?: number }[],
    movedId?: string,
    shiftX = 0,
    shiftY = 0,
  ) {
    const seen = new Set<string>();
    const cellSize = getCellSize();
    for (const e of list) {
      seen.add(e.id);
      const twx = e.wx * cellSize;
      const twy = e.wy * cellSize;
      const anim = this.entities.get(e.id);
      if (anim) {
        anim.oldWX = anim.targetWX;
        anim.oldWY = anim.targetWY;
        anim.targetWX = twx;
        anim.targetWY = twy;
        anim.char = e.char;
        anim.color = e.color;
        anim.name = e.name;
        anim.kind = e.kind;
        anim.hp = e.hp;
        anim.maxHp = e.maxHp;
        if (e.id === movedId) {
          anim.oldWX = (e.wx - shiftX) * cellSize;
          anim.oldWY = (e.wy - shiftY) * cellSize;
        }
      } else {
        this.entities.set(e.id, {
          id: e.id,
          oldWX: twx,
          oldWY: twy,
          targetWX: twx,
          targetWY: twy,
          char: e.char,
          color: e.color,
          name: e.name,
          kind: e.kind,
          hp: e.hp,
          maxHp: e.maxHp,
        });
      }
    }
    for (const id of this.entities.keys()) {
      if (!seen.has(id)) this.entities.delete(id);
    }
  }

  renderEntities(camera: Camera, progress = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();

    for (const anim of this.entities.values()) {
      let wx: number, wy: number;
      if (progress < 0.4) {
        const t = easeOutCubic(progress / 0.4);
        wx = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
        wy = anim.oldWY + (anim.targetWY - anim.oldWY) * t;
      } else {
        wx = anim.targetWX;
        wy = anim.targetWY;
      }

      const { sx, sy } = camera.worldToScreen(wx, wy, sw, sh);
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + cellSize / 2, sy + cellSize - 3, cellSize * 0.32, cellSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = anim.color;
      ctx.font = `bold ${cellSize * 0.75}px "Ma Shan Zheng", cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText(anim.char, sx + cellSize / 2, sy + cellSize / 2, anim.color, 'rgba(15,12,10,0.9)');

      if (anim.kind) {
        const isMonster = anim.kind === 'monster';
        const isPlayer = anim.kind === 'player';
        const isNpc = anim.kind === 'npc';
        const label = anim.name ?? (isMonster ? '妖兽' : isPlayer ? '修士' : '道人');
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${cellSize * 0.3}px "Noto Serif SC", serif`;
        this.drawOutlinedText(
          label,
          sx + cellSize / 2,
          sy - 4,
          isMonster ? '#ffddcc' : isPlayer ? '#d8f3c3' : '#cce7ff',
          'rgba(15,12,10,0.9)',
        );

        if ((anim.maxHp ?? 0) > 0) {
          const ratio = Math.max(0, Math.min(1, (anim.hp ?? 0) / (anim.maxHp ?? 1)));
          const barX = sx + 3;
          const barY = sy - 2;
          const barW = cellSize - 6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(barX, barY, barW, 3);
          ctx.fillStyle = isMonster ? '#d15252' : isNpc ? '#58a8ff' : '#63c46b';
          ctx.fillRect(barX, barY, barW * ratio, 3);
        }
      }
    }
  }

  addFloatingText(x: number, y: number, text: string, color = '#ffd27a') {
    this.floatingTexts.push({
      id: this.nextFloatingTextId++,
      x,
      y,
      text,
      color,
      createdAt: performance.now(),
      duration: 850,
    });
  }

  addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color = '#ffd27a') {
    this.attackTrails.push({
      id: this.nextAttackTrailId++,
      fromX,
      fromY,
      toX,
      toY,
      color,
      createdAt: performance.now(),
      duration: 260,
    });
  }

  renderFloatingTexts(camera: Camera) {
    if (!this.ctx || this.floatingTexts.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();

    this.floatingTexts = this.floatingTexts.filter((entry) => now - entry.createdAt < entry.duration);

    for (const entry of this.floatingTexts) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const rise = cellSize * (0.2 + progress * 0.8);
      const alpha = 1 - progress;
      const worldX = entry.x * cellSize;
      const worldY = entry.y * cellSize;
      const { sx, sy } = camera.worldToScreen(worldX, worldY, sw, sh);
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.max(14, cellSize * 0.45)}px "Noto Serif SC", serif`;
      this.drawOutlinedText(entry.text, sx + cellSize / 2, sy - rise, entry.color, 'rgba(15,12,10,0.95)');
      ctx.restore();
    }
  }

  renderAttackTrails(camera: Camera) {
    if (!this.ctx || this.attackTrails.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();

    this.attackTrails = this.attackTrails.filter((entry) => now - entry.createdAt < entry.duration);

    for (const entry of this.attackTrails) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const alpha = 1 - progress * 0.85;
      const from = camera.worldToScreen(entry.fromX * cellSize + cellSize / 2, entry.fromY * cellSize + cellSize / 2, sw, sh);
      const to = camera.worldToScreen(entry.toX * cellSize + cellSize / 2, entry.toY * cellSize + cellSize / 2, sw, sh);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = entry.color;
      ctx.fillStyle = entry.color;
      ctx.lineWidth = Math.max(2, cellSize * 0.09);
      ctx.beginPath();
      ctx.moveTo(from.sx, from.sy);
      ctx.lineTo(to.sx, to.sy);
      ctx.stroke();

      const angle = Math.atan2(to.sy - from.sy, to.sx - from.sx);
      const head = Math.max(8, cellSize * 0.22);
      ctx.beginPath();
      ctx.moveTo(to.sx, to.sy);
      ctx.lineTo(to.sx - head * Math.cos(angle - Math.PI / 6), to.sy - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.sx - head * Math.cos(angle + Math.PI / 6), to.sy - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  destroy() {
    this.ctx = null;
    this.entities.clear();
    this.pathKeys.clear();
    this.pathIndexByKey.clear();
    this.pathTargetKey = null;
    this.floatingTexts = [];
    this.attackTrails = [];
  }

  private renderPathArrows(camera: Camera, visibleTiles: Set<string>, playerX: number, playerY: number) {
    if (!this.ctx || this.pathCells.length === 0) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const route = [{ x: playerX, y: playerY }, ...this.pathCells];

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    for (let index = 0; index < route.length - 1; index++) {
      const from = route[index];
      const to = route[index + 1];
      const toKey = `${to.x},${to.y}`;
      if (!this.pathIndexByKey.has(toKey)) {
        continue;
      }
      if (!this.isPathCellRenderable(from.x, from.y, visibleTiles, playerX, playerY) && !this.isPathCellRenderable(to.x, to.y, visibleTiles, playerX, playerY)) {
        continue;
      }

      const fromPos = camera.worldToScreen(from.x * cellSize + cellSize / 2, from.y * cellSize + cellSize / 2, sw, sh);
      const toPos = camera.worldToScreen(to.x * cellSize + cellSize / 2, to.y * cellSize + cellSize / 2, sw, sh);
      const dx = toPos.sx - fromPos.sx;
      const dy = toPos.sy - fromPos.sy;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        continue;
      }

      const ux = dx / distance;
      const uy = dy / distance;
      const startPadding = index === 0 ? cellSize * 0.2 : cellSize * 0.1;
      const endPadding = cellSize * 0.14;
      const startX = fromPos.sx + ux * startPadding;
      const startY = fromPos.sy + uy * startPadding;
      const tipX = toPos.sx - ux * endPadding;
      const tipY = toPos.sy - uy * endPadding;
      const isFinalSegment = toKey === this.pathTargetKey;
      const arrowColor = isFinalSegment ? PATH_TARGET_STROKE_COLOR : PATH_ARROW_COLOR;
      const headLength = Math.max(8, cellSize * 0.2);
      const headWidth = Math.max(5, cellSize * 0.12);
      const shaftEndX = tipX - ux * headLength;
      const shaftEndY = tipY - uy * headLength;

      if (
        Math.max(startX, tipX) < -cellSize ||
        Math.min(startX, tipX) > sw + cellSize ||
        Math.max(startY, tipY) < -cellSize ||
        Math.min(startY, tipY) > sh + cellSize
      ) {
        continue;
      }

      ctx.strokeStyle = arrowColor;
      ctx.fillStyle = arrowColor;
      ctx.lineWidth = Math.max(1.25, cellSize * 0.06);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.stroke();

      const normalX = -uy;
      const normalY = ux;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(shaftEndX + normalX * headWidth, shaftEndY + normalY * headWidth);
      ctx.lineTo(shaftEndX - normalX * headWidth, shaftEndY - normalY * headWidth);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private isPathCellRenderable(x: number, y: number, visibleTiles: Set<string>, playerX: number, playerY: number): boolean {
    const key = `${x},${y}`;
    return visibleTiles.has(key) || (Math.abs(x - playerX) <= 10 && Math.abs(y - playerY) <= 10);
  }

  private drawOutlinedText(text: string, x: number, y: number, fill: string, stroke: string) {
    if (!this.ctx) return;
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = stroke;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y);
  }
}
