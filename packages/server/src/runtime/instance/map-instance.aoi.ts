/**
 * map-instance.aoi.ts
 *
 * 从 MapInstanceRuntime 抽出的 AOI（Area of Interest）域方法（模式 B 委托壳）。
 * 包含：AOI chunk 索引、视野半径、FOV（castLight）、collect*、getLocal*ViewEntry、
 * buildPlayerView、buildAutoCombatView、sight blocking 等视野相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import { doesTileTypeBlockSight, isOffsetInRange } from '@mud/shared';
import {
  chebyshevDistance,
  compareGroundPiles,
  compareLocalContainers,
  compareLocalLandmarks,
  compareLocalMonsters,
  compareLocalNpcs,
  compareLocalSafeZones,
  freezeRuntimeProjection,
  isSameGroundPileView,
  setChunkRevision,
  snapshotSafeZone,
  toGroundPileView,
} from './map-instance.runtime.helpers';

const DEFAULT_VIEW_RADIUS = 10;
const PLAYER_SPATIAL_CHUNK_SIZE = 16;
const MONSTER_LOST_SIGHT_CHASE_TICKS = 3;

export { DEFAULT_VIEW_RADIUS, PLAYER_SPATIAL_CHUNK_SIZE, MONSTER_LOST_SIGHT_CHASE_TICKS };
export function getPlayerSpatialChunkKeyImpl(instance: MapInstanceRuntime, x, y) {
  const chunkX = Math.floor(Math.trunc(Number(x) || 0) / PLAYER_SPATIAL_CHUNK_SIZE);
  const chunkY = Math.floor(Math.trunc(Number(y) || 0) / PLAYER_SPATIAL_CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

export function markAoiViewChangedAtImpl(instance: MapInstanceRuntime, xInput, yInput, options = undefined) {
  if (!Number.isFinite(Number(xInput)) || !Number.isFinite(Number(yInput))) {
   return false;
  }
  const chunkX = Math.floor(Math.trunc(Number(xInput)) / PLAYER_SPATIAL_CHUNK_SIZE);
  const chunkY = Math.floor(Math.trunc(Number(yInput)) / PLAYER_SPATIAL_CHUNK_SIZE);
  const revision = instance.nextAoiRevision();
  setChunkRevision(instance.aoiRevisionByChunkRow, chunkX, chunkY, revision);
  if (options?.sightBlockingChanged === true) {
   setChunkRevision(instance.aoiSightRevisionByChunkRow, chunkX, chunkY, revision);
  }
  return true;
}

export function markAoiViewMovedImpl(instance: MapInstanceRuntime, fromX, fromY, toX, toY) {
  instance.markAoiViewChangedAt(fromX, fromY);
  instance.markAoiViewChangedAt(toX, toY);
}

export function markAoiViewChangedGloballyImpl(instance: MapInstanceRuntime, options = undefined) {
  const revision = instance.nextAoiRevision();
  instance.aoiGlobalRevision = revision;
  if (options?.sightBlockingChanged === true) {
   instance.sightBlockingRevision = Math.max(0, Math.trunc(Number(instance.sightBlockingRevision) || 0)) + 1;
  }
  return revision;
}

export function nextAoiRevisionImpl(instance: MapInstanceRuntime) {
  const current = Math.max(0, Math.trunc(Number(instance.aoiRevisionSequence) || 0));
  const next = current >= Number.MAX_SAFE_INTEGER - 1 ? 1 : current + 1;
  if (next === 1 && current > 0) {
   // 极端长运行溢出时清空 revision 与视野缓存，避免回绕后的低 revision 误命中旧快照。
   instance.aoiRevisionByChunkRow.clear();
   instance.aoiSightRevisionByChunkRow.clear();
   instance.aoiGlobalRevision = 0;
   instance.playerViewCacheByPlayerId.clear();
   instance.autoCombatViewCacheByPlayerId.clear();
   instance.autoCombatTileVisibilityCacheByPlayerId.clear();
  }
  instance.aoiRevisionSequence = next;
  return next;
}

export function resolveAoiViewRevisionImpl(instance: MapInstanceRuntime, centerX, centerY, radius, sightOnly = false) {
  const normalizedX = Math.trunc(Number(centerX) || 0);
  const normalizedY = Math.trunc(Number(centerY) || 0);
  const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
  const minChunkX = Math.floor((normalizedX - normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const maxChunkX = Math.floor((normalizedX + normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const minChunkY = Math.floor((normalizedY - normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const maxChunkY = Math.floor((normalizedY + normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const rows = sightOnly ? instance.aoiSightRevisionByChunkRow : instance.aoiRevisionByChunkRow;
  let revision = 0;
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
   const row = rows.get(chunkY);
   if (!row) {
    continue;
   }
   for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
    revision = Math.max(revision, row.get(chunkX) ?? 0);
   }
  }
  return revision;
}

export function addPlayerToChunkIndexImpl(instance: MapInstanceRuntime, player) {
  if (!player?.playerId || !instance.isInBounds(player.x, player.y)) {
   return;
  }
  const chunkKey = instance.getPlayerSpatialChunkKey(player.x, player.y);
  let playerIds = instance.playerIdsByChunk.get(chunkKey);
  if (!playerIds) {
   playerIds = new Set();
   instance.playerIdsByChunk.set(chunkKey, playerIds);
  }
  if (!playerIds.has(player.playerId)) {
   instance.playerChunkIndexedPlayerCount += 1;
   instance.playerSpatialIndexRevision += 1;
  }
  playerIds.add(player.playerId);
}

export function removePlayerFromChunkIndexImpl(instance: MapInstanceRuntime, playerId, x, y) {
  if (!playerId || !instance.isInBounds(x, y)) {
   return;
  }
  const chunkKey = instance.getPlayerSpatialChunkKey(x, y);
  const playerIds = instance.playerIdsByChunk.get(chunkKey);
  if (!playerIds) {
   return;
  }
  if (!playerIds.delete(playerId)) {
   return;
  }
  instance.playerChunkIndexedPlayerCount = Math.max(0, instance.playerChunkIndexedPlayerCount - 1);
  instance.playerSpatialIndexRevision += 1;
  if (playerIds.size === 0) {
   instance.playerIdsByChunk.delete(chunkKey);
  }
}

export function collectPlayersByChunkRangeImpl(instance: MapInstanceRuntime, centerX, centerY, radius) {
  if (instance.playersById.size === 0) {
   return [];
  }
  instance.ensurePlayerSpatialIndexesConsistent();
  if (instance.playerChunkIndexedPlayerCount !== instance.playersById.size) {
   return Array.from(instance.playersById.values());
  }
  const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
  const minChunkX = Math.floor((Math.trunc(Number(centerX) || 0) - normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const maxChunkX = Math.floor((Math.trunc(Number(centerX) || 0) + normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const minChunkY = Math.floor((Math.trunc(Number(centerY) || 0) - normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const maxChunkY = Math.floor((Math.trunc(Number(centerY) || 0) + normalizedRadius) / PLAYER_SPATIAL_CHUNK_SIZE);
  const players = [];
  const seenPlayerIds = new Set();
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
   for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
    const playerIds = instance.playerIdsByChunk.get(`${chunkX},${chunkY}`);
    if (!playerIds) {
     continue;
    }
    for (const playerId of playerIds) {
     if (seenPlayerIds.has(playerId)) {
      continue;
     }
     const player = instance.playersById.get(playerId);
     if (!player) {
      continue;
     }
     seenPlayerIds.add(playerId);
     players.push(player);
    }
   }
  }
  return players;
}

export function buildPlayerViewImpl(instance: MapInstanceRuntime, playerId, radius = DEFAULT_VIEW_RADIUS) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return null;
  }
  const cached = instance.playerViewCacheByPlayerId.get(playerId);
  const normalizedRadius = Math.max(1, Math.trunc(Number(radius) || DEFAULT_VIEW_RADIUS));
  const aoiLocalRevision = instance.resolveAoiViewRevision(player.x, player.y, normalizedRadius);
  if (cached
   && cached.aoiGlobalRevision === instance.aoiGlobalRevision
   && cached.aoiLocalRevision === aoiLocalRevision
   && cached.selfRevision === player.selfRevision
   && cached.x === player.x
   && cached.y === player.y
   && cached.radius === normalizedRadius) {
   // P0-8：cache hit 路径直接复用 cached.view 引用，仅就地刷新 tick/session/worldRevision/selfRevision 四个 ephemeral 字段；
   // 其余子结构（self/instance/localXxx/visibleTileXxx/visiblePlayers）保持稳定 ref，避免每帧 200 个外层 view spread。
   const view = cached.view;
   view.sessionId = player.sessionId;
   view.tick = instance.tick;
   view.worldRevision = instance.worldRevision;
   view.selfRevision = player.selfRevision;
   return view;
  }

  const visibleTileVisibility = instance.collectVisibleTileVisibility(player.x, player.y, normalizedRadius);
  const visibleTileIndices = visibleTileVisibility.indices;

  const visiblePlayers = instance.collectVisiblePlayers(player, normalizedRadius, visibleTileVisibility);

  const localMonsters = instance.collectLocalMonsters(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localNpcs = instance.collectLocalNpcs(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localPortals = instance.collectLocalPortals(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localLandmarks = instance.collectLocalLandmarks(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localSafeZones = instance.collectLocalSafeZones(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localContainers = instance.collectLocalContainers(player.x, player.y, normalizedRadius, visibleTileVisibility);

  const localGroundPiles = instance.collectLocalGroundPiles(player.x, player.y, normalizedRadius, visibleTileVisibility);
  const localBuildings = instance.collectLocalBuildings(player.x, player.y, normalizedRadius, visibleTileVisibility);
  const view = {
   playerId: player.playerId,
   sessionId: player.sessionId,
   tick: instance.tick,
   worldRevision: instance.worldRevision,
   selfRevision: player.selfRevision,
   aoiGlobalRevision: instance.aoiGlobalRevision,
   aoiLocalRevision,
   instance: {
    instanceId: instance.meta.instanceId,
    templateId: instance.meta.templateId,
    name: instance.template.name,
    kind: instance.meta.kind,
    width: instance.template.width,
    height: instance.template.height,
   },
   self: {
    name: player.name,
    displayName: player.displayName,
    partyId: player.partyId,
    x: player.x,
    y: player.y,
    facing: player.facing,
    buffs: player.buffs,
    fengShuiLuck: instance.getFengShuiLuckAt(player.x, player.y),
   },
   visibleTileIndices: Array.from(visibleTileIndices),
   visibleTileKeys: Array.from(visibleTileVisibility.keys),
   visiblePlayers,
   localMonsters,
   localNpcs,
   localPortals,
   localLandmarks,
   localSafeZones,
   localContainers,
   localGroundPiles,
   localBuildings,
  };
  instance.playerViewCacheByPlayerId.set(playerId, {
   aoiGlobalRevision: instance.aoiGlobalRevision,
   aoiLocalRevision,
   selfRevision: player.selfRevision,
   x: player.x,
   y: player.y,
   radius: normalizedRadius,
   view,
  });
  return view;
}

export function buildAutoCombatViewImpl(instance: MapInstanceRuntime, playerId, radius = DEFAULT_VIEW_RADIUS) {
  // 自动战斗只需要可见玩家和妖兽，不构造完整客户端视野包。
  const player = instance.playersById.get(playerId);
  if (!player) {
   return null;
  }
  const normalizedRadius = Math.max(1, Math.trunc(Number(radius) || DEFAULT_VIEW_RADIUS));
  const cached = instance.autoCombatViewCacheByPlayerId.get(playerId);
  const aoiLocalRevision = instance.resolveAoiViewRevision(player.x, player.y, normalizedRadius);
  if (cached
   && cached.aoiGlobalRevision === instance.aoiGlobalRevision
   && cached.aoiLocalRevision === aoiLocalRevision
   && cached.selfRevision === player.selfRevision
   && cached.x === player.x
   && cached.y === player.y
   && cached.radius === normalizedRadius) {
   return cached.view;
  }

  const supportsPvp = instance.meta?.supportsPvp === true;
  const visibleTileVisibility = supportsPvp
   ? instance.collectVisibleTileVisibility(player.x, player.y, normalizedRadius)
   : instance.collectCachedAutoCombatTileVisibility(playerId, player.x, player.y, normalizedRadius);
  const view = {
   visiblePlayers: supportsPvp ? instance.collectVisiblePlayers(player, normalizedRadius, visibleTileVisibility) : [],
   localMonsters: instance.collectAutoCombatMonsters(player.x, player.y, normalizedRadius, visibleTileVisibility),
  };
  instance.autoCombatViewCacheByPlayerId.set(playerId, {
   aoiGlobalRevision: instance.aoiGlobalRevision,
   aoiLocalRevision,
   selfRevision: player.selfRevision,
   x: player.x,
   y: player.y,
   radius: normalizedRadius,
   view,
  });
  return view;
}

export function collectCachedAutoCombatTileVisibilityImpl(instance: MapInstanceRuntime, playerId, originX, originY, radius) {
  const normalizedX = Math.trunc(Number(originX) || 0);
  const normalizedY = Math.trunc(Number(originY) || 0);
  const normalizedRadius = Math.max(1, Math.trunc(Number(radius) || DEFAULT_VIEW_RADIUS));
  if (normalizedX - normalizedRadius < 0
   || normalizedY - normalizedRadius < 0
   || normalizedX + normalizedRadius >= instance.template.width
   || normalizedY + normalizedRadius >= instance.template.height) {
   return instance.collectVisibleTileVisibility(normalizedX, normalizedY, normalizedRadius, { includeKeys: false });
  }
  const sightRevision = instance.resolveAoiViewRevision(normalizedX, normalizedY, normalizedRadius, true);
  const cached = instance.autoCombatTileVisibilityCacheByPlayerId.get(playerId);
  if (cached
   && cached.aoiGlobalRevision === instance.aoiGlobalRevision
   && cached.sightRevision === sightRevision
   && cached.x === normalizedX
   && cached.y === normalizedY
   && cached.radius === normalizedRadius) {
   return cached.visibility;
  }
  const visibility = instance.collectVisibleTileVisibility(normalizedX, normalizedY, normalizedRadius, { includeKeys: false });
  instance.autoCombatTileVisibilityCacheByPlayerId.set(playerId, {
   aoiGlobalRevision: instance.aoiGlobalRevision,
   sightRevision,
   x: normalizedX,
   y: normalizedY,
   radius: normalizedRadius,
   visibility,
  });
  return visibility;
}

export function forEachPathingBlockerImpl(instance: MapInstanceRuntime, excludePlayerId, visitor) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof instance.dynamicTileBlocker?.forEachBlockedTile === 'function') {
   instance.dynamicTileBlocker.forEachBlockedTile(excludePlayerId, visitor);
  }
  for (const npc of instance.npcsById.values()) {
   /** visitor：visitor。 */
   visitor(npc.x, npc.y);
  }
  for (const player of instance.playersById.values()) {
   if (player.playerId === excludePlayerId) {
    continue;
   }
   /** visitor：visitor。 */
   visitor(player.x, player.y);
  }
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (!monster.alive) {
    continue;
   }
   /** visitor：visitor。 */
   visitor(monster.x, monster.y);
  }
}

