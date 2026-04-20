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
/**
 * MainNavigationObservedEntity：统一结构类型，保证协议与运行时一致性。
 */


export type MainNavigationObservedEntity = Pick<
  MainRuntimeObservedEntity,
  'id' | 'wx' | 'wy' | 'char' | 'color' | 'name' | 'kind' | 'npcQuestMarker'
> & {
/**
 * npcQuestMarker：对象字段。
 */

  npcQuestMarker?: NpcQuestMarker;
};
/**
 * PendingAutoInteraction：统一结构类型，保证协议与运行时一致性。
 */


type PendingAutoInteraction =
  | {  
  /**
 * kind：对象字段。
 */

      kind: 'npc';      
      /**
 * mapId：对象字段。
 */

      mapId: string;      
      /**
 * x：对象字段。
 */

      x: number;      
      /**
 * y：对象字段。
 */

      y: number;      
      /**
 * npcId：对象字段。
 */

      npcId: string;
    }
  | {  
  /**
 * kind：对象字段。
 */

      kind: 'portal';      
      /**
 * mapId：对象字段。
 */

      mapId: string;      
      /**
 * x：对象字段。
 */

      x: number;      
      /**
 * y：对象字段。
 */

      y: number;      
      /**
 * actionId：对象字段。
 */

      actionId: 'portal:travel';
    };    
    /**
 * MainNavigationStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainNavigationStateSourceOptions = {
/**
 * getPlayer：对象字段。
 */

  getPlayer: () => {  
  /**
 * id：对象字段。
 */
 id: string;  
 /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number;  
 /**
 * mapId：对象字段。
 */
 mapId: string;  
 /**
 * actions：对象字段。
 */
 actions?: Array<{  
 /**
 * id：对象字段。
 */
 id: string }> } | null;  
 /**
 * setPlayerFacing：对象字段。
 */

  setPlayerFacing: (direction: Direction) => void;  
  /**
 * getLatestEntities：对象字段。
 */

  getLatestEntities: () => MainNavigationObservedEntity[];  
  /**
 * getLatestEntityById：对象字段。
 */

  getLatestEntityById: (id: string) => MainNavigationObservedEntity | undefined;  
  /**
 * getMapMeta：对象字段。
 */

  getMapMeta: () => MapMeta | null;  
  /**
 * getKnownTileAt：对象字段。
 */

  getKnownTileAt: (x: number, y: number) => Tile | null;  
  /**
 * setRuntimePathCells：对象字段。
 */

  setRuntimePathCells: (cells: Array<{  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number }>) => void;  
 /**
 * sendMove：对象字段。
 */

  sendMove: (direction: Direction) => void;  
  /**
 * sendMoveTo：对象字段。
 */

  sendMoveTo: (
    x: number,
    y: number,
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
 * packedPath：对象字段。
 */

      packedPath?: string;      
      /**
 * packedPathSteps：对象字段。
 */

      packedPathSteps?: number;      
      /**
 * pathStartX：对象字段。
 */

      pathStartX?: number;      
      /**
 * pathStartY：对象字段。
 */

      pathStartY?: number;
    },
  ) => void;  
  /**
 * sendAction：对象字段。
 */

  sendAction: (actionId: string) => void;  
  /**
 * openNpcShop：对象字段。
 */

  openNpcShop: (npcId: string) => void;  
  /**
 * openNpcQuestPending：对象字段。
 */

  openNpcQuestPending: (npcId: string) => void;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;
};

const AUTO_INTERACTION_APPROACH_STEPS: ReadonlyArray<{
/**
 * dx：对象字段。
 */
 dx: number;
 /**
 * dy：对象字段。
 */
 dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];
/**
 * isPathPreviewBlockingEntity：执行状态校验并返回判断结果。
 * @param entity MainNavigationObservedEntity 参数说明。
 * @returns boolean。
 */


function isPathPreviewBlockingEntity(entity: MainNavigationObservedEntity): boolean {
  return entity.kind === 'player' || entity.kind === 'monster' || entity.kind === 'npc' || entity.kind === 'crowd';
}
/**
 * createPlayerOverlapPointKeySet：构建并返回目标对象。
 * @param mapMeta MapMeta | null 参数说明。
 * @returns ReadonlySet<string>。
 */


