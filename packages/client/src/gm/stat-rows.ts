/**
 * gm/stat-rows.ts —— GM 统计行/网络桶相关函数。
 *
 * 从 gm.ts 抽取：getVisibleNetworkBuckets/getNetworkBucketMeta/getTickPerf/
 * getStatRowMarkup/patchStatRow/renderStructuredStatList/
 * rememberNetworkLargePayloadBuckets/renderNetworkLargePayloadSample/
 * closeNetworkPayloadModal/openNetworkPayloadModal。
 * 纯函数或通过显式传参访问外部状态（Map、setStatus 回调），无模块级可变状态。
 */

import {
  type GmNetworkBucket,
  type GmStateRes,
} from '@mud/shared';
import * as gmMarkupHelpers from '../gm/helpers/markup';
import {
  escapeHtml,
  formatBytes,
  formatPercent,
  formatAverageBytesPerEvent,
  formatBytesPerSecond,
} from './format';
import { renderNetworkLargePayloadSampleHtml as perfRenderNetworkLargePayloadSampleHtml } from './perf-panels';
import { t } from '../ui/i18n';

/** StructuredStatListItem：结构化统计列表项。 */
export type StructuredStatListItem = {
  key: string;
  label: string;
  meta: string;
  largePayloadSamples?: GmNetworkBucket['largePayloadSamples'];
};

/** getVisibleNetworkBuckets：读取可见 Network Buckets。 */
export function getVisibleNetworkBuckets(buckets: GmNetworkBucket[]): GmNetworkBucket[] {
  return buckets;
}

/** getNetworkBucketMeta：读取 Network Bucket 元数据。 */
export function getNetworkBucketMeta(
  totalBytes: number,
  bucket: GmNetworkBucket,
  elapsedSec: number,
): string {
  const largePayloadMeta = (bucket.largePayloadCount ?? 0) > 0
    ? ` · 大包 ${bucket.largePayloadCount} 次 / ${formatBytes(bucket.largePayloadBytes ?? 0)}`
    : '';
  return `${formatBytes(bucket.bytes)} · ${formatPercent(bucket.bytes, totalBytes)} · ${bucket.count} 次 · 均次 ${formatAverageBytesPerEvent(bucket.bytes, bucket.count)} · 均秒 ${formatBytesPerSecond(bucket.bytes, elapsedSec)}${largePayloadMeta}`;
}

/** getTickPerf：读取 Tick 性能。 */
export function getTickPerf(perf: GmStateRes['perf']) {
  return perf.tick ?? {
    lastMapId: null,
    lastMs: perf.tickMs,
    windowElapsedSec: 0,
    windowTickCount: 0,
    windowTotalMs: 0,
    windowAvgMs: perf.tickMs,
    windowBusyPercent: 0,
  };
}

/** getStatRowMarkup：读取 Stat Row Markup。 */
export function getStatRowMarkup(key: string): string {
  return gmMarkupHelpers.getStatRowMarkup(key);
}

/** patchStatRow：处理 patch Stat Row。 */
export function patchStatRow(row: HTMLElement, item: StructuredStatListItem): void {
  const { label, meta } = item;
  row.querySelector<HTMLElement>('[data-role="label"]')!.textContent = label;
  row.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = meta;
  const actionsEl = row.querySelector<HTMLElement>('[data-role="actions"]');
  if (!actionsEl) {
    return;
  }
  if (!Array.isArray(item.largePayloadSamples) || item.largePayloadSamples.length === 0) {
    actionsEl.innerHTML = '';
    actionsEl.hidden = true;
    return;
  }
  actionsEl.hidden = false;
  const currentKey = actionsEl.querySelector<HTMLButtonElement>('[data-network-large-payload-key]')?.dataset.networkLargePayloadKey;
  if (currentKey === item.key) {
    return;
  }
  actionsEl.innerHTML = `<button class="small-btn network-payload-btn" type="button" data-network-large-payload-key="${escapeHtml(item.key)}">查看包体</button>`;
}

/** renderStructuredStatList：渲染 Structured Stat 列表。 */
export function renderStructuredStatList(
  container: HTMLElement,
  structureKey: string | null,
  items: StructuredStatListItem[],
  emptyText: string,
): string {
  if (items.length === 0) {
    if (structureKey !== 'empty') {
      container.innerHTML = `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return 'empty';
  }

  const nextStructureKey = items.map((item) => item.key).join('|');
  if (structureKey !== nextStructureKey) {
    container.innerHTML = items.map((item) => getStatRowMarkup(item.key)).join('');
  }
  items.forEach((item, index) => {
    const row = container.children[index];
    if (!(row instanceof HTMLElement)) {
      return;
    }
    patchStatRow(row, item);
  });
  return nextStructureKey;
}

/** rememberNetworkLargePayloadBuckets：记录大包桶到 store。 */
export function rememberNetworkLargePayloadBuckets(buckets: GmNetworkBucket[], store: Map<string, GmNetworkBucket>): void {
  for (const bucket of buckets) {
    if (Array.isArray(bucket.largePayloadSamples) && bucket.largePayloadSamples.length > 0) {
      store.set(bucket.key, bucket);
    }
  }
}

/** renderNetworkLargePayloadSample：渲染大包样本。 */
export function renderNetworkLargePayloadSample(sample: NonNullable<GmNetworkBucket['largePayloadSamples']>[number], index: number): string {
  return perfRenderNetworkLargePayloadSampleHtml(sample, index);
}

/** closeNetworkPayloadModal：关闭网络包体弹窗。 */
export function closeNetworkPayloadModal(): void {
  const modal = document.getElementById('network-payload-modal');
  if (modal) {
    modal.remove();
  }
}

/** openNetworkPayloadModal：打开网络包体弹窗。 */
export function openNetworkPayloadModal(bucket: GmNetworkBucket, setStatus: (message: string, isError?: boolean) => void): void {
  const samples = Array.isArray(bucket.largePayloadSamples) ? bucket.largePayloadSamples : [];
  if (samples.length === 0) {
    setStatus(t('gm.network.large-payload.empty'), true);
    return;
  }
  closeNetworkPayloadModal();
  const modal = document.createElement('div');
  modal.id = 'network-payload-modal';
  modal.className = 'network-payload-modal';
  modal.innerHTML = `
    <div class="network-payload-dialog" role="dialog" aria-modal="true" aria-label="网络包体内容">
      <div class="network-payload-dialog-head">
        <div>
          <div class="panel-title">${escapeHtml(bucket.label)}</div>
          <div class="network-breakdown-subtitle">${escapeHtml(t('gm.network.large-payload.limit-note', { count: samples.length }))}</div>
        </div>
        <button class="small-btn" type="button" data-network-payload-close>${escapeHtml(t('gm.common.close'))}</button>
      </div>
      <div class="network-payload-sample-list">
        ${samples.map((sample, index) => renderNetworkLargePayloadSample(sample, index)).join('')}
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    const target = event.target;
    if (target === modal || (target instanceof Element && target.closest('[data-network-payload-close]'))) {
      closeNetworkPayloadModal();
    }
  });
  document.body.appendChild(modal);
}
