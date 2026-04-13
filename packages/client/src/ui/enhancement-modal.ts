import {
  C2S_StartEnhancement,
  EnhancementTargetRef,
  ItemStack,
  PlayerEnhancementJob,
  PlayerEnhancementRecord,
  PlayerState,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
  applyEnhancementToItemStack,
  computeEnhancementAdjustedSuccessRate,
  MAX_ENHANCE_LEVEL,
  normalizeEnhanceLevel,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { getEquipSlotLabel, getItemTypeLabel } from '../domain-labels';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from './item-display';
import { formatDisplayInteger } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { describeEquipmentBonuses } from './equipment-tooltip';

/** EnhancementModalCallbacks：定义该接口的能力与字段约束。 */
interface EnhancementModalCallbacks {
  onRequestPanel: () => void;
  onStartEnhancement: (payload: C2S_StartEnhancement) => void;
  onCancelEnhancement: () => void;
}

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatPercent：执行对应的业务逻辑。 */
function formatPercent(rate: number | undefined): string {
/** normalized：定义该变量以承载业务值。 */
  const normalized = typeof rate === 'number' ? Math.max(0, Math.min(1, rate)) : 0;
  return `${Math.round(normalized * 100)}%`;
}

/** formatRefKey：执行对应的业务逻辑。 */
function formatRefKey(ref: EnhancementTargetRef): string {
  return ref.source === 'inventory'
    ? `inventory:${ref.slotIndex ?? -1}`
    : `equipment:${ref.slot ?? ''}`;
}

/** buildBasePreviewItem：执行对应的业务逻辑。 */
function buildBasePreviewItem(item: ItemStack): ItemStack {
/** template：定义该变量以承载业务值。 */
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
    alchemySuccessRate: template?.alchemySuccessRate ?? item.alchemySuccessRate,
    alchemySpeedRate: template?.alchemySpeedRate ?? item.alchemySpeedRate,
    enhancementSpeedRate: template?.enhancementSpeedRate ?? item.enhancementSpeedRate,
    enhanceLevel: 0,
  };
}

/** getItemNameClass：执行对应的业务逻辑。 */
function getItemNameClass(name: string): string {
/** length：定义该变量以承载业务值。 */
  const length = [...name].length;
  if (length >= 7) {
    return 'inventory-cell-name--tiny';
  }
  if (length >= 5) {
    return 'inventory-cell-name--compact';
  }
  return '';
}

/** StoredEnhancementHistoryStateV1：定义旧版历史结构。 */
interface StoredEnhancementHistoryStateV1 {
/** version：定义该变量以承载业务值。 */
  version: 1;
/** totals：定义该变量以承载业务值。 */
  totals: PlayerEnhancementRecord[];
/** sessionRecord：定义该变量以承载业务值。 */
  sessionRecord: PlayerEnhancementRecord | null;
}

/** StoredEnhancementHistoryState：定义该接口的能力与字段约束。 */
interface StoredEnhancementHistoryState {
/** version：定义该变量以承载业务值。 */
  version: 2;
/** totals：定义该变量以承载业务值。 */
  totals: PlayerEnhancementRecord[];
/** sessions：定义该变量以承载业务值。 */
  sessions: PlayerEnhancementRecord[];
/** sessionRecord：定义该变量以承载业务值。 */
  sessionRecord: PlayerEnhancementRecord | null;
}

/** ENHANCEMENT_HISTORY_STORAGE_KEY：定义该变量以承载业务值。 */
const ENHANCEMENT_HISTORY_STORAGE_KEY = 'mud:enhancement-history:v2';

/** cloneEnhancementRecord：执行对应的业务逻辑。 */
function cloneEnhancementRecord(record: PlayerEnhancementRecord): PlayerEnhancementRecord {
  return {
    itemId: record.itemId,
    highestLevel: normalizeEnhanceLevel(record.highestLevel),
    levels: [...(record.levels ?? [])]
      .map((entry) => ({
        targetLevel: Math.max(1, Math.floor(Number(entry.targetLevel) || 1)),
        successCount: Math.max(0, Math.floor(Number(entry.successCount) || 0)),
        failureCount: Math.max(0, Math.floor(Number(entry.failureCount) || 0)),
      }))
      .sort((left, right) => left.targetLevel - right.targetLevel),
    actionStartedAt: Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0
      ? Math.floor(Number(record.actionStartedAt))
      : undefined,
    actionEndedAt: Number.isFinite(record.actionEndedAt) && Number(record.actionEndedAt) > 0
      ? Math.floor(Number(record.actionEndedAt))
      : undefined,
    startLevel: Number.isFinite(record.startLevel)
      ? normalizeEnhanceLevel(record.startLevel)
      : undefined,
    initialTargetLevel: Number.isFinite(record.initialTargetLevel)
      ? Math.max(1, Math.floor(Number(record.initialTargetLevel)))
      : undefined,
    desiredTargetLevel: Number.isFinite(record.desiredTargetLevel)
      ? Math.max(1, Math.floor(Number(record.desiredTargetLevel)))
      : undefined,
    protectionStartLevel: Number.isFinite(record.protectionStartLevel)
      ? Math.max(2, Math.floor(Number(record.protectionStartLevel)))
      : undefined,
    status: record.status === 'completed' || record.status === 'cancelled' || record.status === 'stopped' || record.status === 'in_progress'
      ? record.status
      : undefined,
  };
}

/** normalizeEnhancementRecordList：执行对应的业务逻辑。 */
function normalizeEnhancementRecordList(records: PlayerEnhancementRecord[] | null | undefined): PlayerEnhancementRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .filter((entry): entry is PlayerEnhancementRecord => Boolean(entry?.itemId))
    .map((entry) => cloneEnhancementRecord(entry));
}

/** getEnhancementHistorySessionKey：执行对应的业务逻辑。 */
function getEnhancementHistorySessionKey(record: Pick<PlayerEnhancementRecord, 'itemId' | 'actionStartedAt'>): string {
  return `${record.itemId}:${Math.max(0, Math.floor(Number(record.actionStartedAt) || 0))}`;
}

/** isEnhancementHistorySessionRecord：执行对应的业务逻辑。 */
function isEnhancementHistorySessionRecord(record: PlayerEnhancementRecord | null | undefined): boolean {
  return Boolean(record && Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0);
}

/** formatHistoryDateTime：执行对应的业务逻辑。 */
function formatHistoryDateTime(timestamp: number | undefined): string {
  if (!Number.isFinite(timestamp) || Number(timestamp) <= 0) {
    return '未知时间';
  }
  return new Date(Number(timestamp)).toLocaleString('zh-CN');
}

/** EnhancementModal：封装相关状态与行为。 */
export class EnhancementModal {
  private static readonly MODAL_OWNER = 'enhancement-modal';
  private static readonly PICKER_OWNER = 'enhancement-modal:picker';
  private static readonly HISTORY_LIST_OWNER = 'enhancement-modal:history-list';
  private static readonly HISTORY_SESSION_OWNER = 'enhancement-modal:history-session';
  private static readonly HISTORY_DETAIL_OWNER = 'enhancement-modal:history-detail';

/** callbacks：定义该变量以承载业务值。 */
  private callbacks: EnhancementModalCallbacks | null = null;
  private inventory = { items: [], capacity: 0 } as PlayerState['inventory'];
  private equipment = { weapon: null, head: null, body: null, legs: null, accessory: null } as PlayerState['equipment'];
  private loading = false;
/** responseError：定义该变量以承载业务值。 */
  private responseError: string | null = null;
/** panelState：定义该变量以承载业务值。 */
  private panelState: SyncedEnhancementPanelState | null = null;
/** selectedTargetKey：定义该变量以承载业务值。 */
  private selectedTargetKey: string | null = null;
/** selectedTargetLevel：定义该变量以承载业务值。 */
  private selectedTargetLevel: number | null = null;
/** selectedProtectionKey：定义该变量以承载业务值。 */
  private selectedProtectionKey: string | null = null;
/** selectedProtectionStartLevel：定义该变量以承载业务值。 */
  private selectedProtectionStartLevel: number | null = null;
/** countdownTimer：定义该变量以承载业务值。 */
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
/** localJobRemainingTicks：定义该变量以承载业务值。 */
  private localJobRemainingTicks: number | null = null;
/** lastJobSnapshotKey：定义该变量以承载业务值。 */
  private lastJobSnapshotKey: string | null = null;
  private localHistoryLoaded = false;
  private localHistoryRecords = new Map<string, PlayerEnhancementRecord>();
  private localHistorySessions: PlayerEnhancementRecord[] = [];
/** lastServerSessionRecord：定义该变量以承载业务值。 */
  private lastServerSessionRecord: PlayerEnhancementRecord | null = null;
  private activeHistoryItemId: string | null = null;
  private activeHistorySessionKey: string | null = null;

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: EnhancementModalCallbacks): void {
    this.callbacks = callbacks;
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
  }

