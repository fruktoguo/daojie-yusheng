import { encodeTileTargetRef, isPointInRange, type ActionDef, type TargetingShape, type Tile } from '@mud/shared-next';
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

type HoveredMapTile = {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
} | null;

type MainMapInteractionBindingsOptions = {
  mapRuntime: {
    setMoveHandler: (handler: (x: number, y: number) => void) => void;
    setInteractionCallbacks: (callbacks: {
      onTarget: (target: { x: number; y: number; clientX?: number; clientY?: number; entityId?: string; entityKind?: string }) => void;
      onHover: (target: { x: number; y: number; clientX?: number; clientY?: number } | null) => void;
    }) => void;
  };
  planPathTo: (target: { x: number; y: number }, options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean }) => void;
  findObservedEntityAt: (x: number, y: number, kind?: string) => MainNavigationObservedEntity | null;
  getPendingTargetedAction: () => PendingTargetedAction;
  setPendingTargetedActionHover: (target: { x?: number; y?: number } | null) => void;
  resolveCurrentTargetingRange: (action: NonNullable<PendingTargetedAction>) => number;
  isPointInsideCurrentMap: (x: number, y: number) => boolean;
  getVisibleTileAt: (x: number, y: number) => Tile | null;
  showToast: (message: string) => void;
  showObserveModal: (x: number, y: number) => void;
  cancelTargeting: () => void;
  getPlayer: () => { x: number; y: number } | null;
  sendAction: (actionId: string, target?: string) => void;
  sendCastSkill: (actionId: string, target?: string) => void;
  hasAffectableTargetInArea: (action: NonNullable<PendingTargetedAction>, anchorX: number, anchorY: number) => boolean;
  resolveTargetRefForAction: (
    action: NonNullable<PendingTargetedAction>,
    target: { x: number; y: number; entityId?: string; entityKind?: string },
  ) => string | null;
  getCurrentActionDef: (actionId: string) => ActionDef | null;
  isWithinDisplayedMemoryBounds: (x: number, y: number) => boolean;
  getKnownTileAt: (x: number, y: number) => Tile | null;
  handleNpcClickTarget: (npc: MainNavigationObservedEntity) => boolean;
  handlePortalClickTarget: (target: { x: number; y: number }, tile: Tile) => boolean;
  clearCurrentPath: () => void;
  syncTargetingOverlay: () => void;
  syncSenseQiOverlay: () => void;
  setHoveredMapTile: (value: HoveredMapTile) => void;
};

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
