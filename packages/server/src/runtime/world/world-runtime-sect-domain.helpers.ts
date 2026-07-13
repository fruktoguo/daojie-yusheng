/**
 * 宗门标识、成员、权限与管理面板的领域辅助逻辑。
 * 权威队列、地图改写和持久化提交仍由 WorldRuntimeSectService 编排。
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  SECT_MEMBER_ROLE_HIERARCHY,
  SECT_PERMISSION_IDS,
  formatDisplayInteger,
  getFirstGrapheme,
  getGraphemeCount,
  isSectMemberRoleLowerThan,
} from '@mud/shared';

import {
  SECT_CORE_CHAR,
  SECT_INSTANCE_PREFIX,
  SECT_TEMPLATE_PREFIX,
} from '../../constants/gameplay/sect';
import { resolveSectMemberDisplayName } from '../player/player-display-name';

const SECT_ROLE_LABELS = {
  leader: '宗主',
  supreme_elder: '太上长老',
  deputy: '副宗主',
  elder: '长老',
  inner: '内门',
  outer: '外门',
  labor: '杂役',
};

export const SECT_ROLES = SECT_MEMBER_ROLE_HIERARCHY.map((id) => ({
  id,
  label: SECT_ROLE_LABELS[id],
  assignable: id !== 'leader',
}));

const SECT_ROLE_IDS = new Set(SECT_ROLES.map((entry) => entry.id));
const SECT_ASSIGNABLE_ROLE_IDS = new Set(
  SECT_ROLES.filter((entry) => entry.assignable).map((entry) => entry.id),
);

const SECT_PERMISSION_LABELS = {
  guardian: '护宗大阵',
  member_remove: '逐出宗门',
  member_approve: '同意入宗',
  member_role: '修改职位',
  building_create: '建造',
  building_remove: '拆除',
};

export const SECT_PERMISSIONS = SECT_PERMISSION_IDS.map((id) => ({
  id,
  label: SECT_PERMISSION_LABELS[id],
}));

const SECT_PERMISSION_ID_SET = new Set<string>(SECT_PERMISSIONS.map((entry) => entry.id));
const ALL_SECT_PERMISSIONS = buildSectPermissionFlags(true);
const NO_SECT_PERMISSIONS = buildSectPermissionFlags(false);
const FIXED_FULL_PERMISSION_ROLE_IDS = new Set(['leader', 'supreme_elder']);
const DEFAULT_SECT_ROLE_PERMISSIONS = {
  leader: { ...ALL_SECT_PERMISSIONS },
  supreme_elder: { ...ALL_SECT_PERMISSIONS },
  deputy: { ...ALL_SECT_PERMISSIONS },
  elder: { ...NO_SECT_PERMISSIONS, guardian: true },
  inner: { ...NO_SECT_PERMISSIONS },
  outer: { ...NO_SECT_PERMISSIONS },
  labor: { ...NO_SECT_PERMISSIONS },
};

function buildSectPermissionFlags(enabled) {
  return Object.fromEntries(SECT_PERMISSION_IDS.map((permissionId) => [permissionId, enabled]));
}

export function buildSectId(playerId) {
  const normalized = normalizeOptionalString(playerId)?.replace(/[^a-zA-Z0-9:_-]+/g, '_') || 'player';
  return `sect:${normalized}:${Date.now().toString(36)}`;
}

export function buildSectInstanceId(sectId) {
  return `${SECT_INSTANCE_PREFIX}${sectId}:main`;
}

export function buildSectTemplateId(sectId, _boundsInput = null) {
  return `${SECT_TEMPLATE_PREFIX}${sectId}`;
}

export function resolveSectTemplateIdForBounds(sectId, _candidateTemplateId, _boundsInput) {
  return buildSectTemplateId(sectId);
}

function buildDefaultSectName(player) {
  const raw = normalizeOptionalString(player?.displayName) || normalizeOptionalString(player?.name) || '无名';
  return `${raw}宗`;
}

export function normalizeSectName(input, player) {
  const fallback = buildDefaultSectName(player);
  const raw = normalizeOptionalString(input) || fallback;
  const sanitized = raw.replace(/\s+/g, '').trim();
  if (!sanitized) {
    return fallback;
  }
  const count = typeof getGraphemeCount === 'function'
    ? getGraphemeCount(sanitized)
    : Array.from(sanitized).length;
  if (count < 2 || count > 12) {
    throw new BadRequestException('宗门名称需为 2 到 12 个字');
  }
  if (/[<>`"'\\]/.test(sanitized)) {
    throw new BadRequestException('宗门名称包含不可用字符');
  }
  return sanitized;
}

export function normalizeSectMark(input, fallbackText) {
  const hasExplicitInput = normalizeOptionalString(input) !== null;
  const raw = normalizeOptionalString(input) || normalizeOptionalString(fallbackText) || SECT_CORE_CHAR;
  const normalized = raw.replace(/\s+/g, '').trim();
  const first = typeof getFirstGrapheme === 'function'
    ? getFirstGrapheme(normalized)
    : (Array.from(normalized)[0] ?? '');
  if (!first || /[\s<>`"'\\]/.test(first)) {
    throw new BadRequestException('宗门印记需为一个可见字符');
  }
  const count = typeof getGraphemeCount === 'function'
    ? getGraphemeCount(normalized)
    : Array.from(normalized).length;
  if (hasExplicitInput && count !== 1) {
    throw new BadRequestException('宗门印记只能是一个字');
  }
  return first;
}

export function assertSectMarkAvailable(sects, mark) {
  const normalizedMark = normalizeOptionalString(mark);
  if (!normalizedMark) {
    throw new BadRequestException('宗门印记需为一个可见字符');
  }
  for (const sect of sects) {
    if (normalizeOptionalString(sect?.status) === 'dissolved') {
      continue;
    }
    if (normalizeOptionalString(sect?.mark) === normalizedMark) {
      throw new BadRequestException('宗门印记已被占用');
    }
  }
}

export function normalizeNonNegativeInteger(input) {
  const value = Math.trunc(Number(input));
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException('注入数量不能为负');
  }
  return value;
}

export function normalizePositiveInteger(input, label = '数值') {
  const value = Math.trunc(Number(input));
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${label}必须大于 0`);
  }
  return value;
}

export function normalizeIntegerWithDefault(input, fallback) {
  const value = Math.trunc(Number(input));
  if (Number.isFinite(value)) {
    return value;
  }
  return Math.trunc(Number(fallback ?? 0));
}

export function resolveSectGuardianFormation(sect, deps) {
  const guardianId = `formation:sect_guardian:${sect.sectId}`;
  return typeof deps?.worldRuntimeFormationService?.findFormationInInstance === 'function'
    ? deps.worldRuntimeFormationService.findFormationInInstance(sect.entranceInstanceId, guardianId)
    : null;
}

export function formatSectGuardianStatusLabel(formation) {
  if (!formation) {
    return '未建立';
  }
  const qiBudget = resolveFormationQiBudget(formation);
  const spiritStoneBudget = Number(formation.remainingSpiritStoneBudget ?? formation.spiritStoneCount) || 0;
  if (formation.active === false || qiBudget <= 0 || spiritStoneBudget <= 0) {
    return '停摆';
  }
  return '开启';
}

export function resolveFormationQiBudget(formation) {
  return Math.max(0, Math.floor(Number(
    formation?.remainingQiBudget ?? formation?.remainingAuraBudget,
  ) || 0));
}

export function formatSectGuardianAuraLabel(formation) {
  const qiValue = resolveFormationQiBudget(formation);
  const stoneValue = Math.max(0, Math.floor(Number(
    formation?.remainingSpiritStoneBudget ?? formation?.spiritStoneCount,
  ) || 0));
  return `${formatInteger(qiValue)} / 灵石 ${formatInteger(stoneValue)}`;
}

export function buildSectGuardianManagementData(formation, formationService = null, player = null) {
  const remainingQi = Math.max(0, Math.floor(Number(
    formation?.remainingQiBudget ?? formation?.remainingAuraBudget,
  ) || 0));
  const remainingSpiritStone = Math.max(0, Math.floor(Number(
    formation?.remainingSpiritStoneBudget ?? formation?.spiritStoneCount,
  ) || 0));
  const strength = Math.max(1, Math.floor(Number(
    formation?.allocation?.effectValue ?? formation?.stats?.effectValue,
  ) || 1));
  const dailySpiritStoneCost = Math.max(
    0,
    Number(formationService?.resolveFormationDailySpiritStoneCost?.(formation)) || strength,
  );
  const damageReduction = Math.max(
    0,
    Math.min(0.999999, Number(formationService?.resolveFormationDamageReduction?.(formation)) || 0),
  );
  const remainingDays = dailySpiritStoneCost > 0
    ? remainingSpiritStone / dailySpiritStoneCost
    : null;
  return {
    active: formation ? formation.active !== false : false,
    strength,
    remainingQi,
    remainingSpiritStone,
    dailySpiritStoneCost,
    damageReduction,
    remainingDays,
  };
}

export function formatInteger(value) {
  const normalized = Math.max(0, Math.floor(Number(value) || 0));
  return formatDisplayInteger(normalized);
}

export function dispatchSectGuardianTechniqueActivity(playerId, mode, formationInstanceId, deps) {
  if (mode === 'start'
    && typeof deps?.craftPanelRuntimeService?.startTechniqueActivity === 'function'
    && typeof deps?.worldRuntimeCraftMutationService?.flushCraftMutation === 'function') {
    const result = deps.craftPanelRuntimeService.startTechniqueActivity(
      deps.playerRuntimeService.getPlayerOrThrow(playerId),
      'formation',
      { formationInstanceId },
      deps,
    );
    if (!result?.ok) {
      throw new BadRequestException(result?.error ?? '启动护宗大阵维护失败');
    }
    deps.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'formation', deps);
    return;
  }
  if (mode === 'cancel'
    && typeof deps?.craftPanelRuntimeService?.cancelTechniqueActivity === 'function'
    && typeof deps?.worldRuntimeCraftMutationService?.flushCraftMutation === 'function') {
    const result = deps.craftPanelRuntimeService.cancelTechniqueActivity(
      deps.playerRuntimeService.getPlayerOrThrow(playerId),
      'formation',
      deps,
    );
    if (!result?.ok) {
      throw new BadRequestException(result?.error ?? '停止护宗大阵维护失败');
    }
    deps.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'formation', deps);
    return;
  }
  deps.enqueuePendingCommand?.(playerId, mode === 'start'
    ? { kind: 'startFormationMaintenance', payload: { formationInstanceId } }
    : { kind: 'cancelFormationMaintenance' });
}

export function ensureSectState(sect, playerRuntimeService = null) {
  if (!sect) {
    return sect;
  }
  sect.rolePermissions = normalizeSectRolePermissions(sect.rolePermissions);
  sect.members = normalizeSectMembers(sect.members, {
    sectId: sect.sectId,
    leaderPlayerId: sect.leaderPlayerId,
    leaderName: sect.leaderPlayerId,
    createdAt: sect.createdAt,
  });
  sect.applications = normalizeSectApplications(sect.applications, sect.members);
  const leader = sect.members.find((entry) => entry.playerId === sect.leaderPlayerId);
  if (leader) {
    leader.roleId = 'leader';
    const runtimeLeader = playerRuntimeService?.getPlayer?.(leader.playerId);
    leader.name = resolvePlayerDisplayName(runtimeLeader, leader.name || leader.playerId);
  }
  for (const member of sect.members) {
    if (member.playerId !== sect.leaderPlayerId && member.roleId === 'leader') {
      member.roleId = 'deputy';
    }
    const runtimePlayer = playerRuntimeService?.getPlayer?.(member.playerId);
    if (runtimePlayer) {
      member.name = resolvePlayerDisplayName(runtimePlayer, member.name);
    }
  }
  return sect;
}

export function normalizeSectApplications(input, members = []) {
  const memberIds = new Set(
    (Array.isArray(members) ? members : []).map((entry) => entry.playerId),
  );
  const applications = [];
  const seen = new Set();
  for (const entry of Array.isArray(input) ? input : []) {
    const playerId = normalizeOptionalString(entry?.playerId ?? entry?.applicantPlayerId);
    if (!playerId || seen.has(playerId) || memberIds.has(playerId)) {
      continue;
    }
    seen.add(playerId);
    const status = entry?.status === 'approved' || entry?.status === 'rejected'
      ? entry.status
      : 'pending';
    applications.push({
      playerId,
      name: resolveSectMemberDisplayName({
        playerId,
        name: entry?.name,
        playerName: entry?.playerName,
      }, playerId),
      status,
      appliedAt: Number.isFinite(Number(entry?.appliedAt)) ? Number(entry.appliedAt) : Date.now(),
      updatedAt: Number.isFinite(Number(entry?.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
      reviewedAt: Number.isFinite(Number(entry?.reviewedAt)) ? Number(entry.reviewedAt) : null,
      reviewerPlayerId: normalizeOptionalString(entry?.reviewerPlayerId) || null,
    });
  }
  return applications.sort(
    (left, right) => left.appliedAt - right.appliedAt || left.playerId.localeCompare(right.playerId),
  );
}

export function findPendingSectApplication(sect, playerId) {
  const normalized = normalizeOptionalString(playerId);
  return normalized
    ? (sect.applications ?? []).find(
      (entry) => entry.playerId === normalized && entry.status === 'pending',
    ) ?? null
    : null;
}

export function upsertSectApplication(sect, player, now = Date.now()) {
  ensureSectState(sect);
  const playerId = normalizeOptionalString(player?.playerId) || normalizeOptionalString(player?.id);
  if (!playerId) {
    throw new BadRequestException('申请人无效');
  }
  const existing = findPendingSectApplication(sect, playerId);
  if (existing) {
    existing.name = resolvePlayerDisplayName(player, existing.name);
    existing.updatedAt = now;
    return existing;
  }
  const application = {
    playerId,
    name: resolvePlayerDisplayName(player, playerId),
    status: 'pending',
    appliedAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewerPlayerId: null,
  };
  sect.applications.push(application);
  return application;
}

export function normalizeSectMembers(input, fallback) {
  const now = Number.isFinite(Number(fallback?.createdAt))
    ? Number(fallback.createdAt)
    : Date.now();
  const members = [];
  const seen = new Set();
  const entries = Array.isArray(input) ? input : [];
  for (const entry of entries) {
    const playerId = normalizeOptionalString(entry?.playerId);
    if (!playerId || seen.has(playerId)) {
      continue;
    }
    seen.add(playerId);
    members.push({
      playerId,
      name: resolveSectMemberDisplayName({
        playerId,
        name: entry?.name,
      }, playerId),
      roleId: normalizeSectRoleId(
        entry?.roleId ?? entry?.role,
        { allowSupreme: true, fallback: 'outer' },
      ),
      joinedAt: Number.isFinite(Number(entry?.joinedAt)) ? Number(entry.joinedAt) : now,
    });
  }
  const leaderPlayerId = normalizeOptionalString(fallback?.leaderPlayerId);
  if (leaderPlayerId && !seen.has(leaderPlayerId)) {
    members.unshift({
      playerId: leaderPlayerId,
      name: resolveSectMemberDisplayName({
        playerId: leaderPlayerId,
        name: fallback?.leaderName,
      }, leaderPlayerId),
      roleId: 'leader',
      joinedAt: now,
    });
  }
  for (const member of members) {
    if (member.playerId === leaderPlayerId) {
      member.roleId = 'leader';
    }
  }
  return members.sort(
    (left, right) => roleSortWeight(left.roleId) - roleSortWeight(right.roleId)
      || left.joinedAt - right.joinedAt
      || left.playerId.localeCompare(right.playerId),
  );
}

export function buildSectMemberEntry(player, roleId, joinedAt = Date.now()) {
  const playerId = normalizeOptionalString(player?.playerId) || normalizeOptionalString(player?.id) || '';
  return {
    playerId,
    name: resolvePlayerDisplayName(player, playerId || '未知成员'),
    roleId: normalizeSectRoleId(roleId, { allowSupreme: true, fallback: 'outer' }),
    joinedAt,
  };
}

export function resolvePlayerDisplayName(player, fallback = '') {
  const playerId = normalizeOptionalString(player?.playerId) || normalizeOptionalString(player?.id);
  return resolveSectMemberDisplayName({
    ...(player && typeof player === 'object' ? player : {}),
    name: normalizeOptionalString(player?.name) || normalizeOptionalString(fallback),
  }, playerId);
}

export function resolveSectMemberPresenceLabel(player) {
  if (!player) {
    return '离线';
  }
  return typeof player.sessionId === 'string' && player.sessionId.trim()
    ? '在线'
    : '离线挂机';
}

export function resolveSectMemberRealmLv(player) {
  const value = Number(player?.realm?.realmLv ?? player?.realmLv);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

export function normalizeSectRolePermissions(input) {
  const next = buildDefaultSectRolePermissions();
  if (!input || typeof input !== 'object') {
    return next;
  }
  for (const role of SECT_ROLES) {
    const source = input[role.id];
    if (!source || typeof source !== 'object') {
      continue;
    }
    for (const permission of SECT_PERMISSIONS) {
      if (typeof source[permission.id] === 'boolean') {
        next[role.id][permission.id] = source[permission.id];
      }
    }
  }
  for (const roleId of FIXED_FULL_PERMISSION_ROLE_IDS) {
    next[roleId] = { ...ALL_SECT_PERMISSIONS };
  }
  return next;
}

export function buildDefaultSectRolePermissions() {
  return Object.fromEntries(SECT_ROLES.map((role) => [
    role.id,
    { ...(DEFAULT_SECT_ROLE_PERMISSIONS[role.id] ?? {}) },
  ]));
}

export function normalizeSectRoleId(input, options: any = {}) {
  const fallback = options.fallback || 'outer';
  const normalized = normalizeOptionalString(input) || fallback;
  if (!SECT_ROLE_IDS.has(normalized)) {
    if (options.fallback) {
      return fallback;
    }
    throw new BadRequestException('未知宗门职位');
  }
  if (options.requireAssignable === true && !SECT_ASSIGNABLE_ROLE_IDS.has(normalized)) {
    throw new BadRequestException('该职位不能直接任命');
  }
  return normalized;
}

export function normalizeSectPermissionId(input) {
  const normalized = normalizeOptionalString(input);
  if (!normalized || !SECT_PERMISSION_ID_SET.has(normalized)) {
    throw new BadRequestException('未知宗门权限');
  }
  return normalized;
}

export function getSectRoleLabel(roleId) {
  return SECT_ROLES.find((entry) => entry.id === roleId)?.label ?? '外门';
}

function roleSortWeight(roleId) {
  const index = SECT_ROLES.findIndex((entry) => entry.id === roleId);
  return index >= 0 ? index : 999;
}

export function isSectMember(sect, playerId) {
  const normalized = normalizeOptionalString(playerId);
  return Boolean(
    normalized
      && Array.isArray(sect?.members)
      && sect.members.some((entry) => entry.playerId === normalized),
  );
}

export function hasSectPermission(sect, playerId, permissionId) {
  const normalized = normalizeOptionalString(playerId);
  if (!normalized || !sect) {
    return false;
  }
  if (sect.leaderPlayerId === normalized) {
    return true;
  }
  const member = Array.isArray(sect.members)
    ? sect.members.find((entry) => entry.playerId === normalized)
    : null;
  if (!member) {
    return false;
  }
  const rolePermissions = normalizeSectRolePermissions(sect.rolePermissions);
  return rolePermissions[member.roleId]?.[permissionId] === true;
}

/** 判断操作者是否能调整目标成员；新职位为空时只检查目标层级。 */
export function canChangeSectMemberRole(sect, operatorPlayerId, targetMember, nextRoleId = null) {
  const operatorId = normalizeOptionalString(operatorPlayerId);
  if (!operatorId || !targetMember || targetMember.playerId === operatorId) {
    return false;
  }
  const operator = Array.isArray(sect?.members)
    ? sect.members.find((entry) => entry.playerId === operatorId)
    : null;
  if (!operator || !isSectMemberRoleLowerThan(targetMember.roleId, operator.roleId)) {
    return false;
  }
  return nextRoleId === null || isSectMemberRoleLowerThan(nextRoleId, operator.roleId);
}

