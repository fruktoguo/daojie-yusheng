/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import type {
  AiProviderConfigRecord,
  AiProviderModelRecord,
  AiProviderConfigUpsertInput,
  AiProviderKind,
} from './ai-provider-config.types';

export const AI_PROVIDER_CONFIG_TABLE = 'server_ai_provider_config';
const AI_PROVIDER_CONFIG_LOCK_NAMESPACE = 42886;

const normalizeScope = (scope: string): string => {
  const normalized = scope.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'default';
};

const normalizeKind = (kind: AiProviderKind): AiProviderKind => kind === 'image' ? 'image' : 'text';

const normalizeText = (value: string, fallback = ''): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
};

const normalizeTimeoutMs = (value: number | undefined): number => {
  const normalized = Math.trunc(Number(value) || 0);
  return normalized > 0 ? normalized : 30_000;
};

const normalizeModelName = (value: unknown): string => String(value ?? '').trim();

export const normalizeAiProviderModels = (value: unknown, legacyModelName = ''): AiProviderModelRecord[] => {
  const seen = new Set<string>();
  const result: AiProviderModelRecord[] = [];
  const now = new Date().toISOString();
  const sourceRows = Array.isArray(value) ? value : [];
  for (const entry of sourceRows) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Partial<AiProviderModelRecord>;
    const name = normalizeModelName(row.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({
      name,
      enabled: row.enabled !== false,
      source: row.source === 'fetched' || row.source === 'legacy' ? row.source : 'manual',
      addedAt: normalizeModelName(row.addedAt) || now,
    });
  }
  const legacyName = normalizeModelName(legacyModelName);
  if (legacyName && !seen.has(legacyName)) {
    result.unshift({
      name: legacyName,
      enabled: true,
      source: 'legacy',
      addedAt: now,
    });
  }
  return result;
};

const toRecord = (row: any): AiProviderConfigRecord => ({
  scope: String(row.scope ?? ''),
  kind: normalizeKind(row.kind),
  provider: String(row.provider ?? '') as AiProviderConfigRecord['provider'],
  baseURL: String(row.base_url ?? ''),
  modelName: String(row.model_name ?? ''),
  models: normalizeAiProviderModels(row.models, row.model_name),
  timeoutMs: Math.max(0, Math.trunc(Number(row.timeout_ms) || 0)),
  imageSize: String(row.image_size ?? ''),
  imageQuality: String(row.image_quality ?? ''),
  secretKeyRef: String(row.secret_key_ref ?? ''),
  enabled: row.enabled === true,
  revision: Math.max(0, Math.trunc(Number(row.revision) || 0)),
  updatedBy: String(row.updated_by ?? ''),
  updatedAt: row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : String(row.updated_at ?? ''),
});

