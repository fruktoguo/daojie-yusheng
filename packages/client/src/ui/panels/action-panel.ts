/**
 * 行动面板
 * 负责动作列表、技能管理和技能方案的局部交互，不接管真正的战斗结算。
 */
import {
  ActionDef,
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillCondition,
  AutoUsePillConfig,
  CombatTargetingRuleKey,
  CombatTargetingRules,
  DEFAULT_PLAYER_REALM_STAGE,
  ItemStack,
  PlayerState,
  SkillDef,
  resolveSkillUnlockLevel,
  type ElementKey,
  type SkillDamageKind,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { patchElementHtml } from '../dom-patch';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildSkillTooltipContent, type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getLocalItemTemplate, getLocalRealmLevelEntry, resolvePreviewItem } from '../../content/local-templates';
import { getActionTypeLabel, getElementKeyLabel } from '../../domain-labels';
import { ACTION_SHORTCUTS_CHANGED_EVENT, ACTION_SHORTCUTS_KEY, ACTION_SKILL_PRESETS_KEY, RETURN_TO_SPAWN_ACTION_ID } from '../../constants/ui/action';
import { formatDisplayNumber } from '../../utils/number';
import { t } from '../i18n';
import {
  appendUnique,
  buildLegacyHostileTargetingFallback,
  decodePresetTextValue,
  escapeHtml,
  getSkillAffinityBadge,
  getSkillEnabledTechniques,
  isAutoUseConsumableCandidate,
  isRecord,
  normalizeShortcutKey,
  readBoolean,
} from './action-panel-helpers';
import { SkillManagementSubpanel } from './action-panel-skill-management';
import { CombatSettingsSubpanel } from './action-panel-combat-settings';
import { SectManagementSubpanel } from './action-panel-sect-management';

type SkillEnabledEntry = {
  skillEnabled?: boolean;
};

function getPlayerEnabledSkillSlotLimitByLevel(level: number | undefined): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(Number(level))) : 1;
  let extraSlots = 0;

  const earlyLevels = Math.min(normalizedLevel, 6);
  extraSlots += Math.max(0, earlyLevels - 1);

  if (normalizedLevel >= 7) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 18) - 6) / 3);
  }

  if (normalizedLevel >= 19) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 30) - 18) / 5);
  }

  if (normalizedLevel >= 31) {
    extraSlots += Math.floor((normalizedLevel - 30) / 6);
  }

  extraSlots += Math.floor(normalizedLevel / 6);
  extraSlots += Math.floor(normalizedLevel / 12);

  return 4 + extraSlots;
}

function resolvePlayerSkillSlotLimitLocal(
  player: Pick<PlayerState, 'realmLv' | 'realm'> | null | undefined,
): number {
  return getPlayerEnabledSkillSlotLimitByLevel(player?.realm?.realmLv ?? player?.realmLv);
}

function countEnabledSkillEntriesLocal<T extends SkillEnabledEntry>(entries: readonly T[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.skillEnabled !== false) {
      count += 1;
    }
  }
  return count;
}

function enforceSkillEnabledLimitLocal<T extends SkillEnabledEntry>(
  entries: readonly T[],
  limit: number,
): T[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  let enabledCount = 0;
  return entries.map((entry) => {
    if (entry.skillEnabled === false) {
      return entry;
    }
    if (enabledCount < normalizedLimit) {
      enabledCount += 1;
      return entry;
    }
    return {
      ...entry,
      skillEnabled: false,
    };
  });
}

/** 行动面板的主标签页：交互、技能、开关和通用动作。 */
type ActionMainTab = 'dialogue' | 'skill' | 'toggle' | 'utility';
/** 技能区的子标签页：自动技能和手动技能。 */
type SkillSubTab = 'auto' | 'manual';
/** 技能管理弹层里正在查看的分组。 */
type SkillManagementTab = SkillSubTab | 'disabled';
/** 技能管理里的批量切换模式。 */
type SkillManagementBulkMode = SkillSubTab | 'enabled' | 'disabled';
/** 技能管理的排序字段。 */
type SkillManagementSortField = 'custom' | 'actualDamage' | 'qiCost' | 'range' | 'targetCount' | 'cooldown';
/** 技能管理的排序方向。 */
type SkillManagementSortDirection = 'asc' | 'desc';
/** 技能管理筛选面板中的开关项。 */
type SkillManagementFilterToggle = 'melee' | 'ranged' | 'physical' | 'spell' | 'single' | 'aoe';
/** 宗门管理弹层标签。 */
type SectManagementTab = 'overview' | 'members' | 'roles' | 'manage' | 'guardian' | 'domain';
interface SectManagementMember {
  playerId: string;
  name: string;
  roleId: string;
  roleLabel: string;
  realmLv: number | null;
  statusLabel: string;
  self?: boolean;
  leader?: boolean;
}
interface SectManagementRole {
  id: string;
  label: string;
  assignable: boolean;
}
interface SectManagementPermission {
  id: string;
  label: string;
}
interface SectManagementApplication {
  playerId: string;
  name: string;
  appliedAt: number;
}
interface SectManagementData {
  selfPlayerId: string;
  canEditPermissions: boolean;
  canTransfer: boolean;
  canDissolve: boolean;
  canLeave: boolean;
  canReviewApplications: boolean;
  canManageGuardian: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  roles: SectManagementRole[];
  permissions: SectManagementPermission[];
  rolePermissions: Record<string, Record<string, boolean>>;
  members: SectManagementMember[];
  applications: SectManagementApplication[];
}
interface SectManagementSummary {
  name: string;
  mark: string;
  domainLabel: string;
  guardianStatusLabel: string;
  guardianAuraLabel: string;
  sectIdLabel: string;
  leaderName: string;
  realmLabel: string;
  memberCountLabel: string;
  notice: string;
  data: SectManagementData;
}
/** 技能预设状态提示的语气。 */
type SkillPresetStatusTone = 'success' | 'error' | 'info';
type CombatSettingsTab = 'auto_pills' | 'targeting';
type AutoUsePillSubview = 'main' | 'picker' | 'conditions';

const SECT_MANAGEMENT_DATA_PATTERN = /\n?@@sect:([^@\n]+)@@/;
const DEFAULT_SECT_MANAGEMENT_ROLES: SectManagementRole[] = [
  { id: 'leader', label: t('action.sect.role.leader', undefined), assignable: false },
  { id: 'deputy', label: t('action.sect.role.deputy', undefined), assignable: true },
  { id: 'elder', label: t('action.sect.role.elder', undefined), assignable: true },
  { id: 'inner', label: t('action.sect.role.inner', undefined), assignable: true },
  { id: 'outer', label: t('action.sect.role.outer', undefined), assignable: true },
  { id: 'labor', label: t('action.sect.role.labor', undefined), assignable: true },
  { id: 'supreme_elder', label: t('action.sect.role.supreme-elder', undefined), assignable: false },
];
const DEFAULT_SECT_MANAGEMENT_PERMISSIONS: SectManagementPermission[] = [
  { id: 'guardian', label: t('action.sect.permission.guardian', undefined) },
  { id: 'member_remove', label: t('action.sect.permission.member-remove', undefined) },
  { id: 'member_role', label: t('action.sect.permission.member-role', undefined) },
];

function stripSectManagementData(desc: string | undefined): string {
  return (desc ?? '').replace(SECT_MANAGEMENT_DATA_PATTERN, '').trim();
}

function parseSectManagementData(desc: string | undefined, player: PlayerState | null): SectManagementData {
  const fallback = buildFallbackSectManagementData(player);
  const match = SECT_MANAGEMENT_DATA_PATTERN.exec(desc ?? '');
  if (!match?.[1]) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Partial<SectManagementData>;
    const roles = Array.isArray(parsed.roles) && parsed.roles.length > 0
      ? parsed.roles.map(normalizeSectManagementRole)
      : fallback.roles;
    const permissions = Array.isArray(parsed.permissions) && parsed.permissions.length > 0
      ? parsed.permissions.map(normalizeSectManagementPermission)
      : fallback.permissions;
    const members = Array.isArray(parsed.members) && parsed.members.length > 0
      ? parsed.members.map(normalizeSectManagementMember)
      : fallback.members;
    const applications = Array.isArray(parsed.applications)
      ? parsed.applications.map(normalizeSectManagementApplication).filter((entry) => entry.playerId)
      : fallback.applications;
    return {
      selfPlayerId: typeof parsed.selfPlayerId === 'string' ? parsed.selfPlayerId : fallback.selfPlayerId,
      canEditPermissions: parsed.canEditPermissions === true,
      canTransfer: parsed.canTransfer === true,
      canDissolve: parsed.canDissolve === true,
      canLeave: parsed.canLeave === true,
      canReviewApplications: parsed.canReviewApplications === true,
      canManageGuardian: parsed.canManageGuardian === true,
      canRemoveMembers: parsed.canRemoveMembers === true,
      canChangeRoles: parsed.canChangeRoles === true,
      roles,
      permissions,
      rolePermissions: normalizeSectManagementRolePermissions(parsed.rolePermissions, roles, permissions),
      members,
      applications,
    };
  } catch (_error) {
    return fallback;
  }
}

function buildFallbackSectManagementData(player: PlayerState | null): SectManagementData {
  const playerId = player?.id ?? '';
  const name = player?.name || player?.displayName || playerId || t('action.sect.fallback.current-leader', undefined);
  const rolePermissions = normalizeSectManagementRolePermissions({}, DEFAULT_SECT_MANAGEMENT_ROLES, DEFAULT_SECT_MANAGEMENT_PERMISSIONS);
  return {
    selfPlayerId: playerId,
    canEditPermissions: true,
    canTransfer: true,
    canDissolve: true,
    canLeave: false,
    canReviewApplications: true,
    canManageGuardian: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    roles: DEFAULT_SECT_MANAGEMENT_ROLES,
    permissions: DEFAULT_SECT_MANAGEMENT_PERMISSIONS,
    rolePermissions,
    members: [{
      playerId,
      name,
      roleId: 'leader',
      roleLabel: t('action.sect.role.leader', undefined),
      realmLv: Number.isFinite(Number(player?.realm?.realmLv ?? player?.realmLv)) ? Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv)) : null,
      statusLabel: t('action.sect.status.online', undefined),
      self: true,
      leader: true,
    }],
    applications: [],
  };
}

function normalizeSectManagementRole(input: unknown): SectManagementRole {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementRole> : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'outer';
  const fallback = DEFAULT_SECT_MANAGEMENT_ROLES.find((role) => role.id === id);
  return {
    id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback?.label ?? id,
    assignable: source.assignable === true,
  };
}

function normalizeSectManagementPermission(input: unknown): SectManagementPermission {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementPermission> : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'guardian';
  const fallback = DEFAULT_SECT_MANAGEMENT_PERMISSIONS.find((permission) => permission.id === id);
  return {
    id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback?.label ?? id,
  };
}

function normalizeSectManagementMember(input: unknown): SectManagementMember {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementMember> : {};
  const playerId = typeof source.playerId === 'string' && source.playerId.trim() ? source.playerId.trim() : '';
  const roleId = typeof source.roleId === 'string' && source.roleId.trim() ? source.roleId.trim() : 'outer';
  const role = DEFAULT_SECT_MANAGEMENT_ROLES.find((entry) => entry.id === roleId);
  return {
    playerId,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : playerId || t('action.sect.fallback.unknown-member', undefined),
    roleId,
    roleLabel: typeof source.roleLabel === 'string' && source.roleLabel.trim() ? source.roleLabel.trim() : role?.label ?? roleId,
    realmLv: Number.isFinite(Number(source.realmLv)) && Number(source.realmLv) > 0 ? Math.trunc(Number(source.realmLv)) : null,
    statusLabel: typeof source.statusLabel === 'string' && source.statusLabel.trim() ? source.statusLabel.trim() : t('action.sect.status.offline', undefined),
    self: source.self === true,
    leader: source.leader === true,
  };
}

function normalizeSectManagementApplication(input: unknown): SectManagementApplication {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementApplication> : {};
  const playerId = typeof source.playerId === 'string' && source.playerId.trim() ? source.playerId.trim() : '';
  return {
    playerId,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : playerId || t('action.sect.fallback.unknown-applicant', undefined),
    appliedAt: Number.isFinite(Number(source.appliedAt)) ? Math.trunc(Number(source.appliedAt)) : 0,
  };
}

function formatSectTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return t('common.value.unknown', undefined);
  }
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function formatSectMemberRealmLabel(member: SectManagementMember, fallback = t('common.value.unknown', undefined)): string {
  if (!Number.isFinite(Number(member.realmLv)) || Number(member.realmLv) <= 0) {
    return fallback;
  }
  const realmLv = Math.trunc(Number(member.realmLv));
  return getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${realmLv}`;
}

function normalizeSectManagementRolePermissions(
  input: unknown,
  roles: SectManagementRole[],
  permissions: SectManagementPermission[],
): Record<string, Record<string, boolean>> {
  const source = input && typeof input === 'object' ? input as Record<string, Record<string, boolean>> : {};
  const next: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    next[role.id] = {};
    for (const permission of permissions) {
      next[role.id][permission.id] = source?.[role.id]?.[permission.id] === true || role.id === 'leader';
    }
  }
  return next;
}

interface AutoUsePillViewEntry {
  itemId: string;
  name: string;
  desc: string;
  count: number;
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  consumeBuffs?: Array<{ buffId?: string; name?: string }>;
  selected: boolean;
  conditions: AutoUsePillCondition[];
}

interface CombatTargetingCardOption {
  key?: CombatTargetingRuleKey;
  scope?: 'hostile' | 'friendly';
  label: string;
  summary: string;
  active?: boolean;
  disabled?: boolean;
}

const AUTO_BATTLE_TARGETING_MODE_OPTIONS: Array<{ mode: AutoBattleTargetingMode; label: string; summary: string }> = [
  { mode: 'auto', label: t('action.targeting-plan.mode.auto.label', undefined), summary: t('action.targeting-plan.mode.auto.summary', undefined) },
  { mode: 'nearest', label: t('action.targeting-plan.mode.nearest.label', undefined), summary: t('action.targeting-plan.mode.nearest.summary', undefined) },
  { mode: 'low_hp', label: t('action.targeting-plan.mode.low-hp.label', undefined), summary: t('action.targeting-plan.mode.low-hp.summary', undefined) },
  { mode: 'full_hp', label: t('action.targeting-plan.mode.full-hp.label', undefined), summary: t('action.targeting-plan.mode.full-hp.summary', undefined) },
  { mode: 'boss', label: t('action.targeting-plan.mode.boss.label', undefined), summary: t('action.targeting-plan.mode.boss.summary', undefined) },
  { mode: 'player', label: t('action.targeting-plan.mode.player.label', undefined), summary: t('action.targeting-plan.mode.player.summary', undefined) },
];

const HOSTILE_TARGETING_KEYS = new Set<CombatTargetingRuleKey>([
  'monster',
  'all_players',
  'demonized_players',
  'retaliators',
  'party',
  'sect',
  'terrain',
]);

const FRIENDLY_TARGETING_KEYS = new Set<CombatTargetingRuleKey>([
  'monster',
  'terrain',
  'non_hostile_players',
  'all_players',
  'retaliators',
  'party',
  'sect',
]);

const DEFAULT_HOSTILE_COMBAT_TARGETING_RULES: CombatTargetingRuleKey[] = [
  'monster',
  'demonized_players',
  'retaliators',
  'terrain',
];

const DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES: CombatTargetingRuleKey[] = [
  'non_hostile_players',
];

/** 动作列表行里需要缓存的节点引用，供局部 patch 直接改 DOM。 */
interface ActionRowRefs {
/**
 * row：row相关字段。
 */

  row: HTMLElement;  
  /**
 * cdNode：cdNode相关字段。
 */

  cdNode: HTMLElement;  
  /**
 * execNode：execNode相关字段。
 */

  execNode: HTMLButtonElement;  
  /**
 * stateNode：状态Node相关字段。
 */

  stateNode?: HTMLElement;  
  /**
 * orderNode：订单Node相关字段。
 */

  orderNode?: HTMLElement;  
  /**
 * toggleNode：toggleNode相关字段。
 */

  toggleNode?: HTMLButtonElement;
}

/** 技能管理列表里的单条条目，包含动作本体和预览指标。 */
interface SkillManagementEntry {
/**
 * action：action相关字段。
 */

  action: ActionDef;  
  /**
 * metrics：metric相关字段。
 */

  metrics: SkillPreviewMetrics;
}

/** 动作对应技能的倾向标签，用来在卡片上补充元素倾向说明。 */
interface ActionSkillAffinityBadge {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * tone：tone相关字段。
 */

  tone: 'physical' | 'spell' | 'mixed' | 'utility';  
  /**
 * element：element相关字段。
 */

  element: ElementKey | 'multi' | 'neutral';
}

/** 技能预设里单个技能的启用状态，同时保留自动/手动标记。 */
interface SkillPresetSkillState {
/**
 * skillId：技能ID标识。
 */

  skillId: string;  
  /**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * skillEnabled：启用开关或状态标识。
 */

  skillEnabled: boolean;
}

/** 单个技能预设的持久化记录。 */
interface SkillPresetRecord {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * skills：技能相关字段。
 */

  skills: SkillPresetSkillState[];
}

/** 技能预设导入导出的库结构。 */
interface SkillPresetLibrary {
/**
 * v：v相关字段。
 */

  v: number;  
  /**
 * p：p相关字段。
 */

  p: Array<{  
  /**
 * n：n相关字段。
 */

    n: string;    
    /**
 * s：s相关字段。
 */

    s: Array<[string, 0 | 1]>;
  }>;
}

/** 技能预设当前的状态提示。 */
interface SkillPresetStatus {
/**
 * tone：tone相关字段。
 */

  tone: SkillPresetStatusTone;  
  /**
 * text：text名称或显示文本。
 */

  text: string;
}

/** 技能预设名称的最大长度。 */
const SKILL_PRESET_NAME_MAX_LENGTH = 24;
/** 技能预设导出格式版本。 */
const SKILL_PRESET_EXPORT_VERSION = 2;

/** 动作面板实现，负责动作、技能和预设的局部交互。 */
export class ActionPanel {
  /** 技能管理弹窗的归属标识，和其他详情弹层互斥。 */
  private readonly SKILL_MANAGEMENT_MODAL_OWNER = 'action-panel-skill-management';
  /** 战斗设置弹层。 */
  private readonly COMBAT_SETTINGS_MODAL_OWNER = 'action-panel-combat-settings';
  /** 技能预设弹窗的归属标识，和技能管理弹层分开管理。 */
  private readonly SKILL_PRESET_MODAL_OWNER = 'action-panel-skill-preset';
  /** 索敌方案弹层。 */
  private readonly TARGETING_PLAN_MODAL_OWNER = 'action-panel-targeting-plan';
  /** 宗门管理弹层。 */
  private readonly SECT_MANAGEMENT_MODAL_OWNER = 'action-panel-sect-management';
  /** 自动吃药槽位上限。 */
  private readonly AUTO_USE_PILL_SLOT_LIMIT = 12;
  /** 面板根节点，后续只做局部 patch。 */
  private pane = document.getElementById('pane-action')!;
  /** 执行动作的外部回调，由战斗/交互层接手真正执行。 */
  private onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null = null;
  /** 同步自动战斗技能配置的外部回调，保存顺位和开关状态。 */
  private onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null = null;
  /** 同步自动吃药配置。 */
  private onUpdateAutoUsePills: ((pills: AutoUsePillConfig[]) => void) | null = null;
  /** 同步目标选择规则。 */
  private onUpdateCombatTargetingRules: ((rules: CombatTargetingRules) => void) | null = null;
  /** 同步优先索敌方案。 */
  private onUpdateAutoBattleTargetingMode: ((mode: AutoBattleTargetingMode) => void) | null = null;
  /** 当前主标签页，决定展示对话、技能、开关还是通用动作。 */
  private activeTab: ActionMainTab = 'dialogue';
  /** 当前技能子标签页。 */
  private activeSkillTab: SkillSubTab = 'auto';
  /** 技能管理弹层当前分组。 */
  private skillManagementTab: SkillManagementTab = 'auto';
  /** 技能管理弹层里的草稿缓存，未应用前只留在本地。 */
  private skillManagementDraft: AutoBattleSkillConfig[] | null = null;
  /** 技能管理排序面板是否展开。 */
  private skillManagementSortOpen = false;
  /** 技能管理当前排序字段。 */
  private skillManagementSortField: SkillManagementSortField = 'custom';
  /** 技能管理当前排序方向。 */
  private skillManagementSortDirection: SkillManagementSortDirection = 'desc';
  /** 技能管理筛选面板是否展开。 */
  private skillManagementFilterOpen = false;
  /** 技能管理当前启用的筛选条件。 */
  private skillManagementFilterToggles = new Set<SkillManagementFilterToggle>();
  /** 外部技能管理状态摘要，用来判断弹层是否需要重绘。 */
  private skillManagementExternalRevision: string | null = null;
  /** 技能管理弹层内的状态提示。 */
  private skillManagementStatus: SkillPresetStatus | null = null;
  /** 外部技能预设状态摘要，用来判断弹层是否需要重绘。 */
  private skillPresetExternalRevision: string | null = null;
  /** 外部索敌方案状态摘要。 */
  private targetingPlanExternalRevision: string | null = null;
  /** 战斗设置弹层外部摘要。 */
  private combatSettingsExternalRevision: string | null = null;
  /** 战斗设置弹层内的状态提示。 */
  private combatSettingsStatus: SkillPresetStatus | null = null;
  /** 技能管理列表的滚动位置，重绘后尽量恢复。 */
  private skillManagementListScrollTop = 0;
  /** 战斗设置当前标签。 */
  private combatSettingsActiveTab: CombatSettingsTab = 'auto_pills';
  /** 宗门管理当前标签。 */
  private sectManagementTab: SectManagementTab = 'guardian';
  /** 宗门管理弹层最近一次外部内容签名。 */
  private sectManagementExternalRevision = '';
  /** 自动吃药草稿。 */
  private autoUsePillDraft: AutoUsePillConfig[] | null = null;
  /** 目标选择草稿。 */
  private combatTargetingDraft: CombatTargetingRules | null = null;
  /** 自动丹药当前选中的槽位。 */
  private autoUsePillSelectedIndex = 0;
  /** 自动丹药弹层当前子视图。 */
  private autoUsePillSubview: AutoUsePillSubview = 'main';
  /** 角色是否开启自动战斗。 */
  private autoBattle = false;
  /** 角色是否开启自动反击。 */
  private autoRetaliate = true;
  /** 自动战斗时是否保持原地。 */
  private autoBattleStationary = false;
  /** 是否允许范围技能误伤玩家。 */
  private allowAoePlayerHit = false;
  /** 是否开启离线自动修炼。 */
  private autoIdleCultivation = true;
  /** 是否自动切换修炼模式。 */
  private autoSwitchCultivation = false;
  /** 当前是否处于修炼态。 */
  private cultivationActive = false;
  /** 当前动作列表快照，包含系统补进来的工具动作。 */
  private currentActions: ActionDef[] = [];
  /** 快捷键绑定表，key 是 actionId，value 是按键。 */
  private shortcutBindings = new Map<string, string>();
  /** 技能预设列表，按本地保存顺序排列。 */
  private skillPresets: SkillPresetRecord[] = [];
  /** 当前选中的技能预设 ID。 */
  private selectedSkillPresetId: string | null = null;
  /** 新建或重命名时的预设名称草稿。 */
  private skillPresetNameDraft = '';
  /** 导入技能预设时的原始文本。 */
  private skillPresetImportText = '';
  /** 技能预设的状态提示。 */
  private skillPresetStatus: SkillPresetStatus | null = null;
  /** 正在等待绑定快捷键的动作 ID。 */
  private bindingActionId: string | null = null;
  /** 正在拖拽的技能 ID。 */
  private draggingSkillId: string | null = null;
  /** 拖拽悬停到的技能 ID。 */
  private dragOverSkillId: string | null = null;
  /** 拖拽悬停位置，决定插在目标前还是后。 */
  private dragOverPosition: 'before' | 'after' | null = null;
  /** 预览角色快照，用来算技能说明和管理指标。 */
  private previewPlayer?: PlayerState;
  /** 技能查询缓存，保存技能定义、等级和已知技能列表。 */
  private skillLookup = new Map<string, {  
  /**
 * skill：技能相关字段。
 */
 skill: SkillDef;  
 /**
 * techLevel：tech等级数值。
 */
 techLevel: number;  
 /**
 * knownSkills：known技能相关字段。
 */
 knownSkills: SkillDef[] }>();
  /** 面板内统一复用的悬浮提示。 */
  private tooltip = new FloatingTooltip();
  /** 战斗设置中的丹药提示。 */
  private autoUsePillTooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  /** 当前显示丹药提示的节点。 */
  private autoUsePillTooltipNode: HTMLElement | null = null;
  /** 动作行节点缓存，供冷却、顺位和开关状态局部更新。 */
  private actionRowRefs = new Map<string, ActionRowRefs>();  
  /** 当前面板主体这一轮 render 绑定的 DOM 监听，重绘前统一撤销。 */
  private paneRenderEvents: AbortController | null = null;

  // ─── 子面板实例 ───
  private readonly skillMgmt = new SkillManagementSubpanel(this);
  private readonly combatSettings = new CombatSettingsSubpanel(this);
  private readonly sectMgmt = new SectManagementSubpanel(this);

  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    this.skillPresets = this.skillMgmt.loadSkillPresets();
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  /** 清空面板、重置缓存并关掉关联弹层。 */
  clear(): void {
    this.tooltip.hide(true);
    this.autoUsePillTooltip.hide(true);
    this.autoUsePillTooltipNode = null;
    this.paneRenderEvents?.abort();
    this.paneRenderEvents = null;
    this.actionRowRefs.clear();
    this.skillManagementDraft = null;
    this.autoUsePillDraft = null;
    this.combatTargetingDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementStatus = null;
    this.skillPresetExternalRevision = null;
    this.targetingPlanExternalRevision = null;
    this.combatSettingsExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.combatSettingsActiveTab = 'auto_pills';
    this.sectManagementTab = 'guardian';
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    detailModalHost.close(this.SKILL_MANAGEMENT_MODAL_OWNER);
    detailModalHost.close(this.COMBAT_SETTINGS_MODAL_OWNER);
    detailModalHost.close(this.SKILL_PRESET_MODAL_OWNER);
    detailModalHost.close(this.TARGETING_PLAN_MODAL_OWNER);
    detailModalHost.close(this.SECT_MANAGEMENT_MODAL_OWNER);
    patchElementHtml(this.pane, `<div class="empty-hint">${t('action.empty.no-actions', undefined)}</div>`);
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onAction (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void 参数说明。
 * @param onUpdateAutoBattleSkills (skills: AutoBattleSkillConfig[]) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onAction: (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void,
    onUpdateAutoBattleSkills?: (skills: AutoBattleSkillConfig[]) => void,
    onUpdateAutoUsePills?: (pills: AutoUsePillConfig[]) => void,
    onUpdateCombatTargetingRules?: (rules: CombatTargetingRules) => void,
    onUpdateAutoBattleTargetingMode?: (mode: AutoBattleTargetingMode) => void,
  ): void {
    this.onAction = onAction;
    this.onUpdateAutoBattleSkills = onUpdateAutoBattleSkills ?? null;
    this.onUpdateAutoUsePills = onUpdateAutoUsePills ?? null;
    this.onUpdateCombatTargetingRules = onUpdateCombatTargetingRules ?? null;
    this.onUpdateAutoBattleTargetingMode = onUpdateAutoBattleTargetingMode ?? null;
  }

  /** 读取外部面板展示用的绑键按钮文案。 */
  getShortcutBindLabel(actionId: string): string {
    return this.getBindButtonLabel(actionId);
  }

  /** 供属性等外部面板进入或退出行动绑键模式。 */
  toggleShortcutBinding(actionId: string): void {
    this.bindingActionId = this.bindingActionId === actionId ? null : actionId;
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.notifyShortcutBindingChanged();
  }

  /** 用新的动作快照覆盖当前状态，并重绘面板和已开的弹层。 */
  update(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
      this.autoBattleStationary = player.autoBattleStationary === true;
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
      this.cultivationActive = player.cultivationActive === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
  }

  /** 只同步会变的动作状态，优先走局部 patch，避免整块重绘。 */
  syncDynamic(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
      this.autoBattleStationary = player.autoBattleStationary === true;
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
      this.cultivationActive = player.cultivationActive === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;

    if (!this.patchToggleCards() || !this.patchActionRows()) {
      this.render(this.currentActions);
    }
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderTargetingPlanModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
  }

  /** 从玩家快照初始化面板状态。 */
  initFromPlayer(player: PlayerState): void {
    this.previewPlayer = player;
    this.syncPlayerContext(player);
    this.currentActions = this.withUtilityActions(player.actions);
    this.autoBattle = player.autoBattle ?? false;
    this.autoRetaliate = player.autoRetaliate !== false;
    this.autoBattleStationary = player.autoBattleStationary === true;
    this.allowAoePlayerHit = player.allowAoePlayerHit === true;
    this.autoIdleCultivation = player.autoIdleCultivation !== false;
    this.autoSwitchCultivation = player.autoSwitchCultivation === true;
    this.cultivationActive = player.cultivationActive === true;
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderTargetingPlanModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
  }

  /** 同步玩家上下文到面板缓存。 */
  private syncPlayerContext(player: PlayerState): void {
    const knownSkills = player.techniques.flatMap((technique) => technique.skills);
    this.skillLookup = new Map(
      player.techniques.flatMap((technique) => technique.skills.map((skill) => [
        skill.id,
        { skill, techLevel: technique.level, knownSkills },
      ] as const)),
    );
  }

  /** 渲染动作面板主体。 */
  private render(actions: ActionDef[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (actions.length === 0) {
      this.clear();
      return;
    }

    const tabGroups: Array<{    
    /**
 * id：ID标识。
 */

      id: ActionMainTab;      
      /**
 * label：label名称或显示文本。
 */

      label: string;      
      /**
 * types：type相关字段。
 */

      types: string[];
    }> = [
      { id: 'dialogue', label: t('action.tab.dialogue', undefined), types: ['quest', 'interact', 'travel'] },
      { id: 'skill', label: t('action.tab.skill', undefined), types: ['skill', 'battle', 'gather'] },
      { id: 'toggle', label: t('action.tab.toggle', undefined), types: ['toggle'] },
      { id: 'utility', label: t('action.tab.utility', undefined), types: ['toggle'] },
    ];
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const list = groups.get(action.type) ?? [];
      list.push(action);
      groups.set(action.type, list);
    }
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(actions);
    const enabledSkillCount = this.getEnabledSkillCount(actions);
    const skillSlotLimit = this.getSkillSlotLimit();

    let html = `<div class="action-tab-bar">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.id === 'skill'
          ? `${tab.label} <span class="action-skill-subtab-count">${enabledSkillCount}/${skillSlotLimit}</span>`
          : tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
        const switchEntries = actions.filter((action) => this.isSwitchAction(action));
        if (switchEntries.length === 0) {
          html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div></div>`;
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">${t('action.section.toggle', undefined)}</div>
          <div class="intel-grid compact">`;
        for (const action of switchEntries) {
          html += this.renderSwitchItem(action);
        }
        html += '</div></div></div>';
        continue;
      }
      if (tab.id === 'utility') {
        const utilityEntries = actions.filter((action) => (
          (action.type === 'toggle' && !this.isSwitchAction(action))
          || this.isUtilityAction(action)
        ));
        if (utilityEntries.length === 0) {
          html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div></div>`;
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">${t('action.section.utility', undefined)}</div>
          <div class="action-card-list">`;
        for (const action of utilityEntries) {
          html += this.renderActionItem(action);
        }
        html += '</div></div></div>';
        continue;
      }
      const relevantTypes = tab.types.filter((type) => (groups.get(type)?.length ?? 0) > 0);
      if (relevantTypes.length === 0) {
        html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div>`;
      } else {
        for (const type of relevantTypes) {
          const entries = (groups.get(type) ?? []).filter((action) => !this.isUtilityAction(action) && !this.isSwitchAction(action));
          if (entries.length === 0) {
            continue;
          }
          if (type === 'skill') {
            html += this.renderSkillSection(entries, autoBattleDisplayOrders);
            continue;
          }
          html += `<div class="panel-section">
      <div class="panel-section-title">${getActionTypeLabel(type)}</div>
      <div class="action-card-list">`;
          for (const action of entries) {
            html += this.renderActionItem(action);
          }
          html += '</div></div>';
        }
      }
      html += '</div>';
    }

    preserveSelection(this.pane, () => {
      this.paneRenderEvents?.abort();
      patchElementHtml(this.pane, html);
      this.paneRenderEvents = new AbortController();
      const eventSignal = this.paneRenderEvents.signal;
      this.captureActionRowRefs();
      this.bindEvents(actions, eventSignal);
      this.bindTooltips(this.pane, eventSignal);
    });
  }

  /** 缓存动作行里后续 patch 会直接改到的节点引用。 */
  private captureActionRowRefs(): void {
    this.actionRowRefs.clear();
    this.pane.querySelectorAll<HTMLElement>('[data-action-row]').forEach((row) => {
      const actionId = row.dataset.actionRow;
      const cdNode = row.querySelector<HTMLElement>('[data-action-cd]');
      const execNode = row.querySelector<HTMLButtonElement>('[data-action-exec]');
      if (!actionId || !cdNode || !execNode) {
        return;
      }
      const stateNode = row.querySelector<HTMLElement>('[data-action-auto-state]');
      const orderNode = row.querySelector<HTMLElement>('[data-action-auto-order]');
      const toggleNode = row.querySelector<HTMLButtonElement>('[data-auto-battle-toggle]');
      this.actionRowRefs.set(actionId, {
        row,
        cdNode,
        execNode,
        stateNode: stateNode ?? undefined,
        orderNode: orderNode ?? undefined,
        toggleNode: toggleNode ?? undefined,
      });
    });
  }

  /** 给当前渲染出来的动作区装配标签切换、入口按钮和快捷操作事件。 */
  private bindEvents(actions: ActionDef[], signal: AbortSignal): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionTab as ActionMainTab | undefined;
        if (!tab) return;
        this.activeTab = tab;
        this.render(actions);
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionSkillTab as SkillSubTab | undefined;
        if (!tab) return;
        this.activeSkillTab = tab;
        this.render(actions);
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-manage-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillManagement();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-preset-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillPresetModal();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-combat-settings-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openCombatSettingsModal();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-targeting-plan-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openTargetingPlanModal();
      }, { signal });
    });
    this.bindActionCardEvents(this.pane, signal);
    this.bindActionExecEvents(this.pane, signal);
    this.bindBindActionEvents(this.pane, signal);
    this.bindAutoBattleToggleEvents(this.pane, signal);
    this.bindAutoBattleDragEvents(this.pane, signal);
  }

  /** 只给带提示信息的节点绑定悬浮提示，避免重复装配整棵树。 */
  private bindTooltips(root: HTMLElement, signal?: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    root.querySelectorAll<HTMLElement>('[data-action-tooltip-title]').forEach((node) => {
      const title = node.dataset.actionTooltipTitle ?? '';
      const rich = node.dataset.actionTooltipRich === '1';
      const skillId = node.dataset.actionTooltipSkillId ?? '';
      const skillContext = skillId ? this.skillLookup.get(skillId) : undefined;
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        const tooltip = skillContext ? buildSkillTooltipContent(skillContext.skill, {
          techLevel: skillContext.techLevel,
          player: this.previewPlayer,
          knownSkills: skillContext.knownSkills,
        }) : { lines: [], asideCards: [] };
        this.tooltip.showPinned(node, title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        const tooltip = skillContext ? buildSkillTooltipContent(skillContext.skill, {
          techLevel: skillContext.techLevel,
          player: this.previewPlayer,
          knownSkills: skillContext.knownSkills,
        }) : { lines: [], asideCards: [] };
        this.tooltip.show(title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
      }, { signal });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      }, { signal });
    });
  }

  /** 处理全局按键：一边支持绑键，一边支持直接触发动作。 */
  private handleGlobalKeydown(event: KeyboardEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (this.bindingActionId) {
      if (event.key === 'Escape') {
        this.bindingActionId = null;
        this.render(this.currentActions);
        this.renderSkillManagementModalIfOpen();
        this.notifyShortcutBindingChanged();
        return;
      }
      const normalized = normalizeShortcutKey(event.key);
      if (!normalized) return;
      event.preventDefault();
      for (const [actionId, binding] of this.shortcutBindings.entries()) {
        if (binding === normalized) {
          this.shortcutBindings.delete(actionId);
        }
      }
      this.shortcutBindings.set(this.bindingActionId, normalized);
      this.saveShortcutBindings();
      this.bindingActionId = null;
      this.render(this.currentActions);
      this.renderSkillManagementModalIfOpen();
      this.notifyShortcutBindingChanged();
      return;
    }

    const normalized = normalizeShortcutKey(event.key);
    if (!normalized) return;
    const actionId = [...this.shortcutBindings.entries()].find(([, binding]) => binding === normalized)?.[0];
    if (!actionId) return;
    const action = this.currentActions.find((entry) => entry.id === actionId);
    if (!action || action.cooldownLeft > 0) return;
    if (action.type === 'skill' && action.skillEnabled === false) return;
    event.preventDefault();
    this.onAction?.(action.id, action.requiresTarget, action.targetMode, action.range, action.name);
  }

  /** 在动作标题旁补一枚快捷键标记。 */
  private renderShortcutBadge(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `<span class="action-shortcut-tag">${t('action.shortcut.badge', { key: binding.toUpperCase() })}</span>` : '';
  }

  /** 在动作摘要里补一段快捷键说明。 */
  private renderShortcutMeta(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? t('action.shortcut.meta', { key: binding.toUpperCase() }) : '';
  }

  /** 判断是否属于需要显示开关卡片的动作。 */
  private isSwitchAction(action: ActionDef): boolean {
    return this.isSwitchActionId(action.id);
  }

  /** 判断是否属于客户端补进来的通用动作。 */
  private isUtilityAction(action: ActionDef): boolean {
    return this.isUtilityActionId(action.id);
  }

  /** 判断动作 id 是否落在通用动作范围内。 */
  private isUtilityActionId(actionId: string): boolean {
    return actionId === RETURN_TO_SPAWN_ACTION_ID || actionId === 'battle:force_attack';
  }

  /** 判断动作 id 是否是状态开关类动作。 */
  private isSwitchActionId(actionId: string): boolean {
    return actionId === 'toggle:auto_battle'
      || actionId === 'toggle:auto_retaliate'
      || actionId === 'toggle:auto_battle_stationary'
      || actionId === 'toggle:allow_aoe_player_hit'
      || actionId === 'toggle:auto_idle_cultivation'
      || actionId === 'toggle:auto_switch_cultivation'
      || actionId === 'cultivation:toggle'
      || actionId === 'sense_qi:toggle';
  }

  /** 返回开关卡片在面板里显示的标题。 */
  private getSwitchCardTitle(action: ActionDef): string {
    switch (action.id) {
      case 'toggle:auto_battle':
        return t('action.switch.auto-battle', undefined);
      case 'toggle:auto_retaliate':
        return t('action.switch.auto-retaliate', undefined);
      case 'toggle:auto_battle_stationary':
        return t('action.switch.stationary', undefined);
      case 'toggle:allow_aoe_player_hit':
        return t('action.switch.aoe-player-hit', undefined);
      case 'toggle:auto_idle_cultivation':
        return t('action.switch.auto-idle-cultivation', undefined);
      case 'toggle:auto_switch_cultivation':
        return t('action.switch.auto-switch-cultivation', undefined);
      case 'cultivation:toggle':
        return t('action.switch.cultivation-active', undefined);
      case 'sense_qi:toggle':
        return t('action.switch.sense-qi', undefined);
      default:
        return action.name;
    }
  }

  /** 读取开关卡片当前状态，顺便决定按钮上的开/关文案。 */
  private getSwitchCardState(action: ActionDef): {  
  /**
 * active：启用开关或状态标识。
 */
 active: boolean;  
 /**
 * label：label名称或显示文本。
 */
  label: string } {
    const onLabel = t('common.state.on', undefined);
    const offLabel = t('common.state.off', undefined);
    switch (action.id) {
      case 'toggle:auto_battle':
        return { active: this.autoBattle, label: this.autoBattle ? onLabel : offLabel };
      case 'toggle:auto_retaliate':
        return { active: this.autoRetaliate, label: this.autoRetaliate ? onLabel : offLabel };
      case 'toggle:auto_battle_stationary':
        return { active: this.autoBattleStationary, label: this.autoBattleStationary ? onLabel : offLabel };
      case 'toggle:allow_aoe_player_hit':
        return { active: this.allowAoePlayerHit, label: this.allowAoePlayerHit ? onLabel : offLabel };
      case 'toggle:auto_idle_cultivation':
        return { active: this.autoIdleCultivation, label: this.autoIdleCultivation ? onLabel : offLabel };
      case 'toggle:auto_switch_cultivation':
        return { active: this.autoSwitchCultivation, label: this.autoSwitchCultivation ? onLabel : offLabel };
      case 'cultivation:toggle':
        return { active: this.cultivationActive, label: this.cultivationActive ? onLabel : offLabel };
      case 'sense_qi:toggle': {
        const active = this.previewPlayer?.senseQiActive === true;
        return { active, label: active ? onLabel : offLabel };
      }
      default:
        return { active: false, label: t('common.action.execute', undefined) };
    }
  }

  /** 渲染一条状态开关卡片。 */
  private renderSwitchItem(action: ActionDef): string {
    const state = this.getSwitchCardState(action);
    return `<div class="gm-player-row ${state.active ? 'is-active' : ''}" data-action-card="${action.id}" role="button" tabindex="0">
      <div>
        <div class="gm-player-name">${escapeHtml(this.getSwitchCardTitle(action))}</div>
        <div class="gm-player-meta">${escapeHtml(stripSectManagementData(action.desc))}${this.renderShortcutMeta(action.id)}</div>
      </div>
      <div class="action-card-side">
        <div class="gm-player-stat">${state.label}</div>
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
      </div>
    </div>`;
  }

  /** 根据当前绑键状态返回按钮文案。 */
  private getBindButtonLabel(actionId: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.bindingActionId === actionId) {
      return t('action.shortcut.binding', undefined);
    }
    const binding = this.shortcutBindings.get(actionId);
    return binding ? t('action.shortcut.rebind', { key: binding.toUpperCase() }) : t('action.shortcut.bind', undefined);
  }

  /** 从本地存储读回快捷键绑定。 */
  private loadShortcutBindings(): Map<string, string> {
    try {
      const raw = localStorage.getItem(ACTION_SHORTCUTS_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw) as Record<string, string>;
      const result = new Map<string, string>();
      for (const [actionId, key] of Object.entries(parsed)) {
        const normalized = normalizeShortcutKey(key);
        if (normalized) {
          result.set(actionId, normalized);
        }
      }
      return result;
    } catch {
      return new Map();
    }
  }

  /** 把快捷键绑定写回本地存储。 */
  private saveShortcutBindings(): void {
    const payload = Object.fromEntries(this.shortcutBindings.entries());
    localStorage.setItem(ACTION_SHORTCUTS_KEY, JSON.stringify(payload));
  }

  /** 通知其他面板刷新绑键按钮状态。 */
  private notifyShortcutBindingChanged(): void {
    window.dispatchEvent(new CustomEvent(ACTION_SHORTCUTS_CHANGED_EVENT));
  }

  /** 从本地存储恢复技能方案列表。 */
  private loadSkillPresets(): SkillPresetRecord[] {
    try {
      const raw = localStorage.getItem(ACTION_SKILL_PRESETS_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as unknown;
      return this.parseSkillPresetCollection(parsed, { preserveIds: true });
    } catch {
      return [];
    }
  }

  /** 把当前技能方案列表序列化回本地存储。 */
  private saveSkillPresets(): void {
    localStorage.setItem(ACTION_SKILL_PRESETS_KEY, JSON.stringify(this.buildSkillPresetExportPayload(this.skillPresets)));
  }

  /** 把不同来源的导入数据统一整理成技能方案列表。 */
  private parseSkillPresetCollection(
    payload: unknown,
    options?: {    
    /**
 * preserveIds：preserveID相关字段。
 */
 preserveIds?: boolean;    
 /**
 * existingNames：existing名称相关字段。
 */
 existingNames?: Set<string> },
  ): SkillPresetRecord[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preserveIds = options?.preserveIds === true;
    const existingNames = options?.existingNames ?? new Set<string>();
    const source = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.p)
        ? payload.p
      : isRecord(payload) && Array.isArray(payload.presets)
        ? payload.presets
        : isRecord(payload) && (Array.isArray(payload.skills) || Array.isArray(payload.s))
          ? [payload]
          : [];
    const result: SkillPresetRecord[] = [];
    const usedNames = new Set(existingNames);

    for (const [index, value] of source.entries()) {
      const preset = this.parseSkillPresetRecord(value, index, { preserveIds });
      if (!preset) {
        continue;
      }
      const uniqueName = this.resolveUniqueSkillPresetName(preset.name, usedNames);
      result.push({
        ...preset,
        name: uniqueName,
      });
      usedNames.add(uniqueName);
    }
    return result;
  }

  /** 解析单份技能方案记录，过滤掉空内容和重复技能。 */
  private parseSkillPresetRecord(
    value: unknown,
    index: number,
    options?: {    
    /**
 * preserveIds：preserveID相关字段。
 */
 preserveIds?: boolean },
  ): SkillPresetRecord | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!isRecord(value)) {
      return null;
    }
    const rawSkills = Array.isArray(value.s)
      ? value.s
      : Array.isArray(value.skills)
        ? value.skills
        : Array.isArray(value.entries)
          ? value.entries
          : null;
    if (!rawSkills || rawSkills.length === 0) {
      return null;
    }
    const skills: SkillPresetSkillState[] = [];
    const seen = new Set<string>();
    for (const entry of rawSkills) {
      if (Array.isArray(entry)) {
        const skillId = typeof entry[0] === 'string' ? entry[0].trim() : '';
        const auto = entry[1] === 1;
        if (!skillId || seen.has(skillId)) {
          continue;
        }
        skills.push({
          skillId,
          enabled: auto,
          skillEnabled: true,
        });
        seen.add(skillId);
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
      const skillId = typeof entry.skillId === 'string'
        ? entry.skillId.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
      const skillEnabled = readBoolean(entry.skillEnabled);
      if (!skillId || seen.has(skillId) || skillEnabled === false) {
        continue;
      }
      skills.push({
        skillId,
        enabled: readBoolean(entry.enabled, entry.autoBattleEnabled),
        skillEnabled: true,
      });
      seen.add(skillId);
    }
    if (skills.length === 0) {
      return null;
    }
    const fallbackName = t('action.skill-preset.default-indexed-name', { index: index + 1 });
    const name = this.sanitizeSkillPresetName(
      typeof value.n === 'string'
        ? value.n
        : typeof value.name === 'string'
          ? value.name
          : typeof value.title === 'string'
            ? value.title
            : fallbackName,
    ) || fallbackName;
    return {
      id: options?.preserveIds === true && typeof value.id === 'string' && value.id
        ? value.id
        : this.generateSkillPresetId(),
      name,
      skills,
    };
  }

  /** 清理技能方案名称里的空白，并裁掉过长内容。 */
  private sanitizeSkillPresetName(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
  }

  /** 在本地方案列表里找到一个不重复的名称。 */
  private resolveUniqueSkillPresetName(name: string, usedNames: Set<string>): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const base = this.sanitizeSkillPresetName(name) || t('action.skill-preset.default-base-name', undefined);
    if (!usedNames.has(base)) {
      return base;
    }
    let suffix = 2;
    while (usedNames.has(`${base} (${suffix})`)) {
      suffix += 1;
    }
    return `${base} (${suffix})`;
  }

  /** 生成一个本地唯一的技能方案 ID。 */
  private generateSkillPresetId(): string {
    return `skill-preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** 读取当前动作对应的可保存技能快照。 */
  private getCurrentSkillPresetSnapshot(): SkillPresetSkillState[] {
    return this.getAutoBattleSkillConfigs(this.currentActions)
      .filter((entry) => entry.skillEnabled !== false)
      .map((entry) => ({
        skillId: entry.skillId,
        enabled: entry.enabled !== false,
        skillEnabled: true,
      }));
  }

  /** 把技能方案整理成结构化导出数据。 */
  private buildSkillPresetExportPayload(presets: SkillPresetRecord[]): SkillPresetLibrary {
    return {
      v: SKILL_PRESET_EXPORT_VERSION,
      p: presets.map((preset) => ({
        n: preset.name,
        s: preset.skills
          .filter((skill) => skill.skillEnabled !== false)
          .map((skill) => [skill.skillId, skill.enabled !== false ? 1 : 0] as [string, 0 | 1]),
      })),
    };
  }

  /** 把技能方案拼成可复制、可文件导出的键值文本。 */
  private buildSkillPresetExportText(presets: SkillPresetRecord[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const lines = [`v=${SKILL_PRESET_EXPORT_VERSION + 1}`];
    for (const preset of presets) {
      lines.push(`p=${encodeURIComponent(preset.name)}`);
      for (const skill of preset.skills) {
        if (skill.skillEnabled === false) {
          continue;
        }
        lines.push(`s=${encodeURIComponent(skill.skillId)},${skill.enabled !== false ? '1' : '0'}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  /** 解析技能方案文本，兼容当前键值格式和旧 JSON 格式。 */
  private parseSkillPresetText(
    text: string,
    options?: {    
    /**
 * preserveIds：preserveID相关字段。
 */
 preserveIds?: boolean;    
 /**
 * existingNames：existing名称相关字段。
 */
 existingNames?: Set<string> },
  ): SkillPresetRecord[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parsedPresets: Array<{    
    /**
 * n：n相关字段。
 */
 n: string;    
 /**
 * s：s相关字段。
 */
 s: Array<[string, 0 | 1]> }> = [];
    let current: {    
    /**
 * n：n相关字段。
 */
 n: string;    
 /**
 * s：s相关字段。
 */
 s: Array<[string, 0 | 1]> } | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key === 'v') {
        continue;
      }
      if (key === 'p') {
        if (current && current.s.length > 0) {
          parsedPresets.push(current);
        }
        current = {
          n: decodePresetTextValue(value),
          s: [],
        };
        continue;
      }
      if (key === 's' && current) {
        const commaIndex = value.lastIndexOf(',');
        if (commaIndex <= 0) {
          continue;
        }
        const skillId = decodePresetTextValue(value.slice(0, commaIndex).trim());
        const autoFlag = value.slice(commaIndex + 1).trim() === '1' ? 1 : 0;
        if (!skillId) {
          continue;
        }
        current.s.push([skillId, autoFlag]);
      }
    }
    if (current && current.s.length > 0) {
      parsedPresets.push(current);
    }
    if (parsedPresets.length === 0) {
      return [];
    }
    return this.parseSkillPresetCollection({ p: parsedPresets }, options);
  }

  /** 触发技能方案文本下载。 */
  private downloadSkillPresetPayload(fileName: string, text: string): void {
    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** 用当前日期时间生成一个默认方案名。 */
  private buildDefaultSkillPresetName(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return t('action.skill-preset.default-datetime-name', { month, day, hour, minute });
  }

  /** 生成技能方案弹层的外部变更摘要。 */
  private buildSkillPresetExternalRevision(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parts: string[] = [String(this.getSkillSlotLimit())];
    for (const action of this.getSkillActions(this.currentActions)) {
      parts.push(action.id);
      parts.push(action.autoBattleEnabled !== false ? '1' : '0');
      parts.push(action.skillEnabled !== false ? '1' : '0');
    }
    return parts.join('\u0001');
  }

  /** 给动作列表补上客户端工具动作和兜底技能。 */
  private withUtilityActions(actions: ActionDef[]): ActionDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const result = [...actions];
    const knownSkillActions = this.previewPlayer ? this.buildTechniqueFallbackActions(this.previewPlayer, result) : [];
    for (const action of knownSkillActions) {
      if (!result.some((entry) => entry.id === action.id)) {
        result.push(action);
      }
    }
    if (!result.some((action) => action.id === 'loot:open')) {
      result.push({
        id: 'loot:open',
        name: t('action.utility.loot.name', undefined),
        type: 'toggle',
        desc: t('action.utility.loot.desc', undefined),
        cooldownLeft: 0,
        requiresTarget: true,
        targetMode: 'tile',
        range: 1,
      });
    }
    if (!result.some((action) => action.id === 'client:observe')) {
      result.push({
        id: 'client:observe',
        name: t('action.utility.observe.name', undefined),
        type: 'toggle',
        desc: t('action.utility.observe.desc', undefined),
        cooldownLeft: 0,
        requiresTarget: true,
        targetMode: 'tile',
      });
    }
    return result;
  }

  /** 从角色已学功法里补出当前列表缺失的技能动作。 */
  private buildTechniqueFallbackActions(player: PlayerState, currentActions: ActionDef[]): ActionDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentSkillActions = currentActions.filter((action) => action.type === 'skill');
    const existingSkillIds = new Set(currentSkillActions.map((action) => action.id));
    const autoBattleSkillMap = new Map((player.autoBattleSkills ?? []).map((entry, index) => [entry.skillId, { entry, index }] as const));
    const playerRealmStage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const fallback: ActionDef[] = [];
    for (const technique of getSkillEnabledTechniques(player)) {
      for (const skill of technique.skills ?? []) {
        const unlockPlayerRealm = skill.unlockPlayerRealm ?? DEFAULT_PLAYER_REALM_STAGE;
        if (technique.level < resolveSkillUnlockLevel(skill) || playerRealmStage < unlockPlayerRealm) {
          continue;
        }
        if (existingSkillIds.has(skill.id)) {
          continue;
        }
        const config = autoBattleSkillMap.get(skill.id);
        fallback.push({
          id: skill.id,
          name: skill.name,
          type: 'skill',
          desc: skill.desc,
          cooldownLeft: 0,
          range: skill.targeting?.range ?? skill.range,
          requiresTarget: skill.requiresTarget ?? true,
          targetMode: skill.targetMode ?? 'any',
          autoBattleEnabled: config?.entry.enabled ?? true,
          autoBattleOrder: config?.index,
          skillEnabled: config?.entry.skillEnabled ?? true,
        });
      }
    }
    fallback.sort((left, right) => {
      const leftOrder = left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
      return (leftOrder - rightOrder) || left.id.localeCompare(right.id, 'zh-Hans-CN');
    });
    const combined = [...currentSkillActions, ...fallback]
      .sort((left, right) => {
        const leftOrder = left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
        return (leftOrder - rightOrder) || left.id.localeCompare(right.id, 'zh-Hans-CN');
      });
    const normalized = this.normalizeSkillActions(combined);
    const fallbackMap = new Map(normalized.map((action) => [action.id, action] as const));
    return fallback.map((action) => fallbackMap.get(action.id) ?? action);
  }

  /** 渲染单条动作或技能卡片。 */
  private renderActionItem(
    action: ActionDef,
    options?: {    
    /**
 * showDragHandle：showDragHandle相关字段。
 */

      showDragHandle?: boolean;      
      /**
 * autoBattleDisplayOrder：autoBattle显示订单相关字段。
 */

      autoBattleDisplayOrder?: number | null;
    },
  ): string {
    const onCd = action.cooldownLeft > 0;
    const isAutoBattleSkill = action.type === 'skill';
    const skillContext = this.skillLookup.get(action.id);
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
    const autoBattleEnabled = action.autoBattleEnabled !== false;
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
    const rowAttrs = isAutoBattleSkill && options?.showDragHandle
      ? ` data-auto-battle-skill-row="${action.id}"`
      : '';
    const autoBattleMeta = isAutoBattleSkill
      ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
         ${autoBattleOrder ? `<span class="action-type">${t('action.skill.order', { order: autoBattleOrder })}</span>` : ''}`
      : '';
    const autoBattleControls = isAutoBattleSkill
      ? `<button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-auto-battle-toggle="${action.id}" type="button">${autoBattleEnabled ? t('action.skill.auto-toggle.on', undefined) : t('action.skill.auto-toggle.off', undefined)}</button>
         ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-auto-battle-drag="${action.id}" draggable="true" type="button">${t('common.action.drag', undefined)}</button>` : ''}`
      : '';
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';
    const executeLabel = action.id === 'sect:manage'
      ? t('common.action.open', undefined)
      : action.id === 'wang_qi:toggle'
        ? (this.previewPlayer?.wangQiActive === true ? t('common.action.close', undefined) : t('common.action.enable', undefined))
        : t('common.action.execute', undefined);

    return `<div class="action-item ${onCd ? 'cooldown' : ''} ${isAutoBattleSkill ? 'action-item-draggable' : ''}" data-action-row="${action.id}" data-action-card="${action.id}" role="button" tabindex="0"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">[${getActionTypeLabel(action.type)}]</span>
          ${typeof action.range === 'number' ? `<span class="action-type">${t('action.range', { range: action.range })}</span>` : ''}
          ${isAutoBattleSkill
            ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}" data-action-auto-state="${action.id}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
               <span class="action-type" data-action-auto-order="${action.id}"${autoBattleOrder ? '' : ' hidden'}>${autoBattleOrder ? t('action.skill.order', { order: autoBattleOrder }) : ''}</span>`
            : autoBattleMeta}
          ${this.renderShortcutBadge(action.id)}
        </div>
        <div class="action-desc">${escapeHtml(stripSectManagementData(action.desc))}</div>
        ${affinityChip}
      </div>
      <div class="action-cta ui-action-row ui-action-row--end">
        ${autoBattleControls}
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
        <span class="action-cd" data-action-cd="${action.id}"${onCd ? '' : ' hidden'}>${onCd ? t('action.cooldown', { ticks: action.cooldownLeft }) : ''}</span>
        <button class="small-btn" data-action="${action.id}" data-action-exec="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}"${onCd ? ' hidden' : ''}>${executeLabel}</button>
      </div>
    </div>`;
  }

  /** 把技能的元素倾向渲染成一枚徽章。 */
  private renderActionSkillAffinityChip(skill: SkillDef): string {
    const badge = getSkillAffinityBadge(skill);
    const elementClass = badge.element === 'neutral' ? '' : ` item-card-chip--element-${badge.element}`;
    const title = escapeHtml(badge.title);
    return `<span class="item-card-chip item-card-chip--affinity item-card-chip--${badge.tone}${elementClass} action-skill-affinity-chip" title="${title}" aria-label="${title}">${escapeHtml(badge.label)}</span>`;
  }

  /** 切换某个自动战斗技能的启用状态。 */
  private toggleAutoBattleSkill(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

  /** 切换某个技能在列表里的可用状态。 */
  private toggleSkillEnabled(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

  /** 切换技能管理弹层里的自动战斗开关。 */
  private toggleSkillManagementAutoBattleSkill(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

  /** 切换技能管理弹层里的技能启用开关。 */
  private toggleSkillManagementSkillEnabled(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

  /** 在自动战斗列表里调整技能顺位。 */
  private moveAutoBattleSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (actionId === targetId) return;
    this.applyAutoBattleSkillMutation((skills) => {
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
      const baseIndex = next.findIndex((action) => action.id === targetId);
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  /** 在技能管理草稿里调整技能顺位。 */
  private moveSkillManagementSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (actionId === targetId) return;
    this.applySkillManagementDraftMutation((skills) => {
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
      const baseIndex = next.findIndex((action) => action.id === targetId);
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  /** 把自动战斗技能改动写回 currentActions 和预览角色。 */
  private applyAutoBattleSkillMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const skillActions = this.currentActions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        ...action,
        autoBattleEnabled: action.autoBattleEnabled !== false,
      }));
    const mutated = this.normalizeSkillActions(mutator(skillActions));
    this.currentActions = this.replaceSkillActions(mutated);
    if (this.previewPlayer) {
      this.previewPlayer.actions = this.currentActions.filter((action) => action.id !== 'client:observe');
      this.previewPlayer.autoBattleSkills = this.getAutoBattleSkillConfigs(this.currentActions);
    }
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.onUpdateAutoBattleSkills?.(this.getAutoBattleSkillConfigs(this.currentActions));
  }

  /** 把技能管理草稿的改动写回预览态并刷新弹层。 */
  private applySkillManagementDraftMutation(
    mutator: (skills: ActionDef[]) => ActionDef[],
    rerender = true,
  ): void {
    this.resetSkillManagementCloseConfirm();
    const orderedIds = this.skillManagementSortField === 'custom'
      ? []
      : this.getSortedSkillManagementActionIds();
    const skillActions = this.getSkillActions(this.getSkillManagementPreviewActions())
      .map((action) => ({
        ...action,
        autoBattleEnabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
    const orderedSkillActions = orderedIds.length > 1
      ? this.reorderSkillManagementSubset(skillActions, orderedIds)
      : skillActions;
    const mutated = this.normalizeSkillActions(mutator(orderedSkillActions));
    this.skillManagementDraft = this.normalizeSkillConfigs(this.getAutoBattleSkillConfigs(mutated));
    if (rerender) {
      this._renderSkillManagementModal();
    }
  }

  /** 按当前顺序重新编号自动战斗顺位。 */
  private withSequentialAutoBattleOrder(actions: ActionDef[]): ActionDef[] {
    return actions.map((action, index) => ({
      ...action,
      autoBattleEnabled: action.autoBattleEnabled !== false,
      skillEnabled: action.skillEnabled !== false,
      autoBattleOrder: index,
    }));
  }

  /** 用新的技能数组替换 currentActions 里对应的位置。 */
  private replaceSkillActions(skillActions: ActionDef[]): ActionDef[] {
    let skillIndex = 0;
    return this.currentActions.map((action) => {
      if (action.type !== 'skill') {
        return action;
      }
      return skillActions[skillIndex++] ?? action;
    });
  }

  /** 把动作快照压成自动战斗技能配置。 */
  private getAutoBattleSkillConfigs(actions: ActionDef[]): AutoBattleSkillConfig[] {
    return actions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
  }

  /** 同步拖拽高亮状态，让当前悬停行显出插入位置。 */
  private updateDragIndicators(): void {
    document.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row], [data-skill-manage-skill-row]').forEach((row) => {
      const actionId = row.dataset.autoBattleSkillRow ?? row.dataset.skillManageSkillRow;
      const isDragging = actionId === this.draggingSkillId;
      const isBefore = actionId === this.dragOverSkillId && this.dragOverPosition === 'before';
      const isAfter = actionId === this.dragOverSkillId && this.dragOverPosition === 'after';
      row.classList.toggle('dragging', isDragging);
      row.classList.toggle('drag-over-before', isBefore);
      row.classList.toggle('drag-over-after', isAfter);
    });
  }

  /** 清掉拖拽过程中的临时状态。 */
  private clearDragState(): void {
    this.draggingSkillId = null;
    this.dragOverSkillId = null;
    this.dragOverPosition = null;
    this.updateDragIndicators();
  }

  /** 开关卡片目前仍跟随整块重渲染，不单独 patch。 */
  private patchToggleCards(): boolean {
    return true;
  }

  /** 只更新动作行里会变的部分，保住冷却、顺位和按钮状态。 */
  private patchActionRows(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(this.currentActions);
    for (const action of this.currentActions) {
      if (
        this.isSwitchAction(action)
        || action.id === 'client:observe'
        || action.type === 'breakthrough'
      ) {
        continue;
      }
      const refs = this.actionRowRefs.get(action.id);
      const row = refs?.row;
      if (!row) {
        if (action.type === 'skill') {
          continue;
        }
        return false;
      }
      const onCd = action.cooldownLeft > 0;
      row.classList.toggle('cooldown', onCd);

      const cdNode = refs.cdNode;
      const execNode = refs.execNode;
      if (!cdNode || !execNode) {
        return false;
      }
      cdNode.textContent = onCd ? t('action.cooldown.left', { ticks: action.cooldownLeft }) : '';
      cdNode.hidden = !onCd;
      execNode.hidden = onCd;
      execNode.disabled = onCd;

      if (action.type === 'skill') {
        const stateNode = refs.stateNode;
        const orderNode = refs.orderNode;
        const toggleNode = refs.toggleNode;
        if (!stateNode || !orderNode || !toggleNode) {
          return false;
        }
        const enabled = action.autoBattleEnabled !== false;
        const showOrder = this.activeSkillTab === 'auto' && enabled;
        const order = showOrder ? (autoBattleDisplayOrders.get(action.id) ?? null) : null;
        stateNode.textContent = enabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined);
        stateNode.classList.toggle('auto-battle-enabled', enabled);
        stateNode.classList.toggle('auto-battle-disabled', !enabled);
        orderNode.hidden = order === null;
        orderNode.textContent = order === null ? '' : t('action.skill.order', { order: order + 1 });
        toggleNode.classList.toggle('active', enabled);
        toggleNode.textContent = enabled ? t('action.skill.auto-toggle.on', undefined) : t('action.skill.auto-toggle.off', undefined);
      }
    }

    return true;
  }

  /** 渲染技能区主体，并按自动/手动给出不同说明。 */
  private renderSkillSection(actions: ActionDef[], autoBattleDisplayOrders: Map<string, number>): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const enabledSkills = actions.filter((action) => action.skillEnabled !== false);
    const autoSkills = enabledSkills.filter((action) => action.autoBattleEnabled !== false);
    const manualSkills = enabledSkills.filter((action) => action.autoBattleEnabled === false);
    const visibleSkills = this.activeSkillTab === 'auto' ? autoSkills : manualSkills;
    const slotSummary = this.getSkillSlotSummary(actions);
    const hint = this.activeSkillTab === 'auto'
      ? t('action.skill.hint.auto', { slotSummary })
      : t('action.skill.hint.manual', { slotSummary });

    let html = `<div class="panel-section action-skill-section">
      <div class="panel-section-head">
        <div class="panel-section-title">${t('action.skill.section-title', { slotSummary })}</div>
        <div class="action-section-actions">
          <button class="small-btn ghost" data-action-skill-manage-open type="button">${t('action.skill.manage', undefined)}</button>
          <button class="small-btn ghost" data-action-combat-settings-open type="button">${t('action.combat-settings.title', undefined)}</button>
          <button class="small-btn ghost" data-action-skill-preset-open type="button">${t('action.skill-preset.title', undefined)}</button>
          <button class="small-btn ghost" data-action-targeting-plan-open type="button">${t('action.targeting-plan.title-with-mode', { mode: escapeHtml(this.getAutoBattleTargetingModeLabel()) })}</button>
        </div>
      </div>
      <div class="action-skill-subtabs">
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'auto' ? 'active' : ''}" data-action-skill-tab="auto" type="button">
          ${t('action.skill.tab.auto', undefined)}
          <span class="action-skill-subtab-count">${autoSkills.length}</span>
        </button>
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'manual' ? 'active' : ''}" data-action-skill-tab="manual" type="button">
          ${t('action.skill.tab.manual', undefined)}
          <span class="action-skill-subtab-count">${manualSkills.length}</span>
        </button>
      </div>
      <div class="action-section-hint">${hint}</div>`;

    if (visibleSkills.length === 0) {
      html += `<div class="empty-hint">${this.activeSkillTab === 'auto' ? t('action.skill.empty.auto', undefined) : t('action.skill.empty.manual', undefined)}</div>`;
    } else {
      html += '<div class="action-skill-list">';
      for (const action of visibleSkills) {
        html += this.renderActionItem(action, {
          showDragHandle: this.activeSkillTab === 'auto',
          autoBattleDisplayOrder: this.activeSkillTab === 'auto'
            ? (autoBattleDisplayOrders.get(action.id) ?? null)
            : null,
        });
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /** 为可自动施放的技能生成展示顺位。 */
  private buildAutoBattleDisplayOrderMap(actions: ActionDef[]): Map<string, number> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const displayOrder = new Map<string, number>();
    let nextOrder = 0;
    for (const action of actions) {
      if (action.type !== 'skill' || action.skillEnabled === false || action.autoBattleEnabled === false) {
        continue;
      }
      displayOrder.set(action.id, nextOrder);
      nextOrder += 1;
    }
    return displayOrder;
  }

  /** 点击卡片本体时直接触发动作。 */
  private bindActionCardEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-action-card]').forEach((card) => {
      card.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea')) {
          return;
        }
        const actionId = card.dataset.actionCard;
        if (!actionId) return;
        if (actionId === 'sect:manage') {
          this.openSectManagementModal();
          return;
        }
        const action = this.currentActions.find((entry) => entry.id === actionId);
        if (action && action.cooldownLeft > 0) {
          return;
        }
        this.onAction?.(actionId, action?.requiresTarget, action?.targetMode, action?.range, action?.name ?? actionId);
      }, { signal });
    });
  }

  /** 绑定执行按钮，读取 data-* 参数后交给外部回调。 */
  private bindActionExecEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.action!;
        if (actionId === 'sect:manage') {
          this.openSectManagementModal();
          return;
        }
        const actionName = button.dataset.actionName || actionId;
        const requiresTarget = button.dataset.actionTarget === '1';
        const targetMode = button.dataset.actionTargetMode || undefined;
        const rangeText = button.dataset.actionRange;
        const range = rangeText ? Number(rangeText) : undefined;
        this.onAction?.(actionId, requiresTarget, targetMode, Number.isFinite(range) ? range : undefined, actionName);
      }, { signal });
    });
  }

  /** 进入或退出动作绑键模式。 */
  private bindBindActionEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.bindAction;
        if (!actionId) return;
        this.toggleShortcutBinding(actionId);
      }, { signal });
    });
  }

  /** 绑定自动战斗开关按钮。 */
  private bindAutoBattleToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.autoBattleToggle;
        if (!actionId) return;
        this.toggleAutoBattleSkill(actionId);
      }, { signal });
    });
  }

  /** 绑定技能启用开关按钮。 */
  private bindSkillEnabledToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillEnabledToggle;
        if (!actionId) return;
        this.toggleSkillEnabled(actionId);
      });
    });
  }

  /** 绑定自动战斗列表的拖拽排序交互。 */
  private bindAutoBattleDragEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        const actionId = handle.dataset.autoBattleDrag;
        if (!actionId || !(event.dataTransfer instanceof DataTransfer)) return;
        this.draggingSkillId = actionId;
        this.dragOverSkillId = null;
        this.dragOverPosition = null;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', actionId);
        this.updateDragIndicators();
      }, { signal });
      handle.addEventListener('dragend', () => {
        this.clearDragState();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row]').forEach((row) => {
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        const actionId = row.dataset.autoBattleSkillRow;
        if (!actionId || !this.draggingSkillId || actionId === this.draggingSkillId) return;
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        this.dragOverSkillId = actionId;
        this.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.updateDragIndicators();
      }, { signal });
      row.addEventListener('dragleave', (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && row.contains(related)) {
          return;
        }
        if (this.dragOverSkillId === row.dataset.autoBattleSkillRow) {
          this.dragOverSkillId = null;
          this.dragOverPosition = null;
          this.updateDragIndicators();
        }
      }, { signal });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.autoBattleSkillRow;
        if (!this.draggingSkillId || !targetId || !this.dragOverPosition) {
          this.clearDragState();
          return;
        }
        this.moveAutoBattleSkill(this.draggingSkillId, targetId, this.dragOverPosition);
        this.clearDragState();
      }, { signal });
    });
  }

  /** 绑定技能管理弹层里的自动开关。 */
  private bindSkillManagementAutoToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-auto-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageAutoToggle;
        if (!actionId) return;
        this.toggleSkillManagementAutoBattleSkill(actionId);
      }, { signal });
    });
  }

  /** 绑定技能管理弹层里的启用开关。 */
  private bindSkillManagementEnabledToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageEnabledToggle;
        if (!actionId) return;
        this.toggleSkillManagementSkillEnabled(actionId);
      }, { signal });
    });
  }

  /** 绑定技能管理弹层的拖拽排序交互。 */
  private bindSkillManagementDragEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        const actionId = handle.dataset.skillManageDrag;
        if (!actionId || !(event.dataTransfer instanceof DataTransfer)) return;
        this.draggingSkillId = actionId;
        this.dragOverSkillId = null;
        this.dragOverPosition = null;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', actionId);
        this.updateDragIndicators();
      }, { signal });
      handle.addEventListener('dragend', () => {
        this.clearDragState();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-skill-row]').forEach((row) => {
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        const actionId = row.dataset.skillManageSkillRow;
        if (!actionId || !this.draggingSkillId || actionId === this.draggingSkillId) return;
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        this.dragOverSkillId = actionId;
        this.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.updateDragIndicators();
      }, { signal });
      row.addEventListener('dragleave', (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && row.contains(related)) {
          return;
        }
        if (this.dragOverSkillId === row.dataset.skillManageSkillRow) {
          this.dragOverSkillId = null;
          this.dragOverPosition = null;
          this.updateDragIndicators();
        }
      }, { signal });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.skillManageSkillRow;
        if (!this.draggingSkillId || !targetId || !this.dragOverPosition) {
          this.clearDragState();
          return;
        }
        this.moveSkillManagementSkill(this.draggingSkillId, targetId, this.dragOverPosition);
        this.clearDragState();
      }, { signal });
    });
  }

  /** 从动作列表里筛出技能动作。 */
  private getSkillActions(actions: ActionDef[] = this.currentActions): ActionDef[] {
    return actions.filter((action) => action.type === 'skill');
  }

  /** 读取当前角色可启用的技能槽位上限。 */
  private getSkillSlotLimit(): number {
    return resolvePlayerSkillSlotLimitLocal(this.previewPlayer);
  }

  /** 统计当前已启用的技能数量。 */
  private getEnabledSkillCount(actions: ActionDef[] = this.currentActions): number {
    return countEnabledSkillEntriesLocal(this.getSkillActions(actions));
  }

  /** 汇总当前技能槽启用情况，供方案弹层摘要复用。 */
  private getSkillSlotSummary(actions: ActionDef[] = this.currentActions): string {
    return `${this.getEnabledSkillCount(actions)}/${this.getSkillSlotLimit()} 项`;
  }

  /** 按槽位上限规整自动战斗技能配置。 */
  private normalizeSkillConfigs(configs: AutoBattleSkillConfig[]): AutoBattleSkillConfig[] {
    return enforceSkillEnabledLimitLocal(configs.map((entry) => ({
      skillId: entry.skillId,
      enabled: entry.enabled !== false,
      skillEnabled: entry.skillEnabled !== false,
    })), this.getSkillSlotLimit());
  }

  /** 按槽位上限规整技能动作。 */
  private normalizeSkillActions(actions: ActionDef[]): ActionDef[] {
    return enforceSkillEnabledLimitLocal(this.withSequentialAutoBattleOrder(actions), this.getSkillSlotLimit());
  }

  /** 把自动战斗技能配置规整成稳定顺序，便于比较草稿差异。 */
  private normalizeAutoBattleSkillConfigsLocal(
    configs: AutoBattleSkillConfig[] | null | undefined,
  ): AutoBattleSkillConfig[] {
    const source = Array.isArray(configs) ? configs : [];
    const normalized: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();
    for (const entry of source) {
      const skillId = typeof entry?.skillId === 'string' ? entry.skillId.trim() : '';
      if (!skillId || seen.has(skillId)) {
        continue;
      }
      normalized.push({
        skillId,
        enabled: entry.enabled !== false,
        skillEnabled: entry.skillEnabled !== false,
      });
      seen.add(skillId);
    }
    return normalized;
  }

  /** 比较两份自动战斗技能配置是否完全一致。 */
  private areAutoBattleSkillConfigsEqual(
    left: AutoBattleSkillConfig[] | null | undefined,
    right: AutoBattleSkillConfig[] | null | undefined,
  ): boolean {
    const normalizedLeft = this.normalizeAutoBattleSkillConfigsLocal(left);
    const normalizedRight = this.normalizeAutoBattleSkillConfigsLocal(right);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every((entry, index) => {
      const target = normalizedRight[index];
      return target?.skillId === entry.skillId
        && target.enabled === entry.enabled
        && target.skillEnabled === entry.skillEnabled;
    });
  }

  /** 判断技能管理当前是否存在未应用的改动。 */
  private hasPendingSkillManagementChanges(): boolean {
    return !this.areAutoBattleSkillConfigsEqual(
      this.skillManagementDraft,
      this.getAutoBattleSkillConfigs(this.currentActions),
    );
  }

  /** 关闭技能管理前确认是否放弃本地草稿。 */
  private confirmDiscardSkillManagementChanges(): boolean {
    if (!this.hasPendingSkillManagementChanges()) {
      return true;
    }
    return window.confirm(t('action.skill.manage.confirm-discard', undefined));
  }

  /** 请求关闭技能管理弹层。 */
  private requestSkillManagementClose(): void {
    if (!this.confirmDiscardSkillManagementChanges()) {
      return;
    }
    this.discardSkillManagementDraft();
    detailModalHost.close(this.SKILL_MANAGEMENT_MODAL_OWNER);
  }

  /** 清理技能管理里的临时关闭确认提示。 */
  private resetSkillManagementCloseConfirm(): void {
    if (this.skillManagementStatus?.tone === 'info') {
      this.skillManagementStatus = null;
    }
  }

  /** 渲染技能管理当前的状态提示。 */
  private renderSkillManagementStatus(): string {
    if (!this.skillManagementStatus) {
      return '';
    }
    return `<div class="skill-preset-status ui-status-text ${this.skillManagementStatus.tone === 'error' ? 'error' : this.skillManagementStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.skillManagementStatus.text)}</div>`;
  }

  /** 汇总技能管理当前的过滤和排序范围。 */
  private getSkillManagementScopeSummary(
    filteredEntries: SkillManagementEntry[],
    visibleEntries: SkillManagementEntry[],
  ): { filter: string; sort: string } {
    const totalSkills = this.getSkillActions(this.getSkillManagementPreviewActions()).length;
    const filter = this.skillManagementFilterToggles.size > 0
      ? t('action.skill.manage.scope.filtered', { filteredCount: filteredEntries.length, totalCount: totalSkills })
      : t('action.skill.manage.scope.all', { count: filteredEntries.length });
    const sortFieldLabel = ({
      custom: t('action.skill.manage.sort.field.custom', undefined),
      actualDamage: t('action.skill.manage.sort.field.actual-damage', undefined),
      qiCost: t('action.skill.manage.sort.field.qi-cost', undefined),
      range: t('action.skill.manage.sort.field.range', undefined),
      targetCount: t('action.skill.manage.sort.field.target-count', undefined),
      cooldown: t('action.skill.manage.sort.field.cooldown', undefined),
    } satisfies Record<SkillManagementSortField, string>)[this.skillManagementSortField];
    const sort = this.skillManagementSortField === 'custom'
      ? t('action.skill.manage.scope.sort', { sortField: sortFieldLabel })
      : t('action.skill.manage.scope.sort-detailed', {
        sortField: sortFieldLabel,
        sortDirection: this.skillManagementSortDirection === 'asc' ? t('action.skill.manage.sort.direction.asc', undefined) : t('action.skill.manage.sort.direction.desc', undefined),
        visibleCount: visibleEntries.length,
      });
    return { filter, sort };
  }

  /** 生成技能管理空态文案。 */
  private getSkillManagementEmptyStateText(): string {
    const base = this.skillManagementTab === 'auto'
      ? t('action.skill.manage.empty.auto', undefined)
      : this.skillManagementTab === 'manual'
        ? t('action.skill.manage.empty.manual', undefined)
        : t('action.skill.manage.empty.disabled', undefined);
    if (this.skillManagementFilterToggles.size === 0) {
      return base;
    }
    return t('action.skill.manage.empty.with-filter', { base });
  }

  /** 打开技能管理弹层，并以当前自动/手动页签作为初始视图。 */
  private openSkillManagement(): void {
    this.skillMgmt.openSkillManagement();
  }

  /** 打开战斗设置弹层。 */
  private openCombatSettingsModal(): void {
    this.combatSettings.openCombatSettingsModal();
  }

  private openTargetingPlanModal(): void {
    this.combatSettings.openTargetingPlanModal();
  }

  /** 复制自动吃药配置。 */
  private cloneAutoUsePillConfigs(configs: AutoUsePillConfig[]): AutoUsePillConfig[] {
    return configs.map((entry) => ({
      itemId: entry.itemId,
      conditions: entry.conditions.map((condition) => ({ ...condition })),
    }));
  }

  /** 本地规整自动吃药配置。 */
  private normalizeAutoUsePillsLocal(configs: AutoUsePillConfig[] | null | undefined): AutoUsePillConfig[] {
    const entries = Array.isArray(configs) ? configs : [];
    const seen = new Set<string>();
    const normalized: AutoUsePillConfig[] = [];
    for (const entry of entries) {
      const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
      if (!itemId || seen.has(itemId)) {
        continue;
      }
      seen.add(itemId);
      normalized.push({
        itemId,
        conditions: Array.isArray(entry.conditions)
          ? entry.conditions
            .filter((condition) => condition?.type === 'resource_ratio' || condition?.type === 'buff_missing')
            .slice(0, 4)
            .map((condition) => ({ ...condition }))
          : [],
      });
      if (normalized.length >= this.AUTO_USE_PILL_SLOT_LIMIT) {
        break;
      }
    }
    return normalized;
  }

  /** 读取当前自动吃药设置。 */
  private getAutoUsePills(): AutoUsePillConfig[] {
    return this.normalizeAutoUsePillsLocal(this.previewPlayer?.autoUsePills ?? []);
  }

  /** 读取当前目标选择规则。 */
  private getCombatTargetingRules(): CombatTargetingRules {
    const source = this.previewPlayer?.combatTargetingRules ?? {};
    const defaults = this.buildDefaultCombatTargetingRules(this.allowAoePlayerHit);
    const hostile = this.normalizeCombatTargetingScope(
      source.hostile,
      HOSTILE_TARGETING_KEYS,
      buildLegacyHostileTargetingFallback(source, defaults.hostile ?? []),
    );
    const friendly = this.normalizeCombatTargetingScope(
      source.friendly,
      FRIENDLY_TARGETING_KEYS,
      defaults.friendly ?? [],
    );
    return {
      hostile,
      friendly,
      includeNormalMonsters: hostile.includes('monster'),
      includeEliteMonsters: hostile.includes('monster'),
      includeBosses: hostile.includes('monster'),
      includePlayers: hostile.includes('all_players'),
    };
  }

  /** 复制目标选择规则。 */
  private cloneCombatTargetingRules(rules: CombatTargetingRules): CombatTargetingRules {
    const defaults = this.buildDefaultCombatTargetingRules(rules.includePlayers === true);
    const hostile = this.normalizeCombatTargetingScope(
      rules.hostile,
      HOSTILE_TARGETING_KEYS,
      buildLegacyHostileTargetingFallback(rules, defaults.hostile ?? []),
    );
    const friendly = this.normalizeCombatTargetingScope(
      rules.friendly,
      FRIENDLY_TARGETING_KEYS,
      defaults.friendly ?? [],
    );
    return {
      hostile,
      friendly,
      includeNormalMonsters: hostile.includes('monster'),
      includeEliteMonsters: hostile.includes('monster'),
      includeBosses: hostile.includes('monster'),
      includePlayers: hostile.includes('all_players'),
    };
  }

  /** 构建和 main 对齐的默认目标规则。 */
  private buildDefaultCombatTargetingRules(includeAllPlayersHostile = false): CombatTargetingRules {
    const hostile = [...DEFAULT_HOSTILE_COMBAT_TARGETING_RULES];
    if (includeAllPlayersHostile && !hostile.includes('all_players')) {
      hostile.push('all_players');
    }
    return {
      hostile,
      friendly: [...DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES],
    };
  }

  /** 规整目标规则分组。 */
  private normalizeCombatTargetingScope(
    input: CombatTargetingRuleKey[] | null | undefined,
    allowed: ReadonlySet<CombatTargetingRuleKey>,
    fallback: CombatTargetingRuleKey[],
  ): CombatTargetingRuleKey[] {
    const source = Array.isArray(input) ? input : fallback;
    const normalized: CombatTargetingRuleKey[] = [];
    const seen = new Set<CombatTargetingRuleKey>();
    for (const raw of source) {
      if (!allowed.has(raw) || seen.has(raw)) {
        continue;
      }
      seen.add(raw);
      normalized.push(raw);
    }
    return normalized;
  }

  /** 同步自动吃药草稿。 */
  private syncAutoUsePillDraft(): AutoUsePillConfig[] {
    const nextDraft = this.normalizeAutoUsePillsLocal(this.autoUsePillDraft ?? this.getAutoUsePills());
    this.autoUsePillDraft = nextDraft;
    return nextDraft;
  }

  /** 同步目标选择草稿。 */
  private syncCombatTargetingDraft(): CombatTargetingRules {
    const nextDraft = this.cloneCombatTargetingRules(this.combatTargetingDraft ?? this.getCombatTargetingRules());
    this.combatTargetingDraft = nextDraft;
    return nextDraft;
  }

  /** 比较自动吃药配置是否一致。 */
  private areAutoUsePillConfigsEqual(left: AutoUsePillConfig[] | null | undefined, right: AutoUsePillConfig[] | null | undefined): boolean {
    const normalizedLeft = this.normalizeAutoUsePillsLocal(left);
    const normalizedRight = this.normalizeAutoUsePillsLocal(right);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every((entry, index) => JSON.stringify(entry) === JSON.stringify(normalizedRight[index]));
  }

  /** 比较目标选择规则是否一致。 */
  private areCombatTargetingRulesEqual(left: CombatTargetingRules | null | undefined, right: CombatTargetingRules | null | undefined): boolean {
    const normalizedLeft = this.cloneCombatTargetingRules(left ?? this.getCombatTargetingRules());
    const normalizedRight = this.cloneCombatTargetingRules(right ?? this.getCombatTargetingRules());
    if (normalizedLeft.hostile?.length !== normalizedRight.hostile?.length
      || normalizedLeft.friendly?.length !== normalizedRight.friendly?.length) {
      return false;
    }
    if ((normalizedLeft.hostile ?? []).some((entry, index) => entry !== normalizedRight.hostile?.[index])) {
      return false;
    }
    if ((normalizedLeft.friendly ?? []).some((entry, index) => entry !== normalizedRight.friendly?.[index])) {
      return false;
    }
    return normalizedLeft.includeNormalMonsters === normalizedRight.includeNormalMonsters
      && normalizedLeft.includeEliteMonsters === normalizedRight.includeEliteMonsters
      && normalizedLeft.includeBosses === normalizedRight.includeBosses
      && normalizedLeft.includePlayers === normalizedRight.includePlayers;
  }

  /** 构建战斗设置外部摘要。 */
  private buildCombatSettingsExternalRevision(): string {
    return JSON.stringify({
      pills: this.getAutoUsePills(),
      rules: this.getCombatTargetingRules(),
      allowAoePlayerHit: this.allowAoePlayerHit,
    });
  }

  /** 读取当前索敌方案标签。 */
  private getAutoBattleTargetingMode(): AutoBattleTargetingMode {
    return this.previewPlayer?.autoBattleTargetingMode ?? 'auto';
  }

  /** 读取当前索敌方案标签。 */
  private getAutoBattleTargetingModeLabel(mode = this.getAutoBattleTargetingMode()): string {
    return AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === mode)?.label ?? t('action.targeting-plan.mode.auto.label', undefined);
  }

  /** 获取自动丹药视图条目。 */
  private getAutoUsePillViewEntries(): AutoUsePillViewEntry[] {
    const entries = new Map<string, AutoUsePillViewEntry>();
    const draft = this.syncAutoUsePillDraft();
    for (const item of this.previewPlayer?.inventory.items ?? []) {
      const previewItem = resolvePreviewItem(item);
      if (!isAutoUseConsumableCandidate(previewItem)) {
        continue;
      }
      const config = draft.find((entry) => entry.itemId === item.itemId);
      entries.set(item.itemId, {
        itemId: item.itemId,
        name: previewItem.name,
        desc: previewItem.desc || '',
        count: item.count,
        healAmount: previewItem.healAmount,
        healPercent: previewItem.healPercent,
        qiPercent: previewItem.qiPercent,
        consumeBuffs: previewItem.consumeBuffs?.map((buff) => ({ buffId: buff.buffId, name: buff.name })),
        selected: Boolean(config),
        conditions: config?.conditions ?? [],
      });
    }
    for (const config of draft) {
      if (entries.has(config.itemId)) {
        continue;
      }
      const template = getLocalItemTemplate(config.itemId);
      entries.set(config.itemId, {
        itemId: config.itemId,
        name: template?.name ?? config.itemId,
        desc: template?.desc ?? t('action.combat-settings.pill.missing-inventory-desc', undefined),
        count: 0,
        healAmount: template?.healAmount,
        healPercent: template?.healPercent,
        qiPercent: template?.qiPercent,
        consumeBuffs: template?.consumeBuffs?.map((buff) => ({ buffId: buff.buffId, name: buff.name })),
        selected: true,
        conditions: config.conditions,
      });
    }
    return [...entries.values()].sort((left, right) => {
      if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  }

  /** 构建自动丹药默认触发条件。 */
  private buildDefaultAutoUsePillConditions(entry: AutoUsePillViewEntry): AutoUsePillCondition[] {
    if ((entry.consumeBuffs?.length ?? 0) > 0) {
      return [{ type: 'buff_missing' }];
    }
    if ((entry.qiPercent ?? 0) > 0) {
      return [{ type: 'resource_ratio', resource: 'qi', op: 'lt', thresholdPct: 60 }];
    }
    return [{ type: 'resource_ratio', resource: 'hp', op: 'lt', thresholdPct: 60 }];
  }

  /** 对自动丹药草稿应用局部修改。 */
  private applyAutoUsePillDraftMutation(
    mutator: (draft: AutoUsePillConfig[]) => AutoUsePillConfig[],
  ): void {
    this.resetCombatSettingsCloseConfirm();
    const next = this.normalizeAutoUsePillsLocal(mutator(this.cloneAutoUsePillConfigs(this.syncAutoUsePillDraft())));
    this.autoUsePillDraft = next;
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(this.autoUsePillSelectedIndex, this.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.renderCombatSettingsModal();
  }

  /** 读取当前选中的自动丹药配置。 */
  private getSelectedAutoUsePillConfig(): AutoUsePillConfig | null {
    return this.syncAutoUsePillDraft()[this.autoUsePillSelectedIndex] ?? null;
  }

  /** 打开自动丹药选择小窗。 */
  private openAutoUsePillPicker(slotIndex: number): void {
    this.syncAutoUsePillDraft();
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, this.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.autoUsePillSubview = 'picker';
    this.renderCombatSettingsModal();
  }

  /** 打开自动丹药条件小窗。 */
  private openAutoUsePillConditionSettings(slotIndex = this.autoUsePillSelectedIndex): void {
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, this.AUTO_USE_PILL_SLOT_LIMIT - 1));
    if (!this.getSelectedAutoUsePillConfig()) {
      return;
    }
    this.autoUsePillSubview = 'conditions';
    this.renderCombatSettingsModal();
  }

  /** 关闭自动丹药子视图。 */
  private closeAutoUsePillSubview(): void {
    this.autoUsePillSubview = 'main';
    this.renderCombatSettingsModal();
  }

  /** 获取自动丹药选择器条目。 */
  private getAutoUsePillPickerEntries(): AutoUsePillViewEntry[] {
    const draft = this.syncAutoUsePillDraft();
    const currentItemId = draft[this.autoUsePillSelectedIndex]?.itemId ?? null;
    return this.getAutoUsePillViewEntries().filter((entry) => !entry.selected || entry.itemId === currentItemId);
  }

  /** 构建自动丹药 tooltip 用的物品。 */
  private buildAutoUsePillTooltipItem(itemId: string): ItemStack | null {
    const inventoryItem = this.previewPlayer?.inventory.items.find((item) => item.itemId === itemId);
    if (inventoryItem) {
      return resolvePreviewItem(inventoryItem);
    }
    const template = getLocalItemTemplate(itemId);
    if (!template) {
      return null;
    }
    return {
      ...template,
      count: 1,
      name: template.name ?? itemId,
      desc: template.desc ?? '',
      type: template.type ?? 'consumable',
    } as ItemStack;
  }

  /** 构建槽位 tooltip 内容。 */
  private buildAutoUsePillSlotTooltipPayload(itemId: string): ReturnType<typeof buildItemTooltipPayload> | null {
    const item = this.buildAutoUsePillTooltipItem(itemId);
    if (!item) {
      return null;
    }
    const payload = buildItemTooltipPayload(item, { playerRealmLv: this.previewPlayer?.realm?.realmLv ?? this.previewPlayer?.realmLv });
    const config = this.syncAutoUsePillDraft().find((entry) => entry.itemId === itemId);
    if (config) {
      payload.lines = [
        ...payload.lines,
        `<span class="skill-tooltip-detail">${escapeHtml(t('action.combat-settings.pill.tooltip.condition', {
          summary: this.renderAutoUsePillConditionSummary(config.conditions),
        }))}</span>`,
      ];
    }
    return payload;
  }

  /** 把药品放入当前槽位。 */
  private assignAutoUsePillToSelectedSlot(itemId: string): void {
    const entry = this.getAutoUsePillViewEntries().find((candidate) => candidate.itemId === itemId);
    if (!entry) {
      return;
    }
    const selectedIndex = this.autoUsePillSelectedIndex;
    this.autoUsePillSubview = 'main';
    this.applyAutoUsePillDraftMutation((draft) => {
      const next = [...draft];
      const existingIndex = next.findIndex((candidate) => candidate.itemId === itemId);
      const existingConfig = existingIndex >= 0 ? next[existingIndex] : null;
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      }
      let insertIndex = Math.max(0, Math.min(selectedIndex, next.length));
      if (existingIndex >= 0 && existingIndex < selectedIndex) {
        insertIndex = Math.max(0, insertIndex - 1);
      }
      const replacement: AutoUsePillConfig = existingConfig
        ? this.cloneAutoUsePillConfigs([existingConfig])[0]!
        : {
          itemId,
          conditions: this.buildDefaultAutoUsePillConditions(entry),
        };
      if (insertIndex < next.length) {
        next.splice(insertIndex, 1, replacement);
      } else {
        next.push(replacement);
      }
      return next;
    });
  }

  /** 清空当前槽位。 */
  private clearSelectedAutoUsePillSlot(): void {
    const selectedIndex = this.autoUsePillSelectedIndex;
    this.autoUsePillSubview = 'main';
    this.applyAutoUsePillDraftMutation((draft) => draft.filter((_, index) => index !== selectedIndex));
  }

  /** 更新单个自动丹药条件。 */
  private updateAutoUsePillCondition(
    itemId: string,
    conditionIndex: number,
    updater: (condition: AutoUsePillCondition) => AutoUsePillCondition,
  ): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      return {
        ...entry,
        conditions: entry.conditions.map((condition, index) => (
          index === conditionIndex ? updater(condition) : condition
        )),
      };
    }));
  }

  /** 删除单个自动丹药条件。 */
  private removeAutoUsePillCondition(itemId: string, conditionIndex: number): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      return {
        ...entry,
        conditions: entry.conditions.filter((_, index) => index !== conditionIndex),
      };
    }));
  }

  /** 添加自动丹药条件。 */
  private addAutoUsePillCondition(itemId: string, kind: 'hp' | 'qi' | 'buff_missing'): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      const nextCondition: AutoUsePillCondition = kind === 'buff_missing'
        ? { type: 'buff_missing' }
        : { type: 'resource_ratio', resource: kind, op: 'lt', thresholdPct: 60 };
      return {
        ...entry,
        conditions: [...entry.conditions, nextCondition],
      };
    }));
  }

  /** 渲染单行条件编辑器。 */
  private renderAutoUsePillConditionRow(itemId: string, condition: AutoUsePillCondition, conditionIndex: number): string {
    if (condition.type === 'buff_missing') {
      return `
        <div class="auto-pill-condition-row auto-pill-condition-row--wide">
          <div class="auto-pill-condition-static">${t('action.combat-settings.auto-pills.condition.buff-missing', undefined)}</div>
          <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">${t('action.combat-settings.auto-pills.condition.remove', undefined)}</button>
        </div>
      `;
    }
    return `
      <div class="auto-pill-condition-row">
        <select data-auto-pill-condition-resource="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="hp" ${condition.resource === 'hp' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.resource.hp', undefined)}</option>
          <option value="qi" ${condition.resource === 'qi' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.resource.qi', undefined)}</option>
        </select>
        <select data-auto-pill-condition-op="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="lt" ${condition.op === 'lt' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.op.lt', undefined)}</option>
          <option value="gt" ${condition.op === 'gt' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.op.gt', undefined)}</option>
        </select>
        <input type="number" min="0" max="100" step="1" value="${condition.thresholdPct}" data-auto-pill-condition-threshold="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" />
        <span class="auto-pill-condition-unit">%</span>
        <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">${t('action.combat-settings.auto-pills.condition.remove', undefined)}</button>
      </div>
    `;
  }

  /** 渲染目标选择区。 */
  private renderCombatTargetingSection(): string {
    const draft = this.syncCombatTargetingDraft();
    const hostileOptions: CombatTargetingCardOption[] = [
      { key: 'monster', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.monster.label', undefined), summary: t('action.combat-settings.targeting.hostile.monster.summary', undefined), active: draft.hostile?.includes('monster') === true },
      { key: 'demonized_players', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.demonized-players.label', undefined), summary: t('action.combat-settings.targeting.hostile.demonized-players.summary', undefined), active: draft.hostile?.includes('demonized_players') === true },
      { key: 'retaliators', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.retaliators.label', undefined), summary: t('action.combat-settings.targeting.hostile.retaliators.summary', undefined), active: draft.hostile?.includes('retaliators') === true },
      { key: 'party', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.party.label', undefined), summary: t('action.combat-settings.targeting.hostile.party.summary', undefined), disabled: true },
      { key: 'sect', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.sect.label', undefined), summary: t('action.combat-settings.targeting.hostile.sect.summary', undefined), disabled: true },
      { key: 'terrain', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.terrain.label', undefined), summary: t('action.combat-settings.targeting.hostile.terrain.summary', undefined), active: draft.hostile?.includes('terrain') === true },
    ];
    const friendlyOptions: CombatTargetingCardOption[] = [
      { key: 'non_hostile_players', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.non-hostile-players.label', undefined), summary: t('action.combat-settings.targeting.friendly.non-hostile-players.summary', undefined), active: draft.friendly?.includes('non_hostile_players') === true },
      { key: 'all_players', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.all-players.label', undefined), summary: t('action.combat-settings.targeting.friendly.all-players.summary', undefined), active: draft.friendly?.includes('all_players') === true },
      { key: 'retaliators', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.retaliators.label', undefined), summary: t('action.combat-settings.targeting.friendly.retaliators.summary', undefined), active: draft.friendly?.includes('retaliators') === true },
      { key: 'party', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.party.label', undefined), summary: t('action.combat-settings.targeting.friendly.party.summary', undefined), disabled: true },
      { key: 'sect', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.sect.label', undefined), summary: t('action.combat-settings.targeting.friendly.sect.summary', undefined), disabled: true },
    ];
    return `
      <div class="combat-settings-targeting-shell">
        <div class="combat-settings-targeting-head">
          <div>
            <div class="skill-preset-card-title">${t('action.combat-settings.targeting.title', undefined)}</div>
            <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.copy', undefined)}</div>
          </div>
          <span class="combat-settings-targeting-badge">${t('action.combat-settings.targeting.badge', undefined)}</span>
        </div>
        <div class="combat-settings-targeting-grid">
          <div class="combat-settings-targeting-card combat-settings-targeting-card--hostile">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.targeting.hostile.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.hostile.copy', undefined)}</div>
            </div>
            <div class="combat-settings-toggle-grid">
              ${hostileOptions.map((option) => this.renderCombatTargetingOption(option)).join('')}
            </div>
          </div>
          <div class="combat-settings-targeting-card combat-settings-targeting-card--friendly">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.targeting.friendly.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.friendly.copy', undefined)}</div>
            </div>
            <div class="combat-settings-toggle-grid">
              ${friendlyOptions.map((option) => this.renderCombatTargetingOption(option)).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** 渲染单个目标选择项。 */
  private renderCombatTargetingOption(option: CombatTargetingCardOption): string {
    return `
      <button
        class="combat-settings-toggle-chip ${option.active ? 'active' : ''}"
        type="button"
        ${option.disabled ? 'disabled' : `data-combat-targeting-toggle="${escapeHtml(`${option.scope ?? 'hostile'}:${option.key ?? ''}`)}"`}
      >
        <span class="combat-settings-toggle-chip-box" aria-hidden="true"></span>
        <span class="combat-settings-toggle-chip-content">
          <span class="combat-settings-toggle-chip-title">
          ${escapeHtml(option.label)}
            ${option.disabled ? `<span class="combat-settings-toggle-chip-disabled-tag">${t('action.combat-settings.targeting.unavailable', undefined)}</span>` : ''}
          </span>
          <span class="combat-settings-toggle-chip-copy">${escapeHtml(option.summary)}</span>
        </span>
      </button>
    `;
  }

  private renderCombatSettingsModalIfOpen(): void {
    this.combatSettings.renderCombatSettingsModalIfOpen();
  }

  private renderSectManagementModalIfOpen(): void {
    this.sectMgmt.renderSectManagementModalIfOpen();
  }

  private openSectManagementModal(): void {
    this.sectMgmt.openSectManagementModal();
  }

  private renderSectManagementModal(): void {
    const action = this.currentActions.find((entry) => entry.id === 'sect:manage');
    const summary = this.resolveSectManagementSummary(action);
    const tabs = this.resolveSectManagementTabs(summary);
    if (!tabs.some((entry) => entry.tab === this.sectManagementTab)) {
      this.sectManagementTab = tabs[0]?.tab ?? 'overview';
    }
    this.sectManagementExternalRevision = this.buildSectManagementRevision(summary);
    detailModalHost.open({
      ownerId: this.SECT_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--sect-management',
      title: t('action.sect.manage.title', undefined),
      subtitle: t('action.sect.manage.subtitle', { name: summary.name, mark: summary.mark }),
      renderBody: (body) => {
        patchElementHtml(body, `
          <div class="sect-manage-shell">
            <aside class="sect-manage-sidebar" aria-label="${t('action.sect.manage.sidebar.aria', undefined)}">
              <div class="sect-manage-sidebar-title">${t('action.sect.manage.sidebar.title', undefined)}</div>
              <div class="action-skill-subtabs sect-manage-subtabs" role="tablist" aria-label="${t('action.sect.manage.aria', undefined)}">
                ${tabs.map((entry) => this.renderSectManagementTabButton(entry.tab, entry.label)).join('')}
              </div>
            </aside>
            <main class="sect-manage-main">
              <div class="skill-manage-summary sect-manage-summary">
                <span>${escapeHtml(summary.name)}</span>
                <span>${t('action.sect.manage.summary.mark', { mark: escapeHtml(summary.mark) })}</span>
                <span>${t('action.sect.manage.summary.domain', { domain: escapeHtml(summary.domainLabel) })}</span>
                <span>${escapeHtml(summary.sectIdLabel)}</span>
              </div>
              <div class="sect-manage-content">
                ${this.renderSectManagementTabPanel(summary)}
              </div>
            </main>
          </div>
        `);
      },
      onAfterRender: (body, signal) => {
        body.querySelectorAll<HTMLElement>('[data-sect-manage-tab]').forEach((button) => {
          button.addEventListener('click', () => {
            const tab = button.dataset.sectManageTab as SectManagementTab | undefined;
            if (!tab || tab === this.sectManagementTab) return;
            this.sectManagementTab = tab;
            this.renderSectManagementModal();
          }, { signal });
        });
        body.querySelectorAll<HTMLElement>('[data-sect-action]').forEach((button) => {
          button.addEventListener('click', () => {
            const actionId = button.dataset.sectAction;
            if (!actionId) return;
            if (actionId === 'sect:dissolve' && !window.confirm(t('action.sect.manage.confirm.dissolve', undefined))) return;
            if (actionId === 'sect:leave' && !window.confirm(t('action.sect.manage.confirm.leave', undefined))) return;
            this.onAction?.(actionId, false, undefined, undefined, button.textContent?.trim() || actionId);
          }, { signal });
        });
        body.querySelectorAll<HTMLSelectElement>('[data-sect-member-role-select]').forEach((select) => {
          select.addEventListener('change', () => {
            const playerId = select.dataset.sectMemberRoleSelect;
            const roleId = select.value;
            if (!playerId || !roleId) return;
            this.onAction?.(`sect:member:role:${encodeURIComponent(playerId)}:${roleId}`, false, undefined, undefined, t('action.sect.manage.action.update-role', undefined));
          }, { signal });
        });
        body.querySelector<HTMLElement>('[data-sect-guardian-inject]')?.addEventListener('click', () => {
          const stones = this.readSectGuardianInjectValue(body);
          this.onAction?.(`sect:guardian:inject:${stones}`, false, undefined, undefined, t('action.sect.manage.action.inject-aura', undefined));
        }, { signal });
        const syncGuardianInjectPreview = () => this.syncSectGuardianInjectPreview(body);
        body.querySelector<HTMLInputElement>('[data-sect-guardian-inject-input="stones"]')?.addEventListener('input', syncGuardianInjectPreview, { signal });
        syncGuardianInjectPreview();
      },
    });
  }

  private resolveSectManagementTabs(summary: SectManagementSummary): Array<{ tab: SectManagementTab; label: string }> {
    const tabs: Array<{ tab: SectManagementTab; label: string }> = [
      { tab: 'overview', label: t('action.sect.manage.tab.overview', undefined) },
      { tab: 'members', label: t('action.sect.manage.tab.members', undefined) },
    ];
    if (summary.data.canEditPermissions) {
      tabs.push({ tab: 'roles', label: t('action.sect.manage.tab.roles', undefined) });
    }
    if (
      summary.data.canReviewApplications
      || summary.data.canManageGuardian
      || summary.data.canTransfer
      || summary.data.canDissolve
      || summary.data.canLeave
    ) {
      tabs.push({ tab: 'manage', label: t('action.sect.manage.tab.manage', undefined) });
    }
    if (summary.data.canManageGuardian) {
      tabs.push({ tab: 'guardian', label: t('action.sect.manage.tab.guardian', undefined) });
    }
    tabs.push({ tab: 'domain', label: t('action.sect.manage.tab.domain', undefined) });
    return tabs;
  }

  private renderSectManagementTabButton(tab: SectManagementTab, label: string): string {
    const active = this.sectManagementTab === tab;
    return `<button class="action-skill-subtab-btn sect-manage-tab-btn ${active ? 'active' : ''}" data-sect-manage-tab="${tab}" type="button" role="tab" aria-selected="${active ? 'true' : 'false'}">${label}</button>`;
  }

  private renderSectManagementTabPanel(summary: SectManagementSummary): string {
    switch (this.sectManagementTab) {
      case 'overview':
        return this.renderSectManagementOverviewPanel(summary);
      case 'members':
        return this.renderSectManagementMembersPanel(summary);
      case 'roles':
        return summary.data.canEditPermissions ? this.renderSectManagementRolesPanel(summary) : this.renderSectManagementOverviewPanel(summary);
      case 'manage':
        return this.renderSectManagementManagePanel(summary);
      case 'guardian':
        if (!summary.data.canManageGuardian) {
          return this.renderSectManagementOverviewPanel(summary);
        }
        return `
          <div class="panel-section">
            <div class="panel-section-head">
              <div class="panel-section-title">${t('action.sect.manage.guardian.title', undefined)}</div>
              <div class="action-section-actions">
                <button class="small-btn" data-sect-action="sect:guardian:toggle" type="button"${summary.data.canManageGuardian ? '' : ' disabled'}>${t('action.sect.manage.guardian.toggle', undefined)}</button>
              </div>
            </div>
            <div class="skill-manage-summary">
              <span>${t('action.sect.manage.guardian.status', { status: escapeHtml(summary.guardianStatusLabel) })}</span>
              <span>${t('action.sect.manage.guardian.aura', { aura: escapeHtml(summary.guardianAuraLabel) })}</span>
              <span>${t('action.sect.manage.guardian.core', undefined)}</span>
              <span>${t('action.sect.manage.guardian.guard', undefined)}</span>
            </div>
            <div class="formation-config-grid">
              <label class="formation-config-field ui-detail-field">
                <strong>${t('action.sect.manage.guardian.inject-stones', undefined)}</strong>
                <input class="ui-input formation-config-input" data-sect-guardian-inject-input="stones" type="number" min="0" step="1" value="1000">
              </label>
              <div class="formation-cost-card ui-detail-field" data-sect-guardian-inject-cost>
                <strong>${t('action.sect.manage.guardian.cost', undefined)}</strong>
                <output data-sect-guardian-inject-qi-cost>100,000</output>
              </div>
              <button class="small-btn" data-sect-guardian-inject data-sect-guardian-allowed="${summary.data.canManageGuardian ? '1' : '0'}" type="button"${summary.data.canManageGuardian ? '' : ' disabled'}>${t('action.sect.manage.action.inject-aura', undefined)}</button>
            </div>
            <div class="action-section-hint">${t('action.sect.manage.guardian.copy', undefined)}</div>
          </div>`;
      case 'domain':
      default:
        return `
          <div class="panel-section">
            <div class="panel-section-head">
              <div class="panel-section-title">${t('action.sect.manage.domain.title', undefined)}</div>
            </div>
            <div class="skill-manage-summary">
              <span>${escapeHtml(summary.name)}</span>
              <span>${t('action.sect.manage.summary.mark', { mark: escapeHtml(summary.mark) })}</span>
              <span>${t('action.sect.manage.domain.region', { region: escapeHtml(summary.domainLabel) })}</span>
            </div>
            <div class="action-section-hint">${t('action.sect.manage.domain.copy', undefined)}</div>
          </div>`;
    }
  }

  private readSectGuardianInjectValue(root: HTMLElement): number {
    const input = root.querySelector<HTMLInputElement>('[data-sect-guardian-inject-input="stones"]');
    const value = Math.trunc(Number(input?.value ?? 0));
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private syncSectGuardianInjectPreview(root: HTMLElement): void {
    const stones = this.readSectGuardianInjectValue(root);
    const qiCost = stones * 100;
    const output = root.querySelector<HTMLOutputElement>('[data-sect-guardian-inject-qi-cost]');
    if (output) {
      output.value = formatDisplayNumber(qiCost);
      output.textContent = formatDisplayNumber(qiCost);
    }
    const button = root.querySelector<HTMLButtonElement>('[data-sect-guardian-inject]');
    if (button) {
      const allowed = button.dataset.sectGuardianAllowed !== '0';
      button.disabled = stones <= 0 || !allowed;
      button.textContent = allowed
        ? (stones > 0 ? t('action.sect.manage.action.inject-aura', undefined) : t('action.sect.manage.guardian.inject-stones-short', undefined))
        : t('action.sect.manage.guardian.no-permission', undefined);
    }
  }

  private renderSectManagementOverviewPanel(summary: SectManagementSummary): string {
    return `
      <div class="sect-detail-pane">
        <div class="sect-detail-card sect-detail-card--hero">
          <div class="sect-detail-card-main">
            <div class="sect-detail-name">${escapeHtml(summary.name)}</div>
            <div class="sect-detail-tag-row">
              <span class="sect-detail-tag">${t('action.sect.manage.overview.level', undefined)}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.leader', { leaderName: escapeHtml(summary.leaderName) })}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.members', { memberCount: escapeHtml(summary.memberCountLabel) })}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.mark', { mark: escapeHtml(summary.mark) })}</span>
            </div>
            <div class="sect-detail-notice">${escapeHtml(summary.notice)}</div>
          </div>
          <div class="sect-detail-card-actions">
            <button class="small-btn ghost" data-sect-manage-tab="manage" type="button">${t('action.sect.manage.overview.manage', undefined)}</button>
          </div>
        </div>
        <div class="sect-detail-stat-grid">
          ${this.renderSectStatCard(t('action.sect.manage.stat.mark', undefined), summary.mark)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.domain', undefined), summary.domainLabel)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.members', undefined), summary.memberCountLabel)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.leader', undefined), summary.leaderName)}
        </div>
        <div class="sect-detail-action-grid">
          <button class="sect-detail-action-card" data-sect-manage-tab="members" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.members', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="roles" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.roles', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="guardian" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.guardian', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="domain" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.domain', undefined)}</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderSectManagementMembersPanel(summary: SectManagementSummary): string {
    const assignableRoles = summary.data.roles.filter((role) => role.assignable);
    const rows = summary.data.members.map((member) => this.renderSectMemberRow(summary, member, assignableRoles)).join('');
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.members.title', undefined)}</div>
          </div>
          <div class="sect-detail-count">${escapeHtml(summary.memberCountLabel)}</div>
        </div>
        <div class="sect-member-table">
          <div class="sect-member-table-head">
            <span>${t('action.sect.manage.members.column.member', undefined)}</span>
            <span>${t('action.sect.manage.members.column.role', undefined)}</span>
            <span>${t('action.sect.manage.members.column.realm', undefined)}</span>
            <span>${t('action.sect.manage.members.column.contrib', undefined)}</span>
            <span>${t('action.sect.manage.members.column.week-contrib', undefined)}</span>
            <span>${t('action.sect.manage.members.column.status', undefined)}</span>
          </div>
          ${rows}
        </div>
        ${summary.data.members.length <= 1 ? `<div class="sect-empty-note">${t('action.sect.manage.members.empty', undefined)}</div>` : ''}
      </div>
    `;
  }

  private renderSectManagementRolesPanel(summary: SectManagementSummary): string {
    const cards = summary.data.roles.map((role) => this.renderSectRolePermissionCard(summary, role)).join('');
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.roles.title', undefined)}</div>
          </div>
        </div>
        <div class="sect-role-grid">
          ${cards}
        </div>
        <div class="sect-current-role">${t('action.sect.manage.roles.copy', undefined)}</div>
      </div>
    `;
  }

  private renderSectManagementManagePanel(summary: SectManagementSummary): string {
    const transferTargets = summary.data.members.filter((member) => !member.self && !member.leader);
    const transferButtons = transferTargets.length > 0
      ? transferTargets.map((member) => `<button class="small-btn ghost" data-sect-action="sect:transfer:${escapeHtml(encodeURIComponent(member.playerId))}" type="button"${summary.data.canTransfer ? '' : ' disabled'}>${t('action.sect.manage.manage.transfer-to', { name: escapeHtml(member.name) })}</button>`).join('')
      : `<div class="sect-empty-note">${t('action.sect.manage.manage.transfer-empty', undefined)}</div>`;
    const applicationRows = summary.data.applications.length > 0
      ? summary.data.applications.map((entry) => `
        <div class="sect-application-table-row">
          <span class="sect-member-name-cell">
            <span class="sect-member-name-main">${escapeHtml(entry.name)}</span>
            <span class="sect-member-name-sub">${t('action.sect.manage.manage.pending', undefined)}</span>
          </span>
          <span>${t('action.sect.manage.manage.application-type', undefined)}</span>
          <span>${escapeHtml(formatSectTimestamp(entry.appliedAt))}</span>
          <span class="action-section-actions">
            <button class="small-btn" data-sect-action="sect:application:approve:${escapeHtml(encodeURIComponent(entry.playerId))}" type="button"${summary.data.canReviewApplications ? '' : ' disabled'}>${t('action.sect.manage.manage.approve', undefined)}</button>
            <button class="small-btn ghost" data-sect-action="sect:application:reject:${escapeHtml(encodeURIComponent(entry.playerId))}" type="button"${summary.data.canReviewApplications ? '' : ' disabled'}>${t('action.sect.manage.manage.reject', undefined)}</button>
          </span>
        </div>
      `).join('')
      : `<div class="sect-empty-note">${t('action.sect.manage.manage.applications-empty', undefined)}</div>`;
    const cards: string[] = [];
    if (summary.data.canReviewApplications) {
      cards.push(`
        <div class="sect-manage-card sect-manage-card--wide">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.review-title', undefined)}</div>
          <div class="sect-application-table">
            <div class="sect-application-table-head">
              <span>${t('action.sect.manage.manage.column.applicant', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.type', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.time', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.actions', undefined)}</span>
            </div>
            ${applicationRows}
          </div>
        </div>
      `);
    }
    if (summary.data.canManageGuardian) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.guardian-title', undefined)}</div>
          <button class="small-btn" data-sect-manage-tab="guardian" type="button">${t('action.sect.manage.manage.go-guardian', undefined)}</button>
        </div>
      `);
    }
    if (summary.data.canTransfer) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.transfer-title', undefined)}</div>
          <div class="action-section-actions">${transferButtons}</div>
        </div>
      `);
    }
    if (summary.data.canDissolve) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.dissolve-title', undefined)}</div>
          <button class="small-btn ghost" data-sect-action="sect:dissolve" type="button">${t('action.sect.manage.action.dissolve', undefined)}</button>
        </div>
      `);
    }
    if (summary.data.canLeave) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.leave-title', undefined)}</div>
          <button class="small-btn ghost" data-sect-action="sect:leave" type="button">${t('action.sect.manage.action.leave', undefined)}</button>
        </div>
      `);
    }
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.manage.title', undefined)}</div>
          </div>
        </div>
        <div class="sect-manage-card-grid">
          ${cards.join('')}
        </div>
      </div>
    `;
  }

  private renderSectMemberRow(summary: SectManagementSummary, member: SectManagementMember, assignableRoles: SectManagementRole[]): string {
    const canEditRole = summary.data.canChangeRoles && !member.leader;
    const roleControl = canEditRole
      ? `<select class="ui-input formation-config-input" data-sect-member-role-select="${escapeHtml(member.playerId)}">
          ${assignableRoles.map((role) => `<option value="${escapeHtml(role.id)}"${role.id === member.roleId ? ' selected' : ''}>${escapeHtml(role.label)}</option>`).join('')}
        </select>`
      : `<span class="sect-detail-tag ${member.leader ? 'strong' : ''}">${escapeHtml(member.roleLabel)}</span>`;
    const canRemove = summary.data.canRemoveMembers && !member.leader && !member.self;
    const removeButton = canRemove
      ? `<button class="small-btn ghost" data-sect-action="sect:member:remove:${escapeHtml(encodeURIComponent(member.playerId))}" type="button">${t('action.sect.manage.member.remove', undefined)}</button>`
      : '';
    const statusClass = member.statusLabel === t('action.sect.status.online', undefined) ? 'sect-online-text' : 'sect-detail-tag';
    return `
      <div class="sect-member-table-row">
        <span class="sect-member-name-cell">
          <span class="sect-member-name-main">${escapeHtml(member.name)}</span>
          <span class="sect-member-name-sub">${member.self ? t('action.sect.manage.member.self-role', undefined) : escapeHtml(member.roleLabel)}</span>
        </span>
        <span>${roleControl}</span>
        <span>${escapeHtml(formatSectMemberRealmLabel(member, member.self ? summary.realmLabel : t('common.value.unknown', undefined)))}</span>
        <span>0</span>
        <span>0</span>
        <span>
          <span class="${statusClass}">${escapeHtml(member.statusLabel)}</span>
          ${removeButton}
        </span>
      </div>
    `;
  }

  private renderSectRolePermissionCard(summary: SectManagementSummary, role: SectManagementRole): string {
    const permissions = summary.data.permissions.map((permission) => {
      const checked = summary.data.rolePermissions[role.id]?.[permission.id] === true;
      const disabled = !summary.data.canEditPermissions || role.id === 'leader';
      return `
        <button class="skill-manage-toggle-chip ${checked ? 'active' : ''}" data-sect-action="sect:permission:toggle:${escapeHtml(role.id)}:${escapeHtml(permission.id)}" type="button"${disabled ? ' disabled' : ''}>
          ${escapeHtml(permission.label)}
        </button>
      `;
    }).join('');
    return `
      <div class="sect-role-card ${role.assignable ? '' : 'is-muted'}">
        <div class="sect-role-card-head">
          <div class="sect-role-card-title">${escapeHtml(role.label)}</div>
          <span class="sect-detail-tag ${role.assignable ? 'strong' : ''}">${role.assignable ? t('action.sect.manage.role.assignable', undefined) : t('action.sect.manage.role.unassignable', undefined)}</span>
        </div>
        <div class="sect-role-permissions">${permissions}</div>
      </div>
    `;
  }

  private renderSectStatCard(label: string, value: string): string {
    return `
      <div class="sect-stat-card">
        <div class="sect-stat-card-label">${escapeHtml(label)}</div>
        <div class="sect-stat-card-value">${escapeHtml(value)}</div>
      </div>
    `;
  }

  private renderSectRoleCard(title: string, badge: string, permissions: string[], disabled: boolean): string {
    return `
      <div class="sect-role-card ${disabled ? 'is-muted' : ''}">
        <div class="sect-role-card-head">
          <div class="sect-role-card-title">${escapeHtml(title)}</div>
          <span class="sect-detail-tag ${disabled ? '' : 'strong'}">${escapeHtml(badge)}</span>
        </div>
        <div class="sect-role-permissions">
          ${permissions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  private resolveSectManagementSummary(action?: ActionDef): SectManagementSummary {
    const rawDesc = action?.desc ?? '';
    const data = parseSectManagementData(rawDesc, this.previewPlayer ?? null);
    const desc = stripSectManagementData(rawDesc);
    const name = desc.split('·')[0]?.trim() || action?.name || t('action.sect.manage.fallback.name', undefined);
    const mark = /印记\s*([^·\s]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.mark', undefined);
    const domainLabel = /地域\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.domain', undefined);
    const guardianStatusLabel = /大阵\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.guardian-status', undefined);
    const guardianAuraLabel = /灵力\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.guardian-aura', undefined);
    const sectIdLabel = this.previewPlayer?.sectId ? t('action.sect.manage.summary.sect-id', { sectId: this.previewPlayer.sectId }) : t('action.sect.manage.summary.bound', undefined);
    const leaderName = data.members.find((member) => member.leader)?.name || this.previewPlayer?.name || this.previewPlayer?.displayName || this.previewPlayer?.id || t('action.sect.manage.fallback.leader', undefined);
    const realmLabel = this.previewPlayer?.realm?.displayName || this.previewPlayer?.realmName || this.previewPlayer?.realm?.name || t('action.sect.manage.fallback.realm', undefined);
    const memberCountLabel = String(data.members.length || 1);
    const notice = t('action.sect.manage.notice', { name });
    return { name, mark, domainLabel, guardianStatusLabel, guardianAuraLabel, sectIdLabel, leaderName, realmLabel, memberCountLabel, notice, data };
  }

  private buildSectManagementRevision(summary: SectManagementSummary): string {
    return `${this.sectManagementTab}|${summary.name}|${summary.mark}|${summary.domainLabel}|${summary.guardianStatusLabel}|${summary.guardianAuraLabel}|${summary.sectIdLabel}|${summary.leaderName}|${summary.realmLabel}|${summary.memberCountLabel}|${JSON.stringify(summary.data)}`;
  }

  /** 仅在索敌方案弹层已打开且内容变化时重绘。 */
  private renderTargetingPlanModalIfOpen(): void {
    this.combatSettings.renderTargetingPlanModalIfOpen();
  }

  /** 渲染战斗设置弹层。 */
  private renderCombatSettingsModal(): void {
    this.autoUsePillTooltip.hide(true);
    this.autoUsePillTooltipNode = null;
    const pillDraft = this.syncAutoUsePillDraft();
    const entries = this.getAutoUsePillViewEntries();
    const currentConfig = pillDraft[this.autoUsePillSelectedIndex] ?? null;
    const currentEntry = currentConfig
      ? entries.find((entry) => entry.itemId === currentConfig.itemId) ?? null
      : null;
    const slotMarkup = Array.from({ length: this.AUTO_USE_PILL_SLOT_LIMIT }, (_, index) => {
      const slotConfig = pillDraft[index] ?? null;
      const slotEntry = slotConfig
        ? entries.find((entry) => entry.itemId === slotConfig.itemId) ?? null
        : null;
      const conditionSummary = slotConfig
        ? this.renderAutoUsePillConditionSummary(slotConfig.conditions)
        : t('action.combat-settings.auto-pills.slot.unset', undefined);
      return `
        <div class="auto-pill-slot-unit">
          <button
            class="auto-pill-slot ${index === this.autoUsePillSelectedIndex ? 'active' : ''} ${slotEntry ? 'filled' : 'empty'}"
            data-auto-pill-slot="${index}"
            ${slotEntry ? `data-auto-pill-slot-item-id="${escapeHtml(slotEntry.itemId)}"` : ''}
            type="button"
          >
            ${slotEntry
              ? `
                <span class="auto-pill-slot-name">${escapeHtml(slotEntry.name)}</span>
                <span class="auto-pill-slot-count">${slotEntry.count > 0 ? slotEntry.count : '-'}</span>
              `
              : `
                <span class="auto-pill-slot-empty">+</span>
                <span class="auto-pill-slot-label">${t('action.combat-settings.auto-pills.slot.empty', undefined)}</span>
              `}
          </button>
          <div class="auto-pill-slot-summary">${escapeHtml(conditionSummary)}</div>
          <button
            class="small-btn ghost auto-pill-slot-condition-btn"
            data-auto-pill-open-slot-conditions="${index}"
            type="button"
            ${slotEntry ? '' : 'disabled'}
          >${t('action.combat-settings.auto-pills.slot.conditions', undefined)}</button>
        </div>
      `;
    }).join('');
    const pickerEntries = this.getAutoUsePillPickerEntries();
    const pickerBody = pickerEntries.length === 0
      ? `<div class="empty-hint">${t('action.combat-settings.auto-pills.picker.empty', undefined)}</div>`
      : `
        <div class="auto-pill-picker-grid">
          ${pickerEntries.map((entry) => `
            <button
              class="auto-pill-picker-card ${currentEntry?.itemId === entry.itemId ? 'selected' : ''}"
              data-auto-pill-pick="${escapeHtml(entry.itemId)}"
              type="button"
            >
              <span class="auto-pill-picker-title">${escapeHtml(entry.name)}</span>
              <span class="auto-pill-picker-count">${entry.count > 0 ? entry.count : '-'}</span>
              <span class="auto-pill-picker-meta">${escapeHtml(this.renderAutoUsePillEffectSummary(entry))}</span>
            </button>
          `).join('')}
        </div>
      `;
    const conditionBody = currentEntry
      ? `
        <div class="auto-pill-condition-editor">
          <div class="auto-pill-condition-summary-card">
            <div class="auto-pill-card-title-row">
              <div class="auto-pill-card-title">${escapeHtml(currentEntry.name)}</div>
              <span class="auto-pill-card-count">${currentEntry.count > 0 ? currentEntry.count : '-'}</span>
            </div>
            <div class="auto-pill-card-meta">${escapeHtml(this.renderAutoUsePillEffectSummary(currentEntry))}</div>
            <div class="auto-pill-config-summary">${escapeHtml(this.renderAutoUsePillConditionSummary(currentConfig?.conditions ?? []))}</div>
          </div>
            <div class="auto-pill-condition-panel auto-pill-condition-panel--standalone">
            <div class="auto-pill-condition-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.condition.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.condition.copy', undefined)}</div>
            </div>
            ${(currentConfig?.conditions.length ?? 0) > 0
              ? `<div class="auto-pill-condition-list">
                  ${currentConfig?.conditions.map((condition, conditionIndex) => this.renderAutoUsePillConditionRow(currentEntry.itemId, condition, conditionIndex)).join('')}
                </div>`
              : `<div class="empty-hint">${t('action.combat-settings.auto-pills.condition.empty', undefined)}</div>`}
            <div class="auto-pill-condition-actions">
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="hp" type="button">${t('action.combat-settings.auto-pills.condition.add-hp', undefined)}</button>
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="qi" type="button">${t('action.combat-settings.auto-pills.condition.add-qi', undefined)}</button>
              ${(currentEntry.consumeBuffs?.length ?? 0) > 0
                ? `<button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="buff_missing" type="button">${t('action.combat-settings.auto-pills.condition.add-buff-missing', undefined)}</button>`
                : ''}
            </div>
          </div>
        </div>
      `
      : `<div class="empty-hint">${t('action.combat-settings.auto-pills.condition.no-item', undefined)}</div>`;
    const autoPillBody = `
      <div class="skill-preset-card auto-pill-hero-card">
        <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.title', undefined)}</div>
        <div class="skill-preset-card-copy">${t('action.combat-settings.auto-pills.copy', undefined)}</div>
      </div>
      <div class="auto-pill-slot-grid">${slotMarkup}</div>
    `;
    const targetingBody = this.renderCombatTargetingSection();
    const overviewBody = `
      <div class="auto-pill-shell">
        <div class="auto-pill-topbar">
          <div class="skill-preset-card auto-pill-hero-card combat-settings-hero-card">
            <div class="skill-preset-card-title">${t('action.combat-settings.hero.title', undefined)}</div>
            <div class="skill-preset-card-copy">${t('action.combat-settings.hero.copy', undefined)}</div>
          </div>
          <div class="auto-pill-toolbar">
            <button class="small-btn" data-combat-settings-apply type="button">${t('common.action.execute', undefined)}</button>
            <button class="small-btn ghost" data-combat-settings-cancel type="button">${t('common.action.cancel', undefined)}</button>
          </div>
        </div>
        <div class="action-skill-subtabs combat-settings-tabs">
          <button class="action-skill-subtab-btn ${this.combatSettingsActiveTab === 'auto_pills' ? 'active' : ''}" data-combat-settings-tab="auto_pills" type="button">${t('action.combat-settings.tab.auto-pills', undefined)}</button>
          <button class="action-skill-subtab-btn ${this.combatSettingsActiveTab === 'targeting' ? 'active' : ''}" data-combat-settings-tab="targeting" type="button">${t('action.combat-settings.tab.targeting', undefined)}</button>
        </div>
        <div class="combat-settings-panel-body">
          ${this.combatSettingsActiveTab === 'auto_pills' ? autoPillBody : targetingBody}
        </div>
        ${this.combatSettingsActiveTab === 'auto_pills' && this.autoUsePillSubview === 'picker'
          ? `
            <div class="auto-pill-subdialog-backdrop">
              <div class="auto-pill-subdialog auto-pill-subdialog--picker">
                <div class="auto-pill-subdialog-head">
                  <div>
                    <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.picker.title', undefined)}</div>
                    <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.picker.copy', undefined)}</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    ${currentConfig ? `<button class="small-btn ghost" data-auto-pill-clear-slot type="button">${t('action.combat-settings.auto-pills.picker.clear-slot', undefined)}</button>` : ''}
                    <button class="small-btn ghost" data-auto-pill-back type="button">${t('common.action.close', undefined)}</button>
                  </div>
                </div>
                ${pickerBody}
              </div>
            </div>
          `
          : ''}
        ${this.combatSettingsActiveTab === 'auto_pills' && this.autoUsePillSubview === 'conditions'
          ? `
            <div class="auto-pill-subdialog-backdrop">
              <div class="auto-pill-subdialog auto-pill-subdialog--condition">
                <div class="auto-pill-subdialog-head">
                  <div>
                    <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.condition.dialog-title', undefined)}</div>
                    <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.condition.dialog-copy', { name: escapeHtml(currentEntry?.name ?? t('action.combat-settings.auto-pills.slot.current', undefined)) })}</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    <button class="small-btn ghost" data-auto-pill-back type="button">${t('common.action.close', undefined)}</button>
                  </div>
                </div>
                ${conditionBody}
              </div>
            </div>
          `
          : ''}
      </div>
    `;
    detailModalHost.open({
      ownerId: this.COMBAT_SETTINGS_MODAL_OWNER,
      variantClass: 'detail-modal--combat-settings',
      title: t('action.combat-settings.title', undefined),
      subtitle: t('action.combat-settings.subtitle', {
        pillCount: pillDraft.length,
        tabLabel: this.combatSettingsActiveTab === 'auto_pills'
          ? t('action.combat-settings.tab.auto-pills', undefined)
          : t('action.combat-settings.tab.targeting', undefined),
      }),
      bodyHtml: overviewBody,
      onRequestClose: () => this.confirmDiscardCombatSettingsChanges(),
      onClose: () => this.discardCombatSettingsDraft(),
      onAfterRender: (body, signal) => this.bindCombatSettingsEvents(body, signal),
    });
    this.combatSettingsExternalRevision = this.buildCombatSettingsExternalRevision();
  }

  /** 渲染索敌方案弹层。 */
  private renderTargetingPlanModal(): void {
    const activeMode = this.getAutoBattleTargetingMode();
    const activeOption = AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === activeMode)
      ?? AUTO_BATTLE_TARGETING_MODE_OPTIONS[0]!;

    detailModalHost.open({
      ownerId: this.TARGETING_PLAN_MODAL_OWNER,
      variantClass: 'detail-modal--targeting-plan',
      title: t('action.targeting-plan.title', undefined),
      subtitle: t('action.targeting-plan.subtitle', { label: activeOption.label }),
      bodyHtml: `
        <div class="targeting-plan-shell">
          <div class="targeting-plan-hero">
            <div class="targeting-plan-card">
              <div class="skill-preset-card-title">${t('action.targeting-plan.current.title', undefined)}</div>
              <div class="targeting-plan-current">${escapeHtml(activeOption.label)}</div>
              <div class="skill-preset-card-copy">${escapeHtml(activeOption.summary)}</div>
            </div>
          </div>
          <div class="targeting-plan-card targeting-plan-options">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.targeting-plan.switch.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.targeting-plan.switch.copy', undefined)}</div>
            </div>
            <div class="targeting-plan-grid">
              ${AUTO_BATTLE_TARGETING_MODE_OPTIONS.map((entry) => `
                <button
                  class="targeting-plan-option ${entry.mode === activeMode ? 'active' : ''}"
                  data-targeting-plan-mode="${escapeHtml(entry.mode)}"
                  type="button"
                >
                  <span class="targeting-plan-option-title">${escapeHtml(entry.label)}</span>
                  <span class="targeting-plan-option-copy">${escapeHtml(entry.summary)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `,
      onAfterRender: (body, signal) => {
        this.bindTargetingPlanEvents(body, signal);
      },
    });
    this.targetingPlanExternalRevision = activeMode;
  }

  /** 战斗设置关闭前确认。 */
  private confirmDiscardCombatSettingsChanges(): boolean {
    if (this.areAutoUsePillConfigsEqual(this.autoUsePillDraft, this.getAutoUsePills())
      && this.areCombatTargetingRulesEqual(this.combatTargetingDraft, this.getCombatTargetingRules())) {
      return true;
    }
    return window.confirm(t('action.combat-settings.confirm-discard', undefined));
  }

  /** 渲染战斗设置状态提示。 */
  private renderCombatSettingsStatus(): string {
    if (!this.combatSettingsStatus) {
      return '';
    }
    return `<div class="skill-preset-status ui-status-text ${this.combatSettingsStatus.tone === 'error' ? 'error' : this.combatSettingsStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.combatSettingsStatus.text)}</div>`;
  }

  /** 清理战斗设置里的临时关闭确认提示。 */
  private resetCombatSettingsCloseConfirm(): void {
    if (this.combatSettingsStatus?.tone === 'info') {
      this.combatSettingsStatus = null;
    }
  }

  /** 丢弃战斗设置草稿。 */
  private discardCombatSettingsDraft(): void {
    this.autoUsePillDraft = null;
    this.combatTargetingDraft = null;
    this.combatSettingsStatus = null;
    this.combatSettingsActiveTab = 'auto_pills';
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    this.autoUsePillTooltipNode = null;
    this.autoUsePillTooltip.hide(true);
    this.combatSettingsExternalRevision = null;
  }

  /** 请求关闭战斗设置弹层。 */
  private requestCombatSettingsClose(): void {
    if (!this.confirmDiscardCombatSettingsChanges()) {
      return;
    }
    this.discardCombatSettingsDraft();
    detailModalHost.close(this.COMBAT_SETTINGS_MODAL_OWNER);
  }

  /** 绑定战斗设置交互。 */
  private bindCombatSettingsEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-combat-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.combatSettingsTab;
        this.combatSettingsActiveTab = tab === 'targeting' ? 'targeting' : 'auto_pills';
        this.renderCombatSettingsModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-apply]').forEach((button) => {
      button.addEventListener('click', () => this.applyCombatSettingsChanges(), { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        this.requestCombatSettingsClose();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillSlot);
        if (!Number.isInteger(slotIndex)) {
          return;
        }
        this.openAutoUsePillPicker(slotIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-open-slot-conditions]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillOpenSlotConditions);
        if (!Number.isInteger(slotIndex)) {
          return;
        }
        this.openAutoUsePillConditionSettings(slotIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-back]').forEach((button) => {
      button.addEventListener('click', () => {
        this.closeAutoUsePillSubview();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillPick;
        if (!itemId) {
          return;
        }
        this.assignAutoUsePillToSelectedSlot(itemId);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-clear-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        this.clearSelectedAutoUsePillSlot();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-add-condition]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillAddCondition;
        const kind = button.dataset.conditionKind as 'hp' | 'qi' | 'buff_missing' | undefined;
        if (!itemId || !kind) {
          return;
        }
        this.addAutoUsePillCondition(itemId, kind);
      }, { signal });
    });
    root.querySelectorAll<HTMLSelectElement>('[data-auto-pill-condition-resource]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionResource;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const resource = input.value === 'qi' ? 'qi' : 'hp';
        if (!itemId || !Number.isInteger(conditionIndex)) {
          return;
        }
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio'
            ? { ...condition, resource }
            : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLSelectElement>('[data-auto-pill-condition-op]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionOp;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const op = input.value === 'gt' ? 'gt' : 'lt';
        if (!itemId || !Number.isInteger(conditionIndex)) {
          return;
        }
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio'
            ? { ...condition, op }
            : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLInputElement>('[data-auto-pill-condition-threshold]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionThreshold;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const thresholdPct = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
        if (!itemId || !Number.isInteger(conditionIndex)) {
          return;
        }
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio'
            ? { ...condition, thresholdPct }
            : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-condition-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillConditionRemove;
        const conditionIndex = Number(button.dataset.conditionIndex);
        if (!itemId || !Number.isInteger(conditionIndex)) {
          return;
        }
        this.removeAutoUsePillCondition(itemId, conditionIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-targeting-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const raw = button.dataset.combatTargetingToggle;
        const [scopeRaw, keyRaw] = typeof raw === 'string' ? raw.split(':', 2) : [];
        const scope = scopeRaw === 'friendly' ? 'friendly' : scopeRaw === 'hostile' ? 'hostile' : null;
        const key = keyRaw as CombatTargetingRuleKey | undefined;
        if (!scope || !key) {
          return;
        }
        this.resetCombatSettingsCloseConfirm();
        const draft = this.syncCombatTargetingDraft();
        const current = new Set(draft[scope] ?? []);
        if (current.has(key)) {
          current.delete(key);
        } else {
          current.add(key);
        }
        this.combatTargetingDraft = this.cloneCombatTargetingRules({
          ...draft,
          [scope]: [...current],
        });
        this.renderCombatSettingsModal();
      }, { signal });
    });
    this.bindAutoUsePillSlotTooltipEvents(root, signal);
    this.bindAutoUsePillPickerTooltipEvents(root, signal);
  }

  /** 绑定索敌方案弹层交互。 */
  private bindTargetingPlanEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-targeting-plan-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.targetingPlanMode as AutoBattleTargetingMode | undefined;
        if (!mode || mode === this.getAutoBattleTargetingMode()) {
          return;
        }
        if (this.previewPlayer) {
          this.previewPlayer.autoBattleTargetingMode = mode;
        }
        this.targetingPlanExternalRevision = null;
        this.render(this.currentActions);
        this.renderTargetingPlanModal();
        this.onUpdateAutoBattleTargetingMode?.(mode);
      }, { signal });
    });
  }

  /** 绑定槽位 tooltip。 */
  private bindAutoUsePillSlotTooltipEvents(root: HTMLElement, signal: AbortSignal): void {
    const slotButtons = root.querySelectorAll<HTMLElement>('[data-auto-pill-slot-item-id]');
    if (slotButtons.length === 0) {
      return;
    }
    root.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLElement>('[data-auto-pill-slot-item-id]');
      if (!button) {
        if (this.autoUsePillTooltipNode) {
          this.autoUsePillTooltipNode = null;
          this.autoUsePillTooltip.hide();
        }
        return;
      }
      const itemId = button.dataset.autoPillSlotItemId;
      if (!itemId) {
        return;
      }
      if (this.autoUsePillTooltipNode !== button) {
        const tooltip = this.buildAutoUsePillSlotTooltipPayload(itemId);
        if (!tooltip) {
          return;
        }
        this.autoUsePillTooltipNode = button;
        this.autoUsePillTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }
      this.autoUsePillTooltip.move(event.clientX, event.clientY);
    }, { signal });
  }

  /** 绑定药品选择器 tooltip。 */
  private bindAutoUsePillPickerTooltipEvents(root: HTMLElement, signal: AbortSignal): void {
    const pickerCards = root.querySelectorAll<HTMLElement>('[data-auto-pill-pick]');
    if (pickerCards.length === 0) {
      this.autoUsePillTooltipNode = null;
      this.autoUsePillTooltip.hide(true);
      return;
    }
    root.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const card = target.closest<HTMLElement>('[data-auto-pill-pick]');
      if (!card) {
        if (this.autoUsePillTooltipNode) {
          this.autoUsePillTooltipNode = null;
          this.autoUsePillTooltip.hide();
        }
        return;
      }
      const itemId = card.dataset.autoPillPick;
      if (!itemId) {
        return;
      }
      if (this.autoUsePillTooltipNode !== card) {
        const item = this.buildAutoUsePillTooltipItem(itemId);
        if (!item) {
          return;
        }
        const tooltip = buildItemTooltipPayload(item, { playerRealmLv: this.previewPlayer?.realm?.realmLv ?? this.previewPlayer?.realmLv });
        this.autoUsePillTooltipNode = card;
        this.autoUsePillTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }
      this.autoUsePillTooltip.move(event.clientX, event.clientY);
    }, { signal });
    root.addEventListener('pointerleave', () => {
      this.autoUsePillTooltipNode = null;
      this.autoUsePillTooltip.hide();
    }, { signal });
    root.addEventListener('pointerdown', () => {
      if (this.autoUsePillTooltipNode) {
        this.autoUsePillTooltipNode = null;
        this.autoUsePillTooltip.hide();
      }
    }, { signal });
  }

  /** 渲染自动吃药条件摘要。 */
  private renderAutoUsePillConditionSummary(conditions: AutoUsePillCondition[]): string {
    if (conditions.length === 0) {
      return t('action.combat-settings.auto-pills.condition.none', undefined);
    }
    return conditions.map((condition) => {
      if (condition.type === 'buff_missing') {
        return t('action.combat-settings.auto-pills.condition.buff-missing', undefined);
      }
      return t('action.combat-settings.auto-pills.condition.resource-ratio', {
        resource: condition.resource === 'hp'
          ? t('action.combat-settings.auto-pills.condition.resource.hp', undefined)
          : t('action.combat-settings.auto-pills.condition.resource.qi', undefined),
        op: condition.op === 'lt'
          ? t('action.combat-settings.auto-pills.condition.op.lt', undefined)
          : t('action.combat-settings.auto-pills.condition.op.gt', undefined),
        thresholdPct: condition.thresholdPct,
      });
    }).join('；');
  }

  /** 渲染自动丹药效果摘要。 */
  private renderAutoUsePillEffectSummary(entry: AutoUsePillViewEntry): string {
    const parts: string[] = [];
    if ((entry.healAmount ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.heal-amount', { value: formatDisplayNumber(entry.healAmount ?? 0) }));
    }
    if ((entry.healPercent ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.heal-percent', { value: Math.round((entry.healPercent ?? 0) * 100) }));
    }
    if ((entry.qiPercent ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.qi-percent', { value: Math.round((entry.qiPercent ?? 0) * 100) }));
    }
    if ((entry.consumeBuffs?.length ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.buffs', {
        buffs: entry.consumeBuffs?.map((buff) => buff.name || buff.buffId || t('action.combat-settings.auto-pills.effect.buff-fallback', undefined)).join('、') ?? '',
      }));
    }
    return parts.join('；') || t('action.combat-settings.auto-pills.effect.fallback', undefined);
  }

  /** 应用战斗设置。 */
  private applyCombatSettingsChanges(): void {
    const nextPills = this.syncAutoUsePillDraft();
    const nextRules = this.syncCombatTargetingDraft();
    const pillsChanged = !this.areAutoUsePillConfigsEqual(nextPills, this.getAutoUsePills());
    const rulesChanged = !this.areCombatTargetingRulesEqual(nextRules, this.getCombatTargetingRules());
    const allowAoeChanged = (nextRules.includePlayers === true) !== this.allowAoePlayerHit;
    if (this.previewPlayer) {
      this.previewPlayer.autoUsePills = this.cloneAutoUsePillConfigs(nextPills);
      this.previewPlayer.combatTargetingRules = this.cloneCombatTargetingRules(nextRules);
      this.previewPlayer.allowAoePlayerHit = nextRules.includePlayers === true;
    }
    this.render(this.currentActions);
    this.discardCombatSettingsDraft();
    detailModalHost.close(this.COMBAT_SETTINGS_MODAL_OWNER);
    if (pillsChanged) {
      this.onUpdateAutoUsePills?.(nextPills);
    }
    if (rulesChanged) {
      this.onUpdateCombatTargetingRules?.(nextRules);
    }
    if (allowAoeChanged) {
      this.onAction?.('toggle:allow_aoe_player_hit', false, undefined, undefined, t('action.combat-settings.toggle-aoe', undefined));
    }
  }

  /** 打开技能方案弹层。 */
  private openSkillPresetModal(): void {
    this.skillMgmt.openSkillPresetModal();
  }

  /** 关闭方案弹层后，把输入草稿和状态提示清空。 */
  private resetSkillPresetModalState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.skillPresetNameDraft = '';
    this.skillPresetImportText = '';
    this.skillPresetStatus = null;
    if (!this.skillPresets.some((preset) => preset.id === this.selectedSkillPresetId)) {
      this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    }
  }

  /** 清理技能方案删除二次确认状态。 */
  private resetSkillPresetDeleteConfirm(): void {
    if (this.skillPresetStatus?.tone === 'info') {
      this.skillPresetStatus = null;
    }
  }

  /** 返回当前选中的技能方案。 */
  private getSelectedSkillPreset(): SkillPresetRecord | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedSkillPresetId) {
      return null;
    }
    return this.skillPresets.find((preset) => preset.id === this.selectedSkillPresetId) ?? null;
  }

  /** 汇总一份方案里自动和手动技能的数量。 */
  private getSkillPresetSummaryLine(skills: SkillPresetSkillState[]): string {
    const auto = skills.filter((skill) => skill.enabled !== false).length;
    const manual = skills.length - auto;
    return t('action.skill-preset.summary.recorded', { count: skills.length, auto, manual });
  }

  /** 对比方案与当前技能列表，给出命中和缺失的摘要。 */
  private getSkillPresetCompatibilitySummary(preset: SkillPresetRecord): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentSkillIds = new Set(this.getSkillActions(this.currentActions).map((action) => action.id));
    const presetSkillIds = new Set(preset.skills.map((skill) => skill.skillId));
    let matched = 0;
    for (const skill of preset.skills) {
      if (currentSkillIds.has(skill.skillId)) {
        matched += 1;
      }
    }
    let currentOnly = 0;
    for (const action of this.getSkillActions(this.currentActions)) {
      if (!presetSkillIds.has(action.id)) {
        currentOnly += 1;
      }
    }
    return t('action.skill-preset.summary.compatibility', {
      matched,
      total: preset.skills.length,
      currentOnly,
    });
  }

  /** 汇总当前方案名输入会如何被规整。 */
  private getSkillPresetNameDraftSummary(): string {
    const selected = this.getSelectedSkillPreset();
    const raw = this.skillPresetNameDraft;
    const sanitized = this.sanitizeSkillPresetName(raw);
    if (!raw.trim()) {
      return t('action.skill-preset.name.rule', { max: SKILL_PRESET_NAME_MAX_LENGTH });
    }
    if (!sanitized) {
      return t('action.skill-preset.name.empty-after-trim', undefined);
    }
    const usedNames = new Set(
      this.skillPresets
        .filter((preset) => preset.id !== selected?.id)
        .map((preset) => preset.name),
    );
    const resolved = this.resolveUniqueSkillPresetName(sanitized, usedNames);
    return resolved === sanitized
      ? t('action.skill-preset.name.will-save', { name: sanitized })
      : t('action.skill-preset.name.duplicate-resolved', { name: resolved });
  }

  /** 汇总当前导入文本的规模和导入规则。 */
  private getSkillPresetImportSummary(): string {
    const text = this.skillPresetImportText.trim();
    if (!text) {
      return t('action.skill-preset.import.rule', undefined);
    }
    const lineCount = text.split(/\r?\n/).length;
    const byteSize = new TextEncoder().encode(text).length;
    return t('action.skill-preset.import.summary', {
      lines: formatDisplayNumber(lineCount),
      bytes: formatDisplayNumber(byteSize),
    });
  }

  /** 把方案弹层里的结果提示渲染成状态条。 */
  private renderSkillPresetStatus(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.skillPresetStatus) {
      return '';
    }
    return `<div class="skill-preset-status ui-status-text ${this.skillPresetStatus.tone === 'error' ? 'error' : this.skillPresetStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.skillPresetStatus.text)}</div>`;
  }

  /** 渲染技能方案弹层，包含保存、导入、导出和列表。 */
  /** @internal 供子面板回调 */
  private _renderSkillPresetModal(): void {
    const currentSkills = this.getCurrentSkillPresetSnapshot();
    const selected = this.getSelectedSkillPreset();
    const currentSummary = this.getSkillPresetSummaryLine(currentSkills);
    const selectedSummary = selected ? this.getSkillPresetSummaryLine(selected.skills) : t('action.skill-preset.selected.none', undefined);
    const compatibilitySummary = selected ? this.getSkillPresetCompatibilitySummary(selected) : t('action.skill-preset.compatibility.none', undefined);

    detailModalHost.open({
      ownerId: this.SKILL_PRESET_MODAL_OWNER,
      variantClass: 'detail-modal--skill-preset',
      title: t('action.skill-preset.title', undefined),
      subtitle: t('action.skill-preset.subtitle', { presetCount: this.skillPresets.length, skillCount: currentSkills.length }),
      renderBody: (body) => {
        patchElementHtml(body, `
        <div class="skill-preset-shell ui-card-list">
          <div class="skill-preset-hero">
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">${t('action.skill-preset.save-layout.title', undefined)}</div>
              <div class="skill-preset-card-copy">${t('action.skill-preset.save-layout.copy', undefined)}</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(currentSummary)}</span>
                <span>${t('action.skill-preset.enabled-summary', { slotSummary: this.getSkillSlotSummary(this.currentActions) })}</span>
              </div>
              <div class="skill-preset-save-row">
                <input
                  class="skill-preset-name-input ui-input"
                  data-skill-preset-name-input
                  type="text"
                  maxlength="${SKILL_PRESET_NAME_MAX_LENGTH}"
                  placeholder="${t('action.skill-preset.name.placeholder', undefined)}"
                  value="${escapeHtml(this.skillPresetNameDraft)}"
                />
                <button class="small-btn" data-skill-preset-save type="button"${currentSkills.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.save-current', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-overwrite type="button"${selected && currentSkills.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.overwrite-selected', undefined)}</button>
              </div>
            </div>
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">${t('action.skill-preset.selected.title', undefined)}</div>
              <div class="skill-preset-card-copy">${selected ? escapeHtml(selectedSummary) : t('action.skill-preset.selected.empty', undefined)}</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(compatibilitySummary)}</span>
                <span>${selected ? t('action.skill-preset.export.selected-copy', undefined) : t('action.skill-preset.export.list-copy', undefined)}</span>
              </div>
              <div class="skill-preset-actions">
                <button class="small-btn" data-skill-preset-apply type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.apply-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-copy type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.copy-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-export-selected type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.export-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-export-all type="button"${this.skillPresets.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.export-all', undefined)}</button>
                <button class="small-btn danger" data-skill-preset-delete type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.delete-selected', undefined)}</button>
              </div>
            </div>
          </div>
          ${this.renderSkillPresetStatus()}
          <div class="skill-preset-layout">
            <div class="skill-preset-list-card">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">${t('action.skill-preset.list.title', undefined)}</div>
                <div class="skill-preset-list-meta">${this.skillPresets.length > 0 ? t('action.skill-preset.list.sorted-copy', undefined) : t('action.skill-preset.list.empty-meta', undefined)}</div>
              </div>
              ${this.skillPresets.length === 0
                ? `<div class="empty-hint">${t('action.skill-preset.list.empty-hint', undefined)}</div>`
                : `<div class="skill-preset-list">
                    ${this.skillPresets.map((preset) => `
                      <button
                        class="skill-preset-item ${preset.id === this.selectedSkillPresetId ? 'active' : ''}"
                        data-skill-preset-select="${escapeHtml(preset.id)}"
                        type="button"
                      >
                        <span class="skill-preset-item-name">${escapeHtml(preset.name)}</span>
                        <span class="skill-preset-item-meta">${escapeHtml(this.getSkillPresetSummaryLine(preset.skills))}</span>
                        <span class="skill-preset-item-meta">${escapeHtml(this.getSkillPresetCompatibilitySummary(preset))}</span>
                      </button>
                    `).join('')}
                  </div>`}
            </div>
            <div class="skill-preset-import-card">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">${t('action.skill-preset.import.title', undefined)}</div>
                <button class="small-btn ghost" data-skill-preset-import-file-open type="button">${t('action.skill-preset.action.read-file', undefined)}</button>
              </div>
              <div class="skill-preset-card-copy">${t('action.skill-preset.import.copy', undefined)}</div>
              <textarea
                class="skill-preset-import-input ui-textarea"
                data-skill-preset-import-input
                placeholder="${t('action.skill-preset.import.placeholder', undefined)}"
              >${escapeHtml(this.skillPresetImportText)}</textarea>
              <input class="hidden" data-skill-preset-import-file type="file" accept="text/plain,.txt,.preset,application/json,.json" />
              <div class="skill-preset-actions">
                <button class="small-btn" data-skill-preset-import type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>${t('action.skill-preset.action.import-local', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-import-clear type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>${t('action.skill-preset.action.clear-input', undefined)}</button>
              </div>
            </div>
          </div>
        </div>
      `);
      },
      onClose: () => {
        this.resetSkillPresetModalState();
      },
      onAfterRender: (body, signal) => {
        this._bindSkillPresetEvents(body, signal);
      },
    });
    this.skillPresetExternalRevision = this.buildSkillPresetExternalRevision();
  }

  /** 给技能方案弹层装配输入、保存、导入和导出事件。 */
  private _bindSkillPresetEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLInputElement>('[data-skill-preset-name-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.resetSkillPresetDeleteConfirm();
        this.skillPresetNameDraft = input.value.slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-save]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.saveCurrentSkillPreset(false);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-overwrite]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.saveCurrentSkillPreset(true);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.skillPresetSelect;
        if (!presetId) {
          return;
        }
        this.resetSkillPresetDeleteConfirm();
        this.selectedSkillPresetId = presetId;
        const preset = this.getSelectedSkillPreset();
        this.skillPresetNameDraft = preset?.name ?? this.skillPresetNameDraft;
        this.skillPresetStatus = null;
        this._renderSkillPresetModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.applySelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.copySelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-selected]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.exportSelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.exportAllSkillPresets();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        this.deleteSelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLTextAreaElement>('[data-skill-preset-import-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.resetSkillPresetDeleteConfirm();
        this.skillPresetImportText = input.value;
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.skillPresetImportText = '';
        this.skillPresetStatus = null;
        this._renderSkillPresetModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.importSkillPresetsFromText(this.skillPresetImportText);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelector<HTMLInputElement>('[data-skill-preset-import-file]')?.click();
      }, { signal });
    });
    root.querySelectorAll<HTMLInputElement>('[data-skill-preset-import-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
          return;
        }
        try {
          this.skillPresetImportText = await file.text();
          this.skillPresetStatus = {
            tone: 'info',
            text: t('action.skill-preset.status.file-read', { fileName: file.name }),
          };
          this._renderSkillPresetModal();
        } catch {
          this.skillPresetStatus = {
            tone: 'error',
            text: t('action.skill-preset.status.file-read-failed', undefined),
          };
          this._renderSkillPresetModal();
        } finally {
          input.value = '';
        }
      }, { signal });
    });
  }

  /** 把当前技能快照保存成新方案，或覆盖选中的方案。 */
  private saveCurrentSkillPreset(overwriteSelected: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const snapshot = this.getCurrentSkillPresetSnapshot();
    if (snapshot.length === 0) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.no-savable-skills', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }
    const selected = this.getSelectedSkillPreset();
    const inputName = this.sanitizeSkillPresetName(this.skillPresetNameDraft);
    if (!inputName && !overwriteSelected) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.name-required', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }

    if (overwriteSelected && selected) {
      const nextName = inputName || selected.name;
      const updatedPreset: SkillPresetRecord = {
        ...selected,
        name: nextName,
        skills: snapshot,
      };
      this.skillPresets = [
        updatedPreset,
        ...this.skillPresets.filter((preset) => preset.id !== selected.id),
      ];
      this.selectedSkillPresetId = selected.id;
      this.skillPresetNameDraft = nextName;
      this.skillPresetStatus = {
        tone: 'success',
        text: t('action.skill-preset.status.overwritten', { name: nextName }),
      };
    } else {
      const usedNames = new Set(this.skillPresets.map((preset) => preset.name));
      const nextName = this.resolveUniqueSkillPresetName(inputName || this.buildDefaultSkillPresetName(), usedNames);
      const preset: SkillPresetRecord = {
        id: this.generateSkillPresetId(),
        name: nextName,
        skills: snapshot,
      };
      this.skillPresets = [preset, ...this.skillPresets];
      this.selectedSkillPresetId = preset.id;
      this.skillPresetNameDraft = nextName;
      this.skillPresetStatus = {
        tone: 'success',
        text: t('action.skill-preset.status.saved', { name: nextName }),
      };
    }

    this.saveSkillPresets();
    this._renderSkillPresetModal();
  }

  /** 把方案内容转换成可直接应用的自动战斗配置。 */
  private resolveAppliedSkillPresetConfigs(preset: SkillPresetRecord): AutoBattleSkillConfig[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentSkillActions = this.getSkillActions(this.currentActions);
    const currentMap = new Map(currentSkillActions.map((action) => [action.id, action] as const));
    const next: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();

    for (const skill of preset.skills) {
      if (seen.has(skill.skillId) || !currentMap.has(skill.skillId)) {
        continue;
      }
      next.push({
        skillId: skill.skillId,
        enabled: skill.enabled !== false,
        skillEnabled: true,
      });
      seen.add(skill.skillId);
    }

    for (const action of currentSkillActions) {
      if (seen.has(action.id)) {
        continue;
      }
      next.push({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: false,
      });
      seen.add(action.id);
    }

    return next;
  }

  /** 提交套用后的技能配置，并同步回预览角色和面板。 */
  private commitSkillPresetActions(nextActions: ActionDef[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextAutoBattleSkills = this.getAutoBattleSkillConfigs(nextActions);
    this.currentActions = nextActions;
    if (this.previewPlayer) {
      this.previewPlayer.actions = this.currentActions.filter((action) => action.id !== 'client:observe');
      this.previewPlayer.autoBattleSkills = nextAutoBattleSkills;
    }
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillPresetExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.bindingActionId = null;
    this.clearDragState();
    this.render(this.currentActions);
    this.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  /** 套用当前选中的技能方案。 */
  private applySelectedSkillPreset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.select-first', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }
    const previousDraft = this.skillManagementDraft;
    this.skillManagementDraft = this.resolveAppliedSkillPresetConfigs(preset);
    const nextActions = this.getSkillManagementPreviewActions();
    this.skillManagementDraft = previousDraft;
    this.commitSkillPresetActions(nextActions);
    this.skillPresetStatus = {
      tone: 'success',
      text: t('action.skill-preset.status.applied', { name: preset.name }),
    };
    this._renderSkillPresetModal();
  }

  /** 把选中方案的导出文本复制到剪贴板。 */
  private async copySelectedSkillPreset(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.select-first', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }
    const text = this.buildSkillPresetExportText([preset]);
    if (!navigator.clipboard?.writeText) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.clipboard-unsupported', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.skillPresetStatus = {
        tone: 'success',
        text: t('action.skill-preset.status.copied', { name: preset.name }),
      };
    } catch {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.copy-failed', undefined),
      };
    }
    this._renderSkillPresetModal();
  }

  /** 导出当前选中的技能方案。 */
  private exportSelectedSkillPreset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      return;
    }
    this.downloadSkillPresetPayload(`${preset.name}.txt`, this.buildSkillPresetExportText([preset]));
    this.skillPresetStatus = {
      tone: 'success',
      text: t('action.skill-preset.status.exported', { name: preset.name }),
    };
    this._renderSkillPresetModal();
  }

  /** 导出全部本地技能方案。 */
  private exportAllSkillPresets(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillPresets.length === 0) {
      return;
    }
    this.downloadSkillPresetPayload('skill-presets.txt', this.buildSkillPresetExportText(this.skillPresets));
    this.skillPresetStatus = {
      tone: 'success',
      text: t('action.skill-preset.status.exported-all', { count: this.skillPresets.length }),
    };
    this._renderSkillPresetModal();
  }

  /** 删除当前选中的技能方案。 */
  private deleteSelectedSkillPreset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      return;
    }
    if (!window.confirm(t('action.skill-preset.confirm.delete', { name: preset.name }))) {
      return;
    }
    this.skillPresets = this.skillPresets.filter((entry) => entry.id !== preset.id);
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    this.skillPresetNameDraft = this.getSelectedSkillPreset()?.name ?? this.buildDefaultSkillPresetName();
    this.skillPresetStatus = {
      tone: 'success',
      text: t('action.skill-preset.status.deleted', { name: preset.name }),
    };
    this.saveSkillPresets();
    this._renderSkillPresetModal();
  }

  /** 从键值文本或旧 JSON 中导入技能方案。 */
  private importSkillPresetsFromText(rawText: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const text = rawText.trim();
    if (!text) {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.import-empty', undefined),
      };
      this._renderSkillPresetModal();
      return;
    }
    try {
      const importOptions = {
        existingNames: new Set(this.skillPresets.map((preset) => preset.name)),
      };
      const imported = this.parseSkillPresetText(text, importOptions);
      if (imported.length === 0) {
        const parsed = JSON.parse(text) as unknown;
        imported.push(...this.parseSkillPresetCollection(parsed, importOptions));
      }
      if (imported.length === 0) {
        this.skillPresetStatus = {
          tone: 'error',
          text: t('action.skill-preset.status.import-no-valid', undefined),
        };
        this._renderSkillPresetModal();
        return;
      }
      this.skillPresets = [...imported, ...this.skillPresets];
      this.selectedSkillPresetId = imported[0]?.id ?? this.selectedSkillPresetId;
      this.skillPresetNameDraft = imported[0]?.name ?? this.buildDefaultSkillPresetName();
      this.skillPresetStatus = {
        tone: 'success',
        text: t('action.skill-preset.status.imported', { count: imported.length }),
      };
      this.saveSkillPresets();
      this._renderSkillPresetModal();
    } catch {
      this.skillPresetStatus = {
        tone: 'error',
        text: t('action.skill-preset.status.import-invalid', undefined),
      };
      this._renderSkillPresetModal();
    }
  }

  /** 按当前筛选和排序取出可见技能的 id 顺序。 */
  private getSortedSkillManagementActionIds(): string[] {
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(previewActions));
    const visibleEntries = this.skillManagementTab === 'auto'
      ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false)
      : this.skillManagementTab === 'manual'
        ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false)
        : skillEntries.filter((entry) => entry.action.skillEnabled === false);
    return this.sortSkillManagementEntries(visibleEntries).map((entry) => entry.action.id);
  }

  /** 只重排被选中的那一段技能，其他位置保持原样。 */
  private reorderSkillManagementSubset(skills: ActionDef[], orderedIds: string[]): ActionDef[] {
    const subset = new Set(orderedIds);
    const orderedActions = orderedIds
      .map((id) => skills.find((action) => action.id === id))
      .filter((action): action is ActionDef => Boolean(action));
    let nextIndex = 0;
    return skills.map((action) => (
      subset.has(action.id)
        ? (orderedActions[nextIndex++] ?? action)
        : action
    ));
  }

  /** 把草稿和当前技能列表对齐，补齐缺失项并去重。 */
  private syncSkillManagementDraft(): AutoBattleSkillConfig[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentSkillActions = this.getSkillActions(this.currentActions);
    const availableIds = new Set(currentSkillActions.map((action) => action.id));
    const source = this.skillManagementDraft ?? this.getAutoBattleSkillConfigs(this.currentActions);
    const normalized: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();

    for (const entry of source) {
      if (seen.has(entry.skillId) || !availableIds.has(entry.skillId)) {
        continue;
      }
      normalized.push({
        skillId: entry.skillId,
        enabled: entry.enabled !== false,
        skillEnabled: entry.skillEnabled !== false,
      });
      seen.add(entry.skillId);
    }

    for (const action of currentSkillActions) {
      if (seen.has(action.id)) {
        continue;
      }
      normalized.push({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      });
      seen.add(action.id);
    }

    const nextDraft = this.normalizeSkillConfigs(normalized);
    this.skillManagementDraft = nextDraft;
    return nextDraft;
  }

  /** 把草稿套进当前动作快照，生成弹层里的预览列表。 */
  private getSkillManagementPreviewActions(): ActionDef[] {
    const draft = this.syncSkillManagementDraft();
    const draftMap = new Map(draft.map((entry, index) => [entry.skillId, { entry, index }]));
    const skillActions = this.normalizeSkillActions(
      this.getSkillActions(this.currentActions)
      .map((action) => {
        const draftEntry = draftMap.get(action.id);
        if (!draftEntry) {
          return {
            ...action,
            autoBattleEnabled: action.autoBattleEnabled !== false,
            skillEnabled: action.skillEnabled !== false,
          };
        }
        return {
          ...action,
          autoBattleEnabled: draftEntry.entry.enabled !== false,
          skillEnabled: draftEntry.entry.skillEnabled !== false,
          autoBattleOrder: draftEntry.index,
        };
      })
      .sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER)),
    );
    return this.replaceSkillActions(skillActions);
  }

  /** 生成技能管理弹层的外部变更摘要。 */
  private buildSkillManagementExternalRevision(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parts = [
      String(this.getSkillSlotLimit()),
      this.skillManagementSortField,
      this.skillManagementSortDirection,
      [...this.skillManagementFilterToggles].sort().join(','),
    ];
    const includeMeleeRanged = this.skillManagementFilterToggles.has('melee') || this.skillManagementFilterToggles.has('ranged');
    const includeDamageKind = this.skillManagementFilterToggles.has('physical') || this.skillManagementFilterToggles.has('spell');
    const includeTargetKind = this.skillManagementFilterToggles.has('single') || this.skillManagementFilterToggles.has('aoe');
    const needsMetrics = includeMeleeRanged || includeDamageKind || includeTargetKind || this.skillManagementSortField !== 'custom';
    for (const action of this.getSkillActions(this.currentActions)) {
      parts.push(action.id);
      parts.push(action.name);
      parts.push(stripSectManagementData(action.desc));
      parts.push(typeof action.range === 'number' ? String(action.range) : '');
      parts.push(action.autoBattleEnabled !== false ? '1' : '0');
      parts.push(action.skillEnabled !== false ? '1' : '0');
      if (!needsMetrics) {
        continue;
      }
      const metrics = this.buildSkillManagementMetrics(action);
      if (includeMeleeRanged) {
        parts.push(metrics.isMelee ? '1' : '0');
        parts.push(metrics.isRanged ? '1' : '0');
      }
      if (includeDamageKind) {
        parts.push(metrics.hasPhysicalDamage ? '1' : '0');
        parts.push(metrics.hasSpellDamage ? '1' : '0');
      }
      if (includeTargetKind) {
        parts.push(metrics.isSingleTarget ? '1' : '0');
        parts.push(metrics.isAreaTarget ? '1' : '0');
      }
      switch (this.skillManagementSortField) {
        case 'actualDamage':
          parts.push(String(metrics.actualDamage ?? ''));
          break;
        case 'qiCost':
          parts.push(String(metrics.actualQiCost));
          break;
        case 'range':
          parts.push(String(metrics.range));
          break;
        case 'targetCount':
          parts.push(String(metrics.targetCount));
          break;
        case 'cooldown':
          parts.push(String(metrics.cooldown));
          break;
        default:
          break;
      }
    }
    return parts.join('\u0001');
  }

  /** 记录技能管理列表当前的滚动位置。 */
  private captureSkillManagementListScroll(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const list = document.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) {
      return;
    }
    this.skillManagementListScrollTop = list.scrollTop;
  }

  /** 在弹层重绘后恢复技能管理列表的滚动位置。 */
  private restoreSkillManagementListScroll(root: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const list = root.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) {
      return;
    }
    list.scrollTop = this.skillManagementListScrollTop;
  }

  /** 仅在技能管理弹层已打开且内容变化时重绘。 */
  private renderSkillManagementModalIfOpen(): void {
    this.skillMgmt.renderSkillManagementModalIfOpen();
  }

  /** 仅在技能方案弹层已打开且内容变化时重绘。 */
  private renderSkillPresetModalIfOpen(): void {
    this.skillMgmt.renderSkillPresetModalIfOpen();
  }

  /** 渲染技能管理弹层，包含分组、筛选、排序和批量操作。 */
  /** @internal 供子面板回调 */
  private _renderSkillManagementModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (detailModalHost.isOpenFor(this.SKILL_MANAGEMENT_MODAL_OWNER)) {
      this.captureSkillManagementListScroll();
    }
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getSkillManagementEntries(previewActions);
    const filteredEntries = this.getFilteredSkillManagementEntries(skillEntries);
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(previewActions);
    const autoEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false);
    const manualEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false);
    const disabledEntries = filteredEntries.filter((entry) => entry.action.skillEnabled === false);
    const slotSummary = this.getSkillSlotSummary(previewActions);
    const visibleEntries = this.sortSkillManagementEntries(
      this.skillManagementTab === 'auto'
        ? autoEntries
        : this.skillManagementTab === 'manual'
          ? manualEntries
          : disabledEntries,
    );
    const dragSortEnabled = this.skillManagementTab === 'auto'
      && this.skillManagementSortField === 'custom'
      && visibleEntries.length > 1;
    const hint = this.buildSkillManagementHint(dragSortEnabled, slotSummary);

    detailModalHost.open({
      ownerId: this.SKILL_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--skill-management',
      title: t('action.skill.manage', undefined),
      subtitle: t('action.skill.manage.subtitle', {
        skillCount: skillEntries.length,
        slotSummary,
        filteredCount: filteredEntries.length,
      }),
      renderBody: (body) => {
        patchElementHtml(body, `
        <div class="skill-manage-shell ui-card-list">
          <div class="skill-manage-topbar">
            <div class="action-skill-subtabs skill-manage-subtabs">
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'auto' ? 'active' : ''}" data-skill-manage-tab="auto" type="button">
                ${t('action.skill.tab.auto', undefined)}
                <span class="action-skill-subtab-count">${autoEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'manual' ? 'active' : ''}" data-skill-manage-tab="manual" type="button">
                ${t('action.skill.tab.manual', undefined)}
                <span class="action-skill-subtab-count">${manualEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'disabled' ? 'active' : ''}" data-skill-manage-tab="disabled" type="button">
                ${t('action.skill.manage.tab.disabled', undefined)}
                <span class="action-skill-subtab-count">${disabledEntries.length}</span>
              </button>
            </div>
            <div class="skill-manage-toolbar">
              <button class="small-btn" data-skill-manage-apply type="button">${t('common.action.execute', undefined)}</button>
              <button class="small-btn ghost" data-skill-manage-cancel type="button">${t('common.action.cancel', undefined)}</button>
              <button class="small-btn ghost ${this.skillManagementSortOpen ? 'active' : ''}" data-skill-manage-sort-toggle type="button">
                ${this.skillManagementSortOpen ? t('action.skill.manage.sort.close', undefined) : t('action.skill.manage.sort.open', undefined)}
              </button>
              <button class="small-btn ghost ${this.skillManagementFilterOpen ? 'active' : ''}" data-skill-manage-filter-toggle type="button">
                ${this.skillManagementFilterOpen ? t('action.skill.manage.filter.close', undefined) : t('action.skill.manage.filter.open', undefined)}
              </button>
            </div>
          </div>
          <div class="skill-manage-summary">
            <span>${t('action.skill.manage.summary.enabled', { slotSummary })}</span>
            <span>${t('action.skill.manage.summary.filtered', { count: filteredEntries.length })}</span>
            <span>${t('action.skill.manage.summary.auto', { count: autoEntries.length })}</span>
            <span>${t('action.skill.manage.summary.manual', { count: manualEntries.length })}</span>
            <span>${t('action.skill.manage.summary.disabled', { count: disabledEntries.length })}</span>
          </div>
          ${this.skillManagementSortOpen ? this.renderSkillManagementSortPanel() : ''}
          ${this.skillManagementFilterOpen ? `
            <div class="skill-manage-filter-panel">
              <div class="skill-manage-filter-head">
                <div class="skill-manage-filter-title">${t('action.skill.manage.filter.title', undefined)}</div>
                <button class="small-btn ghost" data-skill-manage-filter-all type="button">${t('action.skill.manage.filter.all', undefined)}</button>
              </div>
              <div class="skill-manage-chip-group">
                <span class="skill-manage-chip-group-title">${t('action.skill.manage.filter.tags', undefined)}</span>
                <div class="skill-manage-chip-row">
                  ${this.renderSkillManagementChipToggle('melee', t('action.skill.manage.filter.melee', undefined))}
                  ${this.renderSkillManagementChipToggle('ranged', t('action.skill.manage.filter.ranged', undefined))}
                  ${this.renderSkillManagementChipToggle('physical', t('action.skill.manage.filter.physical', undefined))}
                  ${this.renderSkillManagementChipToggle('spell', t('action.skill.manage.filter.spell', undefined))}
                  ${this.renderSkillManagementChipToggle('single', t('action.skill.manage.filter.single', undefined))}
                  ${this.renderSkillManagementChipToggle('aoe', t('action.skill.manage.filter.aoe', undefined))}
                </div>
              </div>
              <div class="skill-manage-filter-copy">${t('action.skill.manage.filter.copy', undefined)}</div>
            </div>
          ` : ''}
          <div class="skill-manage-batch">
            <button class="small-btn" data-skill-manage-bulk="auto" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.auto', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="manual" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.manual', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="enabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.enabled', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="disabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.disabled', undefined)}</button>
          </div>
          <div class="action-section-hint">${hint}</div>
          ${visibleEntries.length === 0
            ? `<div class="empty-hint">${escapeHtml(this.getSkillManagementEmptyStateText())}</div>`
            : `<div class="action-skill-list skill-manage-list">
              ${visibleEntries.map((entry) => this.renderSkillManagementItem(entry.action, {
                showDragHandle: dragSortEnabled,
                autoBattleDisplayOrder: this.skillManagementTab === 'auto'
                  ? (autoBattleDisplayOrders.get(entry.action.id) ?? null)
                  : null,
                canMoveUp: this.skillManagementSortField === 'custom' && visibleEntries.indexOf(entry) > 0,
                canMoveDown: this.skillManagementSortField === 'custom' && visibleEntries.indexOf(entry) < visibleEntries.length - 1,
              }, entry.metrics)).join('')}
            </div>`}
        </div>
      `);
      },
      onRequestClose: () => this.confirmDiscardSkillManagementChanges(),
      onClose: () => {
        this.discardSkillManagementDraft();
      },
      onAfterRender: (body, signal) => {
        this._bindSkillManagementEvents(body, signal);
        this.bindTooltips(body, signal);
        this.restoreSkillManagementListScroll(body);
      },
    });
    this.skillManagementExternalRevision = this.buildSkillManagementExternalRevision();
  }

  /** 给技能管理弹层装配分组切换、筛选、排序和应用事件。 */
  private _bindSkillManagementEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applySkillManagementChanges();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        this.cancelSkillManagementChanges();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.skillManageTab as SkillManagementTab | undefined;
        if (!tab) return;
        this.skillManagementTab = tab;
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.skillManagementSortOpen = !this.skillManagementSortOpen;
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-field-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortFieldToggle as SkillManagementSortField | undefined;
        if (!value) return;
        if (value === this.skillManagementSortField) {
          return;
        }
        if (value === 'custom' && this.skillManagementSortField !== 'custom') {
          this.applySkillManagementSortOrder(false, false);
        }
        this.skillManagementSortField = value;
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-direction-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortDirectionToggle as SkillManagementSortDirection | undefined;
        if (!value) return;
        this.skillManagementSortDirection = value;
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.skillManagementFilterOpen = !this.skillManagementFilterOpen;
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-toggle-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageFilterToggleChip as SkillManagementFilterToggle | undefined;
        if (!value) return;
        if (this.skillManagementFilterToggles.has(value)) {
          this.skillManagementFilterToggles.delete(value);
        } else {
          this.skillManagementFilterToggles.add(value);
        }
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillManagementFilters();
        this._renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-move-up], [data-skill-manage-move-down]').forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.skillManageMoveUp ?? button.dataset.skillManageMoveDown;
        if (!actionId) {
          return;
        }
        const position = button.dataset.skillManageMoveUp ? 'before' : 'after';
        const visibleEntries = this.sortSkillManagementEntries(
          this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions())),
        ).filter((entry) => (
          this.skillManagementTab === 'disabled'
            ? entry.action.skillEnabled === false
            : this.skillManagementTab === 'auto'
              ? entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false
              : entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false
        ));
        const currentIndex = visibleEntries.findIndex((entry) => entry.action.id === actionId);
        if (currentIndex < 0) {
          return;
        }
        const targetId = position === 'before'
          ? (visibleEntries[currentIndex - 1]?.action.id ?? null)
          : (visibleEntries[currentIndex + 1]?.action.id ?? null);
        if (!targetId) {
          return;
        }
        this.moveSkillManagementSkill(actionId, targetId, position);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-bulk]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.skillManageBulk as SkillManagementBulkMode | undefined;
        if (!mode || !['auto', 'manual', 'enabled', 'disabled'].includes(mode)) {
          return;
        }
        this.applySkillManagementBulkMode(mode);
      }, { signal });
    });
    this.bindSkillManagementAutoToggleEvents(root, signal);
    this.bindSkillManagementEnabledToggleEvents(root, signal);
    this.bindSkillManagementDragEvents(root, signal);
  }

  /** 把当前过滤结果批量切成自动、手动、启用或禁用。 */
  private applySkillManagementBulkMode(mode: SkillManagementBulkMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const filteredSkillIds = new Set(
      this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions()))
        .map((entry) => entry.action.id),
    );
    if (filteredSkillIds.size === 0) {
      this.skillManagementStatus = {
        tone: 'error',
        text: t('action.skill.manage.bulk.empty', undefined),
      };
      this._renderSkillManagementModal();
      return;
    }
    const label = ({
      auto: t('action.skill.manage.bulk.auto-label', undefined),
      manual: t('action.skill.manage.bulk.manual-label', undefined),
      enabled: t('action.skill.manage.bulk.enabled-label', undefined),
      disabled: t('action.skill.manage.bulk.disabled-label', undefined),
    } satisfies Record<SkillManagementBulkMode, string>)[mode];
    this.skillManagementStatus = {
      tone: 'success',
      text: t('action.skill.manage.bulk.done', { count: filteredSkillIds.size, label }),
    };
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      filteredSkillIds.has(action.id)
        ? mode === 'enabled'
          ? { ...action, skillEnabled: true }
          : mode === 'disabled'
            ? { ...action, skillEnabled: false }
            : { ...action, autoBattleEnabled: mode === 'auto' }
        : action
    )));
  }

  /** 把技能动作和管理指标整理成可排序条目。 */
  private getSkillManagementEntries(actions: ActionDef[]): SkillManagementEntry[] {
    return this.getSkillActions(actions).map((action) => ({
      action,
      metrics: this.buildSkillManagementMetrics(action),
    }));
  }

  /** 计算技能管理里要用的预览指标；没有上下文时走保底值。 */
  private buildSkillManagementMetrics(action: ActionDef): SkillPreviewMetrics {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const context = this.skillLookup.get(action.id);
    if (!context) {
      const range = Number.isFinite(action.range) ? Number(action.range) : 0;
      return {
        actualDamage: null,
        actualQiCost: 0,
        range,
        targetCount: 1,
        cooldown: action.cooldownLeft,
        hasPhysicalDamage: false,
        hasSpellDamage: false,
        isSingleTarget: true,
        isAreaTarget: false,
        isMelee: range <= 1,
        isRanged: range > 1,
      };
    }
    return summarizeSkillPreviewMetrics(context.skill, {
      techLevel: context.techLevel,
      player: this.previewPlayer,
      knownSkills: context.knownSkills,
    });
  }

  /** 按当前筛选标签过滤技能管理条目。 */
  private getFilteredSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
    return entries.filter((entry) => {
      if (!this.matchesSkillManagementToggleGroup(entry, ['single', 'aoe'])) {
        return false;
      }
      if (!this.matchesSkillManagementToggleGroup(entry, ['physical', 'spell'])) {
        return false;
      }
      if (!this.matchesSkillManagementToggleGroup(entry, ['melee', 'ranged'])) {
        return false;
      }
      return true;
    });
  }

  /** 判断一组筛选标签是否命中当前条目。 */
  /** 判断一组筛选标签是否命中当前条目。 */
  private matchesSkillManagementToggleGroup(
    entry: SkillManagementEntry,
    group: SkillManagementFilterToggle[],
  ): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const active = group.filter((value) => this.skillManagementFilterToggles.has(value));
    if (active.length === 0) {
      return true;
    }
    return active.some((value) => this.matchesSkillManagementToggle(entry.metrics, value));
  }

  /** 判断某个指标是否命中单个筛选条件。 */
  private matchesSkillManagementToggle(metrics: SkillPreviewMetrics, toggle: SkillManagementFilterToggle): boolean {
    switch (toggle) {
      case 'melee':
        return metrics.isMelee;
      case 'ranged':
        return metrics.isRanged;
      case 'physical':
        return metrics.hasPhysicalDamage;
      case 'spell':
        return metrics.hasSpellDamage;
      case 'single':
        return metrics.isSingleTarget;
      case 'aoe':
        return metrics.isAreaTarget;
      default:
        return true;
    }
  }

  /** 按当前排序字段和方向排列技能管理条目。 */
  private sortSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementSortField === 'custom') {
      return entries;
    }
    const factor = this.skillManagementSortDirection === 'asc' ? 1 : -1;
    const next = [...entries];
    next.sort((left, right) => {
      const valueDiff = this.compareSkillManagementEntry(left, right);
      if (valueDiff !== 0) {
        return valueDiff * factor;
      }
      return left.action.name.localeCompare(right.action.name, 'zh-Hans-CN');
    });
    return next;
  }

  /** 比较两个技能管理条目的排序值，空值会排到后面。 */
  private compareSkillManagementEntry(left: SkillManagementEntry, right: SkillManagementEntry): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const leftValue = this.getSkillManagementSortValue(left.metrics);
    const rightValue = this.getSkillManagementSortValue(right.metrics);
    const leftMissing = leftValue === null || !Number.isFinite(leftValue);
    const rightMissing = rightValue === null || !Number.isFinite(rightValue);
    if (leftMissing && rightMissing) {
      return 0;
    }
    if (leftMissing) {
      return 1;
    }
    if (rightMissing) {
      return -1;
    }
    if (leftValue === rightValue) {
      return 0;
    }
    return leftValue < rightValue ? -1 : 1;
  }

  /** 读取当前排序字段对应的数值。 */
  private getSkillManagementSortValue(metrics: SkillPreviewMetrics): number | null {
    switch (this.skillManagementSortField) {
      case 'actualDamage':
        return metrics.actualDamage;
      case 'qiCost':
        return metrics.actualQiCost;
      case 'range':
        return metrics.range;
      case 'targetCount':
        return metrics.targetCount;
      case 'cooldown':
        return metrics.cooldown;
      default:
        return null;
    }
  }

  /** 渲染技能管理里的排序面板、方向和应用说明。 */
  private renderSkillManagementSortPanel(): string {
    return `
      <div class="skill-manage-sort-panel">
        <div class="skill-manage-filter-head">
          <div class="skill-manage-filter-title">${t('action.skill.manage.sort.title', undefined)}</div>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">${t('action.skill.manage.sort.field-title', undefined)}</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementSortChip('custom', t('action.skill.manage.sort.field.custom', undefined))}
            ${this.renderSkillManagementSortChip('actualDamage', t('action.skill.manage.sort.field.actual-damage', undefined))}
            ${this.renderSkillManagementSortChip('qiCost', t('action.skill.manage.sort.field.qi-cost', undefined))}
            ${this.renderSkillManagementSortChip('range', t('action.skill.manage.sort.field.range', undefined))}
            ${this.renderSkillManagementSortChip('targetCount', t('action.skill.manage.sort.field.target-count', undefined))}
            ${this.renderSkillManagementSortChip('cooldown', t('action.skill.manage.sort.field.cooldown', undefined))}
          </div>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">${t('action.skill.manage.sort.direction-title', undefined)}</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementDirectionChip('desc', t('action.skill.manage.sort.direction.desc', undefined))}
            ${this.renderSkillManagementDirectionChip('asc', t('action.skill.manage.sort.direction.asc', undefined))}
          </div>
        </div>
        <div class="skill-manage-filter-copy ui-form-copy">${this.skillManagementTab === 'disabled'
          ? t('action.skill.manage.sort.copy.disabled', undefined)
          : this.skillManagementSortField === 'custom'
            ? t('action.skill.manage.sort.copy.custom', undefined)
            : t('action.skill.manage.sort.copy.sorted', undefined)}</div>
      </div>
    `;
  }

  /** 生成技能管理列表上方的操作提示。 */
  private buildSkillManagementHint(dragSortEnabled: boolean, slotSummary: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementTab === 'disabled') {
      return t('action.skill.manage.hint.disabled', { slotSummary });
    }
    if (this.skillManagementSortField !== 'custom') {
      return t('action.skill.manage.hint.sorted', { slotSummary });
    }
    if (dragSortEnabled) {
      return t('action.skill.manage.hint.drag', { slotSummary });
    }
    return this.skillManagementTab === 'auto'
      ? t('action.skill.manage.hint.auto', { slotSummary })
      : t('action.skill.manage.hint.manual', { slotSummary });
  }

  /** 渲染当前排序字段对应的指标读数。 */
  private renderSkillManagementMetricReadout(metrics: SkillPreviewMetrics): string | null {
    switch (this.skillManagementSortField) {
      case 'actualDamage':
        return metrics.actualDamage === null
          ? t('action.skill.manage.metric.damage-unknown', undefined)
          : t('action.skill.manage.metric.damage', { value: formatDisplayNumber(metrics.actualDamage) });
      case 'qiCost':
        return t('action.skill.manage.metric.qi-cost', { value: formatDisplayNumber(metrics.actualQiCost) });
      default:
        return null;
    }
  }

  /** 渲染排序字段按钮。 */
  private renderSkillManagementSortChip(value: SkillManagementSortField, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortField === value ? 'active' : ''}" data-skill-manage-sort-field-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  /** 渲染排序方向按钮。 */
  private renderSkillManagementDirectionChip(value: SkillManagementSortDirection, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortDirection === value ? 'active' : ''}" data-skill-manage-sort-direction-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  /** 渲染筛选标签按钮。 */
  private renderSkillManagementChipToggle(value: SkillManagementFilterToggle, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementFilterToggles.has(value) ? 'active' : ''}" data-skill-manage-filter-toggle-chip="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  /** 清空所有筛选标签。 */
  private resetSkillManagementFilters(): void {
    this.skillManagementFilterToggles.clear();
  }

  /** 把管理弹层里的草稿正式写回当前状态并关闭弹层。 */
  private applySkillManagementChanges(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementSortField !== 'custom') {
      this.applySkillManagementSortOrder(false, false);
    }
    const nextActions = this.getSkillManagementPreviewActions();
    const nextAutoBattleSkills = this.getAutoBattleSkillConfigs(nextActions);
    this.currentActions = nextActions;
    if (this.previewPlayer) {
      this.previewPlayer.actions = this.currentActions.filter((action) => action.id !== 'client:observe');
      this.previewPlayer.autoBattleSkills = nextAutoBattleSkills;
    }
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.bindingActionId = null;
    this.clearDragState();
    detailModalHost.close(this.SKILL_MANAGEMENT_MODAL_OWNER);
    this.render(this.currentActions);
    this.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  /** 放弃技能管理草稿并关闭弹层。 */
  private cancelSkillManagementChanges(): void {
    this.discardSkillManagementDraft();
    detailModalHost.close(this.SKILL_MANAGEMENT_MODAL_OWNER);
  }

  /** 清掉技能管理草稿、拖拽态和滚动位置。 */
  private discardSkillManagementDraft(): void {
    this.resetSkillManagementCloseConfirm();
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.bindingActionId = null;
    this.clearDragState();
  }

  /** 把当前排序结果写回技能管理草稿顺位。 */
  private applySkillManagementSortOrder(rerender = true, notify = true): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementTab === 'disabled' || this.skillManagementSortField === 'custom') {
      if (notify) {
        this.skillManagementStatus = {
          tone: 'error',
          text: t('action.skill.manage.sort.error.unsupported', undefined),
        };
        this._renderSkillManagementModal();
      }
      return false;
    }
    const orderedIds = this.getSortedSkillManagementActionIds();
    if (orderedIds.length <= 1) {
      if (notify) {
        this.skillManagementStatus = {
          tone: 'error',
          text: t('action.skill.manage.sort.error.not-enough', undefined),
        };
        this._renderSkillManagementModal();
      }
      return false;
    }
    if (notify) {
      const sortLabel = ({
        actualDamage: t('action.skill.manage.sort.field.actual-damage', undefined),
        qiCost: t('action.skill.manage.sort.field.qi-cost', undefined),
        range: t('action.skill.manage.sort.field.range', undefined),
        targetCount: t('action.skill.manage.sort.field.target-count', undefined),
        cooldown: t('action.skill.manage.sort.field.cooldown', undefined),
        custom: t('action.skill.manage.sort.field.custom', undefined),
      } satisfies Record<SkillManagementSortField, string>)[this.skillManagementSortField];
      this.skillManagementStatus = {
        tone: 'success',
        text: t('action.skill.manage.sort.done', {
          sortLabel,
          sortDirection: this.skillManagementSortDirection === 'asc'
            ? t('action.skill.manage.sort.direction.asc', undefined)
            : t('action.skill.manage.sort.direction.desc', undefined),
        }),
      };
    }
    this.applySkillManagementDraftMutation(
      (skills) => this.reorderSkillManagementSubset(skills, orderedIds),
      rerender,
    );
    return true;
  }

  /** 渲染技能管理弹层里的单条技能。 */
  private renderSkillManagementItem(
    action: ActionDef,
    options?: {    
    /**
 * showDragHandle：showDragHandle相关字段。
 */

      showDragHandle?: boolean;      
      /**
 * autoBattleDisplayOrder：autoBattle显示订单相关字段。
 */

      autoBattleDisplayOrder?: number | null;
      /**
 * moveUpTargetId：上移目标相关字段。
 */

      canMoveUp?: boolean;
      /**
 * canMoveDown：是否可下移。
 */

      canMoveDown?: boolean;
    },
    metrics?: SkillPreviewMetrics,
  ): string {
    const skillContext = this.skillLookup.get(action.id);
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
    const autoBattleEnabled = action.autoBattleEnabled !== false;
    const skillEnabled = action.skillEnabled !== false;
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
    const rowAttrs = options?.showDragHandle ? ` data-skill-manage-skill-row="${action.id}"` : '';
    const canMoveUp = options?.canMoveUp === true;
    const canMoveDown = options?.canMoveDown === true;
    const metricReadout = metrics ? this.renderSkillManagementMetricReadout(metrics) : '';
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item action-item-draggable" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">${t('action.card.skill-type', undefined)}</span>
          ${typeof action.range === 'number' ? `<span class="action-type">${t('action.range', { range: action.range })}</span>` : ''}
          <span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
          <span class="action-type ${skillEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${skillEnabled ? t('action.skill.manage.skill-enabled.enabled', undefined) : t('action.skill.manage.skill-enabled.disabled', undefined)}</span>
          ${autoBattleOrder ? `<span class="action-type">${t('action.skill.order', { order: autoBattleOrder })}</span>` : ''}
        </div>
        <div class="action-desc">${escapeHtml(stripSectManagementData(action.desc))}</div>
        ${affinityChip}
      </div>
      <div class="action-cta">
        ${metricReadout ? `<span class="skill-manage-metric-readout">${escapeHtml(metricReadout)}</span>` : ''}
        <button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-skill-manage-auto-toggle="${action.id}" type="button">${t('action.skill.manage.toggle.auto', { state: autoBattleEnabled ? t('common.state.on') : t('common.state.off') })}</button>
        <button class="small-btn ghost ${skillEnabled ? 'active' : ''}" data-skill-manage-enabled-toggle="${action.id}" type="button">${t('action.skill.manage.toggle.enabled', { state: skillEnabled ? t('common.state.on') : t('common.state.off') })}</button>
        <button class="small-btn ghost" data-skill-manage-move-up="${action.id}" type="button"${canMoveUp ? '' : ' disabled'}>${t('action.skill.manage.move-up', undefined)}</button>
        <button class="small-btn ghost" data-skill-manage-move-down="${action.id}" type="button"${canMoveDown ? '' : ' disabled'}>${t('action.skill.manage.move-down', undefined)}</button>
        ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-skill-manage-drag="${action.id}" draggable="true" type="button">${t('common.action.drag', undefined)}</button>` : ''}
      </div>
    </div>`;
  }
}
