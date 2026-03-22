/**
 * 文字渲染器 —— 基于 Canvas 2D 的地图、实体、特效绘制，实现 IRenderer 接口
 */

import { IRenderer, SenseQiOverlayState, TargetingOverlayState } from './types';
import { GameTimeState, NpcQuestMarker, Tile, TileType, VisibleBuffState } from '@mud/shared';
import { Camera } from './camera';
import { getCellSize } from '../display';

const TILE_BG: Record<TileType, string> = {
  [TileType.Floor]: '#ddd8cf',
  [TileType.Road]: '#cdb89c',
  [TileType.Trail]: '#b4946f',
  [TileType.Wall]: '#3e3a35',
  [TileType.Door]: '#8b7355',
  [TileType.Window]: '#8bb6cf',
  [TileType.BrokenWindow]: '#9aa7b0',
  [TileType.Portal]: '#5c3d7a',
  [TileType.Stairs]: '#7f5a34',
  [TileType.Grass]: '#b8c98b',
  [TileType.Hill]: '#b7a17f',
  [TileType.Mud]: '#8b6a4c',
  [TileType.Swamp]: '#556b3f',
  [TileType.Water]: '#6e9ab8',
  [TileType.Tree]: '#4d6b3a',
  [TileType.Stone]: '#7a7570',
};

const TILE_CHAR: Record<TileType, string> = {
  [TileType.Floor]: '·',
  [TileType.Road]: '路',
  [TileType.Trail]: '径',
  [TileType.Wall]: '▓',
  [TileType.Door]: '门',
  [TileType.Window]: '窗',
  [TileType.BrokenWindow]: '裂',
  [TileType.Portal]: '阵',
  [TileType.Stairs]: '阶',
  [TileType.Grass]: '草',
  [TileType.Hill]: '坡',
  [TileType.Mud]: '泥',
  [TileType.Swamp]: '沼',
  [TileType.Water]: '水',
  [TileType.Tree]: '木',
  [TileType.Stone]: '石',
};