export function isTileVisibleByFilterImpl(instance: MapInstanceRuntime, x, y, visibility) {
  if (!visibility?.keys && !visibility?.indices) {
   return true;
  }
  if (visibility.keys?.has(`${x},${y}`)) {
   return true;
  }
  const tileIndex = instance.toTileIndex(x, y);
  return tileIndex >= 0 && visibility.indices?.has(tileIndex) === true;
}

export function isTileInsideViewRadiusImpl(instance: MapInstanceRuntime, centerX, centerY, radius, x, y) {
  return chebyshevDistance(centerX, centerY, x, y) <= Math.max(0, Math.trunc(Number(radius) || 0));
}

export function collectVisiblePlayersImpl(instance: MapInstanceRuntime, observer, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const candidates = visibility.indices instanceof Set
   ? instance.collectPlayersByTileIndices(visibility.indices)
   : instance.collectPlayersByChunkRange(observer.x, observer.y, radius);
  const visiblePlayers = [];
  for (const player of candidates) {
   if (player.playerId === observer.playerId) {
    continue;
   }
   if (!instance.isTileInsideViewRadius(observer.x, observer.y, radius, player.x, player.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(player.x, player.y, visibility)) {
    continue;
   }
   visiblePlayers.push(instance.getLocalPlayerViewEntry(player));
  }
  return visiblePlayers;
}

export function collectLocalPortalsImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const portals = [];
  for (const portal of instance.listAllPortals()) {
   if (portal.hidden
    || !instance.isTileInsideViewRadius(centerX, centerY, radius, portal.x, portal.y)
    || !instance.isTileVisibleByFilter(portal.x, portal.y, visibility)) {
    continue;
   }
   portals.push(instance.getLocalPortalViewEntry(portal));
  }
  return portals;
}

