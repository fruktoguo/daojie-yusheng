import { Injectable } from '@nestjs/common';
import {
    DEFAULT_AGGRO_THRESHOLD,
    LOST_TARGET_THREAT_DECAY_RATIO,
    LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO,
    MAX_THREAT_VALUE,
    THREAT_DISTANCE_FALLOFF_PER_TILE,
} from '@mud/shared';

export interface RuntimeThreatEntry {
    targetId: string;
    value: number;
    lastUpdatedAt: number;
}

function normalizeThreatValue(value: number, fallback = 0): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return fallback;
    }
    return Math.min(MAX_THREAT_VALUE, normalized);
}

export function resolveThreatDistanceMultiplier(distance: number): number {
    const normalizedDistance = Math.max(0, Math.trunc(Number(distance) || 0));
    if (normalizedDistance <= 1) {
        return 1;
    }
    return THREAT_DISTANCE_FALLOFF_PER_TILE ** (normalizedDistance - 1);
}

export function resolveExtraAggroThreatMultiplier(extraAggroRate: number): number {
    const rate = Number(extraAggroRate) || 0;
    if (rate > 0) {
        return 1 + rate / 100;
    }
    if (rate < 0) {
        return 100 / (100 - rate);
    }
    return 1;
}

export function calculateThreatDelta(input: {
    baseThreat: number;
    distance?: number;
    extraAggroRate?: number;
    multipliers?: number[];
}): number {
    let delta = normalizeThreatValue(input.baseThreat, 0);
    if (delta <= 0) {
        return 0;
    }
    delta *= resolveThreatDistanceMultiplier(input.distance ?? 1);
    delta *= resolveExtraAggroThreatMultiplier(input.extraAggroRate ?? 0);
    for (const multiplier of input.multipliers ?? []) {
        const normalized = Number(multiplier);
        if (Number.isFinite(normalized) && normalized > 0) {
            delta *= normalized;
        }
    }
    return normalizeThreatValue(delta, 0);
}

function compareThreatEntries(left: RuntimeThreatEntry, right: RuntimeThreatEntry): number {
    return right.value - left.value
        || right.lastUpdatedAt - left.lastUpdatedAt
        || left.targetId.localeCompare(right.targetId, 'zh-Hans-CN');
}

@Injectable()
export class WorldRuntimeThreatService {
    private readonly threatByOwnerId = new Map<string, Map<string, RuntimeThreatEntry>>();

    buildPlayerOwnerId(playerId: string): string {
        return `player:${playerId}`;
    }

    buildPlayerTargetId(playerId: string): string {
        return `player:${playerId}`;
    }

    addThreat(ownerId: string, targetId: string, input: {
        baseThreat: number;
        distance?: number;
        extraAggroRate?: number;
        multipliers?: number[];
        now: number;
    }): number {
        const normalizedOwnerId = typeof ownerId === 'string' ? ownerId.trim() : '';
        const normalizedTargetId = typeof targetId === 'string' ? targetId.trim() : '';
        if (!normalizedOwnerId || !normalizedTargetId || normalizedOwnerId === normalizedTargetId) {
            return 0;
        }
        const delta = calculateThreatDelta(input);
        if (delta <= 0) {
            return this.getThreat(normalizedOwnerId, normalizedTargetId);
        }
        let table = this.threatByOwnerId.get(normalizedOwnerId);
        if (!table) {
            table = new Map();
            this.threatByOwnerId.set(normalizedOwnerId, table);
        }
        const existing = table.get(normalizedTargetId);
        const nextValue = normalizeThreatValue((existing?.value ?? 0) + delta, 0);
        table.set(normalizedTargetId, {
            targetId: normalizedTargetId,
            value: nextValue,
            lastUpdatedAt: Math.max(0, Math.trunc(Number(input.now) || 0)),
        });
        return nextValue;
    }

    getThreat(ownerId: string, targetId: string): number {
        const entry = this.threatByOwnerId.get(ownerId)?.get(targetId);
        return entry?.value ?? 0;
    }

    getThreatEntries(ownerId: string, threshold = 0): RuntimeThreatEntry[] {
        const table = this.threatByOwnerId.get(ownerId);
        if (!table) {
            return [];
        }
        const normalizedThreshold = Math.max(0, Number(threshold) || 0);
        const entries: RuntimeThreatEntry[] = [];
        for (const entry of table.values()) {
            if (entry.value >= normalizedThreshold) {
                entries.push(entry);
            }
        }
        entries.sort(compareThreatEntries);
        return entries;
    }

    getHighestThreatTarget(ownerId: string, canTarget: (entry: RuntimeThreatEntry) => boolean, threshold = DEFAULT_AGGRO_THRESHOLD): RuntimeThreatEntry | null {
        const table = this.threatByOwnerId.get(ownerId);
        if (!table) {
            return null;
        }
        const normalizedThreshold = Math.max(0, Number(threshold) || 0);
        let best: RuntimeThreatEntry | null = null;
        for (const entry of table.values()) {
            if (entry.value < normalizedThreshold || !canTarget(entry)) {
                continue;
            }
            if (!best || compareThreatEntries(entry, best) < 0) {
                best = entry;
            }
        }
        return best ? { ...best } : null;
    }

    multiplyThreat(ownerId: string, targetId: string, multiplier: number): number {
        const table = this.threatByOwnerId.get(ownerId);
        const entry = table?.get(targetId);
        if (!table || !entry) {
            return 0;
        }
        const normalizedMultiplier = Number(multiplier);
        if (!Number.isFinite(normalizedMultiplier) || normalizedMultiplier <= 0) {
            table.delete(targetId);
            if (table.size === 0) {
                this.threatByOwnerId.delete(ownerId);
            }
            return 0;
        }
        entry.value = normalizeThreatValue(entry.value * normalizedMultiplier, 0);
        if (entry.value <= 0) {
            table.delete(targetId);
        }
        if (table.size === 0) {
            this.threatByOwnerId.delete(ownerId);
        }
        return entry.value;
    }

    decayMissingTargets(ownerId: string, activeTargetIds: Set<string>, ownerMaxHp: number, now: number): void {
        const table = this.threatByOwnerId.get(ownerId);
        if (!table) {
            return;
        }
        const flatDecay = Math.max(0, Number(ownerMaxHp) || 0) * LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO;
        for (const [targetId, entry] of table) {
            if (activeTargetIds.has(targetId)) {
                continue;
            }
            const decay = entry.value * LOST_TARGET_THREAT_DECAY_RATIO + flatDecay;
            const next = entry.value - decay;
            if (!Number.isFinite(next) || next <= 0) {
                table.delete(targetId);
                continue;
            }
            entry.value = next;
            entry.lastUpdatedAt = Math.max(0, Math.trunc(Number(now) || 0));
        }
        if (table.size === 0) {
            this.threatByOwnerId.delete(ownerId);
        }
    }

    clearOwner(ownerId: string): void {
        this.threatByOwnerId.delete(ownerId);
    }

    clearTargetEverywhere(targetId: string): void {
        for (const [ownerId, table] of this.threatByOwnerId) {
            table.delete(targetId);
            if (table.size === 0) {
                this.threatByOwnerId.delete(ownerId);
            }
        }
    }
}
