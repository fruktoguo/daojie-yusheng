/**
 * 行动面板
 * 管理技能、对话、行动三大分类的操作列表，支持快捷键绑定、自动战斗技能排序与拖拽
 */

import { ActionDef, AutoBattleSkillConfig, PlayerState, SkillDef } from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildSkillTooltipContent, type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getActionTypeLabel } from '../../domain-labels';
import { ACTION_SHORTCUTS_KEY, RETURN_TO_SPAWN_ACTION_ID } from '../../constants/ui/action';

type ActionMainTab = 'dialogue' | 'skill' | 'toggle' | 'utility';
type SkillSubTab = 'auto' | 'manual';
type SkillManagementTab = SkillSubTab | 'disabled';
type SkillManagementBulkMode = SkillSubTab | 'enabled' | 'disabled';
type SkillManagementSortField = 'custom' | 'actualDamage' | 'qiCost' | 'range' | 'targetCount' | 'cooldown';
type SkillManagementSortDirection = 'asc' | 'desc';
type SkillManagementFilterToggle = 'melee' | 'ranged' | 'physical' | 'spell' | 'single' | 'aoe';

interface ActionRowRefs {
  row: HTMLElement;
  cdNode: HTMLElement;
  execNode: HTMLButtonElement;
  stateNode?: HTMLElement;
  orderNode?: HTMLElement;
  toggleNode?: HTMLButtonElement;
}

interface SkillManagementEntry {
  action: ActionDef;
  metrics: SkillPreviewMetrics;
}

