/**
 * gm/env-config.ts —— GM 环境变量与游戏配置的纯 HTML 行渲染。
 *
 * 从 gm.ts 抽取：renderEnvironmentVarRow、renderGameConfigRow。
 * 纯函数，接收类型化条目，返回 HTML 字符串，不依赖 gm.ts 模块级 DOM 引用。
 */

import type {
  GmEnvironmentVarItem,
  GameConfigItem,
} from '@mud/shared';
import { escapeHtml } from './format';

/** renderEnvironmentVarRowHtml：渲染单条环境变量行 HTML。 */
export function renderEnvironmentVarRowHtml(item: GmEnvironmentVarItem): string {
  const sourceLabelMap: Record<GmEnvironmentVarItem['source'], string> = {
    process_env: '进程环境',
    runtime_override: '运行时覆盖',
    runtime_file: '本地覆盖',
    unset: '未设置',
  };
  const currentValue = item.value || '（未设置）';
  const inputValue = item.sensitive ? '' : item.value;
  const editable = item.editable;
  const persistChecked = item.persistent ? 'checked' : '';
  const persistDisabled = item.persistable ? '' : 'disabled';
  const saveDisabled = editable ? '' : 'disabled';
  const deleteDisabled = editable ? '' : 'disabled';
  const restartBadge = item.restartRequired ? '<span class="env-badge meta">需重启</span>' : '';
  const managedBadge = item.managed ? '<span class="env-badge meta">已注册</span>' : '<span class="env-badge meta">未注册</span>';
  const persistBadge = item.persistent ? '<span class="env-badge meta">已持久化</span>' : '';
  const sourceBadge = `<span class="env-badge source-${item.source}">${sourceLabelMap[item.source]}</span>`;
  const sensitiveHint = item.sensitive ? '<span class="env-badge meta">敏感值已脱敏</span>' : '';

  return `
    <div class="env-row" data-env-key="${escapeHtml(item.key)}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.label)}</span>
          <code class="env-key">${escapeHtml(item.key)}</code>
        </div>
        <div class="env-row-badges">
          ${sourceBadge}
          ${managedBadge}
          ${restartBadge}
          ${persistBadge}
          ${sensitiveHint}
        </div>
      </div>
      <div class="env-desc">${escapeHtml(item.description)}</div>
      <div class="env-current">当前值：<code>${escapeHtml(currentValue)}</code></div>
      <div class="env-edit">
        <input data-env-value type="text" ${editable ? '' : 'disabled'} placeholder="${item.sensitive ? '输入新值覆盖当前值' : '输入新的环境变量值'}" value="${escapeHtml(inputValue)}" />
        <label class="env-persist-label">
          <input data-env-persist type="checkbox" ${persistChecked} ${persistDisabled} />
          持久化
        </label>
        <div class="env-actions">
          <button class="small-btn primary" type="button" data-env-save ${saveDisabled}>保存</button>
          <button class="small-btn" type="button" data-env-delete ${deleteDisabled}>删除覆盖</button>
        </div>
      </div>
    </div>
  `;
}

/** renderGameConfigRowHtml：渲染单条游戏配置行 HTML。 */
export function renderGameConfigRowHtml(item: GameConfigItem): string {
  const pendingBadge = item.pendingRestart ? '<span class="env-badge meta" style="background:var(--stamp-orange);color:#fff;">待重启</span>' : '';
  const defaultBadge = `<span class="env-badge meta">默认: ${escapeHtml(item.defaultValue)}</span>`;

  let controlHtml = '';
  if (item.valueType === 'boolean') {
    const checked = item.currentValue === 'true' ? 'checked' : '';
    controlHtml = `
      <label class="env-persist-label" style="cursor:pointer;">
        <input data-config-toggle type="checkbox" ${checked} />
        ${item.currentValue === 'true' ? '已开启' : '已关闭'}
      </label>`;
  } else if (item.valueType === 'number') {
    const minAttr = item.min !== undefined ? `min="${item.min}"` : '';
    const maxAttr = item.max !== undefined ? `max="${item.max}"` : '';
    controlHtml = `
      <input data-config-value type="number" value="${escapeHtml(item.pendingValue ?? item.currentValue)}" ${minAttr} ${maxAttr} style="width:120px;" />
      <button class="small-btn primary" type="button" data-config-save>保存</button>`;
  } else {
    controlHtml = `
      <input data-config-value type="text" value="${escapeHtml(item.pendingValue ?? item.currentValue)}" style="flex:1;" />
      <button class="small-btn primary" type="button" data-config-save>保存</button>`;
  }

  return `
    <div class="env-row" data-config-key="${escapeHtml(item.key)}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.label)}</span>
          <code class="env-key">${escapeHtml(item.key)}</code>
        </div>
        <div class="env-row-badges">
          ${defaultBadge}
          ${pendingBadge}
        </div>
      </div>
      <div class="env-desc">${escapeHtml(item.description)}</div>
      <div class="env-edit">
        ${controlHtml}
        <button class="small-btn" type="button" data-config-reset>恢复默认</button>
      </div>
    </div>
  `;
}

/** renderGameConfigGroupsHtml：渲染游戏配置分组 HTML。 */
export function renderGameConfigGroupsHtml(
  items: GameConfigItem[],
  renderRow: (item: GameConfigItem) => string,
): string {
  if (items.length === 0) {
    return '<div class="env-empty">当前没有已注册的游戏配置。</div>';
  }
  const groups = new Map<string, GameConfigItem[]>();
  for (const item of items) {
    if (!groups.has(item.category)) {
      groups.set(item.category, []);
    }
    groups.get(item.category)!.push(item);
  }
  let html = '';
  for (const [category, categoryItems] of groups) {
    html += `<details class="env-group" open>
      <summary class="env-group-title">${escapeHtml(category)} <span class="env-group-count">(${categoryItems.length})</span></summary>
      <div class="env-group-body">`;
    for (const item of categoryItems) {
      html += renderRow(item);
    }
    html += '</div></details>';
  }
  return html;
}

/** renderEnvironmentVarGroupsHtml：渲染环境变量分组 HTML。 */
export function renderEnvironmentVarGroupsHtml(
  items: GmEnvironmentVarItem[],
  renderRow: (item: GmEnvironmentVarItem) => string,
): string {
  if (items.length === 0) {
    return '<div class="env-empty">当前没有可展示的环境变量。</div>';
  }
  const groups = new Map<string, GmEnvironmentVarItem[]>();
  for (const item of items) {
    if (!groups.has(item.category)) {
      groups.set(item.category, []);
    }
    groups.get(item.category)!.push(item);
  }
  return [...groups.entries()].map(([category, categoryItems]) => {
    const rows = categoryItems.map((item) => renderRow(item)).join('');
    return `
      <details class="env-group" open data-env-group="${escapeHtml(category)}">
        <summary class="env-group-summary">
          <span>${escapeHtml(category)}</span>
          <span class="env-group-count">${categoryItems.length}</span>
        </summary>
        <div class="env-group-body">
          ${rows}
        </div>
      </details>
    `;
  }).join('');
}

/** renderEnvGroupHtml：渲染通用环境分组 HTML。 */
export function renderEnvGroupHtml(label: string, rowsHtml: string, count: number): string {
  return `
    <details class="env-group" open>
      <summary class="env-group-summary">
        <span>${escapeHtml(label)}</span>
        <span class="env-group-count">${count}</span>
      </summary>
      <div class="env-group-body">${rowsHtml}</div>
    </details>
  `;
}
