/**
 * gm-map-editor.canvas.ts —— GM 地图编辑器画布渲染。
 *
 * 从 GmMapEditor 类抽取的 Canvas 渲染逻辑：视图居中、缩放、地块绘制、
 * 实体绘制、怪物刷新范围叠加、安全区叠加等。
 * 通过 self: GmMapEditor 参数接收编辑器实例，不直接依赖类实例的私有字段。
 * 纯逻辑移动，不改变任何面板行为或协议字段。
 */

import {
  type GmMapLandmarkRecord,
  type GmMapMonsterSpawnRecord,
  type GmMapSafeZoneRecord,
  type Tile,
  TileType,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  composeTileTypeFromLayers,
  getTileTypeFromMapChar,
  resolveTileLayerSeedFromTileType,
  isOffsetInRange,
} from '@mud/shared';
import { type GmMapEditor, makeGridPointKey, createRuntimePreviewTile, buildGridPointKeySet } from './gm-map-editor';
import {
  EDITOR_BASE_CELL_SIZE,
  EDITOR_ZOOM_LEVELS,
} from './constants/editor/map-editor';
import { buildCanvasFont } from './constants/ui/text';
import { runtimeImagePack, type RuntimeTileVisualSource } from './renderer/runtime-image-pack';
import {
  formatAuraPointLabel,
  formatResourcePointLabel,
  getResourcePointGlyphColor,
  getResourcePointLabelColor,
} from './gm-map-editor-helpers';
export function centerViewImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return;
    const cellSize = self.getCellSize();
    self.viewCenterX = self.draft.width * cellSize / 2;
    self.viewCenterY = self.draft.height * cellSize / 2;
    self.renderCanvas();
  }

export function applyZoomImpl(self: GmMapEditor, delta: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const oldSize = self.getCellSize();
    const gridCenterX = oldSize > 0 ? self.viewCenterX / oldSize : 0;
    const gridCenterY = oldSize > 0 ? self.viewCenterY / oldSize : 0;
    const direction = Math.sign(delta);
    if (direction === 0) return;
    self.zoomLevelIndex = Math.max(0, Math.min(EDITOR_ZOOM_LEVELS.length - 1, self.zoomLevelIndex + direction));
    const nextSize = self.getCellSize();
    self.viewCenterX = gridCenterX * nextSize;
    self.viewCenterY = gridCenterY * nextSize;
    self.renderCanvas();
  }

export function getCellSizeImpl(self: GmMapEditor): number {
    return EDITOR_BASE_CELL_SIZE * EDITOR_ZOOM_LEVELS[self.zoomLevelIndex];
  }

export function renderCanvasImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (self.renderFrameId !== null) {
      return;
    }
    self.renderFrameId = window.requestAnimationFrame(() => {
      self.renderFrameId = null;
      self.flushCanvasRender();
    });
  }

