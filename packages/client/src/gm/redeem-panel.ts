/**
 * gm/redeem-panel.ts —— GM 兑换码面板纯 HTML 渲染。
 *
 * 从 gm.ts 抽取：renderRedeemGroupListHtml、renderRedeemGroupEditorHtml、renderRedeemCodeListHtml。
 * 纯函数，接收类型化数据，返回 HTML 字符串，不依赖 gm.ts 模块级 DOM 引用。
 */

import type {
  GmRedeemCodeGroupDetailRes,
  RedeemCodeCodeView,
  RedeemCodeGroupRewardItem,
  RedeemCodeGroupView,
} from '@mud/shared';
import { escapeHtml } from './format';

/** RedeemGroupDraft：兑换码分组编辑草稿。 */
export interface RedeemGroupDraft {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  createCount: string;
  appendCount: string;
}

/** RedeemPanelDeps：兑换面板渲染依赖。 */
export interface RedeemPanelDeps {
  getMailAttachmentTitle: (itemId: string, fallbackLabel: string) => string;
  getMailAttachmentRowMeta: (itemId: string) => string;
  searchableItemField: (
    label: string,
    value: string,
    filter: 'all' | 'inventory-add' | 'equipment-slot' | 'artifact-slot',
    attrs: Record<string, string | undefined>,
    extraClass?: string,
  ) => string;
  getRedeemCodeMarkup: (code: RedeemCodeCodeView) => string;
  formatDateTime: (value?: string) => string;
}

/** renderRedeemGroupListHtml：渲染兑换分组列表 HTML。 */
export function renderRedeemGroupListHtml(
  groups: RedeemCodeGroupView[],
  selectedGroupId: string | null,
): string {
  if (groups.length === 0) {
    return '<div class="empty-hint">当前还没有兑换码分组。</div>';
  }
  return groups.map((group) => `
    <button
      class="player-row${selectedGroupId === group.id ? ' active' : ''}"
      type="button"
      data-redeem-group-id="${group.id}"
    >
      <div class="player-top">
        <span class="player-name">${escapeHtml(group.name)}</span>
        <span class="pill">${group.usedCodeCount} / ${group.totalCodeCount}</span>
      </div>
      <div class="player-meta">可用 ${group.activeCodeCount} 个 · 已用 ${group.usedCodeCount} 个 · 奖励 ${group.rewards.length} 项</div>
    </button>
  `).join('');
}

/** renderRedeemGroupEditorHtml：渲染兑换分组编辑器 HTML。 */
export function renderRedeemGroupEditorHtml(
  draft: RedeemGroupDraft,
  detail: GmRedeemCodeGroupDetailRes | null,
  selectedGroupId: string | null,
  latestGeneratedCodes: string[],
  deps: RedeemPanelDeps,
): string {
  const editingExisting = !!detail && detail.group.id === selectedGroupId;
  const groupMeta = detail?.group ?? null;
  const rewardRows = draft.rewards.length > 0
    ? draft.rewards.map((reward, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(deps.getMailAttachmentTitle(reward.itemId, `奖励 ${index + 1}`))}</div>
            <div class="editor-card-meta">${escapeHtml(deps.getMailAttachmentRowMeta(reward.itemId))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-redeem-reward" data-reward-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${deps.searchableItemField(
            '物品模板',
            reward.itemId,
            'all',
            { 'data-redeem-bind': `rewards.${index}.itemId` },
            'wide',
          )}
          <label class="editor-field">
            <span>数量</span>
            <input type="number" min="1" value="${Math.max(1, Math.floor(reward.count || 1))}" data-redeem-bind="rewards.${index}.count" />
          </label>
        </div>
      </div>
    `).join('')
    : '<div class="empty-hint">请至少添加一个奖励物品。</div>';

  return `
    <div class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${editingExisting ? '编辑分组' : '新建分组'}</div>
          <div class="editor-section-note">分组奖励可随时编辑；新增兑换码会继承当前分组奖励。</div>
        </div>
        <button class="small-btn" type="button" data-action="new-redeem-group">新建空白分组</button>
      </div>
      ${groupMeta ? `<div class="note-card" style="margin-bottom: 12px;">总码数 ${groupMeta.totalCodeCount} · 已使用 ${groupMeta.usedCodeCount} · 可用 ${groupMeta.activeCodeCount} · 创建于 ${escapeHtml(deps.formatDateTime(groupMeta.createdAt))}</div>` : ''}
      <div class="editor-grid compact">
        <label class="editor-field wide">
          <span>分组名称</span>
          <input type="text" value="${escapeHtml(draft.name)}" data-redeem-bind="name" />
        </label>
        ${editingExisting ? `
        <label class="editor-field">
          <span>追加数量</span>
          <input type="number" min="1" max="500" value="${escapeHtml(draft.appendCount)}" data-redeem-bind="appendCount" />
        </label>
        ` : `
        <label class="editor-field">
          <span>初始生成数量</span>
          <input type="number" min="1" max="500" value="${escapeHtml(draft.createCount)}" data-redeem-bind="createCount" />
        </label>
        `}
      </div>
      <div class="editor-section" style="margin-top: 12px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">奖励列表</div>
            <div class="editor-section-note">每个兑换码都会按这里的奖励逐项发放到背包。</div>
          </div>
          <button class="small-btn" type="button" data-action="add-redeem-reward">新增奖励</button>
        </div>
        <div class="editor-card-list">${rewardRows}</div>
      </div>
      <div class="button-row" style="margin-top: 12px;">
        <button class="small-btn primary" type="button" data-action="${editingExisting ? 'save-redeem-group' : 'create-redeem-group'}">${editingExisting ? '保存分组' : '创建分组并生成兑换码'}</button>
        ${editingExisting ? '<button class="small-btn" type="button" data-action="append-redeem-codes">追加兑换码</button>' : ''}
        ${editingExisting ? '<button class="small-btn danger" type="button" data-action="delete-redeem-group">删除分组</button>' : ''}
        <button class="small-btn" type="button" data-action="refresh-redeem-groups">刷新</button>
      </div>
      ${latestGeneratedCodes.length > 0 ? `
      <div class="editor-section" style="margin-top: 12px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">最近生成的兑换码</div>
            <div class="editor-section-note">创建或追加后会在这里展示本次生成结果。</div>
          </div>
        </div>
        <textarea class="editor-textarea" spellcheck="false" readonly>${escapeHtml(latestGeneratedCodes.join('\n'))}</textarea>
      </div>
      ` : ''}
    </div>
  `;
}

/** renderRedeemCodeListHtml：渲染兑换码列表 HTML。 */
export function renderRedeemCodeListHtml(
  detail: GmRedeemCodeGroupDetailRes | null,
  deps: RedeemPanelDeps,
): string {
  if (!detail) {
    return '<div class="empty-hint">请选择一个分组查看兑换码。</div>';
  }
  const codeItems = detail.codes ?? [];
  const activeCodeCount = codeItems.filter((code) => code.status === 'active').length;
  return `
    <div class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">兑换码列表</div>
          <div class="editor-section-note">当前分组共 ${codeItems.length} 个兑换码，其中 ${activeCodeCount} 个未使用。</div>
        </div>
        <button class="small-btn" type="button" data-action="copy-active-redeem-codes" ${activeCodeCount > 0 ? '' : 'disabled'}>复制全部未使用</button>
      </div>
      <div class="network-breakdown-list">
        ${codeItems.length > 0
          ? codeItems.map((code) => deps.getRedeemCodeMarkup(code)).join('')
          : '<div class="empty-hint">当前分组还没有兑换码。</div>'}
      </div>
    </div>
  `;
}
