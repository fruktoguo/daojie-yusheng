import { Injectable } from '@nestjs/common';
import {
  gameplayConstants,
} from '@mud/shared';

export interface ThreatEntry {
  targetId: string;
  value: number;
  lastUpdatedAt: number;
}

export interface AddThreatParams {
  ownerId: string;
  targetId: string;
  baseThreat: number;
  targetExtraAggroRate?: number;
  distance?: number;
  multipliers?: number[];
  now?: number;
}

@Injectable()
export class ThreatService {
  private readonly tables = new Map<string, Map<string, ThreatEntry>>();

  getThreat(ownerId: string, targetId: string): number {
    return this.tables.get(ownerId)?.get(targetId)?.value ?? 0;
  }

  getThreatEntries(ownerId: string): ThreatEntry[] {
    return [...(this.tables.get(ownerId)?.values() ?? [])]
      .map((entry) => ({ ...entry }));
  }

  getSortedThreatEntries(ownerId: string): ThreatEntry[] {
    return this.getThreatEntries(ownerId)
      .sort((left, right) => right.value - left.value || right.lastUpdatedAt - left.lastUpdatedAt || left.targetId.localeCompare(right.targetId));
  }

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

  addThreat(params: AddThreatParams): number {
    const delta = this.calculateThreatDelta(params);
    if (delta <= 0) {
      return this.getThreat(params.ownerId, params.targetId);
    }
    const table = this.getOrCreateTable(params.ownerId);
    const existing = table.get(params.targetId);
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

  clearThreat(ownerId: string, targetId?: string): void {
    if (targetId === undefined) {
      this.tables.delete(ownerId);
      return;
    }
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
    const current = this.tables.get(ownerId)?.get(targetId);
    if (!current) {
      return 0;
    }
    const decay = current.value * gameplayConstants.LOST_TARGET_THREAT_DECAY_RATIO
      + Math.max(0, ownerMaxHp) * gameplayConstants.LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO;
    const next = this.normalizeThreatValue(current.value - decay);
    if (next <= 0) {
      this.clearThreat(ownerId, targetId);
      return 0;
    }
    current.value = next;
    current.lastUpdatedAt = now;
    return next;
  }

  clearTargetEverywhere(targetId: string): void {
    for (const [ownerId, table] of this.tables.entries()) {
      table.delete(targetId);
      if (table.size === 0) {
        this.tables.delete(ownerId);
      }
    }
  }

  clearAll(): void {
    this.tables.clear();
  }

  private calculateThreatDelta(params: AddThreatParams): number {
    const baseThreat = Number.isFinite(params.baseThreat) ? params.baseThreat : 0;
    if (baseThreat <= 0) {
      return 0;
    }
    const distanceMultiplier = this.getDistanceThreatMultiplier(params.distance ?? 1);
    const extraAggroMultiplier = this.getTargetExtraAggroMultiplier(params.targetExtraAggroRate ?? 0);
    const otherMultiplier = (params.multipliers ?? []).reduce((product, value) => {
      if (!Number.isFinite(value)) {
        return product;
      }
      return product * value;
    }, 1);
    return this.normalizeThreatValue(baseThreat * distanceMultiplier * extraAggroMultiplier * otherMultiplier);
  }

  private getDistanceThreatMultiplier(distance: number): number {
    if (!Number.isFinite(distance) || distance <= 1) {
      return 1;
    }
    return Math.pow(gameplayConstants.THREAT_DISTANCE_FALLOFF_PER_TILE, distance - 1);
  }

  private getTargetExtraAggroMultiplier(extraAggroRate: number): number {
    if (!Number.isFinite(extraAggroRate) || extraAggroRate === 0) {
      return 1;
    }
    if (extraAggroRate > 0) {
      return 1 + extraAggroRate / 100;
    }
    return 100 / (100 - extraAggroRate);
  }

  private normalizeThreatValue(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.min(gameplayConstants.MAX_THREAT_VALUE, value);
  }

  private getOrCreateTable(ownerId: string): Map<string, ThreatEntry> {
    const existing = this.tables.get(ownerId);
    if (existing) {
      return existing;
    }
    const created = new Map<string, ThreatEntry>();
    this.tables.set(ownerId, created);
    return created;
  }
}

