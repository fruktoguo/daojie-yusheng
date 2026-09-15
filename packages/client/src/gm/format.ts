/**
 * gm/format.ts —— GM 工具链无状态格式化工具集合。
 *
 * 从 gm.ts 抽取的纯函数：clone/escapeHtml/formatJson/formatBytes 等格式化与判型工具。
 * 不依赖任何模块级可变状态，可被任意领域模块安全引用。
 */

import * as gmPureHelpers from '../gm/helpers/pure';

/** isRecord：判断值是否为非 null 对象。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** clone：深拷贝。 */
export function clone<T>(value: T): T {
  return gmPureHelpers.clone(value);
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
export function escapeHtml(input: string): string {
  return gmPureHelpers.escapeHtml(input);
}

/** formatJson：格式化JSON。 */
export function formatJson(value: unknown): string {
  return gmPureHelpers.formatJson(value);
}

/** formatBytes：格式化Bytes。 */
export function formatBytes(bytes: number | undefined): string {
  return gmPureHelpers.formatBytes(bytes);
}

/** formatSignedBytes：格式化带正负号的 Bytes。 */
export function formatSignedBytes(bytes: number | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value === 0) {
    return '0 B';
  }
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(value))}`;
}

/** formatPercent：格式化Percent。 */
export function formatPercent(numerator: number, denominator: number): string {
  return gmPureHelpers.formatPercent(numerator, denominator);
}

/** formatBytesPerSecond：格式化Bytes Per Second。 */
export function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  return gmPureHelpers.formatBytesPerSecond(bytes, elapsedSec);
}

/** formatAverageBytesPerEvent：格式化Average Bytes Per事件。 */
export function formatAverageBytesPerEvent(bytes: number, count: number): string {
  return gmPureHelpers.formatAverageBytesPerEvent(bytes, count);
}

/** formatDurationSeconds：格式化Duration Seconds。 */
export function formatDurationSeconds(seconds: number): string {
  return gmPureHelpers.formatDurationSeconds(seconds);
}

/** formatDateTime：格式化Date时间。 */
export function formatDateTime(value?: string): string {
  return gmPureHelpers.formatDateTime(value);
}

/** formatPlayerNo：格式化玩家序号为 3 位补零字符串。 */
export function formatPlayerNo(playerNo: number | null | undefined): string {
  return typeof playerNo === 'number' && Number.isSafeInteger(playerNo) && playerNo > 0
    ? String(playerNo).padStart(3, '0')
    : '000';
}

/** formatCpuMs：格式化 CPU 毫秒。 */
export function formatCpuMs(value: number, digits = 2): string {
  return `${Math.max(0, Number(value) || 0).toFixed(digits)} ms`;
}

/** formatCpuCount：格式化 CPU 计数。 */
export function formatCpuCount(value: number, digits = 2): string {
  const normalized = Math.max(0, Number(value) || 0);
  if (normalized >= 100) {
    return normalized.toFixed(1).replace(/\.0$/, '');
  }
  return normalized.toFixed(digits).replace(/\.00$/, '');
}

/** formatTrafficCount：格式化流量计数。 */
export function formatTrafficCount(value: number, digits = 0): string {
  const normalized = Math.max(0, Number(value) || 0);
  return digits > 0
    ? normalized.toLocaleString('zh-Hans-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : Math.round(normalized).toLocaleString('zh-Hans-CN');
}

/** formatMs：格式化毫秒。 */
export function formatMs(value: number): string {
  return `${Math.max(0, Number(value) || 0).toFixed(1)} ms`;
}

/** formatCompactNumber：格式化紧凑数字。 */
export function formatCompactNumber(value: number): string {
  const normalized = Math.max(0, Number(value) || 0);
  if (normalized >= 1_000_000) {
    return `${(normalized / 1_000_000).toFixed(1)}M`;
  }
  if (normalized >= 1_000) {
    return `${(normalized / 1_000).toFixed(1)}K`;
  }
  return `${Math.trunc(normalized)}`;
}

/** formatWorkerRate：格式化 Worker 速率。 */
export function formatWorkerRate(value: number): string {
  return `${Math.max(0, Number(value) || 0).toFixed(3)} /s`;
}
