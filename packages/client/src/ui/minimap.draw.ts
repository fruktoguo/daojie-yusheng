/**
 * minimap.draw.ts — 从 minimap.ts 拆分的小地图绘制（draw）域方法。
 *
 * 包含基础画布构建、overlay/弹窗地图绘制、视口换算、坐标解析、
 * 标记/地面物品/HUD 绘制等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: Minimap, ...) 形式导出，
 * 由 minimap.ts 主类中的同名 private 方法一行委托调用。
 */
import {
  type GroundItemPileView,
  type MapMinimapMarker,
  type Tile,
  TileType,
  MINIMAP_MARKER_COLORS,
  TILE_MINIMAP_COLORS,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
} from '@mud/shared';
import type { Minimap, DisplayMapScene, ViewportMetrics } from './minimap';
import {
  buildMinimapDrawExtent,
  clamp,
  ensureCanvasSize,
  getCanvasPixels,
  parseTileKey,
} from './minimap';
import { getMinimapMarkerKindLabel, getTileTypeLabel } from '../domain-labels';
import { buildCanvasFont } from '../constants/ui/text';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
export function buildTileCacheHashImpl(self: Minimap, tileCache: ReadonlyMap<string, Tile>): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let hash = 0;
    for (const [key, tile] of tileCache.entries()) {
      for (let index = 0; index < key.length; index += 1) {
        hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
      }
      for (let index = 0; index < tile.type.length; index += 1) {
        hash = (hash * 33 + tile.type.charCodeAt(index)) >>> 0;
      }
    }
    return `${tileCache.size}:${hash}`;
  }

  /** buildBaseKey：构建基础Key。 */
export function buildBaseKeyImpl(self: Minimap, display: DisplayMapScene): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const extent = buildMinimapDrawExtent(display);
    if (display.isCurrent) {
      const snapshotKey = display.snapshot
        ? `snapshot:${display.snapshot.width}:${display.snapshot.height}:${display.snapshot.terrainRows.length}:${display.snapshot.markers.length}`
        : 'memory';
      return `current:${display.mapId}:${display.displayMode}:${snapshotKey}:${display.memoryVersion}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}`;
    }
    if (display.snapshot) {
      return `snapshot:${display.mapId}:${display.snapshot.width}:${display.snapshot.height}:${display.snapshot.terrainRows.length}:${display.snapshot.markers.length}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}:${self.buildTileCacheHash(display.tileCache)}`;
    }
    return `memory:${display.mapId}:${self.buildTileCacheHash(display.tileCache)}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}`;
  }

  /** ensureBaseCanvas：确保基础Canvas。 */
export function ensureBaseCanvasImpl(self: Minimap, display: DisplayMapScene): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.baseCtx) {
      return;
    }

    const nextKey = self.buildBaseKey(display);
    if (self.baseKey === nextKey) {
      return;
    }
    self.baseKey = nextKey;

    const extent = buildMinimapDrawExtent(display);
    self.baseCanvas.width = extent.width;
    self.baseCanvas.height = extent.height;
    self.baseCtx.clearRect(0, 0, self.baseCanvas.width, self.baseCanvas.height);
    self.baseCtx.fillStyle = '#0d0f12';
    self.baseCtx.fillRect(0, 0, self.baseCanvas.width, self.baseCanvas.height);

    if (display.snapshot && display.snapshot.terrainRows.length > 0) {
      for (let y = 0; y < display.snapshot.terrainRows.length; y += 1) {
        const row = display.snapshot.terrainRows[y] ?? '';
        for (let x = 0; x < row.length; x += 1) {
          const type = getTileTypeFromMapChar(row[x] ?? '.');
          self.baseCtx.fillStyle = TILE_MINIMAP_COLORS[type] ?? '#888';
          self.baseCtx.fillRect(x - extent.minX, y - extent.minY, 1, 1);
        }
      }
    }

    for (const [key, tile] of display.tileCache.entries()) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      if (
        point.x < extent.minX || point.y < extent.minY
        || point.x > extent.maxX || point.y > extent.maxY
      ) {
        continue;
      }
      self.baseCtx.fillStyle = TILE_MINIMAP_COLORS[tile.type] ?? '#888';
      self.baseCtx.fillRect(point.x - extent.minX, point.y - extent.minY, 1, 1);
    }
  }

  /** renderOverlay：渲染Overlay。 */
