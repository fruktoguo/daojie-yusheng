/**
 * gm-map-editor.paint.ts —— GM 地图编辑器绘制工具。
 *
 * 从 GmMapEditor 类抽取的绘制交互逻辑：指针事件处理、地块/图层/灵气/资源
 * 画笔、线刷、图层行管理、实体查找、坐标转换等。
 * 通过 self: GmMapEditor 参数接收编辑器实例，不直接依赖类实例的私有字段。
 * 纯逻辑移动，不改变任何面板行为或协议字段。
 */

import {
  type InteractableKind,
  type StructureType,
  type SurfaceType,
  type TerrainType,
  TileType,
  TILE_TYPE_LABELS,
  composeTileTypeFromLayers,
  getMapCharFromTileType,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  resolveTileLayerSeedFromTileType,
} from '@mud/shared';
import {
  type GmMapEditor,
  type GridPoint,
  type MapEntitySelection,
  type PaintLayer,
  type TileResourcePoint,
  areStringListsEqual,
} from './gm-map-editor';
import { type RuntimeTileVisualSource } from './renderer/runtime-image-pack';
import {
  getResourceRecordKey,
  setResourceRecordKey,
} from './gm-map-editor-helpers';
export function handleCanvasPointerDownImpl(self: GmMapEditor, event: PointerEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const point = self.screenToGrid(event.clientX, event.clientY);
    const currentTool = self.getCurrentTool();
    const wantsPan = event.button === 2 || (currentTool === 'pan' && event.button === 0);
    if (wantsPan) {
      self.panActive = true;
      self.dragEntityActive = false;
      self.paintActive = false;
      self.activePointerId = event.pointerId;
      self.activePanButtonMask = event.button === 2 ? 2 : 1;
      self.panStartClientX = event.clientX;
      self.panStartClientY = event.clientY;
      self.panStartCenterX = self.viewCenterX;
      self.panStartCenterY = self.viewCenterY;
      self.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      self.renderCanvas();
      return;
    }
    if (event.button !== 0) return;
    if (!point) return;
    self.selectedCell = point;
    const hitComposePiece = self.findComposePieceAt(point.x, point.y);
    const hitEntity = self.findEntityAt(point.x, point.y);
    self.selectedComposePieceId = hitComposePiece?.id ?? null;
    self.selectedEntity = hitComposePiece ? null : hitEntity;
    if (currentTool === 'paint') {
      if (event.altKey && self.paintLayer === 'tile') {
        self.sampleTileAt(point.x, point.y);
        self.renderInspector();
        self.renderCanvas();
        return;
      }
      if (self.linePaintStart) {
        self.applyLinePaint(self.linePaintStart, point);
        self.linePaintStart = null;
        self.renderInspector();
        self.renderCanvas();
        return;
      }
      if (event.shiftKey) {
        self.linePaintStart = point;
        self.setStatus(`已设置线刷起点 (${point.x}, ${point.y})，再点终点即可整线填充`);
        self.renderInspector();
        self.renderCanvas();
        return;
      }
      self.activePointerId = event.pointerId;
      self.activePanButtonMask = 0;
      self.paintSessionHasUndoSnapshot = false;
      self.canvas.setPointerCapture(event.pointerId);
      self.paintActive = true;
      const changed = self.paintAt(point.x, point.y, true);
      self.paintSessionHasUndoSnapshot = changed;
      self.renderCanvas();
      return;
    }

    if (currentTool === 'select' && hitComposePiece) {
      const bounds = self.getComposePieceBounds(hitComposePiece);
      self.currentInspectorTab = 'compose';
      self.activePointerId = event.pointerId;
      self.activePanButtonMask = 0;
      self.dragSessionHasUndoSnapshot = false;
      self.composeDragActive = true;
      self.dragEntityActive = false;
      self.paintActive = false;
      self.composeDragOffsetX = bounds ? point.x - bounds.x : 0;
      self.composeDragOffsetY = bounds ? point.y - bounds.y : 0;
      self.canvas.setPointerCapture(event.pointerId);
    } else if (currentTool === 'select' && hitEntity) {
      self.activePointerId = event.pointerId;
      self.activePanButtonMask = 0;
      self.dragSessionHasUndoSnapshot = false;
      self.dragEntityActive = true;
      self.composeDragActive = false;
      self.paintActive = false;
      self.canvas.setPointerCapture(event.pointerId);
    }
    self.renderInspector();
    self.renderCanvas();
  }

