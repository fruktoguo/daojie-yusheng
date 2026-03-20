import { MapMeta, Tile } from '@mud/shared';
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
  private getTileAt: ((x: number, y: number) => Tile | null) | null = null;
  private getEntities: (() => { id: string; wx: number; wy: number; kind?: string }[]) | null = null;
  private getMapMeta: (() => MapMeta | null) | null = null;
  private onTarget: ((target: ClickTarget) => void) | null = null;
  private onHover: ((target: ClickTarget | null) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;

  init(
    canvas: HTMLCanvasElement,
    getCamera: () => Camera,
    getTileAt: (x: number, y: number) => Tile | null,
    getEntities: () => { id: string; wx: number; wy: number; kind?: string }[],
    getMapMeta: () => MapMeta | null,
    onTarget: (target: ClickTarget) => void,
    onHover?: (target: ClickTarget | null) => void,
  ) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.getTileAt = getTileAt;
    this.getEntities = getEntities;
    this.getMapMeta = getMapMeta;
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
    if (!this.canvas || !this.getCamera || !this.getTileAt || !this.getEntities || !this.getMapMeta || !this.onTarget) return null;

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

    const tile = this.getTileAt(worldGX, worldGY);
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