export function renderOverlayImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ctx = self.overlayCanvas?.getContext('2d');
    const display = self.getCurrentDisplayScene();
    if (!ctx || !self.overlayCanvas) {
      return;
    }
    if (!display || !display.player || !self.overlayVisible || self.modalOpen) {
      ctx.clearRect(0, 0, self.overlayCanvas.width, self.overlayCanvas.height);
      return;
    }

    ensureCanvasSize(self.overlayCanvas);
    if (self.overlayTitle) {
      self.overlayTitle.textContent = display.snapshot
        ? t('minimap.overlay.title.unlock', { mapName: display.mapMeta.name })
        : t('minimap.overlay.title.memory', { mapName: display.mapMeta.name });
    }
    const metrics = self.getViewportMetrics(self.overlayCanvas, display, false);
    self.drawScene(ctx, display, metrics, false);
  }

  /** renderExpandedMap：绘制已展开的大地图 Canvas，不重建窗口。 */
export function renderExpandedMapImpl(self: Minimap): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ctx = self.modalCanvas?.getContext('2d');
    const display = self.getModalDisplayScene();
    if (!ctx || !self.modalCanvas || !self.modalOpen) {
      return;
    }
    if (!display) {
      ctx.clearRect(0, 0, self.modalCanvas.width, self.modalCanvas.height);
      return;
    }

    ensureCanvasSize(self.modalCanvas);
    const metrics = self.getViewportMetrics(self.modalCanvas, display, true);
    self.modalPanX = metrics.panX;
    self.modalPanY = metrics.panY;
    if (self.modalTitle) {
      self.modalTitle.textContent = display.displayMode === 'unlock'
        ? t('minimap.modal.title.unlock', { mapName: display.mapMeta.name })
        : t('minimap.modal.title.memory', { mapName: display.mapMeta.name });
    }
    self.drawScene(ctx, display, metrics, true);
  }

export function getViewportMetricsImpl(self: Minimap, 
    canvas: HTMLCanvasElement,
    display: DisplayMapScene,
    isModal: boolean,
    zoom = isModal ? self.modalZoom : 1,
    panX = isModal ? self.modalPanX : 0,
    panY = isModal ? self.modalPanY : 0,
  ): ViewportMetrics {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const extent = buildMinimapDrawExtent(display);
    const mapWidth = extent.width;
    const mapHeight = extent.height;
    const padding = isModal
      ? Math.max(18, Math.round(Math.min(width, height) * 0.022))
      : Math.max(8, Math.round(Math.min(width, height) * 0.06));
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);
    const fitScale = Math.min(innerWidth / mapWidth, innerHeight / mapHeight);
    const scale = fitScale * (isModal ? zoom : 1);
    const drawWidth = mapWidth * scale;
    const drawHeight = mapHeight * scale;
    const baseOffsetX = padding + (innerWidth - drawWidth) / 2;
    const baseOffsetY = padding + (innerHeight - drawHeight) / 2;
    const maxPanX = isModal ? Math.max(0, (drawWidth - innerWidth) / 2) : 0;
    const maxPanY = isModal ? Math.max(0, (drawHeight - innerHeight) / 2) : 0;
    const clampedPanX = isModal ? clamp(panX, -maxPanX, maxPanX) : 0;
    const clampedPanY = isModal ? clamp(panY, -maxPanY, maxPanY) : 0;
    return {
      width,
      height,
      innerWidth,
      innerHeight,
      mapWidth,
      mapHeight,
      minX: extent.minX,
      minY: extent.minY,
      padding,
      scale,
      drawWidth,
      drawHeight,
      baseOffsetX,
      baseOffsetY,
      offsetX: baseOffsetX + clampedPanX,
      offsetY: baseOffsetY + clampedPanY,
      panX: clampedPanX,
      panY: clampedPanY,
      maxPanX,
      maxPanY,
    };
  }

  /** resolveWorldPoint：解析世界坐标。 */