export function sampleTileAtImpl(self: GmMapEditor, x: number, y: number): void {
    const nextType = self.getTileTypeAt(x, y);
    self.paintTileType = nextType;
    self.setStatus(`已吸取地块 ${TILE_TYPE_LABELS[nextType]} (${x}, ${y})`);
    self.renderToolControls();
  }

export function handleCanvasPointerMoveImpl(self: GmMapEditor, event: PointerEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const point = self.screenToGrid(event.clientX, event.clientY);
    self.hoveredCell = point;
    if (self.activePointerId !== null && event.pointerId !== self.activePointerId) return;
    if (self.panActive) {
      if ((event.buttons & self.activePanButtonMask) === 0) {
        self.endPointerInteraction();
        return;
      }
      self.viewCenterX = self.panStartCenterX - (event.clientX - self.panStartClientX);
      self.viewCenterY = self.panStartCenterY - (event.clientY - self.panStartClientY);
      self.renderCanvas();
      return;
    }
    if (self.composeDragActive) {
      if ((event.buttons & 1) === 0) {
        self.endPointerInteraction();
        return;
      }
      if (point) {
        self.selectedCell = point;
        const piece = self.getSelectedComposePiece();
        if (piece) {
          const nextX = point.x - self.composeDragOffsetX;
          const nextY = point.y - self.composeDragOffsetY;
          if (piece.x !== nextX || piece.y !== nextY) {
            if (!self.dragSessionHasUndoSnapshot) {
              self.captureUndoState();
              self.dragSessionHasUndoSnapshot = true;
            }
            self.updateComposePiece(piece.id, (current) => ({ ...current, x: nextX, y: nextY }));
          }
        }
      }
      self.renderCanvas();
      return;
    }
    if (self.dragEntityActive) {
      if ((event.buttons & 1) === 0) {
        self.endPointerInteraction();
        return;
      }
      if (point) {
        self.selectedCell = point;
        const changed = self.moveSelectedEntityToPoint(point.x, point.y, !self.dragSessionHasUndoSnapshot, true);
        self.dragSessionHasUndoSnapshot = self.dragSessionHasUndoSnapshot || changed;
      }
      self.renderCanvas();
      return;
    }
    if (self.paintActive) {
      if ((event.buttons & 1) === 0) {
        self.endPointerInteraction();
        return;
      }
    }
    if (self.paintActive && point) {
      const changed = self.paintAt(point.x, point.y, !self.paintSessionHasUndoSnapshot);
      self.paintSessionHasUndoSnapshot = self.paintSessionHasUndoSnapshot || changed;
      self.renderCanvas();
      return;
    }
  }

export function endPointerInteractionImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (self.activePointerId !== null && self.canvas.hasPointerCapture(self.activePointerId)) {
      self.canvas.releasePointerCapture(self.activePointerId);
    }
    if ((self.paintActive || self.dragEntityActive || self.composeDragActive) && self.draft) {
      self.renderInspector();
    }
    self.paintActive = false;
    self.dragEntityActive = false;
    self.composeDragActive = false;
    self.panActive = false;
    self.paintSessionHasUndoSnapshot = false;
    self.dragSessionHasUndoSnapshot = false;
    self.lastPaintKey = null;
    self.activePointerId = null;
    self.activePanButtonMask = 0;
    self.composeDragOffsetX = 0;
    self.composeDragOffsetY = 0;
    self.renderCanvas();
  }

