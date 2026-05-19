/**
 * 服务端日志环形缓冲区：拦截 console.log/warn/error 等输出，
 * 存入内存环形队列（默认 5000 行），供 GM 日志接口分页读取。
 * 同时提供 captureServerLogLine 供 DateConsoleLogger 直接写入。
 */
import { inspect } from 'node:util';

import type { GmServerLogEntry, GmServerLogsRes } from '@mud/shared';

export type ConsoleCaptureLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

const DEFAULT_MAX_LINES = 5000;
const MIN_MAX_LINES = 100;
const MAX_MAX_LINES = 50000;
const DEFAULT_READ_LIMIT = 100;
const MAX_READ_LIMIT = 1000;
const ANSI_ESCAPE_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const CONSOLE_CAPTURE_LEVELS: ConsoleCaptureLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

let installed = false;
let nextSeq = 1;
const entries: GmServerLogEntry[] = [];

// ─── 全局日志级别开关 ─────────────────────────────────────────────────────────
// 默认只启用 log / warn / error / fatal，与原先行为一致。
// GmRuntimeFlagPersistenceService 初始化后会根据数据库值调用 setEnabledLogLevels 更新。
const enabledLevels: Set<ConsoleCaptureLevel> = new Set(['log', 'warn', 'error', 'fatal']);

/** 动态更新启用的日志级别集合。由 runtime flag 变更时调用。 */
export function setEnabledLogLevels(levels: ConsoleCaptureLevel[]): void {
  enabledLevels.clear();
  for (const l of levels) enabledLevels.add(l);
  // fatal 始终保留
  enabledLevels.add('fatal');
}

/** 检查指定级别当前是否启用。供 DateConsoleLogger 使用。 */
export function isLogLevelEnabled(level: string): boolean {
  return enabledLevels.has(level as ConsoleCaptureLevel);
}

function readMaxLines(): number {
  const raw = Number(process.env.SERVER_CONSOLE_LOG_BUFFER_LINES ?? DEFAULT_MAX_LINES);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_LINES;
  }
  return Math.min(MAX_MAX_LINES, Math.max(MIN_MAX_LINES, Math.trunc(raw)));
}

function normalizeLimit(value: string | number | undefined): number {
  const raw = Number(value ?? DEFAULT_READ_LIMIT);
  if (!Number.isFinite(raw)) {
    return DEFAULT_READ_LIMIT;
  }
  return Math.min(MAX_READ_LIMIT, Math.max(1, Math.trunc(raw)));
}

function normalizeBeforeSeq(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(1, Math.trunc(raw));
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') {
    return stripAnsi(value);
  }
  if (value instanceof Error) {
    return stripAnsi(value.stack || value.message);
  }
  return stripAnsi(inspect(value, {
    breakLength: 160,
    colors: false,
    depth: 6,
    maxArrayLength: 100,
  }));
}

function appendConsoleEntry(level: ConsoleCaptureLevel, line: string, at: string, maxLines: number): void {
  entries.push({
    at,
    level,
    line,
    seq: nextSeq,
  });
  nextSeq += 1;
  if (entries.length > maxLines) {
    entries.splice(0, entries.length - maxLines);
  }
}

function captureConsoleCall(level: ConsoleCaptureLevel, args: unknown[], maxLines: number): void {
  if (!enabledLevels.has(level)) return;
  const at = new Date().toISOString();
  const text = args.length > 0 ? args.map(formatConsoleArg).join(' ') : '';
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    appendConsoleEntry(level, line, at, maxLines);
  }
}

export function captureServerLogLine(level: ConsoleCaptureLevel, line: string): void {
  if (!enabledLevels.has(level as ConsoleCaptureLevel)) return;
  const at = new Date().toISOString();
  const maxLines = readMaxLines();
  for (const textLine of stripAnsi(line).replace(/\n$/, '').split(/\r?\n/)) {
    appendConsoleEntry(level, textLine, at, maxLines);
  }
}

export function installConsoleLogCapture(): void {
  if (installed) {
    return;
  }
  installed = true;

  const maxLines = readMaxLines();
  const consoleRecord = console as unknown as Record<ConsoleCaptureLevel, (...args: unknown[]) => void>;
  for (const level of CONSOLE_CAPTURE_LEVELS) {
    const original = consoleRecord[level].bind(console);
    consoleRecord[level] = (...args: unknown[]) => {
      if (!enabledLevels.has(level)) return;
      captureConsoleCall(level, args, maxLines);
      original(...args);
    };
  }
}

export function readConsoleLogEntries(options: {
  beforeSeq?: string | number;
  limit?: string | number;
  levels?: ConsoleCaptureLevel[];
} = {}): GmServerLogsRes {
  const limit = normalizeLimit(options.limit);
  const beforeSeq = normalizeBeforeSeq(options.beforeSeq);
  const levelSet = options.levels && options.levels.length > 0
    ? new Set<string>(options.levels)
    : null;
  const filtered = levelSet
    ? entries.filter((entry) => levelSet.has(entry.level))
    : entries;
  const visibleEntries = beforeSeq === undefined
    ? filtered
    : filtered.filter((entry) => entry.seq < beforeSeq);
  const selected = visibleEntries.slice(Math.max(0, visibleEntries.length - limit));
  const firstSeq = selected[0]?.seq;
  const hasMore = firstSeq !== undefined && filtered.some((entry) => entry.seq < firstSeq);
  return {
    bufferSize: entries.length,
    entries: selected,
    hasMore,
    limit,
    nextBeforeSeq: firstSeq,
  };
}