export function collectLocalGroundPilesImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const piles = [];
  for (const pile of instance.groundPilesByTile.values()) {
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, pile.x, pile.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(pile.x, pile.y, visibility)) {
    continue;
   }

   const view = instance.getLocalGroundPileViewEntry(pile);
   if (view) {
    piles.push(view);
   }
  }
  piles.sort(compareGroundPiles);
  return piles;
}

export function collectLocalContainersImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const containers = [];
  for (const container of instance.containersById.values()) {
   if (container.plantedExpiresAtTick <= instance.tick) continue;
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, container.x, container.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(container.x, container.y, visibility)) {
    continue;
   }
   containers.push(instance.getLocalContainerViewEntry(container));
  }
  containers.sort(compareLocalContainers);
  return containers;
}

export function collectLocalLandmarksImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const landmarks = [];
  for (const landmark of instance.landmarksById.values()) {
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, landmark.x, landmark.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(landmark.x, landmark.y, visibility)) {
    continue;
   }
   landmarks.push(instance.getLocalLandmarkViewEntry(landmark));
  }
  landmarks.sort(compareLocalLandmarks);
  return landmarks;
}

export function collectLocalSafeZonesImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const safeZones = [];
  for (const zone of instance.template.safeZones) {
   if (!instance.isCircleInsideViewRadius(centerX, centerY, radius, zone.x, zone.y, zone.radius)) {
    continue;
   }
   if (!instance.isAnyTileVisibleInCircle(zone.x, zone.y, zone.radius, visibility)) {
    continue;
   }
   safeZones.push(instance.getLocalSafeZoneViewEntry(zone));
  }
  safeZones.sort(compareLocalSafeZones);
  return safeZones;
}

