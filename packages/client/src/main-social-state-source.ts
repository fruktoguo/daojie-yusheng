/** 本文件负责道友面板和宝库弹层的客户端状态装配。 */
import type {
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
    | 'sendRequestTreasureVault'
    | 'sendTreasureVaultDeposit'
    | 'sendTreasureVaultWithdraw'
    | 'sendUpdateTreasureVaultPermissions'
    | 'sendRenameTreasureVault'
  >;
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
    onUpdatePermissions: (permissions) => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendUpdateTreasureVaultPermissions({ buildingId: detail.buildingId, instanceId: detail.instanceId, permissions });
    },
    onRename: (name) => {
      const detail = currentTreasureVaultDetail;
      if (!detail) return;
      options.socket.sendRenameTreasureVault({ buildingId: detail.buildingId, instanceId: detail.instanceId, name });
    },
  });

  let currentTreasureVaultDetail: TreasureVaultDetailView | null = null;

  function syncPlayerContext(player: PlayerState | null): void {
    const inventoryItems = Array.isArray(player?.inventory?.items)
      ? player.inventory.items.map((item, index) => options.hydrateInventoryItem(item, player.inventory.items[index]))
      : [];
    options.treasureVaultModal.setCurrentPlayer(player?.id ?? null, inventoryItems);
  }

  return {
    init(): void {
      options.socket.sendRequestSocialPanel();
      syncPlayerContext(options.getPlayer());
    },
    clear(): void {
      currentTreasureVaultDetail = null;
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
      options.socialPanel.appendMessage(message, player?.id ?? null);
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
      if (result.ok === true && result.operation === 'permissions') {
        options.showToast('宝库权限更新成功', 'success');
      } else if (result.ok === true && result.operation === 'rename') {
        options.showToast('宝库重命名成功', 'success');
      } else if (result.ok !== true && result.reason) {
        options.showToast(VAULT_REASON_LABELS[result.reason] ?? result.reason, 'warn');
      }
    },
  };
}
