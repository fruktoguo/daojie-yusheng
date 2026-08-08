/** 本文件负责道友面板和宝库弹层的客户端状态装配。 */
import type {
  DaoistDirectMessageHistoryView,
  DaoistDirectMessageView,
  PlayerState,
  SocialOperationResultView,
  SocialPanelView,
  SyncedItemStack,
  TreasureVaultDetailView,
  TreasureVaultOperationResultView,
} from '@mud/shared';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import type { ToastKind } from './main-app-assembly-types';
import { SocialPanel, TreasureVaultModal } from './ui/panels/social-panel';
import type { TreasureVaultModalTab } from './ui/panels/social-panel';
import { appendDaoistMessages, loadRecentDaoistMessages } from './ui/daoist-message-storage';
import type { AccessPolicySocketClient } from './ui/access-policy-socket-client';

type MainSocialStateSourceOptions = {
  socialPanel: SocialPanel;
  treasureVaultModal: TreasureVaultModal;
  socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestSocialPanel'
    | 'sendRequestNearbyDaoistCandidates'
    | 'sendDaoistRequest'
    | 'respondDaoistRequest'
    | 'updateDaoistRelationLevel'
    | 'removeDaoistRelation'
    | 'sendDaoistDirectMessage'
    | 'requestDaoistDirectMessageHistory'
    | 'markDaoistDirectMessagesRead'
    | 'sendRequestTreasureVault'
    | 'sendTreasureVaultDeposit'
    | 'sendTreasureVaultWithdraw'
    | 'sendOrganizeTreasureVault'
    | 'sendRenameTreasureVault'
  >;
  accessPolicyClient: AccessPolicySocketClient;
  showToast(message: string, kind?: ToastKind): void;
  getPlayer(): PlayerState | null;
  hydrateInventoryItem(item: SyncedItemStack, previous?: PlayerState['inventory']['items'][number]): PlayerState['inventory']['items'][number];
};

export type MainSocialStateSource = ReturnType<typeof createMainSocialStateSource>;

const SOCIAL_REASON_LABELS: Record<string, string> = {
  invalid_target: '目标无效',
  target_not_nearby: '目标不在附近',
  already_related: '已经是道友',
  request_already_pending: '已有待处理申请',
  relation_not_found: '未建立道友关系',
  invalid_message: '消息为空或目标无效',
  message_channel_busy: '私聊消息较多，请稍后再试',
  message_persistence_failed: '消息保存失败，请稍后重试',
  social_persistence_disabled: '道友系统暂不可用',
};

const VAULT_REASON_LABELS: Record<string, string> = {
  treasure_vault_persistence_disabled: '宝库暂不可用',
  building_not_found: '宝库不存在',
  instance_not_found: '地图实例不存在',
  not_treasure_vault: '目标不是宝库',
  treasure_vault_permission_denied: '没有宝库权限',
  treasure_vault_owner_required: '只有建造者可修改宝库设置',
  invalid_treasure_vault_name: '宝库名称需为 1 至 20 个字符',
  treasure_vault_organize_failed: '宝库整理失败，请稍后重试',
  treasure_vault_full: '宝库已满',
  storage_item_not_found: '宝库物品不存在',
  inventory_full: '背包已满',
  invalid_item: '物品无效',
};

