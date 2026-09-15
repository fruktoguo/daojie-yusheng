/**
 * gm/server-panels.ts —— GM 服务器面板纯 HTML 渲染。
 *
 * 从 gm.ts 抽取：renderObjectsPanelHtml、buildRuntimeFlagsHtml。
 * 纯函数，接收类型化数据，返回 HTML 字符串，不依赖 gm.ts 模块级 DOM 引用。
 */

import { escapeHtml } from './format';
import {
  mergeRuntimeFlags,
  groupRuntimeFlags,
  PRESET_FLAGS,
  type RuntimeFlagEntry,
  type RuntimeFlagGroup,
} from '../constants/world/gm-runtime-flag-registry';

/** MergedRuntimeFlag：合并后的运行时开关。 */
type MergedRuntimeFlag = RuntimeFlagEntry & { value: boolean; isPreset: boolean };

/** ObjectCountsResponse：对象计数响应。 */
export interface ObjectCountsResponse {
  totals: {
    instances: number;
    players: number;
    monsters: number;
    npcs: number;
    landmarks: number;
    containers: number;
    groundPiles: number;
    pendingCommands: number;
    monsterSpawnGroups: number;
  };
  topInstances: Array<{
    instanceId: string;
    players: number;
    monsters: number;
    npcs: number;
    landmarks: number;
    containers: number;
    groundPiles: number;
    pendingCommands: number;
  }>;
}

/** renderObjectsPanelHtml：渲染对象面板 HTML。 */
export function renderObjectsPanelHtml(data: ObjectCountsResponse): string {
  const t = data.totals;
  const instanceRows = data.topInstances.length > 0
    ? data.topInstances.map((inst) => `
      <div class="network-row">
        <div class="network-row-label" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(inst.instanceId)}</div>
        <div class="network-row-meta">玩家 ${inst.players} · 妖兽 ${inst.monsters} · NPC ${inst.npcs} · 地标 ${inst.landmarks} · 容器 ${inst.containers} · 地面堆 ${inst.groundPiles}</div>
      </div>
    `).join('')
    : '<div class="empty-hint">无实例数据。</div>';

  return `
    <div class="summary-grid">
      <div class="summary-card"><div class="panel-title">地图实例</div><div class="panel-value">${t.instances}</div></div>
      <div class="summary-card"><div class="panel-title">在线玩家</div><div class="panel-value">${t.players}</div></div>
      <div class="summary-card"><div class="panel-title">妖兽</div><div class="panel-value">${t.monsters}</div></div>
      <div class="summary-card"><div class="panel-title">NPC</div><div class="panel-value">${t.npcs}</div></div>
      <div class="summary-card"><div class="panel-title">地标</div><div class="panel-value">${t.landmarks}</div></div>
      <div class="summary-card"><div class="panel-title">容器</div><div class="panel-value">${t.containers}</div></div>
      <div class="summary-card"><div class="panel-title">地面堆</div><div class="panel-value">${t.groundPiles}</div></div>
      <div class="summary-card"><div class="panel-title">待处理指令</div><div class="panel-value">${t.pendingCommands}</div></div>
      <div class="summary-card"><div class="panel-title">刷怪组</div><div class="panel-value">${t.monsterSpawnGroups}</div></div>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">对象数 Top 20 实例</div>
        <div class="network-breakdown-subtitle">按（妖兽+玩家）数量降序</div>
      </div>
      <div class="network-breakdown-list">${instanceRows}</div>
    </div>
  `;
}

/** renderObjectsPanelMeta：渲染对象面板元数据文本。 */
export function renderObjectsPanelMeta(data: ObjectCountsResponse): string {
  const t = data.totals;
  return `${t.instances} 个实例 · ${t.players} 玩家 · ${t.monsters} 妖兽`;
}

/** buildRuntimeFlagsHtml：渲染运行时开关 HTML。 */
export function buildRuntimeFlagsHtml(
  loading: boolean,
  rawFlags: Array<{ key: string; value: boolean }> | null,
  networkPayloadCaptureFlagKey: string,
): string {
  if (loading) {
    return '<div class="flag-empty">运行时开关加载中...</div>';
  }
  const merged = mergeRuntimeFlags(rawFlags ?? []);
  const grouped = groupRuntimeFlags(merged);
  if (merged.length === 0) {
    return '<div class="flag-empty">当前没有运行时开关。</div>';
  }

  const groupsHtml = grouped.map(({ group, flags }) => {
    const rows = flags.map((flag) => {
      const checked = flag.value ? 'checked' : '';
      const badgeClass = flag.value ? 'on' : 'off';
      const badgeText = flag.value ? '已启用' : '已禁用';
      const displayLabel = flag.isPreset && flag.label !== flag.key ? flag.label : '';
      const canDelete = !flag.isPreset && flag.key !== networkPayloadCaptureFlagKey
        && !PRESET_FLAGS.some((p) => p.key === flag.key);
      const deleteBtn = canDelete
        ? `<button class="flag-delete-btn" data-flag-delete="${flag.key}" type="button" aria-label="删除此开关">删除</button>`
        : '';
      return `<div class="flag-row" data-flag-row="${flag.key}">
        <label class="flag-toggle" onclick="event.stopPropagation()">
          <input type="checkbox" data-flag-key="${flag.key}" ${checked} />
          <span class="flag-toggle-track"></span>
        </label>
        <div class="flag-info">
          <span class="flag-label">${displayLabel || flag.key}</span>
          ${displayLabel ? `<span class="flag-key">${flag.key}</span>` : ''}
        </div>
        <span class="flag-badge ${badgeClass}">${badgeText}</span>
        ${deleteBtn}
      </div>`;
    });
    return `<div class="flag-group">
      <div class="flag-group-title">${group.label}</div>
      ${rows.join('')}
    </div>`;
  });

  const addRowHtml = `<div class="flag-add-row">
    <input id="gameconfig-flags-new-key" type="text" placeholder="输入新开关 key（如 my_feature_enabled）" />
    <button id="gameconfig-flags-add" class="small-btn" type="button">添加开关</button>
  </div>`;

  return groupsHtml.join('') + addRowHtml;
}
