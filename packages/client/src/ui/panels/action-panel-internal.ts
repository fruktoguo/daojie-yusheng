/**
 * 本文件是客户端 DOM UI 的 action panel internal 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 内部类型，供 action-panel 子面板通过 parent 引用访问主面板私有状态。
 * 子面板通过 `this.p` (cast 后的 parent) 访问这些字段和方法。
 */
import type {
  ActionDef,
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillCondition,
  AutoUsePillConfig,
  CombatTargetingRuleKey,
  CombatTargetingRules,
  ItemStack,
  PlayerState,
  SkillDef,
} from '@mud/shared';
import type { SkillPreviewMetrics } from '../skill-tooltip';
import type { FloatingTooltip } from '../floating-tooltip';

// ─── 共享内部类型 ───

export type SkillManagementTab = 'auto' | 'manual' | 'disabled';
export type SkillManagementBulkMode = 'auto' | 'manual' | 'enabled' | 'disabled';
export type SkillManagementSortField = 'custom' | 'actualDamage' | 'qiCost' | 'range' | 'targetCount' | 'cooldown';
export type SkillManagementSortDirection = 'asc' | 'desc';
export type SkillManagementFilterToggle = 'melee' | 'ranged' | 'physical' | 'spell' | 'single' | 'aoe';
export type CombatSettingsTab = 'auto_pills' | 'targeting';
export type AutoUsePillSubview = 'main' | 'picker' | 'conditions';
export type SectManagementTab = 'overview' | 'members' | 'roles' | 'manage' | 'guardian' | 'domain';

export interface SkillPresetStatus {
  tone: 'success' | 'error' | 'info';
  text: string;
}

export interface SkillPresetSkillState {
  skillId: string;
  enabled: boolean;
  skillEnabled: boolean;
}

export interface SkillPresetRecord {
  id: string;
  name: string;
  skills: SkillPresetSkillState[];
}

export interface SkillPresetLibrary {
  v: number;
  p: Array<{ n: string; s: Array<[string, 0 | 1]> }>;
}

export interface SkillManagementEntry {
  action: ActionDef;
  metrics: SkillPreviewMetrics;
}

export interface AutoUsePillViewEntry {
  itemId: string;
  name: string;
  desc: string;
  count: number;
  level?: number;
  healAmount?: number;
  healPercent?: number;
  baselineHealPercent?: number;
  baselineQiPercent?: number;
  qiPercent?: number;
  consumeBuffs?: Array<{ buffId?: string; name?: string }>;
  selected: boolean;
  conditions: AutoUsePillCondition[];
}

export interface CombatTargetingCardOption {
  key?: CombatTargetingRuleKey;
  scope?: 'hostile' | 'friendly';
  label: string;
  summary: string;
  active?: boolean;
  disabled?: boolean;
}

export interface SectManagementMember {
  playerId: string;
  name: string;
  roleId: string;
  roleLabel: string;
  realmLv: number | null;
  statusLabel: string;
  self?: boolean;
  leader?: boolean;
}

export interface SectManagementRole {
  id: string;
  label: string;
  assignable: boolean;
}

export interface SectManagementPermission {
  id: string;
  label: string;
}

export interface SectManagementApplication {
  playerId: string;
  name: string;
  appliedAt: number;
}

export interface SectManagementGuardianData {
  active: boolean;
  strength: number;
  remainingQi: number;
  remainingSpiritStone: number;
  dailySpiritStoneCost: number;
  damageReduction: number;
  remainingDays: number | null;
}

export interface SectManagementData {
  selfPlayerId: string;
  canEditPermissions: boolean;
  canTransfer: boolean;
  canDissolve: boolean;
  canLeave: boolean;
  canReviewApplications: boolean;
  canManageGuardian: boolean;
  guardian: SectManagementGuardianData;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  roles: SectManagementRole[];
  permissions: SectManagementPermission[];
  rolePermissions: Record<string, Record<string, boolean>>;
  members: SectManagementMember[];
  applications: SectManagementApplication[];
}

