import {
  type ActionDef,
  type GridPoint,
  type PlayerState,
  type TargetingShape,
  type Tile,
} from '@mud/shared-next';
import { isPlayerLikeEntityKind, type MainRuntimeObservedEntity } from './main-runtime-view-types';
import {
  computeAffectedCellsForAction as computeAffectedCellsForActionHelper,
  getSkillDefByActionId as getSkillDefByActionIdHelper,
  hasAffectableTargetInArea as hasAffectableTargetInAreaHelper,
  resolveCurrentTargetingRange as resolveCurrentTargetingRangeHelper,
  resolveTargetRefForAction as resolveTargetRefForActionHelper,
} from './main-targeting-helpers';
/**
 * MainTargetingPendingAction：统一结构类型，保证协议与运行时一致性。
 */


export type MainTargetingPendingAction = {
/**
 * actionId：对象字段。
 */

  actionId: string;  
  /**
 * actionName：对象字段。
 */

  actionName: string;  
  /**
 * targetMode：对象字段。
 */

  targetMode?: string;  
  /**
 * range：对象字段。
 */

  range: number;  
  /**
 * shape：对象字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：对象字段。
 */

  radius?: number;  
  /**
 * width：对象字段。
 */

  width?: number;  
  /**
 * height：对象字段。
 */

  height?: number;  
  /**
 * maxTargets：对象字段。
 */

  maxTargets?: number;  
  /**
 * hoverX：对象字段。
 */

  hoverX?: number;  
  /**
 * hoverY：对象字段。
 */

  hoverY?: number;
} | null;
/**
 * MainTargetingHoveredTile：统一结构类型，保证协议与运行时一致性。
 */


export type MainTargetingHoveredTile = {
/**
 * x：对象字段。
 */

  x: number;  
  /**
 * y：对象字段。
 */

  y: number;  
  /**
 * clientX：对象字段。
 */

  clientX: number;  
  /**
 * clientY：对象字段。
 */

  clientY: number;
} | null;
/**
 * MainTargetingObservedEntity：统一结构类型，保证协议与运行时一致性。
 */


type MainTargetingObservedEntity = Pick<MainRuntimeObservedEntity, 'id' | 'wx' | 'wy' | 'kind'>;
/**
 * MainTargetingStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainTargetingStateSourceOptions = {
/**
 * getPlayer：对象字段。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * getInfoRadius：对象字段。
 */

  getInfoRadius: () => number;  
  /**
 * getLatestEntities：对象字段。
 */

  getLatestEntities: () => MainTargetingObservedEntity[];  
  /**
 * getVisibleTileAt：对象字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;  
  /**
 * setTargetingOverlay：对象字段。
 */

  setTargetingOverlay: (overlay: {  
  /**
 * originX：对象字段。
 */

    originX: number;    
    /**
 * originY：对象字段。
 */

    originY: number;    
    /**
 * range：对象字段。
 */

    range: number;    
    /**
 * visibleOnly：对象字段。
 */

    visibleOnly: boolean;    
    /**
 * shape：对象字段。
 */

    shape?: TargetingShape;    
    /**
 * radius：对象字段。
 */

    radius?: number;    
    /**
 * affectedCells：对象字段。
 */

    affectedCells: Array<{    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number }>;    
 /**
 * hoverX：对象字段。
 */

    hoverX?: number;    
    /**
 * hoverY：对象字段。
 */

    hoverY?: number;
  } | null) => void;  
  /**
 * setSenseQiOverlay：对象字段。
 */

  setSenseQiOverlay: (overlay: {  
  /**
 * hoverX：对象字段。
 */
 hoverX?: number;  
 /**
 * hoverY：对象字段。
 */
 hoverY?: number;  
 /**
 * levelBaseValue：对象字段。
 */
 levelBaseValue: number } | null) => void;  
 /**
 * targetingBadgeEl：对象字段。
 */

  targetingBadgeEl: HTMLElement | null;  
  /**
 * senseQiTooltip：对象字段。
 */

  senseQiTooltip: Pick<
    import('./ui/floating-tooltip').FloatingTooltip,
    'show' | 'hide'
  >;  
  /**
 * getAuraLevelBaseValue：对象字段。
 */

  getAuraLevelBaseValue: () => number;  
  /**
 * formatAuraLevelText：对象字段。
 */

  formatAuraLevelText: (auraValue: number) => string;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;
};
/**
 * doesTargetingRequireVision：执行核心业务逻辑。
 * @param actionId string action ID。
 * @returns boolean。
 */


