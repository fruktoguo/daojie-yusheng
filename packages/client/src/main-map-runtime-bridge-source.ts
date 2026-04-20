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
/**
 * PendingTargetedAction：统一结构类型，保证协议与运行时一致性。
 */


type PendingTargetedAction = {
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
 * MainMapRuntimeBridgeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMapRuntimeBridgeSourceOptions = {
/**
 * mapRuntime：对象字段。
 */

  mapRuntime: {  
  /**
 * getVisibleTileAt：对象字段。
 */

    getVisibleTileAt: (x: number, y: number) => Tile | null;    
    /**
 * getKnownTileAt：对象字段。
 */

    getKnownTileAt: (x: number, y: number) => Tile | null;    
    /**
 * getGroundPileAt：对象字段。
 */

    getGroundPileAt: (x: number, y: number) => GroundItemPileView | null;    
    /**
 * getMapMeta：对象字段。
 */

    getMapMeta: () => {    
    /**
 * width：对象字段。
 */
 width: number;    
 /**
 * height：对象字段。
 */
 height: number } | null;    
 /**
 * setViewportSize：对象字段。
 */

    setViewportSize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, viewportScale: number) => void;
  };  
  /**
 * canvasHost：对象字段。
 */

  canvasHost: HTMLElement;  
  /**
 * getPlayer：对象字段。
 */

  getPlayer: () => {  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number;  
 /**
 * viewRange：对象字段。
 */
 viewRange?: number } | null;  
 /**
 * getDisplayRangeX：对象字段。
 */

  getDisplayRangeX: () => number;  
  /**
 * getDisplayRangeY：对象字段。
 */

  getDisplayRangeY: () => number;  
  /**
 * navigation：对象字段。
 */

  navigation: {  
  /**
 * clearCurrentPath：对象字段。
 */

    clearCurrentPath: () => void;    
    /**
 * trimCurrentPathProgress：对象字段。
 */

    trimCurrentPathProgress: () => void;    
    /**
 * sendMoveCommand：对象字段。
 */

    sendMoveCommand: (dir: Direction) => void;    
    /**
 * planPathTo：对象字段。
 */

    planPathTo: (
      target: {      
      /**
 * x：对象字段。
 */
 x: number;      
 /**
 * y：对象字段。
 */
 y: number },
      options?: {      
      /**
 * ignoreVisibilityLimit：对象字段。
 */
 ignoreVisibilityLimit?: boolean;      
 /**
 * allowNearestReachable：对象字段。
 */
 allowNearestReachable?: boolean;      
 /**
 * preserveAutoInteraction：对象字段。
 */
 preserveAutoInteraction?: boolean },
    ) => void;    
    /**
 * findObservedEntityAt：对象字段。
 */

    findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;    
    /**
 * handleNpcClickTarget：对象字段。
 */

    handleNpcClickTarget: (npc: MainNavigationObservedEntity) => boolean;    
    /**
 * handlePortalClickTarget：对象字段。
 */

    handlePortalClickTarget: (target: {    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number }, tile: Tile) => boolean;
  };  
  /**
 * targeting：对象字段。
 */

  targeting: {  
  /**
 * syncTargetingOverlay：对象字段。
 */

    syncTargetingOverlay: () => void;    
    /**
 * cancelTargeting：对象字段。
 */

    cancelTargeting: (showMessage?: boolean) => void;    
    /**
 * getCurrentActionDef：对象字段。
 */

    getCurrentActionDef: (actionId: string) => ActionDef | null;    
    /**
 * resolveCurrentTargetingRange：对象字段。
 */

    resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;    
    /**
 * beginTargeting：对象字段。
 */

    beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;    
    /**
 * computeAffectedCellsForAction：对象字段。
 */

    computeAffectedCellsForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ) => GridPoint[];    
    /**
 * resolveTargetRefForAction：对象字段。
 */

    resolveTargetRefForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
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
    ) => string | null;    
    /**
 * hasAffectableTargetInArea：对象字段。
 */

    hasAffectableTargetInArea: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ) => boolean;    
    /**
 * syncSenseQiOverlay：对象字段。
 */

    syncSenseQiOverlay: () => void;    
    /**
 * setHoveredMapTile：对象字段。
 */

    setHoveredMapTile: (value: {    
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
 clientY: number } | null) => void;    
 /**
 * getPendingTargetedAction：对象字段。
 */

    getPendingTargetedAction: () => PendingTargetedAction;    
    /**
 * setPendingTargetedActionHover：对象字段。
 */

    setPendingTargetedActionHover: (target: {    
    /**
 * x：对象字段。
 */
 x?: number;    
 /**
 * y：对象字段。
 */
 y?: number } | null) => void;
  };  
  /**
 * observe：对象字段。
 */

  observe: {  
  /**
 * hide：对象字段。
 */

    hide: () => void;    
    /**
 * show：对象字段。
 */

    show: (x: number, y: number) => void;    
    /**
 * isOpen：对象字段。
 */

    isOpen: () => boolean;
  };
};
/**
 * MainMapRuntimeBridgeSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainMapRuntimeBridgeSource = ReturnType<typeof createMainMapRuntimeBridgeSource>;
/**
 * createMainMapRuntimeBridgeSource：构建并返回目标对象。
 * @param options MainMapRuntimeBridgeSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainMapRuntimeBridgeSource(options: MainMapRuntimeBridgeSourceOptions) {
  return {  
  /**
 * resizeCanvas：执行核心业务逻辑。
 * @returns void。
 */

    resizeCanvas(): void {
      const cssWidth = Math.max(1, options.canvasHost.clientWidth);
      const cssHeight = Math.max(1, options.canvasHost.clientHeight);
      const rect = options.canvasHost.getBoundingClientRect();
      const viewportScale = cssWidth > 0 && rect.width > 0
        ? rect.width / cssWidth
        : 1;
      options.mapRuntime.setViewportSize(cssWidth, cssHeight, window.devicePixelRatio || 1, viewportScale);
    },    
    /**
 * clearCurrentPath：执行核心业务逻辑。
 * @returns void。
 */


    clearCurrentPath(): void {
      options.navigation.clearCurrentPath();
    },    
    /**
 * trimCurrentPathProgress：执行核心业务逻辑。
 * @returns void。
 */


    trimCurrentPathProgress(): void {
      options.navigation.trimCurrentPathProgress();
    },    
    /**
 * sendMoveCommand：执行核心业务逻辑。
 * @param dir Direction 参数说明。
 * @returns void。
 */


    sendMoveCommand(dir: Direction): void {
      options.navigation.sendMoveCommand(dir);
    },    
    /**
 * planPathTo：执行核心业务逻辑。
 * @param target { x: number; y: number } 目标对象。
 * @param optionsArg { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean } 参数说明。
 * @returns void。
 */


    planPathTo(
      target: {      
      /**
 * x：对象字段。
 */
 x: number;      
 /**
 * y：对象字段。
 */
 y: number },
      optionsArg?: {      
      /**
 * ignoreVisibilityLimit：对象字段。
 */
 ignoreVisibilityLimit?: boolean;      
 /**
 * allowNearestReachable：对象字段。
 */
 allowNearestReachable?: boolean;      
 /**
 * preserveAutoInteraction：对象字段。
 */
 preserveAutoInteraction?: boolean },
    ): void {
      options.navigation.planPathTo(target, optionsArg);
    },    
    /**
 * findObservedEntityAt：执行核心业务逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param kind string 参数说明。
 * @returns MainNavigationObservedEntity | null。
 */


    findObservedEntityAt(x: number, y: number, kind?: string): MainNavigationObservedEntity | null {
      return options.navigation.findObservedEntityAt(x, y, kind);
    },    
    /**
 * handleNpcClickTarget：处理事件并驱动执行路径。
 * @param npc MainNavigationObservedEntity 参数说明。
 * @returns boolean。
 */


    handleNpcClickTarget(npc: MainNavigationObservedEntity): boolean {
      return options.navigation.handleNpcClickTarget(npc);
    },    
    /**
 * handlePortalClickTarget：处理事件并驱动执行路径。
 * @param target { x: number; y: number } 目标对象。
 * @param tile Tile 参数说明。
 * @returns boolean。
 */


    handlePortalClickTarget(target: {    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number }, tile: Tile): boolean {
      return options.navigation.handlePortalClickTarget(target, tile);
    },    
    /**
 * syncTargetingOverlay：执行核心业务逻辑。
 * @returns void。
 */


    syncTargetingOverlay(): void {
      options.targeting.syncTargetingOverlay();
    },    
    /**
 * cancelTargeting：执行状态校验并返回判断结果。
 * @param showMessage 参数说明。
 * @returns void。
 */


    cancelTargeting(showMessage = false): void {
      options.targeting.cancelTargeting(showMessage);
    },    
    /**
 * getCurrentActionDef：按给定条件读取/查询数据。
 * @param actionId string action ID。
 * @returns ActionDef | null。
 */


    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.targeting.getCurrentActionDef(actionId);
    },    
    /**
 * resolveCurrentTargetingRange：执行核心业务逻辑。
 * @param action NonNullable<PendingTargetedAction> 参数说明。
 * @returns number。
 */


    resolveCurrentTargetingRange(action: NonNullable<PendingTargetedAction>): number {
      return options.targeting.resolveCurrentTargetingRange(action);
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
      options.targeting.beginTargeting(actionId, actionName, targetMode, range);
    },    
    /**
 * computeAffectedCellsForAction：执行核心业务逻辑。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchor GridPoint 参数说明。
 * @returns GridPoint[]。
 */


    computeAffectedCellsForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return options.targeting.computeAffectedCellsForAction(action, anchor);
    },    
    /**
 * resolveTargetRefForAction：执行核心业务逻辑。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'> 参数说明。
 * @param target { x: number; y: number; entityId?: string; entityKind?: string } 目标对象。
 * @returns string | null。
 */


    resolveTargetRefForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
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
      return options.targeting.resolveTargetRefForAction(action, target);
    },    
    /**
 * hasAffectableTargetInArea：执行状态校验并返回判断结果。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchorX number 参数说明。
 * @param anchorY number 参数说明。
 * @returns boolean。
 */


    hasAffectableTargetInArea(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ): boolean {
      return options.targeting.hasAffectableTargetInArea(action, anchorX, anchorY);
    },    
    /**
 * getVisibleTileAt：按给定条件读取/查询数据。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns Tile | null。
 */


    getVisibleTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getVisibleTileAt(x, y);
    },    
    /**
 * getKnownTileAt：按给定条件读取/查询数据。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns Tile | null。
 */


    getKnownTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getKnownTileAt(x, y);
    },    
    /**
 * isPointInsideCurrentMap：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns boolean。
 */


    isPointInsideCurrentMap(x: number, y: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const mapMeta = options.mapRuntime.getMapMeta();
      if (!mapMeta) return true;
      return x >= 0 && y >= 0 && x < mapMeta.width && y < mapMeta.height;
    },    
    /**
 * getVisibleGroundPileAt：按给定条件读取/查询数据。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns GroundItemPileView | null。
 */


    getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
      return options.mapRuntime.getGroundPileAt(x, y);
    },    
    /**
 * syncSenseQiOverlay：执行核心业务逻辑。
 * @returns void。
 */


    syncSenseQiOverlay(): void {
      options.targeting.syncSenseQiOverlay();
    },    
    /**
 * isWithinDisplayedMemoryBounds：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns boolean。
 */


    isWithinDisplayedMemoryBounds(x: number, y: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player) {
        return false;
      }
      return Math.abs(x - player.x) <= options.getDisplayRangeX() && Math.abs(y - player.y) <= options.getDisplayRangeY();
    },    
    /**
 * hideObserveModal：执行核心业务逻辑。
 * @returns void。
 */


    hideObserveModal(): void {
      options.observe.hide();
    },    
    /**
 * showObserveModal：执行核心业务逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns void。
 */


    showObserveModal(targetX: number, targetY: number): void {
      options.observe.show(targetX, targetY);
    },    
    /**
 * isObserveOpen：执行状态校验并返回判断结果。
 * @returns boolean。
 */


    isObserveOpen(): boolean {
      return options.observe.isOpen();
    },    
    /**
 * getPendingTargetedAction：按给定条件读取/查询数据。
 * @returns PendingTargetedAction。
 */


    getPendingTargetedAction(): PendingTargetedAction {
      return options.targeting.getPendingTargetedAction();
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
      options.targeting.setPendingTargetedActionHover(target);
    },    
    /**
 * setHoveredMapTile：更新/写入相关状态。
 * @param value { x: number; y: number; clientX: number; clientY: number } | null 参数说明。
 * @returns void。
 */


    setHoveredMapTile(value: {    
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
 clientY: number } | null): void {
      options.targeting.setHoveredMapTile(value);
    },    
    /**
 * bindKeyboardInput：执行核心业务逻辑。
 * @returns void。
 */


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