export function collectLocalNpcsImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const npcs = [];
  for (const npc of instance.npcsById.values()) {
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, npc.x, npc.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(npc.x, npc.y, visibility)) {
    continue;
   }
   npcs.push(instance.getLocalNpcViewEntry(npc));
  }
  npcs.sort(compareLocalNpcs);
  return npcs;
}

export function getLocalPlayerViewEntryImpl(instance: MapInstanceRuntime, player) {
  const cached = instance.localPlayerViewCacheByPlayerId.get(player.playerId);
  if (cached
   && cached.name === player.name
   && cached.displayName === player.displayName
   && cached.partyId === player.partyId
   && cached.x === player.x
   && cached.y === player.y
   && cached.facing === player.facing
   && cached.buffs === player.buffs) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   playerId: player.playerId,
   name: player.name,
   displayName: player.displayName,
   partyId: player.partyId,
   x: player.x,
   y: player.y,
   facing: player.facing,
   buffs: player.buffs,
  });
  instance.localPlayerViewCacheByPlayerId.set(player.playerId, entry);
  return entry;
}

export function getLocalPortalViewEntryImpl(instance: MapInstanceRuntime, portal) {
  const cacheKey = portal.id ?? `${portal.kind}:${portal.x},${portal.y}:${portal.targetMapId ?? ''}:${portal.targetPortalId ?? ''}`;
  const cached = instance.localPortalViewCacheById.get(cacheKey);
  if (cached
   && cached.x === portal.x
   && cached.y === portal.y
   && cached.id === portal.id
   && cached.kind === portal.kind
   && cached.trigger === portal.trigger
   && cached.direction === (portal.direction ?? 'two_way')
   && cached.targetMapId === portal.targetMapId
   && cached.targetInstanceId === (portal.targetInstanceId ?? null)
   && cached.targetPortalId === portal.targetPortalId
   && cached.targetX === portal.targetX
   && cached.targetY === portal.targetY
   && cached.name === portal.name
   && cached.char === portal.char
   && cached.color === portal.color
   && cached.sectId === portal.sectId) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   x: portal.x,
   y: portal.y,
   id: portal.id,
   kind: portal.kind,
   trigger: portal.trigger,
   direction: portal.direction ?? 'two_way',
   targetMapId: portal.targetMapId,
   targetInstanceId: portal.targetInstanceId ?? null,
   targetPortalId: portal.targetPortalId,
   targetX: portal.targetX,
   targetY: portal.targetY,
   name: portal.name,
   char: portal.char,
   color: portal.color,
   sectId: portal.sectId,
  });
  instance.localPortalViewCacheById.set(cacheKey, entry);
  return entry;
}

