/**
 * 本文件是客户端 DOM UI 的 offline gain modal 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import { S2C, type ServerToClientEventPayload, type OfflineGainReportView } from '@mud/shared';
import { detailModalHost } from './detail-modal-host';
import {
  storePlayerStatisticTotalsInBrowser,
  storePlayerStatisticTotalsPatchInBrowser,
  storeOfflineGainReportsInBrowser,
  type OfflineGainStoreResult,
} from '../offline-gain-storage';
import { formatOfflineGainDuration, renderOfflineGainReports } from './offline-gain-render';
import { t } from './i18n';

type OfflineGainToastKind = 'success' | 'warn' | 'system';

interface OfflineGainReportHandlerOptions {
  getPlayerId: () => string | null | undefined;
  ackOfflineGainReports: (reportIds: string[]) => void;
  requestOfflineGainReports: () => void;
  showToast: (message: string, kind?: OfflineGainToastKind) => void;
  windowRef?: Window;
}

interface OfflineGainConfirmResult {
  reportIds: string[];
  reportCount: number;
  storageOk: boolean;
}

const OFFLINE_GAIN_MODAL_OWNER = 'offline-gain-reports';
const OFFLINE_GAIN_REFRESH_INTERVAL_MS = 3_000;
let blockingRefreshTimer: number | null = null;
let blockingPlayerId = '';
let blockingReports: OfflineGainReportView[] = [];

export function handleOfflineGainReports(
  payload: ServerToClientEventPayload<typeof S2C.OfflineGainReports>,
  options: OfflineGainReportHandlerOptions,
): void {
  const reports = Array.isArray(payload?.reports) ? payload.reports : [];
  const playerId = options.getPlayerId() ?? reports[0]?.playerId ?? 'anonymous';
  if (payload?.totals) {
    storePlayerStatisticTotalsInBrowser(playerId, payload.totals, options.windowRef ?? window);
  } else if (payload?.totalsPatch) {
    storePlayerStatisticTotalsPatchInBrowser(playerId, payload.totalsPatch, options.windowRef ?? window);
  }
  const blockingPreview = payload?.preview === true || payload?.blocking === true;
  if (reports.length === 0) {
    if (blockingPreview) {
      keepOfflineGainBlockingPreviewAlive(playerId, options);
    }
    return;
  }

  if (blockingPreview) {
    openOfflineGainBlockingPreview(playerId, reports, options);
    return;
  }

  const storeResult = storeOfflineGainReportsInBrowser(playerId, reports, options.windowRef ?? window);

  if (storeResult.reports.length > 0) {
    openOfflineGainReportsModal(storeResult, options);
  } else if (storeResult.storedReportIds.length > 0) {
    // 没有需要展示的历史报告（时长过短），直接 ack
    options.ackOfflineGainReports(storeResult.storedReportIds);
  }
}

function openOfflineGainBlockingPreview(
  playerId: string,
  reports: readonly OfflineGainReportView[],
  options: OfflineGainReportHandlerOptions,
): void {
  blockingPlayerId = playerId;
  blockingReports = [...reports];
  patchOrOpenOfflineGainModal(blockingReports, options, true);
  startBlockingRefresh(options);
}

function keepOfflineGainBlockingPreviewAlive(
  playerId: string,
  options: OfflineGainReportHandlerOptions,
): void {
  blockingPlayerId = playerId || blockingPlayerId;
  if (blockingReports.length === 0 || !detailModalHost.isOpenFor(OFFLINE_GAIN_MODAL_OWNER)) {
    return;
  }
  startBlockingRefresh(options);
}

function openOfflineGainReportsModal(
  storeResult: OfflineGainStoreResult,
  options: OfflineGainReportHandlerOptions,
): void {
  const reports = storeResult.reports;
  if (reports.length === 0) {
    return;
  }
  patchOrOpenOfflineGainModal(reports, options, false, storeResult.storedReportIds, storeResult.storageOk);
}

function patchOrOpenOfflineGainModal(
  reports: readonly OfflineGainReportView[],
  options: OfflineGainReportHandlerOptions,
  blocking: boolean,
  storedReportIds?: string[],
  localStorageOk = true,
): void {
  const totalDurationMs = reports.reduce((total, report) => total + Math.max(0, report.durationMs), 0);
  const allReportIds = storedReportIds ?? reports.map((report) => report.id).filter(Boolean);
  const variantClass = blocking
    ? 'detail-modal--offline-gain detail-modal--offline-gain-blocking'
    : 'detail-modal--offline-gain';
  const subtitle = t('offline-gain.modal.subtitle', { count: reports.length, duration: formatOfflineGainDuration(totalDurationMs) });
  if (blocking && patchOpenOfflineGainBlockingReports(reports, variantClass, subtitle)) {
    return;
  }
  const bodyHtml = renderOfflineGainReportsWithConfirm(reports, blocking);
  const bindConfirm = (body: HTMLElement) => {
    const confirmBtn = body.querySelector<HTMLButtonElement>('.offline-gain-confirm-btn');
    if (!confirmBtn) {
      return;
    }
    confirmBtn.addEventListener('click', () => {
      const confirmResult = blocking
        ? confirmBlockingOfflineGainReports(options)
        : { reportIds: allReportIds, reportCount: reports.length, storageOk: localStorageOk };
      if (confirmResult.reportIds.length === 0) {
        return;
      }
      options.ackOfflineGainReports(confirmResult.reportIds);
      stopBlockingRefresh(options);
      detailModalHost.patch({
        ownerId: OFFLINE_GAIN_MODAL_OWNER,
        onRequestClose: null,
      });
      detailModalHost.close(OFFLINE_GAIN_MODAL_OWNER);
      if (confirmResult.storageOk) {
        options.showToast(t('offline-gain.toast.saved', { count: confirmResult.reportCount }), 'success');
      } else {
        options.showToast(t('offline-gain.toast.local-save-failed'), 'warn');
      }
    });
  };

  const patched = detailModalHost.patch({
    ownerId: OFFLINE_GAIN_MODAL_OWNER,
    variantClass,
    size: 'lg',
    title: t('offline-gain.modal.title'),
    subtitle,
    hint: localStorageOk ? t('offline-gain.modal.hint.confirm') : t('offline-gain.modal.hint.save-failed'),
    bodyHtml,
    onRequestClose: () => false,
    onAfterRender: bindConfirm,
  });
  if (patched) {
    return;
  }

  detailModalHost.open({
    ownerId: OFFLINE_GAIN_MODAL_OWNER,
    variantClass,
    size: 'lg',
    title: t('offline-gain.modal.title'),
    subtitle,
    hint: localStorageOk ? t('offline-gain.modal.hint.confirm') : t('offline-gain.modal.hint.save-failed'),
    bodyHtml,
    onRequestClose: () => false,
    onAfterRender: bindConfirm,
  });
}

function patchOpenOfflineGainBlockingReports(
  reports: readonly OfflineGainReportView[],
  variantClass: string,
  subtitle: string,
): boolean {
  if (!detailModalHost.isOpenFor(OFFLINE_GAIN_MODAL_OWNER)) {
    return false;
  }
  const body = document.getElementById('detail-modal-body');
  const currentReportsRoot = body?.querySelector<HTMLElement>('.offline-gain-modal');
  if (!body || !currentReportsRoot) {
    return false;
  }
  const nextReportsRoot = createOfflineGainReportsRoot(reports);
  currentReportsRoot.replaceChildren(...Array.from(nextReportsRoot.childNodes));
  detailModalHost.patch({
    ownerId: OFFLINE_GAIN_MODAL_OWNER,
    variantClass,
    size: 'lg',
    title: t('offline-gain.modal.title'),
    subtitle,
    hint: t('offline-gain.modal.hint.confirm'),
    onRequestClose: () => false,
  });
  return true;
}

function createOfflineGainReportsRoot(reports: readonly OfflineGainReportView[]): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = renderOfflineGainReports(reports).trim();
  const root = template.content.firstElementChild;
  if (root instanceof HTMLElement && root.classList.contains('offline-gain-modal')) {
    return root;
  }
  const fallback = document.createElement('div');
  fallback.className = 'offline-gain-modal';
  return fallback;
}

function confirmBlockingOfflineGainReports(options: OfflineGainReportHandlerOptions): OfflineGainConfirmResult {
  const reports = blockingReports;
  if (reports.length === 0) {
    return { reportIds: [], reportCount: 0, storageOk: true };
  }
  const storeResult = storeOfflineGainReportsInBrowser(blockingPlayerId || 'anonymous', reports, options.windowRef ?? window);
  return {
    reportIds: storeResult.storedReportIds,
    reportCount: reports.length,
    storageOk: storeResult.storageOk,
  };
}

function startBlockingRefresh(options: OfflineGainReportHandlerOptions): void {
  if (blockingRefreshTimer !== null) {
    return;
  }
  const windowRef = options.windowRef ?? window;
  blockingRefreshTimer = windowRef.setInterval(() => {
    options.requestOfflineGainReports();
  }, OFFLINE_GAIN_REFRESH_INTERVAL_MS);
}

function stopBlockingRefresh(options: OfflineGainReportHandlerOptions): void {
  if (blockingRefreshTimer === null) {
    return;
  }
  const windowRef = options.windowRef ?? window;
  windowRef.clearInterval(blockingRefreshTimer);
  blockingRefreshTimer = null;
  blockingPlayerId = '';
  blockingReports = [];
}

function renderOfflineGainReportsWithConfirm(reports: readonly OfflineGainReportView[], blocking = false): string {
  return `
    ${renderOfflineGainReports(reports)}
    ${blocking ? '<div class="offline-gain-blocking-note">确认前角色仍保持离线挂机，收益会自动刷新。</div>' : ''}
    <div class="offline-gain-confirm-area">
      <button class="offline-gain-confirm-btn ui-btn">${t('offline-gain.modal.confirm-btn')}</button>
    </div>
  `;
}
