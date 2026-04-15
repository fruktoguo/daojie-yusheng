/** 渲染器能力约束，确保 TextRenderer 与其他实现保持一致。 */

import { GameTimeState, GridPoint, NpcQuestMarker, TargetingShape, Tile } from '@mud/shared-next';
import { Camera } from './camera';

/** 浮动文本可选样式。 */
export type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

/** 技能瞄准叠加层状态。 */
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

/** 感气视角叠加层状态。 */
export interface SenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

/** 渲染器统一接口，当前由 TextRenderer 实现，未来可替换为 SpriteRenderer。 */
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
    tileCache: ReadonlyMap<string, Tile>,
    visibleTiles: ReadonlySet<string>,
    visibleTileRevision: number,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ): void;
  updateEntities(
    list: readonly {
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
  renderEntities(camera: Camera, progress?: number, localPlayerId?: string, localPlayerX?: number, localPlayerY?: number): void;
  addFloatingText(
    x: number,
    y: number,
    text: string,
    color?: string,
    variant?: 'damage' | 'action',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ): void;
  addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color?: string): void;
  renderFloatingTexts(camera: Camera): void;
  renderAttackTrails(camera: Camera): void;
  destroy(): void;
}