function normalizeShortcutKey(key: string): string | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
    return lower;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class ActionPanel {
  private static readonly SKILL_MANAGEMENT_MODAL_OWNER = 'action-panel-skill-management';
  private pane = document.getElementById('pane-action')!;
  private onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null = null;
  private onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null = null;
  private activeTab: ActionMainTab = 'dialogue';
  private activeSkillTab: SkillSubTab = 'auto';
  private skillManagementTab: SkillManagementTab = 'auto';
  private skillManagementDraft: AutoBattleSkillConfig[] | null = null;
  private skillManagementSortOpen = false;
  private skillManagementSortField: SkillManagementSortField = 'custom';
  private skillManagementSortDirection: SkillManagementSortDirection = 'desc';
  private skillManagementFilterOpen = false;
  private skillManagementFilterToggles = new Set<SkillManagementFilterToggle>();
  private autoBattle = false;
  private autoRetaliate = true;
  private autoBattleStationary = false;
  private allowAoePlayerHit = false;
  private autoIdleCultivation = true;
  private autoSwitchCultivation = false;
  private cultivationActive = false;
  private currentActions: ActionDef[] = [];
  private shortcutBindings = new Map<string, string>();
  private bindingActionId: string | null = null;
  private draggingSkillId: string | null = null;
  private dragOverSkillId: string | null = null;
  private dragOverPosition: 'before' | 'after' | null = null;
  private previewPlayer?: PlayerState;
  private skillLookup = new Map<string, { skill: SkillDef; techLevel: number; knownSkills: SkillDef[] }>();
  private tooltip = new FloatingTooltip();
  private actionRowRefs = new Map<string, ActionRowRefs>();

  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  clear(): void {
    this.tooltip.hide(true);
    this.actionRowRefs.clear();
    this.skillManagementDraft = null;
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
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
  }

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
  }

  private syncPlayerContext(player: PlayerState): void {
    const knownSkills = player.techniques.flatMap((technique) => technique.skills);
    this.skillLookup = new Map(
      player.techniques.flatMap((technique) => technique.skills.map((skill) => [
        skill.id,
        { skill, techLevel: technique.level, knownSkills },
      ] as const)),
    );
  }

  private render(actions: ActionDef[]): void {
    if (actions.length === 0) {
      this.clear();
      return;
    }

    const tabGroups: Array<{
      id: ActionMainTab;
      label: string;
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

    let html = `<div class="action-tab-bar">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
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
    this.bindActionCardEvents(this.pane);
    this.bindActionExecEvents(this.pane);
    this.bindBindActionEvents(this.pane);
    this.bindAutoBattleToggleEvents(this.pane);
    this.bindAutoBattleDragEvents(this.pane);
  }

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

  private renderShortcutBadge(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `<span class="action-shortcut-tag">键 ${binding.toUpperCase()}</span>` : '';
  }

  private renderShortcutMeta(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? ` · 快捷键 ${binding.toUpperCase()}` : '';
  }

  private isSwitchAction(action: ActionDef): boolean {
    return action.type === 'toggle' && this.isSwitchActionId(action.id);
  }

  private isUtilityAction(action: ActionDef): boolean {
    return this.isUtilityActionId(action.id);
  }

  private isUtilityActionId(actionId: string): boolean {
    return actionId === RETURN_TO_SPAWN_ACTION_ID || actionId === 'battle:force_attack';
  }

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
        const active = this.previewPlayer?.senseQiActive === true;
        return { active, label: active ? '开' : '关' };
      }
      default:
        return { active: false, label: '执行' };
    }
  }

  private renderSwitchItem(action: ActionDef): string {
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

  private getBindButtonLabel(actionId: string): string {
    if (this.bindingActionId === actionId) {
      return '按键中';
    }
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `改键 ${binding.toUpperCase()}` : '绑定键';
  }

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

  private saveShortcutBindings(): void {
    const payload = Object.fromEntries(this.shortcutBindings.entries());
    localStorage.setItem(ACTION_SHORTCUTS_KEY, JSON.stringify(payload));
  }

  private withUtilityActions(actions: ActionDef[]): ActionDef[] {
    const result = [...actions];
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

  private buildTechniqueFallbackActions(player: PlayerState, currentActions: ActionDef[]): ActionDef[] {
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

  private renderActionItem(
    action: ActionDef,
    options?: {
      showDragHandle?: boolean;
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

    return `<div class="action-item ${onCd ? 'cooldown' : ''} ${isAutoBattleSkill ? 'action-item-draggable' : ''}" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''}"${tooltipAttrs}>
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
      </div>
      <div class="action-cta">
        ${autoBattleControls}
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
        <span class="action-cd" data-action-cd="${action.id}"${onCd ? '' : ' hidden'}>${onCd ? `冷却 ${action.cooldownLeft} 息` : ''}</span>
        <button class="small-btn" data-action="${action.id}" data-action-exec="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}"${onCd ? ' hidden' : ''}>执行</button>
      </div>
    </div>`;
  }

  private toggleAutoBattleSkill(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

  private toggleSkillEnabled(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

  private toggleSkillManagementAutoBattleSkill(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

  private toggleSkillManagementSkillEnabled(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

  private moveAutoBattleSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
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

  private moveSkillManagementSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
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

  private applyAutoBattleSkillMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
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

  private applySkillManagementDraftMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
    const skillActions = this.getSkillActions(this.getSkillManagementPreviewActions())
      .map((action) => ({
        ...action,
        autoBattleEnabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
    const mutated = this.withSequentialAutoBattleOrder(mutator(skillActions));
    this.skillManagementDraft = this.getAutoBattleSkillConfigs(mutated);
    this.renderSkillManagementModal();
  }

  private withSequentialAutoBattleOrder(actions: ActionDef[]): ActionDef[] {
    return actions.map((action, index) => ({
      ...action,
      autoBattleEnabled: action.autoBattleEnabled !== false,
      skillEnabled: action.skillEnabled !== false,
      autoBattleOrder: index,
    }));
  }

  private replaceSkillActions(skillActions: ActionDef[]): ActionDef[] {
    let skillIndex = 0;
    return this.currentActions.map((action) => {
      if (action.type !== 'skill') {
        return action;
      }
      return skillActions[skillIndex++] ?? action;
    });
  }

  private getAutoBattleSkillConfigs(actions: ActionDef[]): AutoBattleSkillConfig[] {
    return actions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
  }

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

  private clearDragState(): void {
    this.draggingSkillId = null;
    this.dragOverSkillId = null;
    this.dragOverPosition = null;
    this.updateDragIndicators();
  }

  private patchToggleCards(): boolean {
    return true;
  }

  private patchActionRows(): boolean {
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

  private renderSkillSection(actions: ActionDef[], autoBattleDisplayOrders: Map<string, number>): string {
    const enabledSkills = actions.filter((action) => action.skillEnabled !== false);
    const autoSkills = enabledSkills.filter((action) => action.autoBattleEnabled !== false);
    const manualSkills = enabledSkills.filter((action) => action.autoBattleEnabled === false);
    const visibleSkills = this.activeSkillTab === 'auto' ? autoSkills : manualSkills;
    const hint = this.activeSkillTab === 'auto'
      ? '自动战斗会按列表从上到下尝试已启用技能，可直接拖拽调整优先级。'
      : '这里的技能不会参与自动战斗，但仍可手动点击或使用绑定键触发。';

    let html = `<div class="panel-section">
      <div class="panel-section-head">
        <div class="panel-section-title">技能</div>
        <button class="small-btn ghost" data-action-skill-manage-open type="button">技能管理</button>
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

  private buildAutoBattleDisplayOrderMap(actions: ActionDef[]): Map<string, number> {
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

  private getSkillActions(actions: ActionDef[] = this.currentActions): ActionDef[] {
    return actions.filter((action) => action.type === 'skill');
  }

  private openSkillManagement(): void {
    this.skillManagementTab = this.activeSkillTab;
    this.syncSkillManagementDraft();
    this.renderSkillManagementModal();
  }

  private syncSkillManagementDraft(): AutoBattleSkillConfig[] {
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

  private renderSkillManagementModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER)) {
      return;
    }
    this.renderSkillManagementModal();
  }

  private renderSkillManagementModal(): void {
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
      },
    });
  }

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

  private applySkillManagementBulkMode(mode: SkillManagementBulkMode): void {
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

  private getSkillManagementEntries(actions: ActionDef[]): SkillManagementEntry[] {
    return this.getSkillActions(actions).map((action) => ({
      action,
      metrics: this.buildSkillManagementMetrics(action),
    }));
  }

  private buildSkillManagementMetrics(action: ActionDef): SkillPreviewMetrics {
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
    const active = group.filter((value) => this.skillManagementFilterToggles.has(value));
    if (active.length === 0) {
      return true;
    }
    return active.some((value) => this.matchesSkillManagementToggle(entry.metrics, value));
  }

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

  private sortSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
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

  private compareSkillManagementEntry(left: SkillManagementEntry, right: SkillManagementEntry): number {
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

  private renderSkillManagementSortPanel(visibleCount: number): string {
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

  private renderSkillManagementSortChip(value: SkillManagementSortField, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortField === value ? 'active' : ''}" data-skill-manage-sort-field-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  private renderSkillManagementDirectionChip(value: SkillManagementSortDirection, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementSortDirection === value ? 'active' : ''}" data-skill-manage-sort-direction-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  private renderSkillManagementChipToggle(value: SkillManagementFilterToggle, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.skillManagementFilterToggles.has(value) ? 'active' : ''}" data-skill-manage-filter-toggle-chip="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  private resetSkillManagementFilters(): void {
    this.skillManagementFilterToggles.clear();
  }

  private applySkillManagementChanges(): void {
    const nextActions = this.getSkillManagementPreviewActions();
    const nextAutoBattleSkills = this.getAutoBattleSkillConfigs(nextActions);
    this.currentActions = nextActions;
    if (this.previewPlayer) {
      this.previewPlayer.actions = this.currentActions.filter((action) => action.id !== 'client:observe');
      this.previewPlayer.autoBattleSkills = nextAutoBattleSkills;
    }
    this.skillManagementDraft = null;
    this.bindingActionId = null;
    this.clearDragState();
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
    this.render(this.currentActions);
    this.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  private cancelSkillManagementChanges(): void {
    this.discardSkillManagementDraft();
    detailModalHost.close(ActionPanel.SKILL_MANAGEMENT_MODAL_OWNER);
  }

  private discardSkillManagementDraft(): void {
    this.skillManagementDraft = null;
    this.bindingActionId = null;
    this.clearDragState();
  }

  private applySkillManagementSortOrder(): void {
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

  private renderSkillManagementItem(
    action: ActionDef,
    options?: {
      showDragHandle?: boolean;
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

    return `<div class="action-item action-item-draggable" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">[技能]</span>
          ${typeof action.range === 'number' ? `<span class="action-type">射程 ${action.range}</span>` : ''}
          <span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? '自动已启用' : '自动已停用'}</span>
          <span class="action-type ${skillEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${skillEnabled ? '技能已启用' : '技能已禁用'}</span>
          ${autoBattleOrder ? `<span class="action-type">顺位 ${autoBattleOrder}</span>` : ''}
        </div>
        <div class="action-desc">${escapeHtml(action.desc)}</div>
      </div>
      <div class="action-cta">
        <button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-skill-manage-auto-toggle="${action.id}" type="button">${autoBattleEnabled ? '自动 开' : '自动 关'}</button>
        <button class="small-btn ghost ${skillEnabled ? 'active' : ''}" data-skill-manage-enabled-toggle="${action.id}" type="button">${skillEnabled ? '启用 开' : '启用 关'}</button>
        ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-skill-manage-drag="${action.id}" draggable="true" type="button">拖拽</button>` : ''}
      </div>
    </div>`;
  }
}
