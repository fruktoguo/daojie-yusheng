import { Direction, TemporaryBuffState } from '@mud/shared';
import { ContentService } from './content.service';
import { MapService, MonsterSpawnConfig } from './map.service';
import {
  MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
} from '../constants/gameplay/monster';
import {
  dehydrateTemporaryBuff,
  hydrateTemporaryBuffSnapshots,
  normalizePersistedTemporaryBuffSnapshot,
  PersistedTemporaryBuffSnapshot,
} from './temporary-buff-storage';

/** PendingMonsterSkillCast：定义该接口的能力与字段约束。 */
export interface PendingMonsterSkillCast {
/** skillId：定义该变量以承载业务值。 */
  skillId: string;
/** targetX：定义该变量以承载业务值。 */
  targetX: number;
/** targetY：定义该变量以承载业务值。 */
  targetY: number;
/** remainingTicks：定义该变量以承载业务值。 */
  remainingTicks: number;
/** qiCost：定义该变量以承载业务值。 */
  qiCost: number;
  warningColor?: string;
}

/** PersistedMonsterRuntimeRecord：定义该接口的能力与字段约束。 */
export interface PersistedMonsterRuntimeRecord {
/** runtimeId：定义该变量以承载业务值。 */
  runtimeId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
  qi?: number;
/** alive：定义该变量以承载业务值。 */
  alive: boolean;
/** respawnLeft：定义该变量以承载业务值。 */
  respawnLeft: number;
  temporaryBuffs?: PersistedTemporaryBuffSnapshot[];
  skillCooldowns?: Record<string, number>;
  damageContributors?: Record<string, number>;
  facing?: Direction;
  targetPlayerId?: string;
  lastSeenTargetX?: number;
  lastSeenTargetY?: number;
  lastSeenTargetTick?: number;
  pendingCast?: PendingMonsterSkillCast;
}

/** PersistedMonsterRuntimeSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedMonsterRuntimeSnapshot {
/** version：定义该变量以承载业务值。 */
  version: 1 | 2 | 3 | 4;
/** maps：定义该变量以承载业务值。 */
  maps: Record<string, PersistedMonsterRuntimeRecord[]>;
  spawnAccelerationStates?: Record<string, PersistedMonsterSpawnAccelerationRecord[]>;
}

/** MonsterSpawnAccelerationState：定义该接口的能力与字段约束。 */
export interface MonsterSpawnAccelerationState {
/** spawnKey：定义该变量以承载业务值。 */
  spawnKey: string;
/** respawnSpeedBonusPercent：定义该变量以承载业务值。 */
  respawnSpeedBonusPercent: number;
/** clearDeadlineTick：定义该变量以承载业务值。 */
  clearDeadlineTick: number;
}

/** PersistedMonsterSpawnAccelerationRecord：定义该接口的能力与字段约束。 */
export interface PersistedMonsterSpawnAccelerationRecord {
/** spawnKey：定义该变量以承载业务值。 */
  spawnKey: string;
/** respawnSpeedBonusPercent：定义该变量以承载业务值。 */
  respawnSpeedBonusPercent: number;
/** clearDeadlineTick：定义该变量以承载业务值。 */
  clearDeadlineTick: number;
}

/** PersistedNpcShopRuntimeRecord：定义该接口的能力与字段约束。 */
export interface PersistedNpcShopRuntimeRecord {
/** refreshWindowStartMs：定义该变量以承载业务值。 */
  refreshWindowStartMs: number;
/** soldQuantity：定义该变量以承载业务值。 */
  soldQuantity: number;
}

/** PersistedNpcShopRuntimeSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedNpcShopRuntimeSnapshot {
/** version：定义该变量以承载业务值。 */
  version: 1;
/** items：定义该变量以承载业务值。 */
  items: Record<string, PersistedNpcShopRuntimeRecord>;
}

