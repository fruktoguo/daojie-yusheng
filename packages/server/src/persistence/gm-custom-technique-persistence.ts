/** GM 手工功法的幂等发布持久化。 */
import type { TechniqueTemplate } from '@mud/shared';
import type { Pool, PoolClient } from 'pg';

import { GENERATED_TECHNIQUE_TABLE } from './generated-technique-persistence.service';

const GM_CUSTOM_TECHNIQUE_LOCK_NAMESPACE = 7104;

export interface PublishGmCustomTechniqueInput {
  id: string;
  generationId: string;
  operationId: string;
  requestFingerprint: string;
  template: TechniqueTemplate;
  schemaVersion: number;
  createdByPlayerId: string;
  normalizedName: string;
  validationReport: Record<string, unknown>;
}

export type PublishGmCustomTechniqueResult =
  | { ok: true; created: boolean; techniqueId: string }
  | { ok: false; errorCode: 'OPERATION_CONFLICT' | 'NAME_CONFLICT' };

export async function publishGmCustomTechnique(
  pool: Pool,
  input: PublishGmCustomTechniqueInput,
): Promise<PublishGmCustomTechniqueResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireGmCustomTechniqueLock(client, `operation:${input.operationId}`);

    const existingResult = await client.query(
      `SELECT id,
              generation_id,
              validation_report->'manual'->>'requestFingerprint' AS request_fingerprint
         FROM ${GENERATED_TECHNIQUE_TABLE}
        WHERE id = $1
        LIMIT 1`,
      [input.id],
    );
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0] as {
        id?: unknown;
        generation_id?: unknown;
        request_fingerprint?: unknown;
      };
      const replayMatches = existing.generation_id === input.generationId
        && existing.request_fingerprint === input.requestFingerprint
        && typeof existing.id === 'string';
      await client.query(replayMatches ? 'COMMIT' : 'ROLLBACK');
      return replayMatches
        ? { ok: true, created: false, techniqueId: existing.id as string }
        : { ok: false, errorCode: 'OPERATION_CONFLICT' };
    }

    await acquireGmCustomTechniqueLock(client, `name:${input.normalizedName}`);
    const nameConflictResult = await client.query(
      `SELECT id
         FROM ${GENERATED_TECHNIQUE_TABLE}
        WHERE normalized_name = $1
          AND is_published = true
        LIMIT 1`,
      [input.normalizedName],
    );
    if (nameConflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return { ok: false, errorCode: 'NAME_CONFLICT' };
    }

    await client.query(
      `INSERT INTO ${GENERATED_TECHNIQUE_TABLE} (
        id, generation_id, template, schema_version,
        status, usage_scope, is_published, published_at,
        display_name, normalized_name, name_locked,
        created_by_player_id, model_name, prompt_snapshot, validation_report,
        grade, category, realm_lv
      ) VALUES (
        $1, $2, $3::jsonb, $4,
        'published', 'player_only', true, NOW(),
        $5, $6, true,
        $7, 'gm_manual', NULL, $8::jsonb,
        $9, $10, $11
      )`,
      [
        input.id,
        input.generationId,
        JSON.stringify(input.template),
        input.schemaVersion,
        input.template.name,
        input.normalizedName,
        input.createdByPlayerId,
        JSON.stringify(input.validationReport),
        input.template.grade,
        input.template.category,
        input.template.realmLv,
      ],
    );
    await client.query('COMMIT');
    return { ok: true, created: true, techniqueId: input.id };
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isPostgresUniqueViolation(error)) {
      return { ok: false, errorCode: 'NAME_CONFLICT' };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function acquireGmCustomTechniqueLock(client: PoolClient, key: string): Promise<void> {
  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
    [GM_CUSTOM_TECHNIQUE_LOCK_NAMESPACE, key],
  );
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && String((error as { code?: unknown }).code ?? '') === '23505',
  );
}
