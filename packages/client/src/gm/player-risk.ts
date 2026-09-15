/**
 * gm/player-risk.ts —— GM 玩家列表/风险相关纯函数。
 *
 * 从 gm.ts 抽取：getPlayerPresenceMeta/getManagedAccountStatusLabel/getManagedAccountActivityMeta/
 * getManagedPlayerAccountStatusLabel/getManagedAccountRestrictionLabel/getManagedAccountRestrictionPillClass/
 * getPlayerRiskLevelLabel/getPlayerRiskLevelPillClass/renderPlayerRiskFactorCard/renderPlayerRiskSection。
 * 全部为纯函数，仅依赖 i18n、format 工具和 gm/helpers/pure，无模块级可变状态。
 */

import {
  type GmManagedPlayerSummary,
  type GmManagedPlayerRecord,
  type GmPlayerRiskFactor,
  type GmPlayerRiskLevel,
} from '@mud/shared';
import * as gmPureHelpers from '../gm/helpers/pure';
import { escapeHtml, formatDateTime } from './format';
import { t } from '../ui/i18n';

/** getPlayerPresenceMeta：读取玩家在线状态元数据。 */
export function getPlayerPresenceMeta(player: Pick<GmManagedPlayerSummary, 'meta'>): {
  className: 'online' | 'offline';
  label: '在线' | '离线挂机' | '离线';
} {
  return gmPureHelpers.getPlayerPresenceMeta(player);
}

/** getManagedAccountStatusLabel：读取托管账号状态标签。 */
export function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  return gmPureHelpers.getManagedAccountStatusLabel(player);
}

/** getManagedAccountActivityMeta：读取托管账号 Activity 元数据。 */
export function getManagedAccountActivityMeta(player: Pick<GmManagedPlayerRecord, 'meta'>): {
  label: string;
  value: string;
  note?: string;
} {
  if (player.meta.online) {
    return {
      label: '在线时间戳',
      value: player.meta.lastHeartbeatAt ? formatDateTime(player.meta.lastHeartbeatAt) : t('gm.client.activity.online.no-record'),
      note: player.meta.lastHeartbeatAt ? undefined : t('gm.client.activity.online.no-heartbeat-note'),
    };
  }
  if (player.meta.updatedAt) {
    return {
      label: t('gm.client.activity.updated-at'),
      value: formatDateTime(player.meta.updatedAt),
    };
  }
  if (player.meta.lastHeartbeatAt) {
    return {
      label: t('gm.client.activity.last-heartbeat'),
      value: formatDateTime(player.meta.lastHeartbeatAt),
      note: t('gm.client.activity.legacy-heartbeat-note'),
    };
  }
  return {
    label: t('gm.client.activity.latest-record'),
    value: t('gm.client.activity.no-record'),
  };
}

/** getManagedPlayerAccountStatusLabel：读取账号状态标签。 */
export function getManagedPlayerAccountStatusLabel(status: GmManagedPlayerSummary['accountStatus']): string {
  switch (status) {
    case 'banned':
      return t('gm.client.account-status.banned');
    case 'abnormal':
      return t('gm.client.account-status.abnormal');
    case 'normal':
    default:
      return t('gm.client.account-status.normal');
  }
}

/** getManagedAccountRestrictionLabel：读取账号封禁状态标签。 */
export function getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? t('gm.client.account-restriction.banned') : t('gm.client.account-restriction.allowed');
}

/** getManagedAccountRestrictionPillClass：读取账号封禁状态样式。 */
export function getManagedAccountRestrictionPillClass(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? 'offline' : 'online';
}

/** getPlayerRiskLevelLabel：读取风险等级标签。 */
export function getPlayerRiskLevelLabel(level: GmPlayerRiskLevel): string {
  switch (level) {
    case 'critical':
      return t('gm.client.risk-level.critical');
    case 'high':
      return t('gm.client.risk-level.high');
    case 'medium':
      return t('gm.client.risk-level.medium');
    case 'low':
    default:
      return t('gm.client.risk-level.low');
  }
}

/** getPlayerRiskLevelPillClass：读取风险等级样式。 */
export function getPlayerRiskLevelPillClass(level: GmPlayerRiskLevel): string {
  switch (level) {
    case 'critical':
      return 'bot';
    case 'high':
      return 'offline';
    case 'medium':
      return '';
    case 'low':
    default:
      return 'online';
  }
}

/** renderPlayerRiskFactorCard：渲染风险维度卡片。 */
export function renderPlayerRiskFactorCard(factor: GmPlayerRiskFactor): string {
  const evidenceMarkup = factor.evidence.length > 0
    ? `<div class="editor-note" style="margin-top: 8px;">${factor.evidence.map((entry) => `- ${escapeHtml(entry)}`).join('<br />')}</div>`
    : `<div class="editor-note" style="margin-top: 8px;">${escapeHtml(t('gm.client.risk.factor.no-evidence'))}</div>`;
  return `
    <div class="editor-card">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title">${escapeHtml(factor.label)}</div>
          <div class="editor-card-meta">${escapeHtml(factor.summary)}</div>
        </div>
        <span class="pill ${factor.score > 0 ? 'offline' : 'online'}">${factor.score} / ${factor.maxScore}</span>
      </div>
      ${evidenceMarkup}
    </div>
  `;
}

/** renderPlayerRiskSection：渲染玩家风险检测标签页。 */
export function renderPlayerRiskSection(player: GmManagedPlayerRecord): string {
  const report = player.riskReport;
  const accountEnvMarkup = player.account
    ? `
      <div class="editor-note" style="margin-top: 8px;">
        ${escapeHtml(t('gm.client.risk.account.status', { status: getManagedAccountRestrictionLabel(player.account) }))}<br />
        ${escapeHtml(t('gm.client.risk.account.admin-list', { state: player.account.isRiskAdmin ? t('gm.client.risk.account.admin-joined') : t('gm.client.risk.account.admin-not-joined') }))}<br />
        ${escapeHtml(t('gm.client.risk.account.created-at', { time: formatDateTime(player.account.createdAt) }))}<br />
        ${escapeHtml(t('gm.client.risk.account.last-login', { time: formatDateTime(player.account.lastLoginAt) }))}
      </div>
    `
    : `<div class="editor-note" style="margin-top: 8px;">${escapeHtml(t('gm.client.risk.no-manageable-account'))}</div>`;

  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.overview.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.overview.note'))}</div>
        </div>
        <div class="editor-chip-list">
          <span class="pill ${getPlayerRiskLevelPillClass(report.level)}">${escapeHtml(getPlayerRiskLevelLabel(report.level))}</span>
          <span class="pill">${escapeHtml(t('gm.client.risk.score', { score: report.score, maxScore: report.maxScore }))}</span>
          <span class="pill">${escapeHtml(formatDateTime(report.generatedAt))}</span>
        </div>
      </div>
      <div class="note-card">${escapeHtml(report.overview)}</div>
      ${accountEnvMarkup}
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.recommendations.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.recommendations.note'))}</div>
        </div>
      </div>
      <div class="editor-card-list">
        ${report.recommendations.map((entry, index) => `
          <div class="editor-card">
            <div class="editor-card-head">
              <div class="editor-card-title">${escapeHtml(t('gm.client.risk.recommendation.index', { index: index + 1 }))}</div>
            </div>
            <div class="editor-note" style="margin-top: 0;">${escapeHtml(entry)}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.factors.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.factors.note'))}</div>
        </div>
      </div>
      <div class="editor-card-list">
        ${report.factors.map((factor) => renderPlayerRiskFactorCard(factor)).join('')}
      </div>
    </section>
  `;
}
