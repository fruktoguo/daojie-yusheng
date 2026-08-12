/**
 * 已发布自创术法吟唱权重归零转换。
 *
 * 只处理当前正式 SkillDef 确实带吟唱、且原始草稿 chant 为负数的已发布自创术法。
 */
import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import {
  ensureGeneratedTechniqueTables,
  GENERATED_TECHNIQUE_TABLE,
} from '../../../../persistence/generated-technique-persistence.service';
import { GeneratedTechniqueStoreService } from '../../../../runtime/technique-generation/generated-technique-store.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';
import {
  asRecord,
  cloneJsonRecord,
  rebuildGeneratedTechniqueArtsRow,
  removeGeneratedTechniqueTargetModeFields,
  resolveGeneratedTechniqueRowName,
  toFiniteNumber,
  type GeneratedTechniqueArtsCandidateRow,
  type GeneratedTechniqueArtsRebuildSuccess,
} from './generated-technique-arts-rebuild.helpers';

export const ZERO_PUBLISHED_GENERATED_TECHNIQUE_CHANT_CONVERSION_ID = 'zero_published_generated_technique_chant';

const SAMPLE_LIMIT = 5;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export interface ZeroPublishedGeneratedTechniqueChantRunOptions extends GmCompatConversionRunOptions {
  expectedTargetFingerprint?: string;
  expectedMatchedRows?: number;
}

export interface ZeroPublishedGeneratedTechniqueChantRunResult extends GmCompatConversionRunResult {
  targetFingerprint: string;
  targetIds: string[];
  targetedSkills: number;
}

interface TargetSkillSummary {
  skillIndex: number;
  skillName: string;
  beforeChantWeight: number;
  beforeWindupTicks: number;
  afterWindupTicks: number;
}

interface RowAnalysis {
  matched: boolean;
  targetSkills: TargetSkillSummary[];
  rebuilt?: GeneratedTechniqueArtsRebuildSuccess;
  beforeSummary?: unknown;
  afterSummary?: unknown;
  error?: string;
}

interface PendingUpdate {
  row: GeneratedTechniqueArtsCandidateRow;
  targetSkills: TargetSkillSummary[];
  rebuilt: GeneratedTechniqueArtsRebuildSuccess;
}

