/**
 * gm/diagnostics.ts —— GM 诊断控制台渲染与历史管理。
 *
 * 从 gm.ts 抽取：renderDiagnosticsResultAsTable、renderResultSetTable、
 * renderTableCell、diagHistoryLoad/Push/Navigate、diagPlayerHistoryLoad/Save。
 * 纯函数，不依赖 gm.ts 模块级 DOM 引用。
 */

import type {
  GmDiagnosticsQueryRes,
  GmDiagnosticsResultSet,
} from '@mud/shared';
import { escapeHtml } from './format';

// ── 诊断结果表格渲染 ──

/** renderDiagnosticsResultAsTableHtml：渲染诊断查询结果为表格 HTML。 */
export function renderDiagnosticsResultAsTableHtml(result: GmDiagnosticsQueryRes): string {
  const parts: string[] = [];
  if (result.message) {
    parts.push(`<div class="diagnostics-meta-bar" style="color:var(--stamp-red);">${escapeHtml(result.message)}</div>`);
  }
  if (result.warnings && result.warnings.length > 0) {
    parts.push(`<div class="diagnostics-meta-bar">${result.warnings.map((w) => escapeHtml(w)).join(' · ')}</div>`);
  }
  for (const resultSet of result.resultSets) {
    parts.push('<div class="diagnostics-result-section">');
    parts.push(`<div class="diagnostics-result-title">${escapeHtml(resultSet.title)} (${resultSet.rowCount}${resultSet.truncated ? '+' : ''} rows)</div>`);
    if (resultSet.rows.length === 0) {
      parts.push('<div class="diagnostics-meta-bar">(empty)</div>');
    } else {
      parts.push(renderResultSetTableHtml(resultSet));
    }
    parts.push('</div>');
  }
  return parts.join('');
}

/** renderResultSetTableHtml：渲染单个结果集为表格 HTML。 */
export function renderResultSetTableHtml(resultSet: GmDiagnosticsResultSet): string {
  const columns = resultSet.columns && resultSet.columns.length > 0
    ? resultSet.columns
    : Object.keys(resultSet.rows[0] ?? {});
  const rows: string[] = [];
  rows.push(`<table class="diagnostics-table" data-diag-title="${escapeHtml(resultSet.title)}"><thead><tr>`);
  for (const col of columns) {
    rows.push(`<th>${escapeHtml(col)}</th>`);
  }
  rows.push('</tr></thead><tbody>');
  for (let rowIdx = 0; rowIdx < resultSet.rows.length; rowIdx++) {
    const row = resultSet.rows[rowIdx] as Record<string, unknown>;
    rows.push(`<tr data-row-idx="${rowIdx}">`);
    for (const col of columns) {
      const value = row[col];
      rows.push(renderTableCellHtml(value, col));
    }
    rows.push('</tr>');
  }
  rows.push('</tbody></table>');
  return rows.join('');
}

/** renderTableCellHtml：渲染单个表格单元格 HTML。 */
export function renderTableCellHtml(value: unknown, col: string): string {
  const colAttr = `data-col="${escapeHtml(col)}"`;
  if (value === null || value === undefined) {
    return `<td class="cell-null diag-cell-editable" ${colAttr} data-raw-value="NULL">NULL</td>`;
  }
  if (typeof value === 'boolean') {
    return `<td class="cell-bool-${value} diag-cell-editable" ${colAttr} data-raw-value="${value}">${value}</td>`;
  }
  if (typeof value === 'number') {
    return `<td class="cell-number diag-cell-editable" ${colAttr} data-raw-value="${value}">${value}</td>`;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    const display = json.length > 120 ? `${json.slice(0, 120)}…` : json;
    return `<td class="diag-cell-editable" ${colAttr} aria-label="${escapeHtml(json)}" data-raw-value="${escapeHtml(json)}">${escapeHtml(display)}</td>`;
  }
  const str = String(value);
  const display = str.length > 80 ? `${str.slice(0, 80)}…` : str;
  return `<td class="diag-cell-editable" ${colAttr} aria-label="${escapeHtml(str)}" data-raw-value="${escapeHtml(str)}">${escapeHtml(display)}</td>`;
}

// ── 诊断命令历史 ──

const DIAG_HISTORY_KEY = 'gm_diag_history';
const DIAG_HISTORY_MAX = 50;

/** diagHistoryLoadFromStorage：从 localStorage 加载诊断命令历史。 */
export function diagHistoryLoadFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(DIAG_HISTORY_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

/** diagHistoryPushToStorage：将命令推入诊断历史并持久化。 */
export function diagHistoryPushToStorage(command: string): void {
  const history = diagHistoryLoadFromStorage();
  const idx = history.indexOf(command);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(command);
  if (history.length > DIAG_HISTORY_MAX) history.length = DIAG_HISTORY_MAX;
  localStorage.setItem(DIAG_HISTORY_KEY, JSON.stringify(history));
}

/** diagHistoryNavigateInStorage：在诊断历史中上下导航。 */
export function diagHistoryNavigateInStorage(
  direction: 'up' | 'down',
  currentIndex: number,
): { command: string | null; newIndex: number } {
  const history = diagHistoryLoadFromStorage();
  if (history.length === 0) return { command: null, newIndex: currentIndex };
  if (direction === 'up') {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      return { command: history[newIndex] ?? null, newIndex };
    }
    return { command: null, newIndex: currentIndex };
  }
  if (currentIndex > 0) {
    const newIndex = currentIndex - 1;
    return { command: history[newIndex] ?? null, newIndex };
  }
  if (currentIndex === 0) {
    return { command: '', newIndex: -1 };
  }
  return { command: null, newIndex: currentIndex };
}

// ── 诊断玩家历史 ──

const DIAG_PLAYER_HISTORY_KEY = 'gm_diag_player_history';
const DIAG_PLAYER_HISTORY_MAX = 10;

/** diagPlayerHistoryLoadFromStorage：从 localStorage 加载诊断玩家历史。 */
export function diagPlayerHistoryLoadFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(DIAG_PLAYER_HISTORY_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

/** diagPlayerHistorySaveToStorage：将玩家 ID 保存到诊断玩家历史。 */
export function diagPlayerHistorySaveToStorage(value: string): void {
  const history = diagPlayerHistoryLoadFromStorage();
  const idx = history.indexOf(value);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(value);
  if (history.length > DIAG_PLAYER_HISTORY_MAX) history.length = DIAG_PLAYER_HISTORY_MAX;
  localStorage.setItem(DIAG_PLAYER_HISTORY_KEY, JSON.stringify(history));
}
