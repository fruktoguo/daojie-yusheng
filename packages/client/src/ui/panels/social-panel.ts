/**
 * 本文件是客户端 DOM UI 的道友面板和宝库弹层模块。
 *
 * UI 只负责展示服务端视图和提交意图，权限、距离、资产转移均由服务端裁定。
 */
import type {
  DaoistDirectMessageView,
  DaoistRelationLevel,
  ItemStack,
  SocialPanelView,
  SyncedItemStack,
  TreasureVaultDetailView,
  TreasureVaultPermissionKind,
  TreasureVaultPermissionMap,
  TreasureVaultPermissionScope,
  TreasureVaultOperationResultView,
} from '@mud/shared';
import { getItemStackDisplayLabel } from '@mud/shared';
import { getItemTypeLabel } from '../../domain-labels';
import { getItemDecorClassName, getItemDisplayMeta, type ItemDisplayMeta } from '../item-display';
import { formatDisplayCountBadge } from '../../utils/number';
import { detailModalHost } from '../detail-modal-host';
import { describeEquipmentBonuses, describeItemEffectDetails, describeMaterialValueDetails } from '../equipment-tooltip';
import { resolvePreviewItem } from '../../content/local-templates';
import { describePreviewBonuses } from '../stat-preview';

type SocialPanelCallbacks = {
  onRefresh(): void;
  onScanNearby(): void;
  onSendRequest(targetPlayerId: string): void;
  onRespondRequest(requestId: string, accept: boolean): void;
  onUpdateRelationLevel(targetPlayerId: string, level: DaoistRelationLevel): void;
  onRemoveRelation(targetPlayerId: string): void;
  onSendMessage(targetPlayerId: string, message: string): void;
};

type TreasureVaultCallbacks = {
  onDeposit(itemInstanceId: string, count: number): void;
  onWithdraw(storageItemId: string, count: number): void;
  onUpdatePermissions(permissions: TreasureVaultPermissionMap): void;
};

type InventoryCellRibbon = {
  label: string;
  title?: string;
};

export type TreasureVaultModalTab = 'items' | 'permissions';

const RELATION_LABEL: Record<DaoistRelationLevel, string> = {
  dao_friend: '道友',
  close_friend: '至交',
};

const PERMISSION_KIND_LABEL: Record<TreasureVaultPermissionKind, string> = {
  view: '可看',
  deposit: '可存',
  withdraw: '可拿',
};

const PERMISSION_SCOPE_LABEL: Record<TreasureVaultPermissionScope, string> = {
  all: '所有人',
  party: '队友',
  sect: '同门',
  dao_friend: '道友',
  close_friend: '至交',
};

const PERMISSION_KINDS: TreasureVaultPermissionKind[] = ['view', 'deposit', 'withdraw'];
const PERMISSION_SCOPES: TreasureVaultPermissionScope[] = ['all', 'party', 'sect', 'dao_friend', 'close_friend'];

export class SocialPanel {
  private readonly pane = document.getElementById('pane-social')!;
  private callbacks: SocialPanelCallbacks | null = null;
  private view: SocialPanelView = { relations: [], incomingRequests: [], outgoingRequests: [], nearbyCandidates: [] };
  private selectedPlayerId: string | null = null;
  private messagesByPlayerId = new Map<string, DaoistDirectMessageView[]>();

  constructor() {
    this.bindEvents();
    this.render();
  }

