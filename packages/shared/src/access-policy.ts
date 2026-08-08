/**
 * 通用访问权限契约与纯检测器。
 *
 * 权限最多包含两个条件，避免形成不可审计的任意表达式树。服务端在保存或水合时
 * 完成规范化和编译，运行时只读取预编译条件与事实快照，不做数据库 IO。
 */
import type { AttrKey, Attributes } from './attribute-types';
import { ATTR_KEYS } from './constants/gameplay/attributes';
import { isRoleNameWithinLimit } from './role-name';
import { SECT_MEMBER_ROLE_HIERARCHY, type SectMemberRole } from './sect-types';

export const ACCESS_POLICY_SCHEMA_VERSION = 1;
export const ACCESS_POLICY_MAX_CONDITIONS = 2;
export const ACCESS_POLICY_MAX_SPECIFIED_PLAYERS = 64;
export const ACCESS_POLICY_MAX_RESOURCE_SLOTS = 8;

export type AccessPolicyMode = 'owner_only' | 'everyone' | 'conditional';
export type AccessPolicyOperator = 'any' | 'all';
export type AccessPolicyComparison = 'gt' | 'lt';
export type AccessPolicyRealmComparison = AccessPolicyComparison | 'eq';
export type AccessPolicyRoleNameMatch = 'exact' | 'contains' | 'prefix' | 'suffix';
export type AccessPolicyRelationKind =
  | 'dao_friend'
  | 'close_friend'
  | 'master'
  | 'apprentice'
  | 'enemy';

export interface AccessPolicySpecifiedPlayer {
  /** 玩家可见序号；客户端只允许通过该字段添加玩家。 */
  playerNo: number;
  /** 服务端保存时解析的稳定玩家 ID；客户端提交值不可信。 */
  playerId?: string;
  /** 仅用于界面回显，检测始终使用 playerId。 */
  roleName: string;
}

export interface AccessPolicyRelationCondition {
  type: 'relation';
  relations: AccessPolicyRelationKind[];
}

export interface AccessPolicySectCondition {
  type: 'sect';
  /** 空数组表示同宗门全部成员，非空时精确匹配职位。 */
  roles: SectMemberRole[];
}

export interface AccessPolicyPlayersCondition {
  type: 'players';
  players: AccessPolicySpecifiedPlayer[];
}

export interface AccessPolicyRoleNameCondition {
  type: 'role_name';
  match: AccessPolicyRoleNameMatch;
  pattern: string;
}

export interface AccessPolicyRealmCondition {
  type: 'realm';
  comparison: AccessPolicyRealmComparison;
  realmLv: number;
}

export interface AccessPolicyAttributeCondition {
  type: 'attribute';
  attr: AttrKey;
  comparison: AccessPolicyComparison;
  value: number;
}

/** 现有宝库迁移时使用的兼容条件，不计入用户要求的六类主要条件。 */
export interface AccessPolicyPartyCondition {
  type: 'party';
}

export type AccessPolicyCondition =
  | AccessPolicyRelationCondition
  | AccessPolicySectCondition
  | AccessPolicyPlayersCondition
  | AccessPolicyRoleNameCondition
  | AccessPolicyRealmCondition
  | AccessPolicyAttributeCondition
  | AccessPolicyPartyCondition;

export interface AccessPolicy {
  schemaVersion: number;
  mode: AccessPolicyMode;
  operator: AccessPolicyOperator;
  conditions: AccessPolicyCondition[];
  /** 资源级乐观锁版本，由业务适配器维护。 */
  revision: number;
}

/** 不包含具体权限槽位的资源定位键，用于一次读取同一资源的全部权限。 */
export interface AccessPolicyResourceLocator {
  resourceType: string;
  resourceId: string;
}

/** 业务资源接入通用权限系统时使用的稳定定位键。 */
export interface AccessPolicyResourceRef extends AccessPolicyResourceLocator {
  slot: string;
}

/** 资源适配器声明的单个权限槽位及其业务默认策略。 */
export interface AccessPolicyResourceSlotDefinition {
  slot: string;
  label: string;
  description?: string;
  defaultPolicy: AccessPolicy;
}

