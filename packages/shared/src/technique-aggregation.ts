/**
 * 功法统合的共享模型与纯规则。
 *
 * 聚合功法使用稳定的 familyId + revision 标识。每个 revision 都保存完整的
 * 叶子功法集合，玩家覆盖数量据此计算，不能用聚合行数代替覆盖数量。
 */
import type { TechniqueCategory, TechniqueGrade, TechniqueState } from './cultivation-types';
import type { DaoistRelationLevel } from './social-types';
import { SECT_MEMBER_ROLE_HIERARCHY, type SectMemberRole } from './sect-types';

export const TECHNIQUE_AGGREGATE_ID_PREFIX = 'agg_';
export const TECHNIQUE_AGGREGATE_SCHEMA_VERSION = 1;
export const TECHNIQUE_AGGREGATE_CATEGORY: TechniqueCategory = 'internal';
export const TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER = 1.1;
export const TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID = 'technique_unification_platform';

export interface TechniqueUnificationAccessPolicy {
  /** 开启后不再检查好友层级或宗门职位。 */
  unrestricted: boolean;
  /** 多组选项按“任一满足”裁定；道友同时包含至交。 */
  friendLevels: DaoistRelationLevel[];
  /** 仅匹配台主当前宗门内的所选职位。 */
  sectRoles: SectMemberRole[];
}

export const DEFAULT_TECHNIQUE_UNIFICATION_ACCESS_POLICY: Readonly<TechniqueUnificationAccessPolicy> = {
  unrestricted: true,
  friendLevels: [],
  sectRoles: [],
};

export type TechniqueUnificationPermissionScope = 'read' | 'revision';

/** 统法台参阅与修订分别裁定，任一权限都不隐含另一权限。 */
export interface TechniqueUnificationPermissions {
  read: TechniqueUnificationAccessPolicy;
  revision: TechniqueUnificationAccessPolicy;
}

export const DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS: Readonly<{
  read: Readonly<TechniqueUnificationAccessPolicy>;
  revision: Readonly<TechniqueUnificationAccessPolicy>;
}> = {
  read: DEFAULT_TECHNIQUE_UNIFICATION_ACCESS_POLICY,
  revision: {
    unrestricted: false,
    friendLevels: [],
    sectRoles: [],
  },
};

export type TechniqueAggregationErrorCode =
  | 'TECHNIQUE_AGGREGATE_NOT_READY'
  | 'TECHNIQUE_AGGREGATE_BUILDING_REQUIRED'
  | 'TECHNIQUE_AGGREGATE_BUILDING_OUT_OF_RANGE'
  | 'TECHNIQUE_AGGREGATE_BUILDING_INVALID'
  | 'TECHNIQUE_AGGREGATE_PERMISSION_DENIED'
  | 'TECHNIQUE_AGGREGATE_PLATFORM_OWNER_REQUIRED'
  | 'TECHNIQUE_AGGREGATE_PLATFORM_ALREADY_BOUND'
  | 'TECHNIQUE_AGGREGATE_PLATFORM_UNBOUND'
  | 'TECHNIQUE_AGGREGATE_PLATFORM_MISMATCH'
  | 'TECHNIQUE_AGGREGATE_ACCESS_DENIED'
  | 'TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED'
  | 'TECHNIQUE_AGGREGATE_NAME_INVALID'
  | 'TECHNIQUE_AGGREGATE_LEARN_REJECTED'
  | 'TECHNIQUE_AGGREGATE_SOURCE_EMPTY'
  | 'TECHNIQUE_AGGREGATE_SOURCE_DUPLICATE'
  | 'TECHNIQUE_AGGREGATE_SOURCE_NOT_FOUND'
  | 'TECHNIQUE_AGGREGATE_SOURCE_NOT_CREATED'
  | 'TECHNIQUE_AGGREGATE_SOURCE_NOT_OWNER'
  | 'TECHNIQUE_AGGREGATE_SOURCE_NOT_MASTERED'
  | 'TECHNIQUE_AGGREGATE_SOURCE_CATEGORY_INVALID'
  | 'TECHNIQUE_AGGREGATE_SOURCE_GRADE_MISMATCH'
  | 'TECHNIQUE_AGGREGATE_REVISION_INVALID'
  | 'TECHNIQUE_AGGREGATE_REVISION_NOT_ADDITIVE'
  | 'TECHNIQUE_AGGREGATE_OVERLAP'
  | 'TECHNIQUE_AGGREGATE_ALREADY_EXISTS'
  | 'TECHNIQUE_AGGREGATE_OPERATION_REPLAYED'
  | 'TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE';

