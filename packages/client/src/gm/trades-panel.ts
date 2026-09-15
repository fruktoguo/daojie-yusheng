/**
 * gm/trades-panel.ts —— GM 交易记录面板：加载、渲染、分页。
 *
 * 从 gm.ts 抽取：loadTrades/renderTrades/renderTradeRow/
 * formatTradePartyLabel/formatTradePrice/formatTradeTimestamp。
 * 对 gm.ts 的依赖通过 TradesPanelContext 显式注入。
 */

import {
  type GmMarketTradeItem,
  type GmMarketTradeListRes,
} from '@mud/shared';
import {
  formatTradePartyLabel as genFormatTradePartyLabel,
  formatTradePrice as genFormatTradePrice,
  formatTradeTimestamp as genFormatTradeTimestamp,
  renderTradeRow as genRenderTradeRow,
} from './gen-technique-format';

/** TradesQueryState：交易记录查询状态。 */
export interface TradesQueryState {
  page: number;
  pageSize: number;
  playerKeyword: string;
  itemKeyword: string;
}

/** TradesPanelContext：trades-panel 对 gm.ts 的依赖。 */
export interface TradesPanelContext {
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  escapeHtml(input: string): string;
  getTradesQueryState(): TradesQueryState;
  setTradesQueryState(state: TradesQueryState): void;
  tradesListEl: HTMLElement;
  tradesMetaEl: HTMLElement;
  tradesPageMetaEl: HTMLElement;
  tradesPageNextBtn: HTMLButtonElement;
  tradesPagePrevBtn: HTMLButtonElement;
}
/** loadTrades：根据当前/给定查询条件请求服务端并渲染。 */
export async function loadTrades(options: { resetPage?: boolean; playerKeyword?: string; itemKeyword?: string; pageSize?: number } | undefined, ctx: TradesPanelContext): Promise<void> {
  if (options?.resetPage) {
    ctx.getTradesQueryState().page = 1;
  }
  if (typeof options?.playerKeyword === 'string') {
    ctx.getTradesQueryState().playerKeyword = options.playerKeyword.trim();
  }
  if (typeof options?.itemKeyword === 'string') {
    ctx.getTradesQueryState().itemKeyword = options.itemKeyword.trim();
  }
  if (typeof options?.pageSize === 'number' && Number.isFinite(options.pageSize)) {
    ctx.getTradesQueryState().pageSize = Math.max(1, Math.min(200, Math.trunc(options.pageSize)));
  }

  const params = new URLSearchParams();
  params.set('page', String(ctx.getTradesQueryState().page));
  params.set('pageSize', String(ctx.getTradesQueryState().pageSize));
  if (ctx.getTradesQueryState().playerKeyword) {
    params.set('playerKeyword', ctx.getTradesQueryState().playerKeyword);
  }
  if (ctx.getTradesQueryState().itemKeyword) {
    params.set('itemKeyword', ctx.getTradesQueryState().itemKeyword);
  }

  ctx.tradesMetaEl.textContent = '查询中…';
  try {
    const result = await ctx.request<GmMarketTradeListRes>(`${ctx.GM_API_BASE_PATH}/market/trades?${params.toString()}`);
    ctx.getTradesQueryState().page = result.page;
    ctx.getTradesQueryState().pageSize = result.pageSize;
    renderTrades(result, ctx);
  } catch (error) {
    ctx.tradesMetaEl.textContent = '';
    ctx.tradesListEl.innerHTML = `<div class="empty-hint" style="color:var(--stamp-red);">${ctx.escapeHtml(error instanceof Error ? error.message : '加载失败')}</div>`;
    ctx.tradesPagePrevBtn.disabled = true;
    ctx.tradesPageNextBtn.disabled = true;
  }
}

/** renderTrades：把后端返回结果渲染成表格 + 分页元信息。 */
export function renderTrades(result: GmMarketTradeListRes, ctx: TradesPanelContext): void {
  const { items, total, page, pageSize, totalPages, playerKeyword, itemKeyword } = result;
  const conditionParts: string[] = [];
  if (playerKeyword) {
    conditionParts.push(`玩家="${ctx.escapeHtml(playerKeyword)}"`);
  }
  if (itemKeyword) {
    conditionParts.push(`物品="${ctx.escapeHtml(itemKeyword)}"`);
  }
  ctx.tradesMetaEl.innerHTML = `共 ${total} 条 · 当前条件 ${conditionParts.length > 0 ? conditionParts.join('，') : '无'}`;
  ctx.tradesPageMetaEl.textContent = `第 ${page} / ${Math.max(1, totalPages)} 页 · 共 ${total} 条`;
  ctx.tradesPagePrevBtn.disabled = page <= 1;
  ctx.tradesPageNextBtn.disabled = page >= totalPages;

  if (items.length === 0) {
    ctx.tradesListEl.innerHTML = '<div class="empty-hint">没有符合条件的交易记录。</div>';
    return;
  }

  const rowsHtml = items.map((row) => renderTradeRow(row, ctx)).join('');
  ctx.tradesListEl.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:rgba(255,255,255,0.6); border-bottom:1.5px solid var(--ink-black);">
          <th style="text-align:left; padding:8px 10px;">完成时间</th>
          <th style="text-align:left; padding:8px 10px;">来源</th>
          <th style="text-align:left; padding:8px 10px;">买家</th>
          <th style="text-align:left; padding:8px 10px;">卖家</th>
          <th style="text-align:left; padding:8px 10px;">物品</th>
          <th style="text-align:right; padding:8px 10px;">数量</th>
          <th style="text-align:right; padding:8px 10px;">单价</th>
          <th style="text-align:right; padding:8px 10px;">总价</th>
          <th style="text-align:left; padding:8px 10px;">交易 ID</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

export function renderTradeRow(row: GmMarketTradeItem, ctx: TradesPanelContext): string {
  return genRenderTradeRow(row);
}

export function formatTradePartyLabel(playerNo: number | null | undefined, playerName: string | null | undefined, _playerId: string, ctx: TradesPanelContext): string {
  return genFormatTradePartyLabel(playerNo, playerName, _playerId);
}

export function formatTradePrice(value: number, ctx: TradesPanelContext): string {
  return genFormatTradePrice(value);
}

export function formatTradeTimestamp(ms: number, ctx: TradesPanelContext): string {
  return genFormatTradeTimestamp(ms);
}

/** changeGmPassword：处理变更GM密码。 */
