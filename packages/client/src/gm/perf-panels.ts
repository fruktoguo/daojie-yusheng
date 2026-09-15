/**
 * gm/perf-panels.ts —— GM 性能面板通用度量树渲染。
 *
 * 从 gm.ts 抽取：MetricTreeColumn/MetricTreeTableOptions 类型、
 * renderMetricTreeHeader/Rows/Table、resolveMetricTreeSortColumn、
 * compareMetricTreeSortValues/Nodes、内存/堆/寻路元数据格式化、
 * 网络大包体样本渲染。
 * 泛型纯函数，不依赖 gm.ts 模块级状态。
 */

import type {
  GmMemoryDomainEstimateSnapshot,
  GmMemoryInstanceEstimateSnapshot,
  GmNetworkBucket,
  GmV8HeapSpaceSnapshot,
} from '@mud/shared';
import { escapeHtml, formatBytes, formatPercent } from './format';
import { t } from '../ui/i18n';

// ── 类型定义 ──

export type MetricTreeSortDirection = 'asc' | 'desc';

export interface MetricTreeColumn<TNode, TContext> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (node: TNode, context: TContext) => string;
  sortValue?: (node: TNode, context: TContext) => number | string;
}

export interface MetricTreeTableOptions<TNode, TContext> {
  columns: MetricTreeColumn<TNode, TContext>[];
  context: TContext;
  sortKey: string;
  sortDirection: MetricTreeSortDirection;
  collapsedKeys: ReadonlySet<string>;
  getKey: (node: TNode) => string;
  getLabel: (node: TNode) => string;
  getDisplayLabel?: (node: TNode, depth: number) => string;
  getLabelMarkup?: (node: TNode, depth: number) => string | null | undefined;
  getChildren: (node: TNode) => TNode[];
  isGroup: (node: TNode) => boolean;
  firstColumnLabel: string;
  tableClassName: string;
  groupClassName: string;
  groupRowClassName: string;
  childRowClassName: string;
}

// ── 排序工具 ──

export function resolveMetricTreeSortColumn<TNode, TContext>(
  columns: MetricTreeColumn<TNode, TContext>[],
  sortKey: string,
): MetricTreeColumn<TNode, TContext> | null {
  return columns.find((column) => column.key === sortKey && column.sortable === true && column.sortValue) ?? null;
}

export function compareMetricTreeSortValues(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right), 'zh-CN');
}

export function compareMetricTreeNodes<TNode, TContext>(
  left: TNode,
  right: TNode,
  options: Pick<MetricTreeTableOptions<TNode, TContext>, 'columns' | 'context' | 'sortKey' | 'sortDirection' | 'getLabel'>,
): number {
  const column = resolveMetricTreeSortColumn(options.columns, options.sortKey);
  if (column?.sortValue) {
    const leftValue = column.sortValue(left, options.context);
    const rightValue = column.sortValue(right, options.context);
    const compared = compareMetricTreeSortValues(leftValue, rightValue);
    if (compared !== 0) {
      return options.sortDirection === 'desc' ? -compared : compared;
    }
  }
  return options.getLabel(left).localeCompare(options.getLabel(right), 'zh-CN');
}

// ── 表格渲染 ──

export function renderMetricTreeHeader<TNode, TContext>(
  options: MetricTreeTableOptions<TNode, TContext>,
): string {
  const metricHeaders = options.columns.map((column) => {
    if (!column.sortable) {
      return `<th scope="col">${escapeHtml(column.label)}</th>`;
    }
    const active = column.key === options.sortKey;
    const ariaSort = active
      ? (options.sortDirection === 'desc' ? 'descending' : 'ascending')
      : 'none';
    const mark = active ? (options.sortDirection === 'desc' ? 'v' : '^') : '';
    return `
      <th scope="col" aria-sort="${ariaSort}">
        <button class="metric-tree-sort-btn" type="button" data-metric-tree-sort-key="${escapeHtml(column.key)}" aria-sort="${ariaSort}">
          <span>${escapeHtml(column.label)}</span>
          <span class="metric-tree-sort-mark">${escapeHtml(mark)}</span>
        </button>
      </th>
    `;
  }).join('');
  return `
    <thead>
      <tr>
        <th scope="col">${escapeHtml(options.firstColumnLabel)}</th>
        ${metricHeaders}
      </tr>
    </thead>
  `;
}

