import { Injectable } from '@nestjs/common';

@Injectable()
export class PlayerOfflineGainService {
  async beginOfflineGainSession(playerId: string, startedAt?: number): Promise<void> {
    // TODO: migrate from player-runtime.service.ts
  }

  loadPendingOfflineGainReports(playerId: string): Promise<any[]> {
    // TODO: migrate from player-runtime.service.ts
    return Promise.resolve([]);
  }

  async acknowledgeOfflineGainReports(playerId: string, reportIds: string[]): Promise<void> {
    // TODO: migrate from player-runtime.service.ts
  }

  finalizeOfflineGainSessionForPlayer(player: any, endedAt?: number): Promise<any> {
    // TODO: migrate from player-runtime.service.ts
    return Promise.resolve(null);
  }

  captureOfflineGainBeforeTick(player: any): any {
    // TODO: migrate from player-runtime.service.ts
    return null;
  }

  accumulateOfflineGainAfterTick(player: any, beforeSnapshot: any): void {
    // TODO: migrate from player-runtime.service.ts
  }
}

// --- Standalone helpers ---

export function normalizeOfflineGainString(value: any): string {
  // TODO: migrate from player-runtime.service.ts
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOfflineGainCount(value: any): number {
  // TODO: migrate from player-runtime.service.ts
  return Math.max(0, Math.trunc(Number(value ?? 0) || 0));
}

export function normalizeOfflineGainSignedCount(value: any): number {
  // TODO: migrate from player-runtime.service.ts
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

export function buildOfflineGainSessionId(playerId: string, startedAt: number): string {
  // TODO: migrate from player-runtime.service.ts
  return '';
}

export function createEmptyOfflineGainReportParts(): any {
  // TODO: migrate from player-runtime.service.ts
  return { spiritStones: { gained: 0, lost: 0, net: 0 }, items: [], progress: [], techniques: [], professions: [] };
}

export function mergeOfflineGainSessionRecords(persistedSession: any, memorySession: any): any {
  // TODO: migrate from player-runtime.service.ts
  return null;
}

export function accumulateOfflineGainSessionDelta(session: any, beforeSnapshot: any, afterSnapshot: any, resolveProfessionExpToNext?: ((level: number) => number) | null): void {
  // TODO: migrate from player-runtime.service.ts
}

export function buildOfflineGainDeltaParts(before: any, after: any, resolveProfessionExpToNext?: ((level: number) => number) | null): any {
  // TODO: migrate from player-runtime.service.ts
  return createEmptyOfflineGainReportParts();
}

export function hasOfflineGainReportParts(parts: any): boolean {
  // TODO: migrate from player-runtime.service.ts
  return false;
}

export function normalizeOfflineGainReportParts(value: any): any {
  // TODO: migrate from player-runtime.service.ts
  return createEmptyOfflineGainReportParts();
}

export function buildOfflineGainSnapshot(player: any, contentTemplateRepository?: any, playerProgressionService?: any): any {
  // TODO: migrate from player-runtime.service.ts
  return null;
}

export function buildOfflineGainInventorySnapshot(items: any[], contentTemplateRepository?: any): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function buildOfflineGainTechniqueSnapshot(techniques: any[]): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function buildOfflineGainProfessionSnapshot(professionType: string, label: string, state: any, resolveExpToNext?: ((level: number) => number) | null): any {
  // TODO: migrate from player-runtime.service.ts
  return null;
}

export function buildOfflineGainExpStateSnapshot(state: any, options?: any): any {
  // TODO: migrate from player-runtime.service.ts
  return { level: 0, exp: 0, expToNext: 0, expToNextByLevel: null };
}

export function buildOfflineGainReportFromSession(player: any, session: any, endedAt: number, contentTemplateRepository?: any): any {
  // TODO: migrate from player-runtime.service.ts
  return null;
}

export function diffOfflineGainItems(beforeItems: any[], afterItems: any[]): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function diffOfflineGainProgress(before: any, after: any): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function diffOfflineGainTechniques(beforeTechniques: any[], afterTechniques: any[]): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function diffOfflineGainProfessions(beforeProfessions: any[], afterProfessions: any[], resolveExpToNext?: ((level: number) => number) | null): any[] {
  // TODO: migrate from player-runtime.service.ts
  return [];
}

export function calculateOfflineGainExpChange(before: any, after: any, options?: any): any {
  // TODO: migrate from player-runtime.service.ts
  return { expGained: 0, expLost: 0, netExp: 0, levelGain: 0, levelLoss: 0 };
}

export function calculateOfflineGainExpDelta(before: any, after: any, options?: any): any {
  // TODO: migrate from player-runtime.service.ts
  return { expGain: 0, levelGain: 0 };
}
