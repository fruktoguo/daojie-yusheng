/**
 * gm-map-editor.compose.ts —— GM 地图编辑器合成块（Compose Piece）操作。
 *
 * 从 GmMapEditor 类抽取的合图子块管理逻辑：来源地图缓存、子块增删旋转、烘焙等。
 * 通过 self: GmMapEditor 参数接收编辑器实例，不直接依赖类实例的私有字段。
 * 纯逻辑移动，不改变任何面板行为或协议字段。
 */

import {
  type GmMapDocument,
  type GmMapDetailRes,
  getTileTypeFromMapChar,
  resolveTileLayerSeedFromTileType,
} from '@mud/shared';
import { type GmMapEditor, type MapComposePiece } from './gm-map-editor';
import {
  clone,
  rotateComposeClockwise,
  rotateComposeCounterClockwise,
} from './gm-map-editor-helpers';
export function findComposePieceAtImpl(self: GmMapEditor, x: number, y: number): MapComposePiece | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (let index = self.composePieces.length - 1; index >= 0; index -= 1) {
      const piece = self.composePieces[index]!;
      const bounds = self.getComposePieceBounds(piece);
      if (!bounds) continue;
      if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
        return piece;
      }
    }
    return null;
  }

export async function ensureComposeSourceMapImpl(self: GmMapEditor, sourceMapId: string): Promise<GmMapDocument> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const cached = self.composeSourceCache.get(sourceMapId);
    if (cached) {
      return cached;
    }
    const data = await self.request<GmMapDetailRes>(`${self.mapApiBasePath}/${encodeURIComponent(sourceMapId)}`);
    const map = clone(data.map);
    self.composeSourceCache.set(sourceMapId, map);
    return map;
  }

export function getComposePieceSizeImpl(self: GmMapEditor, piece: MapComposePiece): {  
  /**
 * width：width相关字段。
 */
 width: number;  
 /**
 * height：height相关字段。
 */
 height: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const source = self.composeSourceCache.get(piece.sourceMapId);
    if (!source) return null;
    const interiorWidth = Math.max(0, source.width - 2);
    const interiorHeight = Math.max(0, source.height - 2);
    if (piece.rotation === 90 || piece.rotation === 270) {
      return { width: interiorHeight, height: interiorWidth };
    }
    return { width: interiorWidth, height: interiorHeight };
  }

export function getComposePieceBoundsImpl(self: GmMapEditor, piece: MapComposePiece): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number;  
 /**
 * width：width相关字段。
 */
 width: number;  
 /**
 * height：height相关字段。
 */
 height: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const size = self.getComposePieceSize(piece);
    if (!size) return null;
    return {
      x: piece.x,
      y: piece.y,
      width: size.width,
      height: size.height,
    };
  }

export function clampComposePiecePositionImpl(self: GmMapEditor, piece: MapComposePiece): MapComposePiece {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return piece;
    const size = self.getComposePieceSize(piece);
    if (!size) return piece;
    return {
      ...piece,
      x: Math.min(Math.max(0, piece.x), Math.max(0, self.draft.width - size.width)),
      y: Math.min(Math.max(0, piece.y), Math.max(0, self.draft.height - size.height)),
    };
  }

export function getSelectedComposePieceImpl(self: GmMapEditor): MapComposePiece | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.selectedComposePieceId) return null;
    return self.composePieces.find((piece) => piece.id === self.selectedComposePieceId) ?? null;
  }

export async function addComposePieceImpl(self: GmMapEditor): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return;
    const sourceMapId = self.composeSourceMapId.trim();
    if (!sourceMapId) {
      self.setStatus('请先选择来源地图', true);
      return;
    }
    if (sourceMapId === self.draft.id) {
      self.setStatus('不能把当前地图自己当成拼图块', true);
      return;
    }
    const source = await self.ensureComposeSourceMap(sourceMapId);
    const anchor = self.selectedCell
      ? { ...self.selectedCell }
      : { x: Math.max(0, Math.floor(self.draft.width / 2) - 2), y: Math.max(0, Math.floor(self.draft.height / 2) - 2) };
    const piece = self.clampComposePiecePosition({
      id: `compose_${self.composePieceCounter}`,
      sourceMapId,
      sourceMapName: source.name,
      x: anchor.x,
      y: anchor.y,
      rotation: 0,
    });
    self.composePieceCounter += 1;
    self.captureUndoState();
    self.composePieces.push(piece);
    self.selectedComposePieceId = piece.id;
    self.selectedEntity = null;
    self.currentInspectorTab = 'compose';
    self.selectedCell = { x: piece.x, y: piece.y };
    self.renderInspector();
    self.setStatus(`已加入拼图块：${source.name}`);
  }  

export function updateComposePieceImpl(self: GmMapEditor, pieceId: string, updater: (piece: MapComposePiece) => MapComposePiece): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const index = self.composePieces.findIndex((piece) => piece.id === pieceId);
    if (index < 0) return false;
    self.composePieces[index] = self.clampComposePiecePosition(updater(self.composePieces[index]!));
    return true;
  }

export function rotateSelectedComposePieceImpl(self: GmMapEditor, clockwise: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selected = self.getSelectedComposePiece();
    if (!selected) {
      self.setStatus('请先选中一个拼图块', true);
      return;
    }
    self.captureUndoState();
    self.updateComposePiece(selected.id, (piece) => ({
      ...piece,
      rotation: clockwise ? rotateComposeClockwise(piece.rotation) : rotateComposeCounterClockwise(piece.rotation),
    }));
    const updated = self.getSelectedComposePiece();
    if (updated) {
      self.selectedCell = { x: updated.x, y: updated.y };
    }
    self.renderInspector();
    self.setStatus(`已${clockwise ? '右转' : '左转'}拼图块 90°`);
  }