export function getLocalGroundPileViewEntryImpl(instance: MapInstanceRuntime, pile) {
  const view = toGroundPileView(pile);
  if (!view) {
   return null;
  }
  const cached = instance.localGroundPileViewCacheBySourceId.get(view.sourceId);
  if (cached && isSameGroundPileView(cached, view)) {
   return cached;
  }
  freezeRuntimeProjection(view.items);
  const entry = freezeRuntimeProjection(view);
  instance.localGroundPileViewCacheBySourceId.set(view.sourceId, entry);
  return entry;
}

export function getLocalContainerViewEntryImpl(instance: MapInstanceRuntime, container) {
  const cached = instance.localContainerViewCacheById.get(container.id);
  const char = container.char ?? '箱';
  const color = container.color ?? '#c18b46';
  if (cached
   && cached.name === container.name
   && cached.x === container.x
   && cached.y === container.y
   && cached.char === char
   && cached.color === color
   && cached.grade === container.grade) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   id: container.id,
   name: container.name,
   x: container.x,
   y: container.y,
   char,
   color,
   grade: container.grade,
  });
  instance.localContainerViewCacheById.set(container.id, entry);
  return entry;
}

export function getLocalLandmarkViewEntryImpl(instance: MapInstanceRuntime, landmark) {
  const cached = instance.localLandmarkViewCacheById.get(landmark.id);
  const hasContainer = landmark.container !== undefined;
  if (cached
   && cached.name === landmark.name
   && cached.x === landmark.x
   && cached.y === landmark.y
   && cached.hasContainer === hasContainer) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   id: landmark.id,
   name: landmark.name,
   x: landmark.x,
   y: landmark.y,
   hasContainer,
  });
  instance.localLandmarkViewCacheById.set(landmark.id, entry);
  return entry;
}

