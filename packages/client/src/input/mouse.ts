/**
 * 鼠标输入处理 —— 将画布点击/悬停转换为世界格子坐标与实体目标
 */

import { MapMeta, Tile } from '@mud/shared-next';
import { Camera } from '../renderer/camera';
import { getCellSize } from '../display';

/** ClickTarget：定义该接口的能力与字段约束。 */
interface ClickTarget {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  clientX?: number;
  clientY?: number;
  entityId?: string;
  entityKind?: string;
  walkable?: boolean;
}

/** 鼠标输入，将画布上的点击和悬停事件解析为游戏世界中的目标 */
export class MouseInput {
  private getCamera: (() => Camera) | null = null;
  private getTileAt: ((x: number, y: number) => Tile | null) | null = null;
  private getEntities: (() => { id: string; wx: number; wy: number; kind?: string }[]) | null = null;
  private getMapMeta: (() => MapMeta | null) | null = null;
  private onTarget: ((target: ClickTarget) => void) | null = null;
  private onHover: ((target: ClickTarget | null) => void) | null = null;
/** canvas：定义该变量以承载业务值。 */
  private canvas: HTMLCanvasElement | null = null;

  /** 初始化鼠标监听，绑定画布事件和坐标转换所需的依赖 */
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

/** onClick：处理当前场景中的对应操作。 */
  private onClick(e: MouseEvent) {
/** target：定义该变量以承载业务值。 */
    const target = this.resolveTargetFromMouse(e);
    if (!target) return;
    this.onTarget?.(target);
  }

/** onMove：处理当前场景中的对应操作。 */
  private onMove(e: MouseEvent) {
    this.onHover?.(this.resolveTargetFromMouse(e));
  }

  /** 将鼠标事件的屏幕坐标转换为世界格子坐标，并查找该格上的实体 */
  private resolveTargetFromMouse(e: MouseEvent): ClickTarget | null {
    if (!this.canvas || !this.getCamera || !this.getTileAt || !this.getEntities || !this.getMapMeta || !this.onTarget) return null;

/** cam：定义该变量以承载业务值。 */
    const cam = this.getCamera();
/** rect：定义该变量以承载业务值。 */
    const rect = this.canvas.getBoundingClientRect();
/** sw：定义该变量以承载业务值。 */
    const sw = this.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = this.canvas.height;

    // 屏幕像素坐标
    const screenX = (e.clientX - rect.left) * (sw / rect.width);
/** screenY：定义该变量以承载业务值。 */
    const screenY = (e.clientY - rect.top) * (sh / rect.height);

    // 屏幕像素 → 世界像素 → 世界格子
    const worldPX = screenX - sw / 2 + cam.x;
/** worldPY：定义该变量以承载业务值。 */
    const worldPY = screenY - sh / 2 + cam.y;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();
/** worldGX：定义该变量以承载业务值。 */
    const worldGX = Math.floor(worldPX / cellSize);
/** worldGY：定义该变量以承载业务值。 */
    const worldGY = Math.floor(worldPY / cellSize);

/** tile：定义该变量以承载业务值。 */
    const tile = this.getTileAt(worldGX, worldGY);
/** entity：定义该变量以承载业务值。 */
    const entity = this.getEntities().find((entry) => entry.wx === worldGX && entry.wy === worldGY);
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = this.getMapMeta();
/** inCurrentMapBounds：定义该变量以承载业务值。 */
    const inCurrentMapBounds = mapMeta
      ? worldGX >= 0 && worldGX < mapMeta.width && worldGY >= 0 && worldGY < mapMeta.height
      : false;

    if (!inCurrentMapBounds && !tile && !entity) {
      return null;
    }
    return this.buildTarget(worldGX, worldGY, tile?.walkable ?? false, e.clientX, e.clientY, entity);
  }

  private buildTarget(
    x: number,
    y: number,
    walkable: boolean,
    clientX?: number,
    clientY?: number,
    entity?: { id: string; wx: number; wy: number; kind?: string },
  ): ClickTarget {
    if (!this.getEntities) {
      return { x, y, clientX, clientY, walkable };
    }
    return {
      x,
      y,
      clientX,
      clientY,
      entityId: entity?.id,
      entityKind: entity?.kind,
      walkable,
    };
  }
}