export interface SectManagementSummary {
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

/**
 * 子面板通过此接口访问主面板的内部状态和方法。
 * 使用 `(parent as unknown as ActionPanelInternal)` 获取。
 */
export interface ActionPanelInternal {
  // ─── 静态常量 ───
  readonly SKILL_MANAGEMENT_MODAL_OWNER: string;
  readonly COMBAT_SETTINGS_MODAL_OWNER: string;
  readonly SKILL_PRESET_MODAL_OWNER: string;
  readonly TARGETING_PLAN_MODAL_OWNER: string;
  readonly SECT_MANAGEMENT_MODAL_OWNER: string;
  readonly AUTO_USE_PILL_SLOT_LIMIT: number;

  // ─── 状态字段 ───
  currentActions: ActionDef[];
  previewPlayer?: PlayerState;
  skillLookup: Map<string, { skill: SkillDef; techLevel: number; knownSkills: SkillDef[] }>;
  onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null;
  onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null;
  onUpdateAutoUsePills: ((pills: AutoUsePillConfig[]) => void) | null;
  onUpdateCombatTargetingRules: ((rules: CombatTargetingRules) => void) | null;
  onUpdateAutoBattleTargetingMode: ((mode: AutoBattleTargetingMode) => void) | null;

  // skill management state
  skillManagementTab: SkillManagementTab;
  skillManagementDraft: AutoBattleSkillConfig[] | null;
  skillManagementSortOpen: boolean;
  skillManagementSortField: SkillManagementSortField;
  skillManagementSortDirection: SkillManagementSortDirection;
  skillManagementFilterOpen: boolean;
  skillManagementFilterToggles: Set<SkillManagementFilterToggle>;
  skillManagementExternalRevision: string | null;
  skillManagementStatus: SkillPresetStatus | null;
  skillManagementListScrollTop: number;

  // skill preset state
  skillPresets: SkillPresetRecord[];
  selectedSkillPresetId: string | null;
  skillPresetNameDraft: string;
  skillPresetImportText: string;
  skillPresetStatus: SkillPresetStatus | null;
  skillPresetExternalRevision: string | null;

  // combat settings state
  combatSettingsActiveTab: CombatSettingsTab;
  combatSettingsExternalRevision: string | null;
  combatSettingsStatus: SkillPresetStatus | null;
  autoUsePillDraft: AutoUsePillConfig[] | null;
  combatTargetingDraft: CombatTargetingRules | null;
  autoUsePillSelectedIndex: number;
  autoUsePillSubview: AutoUsePillSubview;
  allowAoePlayerHit: boolean;
  targetingPlanExternalRevision: string | null;
  autoUsePillTooltip: FloatingTooltip;
  autoUsePillTooltipNode: HTMLElement | null;

  // sect management state
  sectManagementTab: SectManagementTab;
  sectManagementExternalRevision: string;

  // drag state
  bindingActionId: string | null;
  draggingSkillId: string | null;
  dragOverSkillId: string | null;
  dragOverPosition: 'before' | 'after' | null;

  // ─── 方法 ───
  render(actions: ActionDef[]): void;
  bindTooltips(root: HTMLElement, signal?: AbortSignal): void;
  getSkillActions(actions?: ActionDef[]): ActionDef[];
  getSkillSlotLimit(): number;
  getSkillSlotSummary(actions?: ActionDef[]): string;
  getAutoBattleSkillConfigs(actions: ActionDef[]): AutoBattleSkillConfig[];
  normalizeSkillConfigs(configs: AutoBattleSkillConfig[]): AutoBattleSkillConfig[];
  normalizeSkillActions(actions: ActionDef[]): ActionDef[];
  replaceSkillActions(skillActions: ActionDef[]): ActionDef[];
  clearDragState(): void;
  buildAutoBattleDisplayOrderMap(actions: ActionDef[]): Map<string, number>;
  renderActionSkillAffinityChip(skill: SkillDef): string;
  applySkillManagementDraftMutation(mutator: (skills: ActionDef[]) => ActionDef[], rerender?: boolean): void;
  areAutoBattleSkillConfigsEqual(left: AutoBattleSkillConfig[] | null | undefined, right: AutoBattleSkillConfig[] | null | undefined): boolean;
}