export function resolveWorldPointImpl(self: Minimap, metrics: ViewportMetrics, px: number, py: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (
      px < metrics.offsetX
      || py < metrics.offsetY
      || px >= metrics.offsetX + metrics.drawWidth
      || py >= metrics.offsetY + metrics.drawHeight
    ) {
      return null;
    }
    return {
      x: metrics.minX + (px - metrics.offsetX) / metrics.scale,
      y: metrics.minY + (py - metrics.offsetY) / metrics.scale,
    };
  }  
  /**
 * resolveCanvasPoint：判断CanvaPoint是否满足条件。
 * @param canvas HTMLCanvasElement 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @param display DisplayMapScene 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 返回CanvaPoint。
 */


export function resolveCanvasPointImpl(self: Minimap, 
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    display: DisplayMapScene,
    isModal: boolean,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const pixels = getCanvasPixels(canvas, clientX, clientY);
    if (!pixels) {
      return null;
    }
    const metrics = self.getViewportMetrics(canvas, display, isModal);
    const world = self.resolveWorldPoint(metrics, pixels.x, pixels.y);
    if (!world) {
      return null;
    }
    return {
      x: clamp(Math.floor(world.x), metrics.minX, metrics.minX + metrics.mapWidth - 1),
      y: clamp(Math.floor(world.y), metrics.minY, metrics.minY + metrics.mapHeight - 1),
    };
  }  
  /**
 * resolveCurrentMoveTarget：读取当前Move目标并返回结果。
 * @param display DisplayMapScene | null 参数说明。
 * @param canvas HTMLCanvasElement | null 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 返回CurrentMove目标。
 */


export function resolveCurrentMoveTargetImpl(self: Minimap, 
    display: DisplayMapScene | null,
    canvas: HTMLCanvasElement | null,
    clientX: number,
    clientY: number,
    isModal: boolean,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!display || !canvas) {
      return null;
    }
    const point = self.resolveCanvasPoint(canvas, clientX, clientY, display, isModal);
    if (!point) {
      return null;
    }
    const tile = self.getTileAt(display, point.x, point.y);
    const walkable = tile ? tile.walkable : isTileTypeWalkable(self.getTileTypeAt(display, point.x, point.y));
    if (!walkable) {
      return null;
    }
    return point;
  }

  /** getTileAt：读取地块At。 */
export function getTileAtImpl(self: Minimap, display: DisplayMapScene, x: number, y: number): Tile | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const key = `${x},${y}`;
    const current = display.tileCache.get(key);
    if (current) {
      return current;
    }
    const row = display.snapshot?.terrainRows[y] ?? '';
    const type = row[x] ? getTileTypeFromMapChar(row[x]!) : null;
    if (!type) {
      return null;
    }
    return {
      type,
      walkable: isTileTypeWalkable(type),
      blocksSight: false,
      aura: 0,
      occupiedBy: null,
      modifiedAt: null,
    };
  }

  /** getTileTypeAt：读取地块类型At。 */
export function getTileTypeAtImpl(self: Minimap, display: DisplayMapScene, x: number, y: number): TileType {
    return self.getTileAt(display, x, y)?.type ?? TileType.Floor;
  }

  /** getDisplayMarkers：读取显示标记。 */