function doesTargetingRequireVision(actionId: string): boolean {
  return actionId === 'client:observe' || actionId === 'battle:force_attack';
}
/**
 * MainTargetingStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainTargetingStateSource = ReturnType<typeof createMainTargetingStateSource>;
/**
 * createMainTargetingStateSource：构建并返回目标对象。
 * @param options MainTargetingStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainTargetingStateSource(options: MainTargetingStateSourceOptions) {
  let pendingTargetedAction: MainTargetingPendingAction = null;
  let hoveredMapTile: MainTargetingHoveredTile = null;  
  /**
 * computeAffectedCells：执行核心业务逻辑。
 * @param action NonNullable<MainTargetingPendingAction> 参数说明。
 * @returns Array<{ x: number; y: number }>。
 */


  function computeAffectedCells(action: NonNullable<MainTargetingPendingAction>): Array<{  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (action.hoverX === undefined || action.hoverY === undefined) {
      return [];
    }
    return computeAffectedCellsForActionHelper(action, { x: action.hoverX, y: action.hoverY }, options.getPlayer());
  }

  return {  
  /**
 * getPendingTargetedAction：按给定条件读取/查询数据。
 * @returns MainTargetingPendingAction。
 */

    getPendingTargetedAction(): MainTargetingPendingAction {
      return pendingTargetedAction;
    },    
    /**
 * hasPendingTargetedAction：执行状态校验并返回判断结果。
 * @returns boolean。
 */


    hasPendingTargetedAction(): boolean {
      return Boolean(pendingTargetedAction);
    },    
    /**
 * getHoveredMapTile：按给定条件读取/查询数据。
 * @returns MainTargetingHoveredTile。
 */


    getHoveredMapTile(): MainTargetingHoveredTile {
      return hoveredMapTile;
    },    
    /**
 * setHoveredMapTile：更新/写入相关状态。
 * @param value MainTargetingHoveredTile 参数说明。
 * @returns void。
 */


    setHoveredMapTile(value: MainTargetingHoveredTile): void {
      hoveredMapTile = value;
    },    
    /**
 * setPendingTargetedActionHover：更新/写入相关状态。
 * @param target { x?: number; y?: number } | null 目标对象。
 * @returns void。
 */


    setPendingTargetedActionHover(target: {    
    /**
 * x：对象字段。
 */
 x?: number;    
 /**
 * y：对象字段。
 */
 y?: number } | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!pendingTargetedAction) {
        return;
      }
      pendingTargetedAction.hoverX = target?.x;
      pendingTargetedAction.hoverY = target?.y;
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      pendingTargetedAction = null;
      hoveredMapTile = null;
    },    
    /**
 * getCurrentActionDef：按给定条件读取/查询数据。
 * @param actionId string action ID。
 * @returns ActionDef | null。
 */


    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.getPlayer()?.actions.find((entry) => entry.id === actionId) ?? null;
    },    
    /**
 * resolveCurrentTargetingRange：执行核心业务逻辑。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range'> 参数说明。
 * @returns number。
 */


    resolveCurrentTargetingRange(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range'>,
    ): number {
      return resolveCurrentTargetingRangeHelper(action, options.getInfoRadius());
    },    
    /**
 * beginTargeting：执行核心业务逻辑。
 * @param actionId string action ID。
 * @param actionName string 参数说明。
 * @param targetMode string 参数说明。
 * @param range 参数说明。
 * @returns void。
 */


    beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (pendingTargetedAction?.actionId === actionId) {
        this.cancelTargeting(true);
        return;
      }
      const skill = getSkillDefByActionIdHelper(options.getPlayer(), actionId);
      pendingTargetedAction = {
        actionId,
        actionName,
        targetMode,
        range: Math.max(1, range),
        shape: skill?.targeting?.shape ?? 'single',
        radius: skill?.targeting?.radius,
        width: skill?.targeting?.width,
        height: skill?.targeting?.height,
        maxTargets: skill?.targeting?.maxTargets,
      };
      pendingTargetedAction.range = this.resolveCurrentTargetingRange(pendingTargetedAction);
      this.syncTargetingOverlay();
      if (actionId === 'client:observe') {
        options.showToast('请选择当前视野内的目标格，Esc 或右键取消');
        return;
      }
      options.showToast(`请选择 ${pendingTargetedAction.range} 格内目标，Esc 或右键取消`);
    },    
    /**
 * cancelTargeting：执行状态校验并返回判断结果。
 * @param showMessage 参数说明。
 * @returns void。
 */


    cancelTargeting(showMessage = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!pendingTargetedAction) {
        return;
      }
      pendingTargetedAction = null;
      this.syncTargetingOverlay();
      if (showMessage) {
        options.showToast('已取消目标选择');
      }
    },    
    /**
 * syncTargetingOverlay：执行核心业务逻辑。
 * @returns void。
 */


    syncTargetingOverlay(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player || !pendingTargetedAction) {
        options.setTargetingOverlay(null);
        options.targetingBadgeEl?.classList.add('hidden');
        this.syncSenseQiOverlay();
        return;
      }
      pendingTargetedAction.range = this.resolveCurrentTargetingRange(pendingTargetedAction);
      const affectedCells = computeAffectedCells(pendingTargetedAction);
      options.setTargetingOverlay({
        originX: player.x,
        originY: player.y,
        range: pendingTargetedAction.range,
        visibleOnly: doesTargetingRequireVision(pendingTargetedAction.actionId),
        shape: pendingTargetedAction.shape,
        radius: pendingTargetedAction.radius,
        affectedCells,
        hoverX: pendingTargetedAction.hoverX,
        hoverY: pendingTargetedAction.hoverY,
      });
      if (options.targetingBadgeEl) {
        const rangeLabel = pendingTargetedAction.actionId === 'client:observe'
          ? `视野 ${pendingTargetedAction.range}`
          : `射程 ${pendingTargetedAction.range}`;
        const shapeLabel = pendingTargetedAction.shape === 'line'
          ? ` · 直线${pendingTargetedAction.maxTargets ? ` ${pendingTargetedAction.maxTargets}目标` : ''}`
          : pendingTargetedAction.shape === 'box'
            ? ` · 矩形 ${Math.max(1, pendingTargetedAction.width ?? 1)}x${Math.max(1, pendingTargetedAction.height ?? pendingTargetedAction.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
            : pendingTargetedAction.shape === 'area'
              ? ` · 范围半径 ${Math.max(0, pendingTargetedAction.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
              : '';
        options.targetingBadgeEl.textContent = `选定 ${pendingTargetedAction.actionName} 目标 · ${rangeLabel}${shapeLabel}`;
        options.targetingBadgeEl.classList.remove('hidden');
      }
      this.syncSenseQiOverlay();
    },    
    /**
 * syncSenseQiOverlay：执行核心业务逻辑。
 * @returns void。
 */


    syncSenseQiOverlay(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player?.senseQiActive) {
        options.setSenseQiOverlay(null);
        options.senseQiTooltip.hide();
        return;
      }

      options.setSenseQiOverlay({
        hoverX: hoveredMapTile?.x,
        hoverY: hoveredMapTile?.y,
        levelBaseValue: options.getAuraLevelBaseValue(),
      });

      if (pendingTargetedAction || !hoveredMapTile) {
        options.senseQiTooltip.hide();
        return;
      }

      const tile = options.getVisibleTileAt(hoveredMapTile.x, hoveredMapTile.y);
      if (!tile) {
        options.senseQiTooltip.hide();
        return;
      }

      options.senseQiTooltip.show(
        '感气视角',
        [
          `坐标 (${hoveredMapTile.x}, ${hoveredMapTile.y})`,
          options.formatAuraLevelText(tile.aura ?? 0),
        ],
        hoveredMapTile.clientX,
        hoveredMapTile.clientY,
      );
    },    
    /**
 * computeAffectedCellsForAction：执行核心业务逻辑。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchor GridPoint 参数说明。
 * @returns GridPoint[]。
 */


    computeAffectedCellsForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return computeAffectedCellsForActionHelper(action, anchor, options.getPlayer());
    },    
    /**
 * resolveTargetRefForAction：执行核心业务逻辑。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'> 参数说明。
 * @param target { x: number; y: number; entityId?: string; entityKind?: string } 目标对象。
 * @returns string | null。
 */


    resolveTargetRefForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
      target: {      
      /**
 * x：对象字段。
 */
 x: number;      
 /**
 * y：对象字段。
 */
 y: number;      
 /**
 * entityId：对象字段。
 */
 entityId?: string;      
 /**
 * entityKind：对象字段。
 */
 entityKind?: string },
    ): string | null {
      return resolveTargetRefForActionHelper(action, target, options.getPlayer());
    },    
    /**
 * hasAffectableTargetInArea：执行状态校验并返回判断结果。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchorX number 参数说明。
 * @param anchorY number 参数说明。
 * @returns boolean。
 */


    hasAffectableTargetInArea(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ): boolean {
      return hasAffectableTargetInAreaHelper(action, anchorX, anchorY, options.getPlayer(), {
        entities: options.getLatestEntities(),
        getTile: options.getVisibleTileAt,
        isPlayerLikeEntityKind,
      });
    },
  };
}
