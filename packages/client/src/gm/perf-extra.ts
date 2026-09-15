/**
 * gm/perf-extra.ts —— GM 性能面板 CPU/流量分项构建与渲染。
 *
 * 从 gm.ts 抽取：CPU 分项分组构建、流量分项节点构建、排序校验、
 * CPU/流量分项列表渲染。原模块级排序/折叠状态通过参数显式传入，
 * 不再依赖 gm.ts 模块级变量。纯计算函数，DOM 写入仅通过传入的容器元素。
 */

import { C2S, S2C } from '@mud/shared';
import type { GmCpuSectionSnapshot, GmNetworkBucket, GmStateRes } from '@mud/shared';
import {
  escapeHtml,
  formatAverageBytesPerEvent,
  formatBytes,
  formatBytesPerSecond,
  formatCpuCount,
  formatCpuMs,
  formatPercent,
  formatTrafficCount,
} from './format';
import {
  type MetricTreeColumn,
  type MetricTreeSortDirection,
  type MetricTreeTableOptions,
  compareMetricTreeNodes,
  renderMetricTreeTable,
} from './perf-panels';
import { getVisibleNetworkBuckets } from './stat-rows';

// ── 类型定义 ──

export type CpuBreakdownSortMode = 'totalMs' | 'perSecondMs' | 'avgMs' | 'count' | 'perSecondCount' | 'percent';

export interface CpuBreakdownGroup {
  key: string;
  label: string;
  summary: GmCpuSectionSnapshot;
  children: CpuBreakdownGroup[];
  grouped: boolean;
}

export interface CpuBreakdownGroupDef {
  key: string;
  childPrefixes: string[];
  fallbackLabel: string;
  groups?: CpuBreakdownGroupDef[];
}

export interface CpuBreakdownTableContext {
  windowSec: number;
}

export type TrafficBreakdownSortMode = 'bytes' | 'percent' | 'count' | 'avgBytes' | 'bytesPerSecond' | 'countPerSecond';

export type TrafficBreakdownDirection = 'in' | 'out';

export interface TrafficBreakdownNode {
  key: string;
  label: string;
  bucket: GmNetworkBucket | null;
  children: TrafficBreakdownNode[];
  grouped: boolean;
}

export interface TrafficBreakdownTableContext {
  totalBytes: number;
  elapsedSec: number;
}

// ── CPU 分组定义 ──

export const CPU_BREAKDOWN_GROUPS: CpuBreakdownGroupDef[] = [
  {
    key: 'instanceTicksMs',
    childPrefixes: ['instance.'],
    fallbackLabel: '实例 tick',
    groups: [
      { key: 'instance.playerTickAdvanceMs', childPrefixes: ['playerTick.'], fallbackLabel: '玩家 tick 推进' },
    ],
  },
  {
    key: 'pendingCommandsMs',
    childPrefixes: ['pendingCommands.'],
    fallbackLabel: '待处理命令',
    groups: [
      { key: 'pendingCommands.castSkillMs', childPrefixes: ['pendingCommands.castSkill.'], fallbackLabel: '技能施放' },
    ],
  },
  { key: 'syncFlushMs', childPrefixes: ['syncFlush.'], fallbackLabel: '同步广播' },
  { key: 'preTickMaterializationMs', childPrefixes: ['tick.'], fallbackLabel: '预 tick 物化' },
  { key: 'workerPrecomputeMs', childPrefixes: ['worker.'], fallbackLabel: 'Worker 预计算' },
  { key: 'postTickCleanupMs', childPrefixes: ['postTick.'], fallbackLabel: 'tick 后清理' },
  { key: 'persistence.player.totalMs', childPrefixes: ['persistence.player.'], fallbackLabel: '持久化·玩家刷盘' },
  { key: 'persistence.map.totalMs', childPrefixes: ['persistence.map.'], fallbackLabel: '持久化·地图刷盘' },
];

export const CPU_BREAKDOWN_TOP_LEVEL_KEYS = new Set([
  'resetFrameEffectsMs',
  'planInstanceStepsMs',
  'preTickMaterializationMs',
  'pendingCommandsMs',
  'systemCommandsMs',
  'workerPrecomputeMs',
  'instanceTicksMs',
  'postTickCleanupMs',
  'playerAdvanceMs',
  'syncFlushMs',
  'otherMs',
]);

