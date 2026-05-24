/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 生成功法持久化服务。
 *
 * 职责：
 * 1. 建表（ensure schema）
 * 2. generated_technique + technique_generation_job 的 CRUD
 * 3. 签名查询（供缓存层判断是否需要重载）
 */

import type { Pool } from 'pg';
import type {
  GmGeneratedTechniqueDetailRes,
  GmGeneratedTechniqueListPage,
  GmGeneratedTechniqueSummary,
} from '@mud/shared';

// ─── 表名常量 ───

export const GENERATED_TECHNIQUE_TABLE = 'generated_technique';
export const TECHNIQUE_GENERATION_JOB_TABLE = 'technique_generation_job';

// ─── 建表 ───

export async function ensureGeneratedTechniqueTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${GENERATED_TECHNIQUE_TABLE} (
        id                    VARCHAR(64) PRIMARY KEY,
        generation_id         VARCHAR(64) NOT NULL,
        template              JSONB NOT NULL,
        schema_version        INT NOT NULL DEFAULT 1,

        status                VARCHAR(16) NOT NULL DEFAULT 'draft',
        usage_scope           VARCHAR(16) NOT NULL DEFAULT 'player_only',
        is_published          BOOLEAN NOT NULL DEFAULT false,
        published_at          TIMESTAMPTZ,

        display_name          VARCHAR(64),
        normalized_name       VARCHAR(64),
        name_locked           BOOLEAN NOT NULL DEFAULT false,

        created_by_player_id  VARCHAR(120) NOT NULL,
        model_name            VARCHAR(64),
        prompt_snapshot       TEXT,
        validation_report     JSONB,

        grade                 VARCHAR(16),
        category              VARCHAR(16),
        realm_lv              INT,

        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_tech_normalized_name
        ON ${GENERATED_TECHNIQUE_TABLE}(normalized_name)
        WHERE is_published = true AND normalized_name IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gen_tech_status
        ON ${GENERATED_TECHNIQUE_TABLE}(status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gen_tech_owner
        ON ${GENERATED_TECHNIQUE_TABLE}(created_by_player_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gen_tech_published
        ON ${GENERATED_TECHNIQUE_TABLE}(is_published, created_at DESC)
        WHERE is_published = true
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TECHNIQUE_GENERATION_JOB_TABLE} (
        id                    VARCHAR(64) PRIMARY KEY,
        player_id             VARCHAR(120) NOT NULL,
        status                VARCHAR(16) NOT NULL DEFAULT 'pending',

        requested_category    VARCHAR(16),
        rolled_grade          VARCHAR(16),
        rolled_realm_lv       INT,
        player_context        VARCHAR(200),

        draft_technique_id    VARCHAR(64),
        model_name            VARCHAR(64),
        attempt_count         INT NOT NULL DEFAULT 0,

        draft_expire_at       TIMESTAMPTZ,
        finished_at           TIMESTAMPTZ,

        error_code            VARCHAR(32),
        error_message         TEXT,

        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE ${GENERATED_TECHNIQUE_TABLE}
      ALTER COLUMN created_by_player_id TYPE VARCHAR(120)
      USING created_by_player_id::text
    `);
    await client.query(`
      ALTER TABLE ${TECHNIQUE_GENERATION_JOB_TABLE}
      ALTER COLUMN player_id TYPE VARCHAR(120)
      USING player_id::text
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gen_job_player
        ON ${TECHNIQUE_GENERATION_JOB_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gen_job_status
        ON ${TECHNIQUE_GENERATION_JOB_TABLE}(status, created_at DESC)
    `);

    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ─── 签名查询 ───

export interface GeneratedTechniqueSignature {
  count: number;
  maxUpdatedAt: string;
}

export async function loadGeneratedTechniqueSignature(pool: Pool): Promise<GeneratedTechniqueSignature> {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(MAX(updated_at)::text, '') AS max_updated_at
    FROM ${GENERATED_TECHNIQUE_TABLE}
    WHERE is_published = true
  `);
  const row = result.rows[0] as { count: number; max_updated_at: string } | undefined;
  return {
    count: row?.count ?? 0,
    maxUpdatedAt: row?.max_updated_at ?? '',
  };
}

// ─── 已发布模板加载 ───

export interface GeneratedTechniqueRow {
  id: string;
  template: unknown;
}

export async function loadPublishedGeneratedTechniques(pool: Pool): Promise<GeneratedTechniqueRow[]> {
  const result = await pool.query(`
    SELECT id, template
    FROM ${GENERATED_TECHNIQUE_TABLE}
    WHERE is_published = true
    ORDER BY created_at DESC
  `);
  return result.rows as GeneratedTechniqueRow[];
}

// ─── GM 只读查询 ───

export interface ListGeneratedTechniquesForGmParams {
  page: number;
  pageSize: number;
}

interface GeneratedTechniqueGmRow {
  id: string;
  generation_id: string;
  template: unknown;
  schema_version?: number | string | null;
  status: string;
  usage_scope?: string | null;
  is_published: boolean;
  published_at?: Date | string | null;
  display_name?: string | null;
  created_by_player_id: string;
  model_name?: string | null;
  prompt_snapshot?: string | null;
  validation_report?: unknown;
  grade?: string | null;
  category?: string | null;
  realm_lv?: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function listGeneratedTechniquesForGm(
  pool: Pool,
  params: ListGeneratedTechniquesForGmParams,
): Promise<{ techniques: GmGeneratedTechniqueSummary[]; page: GmGeneratedTechniqueListPage }> {
  const pageSize = clampInteger(params.pageSize, 1, 50, 50);
  const requestedPage = clampInteger(params.page, 1, 1_000_000, 1);
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM ${GENERATED_TECHNIQUE_TABLE}`);
  const total = normalizeInteger((countResult.rows[0] as { total?: unknown } | undefined)?.total, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const listResult = await pool.query(
    `SELECT id,
            generation_id,
            template,
            status,
            is_published,
            published_at,
            display_name,
            created_by_player_id,
            grade,
            category,
            realm_lv,
            created_at,
            updated_at
       FROM ${GENERATED_TECHNIQUE_TABLE}
      ORDER BY created_at DESC, id DESC
      LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );

  return {
    techniques: (listResult.rows as GeneratedTechniqueGmRow[]).map(toGeneratedTechniqueSummary),
    page: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function getGeneratedTechniqueForGm(
  pool: Pool,
  id: string,
): Promise<GmGeneratedTechniqueDetailRes['technique'] | null> {
  const result = await pool.query(
    `SELECT id,
            generation_id,
            template,
            schema_version,
            status,
            usage_scope,
            is_published,
            published_at,
            display_name,
            created_by_player_id,
            model_name,
            prompt_snapshot,
            validation_report,
            grade,
            category,
            realm_lv,
            created_at,
            updated_at
       FROM ${GENERATED_TECHNIQUE_TABLE}
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  const row = result.rows[0] as GeneratedTechniqueGmRow | undefined;
  if (!row) {
    return null;
  }
  const summary = toGeneratedTechniqueSummary(row);
  const rawJson = toGeneratedTechniqueRawJson(row);
  return {
    ...summary,
    schemaVersion: normalizeInteger(row.schema_version, 1),
    usageScope: typeof row.usage_scope === 'string' ? row.usage_scope : 'player_only',
    modelName: row.model_name ?? null,
    promptSnapshot: row.prompt_snapshot ?? null,
    validationReport: row.validation_report ?? null,
    template: row.template,
    rawJson,
  };
}

function toGeneratedTechniqueSummary(row: GeneratedTechniqueGmRow): GmGeneratedTechniqueSummary {
  const templateRecord = isRecord(row.template) ? row.template : null;
  const displayName = row.display_name?.trim()
    || getStringField(templateRecord, 'name')
    || row.id;
  const grade = normalizeOptionalString(row.grade) ?? getStringField(templateRecord, 'grade');
  const category = normalizeOptionalString(row.category) ?? getStringField(templateRecord, 'category');
  const realmLv = normalizeNullableInteger(row.realm_lv) ?? normalizeNullableInteger(templateRecord?.realmLv);
  return {
    id: row.id,
    generationId: row.generation_id,
    createdAt: formatDbTimestamp(row.created_at),
    updatedAt: formatDbTimestamp(row.updated_at),
    publishedAt: row.published_at === null || row.published_at === undefined ? null : formatDbTimestamp(row.published_at),
    name: displayName,
    grade,
    category,
    realmLv,
    status: row.status,
    isPublished: Boolean(row.is_published),
    createdByPlayerId: row.created_by_player_id,
  };
}

function toGeneratedTechniqueRawJson(row: GeneratedTechniqueGmRow): Record<string, unknown> {
  return {
    id: row.id,
    generation_id: row.generation_id,
    template: row.template,
    schema_version: normalizeInteger(row.schema_version, 1),
    status: row.status,
    usage_scope: row.usage_scope ?? null,
    is_published: Boolean(row.is_published),
    published_at: row.published_at === null || row.published_at === undefined ? null : formatDbTimestamp(row.published_at),
    display_name: row.display_name ?? null,
    created_by_player_id: row.created_by_player_id,
    model_name: row.model_name ?? null,
    prompt_snapshot: row.prompt_snapshot ?? null,
    validation_report: row.validation_report ?? null,
    grade: row.grade ?? null,
    category: row.category ?? null,
    realm_lv: normalizeNullableInteger(row.realm_lv),
    created_at: formatDbTimestamp(row.created_at),
    updated_at: formatDbTimestamp(row.updated_at),
  };
}

// ─── 写入操作 ───

export interface InsertGeneratedTechniqueParams {
  id: string;
  generationId: string;
  template: unknown;
  schemaVersion: number;
  createdByPlayerId: string;
  modelName: string;
  promptSnapshot: string;
  validationReport: unknown;
  grade: string;
  category: string;
  realmLv: number;
}

export async function insertGeneratedTechnique(pool: Pool, params: InsertGeneratedTechniqueParams): Promise<void> {
  await pool.query(
    `INSERT INTO ${GENERATED_TECHNIQUE_TABLE} (
      id, generation_id, template, schema_version,
      status, created_by_player_id, model_name,
      prompt_snapshot, validation_report,
      grade, category, realm_lv
    ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11)`,
    [
      params.id, params.generationId, JSON.stringify(params.template), params.schemaVersion,
      params.createdByPlayerId, params.modelName,
      params.promptSnapshot, JSON.stringify(params.validationReport),
      params.grade, params.category, params.realmLv,
    ],
  );
}

export interface PublishGeneratedTechniqueParams {
  id: string;
  displayName: string;
  normalizedName: string;
}

export async function publishGeneratedTechnique(pool: Pool, params: PublishGeneratedTechniqueParams): Promise<void> {
  await pool.query(
    `UPDATE ${GENERATED_TECHNIQUE_TABLE}
     SET is_published = true,
         published_at = NOW(),
         display_name = $2::text,
         normalized_name = $3::text,
         name_locked = true,
         template = jsonb_set(template, '{name}', to_jsonb($2::text), true),
         status = 'published',
         updated_at = NOW()
     WHERE id = $1`,
    [params.id, params.displayName, params.normalizedName],
  );
}

// ─── Job 操作 ───

export interface InsertGenerationJobParams {
  id: string;
  playerId: string;
  requestedCategory: string;
  rolledGrade: string;
  rolledRealmLv: number;
  playerContext: string;
}

export async function insertGenerationJob(pool: Pool, params: InsertGenerationJobParams): Promise<void> {
  await pool.query(
    `INSERT INTO ${TECHNIQUE_GENERATION_JOB_TABLE} (
      id, player_id, status, requested_category,
      rolled_grade, rolled_realm_lv, player_context
    ) VALUES ($1,$2,'pending',$3,$4,$5,$6)`,
    [
      params.id, params.playerId, params.requestedCategory,
      params.rolledGrade, params.rolledRealmLv, params.playerContext,
    ],
  );
}

export interface UpdateGenerationJobDraftParams {
  id: string;
  draftTechniqueId: string;
  modelName: string;
  attemptCount: number;
  draftExpireHours: number;
}

export async function updateGenerationJobToDraft(pool: Pool, params: UpdateGenerationJobDraftParams): Promise<void> {
  await pool.query(
    `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
     SET status = 'generated_draft',
         draft_technique_id = $2,
         model_name = $3,
         attempt_count = $4,
         draft_expire_at = NOW() + ($5::int * INTERVAL '1 hour'),
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [params.id, params.draftTechniqueId, params.modelName, params.attemptCount, params.draftExpireHours],
  );
}

export async function updateGenerationJobStatus(
  pool: Pool,
  id: string,
  status: string,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
     SET status = $2,
         error_code = $3,
         error_message = $4,
         finished_at = COALESCE(finished_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [id, status, errorCode ?? null, errorMessage ?? null],
  );
}

export async function expireStaleGenerationJobs(pool: Pool): Promise<number> {
  const result = await pool.query(
    `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'generated_draft'
       AND draft_expire_at IS NOT NULL
       AND draft_expire_at <= NOW()`,
  );
  return result.rowCount ?? 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const normalized = normalizeInteger(value, fallback);
  return Math.max(min, Math.min(max, normalized));
}

function normalizeInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function normalizeNullableInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.trunc(numeric);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function formatDbTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