export function renderMetricTreeRows<TNode, TContext>(
  nodes: TNode[],
  options: MetricTreeTableOptions<TNode, TContext>,
  depth = 0,
): string {
  return nodes.map((node) => {
    const key = options.getKey(node);
    const children = options.getChildren(node);
    const isGroup = options.isGroup(node);
    const canToggle = isGroup && children.length > 0;
    const collapsed = canToggle && options.collapsedKeys.has(key);
    const rowClass = isGroup ? options.groupRowClassName : options.childRowClassName;
    const displayLabel = options.getDisplayLabel?.(node, depth) ?? options.getLabel(node);
    const labelMarkupContent = options.getLabelMarkup?.(node, depth);
    const safeDisplayLabel = escapeHtml(displayLabel);
    const labelMarkup = canToggle
      ? `<button class="metric-tree-toggle" type="button" data-metric-tree-toggle-key="${escapeHtml(key)}" aria-expanded="${collapsed ? 'false' : 'true'}"><span class="metric-tree-toggle-mark">${collapsed ? '+' : '-'}</span><span class="metric-tree-label">${labelMarkupContent ?? safeDisplayLabel}</span></button>`
      : `<span class="metric-tree-label">${labelMarkupContent ?? safeDisplayLabel}</span>`;
    const cells = options.columns
      .map((column) => `<td>${escapeHtml(column.render(node, options.context))}</td>`)
      .join('');
    const childRows = collapsed ? '' : renderMetricTreeRows(children, options, depth + 1);
    return `
      <tr class="${rowClass}" data-key="${escapeHtml(key)}" data-depth="${depth}"${canToggle ? ` data-metric-tree-toggle-key="${escapeHtml(key)}"` : ''}>
        <th scope="row">${labelMarkup}</th>
        ${cells}
      </tr>
      ${childRows}
    `;
  }).join('');
}

export function renderMetricTreeTable<TNode, TContext>(
  roots: TNode[],
  options: MetricTreeTableOptions<TNode, TContext>,
): string {
  const body = roots.map((root) => `
    <tbody class="${options.groupClassName}" data-key="${escapeHtml(options.getKey(root))}">
      ${renderMetricTreeRows([root], options)}
    </tbody>
  `).join('');
  return `
    <div class="${options.tableClassName}-wrap">
      <table class="${options.tableClassName}">
        ${renderMetricTreeHeader(options)}
        ${body}
      </table>
    </div>
  `;
}

// ── 内存/堆/寻路元数据格式化 ──

export function getMemoryDomainMeta(totalRssBytes: number, domain: GmMemoryDomainEstimateSnapshot): string {
  const average = domain.count > 0 ? ` · 均值 ${formatBytes(domain.avgBytes)}` : '';
  return `${formatBytes(domain.bytes)} · 占 RSS ${formatPercent(domain.bytes, totalRssBytes)}${domain.count > 0 ? ` · ${domain.count} 个` : ''}${average}`;
}

export function getMemoryInstanceMeta(totalRssBytes: number, instance: GmMemoryInstanceEstimateSnapshot): string {
  return `${formatBytes(instance.bytes)} · 占 RSS ${formatPercent(instance.bytes, totalRssBytes)} · 玩家 ${instance.playerCount} · 怪物 ${instance.monsterCount} · 玩家容器 ${formatBytes(instance.playerBytes)} · 怪物容器 ${formatBytes(instance.monsterBytes)} · 其余实例容器 ${formatBytes(instance.instanceBytes)}`;
}

export function getHeapSpaceMeta(heapTotalBytes: number, space: GmV8HeapSpaceSnapshot): string {
  const usage = space.sizeBytes > 0 ? formatPercent(space.usedBytes, space.sizeBytes) : '0%';
  return `已用 ${formatBytes(space.usedBytes)} / 总量 ${formatBytes(space.sizeBytes)} · 使用率 ${usage} · 可用 ${formatBytes(space.availableBytes)} · 物理 ${formatBytes(space.physicalBytes)} · 占 Heap ${formatPercent(space.usedBytes, heapTotalBytes)}`;
}

export function getPathfindingFailureMeta(totalFailures: number, count: number): string {
  return `${count} 次 · 占失败 ${formatPercent(count, totalFailures)}`;
}

// ── 网络大包体样本渲染 ──

export function renderNetworkLargePayloadSampleHtml(
  sample: NonNullable<GmNetworkBucket['largePayloadSamples']>[number],
  index: number,
): string {
  const recordedAt = sample.recordedAt > 0 ? new Date(sample.recordedAt).toLocaleString() : t('gm.text.unknown-time');
  return `
    <section class="network-payload-sample">
      <div class="network-payload-sample-head">
        <div>${escapeHtml(t('gm.text.sample', { index: index + 1 }))}</div>
        <div>${escapeHtml(t('gm.network.large-payload.sample-meta', {
          event: sample.event,
          recordedAt,
          payloadBytes: formatBytes(sample.bytes),
          packetBytes: formatBytes(sample.packetBytes),
        }))}</div>
      </div>
      <textarea class="network-payload-body" readonly spellcheck="false">${escapeHtml(sample.body)}</textarea>
    </section>
  `;
}