// ── CPU 分项列定义 ──

export const CPU_BREAKDOWN_COLUMNS: MetricTreeColumn<CpuBreakdownGroup, CpuBreakdownTableContext>[] = [
  {
    key: 'totalMs',
    label: '总耗时',
    sortable: true,
    render: (group) => formatCpuMs(group.summary.totalMs),
    sortValue: (group) => group.summary.totalMs,
  },
  {
    key: 'perSecondMs',
    label: '均秒耗时',
    sortable: true,
    render: (group, context) => formatCpuMs(group.summary.totalMs / Math.max(1, context.windowSec), 3),
    sortValue: (group, context) => group.summary.totalMs / Math.max(1, context.windowSec),
  },
  {
    key: 'avgMs',
    label: '均次耗时',
    sortable: true,
    render: (group) => formatCpuMs(group.summary.avgMs, 3),
    sortValue: (group) => group.summary.avgMs,
  },
  {
    key: 'count',
    label: '总次数',
    sortable: true,
    render: (group) => formatCpuCount(group.summary.count, 0),
    sortValue: (group) => group.summary.count,
  },
  {
    key: 'perSecondCount',
    label: '均秒次数',
    sortable: true,
    render: (group, context) => formatCpuCount(group.summary.count / Math.max(1, context.windowSec), 2),
    sortValue: (group, context) => group.summary.count / Math.max(1, context.windowSec),
  },
  {
    key: 'percent',
    label: '总占比',
    sortable: true,
    render: (group) => `${group.summary.percent.toFixed(1)}%`,
    sortValue: (group) => group.summary.percent,
  },
];

// ── 流量协议映射 ──

export const C2S_PROTOCOL_NAME_BY_EVENT = new Map<string, string>(Object.entries(C2S).map(([name, event]) => [event, name]));
export const S2C_PROTOCOL_NAME_BY_EVENT = new Map<string, string>(Object.entries(S2C).map(([name, event]) => [event, name]));

export const TRAFFIC_PROTOCOL_GROUPS: Array<{ key: string; label: string; match: (protocolName: string) => boolean }> = [
  { key: 'movement', label: '移动寻路', match: (name) => name === 'Move' || name === 'MoveTo' || name === 'NavigateQuest' || name === 'UsePortal' },
  { key: 'worldSync', label: '世界同步', match: (name) => name === 'WorldDelta' || name === 'SyncEnvelope' || name === 'MapEnter' || name === 'MapStatic' || name === 'Bootstrap' || name === 'InitSession' || name === 'SelfDelta' },
  { key: 'panelDetail', label: '面板详情', match: (name) => name.includes('Panel') || name.includes('Detail') || name === 'PanelDelta' || name === 'RequestDetail' || name === 'RequestTileDetail' },
  { key: 'combatGrowth', label: '战斗成长', match: (name) => name.includes('Skill') || name.includes('Technique') || name.includes('Cultivate') || name.includes('Realm') || name.includes('Attr') || name.includes('Buff') || name.includes('Action') || name.includes('Combat') },
  { key: 'socialEconomy', label: '社交经济', match: (name) => name.includes('Mail') || name.includes('Market') || name.includes('Auction') || name.includes('Trade') || name.includes('Leaderboard') || name.includes('Chat') || name.includes('Redeem') || name.includes('Shop') || name.includes('Quest') || name.includes('Npc') },
  { key: 'craftBuilding', label: '技艺建造', match: (name) => name.includes('Alchemy') || name.includes('Enhancement') || name.includes('Build') || name.includes('Gather') || name.includes('Formation') || name.includes('FengShui') || name.includes('Room') },
  { key: 'sessionOps', label: '会话运维', match: (name) => name === 'Hello' || name === 'Heartbeat' || name === 'Ping' || name === 'Pong' || name === 'Kick' || name === 'Error' || name.includes('OfflineGain') || name === 'ActivityStatus' || name === 'ActivityOperationResult' || name === 'Notice' },
  { key: 'gm', label: 'GM 工具链', match: (name) => name.startsWith('Gm') },
  { key: 'contentAi', label: '内容与 AI', match: (name) => name.includes('ContentTemplates') || name.includes('TechniqueGeneration') || name.includes('Minimap') || name === 'ReportMinimapVersions' },
];

