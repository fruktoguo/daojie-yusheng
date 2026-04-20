/**
 * 显示参数管理。
 * 统一维护地图缩放与可视范围的运行时状态，供运行时和渲染层查询。
 */

import { BASE_CELL_SIZE, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './constants/visuals/display';

/** 地图缩放持久化 Key。 */
const MAP_ZOOM_STORAGE_KEY = 'mud:map-zoom';
/** 未设置时的默认地图缩放。 */
const MAP_DEFAULT_ZOOM = 2;

/** 把缩放值钳制到最小与最大合法区间，并保留两位小数。 */
function clampZoom(value: number): number {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  return Number(clamped.toFixed(2));
}

/** 读取本地持久化缩放值，回退到默认缩放。 */
function readStoredZoom(): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof window === 'undefined' || !window.localStorage) {
    return MAP_DEFAULT_ZOOM;
  }
  const raw = window.localStorage.getItem(MAP_ZOOM_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAP_DEFAULT_ZOOM;
  }
  return clampZoom(parsed);
}

/** 写入本地持久化缩放值。 */
function persistZoom(nextZoom: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(nextZoom));
}

/** 当前生效的地图缩放。 */
let zoom = readStoredZoom();
/** 当前每格像素尺寸。 */
let cellSize = BASE_CELL_SIZE * zoom;
/** 当前视野横向可见半径。 */
let displayRangeX = 10;
/** 当前视野纵向可见半径。 */
let displayRangeY = 10;

export { MAX_ZOOM, MIN_ZOOM };

/** 读取当前地图缩放倍率。 */
export function getZoom(): number {
  return zoom;
}

/** 按固定步长循环切换缩放倍率（达到上限后回到下限）。 */
export function cycleZoom(): number {
  /** 当前缩放已在会话中缓存，切换后立即持久化。 */
  zoom = zoom >= MAX_ZOOM ? MIN_ZOOM : clampZoom(zoom + ZOOM_STEP);
  persistZoom(zoom);
  return zoom;
}

/** 设置缩放倍率，自动钳位并持久化。 */
export function setZoom(level: number): number {
  zoom = clampZoom(level);
  persistZoom(zoom);
  return zoom;
}

/** 按相对增量调整缩放倍率。 */
export function adjustZoom(delta: number): number {
  zoom = clampZoom(zoom + delta);
  persistZoom(zoom);
  return zoom;
}

/** 获取当前每格像素尺寸。 */
export function getCellSize(): number {
  return cellSize;
}

/** 根据逻辑视野和缩放倍率计算可视格子半径。 */
export function getDisplayRadius(baseRadius: number): number {
  const safeBaseRadius = Math.max(1, Math.round(baseRadius));
  return Math.max(1, Math.ceil((safeBaseRadius * DEFAULT_ZOOM) / zoom));
}

/** 根据视口尺寸和视野半径重算格子像素尺寸与 X/Y 方向可视格数 */
export function updateDisplayMetrics(viewportWidth: number, viewportHeight: number, baseRadius: number): void {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const targetRadius = getDisplayRadius(baseRadius);
  const diameter = targetRadius * 2 + 1;
  const desiredCellSize = BASE_CELL_SIZE * (zoom / DEFAULT_ZOOM);
  const fitCellSize = Math.min(safeWidth, safeHeight) / diameter;
  /** 根据窗口和缩放回算每格像素。 */
  cellSize = Math.max(1, Math.min(desiredCellSize, fitCellSize));
  /** 窗口宽度限制下的横向可见半径。 */
  displayRangeX = Math.max(targetRadius, Math.ceil(safeWidth / (cellSize * 2)));
  /** 窗口高度限制下的纵向可见半径。 */
  displayRangeY = Math.max(targetRadius, Math.ceil(safeHeight / (cellSize * 2)));
}

/** 读取横向可见半径（从玩家到边缘格数）。 */
export function getDisplayRangeX(): number {
  return displayRangeX;
}

/** 读取纵向可见半径（从玩家到边缘格数）。 */
export function getDisplayRangeY(): number {
  return displayRangeY;
}