/** 权限编辑器读取和保存后的权威资源快照。 */
export interface AccessPolicyResourceSnapshot extends AccessPolicyResourceRef {
  policy: AccessPolicy;
  revision: number;
}

/** 同一资源的全部权限槽位，供通用多权限界面一次加载。 */
export interface AccessPolicyResourceSetSnapshot extends AccessPolicyResourceLocator {
  title: string;
  slots: Array<AccessPolicyResourceSlotDefinition & {
    policy: AccessPolicy;
    revision: number;
  }>;
}

export interface C2S_RequestAccessPolicyView {
  requestId: string;
  ref: AccessPolicyResourceRef;
}

export interface C2S_RequestAccessPolicySetView {
  requestId: string;
  ref: AccessPolicyResourceLocator;
}

export interface C2S_ResolveAccessPolicyPlayerView {
  requestId: string;
  playerNo: number;
}

export interface C2S_SaveAccessPolicyView {
  requestId: string;
  ref: AccessPolicyResourceRef;
  expectedRevision: number;
  policy: AccessPolicy;
}

export interface AccessPolicyResourceResultView {
  requestId: string;
  operation: 'load' | 'save';
  ok: boolean;
  reason?: string;
  snapshot?: AccessPolicyResourceSnapshot;
  unresolvedPlayerNos?: number[];
}

export interface AccessPolicyResourceSetResultView {
  requestId: string;
  ok: boolean;
  reason?: string;
  snapshot?: AccessPolicyResourceSetSnapshot;
}

export interface AccessPolicyPlayerResolutionView {
  playerNo: number;
  roleName: string;
}

export interface AccessPolicyPlayerResultView {
  requestId: string;
  ok: boolean;
  reason?: string;
  player?: AccessPolicyPlayerResolutionView;
}

export interface AccessPolicyFacts {
  actorPlayerId: string;
  isOwner: boolean;
  relationKinds: ReadonlySet<AccessPolicyRelationKind>;
  sameSect: boolean;
  sectRole: SectMemberRole | null;
  sameParty: boolean;
  roleName: string;
  realmLv: number;
  finalAttrs: Readonly<Attributes>;
}

export const ACCESS_POLICY_DEPENDENCY = {
  none: 0,
  relation: 1 << 0,
  sect: 1 << 1,
  party: 1 << 2,
  identity: 1 << 3,
  realm: 1 << 4,
  attributes: 1 << 5,
} as const;

export type AccessPolicyDependencyMask = number;

interface CompiledRelationCondition {
  type: 'relation';
  relations: ReadonlySet<AccessPolicyRelationKind>;
}

interface CompiledSectCondition {
  type: 'sect';
  roles: ReadonlySet<SectMemberRole>;
}

interface CompiledPlayersCondition {
  type: 'players';
  playerIds: ReadonlySet<string>;
}

type CompiledAccessPolicyCondition =
  | CompiledRelationCondition
  | CompiledSectCondition
  | CompiledPlayersCondition
  | AccessPolicyRoleNameCondition
  | AccessPolicyRealmCondition
  | AccessPolicyAttributeCondition
  | AccessPolicyPartyCondition;

export interface CompiledAccessPolicy {
  mode: AccessPolicyMode;
  operator: AccessPolicyOperator;
  conditions: readonly CompiledAccessPolicyCondition[];
  dependencies: AccessPolicyDependencyMask;
  revision: number;
}

export interface AccessPolicyValidationIssue {
  path: string;
  code: string;
}

export interface AccessPolicyValidationResult {
  ok: boolean;
  policy?: AccessPolicy;
  issues: AccessPolicyValidationIssue[];
}

export const EVERYONE_ACCESS_POLICY: Readonly<AccessPolicy> = {
  schemaVersion: ACCESS_POLICY_SCHEMA_VERSION,
  mode: 'everyone',
  operator: 'any',
  conditions: [],
  revision: 1,
};

/** 通用权限没有业务覆盖时的默认值：无附加权限策略，所有玩家可用。 */
export const DEFAULT_ACCESS_POLICY: Readonly<AccessPolicy> = EVERYONE_ACCESS_POLICY;

export const OWNER_ONLY_ACCESS_POLICY: Readonly<AccessPolicy> = {
  schemaVersion: ACCESS_POLICY_SCHEMA_VERSION,
  mode: 'owner_only',
  operator: 'any',
  conditions: [],
  revision: 1,
};

