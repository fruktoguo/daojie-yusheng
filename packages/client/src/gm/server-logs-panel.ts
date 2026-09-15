/**
 * gm/server-logs-panel.ts —— GM 服务端日志面板：日志行格式化、面板渲染、日志加载。
 *
 * 从 gm.ts 抽取：formatServerLogLine/renderServerLogsPanel/loadServerLogs。
 * 对 gm.ts 的依赖通过 ServerLogsPanelContext 显式注入。
 */

import {
  type GmServerLogEntry,
  type GmServerLogsRes,
} from '@mud/shared';

/** ServerLogsPanelContext：server-logs-panel 对 gm.ts 的依赖。 */
export interface ServerLogsPanelContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  escapeHtml(input: string): string;
  formatDateTime(value?: string): string;
  buildGmServerLogsApiPath(beforeSeq?: number): string;
  getServerLogsLoading(): boolean;
  setServerLogsLoading(loading: boolean): void;
  getServerLogsEntries(): GmServerLogEntry[];
  setServerLogsEntries(entries: GmServerLogEntry[]): void;
  getServerLogsNextBeforeSeq(): number | undefined;
  setServerLogsNextBeforeSeq(seq: number | undefined): void;
  getServerLogsHasMore(): boolean;
  setServerLogsHasMore(hasMore: boolean): void;
  getServerLogsBufferSize(): number;
  setServerLogsBufferSize(size: number): void;
  serverLogsContentEl: HTMLElement;
  serverLogsMetaEl: HTMLElement;
  serverLogsLoadOlderBtn: HTMLButtonElement;
  serverLogsRefreshBtn: HTMLButtonElement;
}
export function formatServerLogLine(entry: GmServerLogEntry, ctx: ServerLogsPanelContext): string {
  const level = entry.level.toUpperCase().padEnd(5, ' ');
  return `[${ctx.formatDateTime(entry.at)}] [${level}] ${entry.line}`;
}

/** renderServerLogsPanel：渲染服务端日志面板。 */
export function renderServerLogsPanel(ctx: ServerLogsPanelContext): void {
  ctx.serverLogsContentEl.textContent = ctx.getServerLogsEntries().length > 0
    ? ctx.getServerLogsEntries().map((entry) => formatServerLogLine(entry, ctx)).join('\n')
    : '当前还没有服务端日志。';
  ctx.serverLogsLoadOlderBtn.disabled = ctx.getServerLogsLoading() || !ctx.getServerLogsHasMore();
  ctx.serverLogsRefreshBtn.disabled = ctx.getServerLogsLoading();
  if (ctx.getServerLogsLoading()) {
    ctx.serverLogsMetaEl.textContent = '日志读取中…';
    return;
  }
  const moreText = ctx.getServerLogsHasMore() ? '可继续加载更早日志' : '已到当前缓冲起点';
  ctx.serverLogsMetaEl.textContent = `已加载 ${ctx.getServerLogsEntries().length} 行 · 缓冲 ${ctx.getServerLogsBufferSize()} 行 · ${ctx.getServerLogsEntries().length > 0 ? moreText : '暂无日志'}`;
}

/** loadServerLogs：读取服务端控制台日志。 */
export async function loadServerLogs(loadOlder: boolean, ctx: ServerLogsPanelContext): Promise<void> {
  if (ctx.getServerLogsLoading()) {
    return;
  }
  const beforeSeq = loadOlder ? ctx.getServerLogsNextBeforeSeq() : undefined;
  if (loadOlder && beforeSeq === undefined) {
    return;
  }

  const previousBottomOffset = ctx.serverLogsContentEl.scrollHeight - ctx.serverLogsContentEl.scrollTop;
  /** ctx.getServerLogsLoading()：服务端日志读取中。 */
  ctx.setServerLogsLoading(true);
  renderServerLogsPanel(ctx);
  try {
    const data = await ctx.request<GmServerLogsRes>(ctx.buildGmServerLogsApiPath(beforeSeq));
    if (loadOlder) {
      const existingSeqs = new Set(ctx.getServerLogsEntries().map((entry) => entry.seq));
      const olderEntries = data.entries.filter((entry) => !existingSeqs.has(entry.seq));
      /** ctx.getServerLogsEntries()：服务端日志已加载行。 */
      ctx.setServerLogsEntries([...olderEntries, ...ctx.getServerLogsEntries()]);
    } else {
      /** ctx.getServerLogsEntries()：服务端日志已加载行。 */
      ctx.setServerLogsEntries(data.entries);
    }
    /** ctx.getServerLogsNextBeforeSeq()：服务端日志向上翻页游标。 */
    ctx.setServerLogsNextBeforeSeq(data.nextBeforeSeq);
    /** ctx.getServerLogsHasMore()：服务端日志是否还有更早行。 */
    ctx.setServerLogsHasMore(data.hasMore);
    /** ctx.getServerLogsBufferSize()：服务端日志缓冲行数。 */
    ctx.setServerLogsBufferSize(data.bufferSize);
  } finally {
    /** ctx.getServerLogsLoading()：服务端日志读取中。 */
    ctx.setServerLogsLoading(false);
    renderServerLogsPanel(ctx);
    if (loadOlder) {
      ctx.serverLogsContentEl.scrollTop = Math.max(0, ctx.serverLogsContentEl.scrollHeight - previousBottomOffset);
    } else {
      ctx.serverLogsContentEl.scrollTop = ctx.serverLogsContentEl.scrollHeight;
    }
  }
}