export function screenToGridImpl(self: GmMapEditor, clientX: number, clientY: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return null;
    const rect = self.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null;
    const cellSize = self.getCellSize();
    const worldX = sx + self.viewCenterX - rect.width / 2;
    const worldY = sy + self.viewCenterY - rect.height / 2;
    const x = Math.floor(worldX / cellSize);
    const y = Math.floor(worldY / cellSize);
    if (x < 0 || y < 0 || x >= self.draft.width || y >= self.draft.height) return null;
    return { x, y };
  }

export function paintAtImpl(self: GmMapEditor, x: number, y: number, recordUndo = false): boolean {
    if (self.paintLayer === 'tile') return self.paintTileAt(x, y, recordUndo);
    if (self.paintLayer === 'terrain' || self.paintLayer === 'surface' || self.paintLayer === 'structure' || self.paintLayer === 'interactable') {
      return self.paintLayerAt(x, y, recordUndo);
    }
    return self.paintLayer === 'aura'
      ? self.paintAuraAt(x, y, recordUndo)
      : self.paintResourceAt(x, y, recordUndo);
  }

export function paintTileAtImpl(self: GmMapEditor, x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    const key = `${x},${y}`;
    if (self.lastPaintKey === key) return false;
    self.lastPaintKey = key;
    return self.applyTilePaint([{ x, y }], recordUndo) > 0;
  }

export function paintLayerAtImpl(self: GmMapEditor, x: number, y: number, recordUndo = false): boolean {
    if (!self.draft) return false;
    const key = `${x},${y},${self.paintLayer}:${self.paintTerrainType}:${self.paintSurfaceType ?? ''}:${self.paintStructureType ?? ''}:${self.paintInteractableKind ?? ''}`;
    if (self.lastPaintKey === key) return false;
    self.lastPaintKey = key;
    return self.applyLayerPaint(self.paintLayer, [{ x, y }], recordUndo) > 0;
  }

export function paintAuraAtImpl(self: GmMapEditor, x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    const key = `${x},${y}`;
    if (self.lastPaintKey === key) return false;
    self.lastPaintKey = key;
    return self.applyAuraPaint([{ x, y }], recordUndo) > 0;
  }

export function paintResourceAtImpl(self: GmMapEditor, x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    const key = `${x},${y},${self.resourcePaintKey}`;
    if (self.lastPaintKey === key) return false;
    self.lastPaintKey = key;
    return self.applyResourcePaint([{ x, y }], recordUndo) > 0;
  }

export function applyLinePaintImpl(self: GmMapEditor, start: GridPoint, end: GridPoint): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const points = self.getLinePoints(start, end);
    const changed = self.paintLayer === 'tile'
      ? self.applyTilePaint(points, true)
      : self.paintLayer === 'terrain' || self.paintLayer === 'surface' || self.paintLayer === 'structure' || self.paintLayer === 'interactable'
        ? self.applyLayerPaint(self.paintLayer, points, true)
        : self.paintLayer === 'aura'
          ? self.applyAuraPaint(points, true)
          : self.applyResourcePaint(points, true);
    if (changed > 0) {
      self.setStatus(`已沿直线填充 ${changed} 个${self.getPaintLayerLabel()}点`);
    }
  }

