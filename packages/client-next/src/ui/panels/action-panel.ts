/**
 * 行动面板
 * 管理技能、对话、行动三大分类的操作列表，支持快捷键绑定、自动战斗技能排序与拖拽
 */

import { ActionDef, AutoBattleSkillConfig, PlayerState, SkillDef, type ElementKey, type SkillDamageKind } from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildSkillTooltipContent, type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getActionTypeLabel, getElementKeyLabel } from '../../domain-labels';
import { ACTION_SHORTCUTS_KEY, ACTION_SKILL_PRESETS_KEY, RETURN_TO_SPAWN_ACTION_ID } from '../../constants/ui/action';
import {
  appendUnique,
  decodePresetTextValue,
  escapeHtml,
  getSkillAffinityBadge,
  getSkillEnabledTechniques,
  isRecord,
  normalizeShortcutKey,
  readBoolean,
} from './action-panel-helpers';

/** ActionMainTab：定义该类型的结构与数据语义。 */
type ActionMainTab = 'dialogue' | 'skill' | 'toggle' | 'utility';
/** SkillSubTab：定义该类型的结构与数据语义。 */
type SkillSubTab = 'auto' | 'manual';
/** SkillManagementTab：定义该类型的结构与数据语义。 */
type SkillManagementTab = SkillSubTab | 'disabled';
/** SkillManagementBulkMode：定义该类型的结构与数据语义。 */
type SkillManagementBulkMode = SkillSubTab | 'enabled' | 'disabled';
/** SkillManagementSortField：定义该类型的结构与数据语义。 */
type SkillManagementSortField = 'custom' | 'actualDamage' | 'qiCost' | 'range' | 'targetCount' | 'cooldown';
/** SkillManagementSortDirection：定义该类型的结构与数据语义。 */
type SkillManagementSortDirection = 'asc' | 'desc';
/** SkillManagementFilterToggle：定义该类型的结构与数据语义。 */
type SkillManagementFilterToggle = 'melee' | 'ranged' | 'physical' | 'spell' | 'single' | 'aoe';
/** SkillPresetStatusTone：定义该类型的结构与数据语义。 */
type SkillPresetStatusTone = 'success' | 'error' | 'info';

/** ActionRowRefs：定义该接口的能力与字段约束。 */
interface ActionRowRefs {
/** row：定义该变量以承载业务值。 */
  row: HTMLElement;
/** cdNode：定义该变量以承载业务值。 */
  cdNode: HTMLElement;
/** execNode：定义该变量以承载业务值。 */
  execNode: HTMLButtonElement;
  stateNode?: HTMLElement;
  orderNode?: HTMLElement;
  toggleNode?: HTMLButtonElement;
}

/** SkillManagementEntry：定义该接口的能力与字段约束。 */
interface SkillManagementEntry {
/** action：定义该变量以承载业务值。 */
  action: ActionDef;
/** metrics：定义该变量以承载业务值。 */
  metrics: SkillPreviewMetrics;
}

/** ActionSkillAffinityBadge：定义该接口的能力与字段约束。 */
interface ActionSkillAffinityBadge {
/** label：定义该变量以承载业务值。 */
  label: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** tone：定义该变量以承载业务值。 */
  tone: 'physical' | 'spell' | 'mixed' | 'utility';
/** element：定义该变量以承载业务值。 */
  element: ElementKey | 'multi' | 'neutral';
}

/** SkillPresetSkillState：定义该接口的能力与字段约束。 */
interface SkillPresetSkillState {
/** skillId：定义该变量以承载业务值。 */
  skillId: string;
/** enabled：定义该变量以承载业务值。 */
  enabled: boolean;
/** skillEnabled：定义该变量以承载业务值。 */
  skillEnabled: boolean;
}

/** SkillPresetRecord：定义该接口的能力与字段约束。 */
interface SkillPresetRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** skills：定义该变量以承载业务值。 */
  skills: SkillPresetSkillState[];
}

/** SkillPresetLibrary：定义该接口的能力与字段约束。 */
interface SkillPresetLibrary {
/** v：定义该变量以承载业务值。 */
  v: number;
  p: Array<{
/** n：定义该变量以承载业务值。 */
    n: string;
/** s：定义该变量以承载业务值。 */
    s: Array<[string, 0 | 1]>;
  }>;
}

/** SkillPresetStatus：定义该接口的能力与字段约束。 */
interface SkillPresetStatus {
/** tone：定义该变量以承载业务值。 */
  tone: SkillPresetStatusTone;
/** text：定义该变量以承载业务值。 */
  text: string;
}

/** SKILL_PRESET_NAME_MAX_LENGTH：定义该变量以承载业务值。 */
const SKILL_PRESET_NAME_MAX_LENGTH = 24;
/** SKILL_PRESET_EXPORT_VERSION：定义该变量以承载业务值。 */
const SKILL_PRESET_EXPORT_VERSION = 2;

/** ActionPanel：封装相关状态与行为。 */
export class ActionPanel {
  private static readonly SKILL_MANAGEMENT_MODAL_OWNER = 'action-panel-skill-management';
  private static readonly SKILL_PRESET_MODAL_OWNER = 'action-panel-skill-preset';
  private pane = document.getElementById('pane-action')!;
  private onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null = null;
  private onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null = null;
/** activeTab：定义该变量以承载业务值。 */
  private activeTab: ActionMainTab = 'dialogue';
/** activeSkillTab：定义该变量以承载业务值。 */
  private activeSkillTab: SkillSubTab = 'auto';
/** skillManagementTab：定义该变量以承载业务值。 */
  private skillManagementTab: SkillManagementTab = 'auto';
/** skillManagementDraft：定义该变量以承载业务值。 */
  private skillManagementDraft: AutoBattleSkillConfig[] | null = null;
  private skillManagementSortOpen = false;
/** skillManagementSortField：定义该变量以承载业务值。 */
  private skillManagementSortField: SkillManagementSortField = 'custom';
/** skillManagementSortDirection：定义该变量以承载业务值。 */
  private skillManagementSortDirection: SkillManagementSortDirection = 'desc';
  private skillManagementFilterOpen = false;
  private skillManagementFilterToggles = new Set<SkillManagementFilterToggle>();
/** skillManagementExternalRevision：定义该变量以承载业务值。 */
  private skillManagementExternalRevision: string | null = null;
/** skillPresetExternalRevision：定义该变量以承载业务值。 */
  private skillPresetExternalRevision: string | null = null;
  private skillManagementListScrollTop = 0;
  private autoBattle = false;
  private autoRetaliate = true;
  private autoBattleStationary = false;
  private allowAoePlayerHit = false;
  private autoIdleCultivation = true;
  private autoSwitchCultivation = false;
  private cultivationActive = false;
/** currentActions：定义该变量以承载业务值。 */
  private currentActions: ActionDef[] = [];
  private shortcutBindings = new Map<string, string>();
/** skillPresets：定义该变量以承载业务值。 */
  private skillPresets: SkillPresetRecord[] = [];
/** selectedSkillPresetId：定义该变量以承载业务值。 */
  private selectedSkillPresetId: string | null = null;
  private skillPresetNameDraft = '';
  private skillPresetImportText = '';
/** skillPresetStatus：定义该变量以承载业务值。 */
  private skillPresetStatus: SkillPresetStatus | null = null;
/** bindingActionId：定义该变量以承载业务值。 */
  private bindingActionId: string | null = null;
/** draggingSkillId：定义该变量以承载业务值。 */
  private draggingSkillId: string | null = null;
/** dragOverSkillId：定义该变量以承载业务值。 */
  private dragOverSkillId: string | null = null;
/** dragOverPosition：定义该变量以承载业务值。 */
  private dragOverPosition: 'before' | 'after' | null = null;
  private previewPlayer?: PlayerState;
  private skillLookup = new Map<string, { skill: SkillDef; techLevel: number; knownSkills: SkillDef[] }>();
  private tooltip = new FloatingTooltip();
  private actionRowRefs = new Map<string, ActionRowRefs>();

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    this.skillPresets = this.loadSkillPresets();
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.tooltip.hide(true);
    this.actionRowRefs.clear();
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillPresetExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
    detailModalHost.close(ActionPanel.SKILL_PRESET_MODAL_OWNER);
    this.pane.innerHTML = '<div class="empty-hint">暂无可用行动</div>';
  }

  setCallbacks(
    onAction: (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void,
    onUpdateAutoBattleSkills?: (skills: AutoBattleSkillConfig[]) => void,
  ): void {
    this.onAction = onAction;
    this.onUpdateAutoBattleSkills = onUpdateAutoBattleSkills ?? null;
  }

  /** 全量更新行动列表并重新渲染 */
  update(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
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
  }

  /** 增量同步行动状态，优先 DOM patch 避免全量重绘 */
  syncDynamic(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
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
  }

/** initFromPlayer：执行对应的业务逻辑。 */
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
  }

/** syncPlayerContext：执行对应的业务逻辑。 */
  private syncPlayerContext(player: PlayerState): void {
/** knownSkills：定义该变量以承载业务值。 */
    const knownSkills = player.techniques.flatMap((technique) => technique.skills);
    this.skillLookup = new Map(
      player.techniques.flatMap((technique) => technique.skills.map((skill) => [
        skill.id,
        { skill, techLevel: technique.level, knownSkills },
      ] as const)),
    );
  }