// ── 流量分项列定义 ──

export const TRAFFIC_BREAKDOWN_COLUMNS: MetricTreeColumn<TrafficBreakdownNode, TrafficBreakdownTableContext>[] = [
  {
    key: 'bytes',
    label: '总字节',
    sortable: true,
    render: (node) => formatBytes(node.bucket?.bytes ?? sumTrafficNodeBytes(node)),
    sortValue: (node) => node.bucket?.bytes ?? sumTrafficNodeBytes(node),
  },
  {
    key: 'percent',
    label: '总占比',
    sortable: true,
    render: (node, context) => formatPercent(node.bucket?.bytes ?? sumTrafficNodeBytes(node), context.totalBytes),
    sortValue: (node, context) => (node.bucket?.bytes ?? sumTrafficNodeBytes(node)) / Math.max(1, context.totalBytes),
  },
  {
    key: 'count',
    label: '总次数',
    sortable: true,
    render: (node) => formatTrafficCount(node.bucket?.count ?? sumTrafficNodeCount(node)),
    sortValue: (node) => node.bucket?.count ?? sumTrafficNodeCount(node),
  },
  {
    key: 'avgBytes',
    label: '均次字节',
    sortable: true,
    render: (node) => {
      const bytes = node.bucket?.bytes ?? sumTrafficNodeBytes(node);
      const count = node.bucket?.count ?? sumTrafficNodeCount(node);
      return formatAverageBytesPerEvent(bytes, count);
    },
    sortValue: (node) => {
      const bytes = node.bucket?.bytes ?? sumTrafficNodeBytes(node);
      const count = node.bucket?.count ?? sumTrafficNodeCount(node);
      return count > 0 ? bytes / count : 0;
    },
  },
  {
    key: 'bytesPerSecond',
    label: '均秒字节',
    sortable: true,
    render: (node, context) => formatBytesPerSecond(node.bucket?.bytes ?? sumTrafficNodeBytes(node), context.elapsedSec),
    sortValue: (node, context) => (node.bucket?.bytes ?? sumTrafficNodeBytes(node)) / Math.max(1, context.elapsedSec),
  },
  {
    key: 'countPerSecond',
    label: '均秒次数',
    sortable: true,
    render: (node, context) => formatTrafficCount((node.bucket?.count ?? sumTrafficNodeCount(node)) / Math.max(1, context.elapsedSec), 2),
    sortValue: (node, context) => (node.bucket?.count ?? sumTrafficNodeCount(node)) / Math.max(1, context.elapsedSec),
  },
];

// ── 排序模式校验 ──

export function isCpuBreakdownSortMode(value: string | undefined): value is CpuBreakdownSortMode {
  return typeof value === 'string' && CPU_BREAKDOWN_COLUMNS.some((column) => column.key === value);
}

export function isTrafficBreakdownSortMode(value: string | undefined): value is TrafficBreakdownSortMode {
  return typeof value === 'string' && TRAFFIC_BREAKDOWN_COLUMNS.some((column) => column.key === value);
}

// ── CPU 分项构建 ──

export function stripCpuChildLabel(label: string): string {
  return label.replace(/^(实例|同步|tick|Worker|后 tick|持久化|玩家 tick|命令)[· ]/, '');
}

export function compareCpuBreakdownGroups(
  left: CpuBreakdownGroup,
  right: CpuBreakdownGroup,
  windowSec: number,
  sortKey: CpuBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
): number {
  const compared = compareMetricTreeNodes(left, right, {
    columns: CPU_BREAKDOWN_COLUMNS,
    context: { windowSec },
    sortKey,
    sortDirection,
    getLabel: (group) => group.label,
  });
  if (compared !== 0) {
    return compared;
  }
  if (right.summary.totalMs !== left.summary.totalMs) {
    return right.summary.totalMs - left.summary.totalMs;
  }
  if (right.summary.count !== left.summary.count) {
    return right.summary.count - left.summary.count;
  }
  return left.label.localeCompare(right.label, 'zh-CN');
}