export function flushCanvasRenderImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    self.resizeCanvas();
    const ctx = self.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, 0, self.canvas.width, self.canvas.height);
    if (!self.draft) return;
    const cellSize = self.getCellSize();
    const screenW = self.canvas.width;
    const screenH = self.canvas.height;
    const camWorldX = self.viewCenterX - screenW / 2;
    const camWorldY = self.viewCenterY - screenH / 2;
    const startGX = Math.floor(camWorldX / cellSize) - 1;
    const startGY = Math.floor(camWorldY / cellSize) - 1;
    const endGX = Math.ceil((camWorldX + screenW) / cellSize) + 1;
    const endGY = Math.ceil((camWorldY + screenH) / cellSize) + 1;
    const visualSourceStartGX = startGX - 1;
    const visualSourceStartGY = startGY - 1;
    const visualSourceRows = self.dualGridRenderingEnabled
      ? self.buildVisibleTileVisualSourceRows(visualSourceStartGX, visualSourceStartGY, endGX + 1, endGY + 1)
      : [];
    const visibleTileTypes = self.dualGridRenderingEnabled
      ? []
      : self.buildVisibleTileTypeRows(startGX, startGY, endGX, endGY);
    const auraPointKeys = buildGridPointKeySet(self.draft.auras, self.draft.width);
    const resourcePointKeys = buildGridPointKeySet(self.draft.resources, self.draft.width);
    if (self.dualGridRenderingEnabled) {
      self.ensureRuntimeImagePackWatch();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.6);

    for (let gy = startGY; gy <= endGY; gy += 1) {
      for (let gx = startGX; gx <= endGX; gx += 1) {
        const sx = gx * cellSize - self.viewCenterX + screenW / 2;
        const sy = gy * cellSize - self.viewCenterY + screenH / 2;
        if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) continue;
        if (gx < 0 || gy < 0 || gx >= self.draft.width || gy >= self.draft.height) {
          ctx.fillStyle = '#0d0b0a';
          ctx.fillRect(sx, sy, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(255,255,255,0.02)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellSize, cellSize);
          continue;
        }

        const source = self.dualGridRenderingEnabled
          ? self.getCachedTileVisualSource(visualSourceRows, visualSourceStartGX, visualSourceStartGY, gx, gy)
          : null;
        const type = source?.type ?? visibleTileTypes[gy - startGY]?.[gx - startGX] ?? TileType.Floor;
        const runtimeTileDrawn = self.dualGridRenderingEnabled && source !== null
          ? runtimeImagePack.drawTile(ctx, createRuntimePreviewTile(source), sx, sy, cellSize)
          : false;
        if (!runtimeTileDrawn) {
          ctx.fillStyle = TILE_VISUAL_BG_COLORS[type];
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, cellSize, cellSize);

        const ch = TILE_VISUAL_GLYPHS[type];
        if (!runtimeTileDrawn && ch) {
          ctx.fillStyle = TILE_VISUAL_GLYPH_COLORS[type];
          ctx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }

        const pointKey = makeGridPointKey(gx, gy, self.draft.width);
        if (auraPointKeys.has(pointKey)) {
          ctx.fillStyle = 'rgba(90, 170, 255, 0.18)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        }

        if (resourcePointKeys.has(pointKey)) {
          ctx.fillStyle = 'rgba(247, 208, 96, 0.16)';
          ctx.fillRect(sx + 3, sy + 3, cellSize - 6, cellSize - 6);
        }

        const isLineStart = self.linePaintStart?.x === gx && self.linePaintStart?.y === gy;
        const isSelected = self.selectedCell?.x === gx && self.selectedCell?.y === gy;
        const isHovered = self.hoveredCell?.x === gx && self.hoveredCell?.y === gy;
        if (isSelected || isHovered || isLineStart) {
          ctx.fillStyle = isSelected
            ? 'rgba(208, 76, 56, 0.26)'
            : isLineStart
              ? 'rgba(64, 120, 236, 0.2)'
              : 'rgba(212, 164, 71, 0.16)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = isSelected
            ? 'rgba(166, 37, 31, 0.96)'
            : isLineStart
              ? 'rgba(38, 84, 186, 0.92)'
              : 'rgba(123, 91, 20, 0.55)';
          ctx.lineWidth = isSelected || isLineStart ? 2 : 1;
          ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
        }
      }
    }

    if (self.dualGridRenderingEnabled) {
      runtimeImagePack.drawDualGridTiles(ctx, {
        startGX,
        startGY,
        endGX,
        endGY,
        cellSize,
        offsetX: -self.viewCenterX + screenW / 2,
        offsetY: -self.viewCenterY + screenH / 2,
        tileAt: (x, y) => self.getCachedTileVisualSource(visualSourceRows, visualSourceStartGX, visualSourceStartGY, x, y),
      });
    }

    self.drawComposePieces(ctx, screenW, screenH, cellSize);
    self.drawEntities(ctx, screenW, screenH, cellSize);
  }

