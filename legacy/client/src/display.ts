/**
 * 显示参数管理 —— 缩放倍率、格子像素尺寸与可视范围计算
 */

import { BASE_CELL_SIZE, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './constants/visuals/display';

const MAP_ZOOM_STORAGE_KEY = 'mud:map-zoom';
const MAP_DEFAULT_ZOOM = 2;


function clampZoom(value: number): number {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  return Number(clamped.toFixed(2));
}


function readStoredZoom(): number {
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


function persistZoom(nextZoom: number): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(nextZoom));
}

let zoom = readStoredZoom();
let cellSize = BASE_CELL_SIZE * zoom;
let displayRangeX = 10;
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

