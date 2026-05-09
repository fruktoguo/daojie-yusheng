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
import type { BuildingSenseQiRoomInfo } from './main-building-fengshui-state-source';
import { t } from './ui/i18n';

const WANG_QI_FENGSHUI_OVERLAY_REQUEST_INTERVAL_MS = 3000;
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
 * checkerParity：棋盘范围奇偶格。
 */

  checkerParity?: 'even' | 'odd';
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
  setFengShuiOverlay?: (overlay: null) => void;
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
  getWangQiRoomInfoAt?: (x: number, y: number) => BuildingSenseQiRoomInfo | null;
  requestWangQiFengShuiOverlay?: (x?: number, y?: number) => void;
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;
  sendAction?: (actionId: string, target?: string) => void;
};

function buildSenseQiTooltipLines(tile: Tile, x: number, y: number, formatAuraLevelText: (auraValue: number) => string): string[] {
  const lines = [t('targeting.tooltip.coordinate', { x, y })];
  const resources = Array.isArray(tile.resources) ? tile.resources : [];
  // 中性灵气在 resources 里优先取 'aura.refined.neutral'；没有则用 tile.aura（server 投影后的等级值）兜底，
  // 保证感气视角下始终有一条「灵气等级 N」。
  const neutralAuraResource = resources.find((resource) => resource.key === 'aura.refined.neutral' || resource.label === '灵气');
  if (neutralAuraResource) {
    const hasLevel = typeof neutralAuraResource.level === 'number' && Number.isFinite(neutralAuraResource.level);
    lines.push(
      hasLevel
        ? t('targeting.tooltip.resource-level', { label: neutralAuraResource.label, level: Math.max(0, Math.round(neutralAuraResource.level as number)) })
        : formatAuraLevelText(neutralAuraResource.effectiveValue ?? neutralAuraResource.value ?? 0),
    );
  } else {
    // tile.aura 在玩家视角下是已投影的灵气等级（非原始灵气值），直接作为 level 展示，
    // 不再走 formatAuraLevelText —— 后者会再次调用 getAuraLevel 导致永远渲染成「灵气等级 0」。
    const auraLevel = Math.max(0, Math.round(tile.aura ?? 0));
    lines.push(t('targeting.tooltip.resource-level', { label: t('observe.resource.aura', undefined), level: auraLevel }));
  }
  for (const resource of resources) {
    if (resource === neutralAuraResource) {
      continue;
    }
    const displayValue = resource.effectiveValue ?? resource.value;
    lines.push(
      typeof resource.level === 'number' && Number.isFinite(resource.level)
        ? t('targeting.tooltip.resource-level', { label: resource.label, level: Math.max(0, Math.round(resource.level)) })
        : t('targeting.tooltip.resource-value', { label: resource.label, value: Math.max(0, Math.round(displayValue)) }),
    );
  }
  return lines;
}

function appendSenseQiFormationLines(lines: string[], entities: readonly MainTargetingObservedEntity[], x: number, y: number): void {
  for (const entity of entities) {
    if (entity.kind !== 'formation' || !isTileInsideFormationRange(entity, x, y)) {
      continue;
    }
    const radius = Math.max(1, Math.trunc(Number(entity.formationRadius) || 0));
    lines.push(t('targeting.tooltip.formation', {
      name: entity.name ?? t('targeting.tooltip.formation.default-name', undefined),
      x: entity.wx,
      y: entity.wy,
      radius,
    }));
  }
}