export function getDisplayMarkersImpl(self: Minimap, display: DisplayMapScene): MapMinimapMarker[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const markers: MapMinimapMarker[] = [];
    const markerIndexByKey = new Map<string, number>();
    const occupiedPointKeys = new Set<string>();
    const pushMarker = (marker: MapMinimapMarker): void => {
      const key = `${marker.kind}:${marker.x},${marker.y}`;
      const existingIndex = markerIndexByKey.get(key);
      if (existingIndex !== undefined) {
        markers[existingIndex] = marker;
        occupiedPointKeys.add(`${marker.x},${marker.y}`);
        return;
      }
      markerIndexByKey.set(key, markers.length);
      markers.push(marker);
      occupiedPointKeys.add(`${marker.x},${marker.y}`);
    };

    for (const marker of display.snapshot?.markers ?? []) {
      if (!display.snapshot && !display.tileCache.has(`${marker.x},${marker.y}`)) {
        continue;
      }
      pushMarker(marker);
    }

    for (const marker of display.rememberedMarkers) {
      pushMarker(marker);
    }

    for (const marker of display.visibleMarkers) {
      pushMarker(marker);
    }

    if (!display.isCurrent) {
      return markers;
    }

    for (const entity of display.visibleEntities) {
      if (!entity.name || entity.kind === 'player') {
        continue;
      }
      if (entity.kind === 'npc') {
        pushMarker({
          id: `live:npc:${entity.id}`,
          kind: 'npc',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: t('minimap.marker.detail.visible-npc', undefined),
        });
        continue;
      }
      if (entity.kind === 'container') {
        pushMarker({
          id: `live:container:${entity.id}`,
          kind: 'container',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: t('minimap.marker.detail.visible-container', undefined),
        });
        continue;
      }
      if (entity.kind === 'monster') {
        pushMarker({
          id: `live:monster:${entity.id}`,
          kind: 'monster_spawn',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: t('minimap.marker.detail.visible-monster', undefined),
        });
      }
    }

    for (const key of display.visibleTiles) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      const type = self.getTileTypeAt(display, point.x, point.y);
      const hasStaticMarkerAtPoint = occupiedPointKeys.has(`${point.x},${point.y}`);
      if (type === TileType.Portal) {
        if (hasStaticMarkerAtPoint) {
          continue;
        }
        pushMarker({
          id: `live:portal:${point.x},${point.y}`,
          kind: 'portal',
          x: point.x,
          y: point.y,
          label: getTileTypeLabel(TileType.Portal),
          detail: t('minimap.marker.detail.visible-portal', undefined),
        });
      } else if (type === TileType.Stairs) {
        if (hasStaticMarkerAtPoint) {
          continue;
        }
        pushMarker({
          id: `live:stairs:${point.x},${point.y}`,
          kind: 'stairs',
          x: point.x,
          y: point.y,
          label: getTileTypeLabel(TileType.Stairs),
          detail: t('minimap.marker.detail.visible-stairs', undefined),
        });
      }
    }

    return markers;
  }  
  /**
 * drawScene：执行drawScene相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 无返回值，直接更新drawScene相关状态。
 */


