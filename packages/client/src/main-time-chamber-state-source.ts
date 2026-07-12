/** 密室控制台的客户端低频投影与意图编排。 */
import type {
  PlayerState,
  TimeChamberDetailView,
  TimeChamberOperationKind,
  TimeChamberOperationResultView,
  TimeChamberSizeTier,
} from '@mud/shared';

import type { SocketBuildingSender } from './network/socket-send-building';
import type { ToastKind } from './main-app-assembly-types';
import { TimeChamberConsoleModal } from './ui/time-chamber-console-modal';

const DETAIL_REFRESH_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

type MainTimeChamberStateSourceOptions = {
  modal: TimeChamberConsoleModal;
  socket: SocketBuildingSender;
  getPlayer: () => PlayerState | null;
  showToast: (message: string, kind?: ToastKind) => void;
};

const FAILURE_TEXT: Record<string, string> = {
  request_id_required: '密室请求已失效，请重新操作',
  time_chamber_not_found: '密室不存在或尚未建造完成',
  time_chamber_too_far: '需要靠近密室控制台才能管理',
  time_chamber_owner_required: '只有建造者可以管理密室',
  time_chamber_persistence_disabled: '密室持久化服务暂不可用',
  time_chamber_state_create_failed: '密室独立空间创建失败，请稍后重试',
  time_chamber_unavailable: '密室实例暂不可用，请稍后重试',
  invalid_spirit_stone_count: '投入的灵石数量无效',
  insufficient_spirit_stone: '背包中的灵石不足',
  durable_inventory_unavailable: '资产持久化服务暂不可用',
  inventory_grant_lease_context_required: '当前位置写入权暂不可用，请稍后重试',
  invalid_time_chamber_speed: '时间流速超出允许范围',
  time_chamber_fuel_empty: '请先投入灵石再开启高倍流速',
  invalid_time_chamber_name: '名称需为 1 至 20 个有效字符',
  invalid_time_chamber_size: '该空间尺寸不可用',
  time_chamber_occupied: '密室有人时不能调整空间',
  time_chamber_not_empty: '密室内部存在对象，暂时不能调整空间',
  time_chamber_revision_conflict: '密室状态已变化，请重新操作',
  time_chamber_operation_failed: '密室操作暂未完成，请稍后重试',
  time_chamber_fuel_limit: '密室燃料储备已达到上限',
  time_chamber_deposit_failed: '投入灵石失败，请稍后重试',
};

