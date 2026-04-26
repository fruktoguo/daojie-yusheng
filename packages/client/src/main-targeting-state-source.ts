import {
  type ActionDef,
  type GridPoint,
  type PlayerState,
  type TargetingShape,
  type Tile,
} from '@mud/shared';
import { isPlayerLikeEntityKind, type MainRuntimeObservedEntity } from './main-runtime-view-types';
import {
  computeAffectedCellsForAction as computeAffectedCellsForActionHelper,
  getEffectiveTargetingGeometry,
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
 * actionId：actionID标识。
 */

  actionId: string;
  /**
 * actionName：action名称名称或显示文本。
 */

  actionName: string;
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: string;
  /**
 * range：范围相关字段。
 */

  range: number;
  /**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
  /**
 * innerRadius：环带内半径。
 */

  innerRadius?: number;
  /**
 * width：width相关字段。
 */

  width?: number;
  /**
 * height：height相关字段。
 */

  height?: number;
  /**
 * maxTargets：max目标相关字段。
 */

  maxTargets?: number;
  /**
 * hoverX：hoverX相关字段。
 */

  hoverX?: number;
  /**
 * hoverY：hoverY相关字段。
 */

  hoverY?: number;
} | null;
/**
 * MainTargetingHoveredTile：统一结构类型，保证协议与运行时一致性。
 */


export type MainTargetingHoveredTile = {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * clientX：clientX相关字段。
 */

  clientX: number;
  /**
 * clientY：clientY相关字段。
 */

  clientY: number;
} | null;
/**
 * MainTargetingObservedEntity：统一结构类型，保证协议与运行时一致性。
 */


type MainTargetingObservedEntity = Pick<
  MainRuntimeObservedEntity,
  'id' | 'wx' | 'wy' | 'kind' | 'name' | 'formationRadius' | 'formationRangeShape' | 'formationBlocksBoundary' | 'formationOwnerSectId' | 'formationOwnerPlayerId'
>;
/**
 * MainTargetingStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainTargetingStateSourceOptions = {
/**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;
  /**
 * getInfoRadius：InfoRadiu相关字段。
 */

  getInfoRadius: () => number;
  /**
 * getLatestEntities：LatestEntity相关字段。
 */

  getLatestEntities: () => MainTargetingObservedEntity[];
  /**
 * getVisibleTileAt：可见TileAt相关字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;
  /**
 * setTargetingOverlay：TargetingOverlay相关字段。
 */

  setTargetingOverlay: (overlay: {
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

    visibleOnly: boolean;
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

    affectedCells: Array<{
    /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number }>;
 /**
 * hoverX：hoverX相关字段。
 */

    hoverX?: number;
    /**
 * hoverY：hoverY相关字段。
 */

    hoverY?: number;
  } | null) => void;
  /**
 * setSenseQiOverlay：SenseQiOverlay相关字段。
 */

  setSenseQiOverlay: (overlay: {
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
 levelBaseValue: number } | null) => void;
 /**
 * targetingBadgeEl：targetingBadgeEl相关字段。
 */

  targetingBadgeEl: HTMLElement | null;
  /**
 * senseQiTooltip：senseQi提示相关字段。
 */

  senseQiTooltip: Pick<
    import('./ui/floating-tooltip').FloatingTooltip,
    'show' | 'hide'
  >;
  /**
 * getAuraLevelBaseValue：Aura等级Base值数值。
 */

  getAuraLevelBaseValue: () => number;
  /**
 * formatAuraLevelText：Aura等级Text名称或显示文本。
 */

  formatAuraLevelText: (auraValue: number) => string;
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;
  sendAction?: (actionId: string, target?: string) => void;
};

function buildSenseQiTooltipLines(tile: Tile, x: number, y: number, formatAuraLevelText: (auraValue: number) => string): string[] {
  const lines = [`坐标 (${x}, ${y})`];
  if (Array.isArray(tile.resources) && tile.resources.length > 0) {
    for (const resource of tile.resources) {
      const displayValue = resource.effectiveValue ?? resource.value;
      lines.push(
        resource.label === '灵气'
          ? formatAuraLevelText(displayValue)
          : `${resource.label} ${Math.max(0, Math.round(displayValue))}`,
      );
    }
    return lines;
  }
  lines.push(formatAuraLevelText(tile.aura ?? 0));
  return lines;
}