@Injectable()
export class AiProviderConfigPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiProviderConfigPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
    this.initialized = false;
    this.initPromise = null;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  async list(): Promise<AiProviderConfigRecord[]> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return [];
    const result = await this.pool.query(
      `SELECT scope, kind, provider, base_url, model_name, timeout_ms,
              image_size, image_quality, secret_key_ref, models, enabled, revision,
              updated_by, updated_at
         FROM ${AI_PROVIDER_CONFIG_TABLE}
        ORDER BY kind ASC, scope ASC`,
    );
    return Array.isArray(result.rows) ? result.rows.map(toRecord) : [];
  }

  async get(scope: string, kind: AiProviderKind): Promise<AiProviderConfigRecord | null> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return null;
    const result = await this.pool.query(
      `SELECT scope, kind, provider, base_url, model_name, timeout_ms,
              image_size, image_quality, secret_key_ref, models, enabled, revision,
              updated_by, updated_at
         FROM ${AI_PROVIDER_CONFIG_TABLE}
        WHERE scope = $1 AND kind = $2
        LIMIT 1`,
      [normalizeScope(scope), normalizeKind(kind)],
    );
    if ((result.rowCount ?? 0) <= 0) return null;
    return toRecord(result.rows[0]);
  }

  async upsert(input: AiProviderConfigUpsertInput): Promise<AiProviderConfigRecord | null> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return null;
    const scope = normalizeScope(input.scope);
    const kind = normalizeKind(input.kind);
    const provider = normalizeText(input.provider);
    const baseURL = normalizeText(input.baseURL);
    const modelName = normalizeText(input.modelName);
    const models = normalizeAiProviderModels(input.models, modelName);
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
    const imageSize = kind === 'image' ? normalizeText(input.imageSize, '1024x1024') : '';
    const imageQuality = kind === 'image' ? normalizeText(input.imageQuality, 'medium') : '';
    const secretKeyRef = normalizeText(input.secretKeyRef);
    const enabled = input.enabled !== false;
    const updatedBy = normalizeText(input.updatedBy, 'system');

    const result = await this.pool.query(
      `INSERT INTO ${AI_PROVIDER_CONFIG_TABLE}
        (scope, kind, provider, base_url, model_name, timeout_ms,
         image_size, image_quality, secret_key_ref, models, enabled, revision, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 1, $12, now())
       ON CONFLICT (scope, kind)
       DO UPDATE SET provider = EXCLUDED.provider,
                     base_url = EXCLUDED.base_url,
                     model_name = EXCLUDED.model_name,
                     timeout_ms = EXCLUDED.timeout_ms,
                     image_size = EXCLUDED.image_size,
                     image_quality = EXCLUDED.image_quality,
                     secret_key_ref = EXCLUDED.secret_key_ref,
                     models = EXCLUDED.models,
                     enabled = EXCLUDED.enabled,
                     revision = ${AI_PROVIDER_CONFIG_TABLE}.revision + 1,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()
       RETURNING scope, kind, provider, base_url, model_name, timeout_ms,
                 image_size, image_quality, secret_key_ref, models, enabled, revision,
                 updated_by, updated_at`,
      [
        scope,
        kind,
        provider,
        baseURL,
        modelName,
        timeoutMs,
        imageSize,
        imageQuality,
        secretKeyRef,
        JSON.stringify(models),
        enabled,
        updatedBy,
      ],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async delete(scope: string, kind: AiProviderKind): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return false;
    const result = await this.pool.query(
      `DELETE FROM ${AI_PROVIDER_CONFIG_TABLE} WHERE scope = $1 AND kind = $2`,
      [normalizeScope(scope), normalizeKind(kind)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async initialize(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('ai-provider-config') ?? null;
    if (!this.pool) {
      this.initialized = true;
      return;
    }
    try {
      await ensureAiProviderConfigTable(this.pool);
      this.enabled = true;
      this.logger.log('AI 提供者配置持久化已启用');
    } catch (error: unknown) {
      this.logger.warn(`AI 提供者配置初始化失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.initialized = true;
  }
}

async function ensureAiProviderConfigTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(${AI_PROVIDER_CONFIG_LOCK_NAMESPACE})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${AI_PROVIDER_CONFIG_TABLE} (
        scope varchar(80) NOT NULL,
        kind varchar(16) NOT NULL,
        provider varchar(32) NOT NULL,
        base_url text NOT NULL DEFAULT '',
        model_name varchar(160) NOT NULL DEFAULT '',
        timeout_ms integer NOT NULL DEFAULT 30000,
        image_size varchar(32) NOT NULL DEFAULT '',
        image_quality varchar(32) NOT NULL DEFAULT '',
        secret_key_ref varchar(80) NOT NULL DEFAULT '',
        models jsonb NOT NULL DEFAULT '[]'::jsonb,
        enabled boolean NOT NULL DEFAULT true,
        revision bigint NOT NULL DEFAULT 1,
        updated_by varchar(120) NOT NULL DEFAULT 'system',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, kind)
      )
    `);
    await client.query(`
      ALTER TABLE ${AI_PROVIDER_CONFIG_TABLE}
      ADD COLUMN IF NOT EXISTS models jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await client.query(`
      UPDATE ${AI_PROVIDER_CONFIG_TABLE}
         SET models = jsonb_build_array(jsonb_build_object(
               'name', model_name,
               'enabled', true,
               'source', 'legacy',
               'addedAt', COALESCE(updated_at, now())::text
             ))
       WHERE model_name <> ''
         AND (models IS NULL OR jsonb_array_length(models) = 0)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