function appendWangQiRoomLines(lines: string[], info: BuildingSenseQiRoomInfo | null): void {
  if (!info) {
    lines.push(t('targeting.wangqi.room.none', undefined));
    lines.push(t('targeting.wangqi.fengshui.neutral', undefined));
    lines.push(t('targeting.wangqi.luck.zero', undefined));
    return;
  }
  lines.push(t('targeting.wangqi.room', { room: info.roomLabel }));
  const roomParts: string[] = [];
  if (typeof info.area === 'number') {
    roomParts.push(t('targeting.wangqi.area', { area: Math.max(0, Math.round(info.area)) }));
  }
  if (typeof info.enclosed === 'boolean') {
    roomParts.push(info.enclosed
      ? t('targeting.wangqi.enclosed', undefined)
      : t('targeting.wangqi.open', undefined));
  }
  if (typeof info.doorCount === 'number' || typeof info.windowCount === 'number') {
    roomParts.push(t('targeting.wangqi.doors-windows', {
      doors: Math.max(0, Math.round(info.doorCount ?? 0)),
      windows: Math.max(0, Math.round(info.windowCount ?? 0)),
    }));
  }
  if (roomParts.length > 0) {
    lines.push(roomParts.join(' · '));
  }
  const score = Math.round(info.score);
  const luck = Math.trunc(score / 10);
  lines.push(t('targeting.wangqi.fengshui', { label: info.fengShuiLabel, score }));
  lines.push(t('targeting.wangqi.luck', { luck: luck > 0 ? `+${luck}` : String(luck) }));
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
  let lastWangQiFengShuiOverlayRequestAt = 0;
  let wangQiOverlayWasActive = false;
  function showHoverTooltip(title: string, lines: string[]): void {
    if (!hoveredMapTile) {
      return;
    }
    options.senseQiTooltip.show(
      title,
      lines,
      hoveredMapTile.clientX,
      hoveredMapTile.clientY,
    );
  }
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
      options.setFengShuiOverlay?.(null);
      wangQiOverlayWasActive = false;
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
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height' | 'checkerParity'>,
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
        checkerParity: skill?.targeting?.checkerParity,
        maxTargets: skill?.targeting?.maxTargets,
      };
      pendingTargetedAction.range = this.resolveCurrentTargetingRange(pendingTargetedAction);
      this.syncTargetingOverlay();
      if (actionId === 'client:observe') {
        options.showToast(t('targeting.toast.observe', undefined));
        return;
      }
      options.showToast(t('targeting.toast.select-range', { range: pendingTargetedAction.range }));
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
        options.showToast(t('targeting.toast.cancelled', undefined));
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
        this.syncWangQiOverlay();
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
          ? t('targeting.badge.vision-range', { range: pendingTargetedAction.range })
          : t('targeting.badge.cast-range', { range: geometry.range });
        const shapeLabel = geometry.shape === 'line'
          ? t('targeting.badge.shape.line', { maxTargets: pendingTargetedAction.maxTargets ? ` ${pendingTargetedAction.maxTargets}目标` : '' })
          : geometry.shape === 'ring'
            ? t('targeting.badge.shape.ring', { inner: Math.max(0, geometry.innerRadius ?? Math.max((geometry.radius ?? 1) - 1, 0)), outer: Math.max(0, geometry.radius ?? 1), maxTargets: pendingTargetedAction.maxTargets ? t('targeting.badge.max-targets', { count: pendingTargetedAction.maxTargets }) : '' })
            : geometry.shape === 'checkerboard'
              ? t('targeting.badge.shape.checkerboard', { width: Math.max(1, geometry.width ?? 1), height: Math.max(1, geometry.height ?? geometry.width ?? 1), maxTargets: pendingTargetedAction.maxTargets ? t('targeting.badge.max-targets', { count: pendingTargetedAction.maxTargets }) : '' })
              : geometry.shape === 'box'
                ? t('targeting.badge.shape.box', { width: Math.max(1, geometry.width ?? 1), height: Math.max(1, geometry.height ?? geometry.width ?? 1), maxTargets: pendingTargetedAction.maxTargets ? t('targeting.badge.max-targets', { count: pendingTargetedAction.maxTargets }) : '' })
                : geometry.shape === 'orientedBox'
                  ? t('targeting.badge.shape.oriented-box', { width: Math.max(1, geometry.width ?? 1), height: Math.max(1, geometry.height ?? geometry.width ?? 1), maxTargets: pendingTargetedAction.maxTargets ? t('targeting.badge.max-targets', { count: pendingTargetedAction.maxTargets }) : '' })
                  : geometry.shape === 'area'
                    ? t('targeting.badge.shape.area', { radius: Math.max(0, geometry.radius ?? 1), maxTargets: pendingTargetedAction.maxTargets ? t('targeting.badge.max-targets', { count: pendingTargetedAction.maxTargets }) : '' })
                    : '';
        options.targetingBadgeEl.textContent = t('targeting.badge.selected', {
          actionName: pendingTargetedAction.actionName,
          range: rangeLabel,
          shape: shapeLabel,
        });
        options.targetingBadgeEl.classList.remove('hidden');
      }
      this.syncSenseQiOverlay();
      this.syncWangQiOverlay();
    },
    /**
 * syncSenseQiOverlay：处理SenseQiOverlay并更新相关状态。
 * @returns 无返回值，直接更新SenseQiOverlay相关状态。
 */


    syncSenseQiOverlay(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const wangQiActive = player?.wangQiActive === true;
      if (!player?.senseQiActive && !wangQiActive) {
        options.setSenseQiOverlay(null);
        options.senseQiTooltip.hide();
        return;
      }
      if (wangQiActive) {
        options.setSenseQiOverlay(null);
        if (pendingTargetedAction || !hoveredMapTile) {
          options.senseQiTooltip.hide();
          return;
        }
        const info = options.getWangQiRoomInfoAt?.(hoveredMapTile.x, hoveredMapTile.y) ?? null;
        const lines = [t('targeting.tooltip.coordinate', { x: hoveredMapTile.x, y: hoveredMapTile.y })];
        appendWangQiRoomLines(lines, info);
        showHoverTooltip(t('targeting.wangqi.title', undefined), lines);
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
      showHoverTooltip(t('targeting.senseqi.title', undefined), lines);
    },
    syncWangQiOverlay(): void {
      const player = options.getPlayer();
      if (!player?.wangQiActive) {
        if (wangQiOverlayWasActive) {
          options.setFengShuiOverlay?.(null);
          wangQiOverlayWasActive = false;
        }
        return;
      }
      wangQiOverlayWasActive = true;
      const now = Date.now();
      if (
        options.requestWangQiFengShuiOverlay
        && now - lastWangQiFengShuiOverlayRequestAt >= WANG_QI_FENGSHUI_OVERLAY_REQUEST_INTERVAL_MS
      ) {
        const requestX = hoveredMapTile?.x;
        const requestY = hoveredMapTile?.y;
        lastWangQiFengShuiOverlayRequestAt = now;
        window.setTimeout(() => {
          options.requestWangQiFengShuiOverlay?.(requestX, requestY);
        }, 0);
      }
    },
    /**
 * computeAffectedCellsForAction：执行AffectedCellForAction相关逻辑。
 * @param action Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchor GridPoint 参数说明。
 * @returns 返回AffectedCellForAction列表。
 */


    computeAffectedCellsForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height' | 'checkerParity'>,
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
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height' | 'checkerParity' | 'targetMode'>,
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
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height' | 'checkerParity'>,
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
