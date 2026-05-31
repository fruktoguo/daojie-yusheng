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
  showToast: (message: string, kind?: OfflineGainToastKind) => void;
  windowRef?: Window;
}

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
  if (reports.length === 0) {
    return;
  }

  const storeResult = storeOfflineGainReportsInBrowser(playerId, reports, options.windowRef ?? window);

  if (storeResult.reports.length > 0) {
    openOfflineGainReportsModal(storeResult, options);
    if (!storeResult.storageOk) {
      options.showToast(t('offline-gain.toast.local-save-failed'), 'warn');
    }
  } else if (storeResult.storedReportIds.length > 0) {
    // 没有需要展示的历史报告（时长过短），直接 ack
    options.ackOfflineGainReports(storeResult.storedReportIds);
  }
}

function openOfflineGainReportsModal(
  storeResult: OfflineGainStoreResult,
  options: OfflineGainReportHandlerOptions,
): void {
  const reports = storeResult.reports;
  if (reports.length === 0) {
    return;
  }
  const totalDurationMs = reports.reduce((total, report) => total + Math.max(0, report.durationMs), 0);
  const allReportIds = storeResult.storedReportIds;

  detailModalHost.open({
    ownerId: 'offline-gain-reports',
    variantClass: 'detail-modal--offline-gain',
    size: 'lg',
    title: t('offline-gain.modal.title'),
    subtitle: t('offline-gain.modal.subtitle', { count: reports.length, duration: formatOfflineGainDuration(totalDurationMs) }),
    hint: t('offline-gain.modal.hint.confirm'),
    bodyHtml: renderOfflineGainReportsWithConfirm(reports),
    onRequestClose: () => false,
    onAfterRender: (body) => {
      const confirmBtn = body.querySelector<HTMLButtonElement>('.offline-gain-confirm-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (allReportIds.length > 0) {
            options.ackOfflineGainReports(allReportIds);
          }
          detailModalHost.patch({
            ownerId: 'offline-gain-reports',
            onRequestClose: null,
          });
          detailModalHost.close('offline-gain-reports');
          options.showToast(t('offline-gain.toast.saved', { count: reports.length }), 'success');
        });
      }
    },
  });
}

function renderOfflineGainReportsWithConfirm(reports: readonly OfflineGainReportView[]): string {
  return `
    ${renderOfflineGainReports(reports)}
    <div class="offline-gain-confirm-area">
      <button class="offline-gain-confirm-btn ui-btn">${t('offline-gain.modal.confirm-btn')}</button>
    </div>
  `;
}
