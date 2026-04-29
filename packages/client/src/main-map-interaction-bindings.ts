import { encodeTileTargetRef, isPointInRange, type ActionDef, type TargetingShape, type Tile } from '@mud/shared';
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
 * HoveredMapTile：统一结构类型，保证协议与运行时一致性。
 */


type HoveredMapTile = {
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
 * MainMapInteractionBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMapInteractionBindingsOptions = {
/**
 * mapRuntime：地图运行态引用。
 */

  mapRuntime: {
  /**
 * setMoveHandler：MoveHandler相关字段。
 */

    setMoveHandler: (handler: (x: number, y: number) => void) => void;
    /**
 * setInteractionCallbacks：InteractionCallback相关字段。
 */

    setInteractionCallbacks: (callbacks: {
    /**
 * onTarget：on目标相关字段。
 */

      onTarget: (target: {
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
 clientX?: number;
 /**
 * clientY：clientY相关字段。
 */
 clientY?: number;
 /**
 * entityId：entityID标识。
 */
 entityId?: string;
 /**
 * entityKind：entityKind相关字段。
 */
 entityKind?: string }) => void;
 /**
 * onHover：onHover相关字段。
 */

      onHover: (target: {
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
 clientX?: number;
 /**
 * clientY：clientY相关字段。
 */
 clientY?: number } | null) => void;
    }) => void;
  };
  /**
 * planPathTo：plan路径To相关字段。
 */

  planPathTo: (target: {
  /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number }, options?: {
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
 preserveAutoInteraction?: boolean }) => void;
 /**
 * findObservedEntityAt：ObservedEntityAt相关字段。
 */

  findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;
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
 /**
 * resolveCurrentTargetingRange：CurrentTargeting范围相关字段。
 */

  resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;
  /**
 * isPointInsideCurrentMap：启用开关或状态标识。
 */

  isPointInsideCurrentMap: (x: number, y: number) => boolean;
  /**
 * getVisibleTileAt：可见TileAt相关字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;
  /**
 * showObserveModal：showObserve弹层相关字段。
 */

  showObserveModal: (x: number, y: number) => void;
  /**
 * cancelTargeting：cancelTargeting相关字段。
 */

  cancelTargeting: () => void;
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
 * senseQiActive：感气启用状态。
 */
 senseQiActive?: boolean } | null;
  /**
 * sendAction：sendAction相关字段。
 */

  sendAction: (actionId: string, target?: string) => void;
  /**
 * resetLootPanelManualCloseSuppression：显式重新拿取前解除手动关闭抑制。
 */

  resetLootPanelManualCloseSuppression: () => void;
  /**
 * sendCastSkill：sendCast技能相关字段。
 */

  sendCastSkill: (actionId: string, target?: string) => void;
  /**
 * hasAffectableTargetInArea：启用开关或状态标识。
 */

  hasAffectableTargetInArea: (action: NonNullable<PendingTargetedAction>, anchorX: number, anchorY: number) => boolean;
  /**
 * resolveTargetRefForAction：目标RefForAction相关字段。
 */

  resolveTargetRefForAction: (
    action: NonNullable<PendingTargetedAction>,
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
 * getCurrentActionDef：CurrentActionDef相关字段。
 */

  getCurrentActionDef: (actionId: string) => ActionDef | null;
  /**
 * isWithinDisplayedMemoryBounds：启用开关或状态标识。
 */

  isWithinDisplayedMemoryBounds: (x: number, y: number) => boolean;
  /**
 * getKnownTileAt：KnownTileAt相关字段。
 */

  getKnownTileAt: (x: number, y: number) => Tile | null;
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
 /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;
  /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

  syncTargetingOverlay: () => void;
  /**
 * syncSenseQiOverlay：SenseQiOverlay相关字段。
 */

  syncSenseQiOverlay: () => void;
  /**
 * setHoveredMapTile：Hovered地图Tile相关字段。
 */

  setHoveredMapTile: (value: HoveredMapTile) => void;
};
/**
 * bindMainMapInteractions：执行bindMain地图Interaction相关逻辑。
 * @param options MainMapInteractionBindingsOptions 选项参数。
 * @returns 无返回值，直接更新bindMain地图Interaction相关状态。
 */


export function bindMainMapInteractions(options: MainMapInteractionBindingsOptions): void {
  options.mapRuntime.setMoveHandler((x, y) => {
    options.planPathTo({ x, y });
  });

  options.mapRuntime.setInteractionCallbacks({
    onTarget: (target) => {
      const clickedMonster = options.findObservedEntityAt(target.x, target.y, 'monster');
      const clickedNpc = options.findObservedEntityAt(target.x, target.y, 'npc');
      const player = options.getPlayer();
      const clickedFormation = player?.senseQiActive === true
        ? options.findObservedEntityAt(target.x, target.y, 'formation')
        : null;
      const pendingTargetedAction = options.getPendingTargetedAction();

      if (pendingTargetedAction) {
        pendingTargetedAction.range = options.resolveCurrentTargetingRange(pendingTargetedAction);
        if (pendingTargetedAction.actionId !== 'client:observe' && !options.isPointInsideCurrentMap(target.x, target.y)) {
          options.showToast('窗外投影当前仅支持观察');
          return;
        }
        if (pendingTargetedAction.actionId === 'client:observe') {
          if (!options.getVisibleTileAt(target.x, target.y)) {
            options.showToast('神识仅可触及视野之内');
            return;
          }
          options.showObserveModal(target.x, target.y);
          options.cancelTargeting();
          return;
        }
        if (pendingTargetedAction.actionId === 'loot:open') {
        if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          options.showToast(`超出拿取范围，最多 ${pendingTargetedAction.range} 格`);
          return;
          }
          options.resetLootPanelManualCloseSuppression();
          options.sendAction('loot:open', encodeTileTargetRef({ x: target.x, y: target.y }));
          options.cancelTargeting();
          return;
        }
        if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          options.showToast(`超出施法范围，最多 ${pendingTargetedAction.range} 格`);
          return;
        }
        if (!options.hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
          options.showToast('此处无可用之目标');
          return;
        }
        const targetRef = options.resolveTargetRefForAction(pendingTargetedAction, target);
        if (!targetRef) {
          options.showToast('此术需有指向之目标');
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
        options.showToast('仅可察视当前可见之地');
        return;
      }
      const knownTile = options.getKnownTileAt(target.x, target.y);
      if (!knownTile) {
        options.showToast('未知之地，未可踏足');
        return;
      }
      if (clickedNpc && options.handleNpcClickTarget(clickedNpc)) {
        return;
      }
      if (clickedFormation) {
        if (player && player.x === target.x && player.y === target.y && clickedFormation.formationLifecycle !== 'persistent') {
          options.sendAction(`formation:toggle:${clickedFormation.id}`);
          return;
        }
        options.planPathTo(target);
        return;
      }
      if (options.handlePortalClickTarget(target, knownTile)) {
        return;
      }
      if (!knownTile.walkable) {
        options.showToast('此地无法抵达');
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
