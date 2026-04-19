import type {
  ActionDef,
  Direction,
  GridPoint,
  GroundItemPileView,
  TargetingShape,
  Tile,
} from '@mud/shared-next';
import { KeyboardInput } from './input/keyboard';
import type { MainNavigationObservedEntity } from './main-navigation-state-source';

type PendingTargetedAction = {
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

type MainMapRuntimeBridgeSourceOptions = {
  mapRuntime: {
    getVisibleTileAt: (x: number, y: number) => Tile | null;
    getKnownTileAt: (x: number, y: number) => Tile | null;
    getGroundPileAt: (x: number, y: number) => GroundItemPileView | null;
    getMapMeta: () => { width: number; height: number } | null;
    setViewportSize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, viewportScale: number) => void;
  };
  canvasHost: HTMLElement;
  getPlayer: () => { x: number; y: number; viewRange?: number } | null;
  getDisplayRangeX: () => number;
  getDisplayRangeY: () => number;
  navigation: {
    clearCurrentPath: () => void;
    trimCurrentPathProgress: () => void;
    sendMoveCommand: (dir: Direction) => void;
    planPathTo: (
      target: { x: number; y: number },
      options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean },
    ) => void;
    findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;
    handleNpcClickTarget: (npc: MainNavigationObservedEntity) => boolean;
    handlePortalClickTarget: (target: { x: number; y: number }, tile: Tile) => boolean;
  };
  targeting: {
    syncTargetingOverlay: () => void;
    cancelTargeting: (showMessage?: boolean) => void;
    getCurrentActionDef: (actionId: string) => ActionDef | null;
    resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;
    beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;
    computeAffectedCellsForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ) => GridPoint[];
    resolveTargetRefForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
      target: { x: number; y: number; entityId?: string; entityKind?: string },
    ) => string | null;
    hasAffectableTargetInArea: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ) => boolean;
    syncSenseQiOverlay: () => void;
    setHoveredMapTile: (value: { x: number; y: number; clientX: number; clientY: number } | null) => void;
    getPendingTargetedAction: () => PendingTargetedAction;
    setPendingTargetedActionHover: (target: { x?: number; y?: number } | null) => void;
  };
  observe: {
    hide: () => void;
    show: (x: number, y: number) => void;
    isOpen: () => boolean;
  };
};

export type MainMapRuntimeBridgeSource = ReturnType<typeof createMainMapRuntimeBridgeSource>;

export function createMainMapRuntimeBridgeSource(options: MainMapRuntimeBridgeSourceOptions) {
  return {
    resizeCanvas(): void {
      const cssWidth = Math.max(1, options.canvasHost.clientWidth);
      const cssHeight = Math.max(1, options.canvasHost.clientHeight);
      const rect = options.canvasHost.getBoundingClientRect();
      const viewportScale = cssWidth > 0 && rect.width > 0
        ? rect.width / cssWidth
        : 1;
      options.mapRuntime.setViewportSize(cssWidth, cssHeight, window.devicePixelRatio || 1, viewportScale);
    },

    clearCurrentPath(): void {
      options.navigation.clearCurrentPath();
    },

    trimCurrentPathProgress(): void {
      options.navigation.trimCurrentPathProgress();
    },

    sendMoveCommand(dir: Direction): void {
      options.navigation.sendMoveCommand(dir);
    },

    planPathTo(
      target: { x: number; y: number },
      optionsArg?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean },
    ): void {
      options.navigation.planPathTo(target, optionsArg);
    },

    findObservedEntityAt(x: number, y: number, kind?: string): MainNavigationObservedEntity | null {
      return options.navigation.findObservedEntityAt(x, y, kind);
    },

    handleNpcClickTarget(npc: MainNavigationObservedEntity): boolean {
      return options.navigation.handleNpcClickTarget(npc);
    },

    handlePortalClickTarget(target: { x: number; y: number }, tile: Tile): boolean {
      return options.navigation.handlePortalClickTarget(target, tile);
    },

    syncTargetingOverlay(): void {
      options.targeting.syncTargetingOverlay();
    },

    cancelTargeting(showMessage = false): void {
      options.targeting.cancelTargeting(showMessage);
    },

    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.targeting.getCurrentActionDef(actionId);
    },

    resolveCurrentTargetingRange(action: NonNullable<PendingTargetedAction>): number {
      return options.targeting.resolveCurrentTargetingRange(action);
    },

    beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1): void {
      options.targeting.beginTargeting(actionId, actionName, targetMode, range);
    },

    computeAffectedCellsForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return options.targeting.computeAffectedCellsForAction(action, anchor);
    },

    resolveTargetRefForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
      target: { x: number; y: number; entityId?: string; entityKind?: string },
    ): string | null {
      return options.targeting.resolveTargetRefForAction(action, target);
    },

    hasAffectableTargetInArea(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ): boolean {
      return options.targeting.hasAffectableTargetInArea(action, anchorX, anchorY);
    },

    getVisibleTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getVisibleTileAt(x, y);
    },

    getKnownTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getKnownTileAt(x, y);
    },

    isPointInsideCurrentMap(x: number, y: number): boolean {
      const mapMeta = options.mapRuntime.getMapMeta();
      if (!mapMeta) return true;
      return x >= 0 && y >= 0 && x < mapMeta.width && y < mapMeta.height;
    },

    getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
      return options.mapRuntime.getGroundPileAt(x, y);
    },

    syncSenseQiOverlay(): void {
      options.targeting.syncSenseQiOverlay();
    },

    isWithinDisplayedMemoryBounds(x: number, y: number): boolean {
      const player = options.getPlayer();
      if (!player) {
        return false;
      }
      return Math.abs(x - player.x) <= options.getDisplayRangeX() && Math.abs(y - player.y) <= options.getDisplayRangeY();
    },

    hideObserveModal(): void {
      options.observe.hide();
    },

    showObserveModal(targetX: number, targetY: number): void {
      options.observe.show(targetX, targetY);
    },

    isObserveOpen(): boolean {
      return options.observe.isOpen();
    },

    getPendingTargetedAction(): PendingTargetedAction {
      return options.targeting.getPendingTargetedAction();
    },

    setPendingTargetedActionHover(target: { x?: number; y?: number } | null): void {
      options.targeting.setPendingTargetedActionHover(target);
    },

    setHoveredMapTile(value: { x: number; y: number; clientX: number; clientY: number } | null): void {
      options.targeting.setHoveredMapTile(value);
    },

    bindKeyboardInput(): void {
      new KeyboardInput((dirs: Direction[]) => {
        options.navigation.clearCurrentPath();
        if (dirs.length > 0) {
          options.navigation.sendMoveCommand(dirs[0]);
        }
      });
    },
  };
}