export function applyTilePaintImpl(self: GmMapEditor, points: GridPoint[], recordUndo: boolean): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return 0;
    const nextType = self.paintTileType;
    const nextChar = getMapCharFromTileType(nextType);
    const changedPoints: GridPoint[] = [];
    const visited = new Set<string>();
    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const currentType = self.getTileTypeAt(point.x, point.y);
      const currentSeed = resolveTileLayerSeedFromTileType(currentType);
      const nextSeed = resolveTileLayerSeedFromTileType(nextType);
      if (currentType === nextType
        && self.draft.terrainRows?.[point.y]?.[point.x] === nextSeed.terrain
        && (self.draft.surfaceRows?.[point.y]?.[point.x] ?? null) === nextSeed.surface
        && (self.draft.structureRows?.[point.y]?.[point.x] ?? null) === nextSeed.structure
        && areStringListsEqual(self.draft.interactableRows?.[point.y]?.[point.x] ?? currentSeed.interactables, nextSeed.interactables)) continue;
      if (!isTileTypeWalkable(nextType) && self.hasBlockingMapObjectAt(point.x, point.y)) {
        self.setStatus('线刷路径上存在出生点或可交互对象，不能改成不可通行地块', true);
        return 0;
      }
      changedPoints.push(point);
    }
    if (changedPoints.length === 0) {
      return 0;
    }
    if (recordUndo) {
      self.captureUndoState();
    }
    const rows = new Map<number, string[]>();
    for (const point of changedPoints) {
      const seed = resolveTileLayerSeedFromTileType(nextType);
      self.draft.terrainRows![point.y]![point.x] = seed.terrain;
      self.draft.surfaceRows![point.y]![point.x] = seed.surface;
      self.draft.structureRows![point.y]![point.x] = seed.structure;
      self.draft.interactableRows![point.y]![point.x] = [...seed.interactables];
      const row = rows.get(point.y) ?? [...(self.draft.tiles[point.y] ?? '')];
      row[point.x] = nextChar;
      rows.set(point.y, row);
    }
    for (const [y, row] of rows) {
      self.draft.tiles[y] = row.join('');
    }
    self.markDirty(false);
    return changedPoints.length;
  }

export function applyLayerPaintImpl(self: GmMapEditor, layer: PaintLayer, points: GridPoint[], recordUndo: boolean): number {
    if (!self.draft) return 0;
    self.ensureLayerRows();
    const changedPoints: GridPoint[] = [];
    const visited = new Set<string>();
    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const currentType = self.getTileTypeAt(point.x, point.y);
      const nextType = self.previewLayerPaintTileType(layer, point.x, point.y);
      if (currentType === nextType && self.isLayerPaintNoop(layer, point.x, point.y)) continue;
      if (!isTileTypeWalkable(nextType) && isTileTypeWalkable(currentType) && self.hasBlockingMapObjectAt(point.x, point.y)) {
        self.setStatus('线刷路径上存在出生点或可交互对象，不能改成不可通行地块', true);
        return 0;
      }
      if (layer === 'interactable' && self.paintInteractableKind && self.hasBlockingMapObjectAt(point.x, point.y)) {
        self.setStatus('线刷路径上存在出生点或对象，不能直接覆盖交互层', true);
        return 0;
      }
      changedPoints.push(point);
    }
    if (changedPoints.length === 0) return 0;
    if (recordUndo) self.captureUndoState();
    for (const point of changedPoints) {
      if (layer === 'terrain') {
        self.draft.terrainRows![point.y]![point.x] = self.paintTerrainType;
      } else if (layer === 'surface') {
        self.draft.surfaceRows![point.y]![point.x] = self.paintSurfaceType;
      } else if (layer === 'structure') {
        self.draft.structureRows![point.y]![point.x] = self.paintStructureType;
      } else if (layer === 'interactable') {
        self.draft.interactableRows![point.y]![point.x] = self.paintInteractableKind ? [self.paintInteractableKind] : [];
      }
      self.syncLegacyTileFromLayers(point.x, point.y);
    }
    self.markDirty(false);
    return changedPoints.length;
  }

