/**
 * gm/diagnostics-panel.ts —— GM 诊断面板：历史记录、渲染、查询执行、单元格编辑。
 *
 * 从 gm.ts 抽取：diagHistoryLoad/diagHistoryPush/diagHistoryNavigate/
 * renderDiagnosticsPanel/updateUndoButton/renderDiagnosticsResultAsTable/
 * renderResultSetTable/renderTableCell/diagPlayerHistoryLoad/
 * diagPlayerHistorySave/showDiagPrompt/startDiagCellEdit/
 * inferTableName/buildWhereFromRow/runDiagnosticsCommand。
 * 对 gm.ts 的依赖通过 DiagnosticsPanelContext 显式注入。
 */

import {
  type GmDiagnosticsQueryReq,
  type GmDiagnosticsQueryRes,
  type GmDiagnosticsResultSet,
} from '@mud/shared';
import {
  buildGmDiagnosticsQueryApiPath,
} from './api';
import {
  diagHistoryLoadFromStorage,
  diagHistoryPushToStorage,
  diagHistoryNavigateInStorage,
  diagPlayerHistoryLoadFromStorage,
  diagPlayerHistorySaveToStorage,
  renderDiagnosticsResultAsTableHtml as diagRenderDiagnosticsResultAsTableHtml,
  renderResultSetTableHtml as diagRenderResultSetTableHtml,
  renderTableCellHtml as diagRenderTableCellHtml,
} from './diagnostics';

/** DiagnosticsPanelContext：diagnostics-panel 对 gm.ts 的依赖。 */
export interface DiagnosticsPanelContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  escapeHtml(input: string): string;
  formatDateTime(value?: string): string;
  getDiagHistoryIndex(): number;
  setDiagHistoryIndex(index: number): void;
  getServerDiagnosticsLoading(): boolean;
  setServerDiagnosticsLoading(loading: boolean): void;
  getLastServerDiagnosticsResult(): GmDiagnosticsQueryRes | null;
  setLastServerDiagnosticsResult(result: GmDiagnosticsQueryRes | null): void;
  getLastExecCommand(): string | null;
  setLastExecCommand(command: string | null): void;
  getLastExecPreviousCommand(): string | null;
  setLastExecPreviousCommand(command: string | null): void;
  getDiagCommandEl(): HTMLTextAreaElement | null;
  getDiagLimitEl(): HTMLInputElement | null;
  getDiagRunBtn(): HTMLButtonElement | null;
  getDiagHelpBtn(): HTMLButtonElement | null;
  getDiagMetaEl(): HTMLDivElement | null;
  getDiagOutputEl(): HTMLDivElement | null;
  getDiagUndoBtn(): HTMLButtonElement | null;
}
export function diagHistoryLoad(ctx: DiagnosticsPanelContext): string[] {
  return diagHistoryLoadFromStorage();
}

export function diagHistoryPush(command: string, ctx: DiagnosticsPanelContext): void {
  diagHistoryPushToStorage(command);
  ctx.setDiagHistoryIndex(-1);
}

export function diagHistoryNavigate(direction: 'up' | 'down', ctx: DiagnosticsPanelContext): string | null {
  const result = diagHistoryNavigateInStorage(direction, ctx.getDiagHistoryIndex());
  ctx.setDiagHistoryIndex(result.newIndex);
  return result.command;
}

export function renderDiagnosticsPanel(ctx: DiagnosticsPanelContext): void {
  const runBtn = ctx.getDiagRunBtn();
  const helpBtn = ctx.getDiagHelpBtn();
  const metaEl = ctx.getDiagMetaEl();
  const outputEl = ctx.getDiagOutputEl();
  if (runBtn) runBtn.disabled = ctx.getServerDiagnosticsLoading();
  if (helpBtn) helpBtn.disabled = ctx.getServerDiagnosticsLoading();
  if (ctx.getServerDiagnosticsLoading()) {
    if (metaEl) metaEl.textContent = '查询执行中…';
    return;
  }
  if (!ctx.getLastServerDiagnosticsResult()) {
    if (metaEl) metaEl.textContent = '查询尚未执行。';
    if (outputEl) outputEl.innerHTML = '<pre class="server-log-view">可输入 help 查看可用指令。</pre>';
    return;
  }
  const result = ctx.getLastServerDiagnosticsResult()!;
  const statusText = result.ok ? '成功' : '失败';
  const rowCount = result.resultSets.reduce((sum, resultSet) => sum + resultSet.rowCount, 0);
  if (metaEl) metaEl.textContent = `${statusText} · ${ctx.formatDateTime(result.executedAt)} · ${result.durationMs} ms · ${rowCount} 行`;
  if (outputEl) outputEl.innerHTML = renderDiagnosticsResultAsTable(result, ctx);
}

