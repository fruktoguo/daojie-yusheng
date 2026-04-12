import { Injectable } from '@nestjs/common';
import {
  gameplayConstants,
} from '@mud/shared';

/** ThreatEntry：定义该接口的能力与字段约束。 */
export interface ThreatEntry {
/** targetId：定义该变量以承载业务值。 */
  targetId: string;
/** value：定义该变量以承载业务值。 */
  value: number;
/** lastUpdatedAt：定义该变量以承载业务值。 */
  lastUpdatedAt: number;
}

/** AddThreatParams：定义该接口的能力与字段约束。 */
export interface AddThreatParams {
/** ownerId：定义该变量以承载业务值。 */
  ownerId: string;
/** targetId：定义该变量以承载业务值。 */
  targetId: string;
/** baseThreat：定义该变量以承载业务值。 */
  baseThreat: number;
  targetExtraAggroRate?: number;
  distance?: number;
  multipliers?: number[];
  now?: number;
}

@Injectable()
/** ThreatService：封装相关状态与行为。 */
export class ThreatService {
  private readonly tables = new Map<string, Map<string, ThreatEntry>>();

/** getThreat：执行对应的业务逻辑。 */
  getThreat(ownerId: string, targetId: string): number {
    return this.tables.get(ownerId)?.get(targetId)?.value ?? 0;
  }

/** getThreatEntries：执行对应的业务逻辑。 */
  getThreatEntries(ownerId: string): ThreatEntry[] {
    return [...(this.tables.get(ownerId)?.values() ?? [])]
      .map((entry) => ({ ...entry }));
  }

/** getSortedThreatEntries：执行对应的业务逻辑。 */
  getSortedThreatEntries(ownerId: string): ThreatEntry[] {
    return this.getThreatEntries(ownerId)
      .sort((left, right) => right.value - left.value || right.lastUpdatedAt - left.lastUpdatedAt || left.targetId.localeCompare(right.targetId));
  }

/** getPrimaryThreatTarget：执行对应的业务逻辑。 */
  getPrimaryThreatTarget(ownerId: string): string | null {
    return this.getSortedThreatEntries(ownerId)[0]?.targetId ?? null;
  }

  getHighestAttackableThreatTarget(ownerId: string, canAttack: (targetId: string) => boolean): string | null {
    for (const entry of this.getSortedThreatEntries(ownerId)) {
      if (canAttack(entry.targetId)) {
        return entry.targetId;
      }
    }
    return null;
  }

/** addThreat：执行对应的业务逻辑。 */
  addThreat(params: AddThreatParams): number {
/** delta：定义该变量以承载业务值。 */
    const delta = this.calculateThreatDelta(params);
    if (delta <= 0) {
      return this.getThreat(params.ownerId, params.targetId);
    }
/** table：定义该变量以承载业务值。 */
    const table = this.getOrCreateTable(params.ownerId);
/** existing：定义该变量以承载业务值。 */
    const existing = table.get(params.targetId);
/** nextValue：定义该变量以承载业务值。 */
    const nextValue = Math.min(
      gameplayConstants.MAX_THREAT_VALUE,
      (existing?.value ?? 0) + delta,
    );
    table.set(params.targetId, {
      targetId: params.targetId,
      value: nextValue,
      lastUpdatedAt: params.now ?? Date.now(),
    });
    return nextValue;
  }

  setThreat(ownerId: string, targetId: string, value: number, now = Date.now()): void {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizeThreatValue(value);
    if (normalized <= 0) {
      this.clearThreat(ownerId, targetId);
      return;
    }
    this.getOrCreateTable(ownerId).set(targetId, {
      targetId,
      value: normalized,
      lastUpdatedAt: now,
    });
  }

/** clearThreat：执行对应的业务逻辑。 */
  clearThreat(ownerId: string, targetId?: string): void {
    if (targetId === undefined) {
      this.tables.delete(ownerId);
      return;
    }
/** table：定义该变量以承载业务值。 */
    const table = this.tables.get(ownerId);
    if (!table) {
      return;
    }
    table.delete(targetId);
    if (table.size === 0) {
      this.tables.delete(ownerId);
    }
  }