export function drawSceneImpl(self: Minimap, 
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    isModal: boolean,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    self.ensureBaseCanvas(display);

    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = isModal ? 'rgba(9, 10, 12, 0.8)' : 'rgba(10, 11, 13, 0.84)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(self.baseCanvas, metrics.offsetX, metrics.offsetY, metrics.drawWidth, metrics.drawHeight);
    ctx.imageSmoothingEnabled = true;

    if (display.isCurrent && display.snapshot) {
      for (const key of display.visibleTiles.values()) {
        const point = parseTileKey(key);
        const tile = display.tileCache.get(key);
        if (!point || !tile) {
          continue;
        }
        ctx.fillStyle = TILE_MINIMAP_COLORS[tile.type] ?? '#888';
        ctx.fillRect(
          metrics.offsetX + (point.x - metrics.minX) * metrics.scale,
          metrics.offsetY + (point.y - metrics.minY) * metrics.scale,
          Math.ceil(metrics.scale),
          Math.ceil(metrics.scale),
        );
      }
    }

    if (display.isCurrent) {
      ctx.fillStyle = isModal ? 'rgba(255, 248, 214, 0.12)' : 'rgba(255, 248, 214, 0.18)';
      for (const key of display.visibleTiles.values()) {
        const point = parseTileKey(key);
        if (!point) {
          continue;
        }
        ctx.fillRect(
          metrics.offsetX + (point.x - metrics.minX) * metrics.scale,
          metrics.offsetY + (point.y - metrics.minY) * metrics.scale,
          Math.ceil(metrics.scale),
          Math.ceil(metrics.scale),
        );
      }
    }

    const markers = self.getDisplayMarkers(display);
    const markerSize = clamp(metrics.scale * (isModal ? 0.82 : 0.72), isModal ? 5 : 4, isModal ? 14 : 10);
    for (const marker of markers) {
      self.drawMarker(ctx, marker, metrics, markerSize);
    }

    if (isModal) {
      for (const marker of markers) {
        self.drawMarkerLabel(ctx, marker, metrics);
      }
    }

    if (display.isCurrent) {
      const pileSize = clamp(metrics.scale * 0.52, 3, isModal ? 10 : 8);
      for (const pile of display.groundPiles.values()) {
        self.drawGroundPile(ctx, pile, metrics, pileSize);
      }
    }

    if (display.isCurrent && display.player) {
      const playerLeft = clamp(display.player.x - display.viewRadius, metrics.minX, metrics.minX + metrics.mapWidth);
      const playerTop = clamp(display.player.y - display.viewRadius, metrics.minY, metrics.minY + metrics.mapHeight);
      const playerRight = clamp(display.player.x + display.viewRadius + 1, metrics.minX, metrics.minX + metrics.mapWidth);
      const playerBottom = clamp(display.player.y + display.viewRadius + 1, metrics.minY, metrics.minY + metrics.mapHeight);
      ctx.strokeStyle = isModal ? 'rgba(255, 241, 186, 0.84)' : 'rgba(247, 233, 180, 0.72)';
      ctx.lineWidth = Math.max(1, metrics.scale * 0.18);
      ctx.strokeRect(
        metrics.offsetX + (playerLeft - metrics.minX) * metrics.scale,
        metrics.offsetY + (playerTop - metrics.minY) * metrics.scale,
        Math.max(metrics.scale, (playerRight - playerLeft) * metrics.scale),
        Math.max(metrics.scale, (playerBottom - playerTop) * metrics.scale),
      );

      const playerCenterX = metrics.offsetX + (display.player.x - metrics.minX + 0.5) * metrics.scale;
      const playerCenterY = metrics.offsetY + (display.player.y - metrics.minY + 0.5) * metrics.scale;
      ctx.fillStyle = '#fff7ce';
      ctx.beginPath();
      ctx.arc(playerCenterX, playerCenterY, clamp(metrics.scale * (isModal ? 0.58 : 0.48), 3, isModal ? 10 : 8), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#20140a';
      ctx.lineWidth = Math.max(1, metrics.scale * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#ffca52';
      ctx.beginPath();
      ctx.arc(playerCenterX, playerCenterY, clamp(metrics.scale * 0.24, 1.5, isModal ? 5 : 4), 0, Math.PI * 2);
      ctx.fill();
    }

    if (isModal) {
      self.drawModalHud(ctx, display, metrics, markers);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(metrics.offsetX + 0.5, metrics.offsetY + 0.5, metrics.drawWidth, metrics.drawHeight);
  }  
  /**
 * drawMarker：处理drawMarker并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markerSize number 参数说明。
 * @returns 无返回值，直接更新drawMarker相关状态。
 */


export function drawMarkerImpl(self: Minimap, 
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
    markerSize: number,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const centerX = metrics.offsetX + (marker.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (marker.y - metrics.minY + 0.5) * metrics.scale;
    const half = markerSize / 2;

    ctx.save();
    ctx.fillStyle = MINIMAP_MARKER_COLORS[marker.kind];
    ctx.strokeStyle = 'rgba(15, 10, 8, 0.92)';
    ctx.lineWidth = Math.max(1, metrics.scale * 0.18);

    if (marker.kind === 'landmark') {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - half);
      ctx.lineTo(centerX + half, centerY);
      ctx.lineTo(centerX, centerY + half);
      ctx.lineTo(centerX - half, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'npc') {
      ctx.fillRect(centerX - half, centerY - half, markerSize, markerSize);
      ctx.strokeRect(centerX - half, centerY - half, markerSize, markerSize);
      ctx.restore();
      return;
    }

    if (marker.kind === 'container') {
      ctx.fillRect(centerX - half, centerY - half * 0.9, markerSize, markerSize * 0.9);
      ctx.strokeRect(centerX - half, centerY - half * 0.9, markerSize, markerSize * 0.9);
      ctx.strokeStyle = 'rgba(255, 241, 208, 0.92)';
      ctx.beginPath();
      ctx.moveTo(centerX - half, centerY);
      ctx.lineTo(centerX + half, centerY);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'monster_spawn') {
      ctx.beginPath();
      ctx.arc(centerX, centerY, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 245, 237, 0.9)';
      ctx.beginPath();
      ctx.moveTo(centerX - half * 0.65, centerY);
      ctx.lineTo(centerX + half * 0.65, centerY);
      ctx.moveTo(centerX, centerY - half * 0.65);
      ctx.lineTo(centerX, centerY + half * 0.65);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'stairs') {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - half);
      ctx.lineTo(centerX + half, centerY + half);
      ctx.lineTo(centerX - half, centerY + half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }  
  /**
 * drawMarkerLabel：处理drawMarkerLabel并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @returns 无返回值，直接更新drawMarkerLabel相关状态。
 */


export function drawMarkerLabelImpl(self: Minimap, 
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const centerX = metrics.offsetX + (marker.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (marker.y - metrics.minY + 0.5) * metrics.scale;
    const label = marker.label.trim();
    if (!label) {
      return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(15, 12, 10, 0.92)';

    if (marker.kind === 'landmark') {
      const fontSize = clamp(metrics.scale * 0.7, 12, 18);
      ctx.font = buildCanvasFont('labelStrong', fontSize);
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(label).width;
      const paddingX = Math.max(8, metrics.scale * 0.24);
      const boxHeight = Math.max(20, fontSize + 8);
      const boxWidth = textWidth + paddingX * 2;
      const anchorY = clamp(
        centerY + Math.max(16, metrics.scale * 0.7),
        metrics.padding + boxHeight / 2 + 2,
        metrics.height - metrics.padding - boxHeight / 2 - 2,
      );
      const boxLeft = clamp(
        centerX - boxWidth / 2,
        metrics.padding + 2,
        metrics.width - metrics.padding - boxWidth - 2,
      );
      ctx.fillStyle = 'rgba(15, 12, 10, 0.72)';
      ctx.fillRect(boxLeft, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(255, 226, 168, 0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxLeft + 0.5, anchorY - boxHeight / 2 + 0.5, boxWidth - 1, boxHeight - 1);
      ctx.fillStyle = '#ffe7b8';
      ctx.fillText(label, boxLeft + boxWidth / 2, anchorY + 0.5);
      ctx.restore();
      return;
    }

    const fontSize = clamp(metrics.scale * 0.6, 11, 16);
    const textY = clamp(
      centerY - Math.max(10, metrics.scale * 0.55),
      metrics.padding + fontSize + 2,
      metrics.height - metrics.padding - 2,
    );
    ctx.font = buildCanvasFont('label', fontSize);
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(2, fontSize * 0.18);
    ctx.fillStyle = marker.kind === 'monster_spawn'
      ? '#ffd9d0'
      : marker.kind === 'npc'
        ? '#d9f1ff'
        : marker.kind === 'container'
          ? '#ffe6bf'
        : '#f8e4b7';
    ctx.strokeText(label, centerX, textY);
    ctx.fillText(label, centerX, textY);
    ctx.restore();
  }  
  /**
 * drawGroundPile：执行draw地面Pile相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param pile GroundItemPileView 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param pileSize number 参数说明。
 * @returns 无返回值，直接更新drawGroundPile相关状态。
 */


export function drawGroundPileImpl(self: Minimap, 
    ctx: CanvasRenderingContext2D,
    pile: GroundItemPileView,
    metrics: ViewportMetrics,
    pileSize: number,
  ): void {
    const centerX = metrics.offsetX + (pile.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (pile.y - metrics.minY + 0.5) * metrics.scale;
    const half = pileSize / 2;
    ctx.save();
    ctx.fillStyle = '#f7e39a';
    ctx.strokeStyle = 'rgba(53, 36, 10, 0.95)';
    ctx.lineWidth = Math.max(1, metrics.scale * 0.16);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - half);
    ctx.lineTo(centerX + half, centerY);
    ctx.lineTo(centerX, centerY + half);
    ctx.lineTo(centerX - half, centerY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }  
  /**
 * drawModalHud：执行draw弹层Hud相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markers MapMinimapMarker[] 参数说明。
 * @returns 无返回值，直接更新draw弹层Hud相关状态。
 */


export function drawModalHudImpl(self: Minimap, 
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    markers: MapMinimapMarker[],
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const guide = self.moveHandler
      ? t('minimap.hud.guide.current', undefined)
      : t('minimap.hud.guide.readonly', undefined);
    ctx.save();
    ctx.font = buildCanvasFont('label', 12);
    ctx.textBaseline = 'middle';
    const guideWidth = ctx.measureText(guide).width + 18;
    const guideX = metrics.width - metrics.padding - guideWidth;
    const guideY = metrics.padding + 8;
    ctx.fillStyle = 'rgba(8, 9, 12, 0.68)';
    ctx.fillRect(guideX, guideY, guideWidth, 26);
    ctx.strokeStyle = 'rgba(255, 240, 213, 0.12)';
    ctx.strokeRect(guideX + 0.5, guideY + 0.5, guideWidth - 1, 25);
    ctx.fillStyle = 'rgba(255, 245, 222, 0.9)';
    ctx.fillText(guide, guideX + 9, guideY + 13);

    if (!self.hoveredModalPoint) {
      ctx.restore();
      return;
    }

    const lines = self.buildHoverLines(display, markers, self.hoveredModalPoint.x, self.hoveredModalPoint.y);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    ctx.font = buildCanvasFont('label', 13);
    const lineHeight = 20;
    const contentWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const panelWidth = Math.min(metrics.width - metrics.padding * 2, contentWidth + 20);
    const panelHeight = lines.length * lineHeight + 16;
    const panelX = metrics.padding;
    const panelY = metrics.height - metrics.padding - panelHeight;
    ctx.fillStyle = 'rgba(8, 9, 12, 0.72)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = 'rgba(255, 240, 213, 0.14)';
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
    ctx.fillStyle = 'rgba(255, 246, 225, 0.94)';
    lines.forEach((line, index) => {
      ctx.fillText(line, panelX + 10, panelY + 12 + lineHeight * index + lineHeight / 2);
    });
    ctx.restore();
  }

  /** buildHoverLines：构建Hover Lines。 */
export function buildHoverLinesImpl(self: Minimap, display: DisplayMapScene, markers: MapMinimapMarker[], x: number, y: number): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const lines: string[] = [];
    lines.push(t('minimap.hover.coordinate', { x, y }));

    const tile = self.getTileAt(display, x, y);
    if (tile) {
      lines.push(t('minimap.hover.surface', { surface: getTileTypeLabel(tile.type) }));
    } else {
      lines.push(t('minimap.hover.surface.unknown', undefined));
    }

    const tileMarkers = markers.filter((marker) => marker.x === x && marker.y === y);
    for (const marker of tileMarkers.slice(0, 3)) {
      lines.push(t('minimap.hover.marker', {
        kind: getMinimapMarkerKindLabel(marker.kind),
        label: marker.label,
        detail: marker.detail ? ` · ${marker.detail}` : '',
      }));
    }

    if (display.isCurrent && display.player?.x === x && display.player.y === y) {
      lines.push(t('minimap.hover.current-position', undefined));
    }

    if (display.isCurrent) {
      const pile = [...display.groundPiles.values()].find((entry) => entry.x === x && entry.y === y);
      if (pile) {
        const itemsLabel = pile.items.slice(0, 2).map((entry) => `${entry.name} ${formatDisplayCountBadge(entry.count)}`).join('、');
        const suffix = pile.items.length > 2
          ? t('minimap.hover.ground.suffix', { count: formatDisplayInteger(pile.items.length) })
          : '';
        lines.push(t('minimap.hover.ground', { items: itemsLabel, suffix }));
      }
    }

    return lines;
  }
