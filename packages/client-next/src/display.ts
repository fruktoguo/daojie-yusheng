/**
 * 显示参数管理 —— 缩放倍率、格子像素尺寸与可视范围计算
 */

import { BASE_CELL_SIZE, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './constants/visuals/display';

/** MAP_ZOOM_STORAGE_KEY：定义该变量以承载业务值。 */
const MAP_ZOOM_STORAGE_KEY = 'mud:map-zoom';
/** MAP_DEFAULT_ZOOM：定义该变量以承载业务值。 */
const MAP_DEFAULT_ZOOM = 2;

/** clampZoom：执行对应的业务逻辑。 */
function clampZoom(value: number): number {
/** clamped：定义该变量以承载业务值。 */
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  return Number(clamped.toFixed(2));
}

/** readStoredZoom：执行对应的业务逻辑。 */
function readStoredZoom(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return MAP_DEFAULT_ZOOM;
  }
/** raw：定义该变量以承载业务值。 */
  const raw = window.localStorage.getItem(MAP_ZOOM_STORAGE_KEY);
/** parsed：定义该变量以承载业务值。 */
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAP_DEFAULT_ZOOM;
  }
  return clampZoom(parsed);
}

/** persistZoom：执行对应的业务逻辑。 */
function persistZoom(nextZoom: number): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(nextZoom));
}

/** zoom：定义该变量以承载业务值。 */
let zoom = readStoredZoom();
/** cellSize：定义该变量以承载业务值。 */
let cellSize = BASE_CELL_SIZE * zoom;
/** displayRangeX：定义该变量以承载业务值。 */
let displayRangeX = 10;
/** displayRangeY：定义该变量以承载业务值。 */
let displayRangeY = 10;

export { MAX_ZOOM, MIN_ZOOM };

/** 获取当前缩放倍率 */
export function getZoom(): number {
  return zoom;
}

/** 循环切换缩放倍率（到最大后回到最小） */
export function cycleZoom(): number {
  zoom = zoom >= MAX_ZOOM ? MIN_ZOOM : clampZoom(zoom + ZOOM_STEP);
  persistZoom(zoom);
  return zoom;
}

/** 直接设置缩放倍率，自动钳位到合法范围 */
export function setZoom(level: number): number {
  zoom = clampZoom(level);
  persistZoom(zoom);
  return zoom;
}

/** 按增量调整缩放倍率，自动钳位到合法范围 */
export function adjustZoom(delta: number): number {
  zoom = clampZoom(zoom + delta);
  persistZoom(zoom);
  return zoom;
}

/** 获取当前每格像素尺寸 */
export function getCellSize(): number {
  return cellSize;
}

/** 根据基础视野半径和缩放倍率计算实际显示半径 */
export function getDisplayRadius(baseRadius: number): number {
/** safeBaseRadius：定义该变量以承载业务值。 */
  const safeBaseRadius = Math.max(1, Math.round(baseRadius));
  return Math.max(1, Math.ceil((safeBaseRadius * DEFAULT_ZOOM) / zoom));
}

/** 根据视口尺寸和视野半径重算格子像素尺寸与 X/Y 方向可视格数 */
export function updateDisplayMetrics(viewportWidth: number, viewportHeight: number, baseRadius: number): void {
/** safeWidth：定义该变量以承载业务值。 */
  const safeWidth = Math.max(1, viewportWidth);
/** safeHeight：定义该变量以承载业务值。 */
  const safeHeight = Math.max(1, viewportHeight);
/** targetRadius：定义该变量以承载业务值。 */
  const targetRadius = getDisplayRadius(baseRadius);
/** diameter：定义该变量以承载业务值。 */
  const diameter = targetRadius * 2 + 1;
/** desiredCellSize：定义该变量以承载业务值。 */
  const desiredCellSize = BASE_CELL_SIZE * (zoom / DEFAULT_ZOOM);
/** fitCellSize：定义该变量以承载业务值。 */
  const fitCellSize = Math.min(safeWidth, safeHeight) / diameter;
  cellSize = Math.max(1, Math.min(desiredCellSize, fitCellSize));
  displayRangeX = Math.max(targetRadius, Math.ceil(safeWidth / (cellSize * 2)));
  displayRangeY = Math.max(targetRadius, Math.ceil(safeHeight / (cellSize * 2)));
}

/** 获取 X 方向可视格数（从中心到边缘） */
export function getDisplayRangeX(): number {
  return displayRangeX;
}

/** 获取 Y 方向可视格数（从中心到边缘） */
export function getDisplayRangeY(): number {
  return displayRangeY;
}