export function createCpuFallbackSummary(def: CpuBreakdownGroupDef, children: CpuBreakdownGroup[]): GmCpuSectionSnapshot {
  const totalMs = children.reduce((sum, child) => sum + child.summary.totalMs, 0);
  const count = children.reduce((sum, child) => sum + child.summary.count, 0);
  return {
    key: def.key,
    label: def.fallbackLabel,
    totalMs,
    count,
    avgMs: count > 0 ? totalMs / count : 0,
    percent: children.reduce((sum, child) => sum + child.summary.percent, 0),
  };
}

export function buildCpuBreakdownGroupNode(
  def: CpuBreakdownGroupDef,
  sections: GmCpuSectionSnapshot[],
  byKey: Map<string, GmCpuSectionSnapshot>,
  consumed: Set<string>,
  windowSec: number,
  sortKey: CpuBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
): CpuBreakdownGroup | null {
  const nestedGroups: CpuBreakdownGroup[] = [];
  for (const nestedDef of def.groups ?? []) {
    const nested = buildCpuBreakdownGroupNode(nestedDef, sections, byKey, consumed, windowSec, sortKey, sortDirection);
    if (nested) {
      nestedGroups.push(nested);
    }
  }
  const leaves = sections
    .filter((section) => !consumed.has(section.key) && section.key !== def.key && def.childPrefixes.some((prefix) => section.key.startsWith(prefix)))
    .map((section) => ({
      key: section.key,
      label: section.label,
      summary: section,
      children: [],
      grouped: false,
    }));
  const children = [...nestedGroups, ...leaves].sort((left, right) => compareCpuBreakdownGroups(left, right, windowSec, sortKey, sortDirection));
  const explicitSummary = byKey.get(def.key);
  if (!explicitSummary && children.length === 0) {
    return null;
  }
  consumed.add(def.key);
  for (const child of children) {
    consumed.add(child.key);
  }
  const summary = explicitSummary
    ? { ...explicitSummary, label: def.fallbackLabel }
    : createCpuFallbackSummary(def, children);
  return {
    key: def.key,
    label: def.fallbackLabel,
    summary,
    children,
    grouped: true,
  };
}

export function buildCpuBreakdownGroups(
  sections: GmCpuSectionSnapshot[],
  windowSec: number,
  sortKey: CpuBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
): CpuBreakdownGroup[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const consumed = new Set<string>();
  const groups: CpuBreakdownGroup[] = [];
  for (const def of CPU_BREAKDOWN_GROUPS) {
    const group = buildCpuBreakdownGroupNode(def, sections, byKey, consumed, windowSec, sortKey, sortDirection);
    if (group) {
      groups.push(group);
    }
  }
  for (const section of sections) {
    if (consumed.has(section.key)) {
      continue;
    }
    groups.push({
      key: section.key,
      label: section.label,
      summary: section,
      children: [],
      grouped: false,
    });
  }
  groups.sort((left, right) => compareCpuBreakdownGroups(left, right, windowSec, sortKey, sortDirection));
  return groups;
}

export function resolveCpuBreakdownWindowSec(data: GmStateRes): number {
  const elapsedSec = Math.max(0, Number(data.perf.cpu.profileElapsedSec) || 0);
  if (elapsedSec > 0) {
    return elapsedSec;
  }
  const topLevelCounts = data.perf.cpu.breakdown
    .filter((section) => CPU_BREAKDOWN_TOP_LEVEL_KEYS.has(section.key))
    .map((section) => Math.max(0, Math.trunc(Number(section.count) || 0)))
    .filter((count) => count > 0);
  const inferredWindowSec = topLevelCounts.length > 0 ? Math.max(...topLevelCounts) : 0;
  if (inferredWindowSec > 0) {
    return inferredWindowSec;
  }
  return Math.max(1, Number(data.perf.cpu.profileElapsedSec) || 1);
}