/** render：执行对应的业务逻辑。 */
  private render(actions: ActionDef[]): void {
    if (actions.length === 0) {
      this.clear();
      return;
    }

/** tabGroups：定义该变量以承载业务值。 */
    const tabGroups: Array<{
/** id：定义该变量以承载业务值。 */
      id: ActionMainTab;
/** label：定义该变量以承载业务值。 */
      label: string;
/** types：定义该变量以承载业务值。 */
      types: string[];
    }> = [
      { id: 'dialogue', label: '对话', types: ['quest', 'interact', 'travel'] },
      { id: 'skill', label: '技能', types: ['skill', 'battle', 'gather'] },
      { id: 'toggle', label: '开关', types: ['toggle'] },
      { id: 'utility', label: '行动', types: ['toggle'] },
    ];
/** groups：定义该变量以承载业务值。 */
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const list = groups.get(action.type) ?? [];
      list.push(action);
      groups.set(action.type, list);
    }
/** autoBattleDisplayOrders：定义该变量以承载业务值。 */
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(actions);

/** html：定义该变量以承载业务值。 */
    let html = `<div class="action-tab-bar">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
/** switchEntries：定义该变量以承载业务值。 */
        const switchEntries = actions.filter((action) => this.isSwitchAction(action));
        if (switchEntries.length === 0) {
          html += '<div class="empty-hint">当前分组暂无内容</div></div>';
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">开关</div>
          <div class="intel-grid compact">`;
        for (const action of switchEntries) {
          html += this.renderSwitchItem(action);
        }
        html += '</div></div></div>';
        continue;
      }
      if (tab.id === 'utility') {
/** utilityEntries：定义该变量以承载业务值。 */
        const utilityEntries = actions.filter((action) => (
          (action.type === 'toggle' && !this.isSwitchAction(action))
          || this.isUtilityAction(action)
        ));
        if (utilityEntries.length === 0) {
          html += '<div class="empty-hint">当前分组暂无内容</div></div>';
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">行动</div>`;
        for (const action of utilityEntries) {
          html += this.renderActionItem(action);
        }
        html += '</div></div>';
        continue;
      }
/** relevantTypes：定义该变量以承载业务值。 */
      const relevantTypes = tab.types.filter((type) => (groups.get(type)?.length ?? 0) > 0);
      if (relevantTypes.length === 0) {
        html += '<div class="empty-hint">当前分组暂无内容</div>';
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
          html += `<div class="panel-section">
      <div class="panel-section-title">${getActionTypeLabel(type)}</div>`;
          for (const action of entries) {
            html += this.renderActionItem(action);
          }
          html += '</div>';
        }
      }
      html += '</div>';
    }

    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
      this.captureActionRowRefs();
      this.bindEvents(actions);
      this.bindTooltips(this.pane);
    });
  }