/** RuntimeMonsterLike：定义该接口的能力与字段约束。 */
interface RuntimeMonsterLike extends MonsterSpawnConfig {
/** runtimeId：定义该变量以承载业务值。 */
  runtimeId: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** spawnKey：定义该变量以承载业务值。 */
  spawnKey: string;
/** spawnX：定义该变量以承载业务值。 */
  spawnX: number;
/** spawnY：定义该变量以承载业务值。 */
  spawnY: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** alive：定义该变量以承载业务值。 */
  alive: boolean;
/** respawnLeft：定义该变量以承载业务值。 */
  respawnLeft: number;
/** temporaryBuffs：定义该变量以承载业务值。 */
  temporaryBuffs: TemporaryBuffState[];
/** skillCooldowns：定义该变量以承载业务值。 */
  skillCooldowns: Record<string, number>;
/** damageContributors：定义该变量以承载业务值。 */
  damageContributors: Map<string, number>;
  facing?: Direction;
  targetPlayerId?: string;
  lastSeenTargetX?: number;
  lastSeenTargetY?: number;
  lastSeenTargetTick?: number;
  pendingCast?: PendingMonsterSkillCast;
}

/** DomainDeps：定义该接口的能力与字段约束。 */
interface DomainDeps {
  syncMonsterRuntimeResources: (
    runtime: RuntimeMonsterLike,
/** resourceDelta：定义该变量以承载业务值。 */
    resourceDelta: { previousHp: number; previousQi: number },
  ) => void;
  findSpawnPosition: (mapId: string, runtime: RuntimeMonsterLike) => { x: number; y: number } | null;
  areAllMonstersAlive: (monsters: RuntimeMonsterLike[]) => boolean;
}

/** WorldRuntimePersistenceDomain：封装相关状态与行为。 */
export class WorldRuntimePersistenceDomain {
  constructor(
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly deps: DomainDeps,
  ) {}

/** normalizePersistedNpcShopRuntimeRecord：执行对应的业务逻辑。 */
  normalizePersistedNpcShopRuntimeRecord(raw: unknown): PersistedNpcShopRuntimeRecord | null {
/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Partial<PersistedNpcShopRuntimeRecord>;
    if (
      !Number.isInteger(candidate?.refreshWindowStartMs)
      || !Number.isInteger(candidate?.soldQuantity)
      || Number(candidate.refreshWindowStartMs) < 0
      || Number(candidate.soldQuantity) < 0
    ) {
      return null;
    }
    return {
      refreshWindowStartMs: Number(candidate.refreshWindowStartMs),
      soldQuantity: Number(candidate.soldQuantity),
    };
  }

/** buildAllowedMonsterRuntimeIds：执行对应的业务逻辑。 */
  buildAllowedMonsterRuntimeIds(mapId: string): Set<string> {
/** result：定义该变量以承载业务值。 */
    const result = new Set<string>();
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      for (let index = 0; index < spawn.maxAlive; index += 1) {
        result.add(this.buildMonsterRuntimeId(mapId, spawn.id, spawn.x, spawn.y, index));
      }
    }
    return result;
  }

/** buildAllowedMonsterSpawnKeys：执行对应的业务逻辑。 */
  buildAllowedMonsterSpawnKeys(mapId: string): Set<string> {
/** result：定义该变量以承载业务值。 */
    const result = new Set<string>();
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      if (spawn.tier !== 'mortal_blood') {
        continue;
      }
      result.add(this.buildMonsterSpawnKey(mapId, spawn.id, spawn.x, spawn.y));
    }
    return result;
  }

  buildMonsterSpawnKey(
    mapId: string,
    spawnId: string,
    spawnX: number,
    spawnY: number,
  ): string {
    return `monster_spawn:${mapId}:${spawnId}:${spawnX}:${spawnY}`;
  }

  buildMonsterRuntimeId(
    mapId: string,
    spawnId: string,
    spawnX: number,
    spawnY: number,
    index: number,
  ): string {
    return `monster:${mapId}:${spawnId}:${spawnX}:${spawnY}:${index}`;
  }

/** captureMonsterRuntimeState：执行对应的业务逻辑。 */
  captureMonsterRuntimeState(monsters: RuntimeMonsterLike[]): Map<string, PersistedMonsterRuntimeRecord> {
/** result：定义该变量以承载业务值。 */
    const result = new Map<string, PersistedMonsterRuntimeRecord>();
    for (const monster of monsters) {
      result.set(monster.runtimeId, this.captureMonsterRuntimeRecord(monster));
    }
    return result;
  }

  captureMonsterSpawnAccelerationState(
    states: Iterable<MonsterSpawnAccelerationState>,
  ): Map<string, PersistedMonsterSpawnAccelerationRecord> {
/** result：定义该变量以承载业务值。 */
    const result = new Map<string, PersistedMonsterSpawnAccelerationRecord>();
    for (const state of states) {
      result.set(state.spawnKey, this.captureMonsterSpawnAccelerationRecord(state));
    }
    return result;
  }

