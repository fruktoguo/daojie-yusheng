/**
 * 冷路径运维工具：按当前任务配置补齐历史 player_quest_progress 的 raw_payload/progress_payload。
 *
 * 默认 dry-run，只输出统计；显式传入 --apply 才会写库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

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

interface Options {
  apply: boolean;
  playerId: string | null;
  limit: number | null;
}

const packageRoot = path.resolve(__dirname, '..', '..');
const questsRoot = path.join(packageRoot, 'data', 'content', 'quests');

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      mode: options.apply ? 'apply' : 'dry-run',
      answers: '扫描并修复历史 player_quest_progress.raw_payload/progress_payload 需要真实数据库连接',
    }, null, 2));
    return;
  }

  const templates = loadQuestTemplates();
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const rows = await loadRows(pool, options);
    const patches = [];
    const unknownQuestIds = new Map<string, number>();
    for (const row of rows) {
      const template = templates.get(row.quest_id);
      if (!template) {
        unknownQuestIds.set(row.quest_id, (unknownQuestIds.get(row.quest_id) ?? 0) + 1);
        continue;
      }
      const patch = buildPatch(row, template);
      if (patch) {
        patches.push(patch);
      }
    }

    if (options.apply && patches.length > 0) {
      await pool.query('BEGIN');
      try {
        for (const patch of patches) {
          await pool.query(
            `
              UPDATE player_quest_progress
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
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }

    console.log(JSON.stringify({
      ok: true,
      mode: options.apply ? 'apply' : 'dry-run',
      scannedRows: rows.length,
      knownQuestRows: rows.length - Array.from(unknownQuestIds.values()).reduce((sum, count) => sum + count, 0),
      unknownQuestRows: Array.from(unknownQuestIds.values()).reduce((sum, count) => sum + count, 0),
      patchedRows: patches.length,
      unknownQuestIds: Array.from(unknownQuestIds.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([questId, count]) => ({ questId, count })),
      samplePatches: patches.slice(0, 20).map((patch) => ({
        playerId: patch.playerId,
        questId: patch.questId,
        status: patch.status,
        progress: patch.rawPayload.progress ?? null,
      })),
      answers: options.apply
        ? '已按当前任务模板修复历史任务进度结构化 payload'
        : '已预览历史任务进度结构化 payload 修复范围，未写库',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

function parseArgs(argv: string[]): Options {
  let playerId: string | null = null;
  let limit: number | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--player=')) {
      const value = arg.slice('--player='.length).trim();
      playerId = value || null;
    } else if (arg.startsWith('--limit=')) {
      const value = Math.trunc(Number(arg.slice('--limit='.length)));
      limit = Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return {
    apply: argv.includes('--apply'),
    playerId,
    limit,
  };
}

function loadQuestTemplates(): Map<string, QuestTemplate> {
  const templates = new Map<string, QuestTemplate>();
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

async function loadRows(pool: Pool, options: Options): Promise<QuestProgressRow[]> {
  const where = [];
  const params: unknown[] = [];
  if (options.playerId) {
    params.push(options.playerId);
    where.push(`player_id = $${params.length}`);
  }
  const limitSql = options.limit ? ` LIMIT ${options.limit}` : '';
  const result = await pool.query(
    `
      SELECT player_id, quest_id, status, progress_payload, raw_payload
      FROM player_quest_progress
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY player_id ASC, quest_id ASC
      ${limitSql}
    `,
    params,
  );
  return result.rows as QuestProgressRow[];
}

function buildPatch(row: QuestProgressRow, template: QuestTemplate): {
  playerId: string;
  questId: string;
  status: string;
  progressPayload: Record<string, unknown> | null;
  rawPayload: Record<string, unknown>;
} | null {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