export function removeSelectedComposePieceImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selected = self.getSelectedComposePiece();
    if (!selected) {
      self.setStatus('请先选中一个拼图块', true);
      return;
    }
    self.captureUndoState();
    self.composePieces = self.composePieces.filter((piece) => piece.id !== selected.id);
    self.selectedComposePieceId = null;
    self.renderInspector();
    self.setStatus(`已删除拼图块：${selected.sourceMapName}`);
  }

export function clearComposePiecesImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (self.composePieces.length === 0) {
      self.setStatus('当前没有拼图块');
      return;
    }
    self.captureUndoState();
    self.composePieces = [];
    self.selectedComposePieceId = null;
    self.renderInspector();
    self.setStatus('已清空全部拼图块');
  }  

export function forEachComposePieceTileImpl(self: GmMapEditor, 
    piece: MapComposePiece,
    visitor: (targetX: number, targetY: number, sourceX: number, sourceY: number, sourceChar: string) => void,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const source = self.composeSourceCache.get(piece.sourceMapId);
    if (!source) return;
    const interiorWidth = Math.max(0, source.width - 2);
    const interiorHeight = Math.max(0, source.height - 2);
    for (let sourceY = 1; sourceY < source.height - 1; sourceY += 1) {
      const row = [...source.tiles[sourceY]!];
      for (let sourceX = 1; sourceX < source.width - 1; sourceX += 1) {
        const localX = sourceX - 1;
        const localY = sourceY - 1;
        let targetOffsetX = localX;
        let targetOffsetY = localY;
        switch (piece.rotation) {
          case 90:
            targetOffsetX = interiorHeight - 1 - localY;
            targetOffsetY = localX;
            break;
          case 180:
            targetOffsetX = interiorWidth - 1 - localX;
            targetOffsetY = interiorHeight - 1 - localY;
            break;
          case 270:
            targetOffsetX = localY;
            targetOffsetY = interiorWidth - 1 - localX;
            break;
          default:
            break;
        }
        visitor(piece.x + targetOffsetX, piece.y + targetOffsetY, sourceX, sourceY, row[sourceX]!);
      }
    }
  }

export function bakeComposePieceImpl(self: GmMapEditor, piece: MapComposePiece, recordUndo: boolean): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft) return 0;
    const source = self.composeSourceCache.get(piece.sourceMapId);
    self.ensureLayerRows();
    const changed = new Map<number, string[]>();
    let changedCount = 0;
    self.forEachComposePieceTile(piece, (targetX, targetY, sourceX, sourceY, sourceChar) => {
      if (targetX < 0 || targetY < 0 || targetX >= self.draft!.width || targetY >= self.draft!.height) {
        return;
      }
      const row = changed.get(targetY) ?? [...(self.draft!.tiles[targetY] ?? '')];
      if (row[targetX] === sourceChar) {
        changed.set(targetY, row);
        return;
      }
      row[targetX] = sourceChar;
      const seed = resolveTileLayerSeedFromTileType(getTileTypeFromMapChar(sourceChar));
      self.draft!.terrainRows![targetY]![targetX] = source?.terrainRows?.[sourceY]?.[sourceX] ?? seed.terrain;
      self.draft!.surfaceRows![targetY]![targetX] = source?.surfaceRows?.[sourceY]?.[sourceX] ?? seed.surface;
      self.draft!.structureRows![targetY]![targetX] = source?.structureRows?.[sourceY]?.[sourceX] ?? seed.structure;
      self.draft!.interactableRows![targetY]![targetX] = [...(source?.interactableRows?.[sourceY]?.[sourceX] ?? seed.interactables)];
      changed.set(targetY, row);
      changedCount += 1;
    });
    if (changedCount === 0) {
      return 0;
    }
    if (recordUndo) {
      self.captureUndoState();
    }
    for (const [y, row] of changed) {
      self.draft.tiles[y] = row.join('');
    }
    return changedCount;
  }

export function bakeSelectedComposePieceImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selected = self.getSelectedComposePiece();
    if (!selected) {
      self.setStatus('请先选中一个拼图块', true);
      return;
    }
    const changed = self.bakeComposePiece(selected, true);
    if (changed <= 0) {
      self.setStatus('选中拼图块没有产生地块变化');
      return;
    }
    self.composePieces = self.composePieces.filter((piece) => piece.id !== selected.id);
    self.selectedComposePieceId = null;
    self.markDirty();
    self.setStatus(`已烘焙拼图块：${selected.sourceMapName}`);
  }

export function bakeAllComposePiecesImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || self.composePieces.length === 0) {
      self.setStatus('当前没有可烘焙的拼图块', true);
      return;
    }
    self.captureUndoState();
    let changed = 0;
    for (const piece of self.composePieces) {
      changed += self.bakeComposePiece(piece, false);
    }
    if (changed <= 0) {
      self.undoStack.pop();
      self.updateUndoButtonState();
      self.setStatus('全部拼图块都没有产生地块变化');
      return;
    }
    self.composePieces = [];
    self.selectedComposePieceId = null;
    self.markDirty();
    self.setStatus(`已烘焙全部拼图块，共写入 ${changed} 个格子`);
  }