/** syncInventory：执行对应的业务逻辑。 */
  syncInventory(inventory: PlayerState['inventory']): void {
    this.inventory = inventory;
  }

/** syncEquipment：执行对应的业务逻辑。 */
  syncEquipment(equipment: PlayerState['equipment']): void {
    this.equipment = equipment;
  }

  syncActions(_actions: PlayerState['actions']): void {}

/** open：执行对应的业务逻辑。 */
  open(): void {
    this.ensureLocalHistoryLoaded();
    this.loading = true;
    this.responseError = null;
    this.render();
    this.callbacks?.onRequestPanel();
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.loading = false;
    this.responseError = null;
    this.panelState = null;
    this.selectedTargetKey = null;
    this.selectedTargetLevel = null;
    this.selectedProtectionKey = null;
    this.selectedProtectionStartLevel = null;
    this.localJobRemainingTicks = null;
    this.lastJobSnapshotKey = null;
    this.activeHistoryItemId = null;
    this.activeHistorySessionKey = null;
    this.stopCountdown();
    confirmModalHost.close(EnhancementModal.PICKER_OWNER);
    confirmModalHost.close(EnhancementModal.HISTORY_LIST_OWNER);
    confirmModalHost.close(EnhancementModal.HISTORY_SESSION_OWNER);
    confirmModalHost.close(EnhancementModal.HISTORY_DETAIL_OWNER);
    detailModalHost.close(EnhancementModal.MODAL_OWNER);
  }

/** updatePanel：执行对应的业务逻辑。 */
  updatePanel(data: S2C_EnhancementPanel): void {
    this.ensureLocalHistoryLoaded();
    this.loading = false;
    this.responseError = data.error ?? null;
    this.mergeServerSessionRecord(data.state?.records ?? []);
    this.panelState = data.state ? structuredClone(data.state) : null;
    this.ensureSelection();
    this.syncCountdown();
    this.refreshOpenHistoryModal();
    if (detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
      this.render();
    }
  }

/** ensureSelection：执行对应的业务逻辑。 */
  private ensureSelection(): void {
/** candidates：定义该变量以承载业务值。 */
    const candidates = this.panelState?.candidates ?? [];
    if (candidates.length === 0) {
      this.selectedTargetKey = null;
      this.selectedTargetLevel = null;
      this.selectedProtectionKey = null;
      this.selectedProtectionStartLevel = null;
      return;
    }
    if (this.selectedTargetKey && !candidates.some((entry) => formatRefKey(entry.ref) === this.selectedTargetKey)) {
      this.selectedTargetKey = null;
      this.selectedTargetLevel = null;
    }
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedCandidate();
    if (selected) {
/** minLevel：定义该变量以承载业务值。 */
      const minLevel = selected.currentLevel + 1;
      if (!this.selectedTargetLevel || this.selectedTargetLevel < minLevel) {
        this.selectedTargetLevel = minLevel;
      }
      if (this.selectedProtectionKey) {
/** maxLevel：定义该变量以承载业务值。 */
        const maxLevel = this.getSelectedTargetLevel(selected) ?? minLevel;
        this.selectedProtectionStartLevel = Math.max(
          2,
          Math.min(maxLevel, Math.floor(Number(this.selectedProtectionStartLevel) || 2)),
        );
      } else {
        this.selectedProtectionStartLevel = null;
      }
    }
    if (
      this.selectedProtectionKey
      && !selected?.protectionCandidates.some((entry) => formatRefKey(entry.ref) === this.selectedProtectionKey)
    ) {
      this.selectedProtectionKey = null;
      this.selectedProtectionStartLevel = null;
    }
  }

/** getSelectedCandidate：执行对应的业务逻辑。 */
  private getSelectedCandidate(): SyncedEnhancementCandidateView | null {
    if (!this.panelState || !this.selectedTargetKey) {
      return null;
    }
    return this.panelState.candidates.find((entry) => formatRefKey(entry.ref) === this.selectedTargetKey) ?? null;
  }

/** getSelectedProtection：处理当前场景中的对应操作。 */
  private getSelectedProtection(selected: SyncedEnhancementCandidateView | null) {
    if (!selected || !this.selectedProtectionKey) {
      return null;
    }
    return selected.protectionCandidates.find((entry) => formatRefKey(entry.ref) === this.selectedProtectionKey) ?? null;
  }

/** getSelectedTargetLevel：执行对应的业务逻辑。 */
  private getSelectedTargetLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected) {
      return null;
    }
/** minLevel：定义该变量以承载业务值。 */
    const minLevel = selected.currentLevel + 1;
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, Math.floor(Number(this.selectedTargetLevel) || minLevel)));
  }

/** getSelectedProtectionStartLevel：执行对应的业务逻辑。 */
  private getSelectedProtectionStartLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected || !this.selectedProtectionKey) {
      return null;
    }
/** minLevel：定义该变量以承载业务值。 */
    const minLevel = 2;
/** maxLevel：定义该变量以承载业务值。 */
    const maxLevel = this.getSelectedTargetLevel(selected) ?? Math.max(minLevel, selected.currentLevel + 1);
    return Math.max(minLevel, Math.min(maxLevel, Math.floor(Number(this.selectedProtectionStartLevel) || minLevel)));
  }

/** getActiveJob：执行对应的业务逻辑。 */
  private getActiveJob(): PlayerEnhancementJob | null {
    return this.panelState?.job ?? null;
  }

/** getDisplayedRemainingTicks：执行对应的业务逻辑。 */
  private getDisplayedRemainingTicks(): number {
    if (typeof this.localJobRemainingTicks === 'number') {
      return Math.max(0, this.localJobRemainingTicks);
    }
    return this.getActiveJob()?.remainingTicks ?? 0;
  }

/** syncCountdown：执行对应的业务逻辑。 */
  private syncCountdown(): void {
/** job：定义该变量以承载业务值。 */
    const job = this.getActiveJob();
/** nextSnapshotKey：定义该变量以承载业务值。 */
    const nextSnapshotKey = job ? `${job.targetItemId}:${job.targetLevel}:${job.remainingTicks}:${job.startedAt}` : null;
    if (!job) {
      this.localJobRemainingTicks = null;
      this.lastJobSnapshotKey = null;
      this.stopCountdown();
      return;
    }
    if (nextSnapshotKey !== this.lastJobSnapshotKey) {
      this.lastJobSnapshotKey = nextSnapshotKey;
      this.localJobRemainingTicks = job.remainingTicks;
    }
    if (this.countdownTimer || (this.localJobRemainingTicks ?? 0) <= 0) {
      return;
    }
    this.countdownTimer = setInterval(() => {
      if (!detailModalHost.isOpenFor(EnhancementModal.MODAL_OWNER)) {
        return;
      }
      if ((this.localJobRemainingTicks ?? 0) <= 0) {
        this.stopCountdown();
        return;
      }
      this.localJobRemainingTicks = Math.max(0, (this.localJobRemainingTicks ?? 0) - 1);
      this.render();
      if ((this.localJobRemainingTicks ?? 0) <= 0) {
        this.stopCountdown();
      }
    }, 1000);
  }

/** stopCountdown：执行对应的业务逻辑。 */
  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

