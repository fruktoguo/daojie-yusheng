import {
  type Direction,
  directionToDelta,
  gridDistance,
  isPointInRange,
  type MapMeta,
  type NpcQuestMarker,
  packDirections,
  type Tile,
} from '@mud/shared-next';
import { logNextMovement } from './debug/movement-debug';
import { findPath } from './pathfinding';
import type { MainRuntimeObservedEntity } from './main-runtime-view-types';

export type MainNavigationObservedEntity = Pick<
  MainRuntimeObservedEntity,
  'id' | 'wx' | 'wy' | 'char' | 'color' | 'name' | 'kind' | 'npcQuestMarker'
> & {
  npcQuestMarker?: NpcQuestMarker;
};

type PendingAutoInteraction =
  | {
      kind: 'npc';
      mapId: string;
      x: number;
      y: number;
      npcId: string;
    }
  | {
      kind: 'portal';
      mapId: string;
      x: number;
      y: number;
      actionId: 'portal:travel';
    };

type MainNavigationStateSourceOptions = {
  getPlayer: () => { id: string; x: number; y: number; mapId: string; actions?: Array<{ id: string }> } | null;
  setPlayerFacing: (direction: Direction) => void;
  getLatestEntities: () => MainNavigationObservedEntity[];
  getLatestEntityById: (id: string) => MainNavigationObservedEntity | undefined;
  getMapMeta: () => MapMeta | null;
  getKnownTileAt: (x: number, y: number) => Tile | null;
  setRuntimePathCells: (cells: Array<{ x: number; y: number }>) => void;
  sendMove: (direction: Direction) => void;
  sendMoveTo: (
    x: number,
    y: number,
    options?: {
      ignoreVisibilityLimit?: boolean;
      allowNearestReachable?: boolean;
      packedPath?: string;
      packedPathSteps?: number;
      pathStartX?: number;
      pathStartY?: number;
    },
  ) => void;
  sendAction: (actionId: string) => void;
  openNpcShop: (npcId: string) => void;
  openNpcQuestPending: (npcId: string) => void;
  showToast: (message: string) => void;
};

const AUTO_INTERACTION_APPROACH_STEPS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

function isPathPreviewBlockingEntity(entity: MainNavigationObservedEntity): boolean {
  return entity.kind === 'player' || entity.kind === 'monster' || entity.kind === 'npc' || entity.kind === 'crowd';
}

function createPlayerOverlapPointKeySet(mapMeta: MapMeta | null): ReadonlySet<string> {
  return new Set((mapMeta?.playerOverlapPoints ?? []).map((point) => `${point.x},${point.y}`));
}

export type MainNavigationStateSource = ReturnType<typeof createMainNavigationStateSource>;