/** 写入生成功法模板的统合元数据。 */
export interface TechniqueAggregationMetadata {
  schemaVersion: number;
  familyId: string;
  revision: number;
  sourceTechniqueIds: string[];
  sourceCount: number;
  /** 同一家族上一版；首版为空。 */
  previousRevision?: number;
  /** 法脉初创者；后续由他人修订时保持不变。 */
  creatorPlayerId?: string;
  /** 当前卷修订者，用于幂等重放与审计。 */
  revisionAuthorPlayerId?: string;
  /** 首次凝篇所在统法台，用于发布成功但建筑域尚未刷盘时恢复绑定。 */
  platformInstanceId?: string;
  platformBuildingId?: string;
  initialPermissions?: TechniqueUnificationPermissions;
}

export interface TechniqueAggregationSourceView {
  techId: string;
  name: string;
  grade: TechniqueGrade;
  category: TechniqueCategory;
  realmLv: number;
  /** 自创内功模板的权威生成强度，范围为 80-120。 */
  strengthPercent: number;
  level: number;
  maxLevel: number;
  fullyMastered: boolean;
  /** 该功法作为叶子被玩家覆盖时计入的数量，便于客户端显示公平进度。 */
  covered: boolean;
  pendingProgress?: number;
  pendingRequiredProgress?: number;
}

export interface TechniqueAggregationFamilyView {
  familyId: string;
  latestRevision: number;
  latestTechniqueId: string;
  name: string;
  grade: TechniqueGrade;
  category: TechniqueCategory;
  sourceCount: number;
  sourceTechniqueIds: string[];
  creatorPlayerId?: string;
  /** 玩家当前已持有的同一家族版本；没有则为空。 */
  playerRevision?: number;
  /** 当前玩家覆盖的叶子数量。 */
  playerCoveredCount: number;
}

export interface TechniqueAggregationPreviewRequest {
  requestId?: string;
  buildingId?: string;
}

export interface TechniqueAggregationPublishRequest {
  requestId?: string;
  operationId?: string;
  buildingId?: string;
  /** 首版为空；更新时填写现有 familyId。 */
  familyId?: string;
  expectedRevision?: number;
  /** 首次凝篇必填；续录沿用法脉原名。 */
  customName?: string;
  /** 首次凝篇可一并设置，后续通过独立权限请求修改。 */
  permissions?: TechniqueUnificationPermissions;
  sourceTechniqueIds: string[];
}

export interface TechniqueAggregationPermissionRequest {
  requestId?: string;
  buildingId?: string;
  scope: TechniqueUnificationPermissionScope;
  policy: TechniqueUnificationAccessPolicy;
}

export interface TechniqueAggregationLearnRequest {
  requestId?: string;
  buildingId?: string;
}

export type TechniqueUnificationLearnerState = 'unbound' | 'available' | 'pending' | 'learned';

export interface TechniqueUnificationPlatformView {
  buildingId: string;
  displayName: string;
  ownerPlayerId?: string;
  isOwner: boolean;
  familyId?: string;
  permissions: TechniqueUnificationPermissions;
  canLearn: boolean;
  canRevise: boolean;
  learnerState: TechniqueUnificationLearnerState;
  latestTechniqueId?: string;
  latestRevision?: number;
  pendingProgress?: number;
  pendingRequiredProgress?: number;
}

export interface TechniqueAggregationPanelView {
  requestId?: string;
  buildingId?: string;
  revision: number;
  eligibleSources: TechniqueAggregationSourceView[];
  families: TechniqueAggregationFamilyView[];
  /** 当前玩家全部叶子覆盖数量，包含直接功法和已学聚合版本。 */
  totalCoveredLeafCount: number;
  /** 当前玩家拥有的聚合行数，用于展示压缩收益。 */
  learnedAggregateCount: number;
  platform: TechniqueUnificationPlatformView;
  error?: TechniqueAggregationErrorView;
}

export interface TechniqueAggregationErrorView {
  code: TechniqueAggregationErrorCode;
  /** 客户端按 code 选择本地文案，不使用服务端拼接文本。 */
  messageKey: string;
  vars?: Record<string, string | number>;
  conflictAggregateIds?: string[];
  conflictSourceTechniqueIds?: string[];
  invalidTechniqueIds?: string[];
}