export function buildVisibleTileTypeRowsImpl(self: GmMapEditor, startGX: number, startGY: number, endGX: number, endGY: number): TileType[][] {
    if (!self.draft) {
      return [];
    }
    const rowCount = Math.max(0, endGY - startGY + 1);
    const columnCount = Math.max(0, endGX - startGX + 1);
    const rows: TileType[][] = new Array(rowCount);
    const hasLayerRows = Boolean(
      self.draft.terrainRows
      || self.draft.surfaceRows
      || self.draft.structureRows
      || self.draft.interactableRows,
    );

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const y = startGY + rowIndex;
      const row: TileType[] = new Array(columnCount);
      if (y < 0 || y >= self.draft.height) {
        row.fill(TileType.Floor);
        rows[rowIndex] = row;
        continue;
      }
      const legacyRow = self.draft.tiles[y] ?? '';
      const terrainRow = self.draft.terrainRows?.[y];
      const surfaceRow = self.draft.surfaceRows?.[y];
      const structureRow = self.draft.structureRows?.[y];
      const interactableRow = self.draft.interactableRows?.[y];
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const x = startGX + columnIndex;
        if (x < 0 || x >= self.draft.width) {
          row[columnIndex] = TileType.Floor;
          continue;
        }
        row[columnIndex] = hasLayerRows
          ? composeTileTypeFromLayers(
            terrainRow?.[x],
            surfaceRow?.[x] ?? null,
            structureRow?.[x] ?? null,
            interactableRow?.[x] ?? [],
          )
          : getTileTypeFromMapChar(legacyRow[x] ?? '.');
      }
      rows[rowIndex] = row;
    }
    return rows;
  }

export function buildVisibleTileVisualSourceRowsImpl(self: GmMapEditor,
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
  ): Array<Array<RuntimeTileVisualSource | null>> {
    if (!self.draft) {
      return [];
    }
    const rowCount = Math.max(0, endGY - startGY + 1);
    const columnCount = Math.max(0, endGX - startGX + 1);
    const rows: Array<Array<RuntimeTileVisualSource | null>> = new Array(rowCount);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const y = startGY + rowIndex;
      const row: Array<RuntimeTileVisualSource | null> = new Array(columnCount);
      if (y < 0 || y >= self.draft.height) {
        row.fill(null);
        rows[rowIndex] = row;
        continue;
      }
      const legacyRow = self.draft.tiles[y] ?? '';
      const terrainRow = self.draft.terrainRows?.[y];
      const surfaceRow = self.draft.surfaceRows?.[y];
      const structureRow = self.draft.structureRows?.[y];
      const interactableRow = self.draft.interactableRows?.[y];
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const x = startGX + columnIndex;
        if (x < 0 || x >= self.draft.width) {
          row[columnIndex] = null;
          continue;
        }
        const fallback = resolveTileLayerSeedFromTileType(getTileTypeFromMapChar(legacyRow[x] ?? '.'));
        const terrain = terrainRow?.[x] ?? fallback.terrain;
        const surface = surfaceRow?.[x] ?? fallback.surface;
        const structure = structureRow?.[x] ?? fallback.structure;
        const interactableKinds = interactableRow?.[x] ?? fallback.interactables;
        row[columnIndex] = {
          type: composeTileTypeFromLayers(terrain, surface, structure, interactableKinds),
          terrainType: terrain,
          surfaceType: surface,
          structureType: structure,
          interactableKinds: [...interactableKinds],
        };
      }
      rows[rowIndex] = row;
    }
    return rows;
  }

export function getCachedTileVisualSourceImpl(self: GmMapEditor,
    rows: Array<Array<RuntimeTileVisualSource | null>>,
    startGX: number,
    startGY: number,
    x: number,
    y: number,
  ): RuntimeTileVisualSource | null {
    return rows[y - startGY]?.[x - startGX] ?? null;
  }

