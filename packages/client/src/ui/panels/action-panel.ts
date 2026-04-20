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
  ItemStack,
  PlayerState,
  SkillDef,
  type ElementKey,
  type SkillDamageKind,
} from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildSkillTooltipContent, type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getLocalItemTemplate, resolvePreviewItem } from '../../content/local-templates';
import { getActionTypeLabel, getElementKeyLabel } from '../../domain-labels';
import { ACTION_SHORTCUTS_KEY, ACTION_SKILL_PRESETS_KEY, RETURN_TO_SPAWN_ACTION_ID } from '../../constants/ui/action';
import {
  appendUnique,
  decodePresetTextValue,
  escapeHtml,
  getSkillAffinityBadge,
  getSkillEnabledTechniques,
  isAutoUseConsumableCandidate,
  isRecord,
  normalizeShortcutKey,
  readBoolean,
} from './action-panel-helpers';

/** createFragmentFromHtml：从 HTML 文本创建文档片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** 行动面板的主标签页：对话、技能、开关和通用动作。 */
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
/** 技能预设状态提示的语气。 */
type SkillPresetStatusTone = 'success' | 'error' | 'info';
type CombatSettingsTab = 'auto_pills' | 'targeting' | 'targeting_plan';
type AutoUsePillSubview = 'main' | 'picker' | 'conditions';

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
  label: string;
  summary: string;
  active?: boolean;
  disabled?: boolean;
}

