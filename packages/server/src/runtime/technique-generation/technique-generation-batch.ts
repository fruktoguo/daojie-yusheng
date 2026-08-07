import { randomUUID } from 'node:crypto';
import { ATTR_KEYS } from '@mud/shared';

const BATCH_ID_PREFIX = 'batch_';
const BATCH_INDEX_WIDTH = 3;
const BATCH_JOB_ID_PATTERN = /^(batch_[0-9a-f]{32})_([0-9]{3})$/;

export interface TechniqueGenerationBatchIdentity {
  batchId: string;
  jobIds: string[];
}

export interface BalancedInternalTechniqueCandidate extends Record<string, unknown> {
  name: string;
  desc: string;
  category: 'internal';
  maxLayer: number;
  expDifficulty: number;
  attrRatio: Record<(typeof ATTR_KEYS)[number], number>;
}

export function createTechniqueGenerationBatchIdentity(countInput: number): TechniqueGenerationBatchIdentity {
  const count = Math.max(1, Math.trunc(Number(countInput) || 1));
  const batchId = `${BATCH_ID_PREFIX}${randomUUID().replace(/-/g, '')}`;
  return {
    batchId,
    jobIds: Array.from({ length: count }, (_, index) => (
      `${batchId}_${String(index + 1).padStart(BATCH_INDEX_WIDTH, '0')}`
    )),
  };
}

export function resolveTechniqueGenerationBatchId(jobId: unknown): string | null {
  if (typeof jobId !== 'string') return null;
  return BATCH_JOB_ID_PATTERN.exec(jobId.trim())?.[1] ?? null;
}

export function resolveTechniqueGenerationBatchIndex(jobId: unknown): number | null {
  if (typeof jobId !== 'string') return null;
  const raw = BATCH_JOB_ID_PATTERN.exec(jobId.trim())?.[2];
  if (!raw) return null;
  const index = Number(raw);
  return Number.isInteger(index) && index > 0 ? index : null;
}

export function isTechniqueGenerationBatchJobId(jobId: unknown): boolean {
  return resolveTechniqueGenerationBatchId(jobId) !== null;
}

/** 批量领悟的数值不交给 AI，六维始终使用服务端等权模板。 */
export function buildBalancedInternalTechniqueCandidate(input: {
  name: string;
  desc: string;
  maxLayer: number;
}): BalancedInternalTechniqueCandidate {
  return {
    name: input.name,
    desc: input.desc,
    category: 'internal',
    maxLayer: input.maxLayer,
    expDifficulty: 1,
    attrRatio: Object.fromEntries(ATTR_KEYS.map((key) => [key, 1])) as BalancedInternalTechniqueCandidate['attrRatio'],
  };
}