export function createMainTimeChamberStateSource(options: MainTimeChamberStateSourceOptions) {
  let detail: TimeChamberDetailView | null = null;
  let activeDetailRequestId: string | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let detailRequestTimeout: ReturnType<typeof setTimeout> | null = null;
  const pendingRequestIdByOperation = new Map<Exclude<TimeChamberOperationKind, 'detail'>, string>();
  const mutationTimeoutByOperation = new Map<Exclude<TimeChamberOperationKind, 'detail'>, ReturnType<typeof setTimeout>>();

  const clearDetailRequest = (): void => {
    activeDetailRequestId = null;
    if (detailRequestTimeout !== null) clearTimeout(detailRequestTimeout);
    detailRequestTimeout = null;
  };

  const requestDetail = (sourceInstanceId: string, buildingId: string): void => {
    clearDetailRequest();
    const requestId = buildRequestId('detail');
    activeDetailRequestId = requestId;
    options.socket.sendRequestTimeChamber({ sourceInstanceId, buildingId, requestId });
    detailRequestTimeout = setTimeout(() => {
      if (activeDetailRequestId !== requestId) return;
      clearDetailRequest();
      if (!detail && options.modal.isOpen()) {
        stopAutoRefresh();
        options.modal.clear();
        options.showToast('读取密室状态超时，请重新打开控制台', 'warn');
      }
    }, REQUEST_TIMEOUT_MS);
  };

  const stopAutoRefresh = (): void => {
    if (refreshTimer !== null) clearInterval(refreshTimer);
    refreshTimer = null;
  };

  const startAutoRefresh = (): void => {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
      if (!options.modal.isOpen()) {
        stopAutoRefresh();
        return;
      }
      if (detail && !activeDetailRequestId && pendingRequestIdByOperation.size === 0) {
        requestDetail(detail.sourceInstanceId, detail.buildingId);
      }
    }, DETAIL_REFRESH_INTERVAL_MS);
  };

  const sendOperation = (operation: Exclude<TimeChamberOperationKind, 'detail'>, send: (current: TimeChamberDetailView, requestId: string) => void): void => {
    if (!detail) {
      options.showToast('密室状态尚未加载', 'warn');
      return;
    }
    if (pendingRequestIdByOperation.size > 0) {
      options.showToast('上一项密室操作仍在处理中', 'warn');
      return;
    }
    // 变更请求以当前控制台 revision 为准，作废可能携带旧 revision 的轮询响应。
    clearDetailRequest();
    const requestId = buildRequestId(operation);
    pendingRequestIdByOperation.set(operation, requestId);
    options.modal.setPending(operation, true);
    mutationTimeoutByOperation.set(operation, setTimeout(() => {
      if (pendingRequestIdByOperation.get(operation) !== requestId) return;
      pendingRequestIdByOperation.delete(operation);
      mutationTimeoutByOperation.delete(operation);
      options.modal.setPending(operation, false);
      options.showToast('密室操作响应超时，请确认状态后重试', 'warn');
      if (detail && options.modal.isOpen()) {
        requestDetail(detail.sourceInstanceId, detail.buildingId);
      }
    }, REQUEST_TIMEOUT_MS));
    send(detail, requestId);
  };

  const clearMutationRequests = (): void => {
    pendingRequestIdByOperation.clear();
    for (const timeout of mutationTimeoutByOperation.values()) clearTimeout(timeout);
    mutationTimeoutByOperation.clear();
  };

  options.modal.setCallbacks({
    onClose: () => {
      detail = null;
      clearDetailRequest();
      clearMutationRequests();
      stopAutoRefresh();
    },
    onDeposit: (spiritStoneCount) => sendOperation('deposit', (current, requestId) => options.socket.sendDepositTimeChamberFuel({
      sourceInstanceId: current.sourceInstanceId,
      buildingId: current.buildingId,
      requestId,
      spiritStoneCount,
    })),
    onSetSpeed: (speed) => sendOperation('speed', (current, requestId) => options.socket.sendSetTimeChamberSpeed({
      sourceInstanceId: current.sourceInstanceId,
      buildingId: current.buildingId,
      requestId,
      speed,
      expectedRevision: current.revision,
    })),
    onRename: (name) => sendOperation('rename', (current, requestId) => options.socket.sendRenameTimeChamber({
      sourceInstanceId: current.sourceInstanceId,
      buildingId: current.buildingId,
      requestId,
      name,
      expectedRevision: current.revision,
    })),
    onResize: (sizeTier: TimeChamberSizeTier) => sendOperation('resize', (current, requestId) => options.socket.sendResizeTimeChamber({
      sourceInstanceId: current.sourceInstanceId,
      buildingId: current.buildingId,
      requestId,
      sizeTier,
      expectedRevision: current.revision,
    })),
  });

  return {
    open(buildingId: string): void {
      const player = options.getPlayer();
      const normalizedBuildingId = buildingId.trim();
      if (!player?.instanceId || !normalizedBuildingId) {
        options.showToast('当前无法定位密室入口', 'warn');
        return;
      }
      detail = null;
      clearDetailRequest();
      clearMutationRequests();
      options.modal.openPending();
      requestDetail(player.instanceId, normalizedBuildingId);
      startAutoRefresh();
    },

    handleOperationResult(result: TimeChamberOperationResultView): void {
      const requestId = typeof result.requestId === 'string' ? result.requestId.trim() : '';
      if (result.operation === 'detail') {
        if (!requestId || requestId !== activeDetailRequestId) return;
        clearDetailRequest();
      } else {
        const expectedRequestId = pendingRequestIdByOperation.get(result.operation);
        if (!requestId || requestId !== expectedRequestId) return;
        pendingRequestIdByOperation.delete(result.operation);
        const timeout = mutationTimeoutByOperation.get(result.operation);
        if (timeout !== undefined) clearTimeout(timeout);
        mutationTimeoutByOperation.delete(result.operation);
        options.modal.setPending(result.operation, false);
      }
      if (result.detail) {
        detail = result.detail;
        if (options.modal.isOpen()) {
          options.modal.showDetail(result.detail);
        }
      }
      if (!result.ok) {
        options.showToast(FAILURE_TEXT[result.reason ?? ''] ?? '密室操作失败，请稍后重试', 'warn');
        if (result.operation === 'detail') {
          detail = null;
          stopAutoRefresh();
          options.modal.clear();
        }
        if (result.reason === 'time_chamber_revision_conflict' && detail) {
          requestDetail(detail.sourceInstanceId, detail.buildingId);
        }
        return;
      }
      if (result.operation !== 'detail') {
        options.showToast(operationSuccessText(result.operation), 'success');
      }
    },

    clear(): void {
      detail = null;
      clearDetailRequest();
      clearMutationRequests();
      stopAutoRefresh();
      options.modal.clear();
    },
  };
}

export type MainTimeChamberStateSource = ReturnType<typeof createMainTimeChamberStateSource>;

function buildRequestId(operation: string): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return `time-chamber:${operation}:${random}`;
}

function operationSuccessText(operation: TimeChamberOperationKind): string {
  if (operation === 'deposit') return '灵石已投入密室';
  if (operation === 'speed') return '密室时间流速已更新';
  if (operation === 'rename') return '密室名称已更新';
  if (operation === 'resize') return '密室空间已调整';
  return '密室状态已更新';
}
