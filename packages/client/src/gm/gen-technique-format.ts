/**
 * gm/gen-technique-format.ts —— GM 自创功法/生成任务/交易记录纯格式化函数。
 *
 * 从 gm.ts 抽取：getGeneratedTechniqueGradeLabel/
 * formatTechniqueGenerationJobItemState/formatTechniqueGenerationJobPlayerLabel/
 * formatTechniqueGenerationJobStatus/formatTradePartyLabel/
 * formatTradePrice/formatTradeTimestamp/renderGeneratedTechniqueRow/
 * renderTechniqueGenerationJobRow/renderTradeRow。
 * 全部为纯函数，仅依赖 @mud/shared 类型和 format.ts 的 escapeHtml/formatDateTime。
 */

import {
  TECHNIQUE_GRADE_LABELS,
  type GmGeneratedTechniqueSummary,
  type GmTechniqueGenerationJobSummary,
  type GmMarketTradeItem,
} from '@mud/shared';
import { escapeHtml, formatDateTime } from './format';

/** getGeneratedTechniqueGradeLabel：读取自创功法品阶标签。 */
export function getGeneratedTechniqueGradeLabel(grade: string | null | undefined): string {
  return grade ? TECHNIQUE_GRADE_LABELS[grade as keyof typeof TECHNIQUE_GRADE_LABELS] ?? grade : '未知品阶';
}

/** formatTechniqueGenerationJobItemState：格式化生成任务物品状态。 */
export function formatTechniqueGenerationJobItemState(job: GmTechniqueGenerationJobSummary): string {
  if (job.itemRefunded) {
    return '已返还玉简';
  }
  return job.itemConsumed ? '已扣玉简' : '未扣玉简';
}

/** formatTechniqueGenerationJobPlayerLabel：格式化生成任务玩家标签。 */
export function formatTechniqueGenerationJobPlayerLabel(job: GmTechniqueGenerationJobSummary): string {
  const candidates = [job.playerName, job.playerDisplayName];
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized && normalized !== job.playerId && !/^p_[0-9a-f-]+(?:_\d+)?$/i.test(normalized)) {
      return normalized;
    }
  }
  return '未知角色';
}

/** formatTechniqueGenerationJobStatus：格式化生成任务状态。 */
export function formatTechniqueGenerationJobStatus(status: string): string {
  switch (status) {
    case 'pending':
      return '等待生成';
    case 'running':
      return '生成中';
    case 'generated_draft':
      return '待采纳';
    case 'learned':
      return '已学习';
    case 'discarded':
      return '已放弃';
    case 'expired':
      return '已过期';
    case 'failed':
      return '失败';
    default:
      return status || '未知状态';
  }
}

/** formatTradePartyLabel：格式化交易方标签。 */
export function formatTradePartyLabel(playerNo: number | null | undefined, playerName: string | null | undefined, _playerId: string): string {
  const parts: string[] = [];
  const noText = typeof playerNo === 'number' && Number.isFinite(playerNo) ? `#${playerNo}` : null;
  const trimmedName = typeof playerName === 'string' ? playerName.trim() : '';
  if (noText) {
    parts.push(`<span style="font-family:var(--font-heading-sub);">${escapeHtml(noText)}</span>`);
  }
  if (trimmedName) {
    parts.push(`<span>${escapeHtml(trimmedName)}</span>`);
  }
  if (!noText && !trimmedName) {
    parts.push('<span>未知玩家</span>');
  }
  return `<div style="display:flex; flex-direction:column; gap:2px;">${parts.join('')}</div>`;
}

/** formatTradePrice：格式化交易价格。 */
export function formatTradePrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return Math.round(value * 100) / 100 === Math.trunc(value)
    ? Math.trunc(value).toLocaleString('zh-Hans-CN')
    : value.toLocaleString('zh-Hans-CN', { maximumFractionDigits: 2 });
}

/** formatTradeTimestamp：格式化交易时间戳。 */
export function formatTradeTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '-';
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** renderGeneratedTechniqueRow：渲染自创功法行。 */
export function renderGeneratedTechniqueRow(technique: GmGeneratedTechniqueSummary, selectedId: string | null): string {
  const active = technique.id === selectedId ? ' active' : '';
  const gradeLabel = getGeneratedTechniqueGradeLabel(technique.grade);
  const levelLabel = technique.realmLv !== null && technique.realmLv !== undefined ? `Lv.${technique.realmLv}` : 'Lv.-';
  return `
    <button class="player-row${active}" type="button" data-generated-technique-id="${escapeHtml(technique.id)}">
      <div>
        <div class="player-row-title">${escapeHtml(technique.name)}</div>
        <div class="player-row-meta">${escapeHtml(formatDateTime(technique.createdAt))}</div>
        <div class="player-row-meta">${escapeHtml(gradeLabel)} · ${escapeHtml(levelLabel)}</div>
      </div>
    </button>
  `;
}

/** renderTechniqueGenerationJobRow：渲染生成任务行。 */
export function renderTechniqueGenerationJobRow(job: GmTechniqueGenerationJobSummary, selectedId: string | null): string {
  const active = job.id === selectedId ? ' active' : '';
  const gradeLabel = getGeneratedTechniqueGradeLabel(job.rolledGrade);
  const levelLabel = job.rolledRealmLv !== null && job.rolledRealmLv !== undefined ? `Lv.${job.rolledRealmLv}` : 'Lv.-';
  const name = `${formatTechniqueGenerationJobStatus(job.status)} · ${job.requestedCategory ?? '未知类型'}`;
  const itemState = formatTechniqueGenerationJobItemState(job);
  return `
    <button class="player-row${active}" type="button" data-technique-generation-job-id="${escapeHtml(job.id)}">
      <div>
        <div class="player-row-title">${escapeHtml(name)}</div>
        <div class="player-row-meta">${escapeHtml(formatDateTime(job.createdAt))}</div>
        <div class="player-row-meta">${escapeHtml(gradeLabel)} · ${escapeHtml(levelLabel)} · ${escapeHtml(itemState)}</div>
      </div>
    </button>
  `;
}

/** renderTradeRow：渲染交易行。 */
export function renderTradeRow(row: GmMarketTradeItem): string {
  const buyerLabel = formatTradePartyLabel(row.buyerNo, row.buyerName, row.buyerId);
  const sellerLabel = formatTradePartyLabel(row.sellerNo, row.sellerName, row.sellerId);
  const sourceLabel = row.source === 'auction' ? '拍卖行' : '坊市';
  return `
    <tr style="border-bottom:1px solid var(--wash-ink);">
      <td style="padding:8px 10px; white-space:nowrap; color:var(--ink-grey);">${escapeHtml(formatTradeTimestamp(row.createdAt))}</td>
      <td style="padding:8px 10px;">${escapeHtml(sourceLabel)}</td>
      <td style="padding:8px 10px;">${buyerLabel}</td>
      <td style="padding:8px 10px;">${sellerLabel}</td>
      <td style="padding:8px 10px;">${escapeHtml(row.itemName)} <span style="color:var(--light-ink); font-size:12px;">(${escapeHtml(row.itemId)})</span></td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${row.quantity.toLocaleString('zh-Hans-CN')}</td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${formatTradePrice(row.unitPrice)}</td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${formatTradePrice(row.totalCost)}</td>
      <td style="padding:8px 10px; color:var(--light-ink); font-family:monospace; font-size:12px; word-break:break-all;">${escapeHtml(row.id)}</td>
    </tr>
  `;
}