export function buildCpuBreakdownStructureKey(groups: CpuBreakdownGroup[]): string {
  return groups
    .map((group) => `${group.key}[${buildCpuBreakdownStructureKey(group.children)}]`)
    .join(',');
}

// ── 流量分项构建 ──

export function sumTrafficNodeBytes(node: TrafficBreakdownNode): number {
  if (node.bucket) {
    return node.bucket.bytes;
  }
  return node.children.reduce((sum, child) => sum + sumTrafficNodeBytes(child), 0);
}

export function sumTrafficNodeCount(node: TrafficBreakdownNode): number {
  if (node.bucket) {
    return node.bucket.count;
  }
  return node.children.reduce((sum, child) => sum + sumTrafficNodeCount(child), 0);
}

export function getTrafficEventProtocolName(direction: TrafficBreakdownDirection, bucket: GmNetworkBucket): string {
  const rawKey = typeof bucket.key === 'string' ? bucket.key.trim() : '';
  const protocolToken = rawKey.replace(/^(c2s|s2c)_/, '');
  const worldDeltaMatch = protocolToken.match(/^WorldDelta(?:\((.+)\))?$/);
  if (worldDeltaMatch) {
    return worldDeltaMatch[1] ? `WorldDelta · ${worldDeltaMatch[1]}` : 'WorldDelta';
  }
  const protocolMap = direction === 'in' ? C2S_PROTOCOL_NAME_BY_EVENT : S2C_PROTOCOL_NAME_BY_EVENT;
  const byEvent = protocolMap.get(protocolToken);
  if (byEvent) {
    return byEvent;
  }
  return protocolToken || bucket.label || 'unknown';
}

export function getTrafficGroupDef(protocolName: string): { key: string; label: string } {
  for (const group of TRAFFIC_PROTOCOL_GROUPS) {
    if (group.match(protocolName)) {
      return { key: group.key, label: group.label };
    }
  }
  return { key: 'other', label: '其他流量' };
}

export function compareTrafficBreakdownNodes(
  left: TrafficBreakdownNode,
  right: TrafficBreakdownNode,
  context: TrafficBreakdownTableContext,
  sortKey: TrafficBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
): number {
  const compared = compareMetricTreeNodes(left, right, {
    columns: TRAFFIC_BREAKDOWN_COLUMNS,
    context,
    sortKey,
    sortDirection,
    getLabel: (node) => node.label,
  });
  if (compared !== 0) {
    return compared;
  }
  return left.label.localeCompare(right.label, 'zh-CN');
}

export function buildTrafficBreakdownNodes(
  direction: TrafficBreakdownDirection,
  buckets: GmNetworkBucket[],
  elapsedSec: number,
  sortKey: TrafficBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
): TrafficBreakdownNode[] {
  const rootGroups = new Map<string, TrafficBreakdownNode>();
  for (const bucket of getVisibleNetworkBuckets(buckets)) {
    const protocolName = getTrafficEventProtocolName(direction, bucket);
    const groupDef = getTrafficGroupDef(protocolName);
    const rootKey = `${direction}:${groupDef.key}`;
    const root = rootGroups.get(rootKey) ?? {
      key: rootKey,
      label: groupDef.label,
      children: [],
      bucket: null,
      grouped: true,
    };
    if (!rootGroups.has(rootKey)) {
      rootGroups.set(rootKey, root);
    }
    const nodeKey = `${direction}:${bucket.key}`;
    root.children.push({
      key: nodeKey,
      label: protocolName,
      bucket,
      children: [],
      grouped: false,
    });
  }
  const groups = Array.from(rootGroups.values());
  const totalBytes = Math.max(0, buckets.reduce((sum, bucket) => sum + bucket.bytes, 0));
  const trafficContext: TrafficBreakdownTableContext = { totalBytes, elapsedSec };
  groups.forEach((group) => {
    group.children.sort((left, right) => compareTrafficBreakdownNodes(left, right, trafficContext, sortKey, sortDirection));
  });
  groups.sort((left, right) => compareTrafficBreakdownNodes(left, right, trafficContext, sortKey, sortDirection));
  return groups;
}