const ACCESS_RELATION_KINDS: readonly AccessPolicyRelationKind[] = [
  'dao_friend',
  'close_friend',
  'master',
  'apprentice',
  'enemy',
];
const ROLE_NAME_MATCHES: readonly AccessPolicyRoleNameMatch[] = ['exact', 'contains', 'prefix', 'suffix'];
const REALM_COMPARISONS: readonly AccessPolicyRealmComparison[] = ['gt', 'lt', 'eq'];
const VALUE_COMPARISONS: readonly AccessPolicyComparison[] = ['gt', 'lt'];

export function validateAccessPolicy(
  value: unknown,
  options: { requireResolvedPlayers?: boolean } = {},
): AccessPolicyValidationResult {
  const issues: AccessPolicyValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', code: 'access_policy_invalid' }] };
  }
  const schemaVersion = normalizePositiveInteger(value.schemaVersion);
  if (schemaVersion !== ACCESS_POLICY_SCHEMA_VERSION) {
    issues.push({ path: 'schemaVersion', code: 'access_policy_schema_unsupported' });
  }
  const mode = normalizeMode(value.mode);
  if (!mode) {
    issues.push({ path: 'mode', code: 'access_policy_mode_invalid' });
  }
  const operator = value.operator === 'all' ? 'all' : value.operator === 'any' ? 'any' : null;
  if (!operator) {
    issues.push({ path: 'operator', code: 'access_policy_operator_invalid' });
  }
  const revision = normalizePositiveInteger(value.revision);
  if (revision === null) {
    issues.push({ path: 'revision', code: 'access_policy_revision_invalid' });
  }
  const rawConditions = Array.isArray(value.conditions) ? value.conditions : null;
  if (!rawConditions) {
    issues.push({ path: 'conditions', code: 'access_policy_conditions_invalid' });
  } else if (rawConditions.length > ACCESS_POLICY_MAX_CONDITIONS) {
    issues.push({ path: 'conditions', code: 'access_policy_conditions_too_many' });
  }

  const conditions: AccessPolicyCondition[] = [];
  const conditionTypes = new Set<AccessPolicyCondition['type']>();
  for (let index = 0; index < Math.min(rawConditions?.length ?? 0, ACCESS_POLICY_MAX_CONDITIONS); index += 1) {
    const condition = normalizeCondition(rawConditions![index], index, issues, options.requireResolvedPlayers === true);
    if (condition) {
      if (conditionTypes.has(condition.type)) {
        issues.push({ path: `conditions.${index}.type`, code: 'access_policy_condition_type_duplicate' });
      } else {
        conditionTypes.add(condition.type);
        conditions.push(condition);
      }
    }
  }
  if (mode === 'conditional' && conditions.length === 0) {
    issues.push({ path: 'conditions', code: 'access_policy_condition_required' });
  }
  if (mode && mode !== 'conditional' && conditions.length > 0) {
    issues.push({ path: 'conditions', code: 'access_policy_conditions_not_allowed' });
  }
  if (issues.length > 0 || !mode || !operator || revision === null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    policy: {
      schemaVersion: ACCESS_POLICY_SCHEMA_VERSION,
      mode,
      operator: conditions.length < 2 ? 'any' : operator,
      conditions,
      revision,
    },
    issues: [],
  };
}

export function normalizeAccessPolicy(
  value: unknown,
  fallback: Readonly<AccessPolicy> = DEFAULT_ACCESS_POLICY,
): AccessPolicy {
  if (value === undefined || value === null) return cloneAccessPolicy(fallback);
  const result = validateAccessPolicy(value, { requireResolvedPlayers: true });
  return result.ok && result.policy ? cloneAccessPolicy(result.policy) : cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY);
}

export function cloneAccessPolicy(policy: Readonly<AccessPolicy>): AccessPolicy {
  return {
    schemaVersion: policy.schemaVersion,
    mode: policy.mode,
    operator: policy.operator,
    conditions: policy.conditions.map(cloneCondition),
    revision: policy.revision,
  };
}

