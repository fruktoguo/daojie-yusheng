/**
 * 渲染器接口定义 —— 约束所有渲染器实现必须提供的能力
 */

import { GameTimeState, GridPoint, NpcQuestMarker, TargetingShape, Tile } from '@mud/shared';
import { Camera } from './camera';

/** 技能瞄准叠加层状态 */
export interface TargetingOverlayState {
  originX: number;
  originY: number;
  range: number;
  visibleOnly?: boolean;
  shape?: TargetingShape;
  radius?: number;
  affectedCells?: GridPoint[];
  hoverX?: number;
  hoverY?: number;
}

/** 感气视角叠加层状态 */
export interface SenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

/** 渲染器统一接口，当前由 TextRenderer 实现，后续可替换为 SpriteRenderer */
export interface IRenderer {
  init(canvas: HTMLCanvasElement): void;
  clear(): void;
  resetScene(): void;
  setThreatArrows(arrows: Array<{ ownerId: string; targetId: string }>): void;
  setPathHighlight(cells: GridPoint[], fadeDurationMs?: number): void;
  setTargetingOverlay(state: TargetingOverlayState | null): void;
  setSenseQiOverlay(state: SenseQiOverlayState | null): void;
  renderWorld(
    camera: Camera,
    tileCache: Map<string, Tile>,
    visibleTiles: Set<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ): void;
  updateEntities(
    list: {
      id: string;
      wx: number;
      wy: number;
      char: string;
      color: string;
      name?: string;
      kind?: string;
      hp?: number;
      maxHp?: number;
      npcQuestMarker?: NpcQuestMarker;
    }[],
    movedId?: string,
    shiftX?: number,
    shiftY?: number,
    settleMotion?: boolean,
    settleEntityId?: string,
    motionSyncToken?: number,
  ): void;
  renderEntities(camera: Camera, progress?: number, localPlayerId?: string): void;
  addFloatingText(x: number, y: number, text: string, color?: string): void;
  addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color?: string): void;
  renderFloatingTexts(camera: Camera): void;
  renderAttackTrails(camera: Camera): void;
  destroy(): void;
}