export function getLocalSafeZoneViewEntryImpl(instance: MapInstanceRuntime, zone) {
  const cacheKey = `${zone.x},${zone.y},${zone.radius}`;
  const cached = instance.localSafeZoneViewCacheByKey.get(cacheKey);
  if (cached) {
   return cached;
  }
  const entry = freezeRuntimeProjection(snapshotSafeZone(zone));
  instance.localSafeZoneViewCacheByKey.set(cacheKey, entry);
  return entry;
}

export function getLocalNpcViewEntryImpl(instance: MapInstanceRuntime, npc) {
  const cached = instance.localNpcViewCacheById.get(npc.npcId);
  if (cached
   && cached.name === npc.name
   && cached.char === npc.char
   && cached.color === npc.color
   && cached.x === npc.x
   && cached.y === npc.y
   && cached.hasShop === npc.hasShop) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   npcId: npc.npcId,
   name: npc.name,
   char: npc.char,
   color: npc.color,
   x: npc.x,
   y: npc.y,
   hasShop: npc.hasShop,
  });
  instance.localNpcViewCacheById.set(npc.npcId, entry);
  return entry;
}

export function collectLocalMonstersImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const monsters = [];
  if (visibility.indices instanceof Set) {
   for (const tileIndex of visibility.indices) {
    const runtimeId = instance.monsterRuntimeIdByTile.get(tileIndex);
    if (!runtimeId) {
     continue;
    }
    const monster = instance.monstersByRuntimeId.get(runtimeId);
    if (!monster?.alive) {
     if (monster?.runtimeId) {
      instance.localMonsterViewCacheByRuntimeId.delete(monster.runtimeId);
     }
     continue;
    }
    if (!instance.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
     continue;
    }
    monsters.push(instance.getLocalMonsterViewEntry(monster));
   }
   monsters.sort(compareLocalMonsters);
   return monsters;
  }
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (!monster.alive) {
    instance.localMonsterViewCacheByRuntimeId.delete(monster.runtimeId);
    continue;
   }
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(monster.x, monster.y, visibility)) {
    continue;
   }
   monsters.push(instance.getLocalMonsterViewEntry(monster));
  }
  monsters.sort(compareLocalMonsters);
  return monsters;
}

export function getLocalMonsterViewEntryImpl(instance: MapInstanceRuntime, monster) {
  const cached = instance.localMonsterViewCacheByRuntimeId.get(monster.runtimeId);
  if (cached
   && cached.monsterId === monster.monsterId
   && cached.name === monster.name
   && cached.char === monster.char
   && cached.color === monster.color
   && cached.tier === monster.tier
   && cached.x === monster.x
   && cached.y === monster.y
   && cached.facing === monster.facing
   && cached.hp === monster.hp
   && cached.maxHp === monster.maxHp
   && cached.qi === monster.qi
   && cached.maxQi === monster.maxQi
   && cached.buffs === monster.buffs) {
   return cached;
  }
  const entry = {
   runtimeId: monster.runtimeId,
   monsterId: monster.monsterId,
   name: monster.name,
   char: monster.char,
   color: monster.color,
   tier: monster.tier,
   x: monster.x,
   y: monster.y,
   facing: monster.facing,
   hp: monster.hp,
   maxHp: monster.maxHp,
   qi: monster.qi,
   maxQi: monster.maxQi,
   buffs: monster.buffs,
  };
  freezeRuntimeProjection(entry);
  instance.localMonsterViewCacheByRuntimeId.set(monster.runtimeId, entry);
  return entry;
}

