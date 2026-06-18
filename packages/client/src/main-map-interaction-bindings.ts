/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import { encodeTileTargetRef, isPointInRange, type ActionDef, type PlayerState, type TargetingShape, type Tile } from '@mud/shared';
import { resolveClientSkillCastAvailability } from './client-skill-cast-availability';
import type { MainNavigationObservedEntity } from './main-navigation-state-source';
import { t } from './ui/i18n';
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

    setMoveHandler: (handler: (x: number, y: number, mapId?: string) => void) => void;
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
 y: number;
 /**
 * mapId：地图ID标识。
 */
 mapId?: string }, options?: {
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
  hasPendingBuildPlacementTargeting: () => boolean;
  setPendingBuildPlacementHover: (target: { x?: number; y?: number } | null) => void;
  confirmBuildPlacementTarget: (x: number, y: number) => void;
  cancelPendingBuildPlacementTargeting: (clearTargeting?: boolean) => void;
  /**
 * cancelTargeting：cancelTargeting相关字段。
 */

  cancelTargeting: () => void;
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;
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
  isCellReachableForCurrentPlayer: (x: number, y: number) => boolean;
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
  syncWangQiOverlay?: () => void;
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
  options.mapRuntime.setMoveHandler((x, y, mapId) => {
    options.planPathTo({ x, y, mapId });
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
          options.showToast(t('map-interaction.toast.projection-observe-only'));
          return;
        }
        if (pendingTargetedAction.actionId === 'client:observe') {
          if (!options.getVisibleTileAt(target.x, target.y)) {
            options.showToast(t('map-interaction.toast.sense-visible-only'));
            return;
          }
          options.showObserveModal(target.x, target.y);
          options.cancelTargeting();
          return;
        }
        if (pendingTargetedAction.actionId === 'loot:open') {
        if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          options.showToast(t('map-interaction.toast.loot-out-of-range', { range: pendingTargetedAction.range }));
          return;
          }
          options.resetLootPanelManualCloseSuppression();
          options.sendAction('loot:open', encodeTileTargetRef({ x: target.x, y: target.y }));
          options.cancelTargeting();
          return;
        }
        if (pendingTargetedAction.actionId === 'building:place') {
          if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
            options.showToast(t('map-interaction.toast.build-out-of-range', { range: pendingTargetedAction.range }));
            return;
          }
          if (!options.getVisibleTileAt(target.x, target.y)) {
            options.showToast(t('map-interaction.toast.select-visible-tile'));
            return;
          }
          options.confirmBuildPlacementTarget(target.x, target.y);
          options.cancelTargeting();
          return;
        }
        if (pendingTargetedAction.actionId === 'mining:start' && !options.getVisibleTileAt(target.x, target.y)) {
          options.showToast(t('map-interaction.toast.select-visible-tile'));
          return;
        }
        if (!player || !isPointInRange({ x: player.x, y: player.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          options.showToast(t('map-interaction.toast.cast-out-of-range', { range: pendingTargetedAction.range }));
          return;
        }
        if (!options.hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
          options.showToast(t('map-interaction.toast.no-target'));
          return;
        }
        const targetRef = options.resolveTargetRefForAction(pendingTargetedAction, target);
        if (!targetRef) {
          options.showToast(t('map-interaction.toast.target-required'));
          return;
        }
        const action = options.getCurrentActionDef(pendingTargetedAction.actionId);
        if (action?.type === 'skill') {
          const availability = resolveClientSkillCastAvailability(player, action);
          if (!availability.ok) {
            options.showToast(availability.message);
            return;
          }
          options.sendCastSkill(pendingTargetedAction.actionId, targetRef);
        } else {
          options.sendAction(pendingTargetedAction.actionId, targetRef);
        }
        options.cancelTargeting();
        return;
      }

      if (!options.isPointInsideCurrentMap(target.x, target.y)) {
        options.showToast(t('map-interaction.toast.projection-observe-only'));
        return;
      }
      if (clickedMonster) {
        options.clearCurrentPath();
        options.sendAction('battle:engage', clickedMonster.id);
        return;
      }
      if (!options.isWithinDisplayedMemoryBounds(target.x, target.y)) {
        options.showToast(t('map-interaction.toast.inspect-visible-only'));
        return;
      }
      const knownTile = options.getKnownTileAt(target.x, target.y);
      if (!knownTile) {
        options.showToast(t('map-interaction.toast.unknown-tile'));
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
      if (!options.isCellReachableForCurrentPlayer(target.x, target.y)) {
        options.showToast(t('map-interaction.toast.unreachable'));
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
        if (pendingTargetedAction.actionId === 'building:place') {
          options.setPendingBuildPlacementHover(target ? { x: target.x, y: target.y } : null);
        }
        options.syncTargetingOverlay();
        return;
      }
      if (options.hasPendingBuildPlacementTargeting()) {
        options.setPendingBuildPlacementHover(null);
      }
      options.syncSenseQiOverlay();
      options.syncWangQiOverlay?.();
    },
  });
}
