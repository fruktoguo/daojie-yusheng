/**
 * AI 术法强度草稿 v1 -> v2 兼容转换。
 *
 * 只迁移 GM 可审计的 AI 原始权重草稿，不改正式运行时 SkillDef。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  normalizeTechniqueArtsStrengthTemplate,
  type TechniqueArtsStrengthTargetType,
} from '@mud/shared';
import type { Pool, PoolClient } from 'pg';

import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import {
  ensureGeneratedTechniqueTables,
  GENERATED_TECHNIQUE_TABLE,
} from '../../../../persistence/generated-technique-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const AI_ARTS_STRENGTH_V1_TO_V2_CONVERSION_ID = 'technique_arts_strength_v1_to_v2';

const SAMPLE_LIMIT = 5;
const TARGET_TYPES = new Set<TechniqueArtsStrengthTargetType>([
  'single',
  'line',
  'box',
  'area',
  'orientedBox',
  'ring',
  'checkerboard',
]);

interface CandidateRow {
  id: string;
  status: string;
  display_name?: string | null;
  template: unknown;
  validation_report: unknown;
}

interface MigrationAnalysis {
  changed: boolean;
  migratedRawCandidate?: Record<string, unknown>;
  normalizedTemplate?: unknown;
  beforeSummary?: unknown;
  afterSummary?: unknown;
  error?: string;
}

@Injectable()
export class AiArtsStrengthV1ToV2Conversion {
  private readonly logger = new Logger(AiArtsStrengthV1ToV2Conversion.name);
  private schemaReady: Promise<void> | null = null;

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-ai-arts-strength');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    await this.ensureSchema(pool);
    const rows = await this.loadRows(pool);
    const result = createEmptyResult(options.mode);
    const updates: Array<{ id: string; validationReport: unknown }> = [];

    for (const row of rows) {
      const analysis = analyzeRow(row);
      if (!analysis.changed) {
        result.skippedRows += 1;
        if (analysis.error) {
          result.failedRows += 1;
          result.errors.push(`${row.id}: ${analysis.error}`);
        }
        continue;
      }

      result.matchedRows += 1;
      result.convertedRows += 1;
      result.verifiedRows += 1;
      if (result.samples.length < SAMPLE_LIMIT) {
        result.samples.push({
          id: row.id,
          name: resolveRowName(row),
          status: row.status,
          before: analysis.beforeSummary,
          after: analysis.afterSummary,
        } satisfies GmCompatConversionSample);
      }

      if (options.mode === 'apply') {
        updates.push({
          id: row.id,
          validationReport: buildUpdatedValidationReport(row.validation_report, analysis),
        });
      }
    }

    if (options.mode === 'apply' && updates.length > 0) {
      await this.applyUpdates(pool, updates);
      result.appliedAt = new Date().toISOString();
    }

    await this.recordAudit(result, options);
    return result;
  }

  private async ensureSchema(pool: Pool): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = ensureGeneratedTechniqueTables(pool).catch((error: unknown) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  private async loadRows(pool: Pool): Promise<CandidateRow[]> {
    const result = await pool.query(
      `SELECT id,
              status,
              display_name,
              template,
              validation_report
         FROM ${GENERATED_TECHNIQUE_TABLE}
        WHERE category = 'arts'
          AND validation_report ? 'artsStrength'
        ORDER BY created_at ASC, id ASC`,
    );
    return result.rows as CandidateRow[];
  }

  private async applyUpdates(pool: Pool, updates: Array<{ id: string; validationReport: unknown }>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        await updateValidationReport(client, update.id, update.validationReport);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${AI_ARTS_STRENGTH_V1_TO_V2_CONVERSION_ID}.${options.mode}`,
        targetType: 'generated_technique',
        targetId: AI_ARTS_STRENGTH_V1_TO_V2_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: {
          mode: options.mode,
        },
        after: {
          matchedRows: result.matchedRows,
          convertedRows: result.convertedRows,
          skippedRows: result.skippedRows,
          failedRows: result.failedRows,
          verifiedRows: result.verifiedRows,
        },
        delta: {
          sampleIds: result.samples.map((sample) => sample.id),
          errors: result.errors.slice(0, 20),
        },
        success: result.failedRows === 0,
        errorMessage: result.failedRows === 0 ? null : result.errors.slice(0, 3).join('; '),
      });
    } catch (error) {
      this.logger.warn(`AI 术法兼容转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: AI_ARTS_STRENGTH_V1_TO_V2_CONVERSION_ID,
    mode,
    matchedRows: 0,
    convertedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    verifiedRows: 0,
    samples: [],
    errors: [],
  };
}

function updateValidationReport(client: PoolClient, id: string, validationReport: unknown): Promise<unknown> {
  return client.query(
    `UPDATE ${GENERATED_TECHNIQUE_TABLE}
        SET validation_report = $2::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [id, JSON.stringify(validationReport)],
  );
}

function analyzeRow(row: CandidateRow): MigrationAnalysis {
  const report = asRecord(row.validation_report);
  const artsStrength = asRecord(report?.artsStrength);
  const rawCandidate = asRecord(artsStrength?.rawCandidate);
  if (!rawCandidate) {
    return { changed: false };
  }
  const migratedRawCandidate = migrateRawCandidate(rawCandidate);
  if (!migratedRawCandidate.changed) {
    return { changed: false };
  }
  const normalized = normalizeTechniqueArtsStrengthTemplate(migratedRawCandidate.value);
  if (!normalized.ok || !normalized.template) {
    return {
      changed: false,
      error: normalized.errors.join('; ') || '迁移后无法通过当前术法强度 schema',
    };
  }
  return {
    changed: true,
    migratedRawCandidate: migratedRawCandidate.value,
    normalizedTemplate: normalized.template,
    beforeSummary: buildSummary(rawCandidate),
    afterSummary: buildSummary(migratedRawCandidate.value),
  };
}

function buildUpdatedValidationReport(validationReport: unknown, analysis: MigrationAnalysis): unknown {
  const report = cloneRecord(validationReport);
  const artsStrength = cloneRecord(report.artsStrength);
  artsStrength.rawCandidate = analysis.migratedRawCandidate;
  artsStrength.normalizedTemplate = analysis.normalizedTemplate;
  artsStrength.version = Math.max(toFiniteNumber(artsStrength.version, 1), 2);
  artsStrength.migration = {
    ...(asRecord(artsStrength.migration) ?? {}),
    aiArtsStrengthV1ToV2: {
      conversionId: AI_ARTS_STRENGTH_V1_TO_V2_CONVERSION_ID,
      convertedAt: new Date().toISOString(),
    },
  };
  report.artsStrength = artsStrength;
  return report;
}

function migrateRawCandidate(rawCandidate: Record<string, unknown>): { changed: boolean; value: Record<string, unknown> } {
  const nextCandidate = cloneRecord(rawCandidate);
  const skills = Array.isArray(nextCandidate.skills) ? nextCandidate.skills : [];
  let changed = false;
  nextCandidate.skills = skills.map((skill) => {
    const skillRecord = asRecord(skill);
    if (!skillRecord) {
      return skill;
    }
    const migrated = migrateSkill(skillRecord);
    changed = changed || migrated.changed;
    return migrated.value;
  });
  return { changed, value: nextCandidate };
}

function migrateSkill(skill: Record<string, unknown>): { changed: boolean; value: Record<string, unknown> } {
  const nextSkill = cloneRecord(skill);
  const targetSource = asRecord(nextSkill.target) ?? {};
  const targetingSource = asRecord(nextSkill.targeting) ?? {};
  const changed = hasLegacyTargetFields(targetSource)
    || Object.prototype.hasOwnProperty.call(skill, 'range')
    || Object.prototype.hasOwnProperty.call(skill, 'targeting');
  const type = normalizeTargetType(targetSource.type ?? targetSource.shape ?? targetingSource.shape);
  const castRangeWeight = pickWeight(targetSource.castRangeWeight, targetSource.range, nextSkill.range, targetingSource.range);
  const areaWeight = pickWeight(
    targetSource.areaWeight,
    resolveLegacyAreaWeight(type, targetSource, targetingSource),
  );
  const nextTarget = cloneRecord(targetSource);
  nextTarget.type = type;
  nextTarget.castRangeWeight = castRangeWeight;
  nextTarget.areaWeight = areaWeight;
  delete nextTarget.range;
  delete nextTarget.radius;
  delete nextTarget.width;
  delete nextTarget.height;
  delete nextTarget.shape;
  nextSkill.target = nextTarget;
  delete nextSkill.range;
  delete nextSkill.targeting;
  return {
    changed,
    value: nextSkill,
  };
}

function hasLegacyTargetFields(target: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(target, 'range')
    || Object.prototype.hasOwnProperty.call(target, 'radius')
    || Object.prototype.hasOwnProperty.call(target, 'width')
    || Object.prototype.hasOwnProperty.call(target, 'height')
    || Object.prototype.hasOwnProperty.call(target, 'shape');
}

function resolveLegacyAreaWeight(
  type: TechniqueArtsStrengthTargetType,
  target: Record<string, unknown>,
  targeting: Record<string, unknown>,
): number {
  if (type === 'single') {
    return 0;
  }
  if (type === 'area' || type === 'ring') {
    return pickWeight(target.radius, targeting.radius);
  }
  if (type === 'line') {
    return pickWeight(target.width, targeting.width);
  }
  return Math.max(
    pickWeight(target.width, targeting.width),
    pickWeight(target.height, targeting.height),
  );
}

function normalizeTargetType(value: unknown): TechniqueArtsStrengthTargetType {
  return TARGET_TYPES.has(value as TechniqueArtsStrengthTargetType)
    ? value as TechniqueArtsStrengthTargetType
    : 'single';
}

function pickWeight(...values: unknown[]): number {
  for (const value of values) {
    const numberValue = toFiniteNumber(value, Number.NaN);
    if (Number.isFinite(numberValue) && numberValue >= 0) {
      return numberValue;
    }
  }
  return 0;
}

function buildSummary(candidate: Record<string, unknown>): unknown {
  const skill = asRecord(Array.isArray(candidate.skills) ? candidate.skills[0] : null);
  const target = asRecord(skill?.target);
  return {
    skillName: typeof skill?.name === 'string' ? skill.name : null,
    target: target ? {
      type: target.type ?? target.shape ?? null,
      range: target.range ?? null,
      radius: target.radius ?? null,
      width: target.width ?? null,
      height: target.height ?? null,
      castRangeWeight: target.castRangeWeight ?? null,
      areaWeight: target.areaWeight ?? null,
    } : null,
    skillRange: skill?.range ?? null,
    hasTargeting: Boolean(skill && Object.prototype.hasOwnProperty.call(skill, 'targeting')),
  };
}

function resolveRowName(row: CandidateRow): string {
  if (typeof row.display_name === 'string' && row.display_name.trim()) {
    return row.display_name.trim();
  }
  const template = asRecord(row.template);
  if (typeof template?.name === 'string' && template.name.trim()) {
    return template.name.trim();
  }
  return row.id;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  const source = asRecord(value) ?? {};
  return { ...source };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