export function createMainSocialStateSource(options: MainSocialStateSourceOptions) {
  options.socialPanel.setCallbacks({
    onRefresh: () => options.socket.sendRequestSocialPanel(),
    onScanNearby: () => options.socket.sendRequestNearbyDaoistCandidates(),
    onSendRequest: (targetPlayerId) => options.socket.sendDaoistRequest(targetPlayerId),
    onRespondRequest: (requestId, accept) => options.socket.respondDaoistRequest(requestId, accept),
    onUpdateRelationLevel: (targetPlayerId, level) => options.socket.updateDaoistRelationLevel(targetPlayerId, level),
    onRemoveRelation: (targetPlayerId) => options.socket.removeDaoistRelation(targetPlayerId),
    onSendMessage: (targetPlayerId, message) => options.socket.sendDaoistDirectMessage(targetPlayerId, message),
    onOpenConversation: (targetPlayerId) => {
      void syncConversation(targetPlayerId);
    },
  });
  options.treasureVaultModal.setCallbacks({
    onDeposit: (items) => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendTreasureVaultDeposit({ buildingId: detail.buildingId, instanceId: detail.instanceId, items });
    },
    onWithdraw: (storageItemId, count) => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendTreasureVaultWithdraw({ buildingId: detail.buildingId, instanceId: detail.instanceId, storageItemId, count });
    },
    onOrganize: () => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendOrganizeTreasureVault({ buildingId: detail.buildingId, instanceId: detail.instanceId });
    },
    onPermissionsSaved: () => options.showToast('权限已保存。', 'success'),
    onRename: (name) => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendRenameTreasureVault({ buildingId: detail.buildingId, instanceId: detail.instanceId, name });
    },
  });
  options.treasureVaultModal.setAccessPolicyClient(options.accessPolicyClient);

  let currentTreasureVaultDetail: TreasureVaultDetailView | null = null;
  let currentPlayerId: string | null = null;
  let lastKnownUnreadCount = 0;
  let conversationSyncToken = 0;
  const conversationHistoryRequestIds = new Map<string, string>();

  function syncPlayerContext(player: PlayerState | null): void {
    const nextPlayerId = player?.id ?? null;
    if (nextPlayerId !== currentPlayerId) {
      currentPlayerId = nextPlayerId;
      lastKnownUnreadCount = 0;
      conversationSyncToken += 1;
      conversationHistoryRequestIds.clear();
    }
    const inventoryItems = Array.isArray(player?.inventory?.items)
      ? player.inventory.items.map((item, index) => options.hydrateInventoryItem(item, player.inventory.items[index]))
      : [];
    options.treasureVaultModal.setCurrentPlayer(player?.id ?? null, inventoryItems);
  }

  async function syncConversation(peerPlayerId: string): Promise<void> {
    const playerId = currentPlayerId ?? options.getPlayer()?.id ?? null;
    if (!playerId || !peerPlayerId) {
      return;
    }
    const token = ++conversationSyncToken;
    const localMessages = await loadRecentDaoistMessages(playerId, peerPlayerId, 100);
    if (token !== conversationSyncToken || playerId !== (currentPlayerId ?? options.getPlayer()?.id ?? null)) {
      return;
    }
    if (localMessages.length > 0) {
      options.socialPanel.mergeConversationMessages(peerPlayerId, localMessages);
    }
    const latest = localMessages[localMessages.length - 1];
    const requestId = `daoist-history:${token}:${Date.now()}`;
    conversationHistoryRequestIds.set(peerPlayerId, requestId);
    options.socket.requestDaoistDirectMessageHistory(peerPlayerId, latest ? {
      occurredAt: latest.sentAt,
      messageId: latest.messageId,
    } : undefined, requestId);
  }

  function markVisibleIncomingMessageRead(peerPlayerId: string, message: DaoistDirectMessageView): void {
    const playerId = currentPlayerId ?? options.getPlayer()?.id ?? null;
    if (!playerId || message.fromPlayerId !== peerPlayerId || message.toPlayerId !== playerId) {
      return;
    }
    options.socialPanel.markConversationRead(peerPlayerId);
    options.socket.markDaoistDirectMessagesRead(peerPlayerId, {
      occurredAt: message.sentAt,
      messageId: message.messageId,
    });
  }

  return {
    init(): void {
      options.socket.sendRequestSocialPanel();
      syncPlayerContext(options.getPlayer());
    },
    clear(): void {
      currentTreasureVaultDetail = null;
      currentPlayerId = null;
      lastKnownUnreadCount = 0;
      conversationSyncToken += 1;
      conversationHistoryRequestIds.clear();
      options.socialPanel.clear();
      options.treasureVaultModal.clear();
    },
    syncPlayerContext,
    openTreasureVault(buildingId: string, initialTab: TreasureVaultModalTab = 'items'): void {
      const normalizedBuildingId = buildingId.trim();
      if (!normalizedBuildingId) return;
      options.treasureVaultModal.setPreferredTab(initialTab);
      options.socket.sendRequestTreasureVault({ buildingId: normalizedBuildingId });
    },
    handleSocialPanel(view: SocialPanelView): void {
      options.socialPanel.update(view);
      const unreadCount = (view.conversations ?? []).reduce(
        (total, entry) => total + Math.max(0, Math.trunc(Number(entry?.unreadCount) || 0)),
        0,
      );
      if (unreadCount > lastKnownUnreadCount) {
        options.showToast(`你有 ${unreadCount} 条未读私聊`, 'chat');
      }
      lastKnownUnreadCount = unreadCount;
    },
    handleSocialOperationResult(result: SocialOperationResultView): void {
      if (result.panel) {
        options.socialPanel.update(result.panel);
      }
      if (result.ok !== true && result.reason) {
        options.showToast(SOCIAL_REASON_LABELS[result.reason] ?? result.reason, 'warn');
      }
    },
    handleDaoistDirectMessage(message: DaoistDirectMessageView): void {
      const player = options.getPlayer();
      const playerId = player?.id ?? currentPlayerId;
      if (!playerId || (message.fromPlayerId !== playerId && message.toPlayerId !== playerId)) {
        return;
      }
      const peerPlayerId = message.fromPlayerId === playerId ? message.toPlayerId : message.fromPlayerId;
      const incoming = Boolean(playerId && message.toPlayerId === playerId && message.fromPlayerId !== playerId);
      const visible = options.socialPanel.isConversationOpenAndVisible(peerPlayerId);
      options.socialPanel.appendMessage(message, playerId ?? null);
      const persistence = playerId
        ? appendDaoistMessages(playerId, peerPlayerId, [message])
        : Promise.resolve(false);
      if (incoming && !visible) {
        lastKnownUnreadCount += 1;
        options.showToast(`收到来自 ${message.fromName} 的私聊：${message.text}`, 'chat');
      } else if (incoming) {
        void persistence.then(() => {
          if (playerId === (currentPlayerId ?? options.getPlayer()?.id ?? null)) {
            markVisibleIncomingMessageRead(peerPlayerId, message);
          }
        });
      }
    },
    handleDaoistDirectMessageHistory(history: DaoistDirectMessageHistoryView): void {
      const playerId = currentPlayerId ?? options.getPlayer()?.id ?? null;
      if (!playerId || !history.peerPlayerId || !Array.isArray(history.messages)) {
        return;
      }
      const expectedRequestId = conversationHistoryRequestIds.get(history.peerPlayerId);
      if (!history.requestId || history.requestId !== expectedRequestId) {
        return;
      }
      conversationHistoryRequestIds.delete(history.peerPlayerId);
      const messages = history.messages.filter((message) => (
        (message.fromPlayerId === playerId && message.toPlayerId === history.peerPlayerId)
        || (message.fromPlayerId === history.peerPlayerId && message.toPlayerId === playerId)
      ));
      options.socialPanel.mergeConversationMessages(history.peerPlayerId, messages);
      const latestIncoming = options.socialPanel.getLatestIncomingMessage(history.peerPlayerId, playerId);
      const visible = options.socialPanel.isConversationOpenAndVisible(history.peerPlayerId);
      const persistence = appendDaoistMessages(playerId, history.peerPlayerId, messages);
      if (visible && latestIncoming) {
        void persistence.then(() => {
          if (playerId === (currentPlayerId ?? options.getPlayer()?.id ?? null)
            && options.socialPanel.isConversationOpenAndVisible(history.peerPlayerId)) {
            markVisibleIncomingMessageRead(history.peerPlayerId, latestIncoming);
          }
        });
      }
    },
    handleTreasureVaultDetail(detail: TreasureVaultDetailView): void {
      currentTreasureVaultDetail = detail;
      syncPlayerContext(options.getPlayer());
      options.treasureVaultModal.showDetail(detail);
    },
    handleTreasureVaultOperationResult(result: TreasureVaultOperationResultView): void {
      if (result.detail) {
        currentTreasureVaultDetail = result.detail;
      }
      options.treasureVaultModal.handleOperationResult(result);
      if (result.ok === true && result.operation === 'rename') {
        options.showToast('宝库重命名成功', 'success');
      } else if (result.ok === true && result.operation === 'organize') {
        options.showToast('宝库整理完成', 'success');
      } else if (result.ok !== true && result.reason) {
        options.showToast(VAULT_REASON_LABELS[result.reason] ?? result.reason, 'warn');
      }
    },
  };
}
