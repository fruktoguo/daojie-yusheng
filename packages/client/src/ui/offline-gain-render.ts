/**
 * 本文件是客户端 DOM UI 的 offline gain render 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import type { OfflineGainReportView } from '@mud/shared';
import { formatDisplayInteger } from '../utils/number';

export function renderOfflineGainReports(reports: readonly OfflineGainReportView[]): string {
  return `
    <div class="offline-gain-modal">
      ${reports.map((report) => renderOfflineGainReport(report)).join('')}
    </div>
  `;
}

export function renderOfflineGainReport(report: OfflineGainReportView): string {
  const sections = [
    renderSpiritStoneSection(report),
    renderProgressSection(report),
    renderTechniqueSection(report),
    renderProfessionSection(report),
    renderItemSection(report),
  ].filter(Boolean).join('');
  const empty = sections
    ? ''
    : '<div class="ui-empty-hint compact">本次没有收支变化</div>';
  return `
    <section class="offline-gain-report">
      <div class="offline-gain-summary">
        <div>
          <span class="offline-gain-label">范围</span>
          <strong>${report.scope === 'offline' ? '离线挂机' : '在线'}</strong>
        </div>
        <div>
          <span class="offline-gain-label">统计时长</span>
          <strong>${escapeHtml(formatOfflineGainDuration(report.durationMs))}</strong>
        </div>
        <div>
          <span class="offline-gain-label">开始</span>
          <strong>${escapeHtml(formatOfflineGainTime(report.startedAt))}</strong>
        </div>
        <div>
          <span class="offline-gain-label">结束</span>
          <strong>${escapeHtml(formatOfflineGainTime(report.endedAt))}</strong>
        </div>
      </div>
      ${sections}
      ${empty}
    </section>
  `;
}

export function formatOfflineGainDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}小时${minutes}分`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

export function formatOfflineGainGain(amount: number, levelGain?: number): string {
  return formatSignedAmount(amount, 0, levelGain);
}

export function formatSignedAmount(gained: number, lost = 0, levelGain?: number, levelLoss?: number): string {
  const parts = [];
  if (gained > 0) {
    parts.push(`+${formatDisplayInteger(gained)}`);
  }
  if (lost > 0) {
    parts.push(`-${formatDisplayInteger(lost)}`);
  }
  if (parts.length === 0) {
    parts.push('0');
  }
  if ((levelGain ?? 0) > 0) {
    parts.push(`升${formatDisplayInteger(levelGain ?? 0)}级`);
  }
  if ((levelLoss ?? 0) > 0) {
    parts.push(`降${formatDisplayInteger(levelLoss ?? 0)}级`);
  }
  return parts.join(' · ');
}

export function formatOfflineGainTime(timestamp: number): string {
  const normalized = Number.isFinite(timestamp) ? Math.max(0, Math.trunc(timestamp)) : 0;
  if (normalized <= 0) {
    return '未知';
  }
  try {
    return new Date(normalized).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '未知';
  }
}

function renderSpiritStoneSection(report: OfflineGainReportView): string {
  const spiritStones = report.spiritStones;
  if (!spiritStones || (spiritStones.gained <= 0 && spiritStones.lost <= 0)) {
    return '';
  }
  return renderListSection(
    '灵石收支',
    [`
      <div class="offline-gain-row">
        <span>灵石</span>
        <strong>${escapeHtml(formatSignedAmount(spiritStones.gained, spiritStones.lost))}</strong>
      </div>
    `],
  );
}

function renderProgressSection(report: OfflineGainReportView): string {
  const progressRows = report.progress.filter((entry) => entry.kind !== 'bodyTrainingExp');
  if (progressRows.length === 0) {
    return '';
  }
  return renderListSection(
    '修行收支',
    progressRows.map((entry) => `
      <div class="offline-gain-row">
        <span>${escapeHtml(entry.label)}</span>
        <strong>${escapeHtml(formatSignedAmount(entry.gained, entry.lost, entry.levelGain, entry.levelLoss))}</strong>
      </div>
    `),
  );
}

function renderTechniqueSection(report: OfflineGainReportView): string {
  const bodyTrainingRows = report.progress.filter((entry) => entry.kind === 'bodyTrainingExp');
  const rows = [
    ...bodyTrainingRows.map((entry) => `
      <div class="offline-gain-row">
        <span>${escapeHtml(entry.label)}</span>
        <strong>${escapeHtml(formatSignedAmount(entry.gained, entry.lost, entry.levelGain, entry.levelLoss))}</strong>
      </div>
    `),
    ...report.techniques.map((entry) => `
      <div class="offline-gain-row">
        <span>${escapeHtml(entry.name?.trim() || '未知功法')}</span>
        <strong>${escapeHtml(formatSignedAmount(entry.expGained, entry.expLost, entry.levelGain, entry.levelLoss))}</strong>
      </div>
    `),
  ];
  if (rows.length === 0) {
    return '';
  }
  return renderListSection(
    '功法经验收支',
    rows,
  );
}

function renderProfessionSection(report: OfflineGainReportView): string {
  if (report.professions.length === 0) {
    return '';
  }
  return renderListSection(
    '技艺经验收支',
    report.professions.map((entry) => `
      <div class="offline-gain-row">
        <span>${escapeHtml(entry.label)}</span>
        <strong>${escapeHtml(formatSignedAmount(entry.expGained, entry.expLost, entry.levelGain, entry.levelLoss))}</strong>
      </div>
    `),
  );
}

function renderItemSection(report: OfflineGainReportView): string {
  if (report.items.length === 0) {
    return '';
  }
  return renderListSection(
    '物品收支',
    report.items.map((entry) => `
      <div class="offline-gain-row">
        <span>${escapeHtml(entry.name || '未知物品')}</span>
        <strong>${escapeHtml(formatSignedAmount(entry.gained ?? 0, entry.lost ?? 0))}</strong>
      </div>
    `),
  );
}

function renderListSection(title: string, rows: string[]): string {
  return `
    <div class="panel-section offline-gain-section">
      <div class="panel-section-title">${escapeHtml(title)}</div>
      <div class="offline-gain-list">${rows.join('')}</div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}