/** render：执行对应的业务逻辑。 */
  private render(): void {
    this.ensureLocalHistoryLoaded();
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedCandidate();
/** selectedProtection：定义该变量以承载业务值。 */
    const selectedProtection = this.getSelectedProtection(selected);
/** activeJob：定义该变量以承载业务值。 */
    const activeJob = this.getActiveJob();
/** hammerName：定义该变量以承载业务值。 */
    const hammerName = this.equipment.weapon?.name ?? '未装备';
    detailModalHost.open({
      ownerId: EnhancementModal.MODAL_OWNER,
      variantClass: 'detail-modal--enhancement',
      title: '装备强化',
      subtitle: `当前法器：${hammerName}`,
      hint: '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(selected, selectedProtection, activeJob),
      onAfterRender: (body) => this.bindEvents(body),
      onClose: () => {
        confirmModalHost.close(EnhancementModal.PICKER_OWNER);
        confirmModalHost.close(EnhancementModal.HISTORY_LIST_OWNER);
        confirmModalHost.close(EnhancementModal.HISTORY_DETAIL_OWNER);
        this.stopCountdown();
      },
    });
  }

  private buildBodyHtml(
    selected: SyncedEnhancementCandidateView | null,
/** selectedProtection：定义该变量以承载业务值。 */
    selectedProtection: { ref: EnhancementTargetRef; item: ItemStack } | null,
    activeJob: PlayerEnhancementJob | null,
  ): string {
    if (this.loading) {
      return '<div class="enhancement-empty-state">正在整理强化名录与当前背包状态…</div>';
    }
    if (this.responseError || !this.panelState) {
      return `<div class="enhancement-empty-state">${escapeHtml(this.responseError ?? '当前无法打开强化界面。')}</div>`;
    }
    if (!activeJob && this.panelState.candidates.length === 0) {
      return '<div class="enhancement-empty-state">当前没有可强化的装备。现在任意装备都可强化，但你身上暂时没有可用目标。</div>';
    }

/** selectedRecord：定义该变量以承载业务值。 */
    const selectedRecord = activeJob
      ? this.panelState.records.find((entry) => entry.itemId === activeJob.targetItemId) ?? null
      : selected
        ? this.panelState.records.find((entry) => entry.itemId === selected.item.itemId) ?? null
        : null;

    return `
      <div class="enhancement-modal-shell">
        <div class="enhancement-toolbar">
          <div class="enhancement-toolbar-note">${activeJob
            ? `强化队列进行中，剩余 ${formatDisplayInteger(this.getDisplayedRemainingTicks())} / ${formatDisplayInteger(activeJob.totalTicks)} 息`
            : `角色强化等级 Lv.${formatDisplayInteger(this.panelState.enhancementSkillLevel)} · 当前可强化装备 ${formatDisplayInteger(this.panelState.candidates.length)} 件`}</div>
          <button class="small-btn ghost" type="button" data-enhancement-refresh="1">刷新</button>
        </div>
        <div class="enhancement-layout enhancement-layout--single-slot">
          <section class="enhancement-workbench">
            ${activeJob
              ? this.renderActiveJob(activeJob, selected)
              : selected
                ? this.renderWorkbench(selected, selectedProtection)
                : `
                  <div class="enhancement-workbench-grid">
                    <div class="enhancement-workbench-side">
                      ${this.renderTargetSlot(activeJob, selected)}
                    </div>
                    <div class="enhancement-workbench-main">
                      <div class="enhancement-empty-state">请选择一件装备。</div>
                    </div>
                  </div>
                `}
          </section>
          <aside class="enhancement-history-panel">
            ${this.renderHistory(activeJob, selected, selectedRecord)}
          </aside>
        </div>
      </div>
    `;
  }

/** renderTargetSlot：执行对应的业务逻辑。 */
  private renderTargetSlot(activeJob: PlayerEnhancementJob | null, selected: SyncedEnhancementCandidateView | null): string {
/** selectedItem：定义该变量以承载业务值。 */
    const selectedItem = activeJob?.item ?? selected?.item ?? null;
/** sourceLabel：定义该变量以承载业务值。 */
    const sourceLabel = activeJob
      ? (activeJob.target.source === 'equipment'
        ? `队列锁定 · ${getEquipSlotLabel(activeJob.target.slot ?? 'weapon')}`
        : '队列锁定 · 背包物品')
      : selected
        ? (selected.ref.source === 'equipment'
          ? `已装备 · ${getEquipSlotLabel(selected.ref.slot ?? 'weapon')}`
          : `背包槽位 ${formatDisplayInteger((selected.ref.slotIndex ?? 0) + 1)}`)
        : '尚未选择';
    return `
      <div class="enhancement-target-slot-card">
        <div class="enhancement-target-slot-head">
          <div>
            <div class="enhancement-section-title">强化目标</div>
            <div class="enhancement-protection-note">${escapeHtml(sourceLabel)}</div>
          </div>
          <button class="small-btn ghost" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
            ${selectedItem ? '更换装备' : '选择装备'}
          </button>
        </div>
        <button class="enhancement-target-slot" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
          ${selectedItem
            ? `
              <span class="enhancement-target-slot-name">${escapeHtml(selectedItem.name)}</span>
              <span class="enhancement-target-slot-meta">等级 ${formatDisplayInteger(Number(selectedItem.level) || 1)} · 当前 +${formatDisplayInteger(normalizeEnhanceLevel(selectedItem.enhanceLevel))}</span>
            `
            : `
              <span class="enhancement-target-slot-name">点击选择要强化的装备</span>
              <span class="enhancement-target-slot-meta">主面板只保留一个目标槽，候选装备会在独立弹窗中选择</span>
            `}
        </button>
      </div>
    `;
  }

