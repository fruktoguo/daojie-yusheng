/** 渲染器能力约束，确保 TextRenderer 与其他实现保持一致。 */

import { GameTimeState, GridPoint, NpcQuestMarker, RenderEntity, TargetingShape, Tile, VisibleBuffState } from '@mud/shared';
import { Camera } from './camera';

/** 浮动文本可选样式。 */
export type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

/** 技能瞄准叠加层状态。 */
export interface TargetingOverlayState {
/**
 * originX：originX相关字段。
 */

  originX: number;  
  /**
 * originY：originY相关字段。
 */

  originY: number;  
  /**
 * range：范围相关字段。
 */

  range: number;  
  /**
 * visibleOnly：可见Only相关字段。
 */

  visibleOnly?: boolean;  
  /**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：radiu相关字段。
 */

  radius?: number;  
  /**
 * affectedCells：affectedCell相关字段。
 */

  affectedCells?: GridPoint[];  
  /**
 * hoverX：hoverX相关字段。
 */

  hoverX?: number;  
  /**
 * hoverY：hoverY相关字段。
 */

  hoverY?: number;
}

/** 阵法布置范围叠加层状态。 */
export interface FormationRangeOverlayState {
/**
 * affectedCells：affectedCell相关字段。
 */

  affectedCells: GridPoint[];
  /** rangeHighlightColor：范围高亮颜色。 */
  rangeHighlightColor?: string;
}

/** 感气视角叠加层状态。 */
export interface SenseQiOverlayState {
/**
 * hoverX：hoverX相关字段。
 */

  hoverX?: number;  
  /**
 * hoverY：hoverY相关字段。
 */

  hoverY?: number;  
  /**
 * levelBaseValue：等级Base值数值。
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
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }>): void;
  setPathHighlight(cells: GridPoint[], fadeDurationMs?: number): void;
  setTargetingOverlay(state: TargetingOverlayState | null): void;
  setFormationRangeOverlay(state: FormationRangeOverlayState | null): void;
  setSenseQiOverlay(state: SenseQiOverlayState | null): void;
  renderWorld(
    camera: Camera,
    tileCache: ReadonlyMap<string, Tile>,
    visibleTiles: ReadonlySet<string>,
    visibleTileRevision: number,
    visibleTileTransitionStartedAt: number,
    visibleTileTransitionDurationMs: number,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ): void;
  updateEntities(
    list: readonly {    
    /**
 * id：ID标识。
 */

      id: string;      
      /**
 * wx：wx相关字段。
 */

      wx: number;      
      /**
 * wy：wy相关字段。
 */

      wy: number;      
      /**
 * char：char相关字段。
 */

      char: string;      
      /**
 * color：color相关字段。
 */

      color: string;      
      /**
 * badge：badge相关字段。
 */

      badge?: RenderEntity['badge'];      
      /**
 * name：名称名称或显示文本。
 */

      name?: string;      
      /**
 * kind：kind相关字段。
 */

      kind?: string;      
      /**
 * monsterTier：怪物Tier相关字段。
 */

      monsterTier?: RenderEntity['monsterTier'];      
      /**
 * monsterScale：怪物Scale相关字段。
 */

      monsterScale?: RenderEntity['monsterScale'];      
      /**
 * hp：hp相关字段。
 */

      hp?: number;      
      /**
 * maxHp：maxHp相关字段。
 */

      maxHp?: number;      
      /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

      npcQuestMarker?: NpcQuestMarker;
      /**
 * hostile：hostile相关字段。
 */

      hostile?: boolean;
      /**
 * buffs：buff相关字段。
 */

      buffs?: VisibleBuffState[];
      formationRadius?: RenderEntity['formationRadius'];
      formationRangeShape?: RenderEntity['formationRangeShape'];
      formationRangeHighlightColor?: RenderEntity['formationRangeHighlightColor'];
      formationBoundaryChar?: RenderEntity['formationBoundaryChar'];
      formationBoundaryColor?: RenderEntity['formationBoundaryColor'];
      formationBoundaryRangeHighlightColor?: RenderEntity['formationBoundaryRangeHighlightColor'];
      formationEyeVisibleWithoutSenseQi?: RenderEntity['formationEyeVisibleWithoutSenseQi'];
      formationRangeVisibleWithoutSenseQi?: RenderEntity['formationRangeVisibleWithoutSenseQi'];
      formationBoundaryVisibleWithoutSenseQi?: RenderEntity['formationBoundaryVisibleWithoutSenseQi'];
      formationShowText?: RenderEntity['formationShowText'];
      formationBlocksBoundary?: RenderEntity['formationBlocksBoundary'];
      formationActive?: RenderEntity['formationActive'];
    }[],
    movedId?: string,
    shiftX?: number,
    shiftY?: number,
    settleMotion?: boolean,
    settleEntityId?: string,
    motionSyncToken?: number,
  ): void;
  renderEntities(camera: Camera, progress?: number, localPlayerId?: string, localPlayerX?: number, localPlayerY?: number, localPlayerChar?: string): void;
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