  setCallbacks(callbacks: SocialPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  update(view: SocialPanelView): void {
    this.view = normalizeSocialPanelView(view);
    if (this.selectedPlayerId && !this.view.relations.some((entry) => entry.playerId === this.selectedPlayerId)) {
      this.selectedPlayerId = null;
    }
    this.render();
  }

  appendMessage(message: DaoistDirectMessageView, currentPlayerId: string | null): void {
    const peerId = message.fromPlayerId === currentPlayerId ? message.toPlayerId : message.fromPlayerId;
    const list = this.messagesByPlayerId.get(peerId) ?? [];
    list.push(message);
    this.messagesByPlayerId.set(peerId, list.slice(-50));
    this.selectedPlayerId = peerId;
    this.render();
  }

  clear(): void {
    this.view = { relations: [], incomingRequests: [], outgoingRequests: [], nearbyCandidates: [] };
    this.selectedPlayerId = null;
    this.messagesByPlayerId.clear();
    this.render();
  }

  private bindEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-social-action]') : null;
      if (!target || !this.callbacks) {
        return;
      }
      const action = target.dataset.socialAction;
      const playerId = target.dataset.playerId ?? '';
      const requestId = target.dataset.requestId ?? '';
      if (action === 'refresh') this.callbacks.onRefresh();
      if (action === 'scan') this.callbacks.onScanNearby();
      if (action === 'request' && playerId) this.callbacks.onSendRequest(playerId);
      if (action === 'accept' && requestId) this.callbacks.onRespondRequest(requestId, true);
      if (action === 'reject' && requestId) this.callbacks.onRespondRequest(requestId, false);
      if (action === 'select' && playerId) {
        this.selectedPlayerId = playerId;
        this.render();
      }
      if (action === 'dao_friend' && playerId) this.callbacks.onUpdateRelationLevel(playerId, 'dao_friend');
      if (action === 'close_friend' && playerId) this.callbacks.onUpdateRelationLevel(playerId, 'close_friend');
      if (action === 'remove' && playerId) this.callbacks.onRemoveRelation(playerId);
      if (action === 'send' && playerId) {
        const input = this.pane.querySelector<HTMLInputElement>('[data-social-message-input]');
        const message = input?.value.trim() ?? '';
        if (message) {
          this.callbacks.onSendMessage(playerId, message);
          if (input) input.value = '';
        }
      }
    });
  }

  private render(): void {
    const selected = this.selectedPlayerId
      ? this.view.relations.find((entry) => entry.playerId === this.selectedPlayerId) ?? null
      : this.view.relations[0] ?? null;
    if (!this.selectedPlayerId && selected) {
      this.selectedPlayerId = selected.playerId;
    }
    this.pane.innerHTML = `
      <div class="panel-section social-panel">
        <div class="panel-section-header">
          <div class="panel-section-title">道友</div>
          <div class="inline-actions">
            <button class="small-btn" type="button" data-social-action="refresh">刷新</button>
            <button class="small-btn" type="button" data-social-action="scan">附近</button>
          </div>
        </div>
        ${this.renderRequests()}
        ${this.renderNearby()}
        ${this.renderRelations(selected?.playerId ?? null)}
        ${this.renderMessages(selected)}
      </div>
    `;
  }

  private renderRequests(): string {
    const incoming = this.view.incomingRequests;
    const outgoing = this.view.outgoingRequests;
    if (incoming.length === 0 && outgoing.length === 0) {
      return `<div class="empty-hint">暂无道友申请</div>`;
    }
    return `
      <div class="ui-list">
        ${incoming.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(entry.fromName)}</div>
              <div class="ui-list-subtitle">申请结为道友</div>
            </div>
            <button class="small-btn" type="button" data-social-action="accept" data-request-id="${escapeHtml(entry.requestId)}">同意</button>
            <button class="small-btn ghost" type="button" data-social-action="reject" data-request-id="${escapeHtml(entry.requestId)}">拒绝</button>
          </div>
        `).join('')}
        ${outgoing.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(entry.toName)}</div>
              <div class="ui-list-subtitle">申请等待回应</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderNearby(): string {
    if (this.view.nearbyCandidates.length === 0) {
      return `<div class="empty-hint">附近暂无可申请玩家</div>`;
    }
    return `
      <div class="ui-list">
        ${this.view.nearbyCandidates.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(entry.name)}</div>
              <div class="ui-list-subtitle">距离 ${entry.distance}${entry.relationLevel ? ` · ${RELATION_LABEL[entry.relationLevel]}` : entry.pendingRequest ? ' · 已有申请' : ''}</div>
            </div>
            ${entry.relationLevel || entry.pendingRequest ? '' : `<button class="small-btn" type="button" data-social-action="request" data-player-id="${escapeHtml(entry.playerId)}">申请</button>`}
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderRelations(selectedPlayerId: string | null): string {
    if (this.view.relations.length === 0) {
      return `<div class="empty-hint">暂无道友</div>`;
    }
    return `
      <div class="ui-list">
        ${this.view.relations.map((entry) => `
          <div class="ui-list-row ${entry.playerId === selectedPlayerId ? 'active' : ''}">
            <button class="ui-list-main text-left" type="button" data-social-action="select" data-player-id="${escapeHtml(entry.playerId)}">
              <div class="ui-list-title">${escapeHtml(entry.name)} · ${RELATION_LABEL[entry.level]}</div>
              <div class="ui-list-subtitle">${entry.online ? '在线' : '离线'}${entry.instanceId ? ` · ${escapeHtml(entry.instanceId)}` : ''}</div>
            </button>
            <button class="small-btn ghost" type="button" data-social-action="${entry.level === 'close_friend' ? 'dao_friend' : 'close_friend'}" data-player-id="${escapeHtml(entry.playerId)}">${entry.level === 'close_friend' ? '降为道友' : '设为至交'}</button>
            <button class="small-btn ghost" type="button" data-social-action="remove" data-player-id="${escapeHtml(entry.playerId)}">解除</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderMessages(selected: { playerId: string; name: string } | null): string {
    if (!selected) {
      return '';
    }
    const messages = this.messagesByPlayerId.get(selected.playerId) ?? [];
    return `
      <div class="ui-list social-message-list">
        <div class="ui-list-title">私聊 · ${escapeHtml(selected.name)}</div>
        ${messages.length === 0 ? '<div class="empty-hint">暂无消息</div>' : messages.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(entry.fromName)}</div>
              <div class="ui-list-subtitle">${escapeHtml(entry.text)}</div>
            </div>
          </div>
        `).join('')}
        <div class="ui-input-row">
          <input class="ui-input" data-social-message-input type="text" maxlength="200" placeholder="发送消息">
          <button class="small-btn" type="button" data-social-action="send" data-player-id="${escapeHtml(selected.playerId)}">发送</button>
        </div>
      </div>
    `;
  }
}

export class TreasureVaultModal {
  private static readonly ITEM_DETAIL_MODAL_OWNER = 'treasure-vault-item-detail';
  private readonly root: HTMLDivElement;
  private callbacks: TreasureVaultCallbacks | null = null;
  private detail: TreasureVaultDetailView | null = null;
  private inventoryItems: SyncedItemStack[] = [];
  private currentPlayerId: string | null = null;
  private activeTab: TreasureVaultModalTab = 'items';
  private preferredTab: TreasureVaultModalTab = 'items';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'ui-modal-layer treasure-vault-modal-layer hidden';
    document.body.appendChild(this.root);
    this.bindEvents();
  }

  setCallbacks(callbacks: TreasureVaultCallbacks): void {
    this.callbacks = callbacks;
  }

  setCurrentPlayer(playerId: string | null, inventoryItems: SyncedItemStack[]): void {
    this.currentPlayerId = playerId;
    this.inventoryItems = inventoryItems;
    if (this.detail) this.render();
  }

  setPreferredTab(tab: TreasureVaultModalTab): void {
    this.preferredTab = tab;
    this.activeTab = tab;
  }

  showDetail(detail: TreasureVaultDetailView): void {
    this.detail = detail;
    this.activeTab = this.resolveVisibleTab(this.preferredTab, detail);
    this.root.classList.remove('hidden');
    this.render();
  }

  handleOperationResult(result: TreasureVaultOperationResultView): void {
    if (result.detail) {
      this.showDetail(result.detail);
    }
  }

  clear(): void {
    this.detail = null;
    this.activeTab = 'items';
    this.preferredTab = 'items';
    detailModalHost.close(TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER);
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-vault-action]') : null;
      if (!target) {
        return;
      }
      const action = target.dataset.vaultAction;
      if (action === 'close') {
        this.clear();
        return;
      }
      if (!this.callbacks || !this.detail) {
        return;
      }
      if (action === 'tab') {
        const tab = target.dataset.vaultTab as TreasureVaultModalTab | undefined;
        if (tab === 'items' || tab === 'permissions') {
          detailModalHost.close(TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER);
          this.activeTab = this.resolveVisibleTab(tab, this.detail);
          this.preferredTab = this.activeTab;
          this.render();
        }
        return;
      }
      if (action === 'item-detail') {
        this.openItemDetail(target.dataset.storageItemId ?? '');
        return;
      }
      if (action === 'deposit') {
        const itemInstanceId = this.root.querySelector<HTMLSelectElement>('[data-vault-deposit-item]')?.value ?? '';
        const count = normalizePositiveCount(this.root.querySelector<HTMLInputElement>('[data-vault-deposit-count]')?.value);
        if (itemInstanceId) this.callbacks.onDeposit(itemInstanceId, count);
      }
      if (action === 'withdraw') {
        const storageItemId = target.dataset.storageItemId ?? '';
        const count = target.dataset.vaultWithdrawMode === 'all' ? this.resolveStorageItemCount(storageItemId) : 1;
        if (storageItemId) this.callbacks.onWithdraw(storageItemId, count);
        detailModalHost.close(TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER);
      }
      if (action === 'permissions') {
        this.callbacks.onUpdatePermissions(this.readPermissions());
      }
    });
  }

  private render(): void {
    const detail = this.detail;
    if (!detail) {
      this.root.innerHTML = '';
      return;
    }
    const canEditPermissions = detail.ownerPlayerId === this.currentPlayerId;
    const activeTab = this.resolveVisibleTab(this.activeTab, detail);
    this.activeTab = activeTab;
    this.root.innerHTML = `
      <div class="ui-modal-card ui-modal-card--wide treasure-vault-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(detail.buildingName)}">
        <div class="ui-modal-head treasure-vault-modal-head">
          <div>
            <div class="ui-modal-title">${escapeHtml(detail.buildingName)}仓库</div>
            <div class="ui-modal-subtitle">${this.renderVaultSubtitle(detail)}</div>
          </div>
          <button class="icon-btn" type="button" data-vault-action="close">x</button>
        </div>
        <div class="ui-tabbed-modal-shell treasure-vault-shell">
          <div class="ui-tabbed-modal-tabs treasure-vault-tabs">
            <button class="ui-tabbed-modal-tab ${activeTab === 'items' ? 'active' : ''}" type="button" data-vault-action="tab" data-vault-tab="items">仓库</button>
            ${canEditPermissions ? `<button class="ui-tabbed-modal-tab ${activeTab === 'permissions' ? 'active' : ''}" type="button" data-vault-action="tab" data-vault-tab="permissions">使用权限</button>` : ''}
          </div>
          <div class="ui-modal-body treasure-vault-body">
            ${activeTab === 'permissions'
              ? this.renderPermissions(detail, canEditPermissions)
              : this.renderWarehouse(detail, canEditPermissions)}
          </div>
        </div>
      </div>
    `;
  }

  private resolveVisibleTab(tab: TreasureVaultModalTab, detail: TreasureVaultDetailView): TreasureVaultModalTab {
    if (tab === 'permissions' && detail.ownerPlayerId !== this.currentPlayerId) {
      return 'items';
    }
    return tab;
  }

  private renderVaultSubtitle(detail: TreasureVaultDetailView): string {
    const owner = detail.ownerName ? ` · 建造者：${escapeHtml(detail.ownerName)}` : '';
    return `容量 ${detail.items.length}/${detail.capacity}${owner}`;
  }

  private renderWarehouse(detail: TreasureVaultDetailView, canEditPermissions: boolean): string {
    return `
      <div class="treasure-vault-layout">
        <section class="treasure-vault-section treasure-vault-section--items">
          <div class="panel-section-title">宝库物品</div>
          ${this.renderItems(detail)}
        </section>
        <aside class="treasure-vault-section treasure-vault-section--actions">
          <div class="panel-section-title">存取</div>
          ${this.renderDeposit(detail)}
          ${this.renderPermissionSummary(detail, canEditPermissions)}
        </aside>
      </div>
    `;
  }

  private renderItems(detail: TreasureVaultDetailView): string {
    if (!detail.effectivePermissions.view) {
      return `<div class="empty-hint">无权查看宝库</div>`;
    }
    if (detail.items.length === 0) {
      return `<div class="empty-hint">宝库为空</div>`;
    }
    return `
      <div class="inventory-grid treasure-vault-inventory-grid">
        ${detail.items.map((item) => `
          ${this.renderInventoryCell(item)}
        `).join('')}
      </div>
    `;
  }

  private renderInventoryCell(item: TreasureVaultDetailView['items'][number]): string {
    const itemMeta = getItemDisplayMeta(item as ItemStack);
    const displayName = itemMeta.displayItem.name;
    const ribbon = this.getInventoryCellRibbon(item as ItemStack, itemMeta);
    const learnedRibbon = this.getInventoryLearnedRibbon(item as ItemStack);
    const gradeLineLabel = this.getInventoryGradeLineLabel(item as ItemStack);
    const levelChip = itemMeta.levelLabel
      ? `<span class="item-card-chip item-card-chip--level" data-item-level="true">${escapeHtml(itemMeta.levelLabel)}</span>`
      : '';
    const enhanceChip = itemMeta.enhanceLabel
      ? `<span class="item-card-chip item-card-chip--enhance" data-item-enhance="true">${escapeHtml(itemMeta.enhanceLabel)}</span>`
      : '';
    return `
      <button class="${getItemDecorClassName('inventory-cell', item as ItemStack)}" type="button" data-vault-action="item-detail" data-storage-item-id="${escapeHtml(item.storageItemId)}" data-vault-row="true" data-item-type="${escapeHtml(item.type)}" ${itemMeta.grade ? `data-item-grade="${escapeHtml(itemMeta.grade)}"` : ''} ${gradeLineLabel ? 'data-item-grade-line-visible="true"' : ''} aria-label="查看${escapeHtml(displayName)}详情">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type" ${ribbon ? '' : 'hidden'}>${escapeHtml(ribbon?.label ?? '')}</span>
          <span class="inventory-cell-count">${escapeHtml(formatDisplayCountBadge(item.count))}</span>
        </div>
        <span class="inventory-cell-learned-ribbon" ${learnedRibbon ? '' : 'hidden'}>${escapeHtml(learnedRibbon?.label ?? '')}</span>
        <div class="inventory-cell-grade-line" ${gradeLineLabel ? '' : 'hidden'}>${escapeHtml(gradeLineLabel ?? '')}</div>
        <div class="inventory-cell-name" aria-label="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
        ${levelChip}
        ${enhanceChip}
      </button>
    `;
  }

  private openItemDetail(storageItemId: string): void {
    const detail = this.detail;
    if (!detail || !detail.effectivePermissions.view) return;
    const item = detail.items.find((entry) => entry.storageItemId === storageItemId);
    if (!item) return;
    const previewItem = resolvePreviewItem(item as ItemStack);
    const itemMeta = getItemDisplayMeta(item as ItemStack);
    const bonusLines = item.type === 'equipment' || item.type === 'artifact'
      ? describeEquipmentBonuses(previewItem, undefined)
      : describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
    const materialValueLines = item.type === 'material' ? describeMaterialValueDetails(previewItem) : [];
    const effectLines = describeItemEffectDetails(item as ItemStack);
    detailModalHost.open({
      ownerId: TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER,
      title: itemMeta.displayItem.name,
      subtitle: `${resolveItemTypeLabel(item as ItemStack)} · ${formatDisplayCountBadge(item.count)}`,
      renderBody: (body) => {
        body.replaceChildren(createFragmentFromHtml(this.renderItemDetailBody(item, previewItem, bonusLines, materialValueLines, effectLines, detail.effectivePermissions.withdraw)));
      },
      onAfterRender: (body, signal) => {
        body.querySelectorAll<HTMLElement>('[data-vault-detail-withdraw]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            const mode = button.dataset.vaultDetailWithdraw === 'all' ? 'all' : 'one';
            this.callbacks?.onWithdraw(item.storageItemId, mode === 'all' ? Math.max(1, Math.trunc(Number(item.count) || 1)) : 1);
            detailModalHost.close(TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER);
          }, { signal });
        });
      },
    });
  }

  private renderItemDetailBody(
    item: TreasureVaultDetailView['items'][number],
    previewItem: ItemStack,
    bonusLines: string[],
    materialValueLines: string[],
    effectLines: string[],
    canWithdraw: boolean,
  ): string {
    const actionHtml = canWithdraw
      ? `<div class="inventory-detail-actions"><div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch"><button class="small-btn ghost" type="button" data-vault-detail-withdraw="one">取出一个</button><button class="small-btn" type="button" data-vault-detail-withdraw="all">取出全部</button></div></div>`
      : '<div class="empty-hint compact">无权取出该宝库物品</div>';
    return `
      <div class="quest-detail-grid inventory-detail-grid">
        <div class="quest-detail-section"><strong>物品类型</strong><span>${escapeHtml(resolveItemTypeLabel(item as ItemStack))}</span></div>
        <div class="quest-detail-section"><strong>当前数量</strong><span>${escapeHtml(formatDisplayCountBadge(item.count))}</span></div>
      </div>
      <div class="quest-detail-section"><strong>描述</strong><span>${escapeHtml(previewItem.desc)}</span></div>
      ${bonusLines.length > 0 ? `<div class="quest-detail-section"><strong>属性</strong><span>${escapeHtml(bonusLines.join(' / '))}</span></div>` : ''}
      ${materialValueLines.length > 0 ? `<div class="quest-detail-section"><strong>材料五行</strong><span>${escapeHtml(materialValueLines.join(' / '))}</span></div>` : ''}
      ${effectLines.length > 0 ? `<div class="quest-detail-section"><strong>效果</strong><span>${escapeHtml(effectLines.join(' / '))}</span></div>` : ''}
      ${actionHtml}
    `;
  }

  private resolveStorageItemCount(storageItemId: string): number {
    const item = this.detail?.items.find((entry) => entry.storageItemId === storageItemId);
    return Math.max(1, Math.trunc(Number(item?.count) || 1));
  }

  private getInventoryCellRibbon(item: ItemStack, itemMeta: ItemDisplayMeta): InventoryCellRibbon | null {
    if (itemMeta.affinityBadge) {
      return {
        label: itemMeta.affinityBadge.label,
        title: itemMeta.affinityBadge.title,
      };
    }
    if (item.type === 'skill_book') {
      return { label: '功法' };
    }
    if (item.type === 'material') {
      return {
        label: this.getInventoryMaterialRibbonLabel(item),
        title: getItemTypeLabel(item.type),
      };
    }
    if (item.type === 'consumable' || item.type === 'equipment' || item.type === 'artifact') {
      return { label: getItemTypeLabel(item.type) };
    }
    return null;
  }

  private getInventoryLearnedRibbon(_item: ItemStack): InventoryCellRibbon | null {
    return null;
  }

  private getInventoryMaterialRibbonLabel(item: ItemStack): string {
    switch (item.materialCategory) {
      case 'herb':
        return '药材';
      case 'exotic':
        return '异材';
      case 'ore':
        return '矿石';
      default:
        return getItemTypeLabel(item.type);
    }
  }

  private getInventoryGradeLineLabel(_item: ItemStack): string | null {
    return null;
  }

  private renderDeposit(detail: TreasureVaultDetailView): string {
    if (!detail.effectivePermissions.deposit) {
      return '<div class="empty-hint compact">无权向宝库存入物品</div>';
    }
    const options = this.inventoryItems
      .filter((item) => typeof item.itemInstanceId === 'string' && item.itemInstanceId.length > 0)
      .map((item) => `<option value="${escapeHtml(item.itemInstanceId as string)}">${escapeHtml(getItemStackDisplayLabel(item))}</option>`)
      .join('');
    if (!options) {
      return '<div class="empty-hint compact">背包里暂无可存入物品</div>';
    }
    return `
      <div class="ui-input-row">
        <select class="ui-input" data-vault-deposit-item>${options}</select>
        <input class="ui-input compact" data-vault-deposit-count type="number" min="1" value="1">
        <button class="small-btn" type="button" data-vault-action="deposit">存入</button>
      </div>
    `;
  }

  private renderPermissionSummary(detail: TreasureVaultDetailView, canEditPermissions: boolean): string {
    return `
      <div class="treasure-vault-permission-summary">
        <div class="panel-section-title">当前规则</div>
        ${PERMISSION_KINDS.map((kind) => `
          <div class="panel-row">
            <span class="panel-label">${PERMISSION_KIND_LABEL[kind]}</span>
            <span class="panel-value">${this.renderScopeSummary(detail.permissions[kind])}</span>
          </div>
        `).join('')}
        ${canEditPermissions
          ? '<button class="small-btn" type="button" data-vault-action="tab" data-vault-tab="permissions">设置使用权限</button>'
          : '<div class="panel-subtext">使用权限仅建造者可设置。</div>'}
      </div>
    `;
  }

  private renderScopeSummary(scopes: TreasureVaultPermissionScope[] | undefined): string {
    const normalized = (scopes ?? []).filter((scope) => PERMISSION_SCOPES.includes(scope));
    if (normalized.length === 0) {
      return '仅建造者';
    }
    return normalized.map((scope) => PERMISSION_SCOPE_LABEL[scope]).join('、');
  }

  private renderPermissions(detail: TreasureVaultDetailView, canEdit: boolean): string {
    if (!canEdit) {
      return '<div class="empty-hint">使用权限仅建造者可设置。</div>';
    }
    return `
      <div class="treasure-vault-permission-editor">
        <div class="panel-section-title">设置使用权限</div>
        <div class="panel-subtext">建造者始终拥有查看、存入、取出和修改权限；下方规则只影响其他玩家。</div>
        ${PERMISSION_KINDS.map((kind) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${PERMISSION_KIND_LABEL[kind]}</div>
              <div class="ui-list-subtitle">
                ${PERMISSION_SCOPES.map((scope) => `
                  <label class="inline-check">
                    <input type="checkbox" data-vault-permission-kind="${kind}" data-vault-permission-scope="${scope}" ${detail.permissions[kind]?.includes(scope) ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
                    ${PERMISSION_SCOPE_LABEL[scope]}
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
        <div class="ui-inline-actions-end">
          <button class="small-btn" type="button" data-vault-action="permissions">保存权限</button>
        </div>
      </div>
    `;
  }

  private readPermissions(): TreasureVaultPermissionMap {
    const next: TreasureVaultPermissionMap = { view: [], deposit: [], withdraw: [] };
    for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-vault-permission-kind]')) {
      if (!input.checked) continue;
      const kind = input.dataset.vaultPermissionKind as TreasureVaultPermissionKind;
      const scope = input.dataset.vaultPermissionScope as TreasureVaultPermissionScope;
      if (PERMISSION_KINDS.includes(kind) && PERMISSION_SCOPES.includes(scope)) {
        next[kind].push(scope);
      }
    }
    return next;
  }
}

function normalizeSocialPanelView(view: SocialPanelView | null | undefined): SocialPanelView {
  return {
    relations: Array.isArray(view?.relations) ? view.relations : [],
    incomingRequests: Array.isArray(view?.incomingRequests) ? view.incomingRequests : [],
    outgoingRequests: Array.isArray(view?.outgoingRequests) ? view.outgoingRequests : [],
    nearbyCandidates: Array.isArray(view?.nearbyCandidates) ? view.nearbyCandidates : [],
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

function resolveItemTypeLabel(item: ItemStack): string {
  return typeof item.type === 'string' && item.type.trim()
    ? getItemTypeLabel(item.type)
    : '物品';
}

function normalizePositiveCount(value: unknown): number {
  const count = Math.trunc(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 1;
}