const CHAR_COLOR: Record<TileType, string> = {
  [TileType.Floor]: 'rgba(0,0,0,0.15)',
  [TileType.Road]: 'rgba(90,55,24,0.35)',
  [TileType.Trail]: 'rgba(84,52,28,0.42)',
  [TileType.Wall]: 'rgba(255,255,255,0.2)',
  [TileType.Door]: '#f0e0c0',
  [TileType.Window]: '#e6f8ff',
  [TileType.BrokenWindow]: '#d8dde2',
  [TileType.Portal]: '#d0b0f0',
  [TileType.Stairs]: '#f3d19c',
  [TileType.Grass]: 'rgba(50,80,30,0.35)',
  [TileType.Hill]: 'rgba(92,60,32,0.36)',
  [TileType.Mud]: 'rgba(250,240,220,0.34)',
  [TileType.Swamp]: 'rgba(220,240,180,0.4)',
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
const SENSE_QI_HOVER_STROKE = 'rgba(189, 231, 255, 0.95)';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function getSenseQiOverlayStyle(aura: number): string {
  const normalized = Math.max(0, Math.min(aura, 6)) / 6;
  const red = Math.round(8 + normalized * 28);
  const green = Math.round(12 + normalized * 96);
  const blue = Math.round(16 + normalized * 224);
  const alpha = 0.72 - normalized * 0.18;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
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
  npcQuestMarker?: NpcQuestMarker;
  buffs?: VisibleBuffState[];
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  variant: 'damage' | 'action';
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

interface FloatingTextBurstOffset {
  offsetX: number;
  offsetY: number;
}

/** 文字渲染器，用汉字字符绘制地图地块、实体角色和战斗特效 */
export class TextRenderer implements IRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private entities: Map<string, AnimEntity> = new Map();
  private pathCells: { x: number; y: number }[] = [];
  private pathKeys = new Set<string>();
  private pathIndexByKey = new Map<string, number>();
  private pathTargetKey: string | null = null;
  private targetingOverlay: TargetingOverlayState | null = null;
  private senseQiOverlay: SenseQiOverlayState | null = null;
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

  resetScene() {
    this.entities.clear();
    this.floatingTexts = [];
    this.attackTrails = [];
  }

  /** 设置寻路路径高亮格子列表 */
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

  setSenseQiOverlay(state: SenseQiOverlayState | null) {
    this.senseQiOverlay = state;
  }

  /** 绘制地图地块、路径高亮、瞄准叠加层和感气视角 */
  renderWorld(
    camera: Camera,
    tileCache: Map<string, Tile>,
    visibleTiles: Set<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ) {
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

        if (!isVisible && Math.abs(gx - playerX) > displayRangeX) continue;
        if (!isVisible && Math.abs(gy - playerY) > displayRangeY) continue;
        if (!tile && !isVisible) continue;

        if (tile) {
          ctx.fillStyle = TILE_BG[tile.type] ?? '#333';
          ctx.fillRect(sx, sy, cellSize, cellSize);

          if (this.senseQiOverlay && isVisible) {
            ctx.fillStyle = getSenseQiOverlayStyle(tile.aura);
            ctx.fillRect(sx, sy, cellSize, cellSize);
          }

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

          if (this.senseQiOverlay && isVisible && gx === this.senseQiOverlay.hoverX && gy === this.senseQiOverlay.hoverY) {
            ctx.strokeStyle = SENSE_QI_HOVER_STROKE;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
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
        }

        if (!isVisible) {
          ctx.fillStyle = tile ? 'rgba(12, 10, 8, 0.72)' : 'rgba(8, 6, 5, 0.94)';
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }
      }
    }

    this.renderPathArrows(camera, visibleTiles, playerX, playerY, displayRangeX, displayRangeY);
    this.renderTimeOverlay(time);
  }

  /** 更新实体列表，记录旧位置用于插值动画 */
  updateEntities(
    list: { id: string; wx: number; wy: number; char: string; color: string; name?: string; kind?: string; hp?: number; maxHp?: number; npcQuestMarker?: NpcQuestMarker; buffs?: VisibleBuffState[] }[],
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
        anim.npcQuestMarker = e.npcQuestMarker;
        anim.buffs = e.buffs;
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
          npcQuestMarker: e.npcQuestMarker,
          buffs: e.buffs,
        });
      }
    }
    for (const id of this.entities.keys()) {
      if (!seen.has(id)) this.entities.delete(id);
    }
  }

  /** 绘制所有实体（角色/怪物/NPC），含位置插值动画 */
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
        const isContainer = anim.kind === 'container';
        const label = anim.name ?? (isMonster ? '妖兽' : isPlayer ? '修士' : isContainer ? '箱具' : '道人');
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${cellSize * 0.3}px "Noto Serif SC", serif`;
        this.drawOutlinedText(
          label,
          sx + cellSize / 2,
          sy - Math.max(6, cellSize * 0.18),
          isMonster ? '#ffddcc' : isPlayer ? '#d8f3c3' : isContainer ? '#ffe3b8' : '#cce7ff',
          'rgba(15,12,10,0.9)',
        );

        this.drawBuffRows(sx, sy, cellSize, anim.buffs);

        if ((anim.maxHp ?? 0) > 0) {
          const ratio = Math.max(0, Math.min(1, (anim.hp ?? 0) / (anim.maxHp ?? 1)));
          const barX = sx + 3;
          const barY = sy + cellSize - 5;
          const barW = cellSize - 6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(barX, barY, barW, 3);
          ctx.fillStyle = isMonster ? '#d15252' : isNpc ? '#58a8ff' : isContainer ? '#c18b46' : '#63c46b';
          ctx.fillRect(barX, barY, barW * ratio, 3);
        }

        if (isNpc && anim.npcQuestMarker) {
          this.drawNpcQuestMarker(sx, sy, cellSize, anim.npcQuestMarker);
        }
      }
    }
  }

  private drawBuffRows(sx: number, sy: number, cellSize: number, buffs?: VisibleBuffState[]) {
    if (!this.ctx || !buffs || buffs.length === 0) return;
    const visible = buffs.filter((buff) => buff.visibility === 'public');
    if (visible.length === 0) return;
    const buffsByCategory = visible.filter((buff) => buff.category === 'buff');
    const debuffsByCategory = visible.filter((buff) => buff.category === 'debuff');
    const badgeSize = Math.max(8, Math.floor(cellSize * 0.24));
    const gap = 2;
    this.drawBuffRow(sx, sy + 1, cellSize, buffsByCategory, badgeSize, gap, '#7fd69a');
    this.drawBuffRow(sx, sy + badgeSize + 4, cellSize, debuffsByCategory, badgeSize, gap, '#ff9072');
  }

  private drawBuffRow(
    sx: number,
    y: number,
    cellSize: number,
    buffs: VisibleBuffState[],
    badgeSize: number,
    gap: number,
    fallbackColor: string,
  ) {
    if (!this.ctx || buffs.length === 0) return;
    const ctx = this.ctx;
    const visibleLimit = 4;
    const displayed = buffs.slice(0, visibleLimit);
    const overflow = buffs.length - displayed.length;
    const badges = overflow > 0
      ? [...displayed.slice(0, Math.max(0, visibleLimit - 1)), {
          buffId: '__overflow__',
          name: `其余 ${overflow} 项`,
          shortMark: `+${overflow}`,
          category: 'buff' as const,
          visibility: 'public' as const,
          remainingTicks: 0,
          duration: 0,
          stacks: 1,
          maxStacks: 1,
          sourceSkillId: '',
        }]
      : displayed;
    const totalWidth = badges.length * badgeSize + Math.max(0, badges.length - 1) * gap;
    let x = sx + Math.round((cellSize - totalWidth) / 2);
    for (const buff of badges) {
      const accent = buff.color ?? fallbackColor;
      const centerX = x + badgeSize / 2;
      const centerY = y + badgeSize / 2;
      const ratio = buff.duration > 0 ? Math.max(0, Math.min(1, buff.remainingTicks / buff.duration)) : 1;
      ctx.save();
      ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
      ctx.strokeStyle = 'rgba(250, 244, 233, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, badgeSize, badgeSize, 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, badgeSize * 0.62, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();

      if (buff.duration > 0) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, badgeSize * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      }

      ctx.fillStyle = '#f7f0dd';
      ctx.font = `bold ${Math.max(6, badgeSize * 0.62)}px "Noto Serif SC", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(buff.shortMark, centerX, centerY + 0.5);

      if (buff.stacks > 1) {
        ctx.fillStyle = '#ffd76f';
        ctx.font = `bold ${Math.max(5, badgeSize * 0.42)}px "Noto Serif SC", serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${buff.stacks}`, x + badgeSize - 1, y);
      }
      ctx.restore();
      x += badgeSize + gap;
    }
  }

  private drawNpcQuestMarker(sx: number, sy: number, cellSize: number, marker: NpcQuestMarker) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const centerX = sx + cellSize + Math.max(8, cellSize * 0.18);
    const centerY = sy + Math.max(9, cellSize * 0.18);
    const size = Math.max(8, cellSize * 0.18);
    const symbol = marker.state === 'ready' ? '?' : marker.state === 'active' ? '…' : '!';
    const palette = this.getNpcQuestMarkerPalette(marker);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.fillStyle = palette.fill;
    ctx.strokeStyle = palette.stroke;

    switch (palette.shape) {
      case 'square':
        ctx.beginPath();
        ctx.roundRect(centerX - size, centerY - size, size * 2, size * 2, Math.max(3, size * 0.45));
        ctx.fill();
        ctx.stroke();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size);
        ctx.lineTo(centerX + size, centerY);
        ctx.lineTo(centerX, centerY + size);
        ctx.lineTo(centerX - size, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.9, centerY - size * 0.7);
        ctx.quadraticCurveTo(centerX, centerY - size * 1.2, centerX + size * 0.9, centerY - size * 0.7);
        ctx.lineTo(centerX + size * 0.8, centerY + size * 0.25);
        ctx.quadraticCurveTo(centerX, centerY + size * 1.2, centerX - size * 0.8, centerY + size * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'circle':
      default:
        ctx.beginPath();
        ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
    }

    ctx.fillStyle = palette.text;
    ctx.font = `bold ${Math.max(11, cellSize * 0.26)}px "Noto Serif SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, centerX, centerY + 0.5);
    ctx.restore();
  }

  private getNpcQuestMarkerPalette(marker: NpcQuestMarker): {
    fill: string;
    stroke: string;
    text: string;
    shape: 'circle' | 'square' | 'diamond' | 'shield';
  } {
    switch (marker.line) {
      case 'main':
        return { fill: 'rgba(236, 179, 55, 0.95)', stroke: '#fff0b0', text: '#3d2500', shape: 'circle' };
      case 'daily':
        return { fill: 'rgba(84, 188, 125, 0.95)', stroke: '#d5ffe2', text: '#0f3420', shape: 'square' };
      case 'encounter':
        return { fill: 'rgba(217, 88, 88, 0.95)', stroke: '#ffd7cf', text: '#3f0e0e', shape: 'diamond' };
      case 'side':
      default:
        return { fill: 'rgba(84, 156, 222, 0.95)', stroke: '#d8f1ff', text: '#0d2337', shape: 'shield' };
    }
  }

  /** 添加浮动文字特效（伤害数字或动作提示） */
  addFloatingText(x: number, y: number, text: string, color = '#ffd27a', variant: 'damage' | 'action' = 'damage') {
    this.floatingTexts.push({
      id: this.nextFloatingTextId++,
      x,
      y,
      text,
      color,
      variant,
      createdAt: performance.now(),
      duration: variant === 'action' ? 1000 : 850,
    });
  }

  /** 添加攻击拖尾特效（从攻击者到目标的箭头线段） */
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

  /** 绘制所有浮动文字，自动清理过期条目 */
  renderFloatingTexts(camera: Camera) {
    if (!this.ctx || this.floatingTexts.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();

    this.floatingTexts = this.floatingTexts.filter((entry) => now - entry.createdAt < entry.duration);
    const groups = new Map<string, FloatingText[]>();
    for (const entry of this.floatingTexts) {
      const key = `${entry.x},${entry.y},${entry.variant}`;
      const group = groups.get(key);
      if (group) {
        group.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    for (const group of groups.values()) {
      group.sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
    }

    for (const entry of this.floatingTexts) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const motionProgress = entry.variant === 'action' ? progress * progress : progress;
      const rise = entry.variant === 'action'
        ? cellSize * (0.08 + motionProgress * 0.46)
        : cellSize * (0.2 + progress * 0.8);
      const alpha = 1 - progress;
      const worldX = entry.x * cellSize;
      const worldY = entry.y * cellSize;
      const { sx, sy } = camera.worldToScreen(worldX, worldY, sw, sh);
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
      const group = groups.get(`${entry.x},${entry.y},${entry.variant}`) ?? [entry];
      const index = group.findIndex((item) => item.id === entry.id);
      const burst = this.getFloatingTextBurstOffset(index, group.length, cellSize);

      ctx.save();
      ctx.globalAlpha = alpha;
      if (entry.variant === 'action') {
        const fontSize = Math.max(10, cellSize * 0.28);
        const scale = 0.98 + motionProgress * 0.08;
        ctx.translate(
          sx - cellSize * 0.06 + burst.offsetX,
          sy - cellSize * 0.08 - rise - burst.offsetY,
        );
        ctx.scale(scale, scale);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${fontSize}px "Ma Shan Zheng", cursive`;
        this.drawOutlinedVerticalText(
          entry.text,
          0,
          0,
          entry.color,
          'rgba(15,12,10,0.9)',
          fontSize * 1.12,
        );
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `bold ${Math.max(14, cellSize * 0.45)}px "Noto Serif SC", serif`;
        this.drawOutlinedText(
          entry.text,
          sx + cellSize / 2 + burst.offsetX,
          sy - rise - burst.offsetY,
          entry.color,
          'rgba(15,12,10,0.95)',
        );
      }
      ctx.restore();
    }
  }

  /** 绘制所有攻击拖尾，自动清理过期条目 */
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

  private getFloatingTextBurstOffset(index: number, count: number, cellSize: number): FloatingTextBurstOffset {
    if (count <= 1 || index < 0) {
      return { offsetX: 0, offsetY: 0 };
    }
    const horizontalStep = cellSize * 0.3;
    const verticalStep = cellSize * 0.12;
    const centeredIndex = index - (count - 1) / 2;
    return {
      offsetX: centeredIndex * horizontalStep,
      offsetY: Math.abs(centeredIndex) * verticalStep,
    };
  }

  private renderPathArrows(
    camera: Camera,
    visibleTiles: Set<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ) {
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
      if (
        !this.isPathCellRenderable(from.x, from.y, visibleTiles, playerX, playerY, displayRangeX, displayRangeY)
        && !this.isPathCellRenderable(to.x, to.y, visibleTiles, playerX, playerY, displayRangeX, displayRangeY)
      ) {
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

  private isPathCellRenderable(
    x: number,
    y: number,
    visibleTiles: Set<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ): boolean {
    const key = `${x},${y}`;
    return visibleTiles.has(key) || (Math.abs(x - playerX) <= displayRangeX && Math.abs(y - playerY) <= displayRangeY);
  }

  private renderTimeOverlay(time: GameTimeState | null): void {
    if (!this.ctx || !time || time.overlayAlpha <= 0) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.toOverlayColor(time.tint, time.overlayAlpha);
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  private toOverlayColor(hex: string, alpha: number): string {
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value.padEnd(6, '0').slice(0, 6);
    const red = Number.parseInt(normalized.slice(0, 2), 16) || 0;
    const green = Number.parseInt(normalized.slice(2, 4), 16) || 0;
    const blue = Number.parseInt(normalized.slice(4, 6), 16) || 0;
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    return `rgba(${red}, ${green}, ${blue}, ${safeAlpha.toFixed(3)})`;
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

  private drawOutlinedVerticalText(text: string, x: number, y: number, fill: string, stroke: string, lineHeight: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const chars = [...text.trim()].filter((char) => char.trim().length > 0);
    if (chars.length === 0) {
      return;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    chars.forEach((char, index) => {
      const drawY = y + lineHeight * index;
      ctx.strokeText(char, x, drawY);
      ctx.fillText(char, x, drawY);
    });
  }
}