export function ensureLayerRowsImpl(self: GmMapEditor): void {
    if (!self.draft) return;
    const width = Math.max(0, self.draft.width);
    const height = Math.max(0, self.draft.height);
    self.draft.terrainRows = self.draft.terrainRows ?? [];
    self.draft.surfaceRows = self.draft.surfaceRows ?? [];
    self.draft.structureRows = self.draft.structureRows ?? [];
    self.draft.interactableRows = self.draft.interactableRows ?? [];
    for (let y = 0; y < height; y += 1) {
      self.draft.terrainRows[y] = self.draft.terrainRows[y] ?? [];
      self.draft.surfaceRows[y] = self.draft.surfaceRows[y] ?? [];
      self.draft.structureRows[y] = self.draft.structureRows[y] ?? [];
      self.draft.interactableRows[y] = self.draft.interactableRows[y] ?? [];
      for (let x = 0; x < width; x += 1) {
        const seed = resolveTileLayerSeedFromTileType(getTileTypeFromMapChar(self.draft.tiles[y]?.[x] ?? '.'));
        self.draft.terrainRows[y]![x] ??= seed.terrain;
        self.draft.surfaceRows[y]![x] = self.draft.surfaceRows[y]![x] ?? seed.surface;
        self.draft.structureRows[y]![x] = self.draft.structureRows[y]![x] ?? seed.structure;
        self.draft.interactableRows[y]![x] ??= [...seed.interactables];
      }
      self.draft.terrainRows[y] = self.draft.terrainRows[y]!.slice(0, width);
      self.draft.surfaceRows[y] = self.draft.surfaceRows[y]!.slice(0, width);
      self.draft.structureRows[y] = self.draft.structureRows[y]!.slice(0, width);
      self.draft.interactableRows[y] = self.draft.interactableRows[y]!.slice(0, width);
    }
    self.draft.terrainRows = self.draft.terrainRows.slice(0, height);
    self.draft.surfaceRows = self.draft.surfaceRows.slice(0, height);
    self.draft.structureRows = self.draft.structureRows.slice(0, height);
    self.draft.interactableRows = self.draft.interactableRows.slice(0, height);
  }

export function previewLayerPaintTileTypeImpl(self: GmMapEditor, layer: PaintLayer, x: number, y: number): TileType {
    if (!self.draft) return TileType.Floor;
    return composeTileTypeFromLayers(
      layer === 'terrain' ? self.paintTerrainType : self.draft.terrainRows?.[y]?.[x],
      layer === 'surface' ? self.paintSurfaceType : self.draft.surfaceRows?.[y]?.[x] ?? null,
      layer === 'structure' ? self.paintStructureType : self.draft.structureRows?.[y]?.[x] ?? null,
      layer === 'interactable'
        ? (self.paintInteractableKind ? [self.paintInteractableKind] : [])
        : self.draft.interactableRows?.[y]?.[x] ?? [],
    );
  }

export function isLayerPaintNoopImpl(self: GmMapEditor, layer: PaintLayer, x: number, y: number): boolean {
    if (!self.draft) return true;
    if (layer === 'terrain') return self.draft.terrainRows?.[y]?.[x] === self.paintTerrainType;
    if (layer === 'surface') return (self.draft.surfaceRows?.[y]?.[x] ?? null) === self.paintSurfaceType;
    if (layer === 'structure') return (self.draft.structureRows?.[y]?.[x] ?? null) === self.paintStructureType;
    const current = self.draft.interactableRows?.[y]?.[x] ?? [];
    return self.paintInteractableKind ? current.length === 1 && current[0] === self.paintInteractableKind : current.length === 0;
  }
export function getLayerStateAtImpl(self: GmMapEditor, x: number, y: number): {
    terrain: TerrainType;
    surface: SurfaceType | null;
    structure: StructureType | null;
    interactableKinds: InteractableKind[];
  } {
    self.ensureLayerRows();
    const fallback = resolveTileLayerSeedFromTileType(getTileTypeFromMapChar(self.draft?.tiles[y]?.[x] ?? '.'));
    return {
      terrain: self.draft?.terrainRows?.[y]?.[x] ?? fallback.terrain,
      surface: self.draft?.surfaceRows?.[y]?.[x] ?? fallback.surface,
      structure: self.draft?.structureRows?.[y]?.[x] ?? fallback.structure,
      interactableKinds: [...(self.draft?.interactableRows?.[y]?.[x] ?? fallback.interactables)],
    };
  }