export function compileAccessPolicy(policy: Readonly<AccessPolicy>): CompiledAccessPolicy {
  let dependencies = ACCESS_POLICY_DEPENDENCY.none;
  const conditions: CompiledAccessPolicyCondition[] = policy.conditions.map((condition) => {
    switch (condition.type) {
      case 'relation':
        dependencies |= ACCESS_POLICY_DEPENDENCY.relation;
        return { type: 'relation', relations: new Set(condition.relations) };
      case 'sect':
        dependencies |= ACCESS_POLICY_DEPENDENCY.sect;
        return { type: 'sect', roles: new Set(condition.roles) };
      case 'players':
        dependencies |= ACCESS_POLICY_DEPENDENCY.identity;
        return {
          type: 'players',
          playerIds: new Set(condition.players.map((entry) => entry.playerId?.trim()).filter((entry): entry is string => Boolean(entry))),
        };
      case 'role_name':
        dependencies |= ACCESS_POLICY_DEPENDENCY.identity;
        return { ...condition };
      case 'realm':
        dependencies |= ACCESS_POLICY_DEPENDENCY.realm;
        return { ...condition };
      case 'attribute':
        dependencies |= ACCESS_POLICY_DEPENDENCY.attributes;
        return { ...condition };
      case 'party':
        dependencies |= ACCESS_POLICY_DEPENDENCY.party;
        return { type: 'party' };
    }
  });
  return {
    mode: policy.mode,
    operator: policy.operator,
    conditions,
    dependencies,
    revision: policy.revision,
  };
}

export function evaluateCompiledAccessPolicy(
  policy: Readonly<CompiledAccessPolicy>,
  facts: Readonly<AccessPolicyFacts>,
): boolean {
  if (facts.isOwner) return true;
  if (policy.mode === 'everyone') return true;
  if (policy.mode !== 'conditional' || policy.conditions.length === 0) return false;
  if (policy.operator === 'all') {
    for (const condition of policy.conditions) {
      if (!evaluateCondition(condition, facts)) return false;
    }
    return true;
  }
  for (const condition of policy.conditions) {
    if (evaluateCondition(condition, facts)) return true;
  }
  return false;
}

export function evaluateAccessPolicy(
  policy: Readonly<AccessPolicy>,
  facts: Readonly<AccessPolicyFacts>,
): boolean {
  return evaluateCompiledAccessPolicy(compileAccessPolicy(policy), facts);
}

export function haveSameAccessPolicy(left: Readonly<AccessPolicy>, right: Readonly<AccessPolicy>): boolean {
  if (left.schemaVersion !== right.schemaVersion
    || left.mode !== right.mode
    || left.operator !== right.operator
    || left.revision !== right.revision
    || left.conditions.length !== right.conditions.length) {
    return false;
  }
  return left.conditions.every((condition, index) => haveSameCondition(condition, right.conditions[index]));
}