export function updateUndoButton(ctx: DiagnosticsPanelContext): void {
  const btn = ctx.getDiagUndoBtn();
  if (btn) {
    const lastCmd = ctx.getLastExecCommand();
    btn.disabled = !lastCmd;
    if (lastCmd) {
      btn.setAttribute('aria-label', `撤回: ${lastCmd.slice(0, 80)}`);
    } else {
      btn.removeAttribute('aria-label');
    }
  }
}

export function renderDiagnosticsResultAsTable(result: GmDiagnosticsQueryRes, ctx: DiagnosticsPanelContext): string {
  return diagRenderDiagnosticsResultAsTableHtml(result);
}

export function renderResultSetTable(resultSet: GmDiagnosticsResultSet, ctx: DiagnosticsPanelContext): string {
  return diagRenderResultSetTableHtml(resultSet);
}

export function renderTableCell(value: unknown, col: string, ctx: DiagnosticsPanelContext): string {
  return diagRenderTableCellHtml(value, col);
}

export function diagPlayerHistoryLoad(ctx: DiagnosticsPanelContext): string[] {
  return diagPlayerHistoryLoadFromStorage();
}

export function diagPlayerHistorySave(value: string, ctx: DiagnosticsPanelContext): void {
  diagPlayerHistorySaveToStorage(value);
}

export function showDiagPrompt(title: string, ctx: DiagnosticsPanelContext): Promise<string | null> {
  return new Promise((resolve) => {
    const history = diagPlayerHistoryLoad(ctx);
    const overlay = document.createElement('div');
    overlay.className = 'diag-prompt-overlay';

    const box = document.createElement('div');
    box.className = 'diag-prompt-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'diag-prompt-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    const input = document.createElement('input');
    input.className = 'diag-prompt-input';
    input.type = 'text';
    input.placeholder = '输入后回车确认';
    box.appendChild(input);

    if (history.length > 0) {
      const historySection = document.createElement('div');
      historySection.className = 'diag-prompt-history';
      const historyTitle = document.createElement('div');
      historyTitle.className = 'diag-prompt-history-title';
      historyTitle.textContent = '最近使用';
      historySection.appendChild(historyTitle);
      for (const item of history) {
        const row = document.createElement('div');
        row.className = 'diag-prompt-history-item';
        row.textContent = item;
        row.addEventListener('click', () => { cleanup(); diagPlayerHistorySave(item, ctx); resolve(item); });
        historySection.appendChild(row);
      }
      box.appendChild(historySection);
    }

    const actions = document.createElement('div');
    actions.className = 'diag-prompt-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'primary';
    confirmBtn.textContent = '确定';
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();

    const cleanup = () => { overlay.remove(); };
    const submit = () => {
      const val = input.value.trim();
      if (!val) { cleanup(); resolve(null); return; }
      cleanup();
      diagPlayerHistorySave(val, ctx);
      resolve(val);
    };

    cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve(null); }
    });
  });
}

export function startDiagCellEdit(td: HTMLTableCellElement, ctx: DiagnosticsPanelContext): void {
  const rawValue = td.dataset.rawValue ?? td.textContent ?? '';
  const originalHtml = td.innerHTML;
  const originalClasses = td.className;
  td.className = 'cell-editing';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = rawValue === 'NULL' ? '' : rawValue;
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const cancel = () => {
    td.className = originalClasses;
    td.innerHTML = originalHtml;
  };

  const commit = () => {
    const newValue = input.value;
    if (newValue === rawValue || (rawValue === 'NULL' && newValue === '')) {
      cancel();
      return;
    }
    // 生成 UPDATE SQL 并执行
    const col = td.dataset.col;
    const tr = td.closest('tr');
    const table = td.closest<HTMLTableElement>('table.diagnostics-table');
    const title = table?.dataset.diagTitle ?? '';
    if (!col || !tr || !title) {
      cancel();
      ctx.setStatus('无法确定表名或列名', true);
      return;
    }
    const tableName = inferTableName(title, ctx);
    if (!tableName) {
      cancel();
      ctx.setStatus(`无法从 "${title}" 推断表名，请手动执行 exec`, true);
      return;
    }
    const whereClause = buildWhereFromRow(tr, col, ctx);
    if (!whereClause) {
      cancel();
      ctx.setStatus('无法确定 WHERE 条件（需要行内有可用主键列）', true);
      return;
    }
    const sqlValue = newValue === '' || newValue.toLowerCase() === 'null' ? 'NULL' : `'${newValue.replace(/'/gu, "''")}'`;
    const sql = `exec UPDATE ${tableName} SET ${col} = ${sqlValue} WHERE ${whereClause}`;
    const cmdEl = ctx.getDiagCommandEl();
    if (cmdEl) cmdEl.value = sql;
    cancel();
    runDiagnosticsCommand(sql, ctx).catch((err: unknown) => {
      ctx.setStatus(err instanceof Error ? err.message : '执行修改失败', true);
    });
  };

  input.addEventListener('blur', cancel, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.removeEventListener('blur', cancel);
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', cancel);
      cancel();
    }
  });
}

