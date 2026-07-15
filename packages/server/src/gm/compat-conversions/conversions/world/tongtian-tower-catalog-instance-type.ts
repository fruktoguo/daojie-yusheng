/**
 * 将历史通天塔 catalog 行的 instance_type 从 public 显式转换为 tower。
 *
 * 旧版本曾把专用塔层登记成 public。当前运行时会严格校验稳定实例身份，因此这些行在
 * 空闲销毁后无法重新物化。转换只处理精确塔层 ID、精确模板、已到期 tombstone 且没有
 * 任何 lease/owner 的行；apply 会推进 ownership_epoch 与 metadata_version，阻断旧运行态回写。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const TONGTIAN_TOWER_CATALOG_INSTANCE_TYPE_CONVERSION_ID = 'tongtian_tower_catalog_instance_type';

const INSTANCE_CATALOG_TABLE = 'instance_catalog';
const TOWER_INSTANCE_PATTERN = /^tower:tongtian:layer:([1-9]\d*)$/;
const TOWER_TEMPLATE_PREFIX = 'tongtian_tower_layer_';
const SAMPLE_LIMIT = 10;

interface CatalogQueryable {
  query(sql: string, params?: unknown[]): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }>;
}

interface CatalogCandidateRow {
  instance_id: string;
  template_id: string;
  instance_type: string;
  persistent_policy: string;
  owner_player_id: string | null;
  owner_sect_id: string | null;
  party_id: string | null;
  line_id: string | null;
  status: string;
  runtime_status: string;
  assigned_node_id: string | null;
  lease_token: string | null;
  lease_expire_at: string | Date | null;
  ownership_epoch: string | number;
  metadata_version: string | number;
  shard_key: string;
  route_domain: string | null;
  destroy_at: string | Date | null;
}

interface CatalogCandidateAnalysis {
  row: CatalogCandidateRow;
  expectedTemplateId: string | null;
  convertible: boolean;
  status: string;
  nextOwnershipEpoch: number | null;
  nextMetadataVersion: number | null;
}

interface AppliedCatalogIdentity {
  instanceId: string;
  expectedTemplateId: string;
  expectedStatus: string;
  expectedRuntimeStatus: string;
  expectedOwnershipEpoch: number;
  expectedMetadataVersion: number;
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: TONGTIAN_TOWER_CATALOG_INSTANCE_TYPE_CONVERSION_ID,
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

@Injectable()
export class TongtianTowerCatalogInstanceTypeConversion {
  private readonly logger = new Logger(TongtianTowerCatalogInstanceTypeConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-tongtian-tower-catalog-instance-type');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    const result = createEmptyResult(options.mode);

    if (options.mode === 'dry-run') {
      const analyses = await this.loadAnalyses(pool as unknown as CatalogQueryable, false);
      this.populateScanResult(result, analyses);
      result.convertedRows = analyses.filter((entry) => entry.convertible).length;
      await this.recordAudit(result, options);
      return result;
    }

    const client = await pool.connect();
    const applied: AppliedCatalogIdentity[] = [];
    let convertibleCount = 0;
    try {
      await client.query('BEGIN');
      const analyses = await this.loadAnalyses(client as unknown as CatalogQueryable, true);
      this.populateScanResult(result, analyses);
      convertibleCount = analyses.filter((entry) => entry.convertible).length;

      for (const analysis of analyses) {
        if (!analysis.convertible
          || !analysis.expectedTemplateId
          || analysis.nextOwnershipEpoch === null
          || analysis.nextMetadataVersion === null) {
          continue;
        }
        const row = analysis.row;
        const updated = await client.query(
          `UPDATE ${INSTANCE_CATALOG_TABLE}
              SET instance_type = 'tower',
                  ownership_epoch = ownership_epoch + 1,
                  metadata_version = GREATEST(metadata_version + 1, ownership_epoch + 1)
            WHERE instance_id = $1
              AND template_id = $2
              AND instance_type = 'public'
              AND persistent_policy = 'persistent'
              AND owner_player_id IS NULL
              AND owner_sect_id IS NULL
              AND party_id IS NULL
              AND line_id IS NULL
              AND status = $5
              AND runtime_status = $6
              AND assigned_node_id IS NULL
              AND lease_token IS NULL
              AND lease_expire_at IS NULL
              AND ownership_epoch = $3
              AND metadata_version = $4
              AND shard_key = instance_id
              AND route_domain = 'system'
              AND destroy_at IS NOT NULL
              AND destroy_at <= now()
          RETURNING instance_id, ownership_epoch, metadata_version`,
          [
            row.instance_id,
            analysis.expectedTemplateId,
            normalizeSafeInteger(row.ownership_epoch),
            normalizeSafeInteger(row.metadata_version),
            row.status,
            row.runtime_status,
          ],
        );
        if ((updated.rowCount ?? 0) !== 1) {
          throw new Error(`catalog_identity_cas_failed:${row.instance_id}`);
        }
        applied.push({
          instanceId: row.instance_id,
          expectedTemplateId: analysis.expectedTemplateId,
          expectedStatus: row.status,
          expectedRuntimeStatus: row.runtime_status,
          expectedOwnershipEpoch: analysis.nextOwnershipEpoch,
          expectedMetadataVersion: analysis.nextMetadataVersion,
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.convertedRows = 0;
      result.failedRows = convertibleCount;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`通天塔 catalog 身份转换失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    result.convertedRows = applied.length;
    result.verifiedRows = await this.verifyAppliedRows(pool, applied, result);
    const unverifiedRows = result.convertedRows - result.verifiedRows;
    if (unverifiedRows > 0) {
      result.failedRows += unverifiedRows;
      result.errors.push(`回读有 ${unverifiedRows} 条通天塔 catalog 身份未通过验证`);
    }
    result.appliedAt = new Date().toISOString();
    this.logger.log(
      `通天塔 catalog 身份转换完成：命中 ${result.matchedRows}，转换 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  private async loadAnalyses(queryable: CatalogQueryable, lockRows: boolean): Promise<CatalogCandidateAnalysis[]> {
    const result = await queryable.query(
      `SELECT instance_id,
              template_id,
              instance_type,
              persistent_policy,
              owner_player_id,
              owner_sect_id,
              party_id,
              line_id,
              status,
              runtime_status,
              assigned_node_id,
              lease_token,
              lease_expire_at,
              ownership_epoch,
              metadata_version,
              shard_key,
              route_domain,
              destroy_at
         FROM ${INSTANCE_CATALOG_TABLE}
        WHERE instance_id LIKE 'tower:tongtian:layer:%'
          AND instance_type = 'public'
        ORDER BY instance_id ASC
        ${lockRows ? 'FOR UPDATE' : ''}`,
    );
    return result.rows.map((row) => analyzeCandidate(row as unknown as CatalogCandidateRow));
  }

  private populateScanResult(
    result: GmCompatConversionRunResult,
    analyses: CatalogCandidateAnalysis[],
  ): void {
    result.matchedRows = analyses.length;
    result.skippedRows = analyses.filter((entry) => !entry.convertible).length;
    for (const analysis of analyses) {
      if (result.samples.length >= SAMPLE_LIMIT) {
        break;
      }
      result.samples.push(buildSample(analysis));
    }
  }

  private async verifyAppliedRows(
    pool: Pool,
    applied: AppliedCatalogIdentity[],
    result: GmCompatConversionRunResult,
  ): Promise<number> {
    if (applied.length === 0) {
      return 0;
    }
    const rows = await pool.query(
      `SELECT instance_id,
              template_id,
              instance_type,
              status,
              runtime_status,
              ownership_epoch,
              metadata_version,
              destroy_at
         FROM ${INSTANCE_CATALOG_TABLE}
        WHERE instance_id = ANY($1::varchar[])
        ORDER BY instance_id ASC`,
      [applied.map((entry) => entry.instanceId)],
    );
    const rowById = new Map(rows.rows.map((row) => [String(row.instance_id), row]));
    let verified = 0;
    for (const expected of applied) {
      const row = rowById.get(expected.instanceId);
      const valid = Boolean(row)
        && String(row?.template_id ?? '') === expected.expectedTemplateId
        && String(row?.instance_type ?? '') === 'tower'
        && String(row?.status ?? '') === expected.expectedStatus
        && String(row?.runtime_status ?? '') === expected.expectedRuntimeStatus
        && normalizeSafeInteger(row?.ownership_epoch) === expected.expectedOwnershipEpoch
        && normalizeSafeInteger(row?.metadata_version) >= expected.expectedMetadataVersion
        && isDestroyAtReached(row?.destroy_at);
      if (valid) {
        verified += 1;
      } else {
        result.errors.push(`catalog_identity_verify_failed:${expected.instanceId}`);
      }
    }
    return verified;
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${TONGTIAN_TOWER_CATALOG_INSTANCE_TYPE_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: TONGTIAN_TOWER_CATALOG_INSTANCE_TYPE_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { mode: options.mode, instanceType: 'public' },
        after: {
          instanceType: 'tower',
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
      this.logger.warn(`通天塔 catalog 身份转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function analyzeCandidate(row: CatalogCandidateRow): CatalogCandidateAnalysis {
  const match = TOWER_INSTANCE_PATTERN.exec(row.instance_id);
  const layer = match ? Number(match[1]) : Number.NaN;
  const expectedTemplateId = Number.isSafeInteger(layer) && layer > 0
    ? `${TOWER_TEMPLATE_PREFIX}${layer}`
    : null;
  const ownershipEpoch = normalizeSafeInteger(row.ownership_epoch);
  const metadataVersion = normalizeSafeInteger(row.metadata_version);
  const statusPairAllowed = (row.status === 'destroyed' && row.runtime_status === 'stopped')
    || (row.status === 'active' && row.runtime_status === 'running');

  const checks: Array<[boolean, string]> = [
    [expectedTemplateId !== null, 'instance_id_not_canonical'],
    [expectedTemplateId !== null && row.template_id === expectedTemplateId, 'template_identity_mismatch'],
    [row.persistent_policy === 'persistent', 'persistent_policy_mismatch'],
    [row.owner_player_id === null && row.owner_sect_id === null && row.party_id === null && row.line_id === null, 'owner_scope_not_empty'],
    [row.route_domain === 'system' && row.shard_key === row.instance_id, 'routing_identity_mismatch'],
    [row.assigned_node_id === null && row.lease_token === null && row.lease_expire_at === null, 'lease_not_empty'],
    [statusPairAllowed, 'status_not_stable_tombstone'],
    [isDestroyAtReached(row.destroy_at), 'destroy_at_not_expired'],
    [ownershipEpoch !== null && metadataVersion !== null, 'version_not_safe_integer'],
  ];
  const failed = checks.find(([ok]) => !ok);
  const convertible = failed === undefined;
  return {
    row,
    expectedTemplateId,
    convertible,
    status: convertible ? 'convertible_legacy_public_tower' : failed![1],
    nextOwnershipEpoch: convertible ? ownershipEpoch! + 1 : null,
    nextMetadataVersion: convertible ? Math.max(metadataVersion! + 1, ownershipEpoch! + 1) : null,
  };
}

function buildSample(analysis: CatalogCandidateAnalysis): GmCompatConversionSample {
  const row = analysis.row;
  return {
    id: row.instance_id,
    name: row.template_id,
    status: analysis.status,
    before: {
      instanceType: row.instance_type,
      persistentPolicy: row.persistent_policy,
      status: row.status,
      runtimeStatus: row.runtime_status,
      assignedNodeId: row.assigned_node_id,
      hasLeaseCredential: !isEmpty(row.lease_token),
      leaseExpireAt: toIsoString(row.lease_expire_at),
      ownershipEpoch: normalizeSafeInteger(row.ownership_epoch),
      metadataVersion: normalizeSafeInteger(row.metadata_version),
      routeDomain: row.route_domain,
      destroyAt: toIsoString(row.destroy_at),
    },
    after: analysis.convertible ? {
      instanceType: 'tower',
      ownershipEpoch: analysis.nextOwnershipEpoch,
      metadataVersion: analysis.nextMetadataVersion,
      destroyAtPreserved: true,
    } : {
      unchanged: true,
      reason: analysis.status,
    },
  };
}

function normalizeSafeInteger(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
}

function isDestroyAtReached(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const timestamp = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
