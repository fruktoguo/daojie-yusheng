/**
 * 本文件是客户端 DOM UI 的道友面板和宝库弹层模块。
 *
 * UI 只负责展示服务端视图和提交意图，权限、距离、资产转移均由服务端裁定。
 */
import type {
  DaoistDirectMessageView,
  DaoistRelationLevel,
  SocialPanelView,
  SyncedItemStack,
  TreasureVaultDetailView,
  TreasureVaultPermissionKind,
  TreasureVaultPermissionMap,
  TreasureVaultPermissionScope,
  TreasureVaultOperationResultView,
} from '@mud/shared';
import { getItemStackDisplayLabel } from '@mud/shared';

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
  private readonly root: HTMLDivElement;
  private callbacks: TreasureVaultCallbacks | null = null;
  private detail: TreasureVaultDetailView | null = null;
  private inventoryItems: SyncedItemStack[] = [];
  private currentPlayerId: string | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'modal-backdrop hidden';
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

  showDetail(detail: TreasureVaultDetailView): void {
    this.detail = detail;
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
      if (action === 'deposit') {
        const itemInstanceId = this.root.querySelector<HTMLSelectElement>('[data-vault-deposit-item]')?.value ?? '';
        const count = Number(this.root.querySelector<HTMLInputElement>('[data-vault-deposit-count]')?.value ?? 1);
        if (itemInstanceId) this.callbacks.onDeposit(itemInstanceId, count);
      }
      if (action === 'withdraw') {
        const storageItemId = target.dataset.storageItemId ?? '';
        const count = Number((target.closest('[data-vault-row]')?.querySelector<HTMLInputElement>('[data-vault-withdraw-count]'))?.value ?? 1);
        if (storageItemId) this.callbacks.onWithdraw(storageItemId, count);
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
    this.root.innerHTML = `
      <div class="modal-shell ui-workspace-shell">
        <div class="modal-header">
          <div>
            <div class="modal-title">${escapeHtml(detail.buildingName)}</div>
            <div class="modal-subtitle">${detail.items.length}/${detail.capacity}</div>
          </div>
          <button class="icon-btn" type="button" data-vault-action="close">x</button>
        </div>
        <div class="modal-body">
          ${this.renderItems(detail)}
          ${this.renderDeposit(detail)}
          ${this.renderPermissions(detail, canEditPermissions)}
        </div>
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
      <div class="ui-list">
        ${detail.items.map((item) => `
          <div class="ui-list-row" data-vault-row="true">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(getItemStackDisplayLabel(item))}</div>
              <div class="ui-list-subtitle">${escapeHtml(item.itemId)}</div>
            </div>
            ${detail.effectivePermissions.withdraw ? `
              <input class="ui-input compact" data-vault-withdraw-count type="number" min="1" max="${Math.max(1, Number(item.count) || 1)}" value="1">
              <button class="small-btn" type="button" data-vault-action="withdraw" data-storage-item-id="${escapeHtml(item.storageItemId)}">取出</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderDeposit(detail: TreasureVaultDetailView): string {
    if (!detail.effectivePermissions.deposit) {
      return '';
    }
    const options = this.inventoryItems
      .filter((item) => typeof item.itemInstanceId === 'string' && item.itemInstanceId.length > 0)
      .map((item) => `<option value="${escapeHtml(item.itemInstanceId as string)}">${escapeHtml(getItemStackDisplayLabel(item))}</option>`)
      .join('');
    return `
      <div class="ui-input-row">
        <select class="ui-input" data-vault-deposit-item>${options}</select>
        <input class="ui-input compact" data-vault-deposit-count type="number" min="1" value="1">
        <button class="small-btn" type="button" data-vault-action="deposit">存入</button>
      </div>
    `;
  }

  private renderPermissions(detail: TreasureVaultDetailView, canEdit: boolean): string {
    return `
      <div class="ui-list">
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
        ${canEdit ? '<button class="small-btn" type="button" data-vault-action="permissions">保存权限</button>' : ''}
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