export function inferTableName(title: string, ctx: DiagnosticsPanelContext): string {
  // title 格式如 "techniques 454", "inventory xxx", "table outbox_event", "identity (xxx)", "wallet (xxx)"
  const cleaned = title.replace(/\s*\(.*\)\s*$/u, '').trim();
  const parts = cleaned.split(/\s+/u);
  // 预置命令名到表名的映射
  const commandToTable: Record<string, string> = {
    identity: 'server_player_identity',
    inventory: 'player_inventory_item',
    equipment: 'player_equipment_slot',
    techniques: 'player_technique_state',
    quests: 'player_quest_progress',
    buffs: 'player_persistent_buff_state',
    wallet: 'player_wallet',
    counters: 'player_counters',
    mail: 'player_mail',
    presence: 'player_presence',
    snapshot: 'server_player_snapshot',
    'outbox summary': 'outbox_event',
    'outbox topics': 'outbox_event',
    'outbox sample': 'outbox_event',
    deadletter: 'dead_letter_event',
    market: 'server_market_order',
    trades: 'server_market_trade_history',
    flush: 'player_flush_ledger',
    audit: 'asset_audit_log',
  };
  const verb = parts[0]?.toLowerCase() ?? '';
  if (commandToTable[verb]) return commandToTable[verb];
  // "table xxx" 格式
  if (verb === 'table' && parts[1]) return parts[1];
  // 如果 title 本身看起来像表名
  if (/^[a-z_][a-z0-9_]*$/u.test(cleaned)) return cleaned;
  return '';
}

export function buildWhereFromRow(tr: HTMLElement, excludeCol: string, ctx: DiagnosticsPanelContext): string {
  // 优先用常见主键列构建 WHERE
  const primaryKeyCandidates = [
    'player_id', 'item_instance_id', 'event_id', 'mail_id', 'order_id',
    'log_id', 'instance_id', 'slot_type', 'tech_id', 'quest_id',
    'buff_id', 'counter_key', 'wallet_type', 'slot_index',
  ];
  const cells = tr.querySelectorAll<HTMLTableCellElement>('td[data-col]');
  const conditions: string[] = [];
  // 先找主键列
  for (const candidate of primaryKeyCandidates) {
    for (const cell of cells) {
      if (cell.dataset.col === candidate) {
        const val = cell.dataset.rawValue ?? '';
        if (val && val !== 'NULL') {
          conditions.push(`${candidate} = '${val.replace(/'/gu, "''")}'`);
        }
      }
    }
    if (conditions.length > 0) break;
  }
  // 如果没找到主键，用前两个非空非修改列
  if (conditions.length === 0) {
    for (const cell of cells) {
      const col = cell.dataset.col ?? '';
      if (col === excludeCol) continue;
      const val = cell.dataset.rawValue ?? '';
      if (val && val !== 'NULL' && val !== '{}' && val !== '[]') {
        conditions.push(`${col} = '${val.replace(/'/gu, "''")}'`);
        if (conditions.length >= 2) break;
      }
    }
  }
  return conditions.join(' AND ');
}

export async function runDiagnosticsCommand(command: string, ctx: DiagnosticsPanelContext): Promise<void> {
  if (!ctx.getToken() || ctx.getServerDiagnosticsLoading()) {
    return;
  }
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    ctx.setStatus('请输入查询指令', true);
    return;
  }
  // 在重绘前读取当前 UI 状态
  const limitEl = ctx.getDiagLimitEl();
  const currentLimit = limitEl ? Number(limitEl.value) : 50;
  diagHistoryPush(normalizedCommand, ctx);
  ctx.setServerDiagnosticsLoading(true);
  renderDiagnosticsPanel(ctx);
  try {
    const requestBody: GmDiagnosticsQueryReq = {
      command: normalizedCommand,
      limit: Number.isFinite(currentLimit) ? Math.trunc(currentLimit) : undefined,
      confirm: true,
    };
    ctx.setLastServerDiagnosticsResult(await ctx.request<GmDiagnosticsQueryRes>(buildGmDiagnosticsQueryApiPath(), {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }));
    // 记录 exec 命令用于撤回
    const result = ctx.getLastServerDiagnosticsResult()!;
    if (result.ok && normalizedCommand.toLowerCase().startsWith('exec ')) {
      ctx.setLastExecPreviousCommand(ctx.getLastExecCommand());
      ctx.setLastExecCommand(normalizedCommand);
    }
    ctx.setStatus(result.ok ? '诊断查询完成' : `诊断查询失败：${result.message ?? '未知错误'}`, !result.ok);
  } finally {
    ctx.setServerDiagnosticsLoading(false);
    renderDiagnosticsPanel(ctx);
    updateUndoButton(ctx);
  }
}