export function isDynamicallyBlockedTileImpl(instance: MapInstanceRuntime, x, y, playerId = null) {
  if (typeof instance.dynamicTileBlocker !== 'function') {
   return false;
  }
  try {
   return instance.dynamicTileBlocker(Math.trunc(x), Math.trunc(y), {
    playerId: typeof playerId === 'string' && playerId.trim() ? playerId.trim() : null,
   }) === true;
  }
  catch (_error) {
   console.warn(`[地图实例] isDynamicallyBlockedTile 异常 x=${x} y=${y}`, _error instanceof Error ? _error.message : _error);
   return false;
  }
}

export function setCompositeSightResolverImpl(instance: MapInstanceRuntime, resolver) {
  instance.compositeSightResolver = typeof resolver === 'function' ? resolver : null;
}

export function resolveCompositeSightBlockedImpl(instance: MapInstanceRuntime, x, y) {
  if (typeof instance.compositeSightResolver !== 'function') {
   return null;
  }
  try {
   const result = instance.compositeSightResolver(Math.trunc(x), Math.trunc(y));
   return typeof result === 'boolean' ? result : null;
  }
  catch (_error) {
   console.warn(`[地图实例] resolveCompositeSightBlocked 异常 x=${x} y=${y}`, _error instanceof Error ? _error.message : _error);
   return null;
  }
}

export function canResolveSightCoordinateImpl(instance: MapInstanceRuntime, x, y) {
  return instance.isInBounds(x, y) || instance.isSectVirtualBoundaryTile(x, y) || instance.resolveCompositeSightBlocked(x, y) !== null;
}

export function isTileSightBlockedImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return true;
   }
   const compositeBlocked = instance.resolveCompositeSightBlocked(x, y);
   return compositeBlocked === null ? true : compositeBlocked;
  }
  const tileIndex = instance.toTileIndex(x, y);
  if (instance.temporaryTileByTile.has(tileIndex) || instance.tileDamageByTile.get(tileIndex)?.destroyed === true) {
   return doesTileTypeBlockSight(instance.getEffectiveTileTypeByCellIndex(tileIndex));
  }
  return typeof instance.tilePlane.blocksSight === 'function'
   ? instance.tilePlane.blocksSight(tileIndex)
   : doesTileTypeBlockSight(instance.getEffectiveTileTypeByCellIndex(tileIndex));
}

export function canSeeTileFromImpl(instance: MapInstanceRuntime, originX, originY, targetX, targetY, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(originX, originY) || (!instance.isInBounds(targetX, targetY) && !instance.isSectVirtualBoundaryTile(targetX, targetY))) {
   return false;
  }
  const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
  if (chebyshevDistance(originX, originY, targetX, targetY) > normalizedRadius) {
   return false;
  }
  const visibility = instance.collectVisibleTileVisibility(originX, originY, normalizedRadius);
  return visibility.keys.has(`${Math.trunc(Number(targetX))},${Math.trunc(Number(targetY))}`);
}

export function collectVisibleTileIndicesImpl(instance: MapInstanceRuntime, originX, originY, radius) {
  return instance.collectVisibleTileVisibility(originX, originY, radius).indices;
}

export function collectVisibleTileVisibilityImpl(instance: MapInstanceRuntime, originX, originY, radius, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibleTileIndices = new Set();
  const includeKeys = options?.includeKeys !== false;
  const visibleTileKeys = includeKeys ? new Set() : null;
  if (!instance.isInBounds(originX, originY)) {
   return { indices: visibleTileIndices, keys: visibleTileKeys };
  }
  visibleTileIndices.add(instance.toTileIndex(originX, originY));
  visibleTileKeys?.add(`${originX},${originY}`);

  const octants = [
   [1, 0, 0, 1],
   [0, 1, 1, 0],
   [0, -1, 1, 0],
   [-1, 0, 0, 1],
   [-1, 0, 0, -1],
   [0, -1, -1, 0],
   [0, 1, -1, 0],
   [1, 0, 0, -1],
  ];
  for (const [xx, xy, yx, yy] of octants) {
   instance.castLight(originX, originY, 1, 1, 0, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys);
  }
  return { indices: visibleTileIndices, keys: visibleTileKeys };
}