export function syncLegacyTileFromLayersImpl(self: GmMapEditor, x: number, y: number): void {
    if (!self.draft) return;
    const nextChar = getMapCharFromTileType(composeTileTypeFromLayers(
      self.draft.terrainRows?.[y]?.[x],
      self.draft.surfaceRows?.[y]?.[x] ?? null,
      self.draft.structureRows?.[y]?.[x] ?? null,
      self.draft.interactableRows?.[y]?.[x] ?? [],
    ));
    const row = [...(self.draft.tiles[y] ?? '')];
    row[x] = nextChar;
    self.draft.tiles[y] = row.join('');
  }

export function applyAuraPaintImpl(self: GmMapEditor, points: GridPoint[], recordUndo: boolean, overrideValue?: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return 0;
    const nextValue = Math.max(0, Math.floor(overrideValue ?? self.auraPaintValue));
    const selectedAuraPoint = self.selectedEntity?.kind === 'aura' ? self.getSelectedEntityPoint() : null;
    const nextAuras = [...(self.draft.auras ?? [])];
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (changedKeys.has(key)) continue;
      const index = nextAuras.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y);
      if (nextValue === 0) {
        if (index >= 0) {
          nextAuras.splice(index, 1);
          changedKeys.add(key);
        }
        continue;
      }
      if (index >= 0) {
        if (nextAuras[index]!.value !== nextValue) {
          nextAuras[index] = { ...nextAuras[index]!, value: nextValue };
          changedKeys.add(key);
        }
        continue;
      }
      nextAuras.push({ x: point.x, y: point.y, value: nextValue });
      changedKeys.add(key);
    }

    if (changedKeys.size === 0) {
      return 0;
    }
    if (recordUndo) {
      self.captureUndoState();
    }
    self.draft.auras = nextAuras;
    if (selectedAuraPoint) {
      const nextIndex = nextAuras.findIndex((point) => point.x === selectedAuraPoint.x && point.y === selectedAuraPoint.y);
      self.selectedEntity = nextIndex >= 0 ? { kind: 'aura', index: nextIndex } : null;
    }
    self.markDirty(false);
    return changedKeys.size;
  }  