/** captureMonsterRuntimeRecord：执行对应的业务逻辑。 */
  captureMonsterRuntimeRecord(monster: RuntimeMonsterLike): PersistedMonsterRuntimeRecord {
    return {
      runtimeId: monster.runtimeId,
      x: monster.x,
      y: monster.y,
      hp: monster.hp,
      qi: monster.qi,
      alive: monster.alive,
      respawnLeft: monster.respawnLeft,
      temporaryBuffs: monster.temporaryBuffs.length > 0
        ? monster.temporaryBuffs.map((buff) => dehydrateTemporaryBuff(buff, this.contentService))
        : undefined,
      skillCooldowns: Object.keys(monster.skillCooldowns).length > 0
        ? { ...monster.skillCooldowns }
        : undefined,
      pendingCast: monster.pendingCast
        ? { ...monster.pendingCast }
        : undefined,
      damageContributors: monster.damageContributors.size > 0
        ? Object.fromEntries([...monster.damageContributors.entries()].map(([playerId, damage]) => [playerId, damage]))
        : undefined,
      facing: monster.facing,
      targetPlayerId: monster.targetPlayerId,
      lastSeenTargetX: monster.lastSeenTargetX,
      lastSeenTargetY: monster.lastSeenTargetY,
      lastSeenTargetTick: monster.lastSeenTargetTick,
    };
  }

  captureMonsterSpawnAccelerationRecord(
    state: MonsterSpawnAccelerationState,
  ): PersistedMonsterSpawnAccelerationRecord {
    return {
      spawnKey: state.spawnKey,
      respawnSpeedBonusPercent: this.normalizeMonsterRespawnSpeedBonusPercent(state.respawnSpeedBonusPercent),
      clearDeadlineTick: Math.max(0, Math.round(state.clearDeadlineTick)),
    };
  }

  applyPersistedMonsterState(
    mapId: string,
    runtime: RuntimeMonsterLike,
    persisted: PersistedMonsterRuntimeRecord,
  ): void {
/** persistedHp：定义该变量以承载业务值。 */
    const persistedHp = Math.round(persisted.hp);
/** persistedQi：定义该变量以承载业务值。 */
    const persistedQi = Math.round(persisted.qi ?? runtime.qi);
    runtime.hp = Math.max(0, Math.min(runtime.maxHp, persistedHp));
    runtime.qi = Math.max(0, Math.min(Math.max(0, Math.round(runtime.numericStats.maxQi)), persistedQi));
    runtime.facing = persisted.facing;
    runtime.targetPlayerId = typeof persisted.targetPlayerId === 'string' ? persisted.targetPlayerId : undefined;
    runtime.lastSeenTargetX = Number.isInteger(persisted.lastSeenTargetX) ? Number(persisted.lastSeenTargetX) : undefined;
    runtime.lastSeenTargetY = Number.isInteger(persisted.lastSeenTargetY) ? Number(persisted.lastSeenTargetY) : undefined;
    runtime.lastSeenTargetTick = Number.isInteger(persisted.lastSeenTargetTick) ? Number(persisted.lastSeenTargetTick) : undefined;
    runtime.temporaryBuffs = hydrateTemporaryBuffSnapshots(persisted.temporaryBuffs, this.contentService);
    this.deps.syncMonsterRuntimeResources(runtime, { previousHp: persistedHp, previousQi: persistedQi });
    runtime.skillCooldowns = Object.fromEntries(
      Object.entries(persisted.skillCooldowns ?? {})
        .filter(([, ticks]) => Number.isFinite(ticks) && Number(ticks) > 0)
        .map(([skillId, ticks]) => [skillId, Math.max(1, Math.round(Number(ticks)))])
    );
    runtime.pendingCast = this.normalizePendingMonsterSkillCast(persisted.pendingCast);
    runtime.damageContributors = new Map<string, number>(
      Object.entries(persisted.damageContributors ?? {})
        .filter(([, damage]) => Number.isFinite(damage) && Number(damage) > 0)
        .map(([playerId, damage]) => [playerId, Math.max(1, Math.round(Number(damage)))]),
    );

/** canRestoreAlive：定义该变量以承载业务值。 */
    const canRestoreAlive = persisted.alive === true && runtime.hp > 0;
/** preferredX：定义该变量以承载业务值。 */
    const preferredX = Number.isInteger(persisted.x) ? Number(persisted.x) : runtime.spawnX;
/** preferredY：定义该变量以承载业务值。 */
    const preferredY = Number.isInteger(persisted.y) ? Number(persisted.y) : runtime.spawnY;
    if (canRestoreAlive && this.mapService.isWalkable(mapId, preferredX, preferredY, { actorType: 'monster' })) {
      runtime.x = preferredX;
      runtime.y = preferredY;
      runtime.alive = true;
      runtime.respawnLeft = 0;
      this.mapService.addOccupant(mapId, runtime.x, runtime.y, runtime.runtimeId, 'monster');
      return;
    }

/** fallbackPos：定义该变量以承载业务值。 */
    const fallbackPos = canRestoreAlive ? this.deps.findSpawnPosition(mapId, runtime) : null;
    if (canRestoreAlive && fallbackPos && this.mapService.isWalkable(mapId, fallbackPos.x, fallbackPos.y, { actorType: 'monster' })) {
      runtime.x = fallbackPos.x;
      runtime.y = fallbackPos.y;
      runtime.alive = true;
      runtime.respawnLeft = 0;
      this.mapService.addOccupant(mapId, runtime.x, runtime.y, runtime.runtimeId, 'monster');
      return;
    }

    runtime.x = preferredX;
    runtime.y = preferredY;
    runtime.alive = false;
    runtime.pendingCast = undefined;
    runtime.respawnLeft = Math.max(1, Number.isFinite(persisted.respawnLeft) ? Math.round(persisted.respawnLeft) : runtime.respawnTicks);
  }

  createDefaultMonsterSpawnAccelerationState(
    spawnKey: string,
    monsters: RuntimeMonsterLike[],
    currentTick: number,
  ): MonsterSpawnAccelerationState {
/** sample：定义该变量以承载业务值。 */
    const sample = monsters[0];
/** respawnSpeedBonusPercent：定义该变量以承载业务值。 */
    const respawnSpeedBonusPercent = 0;
    return {
      spawnKey,
      respawnSpeedBonusPercent,
      clearDeadlineTick: sample && this.deps.areAllMonstersAlive(monsters)
        ? currentTick + this.resolveMonsterRespawnTicksWithBonus(sample.respawnTicks, respawnSpeedBonusPercent)
        : 0,
    };
  }

  applyPersistedMonsterSpawnAccelerationState(
    persisted: PersistedMonsterSpawnAccelerationRecord,
  ): MonsterSpawnAccelerationState {
    return {
      spawnKey: persisted.spawnKey,
      respawnSpeedBonusPercent: this.normalizeMonsterRespawnSpeedBonusPercent(persisted.respawnSpeedBonusPercent),
      clearDeadlineTick: Math.max(0, Math.round(persisted.clearDeadlineTick)),
    };
  }

