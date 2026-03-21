const BASE_CELL_SIZE = 32;
let zoom = 2;
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
let cellSize = BASE_CELL_SIZE * zoom;
let displayRangeX = 10;
let displayRangeY = 10;

export function getZoom(): number {
  return zoom;
}

export function cycleZoom(): number {
  zoom = zoom >= MAX_ZOOM ? MIN_ZOOM : zoom + 1;
  return zoom;
}

export function adjustZoom(delta: number): number {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
  return zoom;
}

export function getCellSize(): number {
  return cellSize;
}

export function getDisplayRadius(baseRadius: number): number {
  const safeBaseRadius = Math.max(1, Math.round(baseRadius));
  return Math.max(1, Math.ceil((safeBaseRadius * DEFAULT_ZOOM) / zoom));
}

export function updateDisplayMetrics(viewportWidth: number, viewportHeight: number, baseRadius: number): void {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const targetRadius = getDisplayRadius(baseRadius);
  const diameter = targetRadius * 2 + 1;
  cellSize = Math.max(1, Math.min(safeWidth, safeHeight) / diameter);
  displayRangeX = Math.max(targetRadius, Math.ceil(safeWidth / (cellSize * 2)));
  displayRangeY = Math.max(targetRadius, Math.ceil(safeHeight / (cellSize * 2)));
}

export function getDisplayRangeX(): number {
  return displayRangeX;
}

export function getDisplayRangeY(): number {
  return displayRangeY;
}
