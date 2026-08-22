/**
 * 建筑历史旧权限 (treasureVaultPermissions / techniqueAggregationPermissions)
 * 到通用权限槽位 accessPolicies 的一键兼容转换。
 *
 * 转换按安全交集规则把历史藏宝阁与统法台权限迁移为标准通用权限，并从 payload 中移除旧字段。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  EVERYONE_ACCESS_POLICY,
  OWNER_ONLY_ACCESS_POLICY,
  TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT,
  TREASURE_VAULT_ACCESS_POLICY_SLOT,
  cloneAccessPolicy,
  validateAccessPolicy,
  type AccessPolicy,
  type AccessPolicyCondition,
  type AccessPolicyRelationKind,
  type SectMemberRole,
} from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const BUILDING_ACCESS_POLICY_CONVERSION_ID = 'building_access_policy';

const INSTANCE_BUILDING_STATE_TABLE = 'instance_building_state';
const SAMPLE_LIMIT = 10;
const TREASURE_VAULT_DEF_ID = 'treasure_vault';
const TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID = 'technique_unification_platform';
const LEGACY_TREASURE_SCOPE_KEYS = new Set(['all', 'party', 'sect', 'dao_friend', 'close_friend']);

interface BuildingStateRow {
  instance_id: string;
  building_id: string;
  def_id: string;
  payload: Record<string, unknown>;
}

interface BuildingPolicyCandidate {
  instanceId: string;
  buildingId: string;
  defId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  accessPolicies: Record<string, AccessPolicy>;
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: BUILDING_ACCESS_POLICY_CONVERSION_ID,
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

function buildSample(candidate: BuildingPolicyCandidate): GmCompatConversionSample {
  return {
    id: `${candidate.instanceId}/${candidate.buildingId}`,
    name: candidate.defId,
    status: 'convertible_legacy_building_permissions',
    before: candidate.before,
    after: candidate.after,
  };
}

@Injectable()
export class BuildingAccessPolicyConversion {
  private readonly logger = new Logger(BuildingAccessPolicyConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-building-access-policy');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }

    const result = createEmptyResult(options.mode);
    const rows = await this.loadCandidateRows(pool);
    result.matchedRows = rows.length;

    const candidates: BuildingPolicyCandidate[] = [];
    for (const row of rows) {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const convertedPolicies = normalizePersistedBuildingAccessPolicies(payload, row.def_id);
      if (!convertedPolicies) {
        result.skippedRows += 1;
        continue;
      }
      const updatedPayload: Record<string, unknown> = {
        ...payload,
        accessPolicies: convertedPolicies,
      };
      delete updatedPayload.treasureVaultPermissions;
      delete updatedPayload.techniqueAggregationPermissions;

      candidates.push({
        instanceId: row.instance_id,
        buildingId: row.building_id,
        defId: row.def_id,
        before: {
          treasureVaultPermissions: payload.treasureVaultPermissions,
          techniqueAggregationPermissions: payload.techniqueAggregationPermissions,
          accessPolicies: payload.accessPolicies,
        },
        after: {
          accessPolicies: convertedPolicies,
        },
        accessPolicies: convertedPolicies,
      });
    }

    result.samples = candidates.slice(0, SAMPLE_LIMIT).map(buildSample);

    if (options.mode === 'dry-run') {
      result.convertedRows = candidates.length;
      result.verifiedRows = candidates.length;
      await this.recordAudit(result, options);
      return result;
    }

    if (candidates.length === 0) {
      result.appliedAt = new Date().toISOString();
      await this.recordAudit(result, options);
      return result;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const candidate of candidates) {
        await client.query(
          `
            UPDATE ${INSTANCE_BUILDING_STATE_TABLE}
               SET payload = (payload - 'treasureVaultPermissions' - 'techniqueAggregationPermissions') || jsonb_build_object('accessPolicies', $3::jsonb),
                   updated_at = now()
             WHERE instance_id = $1
               AND building_id = $2
          `,
          [
            candidate.instanceId,
            candidate.buildingId,
            JSON.stringify(candidate.accessPolicies),
          ],
        );
      }
      await client.query('COMMIT');
      result.convertedRows = candidates.length;
      result.verifiedRows = candidates.length;
      result.appliedAt = new Date().toISOString();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.convertedRows = 0;
      result.failedRows = candidates.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`建筑权限转换失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    this.logger.log(
      `建筑权限转换完成：扫描 ${result.matchedRows}，转换 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  private async loadCandidateRows(pool: Pool): Promise<BuildingStateRow[]> {
    const result = await pool.query(
      `
        SELECT instance_id, building_id, def_id, payload
          FROM ${INSTANCE_BUILDING_STATE_TABLE}
         WHERE payload ? 'treasureVaultPermissions'
            OR payload ? 'techniqueAggregationPermissions'
         ORDER BY instance_id ASC, building_id ASC
      `,
    );
    return result.rows as BuildingStateRow[];
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${BUILDING_ACCESS_POLICY_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: BUILDING_ACCESS_POLICY_CONVERSION_ID,
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
      this.logger.warn(`建筑权限转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function normalizePersistedBuildingAccessPolicies(
  entry: unknown,
  defIdInput: unknown,
): Record<string, AccessPolicy> | undefined {
  const source = isRecord(entry) ? entry : {};
  const defId = normalizeText(defIdInput);
  const result = normalizeExplicitPolicies(source.accessPolicies);

  if (defId === TREASURE_VAULT_DEF_ID && isRecord(source.treasureVaultPermissions)) {
    const legacy = source.treasureVaultPermissions;
    if (!result[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit]) {
      result[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit] = convertLegacyTreasureViewDepositPolicy(
        legacy.view,
        legacy.deposit,
      );
    }
    if (!result[TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw]) {
      result[TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw] = convertLegacyTreasureScopePolicy(legacy.withdraw);
    }
  }

  if (defId === TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID && isRecord(source.techniqueAggregationPermissions)) {
    const legacy = source.techniqueAggregationPermissions;
    if (!result[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read]) {
      result[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read] = convertLegacyTechniquePolicy(
        legacy.read,
        EVERYONE_ACCESS_POLICY,
      );
    }
    if (!result[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision]) {
      result[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision] = convertLegacyTechniquePolicy(
        legacy.revision,
        OWNER_ONLY_ACCESS_POLICY,
      );
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeExplicitPolicies(value: unknown): Record<string, AccessPolicy> {
  if (!isRecord(value)) return {};
  const result: Record<string, AccessPolicy> = {};
  for (const [slotInput, policyInput] of Object.entries(value)) {
    const slot = normalizeText(slotInput);
    const validated = validateAccessPolicy(policyInput, { requireResolvedPlayers: true });
    if (!slot) continue;
    result[slot] = validated.ok && validated.policy
      ? cloneAccessPolicy(validated.policy)
      : cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY);
  }
  return result;
}

function convertLegacyTreasureViewDepositPolicy(viewInput: unknown, depositInput: unknown): AccessPolicy {
  const view = normalizeLegacyTreasureScopes(viewInput, ['all']);
  const deposit = normalizeLegacyTreasureScopes(depositInput, ['all']);
  if (view.has('all')) return buildLegacyScopePolicy(deposit);
  if (deposit.has('all')) return buildLegacyScopePolicy(view);

  const intersection = new Set<string>();
  if (view.has('party') && deposit.has('party')) intersection.add('party');
  if (view.has('sect') && deposit.has('sect')) intersection.add('sect');
  const viewRelation = resolveLegacyRelationThreshold(view);
  const depositRelation = resolveLegacyRelationThreshold(deposit);
  if (viewRelation && depositRelation) {
    intersection.add(viewRelation === 'close_friend' || depositRelation === 'close_friend'
      ? 'close_friend'
      : 'dao_friend');
  }
  return buildLegacyScopePolicy(intersection);
}

function convertLegacyTreasureScopePolicy(value: unknown): AccessPolicy {
  return buildLegacyScopePolicy(normalizeLegacyTreasureScopes(value));
}

function buildLegacyScopePolicy(scopes: ReadonlySet<string>): AccessPolicy {
  if (scopes.has('all')) return createPolicy('everyone', []);
  const conditions: AccessPolicyCondition[] = [];
  if (scopes.has('sect')) conditions.push({ type: 'sect', roles: [] });
  const relation = resolveLegacyRelationThreshold(scopes);
  if (relation) {
    conditions.push({
      type: 'relation',
      relations: relation === 'dao_friend' ? ['dao_friend'] : ['close_friend'],
    });
  }
  if (scopes.has('party')) conditions.push({ type: 'party' });
  return conditions.length <= 2 && conditions.length > 0
    ? createPolicy('conditional', conditions)
    : cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY);
}

function convertLegacyTechniquePolicy(value: unknown, fallback: Readonly<AccessPolicy>): AccessPolicy {
  if (!isRecord(value)) return cloneAccessPolicy(fallback);
  if (value.unrestricted === true) return createPolicy('everyone', []);
  const conditions: AccessPolicyCondition[] = [];
  const relations = normalizeLegacyTechniqueRelations(value.friendLevels);
  if (relations.length > 0) conditions.push({ type: 'relation', relations });
  const roles = normalizeLegacyTechniqueRoles(value.sectRoles);
  if (roles.length > 0) conditions.push({ type: 'sect', roles });
  return conditions.length > 0
    ? createPolicy('conditional', conditions)
    : cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY);
}

function createPolicy(mode: AccessPolicy['mode'], conditions: AccessPolicyCondition[]): AccessPolicy {
  return {
    schemaVersion: 1,
    mode,
    operator: 'any',
    conditions,
    revision: 1,
  };
}

function normalizeLegacyTreasureScopes(value: unknown, fallback: readonly string[] = []): Set<string> {
  const source = Array.isArray(value) ? value : fallback;
  return new Set(source.filter(
    (entry): entry is string => typeof entry === 'string' && LEGACY_TREASURE_SCOPE_KEYS.has(entry),
  ));
}

function resolveLegacyRelationThreshold(scopes: ReadonlySet<string>): 'dao_friend' | 'close_friend' | null {
  if (scopes.has('dao_friend')) return 'dao_friend';
  if (scopes.has('close_friend')) return 'close_friend';
  return null;
}

function normalizeLegacyTechniqueRelations(value: unknown): AccessPolicyRelationKind[] {
  const values = new Set(Array.isArray(value) ? value : []);
  return (['dao_friend', 'close_friend'] as const).filter((entry) => values.has(entry));
}

function normalizeLegacyTechniqueRoles(value: unknown): SectMemberRole[] {
  const allowed = new Set<SectMemberRole>([
    'leader',
    'supreme_elder',
    'deputy',
    'elder',
    'inner',
    'outer',
    'labor',
  ]);
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is SectMemberRole => allowed.has(entry as SectMemberRole)))]
    : [];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