function createPlayerOverlapPointKeySet(mapMeta: MapMeta | null): ReadonlySet<string> {
  return new Set((mapMeta?.playerOverlapPoints ?? []).map((point) => `${point.x},${point.y}`));
}
/**
 * MainNavigationStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainNavigationStateSource = ReturnType<typeof createMainNavigationStateSource>;
/**
 * createMainNavigationStateSource：构建并返回目标对象。
 * @param options MainNavigationStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainNavigationStateSource(options: MainNavigationStateSourceOptions) {
  let pathCells: Array<{  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number }> = [];
  let pathTarget: {  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number } | null = null;
  let pendingAutoInteraction: PendingAutoInteraction | null = null;  
  /**
 * isVisibleBlockingEntityAt：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param config { allowSelf?: boolean; mapMeta?: MapMeta | null; playerOverlapPointKeys?: ReadonlySet<string> } 参数说明。
 * @returns boolean。
 */


  function isVisibleBlockingEntityAt(
    x: number,
    y: number,
    config?: {    
    /**
 * allowSelf：对象字段。
 */
 allowSelf?: boolean;    
 /**
 * mapMeta：对象字段。
 */
 mapMeta?: MapMeta | null;    
 /**
 * playerOverlapPointKeys：对象字段。
 */
 playerOverlapPointKeys?: ReadonlySet<string> },
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
  /**
 * isCellInsideCurrentMap：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns boolean。
 */


  function isCellInsideCurrentMap(x: number, y: number): boolean {
    const mapMeta = options.getMapMeta();
    return Boolean(mapMeta && x >= 0 && x < mapMeta.width && y >= 0 && y < mapMeta.height);
  }  
  /**
 * isCellAvailableForAutoApproach：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns boolean。
 */


  function isCellAvailableForAutoApproach(x: number, y: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * buildClientPreviewPath：构建并返回目标对象。
 * @param startX number 参数说明。
 * @param startY number 参数说明。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns { cells: Array<{ x: number; y: number }>; directions: Direction[] } | null。
 */


  function buildClientPreviewPath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): {  
  /**
 * cells：对象字段。
 */
 cells: Array<{  
 /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number }>;  
 /**
 * directions：对象字段。
 */
 directions: Direction[] } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

    const previewCells: Array<{    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number }> = [];
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
  /**
 * resolveNpcInteractionActionId：执行核心业务逻辑。
 * @param npc Pick<MainNavigationObservedEntity, 'id' | 'npcQuestMarker'> 参数说明。
 * @returns string | null。
 */


  function resolveNpcInteractionActionId(npc: Pick<MainNavigationObservedEntity, 'id' | 'npcQuestMarker'>): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * resolveNpcApproachTarget：执行核心业务逻辑。
 * @param npc MainNavigationObservedEntity 参数说明。
 * @returns { x: number; y: number } | null。
 */


  function resolveNpcApproachTarget(npc: MainNavigationObservedEntity): {  
  /**
 * x：对象字段。
 */
 x: number;  
 /**
 * y：对象字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (!player) {
      return null;
    }

    let bestCandidate: {    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number;    
 /**
 * pathLength：对象字段。
 */
 pathLength: number;    
 /**
 * distance：对象字段。
 */
 distance: number } | null = null;
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
  /**
 * getPathCells：按给定条件读取/查询数据。
 * @returns Array<{ x: number; y: number }>。
 */

    getPathCells(): Array<{    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number }> {
      return pathCells;
    },    
    /**
 * getPathTarget：按给定条件读取/查询数据。
 * @returns { x: number; y: number } | null。
 */


    getPathTarget(): {    
    /**
 * x：对象字段。
 */
 x: number;    
 /**
 * y：对象字段。
 */
 y: number } | null {
      return pathTarget;
    },    
    /**
 * hasActivePath：执行状态校验并返回判断结果。
 * @returns boolean。
 */


    hasActivePath(): boolean {
      return Boolean(pathTarget) || pathCells.length > 0;
    },    
    /**
 * syncPathCellsToRuntime：执行核心业务逻辑。
 * @returns void。
 */


    syncPathCellsToRuntime(): void {
      options.setRuntimePathCells(pathCells);
    },    
    /**
 * clearCurrentPath：执行核心业务逻辑。
 * @returns void。
 */


    clearCurrentPath(): void {
      pathCells = [];
      pathTarget = null;
      pendingAutoInteraction = null;
      options.setRuntimePathCells(pathCells);
    },    
    /**
 * trimCurrentPathProgress：执行核心业务逻辑。
 * @returns void。
 */


    trimCurrentPathProgress(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * sendMoveCommand：执行核心业务逻辑。
 * @param direction Direction 方向参数。
 * @returns void。
 */


    sendMoveCommand(direction: Direction): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * planPathTo：执行核心业务逻辑。
 * @param target { x: number; y: number } 目标对象。
 * @param config { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean } 参数说明。
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
      config?: {      
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * findObservedEntityAt：执行核心业务逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param kind string 参数说明。
 * @returns MainNavigationObservedEntity | null。
 */


    findObservedEntityAt(x: number, y: number, kind?: string): MainNavigationObservedEntity | null {
      return options.getLatestEntities().find((entry) => entry.wx === x && entry.wy === y && (kind ? entry.kind === kind : true)) ?? null;
    },    
    /**
 * triggerAutoInteractionIfReady：执行核心业务逻辑。
 * @returns boolean。
 */


    triggerAutoInteractionIfReady(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNpcClickTarget：处理事件并驱动执行路径。
 * @param npc MainNavigationObservedEntity 参数说明。
 * @returns boolean。
 */


    handleNpcClickTarget(npc: MainNavigationObservedEntity): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
