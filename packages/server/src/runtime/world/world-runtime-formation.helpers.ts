/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 从 world-runtime-formation.service.ts 抽取的阵法相关游离辅助函数。
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
    FORMATION_AURA_PER_SPIRIT_STONE,
    FORMATION_DISK_TIER_MULTIPLIERS,
    FORMATION_QI_HALF_LIFE_TICKS,
    FORMATION_SPIRIT_STONE_ITEM_ID,
    FORMATION_TICKS_PER_DAY,
    QI_HALF_LIFE_RATE_SCALE,
    buildQiHalfLifeRateScaled,
    formatDisplayInteger,
    isFormationSetupInput,
    resolveFormationCostConfig,
    resolveFormationDamagePerAura,
    resolveFormationLifecycle as resolveSharedFormationLifecycle,
    resolveFormationVisual,
} from '@mud/shared';
import { Pool, type PoolClient } from 'pg';
import {
    assertInstanceLeaseWriteFence,
    type InstanceLeaseWriteFence,
} from '../../persistence/instance-lease-write-fence';
import { ensureBigintColumnType, ensureDoubleColumnType } from '../../persistence/schema-bigint-migration';
import { assignItemInstanceIdIfNeeded } from './item-instance-id.helpers';
import { findProtectedPlacementConflict, formatProtectedPlacementConflictReason } from './protected-placement.helpers';
import { isVirtualPublicWorldInstance } from './world-runtime.normalization.helpers';

