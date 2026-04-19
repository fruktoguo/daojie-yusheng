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

export type MainTargetingPendingAction = {
  actionId: string;
  actionName: string;
  targetMode?: string;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  width?: number;
  height?: number;
  maxTargets?: number;
  hoverX?: number;
  hoverY?: number;
} | null;

export type MainTargetingHoveredTile = {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
} | null;

type MainTargetingObservedEntity = Pick<MainRuntimeObservedEntity, 'id' | 'wx' | 'wy' | 'kind'>;

type MainTargetingStateSourceOptions = {
  getPlayer: () => PlayerState | null;
  getInfoRadius: () => number;
  getLatestEntities: () => MainTargetingObservedEntity[];
  getVisibleTileAt: (x: number, y: number) => Tile | null;
  setTargetingOverlay: (overlay: {
    originX: number;
    originY: number;
    range: number;
    visibleOnly: boolean;
    shape?: TargetingShape;
    radius?: number;
    affectedCells: Array<{ x: number; y: number }>;
    hoverX?: number;
    hoverY?: number;
  } | null) => void;
  setSenseQiOverlay: (overlay: { hoverX?: number; hoverY?: number; levelBaseValue: number } | null) => void;
  targetingBadgeEl: HTMLElement | null;
  senseQiTooltip: Pick<
    import('./ui/floating-tooltip').FloatingTooltip,
    'show' | 'hide'
  >;
  getAuraLevelBaseValue: () => number;
  formatAuraLevelText: (auraValue: number) => string;
  showToast: (message: string) => void;
};

function doesTargetingRequireVision(actionId: string): boolean {
  return actionId === 'client:observe' || actionId === 'battle:force_attack';
}

export type MainTargetingStateSource = ReturnType<typeof createMainTargetingStateSource>;

export function createMainTargetingStateSource(options: MainTargetingStateSourceOptions) {
  let pendingTargetedAction: MainTargetingPendingAction = null;
  let hoveredMapTile: MainTargetingHoveredTile = null;

  function computeAffectedCells(action: NonNullable<MainTargetingPendingAction>): Array<{ x: number; y: number }> {
    if (action.hoverX === undefined || action.hoverY === undefined) {
      return [];
    }
    return computeAffectedCellsForActionHelper(action, { x: action.hoverX, y: action.hoverY }, options.getPlayer());
  }

  return {
    getPendingTargetedAction(): MainTargetingPendingAction {
      return pendingTargetedAction;
    },

    hasPendingTargetedAction(): boolean {
      return Boolean(pendingTargetedAction);
    },

    getHoveredMapTile(): MainTargetingHoveredTile {
      return hoveredMapTile;
    },

    setHoveredMapTile(value: MainTargetingHoveredTile): void {
      hoveredMapTile = value;
    },

    setPendingTargetedActionHover(target: { x?: number; y?: number } | null): void {
      if (!pendingTargetedAction) {
        return;
      }
      pendingTargetedAction.hoverX = target?.x;
      pendingTargetedAction.hoverY = target?.y;
    },

    clear(): void {
      pendingTargetedAction = null;
      hoveredMapTile = null;
    },

    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.getPlayer()?.actions.find((entry) => entry.id === actionId) ?? null;
    },

    resolveCurrentTargetingRange(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range'>,
    ): number {
      return resolveCurrentTargetingRangeHelper(action, options.getInfoRadius());
    },

    beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1): void {
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

    cancelTargeting(showMessage = false): void {
      if (!pendingTargetedAction) {
        return;
      }
      pendingTargetedAction = null;
      this.syncTargetingOverlay();
      if (showMessage) {
        options.showToast('已取消目标选择');
      }
    },

    syncTargetingOverlay(): void {
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

    syncSenseQiOverlay(): void {
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

    computeAffectedCellsForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return computeAffectedCellsForActionHelper(action, anchor, options.getPlayer());
    },

    resolveTargetRefForAction(
      action: Pick<NonNullable<MainTargetingPendingAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
      target: { x: number; y: number; entityId?: string; entityKind?: string },
    ): string | null {
      return resolveTargetRefForActionHelper(action, target, options.getPlayer());
    },

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
