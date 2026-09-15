/**
 * map-instance.movement.ts
 *
 * 从 MapInstanceRuntime 抽出的移动域方法（模式 B 委托壳）。
 * 包含：applyMove、isWalkable、findSpawn、traversal、玩家连接/断开、
 * 传送门、tickOnce、移动速度设置等移动相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import {
  BUILDING_TOPOLOGY_BLOCKS_MOVE,
  Direction,
  MOVE_POINT_UNIT,
  getEffectiveMoveSpeed,
  getMaxStoredMovePoints,
  getMovePointsPerTick,
  horizontalFacingFromDelta,
  horizontalFacingFromTo,
  isTileTypeWalkable,
} from '@mud/shared';
import { INVALID_OCCUPANCY } from './map-instance.buildings';
import { hasAttachedPlayerSession } from './map-instance.runtime';
import {
  DIRECTION_OFFSET,
  shouldMarkTimePersistenceDirty,
} from './map-instance.runtime.helpers';

const PLAYER_ATTACH_BLOCKED_INSTANCE_STATES = new Set([
  'creating',
  'ownership_transition',
  'releasing',
  'destroying',
  'stopped',
  'fenced',
  'lease_degraded',
  'cleanup_pending',
  'destroyed',
]);

const MAP_TIME_PERSISTENCE_DOMAIN = 'time';

export { PLAYER_ATTACH_BLOCKED_INSTANCE_STATES, MAP_TIME_PERSISTENCE_DOMAIN };
export function connectPlayerImpl(instance: MapInstanceRuntime, request) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const runtimeStatus = typeof instance.meta?.runtimeStatus === 'string' ? instance.meta.runtimeStatus.trim() : '';
  const status = typeof instance.meta?.status === 'string' ? instance.meta.status.trim() : '';
  const blockedState = PLAYER_ATTACH_BLOCKED_INSTANCE_STATES.has(runtimeStatus)
   ? runtimeStatus
   : PLAYER_ATTACH_BLOCKED_INSTANCE_STATES.has(status) ? status : '';
  if (blockedState) {
   throw new Error(`实例 ${instance.meta.instanceId} 当前状态禁止玩家接入：${blockedState}`);
  }
  const assignedNodeId = typeof instance.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (assignedNodeId && leaseToken) {
   const leaseExpireAt = instance.meta?.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
   if (!Number.isFinite(leaseExpireAt) || leaseExpireAt <= Date.now()) {
    throw new Error(`实例 ${instance.meta.instanceId} 当前租约已过期，禁止玩家接入`);
   }
  }
  const destroyAt = instance.meta?.destroyAt ? new Date(instance.meta.destroyAt).getTime() : 0;
  if (Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now()) {
   throw new Error(`实例 ${instance.meta.instanceId} 已到计划销毁时间，禁止玩家接入`);
  }

  const existing = instance.playersById.get(request.playerId);
  if (existing) {
   const wasConnected = hasAttachedPlayerSession(existing.sessionId);
   const willBeConnected = hasAttachedPlayerSession(request.sessionId);
   existing.sessionId = request.sessionId;
   if (wasConnected !== willBeConnected) {
    instance.connectedPlayerSessionCount = Math.max(0, instance.connectedPlayerSessionCount + (willBeConnected ? 1 : -1));
   }
   const hasPreferredPosition = request.relocateExisting === true
    && Number.isFinite(request.preferredX)
    && Number.isFinite(request.preferredY);
   if (hasPreferredPosition) {
    instance.relocatePlayer(request.playerId, request.preferredX, request.preferredY);
   }
   instance.playerViewCacheByPlayerId.delete(request.playerId);
   instance.autoCombatViewCacheByPlayerId.delete(request.playerId);
   instance.autoCombatTileVisibilityCacheByPlayerId.delete(request.playerId);
   return existing;
  }

  const spawn = instance.findSpawnPoint(request.preferredX, request.preferredY, request.playerId);
  if (!spawn) {
   throw new Error(`实例 ${instance.meta.instanceId} 中没有可用出生点`);
  }

  const handle = instance.allocateHandle();

  const player = {
   handle,
   playerId: request.playerId,
   sessionId: request.sessionId,
   x: spawn.x,
   y: spawn.y,
   facing: Direction.East,
   joinedAtTick: instance.tick,
   lastResolvedTick: instance.tick,
   moveSpeed: 0,
   movePoints: 0,
   lastMoveBudgetTick: instance.tick,
   movementCapabilities: { staticObstacleIgnore: false },
   selfRevision: 1,
  };
  instance.playersById.set(player.playerId, player);
  if (hasAttachedPlayerSession(player.sessionId)) {
   instance.connectedPlayerSessionCount += 1;
  }
  instance.playersByHandle.set(player.handle, player);
  instance.addPlayerToTileIndex(player);
  instance.setOccupied(player.x, player.y, player.handle);
  // T-04: 玩家进入降频实例时执行 catch-up 补偿
  if (instance._throttledSinceMs != null) {
   instance.performThrottleCatchUp();
  }
  instance.markAoiViewChangedAt(player.x, player.y);
  instance.worldRevision += 1;
  return player;
}

export function disconnectPlayerImpl(instance: MapInstanceRuntime, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return false;
  }
  if (hasAttachedPlayerSession(player.sessionId)) {
   instance.connectedPlayerSessionCount = Math.max(0, instance.connectedPlayerSessionCount - 1);
  }
  instance.removePlayerFromTileIndex(player.playerId, player.x, player.y);
  instance.playersById.delete(playerId);
  instance.playersByHandle.delete(player.handle);
  instance.pendingCommands.delete(playerId);
  instance.playerViewCacheByPlayerId.delete(playerId);
  instance.autoCombatViewCacheByPlayerId.delete(playerId);
  instance.autoCombatTileVisibilityCacheByPlayerId.delete(playerId);
  // P0-4 entry cache 跟随 entity lifecycle 释放：玩家从实例移除时清理 view 条目，避免单实例 cache 累积曾路过玩家。
  instance.localPlayerViewCacheByPlayerId.delete(playerId);
  instance.setOccupied(player.x, player.y, INVALID_OCCUPANCY);
  instance.freeHandles.push(player.handle);
  instance.markAoiViewChangedAt(player.x, player.y);
  instance.worldRevision += 1;
  return true;
}

export function relocatePlayerImpl(instance: MapInstanceRuntime, playerId, preferredX, preferredY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return null;
  }

  const target = instance.findSpawnPoint(preferredX, preferredY, playerId);
  if (!target) {
   throw new Error(`实例 ${instance.meta.instanceId} 中没有可用空地块`);
  }
  if (player.x === target.x && player.y === target.y) {
   return {
    x: player.x,
    y: player.y,
   };
  }
  const previousX = player.x;
  const previousY = player.y;
  instance.setOccupied(previousX, previousY, INVALID_OCCUPANCY);
  instance.removePlayerFromTileIndex(player.playerId, previousX, previousY);
  player.x = target.x;
  player.y = target.y;
  player.selfRevision += 1;
  instance.addPlayerToTileIndex(player);
  instance.setOccupied(player.x, player.y, player.handle);
  instance.markAoiViewMoved(previousX, previousY, player.x, player.y);
  instance.worldRevision += 1;
  return {
   x: player.x,
   y: player.y,
  };
}

export function enqueueMoveImpl(instance: MapInstanceRuntime, command) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.playersById.has(command.playerId)) {
   return false;
  }
  instance.pendingCommands.set(command.playerId, {
   kind: 'move',
   direction: command.direction,

   continuous: command.continuous === true,
   maxSteps: Number.isFinite(command.maxSteps) ? Math.max(1, Math.trunc(command.maxSteps)) : undefined,
   path: Array.isArray(command.path)
    ? command.path
     .filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.y))
     .map((entry) => ({ x: Math.trunc(entry.x), y: Math.trunc(entry.y) }))
    : undefined,

   resetBudget: command.resetBudget === true,
  });
  return true;
}

export function addRuntimePortalImpl(instance: MapInstanceRuntime, portal) {
  if (!portal || !Number.isFinite(Number(portal.x)) || !Number.isFinite(Number(portal.y))) {
   return false;
  }
  const x = Math.trunc(Number(portal.x));
  const y = Math.trunc(Number(portal.y));
  if (!instance.isInBounds(x, y)) {
   return false;
  }
  const normalized = {
   id: typeof portal.id === 'string' && portal.id.trim() ? portal.id.trim() : `${portal.kind ?? 'portal'}:${x},${y}`,
   x,
   y,
   targetMapId: typeof portal.targetMapId === 'string' && portal.targetMapId.trim() ? portal.targetMapId.trim() : instance.template.id,
   targetInstanceId: typeof portal.targetInstanceId === 'string' && portal.targetInstanceId.trim() ? portal.targetInstanceId.trim() : null,
   targetX: Number.isFinite(Number(portal.targetX)) ? Math.trunc(Number(portal.targetX)) : instance.template.spawnX,
   targetY: Number.isFinite(Number(portal.targetY)) ? Math.trunc(Number(portal.targetY)) : instance.template.spawnY,
   targetPortalId: typeof portal.targetPortalId === 'string' && portal.targetPortalId.trim() ? portal.targetPortalId.trim() : undefined,
   direction: portal.direction === 'one_way' ? 'one_way' : 'two_way',
   kind: typeof portal.kind === 'string' && portal.kind.trim() ? portal.kind.trim() : 'portal',
   trigger: portal.trigger === 'auto' ? 'auto' : 'manual',
   hidden: portal.hidden === true,
   name: typeof portal.name === 'string' && portal.name.trim() ? portal.name.trim() : undefined,
   char: typeof portal.char === 'string' && portal.char.trim() ? portal.char.trim() : undefined,
   color: typeof portal.color === 'string' && portal.color.trim() ? portal.color.trim() : undefined,
   sectId: typeof portal.sectId === 'string' && portal.sectId.trim() ? portal.sectId.trim() : undefined,
  };
  const index = instance.runtimePortals.findIndex((entry) => entry.x === x && entry.y === y);
  if (index >= 0) {
   instance.runtimePortals[index] = normalized;
  }
  else {
   instance.runtimePortals.push(normalized);
   instance.runtimePortals.sort((left, right) => left.y - right.y || left.x - right.x);
  }
  instance.markAoiViewChangedAt(x, y);
  instance.worldRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['overlay']);
  instance.persistentRevision += 1;
  return true;
}

export function setPlayerMoveSpeedImpl(instance: MapInstanceRuntime, playerId, moveSpeed) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return false;
  }

  const normalized = Number.isFinite(moveSpeed) ? Math.max(0, Math.round(moveSpeed)) : 0;
  player.moveSpeed = normalized;
  return true;
}

export function setPlayerMovementCapabilitiesImpl(instance: MapInstanceRuntime, playerId, capabilities) {
  const player = instance.playersById.get(playerId);
  if (!player) {
   return false;
  }
  player.movementCapabilities = {
   staticObstacleIgnore: capabilities?.staticObstacleIgnore === true,
  };
  return true;
}

export function enqueuePortalUseImpl(instance: MapInstanceRuntime, command) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.playersById.has(command.playerId)) {
   return false;
  }
  instance.pendingCommands.set(command.playerId, { kind: 'portal' });
  return true;
}

export function cancelPendingCommandImpl(instance: MapInstanceRuntime, playerId) {
  return instance.pendingCommands.delete(playerId);
}

export function tryPortalTransferImpl(instance: MapInstanceRuntime, playerId, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return null;
  }

  const portal = reason === 'manual_portal'
   ? instance.getInteractablePortalNear(player.x, player.y)
   : instance.getPortalAt(player.x, player.y);
  if (!portal) {
   return null;
  }
  if (reason === 'manual_portal' && portal.trigger !== 'manual') {
   return null;
  }
  if (reason === 'auto_portal' && portal.trigger !== 'auto') {
   return null;
  }
  return instance.buildTransfer(player, portal, reason);
}

export function tickOnceImpl(instance: MapInstanceRuntime, precomputedMonsterIntents = null, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.tick += 1;
  if (instance.meta?.persistent === true && shouldMarkTimePersistenceDirty(instance.tick)) {
   instance.markPersistenceDirtyDomains([MAP_TIME_PERSISTENCE_DOMAIN]);
   instance.persistentRevision += 1;
  }

  const transfers = [];

  const monsterActions = [];
  for (const [playerId, command] of instance.pendingCommands) {
   const player = instance.playersById.get(playerId);
   if (!player) {
    continue;
   }
   if (command.kind === 'move') {
    if (command.resetBudget === true) {
     player.movePoints = 0;
     player.lastMoveBudgetTick = Math.max(0, instance.tick - 1);
    }
    instance.applyMove(player, command.direction, transfers, command.continuous === true, command.maxSteps, command.path);
   }
   else if (command.kind === 'portal') {

    const transfer = instance.tryPortalTransfer(playerId, 'manual_portal');
    if (transfer) {
     transfers.push(transfer);
    }
   }
   player.lastResolvedTick = instance.tick;
  }
  instance.pendingCommands.clear();
  const completedBuildings = instance.advanceBuildingConstruction();
  instance.advanceMonsters(monsterActions, precomputedMonsterIntents, {
   sleepActiveAi: options?.sleepMonsterAi === true,
  });
  const engagedMonsterEvents = instance.pendingEngagedMonsterEvents.length > 0
   ? instance.pendingEngagedMonsterEvents.splice(0, instance.pendingEngagedMonsterEvents.length)
   : [];
  return {
   completedBuildings,
   transfers,
   monsterActions,
   engagedMonsterEvents,
  };
}

export function applyMoveImpl(instance: MapInstanceRuntime, player, direction, transfers, continuous = false, maxSteps = undefined, path = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const offset = DIRECTION_OFFSET[direction];
  if (!offset) {
   return;
  }

  let movePoints = player.movePoints;

  let moved = false;
  let facingChanged = false;

  let remainingSteps = Number.isFinite(maxSteps) ? Math.max(1, Math.min(20, Math.trunc(maxSteps))) : 20;

  const remainingPath = Array.isArray(path) && path.length > 0 ? path : null;
  let rechargedMoveBudget = false;
  let requiredMovePoints = 0;
  if (!remainingPath && player.facing !== horizontalFacingFromDelta(offset.x, player.facing)) {
   player.facing = horizontalFacingFromDelta(offset.x, player.facing);
   player.selfRevision += 1;
   facingChanged = true;
  }
  while (true) {
   if (remainingSteps <= 0) {
    break;
   }

   let nextX;

   let nextY;

   let stepDirection = horizontalFacingFromDelta(offset.x, player.facing);
   if (remainingPath) {

    const nextStep = remainingPath[0];
    if (!nextStep) {
     break;
    }
    nextX = nextStep.x;
    nextY = nextStep.y;

    stepDirection = horizontalFacingFromTo(player.x, player.y, nextX, nextY, player.facing);
   }
   else {
    nextX = player.x + offset.x;
    nextY = player.y + offset.y;
   }

   if (Math.abs(nextX - player.x) + Math.abs(nextY - player.y) !== 1) {
    break;
   }
   if (!instance.isInBounds(nextX, nextY)) {
    break;
   }
   if (instance.isDynamicallyBlockedTile(nextX, nextY, player.playerId)) {
    break;
   }

   const nextTileIndex = instance.toTileIndex(nextX, nextY);
   const staticWalkable = instance.isCellIndexWalkable(nextTileIndex);
   const ignoresStaticObstacle = !staticWalkable && instance.canPlayerIgnoreStaticObstacle(player, instance.tick);
   if (!staticWalkable && !ignoresStaticObstacle) {
    break;
   }
   const stepCost = staticWalkable
    ? instance.getTileTraversalCost(nextX, nextY, player.playerId)
    : instance.getStaticObstacleTraversalCost(nextTileIndex);
   if (!rechargedMoveBudget) {
    requiredMovePoints = stepCost;
    movePoints = instance.rechargePlayerMoveBudget(player, stepCost);
    rechargedMoveBudget = true;
   }
   if (!Number.isFinite(stepCost) || stepCost <= 0 || movePoints < stepCost) {
    break;
   }
   if (instance.npcIdByTile.has(nextTileIndex) || instance.monsterRuntimeIdByTile.has(nextTileIndex)) {
    break;
   }

   const nextOccupancy = instance.occupancy[nextTileIndex];
   if (nextOccupancy !== INVALID_OCCUPANCY && !instance.isPlayerOverlapTile(nextX, nextY)) {
    break;
   }
   if (player.facing !== stepDirection) {
    player.facing = stepDirection;
    player.selfRevision += 1;
    facingChanged = true;
   }
   const previousX = player.x;
   const previousY = player.y;
   instance.setOccupied(previousX, previousY, INVALID_OCCUPANCY);
   instance.removePlayerFromTileIndex(player.playerId, previousX, previousY);
   player.x = nextX;
   player.y = nextY;
   movePoints -= stepCost;
   remainingSteps -= 1;
   moved = true;
   if (remainingPath) {
    remainingPath.shift();
   }
   instance.addPlayerToTileIndex(player);
   instance.setOccupied(player.x, player.y, player.handle);
   instance.markAoiViewMoved(previousX, previousY, player.x, player.y);
   instance.worldRevision += 1;

   const portal = instance.getPortalAt(player.x, player.y);
   if (portal?.trigger === 'auto') {
    transfers.push(instance.buildTransfer(player, portal, 'auto_portal'));
    break;
   }
   if (!continuous) {
    break;
   }
   if (remainingPath && remainingPath.length === 0) {
    break;
   }
  }
  if (moved) {
   player.selfRevision += 1;
  }
  else if (facingChanged) {
   instance.markAoiViewChangedAt(player.x, player.y);
   instance.worldRevision += 1;
  }
  player.movePoints = Math.min(getMaxStoredMovePoints(player.moveSpeed, requiredMovePoints), Math.max(0, Math.round(movePoints)));
}

export function getStaticObstacleTraversalCostImpl(instance: MapInstanceRuntime, tileIndex) {
  return MOVE_POINT_UNIT;
}

export function rechargePlayerMoveBudgetImpl(instance: MapInstanceRuntime, player, requiredMovePoints = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const elapsed = Math.max(0, instance.tick - (player.lastMoveBudgetTick ?? instance.tick));
  if (elapsed > 0) {
   player.movePoints = Math.min(getMaxStoredMovePoints(player.moveSpeed, requiredMovePoints), Math.max(0, Math.round(player.movePoints + elapsed * getMovePointsPerTick(player.moveSpeed))));
   player.lastMoveBudgetTick = instance.tick;
  }
  return player.movePoints;
}

export function findSpawnPointImpl(instance: MapInstanceRuntime, preferredX, preferredY, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const candidates = [];
  if (preferredX !== undefined && preferredY !== undefined) {
   candidates.push({
    x: instance.clampToRuntimeTileBounds(preferredX, 'x'),
    y: instance.clampToRuntimeTileBounds(preferredY, 'y'),
   });
  }
  candidates.push({
   x: instance.template.spawnX,
   y: instance.template.spawnY,
  });
  for (const candidate of candidates) {
   const resolved = instance.findNearestOpenTile(candidate.x, candidate.y, playerId);
   if (resolved) {
    return resolved;
   }
  }
  return null;
}

export function isWalkableImpl(instance: MapInstanceRuntime, x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return false;
  }
  if (instance.isDynamicallyBlockedTile(x, y, playerId)) {
   return false;
  }
  return instance.isCellIndexWalkable(instance.toTileIndex(x, y));
}

export function isCellIndexWalkableImpl(instance: MapInstanceRuntime, cellIndexInput) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
   return false;
  }
  if ((instance.buildingTopologyIndex?.topologyMaskByCell?.[cellIndex] ?? 0) & BUILDING_TOPOLOGY_BLOCKS_MOVE) {
   return false;
  }
  if (instance.temporaryTileByTile.has(cellIndex) || instance.tileDamageByTile.get(cellIndex)?.destroyed === true) {
   return isTileTypeWalkable(instance.getEffectiveTileTypeByCellIndex(cellIndex));
  }
  return typeof instance.tilePlane.isWalkable === 'function'
   ? instance.tilePlane.isWalkable(cellIndex)
   : isTileTypeWalkable(instance.getEffectiveTileTypeByCellIndex(cellIndex));
}

export function getPortalAtImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }

  const runtimePortal = instance.runtimePortals.find((portal) => portal.x === x && portal.y === y);
  if (runtimePortal) {
   return runtimePortal;
  }
  const portalIndex = instance.template.portalIndexByTile[instance.toTileIndex(x, y)];
  return portalIndex >= 0 ? instance.template.portals[portalIndex] ?? null : null;
}

export function listAllPortalsImpl(instance: MapInstanceRuntime) {
  return instance.template.portals.concat(instance.runtimePortals);
}

export function getInteractablePortalNearImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (let dy = -1; dy <= 1; dy += 1) {
   for (let dx = -1; dx <= 1; dx += 1) {
    const portal = instance.getPortalAt(x + dx, y + dy);
    if (portal) {
     return portal;
    }
   }
  }
  return null;
}

export function setOccupiedImpl(instance: MapInstanceRuntime, x, y, handle) {
  const tileIndex = instance.toTileIndex(x, y);
  if (tileIndex < 0) {
   return false;
  }
  instance.ensureCellStorageCapacity(tileIndex + 1);
  instance.occupancy[tileIndex] = handle;
  return true;
}