/** captureActionRowRefs：执行对应的业务逻辑。 */
  private captureActionRowRefs(): void {
    this.actionRowRefs.clear();
    this.pane.querySelectorAll<HTMLElement>('[data-action-row]').forEach((row) => {
/** actionId：定义该变量以承载业务值。 */
      const actionId = row.dataset.actionRow;
/** cdNode：定义该变量以承载业务值。 */
      const cdNode = row.querySelector<HTMLElement>('[data-action-cd]');
/** execNode：定义该变量以承载业务值。 */
      const execNode = row.querySelector<HTMLButtonElement>('[data-action-exec]');
      if (!actionId || !cdNode || !execNode) {
        return;
      }
/** stateNode：定义该变量以承载业务值。 */
      const stateNode = row.querySelector<HTMLElement>('[data-action-auto-state]');
/** orderNode：定义该变量以承载业务值。 */
      const orderNode = row.querySelector<HTMLElement>('[data-action-auto-order]');
/** toggleNode：定义该变量以承载业务值。 */
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

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(actions: ActionDef[]): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => {
/** tab：定义该变量以承载业务值。 */
        const tab = button.dataset.actionTab as ActionMainTab | undefined;
        if (!tab) return;
        this.activeTab = tab;
        this.render(actions);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-tab]').forEach((button) => {
      button.addEventListener('click', () => {
/** tab：定义该变量以承载业务值。 */
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
    this.bindActionCardEvents(this.pane);
    this.bindActionExecEvents(this.pane);
    this.bindBindActionEvents(this.pane);
    this.bindAutoBattleToggleEvents(this.pane);
    this.bindAutoBattleDragEvents(this.pane);
  }

/** bindTooltips：执行对应的业务逻辑。 */
  private bindTooltips(root: HTMLElement): void {
/** tapMode：定义该变量以承载业务值。 */
    const tapMode = prefersPinnedTooltipInteraction();
    root.querySelectorAll<HTMLElement>('[data-action-tooltip-title]').forEach((node) => {
/** title：定义该变量以承载业务值。 */
      const title = node.dataset.actionTooltipTitle ?? '';
/** rich：定义该变量以承载业务值。 */
      const rich = node.dataset.actionTooltipRich === '1';
/** skillId：定义该变量以承载业务值。 */
      const skillId = node.dataset.actionTooltipSkillId ?? '';
/** skillContext：定义该变量以承载业务值。 */
      const skillContext = skillId ? this.skillLookup.get(skillId) : undefined;
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
/** tooltip：定义该变量以承载业务值。 */
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
/** tooltip：定义该变量以承载业务值。 */
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

/** handleGlobalKeydown：执行对应的业务逻辑。 */
  private handleGlobalKeydown(event: KeyboardEvent): void {
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
/** normalized：定义该变量以承载业务值。 */
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

/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeShortcutKey(event.key);
    if (!normalized) return;
/** actionId：定义该变量以承载业务值。 */
    const actionId = [...this.shortcutBindings.entries()].find(([, binding]) => binding === normalized)?.[0];
    if (!actionId) return;
/** action：定义该变量以承载业务值。 */
    const action = this.currentActions.find((entry) => entry.id === actionId);
    if (!action || action.cooldownLeft > 0) return;
    event.preventDefault();
    this.onAction?.(action.id, action.requiresTarget, action.targetMode, action.range, action.name);
  }

/** renderShortcutBadge：执行对应的业务逻辑。 */
  private renderShortcutBadge(actionId: string): string {
/** binding：定义该变量以承载业务值。 */
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `<span class="action-shortcut-tag">键 ${binding.toUpperCase()}</span>` : '';
  }

/** renderShortcutMeta：执行对应的业务逻辑。 */
  private renderShortcutMeta(actionId: string): string {
/** binding：定义该变量以承载业务值。 */
    const binding = this.shortcutBindings.get(actionId);
    return binding ? ` · 快捷键 ${binding.toUpperCase()}` : '';
  }

/** isSwitchAction：执行对应的业务逻辑。 */
  private isSwitchAction(action: ActionDef): boolean {
    return action.type === 'toggle' && this.isSwitchActionId(action.id);
  }

/** isUtilityAction：执行对应的业务逻辑。 */
  private isUtilityAction(action: ActionDef): boolean {
    return this.isUtilityActionId(action.id);
  }

/** isUtilityActionId：执行对应的业务逻辑。 */
  private isUtilityActionId(actionId: string): boolean {
    return actionId === RETURN_TO_SPAWN_ACTION_ID || actionId === 'battle:force_attack';
  }

/** isSwitchActionId：执行对应的业务逻辑。 */
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

/** getSwitchCardTitle：执行对应的业务逻辑。 */
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

  private getSwitchCardState(action: ActionDef): { active: boolean; label: string } {
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
/** active：定义该变量以承载业务值。 */
        const active = this.previewPlayer?.senseQiActive === true;
        return { active, label: active ? '开' : '关' };
      }
      default:
        return { active: false, label: '执行' };
    }
  }

/** renderSwitchItem：执行对应的业务逻辑。 */
  private renderSwitchItem(action: ActionDef): string {
/** state：定义该变量以承载业务值。 */
    const state = this.getSwitchCardState(action);
    return `<div class="gm-player-row ${state.active ? 'active' : ''}" data-action-card="${action.id}" role="button" tabindex="0">
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

/** getBindButtonLabel：执行对应的业务逻辑。 */
  private getBindButtonLabel(actionId: string): string {
    if (this.bindingActionId === actionId) {
      return '按键中';
    }
/** binding：定义该变量以承载业务值。 */
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `改键 ${binding.toUpperCase()}` : '绑定键';
  }

/** loadShortcutBindings：执行对应的业务逻辑。 */
  private loadShortcutBindings(): Map<string, string> {
    try {
/** raw：定义该变量以承载业务值。 */
      const raw = localStorage.getItem(ACTION_SHORTCUTS_KEY);
      if (!raw) return new Map();
/** parsed：定义该变量以承载业务值。 */
      const parsed = JSON.parse(raw) as Record<string, string>;
/** result：定义该变量以承载业务值。 */
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

/** saveShortcutBindings：执行对应的业务逻辑。 */
  private saveShortcutBindings(): void {
/** payload：定义该变量以承载业务值。 */
    const payload = Object.fromEntries(this.shortcutBindings.entries());
    localStorage.setItem(ACTION_SHORTCUTS_KEY, JSON.stringify(payload));
  }

/** loadSkillPresets：执行对应的业务逻辑。 */
  private loadSkillPresets(): SkillPresetRecord[] {
    try {
/** raw：定义该变量以承载业务值。 */
      const raw = localStorage.getItem(ACTION_SKILL_PRESETS_KEY);
      if (!raw) {
        return [];
      }
/** parsed：定义该变量以承载业务值。 */
      const parsed = JSON.parse(raw) as unknown;
      return this.parseSkillPresetCollection(parsed, { preserveIds: true });
    } catch {
      return [];
    }
  }

/** saveSkillPresets：执行对应的业务逻辑。 */
  private saveSkillPresets(): void {
    localStorage.setItem(ACTION_SKILL_PRESETS_KEY, JSON.stringify(this.buildSkillPresetExportPayload(this.skillPresets)));
  }

  private parseSkillPresetCollection(
    payload: unknown,
    options?: { preserveIds?: boolean; existingNames?: Set<string> },
  ): SkillPresetRecord[] {
/** preserveIds：定义该变量以承载业务值。 */
    const preserveIds = options?.preserveIds === true;
/** existingNames：定义该变量以承载业务值。 */
    const existingNames = options?.existingNames ?? new Set<string>();
/** source：定义该变量以承载业务值。 */
    const source = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.p)
        ? payload.p
      : isRecord(payload) && Array.isArray(payload.presets)
        ? payload.presets
        : isRecord(payload) && (Array.isArray(payload.skills) || Array.isArray(payload.s))
          ? [payload]
          : [];
/** result：定义该变量以承载业务值。 */
    const result: SkillPresetRecord[] = [];
/** usedNames：定义该变量以承载业务值。 */
    const usedNames = new Set(existingNames);

    for (const [index, value] of source.entries()) {
      const preset = this.parseSkillPresetRecord(value, index, { preserveIds });
      if (!preset) {
        continue;
      }
/** uniqueName：定义该变量以承载业务值。 */
      const uniqueName = this.resolveUniqueSkillPresetName(preset.name, usedNames);
      result.push({
        ...preset,
        name: uniqueName,
      });
      usedNames.add(uniqueName);
    }
    return result;
  }

  private parseSkillPresetRecord(
    value: unknown,
    index: number,
    options?: { preserveIds?: boolean },
  ): SkillPresetRecord | null {
    if (!isRecord(value)) {
      return null;
    }
/** rawSkills：定义该变量以承载业务值。 */
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
/** skills：定义该变量以承载业务值。 */
    const skills: SkillPresetSkillState[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();
    for (const entry of rawSkills) {
      if (Array.isArray(entry)) {
        const skillId = typeof entry[0] === 'string' ? entry[0].trim() : '';
/** auto：定义该变量以承载业务值。 */
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
/** skillId：定义该变量以承载业务值。 */
      const skillId = typeof entry.skillId === 'string'
        ? entry.skillId.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
/** skillEnabled：定义该变量以承载业务值。 */
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
/** fallbackName：定义该变量以承载业务值。 */
    const fallbackName = `技能方案 ${index + 1}`;
/** name：定义该变量以承载业务值。 */
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
/** id：定义该变量以承载业务值。 */
      id: options?.preserveIds === true && typeof value.id === 'string' && value.id
        ? value.id
        : this.generateSkillPresetId(),
      name,
      skills,
    };
  }

/** sanitizeSkillPresetName：执行对应的业务逻辑。 */
  private sanitizeSkillPresetName(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
  }

/** resolveUniqueSkillPresetName：执行对应的业务逻辑。 */
  private resolveUniqueSkillPresetName(name: string, usedNames: Set<string>): string {
/** base：定义该变量以承载业务值。 */
    const base = this.sanitizeSkillPresetName(name) || '技能方案';
    if (!usedNames.has(base)) {
      return base;
    }
/** suffix：定义该变量以承载业务值。 */
    let suffix = 2;
    while (usedNames.has(`${base} (${suffix})`)) {
      suffix += 1;
    }
    return `${base} (${suffix})`;
  }

/** generateSkillPresetId：执行对应的业务逻辑。 */
  private generateSkillPresetId(): string {
    return `skill-preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

/** getCurrentSkillPresetSnapshot：执行对应的业务逻辑。 */
  private getCurrentSkillPresetSnapshot(): SkillPresetSkillState[] {
    return this.getAutoBattleSkillConfigs(this.currentActions)
      .filter((entry) => entry.skillEnabled !== false)
      .map((entry) => ({
        skillId: entry.skillId,
/** enabled：定义该变量以承载业务值。 */
        enabled: entry.enabled !== false,
        skillEnabled: true,
      }));
  }

/** buildSkillPresetExportPayload：执行对应的业务逻辑。 */
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

/** buildSkillPresetExportText：执行对应的业务逻辑。 */
  private buildSkillPresetExportText(presets: SkillPresetRecord[]): string {
/** lines：定义该变量以承载业务值。 */
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

  private parseSkillPresetText(
    text: string,
    options?: { preserveIds?: boolean; existingNames?: Set<string> },
  ): SkillPresetRecord[] {
/** parsedPresets：定义该变量以承载业务值。 */
    const parsedPresets: Array<{ n: string; s: Array<[string, 0 | 1]> }> = [];
/** current：定义该变量以承载业务值。 */
    let current: { n: string; s: Array<[string, 0 | 1]> } | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
/** separatorIndex：定义该变量以承载业务值。 */
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
      const key = line.slice(0, separatorIndex).trim();
/** value：定义该变量以承载业务值。 */
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
/** commaIndex：定义该变量以承载业务值。 */
        const commaIndex = value.lastIndexOf(',');
        if (commaIndex <= 0) {
          continue;
        }
/** skillId：定义该变量以承载业务值。 */
        const skillId = decodePresetTextValue(value.slice(0, commaIndex).trim());
/** autoFlag：定义该变量以承载业务值。 */
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

/** downloadSkillPresetPayload：执行对应的业务逻辑。 */
  private downloadSkillPresetPayload(fileName: string, text: string): void {
/** blob：定义该变量以承载业务值。 */
    const blob = new Blob([text], {
/** type：定义该变量以承载业务值。 */
      type: 'text/plain;charset=utf-8',
    });
/** url：定义该变量以承载业务值。 */
    const url = URL.createObjectURL(blob);
/** anchor：定义该变量以承载业务值。 */
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

/** buildDefaultSkillPresetName：执行对应的业务逻辑。 */
  private buildDefaultSkillPresetName(): string {
/** now：定义该变量以承载业务值。 */
    const now = new Date();
/** month：定义该变量以承载业务值。 */
    const month = String(now.getMonth() + 1).padStart(2, '0');
/** day：定义该变量以承载业务值。 */
    const day = String(now.getDate()).padStart(2, '0');
/** hour：定义该变量以承载业务值。 */
    const hour = String(now.getHours()).padStart(2, '0');
/** minute：定义该变量以承载业务值。 */
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `技能方案 ${month}-${day} ${hour}:${minute}`;
  }

/** buildSkillPresetExternalRevision：执行对应的业务逻辑。 */
  private buildSkillPresetExternalRevision(): string {
/** parts：定义该变量以承载业务值。 */
    const parts: string[] = [];
    for (const action of this.getSkillActions(this.currentActions)) {
      parts.push(action.id);
      parts.push(action.autoBattleEnabled !== false ? '1' : '0');
      parts.push(action.skillEnabled !== false ? '1' : '0');
    }
    return parts.join('\u0001');
  }

/** withUtilityActions：执行对应的业务逻辑。 */
  private withUtilityActions(actions: ActionDef[]): ActionDef[] {
/** result：定义该变量以承载业务值。 */
    const result = [...actions];
/** knownSkillActions：定义该变量以承载业务值。 */
    const knownSkillActions = this.previewPlayer ? this.buildTechniqueFallbackActions(this.previewPlayer, result) : [];
    for (const action of knownSkillActions) {
      if (!result.some((entry) => entry.id === action.id)) {
        result.push(action);
      }
    }
    if (!result.some((action) => action.id === 'client:take')) {
      result.push({
        id: 'client:take',
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

/** buildTechniqueFallbackActions：执行对应的业务逻辑。 */
  private buildTechniqueFallbackActions(player: PlayerState, currentActions: ActionDef[]): ActionDef[] {
/** existingSkillIds：定义该变量以承载业务值。 */
    const existingSkillIds = new Set(currentActions.filter((action) => action.type === 'skill').map((action) => action.id));
/** autoBattleSkillMap：定义该变量以承载业务值。 */
    const autoBattleSkillMap = new Map((player.autoBattleSkills ?? []).map((entry, index) => [entry.skillId, { entry, index }] as const));
/** fallback：定义该变量以承载业务值。 */
    const fallback: ActionDef[] = [];
    for (const technique of player.techniques) {
      for (const skill of technique.skills ?? []) {
        if (existingSkillIds.has(skill.id)) {
          continue;
        }
/** config：定义该变量以承载业务值。 */
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
/** leftOrder：定义该变量以承载业务值。 */
      const leftOrder = left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
/** rightOrder：定义该变量以承载业务值。 */
      const rightOrder = right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
      return (leftOrder - rightOrder) || left.id.localeCompare(right.id, 'zh-Hans-CN');
    });
    return fallback;
  }

  private renderActionItem(
    action: ActionDef,
    options?: {
      showDragHandle?: boolean;
      autoBattleDisplayOrder?: number | null;
    },
  ): string {
/** onCd：定义该变量以承载业务值。 */
    const onCd = action.cooldownLeft > 0;
/** isAutoBattleSkill：定义该变量以承载业务值。 */
    const isAutoBattleSkill = action.type === 'skill';
/** skillContext：定义该变量以承载业务值。 */
    const skillContext = this.skillLookup.get(action.id);
/** tooltipAttrs：定义该变量以承载业务值。 */
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
/** autoBattleEnabled：定义该变量以承载业务值。 */
    const autoBattleEnabled = action.autoBattleEnabled !== false;
/** autoBattleOrder：定义该变量以承载业务值。 */
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
/** rowAttrs：定义该变量以承载业务值。 */
    const rowAttrs = isAutoBattleSkill && options?.showDragHandle
      ? ` data-auto-battle-skill-row="${action.id}"`
      : '';
/** autoBattleMeta：定义该变量以承载业务值。 */
    const autoBattleMeta = isAutoBattleSkill
      ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? '自动已启用' : '自动已停用'}</span>
         ${autoBattleOrder ? `<span class="action-type">顺位 ${autoBattleOrder}</span>` : ''}`
      : '';
/** autoBattleControls：定义该变量以承载业务值。 */
    const autoBattleControls = isAutoBattleSkill
      ? `<button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-auto-battle-toggle="${action.id}" type="button">${autoBattleEnabled ? '自动 开' : '自动 关'}</button>
         ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-auto-battle-drag="${action.id}" draggable="true" type="button">拖拽</button>` : ''}`
      : '';
/** affinityChip：定义该变量以承载业务值。 */
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item ${onCd ? 'cooldown' : ''} ${isAutoBattleSkill ? 'action-item-draggable' : ''}" data-action-row="${action.id}"${rowAttrs}>
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
      <div class="action-cta">
        ${autoBattleControls}
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
        <span class="action-cd" data-action-cd="${action.id}"${onCd ? '' : ' hidden'}>${onCd ? `冷却 ${action.cooldownLeft} 息` : ''}</span>
        <button class="small-btn" data-action="${action.id}" data-action-exec="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}"${onCd ? ' hidden' : ''}>执行</button>
      </div>
    </div>`;
  }

/** renderActionSkillAffinityChip：执行对应的业务逻辑。 */
  private renderActionSkillAffinityChip(skill: SkillDef): string {
/** badge：定义该变量以承载业务值。 */
    const badge = getSkillAffinityBadge(skill);
/** elementClass：定义该变量以承载业务值。 */
    const elementClass = badge.element === 'neutral' ? '' : ` item-card-chip--element-${badge.element}`;
/** title：定义该变量以承载业务值。 */
    const title = escapeHtml(badge.title);
    return `<span class="item-card-chip item-card-chip--affinity item-card-chip--${badge.tone}${elementClass} action-skill-affinity-chip" title="${title}" aria-label="${title}">${escapeHtml(badge.label)}</span>`;
  }

/** toggleAutoBattleSkill：执行对应的业务逻辑。 */
  private toggleAutoBattleSkill(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

/** toggleSkillEnabled：执行对应的业务逻辑。 */
  private toggleSkillEnabled(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

/** toggleSkillManagementAutoBattleSkill：执行对应的业务逻辑。 */
  private toggleSkillManagementAutoBattleSkill(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

/** toggleSkillManagementSkillEnabled：执行对应的业务逻辑。 */
  private toggleSkillManagementSkillEnabled(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

/** moveAutoBattleSkill：执行对应的业务逻辑。 */
  private moveAutoBattleSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
    if (actionId === targetId) return;
    this.applyAutoBattleSkillMutation((skills) => {
/** sourceIndex：定义该变量以承载业务值。 */
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
/** targetIndex：定义该变量以承载业务值。 */
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
/** next：定义该变量以承载业务值。 */
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
/** baseIndex：定义该变量以承载业务值。 */
      const baseIndex = next.findIndex((action) => action.id === targetId);
/** insertIndex：定义该变量以承载业务值。 */
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

/** moveSkillManagementSkill：执行对应的业务逻辑。 */
  private moveSkillManagementSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
    if (actionId === targetId) return;
    this.applySkillManagementDraftMutation((skills) => {
/** sourceIndex：定义该变量以承载业务值。 */
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
/** targetIndex：定义该变量以承载业务值。 */
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
/** next：定义该变量以承载业务值。 */
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
/** baseIndex：定义该变量以承载业务值。 */
      const baseIndex = next.findIndex((action) => action.id === targetId);
/** insertIndex：定义该变量以承载业务值。 */
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  private applyAutoBattleSkillMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
/** skillActions：定义该变量以承载业务值。 */
    const skillActions = this.currentActions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        ...action,
/** autoBattleEnabled：定义该变量以承载业务值。 */
        autoBattleEnabled: action.autoBattleEnabled !== false,
      }));
/** mutated：定义该变量以承载业务值。 */
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

  private applySkillManagementDraftMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
/** orderedIds：定义该变量以承载业务值。 */
    const orderedIds = this.skillManagementSortField === 'custom'
      ? []
      : this.getSortedSkillManagementActionIds();
/** skillActions：定义该变量以承载业务值。 */
    const skillActions = this.getSkillActions(this.getSkillManagementPreviewActions())
      .map((action) => ({
        ...action,
/** autoBattleEnabled：定义该变量以承载业务值。 */
        autoBattleEnabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
        skillEnabled: action.skillEnabled !== false,
      }));
/** orderedSkillActions：定义该变量以承载业务值。 */
    const orderedSkillActions = orderedIds.length > 1
      ? this.reorderSkillManagementSubset(skillActions, orderedIds)
      : skillActions;
/** mutated：定义该变量以承载业务值。 */
    const mutated = this.withSequentialAutoBattleOrder(mutator(orderedSkillActions));
    this.skillManagementDraft = this.getAutoBattleSkillConfigs(mutated);
    this.renderSkillManagementModal();
  }

/** withSequentialAutoBattleOrder：执行对应的业务逻辑。 */
  private withSequentialAutoBattleOrder(actions: ActionDef[]): ActionDef[] {
    return actions.map((action, index) => ({
      ...action,
/** autoBattleEnabled：定义该变量以承载业务值。 */
      autoBattleEnabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
      skillEnabled: action.skillEnabled !== false,
      autoBattleOrder: index,
    }));
  }

/** replaceSkillActions：执行对应的业务逻辑。 */
  private replaceSkillActions(skillActions: ActionDef[]): ActionDef[] {
/** skillIndex：定义该变量以承载业务值。 */
    let skillIndex = 0;
    return this.currentActions.map((action) => {
      if (action.type !== 'skill') {
        return action;
      }
      return skillActions[skillIndex++] ?? action;
    });
  }

/** getAutoBattleSkillConfigs：执行对应的业务逻辑。 */
  private getAutoBattleSkillConfigs(actions: ActionDef[]): AutoBattleSkillConfig[] {
    return actions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
/** enabled：定义该变量以承载业务值。 */
        enabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
        skillEnabled: action.skillEnabled !== false,
      }));
  }

/** updateDragIndicators：执行对应的业务逻辑。 */
  private updateDragIndicators(): void {
    document.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row], [data-skill-manage-skill-row]').forEach((row) => {
/** actionId：定义该变量以承载业务值。 */
      const actionId = row.dataset.autoBattleSkillRow ?? row.dataset.skillManageSkillRow;
/** isDragging：定义该变量以承载业务值。 */
      const isDragging = actionId === this.draggingSkillId;
/** isBefore：定义该变量以承载业务值。 */
      const isBefore = actionId === this.dragOverSkillId && this.dragOverPosition === 'before';
/** isAfter：定义该变量以承载业务值。 */
      const isAfter = actionId === this.dragOverSkillId && this.dragOverPosition === 'after';
      row.classList.toggle('dragging', isDragging);
      row.classList.toggle('drag-over-before', isBefore);
      row.classList.toggle('drag-over-after', isAfter);
    });
  }

/** clearDragState：执行对应的业务逻辑。 */
  private clearDragState(): void {
    this.draggingSkillId = null;
    this.dragOverSkillId = null;
    this.dragOverPosition = null;
    this.updateDragIndicators();
  }

/** patchToggleCards：执行对应的业务逻辑。 */
  private patchToggleCards(): boolean {
    return true;
  }

/** patchActionRows：执行对应的业务逻辑。 */
  private patchActionRows(): boolean {
/** autoBattleDisplayOrders：定义该变量以承载业务值。 */
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(this.currentActions);
    for (const action of this.currentActions) {
      if (
        this.isSwitchAction(action)
        || action.id === 'client:observe'
        || action.type === 'breakthrough'
      ) {
        continue;
      }
/** refs：定义该变量以承载业务值。 */
      const refs = this.actionRowRefs.get(action.id);
/** row：定义该变量以承载业务值。 */
      const row = refs?.row;
      if (!row) {
        if (action.type === 'skill') {
          continue;
        }
        return false;
      }
/** onCd：定义该变量以承载业务值。 */
      const onCd = action.cooldownLeft > 0;
      row.classList.toggle('cooldown', onCd);

/** cdNode：定义该变量以承载业务值。 */
      const cdNode = refs.cdNode;
/** execNode：定义该变量以承载业务值。 */
      const execNode = refs.execNode;
      if (!cdNode || !execNode) {
        return false;
      }
      cdNode.textContent = onCd ? `冷却 ${action.cooldownLeft} 息` : '';
      cdNode.hidden = !onCd;
      execNode.hidden = onCd;
      execNode.disabled = onCd;

      if (action.type === 'skill') {
/** stateNode：定义该变量以承载业务值。 */
        const stateNode = refs.stateNode;
/** orderNode：定义该变量以承载业务值。 */
        const orderNode = refs.orderNode;
/** toggleNode：定义该变量以承载业务值。 */
        const toggleNode = refs.toggleNode;
        if (!stateNode || !orderNode || !toggleNode) {
          return false;
        }
/** enabled：定义该变量以承载业务值。 */
        const enabled = action.autoBattleEnabled !== false;
/** showOrder：定义该变量以承载业务值。 */
        const showOrder = this.activeSkillTab === 'auto' && enabled;
/** order：定义该变量以承载业务值。 */
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

/** renderSkillSection：执行对应的业务逻辑。 */
  private renderSkillSection(actions: ActionDef[], autoBattleDisplayOrders: Map<string, number>): string {
/** enabledSkills：定义该变量以承载业务值。 */
    const enabledSkills = actions.filter((action) => action.skillEnabled !== false);
/** autoSkills：定义该变量以承载业务值。 */
    const autoSkills = enabledSkills.filter((action) => action.autoBattleEnabled !== false);
/** manualSkills：定义该变量以承载业务值。 */
    const manualSkills = enabledSkills.filter((action) => action.autoBattleEnabled === false);
/** visibleSkills：定义该变量以承载业务值。 */
    const visibleSkills = this.activeSkillTab === 'auto' ? autoSkills : manualSkills;
/** hint：定义该变量以承载业务值。 */
    const hint = this.activeSkillTab === 'auto'
      ? '自动战斗会按列表从上到下尝试已启用技能，可直接拖拽调整优先级。'
      : '这里的技能不会参与自动战斗，但仍可手动点击或使用绑定键触发。';

/** html：定义该变量以承载业务值。 */
    let html = `<div class="panel-section">
      <div class="panel-section-head">
        <div class="panel-section-title">技能</div>
        <div class="action-section-actions">
          <button class="small-btn ghost" data-action-skill-manage-open type="button">技能管理</button>
          <button class="small-btn ghost" data-action-skill-preset-open type="button">技能方案</button>
        </div>
      </div>
      <div class="action-skill-subtabs">
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'auto' ? 'active' : ''}" data-action-skill-tab="auto" type="button">
          自动
          <span class="action-skill-subtab-count">${autoSkills.length}</span>
        </button>
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'manual' ? 'active' : ''}" data-action-skill-tab="manual" type="button">
          手动
          <span class="action-skill-subtab-count">${manualSkills.length}</span>
        </button>
      </div>
      <div class="action-section-hint">${hint}</div>`;

    if (visibleSkills.length === 0) {
      html += `<div class="empty-hint">${this.activeSkillTab === 'auto' ? '当前没有启用自动战斗的技能' : '当前没有仅手动触发的技能'}</div>`;
    } else {
      html += '<div class="action-skill-list">';
      for (const action of visibleSkills) {
        html += this.renderActionItem(action, {
/** showDragHandle：定义该变量以承载业务值。 */
          showDragHandle: this.activeSkillTab === 'auto',
/** autoBattleDisplayOrder：定义该变量以承载业务值。 */
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

/** buildAutoBattleDisplayOrderMap：执行对应的业务逻辑。 */
  private buildAutoBattleDisplayOrderMap(actions: ActionDef[]): Map<string, number> {
/** displayOrder：定义该变量以承载业务值。 */
    const displayOrder = new Map<string, number>();
/** nextOrder：定义该变量以承载业务值。 */
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

/** bindActionCardEvents：执行对应的业务逻辑。 */
  private bindActionCardEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-action-card]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.bindAction) return;
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.actionCard;
        if (!actionId) return;
/** action：定义该变量以承载业务值。 */
        const action = this.currentActions.find((entry) => entry.id === actionId);
        this.onAction?.(actionId, action?.requiresTarget, action?.targetMode, action?.range, action?.name ?? actionId);
      });
    });
  }

/** bindActionExecEvents：执行对应的业务逻辑。 */
  private bindActionExecEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.action!;
/** actionName：定义该变量以承载业务值。 */
        const actionName = button.dataset.actionName || actionId;
/** requiresTarget：定义该变量以承载业务值。 */
        const requiresTarget = button.dataset.actionTarget === '1';
/** targetMode：定义该变量以承载业务值。 */
        const targetMode = button.dataset.actionTargetMode || undefined;
/** rangeText：定义该变量以承载业务值。 */
        const rangeText = button.dataset.actionRange;
/** range：定义该变量以承载业务值。 */
        const range = rangeText ? Number(rangeText) : undefined;
        this.onAction?.(actionId, requiresTarget, targetMode, Number.isFinite(range) ? range : undefined, actionName);
      });
    });
  }

/** bindBindActionEvents：执行对应的业务逻辑。 */
  private bindBindActionEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.bindAction;
        if (!actionId) return;
        this.bindingActionId = this.bindingActionId === actionId ? null : actionId;
        this.render(this.currentActions);
        this.renderSkillManagementModalIfOpen();
      });
    });
  }

/** bindAutoBattleToggleEvents：执行对应的业务逻辑。 */
  private bindAutoBattleToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.autoBattleToggle;
        if (!actionId) return;
        this.toggleAutoBattleSkill(actionId);
      });
    });
  }

/** bindSkillEnabledToggleEvents：执行对应的业务逻辑。 */
  private bindSkillEnabledToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.skillEnabledToggle;
        if (!actionId) return;
        this.toggleSkillEnabled(actionId);
      });
    });
  }

/** bindAutoBattleDragEvents：执行对应的业务逻辑。 */
  private bindAutoBattleDragEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
/** actionId：定义该变量以承载业务值。 */
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
/** actionId：定义该变量以承载业务值。 */
        const actionId = row.dataset.autoBattleSkillRow;
        if (!actionId || !this.draggingSkillId || actionId === this.draggingSkillId) return;
/** rect：定义该变量以承载业务值。 */
        const rect = row.getBoundingClientRect();
/** midpoint：定义该变量以承载业务值。 */
        const midpoint = rect.top + rect.height / 2;
        this.dragOverSkillId = actionId;
        this.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.updateDragIndicators();
      });
      row.addEventListener('dragleave', (event) => {
/** related：定义该变量以承载业务值。 */
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
/** targetId：定义该变量以承载业务值。 */
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

/** bindSkillManagementAutoToggleEvents：执行对应的业务逻辑。 */
  private bindSkillManagementAutoToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-auto-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.skillManageAutoToggle;
        if (!actionId) return;
        this.toggleSkillManagementAutoBattleSkill(actionId);
      });
    });
  }

/** bindSkillManagementEnabledToggleEvents：执行对应的业务逻辑。 */
  private bindSkillManagementEnabledToggleEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
/** actionId：定义该变量以承载业务值。 */
        const actionId = button.dataset.skillManageEnabledToggle;
        if (!actionId) return;
        this.toggleSkillManagementSkillEnabled(actionId);
      });
    });
  }

/** bindSkillManagementDragEvents：执行对应的业务逻辑。 */
  private bindSkillManagementDragEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
/** actionId：定义该变量以承载业务值。 */
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
/** actionId：定义该变量以承载业务值。 */
        const actionId = row.dataset.skillManageSkillRow;
        if (!actionId || !this.draggingSkillId || actionId === this.draggingSkillId) return;
/** rect：定义该变量以承载业务值。 */
        const rect = row.getBoundingClientRect();
/** midpoint：定义该变量以承载业务值。 */
        const midpoint = rect.top + rect.height / 2;
        this.dragOverSkillId = actionId;
        this.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.updateDragIndicators();
      });
      row.addEventListener('dragleave', (event) => {
/** related：定义该变量以承载业务值。 */
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
/** targetId：定义该变量以承载业务值。 */
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

/** getSkillActions：执行对应的业务逻辑。 */
  private getSkillActions(actions: ActionDef[] = this.currentActions): ActionDef[] {
    return actions.filter((action) => action.type === 'skill');
  }

/** openSkillManagement：执行对应的业务逻辑。 */
  private openSkillManagement(): void {
    this.skillManagementTab = this.activeSkillTab;
    this.skillManagementListScrollTop = 0;
    this.syncSkillManagementDraft();
    this.renderSkillManagementModal();
  }

/** openSkillPresetModal：执行对应的业务逻辑。 */
  private openSkillPresetModal(): void {
    if (!this.skillPresetNameDraft) {
      this.skillPresetNameDraft = this.buildDefaultSkillPresetName();
    }
    if (!this.selectedSkillPresetId) {
      this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    }
    this.skillPresetStatus = null;
    this.renderSkillPresetModal();
  }

/** resetSkillPresetModalState：执行对应的业务逻辑。 */
  private resetSkillPresetModalState(): void {
    this.skillPresetNameDraft = '';
    this.skillPresetImportText = '';
    this.skillPresetStatus = null;
    if (!this.skillPresets.some((preset) => preset.id === this.selectedSkillPresetId)) {
      this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    }
  }

/** getSelectedSkillPreset：执行对应的业务逻辑。 */
  private getSelectedSkillPreset(): SkillPresetRecord | null {
    if (!this.selectedSkillPresetId) {
      return null;
    }
    return this.skillPresets.find((preset) => preset.id === this.selectedSkillPresetId) ?? null;
  }

/** getSkillPresetSummaryLine：执行对应的业务逻辑。 */
  private getSkillPresetSummaryLine(skills: SkillPresetSkillState[]): string {
/** auto：定义该变量以承载业务值。 */
    const auto = skills.filter((skill) => skill.enabled !== false).length;
/** manual：定义该变量以承载业务值。 */
    const manual = skills.length - auto;
    return `已记录 ${skills.length} 项 · 自动 ${auto} · 手动 ${manual}`;
  }

/** getSkillPresetCompatibilitySummary：执行对应的业务逻辑。 */
  private getSkillPresetCompatibilitySummary(preset: SkillPresetRecord): string {
/** currentSkillIds：定义该变量以承载业务值。 */
    const currentSkillIds = new Set(this.getSkillActions(this.currentActions).map((action) => action.id));
/** presetSkillIds：定义该变量以承载业务值。 */
    const presetSkillIds = new Set(preset.skills.map((skill) => skill.skillId));
/** matched：定义该变量以承载业务值。 */
    let matched = 0;
    for (const skill of preset.skills) {
      if (currentSkillIds.has(skill.skillId)) {
        matched += 1;
      }
    }
/** currentOnly：定义该变量以承载业务值。 */
    let currentOnly = 0;
    for (const action of this.getSkillActions(this.currentActions)) {
      if (!presetSkillIds.has(action.id)) {
        currentOnly += 1;
      }
    }
    return `命中 ${matched}/${preset.skills.length} 项 · 当前新增 ${currentOnly} 项`;
  }

/** renderSkillPresetStatus：执行对应的业务逻辑。 */
  private renderSkillPresetStatus(): string {
    if (!this.skillPresetStatus) {
      return '';
    }
    return `<div class="skill-preset-status ${this.skillPresetStatus.tone === 'error' ? 'error' : this.skillPresetStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.skillPresetStatus.text)}</div>`;
  }

/** renderSkillPresetModal：执行对应的业务逻辑。 */
  private renderSkillPresetModal(): void {
/** currentSkills：定义该变量以承载业务值。 */
    const currentSkills = this.getCurrentSkillPresetSnapshot();
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedSkillPreset();
/** currentSummary：定义该变量以承载业务值。 */
    const currentSummary = this.getSkillPresetSummaryLine(currentSkills);
/** selectedSummary：定义该变量以承载业务值。 */
    const selectedSummary = selected ? this.getSkillPresetSummaryLine(selected.skills) : '未选择方案';
/** compatibilitySummary：定义该变量以承载业务值。 */
    const compatibilitySummary = selected ? this.getSkillPresetCompatibilitySummary(selected) : '从列表选择一个方案后可查看兼容情况。';

    detailModalHost.open({
      ownerId: ActionPanel.SKILL_PRESET_MODAL_OWNER,
      variantClass: 'detail-modal--skill-preset',
      title: '技能方案',
      subtitle: `本地方案 ${this.skillPresets.length} 份 · 当前技能 ${currentSkills.length} 项`,
      bodyHtml: `
        <div class="skill-preset-shell">
          <div class="skill-preset-hero">
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">保存当前技能布局</div>
              <div class="skill-preset-card-copy">只记录当前已启用技能的顺序，以及它们是自动还是手动。未写进方案的技能会视为禁用，只保存在当前浏览器。导入时会自动忽略不存在的技能，并把你当前多出来的技能保留在禁用区。</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(currentSummary)}</span>
              </div>
              <div class="skill-preset-save-row">
                <input
                  class="skill-preset-name-input"
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
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">选中方案</div>
              <div class="skill-preset-card-copy">${selected ? escapeHtml(selectedSummary) : '还没有选中任何技能方案。'}</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(compatibilitySummary)}</span>
                <span>${selected ? '导出内容只包含技能 id 顺序和自动/手动标记' : '可导出单个方案或整个本地列表'}</span>
              </div>
              <div class="skill-preset-actions">
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
            <div class="skill-preset-list-card">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">本地方案列表</div>
                <div class="skill-preset-list-meta">${this.skillPresets.length > 0 ? '列表从上到下按最近保存排序' : '当前还没有保存任何方案'}</div>
              </div>
              ${this.skillPresets.length === 0
                ? '<div class="empty-hint">先保存一份当前技能方案，再进行导出或分享。</div>'
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
                <div class="skill-preset-card-title">导入数据</div>
                <button class="small-btn ghost" data-skill-preset-import-file-open type="button">读取文件</button>
              </div>
              <div class="skill-preset-card-copy">支持导入键值文本，也兼容之前的 JSON 分享数据。若名称重复，会自动在本地追加编号。</div>
              <textarea
                class="skill-preset-import-input"
                data-skill-preset-import-input
                placeholder="粘贴技能方案文本，例如：&#10;v=3&#10;p=日常刷图&#10;s=fireball,1&#10;s=guard,0"
              >${escapeHtml(this.skillPresetImportText)}</textarea>
              <input class="hidden" data-skill-preset-import-file type="file" accept="text/plain,.txt,.preset,application/json,.json" />
              <div class="skill-preset-actions">
                <button class="small-btn" data-skill-preset-import type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>导入到本地</button>
                <button class="small-btn ghost" data-skill-preset-import-clear type="button"${this.skillPresetImportText.trim() ? '' : ' disabled'}>清空输入</button>
              </div>
            </div>
          </div>
        </div>
      `,
      onClose: () => {
        this.resetSkillPresetModalState();
      },
      onAfterRender: (body) => {
        this.bindSkillPresetEvents(body);
      },
    });
    this.skillPresetExternalRevision = this.buildSkillPresetExternalRevision();
  }

/** bindSkillPresetEvents：执行对应的业务逻辑。 */
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
/** presetId：定义该变量以承载业务值。 */
        const presetId = button.dataset.skillPresetSelect;
        if (!presetId) {
          return;
        }
        this.selectedSkillPresetId = presetId;
/** preset：定义该变量以承载业务值。 */
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
/** file：定义该变量以承载业务值。 */
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

/** saveCurrentSkillPreset：执行对应的业务逻辑。 */
  private saveCurrentSkillPreset(overwriteSelected: boolean): void {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.getCurrentSkillPresetSnapshot();
    if (snapshot.length === 0) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '当前没有可保存的技能。',
      };
      this.renderSkillPresetModal();
      return;
    }
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedSkillPreset();
/** inputName：定义该变量以承载业务值。 */
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
/** nextName：定义该变量以承载业务值。 */
      const nextName = inputName || selected.name;
/** updatedPreset：定义该变量以承载业务值。 */
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
/** usedNames：定义该变量以承载业务值。 */
      const usedNames = new Set(this.skillPresets.map((preset) => preset.name));
/** nextName：定义该变量以承载业务值。 */
      const nextName = this.resolveUniqueSkillPresetName(inputName || this.buildDefaultSkillPresetName(), usedNames);
/** preset：定义该变量以承载业务值。 */
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

/** resolveAppliedSkillPresetConfigs：执行对应的业务逻辑。 */
  private resolveAppliedSkillPresetConfigs(preset: SkillPresetRecord): AutoBattleSkillConfig[] {
/** currentSkillActions：定义该变量以承载业务值。 */
    const currentSkillActions = this.getSkillActions(this.currentActions);
/** currentMap：定义该变量以承载业务值。 */
    const currentMap = new Map(currentSkillActions.map((action) => [action.id, action] as const));
/** next：定义该变量以承载业务值。 */
    const next: AutoBattleSkillConfig[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();

    for (const skill of preset.skills) {
      if (seen.has(skill.skillId) || !currentMap.has(skill.skillId)) {
        continue;
      }
      next.push({
        skillId: skill.skillId,
/** enabled：定义该变量以承载业务值。 */
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
/** enabled：定义该变量以承载业务值。 */
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: false,
      });
      seen.add(action.id);
    }

    return next;
  }

/** commitSkillPresetActions：执行对应的业务逻辑。 */
  private commitSkillPresetActions(nextActions: ActionDef[]): void {
/** nextAutoBattleSkills：定义该变量以承载业务值。 */
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

/** applySelectedSkillPreset：执行对应的业务逻辑。 */
  private applySelectedSkillPreset(): void {
/** preset：定义该变量以承载业务值。 */
    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '请先选择一个技能方案。',
      };
      this.renderSkillPresetModal();
      return;
    }
/** previousDraft：定义该变量以承载业务值。 */
    const previousDraft = this.skillManagementDraft;
    this.skillManagementDraft = this.resolveAppliedSkillPresetConfigs(preset);
/** nextActions：定义该变量以承载业务值。 */
    const nextActions = this.getSkillManagementPreviewActions();
    this.skillManagementDraft = previousDraft;
    this.commitSkillPresetActions(nextActions);
    this.skillPresetStatus = {
      tone: 'success',
      text: `已套用方案“${preset.name}”。`,
    };
    this.renderSkillPresetModal();
  }

/** copySelectedSkillPreset：执行对应的业务逻辑。 */
  private async copySelectedSkillPreset(): Promise<void> {
/** preset：定义该变量以承载业务值。 */
    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.skillPresetStatus = {
        tone: 'error',
        text: '请先选择一个技能方案。',
      };
      this.renderSkillPresetModal();
      return;
    }
/** text：定义该变量以承载业务值。 */
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

/** exportSelectedSkillPreset：执行对应的业务逻辑。 */
  private exportSelectedSkillPreset(): void {
/** preset：定义该变量以承载业务值。 */
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

/** exportAllSkillPresets：执行对应的业务逻辑。 */
  private exportAllSkillPresets(): void {
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

/** deleteSelectedSkillPreset：执行对应的业务逻辑。 */
  private deleteSelectedSkillPreset(): void {
/** preset：定义该变量以承载业务值。 */
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

/** importSkillPresetsFromText：执行对应的业务逻辑。 */
  private importSkillPresetsFromText(rawText: string): void {
/** text：定义该变量以承载业务值。 */
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
/** importOptions：定义该变量以承载业务值。 */
      const importOptions = {
        existingNames: new Set(this.skillPresets.map((preset) => preset.name)),
      };
/** imported：定义该变量以承载业务值。 */
      const imported = this.parseSkillPresetText(text, importOptions);
      if (imported.length === 0) {
/** parsed：定义该变量以承载业务值。 */
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

/** getSortedSkillManagementActionIds：执行对应的业务逻辑。 */
  private getSortedSkillManagementActionIds(): string[] {
/** previewActions：定义该变量以承载业务值。 */
    const previewActions = this.getSkillManagementPreviewActions();
/** skillEntries：定义该变量以承载业务值。 */
    const skillEntries = this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(previewActions));
/** visibleEntries：定义该变量以承载业务值。 */
    const visibleEntries = this.skillManagementTab === 'auto'
      ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false)
      : this.skillManagementTab === 'manual'
        ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false)
        : skillEntries.filter((entry) => entry.action.skillEnabled === false);
    return this.sortSkillManagementEntries(visibleEntries).map((entry) => entry.action.id);
  }

/** reorderSkillManagementSubset：执行对应的业务逻辑。 */
  private reorderSkillManagementSubset(skills: ActionDef[], orderedIds: string[]): ActionDef[] {
/** subset：定义该变量以承载业务值。 */
    const subset = new Set(orderedIds);
/** orderedActions：定义该变量以承载业务值。 */
    const orderedActions = orderedIds
      .map((id) => skills.find((action) => action.id === id))
      .filter((action): action is ActionDef => Boolean(action));
/** nextIndex：定义该变量以承载业务值。 */
    let nextIndex = 0;
    return skills.map((action) => (
      subset.has(action.id)
        ? (orderedActions[nextIndex++] ?? action)
        : action
    ));
  }

/** syncSkillManagementDraft：执行对应的业务逻辑。 */
  private syncSkillManagementDraft(): AutoBattleSkillConfig[] {
/** currentSkillActions：定义该变量以承载业务值。 */
    const currentSkillActions = this.getSkillActions(this.currentActions);
/** availableIds：定义该变量以承载业务值。 */
    const availableIds = new Set(currentSkillActions.map((action) => action.id));
/** source：定义该变量以承载业务值。 */
    const source = this.skillManagementDraft ?? this.getAutoBattleSkillConfigs(this.currentActions);
/** normalized：定义该变量以承载业务值。 */
    const normalized: AutoBattleSkillConfig[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();

    for (const entry of source) {
      if (seen.has(entry.skillId) || !availableIds.has(entry.skillId)) {
        continue;
      }
      normalized.push({
        skillId: entry.skillId,
/** enabled：定义该变量以承载业务值。 */
        enabled: entry.enabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
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
/** enabled：定义该变量以承载业务值。 */
        enabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
        skillEnabled: action.skillEnabled !== false,
      });
      seen.add(action.id);
    }

    this.skillManagementDraft = normalized;
    return normalized;
  }

/** getSkillManagementPreviewActions：执行对应的业务逻辑。 */
  private getSkillManagementPreviewActions(): ActionDef[] {
/** draft：定义该变量以承载业务值。 */
    const draft = this.syncSkillManagementDraft();
/** draftMap：定义该变量以承载业务值。 */
    const draftMap = new Map(draft.map((entry, index) => [entry.skillId, { entry, index }]));
/** skillActions：定义该变量以承载业务值。 */
    const skillActions = this.getSkillActions(this.currentActions)
      .map((action) => {
/** draftEntry：定义该变量以承载业务值。 */
        const draftEntry = draftMap.get(action.id);
        if (!draftEntry) {
          return {
            ...action,
/** autoBattleEnabled：定义该变量以承载业务值。 */
            autoBattleEnabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
            skillEnabled: action.skillEnabled !== false,
          };
        }
        return {
          ...action,
/** autoBattleEnabled：定义该变量以承载业务值。 */
          autoBattleEnabled: draftEntry.entry.enabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
          skillEnabled: draftEntry.entry.skillEnabled !== false,
          autoBattleOrder: draftEntry.index,
        };
      })
      .sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER));
    return this.replaceSkillActions(skillActions);
  }

/** buildSkillManagementExternalRevision：执行对应的业务逻辑。 */
  private buildSkillManagementExternalRevision(): string {
/** parts：定义该变量以承载业务值。 */
    const parts = [
      this.skillManagementSortField,
      this.skillManagementSortDirection,
      [...this.skillManagementFilterToggles].sort().join(','),
    ];
/** includeMeleeRanged：定义该变量以承载业务值。 */
    const includeMeleeRanged = this.skillManagementFilterToggles.has('melee') || this.skillManagementFilterToggles.has('ranged');
/** includeDamageKind：定义该变量以承载业务值。 */
    const includeDamageKind = this.skillManagementFilterToggles.has('physical') || this.skillManagementFilterToggles.has('spell');
/** includeTargetKind：定义该变量以承载业务值。 */
    const includeTargetKind = this.skillManagementFilterToggles.has('single') || this.skillManagementFilterToggles.has('aoe');
/** needsMetrics：定义该变量以承载业务值。 */
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
/** metrics：定义该变量以承载业务值。 */
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

/** captureSkillManagementListScroll：执行对应的业务逻辑。 */
  private captureSkillManagementListScroll(): void {
/** list：定义该变量以承载业务值。 */
    const list = document.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) {
      return;
    }
    this.skillManagementListScrollTop = list.scrollTop;
  }

/** restoreSkillManagementListScroll：执行对应的业务逻辑。 */
  private restoreSkillManagementListScroll(root: HTMLElement): void {
/** list：定义该变量以承载业务值。 */
    const list = root.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) {
      return;
    }
    list.scrollTop = this.skillManagementListScrollTop;
  }

/** renderSkillManagementModalIfOpen：执行对应的业务逻辑。 */
  private renderSkillManagementModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER)) {
      return;
    }
/** nextRevision：定义该变量以承载业务值。 */
    const nextRevision = this.buildSkillManagementExternalRevision();
    if (this.skillManagementExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillManagementModal();
  }

/** renderSkillPresetModalIfOpen：执行对应的业务逻辑。 */
  private renderSkillPresetModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(ActionPanel.SKILL_PRESET_MODAL_OWNER)) {
      return;
    }
/** nextRevision：定义该变量以承载业务值。 */
    const nextRevision = this.buildSkillPresetExternalRevision();
    if (this.skillPresetExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillPresetModal();
  }

/** renderSkillManagementModal：执行对应的业务逻辑。 */
  private renderSkillManagementModal(): void {
    if (detailModalHost.isOpenFor(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER)) {
      this.captureSkillManagementListScroll();
    }
/** previewActions：定义该变量以承载业务值。 */
    const previewActions = this.getSkillManagementPreviewActions();
/** skillEntries：定义该变量以承载业务值。 */
    const skillEntries = this.getSkillManagementEntries(previewActions);
/** filteredEntries：定义该变量以承载业务值。 */
    const filteredEntries = this.getFilteredSkillManagementEntries(skillEntries);
/** autoBattleDisplayOrders：定义该变量以承载业务值。 */
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(previewActions);
/** autoEntries：定义该变量以承载业务值。 */
    const autoEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false);
/** manualEntries：定义该变量以承载业务值。 */
    const manualEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false);
/** disabledEntries：定义该变量以承载业务值。 */
    const disabledEntries = filteredEntries.filter((entry) => entry.action.skillEnabled === false);
/** visibleEntries：定义该变量以承载业务值。 */
    const visibleEntries = this.sortSkillManagementEntries(
      this.skillManagementTab === 'auto'
        ? autoEntries
        : this.skillManagementTab === 'manual'
          ? manualEntries
          : disabledEntries,
    );
/** dragSortEnabled：定义该变量以承载业务值。 */
    const dragSortEnabled = this.skillManagementTab === 'auto'
      && this.skillManagementSortField === 'custom'
      && visibleEntries.length > 1;
/** hint：定义该变量以承载业务值。 */
    const hint = this.buildSkillManagementHint(dragSortEnabled);

    detailModalHost.open({
      ownerId: ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--skill-management',
      title: '技能管理',
      subtitle: `已学技能 ${skillEntries.length} 项 · 当前过滤 ${filteredEntries.length} 项`,
      bodyHtml: `
        <div class="skill-manage-shell">
          <div class="skill-manage-topbar">
            <div class="action-skill-subtabs skill-manage-subtabs">
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'auto' ? 'active' : ''}" data-skill-manage-tab="auto" type="button">
                自动
                <span class="action-skill-subtab-count">${autoEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'manual' ? 'active' : ''}" data-skill-manage-tab="manual" type="button">
                手动
                <span class="action-skill-subtab-count">${manualEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.skillManagementTab === 'disabled' ? 'active' : ''}" data-skill-manage-tab="disabled" type="button">
                禁用
                <span class="action-skill-subtab-count">${disabledEntries.length}</span>
              </button>
            </div>
            <div class="skill-manage-toolbar">
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
          <div class="skill-manage-summary">
            <span>当前过滤 ${filteredEntries.length} 项</span>
            <span>自动 ${autoEntries.length} 项</span>
            <span>手动 ${manualEntries.length} 项</span>
            <span>禁用 ${disabledEntries.length} 项</span>
          </div>
          ${this.skillManagementSortOpen ? this.renderSkillManagementSortPanel(visibleEntries.length) : ''}
          ${this.skillManagementFilterOpen ? `
            <div class="skill-manage-filter-panel">
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
              <div class="skill-manage-filter-copy">同类标签可同时选中；若某一类开了多个，则按该类任意命中处理。</div>
            </div>
          ` : ''}
          <div class="skill-manage-batch">
            <button class="small-btn" data-skill-manage-bulk="auto" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部自动</button>
            <button class="small-btn ghost" data-skill-manage-bulk="manual" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部手动</button>
            <button class="small-btn ghost" data-skill-manage-bulk="enabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部启用</button>
            <button class="small-btn ghost" data-skill-manage-bulk="disabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>当前过滤全部禁用</button>
          </div>
          <div class="action-section-hint">${hint}</div>
          ${visibleEntries.length === 0
            ? `<div class="empty-hint">${this.skillManagementTab === 'auto' ? '当前过滤下没有自动技能' : this.skillManagementTab === 'manual' ? '当前过滤下没有手动技能' : '当前过滤下没有禁用技能'}</div>`
            : `<div class="action-skill-list skill-manage-list">
              ${visibleEntries.map((entry) => this.renderSkillManagementItem(entry.action, {
                showDragHandle: dragSortEnabled,
/** autoBattleDisplayOrder：定义该变量以承载业务值。 */
                autoBattleDisplayOrder: this.skillManagementTab === 'auto'
                  ? (autoBattleDisplayOrders.get(entry.action.id) ?? null)
                  : null,
              })).join('')}
            </div>`}
        </div>
      `,
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

/** bindSkillManagementEvents：执行对应的业务逻辑。 */
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
/** tab：定义该变量以承载业务值。 */
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
/** value：定义该变量以承载业务值。 */
        const value = button.dataset.skillManageSortFieldToggle as SkillManagementSortField | undefined;
        if (!value) return;
        this.skillManagementSortField = value;
        this.renderSkillManagementModal();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-direction-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
/** value：定义该变量以承载业务值。 */
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
/** value：定义该变量以承载业务值。 */
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
/** mode：定义该变量以承载业务值。 */
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

/** applySkillManagementBulkMode：执行对应的业务逻辑。 */
  private applySkillManagementBulkMode(mode: SkillManagementBulkMode): void {
/** filteredSkillIds：定义该变量以承载业务值。 */
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

/** getSkillManagementEntries：执行对应的业务逻辑。 */
  private getSkillManagementEntries(actions: ActionDef[]): SkillManagementEntry[] {
    return this.getSkillActions(actions).map((action) => ({
      action,
      metrics: this.buildSkillManagementMetrics(action),
    }));
  }

/** buildSkillManagementMetrics：执行对应的业务逻辑。 */
  private buildSkillManagementMetrics(action: ActionDef): SkillPreviewMetrics {
/** context：定义该变量以承载业务值。 */
    const context = this.skillLookup.get(action.id);
    if (!context) {
/** range：定义该变量以承载业务值。 */
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
/** isMelee：定义该变量以承载业务值。 */
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

/** getFilteredSkillManagementEntries：执行对应的业务逻辑。 */
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

  private matchesSkillManagementToggleGroup(
    entry: SkillManagementEntry,
    group: SkillManagementFilterToggle[],
  ): boolean {
/** active：定义该变量以承载业务值。 */
    const active = group.filter((value) => this.skillManagementFilterToggles.has(value));
    if (active.length === 0) {
      return true;
    }
    return active.some((value) => this.matchesSkillManagementToggle(entry.metrics, value));
  }

/** matchesSkillManagementToggle：执行对应的业务逻辑。 */
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

/** sortSkillManagementEntries：执行对应的业务逻辑。 */
  private sortSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
    if (this.skillManagementSortField === 'custom') {
      return entries;
    }
/** factor：定义该变量以承载业务值。 */
    const factor = this.skillManagementSortDirection === 'asc' ? 1 : -1;
/** next：定义该变量以承载业务值。 */
    const next = [...entries];
    next.sort((left, right) => {
/** valueDiff：定义该变量以承载业务值。 */
      const valueDiff = this.compareSkillManagementEntry(left, right);
      if (valueDiff !== 0) {
        return valueDiff * factor;
      }
      return left.action.name.localeCompare(right.action.name, 'zh-Hans-CN');
    });
    return next;
  }

/** compareSkillManagementEntry：执行对应的业务逻辑。 */
  private compareSkillManagementEntry(left: SkillManagementEntry, right: SkillManagementEntry): number {
/** leftValue：定义该变量以承载业务值。 */
    const leftValue = this.getSkillManagementSortValue(left.metrics);
/** rightValue：定义该变量以承载业务值。 */
    const rightValue = this.getSkillManagementSortValue(right.metrics);
/** leftMissing：定义该变量以承载业务值。 */
    const leftMissing = leftValue === null || !Number.isFinite(leftValue);
/** rightMissing：定义该变量以承载业务值。 */
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

/** getSkillManagementSortValue：执行对应的业务逻辑。 */
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

/** renderSkillManagementSortPanel：执行对应的业务逻辑。 */
  private renderSkillManagementSortPanel(visibleCount: number): string {
/** canApplySort：定义该变量以承载业务值。 */
    const canApplySort = this.skillManagementTab !== 'disabled'
      && this.skillManagementSortField !== 'custom'
      && visibleCount > 1;
    return `
      <div class="skill-manage-sort-panel">
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
        <div class="skill-manage-filter-copy">${this.skillManagementTab === 'disabled'
          ? '禁用页签只提供查看与筛选；重新启用后，技能会按原自动状态回到自动或手动列表。'
          : this.skillManagementSortField === 'custom'
            ? '当前顺位模式下，自动页签可直接拖拽调整优先级。'
            : '当前列表会按选定规则显示；点“应用到当前顺位”后，会把这一排序写回技能顺位。'}</div>
      </div>
    `;
  }

/** buildSkillManagementHint：执行对应的业务逻辑。 */
  private buildSkillManagementHint(dragSortEnabled: boolean): string {
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

/** renderSkillManagementSortChip：执行对应的业务逻辑。 */
  private renderSkillManagementSortChip(value: SkillManagementSortField, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortField === value ? 'active' : ''}" data-skill-manage-sort-field-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

/** renderSkillManagementDirectionChip：执行对应的业务逻辑。 */
  private renderSkillManagementDirectionChip(value: SkillManagementSortDirection, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortDirection === value ? 'active' : ''}" data-skill-manage-sort-direction-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

/** renderSkillManagementChipToggle：执行对应的业务逻辑。 */
  private renderSkillManagementChipToggle(value: SkillManagementFilterToggle, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementFilterToggles.has(value) ? 'active' : ''}" data-skill-manage-filter-toggle-chip="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

/** resetSkillManagementFilters：执行对应的业务逻辑。 */
  private resetSkillManagementFilters(): void {
    this.skillManagementFilterToggles.clear();
  }

/** applySkillManagementChanges：执行对应的业务逻辑。 */
  private applySkillManagementChanges(): void {
/** nextActions：定义该变量以承载业务值。 */
    const nextActions = this.getSkillManagementPreviewActions();
/** nextAutoBattleSkills：定义该变量以承载业务值。 */
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

/** cancelSkillManagementChanges：执行对应的业务逻辑。 */
  private cancelSkillManagementChanges(): void {
    this.discardSkillManagementDraft();
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
  }

/** discardSkillManagementDraft：执行对应的业务逻辑。 */
  private discardSkillManagementDraft(): void {
    this.skillManagementDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.bindingActionId = null;
    this.clearDragState();
  }

/** applySkillManagementSortOrder：执行对应的业务逻辑。 */
  private applySkillManagementSortOrder(): void {
    if (this.skillManagementTab === 'disabled' || this.skillManagementSortField === 'custom') {
      return;
    }
/** visibleEntries：定义该变量以承载业务值。 */
    const visibleEntries = this.sortSkillManagementEntries(
      this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions()))
        .filter((entry) => (
          this.skillManagementTab === 'auto'
            ? entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false
            : entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false
        )),
    );
/** orderedIds：定义该变量以承载业务值。 */
    const orderedIds = visibleEntries.map((entry) => entry.action.id);
    if (orderedIds.length <= 1) {
      return;
    }
    this.applySkillManagementDraftMutation((skills) => {
/** subset：定义该变量以承载业务值。 */
      const subset = new Set(orderedIds);
/** orderedActions：定义该变量以承载业务值。 */
      const orderedActions = orderedIds
        .map((id) => skills.find((action) => action.id === id))
        .filter((action): action is ActionDef => Boolean(action));
/** nextIndex：定义该变量以承载业务值。 */
      let nextIndex = 0;
      return skills.map((action) => (
        subset.has(action.id)
          ? (orderedActions[nextIndex++] ?? action)
          : action
      ));
    });
  }

  private renderSkillManagementItem(
    action: ActionDef,
    options?: {
      showDragHandle?: boolean;
      autoBattleDisplayOrder?: number | null;
    },
  ): string {
/** skillContext：定义该变量以承载业务值。 */
    const skillContext = this.skillLookup.get(action.id);
/** tooltipAttrs：定义该变量以承载业务值。 */
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
/** autoBattleEnabled：定义该变量以承载业务值。 */
    const autoBattleEnabled = action.autoBattleEnabled !== false;
/** skillEnabled：定义该变量以承载业务值。 */
    const skillEnabled = action.skillEnabled !== false;
/** autoBattleOrder：定义该变量以承载业务值。 */
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
/** rowAttrs：定义该变量以承载业务值。 */
    const rowAttrs = options?.showDragHandle ? ` data-skill-manage-skill-row="${action.id}"` : '';
/** affinityChip：定义该变量以承载业务值。 */
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item action-item-draggable" data-action-row="${action.id}"${rowAttrs}>
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
      <div class="action-cta">
        <button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-skill-manage-auto-toggle="${action.id}" type="button">${autoBattleEnabled ? '自动 开' : '自动 关'}</button>
        <button class="small-btn ghost ${skillEnabled ? 'active' : ''}" data-skill-manage-enabled-toggle="${action.id}" type="button">${skillEnabled ? '启用 开' : '启用 关'}</button>
        ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-skill-manage-drag="${action.id}" draggable="true" type="button">拖拽</button>` : ''}
      </div>
    </div>`;
  }
}