export function renderTrafficNodeDisplayLabel(protocolName: string, bucket: GmNetworkBucket): string {
  const sampleCount = bucket.largePayloadCount ?? 0;
  const actionButton = sampleCount > 0
    ? `<button class="small-btn network-payload-btn metric-tree-cell-trailing" type="button" data-network-large-payload-key="${escapeHtml(bucket.key)}">查看包体</button>`
    : '';
  return `
    <span class="metric-tree-cell">
      <span class="metric-tree-cell-main">${escapeHtml(protocolName)}</span>
      ${actionButton}
    </span>
  `;
}

export function buildTrafficBreakdownStructureKey(groups: TrafficBreakdownNode[]): string {
  return groups
    .map((group) => `${group.key}[${buildTrafficBreakdownStructureKey(group.children)}]`)
    .join(',');
}

// ── 分项列表渲染 ──

export function renderTrafficBreakdownList(
  container: HTMLElement,
  structureKey: string | null,
  direction: TrafficBreakdownDirection,
  buckets: GmNetworkBucket[],
  totalBytes: number,
  elapsedSec: number,
  emptyText: string,
  sortKey: TrafficBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
  collapsedKeys: ReadonlySet<string>,
): string {
  if (buckets.length === 0 || totalBytes <= 0) {
    if (structureKey !== 'empty') {
      container.innerHTML = `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return 'empty';
  }
  const groups = buildTrafficBreakdownNodes(direction, buckets, elapsedSec, sortKey, sortDirection);
  const nextStructureKey = buildTrafficBreakdownStructureKey(groups);
  const context: TrafficBreakdownTableContext = { totalBytes, elapsedSec };
  container.innerHTML = renderMetricTreeTable(groups, {
    columns: TRAFFIC_BREAKDOWN_COLUMNS,
    context,
    sortKey,
    sortDirection,
    collapsedKeys,
    getKey: (group) => group.key,
    getLabel: (group) => group.label,
    getLabelMarkup: (group) => group.grouped ? null : renderTrafficNodeDisplayLabel(group.label, group.bucket!),
    getChildren: (group) => group.children,
    isGroup: (group) => group.grouped,
    firstColumnLabel: direction === 'in' ? '上行业务 / 事件' : '下行业务 / 事件',
    tableClassName: 'cpu-breakdown-table',
    groupClassName: 'cpu-breakdown-group',
    groupRowClassName: 'cpu-breakdown-group-row',
    childRowClassName: 'cpu-breakdown-child-row',
  });
  return nextStructureKey;
}

export function renderCpuBreakdownList(
  data: GmStateRes,
  listEl: HTMLElement,
  structureKey: string | null,
  sortKey: CpuBreakdownSortMode,
  sortDirection: MetricTreeSortDirection,
  collapsedKeys: ReadonlySet<string>,
): string {
  const sections = Array.isArray(data.perf.cpu.breakdown) ? data.perf.cpu.breakdown : [];
  if (sections.length === 0) {
    if (structureKey !== 'empty') {
      listEl.innerHTML = '<div class="empty-hint">当前还没有 CPU 分项数据。</div>';
    }
    return 'empty';
  }
  const windowSec = resolveCpuBreakdownWindowSec(data);
  const groups = buildCpuBreakdownGroups(sections, windowSec, sortKey, sortDirection);
  const nextStructureKey = buildCpuBreakdownStructureKey(groups);
  listEl.innerHTML = renderMetricTreeTable(groups, {
    columns: CPU_BREAKDOWN_COLUMNS,
    context: { windowSec },
    sortKey,
    sortDirection,
    collapsedKeys,
    getKey: (group) => group.key,
    getLabel: (group) => group.label,
    getDisplayLabel: (group, depth) => (depth <= 0 || group.grouped ? group.label : stripCpuChildLabel(group.label)),
    getChildren: (group) => group.children,
    isGroup: (group) => group.grouped,
    firstColumnLabel: '分组 / 步骤',
    tableClassName: 'cpu-breakdown-table',
    groupClassName: 'cpu-breakdown-group',
    groupRowClassName: 'cpu-breakdown-group-row',
    childRowClassName: 'cpu-breakdown-child-row',
  });
  return nextStructureKey;
}