export function createMainNavigationStateSource(options: MainNavigationStateSourceOptions) {
  let pathCells: Array<{ x: number; y: number }> = [];
  let pathTarget: { x: number; y: number } | null = null;
  let pendingAutoInteraction: PendingAutoInteraction | null = null;

  function isVisibleBlockingEntityAt(
    x: number,
    y: number,
    config?: { allowSelf?: boolean; mapMeta?: MapMeta | null; playerOverlapPointKeys?: ReadonlySet<string> },
  ): boolean {
    const overlapPointKeys = config?.playerOverlapPointKeys
      ?? createPlayerOverlapPointKeySet(config?.mapMeta ?? options.getMapMeta());
    const supportsPlayerOverlap = overlapPointKeys.has(`${x},${y}`);
    return options.getLatestEntities().some((entity) => {
      if (entity.wx !== x || entity.wy !== y || !isPathPreviewBlockingEntity(entity)) {
        return false;
      }
      if (config?.allowSelf && entity.kind === 'player' && entity.id === options.getPlayer()?.id) {
        return false;
      }
      if (entity.kind === 'player' && supportsPlayerOverlap) {
        return false;
      }
      return true;
    });
  }

  function isCellInsideCurrentMap(x: number, y: number): boolean {
    const mapMeta = options.getMapMeta();
    return Boolean(mapMeta && x >= 0 && x < mapMeta.width && y >= 0 && y < mapMeta.height);
  }

  function isCellAvailableForAutoApproach(x: number, y: number): boolean {
    if (!options.getPlayer() || !isCellInsideCurrentMap(x, y)) {
      return false;
    }
    const mapMeta = options.getMapMeta();
    const tile = options.getKnownTileAt(x, y);
    if (!tile?.walkable) {
      return false;
    }
    return !isVisibleBlockingEntityAt(x, y, { allowSelf: true, mapMeta });
  }

  function buildClientPreviewPath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): { cells: Array<{ x: number; y: number }>; directions: Direction[] } | null {
    const mapMeta = options.getMapMeta();
    if (!mapMeta) {
      return null;
    }
    if (
      startX < 0 || startY < 0 || targetX < 0 || targetY < 0
      || startX >= mapMeta.width || targetX >= mapMeta.width
      || startY >= mapMeta.height || targetY >= mapMeta.height
    ) {
      return null;
    }
    const playerOverlapPointKeys = createPlayerOverlapPointKeySet(mapMeta);
    const visibleBlockingPositions = new Set<string>();
    for (const entity of options.getLatestEntities()) {
      if (!isPathPreviewBlockingEntity(entity)) {
        continue;
      }
      const coordKey = `${entity.wx},${entity.wy}`;
      if (entity.kind === 'player' && entity.id === options.getPlayer()?.id) {
        continue;
      }
      if (entity.kind === 'player' && playerOverlapPointKeys.has(coordKey)) {
        continue;
      }
      visibleBlockingPositions.add(coordKey);
    }

    const tiles: Tile[][] = [];
    for (let y = 0; y < mapMeta.height; y += 1) {
      const row: Tile[] = [];
      for (let x = 0; x < mapMeta.width; x += 1) {
        const tile = options.getKnownTileAt(x, y);
        const baseTile = tile ?? ({ type: 'wall', walkable: false } as Tile);
        const occupiedByVisibleEntity = visibleBlockingPositions.has(`${x},${y}`);
        row.push(occupiedByVisibleEntity
          ? {
              ...baseTile,
              walkable: false,
              occupiedBy: 'visible_entity',
            }
          : baseTile);
      }
      tiles.push(row);
    }

    const previewDirections = findPath(tiles, startX, startY, targetX, targetY);
    if (!previewDirections) {
      return null;
    }

    const previewCells: Array<{ x: number; y: number }> = [];
    let currentX = startX;
    let currentY = startY;
    for (const direction of previewDirections) {
      const [dx, dy] = directionToDelta(direction);
      currentX += dx;
      currentY += dy;
      previewCells.push({ x: currentX, y: currentY });
    }
    return {
      cells: previewCells,
      directions: previewDirections,
    };
  }

  function resolveNpcInteractionActionId(npc: Pick<MainNavigationObservedEntity, 'id' | 'npcQuestMarker'>): string | null {
    const actionIds = new Set((options.getPlayer()?.actions ?? []).map((action) => action.id));
    const questActionId = `npc_quests:${npc.id}`;
    const shopActionId = `npc_shop:${npc.id}`;
    const talkActionId = `npc:${npc.id}`;

    if (npc.npcQuestMarker && actionIds.has(questActionId)) {
      return questActionId;
    }
    if (actionIds.has(shopActionId)) {
      return shopActionId;
    }
    if (actionIds.has(questActionId)) {
      return questActionId;
    }
    if (actionIds.has(talkActionId)) {
      return talkActionId;
    }
    return null;
  }

  function resolveNpcApproachTarget(npc: MainNavigationObservedEntity): { x: number; y: number } | null {
    const player = options.getPlayer();
    if (!player) {
      return null;
    }

    let bestCandidate: { x: number; y: number; pathLength: number; distance: number } | null = null;
    for (const step of AUTO_INTERACTION_APPROACH_STEPS) {
      const candidateX = npc.wx + step.dx;
      const candidateY = npc.wy + step.dy;
      if (!isCellAvailableForAutoApproach(candidateX, candidateY)) {
        continue;
      }
      const previewPath = buildClientPreviewPath(player.x, player.y, candidateX, candidateY);
      if (!previewPath && (player.x !== candidateX || player.y !== candidateY)) {
        continue;
      }
      const pathLength = previewPath?.cells.length ?? 0;
      const distance = gridDistance({ x: player.x, y: player.y }, { x: candidateX, y: candidateY });
      if (
        !bestCandidate
        || pathLength < bestCandidate.pathLength
        || (pathLength === bestCandidate.pathLength && distance < bestCandidate.distance)
      ) {
        bestCandidate = { x: candidateX, y: candidateY, pathLength, distance };
      }
    }
    return bestCandidate ? { x: bestCandidate.x, y: bestCandidate.y } : null;
  }

  return {
    getPathCells(): Array<{ x: number; y: number }> {
      return pathCells;
    },

    getPathTarget(): { x: number; y: number } | null {
      return pathTarget;
    },

    hasActivePath(): boolean {
      return Boolean(pathTarget) || pathCells.length > 0;
    },

    syncPathCellsToRuntime(): void {
      options.setRuntimePathCells(pathCells);
    },

    clearCurrentPath(): void {
      pathCells = [];
      pathTarget = null;
      pendingAutoInteraction = null;
      options.setRuntimePathCells(pathCells);
    },

    trimCurrentPathProgress(): void {
      const player = options.getPlayer();
      if (!player || pathCells.length === 0) {
        return;
      }
      const currentIndex = pathCells.findIndex((cell) => cell.x === player.x && cell.y === player.y);
      if (currentIndex >= 0) {
        pathCells = pathCells.slice(currentIndex + 1);
        return;
      }
      const firstRemainingCell = pathCells[0];
      if (!firstRemainingCell) {
        return;
      }
      if (gridDistance(player, firstRemainingCell) > 1) {
        pathCells = [];
        pathTarget = null;
        pendingAutoInteraction = null;
      }
    },

    sendMoveCommand(direction: Direction): void {
      const player = options.getPlayer();
      if (!player) {
        return;
      }
      logNextMovement('client.intent.move', {
        playerId: player.id,
        from: { x: player.x, y: player.y, mapId: player.mapId },
        direction,
      });
      this.clearCurrentPath();
      options.setPlayerFacing(direction);
      options.sendMove(direction);
    },

    planPathTo(
      target: { x: number; y: number },
      config?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean },
    ): void {
      const player = options.getPlayer();
      if (!player) {
        return;
      }
      if (!config?.preserveAutoInteraction) {
        pendingAutoInteraction = null;
      }
      pathTarget = target;
      const preview = buildClientPreviewPath(player.x, player.y, target.x, target.y);
      pathCells = preview?.cells ?? [{ x: target.x, y: target.y }];
      options.setRuntimePathCells(pathCells);
      logNextMovement('client.intent.moveTo', {
        playerId: player.id,
        from: { x: player.x, y: player.y, mapId: player.mapId },
        target,
        allowNearestReachable: config?.allowNearestReachable === true,
        ignoreVisibilityLimit: config?.ignoreVisibilityLimit === true,
        previewFound: Boolean(preview),
        previewDirections: preview?.directions ?? [],
        previewCells: pathCells,
      });
      options.sendMoveTo(target.x, target.y, {
        ...config,
        packedPath: preview ? packDirections(preview.directions) : undefined,
        packedPathSteps: preview?.directions.length,
        pathStartX: preview ? player.x : undefined,
        pathStartY: preview ? player.y : undefined,
      });
    },

    findObservedEntityAt(x: number, y: number, kind?: string): MainNavigationObservedEntity | null {
      return options.getLatestEntities().find((entry) => entry.wx === x && entry.wy === y && (kind ? entry.kind === kind : true)) ?? null;
    },

    triggerAutoInteractionIfReady(): boolean {
      const player = options.getPlayer();
      if (!player || !pendingAutoInteraction || pendingAutoInteraction.mapId !== player.mapId) {
        pendingAutoInteraction = null;
        return false;
      }
      if (pendingAutoInteraction.kind === 'portal') {
        if (player.x !== pendingAutoInteraction.x || player.y !== pendingAutoInteraction.y) {
          return false;
        }
        const actionId = pendingAutoInteraction.actionId;
        this.clearCurrentPath();
        options.sendAction(actionId);
        return true;
      }
      const npc = options.getLatestEntityById(pendingAutoInteraction.npcId)
        ?? this.findObservedEntityAt(pendingAutoInteraction.x, pendingAutoInteraction.y, 'npc');
      if (!npc || npc.kind !== 'npc') {
        pendingAutoInteraction = null;
        return false;
      }
      if (!isPointInRange({ x: player.x, y: player.y }, { x: npc.wx, y: npc.wy }, 1)) {
        return false;
      }
      const actionId = resolveNpcInteractionActionId(npc);
      if (!actionId) {
        return false;
      }
      this.clearCurrentPath();
      if (actionId.startsWith('npc_shop:')) {
        options.openNpcShop(actionId.slice('npc_shop:'.length));
        return true;
      }
      if (actionId.startsWith('npc_quests:')) {
        options.openNpcQuestPending(actionId.slice('npc_quests:'.length));
        options.sendAction(actionId);
        return true;
      }
      options.sendAction(actionId);
      return true;
    },

    handleNpcClickTarget(npc: MainNavigationObservedEntity): boolean {
      const player = options.getPlayer();
      if (!player || npc.kind !== 'npc') {
        return false;
      }
      if (isPointInRange({ x: player.x, y: player.y }, { x: npc.wx, y: npc.wy }, 1)) {
        this.clearCurrentPath();
        const actionId = resolveNpcInteractionActionId(npc);
        if (actionId) {
          if (actionId.startsWith('npc_shop:')) {
            options.openNpcShop(actionId.slice('npc_shop:'.length));
            return true;
          }
          if (actionId.startsWith('npc_quests:')) {
            options.openNpcQuestPending(actionId.slice('npc_quests:'.length));
            options.sendAction(actionId);
            return true;
          }
          options.sendAction(actionId);
          return true;
        }
        pendingAutoInteraction = {
          kind: 'npc',
          mapId: player.mapId,
          x: npc.wx,
          y: npc.wy,
          npcId: npc.id,
        };
        return true;
      }
      const approachTarget = resolveNpcApproachTarget(npc);
      if (!approachTarget) {
        options.showToast('找不到能靠近该 NPC 的位置');
        return true;
      }
      pendingAutoInteraction = {
        kind: 'npc',
        mapId: player.mapId,
        x: npc.wx,
        y: npc.wy,
        npcId: npc.id,
      };
      this.planPathTo(approachTarget, { allowNearestReachable: true, preserveAutoInteraction: true });
      return true;
    },

    handlePortalClickTarget(target: { x: number; y: number }, tile: Tile): boolean {
      const player = options.getPlayer();
      if (!player || (tile.type !== 'portal' && tile.type !== 'stairs')) {
        return false;
      }
      if (player.x === target.x && player.y === target.y) {
        pathCells = [];
        pathTarget = null;
        pendingAutoInteraction = {
          kind: 'portal',
          mapId: player.mapId,
          x: target.x,
          y: target.y,
          actionId: 'portal:travel',
        };
        options.setRuntimePathCells(pathCells);
        return true;
      }
      pendingAutoInteraction = {
        kind: 'portal',
        mapId: player.mapId,
        x: target.x,
        y: target.y,
        actionId: 'portal:travel',
      };
      this.planPathTo({ x: target.x, y: target.y }, { preserveAutoInteraction: true });
      return true;
    },
  };
}
