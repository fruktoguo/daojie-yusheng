/**
 * 任务进度 raw_payload / progress_payload 结构化规范化兼容转换。
 *
 * 历史任务进度可能未对齐最新任务模板字段与结构。
 * 转换按任务定义重新校准进度与状态结构。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';

import { resolveProjectPath } from '../../../../common/project-path';
import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const QUEST_PROGRESS_PAYLOADS_CONVERSION_ID = 'quest_progress_payloads';

const SAMPLE_LIMIT = 10;
const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';

interface QuestTemplate {
  id: string;
  line?: string;
  objectiveType?: string;
  required?: number;
  targetCount?: number;
  requiredItemCount?: number;
  [key: string]: unknown;
}

interface QuestProgressRow {
  player_id: string;
  quest_id: string;
  status: string | null;
  progress_payload: unknown;
  raw_payload: unknown;
}

interface QuestProgressPatch {
  playerId: string;
  questId: string;
  status: string;
  progressPayload: Record<string, unknown> | null;
  rawPayload: Record<string, unknown>;
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: QUEST_PROGRESS_PAYLOADS_CONVERSION_ID,
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

function buildSample(patch: QuestProgressPatch): GmCompatConversionSample {
  return {
    id: `${patch.playerId}:${patch.questId}`,
    name: patch.questId,
    status: 'convertible_legacy_quest_progress',
    before: {
      playerId: patch.playerId,
      questId: patch.questId,
    },
    after: {
      status: patch.status,
      progressPayload: patch.progressPayload,
      rawPayload: patch.rawPayload,
    },
  };
}

@Injectable()
export class QuestProgressPayloadConversion {
  private readonly logger = new Logger(QuestProgressPayloadConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-quest-progress-payload');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }

    const result = createEmptyResult(options.mode);
    const questsRoot = resolveProjectPath('packages/server/data/content/quests');
    const templates = loadQuestTemplates(questsRoot);
    const rows = await this.loadRows(pool);
    result.matchedRows = rows.length;

    const patches: QuestProgressPatch[] = [];
    const unknownQuestIds = new Map<string, number>();

    for (const row of rows) {
      const template = templates.get(row.quest_id);
      if (!template) {
        unknownQuestIds.set(row.quest_id, (unknownQuestIds.get(row.quest_id) ?? 0) + 1);
        result.skippedRows += 1;
        continue;
      }
      const patch = buildPatch(row, template);
      if (patch) {
        patches.push(patch);
      } else {
        result.skippedRows += 1;
      }
    }

    for (const [questId, count] of unknownQuestIds.entries()) {
      result.errors.push(`未找到任务模板定义: ${questId} (影响 ${count} 条记录)`);
    }

    result.samples = patches.slice(0, SAMPLE_LIMIT).map(buildSample);

    if (options.mode === 'dry-run') {
      result.convertedRows = patches.length;
      result.verifiedRows = patches.length;
      await this.recordAudit(result, options);
      return result;
    }

    if (patches.length === 0) {
      result.appliedAt = new Date().toISOString();
      await this.recordAudit(result, options);
      return result;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const patch of patches) {
        await client.query(
          `
            UPDATE ${PLAYER_QUEST_PROGRESS_TABLE}
            SET status = $3,
                progress_payload = $4::jsonb,
                raw_payload = $5::jsonb,
                updated_at = now()
            WHERE player_id = $1
              AND quest_id = $2
          `,
          [
            patch.playerId,
            patch.questId,
            patch.status,
            patch.progressPayload == null ? null : JSON.stringify(patch.progressPayload),
            JSON.stringify(patch.rawPayload),
          ],
        );
      }
      await client.query('COMMIT');
      result.convertedRows = patches.length;
      result.verifiedRows = patches.length;
      result.appliedAt = new Date().toISOString();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.convertedRows = 0;
      result.failedRows = patches.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`任务进度 payload 转换失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    this.logger.log(
      `任务进度 payload 转换完成：扫描 ${result.matchedRows}，转换 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  private async loadRows(pool: Pool): Promise<QuestProgressRow[]> {
    const result = await pool.query(
      `
        SELECT player_id, quest_id, status, progress_payload, raw_payload
        FROM ${PLAYER_QUEST_PROGRESS_TABLE}
        ORDER BY player_id ASC, quest_id ASC
      `,
    );
    return result.rows as QuestProgressRow[];
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${QUEST_PROGRESS_PAYLOADS_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: QUEST_PROGRESS_PAYLOADS_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { mode: options.mode },
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
      this.logger.warn(`任务进度 payload 转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function loadQuestTemplates(questsRoot: string): Map<string, QuestTemplate> {
  const templates = new Map<string, QuestTemplate>();
  if (!fs.existsSync(questsRoot)) {
    return templates;
  }
  for (const filePath of walkJsonFiles(questsRoot)) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { quests?: QuestTemplate[] };
    for (const quest of Array.isArray(payload.quests) ? payload.quests : []) {
      if (typeof quest?.id === 'string' && quest.id.trim()) {
        templates.set(quest.id.trim(), { ...quest, id: quest.id.trim() });
      }
    }
  }
  return templates;
}

function walkJsonFiles(dirPath: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(absolutePath, result);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      result.push(absolutePath);
    }
  }
  return result;
}

function buildPatch(row: QuestProgressRow, template: QuestTemplate): QuestProgressPatch | null {
  const status = normalizeQuestStatus(row.status);
  const currentRaw = asRecord(row.raw_payload);
  const progress = status === 'completed'
    ? undefined
    : normalizeProgress(currentRaw.progress ?? asRecord(row.progress_payload).progress);
  const rawPayload = normalizeQuestRawPayload(template, status, progress);
  const progressPayload = status === 'completed' ? null : { progress: rawPayload.progress ?? 0 };
  if (
    status === normalizeQuestStatus(row.status)
    && stableStringify(progressPayload) === stableStringify(row.progress_payload ?? null)
    && stableStringify(rawPayload) === stableStringify(currentRaw)
  ) {
    return null;
  }
  return {
    playerId: row.player_id,
    questId: row.quest_id,
    status,
    progressPayload,
    rawPayload,
  };
}

function normalizeQuestRawPayload(template: QuestTemplate, status: string, progress: number | undefined): Record<string, unknown> {
  const objectiveType = normalizeObjectiveType(template.objectiveType);
  const rawPayload: Record<string, unknown> = {
    ...template,
    id: template.id,
    line: normalizeLine(template.line),
    objectiveType,
    status,
    required: resolveRequired(template, objectiveType),
  };
  if (progress !== undefined) {
    rawPayload.progress = Math.min(Number(rawPayload.required), progress);
  } else {
    delete rawPayload.progress;
  }
  return rawPayload;
}

function normalizeQuestStatus(value: unknown): string {
  return value === 'available' || value === 'active' || value === 'ready' || value === 'completed'
    ? value
    : 'active';
}

function normalizeObjectiveType(value: unknown): string {
  return value === 'talk'
    || value === 'submit_item'
    || value === 'learn_technique'
    || value === 'realm_progress'
    || value === 'realm_stage'
    ? value
    : 'kill';
}

function normalizeLine(value: unknown): string {
  return value === 'side' || value === 'daily' || value === 'encounter' ? value : 'main';
}

function resolveRequired(template: QuestTemplate, objectiveType: string): number {
  if (objectiveType === 'submit_item') {
    return normalizePositiveInteger(template.requiredItemCount, 1);
  }
  return normalizePositiveInteger(template.required ?? template.targetCount, 1);
}

function normalizeProgress(value: unknown): number {
  const normalized = Math.trunc(Number(value ?? 0));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const normalized = Math.trunc(Number(value ?? fallback));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