export interface TechniqueAggregationResultView {
  requestId?: string;
  operationId?: string;
  ok: boolean;
  operation?: 'publish' | 'permissions' | 'learn';
  permissionScope?: TechniqueUnificationPermissionScope;
  code?: TechniqueAggregationErrorCode;
  messageKey?: string;
  vars?: Record<string, string | number>;
  conflictAggregateIds?: string[];
  conflictSourceTechniqueIds?: string[];
  invalidTechniqueIds?: string[];
  aggregate?: {
    techniqueId: string;
    familyId: string;
    revision: number;
    name: string;
    grade: TechniqueGrade;
    category: TechniqueCategory;
    sourceCount: number;
    sourceTechniqueIds: string[];
    totalTrainingDifficulty: number;
    effectMultiplier: number;
  };
}

export type C2S_RequestTechniqueAggregation = TechniqueAggregationPreviewRequest;
export type C2S_PublishTechniqueAggregation = TechniqueAggregationPublishRequest;
export type C2S_UpdateTechniqueAggregationPermissions = TechniqueAggregationPermissionRequest;
export type C2S_LearnTechniqueAggregation = TechniqueAggregationLearnRequest;
export type S2C_TechniqueAggregationPanel = TechniqueAggregationPanelView;
export type S2C_TechniqueAggregationResult = TechniqueAggregationResultView;

export interface TechniqueAggregationCoverage {
  leafTechniqueIds: string[];
  aggregateTechniqueIds: string[];
}

export function isTechniqueAggregationId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith(TECHNIQUE_AGGREGATE_ID_PREFIX);
}

export function normalizeTechniqueAggregationMetadata(value: unknown): TechniqueAggregationMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const familyId = typeof raw.familyId === 'string' ? raw.familyId.trim() : '';
  const revision = Number.isFinite(Number(raw.revision)) ? Math.trunc(Number(raw.revision)) : 0;
  const sourceTechniqueIds = Array.isArray(raw.sourceTechniqueIds)
    ? [...new Set(raw.sourceTechniqueIds
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim()))]
    : [];
  if (!familyId || revision < 1 || sourceTechniqueIds.length < 2) {
    return null;
  }
  const previousRevision = Number.isFinite(Number(raw.previousRevision))
    ? Math.trunc(Number(raw.previousRevision))
    : undefined;
  const creatorPlayerId = typeof raw.creatorPlayerId === 'string' && raw.creatorPlayerId.trim()
    ? raw.creatorPlayerId.trim()
    : undefined;
  const revisionAuthorPlayerId = typeof raw.revisionAuthorPlayerId === 'string' && raw.revisionAuthorPlayerId.trim()
    ? raw.revisionAuthorPlayerId.trim()
    : undefined;
  const platformInstanceId = typeof raw.platformInstanceId === 'string' && raw.platformInstanceId.trim()
    ? raw.platformInstanceId.trim()
    : undefined;
  const platformBuildingId = typeof raw.platformBuildingId === 'string' && raw.platformBuildingId.trim()
    ? raw.platformBuildingId.trim()
    : undefined;
  const initialPermissions = normalizeTechniqueUnificationPermissions(raw.initialPermissions);
  return {
    schemaVersion: Math.max(1, Math.trunc(Number(raw.schemaVersion) || TECHNIQUE_AGGREGATE_SCHEMA_VERSION)),
    familyId,
    revision,
    sourceTechniqueIds,
    sourceCount: sourceTechniqueIds.length,
    ...(previousRevision && previousRevision > 0 ? { previousRevision } : {}),
    ...(creatorPlayerId ? { creatorPlayerId } : {}),
    ...(revisionAuthorPlayerId ? { revisionAuthorPlayerId } : {}),
    ...(platformInstanceId ? { platformInstanceId } : {}),
    ...(platformBuildingId ? { platformBuildingId } : {}),
    ...(raw.initialPermissions ? { initialPermissions } : {}),
  };
}

export function normalizeTechniqueUnificationAccessPolicy(
  value: unknown,
  fallback: Readonly<TechniqueUnificationAccessPolicy> = DEFAULT_TECHNIQUE_UNIFICATION_ACCESS_POLICY,
): TechniqueUnificationAccessPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneTechniqueUnificationAccessPolicy(fallback);
  }
  const raw = value as Record<string, unknown>;
  const unrestricted = raw.unrestricted === true;
  if (unrestricted) {
    return { unrestricted: true, friendLevels: [], sectRoles: [] };
  }
  const friendLevelSet = new Set(
    Array.isArray(raw.friendLevels)
      ? raw.friendLevels.filter((entry): entry is DaoistRelationLevel => entry === 'dao_friend' || entry === 'close_friend')
      : [],
  );
  const sectRoleSet = new Set(
    Array.isArray(raw.sectRoles)
      ? raw.sectRoles.filter((entry): entry is SectMemberRole => (
        typeof entry === 'string' && SECT_MEMBER_ROLE_HIERARCHY.includes(entry as SectMemberRole)
      ))
      : [],
  );
  return {
    unrestricted: false,
    friendLevels: (['dao_friend', 'close_friend'] as const).filter((entry) => friendLevelSet.has(entry)),
    sectRoles: SECT_MEMBER_ROLE_HIERARCHY.filter((entry) => sectRoleSet.has(entry)),
  };
}

