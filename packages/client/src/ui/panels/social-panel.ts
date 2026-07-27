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
import { createItemStackSignature, getTechniqueMaxLevel, resolvePlayerFacingContentName, TECHNIQUE_GRADE_ORDER } from '@mud/shared';
import { getItemTypeLabel } from '../../domain-labels';
import { INVENTORY_FILTER_TABS, type InventoryFilter } from '../../constants/ui/inventory';
import { getItemDecorClassName, getItemDisplayMeta, type ItemDisplayMeta } from '../item-display';
import { formatDisplayCountBadge } from '../../utils/number';
import { detailModalHost } from '../detail-modal-host';
import { describeEquipmentBonuses, describeItemEffectDetails, describeMaterialValueDetails } from '../equipment-tooltip';
import { getLocalTechniqueTemplate, resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../../content/local-templates';
import { describePreviewBonuses } from '../stat-preview';
import { renderTradeQuantityControl } from '../trade-control-renderers';
import { normalizeTreasureVaultTransferCount } from '../treasure-vault-transfer-count';

type SocialPanelCallbacks = {
  onRefresh(): void;
  onScanNearby(): void;
  onSendRequest(targetPlayerId: string): void;
  onRespondRequest(requestId: string, accept: boolean): void;
  onUpdateRelationLevel(targetPlayerId: string, level: DaoistRelationLevel): void;
  onRemoveRelation(targetPlayerId: string): void;
  onSendMessage(targetPlayerId: string, message: string): void;
  onOpenConversation(targetPlayerId: string): void;
};

type TreasureVaultCallbacks = {
  onDeposit(items: Array<{ itemInstanceId: string; count: number }>): void;
  onWithdraw(storageItemId: string, count: number): void;
  onOrganize(): void;
  onUpdatePermissions(permissions: TreasureVaultPermissionMap): void;
  onRename(name: string): void;
};

type InventoryCellRibbon = {
  label: string;
  title?: string;
};

type SocialMessageInputSnapshot = {
  peerId: string;
  focused: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
};

type SocialConversationScrollSnapshot = {
  container: 'pane' | 'messages';
  scrollTop: number;
  scrollLeft: number;
  stickToBottom: boolean;
  anchorMessageId: string | null;
  anchorOffsetTop: number;
};

type SocialPanelTab = 'relations' | 'requests' | 'nearby' | 'messages';
type SocialRelationView = SocialPanelView['relations'][number];

export type TreasureVaultModalTab = 'items' | 'permissions';
type TreasureVaultDepositSort = 'inventory' | 'quality' | 'name' | 'count';
type TreasureVaultItemSort = 'slot' | 'quality' | 'name' | 'count';

const RELATION_LABEL: Record<DaoistRelationLevel, string> = {
  dao_friend: '道友',
  close_friend: '至交',
};

function resolveSocialPlayerName(playerId: string, name: unknown): string {
  return resolvePlayerFacingContentName(playerId, '未知玩家', name);
}

function resolveSocialInstanceName(instanceId: unknown, instanceName: unknown): string {
  return resolvePlayerFacingContentName(instanceId, '未知地域', instanceName);
}

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
const MAX_SOCIAL_MESSAGES_PER_PEER = 100;
const SOCIAL_SCROLL_BOTTOM_THRESHOLD_PX = 24;
const TREASURE_VAULT_DEPOSIT_PAGE_SIZE = 30;
const MAX_TREASURE_VAULT_DEPOSIT_SELECTION = 100;

const SOCIAL_PANEL_TABS: ReadonlyArray<{ id: SocialPanelTab; label: string }> = [
  { id: 'relations', label: '道友' },
  { id: 'requests', label: '申请' },
  { id: 'nearby', label: '附近' },
  { id: 'messages', label: '私聊' },
];

const TREASURE_VAULT_DEPOSIT_SORT_OPTIONS: Array<{ id: TreasureVaultDepositSort; label: string }> = [
  { id: 'inventory', label: '背包顺序' },
  { id: 'quality', label: '品质优先' },
  { id: 'name', label: '名称排序' },
  { id: 'count', label: '数量优先' },
];

const TREASURE_VAULT_ITEM_SORT_OPTIONS: Array<{ id: TreasureVaultItemSort; label: string }> = [
  { id: 'slot', label: '库位顺序' },
  { id: 'quality', label: '品质优先' },
  { id: 'name', label: '名称排序' },
  { id: 'count', label: '数量优先' },
];

export class SocialPanel {
  private readonly pane = document.getElementById('pane-social')!;
  private callbacks: SocialPanelCallbacks | null = null;
  private view: SocialPanelView = { relations: [], incomingRequests: [], outgoingRequests: [], nearbyCandidates: [] };
  private activeTab: SocialPanelTab = 'relations';
  private selectedPlayerId: string | null = null;
  private messagesByPlayerId = new Map<string, DaoistDirectMessageView[]>();
  private unreadMessagesByPlayerId = new Map<string, number>();
  private messageDraftsByPlayerId = new Map<string, string>();
  private conversationScrollByPlayerId = new Map<string, SocialConversationScrollSnapshot>();

  constructor() {
    this.bindEvents();
    this.render();
  }

  setCallbacks(callbacks: SocialPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  update(view: SocialPanelView): void {
    const inputSnapshot = this.captureConversationState(this.selectedPlayerId);
    this.view = normalizeSocialPanelView(view);
    this.applyConversationSummaries(this.view.conversations ?? []);
    if (this.selectedPlayerId && !this.view.relations.some((entry) => entry.playerId === this.selectedPlayerId)) {
      this.selectedPlayerId = null;
    }
    this.pruneConversationState();
    this.resolveSelectedRelation();
    if (!this.pane.querySelector<HTMLElement>('[data-social-tab-content="true"]')) {
      this.render(inputSnapshot);
      return;
    }
    this.patchTabState();
    this.replaceActiveTabContent(inputSnapshot);
  }

  appendMessage(message: DaoistDirectMessageView, currentPlayerId: string | null): void {
    const peerId = message.fromPlayerId === currentPlayerId ? message.toPlayerId : message.fromPlayerId;
    const previousMessages = this.messagesByPlayerId.get(peerId) ?? [];
    if (previousMessages.some((entry) => entry.messageId === message.messageId)) {
      return;
    }
    const nextMessages = [...previousMessages, message]
      .sort((left, right) => left.sentAt - right.sentAt || left.messageId.localeCompare(right.messageId))
      .slice(-MAX_SOCIAL_MESSAGES_PER_PEER);
    this.messagesByPlayerId.set(peerId, nextMessages);
    const conversationMounted = this.activeTab === 'messages' && peerId === this.selectedPlayerId;
    const incoming = currentPlayerId !== null
      && message.toPlayerId === currentPlayerId
      && message.fromPlayerId !== currentPlayerId;
    if (incoming && (!conversationMounted || !this.isConversationVisible(peerId))) {
      const currentUnread = this.unreadMessagesByPlayerId.get(peerId) ?? 0;
      this.unreadMessagesByPlayerId.set(peerId, currentUnread + 1);
      this.patchUnreadIndicators(peerId);
    }
    if (!conversationMounted) {
      return;
    }
    const retainedMessageIds = new Set(nextMessages.map((entry) => entry.messageId));
    const inputSnapshot = this.captureConversationState(peerId, retainedMessageIds);
    if (this.patchCurrentConversation(peerId, message, previousMessages, nextMessages)) {
      this.restoreConversationScroll(peerId);
      return;
    }
    this.replaceCurrentConversation(peerId, inputSnapshot);
  }

  mergeConversationMessages(peerId: string, messages: readonly DaoistDirectMessageView[]): void {
    if (!peerId || messages.length === 0) {
      return;
    }
    const current = this.messagesByPlayerId.get(peerId) ?? [];
    const merged = new Map(current.map((entry) => [entry.messageId, entry] as const));
    for (const message of messages) {
      merged.set(message.messageId, message);
    }
    const next = Array.from(merged.values())
      .sort((left, right) => left.sentAt - right.sentAt || left.messageId.localeCompare(right.messageId))
      .slice(-MAX_SOCIAL_MESSAGES_PER_PEER);
    this.messagesByPlayerId.set(peerId, next);
    if (this.activeTab === 'messages' && this.selectedPlayerId === peerId) {
      this.replaceCurrentConversation(peerId, this.captureConversationState(peerId, new Set(next.map((entry) => entry.messageId))));
    }
  }

  isConversationOpenAndVisible(peerId: string): boolean {
    return this.activeTab === 'messages'
      && this.selectedPlayerId === peerId
      && this.isConversationVisible(peerId);
  }

  getLatestIncomingMessage(peerId: string, currentPlayerId: string): DaoistDirectMessageView | null {
    const messages = this.messagesByPlayerId.get(peerId) ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.fromPlayerId === peerId && message.toPlayerId === currentPlayerId) {
        return message;
      }
    }
    return null;
  }

  markConversationRead(peerId: string): void {
    if (this.unreadMessagesByPlayerId.delete(peerId)) {
      this.patchUnreadIndicators(peerId);
    }
  }

  clear(): void {
    this.view = { relations: [], incomingRequests: [], outgoingRequests: [], nearbyCandidates: [] };
    this.activeTab = 'relations';
    this.selectedPlayerId = null;
    this.messagesByPlayerId.clear();
    this.unreadMessagesByPlayerId.clear();
    this.messageDraftsByPlayerId.clear();
    this.conversationScrollByPlayerId.clear();
    this.render();
  }

  private bindEvents(): void {
    this.pane.addEventListener('input', (event) => {
      const input = event.target instanceof HTMLInputElement
        ? event.target.closest<HTMLInputElement>('[data-social-message-input]')
        : null;
      const peerId = input?.dataset.socialMessagePeer;
      if (input && peerId) {
        this.messageDraftsByPlayerId.set(peerId, input.value);
      }
    });
    this.pane.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-social-action]') : null;
      if (!target) {
        return;
      }
      const action = target.dataset.socialAction;
      const playerId = target.dataset.playerId ?? '';
      const requestId = target.dataset.requestId ?? '';
      const tab = target.dataset.socialTab;
      if (action === 'tab' && isSocialPanelTab(tab)) {
        this.switchActiveTab(tab);
        return;
      }
      if (action === 'chat' && playerId) {
        this.openConversation(playerId);
        return;
      }
      if (action === 'select' && playerId) {
        this.openConversation(playerId);
        return;
      }
      if (!this.callbacks) {
        return;
      }
      if (action === 'refresh') this.callbacks.onRefresh();
      if (action === 'scan') this.callbacks.onScanNearby();
      if (action === 'request' && playerId) this.callbacks.onSendRequest(playerId);
      if (action === 'accept' && requestId) this.callbacks.onRespondRequest(requestId, true);
      if (action === 'reject' && requestId) this.callbacks.onRespondRequest(requestId, false);
      if (action === 'dao_friend' && playerId) this.callbacks.onUpdateRelationLevel(playerId, 'dao_friend');
      if (action === 'close_friend' && playerId) this.callbacks.onUpdateRelationLevel(playerId, 'close_friend');
      if (action === 'remove' && playerId) this.callbacks.onRemoveRelation(playerId);
      if (action === 'send' && playerId) {
        const input = this.pane.querySelector<HTMLInputElement>('[data-social-message-input]');
        const message = input?.value.trim() ?? '';
        if (message) {
          this.callbacks.onSendMessage(playerId, message);
          this.messageDraftsByPlayerId.set(playerId, '');
          if (input) input.value = '';
        }
      }
    });
    this.pane.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        return;
      }
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-social-tab]')
        : null;
      const currentTab = target?.dataset.socialTab;
      if (!isSocialPanelTab(currentTab)) {
        return;
      }
      const currentIndex = SOCIAL_PANEL_TABS.findIndex((entry) => entry.id === currentTab);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? SOCIAL_PANEL_TABS.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + SOCIAL_PANEL_TABS.length) % SOCIAL_PANEL_TABS.length;
      const nextTab = SOCIAL_PANEL_TABS[nextIndex]?.id;
      if (!nextTab) {
        return;
      }
      event.preventDefault();
      this.switchActiveTab(nextTab);
      this.pane.querySelector<HTMLButtonElement>(`[data-social-tab="${nextTab}"]`)?.focus();
    });
  }

  private render(inputSnapshot: SocialMessageInputSnapshot | null = null): void {
    const selected = this.resolveSelectedRelation();
    this.pane.innerHTML = `
      <div class="panel-section social-panel">
        <div class="panel-section-head social-panel-head">
          <div class="panel-section-title">道友</div>
          <div class="social-panel-actions">
            <button class="small-btn" type="button" data-social-action="refresh">刷新</button>
          </div>
        </div>
        ${this.renderTabs()}
        <div class="social-panel-tab-content" data-social-tab-content="true">
          ${this.renderActiveTabContent(selected)}
        </div>
      </div>
    `;
    if (this.activeTab === 'messages' && selected) {
      this.restoreConversationState(selected.playerId, inputSnapshot);
    }
  }

  private renderTabs(): string {
    const unreadCount = this.getTotalUnreadCount();
    return `
      <div class="ui-subtabs social-panel-tabs" role="tablist" aria-label="道友功能">
        ${SOCIAL_PANEL_TABS.map((tab) => {
          const active = tab.id === this.activeTab;
          const count = this.getTabCount(tab.id);
          const unread = tab.id === 'messages' ? unreadCount : 0;
          const ariaLabel = tab.id === 'messages' && unread > 0
            ? `${tab.label}，${unread} 条未读消息`
            : count === null
              ? tab.label
              : `${tab.label}，${count} 项`;
          return `
            <button
              class="ui-subtab-btn social-panel-tab ${active ? 'active' : ''}"
              type="button"
              role="tab"
              id="social-panel-tab-${tab.id}"
              data-social-action="tab"
              data-social-tab="${tab.id}"
              aria-label="${escapeHtml(ariaLabel)}"
              aria-selected="${active ? 'true' : 'false'}"
              aria-controls="social-panel-active-content"
              tabindex="${active ? '0' : '-1'}"
            >
              <span>${tab.label}</span>
              ${count === null
                ? `<span class="social-panel-tab-unread" data-social-tab-unread="true" aria-hidden="true" ${unread > 0 ? '' : 'hidden'}>${formatSocialUnreadCount(unread)}</span>`
                : `<span class="social-panel-tab-count" data-social-tab-count="true">${count}</span>`}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderActiveTabContent(selected: SocialRelationView | null): string {
    if (this.activeTab === 'requests') {
      return `
        <section id="social-panel-active-content" class="social-panel-section social-panel-tab-pane social-panel-section--requests" role="tabpanel" aria-labelledby="social-panel-tab-requests" data-social-active-tab="requests">
          ${this.renderSectionHeader('道友申请', this.view.incomingRequests.length + this.view.outgoingRequests.length)}
          ${this.renderRequests()}
        </section>
      `;
    }
    if (this.activeTab === 'nearby') {
      return `
        <section id="social-panel-active-content" class="social-panel-section social-panel-tab-pane social-panel-section--nearby" role="tabpanel" aria-labelledby="social-panel-tab-nearby" data-social-active-tab="nearby">
          ${this.renderSectionHeader(
            '附近修士',
            this.view.nearbyCandidates.length,
            '<button class="small-btn" type="button" data-social-action="scan">刷新附近</button>',
          )}
          ${this.renderNearby()}
        </section>
      `;
    }
    if (this.activeTab === 'messages') {
      return this.renderConversationPanel(selected);
    }
    return `
      <section id="social-panel-active-content" class="social-panel-section social-panel-tab-pane social-panel-section--relations" role="tabpanel" aria-labelledby="social-panel-tab-relations" data-social-active-tab="relations">
        ${this.renderSectionHeader('我的道友', this.view.relations.length)}
        ${this.renderRelations()}
      </section>
    `;
  }

  private renderSectionHeader(title: string, count: number, actions = ''): string {
    return `
      <div class="social-panel-section-head">
        <div class="social-panel-section-title">${escapeHtml(title)}</div>
        <div class="social-panel-section-meta">
          <span class="social-panel-count">${Math.max(0, Math.trunc(count))}</span>
          ${actions}
        </div>
      </div>
    `;
  }

  private renderRequests(): string {
    const incoming = this.view.incomingRequests;
    const outgoing = this.view.outgoingRequests;
    if (incoming.length === 0 && outgoing.length === 0) {
      return `<div class="empty-hint compact">暂无道友申请</div>`;
    }
    return `
      <div class="ui-list">
        ${incoming.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(resolveSocialPlayerName(entry.fromPlayerId, entry.fromName))}</div>
              <div class="ui-list-subtitle">申请结为道友</div>
            </div>
            <div class="social-row-actions">
              <button class="small-btn" type="button" data-social-action="accept" data-request-id="${escapeHtml(entry.requestId)}">同意</button>
              <button class="small-btn ghost" type="button" data-social-action="reject" data-request-id="${escapeHtml(entry.requestId)}">拒绝</button>
            </div>
          </div>
        `).join('')}
        ${outgoing.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(resolveSocialPlayerName(entry.toPlayerId, entry.toName))}</div>
              <div class="ui-list-subtitle">申请等待回应</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderNearby(): string {
    if (this.view.nearbyCandidates.length === 0) {
      return `<div class="empty-hint compact">附近暂无可申请玩家</div>`;
    }
    return `
      <div class="ui-list">
        ${this.view.nearbyCandidates.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(resolveSocialPlayerName(entry.playerId, entry.name))}</div>
              <div class="ui-list-subtitle">距离 ${entry.distance}${entry.relationLevel ? ` · ${RELATION_LABEL[entry.relationLevel]}` : entry.pendingRequest ? ' · 已有申请' : ''}</div>
            </div>
            ${entry.relationLevel || entry.pendingRequest ? '' : `
              <div class="social-row-actions">
                <button class="small-btn" type="button" data-social-action="request" data-player-id="${escapeHtml(entry.playerId)}">申请</button>
              </div>
            `}
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderRelations(): string {
    if (this.view.relations.length === 0) {
      return `<div class="empty-hint compact">暂无道友</div>`;
    }
    return `
      <div class="ui-list">
        ${this.view.relations.map((entry) => `
          <div class="ui-list-row" data-social-relation-row="${escapeHtml(entry.playerId)}">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(resolveSocialPlayerName(entry.playerId, entry.name))} · ${RELATION_LABEL[entry.level]}</div>
              <div class="ui-list-subtitle">
                <span class="social-presence ${entry.online ? 'is-online' : 'is-offline'}">${entry.online ? '在线' : '离线'}</span>${entry.instanceName ? ` · ${escapeHtml(resolveSocialInstanceName(entry.instanceId, entry.instanceName))}` : ''}
              </div>
            </div>
            <div class="social-row-actions">
              <button class="small-btn" type="button" data-social-action="chat" data-player-id="${escapeHtml(entry.playerId)}">私聊</button>
              <button class="small-btn ghost" type="button" data-social-action="${entry.level === 'close_friend' ? 'dao_friend' : 'close_friend'}" data-player-id="${escapeHtml(entry.playerId)}">${entry.level === 'close_friend' ? '降为道友' : '设为至交'}</button>
              <button class="small-btn ghost" type="button" data-social-action="remove" data-player-id="${escapeHtml(entry.playerId)}">解除</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderConversationPanel(selected: SocialRelationView | null): string {
    return `
      <section id="social-panel-active-content" class="social-panel-section social-panel-tab-pane social-panel-section--conversation" role="tabpanel" aria-labelledby="social-panel-tab-messages" data-social-active-tab="messages">
        ${this.renderSectionHeader('私聊', this.view.relations.length)}
        <div class="social-conversation-workspace">
          <aside class="social-conversation-contacts" aria-label="私聊道友">
            <div class="social-conversation-contacts-title">会话道友</div>
            ${this.renderConversationContacts(selected?.playerId ?? null)}
          </aside>
          ${this.renderConversationSection(selected)}
        </div>
      </section>
    `;
  }

  private renderConversationContacts(selectedPlayerId: string | null): string {
    if (this.view.relations.length === 0) {
      return '<div class="empty-hint compact">暂无可私聊的道友</div>';
    }
    return `
      <div class="ui-list social-conversation-peer-list">
        ${this.view.relations.map((entry) => {
          const unreadCount = this.unreadMessagesByPlayerId.get(entry.playerId) ?? 0;
          const playerName = resolveSocialPlayerName(entry.playerId, entry.name);
          const ariaLabel = unreadCount > 0 ? `${playerName}，${unreadCount} 条未读消息` : playerName;
          return `
            <div class="ui-list-row ${entry.playerId === selectedPlayerId ? 'active' : ''}" data-social-relation-row="${escapeHtml(entry.playerId)}">
              <button class="ui-list-main text-left" type="button" data-social-action="select" data-player-id="${escapeHtml(entry.playerId)}" aria-label="${escapeHtml(ariaLabel)}" aria-pressed="${entry.playerId === selectedPlayerId ? 'true' : 'false'}">
                <div class="social-conversation-peer-title">
                  <span class="ui-list-title">${escapeHtml(playerName)} · ${RELATION_LABEL[entry.level]}</span>
                  <span class="social-conversation-peer-unread" data-social-peer-unread="${escapeHtml(entry.playerId)}" aria-hidden="true" ${unreadCount > 0 ? '' : 'hidden'}>${formatSocialUnreadCount(unreadCount)}</span>
                </div>
                <div class="ui-list-subtitle">
                  <span class="social-presence ${entry.online ? 'is-online' : 'is-offline'}">${entry.online ? '在线' : '离线'}</span>
                </div>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderConversationSection(selected: SocialRelationView | null): string {
    return `
      <div class="social-conversation-detail" data-social-conversation-host="true">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">对话</div>
          ${selected ? `<span class="social-conversation-peer">${escapeHtml(resolveSocialPlayerName(selected.playerId, selected.name))}</span>` : ''}
        </div>
        ${this.renderMessages(selected)}
      </div>
    `;
  }

  private renderMessages(selected: SocialRelationView | null): string {
    if (!selected) {
      return '<div class="empty-hint social-conversation-empty">选择一位道友开始私聊</div>';
    }
    const messages = this.messagesByPlayerId.get(selected.playerId) ?? [];
    return `
      <div class="social-message-list" data-social-conversation-peer="${escapeHtml(selected.playerId)}">
        ${messages.length === 0
          ? '<div class="empty-hint" data-social-message-empty="true">暂无消息</div>'
          : messages.map((entry) => this.renderMessageRow(entry)).join('')}
        <div class="ui-input-row" data-social-message-compose="true">
          <input class="ui-input" data-social-message-input data-social-message-peer="${escapeHtml(selected.playerId)}" type="text" maxlength="200" placeholder="发送消息">
          <button class="small-btn" type="button" data-social-action="send" data-player-id="${escapeHtml(selected.playerId)}">发送</button>
        </div>
      </div>
    `;
  }

  private renderMessageRow(message: DaoistDirectMessageView): string {
    return `
      <div class="ui-list-row social-message-row" data-social-message-id="${escapeHtml(message.messageId)}">
        <div class="ui-list-main">
          <div class="ui-list-title">${escapeHtml(resolveSocialPlayerName(message.fromPlayerId, message.fromName))}</div>
          <div class="ui-list-subtitle">${escapeHtml(message.text)}</div>
        </div>
      </div>
    `;
  }

  private patchCurrentConversation(
    peerId: string,
    message: DaoistDirectMessageView,
    previousMessages: DaoistDirectMessageView[],
    nextMessages: DaoistDirectMessageView[],
  ): boolean {
    const root = this.getConversationRoot(peerId);
    const compose = root?.querySelector<HTMLElement>('[data-social-message-compose="true"]');
    if (!root || !compose) {
      return false;
    }
    const renderedRows = this.getRenderedMessageRows(root);
    if (
      renderedRows.length !== previousMessages.length
      || renderedRows.some((row, index) => row.dataset.socialMessageId !== previousMessages[index]?.messageId)
    ) {
      return false;
    }
    const nextRow = this.createMessageRow(message);
    if (!nextRow) {
      return false;
    }
    const removeCount = Math.max(0, renderedRows.length + 1 - nextMessages.length);
    for (let index = 0; index < removeCount; index += 1) {
      renderedRows[index]?.remove();
    }
    root.querySelector<HTMLElement>('[data-social-message-empty="true"]')?.remove();
    root.insertBefore(nextRow, compose);
    return true;
  }

  private createMessageRow(message: DaoistDirectMessageView): HTMLElement | null {
    const fragment = createFragmentFromHtml(this.renderMessageRow(message));
    const row = fragment.firstElementChild;
    return row instanceof HTMLElement ? row : null;
  }

  private replaceCurrentConversation(peerId: string, inputSnapshot: SocialMessageInputSnapshot | null): void {
    const selected = this.view.relations.find((entry) => entry.playerId === peerId);
    if (!selected) {
      return;
    }
    const fragment = createFragmentFromHtml(this.renderMessages(selected));
    const nextRoot = fragment.firstElementChild;
    if (!(nextRoot instanceof HTMLElement)) {
      return;
    }
    const currentRoot = this.getConversationRoot(peerId);
    if (currentRoot) {
      currentRoot.replaceWith(nextRoot);
    } else {
      const host = this.pane.querySelector<HTMLElement>('[data-social-conversation-host="true"]');
      host?.querySelector<HTMLElement>('.social-conversation-empty')?.remove();
      host?.append(nextRoot);
    }
    this.restoreConversationState(peerId, inputSnapshot);
  }

  private replaceConversationSection(peerId: string, inputSnapshot: SocialMessageInputSnapshot | null): void {
    const selected = this.view.relations.find((entry) => entry.playerId === peerId);
    if (!selected) {
      return;
    }
    const fragment = createFragmentFromHtml(this.renderConversationSection(selected));
    const nextSection = fragment.firstElementChild;
    const currentSection = this.pane.querySelector<HTMLElement>('[data-social-conversation-host="true"]');
    if (!(nextSection instanceof HTMLElement) || !currentSection) {
      return;
    }
    currentSection.replaceWith(nextSection);
    this.restoreConversationState(peerId, inputSnapshot);
  }

  private switchActiveTab(tab: SocialPanelTab): void {
    const selected = this.resolveSelectedRelation();
    if (tab === this.activeTab) {
      if (tab === 'messages' && selected) {
        this.callbacks?.onOpenConversation(selected.playerId);
      }
      return;
    }
    const inputSnapshot = this.activeTab === 'messages'
      ? this.captureConversationState(this.selectedPlayerId)
      : null;
    this.activeTab = tab;
    if (tab === 'messages' && selected) {
      this.callbacks?.onOpenConversation(selected.playerId);
    }
    this.patchTabState();
    this.replaceActiveTabContent(inputSnapshot);
  }

  private openConversation(playerId: string): void {
    if (!this.view.relations.some((entry) => entry.playerId === playerId)) {
      return;
    }
    const tabChanged = this.activeTab !== 'messages';
    const playerChanged = this.selectedPlayerId !== playerId;
    const inputSnapshot = this.activeTab === 'messages'
      ? this.captureConversationState(this.selectedPlayerId)
      : null;
    this.activeTab = 'messages';
    this.selectedPlayerId = playerId;
    this.callbacks?.onOpenConversation(playerId);
    this.patchTabState();
    if (tabChanged) {
      this.replaceActiveTabContent(null);
      return;
    }
    this.patchSelectedRelation(playerId);
    this.patchUnreadIndicators(playerId);
    if (playerChanged) {
      this.replaceConversationSection(playerId, inputSnapshot);
    }
  }

  private replaceActiveTabContent(inputSnapshot: SocialMessageInputSnapshot | null): void {
    const host = this.pane.querySelector<HTMLElement>('[data-social-tab-content="true"]');
    if (!host) {
      this.render(inputSnapshot);
      return;
    }
    const selected = this.resolveSelectedRelation();
    host.replaceChildren(createFragmentFromHtml(this.renderActiveTabContent(selected)));
    if (this.activeTab === 'messages' && selected) {
      this.restoreConversationState(selected.playerId, inputSnapshot);
    }
  }

  private resolveSelectedRelation(): SocialRelationView | null {
    const selected = this.selectedPlayerId
      ? this.view.relations.find((entry) => entry.playerId === this.selectedPlayerId) ?? null
      : null;
    if (selected) {
      return selected;
    }
    const fallback = this.view.relations[0] ?? null;
    this.selectedPlayerId = fallback?.playerId ?? null;
    return fallback;
  }

  private pruneConversationState(): void {
    const relationIds = new Set(this.view.relations.map((entry) => entry.playerId));
    for (const state of [
      this.messagesByPlayerId,
      this.unreadMessagesByPlayerId,
      this.messageDraftsByPlayerId,
      this.conversationScrollByPlayerId,
    ]) {
      for (const playerId of state.keys()) {
        if (!relationIds.has(playerId)) {
          state.delete(playerId);
        }
      }
    }
  }

  private applyConversationSummaries(summaries: NonNullable<SocialPanelView['conversations']>): void {
    const nextUnread = new Map<string, number>();
    for (const summary of summaries) {
      const peerPlayerId = typeof summary?.peerPlayerId === 'string' ? summary.peerPlayerId.trim() : '';
      const unreadCount = Math.max(0, Math.trunc(Number(summary?.unreadCount) || 0));
      if (peerPlayerId && unreadCount > 0) {
        nextUnread.set(peerPlayerId, unreadCount);
      }
    }
    this.unreadMessagesByPlayerId = nextUnread;
  }

  private getTabCount(tab: SocialPanelTab): number | null {
    if (tab === 'relations') return this.view.relations.length;
    if (tab === 'requests') return this.view.incomingRequests.length + this.view.outgoingRequests.length;
    if (tab === 'nearby') return this.view.nearbyCandidates.length;
    return null;
  }

  private getTotalUnreadCount(): number {
    let total = 0;
    for (const count of this.unreadMessagesByPlayerId.values()) {
      total += Math.max(0, Math.trunc(count));
    }
    return total;
  }

  private patchTabState(): void {
    const unreadCount = this.getTotalUnreadCount();
    for (const button of this.pane.querySelectorAll<HTMLButtonElement>('[data-social-tab]')) {
      const tab = button.dataset.socialTab;
      if (!isSocialPanelTab(tab)) {
        continue;
      }
      const active = tab === this.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      const count = this.getTabCount(tab);
      const countNode = button.querySelector<HTMLElement>('[data-social-tab-count="true"]');
      if (countNode && count !== null && countNode.textContent !== String(count)) {
        countNode.textContent = String(count);
      }
      if (tab !== 'messages') {
        button.setAttribute('aria-label', `${SOCIAL_PANEL_TABS.find((entry) => entry.id === tab)?.label ?? tab}，${count ?? 0} 项`);
        continue;
      }
      const unreadNode = button.querySelector<HTMLElement>('[data-social-tab-unread="true"]');
      if (unreadNode) {
        unreadNode.hidden = unreadCount <= 0;
        const nextText = formatSocialUnreadCount(unreadCount);
        if (unreadNode.textContent !== nextText) {
          unreadNode.textContent = nextText;
        }
      }
      button.classList.toggle('has-unread', unreadCount > 0);
      button.dataset.hasUnread = unreadCount > 0 ? 'true' : 'false';
      button.setAttribute('aria-label', unreadCount > 0 ? `私聊，${unreadCount} 条未读消息` : '私聊');
    }
  }

  private patchUnreadIndicators(playerId: string): void {
    this.patchTabState();
    const unreadCount = this.unreadMessagesByPlayerId.get(playerId) ?? 0;
    const relation = this.view.relations.find((entry) => entry.playerId === playerId);
    const playerName = resolveSocialPlayerName(playerId, relation?.name);
    const ariaLabel = unreadCount > 0 ? `${playerName}，${unreadCount} 条未读消息` : playerName;
    for (const badge of this.pane.querySelectorAll<HTMLElement>('[data-social-peer-unread]')) {
      if (badge.dataset.socialPeerUnread !== playerId) {
        continue;
      }
      badge.hidden = unreadCount <= 0;
      const nextText = formatSocialUnreadCount(unreadCount);
      if (badge.textContent !== nextText) {
        badge.textContent = nextText;
      }
      badge.closest<HTMLElement>('[data-social-action="select"]')?.setAttribute('aria-label', ariaLabel);
    }
  }

  private isConversationVisible(peerId: string): boolean {
    const root = this.getConversationRoot(peerId);
    return document.visibilityState !== 'hidden'
      && root !== null
      && root.getClientRects().length > 0;
  }

  private patchSelectedRelation(playerId: string): void {
    for (const row of this.pane.querySelectorAll<HTMLElement>('[data-social-relation-row]')) {
      const selected = row.dataset.socialRelationRow === playerId;
      row.classList.toggle('active', selected);
      row.querySelector<HTMLElement>('[data-social-action="select"]')?.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  private getConversationRoot(peerId: string): HTMLElement | null {
    return Array.from(this.pane.querySelectorAll<HTMLElement>('[data-social-conversation-peer]'))
      .find((entry) => entry.dataset.socialConversationPeer === peerId) ?? null;
  }

  private getRenderedMessageRows(root: HTMLElement): HTMLElement[] {
    return Array.from(root.children).filter((entry): entry is HTMLElement => (
      entry instanceof HTMLElement && entry.dataset.socialMessageId !== undefined
    ));
  }

  private captureConversationState(
    peerId: string | null,
    retainedMessageIds?: ReadonlySet<string>,
  ): SocialMessageInputSnapshot | null {
    if (!peerId) {
      return null;
    }
    const root = this.getConversationRoot(peerId);
    if (!root) {
      return null;
    }
    const input = root.querySelector<HTMLInputElement>('[data-social-message-input]');
    if (input) {
      this.messageDraftsByPlayerId.set(peerId, input.value);
    }
    const scrollSnapshot = this.captureConversationScroll(root, retainedMessageIds);
    if (scrollSnapshot) {
      this.conversationScrollByPlayerId.set(peerId, scrollSnapshot);
    }
    return {
      peerId,
      focused: document.activeElement === input,
      selectionStart: input?.selectionStart ?? null,
      selectionEnd: input?.selectionEnd ?? null,
      selectionDirection: input?.selectionDirection ?? null,
    };
  }

  private captureConversationScroll(
    root: HTMLElement,
    retainedMessageIds?: ReadonlySet<string>,
  ): SocialConversationScrollSnapshot {
    const container = root.scrollHeight > root.clientHeight + 1 ? root : this.pane;
    const remainingDistance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const stickToBottom = remainingDistance <= SOCIAL_SCROLL_BOTTOM_THRESHOLD_PX;
    let anchorMessageId: string | null = null;
    let anchorOffsetTop = 0;
    if (!stickToBottom) {
      const containerRect = container.getBoundingClientRect();
      const anchor = this.getRenderedMessageRows(root).find((row) => {
        const messageId = row.dataset.socialMessageId;
        if (!messageId || (retainedMessageIds && !retainedMessageIds.has(messageId))) {
          return false;
        }
        const rowRect = row.getBoundingClientRect();
        return rowRect.bottom > containerRect.top && rowRect.top < containerRect.bottom;
      });
      if (anchor) {
        anchorMessageId = anchor.dataset.socialMessageId ?? null;
        anchorOffsetTop = anchor.getBoundingClientRect().top - containerRect.top;
      }
    }
    return {
      container: container === root ? 'messages' : 'pane',
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft,
      stickToBottom,
      anchorMessageId,
      anchorOffsetTop,
    };
  }

  private restoreConversationState(peerId: string, inputSnapshot: SocialMessageInputSnapshot | null): void {
    const root = this.getConversationRoot(peerId);
    if (!root) {
      return;
    }
    const input = root.querySelector<HTMLInputElement>('[data-social-message-input]');
    if (input) {
      input.value = this.messageDraftsByPlayerId.get(peerId) ?? '';
    }
    this.restoreConversationScroll(peerId);
    if (!input || inputSnapshot?.peerId !== peerId || !inputSnapshot.focused) {
      return;
    }
    input.focus({ preventScroll: true });
    if (inputSnapshot.selectionStart !== null && inputSnapshot.selectionEnd !== null) {
      input.setSelectionRange(
        inputSnapshot.selectionStart,
        inputSnapshot.selectionEnd,
        inputSnapshot.selectionDirection ?? 'none',
      );
    }
  }

  private restoreConversationScroll(peerId: string): void {
    const root = this.getConversationRoot(peerId);
    const snapshot = this.conversationScrollByPlayerId.get(peerId);
    if (!root || !snapshot) {
      return;
    }
    const container = snapshot.container === 'messages' ? root : this.pane;
    container.scrollLeft = snapshot.scrollLeft;
    if (snapshot.stickToBottom) {
      container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      return;
    }
    const anchor = snapshot.anchorMessageId
      ? this.getRenderedMessageRows(root).find((row) => row.dataset.socialMessageId === snapshot.anchorMessageId)
      : null;
    if (!anchor) {
      container.scrollTop = snapshot.scrollTop;
      return;
    }
    const currentOffsetTop = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += currentOffsetTop - snapshot.anchorOffsetTop;
  }
}

export class TreasureVaultModal {
  private static readonly ITEM_DETAIL_MODAL_OWNER = 'treasure-vault-item-detail';
  private readonly root: HTMLDivElement;
  private readonly depositPickerRoot: HTMLDivElement;
  private callbacks: TreasureVaultCallbacks | null = null;
  private detail: TreasureVaultDetailView | null = null;
  private inventoryItems: SyncedItemStack[] = [];
  /** 背包展示语义签名；属性每息同步但背包未变时，宝库保持零 DOM 写入。 */
  private inventoryItemsSignature = '';
  private currentPlayerId: string | null = null;
  private activeTab: TreasureVaultModalTab = 'items';
  private preferredTab: TreasureVaultModalTab = 'items';
  private depositPickerOpen = false;
  private depositFilter: InventoryFilter = 'all';
  private depositSort: TreasureVaultDepositSort = 'inventory';
  private depositPage = 0;
  private depositSubmitting = false;
  private itemSort: TreasureVaultItemSort = 'slot';
  private organizeSubmitting = false;
  private renaming = false;
  private readonly selectedDepositCounts = new Map<string, number>();

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'ui-modal-layer treasure-vault-modal-layer hidden';
    document.body.appendChild(this.root);
    this.depositPickerRoot = document.createElement('div');
    this.depositPickerRoot.className = 'ui-modal-layer treasure-vault-deposit-picker-layer hidden';
    document.body.appendChild(this.depositPickerRoot);
    this.bindEvents();
    this.bindDepositPickerEvents();
  }

  setCallbacks(callbacks: TreasureVaultCallbacks): void {
    this.callbacks = callbacks;
  }

  setCurrentPlayer(playerId: string | null, inventoryItems: SyncedItemStack[]): void {
    const nextInventorySignature = this.buildInventoryItemsSignature(inventoryItems);
    const playerChanged = this.currentPlayerId !== playerId;
    const inventoryChanged = this.inventoryItemsSignature !== nextInventorySignature;
    if (!playerChanged && !inventoryChanged) return;
    this.currentPlayerId = playerId;
    this.inventoryItems = inventoryItems;
    this.inventoryItemsSignature = nextInventorySignature;
    this.pruneDepositSelection();
    if (playerChanged && this.detail) {
      this.render();
    } else if (inventoryChanged && this.detail && !this.depositPickerOpen) {
      this.patchVaultDepositState();
    }
    if (inventoryChanged && this.depositPickerOpen) this.renderDepositPicker(true);
  }

  setPreferredTab(tab: TreasureVaultModalTab): void {
    this.preferredTab = tab;
    this.activeTab = tab;
  }

  showDetail(detail: TreasureVaultDetailView): void {
    if (this.detail && (this.detail.instanceId !== detail.instanceId || this.detail.buildingId !== detail.buildingId)) {
      this.itemSort = 'slot';
      this.organizeSubmitting = false;
    }
    this.detail = detail;
    this.activeTab = this.resolveVisibleTab(this.preferredTab, detail);
    this.root.classList.remove('hidden');
    this.render();
  }

  handleOperationResult(result: TreasureVaultOperationResultView): void {
    if (result.operation === 'deposit') {
      this.depositSubmitting = false;
      if (result.ok) {
        this.closeDepositPicker(true);
      } else if (this.depositPickerOpen) {
        this.patchDepositPickerSelection();
      }
    }
    if (result.operation === 'rename' && result.ok) {
      this.renaming = false;
    }
    if (result.operation === 'organize') {
      this.organizeSubmitting = false;
      if (result.ok) {
        this.itemSort = 'slot';
      } else {
        this.patchOrganizeButton();
      }
    }
    if (result.detail) {
      this.showDetail(result.detail);
    }
  }

  clear(): void {
    this.detail = null;
    this.currentPlayerId = null;
    this.inventoryItems = [];
    this.inventoryItemsSignature = '';
    this.activeTab = 'items';
    this.preferredTab = 'items';
    this.itemSort = 'slot';
    this.organizeSubmitting = false;
    this.renaming = false;
    this.closeDepositPicker(true);
    detailModalHost.close(TreasureVaultModal.ITEM_DETAIL_MODAL_OWNER);
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private bindEvents(): void {
    this.root.addEventListener('change', (event) => {
      const select = event.target instanceof HTMLSelectElement
        ? event.target.closest<HTMLSelectElement>('[data-vault-item-sort]')
        : null;
      if (!select) return;
      const sort = select.value as TreasureVaultItemSort;
      if (TREASURE_VAULT_ITEM_SORT_OPTIONS.some((option) => option.id === sort) && sort !== this.itemSort) {
        this.itemSort = sort;
        this.patchVaultItemOrder();
      }
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !event.target.matches('[data-vault-name-input]')) {
        return;
      }
      event.preventDefault();
      this.callbacks?.onRename(event.target.value);
    });
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) {
        this.clear();
        return;
      }
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
      if (action === 'begin-rename') {
        this.renaming = true;
        this.render();
        this.root.querySelector<HTMLInputElement>('[data-vault-name-input]')?.focus();
        return;
      }
      if (action === 'cancel-rename') {
        this.renaming = false;
        this.render();
        return;
      }
      if (action === 'rename') {
        const input = this.root.querySelector<HTMLInputElement>('[data-vault-name-input]');
        this.callbacks.onRename(input?.value ?? '');
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
      if (action === 'open-deposit-picker') {
        this.openDepositPicker();
        return;
      }
      if (action === 'organize') {
        if (this.organizeSubmitting || this.detail.ownerPlayerId !== this.currentPlayerId) return;
        this.organizeSubmitting = true;
        this.patchOrganizeButton();
        this.callbacks.onOrganize();
        return;
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

  private bindDepositPickerEvents(): void {
    this.depositPickerRoot.addEventListener('input', (event) => {
      const input = event.target instanceof HTMLInputElement
        ? event.target.closest<HTMLInputElement>('[data-vault-deposit-count]')
        : null;
      if (!input || this.depositSubmitting) return;
      this.updateDepositCountFromInput(input, false);
    });
    this.depositPickerRoot.addEventListener('change', (event) => {
      const input = event.target instanceof HTMLInputElement
        ? event.target.closest<HTMLInputElement>('[data-vault-deposit-count]')
        : null;
      if (input) {
        if (!this.depositSubmitting) this.updateDepositCountFromInput(input, true);
        return;
      }
      const select = event.target instanceof HTMLSelectElement
        ? event.target.closest<HTMLSelectElement>('[data-vault-deposit-sort]')
        : null;
      if (!select) return;
      const sort = select.value as TreasureVaultDepositSort;
      if (TREASURE_VAULT_DEPOSIT_SORT_OPTIONS.some((option) => option.id === sort) && sort !== this.depositSort) {
        this.depositSort = sort;
        this.depositPage = 0;
        this.renderDepositPicker();
      }
    });
    this.depositPickerRoot.addEventListener('click', (event) => {
      if (event.target === this.depositPickerRoot) {
        this.closeDepositPicker();
        return;
      }
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-vault-deposit-action]')
        : null;
      if (!target || !this.depositPickerOpen) return;
      const action = target.dataset.vaultDepositAction;
      if (action === 'close') {
        this.closeDepositPicker();
        return;
      }
      if (this.depositSubmitting) return;
      if (action === 'filter') {
        const filter = target.dataset.vaultDepositFilter as InventoryFilter | undefined;
        if (filter && INVENTORY_FILTER_TABS.some((tab) => tab.id === filter) && filter !== this.depositFilter) {
          this.depositFilter = filter;
          this.depositPage = 0;
          this.renderDepositPicker();
        }
        return;
      }
      if (action === 'toggle') {
        this.toggleDepositSelection(target.dataset.itemInstanceId ?? '');
        return;
      }
      if (action === 'decrease-count' || action === 'increase-count') {
        this.stepDepositCount(target.dataset.itemInstanceId ?? '', action === 'decrease-count' ? -1 : 1);
        return;
      }
      if (action === 'select-page') {
        this.toggleCurrentDepositPageSelection();
        return;
      }
      if (action === 'clear') {
        this.selectedDepositCounts.clear();
        this.patchDepositPickerSelection();
        return;
      }
      if (action === 'page') {
        const direction = target.dataset.vaultDepositPage;
        const snapshot = this.getDepositPickerSnapshot();
        this.depositPage = direction === 'prev'
          ? Math.max(0, snapshot.page - 1)
          : Math.min(snapshot.pageCount - 1, snapshot.page + 1);
        this.renderDepositPicker();
        return;
      }
      if (action === 'confirm' && !this.depositSubmitting && this.callbacks) {
        const items = this.getSelectedDepositItems();
        if (items.length === 0) return;
        this.depositSubmitting = true;
        this.patchDepositPickerSelection();
        this.callbacks.onDeposit(items);
      }
    });
  }

  private openDepositPicker(): void {
    if (!this.detail?.effectivePermissions.deposit || this.depositSubmitting) return;
    this.depositPickerOpen = true;
    this.depositFilter = 'all';
    this.depositPage = 0;
    this.selectedDepositCounts.clear();
    this.depositPickerRoot.classList.remove('hidden');
    this.renderDepositPicker();
  }

  private closeDepositPicker(force = false): void {
    if (this.depositSubmitting && !force) return;
    this.depositPickerOpen = false;
    this.depositSubmitting = false;
    this.depositPage = 0;
    this.selectedDepositCounts.clear();
    this.depositPickerRoot.classList.add('hidden');
    this.depositPickerRoot.innerHTML = '';
  }

  private renderDepositPicker(preserveScroll = false): void {
    if (!this.depositPickerOpen || !this.detail?.effectivePermissions.deposit) {
      this.closeDepositPicker(true);
      return;
    }
    const previousGridScrollTop = preserveScroll
      ? this.depositPickerRoot.querySelector<HTMLElement>('.treasure-vault-deposit-grid')?.scrollTop ?? 0
      : 0;
    const activeCountInput = preserveScroll && document.activeElement instanceof HTMLInputElement
      && this.depositPickerRoot.contains(document.activeElement)
      && document.activeElement.matches('[data-vault-deposit-count]')
      ? document.activeElement
      : null;
    const focusedCountSnapshot = activeCountInput
      ? {
          itemInstanceId: activeCountInput.dataset.itemInstanceId ?? '',
          value: activeCountInput.value,
        }
      : null;
    this.pruneDepositSelection();
    const snapshot = this.getDepositPickerSnapshot();
    this.depositPage = snapshot.page;
    const selectedCount = this.selectedDepositCounts.size;
    this.depositPickerRoot.innerHTML = `
      <div class="ui-modal-card ui-modal-card--wide treasure-vault-deposit-picker-card" role="dialog" aria-modal="true" aria-label="批量放入宝库物品">
        <div class="ui-modal-head treasure-vault-modal-head">
          <div>
            <div class="ui-modal-title">批量放入</div>
            <div class="ui-modal-subtitle">从背包选择物品 · 已选 <span data-vault-deposit-selected-count>${formatDisplayCountBadge(selectedCount)}</span> 组</div>
          </div>
          <button class="small-btn ghost" type="button" data-vault-deposit-action="close" ${this.depositSubmitting ? 'disabled' : ''}>关闭</button>
        </div>
        <div class="treasure-vault-deposit-picker-body">
          <div class="inventory-filter-tabs treasure-vault-deposit-filter-tabs">
            ${INVENTORY_FILTER_TABS.map((tab) => `
              <button class="inventory-filter-tab${this.depositFilter === tab.id ? ' active' : ''}" type="button" data-vault-deposit-action="filter" data-vault-deposit-filter="${escapeHtml(tab.id)}" ${this.depositSubmitting ? 'disabled' : ''}>
                ${escapeHtml(tab.label)}
              </button>
            `).join('')}
          </div>
          <div class="treasure-vault-deposit-toolbar">
            <label class="treasure-vault-deposit-sort">
              <span>排序</span>
              <select class="ui-input" data-vault-deposit-sort ${this.depositSubmitting ? 'disabled' : ''}>
                ${TREASURE_VAULT_DEPOSIT_SORT_OPTIONS.map((option) => `<option value="${option.id}" ${this.depositSort === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>
            <span class="treasure-vault-deposit-page-summary">当前页 ${formatDisplayCountBadge(snapshot.pageItems.length)} 组 · 共 ${formatDisplayCountBadge(snapshot.totalItems)} 组</span>
            <div class="treasure-vault-deposit-tools">
              <button class="small-btn ghost" type="button" data-vault-deposit-action="select-page" ${snapshot.pageItems.length === 0 || this.depositSubmitting ? 'disabled' : ''}>${snapshot.allPageSelected ? '取消当前页' : '选中当前页'}</button>
              <button class="small-btn ghost" type="button" data-vault-deposit-action="clear" ${selectedCount === 0 || this.depositSubmitting ? 'disabled' : ''}>清空</button>
            </div>
          </div>
          ${snapshot.pageItems.length > 0
            ? `<div class="inventory-grid treasure-vault-deposit-grid">${snapshot.pageItems.map((entry) => this.renderDepositInventoryCell(entry.item, entry.itemInstanceId)).join('')}</div>`
            : '<div class="empty-hint">当前类型下没有可存入物品</div>'}
          <div class="inventory-pagination treasure-vault-deposit-pagination">
            <button class="small-btn ghost" type="button" data-vault-deposit-action="page" data-vault-deposit-page="prev" ${snapshot.page <= 0 || this.depositSubmitting ? 'disabled' : ''}>上一页</button>
            <span class="inventory-pagination-status">第 ${snapshot.page + 1}/${snapshot.pageCount} 页</span>
            <button class="small-btn ghost" type="button" data-vault-deposit-action="page" data-vault-deposit-page="next" ${snapshot.page >= snapshot.pageCount - 1 || this.depositSubmitting ? 'disabled' : ''}>下一页</button>
          </div>
          <div class="ui-modal-actions treasure-vault-deposit-actions">
            <button class="small-btn ghost" type="button" data-vault-deposit-action="close" ${this.depositSubmitting ? 'disabled' : ''}>取消</button>
            <button class="small-btn" type="button" data-vault-deposit-action="confirm" ${selectedCount === 0 || this.depositSubmitting ? 'disabled' : ''}>${this.depositSubmitting ? '存入中…' : `存入已选（${formatDisplayCountBadge(selectedCount)}）`}</button>
          </div>
        </div>
      </div>
    `;
    const grid = this.depositPickerRoot.querySelector<HTMLElement>('.treasure-vault-deposit-grid');
    if (grid && preserveScroll) grid.scrollTop = previousGridScrollTop;
    if (focusedCountSnapshot?.itemInstanceId) {
      const restoredInput = Array.from(this.depositPickerRoot.querySelectorAll<HTMLInputElement>('[data-vault-deposit-count]'))
        .find((input) => input.dataset.itemInstanceId === focusedCountSnapshot.itemInstanceId);
      const availableCount = this.resolveDepositAvailableCount(focusedCountSnapshot.itemInstanceId);
      const parsedDraft = Math.trunc(Number(focusedCountSnapshot.value));
      if (restoredInput && availableCount > 0) {
        if (focusedCountSnapshot.value.trim() === ''
          || (Number.isFinite(parsedDraft) && normalizeTreasureVaultTransferCount(parsedDraft, availableCount) === parsedDraft)) {
          restoredInput.value = focusedCountSnapshot.value;
        }
        restoredInput.focus({ preventScroll: true });
      }
    }
  }

  private getDepositPickerSnapshot(): {
    page: number;
    pageCount: number;
    totalItems: number;
    pageItems: Array<{ item: SyncedItemStack; itemInstanceId: string; inventoryIndex: number }>;
    allPageSelected: boolean;
  } {
    const entries = this.getDepositableInventoryEntries()
      .filter((entry) => this.depositFilter === 'all' || entry.item.type === this.depositFilter)
      .sort((left, right) => this.compareDepositEntries(left, right));
    const pageCount = Math.max(1, Math.ceil(entries.length / TREASURE_VAULT_DEPOSIT_PAGE_SIZE));
    const page = Math.min(Math.max(0, this.depositPage), pageCount - 1);
    const pageItems = entries.slice(page * TREASURE_VAULT_DEPOSIT_PAGE_SIZE, (page + 1) * TREASURE_VAULT_DEPOSIT_PAGE_SIZE);
    return {
      page,
      pageCount,
      totalItems: entries.length,
      pageItems,
      allPageSelected: pageItems.length > 0 && pageItems.every((entry) => this.selectedDepositCounts.has(entry.itemInstanceId)),
    };
  }

  private getDepositableInventoryEntries(): Array<{ item: SyncedItemStack; itemInstanceId: string; inventoryIndex: number }> {
    const entries: Array<{ item: SyncedItemStack; itemInstanceId: string; inventoryIndex: number }> = [];
    for (let inventoryIndex = 0; inventoryIndex < this.inventoryItems.length; inventoryIndex += 1) {
      const item = this.inventoryItems[inventoryIndex];
      const itemInstanceId = typeof item?.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
      if (!item || !itemInstanceId || Math.max(0, Math.trunc(Number(item.count) || 0)) <= 0) continue;
      entries.push({ item, itemInstanceId, inventoryIndex });
    }
    return entries;
  }

  private compareDepositEntries(
    left: { item: SyncedItemStack; inventoryIndex: number },
    right: { item: SyncedItemStack; inventoryIndex: number },
  ): number {
    if (this.depositSort === 'quality') {
      const leftGrade = getItemDisplayMeta(left.item as ItemStack).grade;
      const rightGrade = getItemDisplayMeta(right.item as ItemStack).grade;
      const gradeOrder = resolveTechniqueGradeOrder(rightGrade) - resolveTechniqueGradeOrder(leftGrade);
      if (gradeOrder !== 0) return gradeOrder;
    } else if (this.depositSort === 'name') {
      const nameOrder = getItemDisplayMeta(left.item as ItemStack).displayItem.name.localeCompare(
        getItemDisplayMeta(right.item as ItemStack).displayItem.name,
        'zh-Hans-CN',
      );
      if (nameOrder !== 0) return nameOrder;
    } else if (this.depositSort === 'count') {
      const countOrder = Math.max(0, Math.trunc(Number(right.item.count) || 0)) - Math.max(0, Math.trunc(Number(left.item.count) || 0));
      if (countOrder !== 0) return countOrder;
    }
    return left.inventoryIndex - right.inventoryIndex;
  }

  private renderDepositInventoryCell(item: SyncedItemStack, itemInstanceId: string): string {
    const selected = this.selectedDepositCounts.has(itemInstanceId);
    const availableCount = Math.max(1, Math.trunc(Number(item.count) || 1));
    const selectedCount = normalizeTreasureVaultTransferCount(
      this.selectedDepositCounts.get(itemInstanceId) ?? availableCount,
      availableCount,
    );
    const itemMeta = getItemDisplayMeta(item as ItemStack);
    const displayName = itemMeta.displayItem.name;
    return `
      <div class="treasure-vault-deposit-item" data-vault-deposit-entry data-item-instance-id="${escapeHtml(itemInstanceId)}">
        <button class="${getItemDecorClassName('inventory-cell', item as ItemStack)} treasure-vault-deposit-cell${selected ? ' selected' : ''}" type="button" data-vault-deposit-action="toggle" data-item-instance-id="${escapeHtml(itemInstanceId)}" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${selected ? '取消选择' : '选择'}${escapeHtml(displayName)}" ${this.depositSubmitting ? 'disabled' : ''}>
          <span class="treasure-vault-deposit-check" aria-hidden="true">${selected ? '✓' : ''}</span>
          ${this.renderInventoryCellContent(item as ItemStack)}
        </button>
        <div class="treasure-vault-deposit-quantity" aria-hidden="${selected ? 'false' : 'true'}">
          ${renderTradeQuantityControl({
            value: selectedCount,
            min: 1,
            max: availableCount,
            inputAttrs: {
              'data-vault-deposit-count': true,
              'data-item-instance-id': itemInstanceId,
              'aria-label': `存入${displayName}数量`,
              disabled: !selected || this.depositSubmitting,
            },
            leftButtons: [{
              label: '-',
              attrs: {
                'data-vault-deposit-action': 'decrease-count',
                'data-item-instance-id': itemInstanceId,
                'aria-label': `减少${displayName}存入数量`,
              },
              disabled: !selected || this.depositSubmitting || selectedCount <= 1,
            }],
            rightButtons: [{
              label: '+',
              attrs: {
                'data-vault-deposit-action': 'increase-count',
                'data-item-instance-id': itemInstanceId,
                'aria-label': `增加${displayName}存入数量`,
              },
              disabled: !selected || this.depositSubmitting || selectedCount >= availableCount,
            }],
          })}
        </div>
      </div>
    `;
  }

  private toggleDepositSelection(itemInstanceId: string): void {
    if (!itemInstanceId || this.depositSubmitting) return;
    if (this.selectedDepositCounts.has(itemInstanceId)) {
      this.selectedDepositCounts.delete(itemInstanceId);
    } else if (this.selectedDepositCounts.size < MAX_TREASURE_VAULT_DEPOSIT_SELECTION) {
      const availableCount = this.resolveDepositAvailableCount(itemInstanceId);
      if (availableCount <= 0) return;
      this.selectedDepositCounts.set(itemInstanceId, availableCount);
    }
    this.patchDepositPickerSelection();
  }

  private toggleCurrentDepositPageSelection(): void {
    if (this.depositSubmitting) return;
    const snapshot = this.getDepositPickerSnapshot();
    if (snapshot.allPageSelected) {
      for (const entry of snapshot.pageItems) this.selectedDepositCounts.delete(entry.itemInstanceId);
    } else {
      for (const entry of snapshot.pageItems) {
        if (this.selectedDepositCounts.size >= MAX_TREASURE_VAULT_DEPOSIT_SELECTION) break;
        if (!this.selectedDepositCounts.has(entry.itemInstanceId)) {
          this.selectedDepositCounts.set(entry.itemInstanceId, Math.max(1, Math.trunc(Number(entry.item.count) || 1)));
        }
      }
    }
    this.patchDepositPickerSelection();
  }

  private patchDepositPickerSelection(): void {
    if (!this.depositPickerOpen) return;
    const snapshot = this.getDepositPickerSnapshot();
    const selectedCount = this.selectedDepositCounts.size;
    const selectedCountEl = this.depositPickerRoot.querySelector<HTMLElement>('[data-vault-deposit-selected-count]');
    if (selectedCountEl) selectedCountEl.textContent = formatDisplayCountBadge(selectedCount);
    for (const entry of this.depositPickerRoot.querySelectorAll<HTMLElement>('[data-vault-deposit-entry]')) {
      const itemInstanceId = entry.dataset.itemInstanceId ?? '';
      const selected = this.selectedDepositCounts.has(itemInstanceId);
      const cell = entry.querySelector<HTMLButtonElement>('[data-vault-deposit-action="toggle"]');
      if (!cell) continue;
      cell.classList.toggle('selected', selected);
      cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const itemName = cell.querySelector<HTMLElement>('.inventory-cell-name')?.textContent?.trim() ?? '物品';
      cell.setAttribute('aria-label', `${selected ? '取消选择' : '选择'}${itemName}`);
      cell.disabled = this.depositSubmitting;
      const check = cell.querySelector<HTMLElement>('.treasure-vault-deposit-check');
      if (check) check.textContent = selected ? '✓' : '';
      const quantityControl = entry.querySelector<HTMLElement>('.treasure-vault-deposit-quantity');
      quantityControl?.setAttribute('aria-hidden', selected ? 'false' : 'true');
      this.patchDepositQuantityControl(itemInstanceId);
    }
    const selectPageButton = this.depositPickerRoot.querySelector<HTMLButtonElement>('[data-vault-deposit-action="select-page"]');
    if (selectPageButton) {
      selectPageButton.textContent = snapshot.allPageSelected ? '取消当前页' : '选中当前页';
      selectPageButton.disabled = snapshot.pageItems.length === 0 || this.depositSubmitting;
    }
    const clearButton = this.depositPickerRoot.querySelector<HTMLButtonElement>('[data-vault-deposit-action="clear"]');
    if (clearButton) clearButton.disabled = selectedCount === 0 || this.depositSubmitting;
    const confirmButton = this.depositPickerRoot.querySelector<HTMLButtonElement>('[data-vault-deposit-action="confirm"]');
    if (confirmButton) {
      confirmButton.disabled = selectedCount === 0 || this.depositSubmitting;
      confirmButton.textContent = this.depositSubmitting ? '存入中…' : `存入已选（${formatDisplayCountBadge(selectedCount)}）`;
    }
    this.depositPickerRoot.querySelectorAll<HTMLButtonElement>('[data-vault-deposit-action="close"]').forEach((button) => {
      button.disabled = this.depositSubmitting;
    });
    const sort = this.depositPickerRoot.querySelector<HTMLSelectElement>('[data-vault-deposit-sort]');
    if (sort) sort.disabled = this.depositSubmitting;
  }

  private updateDepositCountFromInput(input: HTMLInputElement, commit: boolean): void {
    const itemInstanceId = input.dataset.itemInstanceId ?? '';
    const availableCount = this.resolveDepositAvailableCount(itemInstanceId);
    if (!this.selectedDepositCounts.has(itemInstanceId) || availableCount <= 0) return;
    if (!commit && input.value.trim() === '') return;
    const count = normalizeTreasureVaultTransferCount(input.value, availableCount);
    this.selectedDepositCounts.set(itemInstanceId, count);
    if (commit) input.value = String(count);
    this.patchDepositQuantityControl(itemInstanceId, !commit);
  }

  private stepDepositCount(itemInstanceId: string, step: -1 | 1): void {
    const availableCount = this.resolveDepositAvailableCount(itemInstanceId);
    const currentCount = this.selectedDepositCounts.get(itemInstanceId);
    if (currentCount === undefined || availableCount <= 0) return;
    this.selectedDepositCounts.set(
      itemInstanceId,
      normalizeTreasureVaultTransferCount(currentCount + step, availableCount),
    );
    this.patchDepositQuantityControl(itemInstanceId);
  }

  private patchDepositQuantityControl(itemInstanceId: string, preserveFocusedInput = false): void {
    const entry = Array.from(this.depositPickerRoot.querySelectorAll<HTMLElement>('[data-vault-deposit-entry]'))
      .find((candidate) => candidate.dataset.itemInstanceId === itemInstanceId);
    if (!entry) return;
    const selected = this.selectedDepositCounts.has(itemInstanceId);
    const availableCount = this.resolveDepositAvailableCount(itemInstanceId);
    const count = normalizeTreasureVaultTransferCount(
      this.selectedDepositCounts.get(itemInstanceId) ?? availableCount,
      availableCount,
    );
    if (selected) this.selectedDepositCounts.set(itemInstanceId, count);
    const input = entry.querySelector<HTMLInputElement>('[data-vault-deposit-count]');
    if (input) {
      input.min = '1';
      input.max = String(Math.max(1, availableCount));
      input.step = '1';
      if (!preserveFocusedInput || document.activeElement !== input) input.value = String(count);
      input.disabled = !selected || this.depositSubmitting;
    }
    entry.querySelectorAll<HTMLButtonElement>('[data-vault-deposit-action="decrease-count"], [data-vault-deposit-action="increase-count"]').forEach((button) => {
      button.disabled = !selected
        || this.depositSubmitting
        || (button.dataset.vaultDepositAction === 'decrease-count' ? count <= 1 : count >= availableCount);
    });
  }

  private pruneDepositSelection(): void {
    const availableById = new Map(
      this.getDepositableInventoryEntries().map((entry) => [
        entry.itemInstanceId,
        Math.max(1, Math.trunc(Number(entry.item.count) || 1)),
      ]),
    );
    for (const [itemInstanceId, count] of this.selectedDepositCounts) {
      const availableCount = availableById.get(itemInstanceId);
      if (availableCount === undefined) {
        this.selectedDepositCounts.delete(itemInstanceId);
      } else {
        this.selectedDepositCounts.set(itemInstanceId, normalizeTreasureVaultTransferCount(count, availableCount));
      }
    }
  }

  private getSelectedDepositItems(): Array<{ itemInstanceId: string; count: number }> {
    return this.getDepositableInventoryEntries()
      .filter((entry) => this.selectedDepositCounts.has(entry.itemInstanceId))
      .map((entry) => ({
        itemInstanceId: entry.itemInstanceId,
        count: normalizeTreasureVaultTransferCount(
          this.selectedDepositCounts.get(entry.itemInstanceId),
          entry.item.count,
        ),
      }));
  }

  private resolveDepositAvailableCount(itemInstanceId: string): number {
    const entry = this.getDepositableInventoryEntries().find((candidate) => candidate.itemInstanceId === itemInstanceId);
    return entry ? Math.max(1, Math.trunc(Number(entry.item.count) || 1)) : 0;
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
          <div class="treasure-vault-title-block">
            ${canEditPermissions && this.renaming
              ? `<div class="treasure-vault-rename-row">
                  <input type="text" maxlength="20" value="${escapeHtml(detail.buildingName)}" data-vault-name-input aria-label="宝库名称" />
                  <button class="small-btn" type="button" data-vault-action="rename">保存</button>
                  <button class="small-btn ghost" type="button" data-vault-action="cancel-rename">取消</button>
                </div>`
              : `<div class="treasure-vault-title-row">
                  <div class="ui-modal-title">${escapeHtml(detail.buildingName)}仓库</div>
                  ${canEditPermissions ? '<button class="small-btn ghost" type="button" data-vault-action="begin-rename">重命名</button>' : ''}
                </div>`}
            <div class="ui-modal-subtitle">${this.renderVaultSubtitle(detail)}</div>
          </div>
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
          <div class="treasure-vault-items-toolbar">
            <div class="panel-section-title">宝库物品</div>
            ${detail.effectivePermissions.view ? `
              <div class="treasure-vault-items-tools">
                <label class="treasure-vault-item-sort">
                  <span>排序</span>
                  <select class="ui-input" data-vault-item-sort aria-label="宝库物品排序">
                    ${TREASURE_VAULT_ITEM_SORT_OPTIONS.map((option) => `<option value="${option.id}" ${this.itemSort === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                  </select>
                </label>
                ${canEditPermissions
                  ? `<button class="small-btn ghost" type="button" data-vault-action="organize" ${detail.items.length === 0 || this.organizeSubmitting ? 'disabled' : ''}>${this.organizeSubmitting ? '整理中…' : '一键整理'}</button>`
                  : ''}
              </div>
            ` : ''}
          </div>
          ${this.renderItems(detail)}
        </section>
        <aside class="treasure-vault-section treasure-vault-section--actions">
          <div class="panel-section-title">存取</div>
          <div data-vault-deposit-state="${this.resolveVaultDepositState(detail)}">${this.renderDeposit(detail)}</div>
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
        ${this.getSortedVaultItems(detail.items).map((item) => `
          ${this.renderInventoryCell(item)}
        `).join('')}
      </div>
    `;
  }

  private getSortedVaultItems(items: TreasureVaultDetailView['items']): TreasureVaultDetailView['items'] {
    return [...items].sort((left, right) => this.compareVaultItems(left, right));
  }

  private compareVaultItems(
    left: TreasureVaultDetailView['items'][number],
    right: TreasureVaultDetailView['items'][number],
  ): number {
    if (this.itemSort === 'quality') {
      const leftGrade = getItemDisplayMeta(left as ItemStack).grade;
      const rightGrade = getItemDisplayMeta(right as ItemStack).grade;
      const gradeOrder = resolveTechniqueGradeOrder(rightGrade) - resolveTechniqueGradeOrder(leftGrade);
      if (gradeOrder !== 0) return gradeOrder;
    } else if (this.itemSort === 'name') {
      const nameOrder = getItemDisplayMeta(left as ItemStack).displayItem.name.localeCompare(
        getItemDisplayMeta(right as ItemStack).displayItem.name,
        'zh-Hans-CN',
      );
      if (nameOrder !== 0) return nameOrder;
    } else if (this.itemSort === 'count') {
      const countOrder = Math.max(0, Math.trunc(Number(right.count) || 0)) - Math.max(0, Math.trunc(Number(left.count) || 0));
      if (countOrder !== 0) return countOrder;
    }
    return left.slotIndex - right.slotIndex || left.storageItemId.localeCompare(right.storageItemId, 'zh-Hans-CN');
  }

  /** 仅移动现有物品节点，保持网格滚动、详情弹层和点击状态连续。 */
  private patchVaultItemOrder(): void {
    const detail = this.detail;
    const grid = this.root.querySelector<HTMLElement>('.treasure-vault-inventory-grid');
    if (!detail || !grid) return;
    const rowByStorageItemId = new Map<string, HTMLElement>();
    for (const row of grid.querySelectorAll<HTMLElement>('[data-vault-row="true"]')) {
      const storageItemId = row.dataset.storageItemId;
      if (storageItemId) rowByStorageItemId.set(storageItemId, row);
    }
    const fragment = document.createDocumentFragment();
    for (const item of this.getSortedVaultItems(detail.items)) {
      const row = rowByStorageItemId.get(item.storageItemId);
      if (row) fragment.appendChild(row);
    }
    grid.appendChild(fragment);
  }

  private patchOrganizeButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-vault-action="organize"]');
    if (!button) return;
    button.disabled = this.organizeSubmitting || (this.detail?.items.length ?? 0) === 0;
    button.textContent = this.organizeSubmitting ? '整理中…' : '一键整理';
  }

  private renderInventoryCell(item: TreasureVaultDetailView['items'][number]): string {
    const itemMeta = getItemDisplayMeta(item as ItemStack);
    const displayName = itemMeta.displayItem.name;
    const gradeLineLabel = this.getInventoryGradeLineLabel(item as ItemStack);
    return `
      <button class="${getItemDecorClassName('inventory-cell', item as ItemStack)}" type="button" data-vault-action="item-detail" data-storage-item-id="${escapeHtml(item.storageItemId)}" data-vault-row="true" data-item-type="${escapeHtml(item.type)}" ${itemMeta.grade ? `data-item-grade="${escapeHtml(itemMeta.grade)}"` : ''} ${gradeLineLabel ? 'data-item-grade-line-visible="true"' : ''} aria-label="查看${escapeHtml(displayName)}详情">
        ${this.renderInventoryCellContent(item as ItemStack)}
      </button>
    `;
  }

  private renderInventoryCellContent(item: ItemStack): string {
    const itemMeta = getItemDisplayMeta(item);
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
      <div class="inventory-cell-head">
        <span class="inventory-cell-type" ${ribbon ? '' : 'hidden'}>${escapeHtml(ribbon?.label ?? '')}</span>
        <span class="inventory-cell-count">${escapeHtml(formatDisplayCountBadge(item.count))}</span>
      </div>
      <span class="inventory-cell-learned-ribbon" ${learnedRibbon ? '' : 'hidden'}>${escapeHtml(learnedRibbon?.label ?? '')}</span>
      <div class="inventory-cell-grade-line" ${gradeLineLabel ? '' : 'hidden'}>${escapeHtml(gradeLineLabel ?? '')}</div>
      <div class="inventory-cell-name" aria-label="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
      ${levelChip}
      ${enhanceChip}
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
        const availableCount = Math.max(1, Math.trunc(Number(item.count) || 1));
        const countInput = body.querySelector<HTMLInputElement>('[data-vault-detail-withdraw-count]');
        const patchCountControl = (value: unknown, commit: boolean): number => {
          const count = normalizeTreasureVaultTransferCount(value, availableCount);
          if (countInput && commit) countInput.value = String(count);
          body.querySelectorAll<HTMLButtonElement>('[data-vault-detail-withdraw-step]').forEach((button) => {
            button.disabled = button.dataset.vaultDetailWithdrawStep === 'decrease'
              ? count <= 1
              : count >= availableCount;
          });
          return count;
        };
        countInput?.addEventListener('input', () => {
          if (countInput.value.trim() !== '') patchCountControl(countInput.value, false);
        }, { signal });
        countInput?.addEventListener('change', () => {
          patchCountControl(countInput.value, true);
        }, { signal });
        body.querySelectorAll<HTMLButtonElement>('[data-vault-detail-withdraw-step]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!countInput) return;
            const currentCount = normalizeTreasureVaultTransferCount(countInput.value, availableCount);
            const step = button.dataset.vaultDetailWithdrawStep === 'decrease' ? -1 : 1;
            patchCountControl(currentCount + step, true);
          }, { signal });
        });
        body.querySelectorAll<HTMLElement>('[data-vault-detail-withdraw]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            const count = button.dataset.vaultDetailWithdraw === 'all'
              ? availableCount
              : normalizeTreasureVaultTransferCount(countInput?.value, availableCount);
            this.callbacks?.onWithdraw(item.storageItemId, count);
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
    const availableCount = Math.max(1, Math.trunc(Number(item.count) || 1));
    const actionHtml = canWithdraw
      ? `<div class="treasure-vault-withdraw-quantity">
          <span>取出数量</span>
          ${renderTradeQuantityControl({
            value: 1,
            min: 1,
            max: availableCount,
            inputAttrs: {
              'data-vault-detail-withdraw-count': true,
              'aria-label': '取出数量',
            },
            leftButtons: [{
              label: '-',
              attrs: {
                'data-vault-detail-withdraw-step': 'decrease',
                'aria-label': '减少取出数量',
              },
              disabled: true,
            }],
            rightButtons: [{
              label: '+',
              attrs: {
                'data-vault-detail-withdraw-step': 'increase',
                'aria-label': '增加取出数量',
              },
              disabled: availableCount <= 1,
            }],
          })}
        </div>
        <div class="inventory-detail-actions"><div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch"><button class="small-btn ghost" type="button" data-vault-detail-withdraw="custom">取出指定数量</button><button class="small-btn" type="button" data-vault-detail-withdraw="all">取出全部</button></div></div>`
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
    if (item.type === 'skill_book') {
      const isFragment = this.isTechniqueBookFragment(item);
      return {
        label: isFragment ? '残卷' : '功法',
        title: isFragment ? '功法残卷' : '完整功法书',
      };
    }
    if (itemMeta.affinityBadge) {
      return {
        label: itemMeta.affinityBadge.label,
        title: itemMeta.affinityBadge.title,
      };
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

  private isTechniqueBookFragment(item: ItemStack): boolean {
    if (item.type !== 'skill_book') {
      return false;
    }
    const rawLearnMaxLevel = Number(item.learnTechniqueMaxLevel);
    if (!Number.isFinite(rawLearnMaxLevel)) {
      return false;
    }
    const techniqueId = typeof item.learnTechniqueId === 'string' && item.learnTechniqueId.trim()
      ? item.learnTechniqueId.trim()
      : resolveTechniqueIdFromBookItemId(item.itemId);
    if (!techniqueId) {
      return true;
    }
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique) {
      return true;
    }
    const templateMaxLevel = getTechniqueMaxLevel(
      Array.isArray(technique.layers) ? technique.layers : undefined,
      1,
    );
    const learnMaxLevel = Math.max(1, Math.min(templateMaxLevel, Math.floor(rawLearnMaxLevel)));
    return learnMaxLevel < templateMaxLevel;
  }

  private renderDeposit(detail: TreasureVaultDetailView): string {
    if (!detail.effectivePermissions.deposit) {
      return '<div class="empty-hint compact">无权向宝库存入物品</div>';
    }
    if (this.getDepositableInventoryEntries().length === 0) {
      return '<div class="empty-hint compact">背包里暂无可存入物品</div>';
    }
    return `
      <div class="treasure-vault-deposit-entry">
        <div class="panel-subtext">从背包按类型筛选并多选物品，可一次存入多组完整堆叠。</div>
        <button class="small-btn" type="button" data-vault-action="open-deposit-picker">批量放入</button>
      </div>
    `;
  }

  /** 背包真实变化只在「不可存 / 无物品 / 可存」状态切换时更新主弹层的小区域。 */
  private patchVaultDepositState(): void {
    const detail = this.detail;
    const root = this.root.querySelector<HTMLElement>('[data-vault-deposit-state]');
    if (!detail || !root) return;
    const nextState = this.resolveVaultDepositState(detail);
    if (root.dataset.vaultDepositState === nextState) return;
    root.dataset.vaultDepositState = nextState;
    root.replaceChildren(createFragmentFromHtml(this.renderDeposit(detail)));
  }

  private resolveVaultDepositState(detail: TreasureVaultDetailView): 'forbidden' | 'empty' | 'available' {
    if (!detail.effectivePermissions.deposit) return 'forbidden';
    return this.getDepositableInventoryEntries().length > 0 ? 'available' : 'empty';
  }

  private buildInventoryItemsSignature(items: SyncedItemStack[]): string {
    const encode = (value: unknown): string => {
      const text = String(value ?? '');
      return `${text.length}:${text}`;
    };
    return items.map((item, index) => [
      index,
      item.itemInstanceId,
      item.count,
      item.type,
      item.name,
      createItemStackSignature(item as ItemStack),
    ].map(encode).join('')).join('|');
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

function isSocialPanelTab(value: string | undefined): value is SocialPanelTab {
  return SOCIAL_PANEL_TABS.some((entry) => entry.id === value);
}

function formatSocialUnreadCount(count: number): string {
  const normalized = Math.max(0, Math.trunc(count));
  return normalized > 99 ? '99+' : String(normalized);
}

function normalizeSocialPanelView(view: SocialPanelView | null | undefined): SocialPanelView {
  return {
    relations: Array.isArray(view?.relations) ? view.relations : [],
    incomingRequests: Array.isArray(view?.incomingRequests) ? view.incomingRequests : [],
    outgoingRequests: Array.isArray(view?.outgoingRequests) ? view.outgoingRequests : [],
    nearbyCandidates: Array.isArray(view?.nearbyCandidates) ? view.nearbyCandidates : [],
    conversations: Array.isArray(view?.conversations) ? view.conversations : [],
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

function resolveTechniqueGradeOrder(grade: unknown): number {
  const index = TECHNIQUE_GRADE_ORDER.indexOf(grade as never);
  return index >= 0 ? index : -1;
}
