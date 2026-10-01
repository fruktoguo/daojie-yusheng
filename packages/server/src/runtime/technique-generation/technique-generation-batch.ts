import { randomUUID } from 'node:crypto';
import {
  ATTR_KEYS,
  CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
  CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
} from '@mud/shared';

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

/** 六维等权权重，批量未产出共享权重时的默认值。 */
export const BALANCED_INTERNAL_ATTR_RATIO: Record<(typeof ATTR_KEYS)[number], number> =
  Object.fromEntries(ATTR_KEYS.map((key) => [key, 1])) as Record<(typeof ATTR_KEYS)[number], number>;

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

/** 批量内功候选：AI 只产出名称、描述与一套整批共用权重；预算、层数等数值由服务端确定。 */
export function buildBatchInternalTechniqueCandidate(input: {
  name: string;
  desc: string;
  maxLayer: number;
  attrRatio?: Record<(typeof ATTR_KEYS)[number], number>;
}): BalancedInternalTechniqueCandidate {
  return {
    name: input.name,
    desc: input.desc,
    category: 'internal',
    maxLayer: input.maxLayer,
    expDifficulty: 1,
    attrRatio: input.attrRatio ?? BALANCED_INTERNAL_ATTR_RATIO,
  };
}

/** 归一化功法名称（用于唯一性索引与重名比对）。 */
export function normalizeTechniqueNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

/** 为功法基础名追加序号后缀，并严格限制总长度不超过 CUSTOM_TECHNIQUE_NAME_MAX_LENGTH (20字)。 */
export function buildNumberedTechniqueName(baseName: string, suffixNumber: number): string {
  const suffix = String(suffixNumber);
  const chars = [...baseName];
  const maxBaseLength = Math.max(1, CUSTOM_TECHNIQUE_NAME_MAX_LENGTH - suffix.length);
  const truncatedBase = chars.slice(0, maxBaseLength).join('');
  return `${truncatedBase}${suffix}`;
}

/**
 * 批量功法名称去重与序号分配：
 * 遍历每部功法的名称，若在已有已发布占用集或本批已分配集合中存在重名，自动递增追加序号（1, 2, 3...）直至名称唯一。
 */
export function resolveBatchUniqueTechniqueNames(
  names: readonly string[],
  existingNormalizedNames?: ReadonlySet<string> | readonly string[],
): string[] {
  const usedNormalized = new Set<string>(
    existingNormalizedNames instanceof Set
      ? existingNormalizedNames
      : Array.isArray(existingNormalizedNames)
        ? existingNormalizedNames.map((item) => normalizeTechniqueNameKey(item))
        : [],
  );

  const result: string[] = [];

  for (const rawName of names) {
    const trimmed = (typeof rawName === 'string' ? rawName : '').trim();
    const chars = [...trimmed];
    const boundedName = chars.slice(0, CUSTOM_TECHNIQUE_NAME_MAX_LENGTH).join('');
    const baseNormalized = normalizeTechniqueNameKey(boundedName);

    if (baseNormalized && !usedNormalized.has(baseNormalized)) {
      usedNormalized.add(baseNormalized);
      result.push(boundedName);
      continue;
    }

    let suffixNumber = 1;
    let candidateName = buildNumberedTechniqueName(boundedName || '自创内功', suffixNumber);
    let candidateNormalized = normalizeTechniqueNameKey(candidateName);

    while (usedNormalized.has(candidateNormalized)) {
      suffixNumber += 1;
      candidateName = buildNumberedTechniqueName(boundedName || '自创内功', suffixNumber);
      candidateNormalized = normalizeTechniqueNameKey(candidateName);
    }

    usedNormalized.add(candidateNormalized);
    result.push(candidateName);
  }

  return result;
}