/** renderActiveJob：执行对应的业务逻辑。 */
  private renderActiveJob(job: PlayerEnhancementJob, selected: SyncedEnhancementCandidateView | null): string {
/** currentPreview：定义该变量以承载业务值。 */
    const currentPreview = applyEnhancementToItemStack({
      ...buildBasePreviewItem(job.item),
      enhanceLevel: job.currentLevel,
    });
/** resultPreview：定义该变量以承载业务值。 */
    const resultPreview = applyEnhancementToItemStack({
      ...buildBasePreviewItem(job.item),
      enhanceLevel: job.targetLevel,
    });
/** currentLines：定义该变量以承载业务值。 */
    const currentLines = describeEquipmentBonuses(currentPreview);
/** resultLines：定义该变量以承载业务值。 */
    const resultLines = describeEquipmentBonuses(resultPreview);
/** finalTargetLevel：定义该变量以承载业务值。 */
    const finalTargetLevel = Math.max(job.targetLevel, job.desiredTargetLevel ?? job.targetLevel);
    return `
      <div class="enhancement-workbench-grid">
        <div class="enhancement-workbench-side">
          ${this.renderTargetSlot(job, selected)}
          <div class="enhancement-target-level-card">
            <div class="enhancement-section-title">当前行动</div>
            <div class="enhancement-target-level-note">强化队列已启动，目标装备和强化锤在任务结束前会保持锁定。</div>
            <div class="enhancement-summary-metrics enhancement-summary-metrics--compact">
              <div class="enhancement-summary-metric">
                <span>当前冲击</span>
                <strong>+${formatDisplayInteger(job.targetLevel)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>最终目标</span>
                <strong>+${formatDisplayInteger(finalTargetLevel)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>保护</span>
                <strong>${job.protectionUsed ? `+${formatDisplayInteger(job.protectionStartLevel ?? job.targetLevel)} 起` : '未启用'}</strong>
              </div>
            </div>
            <div class="enhancement-action-row enhancement-action-row--stacked">
              <button class="small-btn ghost" type="button" data-enhancement-cancel="1">取消强化</button>
              <span class="enhancement-action-note">取消后会返还当前装备，已投入的材料不会退回；保护物仅在失败且保护生效时扣除，灵石仅在本阶成功时扣除。</span>
            </div>
          </div>
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card enhancement-summary-card--running">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(job.targetItemName)}</div>
                <div class="enhancement-summary-subtitle">进行中：+${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)}${finalTargetLevel > job.targetLevel ? ` · 最终目标 +${formatDisplayInteger(finalTargetLevel)}` : ''}</div>
              </div>
              <div class="enhancement-summary-rate">${formatPercent(job.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>剩余</span>
                <strong>${formatDisplayInteger(this.getDisplayedRemainingTicks())}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>总时长</span>
                <strong>${formatDisplayInteger(job.totalTicks)} 息</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>本阶成功率</span>
                <strong>${formatPercent(job.successRate)}</strong>
              </div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">本次已投入</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(job.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">角色强化等级 Lv.${formatDisplayInteger(job.roleEnhancementLevel)} · 总加速 ${formatPercent(job.totalSpeedRate)}</span>
            </div>
            ${job.materials.length > 0
              ? job.materials.map((entry) => `
                <div class="enhancement-material-row">
                  <span>${escapeHtml(getLocalItemTemplate(entry.itemId)?.name ?? entry.itemId)}</span>
                  <strong>${formatDisplayInteger(entry.count)}</strong>
                  <span class="enhancement-material-owned">已投入</span>
                </div>
              `).join('')
              : '<div class="enhancement-material-empty">本次没有额外材料，仅消耗灵石。</div>'}
          </div>
          <div class="enhancement-preview-grid">
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">当前属性</div>
              ${currentLines.length > 0
                ? `<div class="enhancement-preview-lines">${currentLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">当前装备没有可显示的强化属性。</div>'}
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">成功后预览</div>
              ${resultLines.length > 0
                ? `<div class="enhancement-preview-lines">${resultLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">强化后暂无可显示属性。</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderWorkbench(
    selected: SyncedEnhancementCandidateView,
/** selectedProtection：定义该变量以承载业务值。 */
    selectedProtection: { ref: EnhancementTargetRef; item: ItemStack } | null,
  ): string {
/** selectedTargetLevel：定义该变量以承载业务值。 */
    const selectedTargetLevel = this.getSelectedTargetLevel(selected) ?? selected.nextLevel;
/** currentPreview：定义该变量以承载业务值。 */
    const currentPreview = applyEnhancementToItemStack({
      ...buildBasePreviewItem(selected.item),
      enhanceLevel: selected.currentLevel,
    });
/** nextPreview：定义该变量以承载业务值。 */
    const nextPreview = applyEnhancementToItemStack({
      ...buildBasePreviewItem(selected.item),
      enhanceLevel: selectedTargetLevel,
    });
/** currentLines：定义该变量以承载业务值。 */
    const currentLines = describeEquipmentBonuses(currentPreview);
/** nextLines：定义该变量以承载业务值。 */
    const nextLines = describeEquipmentBonuses(nextPreview);
/** protectionNote：定义该变量以承载业务值。 */
    const protectionNote = selected.protectionItemId
      ? `保护物固定为 ${selected.protectionItemName ?? selected.protectionItemId}`
      : '未配置独立保护物，当前仅可消耗同名装备作为保护';
/** minProtectionStartLevel：定义该变量以承载业务值。 */
    const minProtectionStartLevel = 2;
/** protectionStartLevel：定义该变量以承载业务值。 */
    const protectionStartLevel = this.getSelectedProtectionStartLevel(selected);
    return `
      <div class="enhancement-workbench-grid">
        <div class="enhancement-workbench-side">
          ${this.renderTargetSlot(null, selected)}
          <div class="enhancement-target-level-card">
            <div class="enhancement-section-title">目标强化等级</div>
            <div class="enhancement-target-level-row">
              <button class="small-btn ghost" type="button" data-enhancement-target-adjust="-1" ${selectedTargetLevel <= (selected.currentLevel + 1) ? 'disabled' : ''}>-1</button>
              <input
                class="enhancement-target-level-input"
                type="number"
                inputmode="numeric"
                min="${selected.currentLevel + 1}"
                max="${MAX_ENHANCE_LEVEL}"
                step="1"
                value="${selectedTargetLevel}"
                data-enhancement-target-level-input="1"
              >
              <button class="small-btn ghost" type="button" data-enhancement-target-adjust="1" ${selectedTargetLevel >= MAX_ENHANCE_LEVEL ? 'disabled' : ''}>+1</button>
            </div>
            <div class="enhancement-target-level-note">强化队列会从当前等级逐阶结算，直到达到目标等级，或后续灵石、材料、保护物不足，或到达上限 +${MAX_ENHANCE_LEVEL}。</div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">保护</div>
            <div class="enhancement-protection-note">${escapeHtml(protectionNote)}</div>
            <label class="enhancement-protection-option">
              <input type="radio" name="enhancement-protection" value="" ${this.selectedProtectionKey ? '' : 'checked'}>
              <span>不使用保护</span>
            </label>
            ${selected.protectionCandidates.length > 0
              ? selected.protectionCandidates.map((entry) => {
/** key：定义该变量以承载业务值。 */
                const key = formatRefKey(entry.ref);
/** sourceLabel：定义该变量以承载业务值。 */
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
            ${this.selectedProtectionKey && selectedTargetLevel >= minProtectionStartLevel ? `
              <div class="enhancement-protection-start">
                <div class="enhancement-protection-note">开始保护等级</div>
                <div class="enhancement-target-level-row">
                  <button class="small-btn ghost" type="button" data-enhancement-protection-adjust="-1" ${!protectionStartLevel || protectionStartLevel <= minProtectionStartLevel ? 'disabled' : ''}>-1</button>
                  <input
                    class="enhancement-target-level-input"
                    type="number"
                    inputmode="numeric"
                    min="${minProtectionStartLevel}"
                    max="${selectedTargetLevel}"
                    step="1"
                    value="${protectionStartLevel ?? minProtectionStartLevel}"
                    data-enhancement-protection-start-input="1"
                  >
                  <button class="small-btn ghost" type="button" data-enhancement-protection-adjust="1" ${!protectionStartLevel || protectionStartLevel >= selectedTargetLevel ? 'disabled' : ''}>+1</button>
                </div>
                <div class="enhancement-target-level-note">保护最低从 +2 开始生效。达到这个目标等级后，失败才会消耗保护并只降低一级。</div>
              </div>
            ` : this.selectedProtectionKey ? `
              <div class="enhancement-protection-start">
                <div class="enhancement-target-level-note">保护最低从 +2 开始生效。当前目标还没到 +2，这次强化不会消耗保护物。</div>
              </div>
            ` : ''}
          </div>
          <div class="enhancement-action-row enhancement-action-row--stacked">
            <button class="small-btn" type="button" data-enhancement-start="1">开始强化</button>
            <span class="enhancement-action-note">每一阶都会单独判定成功率、耗时和消耗。当前面板显示的是首阶数据，只要后续资源足够，就会持续冲击直到达到目标等级。</span>
          </div>
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(selected.item.name)}</div>
                <div class="enhancement-summary-subtitle">当前 +${formatDisplayInteger(selected.currentLevel)} · 最终目标 +${formatDisplayInteger(selectedTargetLevel)}</div>
              </div>
              <div class="enhancement-summary-rate">首阶 ${formatPercent(selected.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>首阶灵石</span>
                <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>首阶耗时</span>
                <strong>${formatDisplayInteger(selected.durationTicks)} 息</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>保护模式</span>
                <strong>${selectedProtection ? '已启用' : '未启用'}</strong>
              </div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">强化材料</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">持有 ${formatDisplayInteger(this.countInventoryItem('spirit_stone'))}</span>
            </div>
            ${selected.materials.length > 0
              ? selected.materials.map((entry) => `
                <div class="enhancement-material-row">
                  <span>${escapeHtml(entry.name)}</span>
                  <strong>${formatDisplayInteger(entry.count)}</strong>
                  <span class="enhancement-material-owned">持有 ${formatDisplayInteger(entry.ownedCount)}</span>
                </div>
              `).join('')
              : '<div class="enhancement-material-empty">没有额外材料需求，默认只消耗灵石。</div>'}
          </div>
          <div class="enhancement-preview-grid">
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">当前属性</div>
              ${currentLines.length > 0
                ? `<div class="enhancement-preview-lines">${currentLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">当前装备没有可显示的强化属性。</div>'}
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">目标等级预览</div>
              ${nextLines.length > 0
                ? `<div class="enhancement-preview-lines">${nextLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">下一阶暂无可显示属性。</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderHistory(
    activeJob: PlayerEnhancementJob | null,
    selected: SyncedEnhancementCandidateView | null,
    record: PlayerEnhancementRecord | null,
  ): string {
/** referenceItem：定义该变量以承载业务值。 */
    const referenceItem = activeJob?.item ?? selected?.item ?? null;
    if (!referenceItem) {
/** records：定义该变量以承载业务值。 */
      const records = this.getSortedLocalHistoryRecords();
/** totalAttempts：定义该变量以承载业务值。 */
      const totalAttempts = records.reduce((total, entry) => total + this.getHistoryAttemptCount(entry), 0);
/** highestLevel：定义该变量以承载业务值。 */
      const highestLevel = records.reduce((maxLevel, entry) => Math.max(maxLevel, normalizeEnhanceLevel(entry.highestLevel)), 0);
      return `
        <div class="enhancement-requirement-card enhancement-requirement-card--history">
          <div class="enhancement-history-head">
            <div>
              <div class="enhancement-section-title">强化记录</div>
              <div class="enhancement-protection-note">本地累计 ${formatDisplayInteger(records.length)} 件 · 历史最高 +${formatDisplayInteger(highestLevel)}</div>
            </div>
            <button class="small-btn ghost" type="button" data-enhancement-open-history="1">历史记录</button>
          </div>
          <div class="enhancement-empty-state enhancement-empty-state--history">
            ${records.length > 0
              ? `当前未选中强化目标。你仍然可以查看本地历史记录，累计强化 ${formatDisplayInteger(totalAttempts)} 次。`
              : '当前还没有本地强化记录。'}
          </div>
        </div>
      `;
    }
/** displayRecord：定义该变量以承载业务值。 */
    const displayRecord = this.getDisplayRecord(referenceItem.itemId, record);
/** roleEnhancementLevel：定义该变量以承载业务值。 */
    const roleEnhancementLevel = activeJob?.roleEnhancementLevel ?? Math.max(1, this.panelState?.enhancementSkillLevel ?? 1);
/** levelRecords：定义该变量以承载业务值。 */
    const levelRecords = new Map((displayRecord?.levels ?? []).map((entry) => [entry.targetLevel, entry] as const));
/** highestSeenLevel：定义该变量以承载业务值。 */
    const highestSeenLevel = Math.max(
      normalizeEnhanceLevel(displayRecord?.highestLevel),
      normalizeEnhanceLevel(referenceItem.enhanceLevel) + 2,
      8,
    );
/** rows：定义该变量以承载业务值。 */
    const rows: string[] = [];
    for (let level = 1; level <= highestSeenLevel; level += 1) {
      const current = levelRecords.get(level);
      rows.push(`
        <div class="enhancement-history-row">
          <span>+${formatDisplayInteger(level)}</span>
          <span>${formatPercent(computeEnhancementAdjustedSuccessRate(level, roleEnhancementLevel, referenceItem.level))}</span>
          <span>成 ${formatDisplayInteger(current?.successCount ?? 0)}</span>
          <span>败 ${formatDisplayInteger(current?.failureCount ?? 0)}</span>
        </div>
      `);
    }
    return `
      <div class="enhancement-requirement-card enhancement-requirement-card--history">
        <div class="enhancement-history-head">
          <div>
            <div class="enhancement-section-title">强化记录</div>
            <div class="enhancement-protection-note">历史最高：+${formatDisplayInteger(displayRecord?.highestLevel ?? 0)}</div>
          </div>
          <button class="small-btn ghost" type="button" data-enhancement-open-history="1">历史记录</button>
        </div>
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

/** countInventoryItem：执行对应的业务逻辑。 */
  private countInventoryItem(itemId: string): number {
    return this.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(body: HTMLElement): void {
    body.querySelector('[data-enhancement-refresh="1"]')?.addEventListener('click', () => {
      this.loading = true;
      this.render();
      this.callbacks?.onRequestPanel();
    });

    body.querySelectorAll<HTMLElement>('[data-enhancement-open-picker="1"]').forEach((button) => {
      button.addEventListener('click', () => {
        if (this.getActiveJob()) {
          return;
        }
        this.openPicker();
      });
    });

    body.querySelector('[data-enhancement-open-history="1"]')?.addEventListener('click', () => {
      this.openHistoryListModal();
    });

    body.querySelectorAll<HTMLInputElement>('input[name="enhancement-protection"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.selectedProtectionKey = input.value || null;
        this.selectedProtectionStartLevel = this.selectedProtectionKey
          ? 2
          : null;
        this.render();
      });
    });

    body.querySelectorAll<HTMLElement>('[data-enhancement-target-adjust]').forEach((button) => {
      button.addEventListener('click', () => {
/** selected：定义该变量以承载业务值。 */
        const selected = this.getSelectedCandidate();
        if (!selected) {
          return;
        }
/** delta：定义该变量以承载业务值。 */
        const delta = Math.floor(Number(button.dataset.enhancementTargetAdjust) || 0);
/** minLevel：定义该变量以承载业务值。 */
        const minLevel = selected.currentLevel + 1;
/** nextLevel：定义该变量以承载业务值。 */
        const nextLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, (this.getSelectedTargetLevel(selected) ?? minLevel) + delta));
        this.selectedTargetLevel = nextLevel;
        if (this.selectedProtectionKey) {
          this.selectedProtectionStartLevel = Math.min(
            nextLevel,
            this.getSelectedProtectionStartLevel(selected) ?? 2,
          );
        }
        this.render();
      });
    });

    body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input="1"]')?.addEventListener('change', (event) => {
/** selected：定义该变量以承载业务值。 */
      const selected = this.getSelectedCandidate();
/** input：定义该变量以承载业务值。 */
      const input = event.currentTarget;
      if (!selected || !(input instanceof HTMLInputElement)) {
        return;
      }
/** minLevel：定义该变量以承载业务值。 */
      const minLevel = selected.currentLevel + 1;
      this.selectedTargetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, Math.floor(Number(input.value) || minLevel)));
      if (this.selectedProtectionKey) {
        this.selectedProtectionStartLevel = Math.min(
          this.selectedTargetLevel,
          this.getSelectedProtectionStartLevel(selected) ?? 2,
        );
      }
      this.render();
    });

    body.querySelectorAll<HTMLElement>('[data-enhancement-protection-adjust]').forEach((button) => {
      button.addEventListener('click', () => {
/** selected：定义该变量以承载业务值。 */
        const selected = this.getSelectedCandidate();
        if (!selected || !this.selectedProtectionKey) {
          return;
        }
/** minLevel：定义该变量以承载业务值。 */
        const minLevel = 2;
/** maxLevel：定义该变量以承载业务值。 */
        const maxLevel = this.getSelectedTargetLevel(selected) ?? minLevel;
/** delta：定义该变量以承载业务值。 */
        const delta = Math.floor(Number(button.dataset.enhancementProtectionAdjust) || 0);
        this.selectedProtectionStartLevel = Math.max(
          minLevel,
          Math.min(maxLevel, (this.getSelectedProtectionStartLevel(selected) ?? minLevel) + delta),
        );
        this.render();
      });
    });

    body.querySelector<HTMLInputElement>('[data-enhancement-protection-start-input="1"]')?.addEventListener('change', (event) => {
/** selected：定义该变量以承载业务值。 */
      const selected = this.getSelectedCandidate();
/** input：定义该变量以承载业务值。 */
      const input = event.currentTarget;
      if (!selected || !(input instanceof HTMLInputElement) || !this.selectedProtectionKey) {
        return;
      }
/** minLevel：定义该变量以承载业务值。 */
      const minLevel = 2;
/** maxLevel：定义该变量以承载业务值。 */
      const maxLevel = this.getSelectedTargetLevel(selected) ?? minLevel;
      this.selectedProtectionStartLevel = Math.max(minLevel, Math.min(maxLevel, Math.floor(Number(input.value) || minLevel)));
      this.render();
    });

    body.querySelector('[data-enhancement-start="1"]')?.addEventListener('click', () => {
/** selected：定义该变量以承载业务值。 */
      const selected = this.getSelectedCandidate();
      if (!selected || this.getActiveJob()) {
        return;
      }
/** protection：定义该变量以承载业务值。 */
      const protection = this.getSelectedProtection(selected);
      this.callbacks?.onStartEnhancement({
        target: selected.ref,
        protection: protection?.ref ?? null,
        targetLevel: this.getSelectedTargetLevel(selected) ?? selected.nextLevel,
        protectionStartLevel: protection ? this.getSelectedProtectionStartLevel(selected) : null,
      });
    });

    body.querySelector('[data-enhancement-cancel="1"]')?.addEventListener('click', () => {
      if (!this.getActiveJob()) {
        return;
      }
      this.callbacks?.onCancelEnhancement();
    });
  }

/** ensureLocalHistoryLoaded：执行对应的业务逻辑。 */
  private ensureLocalHistoryLoaded(): void {
    if (this.localHistoryLoaded) {
      return;
    }
    this.localHistoryLoaded = true;
    if (typeof window === 'undefined') {
      return;
    }
    try {
/** raw：定义该变量以承载业务值。 */
      const raw = window.localStorage.getItem(ENHANCEMENT_HISTORY_STORAGE_KEY);
      if (!raw) {
/** legacyRaw：定义该变量以承载业务值。 */
        const legacyRaw = window.localStorage.getItem('mud:enhancement-history:v1');
        if (!legacyRaw) {
          return;
        }
/** parsedLegacy：定义该变量以承载业务值。 */
        const parsedLegacy = JSON.parse(legacyRaw) as Partial<StoredEnhancementHistoryStateV1>;
        this.localHistoryRecords = new Map(
          normalizeEnhancementRecordList(parsedLegacy.totals).map((entry) => [entry.itemId, entry] as const),
        );
        this.localHistorySessions = [];
        this.lastServerSessionRecord = parsedLegacy.sessionRecord ? cloneEnhancementRecord(parsedLegacy.sessionRecord) : null;
        this.persistLocalHistory();
        return;
      }
/** parsed：定义该变量以承载业务值。 */
      const parsed = JSON.parse(raw) as Partial<StoredEnhancementHistoryState>;
      this.localHistoryRecords = new Map(
        normalizeEnhancementRecordList(parsed.totals).map((entry) => [entry.itemId, entry] as const),
      );
      this.localHistorySessions = normalizeEnhancementRecordList(parsed.sessions)
        .filter((entry) => isEnhancementHistorySessionRecord(entry))
        .sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0));
      this.lastServerSessionRecord = parsed.sessionRecord ? cloneEnhancementRecord(parsed.sessionRecord) : null;
    } catch {
      this.localHistoryRecords = new Map();
      this.localHistorySessions = [];
      this.lastServerSessionRecord = null;
    }
  }

/** persistLocalHistory：执行对应的业务逻辑。 */
  private persistLocalHistory(): void {
    if (typeof window === 'undefined') {
      return;
    }
/** payload：定义该变量以承载业务值。 */
    const payload: StoredEnhancementHistoryState = {
      version: 2,
      totals: [...this.localHistoryRecords.values()]
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
      sessions: this.localHistorySessions
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => (
          (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0)
          || right.itemId.localeCompare(left.itemId, 'zh-Hans-CN')
        )),
      sessionRecord: this.lastServerSessionRecord ? cloneEnhancementRecord(this.lastServerSessionRecord) : null,
    };
    try {
      window.localStorage.setItem(ENHANCEMENT_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

/** mergeServerSessionRecord：执行对应的业务逻辑。 */
  private mergeServerSessionRecord(records: PlayerEnhancementRecord[]): void {
/** serverRecord：定义该变量以承载业务值。 */
    const serverRecord = normalizeEnhancementRecordList(records)[0] ?? null;
    if (!serverRecord) {
      this.lastServerSessionRecord = null;
      this.persistLocalHistory();
      return;
    }
/** previousSession：定义该变量以承载业务值。 */
    const previousSession = this.lastServerSessionRecord;
/** continuousSession：定义该变量以承载业务值。 */
    const continuousSession = Boolean(
      previousSession
      && getEnhancementHistorySessionKey(previousSession) === getEnhancementHistorySessionKey(serverRecord)
      && this.isNonDecreasingSessionSnapshot(previousSession, serverRecord),
    );
/** deltaRecord：定义该变量以承载业务值。 */
    const deltaRecord = continuousSession && previousSession
      ? this.computeSessionDelta(previousSession, serverRecord)
      : serverRecord;
    this.upsertLocalHistorySession(serverRecord);
    if (deltaRecord.highestLevel > 0 || deltaRecord.levels.length > 0) {
/** persisted：定义该变量以承载业务值。 */
      const persisted = this.localHistoryRecords.get(serverRecord.itemId) ?? {
        itemId: serverRecord.itemId,
        highestLevel: 0,
        levels: [],
      };
      this.applyDeltaRecord(persisted, deltaRecord, serverRecord.highestLevel);
      this.localHistoryRecords.set(serverRecord.itemId, cloneEnhancementRecord(persisted));
    }
    this.lastServerSessionRecord = cloneEnhancementRecord(serverRecord);
    this.persistLocalHistory();
  }

  private isNonDecreasingSessionSnapshot(
    previous: PlayerEnhancementRecord,
    current: PlayerEnhancementRecord,
  ): boolean {
    if (normalizeEnhanceLevel(current.highestLevel) < normalizeEnhanceLevel(previous.highestLevel)) {
      return false;
    }
/** currentLevels：定义该变量以承载业务值。 */
    const currentLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      current.levels.map((entry) => [entry.targetLevel, entry]),
    );
    return previous.levels.every((entry) => {
/** next：定义该变量以承载业务值。 */
      const next = currentLevels.get(entry.targetLevel);
      if (!next) {
        return false;
      }
      return next.successCount >= entry.successCount
        && next.failureCount >= entry.failureCount;
    });
  }

  private computeSessionDelta(
    previous: PlayerEnhancementRecord,
    current: PlayerEnhancementRecord,
  ): PlayerEnhancementRecord {
/** previousLevels：定义该变量以承载业务值。 */
    const previousLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      previous.levels.map((entry) => [entry.targetLevel, entry]),
    );
    return {
      itemId: current.itemId,
      highestLevel: Math.max(0, normalizeEnhanceLevel(current.highestLevel) - normalizeEnhanceLevel(previous.highestLevel)),
      levels: current.levels
        .map((entry) => {
/** last：定义该变量以承载业务值。 */
          const last = previousLevels.get(entry.targetLevel);
          return {
            targetLevel: entry.targetLevel,
            successCount: Math.max(0, entry.successCount - (last?.successCount ?? 0)),
            failureCount: Math.max(0, entry.failureCount - (last?.failureCount ?? 0)),
          };
        })
        .filter((entry) => entry.successCount > 0 || entry.failureCount > 0),
      actionStartedAt: current.actionStartedAt,
      actionEndedAt: current.actionEndedAt,
      startLevel: current.startLevel,
      initialTargetLevel: current.initialTargetLevel,
      desiredTargetLevel: current.desiredTargetLevel,
      protectionStartLevel: current.protectionStartLevel,
      status: current.status,
    };
  }

  private applyDeltaRecord(
    target: PlayerEnhancementRecord,
    delta: PlayerEnhancementRecord,
    latestHighestLevel: number,
  ): void {
    target.highestLevel = Math.max(
      normalizeEnhanceLevel(target.highestLevel),
      normalizeEnhanceLevel(latestHighestLevel),
    );
/** levelMap：定义该变量以承载业务值。 */
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      target.levels.map((entry) => [entry.targetLevel, { ...entry }]),
    );
    for (const entry of delta.levels) {
      const current = levelMap.get(entry.targetLevel) ?? {
        targetLevel: entry.targetLevel,
        successCount: 0,
        failureCount: 0,
      };
      current.successCount += Math.max(0, entry.successCount);
      current.failureCount += Math.max(0, entry.failureCount);
      levelMap.set(entry.targetLevel, current);
    }
    target.levels = [...levelMap.values()].sort((left, right) => left.targetLevel - right.targetLevel);
  }

  private upsertLocalHistorySession(record: PlayerEnhancementRecord): void {
    if (!isEnhancementHistorySessionRecord(record)) {
      return;
    }
/** next：定义该变量以承载业务值。 */
    const next = cloneEnhancementRecord(record);
/** sessionKey：定义该变量以承载业务值。 */
    const sessionKey = getEnhancementHistorySessionKey(next);
/** currentIndex：定义该变量以承载业务值。 */
    const currentIndex = this.localHistorySessions.findIndex((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (currentIndex >= 0) {
      this.localHistorySessions[currentIndex] = next;
    } else {
      this.localHistorySessions.push(next);
    }
    this.localHistorySessions.sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0));
  }

/** getDisplayRecord：执行对应的业务逻辑。 */
  private getDisplayRecord(itemId: string, serverRecord: PlayerEnhancementRecord | null): PlayerEnhancementRecord | null {
/** localRecord：定义该变量以承载业务值。 */
    const localRecord = this.localHistoryRecords.get(itemId);
    if (!localRecord && !serverRecord) {
      return null;
    }
    if (!localRecord) {
      return serverRecord ? cloneEnhancementRecord(serverRecord) : null;
    }
    if (!serverRecord) {
      return cloneEnhancementRecord(localRecord);
    }
/** merged：定义该变量以承载业务值。 */
    const merged = cloneEnhancementRecord(localRecord);
    merged.highestLevel = Math.max(merged.highestLevel, normalizeEnhanceLevel(serverRecord.highestLevel));
/** levelMap：定义该变量以承载业务值。 */
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      merged.levels.map((entry) => [entry.targetLevel, { ...entry }]),
    );
    for (const entry of serverRecord.levels) {
      const current = levelMap.get(entry.targetLevel) ?? {
        targetLevel: entry.targetLevel,
        successCount: 0,
        failureCount: 0,
      };
      current.successCount = Math.max(current.successCount, entry.successCount);
      current.failureCount = Math.max(current.failureCount, entry.failureCount);
      levelMap.set(entry.targetLevel, current);
    }
    merged.levels = [...levelMap.values()].sort((left, right) => left.targetLevel - right.targetLevel);
    return merged;
  }

/** getSortedLocalHistoryRecords：执行对应的业务逻辑。 */
  private getSortedLocalHistoryRecords(): PlayerEnhancementRecord[] {
/** recordsByItem：定义该变量以承载业务值。 */
    const recordsByItem = new Map<string, PlayerEnhancementRecord>(
      [...this.localHistoryRecords.values()].map((entry) => [entry.itemId, cloneEnhancementRecord(entry)] as const),
    );
    for (const session of this.localHistorySessions) {
/** current：定义该变量以承载业务值。 */
      const current = recordsByItem.get(session.itemId) ?? {
        itemId: session.itemId,
        highestLevel: 0,
        levels: [],
      };
      current.highestLevel = Math.max(
        normalizeEnhanceLevel(current.highestLevel),
        normalizeEnhanceLevel(session.highestLevel),
        normalizeEnhanceLevel(session.startLevel),
      );
      if (!this.localHistoryRecords.has(session.itemId) && session.levels.length > 0) {
        this.applyDeltaRecord(current, session, session.highestLevel);
      }
      recordsByItem.set(session.itemId, current);
    }
    return [...recordsByItem.values()]
      .sort((left, right) => {
/** highestDelta：定义该变量以承载业务值。 */
        const highestDelta = normalizeEnhanceLevel(right.highestLevel) - normalizeEnhanceLevel(left.highestLevel);
        if (highestDelta !== 0) {
          return highestDelta;
        }
/** attemptsDelta：定义该变量以承载业务值。 */
        const attemptsDelta = this.getHistoryAttemptCount(right) - this.getHistoryAttemptCount(left);
        if (attemptsDelta !== 0) {
          return attemptsDelta;
        }
        return this.getHistoryItemName(left.itemId).localeCompare(this.getHistoryItemName(right.itemId), 'zh-Hans-CN');
      });
  }

/** getHistoryItemName：执行对应的业务逻辑。 */
  private getHistoryItemName(itemId: string): string {
    return getLocalItemTemplate(itemId)?.name ?? itemId;
  }

/** getHistoryItemLevel：执行对应的业务逻辑。 */
  private getHistoryItemLevel(itemId: string): number {
    return Math.max(1, Math.floor(Number(getLocalItemTemplate(itemId)?.level) || 1));
  }

/** getHistoryAttemptCount：执行对应的业务逻辑。 */
  private getHistoryAttemptCount(record: PlayerEnhancementRecord): number {
    return (record.levels ?? []).reduce(
      (total, entry) => total + Math.max(0, entry.successCount) + Math.max(0, entry.failureCount),
      0,
    );
  }

  private getHistorySessionsByItem(itemId: string): PlayerEnhancementRecord[] {
    return this.localHistorySessions
      .filter((entry) => entry.itemId === itemId)
      .map((entry) => cloneEnhancementRecord(entry))
      .sort((left, right) => (
        (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0)
        || (right.actionEndedAt ?? 0) - (left.actionEndedAt ?? 0)
      ));
  }

  private getHistorySessionStatusLabel(record: PlayerEnhancementRecord): string {
    switch (record.status) {
      case 'completed':
        return '已完成';
      case 'cancelled':
        return '已取消';
      case 'stopped':
        return '已停止';
      case 'in_progress':
        return '进行中';
      default:
        return '状态未知';
    }
  }

  private getHistorySessionTargetSummary(record: PlayerEnhancementRecord): string {
/** startLevel：定义该变量以承载业务值。 */
    const startLevel = normalizeEnhanceLevel(record.startLevel);
/** initialTargetLevel：定义该变量以承载业务值。 */
    const initialTargetLevel = Math.max(startLevel + 1, Math.floor(Number(record.initialTargetLevel) || (startLevel + 1)));
/** desiredTargetLevel：定义该变量以承载业务值。 */
    const desiredTargetLevel = Math.max(initialTargetLevel, Math.floor(Number(record.desiredTargetLevel) || initialTargetLevel));
    return `开始 +${formatDisplayInteger(startLevel)} · 首冲 +${formatDisplayInteger(initialTargetLevel)} · 目标 +${formatDisplayInteger(desiredTargetLevel)}`;
  }

  private refreshOpenHistoryModal(): void {
    if (confirmModalHost.isOpenFor(EnhancementModal.HISTORY_DETAIL_OWNER)) {
      if (this.activeHistoryItemId && this.activeHistorySessionKey) {
        this.openHistoryDetailModal(this.activeHistoryItemId, this.activeHistorySessionKey);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(EnhancementModal.HISTORY_SESSION_OWNER)) {
      if (this.activeHistoryItemId) {
        this.openHistorySessionModal(this.activeHistoryItemId);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(EnhancementModal.HISTORY_LIST_OWNER)) {
      this.openHistoryListModal();
    }
  }

/** openHistoryListModal：执行对应的业务逻辑。 */
  private openHistoryListModal(): void {
    this.ensureLocalHistoryLoaded();
    this.activeHistoryItemId = null;
    this.activeHistorySessionKey = null;
/** records：定义该变量以承载业务值。 */
    const records = this.getSortedLocalHistoryRecords();
    confirmModalHost.open({
      ownerId: EnhancementModal.HISTORY_LIST_OWNER,
      title: '强化历史记录',
      subtitle: '以下为当前设备上的本地累计记录，点击物品后可查看每次开始强化的行动列表',
      confirmLabel: '关闭',
      cancelLabel: '返回',
      bodyHtml: records.length > 0
        ? `
          <div class="enhancement-history-list-modal">
            ${records.map((record) => {
/** itemName：定义该变量以承载业务值。 */
              const itemName = this.getHistoryItemName(record.itemId);
/** itemLevel：定义该变量以承载业务值。 */
              const itemLevel = this.getHistoryItemLevel(record.itemId);
/** attemptCount：定义该变量以承载业务值。 */
              const attemptCount = this.getHistoryAttemptCount(record);
              return `
                <button
                  class="enhancement-history-entry"
                  type="button"
                  data-enhancement-history-item="${escapeHtml(record.itemId)}"
                >
                  <span class="enhancement-history-entry-title">${escapeHtml(itemName)}</span>
                  <span class="enhancement-history-entry-meta">等级 ${formatDisplayInteger(itemLevel)} · 历史最高 +${formatDisplayInteger(record.highestLevel)} · 累计 ${formatDisplayInteger(attemptCount)} 次</span>
                </button>
              `;
            }).join('')}
          </div>
        `
        : '<div class="enhancement-empty-state enhancement-empty-state--picker">当前还没有本地强化记录。</div>',
    });

/** modalBody：定义该变量以承载业务值。 */
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    if (!modalBody) {
      return;
    }
    modalBody.querySelectorAll<HTMLElement>('[data-enhancement-history-item]').forEach((button) => {
      button.addEventListener('click', () => {
/** itemId：定义该变量以承载业务值。 */
        const itemId = button.dataset.enhancementHistoryItem ?? '';
        if (!itemId) {
          return;
        }
        this.openHistorySessionModal(itemId);
      });
    });
  }

  private openHistorySessionModal(itemId: string): void {
    this.ensureLocalHistoryLoaded();
    this.activeHistoryItemId = itemId;
    this.activeHistorySessionKey = null;
/** itemName：定义该变量以承载业务值。 */
    const itemName = this.getHistoryItemName(itemId);
/** sessions：定义该变量以承载业务值。 */
    const sessions = this.getHistorySessionsByItem(itemId);
    confirmModalHost.open({
      ownerId: EnhancementModal.HISTORY_SESSION_OWNER,
      title: '强化行动记录',
      subtitle: `${itemName} · 按每次开始强化分组`,
      confirmLabel: '关闭',
      cancelLabel: '返回',
      onClose: () => {
        this.openHistoryListModal();
      },
      bodyHtml: sessions.length > 0
        ? `
          <div class="enhancement-history-list-modal enhancement-history-list-modal--sessions">
            ${sessions.map((record) => {
/** startedAtLabel：定义该变量以承载业务值。 */
              const startedAtLabel = formatHistoryDateTime(record.actionStartedAt);
/** endedAtLabel：定义该变量以承载业务值。 */
              const endedAtLabel = record.actionEndedAt ? `结束于 ${formatHistoryDateTime(record.actionEndedAt)}` : '尚未结束';
/** attemptCount：定义该变量以承载业务值。 */
              const attemptCount = this.getHistoryAttemptCount(record);
/** sessionKey：定义该变量以承载业务值。 */
              const sessionKey = getEnhancementHistorySessionKey(record);
              return `
                <button
                  class="enhancement-history-entry"
                  type="button"
                  data-enhancement-history-session="${escapeHtml(sessionKey)}"
                >
                  <span class="enhancement-history-entry-title">开始于 ${escapeHtml(startedAtLabel)}</span>
                  <span class="enhancement-history-entry-meta">${escapeHtml(this.getHistorySessionTargetSummary(record))}</span>
                  <span class="enhancement-history-entry-meta enhancement-history-entry-meta--secondary">历史最高 +${formatDisplayInteger(record.highestLevel)} · 累计 ${formatDisplayInteger(attemptCount)} 次 · ${escapeHtml(this.getHistorySessionStatusLabel(record))} · ${escapeHtml(endedAtLabel)}</span>
                </button>
              `;
            }).join('')}
          </div>
        `
        : '<div class="enhancement-empty-state enhancement-empty-state--picker">该物品的旧版历史只有累计汇总，无法拆回过去每次开始强化；后续新记录会按行动分别列出。</div>',
    });

/** modalBody：定义该变量以承载业务值。 */
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    if (!modalBody) {
      return;
    }
    modalBody.querySelectorAll<HTMLElement>('[data-enhancement-history-session]').forEach((button) => {
      button.addEventListener('click', () => {
/** sessionKey：定义该变量以承载业务值。 */
        const sessionKey = button.dataset.enhancementHistorySession ?? '';
        if (!sessionKey) {
          return;
        }
        this.openHistoryDetailModal(itemId, sessionKey);
      });
    });
  }

/** openHistoryDetailModal：执行对应的业务逻辑。 */
  private openHistoryDetailModal(itemId: string, sessionKey: string): void {
    this.ensureLocalHistoryLoaded();
    this.activeHistoryItemId = itemId;
    this.activeHistorySessionKey = sessionKey;
/** record：定义该变量以承载业务值。 */
    const record = this.getHistorySessionsByItem(itemId).find((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (!record) {
      return;
    }
/** detailRecord：定义该变量以承载业务值。 */
    const detailRecord = cloneEnhancementRecord(record);
/** itemName：定义该变量以承载业务值。 */
    const itemName = this.getHistoryItemName(itemId);
/** itemLevel：定义该变量以承载业务值。 */
    const itemLevel = this.getHistoryItemLevel(itemId);
/** levelMap：定义该变量以承载业务值。 */
    const levelMap = new Map(detailRecord.levels.map((entry) => [entry.targetLevel, entry] as const));
/** highestSeenLevel：定义该变量以承载业务值。 */
    const highestSeenLevel = Math.max(
      normalizeEnhanceLevel(detailRecord.highestLevel),
      normalizeEnhanceLevel(detailRecord.desiredTargetLevel),
      8,
    );
/** roleEnhancementLevel：定义该变量以承载业务值。 */
    const roleEnhancementLevel = Math.max(1, this.panelState?.enhancementSkillLevel ?? 1);
/** rows：定义该变量以承载业务值。 */
    const rows: string[] = [];
    for (let level = 1; level <= highestSeenLevel; level += 1) {
      const current = levelMap.get(level);
      rows.push(`
        <div class="enhancement-history-row">
          <span>+${formatDisplayInteger(level)}</span>
          <span>${formatPercent(computeEnhancementAdjustedSuccessRate(level, roleEnhancementLevel, itemLevel))}</span>
          <span>成 ${formatDisplayInteger(current?.successCount ?? 0)}</span>
          <span>败 ${formatDisplayInteger(current?.failureCount ?? 0)}</span>
        </div>
      `);
    }
/** endedAtText：定义该变量以承载业务值。 */
    const endedAtText = detailRecord.actionEndedAt
      ? `结束于 ${formatHistoryDateTime(detailRecord.actionEndedAt)}`
      : '尚未结束';
/** protectionText：定义该变量以承载业务值。 */
    const protectionText = typeof detailRecord.protectionStartLevel === 'number'
      ? `保护从 +${formatDisplayInteger(detailRecord.protectionStartLevel)} 生效`
      : '未启用保护';
    confirmModalHost.open({
      ownerId: EnhancementModal.HISTORY_DETAIL_OWNER,
      title: '强化记录详情',
      subtitle: `${itemName} · 开始于 ${formatHistoryDateTime(detailRecord.actionStartedAt)}`,
      confirmLabel: '关闭',
      cancelLabel: '返回',
      onClose: () => {
        this.openHistorySessionModal(itemId);
      },
      bodyHtml: `
        <div class="enhancement-history-detail">
          <div class="enhancement-history-detail-note">${escapeHtml(this.getHistorySessionTargetSummary(detailRecord))} · 历史最高 +${formatDisplayInteger(detailRecord.highestLevel)} · ${escapeHtml(this.getHistorySessionStatusLabel(detailRecord))} · ${escapeHtml(endedAtText)} · ${escapeHtml(protectionText)}</div>
          <div class="enhancement-history-detail-note">以下成功率按当前角色强化等级 Lv.${formatDisplayInteger(roleEnhancementLevel)} 计算，仅用于展示该次行动内各目标等级的参考概率。</div>
          <div class="enhancement-history-table enhancement-history-table--modal">
            <div class="enhancement-history-row enhancement-history-row--head">
              <span>目标</span>
              <span>成功率</span>
              <span>成功</span>
              <span>失败</span>
            </div>
            ${rows.join('')}
          </div>
        </div>
      `,
    });
  }

/** openPicker：执行对应的业务逻辑。 */
  private openPicker(): void {
/** candidates：定义该变量以承载业务值。 */
    const candidates = this.panelState?.candidates ?? [];
    confirmModalHost.open({
      ownerId: EnhancementModal.PICKER_OWNER,
      title: '选择强化装备',
      subtitle: '点击下方任意装备后会立即回填到强化目标槽',
      confirmLabel: '关闭',
      cancelLabel: '返回',
      bodyHtml: candidates.length > 0
        ? `
          <div class="enhancement-picker-grid inventory-grid">
            ${candidates.map((entry) => {
/** key：定义该变量以承载业务值。 */
              const key = formatRefKey(entry.ref);
/** itemMeta：定义该变量以承载业务值。 */
              const itemMeta = getItemDisplayMeta(entry.item);
/** sourceLabel：定义该变量以承载业务值。 */
              const sourceLabel = entry.ref.source === 'equipment'
                ? `已装备 · ${getEquipSlotLabel(entry.ref.slot ?? 'weapon')}`
                : `背包槽位 ${formatDisplayInteger((entry.ref.slotIndex ?? 0) + 1)}`;
/** nameClass：定义该变量以承载业务值。 */
              const nameClass = getItemNameClass(entry.item.name);
              return `
                <button
                  class="${getItemDecorClassName(`inventory-cell enhancement-picker-cell${this.selectedTargetKey === key ? ' active' : ''}`, entry.item)}"
                  type="button"
                  data-enhancement-picker-target="${escapeHtml(key)}"
                >
                  <div class="inventory-cell-head">
                    <span class="inventory-cell-type">${escapeHtml(getItemAffixTypeLabel(itemMeta.displayItem, getItemTypeLabel(itemMeta.displayItem.type)))}</span>
                    <span class="inventory-cell-count">x${formatDisplayInteger(entry.item.count)}</span>
                  </div>
                  <div class="inventory-cell-name ${nameClass}" title="${escapeHtml(entry.item.name)}">${escapeHtml(entry.item.name)}</div>
                  <div class="enhancement-picker-cell-meta">
                    <span>${escapeHtml(sourceLabel)}</span>
                    <span>+${formatDisplayInteger(entry.currentLevel)} → +${formatDisplayInteger(entry.nextLevel)} · ${formatDisplayInteger(entry.durationTicks)} 息</span>
                  </div>
                  ${itemMeta.affinityBadge ? `<span class="item-card-chip item-card-chip--affinity item-card-chip--${itemMeta.affinityBadge.tone} item-card-chip--element-${itemMeta.affinityBadge.element}" title="${escapeHtml(itemMeta.affinityBadge.title)}">${escapeHtml(itemMeta.affinityBadge.label)}</span>` : ''}
                  ${itemMeta.levelLabel ? `<span class="item-card-chip item-card-chip--level">${escapeHtml(itemMeta.levelLabel)}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        `
        : '<div class="enhancement-empty-state enhancement-empty-state--picker">当前没有可强化的装备。</div>',
    });

/** modalBody：定义该变量以承载业务值。 */
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    if (!modalBody) {
      return;
    }
    modalBody.querySelectorAll<HTMLElement>('[data-enhancement-picker-target]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedTargetKey = button.dataset.enhancementPickerTarget ?? null;
/** selected：定义该变量以承载业务值。 */
        const selected = this.getSelectedCandidate();
        this.selectedTargetLevel = selected ? selected.currentLevel + 1 : null;
        this.selectedProtectionKey = null;
        this.selectedProtectionStartLevel = null;
        this.ensureSelection();
        confirmModalHost.close(EnhancementModal.PICKER_OWNER);
        this.render();
      });
    });
  }
}
