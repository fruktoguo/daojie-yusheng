import { encodeTileTargetRef, isPointInRange, type ActionDef, type TargetingShape, type Tile } from '@mud/shared-next';
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
 * HoveredMapTile：统一结构类型，保证协议与运行时一致性。
 */


type HoveredMapTile = {
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
 * MainMapInteractionBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMapInteractionBindingsOptions = {
/**
 * mapRuntime：对象字段。
 */

  mapRuntime: {  
  /**
 * setMoveHandler：对象字段。
 */

    setMoveHandler: (handler: (x: number, y: number) => void) => void;    
    /**
 * setInteractionCallbacks：对象字段。
 */

    setInteractionCallbacks: (callbacks: {    
    /**
 * onTarget：对象字段。
 */

      onTarget: (target: {      
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
 clientX?: number;      
 /**
 * clientY：对象字段。
 */
 clientY?: number;      
 /**
 * entityId：对象字段。
 */
 entityId?: string;      
 /**
 * entityKind：对象字段。
 */
 entityKind?: string }) => void;      
 /**
 * onHover：对象字段。
 */

      onHover: (target: {      
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
 clientX?: number;      
 /**
 * clientY：对象字段。
 */
 clientY?: number } | null) => void;
    }) => void;
  };  
  /**
 * planPathTo：对象字段。
 */

  planPathTo: (target: {  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number }, options?: {  
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
 preserveAutoInteraction?: boolean }) => void;  
 /**
 * findObservedEntityAt：对象字段。
 */

  findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;  
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
 /**
 * resolveCurrentTargetingRange：对象字段。
 */

  resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;  
  /**
 * isPointInsideCurrentMap：对象字段。
 */

  isPointInsideCurrentMap: (x: number, y: number) => boolean;  
  /**
 * getVisibleTileAt：对象字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;  
  /**
 * showObserveModal：对象字段。
 */

  showObserveModal: (x: number, y: number) => void;  
  /**
 * cancelTargeting：对象字段。
 */

  cancelTargeting: () => void;  
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
 y: number } | null;  
 /**
 * sendAction：对象字段。
 */

  sendAction: (actionId: string, target?: string) => void;  
  /**
 * sendCastSkill：对象字段。
 */

  sendCastSkill: (actionId: string, target?: string) => void;  
  /**
 * hasAffectableTargetInArea：对象字段。
 */

  hasAffectableTargetInArea: (action: NonNullable<PendingTargetedAction>, anchorX: number, anchorY: number) => boolean;  
  /**
 * resolveTargetRefForAction：对象字段。
 */

  resolveTargetRefForAction: (
    action: NonNullable<PendingTargetedAction>,
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
 * getCurrentActionDef：对象字段。
 */

  getCurrentActionDef: (actionId: string) => ActionDef | null;  
  /**
 * isWithinDisplayedMemoryBounds：对象字段。
 */

  isWithinDisplayedMemoryBounds: (x: number, y: number) => boolean;  
  /**
 * getKnownTileAt：对象字段。
 */

  getKnownTileAt: (x: number, y: number) => Tile | null;  
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
 /**
 * clearCurrentPath：对象字段。
 */

  clearCurrentPath: () => void;  
  /**
 * syncTargetingOverlay：对象字段。
 */

  syncTargetingOverlay: () => void;  
  /**
 * syncSenseQiOverlay：对象字段。
 */

  syncSenseQiOverlay: () => void;  
  /**
 * setHoveredMapTile：对象字段。
 */

  setHoveredMapTile: (value: HoveredMapTile) => void;
};
/**
 * bindMainMapInteractions：执行核心业务逻辑。
 * @param options MainMapInteractionBindingsOptions 选项参数。
 * @returns void。
 */


export function bindMainMapInteractions(options: MainMapInteractionBindingsOptions): void {
  options.mapRuntime.setMoveHandler((x, y) => {
    options.planPathTo({ x, y });
  });

  options.mapRuntime.setInteractionCallbacks({
    onTarget: (target) => {
      const clickedMonster = options.findObservedEntityAt(target.x, target.y, 'monster');
      const clickedNpc = options.findObservedEntityAt(target.x, target.y, 'npc');
      const pendingTargetedAction = options.getPendingTargetedAction();

      if (pendingTargetedAction) {
        pendingTargetedAction.range = options.resolveCurrentTargetingRange(pendingTargetedAction);
        if (pendingTargetedAction.actionId !== 'client:observe' && !options.isPointInsideCurrentMap(target.x, target.y)) {
          options.showToast('窗外投影当前仅支持观察');
          return;
        }
        if (pendingTargetedAction.actionId === 'client:observe') {
          if (!options.getVisibleTileAt(target.x, target.y)) {
            options.showToast('只能观察当前视野内的格子');
            return;
          }
          options.showObserveModal(target.x, target.y);
          options.cancelTargeting();
          return;
        }
        if (pendingTargetedAction.actionId === 'loot:open') {
          const player = options.getPlayer();
          if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
            options.showToast(`超出拿取范围，最多 ${pendingTargetedAction.range} 格`);
            return;
          }
          options.sendAction('loot:open', encodeTileTargetRef({ x: target.x, y: target.y }));
          options.cancelTargeting();
          return;
        }
        const player = options.getPlayer();
        if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          options.showToast(`超出施法范围，最多 ${pendingTargetedAction.range} 格`);
          return;
        }
        if (!options.hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
          options.showToast('该位置范围内没有可命中的目标或可受影响的地块');
          return;
        }
        const targetRef = options.resolveTargetRefForAction(pendingTargetedAction, target);
        if (!targetRef) {
          options.showToast('该技能需要选中有效目标');
          return;
        }
        const action = options.getCurrentActionDef(pendingTargetedAction.actionId);
        if (action?.type === 'skill') {
          options.sendCastSkill(pendingTargetedAction.actionId, targetRef);
        } else {
          options.sendAction(pendingTargetedAction.actionId, targetRef);
        }
        options.cancelTargeting();
        return;
      }

      if (!options.isPointInsideCurrentMap(target.x, target.y)) {
        options.showToast('窗外投影当前仅支持观察');
        return;
      }
      if (clickedMonster) {
        options.clearCurrentPath();
        options.sendAction('battle:engage', clickedMonster.id);
        return;
      }
      if (!options.isWithinDisplayedMemoryBounds(target.x, target.y)) {
        options.showToast('只能点击当前显示区域内的格子');
        return;
      }
      const knownTile = options.getKnownTileAt(target.x, target.y);
      if (!knownTile) {
        options.showToast('完全未知的黑色区域无法点击移动');
        return;
      }
      if (clickedNpc && options.handleNpcClickTarget(clickedNpc)) {
        return;
      }
      if (options.handlePortalClickTarget(target, knownTile)) {
        return;
      }
      if (!knownTile.walkable) {
        options.showToast('无法到达该位置');
        return;
      }
      options.planPathTo(target);
    },
    onHover: (target) => {
      options.setHoveredMapTile(target && typeof target.clientX === 'number' && typeof target.clientY === 'number'
        ? {
            x: target.x,
            y: target.y,
            clientX: target.clientX,
            clientY: target.clientY,
          }
        : null);
      const pendingTargetedAction = options.getPendingTargetedAction();
      if (pendingTargetedAction) {
        options.setPendingTargetedActionHover(target ? { x: target.x, y: target.y } : null);
        options.syncTargetingOverlay();
        return;
      }
      options.syncSenseQiOverlay();
    },
  });
}
