/**
 * 鼠标输入处理 —— 将画布点击/悬停转换为世界格子坐标与实体目标
 */

import { MapMeta, Tile } from '@mud/shared';
import { Camera } from '../renderer/camera';
import { getCellSize } from '../display';

/** 鼠标命中结果，包含坐标、实体和可交互状态。 */
interface ClickTarget {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * clientX：clientX相关字段。
 */

  clientX?: number;  
  /**
 * clientY：clientY相关字段。
 */

  clientY?: number;  
  /**
 * entityId：entityID标识。
 */

  entityId?: string;  
  /**
 * entityKind：entityKind相关字段。
 */

  entityKind?: string;  
  /**
 * walkable：walkable相关字段。
 */

  walkable?: boolean;
}

/**
 * 鼠标输入模块。
 * 负责把画布上的坐标事件映射到世界坐标并落到格子/实体上。
 */
export class MouseInput {
  /** 懒加载获取当前相机。 */
  private getCamera: (() => Camera) | null = null;
  /** 懒加载获取指定世界坐标的地块。 */
  private getTileAt: ((x: number, y: number) => Tile | null) | null = null;  
  /**
 * getEntities：getEntity相关字段。
 */

  private getEntities: (() => {  
  /**
 * id：ID标识。
 */
 id: string;  
 /**
 * wx：wx相关字段。
 */
 wx: number;  
 /**
 * wy：wy相关字段。
 */
 wy: number;  
 /**
 * kind：kind相关字段。
 */
 kind?: string }[]) | null = null;
  /** 懒加载获取当前地图元信息。 */
  private getMapMeta: (() => MapMeta | null) | null = null;
  /** 点击目标回调。 */
  private onTarget: ((target: ClickTarget) => void) | null = null;
  /** 悬停目标回调。 */
  private onHover: ((target: ClickTarget | null) => void) | null = null;
  /** 当前监听事件的画布。 */
  private canvas: HTMLCanvasElement | null = null;

  /** 初始化鼠标监听，绑定画布事件和坐标转换所需的依赖 */
  init(
    canvas: HTMLCanvasElement,
    getCamera: () => Camera,
    getTileAt: (x: number, y: number) => Tile | null,
    getEntities: () => {    
    /**
 * id：ID标识。
 */
 id: string;    
 /**
 * wx：wx相关字段。
 */
 wx: number;    
 /**
 * wy：wy相关字段。
 */
 wy: number;    
 /**
 * kind：kind相关字段。
 */
 kind?: string }[],
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

  /** 把点击位置解析为目标并触发回调。 */
  private onClick(e: MouseEvent) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = this.resolveTargetFromMouse(e);
    if (!target) return;
    this.onTarget?.(target);
  }

  /** 持续更新悬停目标。 */
  private onMove(e: MouseEvent) {
    this.onHover?.(this.resolveTargetFromMouse(e));
  }

  /** 将鼠标事件的屏幕坐标转换为世界格子坐标，并查找该格上的实体 */
  private resolveTargetFromMouse(e: MouseEvent): ClickTarget | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

    const tile = this.getTileAt(worldGX, worldGY);
    const entity = this.getEntities().find((entry) => entry.wx === worldGX && entry.wy === worldGY);
    const mapMeta = this.getMapMeta();
    const inCurrentMapBounds = mapMeta
      ? worldGX >= 0 && worldGX < mapMeta.width && worldGY >= 0 && worldGY < mapMeta.height
      : false;

    if (!inCurrentMapBounds && !tile && !entity) {
      return null;
    }
    return this.buildTarget(worldGX, worldGY, tile?.walkable ?? false, e.clientX, e.clientY, entity);
  }  
  /**
 * buildTarget：构建并返回目标对象。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param walkable boolean 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @param entity { id: string; wx: number; wy: number; kind?: string } 参数说明。
 * @returns 返回目标。
 */


  private buildTarget(
    x: number,
    y: number,
    walkable: boolean,
    clientX?: number,
    clientY?: number,
    entity?: {    
    /**
 * id：ID标识。
 */
 id: string;    
 /**
 * wx：wx相关字段。
 */
 wx: number;    
 /**
 * wy：wy相关字段。
 */
 wy: number;    
 /**
 * kind：kind相关字段。
 */
 kind?: string },
  ): ClickTarget {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