export const TERRAIN_STABILIZER_EFFECT_KIND = 'terrain_stabilizer';
export const BOUNDARY_BARRIER_EFFECT_KIND = 'boundary_barrier';
export const INSTANCE_FORMATION_STATE_TABLE = 'instance_formation_state';
export const FORMATION_LOCK_NAMESPACE = 7105;
export const INSTANCE_FORMATION_STATE_BIGINT_COLUMNS = [
    'spirit_stone_count',
    'x',
    'y',
    'eye_x',
    'eye_y',
    'created_at_ms',
    'updated_at_ms',
];
export const INSTANCE_FORMATION_STATE_DOUBLE_COLUMNS = [
    'qi_cost',
    'remaining_qi_budget',
    'remaining_spirit_stone_budget',
];
export const FORMATION_LIFECYCLE_DEPLOYED = 'deployed';
export const FORMATION_LIFECYCLE_PERSISTENT = 'persistent';
export const FORMATION_MAINTENANCE_CONTROL_RADIUS = 1;
export const FORMATION_QI_DECAY_RATE_SCALED = buildQiHalfLifeRateScaled(FORMATION_QI_HALF_LIFE_TICKS);
export const runtimeFormationProjectionCache = new WeakMap();
export async function ensureInstanceFormationStateTable(pool) {
 await pool.query(`
        CREATE TABLE IF NOT EXISTS ${INSTANCE_FORMATION_STATE_TABLE} (
            instance_id varchar(100) NOT NULL,
            formation_instance_id varchar(180) NOT NULL,
            owner_player_id varchar(100) NOT NULL,
            owner_sect_id varchar(100) NULL,
            formation_id varchar(100) NOT NULL,
            lifecycle varchar(32) NOT NULL DEFAULT 'deployed',
            disk_item_id varchar(100) NOT NULL,
            disk_tier varchar(32) NOT NULL,
            disk_multiplier double precision NOT NULL DEFAULT 1,
            spirit_stone_count bigint NOT NULL DEFAULT 0,
            qi_cost double precision NOT NULL DEFAULT 0,
            x bigint NOT NULL,
            y bigint NOT NULL,
            eye_instance_id varchar(100) NOT NULL,
            eye_x bigint NOT NULL,
            eye_y bigint NOT NULL,
            allocation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            active boolean NOT NULL DEFAULT true,
            remaining_aura_budget double precision NOT NULL DEFAULT 0,
            remaining_qi_budget double precision NOT NULL DEFAULT 0,
            remaining_spirit_stone_budget double precision NOT NULL DEFAULT 0,
            created_at_ms bigint NOT NULL DEFAULT 0,
            updated_at_ms bigint NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (instance_id, formation_instance_id)
        )
    `);
 await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS lifecycle varchar(32) NOT NULL DEFAULT 'deployed'
    `);
 await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS remaining_qi_budget double precision NOT NULL DEFAULT 0
    `);
 await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS remaining_spirit_stone_budget double precision NOT NULL DEFAULT 0
    `);
 for (const column of INSTANCE_FORMATION_STATE_BIGINT_COLUMNS) {
  await ensureBigintColumnType(pool, INSTANCE_FORMATION_STATE_TABLE, column);
 }
 for (const column of INSTANCE_FORMATION_STATE_DOUBLE_COLUMNS) {
  await ensureDoubleColumnType(pool, INSTANCE_FORMATION_STATE_TABLE, column);
 }
 await pool.query(`
        CREATE INDEX IF NOT EXISTS instance_formation_state_instance_idx
        ON ${INSTANCE_FORMATION_STATE_TABLE}(instance_id, formation_id)
    `);
 await pool.query(`
        CREATE INDEX IF NOT EXISTS instance_formation_state_owner_idx
        ON ${INSTANCE_FORMATION_STATE_TABLE}(owner_player_id, owner_sect_id)
    `);
}

export function normalizeSlotIndex(input) {
 const value = Math.trunc(Number(input));
 if (!Number.isFinite(value) || value < 0) {
  throw new BadRequestException('槽位索引无效');
 }
 return value;
}

export function normalizePositiveInteger(input, label) {
 const value = Math.trunc(Number(input));
 if (!Number.isFinite(value) || value <= 0) {
  throw new BadRequestException(`${label}必须大于 0`);
 }
 return value;
}

export function normalizeBoundedRuntimeInteger(input, fallback, minimum, maximum) {
 const value = Math.trunc(Number(input));
 if (!Number.isFinite(value)) {
  return fallback;
 }
 return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeNonNegativeInteger(input) {
 const value = Math.trunc(Number(input));
 if (!Number.isFinite(value) || value < 0) {
  throw new BadRequestException('灵力消耗不能为负');
 }
 return value;
}

export function normalizeLoadedFormationBudget(input) {
 const value = Number(input);
 return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resolveLoadedRemainingQiBudget(input, remainingAuraBudget) {
 const remainingQiBudget = normalizeLoadedFormationBudget(input);
 if (remainingQiBudget > 0 || remainingAuraBudget <= 0) {
  return remainingQiBudget;
 }
 return remainingAuraBudget;
}

export function resolveFormationPlacement(playerId, player, location, instance) {
 const runtimePosition = typeof instance?.getPlayerPosition === 'function'
  ? instance.getPlayerPosition(playerId)
  : null;
 const x = firstFiniteInteger(runtimePosition?.x, player?.x, location?.x);
 const y = firstFiniteInteger(runtimePosition?.y, player?.y, location?.y);
 if (!Number.isFinite(x) || !Number.isFinite(y)) {
  throw new BadRequestException('无法确认布阵坐标');
 }
 return { x, y };
}

export function firstFiniteInteger(...values) {
 for (const value of values) {
  if (value === null || value === undefined || value === '') {
   continue;
  }
  const normalized = Math.trunc(Number(value));
  if (Number.isFinite(normalized)) {
   return normalized;
  }
 }
 return Number.NaN;
}

export function isWithinFormationMaintenanceControlRange(ax, ay, bx, by) {
 const leftX = firstFiniteInteger(ax);
 const leftY = firstFiniteInteger(ay);
 const rightX = firstFiniteInteger(bx);
 const rightY = firstFiniteInteger(by);
 if (!Number.isFinite(leftX) || !Number.isFinite(leftY) || !Number.isFinite(rightX) || !Number.isFinite(rightY)) {
  return false;
 }
 return Math.max(Math.abs(leftX - rightX), Math.abs(leftY - rightY)) <= FORMATION_MAINTENANCE_CONTROL_RADIUS;
}

export function normalizeInstanceId(input) {
 return typeof input === 'string' ? input.trim() : '';
}

export function normalizeOptionalString(input) {
 return typeof input === 'string' && input.trim() ? input.trim() : '';
}

export function resolvePlayerSectId(player) {
 return normalizeOptionalString(player?.sectId)
  || normalizeOptionalString(player?.sect?.id)
  || normalizeOptionalString(player?.sect?.sectId)
  || normalizeOptionalString(player?.ownerSectId)
  || normalizeOptionalString(player?.guildId)
  || normalizeOptionalString(player?.clanId);
}

export function resolveFormationSkillLevel(source) {
 const allocation = source?.allocation && typeof source.allocation === 'object' ? source.allocation : null;
 const value = source?.formationSkillLevel
  ?? allocation?.formationSkillLevel
  ?? source?.formationSkill?.level;
 return Math.max(0, Math.floor(Number(value) || 0));
}

export function assertCanPlaceFormationInInstance(instance) {
 if (isVirtualPublicWorldInstance(instance)) {
  throw new BadRequestException('虚境不能布置阵法，请前往现世。');
 }
}

export function normalizeFormationDiskTier(input) {
 if (input === 'mortal' || input === 'yellow' || input === 'mystic' || input === 'earth') {
  return input;
 }
 return 'mortal';
}

export function normalizeFormationLifecycle(input) {
 return input === FORMATION_LIFECYCLE_PERSISTENT ? FORMATION_LIFECYCLE_PERSISTENT : FORMATION_LIFECYCLE_DEPLOYED;
}

export function resolveFormationLifecycle(template) {
 return typeof resolveSharedFormationLifecycle === 'function'
  ? resolveSharedFormationLifecycle(template)
  : normalizeFormationLifecycle(template?.lifecycle);
}

export function isPersistentFormation(formation) {
 return normalizeFormationLifecycle(formation?.lifecycle ?? formation?.template?.lifecycle) === FORMATION_LIFECYCLE_PERSISTENT;
}

export function isActiveTerrainStabilizerFormation(formation) {
 return isActiveFormationOfKind(formation, TERRAIN_STABILIZER_EFFECT_KIND);
}

export function isActiveFormationOfKind(formation, kind) {
 return formation?.active === true
  && formation?.template?.effect?.kind === kind
  && resolveFormationRemainingQiBudget(formation) > 0
  && resolveFormationRemainingSpiritStoneBudget(formation) > 0;
}

export function buildTerrainStabilizationChecker(checker, hasTerrainStabilizer) {
 Object.defineProperty(checker, 'hasTerrainStabilizer', {
  value: hasTerrainStabilizer === true,
  enumerable: false,
  configurable: false,
 });
 return checker;
}

export function forEachFormationAffectedRuntimeCell(instance, formation, visitor) {
 const shape = formation?.template?.range?.shape;
 const centerX = Math.trunc(Number(formation?.x));
 const centerY = Math.trunc(Number(formation?.y));
 const radius = Math.max(1, Math.trunc(Number(formation?.stats?.radius) || 1));
 if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || typeof visitor !== 'function') {
  return;
 }
 const hasRuntimeBounds = typeof instance?.isInBounds === 'function';
 const width = Math.max(0, Math.trunc(Number(instance?.template?.width) || 0));
 const height = Math.max(0, Math.trunc(Number(instance?.template?.height) || 0));
 for (let y = centerY - radius; y <= centerY + radius; y += 1) {
  for (let x = centerX - radius; x <= centerX + radius; x += 1) {
   if (!isFormationAffectedCell(shape, centerX, centerY, x, y, radius)) {
    continue;
   }
   if (hasRuntimeBounds) {
    if (instance.isInBounds(x, y) !== true) {
     continue;
    }
   } else if (x < 0 || y < 0 || x >= width || y >= height) {
    continue;
   }
   visitor(x, y);
  }
 }
}

export function assertFormationProtectedPlacementAllowed(instance, formation) {
 const conflict = findFormationProtectedPlacementConflict(instance, formation);
 if (conflict.ok !== true) {
  const formationName = normalizeOptionalString(formation?.name) || '阵法';
  throw new BadRequestException(`${formationName}范围内${formatProtectedPlacementConflictReason(conflict.reason)}`);
 }
}

export function isFormationProtectedPlacementAllowed(instance, formation) {
 return findFormationProtectedPlacementConflict(instance, formation).ok;
}

export function findFormationProtectedPlacementConflict(instance, formation) {
 const points = [];
 forEachFormationAffectedRuntimeCell(instance, formation, (x, y) => {
  points.push({ x, y });
 });
 return findProtectedPlacementConflict(instance, points);
}

export function isFormationAffectedCell(shape, centerX, centerY, x, y, radius) {
 const dx = Math.trunc(Number(x)) - centerX;
 const dy = Math.trunc(Number(y)) - centerY;
 if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
  return false;
 }
 if (shape === 'circle') {
  return (dx * dx) + (dy * dy) <= radius * radius;
 }
 if (shape === 'checkerboard') {
  return ((Math.trunc(Number(x)) + Math.trunc(Number(y))) % 2) === 0;
 }
 return true;
}

export function resolveFormationTickCost(formation) {
 const remainingQiBudget = resolveFormationRemainingQiBudget(formation);
 const remainingSpiritStoneBudget = resolveFormationRemainingSpiritStoneBudget(formation);
 const qiDecayRate = FORMATION_QI_DECAY_RATE_SCALED / QI_HALF_LIFE_RATE_SCALE;
 const dailySpiritStoneCost = resolveFormationDailySpiritStoneCost(formation);
 return {
  qiCost: remainingQiBudget <= 0 ? 0 : Math.min(remainingQiBudget, remainingQiBudget * qiDecayRate),
  spiritStoneCost: remainingSpiritStoneBudget <= 0 ? 0 : Math.min(remainingSpiritStoneBudget, dailySpiritStoneCost / FORMATION_TICKS_PER_DAY),
 };
}

export function buildFormationResourceInventoryPlan(items, spiritStoneCount, diskItemInstanceId = null) {
 const nextItems = Array.isArray(items) ? items.map((entry) => ({ ...entry })) : [];
 for (const entry of nextItems) {
  assignItemInstanceIdIfNeeded(entry);
 }
 let remainingSpiritStones = Math.max(0, Math.trunc(Number(spiritStoneCount) || 0));
 for (let index = nextItems.length - 1; index >= 0 && remainingSpiritStones > 0; index -= 1) {
  const entry = nextItems[index];
  if (entry?.itemId !== FORMATION_SPIRIT_STONE_ITEM_ID) {
   continue;
  }
  const currentCount = Math.max(0, Math.trunc(Number(entry.count ?? 0)));
  const consumed = Math.min(currentCount, remainingSpiritStones);
  entry.count = currentCount - consumed;
  remainingSpiritStones -= consumed;
  if (entry.count <= 0) {
   nextItems.splice(index, 1);
  }
 }
 if (remainingSpiritStones > 0) {
  throw new NotFoundException('灵石不足');
 }

 const normalizedDiskItemInstanceId = normalizeOptionalString(diskItemInstanceId);
 if (normalizedDiskItemInstanceId) {
  const diskIndex = nextItems.findIndex((entry) => (
   normalizeOptionalString(entry?.itemInstanceId) === normalizedDiskItemInstanceId
  ));
  if (diskIndex < 0) {
   throw new NotFoundException('阵盘已不在背包中');
  }
  const disk = nextItems[diskIndex];
  const diskCount = Math.max(0, Math.trunc(Number(disk?.count ?? 0)));
  if (diskCount <= 0) {
   throw new NotFoundException('阵盘数量不足');
  }
  if (diskCount === 1) {
   nextItems.splice(diskIndex, 1);
  }
  else {
   disk.count = diskCount - 1;
  }
 }
 return nextItems;
}

export function cloneFormationForResourceMutation(formation) {
 return {
  ...formation,
  allocation: formation?.allocation && typeof formation.allocation === 'object'
   ? { ...formation.allocation }
   : formation?.allocation,
  stats: formation?.stats && typeof formation.stats === 'object'
   ? { ...formation.stats }
   : formation?.stats,
 };
}

export function captureFormationMaintenanceRuntimeState(player, formation, instance) {
 return {
  player: {
   qi: Number(player?.qi ?? 0),
   selfRevision: Number(player?.selfRevision ?? 0),
   persistentRevision: Number(player?.persistentRevision ?? 0),
   persistedRevision: Number(player?.persistedRevision ?? 0),
   stagedRevision: Number(player?.stagedRevision ?? 0),
   formationJob: cloneFormationMaintenanceJob(player?.formationJob),
   formationSkill: player?.formationSkill && typeof player.formationSkill === 'object'
    ? { ...player.formationSkill }
    : player?.formationSkill,
   dirtyDomains: new Set(player?.dirtyDomains instanceof Set ? player.dirtyDomains : []),
   persistenceDomainRevisionByDomain: cloneRuntimeMap(player?.persistenceDomainRevisionByDomain),
   stagedPersistenceDomainRevisionByDomain: cloneRuntimeMap(player?.stagedPersistenceDomainRevisionByDomain),
   persistenceStagingGenerationByDomain: cloneRuntimeMap(player?.persistenceStagingGenerationByDomain),
   persistedDomainRevisionByDomain: cloneRuntimeMap(player?.persistedDomainRevisionByDomain),
  },
  formation: {
   remainingQiBudget: resolveFormationRemainingQiBudget(formation),
   remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
   remainingSpiritStoneBudget: resolveFormationRemainingSpiritStoneBudget(formation),
   active: formation?.active !== false,
   updatedAt: Number(formation?.updatedAt ?? 0),
  },
  instanceWorldRevision: Number(instance?.worldRevision ?? 0),
 };
}

export function restoreFormationMaintenanceRuntimeState(player, formation, instance, state) {
 if (!state) {
  return;
 }
 player.qi = state.player.qi;
 player.selfRevision = state.player.selfRevision;
 player.persistentRevision = state.player.persistentRevision;
 player.persistedRevision = state.player.persistedRevision;
 player.stagedRevision = state.player.stagedRevision;
 player.formationJob = cloneFormationMaintenanceJob(state.player.formationJob);
 player.formationSkill = state.player.formationSkill && typeof state.player.formationSkill === 'object'
  ? { ...state.player.formationSkill }
  : state.player.formationSkill;
 restoreRuntimeSet(player, 'dirtyDomains', state.player.dirtyDomains);
 restoreRuntimeMap(player, 'persistenceDomainRevisionByDomain', state.player.persistenceDomainRevisionByDomain);
 restoreRuntimeMap(player, 'stagedPersistenceDomainRevisionByDomain', state.player.stagedPersistenceDomainRevisionByDomain);
 restoreRuntimeMap(player, 'persistenceStagingGenerationByDomain', state.player.persistenceStagingGenerationByDomain);
 restoreRuntimeMap(player, 'persistedDomainRevisionByDomain', state.player.persistedDomainRevisionByDomain);
 setFormationRemainingQiBudget(formation, state.formation.remainingQiBudget);
 setFormationRemainingSpiritStoneBudget(formation, state.formation.remainingSpiritStoneBudget);
 formation.active = state.formation.active;
 formation.updatedAt = state.formation.updatedAt;
 if (instance && Number.isFinite(state.instanceWorldRevision)) {
  instance.worldRevision = state.instanceWorldRevision;
 }
}

export function cloneFormationMaintenanceJob(job) {
 if (!job || typeof job !== 'object') {
  return job ?? null;
 }
 return {
  ...job,
  interruptState: job.interruptState && typeof job.interruptState === 'object'
   ? { ...job.interruptState }
   : job.interruptState ?? null,
 };
}

export function buildFormationMaintenanceActiveJobSnapshot(job) {
 const jobRunId = normalizeOptionalString(job?.jobRunId);
 if (!jobRunId) {
  return null;
 }
 const jobVersion = Math.max(1, Math.trunc(Number(job?.jobVersion) || 1));
 return {
  jobRunId,
  jobType: 'formation',
  status: normalizeOptionalString(job?.status) || 'running',
  phase: normalizeOptionalString(job?.phase) || 'maintaining',
  startedAt: Math.max(1, Math.trunc(Number(job?.startedAt) || Date.now())),
  finishedAt: job?.finishedAt == null ? null : Math.max(1, Math.trunc(Number(job.finishedAt) || Date.now())),
  pausedTicks: Math.max(0, Math.trunc(Number(job?.pausedTicks) || 0)),
  totalTicks: Math.max(0, Math.trunc(Number(job?.totalTicks) || 0)),
  remainingTicks: Math.max(0, Math.trunc(Number(job?.remainingTicks) || 0)),
  successRate: Number.isFinite(Number(job?.successRate)) ? Number(job.successRate) : 1,
  speedRate: Number.isFinite(Number(job?.maintenanceRate)) ? Number(job.maintenanceRate) : 1,
  jobVersion,
  detailJson: cloneFormationMaintenanceJob({ ...job, jobRunId, jobType: 'formation', jobVersion }),
 };
}

export function cloneRuntimeMap(value) {
 return value instanceof Map ? new Map(value) : new Map();
}

export function restoreRuntimeMap(target, key, snapshot) {
 const current = target?.[key];
 if (current instanceof Map) {
  current.clear();
  for (const [entryKey, entryValue] of snapshot ?? []) {
   current.set(entryKey, entryValue);
  }
  return;
 }
 target[key] = new Map(snapshot ?? []);
}

export function restoreRuntimeSet(target, key, snapshot) {
 const current = target?.[key];
 if (current instanceof Set) {
  current.clear();
  for (const entry of snapshot ?? []) {
   current.add(entry);
  }
  return;
 }
 target[key] = new Set(snapshot ?? []);
}

export function isFormationPlayerFenceConflict(error) {
 const message = String(error instanceof Error ? error.message : error);
 return message.startsWith('player_session_fencing_conflict');
}

export function isFormationVolatileFallbackAllowed() {
 const runtimeEnv = [process.env.SERVER_RUNTIME_ENV, process.env.APP_ENV, process.env.NODE_ENV]
  .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
  .find(Boolean) ?? '';
 return runtimeEnv === 'test'
  || runtimeEnv === 'verify'
  || runtimeEnv === 'smoke'
  || runtimeEnv === 'development'
  || runtimeEnv === 'dev';
}

export function resolveFormationDailySpiritStoneCost(formation) {
 const stats = formation?.stats ?? {};
 const configured = Number(stats.dailyActiveSpiritStoneCost ?? stats.dailySpiritStoneCost);
 if (Number.isFinite(configured) && configured > 0) {
  return configured;
 }
 return Math.max(1, Math.floor(Number(stats.effectValue) || 0));
}

export function resolveFormationRemainingQiBudget(formation) {
 return Math.max(0, Number(formation?.remainingQiBudget ?? formation?.remainingAuraBudget) || 0);
}

export function resolveFormationRemainingSpiritStoneBudget(formation) {
 return Math.max(0, Number(formation?.remainingSpiritStoneBudget ?? formation?.spiritStoneCount) || 0);
}

export function resolveFormationCombatMaxHp(formation) {
 const damagePerAura = resolveFormationDamagePerAura(formation?.template);
 const configuredQiBudget = Math.max(0, Number(formation?.stats?.totalQiBudget ?? formation?.stats?.totalAuraBudget) || 0);
 const fallbackQiBudget = resolveFormationRemainingQiBudget(formation);
 return Math.max(1, Math.ceil((configuredQiBudget > 0 ? configuredQiBudget : fallbackQiBudget) * damagePerAura));
}

export function resolveFormationCombatHp(formation) {
 const maxHp = resolveFormationCombatMaxHp(formation);
 const currentHp = Math.max(0, Math.ceil(resolveFormationRemainingQiBudget(formation) * resolveFormationDamagePerAura(formation?.template)));
 return Math.min(maxHp, currentHp);
}

export function setFormationRemainingQiBudget(formation, value) {
 const normalized = Math.max(0, Number(value) || 0);
 formation.remainingQiBudget = normalized;
 formation.remainingAuraBudget = normalized;
}

export function setFormationRemainingSpiritStoneBudget(formation, value) {
 formation.remainingSpiritStoneBudget = Math.max(0, Number(value) || 0);
}

export function buildRuntimeFormationProjection(formation, role = 'effect') {
 const lifecycle = normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle);
 const isEyeProjection = role === 'eye';
 const visual = resolveFormationRuntimeVisual(formation.template);
 return {
  id: formation.id,
  ownerPlayerId: formation.ownerPlayerId,
  ownerSectId: formation.ownerSectId ?? null,
  formationId: formation.formationId,
  lifecycle,
  name: isEyeProjection ? `${formation.name}阵眼` : formation.name,
  x: isEyeProjection && Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
  y: isEyeProjection && Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
  eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
  eyeX: Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
  eyeY: Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
  radius: isEyeProjection ? 1 : formation.stats.radius,
  rangeShape: formation.template.range.shape,
  ...visual,
  active: formation.active,
  hp: resolveFormationCombatHp(formation),
  maxHp: resolveFormationCombatMaxHp(formation),
  blocksBoundary: !isEyeProjection && formation.template.effect.kind === BOUNDARY_BARRIER_EFFECT_KIND,
  damagePerAura: resolveFormationDamagePerAura(formation.template),
  remainingAuraBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
  remainingQiBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
  remainingSpiritStoneBudget: Math.max(0, Math.floor(resolveFormationRemainingSpiritStoneBudget(formation))),
 };
}

export function getRuntimeFormationProjection(formation, role = 'effect') {
 const cacheKey = role === 'eye' ? 'eye' : 'effect';
 const lifecycle = normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle);
 const isEyeProjection = role === 'eye';
 const x = isEyeProjection && Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x;
 const y = isEyeProjection && Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y;
 const eyeX = Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x;
 const eyeY = Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y;
 const remainingAuraBudget = Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation)));
 const remainingSpiritStoneBudget = Math.max(0, Math.floor(resolveFormationRemainingSpiritStoneBudget(formation)));
 const hp = resolveFormationCombatHp(formation);
 const maxHp = resolveFormationCombatMaxHp(formation);
 const cachedByRole = runtimeFormationProjectionCache.get(formation);
 const cached = cachedByRole?.[cacheKey];
 if (cached
  && cached.lifecycle === lifecycle
  && cached.name === formation.name
  && cached.ownerPlayerId === formation.ownerPlayerId
  && cached.ownerSectId === (formation.ownerSectId ?? null)
  && cached.formationId === formation.formationId
  && cached.x === x
  && cached.y === y
  && cached.eyeInstanceId === (formation.eyeInstanceId ?? formation.instanceId)
  && cached.eyeX === eyeX
  && cached.eyeY === eyeY
  && cached.radius === (isEyeProjection ? 1 : formation.stats.radius)
  && cached.rangeShape === formation.template.range.shape
  && cached.active === formation.active
  && cached.hp === hp
  && cached.maxHp === maxHp
  && cached.remainingAuraBudget === remainingAuraBudget
  && cached.remainingSpiritStoneBudget === remainingSpiritStoneBudget) {
  return cached.projection;
 }
 const projection = freezeRuntimeProjection(buildRuntimeFormationProjection(formation, role));
 runtimeFormationProjectionCache.set(formation, {
  ...(cachedByRole ?? {}),
  [cacheKey]: {
   lifecycle,
   name: formation.name,
   ownerPlayerId: formation.ownerPlayerId,
   ownerSectId: formation.ownerSectId ?? null,
   formationId: formation.formationId,
   x,
   y,
   eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
   eyeX,
   eyeY,
   radius: isEyeProjection ? 1 : formation.stats.radius,
   rangeShape: formation.template.range.shape,
   active: formation.active,
   hp,
   maxHp,
   remainingAuraBudget,
   remainingSpiritStoneBudget,
   projection,
  },
 });
 return projection;
}

export function freezeRuntimeProjection(projection) {
 if (process.env.NODE_ENV !== 'production') {
  return Object.freeze(projection);
 }
 return projection;
}

export function resolveFormationRuntimeVisual(template) {
 const visual: any = typeof resolveFormationVisual === 'function'
  ? resolveFormationVisual(template)
  : { char: '◎', color: '#4da3ff', showText: true, rangeHighlightColor: '#3b82f6' };
 return {
  char: visual.char,
  color: visual.color,
  showText: visual.showText !== false,
  rangeHighlightColor: visual.rangeHighlightColor,
  boundaryChar: visual.boundaryChar,
  boundaryColor: visual.boundaryColor,
  boundaryRangeHighlightColor: visual.boundaryRangeHighlightColor,
  eyeVisibleWithoutSenseQi: visual.eyeVisibleWithoutSenseQi === true,
  rangeVisibleWithoutSenseQi: visual.rangeVisibleWithoutSenseQi === true,
  boundaryVisibleWithoutSenseQi: visual.boundaryVisibleWithoutSenseQi === true,
 };
}

export function resolveFormationAuraPerSpiritStone(template) {
 return typeof resolveFormationCostConfig === 'function'
  ? resolveFormationCostConfig(template).auraPerSpiritStone
  : FORMATION_AURA_PER_SPIRIT_STONE;
}

export function resolveFormationRefillAuraBudget(formation, spiritStoneCount) {
 if (typeof isFormationSetupInput === 'function' && isFormationSetupInput(formation?.allocation)) {
  return Math.max(1, Math.round(Number(formation?.stats?.totalAuraBudget) || 1));
 }
 return Math.round(Math.max(1, Math.trunc(Number(spiritStoneCount) || 1)) * resolveFormationAuraPerSpiritStone(formation.template) * formation.diskMultiplier);
}

export function serializeFormation(formation) {
 return {
  instanceId: formation.instanceId,
  id: formation.id,
  ownerPlayerId: formation.ownerPlayerId,
  ownerSectId: formation.ownerSectId ?? null,
  formationId: formation.formationId,
  lifecycle: normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle),
  diskItemId: formation.diskItemId,
  diskTier: formation.diskTier,
  diskMultiplier: formation.diskMultiplier,
  spiritStoneCount: formation.spiritStoneCount,
  qiCost: formation.qiCost,
  x: formation.x,
  y: formation.y,
  eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
  eyeX: Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
  eyeY: Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
  allocation: { ...formation.allocation },
  active: formation.active !== false,
  remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
  remainingQiBudget: resolveFormationRemainingQiBudget(formation),
  remainingSpiritStoneBudget: resolveFormationRemainingSpiritStoneBudget(formation),
  radius: Math.max(1, Math.trunc(Number(formation.stats?.radius) || 1)),
  createdAt: formation.createdAt,
  updatedAt: formation.updatedAt,
 };
}

export function resolveNextFormationUpdatedAt(formation) {
 const previous = Math.max(0, Math.trunc(Number(formation?.updatedAt) || 0));
 return Math.max(Date.now(), previous + 1);
}

export async function upsertFormationStateRow(client, instanceId, formation) {
 await client.query(`
        INSERT INTO ${INSTANCE_FORMATION_STATE_TABLE}(
            instance_id,
            formation_instance_id,
            owner_player_id,
            owner_sect_id,
            formation_id,
            lifecycle,
            disk_item_id,
            disk_tier,
            disk_multiplier,
            spirit_stone_count,
            qi_cost,
            x,
            y,
            eye_instance_id,
            eye_x,
            eye_y,
            allocation_payload,
            active,
            remaining_aura_budget,
            remaining_qi_budget,
            remaining_spirit_stone_budget,
            created_at_ms,
            updated_at_ms,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17::jsonb, $18, $19, $20, $21, $22, $23, now()
        )
        ON CONFLICT (instance_id, formation_instance_id)
        DO UPDATE SET
            owner_player_id = EXCLUDED.owner_player_id,
            owner_sect_id = EXCLUDED.owner_sect_id,
            formation_id = EXCLUDED.formation_id,
            lifecycle = EXCLUDED.lifecycle,
            disk_item_id = EXCLUDED.disk_item_id,
            disk_tier = EXCLUDED.disk_tier,
            disk_multiplier = EXCLUDED.disk_multiplier,
            spirit_stone_count = EXCLUDED.spirit_stone_count,
            qi_cost = EXCLUDED.qi_cost,
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            eye_instance_id = EXCLUDED.eye_instance_id,
            eye_x = EXCLUDED.eye_x,
            eye_y = EXCLUDED.eye_y,
            allocation_payload = EXCLUDED.allocation_payload,
            active = EXCLUDED.active,
            remaining_aura_budget = EXCLUDED.remaining_aura_budget,
            remaining_qi_budget = EXCLUDED.remaining_qi_budget,
            remaining_spirit_stone_budget = EXCLUDED.remaining_spirit_stone_budget,
            created_at_ms = EXCLUDED.created_at_ms,
            updated_at_ms = EXCLUDED.updated_at_ms,
            updated_at = now()
        WHERE ${INSTANCE_FORMATION_STATE_TABLE}.updated_at_ms <= EXCLUDED.updated_at_ms
    `, [
  instanceId,
  formation.id,
  formation.ownerPlayerId,
  formation.ownerSectId,
  formation.formationId,
  formation.lifecycle,
  formation.diskItemId,
  formation.diskTier,
  formation.diskMultiplier,
  formation.spiritStoneCount,
  formation.qiCost,
  formation.x,
  formation.y,
  formation.eyeInstanceId,
  formation.eyeX,
  formation.eyeY,
  JSON.stringify(formation.allocation ?? {}),
  formation.active !== false,
  formation.remainingAuraBudget,
  formation.remainingQiBudget,
  formation.remainingSpiritStoneBudget,
  formation.createdAt,
  formation.updatedAt,
 ]);
}

export async function lockFormationStateRow(client, formationInstanceId) {
 await client.query(
  'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
  [FORMATION_LOCK_NAMESPACE, formationInstanceId],
 );
}

export async function assertFormationInstanceLeaseFence(
 client: PoolClient,
 instanceId: string,
 fence: InstanceLeaseWriteFence | null,
): Promise<void> {
 if (!fence) {
  return;
 }
 if (normalizeInstanceId(fence.instanceId) !== instanceId) {
  throw new Error(`formation_instance_lease_fence_instance_mismatch:${instanceId}`);
 }
 await assertInstanceLeaseWriteFence(client, {
  instanceId,
  expectedAssignedNodeId: fence.assignedNodeId,
  expectedLeaseToken: fence.leaseToken,
  expectedOwnershipEpoch: fence.ownershipEpoch,
  conflictCode: 'formation_instance_lease_fencing_conflict',
 });
}

export async function deleteFormationStateRow(client, instanceId, formationInstanceId, removedAt) {
 await client.query(
  `DELETE FROM ${INSTANCE_FORMATION_STATE_TABLE}
         WHERE instance_id = $1
           AND formation_instance_id = $2
           AND updated_at_ms <= $3`,
  [instanceId, formationInstanceId, Math.max(0, Math.trunc(Number(removedAt) || 0))],
 );
}

export function extractFormationSerial(formationId) {
 const serial = Number.parseInt(String(formationId).split(':').pop() ?? '', 10);
 return Number.isFinite(serial) ? Math.max(0, serial) : 0;
}

export function normalizeDiskMultiplier(item) {
 if (Number.isFinite(item?.formationDiskMultiplier)) {
  return Math.max(1, Number(item.formationDiskMultiplier));
 }
 const tier = resolveFormationDiskTier(item);
 return FORMATION_DISK_TIER_MULTIPLIERS[tier] ?? 1;
}

export function resolveInventoryItemInstanceId(payload, playerRuntimeService, playerId) {
 const itemInstanceId = normalizeOptionalString(payload?.itemRef?.itemInstanceId)
  || normalizeOptionalString(payload?.itemInstanceId)
  || normalizeOptionalString(payload?.expectedItemInstanceId);
 if (!itemInstanceId) {
  playerRuntimeService.repairInventoryItemInstanceIds(playerId);
  throw new BadRequestException('背包物品身份已修复，请重新选择。');
 }
 return itemInstanceId;
}

export function resolveFormationDiskTier(item) {
 if (typeof item?.formationDiskTier === 'string' && item.formationDiskTier.length > 0) {
  return item.formationDiskTier;
 }
 const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
 if (itemId === 'formation_disk.mortal') {
  return 'mortal';
 }
 if (itemId === 'formation_disk.yellow') {
  return 'yellow';
 }
 if (itemId === 'formation_disk.mystic') {
  return 'mystic';
 }
 if (itemId === 'formation_disk.earth') {
  return 'earth';
 }
 return null;
}

export function touchRuntimeInstanceRevision(deps, instanceId) {
 const instance = typeof deps?.getInstanceRuntime === 'function'
  ? deps.getInstanceRuntime(instanceId)
  : null;
 touchInstanceRevision(instance);
}

export function dispersePlayerQiSpend(deps, player, qiAmount) {
 const instance = typeof deps?.getInstanceRuntime === 'function'
  ? deps.getInstanceRuntime(player?.instanceId)
  : null;
 instance?.disperseQiAt?.(player?.x, player?.y, qiAmount);
}

export function touchInstanceRevision(instance) {
 if (!instance || !Number.isFinite(Number(instance.worldRevision))) {
  return;
 }
 instance.worldRevision += 1;
}

export function normalizePlayerId(player) {
 return normalizeOptionalString(player?.playerId ?? player?.id);
}

export function resolveFormationMaintenanceRate(player) {
 const output = Math.max(0, Number(player?.attrs?.numericStats?.maxQiOutputPerTick ?? player?.numericStats?.maxQiOutputPerTick) || 0);
 return Math.max(1, Math.floor(output));
}

export function markPlayerRuntimeDirty(player, domains, playerRuntimeService) {
 if (player?.dirtyDomains && typeof player.dirtyDomains.add === 'function') {
  for (const domain of domains) {
   player.dirtyDomains.add(domain);
  }
 }
 if (typeof playerRuntimeService?.bumpPersistentRevision === 'function') {
  playerRuntimeService.bumpPersistentRevision(player);
 }
}

/** 首个阵法资产 tick 前必须先把 job 切换写入真源，不能放宽后续 CAS 栅栏。 */
export async function ensureFormationMaintenanceActiveJobReady(playerId, player, deps) {
 const dirtyDomains = player?.dirtyDomains;
 const playerRuntimeService = deps?.playerRuntimeService;
 const isPersistenceDomainPersisted = playerRuntimeService?.isPersistenceDomainPersisted;
 const canVerifyPersistedDomain = typeof isPersistenceDomainPersisted === 'function';
 const activeJobPersisted = canVerifyPersistedDomain
  ? isPersistenceDomainPersisted.call(playerRuntimeService, playerId, 'active_job') === true
  : !dirtyDomains?.has?.('active_job');
 if (activeJobPersisted) {
  return;
 }
 const flushPlayerDomains = deps?.playerPersistenceFlushService?.flushPlayerDomains;
 if (typeof flushPlayerDomains !== 'function') {
  throw new ServiceUnavailableException('formation_maintenance_active_job_sync_pending');
 }
 const flushed = await flushPlayerDomains.call(
  deps.playerPersistenceFlushService,
  playerId,
  ['active_job'],
  { forceCurrentSnapshot: true },
 );
 const persistedAfterFlush = canVerifyPersistedDomain
  ? isPersistenceDomainPersisted.call(playerRuntimeService, playerId, 'active_job') === true
  : flushed === true && !dirtyDomains?.has?.('active_job');
 if (!persistedAfterFlush) {
  throw new ServiceUnavailableException('formation_maintenance_active_job_sync_pending');
 }
}

export function formatInteger(value) {
 return formatDisplayInteger(Math.max(0, Math.floor(Number(value) || 0)));
}