export function castLightImpl(instance: MapInstanceRuntime, originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (startSlope < endSlope) {
   return;
  }

  let nextStartSlope = startSlope;
  for (let distance = row; distance <= radius; distance += 1) {
   let blocked = false;
   for (let deltaX = -distance, deltaY = -distance; deltaX <= 0; deltaX += 1) {
    const currentX = originX + deltaX * xx + deltaY * xy;
    const currentY = originY + deltaX * yx + deltaY * yy;

    const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);

    const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);
    if (startSlope < rightSlope) {
     continue;
    }
    if (endSlope > leftSlope) {
     break;
    }
    if (isOffsetInRange(deltaX, deltaY, radius) && instance.canResolveSightCoordinate(currentX, currentY)) {
     if (instance.isInBounds(currentX, currentY)) {
      visibleTileIndices.add(instance.toTileIndex(currentX, currentY));
     }
     if (visibleTileKeys) {
      visibleTileKeys.add(`${currentX},${currentY}`);
     }
    }

    const blocksSight = instance.isTileSightBlocked(currentX, currentY);
    if (blocked) {
     if (blocksSight) {
      nextStartSlope = rightSlope;
      continue;
     }
     blocked = false;
     startSlope = nextStartSlope;
     continue;
    }
    if (blocksSight && distance < radius) {
     blocked = true;
     instance.castLight(originX, originY, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys);
     nextStartSlope = rightSlope;
    }
   }
   if (blocked) {
    break;
   }
  }
}

export function isCircleInsideViewRadiusImpl(instance: MapInstanceRuntime, viewCenterX, viewCenterY, viewRadius, centerX, centerY, radius) {
  return chebyshevDistance(viewCenterX, viewCenterY, centerX, centerY)
   <= Math.max(0, Math.trunc(Number(viewRadius) || 0)) + Math.max(0, Math.trunc(Number(radius) || 0));
}

export function isAnyTileVisibleInCircleImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const minX = centerX - radius;
  const maxX = centerX + radius;
  const minY = centerY - radius;
  const maxY = centerY + radius;
  for (let y = minY; y <= maxY; y += 1) {
   for (let x = minX; x <= maxX; x += 1) {
    if (!isOffsetInRange(x - centerX, y - centerY, radius)) {
     continue;
    }
    if (instance.isTileVisibleByFilter(x, y, visibility)) {
     return true;
    }
   }
  }
  return false;
}

export function rememberMonsterTargetSightImpl(instance: MapInstanceRuntime, monster, target) {
  monster.aggroTargetPlayerId = target.playerId;
  monster.lastSeenTargetX = target.x;
  monster.lastSeenTargetY = target.y;
  monster.lastSeenTargetTick = instance.tick;
}

export function resolveMonsterLostSightChaseTargetImpl(instance: MapInstanceRuntime, monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const targetPlayerId = monster.aggroTargetPlayerId;
  const lastSeenTick = monster.lastSeenTargetTick;
  const lastSeenX = monster.lastSeenTargetX;
  const lastSeenY = monster.lastSeenTargetY;
  if (typeof targetPlayerId !== 'string'
   || !Number.isInteger(lastSeenTick)
   || !Number.isInteger(lastSeenX)
   || !Number.isInteger(lastSeenY)) {
   return null;
  }
  if (instance.tick > Number(lastSeenTick) + MONSTER_LOST_SIGHT_CHASE_TICKS) {
   return null;
  }
  const target = instance.playersById.get(targetPlayerId);
  if (!target || chebyshevDistance(monster.spawnX, monster.spawnY, target.x, target.y) > monster.leashRange) {
   return null;
  }
  const normalizedLastSeenX = Math.trunc(Number(lastSeenX));
  const normalizedLastSeenY = Math.trunc(Number(lastSeenY));
  if (chebyshevDistance(monster.x, monster.y, normalizedLastSeenX, normalizedLastSeenY) <= 1) {
   return null;
  }
  return { x: normalizedLastSeenX, y: normalizedLastSeenY };
}