function appendSenseQiFormationLines(lines: string[], entities: readonly MainTargetingObservedEntity[], x: number, y: number): void {
  for (const entity of entities) {
    if (entity.kind !== 'formation' || !isTileInsideFormationRange(entity, x, y)) {
      continue;
    }
    const radius = Math.max(1, Math.trunc(Number(entity.formationRadius) || 0));
    lines.push(`${entity.name ?? '阵法'} · 中心 (${entity.wx}, ${entity.wy}) · 半径 ${radius}`);
  }
}

function isTileInsideFormationRange(entity: MainTargetingObservedEntity, x: number, y: number): boolean {
  const radius = Math.max(1, Math.trunc(Number(entity.formationRadius) || 0));
  const dx = x - entity.wx;
  const dy = y - entity.wy;
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
    return false;
  }
  if (entity.formationRangeShape === 'circle') {
    return (dx * dx) + (dy * dy) <= radius * radius;
  }
  if (entity.formationRangeShape === 'checkerboard') {
    return ((x + y) % 2) === 0;
  }
  return true;
}
/**
 * doesTargetingRequireVision：读取doeTargetingRequireVision并返回结果。
 * @param actionId string action ID。
 * @returns 返回是否满足doeTargetingRequireVision条件。
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
 * @returns 无返回值，直接更新MainTargeting状态来源相关状态。
 */