export function drawComposePiecesImpl(self: GmMapEditor, ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || self.composePieces.length === 0) return;
    const showLabels = cellSize >= 16;
    for (const piece of self.composePieces) {
      const bounds = self.getComposePieceBounds(piece);
      if (!bounds) continue;
      const isSelected = piece.id === self.selectedComposePieceId;
      self.forEachComposePieceTile(piece, (targetX, targetY, _sourceX, _sourceY, sourceChar) => {
        if (targetX < 0 || targetY < 0 || targetX >= self.draft!.width || targetY >= self.draft!.height) {
          return;
        }
        const sx = targetX * cellSize - self.viewCenterX + screenW / 2;
        const sy = targetY * cellSize - self.viewCenterY + screenH / 2;
        if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
        const type = getTileTypeFromMapChar(sourceChar);
        ctx.fillStyle = isSelected ? 'rgba(255, 214, 92, 0.2)' : 'rgba(124, 187, 255, 0.16)';
        ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        const glyph = TILE_VISUAL_GLYPHS[type];
        if (glyph) {
          ctx.fillStyle = isSelected ? '#ffe8a6' : TILE_VISUAL_GLYPH_COLORS[type];
          ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.52);
          ctx.fillText(glyph, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }
      });

      const boxX = bounds.x * cellSize - self.viewCenterX + screenW / 2;
      const boxY = bounds.y * cellSize - self.viewCenterY + screenH / 2;
      const boxW = bounds.width * cellSize;
      const boxH = bounds.height * cellSize;
      ctx.strokeStyle = isSelected ? 'rgba(255, 211, 84, 0.95)' : 'rgba(116, 187, 255, 0.75)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);

      if (!showLabels) continue;
      const label = `${piece.sourceMapName} ${piece.rotation}°`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('label', Math.max(11, cellSize * 0.28));
      const textWidth = ctx.measureText(label).width;
      const labelX = boxX + 4;
      const labelY = boxY - 10;
      ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
      ctx.fillRect(labelX - 3, labelY - 9, textWidth + 8, 18);
      ctx.fillStyle = isSelected ? '#ffe7a8' : '#d7efff';
      ctx.fillText(label, labelX + 1, labelY);
    }
  }

