/**
 * 行动面板
 * 管理技能、对话、行动三大分类的操作列表，支持快捷键绑定、自动战斗技能排序与拖拽
 */

import { ActionDef, AutoBattleSkillConfig, PlayerState, SkillDef } from '@mud/shared';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildSkillTooltipContent } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getActionTypeLabel } from '../../domain-labels';
import { ACTION_SHORTCUTS_KEY } from '../../constants/ui/action';

type ActionMainTab = 'dialogue' | 'skill' | 'toggle' | 'utility';
type SkillSubTab = 'auto' | 'manual';

interface ActionRowRefs {
  row: HTMLElement;
  cdNode: HTMLElement;
  execNode: HTMLButtonElement;
  stateNode?: HTMLElement;
  orderNode?: HTMLElement;
  toggleNode?: HTMLButtonElement;
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
  private pane = document.getElementById('pane-action')!;
  private onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null = null;
  private onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null = null;
  private activeTab: ActionMainTab = 'dialogue';
  private activeSkillTab: SkillSubTab = 'auto';
  private autoBattle = false;
  private autoRetaliate = true;
  private allowAoePlayerHit = false;
  private autoIdleCultivation = true;
  private autoSwitchCultivation = false;
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
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;
    this.render(this.currentActions);
  }

  /** 增量同步行动状态，优先 DOM patch 避免全量重绘 */
  syncDynamic(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;

    if (!this.patchToggleCards() || !this.patchActionRows()) {
      this.render(this.currentActions);
    }
  }

  initFromPlayer(player: PlayerState): void {
    this.previewPlayer = player;
    this.syncPlayerContext(player);
    this.currentActions = this.withUtilityActions(player.actions);
    this.autoBattle = player.autoBattle ?? false;
    this.autoRetaliate = player.autoRetaliate !== false;
    this.allowAoePlayerHit = player.allowAoePlayerHit === true;
    this.autoIdleCultivation = player.autoIdleCultivation !== false;
    this.autoSwitchCultivation = player.autoSwitchCultivation === true;
    this.render(this.currentActions);
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
        const utilityEntries = actions.filter((action) => action.type === 'toggle' && !this.isSwitchAction(action));
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
          const entries = groups.get(type) ?? [];
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
      this.bindTooltips();
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
    this.pane.querySelectorAll<HTMLElement>('[data-action-card]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.bindAction) return;
        const actionId = button.dataset.actionCard;
        if (!actionId) return;
        const action = this.currentActions.find((entry) => entry.id === actionId);
        this.onAction?.(actionId, action?.requiresTarget, action?.targetMode, action?.range, action?.name ?? actionId);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
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
    this.pane.querySelectorAll<HTMLElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.bindAction;
        if (!actionId) return;
        this.bindingActionId = this.bindingActionId === actionId ? null : actionId;
        this.render(this.currentActions);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-auto-battle-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.autoBattleToggle;
        if (!actionId) return;
        this.toggleAutoBattleSkill(actionId);
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-auto-battle-drag]').forEach((handle) => {
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
    this.pane.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row]').forEach((row) => {
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

  private bindTooltips(): void {
    const tapMode = prefersPinnedTooltipInteraction();
    this.pane.querySelectorAll<HTMLElement>('[data-action-tooltip-title]').forEach((node) => {
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

  private isSwitchActionId(actionId: string): boolean {
    return actionId === 'toggle:auto_battle'
      || actionId === 'toggle:auto_retaliate'
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
        return { active: action.name.includes('停止'), label: action.name.includes('停止') ? '开' : '关' };
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
    const current = this.currentActions.find((action) => action.id === actionId && action.type === 'skill');
    if (current && current.autoBattleEnabled !== false) {
      this.activeSkillTab = 'manual';
    }
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
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
    this.onUpdateAutoBattleSkills?.(this.getAutoBattleSkillConfigs(this.currentActions));
  }

  private withSequentialAutoBattleOrder(actions: ActionDef[]): ActionDef[] {
    return actions.map((action, index) => ({
      ...action,
      autoBattleEnabled: action.autoBattleEnabled !== false,
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
      }));
  }

  private updateDragIndicators(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row]').forEach((row) => {
      const actionId = row.dataset.autoBattleSkillRow;
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
    const autoSkills = actions.filter((action) => action.autoBattleEnabled !== false);
    const manualSkills = actions.filter((action) => action.autoBattleEnabled === false);
    const visibleSkills = this.activeSkillTab === 'auto' ? autoSkills : manualSkills;
    const hint = this.activeSkillTab === 'auto'
      ? '自动战斗会按列表从上到下尝试已启用技能，可直接拖拽调整优先级。'
      : '这里的技能不会参与自动战斗，但仍可手动点击或使用绑定键触发。';

    let html = `<div class="panel-section">
      <div class="panel-section-title">技能</div>
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
      if (action.type !== 'skill' || action.autoBattleEnabled === false) {
        continue;
      }
      displayOrder.set(action.id, nextOrder);
      nextOrder += 1;
    }
    return displayOrder;
  }
}