export function cloneTechniqueUnificationAccessPolicy(
  value: Readonly<TechniqueUnificationAccessPolicy>,
): TechniqueUnificationAccessPolicy {
  return {
    unrestricted: value.unrestricted === true,
    friendLevels: [...value.friendLevels],
    sectRoles: [...value.sectRoles],
  };
}

export function normalizeTechniqueUnificationPermissions(
  value: unknown,
  fallback: Readonly<{
    read: Readonly<TechniqueUnificationAccessPolicy>;
    revision: Readonly<TechniqueUnificationAccessPolicy>;
  }> = DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
): TechniqueUnificationPermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneTechniqueUnificationPermissions(fallback);
  }
  const raw = value as Record<string, unknown>;
  return {
    read: normalizeTechniqueUnificationAccessPolicy(raw.read, fallback.read),
    revision: normalizeTechniqueUnificationAccessPolicy(raw.revision, fallback.revision),
  };
}

export function cloneTechniqueUnificationPermissions(
  value: Readonly<{
    read: Readonly<TechniqueUnificationAccessPolicy>;
    revision: Readonly<TechniqueUnificationAccessPolicy>;
  }>,
): TechniqueUnificationPermissions {
  return {
    read: cloneTechniqueUnificationAccessPolicy(value.read),
    revision: cloneTechniqueUnificationAccessPolicy(value.revision),
  };
}

export function resolveTechniqueAggregationMetadata(value: unknown): TechniqueAggregationMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const direct = normalizeTechniqueAggregationMetadata((value as Record<string, unknown>).aggregate);
  if (direct) {
    return direct;
  }
  return normalizeTechniqueAggregationMetadata(value);
}

/** 计算一名玩家当前被功法覆盖的叶子集合。 */
export function collectTechniqueCoverage(
  techniques: readonly TechniqueState[] | readonly Record<string, unknown>[],
  metadataByTechniqueId: ReadonlyMap<string, TechniqueAggregationMetadata>,
): TechniqueAggregationCoverage {
  const leafTechniqueIds = new Set<string>();
  const aggregateTechniqueIds: string[] = [];
  for (const entry of techniques ?? []) {
    const techniqueId = typeof entry?.techId === 'string' ? entry.techId.trim() : '';
    if (!techniqueId) continue;
    const metadata = metadataByTechniqueId.get(techniqueId);
    if (metadata) {
      aggregateTechniqueIds.push(techniqueId);
      for (const sourceId of metadata.sourceTechniqueIds) leafTechniqueIds.add(sourceId);
    } else {
      leafTechniqueIds.add(techniqueId);
    }
  }
  return {
    leafTechniqueIds: [...leafTechniqueIds].sort(),
    aggregateTechniqueIds: [...new Set(aggregateTechniqueIds)].sort(),
  };
}

export function resolveTechniqueAggregationOverlap(
  candidateSourceTechniqueIds: readonly string[],
  existingAggregates: readonly { techniqueId: string; metadata: TechniqueAggregationMetadata }[],
  candidateFamilyId?: string,
): { aggregateIds: string[]; sourceIds: string[] } {
  const candidate = new Set(candidateSourceTechniqueIds);
  const aggregateIds: string[] = [];
  const sourceIds = new Set<string>();
  for (const entry of existingAggregates) {
    const metadata = entry.metadata;
    if (candidateFamilyId && metadata.familyId === candidateFamilyId) continue;
    const overlap = metadata.sourceTechniqueIds.filter((sourceId) => candidate.has(sourceId));
    if (overlap.length === 0) continue;
    aggregateIds.push(entry.techniqueId);
    for (const sourceId of overlap) sourceIds.add(sourceId);
  }
  return {
    aggregateIds: [...new Set(aggregateIds)].sort(),
    sourceIds: [...sourceIds].sort(),
  };
}
