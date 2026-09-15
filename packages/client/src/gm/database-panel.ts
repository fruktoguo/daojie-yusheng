/**
 * gm/database-panel.ts —— GM 数据库面板纯 HTML 渲染。
 *
 * 从 gm.ts 抽取：renderTableStatsContentHtml。
 * 纯函数，接收类型化数据，返回 HTML 字符串，不依赖 gm.ts 模块级 DOM 引用。
 */

import type { GmDatabaseTableStatsRes, GmDatabaseBackupRecord } from '@mud/shared';
import { escapeHtml, formatBytes } from './format';

/** renderTableStatsContentHtml：渲染表占用统计 HTML。 */
export function renderTableStatsContentHtml(
  loading: boolean,
  data: GmDatabaseTableStatsRes | null,
  cleanupBusy: boolean,
  formatDateTime: (value?: string) => string,
): string {
  if (loading) {
    return '<div class="note-card">正在加载表占用统计…</div>';
  }
  if (!data) {
    return `
      <div class="button-row">
        <button class="small-btn primary" data-action="load-table-stats" type="button">加载表占用统计</button>
      </div>
      <div class="empty-hint">点击上方按钮查询各表占用情况。</div>
    `;
  }
  const tables = data.tables;
  const tableRows = tables.map((t) => {
    const cleanupAllowed = t.cleanupAllowed === true;
    const cleanupOlderThanAllowed = cleanupAllowed && t.cleanupOlderThanAllowed === true;
    const cleanupMeta = cleanupAllowed
      ? `可清理${t.cleanupTimeColumn ? ` · 时间列 ${t.cleanupTimeColumn}` : ''}${t.cleanupBlockedReason ? ` · ${t.cleanupBlockedReason}` : ''}`
      : (t.cleanupBlockedReason || '真源保护');
    return `
      <div class="network-row">
        <div class="network-row-label">${escapeHtml(t.tableName)}</div>
        <div class="network-row-meta">行数(估) ${escapeHtml(String(t.rowEstimate))} · 总大小 ${escapeHtml(t.totalSize)} · 数据 ${escapeHtml(t.tableSize)} · 索引 ${escapeHtml(t.indexSize)} · ${escapeHtml(cleanupMeta)}</div>
        ${cleanupAllowed ? `
          <div class="button-row" style="margin-top:4px;">
            <button class="small-btn danger" ${cleanupOlderThanAllowed ? `data-cleanup-target="${escapeHtml(t.tableName)}" data-cleanup-mode="older_than"` : 'aria-label="缺少可按时间清理的列"'} type="button" ${cleanupBusy || !cleanupOlderThanAllowed ? 'disabled' : ''}>清理 7 天前数据</button>
            <button class="small-btn danger" data-cleanup-target="${escapeHtml(t.tableName)}" data-cleanup-mode="all" type="button" ${cleanupBusy ? 'disabled' : ''}>直接清空</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="button-row">
      <button class="small-btn primary" data-action="load-table-stats" type="button">刷新统计</button>
    </div>
    <div class="note-card">总占用: ${escapeHtml(data.totalSize)} · 统计时间: ${escapeHtml(formatDateTime(data.fetchedAt))}</div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">各表占用明细</div>
        <div class="network-breakdown-subtitle">除真实落盘数据表外，可清理 7 天前数据，也可直接清空整表；实际权限由服务端保护</div>
      </div>
      <div class="network-breakdown-list">${tableRows}</div>
    </div>
  `;
}

/** renderBackupListHtml：渲染备份列表 HTML。 */
export function renderBackupListHtml(
  backups: GmDatabaseBackupRecord[],
  busy: boolean,
  formatBackupKind: (kind: GmDatabaseBackupRecord['kind']) => string,
  formatBackupFormat: (format: GmDatabaseBackupRecord['format']) => string,
  formatDateTime: (value?: string) => string,
): string {
  if (backups.length === 0) {
    return '<div class="empty-hint">当前还没有持久化备份。</div>';
  }
  return backups.map((backup) => `
    <div class="network-row">
      <div class="network-row-label">${escapeHtml(backup.fileName)}</div>
      <div class="network-row-meta">
        ${escapeHtml(formatBackupKind(backup.kind))} · ${escapeHtml(formatBackupFormat(backup.format))} · ${escapeHtml(formatDateTime(backup.createdAt))} · ${escapeHtml(formatBytes(backup.sizeBytes))}
      </div>
      <div class="button-row" style="margin-top:8px;">
        <button class="small-btn" data-db-download="${escapeHtml(backup.id)}" type="button">下载备份</button>
        <button class="small-btn danger" data-db-restore="${escapeHtml(backup.id)}" type="button" ${busy || backup.format !== 'postgres_custom_dump' ? 'disabled' : ''}>恢复数据库备份</button>
      </div>
    </div>
  `).join('');
}