/** normalizePersistedMonsterRuntimeRecord：执行对应的业务逻辑。 */
  normalizePersistedMonsterRuntimeRecord(raw: unknown): PersistedMonsterRuntimeRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Partial<PersistedMonsterRuntimeRecord>;
    if (
      typeof candidate.runtimeId !== 'string'
      || !Number.isInteger(candidate.x)
      || !Number.isInteger(candidate.y)
      || !Number.isFinite(candidate.hp)
      || typeof candidate.alive !== 'boolean'
      || !Number.isFinite(candidate.respawnLeft)
    ) {
      return null;
    }

    return {
      runtimeId: candidate.runtimeId,
      x: Number(candidate.x),
      y: Number(candidate.y),
      hp: Math.max(0, Math.round(Number(candidate.hp))),
      qi: Number.isFinite(candidate.qi) ? Math.max(0, Math.round(Number(candidate.qi))) : undefined,
      alive: candidate.alive,
      respawnLeft: Math.max(0, Math.round(Number(candidate.respawnLeft))),
      temporaryBuffs: Array.isArray(candidate.temporaryBuffs)
        ? candidate.temporaryBuffs
            .map((buff) => normalizePersistedTemporaryBuffSnapshot(buff))
            .filter((buff): buff is PersistedTemporaryBuffSnapshot => buff !== null)
        : undefined,
/** skillCooldowns：定义该变量以承载业务值。 */
      skillCooldowns: candidate.skillCooldowns && typeof candidate.skillCooldowns === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.skillCooldowns)
              .filter(([, ticks]) => Number.isFinite(ticks) && Number(ticks) > 0)
              .map(([skillId, ticks]) => [skillId, Math.max(1, Math.round(Number(ticks)))])
          )
        : undefined,
      pendingCast: this.normalizePendingMonsterSkillCast(candidate.pendingCast),