/** 强制职位变更只能作用于比操作者低的成员和职位。 */
export function assertSectMemberRoleChange(sect, operatorPlayerId, targetMember, nextRoleId) {
  const operatorId = normalizeOptionalString(operatorPlayerId);
  if (!operatorId) {
    throw new ForbiddenException('宗门成员身份无效');
  }
  if (targetMember?.playerId === operatorId) {
    throw new BadRequestException('不能修改自己的职位');
  }
  const operator = Array.isArray(sect?.members)
    ? sect.members.find((entry) => entry.playerId === operatorId)
    : null;
  if (!operator || !isSectMemberRoleLowerThan(targetMember?.roleId, operator.roleId)) {
    throw new ForbiddenException('只能修改比自己职位低的成员');
  }
  if (!isSectMemberRoleLowerThan(nextRoleId, operator.roleId)) {
    throw new ForbiddenException('只能任命比自己职位低的职位');
  }
}

export function assertSectLeader(sect, playerId) {
  if (sect.leaderPlayerId !== playerId) {
    throw new ForbiddenException('只有宗主可以执行该操作');
  }
}

export function assertSectLeaderOrDeputy(sect, playerId) {
  const normalizedPlayerId = normalizeOptionalString(playerId);
  if (!normalizedPlayerId) {
    throw new ForbiddenException('只有宗主或副宗主可以执行该操作');
  }
  if (sect.leaderPlayerId === normalizedPlayerId) {
    return;
  }
  const member = Array.isArray(sect.members)
    ? sect.members.find((entry) => entry?.playerId === normalizedPlayerId)
    : null;
  if (member?.roleId === 'leader' || member?.roleId === 'deputy') {
    return;
  }
  throw new ForbiddenException('只有宗主或副宗主可以执行该操作');
}

export function assertSectPermission(sect, playerId, permissionId) {
  if (!hasSectPermission(sect, playerId, permissionId)) {
    throw new ForbiddenException('当前职位没有该宗门权限');
  }
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}