export function createMainTargetingStateSource(options: MainTargetingStateSourceOptions) {
  let pendingTargetedAction: MainTargetingPendingAction = null;
  let hoveredMapTile: MainTargetingHoveredTile = null;
  /**
 * computeAffectedCells：执行AffectedCell相关逻辑。
 * @param action NonNullable<MainTargetingPendingAction> 参数说明。
 * @returns 返回AffectedCell。
 */


  function computeAffectedCells(action: NonNullable<MainTargetingPendingAction>): Array<{
  /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
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
 * getPendingTargetedAction：读取待处理TargetedAction。
 * @returns 返回PendingTargetedAction。
 */

    getPendingTargetedAction(): MainTargetingPendingAction {
      return pendingTargetedAction;
    },
    /**
 * hasPendingTargetedAction：读取待处理TargetedAction并返回结果。
 * @returns 返回是否满足PendingTargetedAction条件。
 */


    hasPendingTargetedAction(): boolean {
      return Boolean(pendingTargetedAction);
    },
    /**
 * getHoveredMapTile：读取Hovered地图Tile。
 * @returns 返回Hovered地图Tile。
 */


    getHoveredMapTile(): MainTargetingHoveredTile {
      return hoveredMapTile;
    },
    /**
 * setHoveredMapTile：写入Hovered地图Tile。
 * @param value MainTargetingHoveredTile 参数说明。
 * @returns 无返回值，直接更新Hovered地图Tile相关状态。
 */


    setHoveredMapTile(value: MainTargetingHoveredTile): void {
      hoveredMapTile = value;
    },
    /**
 * setPendingTargetedActionHover：写入待处理TargetedActionHover。
 * @param target { x?: number; y?: number } | null 目标对象。
 * @returns 无返回值，直接更新PendingTargetedActionHover相关状态。
 */


    setPendingTargetedActionHover(target: {
    /**
 * x：x相关字段。
 */
 x?: number;
 /**
 * y：y相关字段。
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
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      pendingTargetedAction = null;
      hoveredMapTile = null;
    },
    /**
 * getCurrentActionDef：读取当前ActionDef。
 * @param actionId string action ID。
 * @returns 返回CurrentActionDef。
 */


    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.getPlayer()?.actions.find((entry) => entry.id === actionId) ?? null;
    },
    /**
 * resolveCurrentTargetingRange：读取当前Targeting范围并返回结果。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range'> 参数说明。
 * @returns 返回CurrentTargeting范围。
 */


    resolveCurrentTargetingRange(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
    ): number {
      return resolveCurrentTargetingRangeHelper(action, options.getPlayer(), options.getInfoRadius());
    },
    /**
 * beginTargeting：读取开始Targeting并返回结果。
 * @param actionId string action ID。
 * @param actionName string 参数说明。
 * @param targetMode string 参数说明。
 * @param range 参数说明。
 * @returns 无返回值，直接更新beginTargeting相关状态。
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
        innerRadius: skill?.targeting?.innerRadius,
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
 * cancelTargeting：读取cancelTargeting并返回结果。
 * @param showMessage 参数说明。
 * @returns 无返回值，完成cancelTargeting的条件判断。
 */


    cancelTargeting(showMessage = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!pendingTargetedAction) {
        return;
      }
      const canceledActionId = pendingTargetedAction.actionId;
      pendingTargetedAction = null;
      this.syncTargetingOverlay();
      if (showMessage && canceledActionId === 'battle:force_attack') {
        options.sendAction?.('battle:force_attack');
      }
      if (showMessage) {
        options.showToast('已取消目标选择');
      }
    },
    /**
 * syncTargetingOverlay：读取TargetingOverlay并返回结果。
 * @returns 无返回值，直接更新TargetingOverlay相关状态。
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
      const geometry = getEffectiveTargetingGeometry(pendingTargetedAction, player);
      const affectedCells = computeAffectedCells(pendingTargetedAction);
      options.setTargetingOverlay({
        originX: player.x,
        originY: player.y,
        range: geometry.range,
        visibleOnly: doesTargetingRequireVision(pendingTargetedAction.actionId),
        shape: geometry.shape,
        radius: geometry.radius,
        affectedCells,
        hoverX: pendingTargetedAction.hoverX,
        hoverY: pendingTargetedAction.hoverY,
      });
      if (options.targetingBadgeEl) {
        const rangeLabel = pendingTargetedAction.actionId === 'client:observe'
          ? `视野 ${pendingTargetedAction.range}`
          : `射程 ${geometry.range}`;
        const shapeLabel = geometry.shape === 'line'
          ? ` · 直线${pendingTargetedAction.maxTargets ? ` ${pendingTargetedAction.maxTargets}目标` : ''}`
          : geometry.shape === 'ring'
            ? ` · 环带 ${Math.max(0, geometry.innerRadius ?? Math.max((geometry.radius ?? 1) - 1, 0))}-${Math.max(0, geometry.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
            : geometry.shape === 'checkerboard'
              ? ` · 棋盘 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
              : geometry.shape === 'box'
                ? ` · 矩形 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
                : geometry.shape === 'orientedBox'
                  ? ` · 定向矩形 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
                  : geometry.shape === 'area'
                    ? ` · 范围半径 ${Math.max(0, geometry.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
                    : '';
        options.targetingBadgeEl.textContent = `选定 ${pendingTargetedAction.actionName} 目标 · ${rangeLabel}${shapeLabel}`;
        options.targetingBadgeEl.classList.remove('hidden');
      }
      this.syncSenseQiOverlay();
    },
    /**
 * syncSenseQiOverlay：处理SenseQiOverlay并更新相关状态。
 * @returns 无返回值，直接更新SenseQiOverlay相关状态。
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

      const lines = buildSenseQiTooltipLines(tile, hoveredMapTile.x, hoveredMapTile.y, options.formatAuraLevelText);
      appendSenseQiFormationLines(lines, options.getLatestEntities(), hoveredMapTile.x, hoveredMapTile.y);
      options.senseQiTooltip.show(
        '感气视角',
        lines,
        hoveredMapTile.clientX,
        hoveredMapTile.clientY,
      );
    },
    /**
 * computeAffectedCellsForAction：执行AffectedCellForAction相关逻辑。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchor GridPoint 参数说明。
 * @returns 返回AffectedCellForAction列表。
 */


    computeAffectedCellsForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return computeAffectedCellsForActionHelper(action, anchor, options.getPlayer());
    },
    /**
 * resolveTargetRefForAction：读取目标RefForAction并返回结果。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'> 参数说明。
 * @param target { x: number; y: number; entityId?: string; entityKind?: string } 目标对象。
 * @returns 返回目标RefForAction。
 */


    resolveTargetRefForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
      target: {
      /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number;
 /**
 * entityId：entityID标识。
 */
 entityId?: string;
 /**
 * entityKind：entityKind相关字段。
 */
 entityKind?: string },
    ): string | null {
      return resolveTargetRefForActionHelper(action, target, options.getPlayer());
    },
    /**
 * hasAffectableTargetInArea：读取Affectable目标InArea并返回结果。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchorX number 参数说明。
 * @param anchorY number 参数说明。
 * @returns 返回是否满足Affectable目标InArea条件。
 */


    hasAffectableTargetInArea(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height'>,
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