const AUTO_BATTLE_TARGETING_MODE_OPTIONS: Array<{ mode: AutoBattleTargetingMode; label: string; summary: string }> = [
  { mode: 'auto', label: '自动', summary: '按当前默认逻辑综合选择目标。' },
  { mode: 'nearest', label: '最近', summary: '更偏向最近目标。' },
  { mode: 'low_hp', label: '残血', summary: '更偏向血量更低的目标。' },
  { mode: 'full_hp', label: '满血', summary: '更偏向血量更高的目标。' },
  { mode: 'boss', label: '妖王', summary: '更偏向妖王目标。' },
  { mode: 'player', label: '玩家', summary: '更偏向玩家目标。' },
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
  private static readonly SKILL_MANAGEMENT_MODAL_OWNER = 'action-panel-skill-management';
  /** 战斗设置弹层。 */
  private static readonly COMBAT_SETTINGS_MODAL_OWNER = 'action-panel-combat-settings';
  /** 技能预设弹窗的归属标识，和技能管理弹层分开管理。 */
  private static readonly SKILL_PRESET_MODAL_OWNER = 'action-panel-skill-preset';
  /** 自动吃药槽位上限。 */
  private static readonly AUTO_USE_PILL_SLOT_LIMIT = 12;
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
  /** 外部技能预设状态摘要，用来判断弹层是否需要重绘。 */
  private skillPresetExternalRevision: string | null = null;
  /** 战斗设置弹层外部摘要。 */
  private combatSettingsExternalRevision: string | null = null;
  /** 技能管理列表的滚动位置，重绘后尽量恢复。 */
  private skillManagementListScrollTop = 0;
  /** 战斗设置当前标签。 */
  private combatSettingsActiveTab: CombatSettingsTab = 'auto_pills';
  /** 自动吃药草稿。 */
  private autoUsePillDraft: AutoUsePillConfig[] | null = null;
  /** 目标选择草稿。 */
  private combatTargetingDraft: CombatTargetingRules | null = null;
  /** 索敌方案草稿。 */
  private autoBattleTargetingModeDraft: AutoBattleTargetingMode | null = null;
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
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    this.skillPresets = this.loadSkillPresets();
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  /** 清空面板、重置缓存并关掉关联弹层。 */
  clear(): void {
    this.tooltip.hide(true);
    this.autoUsePillTooltip.hide(true);
    this.autoUsePillTooltipNode = null;
    this.actionRowRefs.clear();
    this.skillManagementDraft = null;
    this.autoUsePillDraft = null;
    this.combatTargetingDraft = null;
    this.autoBattleTargetingModeDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillPresetExternalRevision = null;
    this.combatSettingsExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.combatSettingsActiveTab = 'auto_pills';
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
    detailModalHost.close(ActionPanel.COMBAT_SETTINGS_MODAL_OWNER);
    detailModalHost.close(ActionPanel.SKILL_PRESET_MODAL_OWNER);
    this.pane.replaceChildren(createFragmentFromHtml('<div class="empty-hint ui-empty-hint">暂无可用行动</div>'));
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
    this.renderCombatSettingsModalIfOpen();
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
    this.renderCombatSettingsModalIfOpen();
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
      { id: 'dialogue', label: '对话', types: ['quest', 'interact', 'travel'] },
      { id: 'skill', label: '技能', types: ['skill', 'battle', 'gather'] },
      { id: 'toggle', label: '开关', types: ['toggle'] },
      { id: 'utility', label: '行动', types: ['toggle'] },
    ];
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const list = groups.get(action.type) ?? [];
      list.push(action);
      groups.set(action.type, list);
    }
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(actions);

    let html = `<div class="action-tab-bar ui-tab-strip">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ui-tab-strip-button ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
        const switchEntries = actions.filter((action) => this.isSwitchAction(action));
        if (switchEntries.length === 0) {
          html += '<div class="empty-hint ui-empty-hint">当前分组暂无内容</div></div>';
          continue;
        }
        html += `<div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">开关</div>
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
          html += '<div class="empty-hint ui-empty-hint">当前分组暂无内容</div></div>';
          continue;
        }
        html += `<div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">行动</div>
          <div class="action-card-list ui-card-list ui-card-list--compact">`;
        for (const action of utilityEntries) {
          html += this.renderActionItem(action);
        }
        html += '</div></div>';
        continue;
      }
      const relevantTypes = tab.types.filter((type) => (groups.get(type)?.length ?? 0) > 0);
      if (relevantTypes.length === 0) {
        html += '<div class="empty-hint ui-empty-hint">当前分组暂无内容</div>';
      } else {
        for (const type of relevantTypes) {
          const entries = (groups.get(type) ?? []).filter((action) => !this.isUtilityAction(action));
          if (entries.length === 0) {
            continue;
          }
          if (type === 'skill') {
            html += this.renderSkillSection(entries, autoBattleDisplayOrders);
            continue;
          }
          html += `<div class="panel-section ui-surface-pane ui-surface-pane--stack">
      <div class="panel-section-title">${getActionTypeLabel(type)}</div>
      <div class="action-card-list ui-card-list ui-card-list--compact">`;
          for (const action of entries) {
            html += this.renderActionItem(action);
          }
          html += '</div></div>';
        }
      }
      html += '</div>';
    }

    preserveSelection(this.pane, () => {
      this.pane.replaceChildren(createFragmentFromHtml(html));
      this.captureActionRowRefs();
      this.bindEvents(actions);
      this.bindTooltips(this.pane);
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
  private bindEvents(actions: ActionDef[]): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionTab as ActionMainTab | undefined;
        if (!tab) return;
        this.activeTab = tab;
        this.render(actions);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionSkillTab as SkillSubTab | undefined;
        if (!tab) return;
        this.activeSkillTab = tab;
        this.render(actions);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-manage-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillManagement();
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-preset-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillPresetModal();
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-combat-settings-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openCombatSettingsModal();
      });
    });
    this.bindActionCardEvents(this.pane);
    this.bindActionExecEvents(this.pane);
    this.bindBindActionEvents(this.pane);
    this.bindAutoBattleToggleEvents(this.pane);
    this.bindAutoBattleDragEvents(this.pane);
  }

  /** 只给带提示信息的节点绑定悬浮提示，避免重复装配整棵树。 */
  private bindTooltips(root: HTMLElement): void {
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
      }, true);
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
      });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
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
      return;
    }

    const normalized = normalizeShortcutKey(event.key);
    if (!normalized) return;
    const actionId = [...this.shortcutBindings.entries()].find(([, binding]) => binding === normalized)?.[0];
    if (!actionId) return;
    const action = this.currentActions.find((entry) => entry.id === actionId);
    if (!action || action.cooldownLeft > 0) return;
    event.preventDefault();
    this.onAction?.(action.id, action.requiresTarget, action.targetMode, action.range, action.name);
  }

  /** 在动作标题旁补一枚快捷键标记。 */
  private renderShortcutBadge(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `<span class="action-shortcut-tag">键 ${binding.toUpperCase()}</span>` : '';
  }

  /** 在动作摘要里补一段快捷键说明。 */
  private renderShortcutMeta(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? ` · 快捷键 ${binding.toUpperCase()}` : '';
  }

  /** 判断是否属于需要显示开关卡片的动作。 */
  private isSwitchAction(action: ActionDef): boolean {
    return action.type === 'toggle' && this.isSwitchActionId(action.id);
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
        return '自动战斗';
      case 'toggle:auto_retaliate':
        return '自动反击';
      case 'toggle:auto_battle_stationary':
        return '原地战斗';
      case 'toggle:allow_aoe_player_hit':
        return '全体攻击';
      case 'toggle:auto_idle_cultivation':
        return '闲置自动修炼';
      case 'toggle:auto_switch_cultivation':
        return '修满自动切换';
      case 'cultivation:toggle':
        return '当前修炼';
      case 'sense_qi:toggle':
        return '感气视角';
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
    switch (action.id) {
      case 'toggle:auto_battle':
        return { active: this.autoBattle, label: this.autoBattle ? '开' : '关' };
      case 'toggle:auto_retaliate':
        return { active: this.autoRetaliate, label: this.autoRetaliate ? '开' : '关' };
      case 'toggle:auto_battle_stationary':
        return { active: this.autoBattleStationary, label: this.autoBattleStationary ? '开' : '关' };
      case 'toggle:allow_aoe_player_hit':
        return { active: this.allowAoePlayerHit, label: this.allowAoePlayerHit ? '开' : '关' };
      case 'toggle:auto_idle_cultivation':
        return { active: this.autoIdleCultivation, label: this.autoIdleCultivation ? '开' : '关' };
      case 'toggle:auto_switch_cultivation':
        return { active: this.autoSwitchCultivation, label: this.autoSwitchCultivation ? '开' : '关' };
      case 'cultivation:toggle':
        if (!this.previewPlayer?.cultivatingTechId) {
          return { active: false, label: '未设' };
        }
        return { active: this.cultivationActive, label: this.cultivationActive ? '开' : '关' };
      case 'sense_qi:toggle': {
        const active = this.previewPlayer?.senseQiActive === true;
        return { active, label: active ? '开' : '关' };
      }
      default:
        return { active: false, label: '执行' };
    }
  }

  /** 渲染一条状态开关卡片。 */
  private renderSwitchItem(action: ActionDef): string {
    const state = this.getSwitchCardState(action);
    return `<div class="gm-player-row ui-surface-card ui-surface-card--compact ui-selectable-card ${state.active ? 'is-active' : ''}" data-action-card="${action.id}" role="button" tabindex="0">
      <div>
        <div class="gm-player-name">${escapeHtml(this.getSwitchCardTitle(action))}</div>
        <div class="gm-player-meta">${escapeHtml(action.desc)}${this.renderShortcutMeta(action.id)}</div>
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
      return '按键中';
    }
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `改键 ${binding.toUpperCase()}` : '绑定键';
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
    const fallbackName = `技能方案 ${index + 1}`;
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

    const base = this.sanitizeSkillPresetName(name) || '技能方案';
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
    return `技能方案 ${month}-${day} ${hour}:${minute}`;
  }

  /** 生成技能方案弹层的外部变更摘要。 */
  private buildSkillPresetExternalRevision(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parts: string[] = [];
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
        name: '拿取',
        type: 'toggle',
        desc: '选定 1 格内的目标，查看地面物品或搜索容器后拿取。',
        cooldownLeft: 0,
        requiresTarget: true,
        targetMode: 'tile',
        range: 1,
      });
    }
    if (!result.some((action) => action.id === 'client:observe')) {
      result.push({
        id: 'client:observe',
        name: '观察',
        type: 'toggle',
        desc: '选定视野范围内任意一格，查看地面、实体与耐久等详细信息。',
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

    const existingSkillIds = new Set(currentActions.filter((action) => action.type === 'skill').map((action) => action.id));
    const autoBattleSkillMap = new Map((player.autoBattleSkills ?? []).map((entry, index) => [entry.skillId, { entry, index }] as const));
    const fallback: ActionDef[] = [];
    for (const technique of player.techniques) {
      for (const skill of technique.skills ?? []) {
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
          targetMode: skill.targetMode ?? 'entity',
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
    return fallback;
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
      ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? '自动已启用' : '自动已停用'}</span>
         ${autoBattleOrder ? `<span class="action-type">顺位 ${autoBattleOrder}</span>` : ''}`
      : '';
    const autoBattleControls = isAutoBattleSkill
      ? `<button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-auto-battle-toggle="${action.id}" type="button">${autoBattleEnabled ? '自动 开' : '自动 关'}</button>
         ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-auto-battle-drag="${action.id}" draggable="true" type="button">拖拽</button>` : ''}`
      : '';
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item ui-surface-card ui-surface-card--compact ${onCd ? 'cooldown' : ''} ${isAutoBattleSkill ? 'action-item-draggable' : ''}" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">[${getActionTypeLabel(action.type)}]</span>
          ${typeof action.range === 'number' ? `<span class="action-type">射程 ${action.range}</span>` : ''}
          ${isAutoBattleSkill
            ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}" data-action-auto-state="${action.id}">${autoBattleEnabled ? '自动已启用' : '自动已停用'}</span>
               <span class="action-type" data-action-auto-order="${action.id}"${autoBattleOrder ? '' : ' hidden'}>${autoBattleOrder ? `顺位 ${autoBattleOrder}` : ''}</span>`
            : autoBattleMeta}
          ${this.renderShortcutBadge(action.id)}
        </div>
        <div class="action-desc">${escapeHtml(action.desc)}</div>
        ${affinityChip}
      </div>
      <div class="action-cta ui-action-row ui-action-row--end">
        ${autoBattleControls}
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
        <span class="action-cd" data-action-cd="${action.id}"${onCd ? '' : ' hidden'}>${onCd ? `冷却 ${action.cooldownLeft} 息` : ''}</span>
        <button class="small-btn" data-action="${action.id}" data-action-exec="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}"${onCd ? ' hidden' : ''}>执行</button>
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
    const mutated = this.withSequentialAutoBattleOrder(mutator(skillActions));
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
  private applySkillManagementDraftMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
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
    const mutated = this.withSequentialAutoBattleOrder(mutator(orderedSkillActions));
    this.skillManagementDraft = this.getAutoBattleSkillConfigs(mutated);
    this.renderSkillManagementModal();
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
      cdNode.textContent = onCd ? `冷却 ${action.cooldownLeft} 息` : '';
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
        stateNode.textContent = enabled ? '自动已启用' : '自动已停用';
        stateNode.classList.toggle('auto-battle-enabled', enabled);
        stateNode.classList.toggle('auto-battle-disabled', !enabled);
        orderNode.hidden = order === null;
        orderNode.textContent = order === null ? '' : `顺位 ${order + 1}`;
        toggleNode.classList.toggle('active', enabled);
        toggleNode.textContent = enabled ? '自动 开' : '自动 关';
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
    const hint = this.activeSkillTab === 'auto'
      ? '自动战斗会按列表从上到下尝试已启用技能，可直接拖拽调整优先级。'
      : '这里的技能不会参与自动战斗，但仍可手动点击或使用绑定键触发。';

    let html = `<div class="panel-section action-skill-section ui-surface-pane ui-surface-pane--stack">
      <div class="panel-section-head">
        <div class="panel-section-title">技能</div>
        <div class="action-section-actions">
          <button class="small-btn ghost" data-action-skill-manage-open type="button">技能管理</button>
          <button class="small-btn ghost" data-action-combat-settings-open type="button">战斗设置</button>
          <button class="small-btn ghost" data-action-skill-preset-open type="button">技能方案</button>
        </div>
      </div>
      <div class="action-skill-subtabs ui-subtab-grid ui-subtab-grid--two-column">
        <button class="action-skill-subtab-btn ui-subtab-button ${this.activeSkillTab === 'auto' ? 'active' : ''}" data-action-skill-tab="auto" type="button">
          自动
          <span class="action-skill-subtab-count ui-count-chip">${autoSkills.length}</span>
        </button>
        <button class="action-skill-subtab-btn ui-subtab-button ${this.activeSkillTab === 'manual' ? 'active' : ''}" data-action-skill-tab="manual" type="button">
          手动
          <span class="action-skill-subtab-count ui-count-chip">${manualSkills.length}</span>
        </button>
      </div>
      <div class="action-section-hint ui-form-copy">${hint}</div>`;

    if (visibleSkills.length === 0) {
      html += `<div class="empty-hint ui-empty-hint">${this.activeSkillTab === 'auto' ? '当前没有启用自动战斗的技能' : '当前没有仅手动触发的技能'}</div>`;
    } else {
      html += '<div class="action-skill-list ui-card-list ui-card-list--compact">';
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
  private bindActionCardEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-action-card]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.bindAction) return;
        const actionId = button.dataset.actionCard;
        if (!actionId) return;
        const action = this.currentActions.find((entry) => entry.id === actionId);
        this.onAction?.(actionId, action?.requiresTarget, action?.targetMode, action?.range, action?.name ?? actionId);
      });
    });
  }

  /** 绑定执行按钮，读取 data-* 参数后交给外部回调。 */
  private bindActionExecEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.action!;
        const actionName = button.dataset.actionName || actionId;
        const requiresTarget = button.dataset.actionTarget === '1';
        const targetMode = button.dataset.actionTargetMode || undefined;
        const rangeText = button.dataset.actionRange;
        const range = rangeText ? Number(rangeText) : undefined;
        this.onAction?.(actionId, requiresTarget, targetMode, Number.isFinite(range) ? range : undefined, actionName);
      });
    });
  }

  /** 进入或退出动作绑键模式。 */
  private bindBindActionEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.bindAction;
        if (!actionId) return;
        this.bindingActionId = this.bindingActionId === actionId ? null : actionId;
        this.render(this.currentActions);
        this.renderSkillManagementModalIfOpen();
      });
    });
  }

  /** 绑定自动战斗开关按钮。 */
  private bindAutoBattleToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.autoBattleToggle;
        if (!actionId) return;
        this.toggleAutoBattleSkill(actionId);
      });
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
  private bindAutoBattleDragEvents(root: HTMLElement): void {
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
      });
      handle.addEventListener('dragend', () => {
        this.clearDragState();
      });
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
      });
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
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.autoBattleSkillRow;
        if (!this.draggingSkillId || !targetId || !this.dragOverPosition) {
          this.clearDragState();
          return;
        }
        this.moveAutoBattleSkill(this.draggingSkillId, targetId, this.dragOverPosition);
        this.clearDragState();
      });
    });
  }

  /** 绑定技能管理弹层里的自动开关。 */
  private bindSkillManagementAutoToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-auto-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageAutoToggle;
        if (!actionId) return;
        this.toggleSkillManagementAutoBattleSkill(actionId);
      });
    });
  }

  /** 绑定技能管理弹层里的启用开关。 */
  private bindSkillManagementEnabledToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageEnabledToggle;
        if (!actionId) return;
        this.toggleSkillManagementSkillEnabled(actionId);
      });
    });
  }

  /** 绑定技能管理弹层的拖拽排序交互。 */
  private bindSkillManagementDragEvents(root: HTMLElement): void {
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
      });
      handle.addEventListener('dragend', () => {
        this.clearDragState();
      });
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
      });
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
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.skillManageSkillRow;
        if (!this.draggingSkillId || !targetId || !this.dragOverPosition) {
          this.clearDragState();
          return;
        }
        this.moveSkillManagementSkill(this.draggingSkillId, targetId, this.dragOverPosition);
        this.clearDragState();
      });
    });
  }

  /** 从动作列表里筛出技能动作。 */
  private getSkillActions(actions: ActionDef[] = this.currentActions): ActionDef[] {
    return actions.filter((action) => action.type === 'skill');
  }

  /** 打开技能管理弹层，并以当前自动/手动页签作为初始视图。 */
  private openSkillManagement(): void {
    this.skillManagementTab = this.activeSkillTab;
    this.skillManagementListScrollTop = 0;
    this.syncSkillManagementDraft();
    this.renderSkillManagementModal();
  }

  /** 打开战斗设置弹层。 */
  private openCombatSettingsModal(): void {
    this.syncAutoUsePillDraft();
    this.syncCombatTargetingDraft();
    this.syncAutoBattleTargetingModeDraft();
    this.combatSettingsActiveTab = 'auto_pills';
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    this.renderCombatSettingsModal();
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
      if (normalized.length >= ActionPanel.AUTO_USE_PILL_SLOT_LIMIT) {
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
    const hostile = this.normalizeCombatTargetingScope(
      source.hostile,
      HOSTILE_TARGETING_KEYS,
      this.buildDefaultCombatTargetingRules(this.allowAoePlayerHit).hostile ?? [],
    );
    const friendly = this.normalizeCombatTargetingScope(
      source.friendly,
      FRIENDLY_TARGETING_KEYS,
      this.buildDefaultCombatTargetingRules(this.allowAoePlayerHit).friendly ?? [],
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
    const hostile = this.normalizeCombatTargetingScope(
      rules.hostile,
      HOSTILE_TARGETING_KEYS,
      this.buildDefaultCombatTargetingRules(rules.includePlayers === true).hostile ?? [],
    );
    const friendly = this.normalizeCombatTargetingScope(
      rules.friendly,
      FRIENDLY_TARGETING_KEYS,
      this.buildDefaultCombatTargetingRules(rules.includePlayers === true).friendly ?? [],
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
      targetingMode: this.getAutoBattleTargetingMode(),
      allowAoePlayerHit: this.allowAoePlayerHit,
    });
  }

  /** 构建索敌方案外部摘要。 */
  private buildTargetingPlanExternalRevision(): string {
    return this.previewPlayer?.autoBattleTargetingMode ?? 'auto';
  }

  /** 读取当前索敌方案标签。 */
  private getAutoBattleTargetingMode(): AutoBattleTargetingMode {
    return this.previewPlayer?.autoBattleTargetingMode ?? 'auto';
  }

  /** 同步索敌方案草稿。 */
  private syncAutoBattleTargetingModeDraft(): AutoBattleTargetingMode {
    const nextDraft = this.autoBattleTargetingModeDraft ?? this.getAutoBattleTargetingMode();
    this.autoBattleTargetingModeDraft = nextDraft;
    return nextDraft;
  }

  /** 读取当前索敌方案标签。 */
  private getAutoBattleTargetingModeLabel(mode = this.getAutoBattleTargetingMode()): string {
    return AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === mode)?.label ?? '自动';
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
        desc: template?.desc ?? '当前背包里没有这味丹药，配置会先保留。',
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
    const next = this.normalizeAutoUsePillsLocal(mutator(this.cloneAutoUsePillConfigs(this.syncAutoUsePillDraft())));
    this.autoUsePillDraft = next;
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(this.autoUsePillSelectedIndex, ActionPanel.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.renderCombatSettingsModal();
  }

  /** 读取当前选中的自动丹药配置。 */
  private getSelectedAutoUsePillConfig(): AutoUsePillConfig | null {
    return this.syncAutoUsePillDraft()[this.autoUsePillSelectedIndex] ?? null;
  }

  /** 打开自动丹药选择小窗。 */
  private openAutoUsePillPicker(slotIndex: number): void {
    this.syncAutoUsePillDraft();
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, ActionPanel.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.autoUsePillSubview = 'picker';
    this.renderCombatSettingsModal();
  }

  /** 打开自动丹药条件小窗。 */
  private openAutoUsePillConditionSettings(slotIndex = this.autoUsePillSelectedIndex): void {
    this.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, ActionPanel.AUTO_USE_PILL_SLOT_LIMIT - 1));
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
    const payload = buildItemTooltipPayload(item);
    const config = this.syncAutoUsePillDraft().find((entry) => entry.itemId === itemId);
    if (config) {
      payload.lines = [
        ...payload.lines,
        `<span class="skill-tooltip-detail">自动条件：${escapeHtml(this.renderAutoUsePillConditionSummary(config.conditions))}</span>`,
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
          <div class="auto-pill-condition-static">效果未生效时服用</div>
          <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">移除</button>
        </div>
      `;
    }
    return `
      <div class="auto-pill-condition-row">
        <select data-auto-pill-condition-resource="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="hp" ${condition.resource === 'hp' ? 'selected' : ''}>血量</option>
          <option value="qi" ${condition.resource === 'qi' ? 'selected' : ''}>灵力</option>
        </select>
        <select data-auto-pill-condition-op="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="lt" ${condition.op === 'lt' ? 'selected' : ''}>低于</option>
          <option value="gt" ${condition.op === 'gt' ? 'selected' : ''}>高于</option>
        </select>
        <input type="number" min="0" max="100" step="1" value="${condition.thresholdPct}" data-auto-pill-condition-threshold="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" />
        <span class="auto-pill-condition-unit">%</span>
        <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">移除</button>
      </div>
    `;
  }

  /** 渲染目标选择区。 */
  private renderCombatTargetingSection(): string {
    const draft = this.syncCombatTargetingDraft();
    const hostileOptions: CombatTargetingCardOption[] = [
      { key: 'monster', label: '妖兽单位', summary: '把野外与副本中的妖兽视为敌方目标。', active: draft.hostile?.includes('monster') === true },
      { key: 'demonized_players', label: '入魔玩家', summary: '把煞气入体超过 20 层的玩家纳入敌方目标。', active: draft.hostile?.includes('demonized_players') === true },
      { key: 'retaliators', label: '反击对象', summary: '把主动攻击过你的玩家纳入敌方目标。', active: draft.hostile?.includes('retaliators') === true },
      { key: 'party', label: '协同行列', summary: '预留给队伍、同行等协作关系的敌友识别。', disabled: true },
      { key: 'sect', label: '同道关系', summary: '预留给宗门、阵营等长期关系的敌友识别。', disabled: true },
      { key: 'terrain', label: '场景地块', summary: '把墙体、山崖、容器等场景地块纳入敌方目标。', active: draft.hostile?.includes('terrain') === true },
    ];
    const friendlyOptions: CombatTargetingCardOption[] = [
      { key: 'non_hostile_players', label: '非敌对玩家', summary: '把当前不属于敌对范围的玩家视为友方目标。', active: draft.friendly?.includes('non_hostile_players') === true },
      { key: 'all_players', label: '全部玩家', summary: '把所有玩家都纳入友方目标。', active: draft.friendly?.includes('all_players') === true },
      { key: 'retaliators', label: '反击对象', summary: '把主动攻击过你的玩家也纳入友方目标。', active: draft.friendly?.includes('retaliators') === true },
      { key: 'party', label: '协同行列', summary: '预留给队伍、同行等协作关系的敌友识别。', disabled: true },
      { key: 'sect', label: '同道关系', summary: '预留给宗门、阵营等长期关系的敌友识别。', disabled: true },
    ];
    return `
      <div class="combat-settings-targeting-shell">
        <div class="combat-settings-targeting-head">
          <div>
            <div class="skill-preset-card-title">目标判定</div>
            <div class="skill-preset-list-meta">这里是在定义你会把哪些单位视为敌方目标、哪些单位视为友方目标。伤害默认使用敌对判定，治疗默认使用友方判定；队伍与宗门关系暂未接入，先保留禁用态。</div>
          </div>
          <span class="combat-settings-targeting-badge">应用后生效</span>
        </div>
        <div class="combat-settings-targeting-grid">
          <div class="combat-settings-targeting-card combat-settings-targeting-card--hostile">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">敌对判定</div>
              <div class="skill-preset-list-meta">勾选后，这些单位会被你视为敌方目标，可多选组合。</div>
            </div>
            <div class="combat-settings-toggle-grid">
              ${hostileOptions.map((option) => this.renderCombatTargetingOption(option)).join('')}
            </div>
          </div>
          <div class="combat-settings-targeting-card combat-settings-targeting-card--friendly">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">友方判定</div>
              <div class="skill-preset-list-meta">勾选后，这些单位会被你视为友方目标，可多选组合。</div>
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
        ${option.disabled ? 'disabled' : `data-combat-targeting-toggle="${escapeHtml(option.key ?? '')}"`}
      >
        <span class="combat-settings-toggle-chip-box" aria-hidden="true"></span>
        <span class="combat-settings-toggle-chip-content">
          <span class="combat-settings-toggle-chip-title">
            ${escapeHtml(option.label)}
            ${option.disabled ? '<span class="combat-settings-toggle-chip-disabled-tag">未开放</span>' : ''}
          </span>
          <span class="combat-settings-toggle-chip-copy">${escapeHtml(option.summary)}</span>
        </span>
      </button>
    `;
  }

  /** 仅在战斗设置弹层已打开且内容变化时重绘。 */
  private renderCombatSettingsModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(ActionPanel.COMBAT_SETTINGS_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildCombatSettingsExternalRevision();
    if (this.combatSettingsExternalRevision === nextRevision) {
      return;
    }
    this.renderCombatSettingsModal();
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
    const slotMarkup = Array.from({ length: ActionPanel.AUTO_USE_PILL_SLOT_LIMIT }, (_, index) => {
      const slotConfig = pillDraft[index] ?? null;
      const slotEntry = slotConfig
        ? entries.find((entry) => entry.itemId === slotConfig.itemId) ?? null
        : null;
      const conditionSummary = slotConfig
        ? this.renderAutoUsePillConditionSummary(slotConfig.conditions)
        : '未设置药品';
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
                <span class="auto-pill-slot-count">${slotEntry.count > 0 ? `背包 ${slotEntry.count}` : '背包暂无'}</span>
              `
              : `
                <span class="auto-pill-slot-empty">+</span>
                <span class="auto-pill-slot-label">空槽</span>
              `}
          </button>
          <div class="auto-pill-slot-summary">${escapeHtml(conditionSummary)}</div>
          <button
            class="small-btn ghost auto-pill-slot-condition-btn"
            data-auto-pill-open-slot-conditions="${index}"
            type="button"
            ${slotEntry ? '' : 'disabled'}
          >条件</button>
        </div>
      `;
    }).join('');
    const pickerEntries = this.getAutoUsePillPickerEntries();
    const pickerBody = pickerEntries.length === 0
      ? '<div class="empty-hint ui-empty-hint">当前没有可选的自动服用丹药。</div>'
      : `
        <div class="auto-pill-picker-grid">
          ${pickerEntries.map((entry) => `
            <button
              class="auto-pill-picker-card ${currentEntry?.itemId === entry.itemId ? 'selected' : ''}"
              data-auto-pill-pick="${escapeHtml(entry.itemId)}"
              type="button"
            >
              <span class="auto-pill-picker-title">${escapeHtml(entry.name)}</span>
              <span class="auto-pill-picker-count">${entry.count > 0 ? `背包 ${entry.count}` : '背包暂无'}</span>
              <span class="auto-pill-picker-meta">${escapeHtml(entry.desc || this.renderAutoUsePillConditionSummary(entry.conditions))}</span>
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
              <span class="auto-pill-card-count">${currentEntry.count > 0 ? `背包 ${currentEntry.count}` : '背包暂无'}</span>
            </div>
            <div class="auto-pill-card-meta">${escapeHtml(currentEntry.desc || '已选择自动服用丹药')}</div>
            <div class="auto-pill-config-summary">${escapeHtml(this.renderAutoUsePillConditionSummary(currentConfig?.conditions ?? []))}</div>
          </div>
          <div class="auto-pill-condition-panel auto-pill-condition-panel--standalone">
            <div class="auto-pill-condition-head">
              <div class="skill-preset-card-title">触发条件</div>
              <div class="skill-preset-list-meta">满足任一条件时就会尝试服用。</div>
            </div>
            ${(currentConfig?.conditions.length ?? 0) > 0
              ? `<div class="auto-pill-condition-list">
                  ${currentConfig?.conditions.map((condition, conditionIndex) => this.renderAutoUsePillConditionRow(currentEntry.itemId, condition, conditionIndex)).join('')}
                </div>`
              : '<div class="empty-hint ui-empty-hint">还没有设置任何触发条件。</div>'}
            <div class="auto-pill-condition-actions">
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="hp" type="button">添加生命条件</button>
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="qi" type="button">添加灵力条件</button>
              ${(currentEntry.consumeBuffs?.length ?? 0) > 0
                ? `<button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="buff_missing" type="button">添加效果未生效条件</button>`
                : ''}
            </div>
          </div>
        </div>
      `
      : '<div class="empty-hint ui-empty-hint">当前槽位还没有选择药品，无法设置条件。</div>';
    const autoPillBody = `
      <div class="skill-preset-card auto-pill-hero-card">
        <div class="skill-preset-card-title">自动丹药槽</div>
        <div class="skill-preset-card-copy">点槽位会弹出独立药品选择小窗，点槽位下方“条件”会弹出独立条件设置小窗。改动会和目标选择一起在“应用”时提交。</div>
      </div>
      <div class="auto-pill-slot-grid">${slotMarkup}</div>
    `;
    const targetingBody = this.renderCombatTargetingSection();
    const targetingPlanMode = this.syncAutoBattleTargetingModeDraft();
    const targetingPlanActiveOption = AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === targetingPlanMode)
      ?? AUTO_BATTLE_TARGETING_MODE_OPTIONS[0]!;
    const targetingPlanBody = `
      <div class="targeting-plan-shell">
        <div class="targeting-plan-hero">
          <div class="targeting-plan-card">
            <div class="skill-preset-card-title">当前方案</div>
            <div class="targeting-plan-current">${escapeHtml(targetingPlanActiveOption.label)}</div>
            <div class="skill-preset-card-copy">${escapeHtml(targetingPlanActiveOption.summary)}</div>
          </div>
        </div>
        <div class="targeting-plan-card targeting-plan-options">
          <div class="skill-preset-section-head">
            <div class="skill-preset-card-title">方案切换</div>
            <div class="skill-preset-list-meta">这里控制自动战斗在候选目标里的优先索敌顺序，改动会和其他战斗设置一起在“应用”后生效。</div>
          </div>
          <div class="targeting-plan-grid">
            ${AUTO_BATTLE_TARGETING_MODE_OPTIONS.map((entry) => `
              <button
                class="targeting-plan-option ${entry.mode === targetingPlanMode ? 'active' : ''}"
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
    `;
    const overviewBody = `
      <div class="auto-pill-shell">
        <div class="auto-pill-topbar">
          <div class="skill-preset-card auto-pill-hero-card combat-settings-hero-card">
            <div class="skill-preset-card-title">战斗设置</div>
            <div class="skill-preset-card-copy">把战斗补给和目标判定收在同一个面板里管理。所有改动都只在点击“应用”后才会提交到服务端。</div>
          </div>
          <div class="auto-pill-toolbar">
            <button class="small-btn" data-combat-settings-apply type="button">应用</button>
            <button class="small-btn ghost" data-combat-settings-cancel type="button">取消</button>
          </div>
        </div>
        <div class="action-skill-subtabs combat-settings-tabs ui-subtab-grid ui-subtab-grid--three-column">
          <button class="action-skill-subtab-btn ui-subtab-button ${this.combatSettingsActiveTab === 'auto_pills' ? 'active' : ''}" data-combat-settings-tab="auto_pills" type="button">丹药自动服用</button>
          <button class="action-skill-subtab-btn ui-subtab-button ${this.combatSettingsActiveTab === 'targeting' ? 'active' : ''}" data-combat-settings-tab="targeting" type="button">目标选择</button>
          <button class="action-skill-subtab-btn ui-subtab-button ${this.combatSettingsActiveTab === 'targeting_plan' ? 'active' : ''}" data-combat-settings-tab="targeting_plan" type="button">索敌方案</button>
        </div>
        <div class="combat-settings-panel-body">
          ${this.combatSettingsActiveTab === 'auto_pills'
            ? autoPillBody
            : this.combatSettingsActiveTab === 'targeting'
              ? targetingBody
              : targetingPlanBody}
        </div>
        ${this.combatSettingsActiveTab === 'auto_pills' && this.autoUsePillSubview === 'picker'
          ? `
            <div class="auto-pill-subdialog-backdrop">
              <div class="auto-pill-subdialog auto-pill-subdialog--picker">
                <div class="auto-pill-subdialog-head">
                  <div>
                    <div class="skill-preset-card-title">选择药品</div>
                    <div class="skill-preset-list-meta">hover 可查看和背包一致的物品详情，点击后直接放入当前槽位。</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    ${currentConfig ? '<button class="small-btn ghost" data-auto-pill-clear-slot type="button">清空槽位</button>' : ''}
                    <button class="small-btn ghost" data-auto-pill-back type="button">关闭</button>
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
                    <div class="skill-preset-card-title">条件设置</div>
                    <div class="skill-preset-list-meta">${escapeHtml(currentEntry?.name ?? '当前槽位')} 的自动条件</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    <button class="small-btn ghost" data-auto-pill-back type="button">关闭</button>
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
      ownerId: ActionPanel.COMBAT_SETTINGS_MODAL_OWNER,
      variantClass: 'detail-modal--combat-settings',
      title: '战斗设置',
      subtitle: this.combatSettingsActiveTab === 'auto_pills'
        ? `自动丹药 ${pillDraft.length} 种`
        : this.combatSettingsActiveTab === 'targeting'
          ? '目标选择'
          : `索敌方案 · ${targetingPlanActiveOption.label}`,
      bodyHtml: overviewBody,
      onClose: () => this.discardCombatSettingsDraft(),
      onAfterRender: (body) => this.bindCombatSettingsEvents(body),
    });
    this.combatSettingsExternalRevision = this.buildCombatSettingsExternalRevision();
  }

  /** 战斗设置关闭前确认。 */
  private confirmDiscardCombatSettingsChanges(): boolean {
    if (!this.areAutoUsePillConfigsEqual(this.autoUsePillDraft, this.getAutoUsePills())
      || !this.areCombatTargetingRulesEqual(this.combatTargetingDraft, this.getCombatTargetingRules())
      || this.syncAutoBattleTargetingModeDraft() !== this.getAutoBattleTargetingMode()) {
      return window.confirm('战斗设置里有未应用的改动，关闭后会丢失这些改动。确定关闭吗？');
    }
    return true;
  }

  /** 丢弃战斗设置草稿。 */
  private discardCombatSettingsDraft(): void {
    this.autoUsePillDraft = null;
    this.combatTargetingDraft = null;
    this.autoBattleTargetingModeDraft = null;
    this.combatSettingsActiveTab = 'auto_pills';
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    this.autoUsePillTooltipNode = null;
    this.autoUsePillTooltip.hide(true);
    this.combatSettingsExternalRevision = null;
  }

  /** 绑定战斗设置交互。 */
  private bindCombatSettingsEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-combat-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.combatSettingsTab;
        this.combatSettingsActiveTab = tab === 'targeting' || tab === 'targeting_plan' ? tab : 'auto_pills';
        this.renderCombatSettingsModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-apply]').forEach((button) => {
      button.addEventListener('click', () => this.applyCombatSettingsChanges());
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!this.confirmDiscardCombatSettingsChanges()) {
          return;
        }
        this.discardCombatSettingsDraft();
        detailModalHost.close(ActionPanel.COMBAT_SETTINGS_MODAL_OWNER);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillSlot);
        if (!Number.isInteger(slotIndex)) {
          return;
        }
        this.openAutoUsePillPicker(slotIndex);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-open-slot-conditions]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillOpenSlotConditions);
        if (!Number.isInteger(slotIndex)) {
          return;
        }
        this.openAutoUsePillConditionSettings(slotIndex);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-back]').forEach((button) => {
      button.addEventListener('click', () => {
        this.closeAutoUsePillSubview();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillPick;
        if (!itemId) {
          return;
        }
        this.assignAutoUsePillToSelectedSlot(itemId);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-clear-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        this.clearSelectedAutoUsePillSlot();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-add-condition]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillAddCondition;
        const kind = button.dataset.conditionKind as 'hp' | 'qi' | 'buff_missing' | undefined;
        if (!itemId || !kind) {
          return;
        }
        this.addAutoUsePillCondition(itemId, kind);
      });
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
      });
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
      });
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
      });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-condition-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillConditionRemove;
        const conditionIndex = Number(button.dataset.conditionIndex);
        if (!itemId || !Number.isInteger(conditionIndex)) {
          return;
        }
        this.removeAutoUsePillCondition(itemId, conditionIndex);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-targeting-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.combatTargetingToggle as CombatTargetingRuleKey | undefined;
        if (!key) {
          return;
        }
        const draft = this.syncCombatTargetingDraft();
        const isHostile = HOSTILE_TARGETING_KEYS.has(key);
        const scope = isHostile ? 'hostile' : 'friendly';
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
      });
    });
    root.querySelectorAll<HTMLElement>('[data-targeting-plan-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.targetingPlanMode as AutoBattleTargetingMode | undefined;
        if (!mode) {
          return;
        }
        this.autoBattleTargetingModeDraft = mode;
        this.renderCombatSettingsModal();
      });
    });
    this.bindAutoUsePillSlotTooltipEvents(root);
    this.bindAutoUsePillPickerTooltipEvents(root);
  }

  /** 绑定槽位 tooltip。 */
  private bindAutoUsePillSlotTooltipEvents(root: HTMLElement): void {
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
    });
  }

  /** 绑定药品选择器 tooltip。 */
  private bindAutoUsePillPickerTooltipEvents(root: HTMLElement): void {
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
        const tooltip = buildItemTooltipPayload(item);
        this.autoUsePillTooltipNode = card;
        this.autoUsePillTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }
      this.autoUsePillTooltip.move(event.clientX, event.clientY);
    });
    root.addEventListener('pointerleave', () => {
      this.autoUsePillTooltipNode = null;
      this.autoUsePillTooltip.hide();
    });
    root.addEventListener('pointerdown', () => {
      if (this.autoUsePillTooltipNode) {
        this.autoUsePillTooltipNode = null;
        this.autoUsePillTooltip.hide();
      }
    });
  }

  /** 渲染自动吃药条件摘要。 */
  private renderAutoUsePillConditionSummary(conditions: AutoUsePillCondition[]): string {
    if (conditions.length === 0) {
      return '未设置';
    }
    return conditions.map((condition) => {
      if (condition.type === 'buff_missing') {
        return '效果未生效';
      }
      return `${condition.resource === 'qi' ? '灵力' : '血量'} ${condition.op === 'lt' ? '<' : '>'} ${condition.thresholdPct}%`;
    }).join('；');
  }

  /** 应用战斗设置。 */
  private applyCombatSettingsChanges(): void {
    const nextPills = this.syncAutoUsePillDraft();
    const nextRules = this.syncCombatTargetingDraft();
    const nextTargetingMode = this.syncAutoBattleTargetingModeDraft();
    const pillsChanged = !this.areAutoUsePillConfigsEqual(nextPills, this.getAutoUsePills());
    const rulesChanged = !this.areCombatTargetingRulesEqual(nextRules, this.getCombatTargetingRules());
    const targetingModeChanged = nextTargetingMode !== this.getAutoBattleTargetingMode();
    const allowAoeChanged = (nextRules.includePlayers === true) !== this.allowAoePlayerHit;
    if (this.previewPlayer) {
      this.previewPlayer.autoUsePills = this.cloneAutoUsePillConfigs(nextPills);
      this.previewPlayer.combatTargetingRules = this.cloneCombatTargetingRules(nextRules);
      this.previewPlayer.autoBattleTargetingMode = nextTargetingMode;
      this.previewPlayer.allowAoePlayerHit = nextRules.includePlayers === true;
    }
    this.render(this.currentActions);
    this.discardCombatSettingsDraft();
    detailModalHost.close(ActionPanel.COMBAT_SETTINGS_MODAL_OWNER);
    if (pillsChanged) {
      this.onUpdateAutoUsePills?.(nextPills);
    }
    if (rulesChanged) {
      this.onUpdateCombatTargetingRules?.(nextRules);
    }
    if (targetingModeChanged) {
      this.onUpdateAutoBattleTargetingMode?.(nextTargetingMode);
    }
    if (allowAoeChanged) {
      this.onAction?.('toggle:allow_aoe_player_hit', false, undefined, undefined, '全体攻击');
    }
  }

  /** 打开技能方案弹层。 */
  private openSkillPresetModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.skillPresetNameDraft) {
      this.skillPresetNameDraft = this.buildDefaultSkillPresetName();
    }
    if (!this.selectedSkillPresetId) {
      this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    }
    this.skillPresetStatus = null;
    this.renderSkillPresetModal();
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
    return `已记录 ${skills.length} 项 · 自动 ${auto} · 手动 ${manual}`;
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
    return `命中 ${matched}/${preset.skills.length} 项 · 当前新增 ${currentOnly} 项`;
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
  private renderSkillPresetModal(): void {
    const currentSkills = this.getCurrentSkillPresetSnapshot();
    const selected = this.getSelectedSkillPreset();
    const currentSummary = this.getSkillPresetSummaryLine(currentSkills);
    const selectedSummary = selected ? this.getSkillPresetSummaryLine(selected.skills) : '未选择方案';
    const compatibilitySummary = selected ? this.getSkillPresetCompatibilitySummary(selected) : '从列表选择一个方案后可查看兼容情况。';

    detailModalHost.open({
      ownerId: ActionPanel.SKILL_PRESET_MODAL_OWNER,
      variantClass: 'detail-modal--skill-preset',
      title: '技能方案',
      subtitle: `本地方案 ${this.skillPresets.length} 份 · 当前技能 ${currentSkills.length} 项`,
      renderBody: (body) => {
        body.replaceChildren(createFragmentFromHtml(`
        <div class="skill-preset-shell ui-card-list">
          <div class="skill-preset-hero">
            <div class="skill-preset-card ui-surface-pane ui-surface-pane--stack">
              <div class="skill-preset-card-title">保存当前技能布局</div>
              <div class="skill-preset-card-copy ui-form-copy">只记录当前已启用技能的顺序，以及它们是自动还是手动。未写进方案的技能会视为禁用，只保存在当前浏览器。导入时会自动忽略不存在的技能，并把你当前多出来的技能保留在禁用区。</div>
              <div class="skill-manage-summary ui-meta-tag-row">
                <span class="ui-meta-tag">${escapeHtml(currentSummary)}</span>
              </div>
              <div class="skill-preset-save-row ui-action-row ui-action-row--start">
                <input
                  class="skill-preset-name-input ui-input"
                  data-skill-preset-name-input
                  type="text"
                  maxlength="${SKILL_PRESET_NAME_MAX_LENGTH}"
                  placeholder="输入方案名"
                  value="${escapeHtml(this.skillPresetNameDraft)}"
                />
                <button class="small-btn" data-skill-preset-save type="button"${currentSkills.length > 0 ? '' : ' disabled'}>保存当前</button>
                <button class="small-btn ghost" data-skill-preset-overwrite type="button"${selected && currentSkills.length > 0 ? '' : ' disabled'}>覆盖选中</button>
              </div>
            </div>
            <div class="skill-preset-card ui-surface-pane ui-surface-pane--stack">
              <div class="skill-preset-card-title">选中方案</div>
              <div class="skill-preset-card-copy ui-form-copy">${selected ? escapeHtml(selectedSummary) : '还没有选中任何技能方案。'}</div>
              <div class="skill-manage-summary ui-meta-tag-row">
                <span class="ui-meta-tag">${escapeHtml(compatibilitySummary)}</span>
                <span class="ui-meta-tag">${selected ? '导出内容只包含技能 id 顺序和自动/手动标记' : '可导出单个方案或整个本地列表'}</span>
              </div>
              <div class="skill-preset-actions ui-action-row ui-action-row--start">
                <button class="small-btn" data-skill-preset-apply type="button"${selected ? '' : ' disabled'}>套用选中</button>
                <button class="small-btn ghost" data-skill-preset-copy type="button"${selected ? '' : ' disabled'}>复制选中</button>
                <button class="small-btn ghost" data-skill-preset-export-selected type="button"${selected ? '' : ' disabled'}>导出选中</button>
                <button class="small-btn ghost" data-skill-preset-export-all type="button"${this.skillPresets.length > 0 ? '' : ' disabled'}>导出全部</button>
                <button class="small-btn danger" data-skill-preset-delete type="button"${selected ? '' : ' disabled'}>删除选中</button>
              </div>
            </div>
          </div>
          ${this.renderSkillPresetStatus()}
          <div class="skill-preset-layout">
            <div class="skill-preset-list-card ui-surface-pane ui-surface-pane--stack">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">本地方案列表</div>
                <div class="skill-preset-list-meta">${this.skillPresets.length > 0 ? '列表从上到下按最近保存排序' : '当前还没有保存任何方案'}</div>
              </div>
              ${this.skillPresets.length === 0
                ? '<div class="empty-hint ui-empty-hint">先保存一份当前技能方案，再进行导出或分享。</div>'
                : `<div class="skill-preset-list ui-card-list ui-scroll-panel">
                    ${this.skillPresets.map((preset) => `
                      <button
                        class="skill-preset-item ui-surface-card ui-surface-card--compact ui-selectable-card ${preset.id === this.selectedSkillPresetId ? 'is-active' : ''}"
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
            <div class="skill-preset-import-card ui-surface-pane ui-surface-pane--stack">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">导入数据</div>
                <button class="small-btn ghost" data-skill-preset-import-file-open type="button">读取文件</button>
              </div>
              <div class="skill-preset-card-copy ui-form-copy">支持导入键值文本，也兼容之前的 JSON 分享数据。若名称重复，会自动在本地追加编号。</div>
              <textarea
                class="skill-preset-import-input ui-textarea"
                data-skill-preset-import-input
                placeholder="粘贴技能方案文本，例如：&#10;v=3&#10;p=日常刷图&#10;s=fireball,1&#10;s=guard,0"
              >${escapeHtml(this.skillPresetImportText)}</textarea>
              <input class="hidden" data-skill-preset-import-file type="file" accept="text/plain,.txt,.preset,application/json,.json" />
              <div class="skill-preset-actions ui-action-row ui-action-row--start">
                <button class="small-btn" data-skill-preset-import type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>导入到本地</button>
                <button class="small-btn ghost" data-skill-preset-import-clear type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>清空输入</button>
              </div>
            </div>
          </div>
        </div>
      `));
      },
      onClose: () => {
        this.resetSkillPresetModalState();
      },
      onAfterRender: (body) => {
        this.bindSkillPresetEvents(body);
      },
    });
    this.skillPresetExternalRevision = this.buildSkillPresetExternalRevision();
  }

  /** 给技能方案弹层装配输入、保存、导入和导出事件。 */
  private bindSkillPresetEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-skill-preset-name-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.skillPresetNameDraft = input.value.slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-save]').forEach((button) => {
      button.addEventListener('click', () => {
        this.saveCurrentSkillPreset(false);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-overwrite]').forEach((button) => {
      button.addEventListener('click', () => {
        this.saveCurrentSkillPreset(true);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.skillPresetSelect;
        if (!presetId) {
          return;
        }
        this.selectedSkillPresetId = presetId;
        const preset = this.getSelectedSkillPreset();
        this.skillPresetNameDraft = preset?.name ?? this.skillPresetNameDraft;
        this.skillPresetStatus = null;
        this.renderSkillPresetModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applySelectedSkillPreset();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        this.copySelectedSkillPreset();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-selected]').forEach((button) => {
      button.addEventListener('click', () => {
        this.exportSelectedSkillPreset();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.exportAllSkillPresets();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        this.deleteSelectedSkillPreset();
      });
    });
    root.querySelectorAll<HTMLTextAreaElement>('[data-skill-preset-import-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.skillPresetImportText = input.value;
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        this.skillPresetImportText = '';
        this.skillPresetStatus = null;
        this.renderSkillPresetModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import]').forEach((button) => {
      button.addEventListener('click', () => {
        this.importSkillPresetsFromText(this.skillPresetImportText);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelector<HTMLInputElement>('[data-skill-preset-import-file]')?.click();
      });
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
            text: `已读取文件 ${file.name}，确认后即可导入本地。`,
          };
          this.renderSkillPresetModal();
        } catch {
          this.skillPresetStatus = {
            tone: 'error',
            text: '读取技能方案文件失败，请改用复制粘贴导入。',
          };
          this.renderSkillPresetModal();
        } finally {
          input.value = '';
        }
      });
    });
  }

  /** 把当前技能快照保存成新方案，或覆盖选中的方案。 */
  private saveCurrentSkillPreset(overwriteSelected: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const snapshot = this.getCurrentSkillPresetSnapshot();
    if (snapshot.length === 0) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '当前没有可保存的技能。',
      };
      this.renderSkillPresetModal();
      return;
    }
    const selected = this.getSelectedSkillPreset();
    const inputName = this.sanitizeSkillPresetName(this.skillPresetNameDraft);
    if (!inputName && !overwriteSelected) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '请先输入方案名。',
      };
      this.renderSkillPresetModal();
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
        text: `已覆盖方案“${nextName}”。`,
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
        text: `已保存方案“${nextName}”。`,
      };
    }

    this.saveSkillPresets();
    this.renderSkillPresetModal();
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
        text: '请先选择一个技能方案。',
      };
      this.renderSkillPresetModal();
      return;
    }
    const previousDraft = this.skillManagementDraft;
    this.skillManagementDraft = this.resolveAppliedSkillPresetConfigs(preset);
    const nextActions = this.getSkillManagementPreviewActions();
    this.skillManagementDraft = previousDraft;
    this.commitSkillPresetActions(nextActions);
    this.skillPresetStatus = {
      tone: 'success',
      text: `已套用方案“${preset.name}”。`,
    };
    this.renderSkillPresetModal();
  }

  /** 把选中方案的导出文本复制到剪贴板。 */
  private async copySelectedSkillPreset(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '请先选择一个技能方案。',
      };
      this.renderSkillPresetModal();
      return;
    }
    const text = this.buildSkillPresetExportText([preset]);
    if (!navigator.clipboard?.writeText) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '当前浏览器不支持直接复制，请改用导出文件。',
      };
      this.renderSkillPresetModal();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.skillPresetStatus = {
        tone: 'success',
        text: `已复制方案“${preset.name}”的数据。`,
      };
    } catch {
      this.skillPresetStatus = {
        tone: 'error',
        text: '复制失败，请改用导出文件。',
      };
    }
    this.renderSkillPresetModal();
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
      text: `已导出方案“${preset.name}”。`,
    };
    this.renderSkillPresetModal();
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
      text: `已导出全部 ${this.skillPresets.length} 份技能方案。`,
    };
    this.renderSkillPresetModal();
  }

  /** 删除当前选中的技能方案。 */
  private deleteSelectedSkillPreset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      return;
    }
    if (!window.confirm(`确定删除技能方案“${preset.name}”吗？`)) {
      return;
    }
    this.skillPresets = this.skillPresets.filter((entry) => entry.id !== preset.id);
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    this.skillPresetNameDraft = this.getSelectedSkillPreset()?.name ?? this.buildDefaultSkillPresetName();
    this.skillPresetStatus = {
      tone: 'success',
      text: `已删除方案“${preset.name}”。`,
    };
    this.saveSkillPresets();
    this.renderSkillPresetModal();
  }

  /** 从键值文本或旧 JSON 中导入技能方案。 */
  private importSkillPresetsFromText(rawText: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const text = rawText.trim();
    if (!text) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '请先粘贴要导入的技能方案数据。',
      };
      this.renderSkillPresetModal();
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
          text: '导入数据里没有找到可用的技能方案。',
        };
        this.renderSkillPresetModal();
        return;
      }
      this.skillPresets = [...imported, ...this.skillPresets];
      this.selectedSkillPresetId = imported[0]?.id ?? this.selectedSkillPresetId;
      this.skillPresetNameDraft = imported[0]?.name ?? this.buildDefaultSkillPresetName();
      this.skillPresetStatus = {
        tone: 'success',
        text: `已导入 ${imported.length} 份技能方案。`,
      };
      this.saveSkillPresets();
      this.renderSkillPresetModal();
    } catch {
      this.skillPresetStatus = {
        tone: 'error',
        text: '技能方案数据格式无效，请检查键值文本后重试。',
      };
      this.renderSkillPresetModal();
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

    this.skillManagementDraft = normalized;
    return normalized;
  }

  /** 把草稿套进当前动作快照，生成弹层里的预览列表。 */
  private getSkillManagementPreviewActions(): ActionDef[] {
    const draft = this.syncSkillManagementDraft();
    const draftMap = new Map(draft.map((entry, index) => [entry.skillId, { entry, index }]));
    const skillActions = this.getSkillActions(this.currentActions)
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
      .sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER));
    return this.replaceSkillActions(skillActions);
  }

  /** 生成技能管理弹层的外部变更摘要。 */
  private buildSkillManagementExternalRevision(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parts = [
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
      parts.push(action.desc);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detailModalHost.isOpenFor(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildSkillManagementExternalRevision();
    if (this.skillManagementExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillManagementModal();
  }

  /** 仅在技能方案弹层已打开且内容变化时重绘。 */
  private renderSkillPresetModalIfOpen(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detailModalHost.isOpenFor(ActionPanel.SKILL_PRESET_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildSkillPresetExternalRevision();
    if (this.skillPresetExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillPresetModal();
  }

  /** 渲染技能管理弹层，包含分组、筛选、排序和批量操作。 */
  private renderSkillManagementModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (detailModalHost.isOpenFor(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER)) {
      this.captureSkillManagementListScroll();
    }
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getSkillManagementEntries(previewActions);
    const filteredEntries = this.getFilteredSkillManagementEntries(skillEntries);
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(previewActions);
    const autoEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false);
    const manualEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false);
    const disabledEntries = filteredEntries.filter((entry) => entry.action.skillEnabled === false);
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
    const hint = this.buildSkillManagementHint(dragSortEnabled);

    detailModalHost.open({
      ownerId: ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--skill-management',
      title: '技能管理',
      subtitle: `已学技能 ${skillEntries.length} 项 · 当前过滤 ${filteredEntries.length} 项`,
      renderBody: (body) => {
        body.replaceChildren(createFragmentFromHtml(`
        <div class="skill-manage-shell ui-card-list">
          <div class="skill-manage-topbar">
            <div class="action-skill-subtabs skill-manage-subtabs ui-subtab-grid ui-subtab-grid--three-column">
              <button class="action-skill-subtab-btn ui-subtab-button ${this.skillManagementTab === 'auto' ? 'active' : ''}" data-skill-manage-tab="auto" type="button">
                自动
                <span class="action-skill-subtab-count ui-count-chip">${autoEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ui-subtab-button ${this.skillManagementTab === 'manual' ? 'active' : ''}" data-skill-manage-tab="manual" type="button">
                手动
                <span class="action-skill-subtab-count ui-count-chip">${manualEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ui-subtab-button ${this.skillManagementTab === 'disabled' ? 'active' : ''}" data-skill-manage-tab="disabled" type="button">
                禁用
                <span class="action-skill-subtab-count ui-count-chip">${disabledEntries.length}</span>
              </button>
            </div>
            <div class="skill-manage-toolbar ui-action-row ui-action-row--end">
              <button class="small-btn" data-skill-manage-apply type="button">应用</button>
              <button class="small-btn ghost" data-skill-manage-cancel type="button">取消</button>
              <button class="small-btn ghost ${this.skillManagementSortOpen ? 'active' : ''}" data-skill-manage-sort-toggle type="button">
                ${this.skillManagementSortOpen ? '收起排序' : '排序'}
              </button>
              <button class="small-btn ghost ${this.skillManagementFilterOpen ? 'active' : ''}" data-skill-manage-filter-toggle type="button">
                ${this.skillManagementFilterOpen ? '收起过滤' : '过滤'}
              </button>
            </div>
          </div>
          <div class="skill-manage-summary ui-meta-tag-row">
            <span class="ui-meta-tag">当前过滤 ${filteredEntries.length} 项</span>
            <span class="ui-meta-tag">自动 ${autoEntries.length} 项</span>
            <span class="ui-meta-tag">手动 ${manualEntries.length} 项</span>
            <span class="ui-meta-tag">禁用 ${disabledEntries.length} 项</span>
          </div>
          ${this.skillManagementSortOpen ? this.renderSkillManagementSortPanel(visibleEntries.length) : ''}
          ${this.skillManagementFilterOpen ? `
            <div class="skill-manage-filter-panel ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
              <div class="skill-manage-filter-head">
                <div class="skill-manage-filter-title">过滤技能</div>
                <button class="small-btn ghost" data-skill-manage-filter-all type="button">全部技能</button>
              </div>
              <div class="skill-manage-chip-group">
                <span class="skill-manage-chip-group-title">过滤标签</span>
                <div class="skill-manage-chip-row">
                  ${this.renderSkillManagementChipToggle('melee', '近战')}
                  ${this.renderSkillManagementChipToggle('ranged', '远程')}
                  ${this.renderSkillManagementChipToggle('physical', '物理')}
                  ${this.renderSkillManagementChipToggle('spell', '法术')}
                  ${this.renderSkillManagementChipToggle('single', '单体')}
                  ${this.renderSkillManagementChipToggle('aoe', '群攻')}
                </div>
              </div>
              <div class="skill-manage-filter-copy ui-form-copy">同类标签可同时选中；若某一类开了多个，则按该类任意命中处理。</div>
            </div>
          ` : ''}
          <div class="skill-manage-batch ui-action-row ui-action-row--start">
            <button class="small-btn" data-skill-manage-bulk="auto" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部自动</button>
            <button class="small-btn ghost" data-skill-manage-bulk="manual" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部手动</button>
            <button class="small-btn ghost" data-skill-manage-bulk="enabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部启用</button>
            <button class="small-btn ghost" data-skill-manage-bulk="disabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部禁用</button>
          </div>
          <div class="action-section-hint ui-form-copy">${hint}</div>
          ${visibleEntries.length === 0
            ? `<div class="empty-hint ui-empty-hint">${this.skillManagementTab === 'auto' ? '当前过滤下没有自动技能' : this.skillManagementTab === 'manual' ? '当前过滤下没有手动技能' : '当前过滤下没有禁用技能'}</div>`
            : `<div class="action-skill-list skill-manage-list ui-card-list ui-card-list--compact ui-scroll-panel">
              ${visibleEntries.map((entry) => this.renderSkillManagementItem(entry.action, {
                showDragHandle: dragSortEnabled,
                autoBattleDisplayOrder: this.skillManagementTab === 'auto'
                  ? (autoBattleDisplayOrders.get(entry.action.id) ?? null)
                  : null,
              })).join('')}
            </div>`}
        </div>
      `));
      },
      onClose: () => {
        this.discardSkillManagementDraft();
      },
      onAfterRender: (body) => {
        this.bindSkillManagementEvents(body);
        this.bindTooltips(body);
        this.restoreSkillManagementListScroll(body);
      },
    });
    this.skillManagementExternalRevision = this.buildSkillManagementExternalRevision();
  }

  /** 给技能管理弹层装配分组切换、筛选、排序和应用事件。 */
  private bindSkillManagementEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applySkillManagementChanges();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        this.cancelSkillManagementChanges();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.skillManageTab as SkillManagementTab | undefined;
        if (!tab) return;
        this.skillManagementTab = tab;
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.skillManagementSortOpen = !this.skillManagementSortOpen;
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-field-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortFieldToggle as SkillManagementSortField | undefined;
        if (!value) return;
        this.skillManagementSortField = value;
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-direction-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortDirectionToggle as SkillManagementSortDirection | undefined;
        if (!value) return;
        this.skillManagementSortDirection = value;
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-apply-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applySkillManagementSortOrder();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.skillManagementFilterOpen = !this.skillManagementFilterOpen;
        this.renderSkillManagementModal();
      });
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
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillManagementFilters();
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-bulk]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.skillManageBulk as SkillManagementBulkMode | undefined;
        if (!mode || !['auto', 'manual', 'enabled', 'disabled'].includes(mode)) {
          return;
        }
        this.applySkillManagementBulkMode(mode);
      });
    });
    this.bindSkillManagementAutoToggleEvents(root);
    this.bindSkillManagementEnabledToggleEvents(root);
    this.bindSkillManagementDragEvents(root);
  }

  /** 把当前过滤结果批量切成自动、手动、启用或禁用。 */
  private applySkillManagementBulkMode(mode: SkillManagementBulkMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const filteredSkillIds = new Set(
      this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions()))
        .map((entry) => entry.action.id),
    );
    if (filteredSkillIds.size === 0) {
      return;
    }
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
  private renderSkillManagementSortPanel(visibleCount: number): string {
    const canApplySort = this.skillManagementTab !== 'disabled'
      && this.skillManagementSortField !== 'custom'
      && visibleCount > 1;
    return `
      <div class="skill-manage-sort-panel ui-surface-pane ui-surface-pane--stack">
        <div class="skill-manage-filter-head">
          <div class="skill-manage-filter-title">排序规则</div>
          <button class="small-btn ghost" data-skill-manage-apply-sort type="button"${canApplySort ? '' : ' disabled'}>应用到当前顺位</button>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">排序字段</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementSortChip('custom', '当前顺位')}
            ${this.renderSkillManagementSortChip('actualDamage', '伤害')}
            ${this.renderSkillManagementSortChip('qiCost', '蓝耗')}
            ${this.renderSkillManagementSortChip('range', '距离')}
            ${this.renderSkillManagementSortChip('targetCount', '目标')}
            ${this.renderSkillManagementSortChip('cooldown', '冷却')}
          </div>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">排序方向</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementDirectionChip('desc', '倒序')}
            ${this.renderSkillManagementDirectionChip('asc', '正序')}
          </div>
        </div>
        <div class="skill-manage-filter-copy ui-form-copy">${this.skillManagementTab === 'disabled'
          ? '禁用页签只提供查看与筛选；重新启用后，技能会按原自动状态回到自动或手动列表。'
          : this.skillManagementSortField === 'custom'
            ? '当前顺位模式下，自动页签可直接拖拽调整优先级。'
            : '当前列表会按选定规则显示；点“应用到当前顺位”后，会把这一排序写回技能顺位。'}</div>
      </div>
    `;
  }

  /** 生成技能管理列表上方的操作提示。 */
  private buildSkillManagementHint(dragSortEnabled: boolean): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementTab === 'disabled') {
      return '这里是未启用的技能，重新打开“启用”后，技能会按当前自动状态回到自动或手动列表。';
    }
    if (this.skillManagementSortField !== 'custom') {
      return '当前列表已按选定规则排序显示，可切换升序或降序，也可把这一排序应用到当前顺位。';
    }
    if (dragSortEnabled) {
      return '自动战斗会按列表从上到下尝试技能，当前可直接拖拽调整优先级。';
    }
    return this.skillManagementTab === 'auto'
      ? '这里显示会参与自动战斗的技能，可继续用过滤条件缩小范围后批量调整。'
      : '这里显示仅手动触发的技能，可通过过滤快速圈定一组技能再批量切换。';
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
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
    this.render(this.currentActions);
    this.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  /** 放弃技能管理草稿并关闭弹层。 */
  private cancelSkillManagementChanges(): void {
    this.discardSkillManagementDraft();
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
  }

  /** 清掉技能管理草稿、拖拽态和滚动位置。 */
  private discardSkillManagementDraft(): void {
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.bindingActionId = null;
    this.clearDragState();
  }

  /** 把当前排序结果写回技能管理草稿顺位。 */
  private applySkillManagementSortOrder(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillManagementTab === 'disabled' || this.skillManagementSortField === 'custom') {
      return;
    }
    const visibleEntries = this.sortSkillManagementEntries(
      this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions()))
        .filter((entry) => (
          this.skillManagementTab === 'auto'
            ? entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false
            : entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false
        )),
    );
    const orderedIds = visibleEntries.map((entry) => entry.action.id);
    if (orderedIds.length <= 1) {
      return;
    }
    this.applySkillManagementDraftMutation((skills) => {
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
    });
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
    },
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
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item action-item-draggable ui-surface-card ui-surface-card--compact" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">[技能]</span>
          ${typeof action.range === 'number' ? `<span class="action-type">射程 ${action.range}</span>` : ''}
          <span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? '自动已启用' : '自动已停用'}</span>
          <span class="action-type ${skillEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${skillEnabled ? '技能已启用' : '技能已禁用'}</span>
          ${autoBattleOrder ? `<span class="action-type">顺位 ${autoBattleOrder}</span>` : ''}
        </div>
        <div class="action-desc">${escapeHtml(action.desc)}</div>
        ${affinityChip}
      </div>
      <div class="action-cta ui-action-row ui-action-row--end">
        <button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-skill-manage-auto-toggle="${action.id}" type="button">${autoBattleEnabled ? '自动 开' : '自动 关'}</button>
        <button class="small-btn ghost ${skillEnabled ? 'active' : ''}" data-skill-manage-enabled-toggle="${action.id}" type="button">${skillEnabled ? '启用 开' : '启用 关'}</button>
        ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-skill-manage-drag="${action.id}" draggable="true" type="button">拖拽</button>` : ''}
      </div>
    </div>`;
  }
}
