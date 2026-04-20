/** 渲染器能力约束，确保 TextRenderer 与其他实现保持一致。 */

import { GameTimeState, GridPoint, NpcQuestMarker, TargetingShape, Tile } from '@mud/shared-next';
import { Camera } from './camera';

/** 浮动文本可选样式。 */
export type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

/** 技能瞄准叠加层状态。 */
export interface TargetingOverlayState {
/**
 * originX：TargetingOverlayState 内部字段。
 */

  originX: number;  
  /**
 * originY：TargetingOverlayState 内部字段。
 */

  originY: number;  
  /**
 * range：TargetingOverlayState 内部字段。
 */

  range: number;  
  /**
 * visibleOnly：TargetingOverlayState 内部字段。
 */

  visibleOnly?: boolean;  
  /**
 * shape：TargetingOverlayState 内部字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：TargetingOverlayState 内部字段。
 */

  radius?: number;  
  /**
 * affectedCells：TargetingOverlayState 内部字段。
 */

  affectedCells?: GridPoint[];  
  /**
 * hoverX：TargetingOverlayState 内部字段。
 */

  hoverX?: number;  
  /**
 * hoverY：TargetingOverlayState 内部字段。
 */

  hoverY?: number;
}

/** 感气视角叠加层状态。 */
export interface SenseQiOverlayState {
/**
 * hoverX：SenseQiOverlayState 内部字段。
 */

  hoverX?: number;  
  /**
 * hoverY：SenseQiOverlayState 内部字段。
 */

  hoverY?: number;  
  /**
 * levelBaseValue：SenseQiOverlayState 内部字段。
 */

  levelBaseValue?: number;
}

/** 渲染器统一接口，当前由 TextRenderer 实现，未来可替换为 SpriteRenderer。 */
export interface IRenderer {
  init(canvas: HTMLCanvasElement): void;
  clear(): void;
  resetScene(): void;
  setThreatArrows(arrows: Array<{  
  /**
 * ownerId：IRenderer 内部字段。
 */
 ownerId: string;  
 /**
 * targetId：IRenderer 内部字段。
 */
 targetId: string }>): void;
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
    /**
 * id：IRenderer 内部字段。
 */

      id: string;      
      /**
 * wx：IRenderer 内部字段。
 */

      wx: number;      
      /**
 * wy：IRenderer 内部字段。
 */

      wy: number;      
      /**
 * char：IRenderer 内部字段。
 */

      char: string;      
      /**
 * color：IRenderer 内部字段。
 */

      color: string;      
      /**
 * name：IRenderer 内部字段。
 */

      name?: string;      
      /**
 * kind：IRenderer 内部字段。
 */

      kind?: string;      
      /**
 * hp：IRenderer 内部字段。
 */

      hp?: number;      
      /**
 * maxHp：IRenderer 内部字段。
 */

      maxHp?: number;      
      /**
 * npcQuestMarker：IRenderer 内部字段。
 */

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



