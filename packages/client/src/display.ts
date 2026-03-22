/**
 * 显示参数管理 —— 缩放倍率、格子像素尺寸与可视范围计算
 */

const BASE_CELL_SIZE = 32;
let zoom = 2;
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
let cellSize = BASE_CELL_SIZE * zoom;
let displayRangeX = 10;
let displayRangeY = 10;

/** 获取当前缩放倍率 */
export function getZoom(): number {
  return zoom;
}

/** 循环切换缩放倍率（到最大后回到最小） */
export function cycleZoom(): number {
  zoom = zoom >= MAX_ZOOM ? MIN_ZOOM : zoom + 1;
  return zoom;
}

/** 按增量调整缩放倍率，自动钳位到合法范围 */
export function adjustZoom(delta: number): number {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
  return zoom;
}

/** 获取当前每格像素尺寸 */
export function getCellSize(): number {
  return cellSize;
}

/** 根据基础视野半径和缩放倍率计算实际显示半径 */
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
  cellSize = Math.max(1, Math.min(safeWidth, safeHeight) / diameter);
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
