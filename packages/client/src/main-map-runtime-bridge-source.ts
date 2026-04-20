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
 * MainMapRuntimeBridgeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMapRuntimeBridgeSourceOptions = {
/**
 * mapRuntime：地图运行态引用。
 */

  mapRuntime: {  
  /**
 * getVisibleTileAt：可见TileAt相关字段。
 */

    getVisibleTileAt: (x: number, y: number) => Tile | null;    
    /**
 * getKnownTileAt：KnownTileAt相关字段。
 */

    getKnownTileAt: (x: number, y: number) => Tile | null;    
    /**
 * getGroundPileAt：GroundPileAt相关字段。
 */

    getGroundPileAt: (x: number, y: number) => GroundItemPileView | null;    
    /**
 * getMapMeta：地图Meta相关字段。
 */

    getMapMeta: () => {    
    /**
 * width：width相关字段。
 */
 width: number;    
 /**
 * height：height相关字段。
 */
 height: number } | null;    
 /**
 * setViewportSize：数量或计量字段。
 */

    setViewportSize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, viewportScale: number) => void;
  };  
  /**
 * canvasHost：canvaHost相关字段。
 */

  canvasHost: HTMLElement;  
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number;  
 /**
 * viewRange：视图范围相关字段。
 */
 viewRange?: number } | null;  
 /**
 * getDisplayRangeX：显示范围X相关字段。
 */

  getDisplayRangeX: () => number;  
  /**
 * getDisplayRangeY：显示范围Y相关字段。
 */

  getDisplayRangeY: () => number;  
  /**
 * navigation：导航相关字段。
 */

  navigation: {  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

    clearCurrentPath: () => void;    
    /**
 * trimCurrentPathProgress：trimCurrent路径进度状态或数据块。
 */

    trimCurrentPathProgress: () => void;    
    /**
 * sendMoveCommand：sendMoveCommand相关字段。
 */

    sendMoveCommand: (dir: Direction) => void;    
    /**
 * planPathTo：plan路径To相关字段。
 */

    planPathTo: (
      target: {      
      /**
 * x：x相关字段。
 */
 x: number;      
 /**
 * y：y相关字段。
 */
 y: number },
      options?: {      
      /**
 * ignoreVisibilityLimit：ignore可见性Limit相关字段。
 */
 ignoreVisibilityLimit?: boolean;      
 /**
 * allowNearestReachable：allowNearestReachable相关字段。
 */
 allowNearestReachable?: boolean;      
 /**
 * preserveAutoInteraction：preserveAutoInteraction相关字段。
 */
 preserveAutoInteraction?: boolean },
    ) => void;    
    /**
 * findObservedEntityAt：ObservedEntityAt相关字段。
 */

    findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;    
    /**
 * handleNpcClickTarget：NPCClick目标相关字段。
 */

    handleNpcClickTarget: (npc: MainNavigationObservedEntity) => boolean;    
    /**
 * handlePortalClickTarget：PortalClick目标相关字段。
 */

    handlePortalClickTarget: (target: {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }, tile: Tile) => boolean;
  };  
  /**
 * targeting：targeting相关字段。
 */

  targeting: {  
  /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

    syncTargetingOverlay: () => void;    
    /**
 * cancelTargeting：cancelTargeting相关字段。
 */

    cancelTargeting: (showMessage?: boolean) => void;    
    /**
 * getCurrentActionDef：CurrentActionDef相关字段。
 */

    getCurrentActionDef: (actionId: string) => ActionDef | null;    
    /**
 * resolveCurrentTargetingRange：CurrentTargeting范围相关字段。
 */

    resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;    
    /**
 * beginTargeting：beginTargeting相关字段。
 */

    beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;    
    /**
 * computeAffectedCellsForAction：AffectedCellForAction相关字段。
 */

    computeAffectedCellsForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ) => GridPoint[];    
    /**
 * resolveTargetRefForAction：目标RefForAction相关字段。
 */

    resolveTargetRefForAction: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
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
    ) => string | null;    
    /**
 * hasAffectableTargetInArea：启用开关或状态标识。
 */

    hasAffectableTargetInArea: (
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ) => boolean;    
    /**
 * syncSenseQiOverlay：SenseQiOverlay相关字段。
 */

    syncSenseQiOverlay: () => void;    
    /**
 * setHoveredMapTile：Hovered地图Tile相关字段。
 */

    setHoveredMapTile: (value: {    
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
 clientY: number } | null) => void;    
 /**
 * getPendingTargetedAction：PendingTargetedAction相关字段。
 */

    getPendingTargetedAction: () => PendingTargetedAction;    
    /**
 * setPendingTargetedActionHover：PendingTargetedActionHover相关字段。
 */

    setPendingTargetedActionHover: (target: {    
    /**
 * x：x相关字段。
 */
 x?: number;    
 /**
 * y：y相关字段。
 */
 y?: number } | null) => void;
  };  
  /**
 * observe：observe相关字段。
 */

  observe: {  
  /**
 * hide：hide相关字段。
 */

    hide: () => void;    
    /**
 * show：show相关字段。
 */

    show: (x: number, y: number) => void;    
    /**
 * isOpen：启用开关或状态标识。
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
 * @returns 无返回值，直接更新Main地图运行态桥接来源相关状态。
 */


export function createMainMapRuntimeBridgeSource(options: MainMapRuntimeBridgeSourceOptions) {
  return {  
  /**
 * resizeCanvas：判断resizeCanva是否满足条件。
 * @returns 无返回值，直接更新resizeCanva相关状态。
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
 * clearCurrentPath：执行clear当前路径相关逻辑。
 * @returns 无返回值，直接更新clearCurrent路径相关状态。
 */


    clearCurrentPath(): void {
      options.navigation.clearCurrentPath();
    },    
    /**
 * trimCurrentPathProgress：执行trim当前路径进度相关逻辑。
 * @returns 无返回值，直接更新trimCurrent路径进度相关状态。
 */


    trimCurrentPathProgress(): void {
      options.navigation.trimCurrentPathProgress();
    },    
    /**
 * sendMoveCommand：执行sendMoveCommand相关逻辑。
 * @param dir Direction 参数说明。
 * @returns 无返回值，直接更新sendMoveCommand相关状态。
 */


    sendMoveCommand(dir: Direction): void {
      options.navigation.sendMoveCommand(dir);
    },    
    /**
 * planPathTo：执行plan路径To相关逻辑。
 * @param target { x: number; y: number } 目标对象。
 * @param optionsArg { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean } 参数说明。
 * @returns 无返回值，直接更新plan路径To相关状态。
 */


    planPathTo(
      target: {      
      /**
 * x：x相关字段。
 */
 x: number;      
 /**
 * y：y相关字段。
 */
 y: number },
      optionsArg?: {      
      /**
 * ignoreVisibilityLimit：ignore可见性Limit相关字段。
 */
 ignoreVisibilityLimit?: boolean;      
 /**
 * allowNearestReachable：allowNearestReachable相关字段。
 */
 allowNearestReachable?: boolean;      
 /**
 * preserveAutoInteraction：preserveAutoInteraction相关字段。
 */
 preserveAutoInteraction?: boolean },
    ): void {
      options.navigation.planPathTo(target, optionsArg);
    },    
    /**
 * findObservedEntityAt：读取ObservedEntityAt并返回结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param kind string 参数说明。
 * @returns 返回ObservedEntityAt。
 */


    findObservedEntityAt(x: number, y: number, kind?: string): MainNavigationObservedEntity | null {
      return options.navigation.findObservedEntityAt(x, y, kind);
    },    
    /**
 * handleNpcClickTarget：读取NPCClick目标并返回结果。
 * @param npc MainNavigationObservedEntity 参数说明。
 * @returns 返回是否满足NPCClick目标条件。
 */


    handleNpcClickTarget(npc: MainNavigationObservedEntity): boolean {
      return options.navigation.handleNpcClickTarget(npc);
    },    
    /**
 * handlePortalClickTarget：读取传送门Click目标并返回结果。
 * @param target { x: number; y: number } 目标对象。
 * @param tile Tile 参数说明。
 * @returns 返回是否满足PortalClick目标条件。
 */


    handlePortalClickTarget(target: {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }, tile: Tile): boolean {
      return options.navigation.handlePortalClickTarget(target, tile);
    },    
    /**
 * syncTargetingOverlay：读取TargetingOverlay并返回结果。
 * @returns 无返回值，直接更新TargetingOverlay相关状态。
 */


    syncTargetingOverlay(): void {
      options.targeting.syncTargetingOverlay();
    },    
    /**
 * cancelTargeting：读取cancelTargeting并返回结果。
 * @param showMessage 参数说明。
 * @returns 无返回值，完成cancelTargeting的条件判断。
 */


    cancelTargeting(showMessage = false): void {
      options.targeting.cancelTargeting(showMessage);
    },    
    /**
 * getCurrentActionDef：读取当前ActionDef。
 * @param actionId string action ID。
 * @returns 返回CurrentActionDef。
 */


    getCurrentActionDef(actionId: string): ActionDef | null {
      return options.targeting.getCurrentActionDef(actionId);
    },    
    /**
 * resolveCurrentTargetingRange：读取当前Targeting范围并返回结果。
 * @param action NonNullable<PendingTargetedAction> 参数说明。
 * @returns 返回CurrentTargeting范围。
 */


    resolveCurrentTargetingRange(action: NonNullable<PendingTargetedAction>): number {
      return options.targeting.resolveCurrentTargetingRange(action);
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
      options.targeting.beginTargeting(actionId, actionName, targetMode, range);
    },    
    /**
 * computeAffectedCellsForAction：执行AffectedCellForAction相关逻辑。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchor GridPoint 参数说明。
 * @returns 返回AffectedCellForAction列表。
 */


    computeAffectedCellsForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
      anchor: GridPoint,
    ): GridPoint[] {
      return options.targeting.computeAffectedCellsForAction(action, anchor);
    },    
    /**
 * resolveTargetRefForAction：读取目标RefForAction并返回结果。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'> 参数说明。
 * @param target { x: number; y: number; entityId?: string; entityKind?: string } 目标对象。
 * @returns 返回目标RefForAction。
 */


    resolveTargetRefForAction(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
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
      return options.targeting.resolveTargetRefForAction(action, target);
    },    
    /**
 * hasAffectableTargetInArea：读取Affectable目标InArea并返回结果。
 * @param action Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'> 参数说明。
 * @param anchorX number 参数说明。
 * @param anchorY number 参数说明。
 * @returns 返回是否满足Affectable目标InArea条件。
 */


    hasAffectableTargetInArea(
      action: Pick<NonNullable<PendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
      anchorX: number,
      anchorY: number,
    ): boolean {
      return options.targeting.hasAffectableTargetInArea(action, anchorX, anchorY);
    },    
    /**
 * getVisibleTileAt：读取可见TileAt。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 返回可见TileAt。
 */


    getVisibleTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getVisibleTileAt(x, y);
    },    
    /**
 * getKnownTileAt：读取KnownTileAt。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 返回KnownTileAt。
 */


    getKnownTileAt(x: number, y: number): Tile | null {
      return options.mapRuntime.getKnownTileAt(x, y);
    },    
    /**
 * isPointInsideCurrentMap：判断PointInside当前地图是否满足条件。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 返回是否满足PointInsideCurrent地图条件。
 */


    isPointInsideCurrentMap(x: number, y: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const mapMeta = options.mapRuntime.getMapMeta();
      if (!mapMeta) return true;
      return x >= 0 && y >= 0 && x < mapMeta.width && y < mapMeta.height;
    },    
    /**
 * getVisibleGroundPileAt：读取可见地面PileAt。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 返回可见GroundPileAt。
 */


    getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
      return options.mapRuntime.getGroundPileAt(x, y);
    },    
    /**
 * syncSenseQiOverlay：处理SenseQiOverlay并更新相关状态。
 * @returns 无返回值，直接更新SenseQiOverlay相关状态。
 */


    syncSenseQiOverlay(): void {
      options.targeting.syncSenseQiOverlay();
    },    
    /**
 * isWithinDisplayedMemoryBounds：判断WithinDisplayedMemoryBound是否满足条件。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 返回是否满足WithinDisplayedMemoryBound条件。
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
 * hideObserveModal：执行hideObserve弹层相关逻辑。
 * @returns 无返回值，直接更新hideObserve弹层相关状态。
 */


    hideObserveModal(): void {
      options.observe.hide();
    },    
    /**
 * showObserveModal：执行showObserve弹层相关逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 无返回值，直接更新showObserve弹层相关状态。
 */


    showObserveModal(targetX: number, targetY: number): void {
      options.observe.show(targetX, targetY);
    },    
    /**
 * isObserveOpen：判断ObserveOpen是否满足条件。
 * @returns 返回是否满足ObserveOpen条件。
 */


    isObserveOpen(): boolean {
      return options.observe.isOpen();
    },    
    /**
 * getPendingTargetedAction：读取待处理TargetedAction。
 * @returns 返回PendingTargetedAction。
 */


    getPendingTargetedAction(): PendingTargetedAction {
      return options.targeting.getPendingTargetedAction();
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
      options.targeting.setPendingTargetedActionHover(target);
    },    
    /**
 * setHoveredMapTile：写入Hovered地图Tile。
 * @param value { x: number; y: number; clientX: number; clientY: number } | null 参数说明。
 * @returns 无返回值，直接更新Hovered地图Tile相关状态。
 */


    setHoveredMapTile(value: {    
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
 clientY: number } | null): void {
      options.targeting.setHoveredMapTile(value);
    },    
    /**
 * bindKeyboardInput：执行bindKeyboard输入相关逻辑。
 * @returns 无返回值，直接更新bindKeyboard输入相关状态。
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
