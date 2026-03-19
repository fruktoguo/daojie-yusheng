import { MapMeta, VisibleTile } from '@mud/shared';
import { Camera } from '../renderer/camera';
import { getCellSize } from '../display';

interface ClickTarget {
  x: number;
  y: number;
  entityId?: string;
  entityKind?: string;
  walkable?: boolean;
}

export class MouseInput {
  private getCamera: (() => Camera) | null = null;
  private getTiles: (() => VisibleTile[][]) | null = null;
  private getEntities: (() => { id: string; wx: number; wy: number; kind?: string }[]) | null = null;
  private getMapMeta: (() => MapMeta | null) | null = null;
  private getTileOrigin: (() => { x: number; y: number }) | null = null;
  private onTarget: ((target: ClickTarget) => void) | null = null;
  private onHover: ((target: ClickTarget | null) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;

  init(
    canvas: HTMLCanvasElement,
    getCamera: () => Camera,
    getTiles: () => VisibleTile[][],
    getEntities: () => { id: string; wx: number; wy: number; kind?: string }[],
    getMapMeta: () => MapMeta | null,
    getTileOrigin: () => { x: number; y: number },
    onTarget: (target: ClickTarget) => void,
    onHover?: (target: ClickTarget | null) => void,
  ) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.getTiles = getTiles;
    this.getEntities = getEntities;
    this.getMapMeta = getMapMeta;
    this.getTileOrigin = getTileOrigin;
    this.onTarget = onTarget;
    this.onHover = onHover ?? null;
    canvas.addEventListener('click', (e) => this.onClick(e));
    canvas.addEventListener('mousemove', (e) => this.onMove(e));
    canvas.addEventListener('mouseleave', () => this.onHover?.(null));
  }

  private onClick(e: MouseEvent) {
    const target = this.resolveTargetFromMouse(e);
    if (!target) return;
    this.onTarget?.(target);
  }

  private onMove(e: MouseEvent) {
    this.onHover?.(this.resolveTargetFromMouse(e));
  }

  private resolveTargetFromMouse(e: MouseEvent): ClickTarget | null {
    if (!this.canvas || !this.getCamera || !this.getTiles || !this.getEntities || !this.getMapMeta || !this.getTileOrigin || !this.onTarget) return null;

    const cam = this.getCamera();
    const rect = this.canvas.getBoundingClientRect();
    const sw = this.canvas.width;
    const sh = this.canvas.height;

    // 屏幕像素坐标
    const screenX = (e.clientX - rect.left) * (sw / rect.width);
    const screenY = (e.clientY - rect.top) * (sh / rect.height);

    // 屏幕像素 → 世界像素 → 世界格子
    const worldPX = screenX - sw / 2 + cam.x;
    const worldPY = screenY - sh / 2 + cam.y;
    const cellSize = getCellSize();
    const worldGX = Math.floor(worldPX / cellSize);
    const worldGY = Math.floor(worldPY / cellSize);

    const mapMeta = this.getMapMeta();
    if (!mapMeta) return null;
    if (worldGX < 0 || worldGX >= mapMeta.width || worldGY < 0 || worldGY >= mapMeta.height) {
      return null;
    }

    const origin = this.getTileOrigin();
    const tileIdxX = worldGX - origin.x;
    const tileIdxY = worldGY - origin.y;

    const tiles = this.getTiles();
    const rows = tiles.length;
    const cols = rows > 0 ? tiles[0].length : 0;

    if (tileIdxX < 0 || tileIdxX >= cols || tileIdxY < 0 || tileIdxY >= rows) {
      return this.buildTarget(worldGX, worldGY, true);
    }

    const tile = tiles[tileIdxY]?.[tileIdxX];
    return this.buildTarget(worldGX, worldGY, tile?.walkable ?? false);
  }

  private buildTarget(x: number, y: number, walkable: boolean): ClickTarget {
    if (!this.getEntities) {
      return { x, y, walkable };
    }
    const entity = this.getEntities().find((entry) => entry.wx === x && entry.wy === y);
    return {
      x,
      y,
      entityId: entity?.id,
      entityKind: entity?.kind,
      walkable,
    };
  }
}
