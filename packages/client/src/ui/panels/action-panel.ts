import { ActionDef, PlayerState, SkillDef } from '@mud/shared';
import { FloatingTooltip } from '../floating-tooltip';
import { buildSkillTooltipLines } from '../skill-tooltip';

const TYPE_NAMES: Record<string, string> = {
  skill: '技能',
  gather: '采集',
  interact: '交互',
  battle: '战斗',
  toggle: '操作',
  quest: '任务',
  travel: '传送',
  breakthrough: '突破',
};
const ACTION_SHORTCUTS_KEY = 'mud.action.shortcuts.v1';

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
  private activeTab: 'dialogue' | 'skill' | 'toggle' = 'dialogue';
  private autoBattle = false;
  private autoRetaliate = true;
  private currentActions: ActionDef[] = [];
  private shortcutBindings = new Map<string, string>();
  private bindingActionId: string | null = null;
  private previewPlayer?: PlayerState;
  private skillLookup = new Map<string, { skill: SkillDef; techLevel: number }>();
  private tooltip = new FloatingTooltip();

  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">暂无可用行动</div>';
  }

  setCallbacks(onAction: (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void): void {
    this.onAction = onAction;
  }

  update(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;
    this.render(this.currentActions);
  }

  initFromPlayer(player: PlayerState): void {
    this.previewPlayer = player;
    this.syncPlayerContext(player);
    this.currentActions = this.withUtilityActions(player.actions);
    this.autoBattle = player.autoBattle ?? false;
    this.autoRetaliate = player.autoRetaliate !== false;
    this.render(this.currentActions);
  }

  private syncPlayerContext(player: PlayerState): void {
    this.skillLookup = new Map(
      player.techniques.flatMap((technique) => technique.skills.map((skill) => [
        skill.id,
        { skill, techLevel: technique.level },
      ] as const)),
    );
  }

  private render(actions: ActionDef[]): void {
    if (actions.length === 0) {
      this.clear();
      return;
    }

    const tabGroups: Array<{
      id: 'dialogue' | 'skill' | 'toggle';
      label: string;
      types: string[];
    }> = [
      { id: 'dialogue', label: '对话', types: ['quest', 'interact', 'travel'] },
      { id: 'skill', label: '技能', types: ['skill', 'battle', 'gather', 'breakthrough'] },
      { id: 'toggle', label: '操作', types: ['toggle'] },
    ];
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const list = groups.get(action.type) ?? [];
      list.push(action);
      groups.set(action.type, list);
    }

    let html = `<div class="panel-section">
      <div class="panel-section-title">战斗开关</div>
      <div class="intel-grid compact">
        <div class="gm-player-row ${this.autoBattle ? 'active' : ''}" data-action-card="toggle:auto_battle" role="button" tabindex="0">
          <div>
            <div class="gm-player-name">自动战斗</div>
            <div class="gm-player-meta">${this.autoBattle ? '当前已开启' : '当前已关闭'}${this.renderShortcutMeta('toggle:auto_battle')}</div>
          </div>
          <div class="action-card-side">
            <div class="gm-player-stat">${this.autoBattle ? '开' : '关'}</div>
            <button class="small-btn ghost" data-bind-action="toggle:auto_battle" type="button">${this.getBindButtonLabel('toggle:auto_battle')}</button>
          </div>
        </div>
        <div class="gm-player-row ${this.autoRetaliate ? 'active' : ''}" data-action-card="toggle:auto_retaliate" role="button" tabindex="0">
          <div>
            <div class="gm-player-name">自动反击</div>
            <div class="gm-player-meta">${this.autoRetaliate ? '受到攻击自动开战' : '受到攻击保持克制'}${this.renderShortcutMeta('toggle:auto_retaliate')}</div>
          </div>
          <div class="action-card-side">
            <div class="gm-player-stat">${this.autoRetaliate ? '开' : '关'}</div>
            <button class="small-btn ghost" data-bind-action="toggle:auto_retaliate" type="button">${this.getBindButtonLabel('toggle:auto_retaliate')}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="action-tab-bar">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
        const utilityEntries = actions.filter((action) => action.id === 'client:observe');
        if (utilityEntries.length === 0) {
          html += '<div class="empty-hint">当前分组暂无内容</div></div>';
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">环境观察</div>`;
        for (const action of utilityEntries) {
          html += `<div class="action-item">
            <div class="action-copy">
              <div>
                <span class="action-name">${escapeHtml(action.name)}</span>
                <span class="action-type">[操作]</span>
                ${this.renderShortcutBadge(action.id)}
              </div>
              <div class="action-desc">${escapeHtml(action.desc)}</div>
            </div>
            <div class="action-cta">
              <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
              <button class="small-btn" data-action="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}">执行</button>
            </div>
          </div>`;
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
          html += `<div class="panel-section">
            <div class="panel-section-title">${TYPE_NAMES[type] || type}</div>`;
          for (const action of entries) {
            const onCd = action.cooldownLeft > 0;
            const skillContext = this.skillLookup.get(action.id);
            const tooltipLines = skillContext ? buildSkillTooltipLines(skillContext.skill, {
              techLevel: skillContext.techLevel,
              player: this.previewPlayer,
            }) : [];
            const tooltipAttrs = skillContext
              ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-detail="${escapeHtml(tooltipLines.join('\n'))}" data-action-tooltip-rich="1"`
              : '';
            html += `<div class="action-item ${onCd ? 'cooldown' : ''}">
              <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''}"${tooltipAttrs}>
                <div>
                  <span class="action-name">${escapeHtml(action.name)}</span>
                  <span class="action-type">[${TYPE_NAMES[action.type] || action.type}]</span>
                  ${typeof action.range === 'number' ? `<span class="action-type">射程 ${action.range}</span>` : ''}
                  ${this.renderShortcutBadge(action.id)}
                </div>
                <div class="action-desc">${escapeHtml(action.desc)}</div>
              </div>
              <div class="action-cta">
                <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
                ${onCd
                  ? `<span class="action-cd">冷却 ${action.cooldownLeft}s</span>`
                  : `<button class="small-btn" data-action="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}">执行</button>`
                }
              </div>
            </div>`;
          }
          html += '</div>';
        }
      }
      html += '</div>';
    }

    this.pane.innerHTML = html;
    this.bindEvents(actions);
    this.bindTooltips();
  }

  private bindEvents(actions: ActionDef[]): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionTab as 'dialogue' | 'skill' | 'toggle' | undefined;
        if (!tab) return;
        this.activeTab = tab;
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
  }

  private bindTooltips(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tooltip-title]').forEach((node) => {
      const title = node.dataset.actionTooltipTitle ?? '';
      const detail = node.dataset.actionTooltipDetail ?? '';
      const rich = node.dataset.actionTooltipRich === '1';
      const lines = detail.split('\n');
      node.addEventListener('pointerenter', (event) => {
        this.tooltip.show(title, lines, event.clientX, event.clientY, { allowHtml: rich });
      });
      node.addEventListener('pointermove', (event) => {
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
}