function normalizeCondition(
  value: unknown,
  index: number,
  issues: AccessPolicyValidationIssue[],
  requireResolvedPlayers: boolean,
): AccessPolicyCondition | null {
  const path = `conditions.${index}`;
  if (!isRecord(value) || typeof value.type !== 'string') {
    issues.push({ path, code: 'access_policy_condition_invalid' });
    return null;
  }
  switch (value.type) {
    case 'relation': {
      if (!Array.isArray(value.relations)) {
        issues.push({ path: `${path}.relations`, code: 'access_policy_relations_invalid' });
        return null;
      }
      if (value.relations.some((entry) => !ACCESS_RELATION_KINDS.includes(entry as AccessPolicyRelationKind))) {
        issues.push({ path: `${path}.relations`, code: 'access_policy_relation_invalid' });
        return null;
      }
      const relationSet = new Set(value.relations as AccessPolicyRelationKind[]);
      if (relationSet.size !== value.relations.length) {
        issues.push({ path: `${path}.relations`, code: 'access_policy_relation_duplicate' });
        return null;
      }
      const relations = ACCESS_RELATION_KINDS.filter((entry) => relationSet.has(entry));
      if (relations.length === 0) issues.push({ path: `${path}.relations`, code: 'access_policy_relation_required' });
      return relations.length > 0 ? { type: 'relation', relations: [...relations] } : null;
    }
    case 'sect': {
      if (!Array.isArray(value.roles)) {
        issues.push({ path: `${path}.roles`, code: 'access_policy_sect_roles_invalid' });
        return null;
      }
      if (value.roles.some((entry) => typeof entry !== 'string' || !SECT_MEMBER_ROLE_HIERARCHY.includes(entry as SectMemberRole))) {
        issues.push({ path: `${path}.roles`, code: 'access_policy_sect_role_invalid' });
        return null;
      }
      const roleSet = new Set(value.roles as SectMemberRole[]);
      if (roleSet.size !== value.roles.length) {
        issues.push({ path: `${path}.roles`, code: 'access_policy_sect_role_duplicate' });
        return null;
      }
      return { type: 'sect', roles: SECT_MEMBER_ROLE_HIERARCHY.filter((entry) => roleSet.has(entry)) };
    }
    case 'players': {
      if (!Array.isArray(value.players) || value.players.length === 0) {
        issues.push({ path: `${path}.players`, code: 'access_policy_player_required' });
        return null;
      }
      if (value.players.length > ACCESS_POLICY_MAX_SPECIFIED_PLAYERS) {
        issues.push({ path: `${path}.players`, code: 'access_policy_players_too_many' });
      }
      const players: AccessPolicySpecifiedPlayer[] = [];
      const seenPlayerNos = new Set<number>();
      for (let playerIndex = 0; playerIndex < Math.min(value.players.length, ACCESS_POLICY_MAX_SPECIFIED_PLAYERS); playerIndex += 1) {
        const player = value.players[playerIndex];
        if (!isRecord(player)) {
          issues.push({ path: `${path}.players.${playerIndex}`, code: 'access_policy_player_invalid' });
          continue;
        }
        const playerNo = normalizePositiveInteger(player.playerNo);
        const playerId = normalizeText(player.playerId);
        const roleName = normalizeRoleNamePattern(player.roleName);
        if (playerNo === null || seenPlayerNos.has(playerNo)) {
          issues.push({ path: `${path}.players.${playerIndex}.playerNo`, code: 'access_policy_player_no_invalid' });
          continue;
        }
        if (requireResolvedPlayers && !playerId) {
          issues.push({ path: `${path}.players.${playerIndex}.playerId`, code: 'access_policy_player_unresolved' });
          continue;
        }
        if (!roleName) {
          issues.push({ path: `${path}.players.${playerIndex}.roleName`, code: 'access_policy_player_name_invalid' });
          continue;
        }
        seenPlayerNos.add(playerNo);
        players.push({ playerNo, ...(playerId ? { playerId } : {}), roleName });
      }
      return players.length > 0 ? { type: 'players', players } : null;
    }
    case 'role_name': {
      const match = ROLE_NAME_MATCHES.includes(value.match as AccessPolicyRoleNameMatch)
        ? value.match as AccessPolicyRoleNameMatch
        : null;
      const pattern = normalizeRoleNamePattern(value.pattern);
      if (!match) issues.push({ path: `${path}.match`, code: 'access_policy_role_name_match_invalid' });
      if (!pattern) issues.push({ path: `${path}.pattern`, code: 'access_policy_role_name_pattern_invalid' });
      return match && pattern ? { type: 'role_name', match, pattern } : null;
    }
    case 'realm': {
      const comparison = REALM_COMPARISONS.includes(value.comparison as AccessPolicyRealmComparison)
        ? value.comparison as AccessPolicyRealmComparison
        : null;
      const realmLv = normalizePositiveInteger(value.realmLv);
      if (!comparison) issues.push({ path: `${path}.comparison`, code: 'access_policy_realm_comparison_invalid' });
      if (realmLv === null) issues.push({ path: `${path}.realmLv`, code: 'access_policy_realm_invalid' });
      return comparison && realmLv !== null ? { type: 'realm', comparison, realmLv } : null;
    }
    case 'attribute': {
      const comparison = VALUE_COMPARISONS.includes(value.comparison as AccessPolicyComparison)
        ? value.comparison as AccessPolicyComparison
        : null;
      const attr = ATTR_KEYS.includes(value.attr as AttrKey) ? value.attr as AttrKey : null;
      const threshold = normalizeNonNegativeNumber(value.value);
      if (!attr) issues.push({ path: `${path}.attr`, code: 'access_policy_attribute_invalid' });
      if (!comparison) issues.push({ path: `${path}.comparison`, code: 'access_policy_attribute_comparison_invalid' });
      if (threshold === null) issues.push({ path: `${path}.value`, code: 'access_policy_attribute_value_invalid' });
      return attr && comparison && threshold !== null
        ? { type: 'attribute', attr, comparison, value: threshold }
        : null;
    }
    case 'party':
      return { type: 'party' };
    default:
      issues.push({ path: `${path}.type`, code: 'access_policy_condition_type_invalid' });
      return null;
  }
}

