import {
  ActionDef,
  C2S_StartEnhancement,
  EnhancementTargetRef,
  ItemStack,
  PlayerEnhancementRecord,
  PlayerState,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
  applyEnhancementToItemStack,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { getEquipSlotLabel } from '../domain-labels';
import { formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { describePreviewBonuses } from './stat-preview';

interface EnhancementModalCallbacks {
  onRequestPanel: () => void;
  onStartEnhancement: (payload: C2S_StartEnhancement) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(rate: number | undefined): string {
  const normalized = typeof rate === 'number' ? Math.max(0, Math.min(1, rate)) : 0;
  return `${Math.round(normalized * 100)}%`;
}

function formatRefKey(ref: EnhancementTargetRef): string {
  return ref.source === 'inventory'
    ? `inventory:${ref.slotIndex ?? -1}`
    : `equipment:${ref.slot ?? ''}`;
}

function cloneActions(actions: ActionDef[]): ActionDef[] {
  return actions.map((entry) => ({ ...entry }));
}

function buildBasePreviewItem(item: ItemStack): ItemStack {
  const template = getLocalItemTemplate(item.itemId);
  return {
    ...item,
    name: template?.name ?? item.name,
    desc: template?.desc ?? item.desc,
    groundLabel: template?.groundLabel ?? item.groundLabel,
    level: template?.level ?? item.level,
    grade: template?.grade ?? item.grade,
    equipSlot: template?.equipSlot ?? item.equipSlot,
    equipAttrs: template?.equipAttrs ?? item.equipAttrs,
    equipStats: template?.equipStats ?? item.equipStats,
    equipValueStats: template?.equipValueStats ?? item.equipValueStats,
    effects: template?.effects ?? item.effects,
    enhanceLevel: 0,
  };
}

export class EnhancementModal {
  private static readonly MODAL_OWNER = 'enhancement-modal';
  private callbacks: EnhancementModalCallbacks | null = null;
  private inventory = { items: [], capacity: 0 } as PlayerState['inventory'];
  private equipment = { weapon: null, head: null, body: null, legs: null, accessory: null } as PlayerState['equipment'];
  private actions: ActionDef[] = [];
  private loading = false;
  private responseError: string | null = null;
  private panelState: SyncedEnhancementPanelState | null = null;
  private selectedTargetKey: string | null = null;
  private selectedProtectionKey: string | null = null;

  setCallbacks(callbacks: EnhancementModalCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.actions = cloneActions(player.actions ?? []);
  }

  syncInventory(inventory: PlayerState['inventory']): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
      this.callbacks?.onRequestPanel();
      this.render();
    }
  }

  syncEquipment(equipment: PlayerState['equipment']): void {
    this.equipment = equipment;
    if (detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
      this.callbacks?.onRequestPanel();
      this.render();
    }
  }

  syncActions(actions: ActionDef[]): void {
    this.actions = cloneActions(actions);
    if (detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
      this.render();
    }
  }

  open(): void {
    this.loading = true;
    this.responseError = null;
    this.render();
    this.callbacks?.onRequestPanel();
  }

  clear(): void {
    this.loading = false;
    this.responseError = null;
    this.panelState = null;
    this.selectedTargetKey = null;
    this.selectedProtectionKey = null;
    detailModalHost.close(EnhancementModal.MODAL_OWNER);
  }

  updatePanel(data: S2C_EnhancementPanel): void {
    this.loading = false;
    this.responseError = data.error ?? null;
    this.panelState = data.state ? structuredClone(data.state) : null;
    this.ensureSelection();
    if (detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
      this.render();
    }
  }

  private ensureSelection(): void {
    const candidates = this.panelState?.candidates ?? [];
    if (candidates.length === 0) {
      this.selectedTargetKey = null;
      this.selectedProtectionKey = null;
      return;
    }
    if (!this.selectedTargetKey || !candidates.some((entry) => formatRefKey(entry.ref) === this.selectedTargetKey)) {
      this.selectedTargetKey = formatRefKey(candidates[0]!.ref);
    }
    const selected = this.getSelectedCandidate();
    if (!selected) {
      this.selectedProtectionKey = null;
      return;
    }
    if (
      this.selectedProtectionKey
      && !selected.protectionCandidates.some((entry) => formatRefKey(entry.ref) === this.selectedProtectionKey)
    ) {
      this.selectedProtectionKey = null;
    }
  }

  private getSelectedCandidate(): SyncedEnhancementCandidateView | null {
    if (!this.panelState || !this.selectedTargetKey) {
      return null;
    }
    return this.panelState.candidates.find((entry) => formatRefKey(entry.ref) === this.selectedTargetKey) ?? null;
  }

  private getSelectedProtection(selected: SyncedEnhancementCandidateView | null) {
    if (!selected || !this.selectedProtectionKey) {
      return null;
    }
    return selected.protectionCandidates.find((entry) => formatRefKey(entry.ref) === this.selectedProtectionKey) ?? null;
  }

  private getActionCooldownLeft(): number {
    return this.panelState?.actionCooldownLeft
      ?? this.actions.find((entry) => entry.id === 'enhancement:open')?.cooldownLeft
      ?? 0;
  }

  private render(): void {
    const selected = this.getSelectedCandidate();
    const selectedProtection = this.getSelectedProtection(selected);
    const hammerName = this.equipment.weapon?.name ?? '未装备';
    const bodyHtml = this.buildBodyHtml(selected, selectedProtection);
    detailModalHost.open({
      ownerId: EnhancementModal.MODAL_OWNER,
      variantClass: 'detail-modal--enhancement',
      title: '装备强化',
      subtitle: `当前法器：${hammerName}`,
      hint: '点击空白处关闭',
      bodyHtml,
      onAfterRender: (body) => this.bindEvents(body),
    });
  }

  private buildBodyHtml(
    selected: SyncedEnhancementCandidateView | null,
    selectedProtection: { ref: EnhancementTargetRef; item: ItemStack } | null,
  ): string {
    if (this.loading) {
      return '<div class="enhancement-empty-state">正在整理强化名录与当前背包状态…</div>';
    }
    if (this.responseError || !this.panelState) {
      return `<div class="enhancement-empty-state">${escapeHtml(this.responseError ?? '当前无法打开强化界面。')}</div>`;
    }
    if (this.panelState.candidates.length === 0) {
      return '<div class="enhancement-empty-state">当前没有可强化的装备。请先持有并装备带强化功能的器具。</div>';
    }

    const cooldownLeft = this.getActionCooldownLeft();
    const currentRecord = selected
      ? this.panelState.records.find((entry) => entry.itemId === selected.item.itemId) ?? null
      : null;
    return `
      <div class="enhancement-modal-shell">
        <div class="enhancement-toolbar">
          <div class="enhancement-toolbar-note">强化冷却：${cooldownLeft > 0 ? `${formatDisplayInteger(cooldownLeft)} 息` : '可立即进行'}</div>
          <button class="small-btn ghost" type="button" data-enhancement-refresh="1">刷新</button>
        </div>
        <div class="enhancement-layout">
          <aside class="enhancement-candidate-list">
            ${this.panelState.candidates.map((entry) => this.renderCandidate(entry)).join('')}
          </aside>
          <section class="enhancement-workbench">
            ${selected ? this.renderWorkbench(selected, selectedProtection, cooldownLeft) : '<div class="enhancement-empty-state">请选择一件装备。</div>'}
          </section>
          <aside class="enhancement-history-panel">
            ${selected ? this.renderHistory(selected, currentRecord) : '<div class="enhancement-empty-state">暂无可显示的强化记录。</div>'}
          </aside>
        </div>
      </div>
    `;
  }

  private renderCandidate(entry: SyncedEnhancementCandidateView): string {
    const key = formatRefKey(entry.ref);
    const activeClass = this.selectedTargetKey === key ? ' active' : '';
    const sourceLabel = entry.ref.source === 'equipment'
      ? `已装备 · ${getEquipSlotLabel(entry.ref.slot ?? 'weapon')}`
      : `背包槽位 ${formatDisplayInteger((entry.ref.slotIndex ?? 0) + 1)}`;
    const nextLabel = entry.nextLevel ? `+${entry.currentLevel} → +${entry.nextLevel}` : `已封顶 +${entry.currentLevel}`;
    return `
      <button class="enhancement-candidate${activeClass}" type="button" data-enhancement-target="${escapeHtml(key)}">
        <span class="enhancement-candidate-name">${escapeHtml(entry.item.name)}</span>
        <span class="enhancement-candidate-meta">${escapeHtml(sourceLabel)}</span>
        <span class="enhancement-candidate-meta">${escapeHtml(nextLabel)}</span>
      </button>
    `;
  }

  private renderWorkbench(
    selected: SyncedEnhancementCandidateView,
    selectedProtection: { ref: EnhancementTargetRef; item: ItemStack } | null,
    cooldownLeft: number,
  ): string {
    const basePreview = buildBasePreviewItem(selected.item);
    const currentPreview = applyEnhancementToItemStack({ ...basePreview, enhanceLevel: selected.currentLevel });
    const nextPreview = selected.nextLevel
      ? applyEnhancementToItemStack({ ...basePreview, enhanceLevel: selected.nextLevel })
      : null;
    const currentLines = describePreviewBonuses(
      currentPreview.equipAttrs,
      currentPreview.equipStats,
      currentPreview.equipValueStats,
    );
    const nextLines = nextPreview
      ? describePreviewBonuses(
        nextPreview.equipAttrs,
        nextPreview.equipStats,
        nextPreview.equipValueStats,
      )
      : [];
    const protectionNote = selected.protectionItemId
      ? `保护物固定为 ${selected.protectionItemName ?? selected.protectionItemId}`
      : `未配置独立保护物，当前仅可消耗同名装备作为保护`;
    const startDisabled = !selected.nextLevel || cooldownLeft > 0;
    return `
      <div class="enhancement-summary-card">
        <div class="enhancement-summary-head">
          <div>
            <div class="enhancement-summary-title">${escapeHtml(selected.item.name)}</div>
            <div class="enhancement-summary-subtitle">
              当前 +${formatDisplayInteger(selected.currentLevel)}
              ${selected.nextLevel ? ` · 目标 +${formatDisplayInteger(selected.nextLevel)}` : ' · 当前配置已封顶'}
            </div>
          </div>
          <div class="enhancement-summary-rate">${selected.nextLevel ? formatPercent(selected.successRate) : '封顶'}</div>
        </div>
        <div class="enhancement-summary-metrics">
          <div class="enhancement-summary-metric">
            <span>灵石</span>
            <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
          </div>
          <div class="enhancement-summary-metric">
            <span>间隔</span>
            <strong>${formatDisplayInteger(selected.actionCooldownTicks)} 息</strong>
          </div>
          <div class="enhancement-summary-metric">
            <span>保护</span>
            <strong>${selectedProtection ? '已启用' : '未启用'}</strong>
          </div>
        </div>
      </div>
      <div class="enhancement-preview-grid">
        <div class="enhancement-preview-card">
          <div class="enhancement-preview-title">当前属性</div>
          ${currentLines.length > 0
            ? `<div class="enhancement-preview-lines">${currentLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
            : '<div class="enhancement-preview-empty">当前装备没有可强化的基础属性。</div>'}
        </div>
        <div class="enhancement-preview-card">
          <div class="enhancement-preview-title">下一阶预览</div>
          ${nextPreview && nextLines.length > 0
            ? `<div class="enhancement-preview-lines">${nextLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
            : '<div class="enhancement-preview-empty">下一阶暂无额外预览。</div>'}
        </div>
      </div>
      <div class="enhancement-requirement-card">
        <div class="enhancement-section-title">强化材料</div>
        <div class="enhancement-material-row">
          <span>灵石</span>
          <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
          <span class="enhancement-material-owned">持有 ${formatDisplayInteger(this.countInventoryItem('spirit_stone'))}</span>
        </div>
        ${(selected.materials.length > 0
          ? selected.materials.map((entry) => `
            <div class="enhancement-material-row">
              <span>${escapeHtml(entry.name)}</span>
              <strong>${formatDisplayInteger(entry.count)}</strong>
              <span class="enhancement-material-owned">持有 ${formatDisplayInteger(entry.ownedCount)}</span>
            </div>
          `).join('')
          : '<div class="enhancement-material-empty">本级不需要额外材料，只消耗灵石。</div>')}
      </div>
      <div class="enhancement-requirement-card">
        <div class="enhancement-section-title">保护选择</div>
        <div class="enhancement-protection-note">${escapeHtml(protectionNote)}</div>
        <label class="enhancement-protection-option">
          <input type="radio" name="enhancement-protection" value="" ${this.selectedProtectionKey ? '' : 'checked'}>
          <span>不使用保护</span>
        </label>
        ${selected.protectionCandidates.length > 0
          ? selected.protectionCandidates.map((entry) => {
            const key = formatRefKey(entry.ref);
            const sourceLabel = `背包槽位 ${(entry.ref.slotIndex ?? 0) + 1} · 数量 ${entry.item.count}`;
            return `
              <label class="enhancement-protection-option">
                <input type="radio" name="enhancement-protection" value="${escapeHtml(key)}" ${this.selectedProtectionKey === key ? 'checked' : ''}>
                <span>${escapeHtml(entry.item.name)}</span>
                <em>${escapeHtml(sourceLabel)}</em>
              </label>
            `;
          }).join('')
          : '<div class="enhancement-material-empty">当前背包没有可用保护物。</div>'}
      </div>
      <div class="enhancement-action-row">
        <button class="small-btn" type="button" data-enhancement-start="1" ${startDisabled ? 'disabled' : ''}>开始强化</button>
        <span class="enhancement-action-note">
          ${cooldownLeft > 0
            ? `法器尚需 ${formatDisplayInteger(cooldownLeft)} 息恢复。`
            : selected.nextLevel
              ? '失败无保护归零，启用保护则失败仅降一级。'
              : '当前强化已达到配置上限。'}
        </span>
      </div>
    `;
  }

  private renderHistory(selected: SyncedEnhancementCandidateView, record: PlayerEnhancementRecord | null): string {
    const levelRecords = new Map((record?.levels ?? []).map((entry) => [entry.targetLevel, entry] as const));
    const rows: string[] = [];
    for (let level = 1; level <= selected.maxLevel; level += 1) {
      const current = levelRecords.get(level);
      rows.push(`
        <div class="enhancement-history-row">
          <span>+${formatDisplayInteger(level)}</span>
          <span>${formatPercent(level <= selected.maxLevel ? (selected.currentLevel === level - 1 && selected.successRate !== undefined ? selected.successRate : undefined) ?? this.getStaticRate(level) : undefined)}</span>
          <span>成 ${formatDisplayInteger(current?.successCount ?? 0)}</span>
          <span>败 ${formatDisplayInteger(current?.failureCount ?? 0)}</span>
        </div>
      `);
    }
    return `
      <div class="enhancement-requirement-card enhancement-requirement-card--history">
        <div class="enhancement-section-title">强化记录</div>
        <div class="enhancement-protection-note">历史最高：+${formatDisplayInteger(record?.highestLevel ?? 0)}</div>
        <div class="enhancement-history-table">
          <div class="enhancement-history-row enhancement-history-row--head">
            <span>目标</span>
            <span>成功率</span>
            <span>成功</span>
            <span>失败</span>
          </div>
          ${rows.join('')}
        </div>
      </div>
    `;
  }

  private getStaticRate(level: number): number {
    if (level <= 2) return 0.5;
    if (level <= 4) return 0.45;
    if (level <= 6) return 0.4;
    if (level <= 8) return 0.35;
    return Math.max(0, 0.5 - Math.floor((level - 1) / 2) * 0.05);
  }

  private countInventoryItem(itemId: string): number {
    return this.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
  }

  private bindEvents(body: HTMLElement): void {
    body.querySelectorAll<HTMLElement>('[data-enhancement-target]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedTargetKey = button.dataset.enhancementTarget ?? null;
        this.selectedProtectionKey = null;
        this.ensureSelection();
        this.render();
      });
    });

    body.querySelectorAll<HTMLInputElement>('input[name="enhancement-protection"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.selectedProtectionKey = input.value || null;
        this.render();
      });
    });

    body.querySelector('[data-enhancement-refresh="1"]')?.addEventListener('click', () => {
      this.loading = true;
      this.render();
      this.callbacks?.onRequestPanel();
    });

    body.querySelector('[data-enhancement-start="1"]')?.addEventListener('click', () => {
      const selected = this.getSelectedCandidate();
      if (!selected || !selected.nextLevel || this.getActionCooldownLeft() > 0) {
        return;
      }
      const protection = this.getSelectedProtection(selected);
      this.callbacks?.onStartEnhancement({
        target: selected.ref,
        protection: protection?.ref ?? null,
      });
    });
  }
}