  decayThreat(ownerId: string, targetId: string, ownerMaxHp: number, now = Date.now()): number {
/** current：定义该变量以承载业务值。 */
    const current = this.tables.get(ownerId)?.get(targetId);
    if (!current) {
      return 0;
    }
/** decay：定义该变量以承载业务值。 */
    const decay = current.value * gameplayConstants.LOST_TARGET_THREAT_DECAY_RATIO
      + Math.max(0, ownerMaxHp) * gameplayConstants.LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO;
/** next：定义该变量以承载业务值。 */
    const next = this.normalizeThreatValue(current.value - decay);
    if (next <= 0) {
      this.clearThreat(ownerId, targetId);
      return 0;
    }
    current.value = next;
    current.lastUpdatedAt = now;
    return next;
  }

/** clearTargetEverywhere：执行对应的业务逻辑。 */
  clearTargetEverywhere(targetId: string): void {
    for (const [ownerId, table] of this.tables.entries()) {
      table.delete(targetId);
      if (table.size === 0) {
        this.tables.delete(ownerId);
      }
    }
  }

/** clearAll：执行对应的业务逻辑。 */
  clearAll(): void {
    this.tables.clear();
  }

/** calculateThreatDelta：执行对应的业务逻辑。 */
  private calculateThreatDelta(params: AddThreatParams): number {
/** baseThreat：定义该变量以承载业务值。 */
    const baseThreat = Number.isFinite(params.baseThreat) ? params.baseThreat : 0;
    if (baseThreat <= 0) {
      return 0;
    }
/** distanceMultiplier：定义该变量以承载业务值。 */
    const distanceMultiplier = this.getDistanceThreatMultiplier(params.distance ?? 1);
/** extraAggroMultiplier：定义该变量以承载业务值。 */
    const extraAggroMultiplier = this.getTargetExtraAggroMultiplier(params.targetExtraAggroRate ?? 0);
/** otherMultiplier：定义该变量以承载业务值。 */
    const otherMultiplier = (params.multipliers ?? []).reduce((product, value) => {
      if (!Number.isFinite(value)) {
        return product;
      }
      return product * value;
    }, 1);
    return this.normalizeThreatValue(baseThreat * distanceMultiplier * extraAggroMultiplier * otherMultiplier);
  }

/** getDistanceThreatMultiplier：执行对应的业务逻辑。 */
  private getDistanceThreatMultiplier(distance: number): number {
    if (!Number.isFinite(distance) || distance <= 1) {
      return 1;
    }
    return Math.pow(gameplayConstants.THREAT_DISTANCE_FALLOFF_PER_TILE, distance - 1);
  }

/** getTargetExtraAggroMultiplier：执行对应的业务逻辑。 */
  private getTargetExtraAggroMultiplier(extraAggroRate: number): number {
    if (!Number.isFinite(extraAggroRate) || extraAggroRate === 0) {
      return 1;
    }
    if (extraAggroRate > 0) {
      return 1 + extraAggroRate / 100;
    }
    return 100 / (100 - extraAggroRate);
  }

/** normalizeThreatValue：执行对应的业务逻辑。 */
  private normalizeThreatValue(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.min(gameplayConstants.MAX_THREAT_VALUE, value);
  }

/** getOrCreateTable：执行对应的业务逻辑。 */
  private getOrCreateTable(ownerId: string): Map<string, ThreatEntry> {
/** existing：定义该变量以承载业务值。 */
    const existing = this.tables.get(ownerId);
    if (existing) {
      return existing;
    }
/** created：定义该变量以承载业务值。 */
    const created = new Map<string, ThreatEntry>();
    this.tables.set(ownerId, created);
    return created;
  }
}