function evaluateCondition(condition: Readonly<CompiledAccessPolicyCondition>, facts: Readonly<AccessPolicyFacts>): boolean {
  switch (condition.type) {
    case 'relation':
      for (const relation of condition.relations) {
        if (facts.relationKinds.has(relation)) return true;
      }
      return false;
    case 'sect':
      return facts.sameSect && (condition.roles.size === 0 || (facts.sectRole !== null && condition.roles.has(facts.sectRole)));
    case 'players':
      return condition.playerIds.has(facts.actorPlayerId);
    case 'role_name':
      return matchRoleName(facts.roleName, condition.match, condition.pattern);
    case 'realm':
      return compareNumber(facts.realmLv, condition.comparison, condition.realmLv);
    case 'attribute':
      return compareNumber(facts.finalAttrs[condition.attr] ?? 0, condition.comparison, condition.value);
    case 'party':
      return facts.sameParty;
  }
}

function compareNumber(left: number, comparison: AccessPolicyRealmComparison, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (comparison === 'gt') return left > right;
  if (comparison === 'lt') return left < right;
  return left === right;
}

function matchRoleName(roleName: string, match: AccessPolicyRoleNameMatch, pattern: string): boolean {
  const normalizedRoleName = normalizeRoleNamePattern(roleName);
  if (!normalizedRoleName) return false;
  if (match === 'exact') return normalizedRoleName === pattern;
  if (match === 'prefix') return normalizedRoleName.startsWith(pattern);
  if (match === 'suffix') return normalizedRoleName.endsWith(pattern);
  return normalizedRoleName.includes(pattern);
}

function cloneCondition(condition: Readonly<AccessPolicyCondition>): AccessPolicyCondition {
  switch (condition.type) {
    case 'relation':
      return { type: 'relation', relations: [...condition.relations] };
    case 'sect':
      return { type: 'sect', roles: [...condition.roles] };
    case 'players':
      return { type: 'players', players: condition.players.map((entry) => ({ ...entry })) };
    case 'role_name':
      return { ...condition };
    case 'realm':
      return { ...condition };
    case 'attribute':
      return { ...condition };
    case 'party':
      return { type: 'party' };
  }
}

function haveSameCondition(left: Readonly<AccessPolicyCondition>, right: Readonly<AccessPolicyCondition> | undefined): boolean {
  if (!right || left.type !== right.type) return false;
  switch (left.type) {
    case 'relation':
      return right.type === 'relation' && haveSameStringArray(left.relations, right.relations);
    case 'sect':
      return right.type === 'sect' && haveSameStringArray(left.roles, right.roles);
    case 'players':
      return right.type === 'players'
        && left.players.length === right.players.length
        && left.players.every((entry, index) => {
          const candidate = right.players[index];
          return entry.playerNo === candidate?.playerNo
            && entry.playerId === candidate.playerId
            && entry.roleName === candidate.roleName;
        });
    case 'role_name':
      return right.type === 'role_name' && left.match === right.match && left.pattern === right.pattern;
    case 'realm':
      return right.type === 'realm' && left.comparison === right.comparison && left.realmLv === right.realmLv;
    case 'attribute':
      return right.type === 'attribute'
        && left.attr === right.attr
        && left.comparison === right.comparison
        && left.value === right.value;
    case 'party':
      return right.type === 'party';
  }
}

function haveSameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function normalizeMode(value: unknown): AccessPolicyMode | null {
  return value === 'owner_only' || value === 'everyone' || value === 'conditional' ? value : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRoleNamePattern(value: unknown): string {
  const normalized = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  return normalized && isRoleNameWithinLimit(normalized) ? normalized : '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