/** damageContributors：定义该变量以承载业务值。 */
      damageContributors: candidate.damageContributors && typeof candidate.damageContributors === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.damageContributors)
              .filter(([, damage]) => Number.isFinite(damage) && Number(damage) > 0)
              .map(([playerId, damage]) => [playerId, Math.max(1, Math.round(Number(damage)))])
          )
        : undefined,
      facing: candidate.facing,
/** targetPlayerId：定义该变量以承载业务值。 */
      targetPlayerId: typeof candidate.targetPlayerId === 'string' ? candidate.targetPlayerId : undefined,
      lastSeenTargetX: Number.isInteger(candidate.lastSeenTargetX) ? Number(candidate.lastSeenTargetX) : undefined,
      lastSeenTargetY: Number.isInteger(candidate.lastSeenTargetY) ? Number(candidate.lastSeenTargetY) : undefined,
      lastSeenTargetTick: Number.isInteger(candidate.lastSeenTargetTick) ? Number(candidate.lastSeenTargetTick) : undefined,
    };
  }

/** normalizePendingMonsterSkillCast：执行对应的业务逻辑。 */
  normalizePendingMonsterSkillCast(raw: unknown): PendingMonsterSkillCast | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }
/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Record<string, unknown>;
    if (
      typeof candidate.skillId !== 'string'
      || !Number.isInteger(candidate.targetX)
      || !Number.isInteger(candidate.targetY)
      || !Number.isFinite(candidate.remainingTicks)
      || !Number.isFinite(candidate.qiCost)
    ) {
      return undefined;
    }
    return {
      skillId: candidate.skillId,
      targetX: Number(candidate.targetX),
      targetY: Number(candidate.targetY),
      remainingTicks: Math.max(1, Math.round(Number(candidate.remainingTicks))),
      qiCost: Math.max(0, Math.round(Number(candidate.qiCost))),
/** warningColor：定义该变量以承载业务值。 */
      warningColor: typeof candidate.warningColor === 'string' && candidate.warningColor.trim().length > 0
        ? candidate.warningColor.trim()
        : undefined,
    };
  }

  normalizePersistedMonsterSpawnAccelerationRecord(
    raw: unknown,
  ): PersistedMonsterSpawnAccelerationRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Partial<PersistedMonsterSpawnAccelerationRecord>;
    if (
      typeof candidate.spawnKey !== 'string'
      || !Number.isFinite(candidate.respawnSpeedBonusPercent)
      || !Number.isFinite(candidate.clearDeadlineTick)
    ) {
      return null;
    }

    return {
      spawnKey: candidate.spawnKey,
      respawnSpeedBonusPercent: this.normalizeMonsterRespawnSpeedBonusPercent(Number(candidate.respawnSpeedBonusPercent)),
      clearDeadlineTick: Math.max(0, Math.round(Number(candidate.clearDeadlineTick))),
    };
  }

/** normalizeMonsterRespawnSpeedBonusPercent：执行对应的业务逻辑。 */
  normalizeMonsterRespawnSpeedBonusPercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = Math.round(Number(value) / MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT)
      * MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT;
    return Math.max(0, Math.min(MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT, normalized));
  }

/** resolveMonsterRespawnTicksWithBonus：执行对应的业务逻辑。 */
  resolveMonsterRespawnTicksWithBonus(respawnTicks: number, bonusPercent: number): number {
/** safeTicks：定义该变量以承载业务值。 */
    const safeTicks = Math.max(1, Math.round(respawnTicks));
/** safeBonusPercent：定义该变量以承载业务值。 */
    const safeBonusPercent = this.normalizeMonsterRespawnSpeedBonusPercent(bonusPercent);
    return Math.max(
      1,
      Math.round(
        safeTicks * MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT
          / (MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT + safeBonusPercent),
      ),
    );
  }
}

