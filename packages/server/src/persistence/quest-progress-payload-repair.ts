import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export interface QuestProgressPayloadRepairOptions {
  mode: 'dry-run' | 'apply';
  playerId?: string | null;
  limit?: number | null;
}

export interface QuestProgressPayloadRepairResult {
  ok: true;
  mode: 'dry-run' | 'apply';
  scannedRows: number;
  knownQuestRows: number;
  unknownQuestRows: number;
  patchedRows: number;
  unknownQuestIds: Array<{ questId: string; count: number }>;
  samplePatches: Array<{ playerId: string; questId: string; status: string; progress: unknown }>;
  repairedAt: string;
}

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

const packageRoot = path.resolve(__dirname, '..', '..');
const questsRoot = path.join(packageRoot, 'data', 'content', 'quests');

export async function repairQuestProgressPayloads(
  pool: Pool,
  options: QuestProgressPayloadRepairOptions,
): Promise<QuestProgressPayloadRepairResult> {
  const mode = options.mode === 'apply' ? 'apply' : 'dry-run';
  const templates = loadQuestTemplates();
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

  if (mode === 'apply' && patches.length > 0) {
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

  const unknownQuestRows = Array.from(unknownQuestIds.values()).reduce((sum, count) => sum + count, 0);
  return {
    ok: true,
    mode,
    scannedRows: rows.length,
    knownQuestRows: rows.length - unknownQuestRows,
    unknownQuestRows,
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
    repairedAt: new Date().toISOString(),
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

async function loadRows(pool: Pool, options: QuestProgressPayloadRepairOptions): Promise<QuestProgressRow[]> {
  const where = [];
  const params: unknown[] = [];
  const playerId = typeof options.playerId === 'string' ? options.playerId.trim() : '';
  if (playerId) {
    params.push(playerId);
    where.push(`player_id = $${params.length}`);
  }
  const normalizedLimit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.trunc(Number(options.limit)))
    : null;
  const limitSql = normalizedLimit ? ` LIMIT ${normalizedLimit}` : '';
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
