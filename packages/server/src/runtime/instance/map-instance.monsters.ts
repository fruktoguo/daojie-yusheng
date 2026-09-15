/**
 * map-instance.monsters.ts
 *
 * 从 MapInstanceRuntime 抽出的怪物域方法（模式 B 委托壳）。
 * 包含：怪物注册/移除、威胁表、AI（advanceMonsters、resolveMonsterTarget、
 * stepMonsterIdleRoam）、刷新（respawn、spawn acceleration）、战斗（applyDamage、
 * defeat、buff）、怪物视野辅助等怪物相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import {
  DEFAULT_AGGRO_THRESHOLD,
  DEFAULT_PASSIVE_THREAT_PER_TICK,
  Direction,
  LOST_TARGET_THREAT_DECAY_RATIO,
  LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO,
  MAX_THREAT_VALUE,
  THREAT_DISTANCE_FALLOFF_PER_TILE,
  horizontalFacingFromDelta,
  horizontalFacingFromTo,
  isOffsetInRange,
  normalizeHorizontalFacing,
} from '@mud/shared';
import {
  CombatPendingCastCancelReason,
  cancelPendingCombatCast,
  createMonsterPendingCombatCast,
  createMonsterSkillActionFromPendingCast,
  createMonsterSkillCancelActionFromPendingCast,
  resolvePendingCombatCastCancellation,
} from '../combat/pending-combat-cast.helpers';
import { createRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from '../player/runtime-buff-instance';
import { INVALID_OCCUPANCY } from './map-instance.buildings';
import {
  resolveTickScaledChantDurationMs,
  calculateRuntimeThreatDelta,
  compareRuntimeThreatEntry,
} from './map-instance.runtime';
import {
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
  applyMonsterInitialBuffs,
  areAllMonstersAlive,
  areAllMonstersDefeated,
  buildEffectiveMonsterSkillGeometry,
  buildMonsterAttackDamage,
  buildMonsterSkillAffectedCells,
  buildMonsterSpawnKey,
  chebyshevDistance,
  chooseMonsterSkill,
  chooseMonsterStep,
  commitMonsterSkillCast,
  doesTemporaryBuffAffectAttributes,
  getMonsterSkillWarningColor,
  getMonsterSkillWindupTicks,
  isOrdinaryMonster,
  isRuntimeBuffActive,
  isSameTemporaryBuffAttributePayload,
  isSameTemporaryBuffPrototypePayload,
  recalculateMonsterDerivedState,
  recoverMonsterHp,
  recoverMonsterQi,
  resolveMonsterRespawnTicksWithBonus,
  resolveMonsterSkillAnchor,
  snapshotMonster,
  snapshotNpc,
  tickTemporaryBuffs,
} from './map-instance.runtime.helpers';

const FIVE_PHASE_YUKONG_BUFF_ID = 'buff.dungeon_fallen_palace_yukong';

export { FIVE_PHASE_YUKONG_BUFF_ID };
export function engageMonsterImpl(instance: MapInstanceRuntime, monster: { runtimeId: string; monsterId: string; x: number; y: number; engaged?: boolean; combatOpeningTicks?: number; speechTicksLeft?: number }, triggerPlayerId?: string): void {
  if (!monster || monster.engaged) {
   return;
  }
  monster.engaged = true;
  const openingTicks = Number.isFinite(Number(monster.combatOpeningTicks))
   ? Math.max(0, Math.trunc(Number(monster.combatOpeningTicks)))
   : 0;
  if (openingTicks > 0) {
   monster.speechTicksLeft = openingTicks;
  }
  instance.pendingEngagedMonsterEvents.push({
   runtimeId: monster.runtimeId,
   monsterId: monster.monsterId,
   x: monster.x,
   y: monster.y,
   triggerPlayerId,
  });
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  instance.worldRevision += 1;
}

export function setMonsterSpeechTicksImpl(instance: MapInstanceRuntime, runtimeId: string, ticks: number): void {
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster) {
   return;
  }
  monster.speechTicksLeft = Math.max(0, Math.trunc(Number(ticks) || 0));
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
}

export function resolveMonsterCombatAggroRangeImpl(instance: MapInstanceRuntime, monster: { aggroRange?: unknown; engaged?: boolean }): number {
  const baseAggroRange = Math.max(0, Math.trunc(Number(monster.aggroRange) || 0));
  if (!instance.isDungeonInstance()) {
   return baseAggroRange;
  }
  if (monster.engaged === true) {
   return Math.max(baseAggroRange, instance.resolveDungeonCombatVisionRange());
  }
  return 0;
}

export function resolveMonsterMaxAttackReachImpl(instance: MapInstanceRuntime, monster: { attackRange?: unknown; skills?: unknown; numericStats?: unknown }): number {
  let maxReach = Math.max(0, Math.trunc(Number(monster.attackRange) || 0));
  const skills = Array.isArray(monster.skills) ? monster.skills : [];
  for (const skill of skills) {
   const range = Math.max(0, Math.trunc(Number(buildEffectiveMonsterSkillGeometry(monster, skill).range) || 0));
   if (range > maxReach) {
    maxReach = range;
   }
  }
  return maxReach;
}

export function resolveMonsterAimPositionImpl(instance: MapInstanceRuntime, monster, liveTarget: { playerId?: string; x: number; y: number } | null): { playerId?: string; x: number; y: number } | null {
  if (liveTarget && Number.isFinite(Number(liveTarget.x)) && Number.isFinite(Number(liveTarget.y))) {
   return {
    playerId: typeof liveTarget.playerId === 'string' ? liveTarget.playerId : undefined,
    x: Math.trunc(Number(liveTarget.x)),
    y: Math.trunc(Number(liveTarget.y)),
   };
  }
  if (typeof monster.aggroTargetPlayerId === 'string') {
   const locked = instance.playersById.get(monster.aggroTargetPlayerId);
   if (locked) {
    return { playerId: locked.playerId, x: Math.trunc(locked.x), y: Math.trunc(locked.y) };
   }
  }
  if (Number.isInteger(monster.lastSeenTargetX) && Number.isInteger(monster.lastSeenTargetY)) {
   return {
    playerId: typeof monster.aggroTargetPlayerId === 'string' ? monster.aggroTargetPlayerId : undefined,
    x: Math.trunc(Number(monster.lastSeenTargetX)),
    y: Math.trunc(Number(monster.lastSeenTargetY)),
   };
  }
  return null;
}

export function canMonsterStepTowardImpl(instance: MapInstanceRuntime, monster: { x: number; y: number; facing?: unknown; buffs?: unknown }, targetX: number, targetY: number): boolean {
  const next = chooseMonsterStep(monster.x, monster.y, targetX, targetY);
  for (const candidate of next) {
   if (instance.isMonsterOpenTile(monster, candidate.x, candidate.y)) {
    return true;
   }
  }
  return false;
}

export function canMonsterActOnTargetImpl(instance: MapInstanceRuntime, monster, target: { playerId?: string; x: number; y: number }): boolean {
  const distance = chebyshevDistance(monster.x, monster.y, target.x, target.y);
  if (chooseMonsterSkill(monster, target, distance, instance.tick)) {
   return true;
  }
  const targetPlayerId = typeof target.playerId === 'string' ? target.playerId : '';
  return distance <= Math.max(0, Math.trunc(Number(monster.attackRange) || 0))
   && Math.trunc(Number(monster.attackReadyTick) || 0) <= instance.tick
   && targetPlayerId.length > 0
   && instance.playersById.has(targetPlayerId);
}

export function listMonstersImpl(instance: MapInstanceRuntime) {
  return Array.from(instance.monstersByRuntimeId.values(), (monster) => snapshotMonster(monster))
   .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN'));
}

export function listMonsterAiWorkerMirrorsImpl(instance: MapInstanceRuntime) {
  const monsters = [];
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (monster.alive === false) {
    continue;
   }
   monsters.push({
    monsterId: String(monster.runtimeId ?? monster.monsterId ?? ''),
    x: Math.trunc(Number(monster.x) || 0),
    y: Math.trunc(Number(monster.y) || 0),
    hp: Math.trunc(Number(monster.hp) || 0),
    maxHp: Math.trunc(Number(monster.maxHp) || 0),
    alive: true,
    aggroTargetId: typeof monster.aggroTargetPlayerId === 'string' ? monster.aggroTargetPlayerId : null,
    aggroRange: instance.resolveMonsterCombatAggroRange(monster),
    leashRange: instance.isDungeonInstance() && monster.engaged === true
     ? instance.resolveDungeonCombatVisionRange()
     : Math.max(0, Math.trunc(Number(monster.leashRange) || 0)),
    spawnX: Math.trunc(Number(monster.spawnX) || 0),
    spawnY: Math.trunc(Number(monster.spawnY) || 0),
   });
  }
  return monsters;
}

export function getMonsterAtTileImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return null;
  }
  const runtimeId = instance.monsterRuntimeIdByTile.get(instance.toTileIndex(x, y));
  if (!runtimeId) {
   return null;
  }
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  return monster?.alive ? snapshotMonster(monster) : null;
}

export function getMonsterRuntimeRefAtTileImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return null;
  }
  const runtimeId = instance.monsterRuntimeIdByTile.get(instance.toTileIndex(x, y));
  if (!runtimeId) {
   return null;
  }
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  return monster?.alive ? monster : null;
}

export function addRuntimeMonsterImpl(instance: MapInstanceRuntime, monster) {
  if (!monster || typeof monster.runtimeId !== 'string' || !monster.runtimeId.trim()) {
   return null;
  }
  const runtimeId = monster.runtimeId.trim();
  if (instance.monstersByRuntimeId.has(runtimeId)) {
   return instance.getMonster(runtimeId);
  }
  const x = Number.isFinite(Number(monster.x)) ? Math.trunc(Number(monster.x)) : 0;
  const y = Number.isFinite(Number(monster.y)) ? Math.trunc(Number(monster.y)) : 0;
  const spawnX = Number.isFinite(Number(monster.spawnOriginX)) ? Math.trunc(Number(monster.spawnOriginX)) : x;
  const spawnY = Number.isFinite(Number(monster.spawnOriginY)) ? Math.trunc(Number(monster.spawnOriginY)) : y;
  const spawnKey = typeof monster.spawnKey === 'string' && monster.spawnKey.trim()
   ? monster.spawnKey.trim()
   : buildMonsterSpawnKey(monster.monsterId, spawnX, spawnY);
  const state = {
   runtimeId,
   monsterId: monster.monsterId,
   spawnKey,
   spawnX,
   spawnY,
   x,
   y,
   hp: monster.alive === false ? 0 : Math.max(1, Math.min(monster.hp, monster.maxHp)),
   maxHp: monster.maxHp,
   qi: monster.alive === false ? 0 : Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
   maxQi: Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
   alive: monster.alive === false ? false : true,
   respawnLeft: monster.alive === false ? Math.max(0, Math.trunc(Number(monster.respawnLeft) || 0)) : 0,
   respawnTicks: Math.max(1, Math.trunc(Number(monster.respawnTicks) || 1)),
   facing: monster.facing,
   name: monster.name,
   char: monster.char,
   color: monster.color,
   level: monster.level,
   tier: monster.tier,
   expMultiplier: monster.expMultiplier,
   baseAttrs: monster.baseAttrs,
   attrs: monster.baseAttrs,
   baseNumericStats: monster.baseNumericStats,
   numericStats: monster.baseNumericStats,
   ratioDivisors: monster.ratioDivisors,
   statFormula: monster.statFormula,
   initialBuffs: Array.isArray(monster.initialBuffs) ? monster.initialBuffs : [],
   buffs: [],
   skills: monster.skills,
   cooldownReadyTickBySkillId: {},
   damageContributors: {},
   aggroTargetPlayerId: null,
   lastSeenTargetX: undefined,
   lastSeenTargetY: undefined,
   lastSeenTargetTick: undefined,
   aggroRange: monster.aggroRange,
   leashRange: monster.leashRange,
   wanderRadius: Number.isFinite(Number(monster.wanderRadius)) ? Math.max(0, Math.trunc(Number(monster.wanderRadius))) : 0,
   attackRange: monster.attackRange,
   attackCooldownTicks: monster.attackCooldownTicks,
   attackReadyTick: 0,
   engaged: !instance.isDungeonInstance(),
   combatOpeningTicks: Number.isFinite(Number((monster as { combatOpeningTicks?: unknown })?.combatOpeningTicks))
    ? Math.max(0, Math.trunc(Number((monster as { combatOpeningTicks?: unknown }).combatOpeningTicks)))
    : 0,
   speechTicksLeft: 0,
   ...(Array.isArray(monster.dungeonDropTable) ? { dungeonDropTable: monster.dungeonDropTable } : {}),
   ...(Number.isFinite(Number(monster.dungeonDropRateMultiplier)) ? { dungeonDropRateMultiplier: Number(monster.dungeonDropRateMultiplier) } : {}),
   ...(Number.isFinite(Number(monster.dungeonCurrencyCountMultiplier)) ? { dungeonCurrencyCountMultiplier: Number(monster.dungeonCurrencyCountMultiplier) } : {}),
  };
  if (state.alive) {
   applyMonsterInitialBuffs(state, instance.buffRegistry);
   recalculateMonsterDerivedState(state);
  }
  instance.monstersByRuntimeId.set(runtimeId, state);
  instance.monsterSpawnKeyByRuntimeId.set(runtimeId, spawnKey);
  const group = instance.monsterSpawnGroupsByKey.get(spawnKey);
  if (group) {
   group.push(state);
  }
  else {
   instance.monsterSpawnGroupsByKey.set(spawnKey, [state]);
  }
  if (state.alive) {
   instance.monsterRuntimeIdByTile.set(instance.toTileIndex(state.x, state.y), runtimeId);
  }
  instance.markAoiViewChangedAt(state.x, state.y);
  instance.worldRevision += 1;
  // 副本 Boss、波次妖兽等都是运行时动态加入的；如果不在加入时标脏，
  // 实例刷盘链永远看不到这条记录，进程重启后只能恢复出空壳实例。
  if (instance.meta.persistent === true) {
   instance.markMonsterRuntimePersistenceDirty(runtimeId);
  }
  return snapshotMonster(state);
}

export function removeRuntimeMonsterImpl(instance: MapInstanceRuntime, runtimeIdInput) {
  const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
  if (!runtimeId) {
   return false;
  }
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster) {
   return false;
  }
  instance.markAoiViewChangedAt(monster.x, monster.y);
  instance.monsterRuntimeIdByTile.delete(instance.toTileIndex(monster.x, monster.y));
  instance.monstersByRuntimeId.delete(runtimeId);
  instance.monsterThreatByRuntimeId.delete(runtimeId);
  instance.monsterSpawnKeyByRuntimeId.delete(runtimeId);
  instance.localMonsterViewCacheByRuntimeId.delete(runtimeId);
  // 删除也必须留下行级删除标记，否则数据库中的旧 Boss/波次记录会在下次恢复时复活。
  instance.dirtyMonsterRuntimeIds?.delete?.(runtimeId);
  const group = instance.monsterSpawnGroupsByKey.get(monster.spawnKey);
  if (group) {
   const nextGroup = group.filter((entry) => entry.runtimeId !== runtimeId);
   if (nextGroup.length > 0) {
    instance.monsterSpawnGroupsByKey.set(monster.spawnKey, nextGroup);
   }
   else {
    instance.monsterSpawnGroupsByKey.delete(monster.spawnKey);
    instance.monsterSpawnAccelerationStatesByKey.delete(monster.spawnKey);
   }
  }
  instance.worldRevision += 1;
  if (instance.meta.persistent === true) {
   instance.markMonsterRuntimePersistenceDirty(runtimeId);
  }
  return true;
}

export function getMonsterImpl(instance: MapInstanceRuntime, runtimeId) {

  const monster = instance.monstersByRuntimeId.get(runtimeId);
  return monster ? snapshotMonster(monster) : null;
}

export function getMonsterRuntimeRefImpl(instance: MapInstanceRuntime, runtimeId) {
  return instance.monstersByRuntimeId.get(runtimeId) ?? null;
}

export function getNpcImpl(instance: MapInstanceRuntime, npcId) {

  const npc = instance.npcsById.get(npcId);
  return npc ? snapshotNpc(npc) : null;
}

export function getMonsterDamageContributionEntriesImpl(instance: MapInstanceRuntime, runtimeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster) {
   return [];
  }
  return Object.entries(monster.damageContributors).map(([playerId, damage]) => ({
   playerId,
   damage,
  }));
}

export function getMonsterThreatTableImpl(instance: MapInstanceRuntime, runtimeId) {
  let table = instance.monsterThreatByRuntimeId.get(runtimeId);
  if (!table) {
   table = new Map();
   instance.monsterThreatByRuntimeId.set(runtimeId, table);
  }
  return table;
}

export function addMonsterThreatImpl(instance: MapInstanceRuntime, runtimeId, targetPlayerId, baseThreat, distance, extraAggroRate = 0) {
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster || !monster.alive || !instance.playersById.has(targetPlayerId)) {
   return 0;
  }
  const delta = calculateRuntimeThreatDelta(baseThreat, distance, extraAggroRate);
  if (delta <= 0) {
   return instance.monsterThreatByRuntimeId.get(runtimeId)?.get(targetPlayerId)?.value ?? 0;
  }
  const table = instance.getMonsterThreatTable(runtimeId);
  const existing = table.get(targetPlayerId);
  const nextValue = Math.min(MAX_THREAT_VALUE, (existing?.value ?? 0) + delta);
  table.set(targetPlayerId, {
   targetId: targetPlayerId,
   value: nextValue,
   lastUpdatedAt: instance.tick,
  });
  return nextValue;
}

export function decayMonsterThreatsImpl(instance: MapInstanceRuntime, monster, activePlayerIds) {
  const table = instance.monsterThreatByRuntimeId.get(monster.runtimeId);
  if (!table) {
   return;
  }
  const flatDecay = Math.max(0, Number(monster.maxHp) || 0) * LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO;
  for (const [playerId, entry] of table) {
   if (activePlayerIds.has(playerId)) {
    continue;
   }
   const next = entry.value - (entry.value * LOST_TARGET_THREAT_DECAY_RATIO + flatDecay);
   if (!Number.isFinite(next) || next <= 0) {
    table.delete(playerId);
    continue;
   }
   entry.value = next;
   entry.lastUpdatedAt = instance.tick;
  }
  if (table.size === 0) {
   instance.monsterThreatByRuntimeId.delete(monster.runtimeId);
  }
}

export function getHighestMonsterThreatTargetImpl(instance: MapInstanceRuntime, monster, canTarget) {
  const table = instance.monsterThreatByRuntimeId.get(monster.runtimeId);
  if (!table) {
   return null;
  }
  let best = null;
  for (const entry of table.values()) {
   if (entry.value < DEFAULT_AGGRO_THRESHOLD || !canTarget(entry.targetId)) {
    continue;
   }
   if (!best || compareRuntimeThreatEntry(entry, best) < 0) {
    best = entry;
   }
  }
  return best;
}

export function getAdjacentNpcImpl(instance: MapInstanceRuntime, playerId, npcId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = instance.playersById.get(playerId);
  if (!player) {
   return null;
  }

  const npc = instance.npcsById.get(npcId);
  if (!npc || chebyshevDistance(player.x, player.y, npc.x, npc.y) > 1) {
   return null;
  }
  return snapshotNpc(npc);
}

export function applyDamageToMonsterImpl(instance: MapInstanceRuntime, runtimeId, amount, attackerPlayerId, damageElement = undefined, damageKind = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster || !monster.alive) {
   return null;
  }
  if (instance.isDungeonInstance() && !monster.engaged) {
   instance.engageMonster(monster, attackerPlayerId);
  }
  const appliedDamage = Math.max(0, Math.min(monster.hp, Math.trunc(amount)));
  if (appliedDamage <= 0) {
   return {
    monster: snapshotMonster(monster),
    appliedDamage: 0,
    defeated: false,
   };
  }
  if (attackerPlayerId && instance.playersById.has(attackerPlayerId)) {
   monster.damageContributors[attackerPlayerId] = (monster.damageContributors[attackerPlayerId] ?? 0) + appliedDamage;
   const attacker = instance.playersById.get(attackerPlayerId);
   instance.addMonsterThreat(monster.runtimeId, attackerPlayerId, appliedDamage, attacker ? chebyshevDistance(monster.x, monster.y, attacker.x, attacker.y) : 1, Number(attacker?.attrs?.numericStats?.extraAggroRate ?? 0) || 0);
   const bestThreatTarget = instance.getHighestMonsterThreatTarget(monster, (playerId) => {
    const player = instance.playersById.get(playerId);
    return !!player;
   });
   if (bestThreatTarget) {
    monster.aggroTargetPlayerId = bestThreatTarget.targetId;
   }
  }
  monster.hp = Math.max(0, monster.hp - appliedDamage);
  instance.damageReactionRegistry.dispatch({
   phase: 'afterDamage',
   targetKind: 'monster',
   target: monster,
   damage: Math.max(0, Math.trunc(amount)),
   appliedDamage,
   damageElement,
   damageKind,
   currentTick: instance.tick,
   attackerId: attackerPlayerId,
  });
  const defeated = monster.hp <= 0;
  if (defeated) {
   instance.markMonsterDefeated(monster);
  }
  else {
   instance.markAoiViewChangedAt(monster.x, monster.y);
   instance.worldRevision += 1;
  }
  return {
   monster: snapshotMonster(monster),
   appliedDamage,
   defeated,
  };
}

export function applyTemporaryBuffToMonsterImpl(instance: MapInstanceRuntime, runtimeId, buff, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster || !monster.alive) {
   return null;
  }

  const existing = monster.buffs.find((entry) => entry.buffId === buff.buffId);
  let attrRelevantChanged = false;
  if (existing) {
   const previousStacks = existing.stacks;
   const previousRealmLv = existing.realmLv;
   const previousActive = isRuntimeBuffActive(existing);
   const affectsAttributes = doesTemporaryBuffAffectAttributes(existing) || doesTemporaryBuffAffectAttributes(buff);
   const sameAttributePayload = isSameTemporaryBuffAttributePayload(existing, buff);
   const samePrototypePayload = isSameTemporaryBuffPrototypePayload(existing, buff);
   existing.remainingTicks = Math.max(existing.remainingTicks, buff.remainingTicks);
   existing.duration = Math.max(existing.duration, buff.duration);
   existing.stacks = Math.min(existing.maxStacks, Math.max(existing.stacks, buff.stacks));
   existing.infiniteDuration = buff.infiniteDuration === true;
   existing.sustainTicksElapsed = buff.sustainCost ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0)) : undefined;
   existing.persistOnDeath = buff.persistOnDeath === true;
   existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
   if (!samePrototypePayload) {
    refreshRuntimeTemporaryBuffPrototype(existing, buff);
   }
   attrRelevantChanged = affectsAttributes
    && (previousActive !== isRuntimeBuffActive(existing)
     || previousStacks !== existing.stacks
     || previousRealmLv !== existing.realmLv
     || !sameAttributePayload);
  }
  else {
   monster.buffs.push(createRuntimeTemporaryBuff(buff));
   attrRelevantChanged = doesTemporaryBuffAffectAttributes(buff);
   monster.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
  }
  if (attrRelevantChanged) {
   recalculateMonsterDerivedState(monster);
  }
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  instance.worldRevision += 1;
  return options?.skipSnapshot === true ? monster : snapshotMonster(monster);
}

export function replaceTemporaryBuffOnMonsterImpl(instance: MapInstanceRuntime, runtimeId, buff, options = undefined) {
  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster || !monster.alive) {
   return null;
  }
  const existingIndex = monster.buffs.findIndex((entry) => entry.buffId === buff.buffId);
  const existing = existingIndex >= 0 ? monster.buffs[existingIndex] : null;
  const activeBefore = existing ? isRuntimeBuffActive(existing) : false;
  const stacksBefore = existing?.stacks ?? 0;
  const samePayload = existing ? isSameTemporaryBuffPrototypePayload(existing, buff) : false;
  if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
   if (existingIndex >= 0) monster.buffs.splice(existingIndex, 1);
  }
  else if (existing) {
   refreshRuntimeTemporaryBuffPrototype(existing, buff);
   existing.remainingTicks = Math.max(0, Math.trunc(Number(buff.remainingTicks) || 0));
   existing.duration = Math.max(0, Math.trunc(Number(buff.duration) || existing.remainingTicks));
   existing.stacks = Math.max(0, Math.min(existing.maxStacks, Math.trunc(Number(buff.stacks) || 0)));
   existing.infiniteDuration = buff.infiniteDuration === true;
  }
  else {
   monster.buffs.push(createRuntimeTemporaryBuff(buff));
   monster.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
  }
  const next = monster.buffs.find((entry) => entry.buffId === buff.buffId);
  const activeAfter = next ? isRuntimeBuffActive(next) : false;
  if (!samePayload || activeBefore !== activeAfter || stacksBefore !== (next?.stacks ?? 0)) {
   recalculateMonsterDerivedState(monster);
  }
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  instance.worldRevision += 1;
  return options?.skipSnapshot === true ? monster : snapshotMonster(monster);
}

export function defeatMonsterImpl(instance: MapInstanceRuntime, runtimeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const monster = instance.monstersByRuntimeId.get(runtimeId);
  if (!monster || !monster.alive) {
   return null;
  }
  instance.markMonsterDefeated(monster);
  return snapshotMonster(monster);
}

export function clearMonsterRuntimeTileIndexImpl(instance: MapInstanceRuntime, runtimeId) {
  if (typeof runtimeId !== 'string' || !runtimeId.trim()) {
   return;
  }
  for (const [tileIndex, indexedRuntimeId] of instance.monsterRuntimeIdByTile.entries()) {
   if (indexedRuntimeId === runtimeId) {
    instance.monsterRuntimeIdByTile.delete(tileIndex);
   }
  }
}

export function collectAutoCombatMonstersImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
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
     continue;
    }
    if (!instance.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
     continue;
    }
    monsters.push(monster);
   }
   return monsters;
  }
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (!monster.alive) {
    continue;
   }
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(monster.x, monster.y, visibility)) {
    continue;
   }
   monsters.push(monster);
  }
  return monsters;
}

export function advanceMonstersImpl(instance: MapInstanceRuntime, monsterActions, precomputedIntents = null, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const sleepActiveAi = options?.sleepActiveAi === true;
  // Phase 4: 构建 worker 预计算 intent 索引，用于加速 target 解析
  const intentByMonsterId = !sleepActiveAi && precomputedIntents
   ? new Map(precomputedIntents.map((intent) => [intent.monsterId, intent]))
   : null;

  let changed = false;
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (!monster.alive) {
    if (monster.pendingCast) {
     const cancelledPendingCast = cancelPendingCombatCast(monster.pendingCast, {
      reason: CombatPendingCastCancelReason.ActorDead,
      cancelledTick: instance.tick,
     });
     monsterActions.push(createMonsterSkillCancelActionFromPendingCast(cancelledPendingCast, {
      instanceId: instance.meta.instanceId,
      runtimeId: monster.runtimeId,
     }));
     monster.pendingCast = undefined;
    }
    if (monster.respawnLeft <= 0) {
     continue;
    }
    monster.respawnLeft = Math.max(0, monster.respawnLeft - 1);
    if (monster.respawnLeft === 0) {
     instance.respawnMonster(monster);
     changed = true;
    }
    continue;
   }

   const buffChanged = tickTemporaryBuffs(monster.buffs);
   if (buffChanged) {
    recalculateMonsterDerivedState(monster);
    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
    changed = true;
   }
   const hpRecovered = recoverMonsterHp(monster);
   const qiRecovered = recoverMonsterQi(monster);
   if (hpRecovered || qiRecovered) {
    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
    changed = true;
   }

   if (monster.pendingCast) {
    const pendingSkill = monster.skills.find((entry) => entry.id === (monster.pendingCast.actionId ?? monster.pendingCast.skillId));
    const cancelledPendingCast = resolvePendingCombatCastCancellation(monster.pendingCast, {
     actorAlive: monster.alive,
     currentTick: instance.tick,
     configRevision: pendingSkill?.version ?? pendingSkill?.revision,
    });
    if (cancelledPendingCast) {
     monsterActions.push(createMonsterSkillCancelActionFromPendingCast(cancelledPendingCast, {
      instanceId: instance.meta.instanceId,
      runtimeId: monster.runtimeId,
     }));
     monster.pendingCast = undefined;
     continue;
    }
    if (sleepActiveAi) {
     const sleepCancelledPendingCast = cancelPendingCombatCast(monster.pendingCast, {
      reason: CombatPendingCastCancelReason.TargetInvalid,
      cancelledTick: instance.tick,
     });
     monsterActions.push(createMonsterSkillCancelActionFromPendingCast(sleepCancelledPendingCast, {
      instanceId: instance.meta.instanceId,
      runtimeId: monster.runtimeId,
     }));
     monster.pendingCast = undefined;
     instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
     changed = true;
     continue;
    }
    monster.pendingCast.remainingTicks = Math.max(0, Math.trunc(Number(monster.pendingCast.remainingTicks) || 0) - 1);
    if (monster.pendingCast.remainingTicks > 0) {
     continue;
    }
    const pendingCast = monster.pendingCast;
    monster.pendingCast = undefined;
    const pendingTarget = instance.playersById.get(pendingCast.targetPlayerId);
    monsterActions.push(createMonsterSkillActionFromPendingCast(pendingCast, {
     instanceId: instance.meta.instanceId,
     runtimeId: monster.runtimeId,
     targetPlayerId: pendingTarget?.playerId ?? pendingCast.targetPlayerId,
    }));
    continue;
   }

   if (sleepActiveAi) {
    if (instance.clearMonsterActiveAiStateForSleep(monster)) {
     changed = true;
    }
    continue;
   }

   // Phase 4: 使用 worker 预计算 intent 作为 target hint 加速解析
   const preIntent = intentByMonsterId?.get(String(monster.runtimeId ?? monster.monsterId ?? ''));
   const liveTarget = instance.resolveMonsterTargetWithHint(monster, preIntent);
   const aim = instance.resolveMonsterAimPosition(monster, liveTarget);
   let target = liveTarget;
   if (target && !instance.canMonsterActOnTarget(monster, target) && !instance.canMonsterStepToward(monster, target.x, target.y)) {
    const lineTarget = instance.resolveLineAttackTarget(monster, aim ?? target);
    if (lineTarget) {
     target = lineTarget;
    }
   } else if (!target && aim) {
    const lineTarget = instance.resolveLineAttackTarget(monster, aim);
    if (lineTarget) {
     target = lineTarget;
    }
   }

   const face = target ?? aim;
   if (face) {
    const targetFacing = horizontalFacingFromTo(monster.x, monster.y, face.x, face.y, monster.facing);
    if (monster.facing !== targetFacing) {
     monster.facing = targetFacing;
     instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
     changed = true;
    }
   }

   if (monster.speechTicksLeft && monster.speechTicksLeft > 0) {
    monster.speechTicksLeft -= 1;
    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
    changed = true;
    continue;
   }

   if (!target) {
    const lostSightTarget = instance.resolveMonsterLostSightChaseTarget(monster);
    if (lostSightTarget) {
     changed = instance.tryMoveMonsterToward(monster, lostSightTarget.x, lostSightTarget.y) || changed;
     continue;
    }
    instance.clearMonsterTargetPursuit(monster);
    if (!instance.isMonsterWithinWanderRange(monster, monster.x, monster.y)) {
     changed = instance.tryMoveMonsterToward(monster, monster.spawnX, monster.spawnY) || changed;
    }
    else if (monster.wanderRadius > 0 && Math.random() < 0.35) {
     changed = instance.stepMonsterIdleRoam(monster) || changed;
    }
    continue;
   }

   const distance = chebyshevDistance(monster.x, monster.y, target.x, target.y);

   const skill = chooseMonsterSkill(monster, target, distance, instance.tick);
   if (skill) {
    const committedSkillCast = commitMonsterSkillCast(monster, skill, instance.tick);
    if (!committedSkillCast.ok) {
     continue;
    }
    instance.disperseQiAt(monster.x, monster.y, committedSkillCast.qiCost);
    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
    changed = true;
    const skillAnchor = resolveMonsterSkillAnchor(monster, skill, target);
    const warningCells = buildMonsterSkillAffectedCells(monster, skill, skillAnchor);
    const windupTicks = getMonsterSkillWindupTicks(skill);
    if (windupTicks > 0) {
     if (warningCells.length > 0) {
      const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
      const warningOrigin = (geometry.shape ?? 'single') === 'line'
       ? { x: monster.x, y: monster.y }
       : skillAnchor;
      monster.pendingCast = createMonsterPendingCombatCast({
       runtimeId: monster.runtimeId,
       instanceId: instance.meta.instanceId,
       skillId: skill.id,
       targetPlayerId: target.playerId,
       anchor: skillAnchor,
       warningCells,
       warningOrigin,
       remainingTicks: windupTicks,
       warningColor: getMonsterSkillWarningColor(skill),
       startedTick: instance.tick,
       resolveTick: instance.tick + windupTicks,
       committedCooldownSnapshot: {
        actionId: skill.id,
        readyTick: committedSkillCast.cooldownReadyTick,
       },
       committedResourceSnapshot: {
        kind: 'qi',
        spent: committedSkillCast.qiCost,
       },
       configRevision: (skill as any).version ?? (skill as any).revision,
      });
      monsterActions.push({
       instanceId: instance.meta.instanceId,
       runtimeId: monster.runtimeId,
       targetPlayerId: target.playerId,
       kind: 'skill_chant',
       skillId: skill.id,
       warningCells,
       warningColor: monster.pendingCast.warningColor,
       warningOriginX: warningOrigin.x,
       warningOriginY: warningOrigin.y,
       windupTicks,
       durationMs: resolveTickScaledChantDurationMs(windupTicks, instance.tickSpeed),
      });
      continue;
     }
    }
    const instantSkillAction: any = {
     instanceId: instance.meta.instanceId,
     runtimeId: monster.runtimeId,
     targetPlayerId: target.playerId,
     kind: 'skill',
     skillId: skill.id,
     targetX: skillAnchor.x,
     targetY: skillAnchor.y,
     warningCells,
    };
    monsterActions.push(instantSkillAction);
    continue;
   }
   if (distance <= monster.attackRange && monster.attackReadyTick <= instance.tick) {
    const targetPlayerId = typeof target.playerId === 'string' ? target.playerId : '';
    if (targetPlayerId && instance.playersById.has(targetPlayerId)) {
     const damage = buildMonsterAttackDamage(monster);
     if (damage > 0) {
      monster.attackReadyTick = instance.tick + monster.attackCooldownTicks;
      monsterActions.push({
       instanceId: instance.meta.instanceId,
       runtimeId: monster.runtimeId,
       targetPlayerId,
       kind: 'basic',
       damage,
      });
     }
    }
    continue;
   }
   changed = instance.tryMoveMonsterToward(monster, target.x, target.y) || changed;
  }
  if (changed) {
   instance.worldRevision += 1;
  }
}

export function initializeMonsterSpawnAccelerationStatesImpl(instance: MapInstanceRuntime) {
  instance.monsterSpawnAccelerationStatesByKey.clear();
  for (const [spawnKey, group] of instance.monsterSpawnGroupsByKey.entries()) {
   const sample = group[0];
   if (!sample || !isOrdinaryMonster(sample)) {
    continue;
   }
   instance.monsterSpawnAccelerationStatesByKey.set(spawnKey, {
    spawnKey,
    respawnSpeedBonusPercent: 0,
    clearDeadlineTick: areAllMonstersAlive(group)
     ? instance.tick + resolveMonsterRespawnTicksWithBonus(sample.respawnTicks, 0)
     : 0,
   });
  }
}

export function getMonsterSpawnGroupImpl(instance: MapInstanceRuntime, monster) {
  return instance.monsterSpawnGroupsByKey.get(monster.spawnKey) ?? [monster];
}

export function getMonsterSpawnAccelerationStateImpl(instance: MapInstanceRuntime, monster) {
  if (!isOrdinaryMonster(monster)) {
   return undefined;
  }
  let state = instance.monsterSpawnAccelerationStatesByKey.get(monster.spawnKey);
  if (!state) {
   const group = instance.getMonsterSpawnGroup(monster);
   state = {
    spawnKey: monster.spawnKey,
    respawnSpeedBonusPercent: 0,
    clearDeadlineTick: areAllMonstersAlive(group)
     ? instance.tick + resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, 0)
     : 0,
   };
   instance.monsterSpawnAccelerationStatesByKey.set(monster.spawnKey, state);
  }
  return state;
}

export function resolveMonsterRespawnTicksImpl(instance: MapInstanceRuntime, monster) {
  const bonus = instance.getMonsterSpawnAccelerationState(monster)?.respawnSpeedBonusPercent ?? 0;
  return resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, bonus);
}

export function handleMonsterRespawnImpl(instance: MapInstanceRuntime, monster) {
  const state = instance.getMonsterSpawnAccelerationState(monster);
  if (!state) {
   return;
  }
  const group = instance.getMonsterSpawnGroup(monster);
  if (!areAllMonstersAlive(group)) {
   return;
  }
  state.clearDeadlineTick = instance.tick + resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, state.respawnSpeedBonusPercent);
}

export function handleMonsterDefeatImpl(instance: MapInstanceRuntime, monster) {
  const state = instance.getMonsterSpawnAccelerationState(monster);
  if (!state) {
   return;
  }
  const group = instance.getMonsterSpawnGroup(monster);
  if (!areAllMonstersDefeated(group)) {
   return;
  }
  const clearedInTime = state.clearDeadlineTick > 0 && instance.tick <= state.clearDeadlineTick;
  const nextBonusPercent = clearedInTime
   ? Math.min(MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT, state.respawnSpeedBonusPercent + MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT)
   : 0;
  state.respawnSpeedBonusPercent = nextBonusPercent;
  state.clearDeadlineTick = 0;
  const respawnTicks = resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, nextBonusPercent);
  for (const entry of group) {
   if (!entry.alive) {
    entry.respawnLeft = respawnTicks;
    instance.markMonsterRuntimePersistenceDirty(entry.runtimeId);
   }
  }
}

export function markMonsterDefeatedImpl(instance: MapInstanceRuntime, monster) {
  instance.monsterRuntimeIdByTile.delete(instance.toTileIndex(monster.x, monster.y));
  monster.alive = false;
  monster.hp = 0;
  monster.qi = 0;
  monster.respawnLeft = instance.resolveMonsterRespawnTicks(monster);
  monster.attackReadyTick = 0;
  monster.pendingCast = undefined;
  monster.engaged = !instance.isDungeonInstance();
  monster.speechTicksLeft = 0;
  monster.cooldownReadyTickBySkillId = {};
  monster.aggroTargetPlayerId = null;
  instance.monsterThreatByRuntimeId.delete(monster.runtimeId);
  monster.lastSeenTargetX = undefined;
  monster.lastSeenTargetY = undefined;
  monster.lastSeenTargetTick = undefined;
  monster.buffs.length = 0;
  /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
  recalculateMonsterDerivedState(monster);
  instance.handleMonsterDefeat(monster);
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  instance.worldRevision += 1;
}

export function respawnMonsterImpl(instance: MapInstanceRuntime, monster) {

  const respawn = instance.findNearestOpenTile(monster.spawnX, monster.spawnY) ?? { x: monster.spawnX, y: monster.spawnY };
  monster.x = respawn.x;
  monster.y = respawn.y;
  monster.alive = true;
  monster.respawnLeft = 0;
  monster.attackReadyTick = 0;
  monster.pendingCast = undefined;
  monster.engaged = !instance.isDungeonInstance();
  monster.speechTicksLeft = 0;
  monster.cooldownReadyTickBySkillId = {};
  monster.aggroTargetPlayerId = null;
  instance.monsterThreatByRuntimeId.delete(monster.runtimeId);
  monster.lastSeenTargetX = undefined;
  monster.lastSeenTargetY = undefined;
  monster.lastSeenTargetTick = undefined;
  monster.buffs.length = 0;
  monster.damageContributors = {};
  applyMonsterInitialBuffs(monster, instance.buffRegistry);
  /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
  recalculateMonsterDerivedState(monster);
  monster.hp = monster.maxHp;
  monster.qi = monster.maxQi;
  instance.monsterRuntimeIdByTile.set(instance.toTileIndex(monster.x, monster.y), monster.runtimeId);
  instance.handleMonsterRespawn(monster);
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  instance.worldRevision += 1;
}

export function resolveMonsterTargetImpl(instance: MapInstanceRuntime, monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const isDungeon = instance.isDungeonInstance();
  if (isDungeon && monster.engaged !== true) {
   instance.decayMonsterThreats(monster, new Set());
   return null;
  }
  const aggroRange = instance.resolveMonsterCombatAggroRange(monster);
  const leashRange = isDungeon
   ? Number.POSITIVE_INFINITY
   : Math.max(0, Math.trunc(Number(monster.leashRange) || 0));
  if (isDungeon) {
   if (instance.playersById.size === 0) {
    instance.decayMonsterThreats(monster, new Set());
    return null;
   }
   const extraAggroRate = Number(monster?.numericStats?.extraAggroRate ?? 0) || 0;
   const activePlayerIds = new Set();
   for (const player of instance.playersById.values()) {
    activePlayerIds.add(player.playerId);
    instance.addMonsterThreat(monster.runtimeId, player.playerId, DEFAULT_PASSIVE_THREAT_PER_TICK, 1, extraAggroRate);
   }
   instance.decayMonsterThreats(monster, activePlayerIds);
   const bestThreat = instance.getHighestMonsterThreatTarget(monster, (playerId) => instance.playersById.has(playerId));
   if (!bestThreat) {
    return null;
   }
   const best = instance.playersById.get(bestThreat.targetId);
   if (best) {
    instance.rememberMonsterTargetSight(monster, best);
   }
   return best ?? null;
  }
  const nearbyCandidates = instance.collectPlayersByChunkRange(monster.x, monster.y, aggroRange);
  let hasNearbyPlayer = false;
  if (monster.aggroTargetPlayerId) {
   const locked = instance.playersById.get(monster.aggroTargetPlayerId);
   hasNearbyPlayer = !!locked
    && chebyshevDistance(monster.x, monster.y, locked.x, locked.y) <= aggroRange
    && chebyshevDistance(monster.spawnX, monster.spawnY, locked.x, locked.y) <= leashRange;
  }
  if (!hasNearbyPlayer) {
   for (const player of nearbyCandidates) {
    if (chebyshevDistance(monster.x, monster.y, player.x, player.y) <= aggroRange
     && chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) <= leashRange) {
     hasNearbyPlayer = true;
     break;
    }
   }
  }
  if (!hasNearbyPlayer) {
   instance.decayMonsterThreats(monster, new Set());
   return null;
  }
  const visibleTileIndices = instance.collectVisibleTileIndices(monster.x, monster.y, aggroRange);
  const visibleCandidates = instance.collectPlayersByTileIndices(visibleTileIndices);
  const activePlayerIds = new Set();
  const extraAggroRate = Number(monster?.numericStats?.extraAggroRate ?? 0) || 0;
  for (const player of visibleCandidates) {
   if (chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) > leashRange) {
    continue;
   }
   const distance = chebyshevDistance(monster.x, monster.y, player.x, player.y);
   if (distance > aggroRange || !visibleTileIndices.has(instance.toTileIndex(player.x, player.y))) {
    continue;
   }
   activePlayerIds.add(player.playerId);
   instance.addMonsterThreat(monster.runtimeId, player.playerId, DEFAULT_PASSIVE_THREAT_PER_TICK, 1, extraAggroRate);
  }
  instance.decayMonsterThreats(monster, activePlayerIds);
  const bestThreat = instance.getHighestMonsterThreatTarget(monster, (playerId) => {
   const player = instance.playersById.get(playerId);
   return !!player
    && chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) <= leashRange
    && chebyshevDistance(monster.x, monster.y, player.x, player.y) <= aggroRange
    && visibleTileIndices.has(instance.toTileIndex(player.x, player.y));
  });
  if (!bestThreat) {
   return null;
  }
  const best = instance.playersById.get(bestThreat.targetId);
  if (best) {
   if (isDungeon && !monster.engaged) {
    instance.engageMonster(monster, best.playerId);
   }
   instance.rememberMonsterTargetSight(monster, best);
  }
  return best ?? null;
}

export function resolveMonsterTargetWithHintImpl(instance: MapInstanceRuntime, monster, preIntent) {
  if (!preIntent) {
   return instance.resolveMonsterTarget(monster);
  }
  if (instance.isDungeonInstance()) {
   return instance.resolveMonsterTarget(monster);
  }
  const aggroRange = instance.resolveMonsterCombatAggroRange(monster);

  // idle hint 快速路径：无 aggroTarget 且候选 chunk 内无玩家 → 只 decay
  if (preIntent.action === 'idle' && !monster.aggroTargetPlayerId) {
   let hasNearbyPlayer = false;
   for (const player of instance.collectPlayersByChunkRange(monster.x, monster.y, aggroRange)) {
    if (chebyshevDistance(monster.x, monster.y, player.x, player.y) <= aggroRange
     && chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) <= monster.leashRange) {
     hasNearbyPlayer = true;
     break;
    }
   }
   if (!hasNearbyPlayer) {
    instance.decayMonsterThreats(monster, new Set());
    return null;
   }
   // 有玩家在范围内 → fallback 完整仇恨推进
   return instance.resolveMonsterTarget(monster);
  }

  // 其他情况 fallback 完整扫描（保证仇恨系统正确推进）
  return instance.resolveMonsterTarget(monster);
}

export function clearMonsterTargetPursuitImpl(instance: MapInstanceRuntime, monster) {
  monster.aggroTargetPlayerId = null;
  monster.lastSeenTargetX = undefined;
  monster.lastSeenTargetY = undefined;
  monster.lastSeenTargetTick = undefined;
}

export function clearMonsterActiveAiStateForSleepImpl(instance: MapInstanceRuntime, monster) {
  const hadPursuit = monster.aggroTargetPlayerId != null
   || monster.lastSeenTargetX !== undefined
   || monster.lastSeenTargetY !== undefined
   || monster.lastSeenTargetTick !== undefined;
  const hadThreat = instance.monsterThreatByRuntimeId.has(monster.runtimeId);
  if (!hadPursuit && !hadThreat) {
   return false;
  }
  instance.clearMonsterTargetPursuit(monster);
  instance.monsterThreatByRuntimeId.delete(monster.runtimeId);
  instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  return true;
}

export function clearMonsterAggroForPlayerImpl(instance: MapInstanceRuntime, playerId: string) {
  for (const monster of instance.monstersByRuntimeId.values()) {
   instance.monsterThreatByRuntimeId.get(monster.runtimeId)?.delete(playerId);
   if (monster.aggroTargetPlayerId === playerId) {
    instance.clearMonsterTargetPursuit(monster);
   }
  }
}

export function isMonsterWithinWanderRangeImpl(instance: MapInstanceRuntime, monster, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
  return isOffsetInRange(x - monster.spawnX, y - monster.spawnY, radius);
}

export function stepMonsterIdleRoamImpl(instance: MapInstanceRuntime, monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
  if (radius <= 0) {
   return false;
  }
  const directions = [
   { dx: 1, dy: 0, facing: Direction.East },
   { dx: -1, dy: 0, facing: Direction.West },
   { dx: 0, dy: 1, facing: normalizeHorizontalFacing(undefined, monster.facing) },
   { dx: 0, dy: -1, facing: normalizeHorizontalFacing(undefined, monster.facing) },
  ];
  const startIndex = Math.floor(Math.random() * directions.length);
  for (let offset = 0; offset < directions.length; offset += 1) {
   const direction = directions[(startIndex + offset) % directions.length];
   if (!direction) {
    continue;
   }
   const nextX = monster.x + direction.dx;
   const nextY = monster.y + direction.dy;
   if (!instance.isMonsterWithinWanderRange(monster, nextX, nextY)) {
    continue;
   }
   if (!instance.isMonsterOpenTile(monster, nextX, nextY)) {
    continue;
   }
   const previousX = monster.x;
   const previousY = monster.y;
   instance.monsterRuntimeIdByTile.delete(instance.toTileIndex(previousX, previousY));
   monster.x = nextX;
   monster.y = nextY;
   monster.facing = horizontalFacingFromDelta(direction.dx, monster.facing);
   instance.monsterRuntimeIdByTile.set(instance.toTileIndex(monster.x, monster.y), monster.runtimeId);
   instance.markAoiViewMoved(previousX, previousY, monster.x, monster.y);
   instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
   return true;
  }
  return false;
}

export function tryMoveMonsterTowardImpl(instance: MapInstanceRuntime, monster, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const next = chooseMonsterStep(monster.x, monster.y, targetX, targetY);
  for (const candidate of next) {
   if (!instance.isMonsterOpenTile(monster, candidate.x, candidate.y)) {
    continue;
   }
   const nextFacing = horizontalFacingFromTo(monster.x, monster.y, candidate.x, candidate.y, monster.facing);
   const previousX = monster.x;
   const previousY = monster.y;
   instance.monsterRuntimeIdByTile.delete(instance.toTileIndex(previousX, previousY));
   monster.x = candidate.x;
   monster.y = candidate.y;
   monster.facing = nextFacing;
   instance.monsterRuntimeIdByTile.set(instance.toTileIndex(monster.x, monster.y), monster.runtimeId);
   instance.markAoiViewMoved(previousX, previousY, monster.x, monster.y);
   instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
   return true;
  }
  return false;
}

export function isMonsterOpenTileImpl(instance: MapInstanceRuntime, monster, x, y) {
  if (!instance.isInBounds(x, y) || instance.isDynamicallyBlockedTile(x, y)) {
   return false;
  }
  const tileIndex = instance.toTileIndex(x, y);
  if (instance.npcIdByTile.has(tileIndex) || instance.monsterRuntimeIdByTile.has(tileIndex)) {
   return false;
  }
  if (instance.occupancy[tileIndex] !== INVALID_OCCUPANCY) {
   return false;
  }
  if (instance.isCellIndexWalkable(tileIndex)) {
   return true;
  }
  return Array.isArray(monster?.buffs)
   && monster.buffs.some((buff) => buff?.buffId === FIVE_PHASE_YUKONG_BUFF_ID && isRuntimeBuffActive(buff));
 }