export function applyResourcePaintImpl(self: GmMapEditor,
    points: GridPoint[],
    recordUndo: boolean,
    overrideValue?: number,
    overrideResourceKey?: string,
  ): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return 0;
    const resourceKey = (overrideResourceKey ?? self.resourcePaintKey).trim();
    if (!resourceKey) {
      self.setStatus('资源键不能为空', true);
      return 0;
    }
    const nextValue = Math.max(0, Math.floor(overrideValue ?? self.resourcePaintValue));
    const selectedResourcePoint = self.selectedEntity?.kind === 'resource' ? self.getSelectedEntityPoint() : null;
    const nextResources = [...(self.draft.resources ?? [])];
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y},${resourceKey}`;
      if (changedKeys.has(key)) continue;
      const index = nextResources.findIndex((candidate) => (
        candidate.x === point.x
        && candidate.y === point.y
        && getResourceRecordKey(candidate) === resourceKey
      ));
      if (nextValue === 0) {
        if (index >= 0) {
          nextResources.splice(index, 1);
          changedKeys.add(key);
        }
        continue;
      }
      if (index >= 0) {
        if (nextResources[index]!.value !== nextValue) {
          nextResources[index] = { ...nextResources[index]!, value: nextValue };
          setResourceRecordKey(nextResources[index]!, resourceKey);
          changedKeys.add(key);
        }
        continue;
      }
      const nextPoint: TileResourcePoint = {
        x: point.x,
        y: point.y,
        value: nextValue,
        resourceKey: resourceKey,
      };
      nextResources.push(nextPoint);
      changedKeys.add(key);
    }

    if (changedKeys.size === 0) {
      return 0;
    }
    if (recordUndo) {
      self.captureUndoState();
    }
    self.draft.resources = nextResources;
    if (selectedResourcePoint) {
      const nextIndex = nextResources.findIndex((point) => point.x === selectedResourcePoint.x && point.y === selectedResourcePoint.y);
      self.selectedEntity = nextIndex >= 0 ? { kind: 'resource', index: nextIndex } : null;
    }
    self.resourcePaintKey = resourceKey;
    self.markDirty(false);
    return changedKeys.size;
  }

export function findResourceIndexImpl(self: GmMapEditor, x: number, y: number, resourceKey: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) {
      return -1;
    }
    return (self.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y && getResourceRecordKey(point) === resourceKey);
  }

export function getLinePointsImpl(self: GmMapEditor, start: GridPoint, end: GridPoint): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const points: GridPoint[] = [];
    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const err2 = err * 2;
      if (err2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (err2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return points;
  }

export function hasBlockingMapObjectAtImpl(self: GmMapEditor, x: number, y: number, ignoredSelection: MapEntitySelection = null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    if (self.draft.spawnPoint.x === x && self.draft.spawnPoint.y === y) return true;
    if (self.draft.portals.some((portal, index) => !(ignoredSelection?.kind === 'portal' && ignoredSelection.index === index) && portal.x === x && portal.y === y)) return true;
    if (self.draft.npcs.some((npc, index) => !(ignoredSelection?.kind === 'npc' && ignoredSelection.index === index) && npc.x === x && npc.y === y)) return true;
    if (self.draft.monsterSpawns.some((spawn, index) => !(ignoredSelection?.kind === 'monster' && ignoredSelection.index === index) && spawn.x === x && spawn.y === y)) return true;
    return false;
  }

export function hasAuraAtImpl(self: GmMapEditor, x: number, y: number, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    return (self.draft.auras ?? []).some((point, index) => index !== ignoredIndex && point.x === x && point.y === y);
  }

export function hasResourceAtImpl(self: GmMapEditor, x: number, y: number, resourceKey: string, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    return (self.draft.resources ?? []).some((point, index) => (
      index !== ignoredIndex
      && point.x === x
      && point.y === y
      && getResourceRecordKey(point) === resourceKey
    ));
  }

export function hasLandmarkAtImpl(self: GmMapEditor, x: number, y: number, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return false;
    return (self.draft.landmarks ?? []).some((landmark, index) => index !== ignoredIndex && landmark.x === x && landmark.y === y);
  }

export function ensureSelectedCellImpl(self: GmMapEditor): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.selectedCell) {
      self.setStatus('请先在画布上选中一个格子', true);
      return false;
    }
    return true;
  }

export function ensureWalkableSelectionImpl(self: GmMapEditor, label: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.selectedCell) return false;
    if (!isTileTypeWalkable(self.getTileTypeAt(self.selectedCell.x, self.selectedCell.y))) {
      self.setStatus(`${label} 必须放在可通行地块上`, true);
      return false;
    }
    return true;
  }

export function getTileTypeAtImpl(self: GmMapEditor, x: number, y: number): TileType {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return TileType.Floor;
    if (self.draft.terrainRows || self.draft.surfaceRows || self.draft.structureRows || self.draft.interactableRows) {
      return composeTileTypeFromLayers(
        self.draft.terrainRows?.[y]?.[x],
        self.draft.surfaceRows?.[y]?.[x] ?? null,
        self.draft.structureRows?.[y]?.[x] ?? null,
        self.draft.interactableRows?.[y]?.[x] ?? [],
      );
    }
    return getTileTypeFromMapChar(self.draft.tiles[y]?.[x] ?? '.');
  }

export function getTileVisualSourceAtImpl(self: GmMapEditor, x: number, y: number): RuntimeTileVisualSource | null {
    if (!self.draft || x < 0 || y < 0 || x >= self.draft.width || y >= self.draft.height) {
      return null;
    }
    const layers = self.getLayerStateAt(x, y);
    return {
      type: composeTileTypeFromLayers(
        layers.terrain,
        layers.surface,
        layers.structure,
        layers.interactableKinds,
      ),
      terrainType: layers.terrain,
      surfaceType: layers.surface,
      structureType: layers.structure,
      interactableKinds: layers.interactableKinds,
    };
  }

export function findEntityAtImpl(self: GmMapEditor, x: number, y: number): MapEntitySelection {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return null;
    const npcIndex = self.draft.npcs.findIndex((npc) => npc.x === x && npc.y === y);
    if (npcIndex >= 0) return { kind: 'npc', index: npcIndex };
    const monsterIndex = self.draft.monsterSpawns.findIndex((spawn) => spawn.x === x && spawn.y === y);
    if (monsterIndex >= 0) return { kind: 'monster', index: monsterIndex };
    const portalIndex = self.draft.portals.findIndex((portal) => portal.x === x && portal.y === y);
    if (portalIndex >= 0) return { kind: 'portal', index: portalIndex };
    const auraIndex = (self.draft.auras ?? []).findIndex((point) => point.x === x && point.y === y);
    if (auraIndex >= 0) return { kind: 'aura', index: auraIndex };
    const resourceIndex = (self.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y);
    if (resourceIndex >= 0) return { kind: 'resource', index: resourceIndex };
    const safeZoneIndex = (self.draft.safeZones ?? []).findIndex((zone) => zone.x === x && zone.y === y);
    if (safeZoneIndex >= 0) return { kind: 'safeZone', index: safeZoneIndex };
    const containerIndex = (self.draft.landmarks ?? []).findIndex((landmark) => landmark.container && landmark.x === x && landmark.y === y);
    if (containerIndex >= 0) return { kind: 'container', index: containerIndex };
    const landmarkIndex = (self.draft.landmarks ?? []).findIndex((landmark) => landmark.x === x && landmark.y === y);
    if (landmarkIndex >= 0) return { kind: 'landmark', index: landmarkIndex };
    return null;
  }

export function getSelectedEntityPointImpl(self: GmMapEditor): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || !self.selectedEntity) return null;
    if (self.selectedEntity.kind === 'portal') {
      const portal = self.draft.portals[self.selectedEntity.index];
      return portal ? { x: portal.x, y: portal.y } : null;
    }
    if (self.selectedEntity.kind === 'npc') {
      const npc = self.draft.npcs[self.selectedEntity.index];
      return npc ? { x: npc.x, y: npc.y } : null;
    }
    if (self.selectedEntity.kind === 'monster') {
      const spawn = self.draft.monsterSpawns[self.selectedEntity.index];
      return spawn ? { x: spawn.x, y: spawn.y } : null;
    }
    if (self.selectedEntity.kind === 'aura') {
      const aura = self.draft.auras?.[self.selectedEntity.index];
      return aura ? { x: aura.x, y: aura.y } : null;
    }
    if (self.selectedEntity.kind === 'resource') {
      const resource = self.draft.resources?.[self.selectedEntity.index];
      return resource ? { x: resource.x, y: resource.y } : null;
    }
    if (self.selectedEntity.kind === 'safeZone') {
      const zone = self.draft.safeZones?.[self.selectedEntity.index];
      return zone ? { x: zone.x, y: zone.y } : null;
    }
    if (self.selectedEntity.kind === 'container') {
      const landmark = self.getContainerLandmark(self.selectedEntity.index);
      return landmark ? { x: landmark.x, y: landmark.y } : null;
    }
    const landmark = self.draft.landmarks?.[self.selectedEntity.index];
    return landmark ? { x: landmark.x, y: landmark.y } : null;
  }
