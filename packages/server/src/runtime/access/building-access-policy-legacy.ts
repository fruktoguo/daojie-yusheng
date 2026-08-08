/**
 * 建筑旧权限字段到通用权限槽位的单向水合转换。
 *
 * 转换只在实例恢复冷路径执行。新运行态和后续持久化只保留 accessPolicies，
 * 避免旧字段与通用权限形成双写真源。
 */
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

const TREASURE_VAULT_DEF_ID = 'treasure_vault';
const TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID = 'technique_unification_platform';
const LEGACY_TREASURE_SCOPE_KEYS = new Set(['all', 'party', 'sect', 'dao_friend', 'close_friend']);

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

/** 查看与存入合并后采用双方都允许的安全交集，绝不扩大旧权限。 */
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
  // 极少数旧配置同时开放队伍、宗门和道缘，无法无损压入“两类条件”约束；安全失败关闭。
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
