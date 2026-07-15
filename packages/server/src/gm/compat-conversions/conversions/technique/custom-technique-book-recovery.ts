import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';
import type { PoolClient } from 'pg';

import type { GmCompatConversionSample } from '../../types';

export type CustomTechniqueBookSurface = 'inventory' | 'storage' | 'order';

export interface GeneratedTechniqueRecoveryRef {
  id: string;
  name: string;
  grade: string;
  realmLv: number;
  maxLayer: number;
}

export interface EmptyCustomTechniqueBookCandidate {
  surface: CustomTechniqueBookSurface;
  rowId: string;
  ownerId: string;
  rawPayload: Record<string, unknown>;
  itemPayload: Record<string, unknown>;
  locked: boolean;
  auction: boolean;
}

export interface CustomTechniqueBookRepair extends EmptyCustomTechniqueBookCandidate {
  techniqueId: string;
  techniqueName: string;
  learnTechniqueMaxLevel?: number;
}

export interface CustomTechniqueBookRepairDecision {
  candidate: EmptyCustomTechniqueBookCandidate;
  repair: CustomTechniqueBookRepair | null;
  status: string;
}

export function resolveCustomTechniqueBookRepairDecision(
  candidate: EmptyCustomTechniqueBookCandidate,
  techniques: GeneratedTechniqueRecoveryRef[],
): CustomTechniqueBookRepairDecision {
  if (candidate.locked) return { candidate, repair: null, status: 'locked' };
  const name = extractBookTechniqueName(candidate.itemPayload);
  if (!name) return { candidate, repair: null, status: 'name_missing' };
  const matches = techniques.filter((entry) => entry.name === name);
  if (matches.length !== 1) {
    return { candidate, repair: null, status: matches.length > 1 ? 'template_ambiguous' : 'template_missing' };
  }
  const technique = matches[0]!;
  const grade = normalizeText(candidate.itemPayload.grade);
  const realmLv = normalizePositiveInteger(candidate.itemPayload.level);
  if ((grade && technique.grade && grade !== technique.grade) || (realmLv && realmLv !== technique.realmLv)) {
    return { candidate, repair: null, status: 'metadata_mismatch' };
  }
  const desc = normalizeText(candidate.itemPayload.desc);
  const namedResidual = normalizeText(candidate.itemPayload.name).endsWith('残卷') || /前\s*\d+\s*层/.test(desc);
  const parsedMax = normalizePositiveInteger(candidate.itemPayload.learnTechniqueMaxLevel) ?? parseResidualMaxLevel(desc);
  if (namedResidual && parsedMax === null) return { candidate, repair: null, status: 'residual_level_missing' };
  if (parsedMax !== null && parsedMax >= technique.maxLayer) {
    return { candidate, repair: null, status: 'residual_level_invalid' };
  }
  return {
    candidate,
    status: 'recoverable',
    repair: {
      ...candidate,
      techniqueId: technique.id,
      techniqueName: technique.name,
      ...(parsedMax === null ? {} : { learnTechniqueMaxLevel: parsedMax }),
    },
  };
}

export function createEmptyBookCandidate(
  surface: CustomTechniqueBookSurface,
  row: Record<string, unknown>,
): EmptyCustomTechniqueBookCandidate | null {
  const rawPayload = asRecord(row.raw_payload);
  const itemPayload = surface === 'order' ? asRecord(rawPayload?.item) : rawPayload;
  const rowId = normalizeText(row.row_id);
  if (!rawPayload || !itemPayload || !rowId) return null;
  return {
    surface,
    rowId,
    ownerId: normalizeText(row.owner_id),
    rawPayload,
    itemPayload,
    locked: surface === 'inventory' && Boolean(normalizeText(row.locked_by)),
    auction: surface === 'order' && asRecord(rawPayload.auction)?.mode === 'auction',
  };
}

export async function updateCustomTechniqueBookRepairRow(
  client: PoolClient,
  repair: CustomTechniqueBookRepair,
): Promise<number> {
  const item: Record<string, unknown> = { ...repair.itemPayload, learnTechniqueId: repair.techniqueId };
  if (repair.learnTechniqueMaxLevel === undefined) delete item.learnTechniqueMaxLevel;
  else item.learnTechniqueMaxLevel = repair.learnTechniqueMaxLevel;
  const rawPayload = repair.surface === 'order'
    ? { ...repair.rawPayload, item, ...(!repair.auction ? { listingMode: 'transmission' } : {}) }
    : item;
  const query = repair.surface === 'inventory'
    ? `UPDATE player_inventory_item SET raw_payload = $2::jsonb, updated_at = now()
        WHERE item_instance_id = $1 AND item_id = $3 AND locked_by IS NULL
          AND COALESCE(raw_payload->>'learnTechniqueId', '') = '' AND raw_payload = $4::jsonb`
    : repair.surface === 'storage'
      ? `UPDATE player_market_storage_item SET raw_payload = $2::jsonb, updated_at = now()
          WHERE storage_item_id = $1 AND item_id = $3
            AND COALESCE(raw_payload->>'learnTechniqueId', '') = '' AND raw_payload = $4::jsonb`
      : `UPDATE server_market_order SET raw_payload = $2::jsonb, updated_at = now()
          WHERE order_id = $1 AND item_id = $3 AND side = 'sell' AND status = 'open'
            AND COALESCE(raw_payload->'item'->>'learnTechniqueId', '') = '' AND raw_payload = $4::jsonb`;
  return (await client.query(query, [
    repair.rowId,
    JSON.stringify(rawPayload),
    CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
    JSON.stringify(repair.rawPayload),
  ])).rowCount ?? 0;
}

export function buildCustomTechniqueBookRecoverySample(
  decision: CustomTechniqueBookRepairDecision,
): GmCompatConversionSample {
  return {
    id: `${decision.candidate.surface}:${decision.candidate.rowId}`,
    name: normalizeText(decision.candidate.itemPayload.name) || CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
    status: decision.status,
    before: { ownerId: decision.candidate.ownerId, learnTechniqueId: null },
    after: decision.repair
      ? { learnTechniqueId: decision.repair.techniqueId, learnTechniqueMaxLevel: decision.repair.learnTechniqueMaxLevel ?? null }
      : null,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? Math.trunc(numeric) : null;
}

export function groupValuesBy<T>(values: T[], keyOf: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

export function hasCustomTechniqueBookRecoveryHint(item: Record<string, unknown>): boolean {
  return Boolean(normalizeText(item.name) || normalizeText(item.desc));
}

function extractBookTechniqueName(item: Record<string, unknown>): string {
  const name = normalizeText(item.name);
  const named = name.match(/^《(.+)》(?:残卷)?$/)?.[1]?.trim();
  if (named) return named;
  const plain = name.replace(/残卷$/, '').trim();
  if (plain && plain !== '功法书' && plain !== CUSTOM_TECHNIQUE_BOOK_ITEM_ID) return plain;
  const desc = normalizeText(item.desc);
  return desc.match(/^完整记载(.+?)[。.]?$/)?.[1]?.trim()
    ?? desc.match(/^记载(.+?)前\s*\d+\s*层/)?.[1]?.trim()
    ?? '';
}

function parseResidualMaxLevel(desc: string): number | null {
  return normalizePositiveInteger(desc.match(/前\s*(\d+)\s*层/)?.[1]);
}