export function drawEntitiesImpl(self: GmMapEditor, ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return;
    const showEntityLabels = cellSize >= 18;
    if (self.selectedEntity?.kind === 'monster') {
      const selectedSpawn = self.draft.monsterSpawns[self.selectedEntity.index];
      if (selectedSpawn) {
        self.drawMonsterSpawnOverlay(ctx, screenW, screenH, cellSize, selectedSpawn);
      }
    }
    if (self.selectedEntity?.kind === 'safeZone') {
      const selectedZone = self.draft.safeZones?.[self.selectedEntity.index];
      if (selectedZone) {
        self.drawSafeZoneOverlay(ctx, screenW, screenH, cellSize, selectedZone);
      }
    }
    const drawEntity = (
      wx: number,
      wy: number,
      char: string,
      color: string,
      name: string,
      kind: 'npc' | 'monster' | 'spawn' | 'container' | 'safeZone',
      labelColor?: string,
    ): void => {
      const sx = wx * cellSize - self.viewCenterX + screenW / 2;
      const sy = wy * cellSize - self.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + cellSize / 2, sy + cellSize - 3, cellSize * 0.32, cellSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, cellSize * 0.08);
      ctx.strokeStyle = 'rgba(15,12,10,0.9)';
      ctx.fillStyle = color;
      ctx.font = buildCanvasFont('entityGlyph', cellSize * 0.75);
      ctx.strokeText(char, sx + cellSize / 2, sy + cellSize / 2);
      ctx.fillText(char, sx + cellSize / 2, sy + cellSize / 2);
      if (!showEntityLabels) {
        return;
      }
      ctx.font = buildCanvasFont('label', cellSize * 0.3);
      ctx.strokeStyle = 'rgba(15,12,10,0.9)';
      ctx.fillStyle = kind === 'monster'
        ? '#ffddcc'
        : kind === 'spawn'
          ? '#fff0b0'
          : kind === 'safeZone'
            ? '#d7fff2'
            : kind === 'container'
              ? '#f5ddb0'
            : (labelColor ?? '#cce7ff');
      ctx.textBaseline = 'alphabetic';
      ctx.strokeText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
      ctx.fillText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
    };

    const drawLandmark = (landmark: GmMapLandmarkRecord): void => {
      if (!showEntityLabels) {
        return;
      }
      const sx = landmark.x * cellSize - self.viewCenterX + screenW / 2;
      const sy = landmark.y * cellSize - self.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
      const label = landmark.name?.trim() || '未命名地标';
      if (!label) return;
      const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('labelStrong', Math.max(12, cellSize * 0.34));
      const textWidth = ctx.measureText(label).width;
      const paddingX = Math.max(8, cellSize * 0.22);
      const boxHeight = Math.max(20, cellSize * 0.52);
      const boxWidth = textWidth + paddingX * 2;

      ctx.fillStyle = 'rgba(15,12,10,0.72)';
      ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(255, 226, 168, 0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.fillStyle = '#ffe7b8';
      ctx.fillText(label, sx + cellSize / 2, anchorY + 0.5);
    };

    drawEntity(self.draft.spawnPoint.x, self.draft.spawnPoint.y, '生', '#ffd27a', '出生点', 'spawn');
    self.draft.portals.forEach((portal) => {
      const isStairs = portal.kind === 'stairs';
      const directionLabel = portal.direction === 'one_way' ? '单向' : '双向';
      drawEntity(
        portal.x,
        portal.y,
        isStairs ? '阶' : '阵',
        isStairs ? '#d7b27c' : '#c8a2f2',
        `${directionLabel}${isStairs ? '楼梯' : '传送'}:${self.formatMapTargetLabel(portal.targetMapId)}`,
        'npc',
      );
    });
    self.draft.npcs.forEach((npc) => drawEntity(npc.x, npc.y, npc.char || '人', npc.color || '#d6d0c4', npc.name?.trim() || '未命名场景人物', 'npc'));
    self.draft.monsterSpawns.forEach((spawn) => drawEntity(spawn.x, spawn.y, spawn.char || '妖', spawn.color || '#d27a7a', spawn.name?.trim() || '未命名怪物', 'monster'));
    (self.draft.auras ?? []).forEach((point) => drawEntity(point.x, point.y, '灵', '#77b8ff', formatAuraPointLabel(point.value), 'npc'));
    (self.draft.resources ?? []).forEach((point) => drawEntity(
      point.x,
      point.y,
      '炁',
      getResourcePointGlyphColor(point),
      formatResourcePointLabel(point),
      'npc',
      getResourcePointLabelColor(point),
    ));
    (self.draft.safeZones ?? []).forEach((zone) => drawEntity(zone.x, zone.y, '安', '#7ce5c6', `安全区:${zone.radius}`, 'safeZone'));
    (self.draft.landmarks ?? [])
      .filter((landmark) => landmark.container)
      .forEach((landmark) => drawEntity(
        landmark.x,
        landmark.y,
        landmark.container?.char?.trim() || '箱',
        landmark.container?.color?.trim() || '#c18b46',
        landmark.name?.trim() || '未命名容器',
        'container',
      ));
    (self.draft.landmarks ?? [])
      .filter((landmark) => !landmark.container)
      .forEach((landmark) => drawLandmark(landmark));
  }  