@Injectable()
export class ZeroPublishedGeneratedTechniqueChantConversion {
  private readonly logger = new Logger(ZeroPublishedGeneratedTechniqueChantConversion.name);
  private schemaReady: Promise<void> | null = null;

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
    @Optional()
    @Inject(GeneratedTechniqueStoreService)
    private readonly generatedTechniqueStoreService: GeneratedTechniqueStoreService | null = null,
  ) {}

  async run(
    options: ZeroPublishedGeneratedTechniqueChantRunOptions,
  ): Promise<ZeroPublishedGeneratedTechniqueChantRunResult> {
    validateApplyGuard(options);
    const pool = this.databasePoolProvider.getPool('gm-compat-zero-generated-technique-chant');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    await this.ensureSchema(pool);
    const rows = await this.loadRows(pool);
    const result = createEmptyResult(options.mode);
    const pendingUpdates: PendingUpdate[] = [];
    const fingerprintTargets: Array<{ id: string; template: unknown; validationReport: unknown }> = [];

    for (const row of rows) {
      const analysis = analyzeRow(row);
      if (!analysis.matched) {
        result.skippedRows += 1;
        continue;
      }

      result.matchedRows += 1;
      result.targetedSkills += analysis.targetSkills.length;
      result.targetIds.push(row.id);
      fingerprintTargets.push({
        id: row.id,
        template: row.template,
        validationReport: row.validation_report,
      });
      if (analysis.error || !analysis.rebuilt) {
        result.failedRows += 1;
        result.errors.push(`${row.id}: ${analysis.error ?? '术法重算失败'}`);
        continue;
      }

      result.convertedRows += 1;
      result.verifiedRows += 1;
      if (result.samples.length < SAMPLE_LIMIT) {
        result.samples.push({
          id: row.id,
          name: resolveGeneratedTechniqueRowName(row),
          status: row.status,
          before: analysis.beforeSummary,
          after: analysis.afterSummary,
        } satisfies GmCompatConversionSample);
      }
      pendingUpdates.push({
        row,
        targetSkills: analysis.targetSkills,
        rebuilt: analysis.rebuilt,
      });
    }

    result.targetIds.sort();
    fingerprintTargets.sort((left, right) => left.id.localeCompare(right.id));
    result.targetFingerprint = buildTargetFingerprint(fingerprintTargets);

    if (options.mode === 'apply') {
      assertExpectedTarget(result, options);
      if (result.failedRows > 0 || pendingUpdates.length !== result.matchedRows) {
        throw new ConflictException({
          code: 'GENERATED_TECHNIQUE_CHANT_ZERO_ANALYSIS_FAILED',
          message: '目标术法存在无法重算的记录，未执行任何更新',
          failedRows: result.failedRows,
          errors: result.errors.slice(0, 20),
        });
      }
      const convertedAt = new Date().toISOString();
      await this.applyUpdates(pool, pendingUpdates, convertedAt);
      await this.generatedTechniqueStoreService?.refreshAfterPublish();
      result.appliedAt = convertedAt;
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

  private async loadRows(pool: Pool): Promise<GeneratedTechniqueArtsCandidateRow[]> {
    const result = await pool.query(
      `SELECT id,
              status,
              display_name,
              grade,
              realm_lv,
              template,
              validation_report
         FROM ${GENERATED_TECHNIQUE_TABLE}
        WHERE category = 'arts'
          AND status = 'published'
          AND is_published = TRUE
          AND validation_report ? 'artsStrength'
        ORDER BY id ASC`,
    );
    return result.rows as GeneratedTechniqueArtsCandidateRow[];
  }

  private async applyUpdates(pool: Pool, updates: PendingUpdate[], convertedAt: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        const validationReport = buildUpdatedValidationReport(
          update.row.validation_report,
          update.rebuilt,
          update.targetSkills,
          convertedAt,
        );
        const updateResult = await updateGeneratedTechnique(
          client,
          update.row,
          update.rebuilt.updatedTemplate,
          validationReport,
        );
        if (updateResult.rowCount !== 1) {
          throw new ConflictException({
            code: 'GENERATED_TECHNIQUE_CHANT_ZERO_ROW_DRIFT',
            message: `术法 ${update.row.id} 在转换期间发生变化，已回滚全部更新`,
          });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordAudit(
    result: ZeroPublishedGeneratedTechniqueChantRunResult,
    options: ZeroPublishedGeneratedTechniqueChantRunOptions,
  ): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${ZERO_PUBLISHED_GENERATED_TECHNIQUE_CHANT_CONVERSION_ID}.${options.mode}`,
        targetType: 'generated_technique',
        targetId: ZERO_PUBLISHED_GENERATED_TECHNIQUE_CHANT_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: {
          mode: options.mode,
          expectedMatchedRows: options.expectedMatchedRows ?? null,
          expectedTargetFingerprint: options.expectedTargetFingerprint ?? null,
        },
        after: {
          matchedRows: result.matchedRows,
          convertedRows: result.convertedRows,
          skippedRows: result.skippedRows,
          failedRows: result.failedRows,
          verifiedRows: result.verifiedRows,
          targetedSkills: result.targetedSkills,
          targetFingerprint: result.targetFingerprint,
        },
        delta: {
          targetIds: result.targetIds,
          errors: result.errors.slice(0, 20),
        },
        success: result.failedRows === 0,
        errorMessage: result.failedRows === 0 ? null : result.errors.slice(0, 3).join('; '),
      });
    } catch (error) {
      this.logger.warn(`自创术法吟唱归零审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function createEmptyResult(
  mode: GmCompatConversionRunOptions['mode'],
): ZeroPublishedGeneratedTechniqueChantRunResult {
  return {
    ok: true,
    conversionId: ZERO_PUBLISHED_GENERATED_TECHNIQUE_CHANT_CONVERSION_ID,
    mode,
    matchedRows: 0,
    convertedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    verifiedRows: 0,
    samples: [],
    errors: [],
    targetFingerprint: '',
    targetIds: [],
    targetedSkills: 0,
  };
}

function analyzeRow(row: GeneratedTechniqueArtsCandidateRow): RowAnalysis {
  const report = asRecord(row.validation_report);
  const artsStrength = asRecord(report?.artsStrength);
  const rawCandidate = asRecord(artsStrength?.rawCandidate);
  const template = asRecord(row.template);
  const rawSkills = Array.isArray(rawCandidate?.skills) ? rawCandidate.skills : [];
  const templateSkills = Array.isArray(template?.skills) ? template.skills : [];
  if (!rawCandidate || rawSkills.length === 0 || templateSkills.length === 0) {
    return { matched: false, targetSkills: [] };
  }

  const targetSkills: TargetSkillSummary[] = [];
  for (let skillIndex = 0; skillIndex < rawSkills.length; skillIndex += 1) {
    const rawSkill = asRecord(rawSkills[skillIndex]);
    const structureStrength = asRecord(rawSkill?.structureStrength);
    const beforeChantWeight = toFiniteNumber(structureStrength?.chant, 0);
    const beforeWindupTicks = readWindupTicks(templateSkills[skillIndex]);
    if (beforeChantWeight >= 0 || beforeWindupTicks <= 0) {
      continue;
    }
    targetSkills.push({
      skillIndex,
      skillName: typeof rawSkill?.name === 'string' && rawSkill.name.trim()
        ? rawSkill.name.trim()
        : `skill_${skillIndex + 1}`,
      beforeChantWeight,
      beforeWindupTicks,
      afterWindupTicks: 0,
    });
  }
  if (targetSkills.length === 0) {
    return { matched: false, targetSkills: [] };
  }

  const nextRawCandidate = cloneJsonRecord(rawCandidate);
  const nextSkills = Array.isArray(nextRawCandidate.skills) ? nextRawCandidate.skills : [];
  for (const target of targetSkills) {
    const nextSkill = asRecord(nextSkills[target.skillIndex]);
    if (!nextSkill) {
      return {
        matched: true,
        targetSkills,
        error: `第 ${target.skillIndex + 1} 个技能缺少原始草稿`,
      };
    }
    const structureStrength = cloneJsonRecord(nextSkill.structureStrength);
    structureStrength.chant = 0;
    nextSkill.structureStrength = structureStrength;
  }

  const rebuilt = rebuildGeneratedTechniqueArtsRow(row, nextRawCandidate);
  if (rebuilt.ok === false) {
    return {
      matched: true,
      targetSkills,
      error: rebuilt.error,
    };
  }
  const rebuiltSkills = Array.isArray(rebuilt.updatedTemplate.skills) ? rebuilt.updatedTemplate.skills : [];
  for (const target of targetSkills) {
    target.afterWindupTicks = readWindupTicks(rebuiltSkills[target.skillIndex]);
    if (target.afterWindupTicks > 0) {
      return {
        matched: true,
        targetSkills,
        error: `第 ${target.skillIndex + 1} 个技能重算后仍有 ${target.afterWindupTicks} 息吟唱`,
      };
    }
  }

  return {
    matched: true,
    targetSkills,
    rebuilt,
    beforeSummary: {
      targetSkills,
      skills: targetSkills.map((target) => buildSkillDefinitionSummary(templateSkills[target.skillIndex])),
    },
    afterSummary: {
      targetSkills: targetSkills.map((target) => ({
        skillIndex: target.skillIndex,
        skillName: target.skillName,
        chantWeight: 0,
        windupTicks: target.afterWindupTicks,
      })),
      skills: targetSkills.map((target) => buildSkillDefinitionSummary(rebuiltSkills[target.skillIndex])),
    },
  };
}

function buildUpdatedValidationReport(
  validationReport: unknown,
  rebuilt: GeneratedTechniqueArtsRebuildSuccess,
  targetSkills: TargetSkillSummary[],
  convertedAt: string,
): Record<string, unknown> {
  const report = removeGeneratedTechniqueTargetModeFields(cloneJsonRecord(validationReport));
  const artsStrength = cloneJsonRecord(report.artsStrength);
  artsStrength.rawCandidate = rebuilt.normalizedRawCandidate;
  artsStrength.normalizedTemplate = rebuilt.normalizedTemplate;
  artsStrength.expansion = rebuilt.expansionReport;
  artsStrength.version = Math.max(toFiniteNumber(artsStrength.version, 1), 2);
  artsStrength.migration = {
    ...(asRecord(artsStrength.migration) ?? {}),
    zeroPublishedGeneratedTechniqueChant: {
      conversionId: ZERO_PUBLISHED_GENERATED_TECHNIQUE_CHANT_CONVERSION_ID,
      convertedAt,
      previousSkills: targetSkills.map((target) => ({
        skillIndex: target.skillIndex,
        skillName: target.skillName,
        chantWeight: target.beforeChantWeight,
        windupTicks: target.beforeWindupTicks,
      })),
    },
  };
  report.artsStrength = artsStrength;
  return report;
}

function updateGeneratedTechnique(
  client: PoolClient,
  row: GeneratedTechniqueArtsCandidateRow,
  template: unknown,
  validationReport: unknown,
): Promise<{ rowCount: number | null }> {
  return client.query(
    `UPDATE ${GENERATED_TECHNIQUE_TABLE}
        SET template = $2::jsonb,
            validation_report = $3::jsonb,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'published'
        AND is_published = TRUE
        AND template = $4::jsonb
        AND validation_report = $5::jsonb`,
    [
      row.id,
      JSON.stringify(template),
      JSON.stringify(validationReport),
      JSON.stringify(row.template),
      JSON.stringify(row.validation_report),
    ],
  );
}

function validateApplyGuard(options: ZeroPublishedGeneratedTechniqueChantRunOptions): void {
  if (options.mode !== 'apply') {
    return;
  }
  if (!FINGERPRINT_PATTERN.test(options.expectedTargetFingerprint ?? '')) {
    throw new BadRequestException({
      code: 'INVALID_GENERATED_TECHNIQUE_CHANT_ZERO_FINGERPRINT',
      message: 'apply 必须携带 dry-run 返回的 64 位 targetFingerprint',
    });
  }
  if (!Number.isInteger(options.expectedMatchedRows) || Number(options.expectedMatchedRows) < 0) {
    throw new BadRequestException({
      code: 'INVALID_GENERATED_TECHNIQUE_CHANT_ZERO_MATCHED_ROWS',
      message: 'apply 必须携带 dry-run 返回的 expectedMatchedRows',
    });
  }
}

function assertExpectedTarget(
  result: ZeroPublishedGeneratedTechniqueChantRunResult,
  options: ZeroPublishedGeneratedTechniqueChantRunOptions,
): void {
  if (
    result.targetFingerprint !== options.expectedTargetFingerprint
    || result.matchedRows !== options.expectedMatchedRows
  ) {
    throw new ConflictException({
      code: 'GENERATED_TECHNIQUE_CHANT_ZERO_TARGET_DRIFT',
      message: '目标术法集合已变化，请重新执行 dry-run',
      expectedMatchedRows: options.expectedMatchedRows,
      actualMatchedRows: result.matchedRows,
      expectedTargetFingerprint: options.expectedTargetFingerprint,
      actualTargetFingerprint: result.targetFingerprint,
    });
  }
}

function buildTargetFingerprint(
  targets: Array<{ id: string; template: unknown; validationReport: unknown }>,
): string {
  return createHash('sha256').update(JSON.stringify(targets)).digest('hex');
}

function readWindupTicks(value: unknown): number {
  const skill = asRecord(value);
  const playerCast = asRecord(skill?.playerCast);
  return Math.max(0, Math.floor(toFiniteNumber(playerCast?.windupTicks, 0)));
}

function buildSkillDefinitionSummary(value: unknown): unknown {
  const skill = asRecord(value);
  if (!skill) {
    return null;
  }
  return {
    id: skill.id ?? null,
    name: skill.name ?? null,
    cost: skill.cost ?? null,
    costMultiplier: skill.costMultiplier ?? null,
    cooldown: skill.cooldown ?? null,
    range: skill.range ?? null,
    targeting: skill.targeting ?? null,
    playerCast: skill.playerCast ?? null,
    effects: skill.effects ?? null,
  };
}