export function drawMonsterSpawnOverlayImpl(self: GmMapEditor,
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    spawn: GmMapMonsterSpawnRecord,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) {
      return;
    }
    const spawnRadius = Math.max(0, Math.floor(spawn.radius ?? 0));
    const wanderRadius = Math.max(0, Math.floor(spawn.wanderRadius ?? spawn.radius ?? 0));
    const maxRadius = Math.max(spawnRadius, wanderRadius);
    if (maxRadius <= 0) {
      return;
    }

    const drawCellOverlay = (
      x: number,
      y: number,
      fillStyle: string | null,
      strokeStyle: string | null,
      lineWidth: number,
    ): void => {
      if (x < 0 || y < 0 || x >= self.draft!.width || y >= self.draft!.height) {
        return;
      }
      const sx = x * cellSize - self.viewCenterX + screenW / 2;
      const sy = y * cellSize - self.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) {
        return;
      }
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(sx, sy, cellSize, cellSize);
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cellSize - 1, cellSize - 1);
      }
    };

    for (let dy = -maxRadius; dy <= maxRadius; dy += 1) {
      for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
        if (!isOffsetInRange(dx, dy, maxRadius)) {
          continue;
        }
        const worldX = spawn.x + dx;
        const worldY = spawn.y + dy;
        const inSpawnRadius = spawnRadius > 0 && isOffsetInRange(dx, dy, spawnRadius);
        const inWanderRadius = wanderRadius > 0 && isOffsetInRange(dx, dy, wanderRadius);
        if (!inSpawnRadius && !inWanderRadius) {
          continue;
        }
        drawCellOverlay(
          worldX,
          worldY,
          inSpawnRadius
            ? 'rgba(255, 182, 93, 0.22)'
            : 'rgba(96, 176, 152, 0.14)',
          null,
          0,
        );
      }
    }

    const outlineRadius = (radius: number, strokeStyle: string): void => {
      if (radius <= 0) {
        return;
      }
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius) || isOffsetInRange(dx, dy, radius - 1)) {
            continue;
          }
          drawCellOverlay(
            spawn.x + dx,
            spawn.y + dy,
            null,
            strokeStyle,
            Math.max(1, cellSize >= 24 ? 2 : 1),
          );
        }
      }
    };

    outlineRadius(wanderRadius, 'rgba(110, 222, 184, 0.9)');
    outlineRadius(spawnRadius, 'rgba(255, 203, 122, 0.95)');
    drawCellOverlay(
      spawn.x,
      spawn.y,
      'rgba(255, 244, 180, 0.18)',
      'rgba(255, 244, 180, 0.95)',
      Math.max(1, cellSize >= 24 ? 2 : 1),
    );

    if (cellSize < 18) {
      return;
    }
    const sx = spawn.x * cellSize - self.viewCenterX + screenW / 2;
    const sy = spawn.y * cellSize - self.viewCenterY + screenH / 2;
    const summary = `生${spawnRadius} 漫${wanderRadius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
    const paddingX = Math.max(7, cellSize * 0.18);
    const boxHeight = Math.max(18, cellSize * 0.46);
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(12, 18, 16, 0.78)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(171, 243, 214, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#e5fff5';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }  

export function drawSafeZoneOverlayImpl(self: GmMapEditor,
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    zone: GmMapSafeZoneRecord,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) {
      return;
    }
    const radius = Math.max(0, Math.floor(zone.radius ?? 0));

    const drawCellOverlay = (
      x: number,
      y: number,
      fillStyle: string | null,
      strokeStyle: string | null,
      lineWidth: number,
    ): void => {
      if (x < 0 || y < 0 || x >= self.draft!.width || y >= self.draft!.height) {
        return;
      }
      const sx = x * cellSize - self.viewCenterX + screenW / 2;
      const sy = y * cellSize - self.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) {
        return;
      }
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(sx, sy, cellSize, cellSize);
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cellSize - 1, cellSize - 1);
      }
    };

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (!isOffsetInRange(dx, dy, radius)) {
          continue;
        }
        drawCellOverlay(
          zone.x + dx,
          zone.y + dy,
          'rgba(74, 209, 164, 0.18)',
          null,
          0,
        );
      }
    }

    if (radius > 0) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius) || isOffsetInRange(dx, dy, radius - 1)) {
            continue;
          }
          drawCellOverlay(
            zone.x + dx,
            zone.y + dy,
            null,
            'rgba(141, 255, 221, 0.92)',
            Math.max(1, cellSize >= 24 ? 2 : 1),
          );
        }
      }
    }

    drawCellOverlay(
      zone.x,
      zone.y,
      'rgba(210, 255, 241, 0.22)',
      'rgba(210, 255, 241, 0.95)',
      Math.max(1, cellSize >= 24 ? 2 : 1),
    );

    if (cellSize < 18) {
      return;
    }
    const sx = zone.x * cellSize - self.viewCenterX + screenW / 2;
    const sy = zone.y * cellSize - self.viewCenterY + screenH / 2;
    const summary = `安${radius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
    const paddingX = Math.max(7, cellSize * 0.18);
    const boxHeight = Math.max(18, cellSize * 0.46);
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(9, 22, 18, 0.8)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(141, 255, 221, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#eafff8';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }

export function resizeCanvasImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const width = Math.max(1, Math.floor(self.canvasHost.clientWidth));
    const height = Math.max(1, Math.floor(self.canvasHost.clientHeight));
    if (self.canvas.width === width && self.canvas.height === height) return;
    self.canvas.width = width;
    self.canvas.height = height;
  }
