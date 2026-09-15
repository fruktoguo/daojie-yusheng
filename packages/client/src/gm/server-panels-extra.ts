/**
 * gm/server-panels-extra.ts —— GM 服务端面板：Worker、环境检查、运行时标志、对象计数。
 *
 * 从 gm.ts 抽取：renderWorkerPoolSection/renderWorkerPanel/loadWorkerState/
 * getEnvCheckStatusText/getEnvCheckStatusIcon/renderEnvCheckPanel/loadEnvCheck/
 * loadRuntimeFlags/toggleRuntimeFlag/addRuntimeFlag/deleteRuntimeFlag/
 * setMaintenanceMode/restartServer/renderRuntimeFlagsPanel/
 * buildRuntimeFlagsHtml/bindRuntimeFlagsEvents/
 * renderObjectsPanel/loadObjectCounts。
 * 对 gm.ts 的依赖通过 ServerPanelsExtraContext 显式注入。
 */

import {
  type BasicOkRes,
  type GmEnvCheckResult,
  type GmRestartServerReq,
  type GmWorkerStateRes,
  GM_HIGH_RISK_CONFIRMATION_PHRASES,
} from '@mud/shared';
import {
  buildGmEnvironmentCheckApiPath,
  buildGmWorkersApiPath,
} from './api';
import {
  renderObjectsPanelHtml as serverPanelsRenderObjectsPanelHtml,
  renderObjectsPanelMeta as serverPanelsRenderObjectsPanelMeta,
  buildRuntimeFlagsHtml as serverPanelsBuildRuntimeFlagsHtml,
  type ObjectCountsResponse as ServerPanelsObjectCountsResponse,
} from './server-panels';
import {
  getWorkerRowMarkup,
  getWorkerWindowMetricLabel,
  getWorkerStatusLabel,
  getWorkerTopologyMarkup,
  getWorkerSchedulerMarkup,
  getWorkerAlertLabel,
  getSchedulerDiagnosticNote,
  getAlertInactiveDiagnostic,
  getWorkerCapacityMarkup,
  countWorkerRows,
  sumWorkerRows,
  type WorkerHelpersContext,
} from './worker-helpers';

type ObjectCountsResponse = ServerPanelsObjectCountsResponse;

/** ServerPanelsExtraContext：server-panels-extra 对 gm.ts 的依赖。 */
export interface ServerPanelsExtraContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  setPendingStatus(message: string): void;
  escapeHtml(input: string): string;
  formatDateTime(value?: string): string;
  NETWORK_PAYLOAD_CAPTURE_FLAG_KEY: string;
  getWorkerState(): GmWorkerStateRes | null;
  setWorkerState(state: GmWorkerStateRes | null): void;
  getWorkerStateLoading(): boolean;
  setWorkerStateLoading(loading: boolean): void;
  getEnvCheckResult(): GmEnvCheckResult | null;
  setEnvCheckResult(result: GmEnvCheckResult | null): void;
  getEnvCheckLoading(): boolean;
  setEnvCheckLoading(loading: boolean): void;
  getRuntimeFlags(): Array<{ key: string; value: boolean }>;
  setRuntimeFlags(flags: Array<{ key: string; value: boolean }>): void;
  getRuntimeFlagsLoading(): boolean;
  setRuntimeFlagsLoading(loading: boolean): void;
  getObjectsLoading(): boolean;
  setObjectsLoading(loading: boolean): void;
  getObjectCountsData(): ObjectCountsResponse | null;
  setObjectCountsData(data: ObjectCountsResponse | null): void;
  loadState(silent?: boolean): Promise<void>;
  renderSummary(data: unknown): void;
  renderGameConfig(): void;
  getState(): unknown;
  setState(state: unknown): void;
  restartServerBtn: HTMLButtonElement;
  serverEnvCheckContentEl: HTMLElement;
  serverEnvCheckMetaEl: HTMLElement;
  serverEnvCheckRefreshBtn: HTMLButtonElement;
  serverObjectsContentEl: HTMLElement;
  serverObjectsMetaEl: HTMLElement;
  serverObjectsRefreshBtn: HTMLButtonElement;
  serverWorkersContentEl: HTMLElement;
  serverWorkersMetaEl: HTMLElement;
  serverWorkersRefreshBtn: HTMLButtonElement;
  toggleMaintenanceModeBtn: HTMLButtonElement;
  workerHelpersContext: WorkerHelpersContext;
}
export function renderWorkerPoolSection(wp: any, ctx: ServerPanelsExtraContext): void {
  const statusEl = document.getElementById('worker-pool-status-meta');
  const containerEl = document.getElementById('worker-pool-all-pools');
  if (!statusEl || !containerEl) return;
  if (!wp || (!wp.encoding && !wp.instance && !wp.persistence)) {
    statusEl.textContent = 'Worker Pool 未启用或数据未就绪（worker 不可用时由服务端 fallback）';
    containerEl.innerHTML = '';
    return;
  }
  const totalActive = (wp.encoding?.activeWorkers ?? 0) + (wp.instance?.activeWorkers ?? 0) + (wp.persistence?.activeWorkers ?? 0);
  const totalSubmitted = (wp.encoding?.totalSubmitted ?? 0) + (wp.instance?.totalSubmitted ?? 0) + (wp.persistence?.totalSubmitted ?? 0);
  statusEl.textContent = totalActive > 0
    ? `${totalActive} 个 worker 线程活跃 · 累计 ${totalSubmitted} 任务`
    : '所有 Pool 未启用或无活跃 worker';
  const pools = [
    { key: 'encoding', label: 'AOI 计算池', note: 'pathfind / fov；envelope 当前保持 JSON 直发' },
    { key: 'instance', label: '实例分片池', note: '怪物 AI intent 预计算（空实例/无妖兽不提交）' },
    { key: 'persistence', label: '持久化写计划池', note: '玩家分域 write plan 构造' },
  ];
  containerEl.innerHTML = pools.map(({ key, label, note }) => {
    const m = wp[key];
    if (!m) return `<div class="note-card">${label}：无数据</div>`;
    const active = m.activeWorkers > 0;
    return `<div class="stats-grid" style="margin-top:10px;">
      <div class="stats-card" style="grid-column:1/-1;"><div class="stats-card-label">${label}</div><div class="stats-card-value" style="color:${active ? '#16a34a' : '#888'}">${active ? m.activeWorkers + ' worker' : '未启用'}</div><div class="stats-card-note">${note}</div></div>
      <div class="stats-card"><div class="stats-card-label">提交</div><div class="stats-card-value">${m.totalSubmitted}</div></div>
      <div class="stats-card"><div class="stats-card-label">完成</div><div class="stats-card-value">${m.totalCompleted}</div></div>
      <div class="stats-card"><div class="stats-card-label">超时</div><div class="stats-card-value">${m.totalTimedOut}</div></div>
      <div class="stats-card"><div class="stats-card-label">失败</div><div class="stats-card-value">${m.totalFailed}</div></div>
      <div class="stats-card"><div class="stats-card-label">Fallback</div><div class="stats-card-value">${m.totalFallback}</div></div>
      <div class="stats-card"><div class="stats-card-label">进行中</div><div class="stats-card-value">${m.inFlight}</div></div>
      <div class="stats-card"><div class="stats-card-label">P50</div><div class="stats-card-value">${m.p50Ms.toFixed(1)} ms</div></div>
      <div class="stats-card"><div class="stats-card-label">P95</div><div class="stats-card-value">${m.p95Ms.toFixed(1)} ms</div></div>
      <div class="stats-card"><div class="stats-card-label">最近总耗时</div><div class="stats-card-value">${(m.recentTotalDurationMs ?? 0).toFixed(1)} ms</div><div class="stats-card-note">${m.recentTaskCount ?? 0} 个任务 · 均次 ${(m.avgMs ?? 0).toFixed(2)} ms</div></div>
      <div class="stats-card"><div class="stats-card-label">累计耗时</div><div class="stats-card-value">${Math.round(m.totalDurationMs ?? 0)} ms</div></div>
    </div>`;
  }).join('');
}

/** renderWorkerPanel：渲染Worker状态面板。 */
export function renderWorkerPanel(ctx: ServerPanelsExtraContext): void {
  const ws = ctx.getWorkerState();
  ctx.serverWorkersRefreshBtn.disabled = ctx.getWorkerStateLoading();
  if (ctx.getWorkerStateLoading()) {
    ctx.serverWorkersMetaEl.textContent = 'Worker 状态读取中…';
  } else if (ws) {
    const alertText = ws!.alerts.length > 0 ? `告警 ${ws!.alerts.length} 条` : '暂无告警';
    ctx.serverWorkersMetaEl.textContent = `采样 ${ctx.formatDateTime(ws!.generatedAt)} · 窗口 ${ws!.windowSeconds}s · ${alertText}`;
  } else {
    ctx.serverWorkersMetaEl.textContent = 'Worker 状态尚未加载。';
  }

  if (!ws) {
    ctx.serverWorkersContentEl.innerHTML = '<div class="empty-hint">当前还没有 worker 状态。</div>';
    return;
  }

  const schedulerDiagNote = getSchedulerDiagnosticNote(ws!, ctx.workerHelpersContext);
  const alerts = ws!.alerts.length > 0
    ? `
      <div class="network-breakdown">
        <div class="network-breakdown-head">
          <div class="panel-title">Worker 告警</div>
          <div class="network-breakdown-subtitle">积压、死信和心跳异常会在这里集中显示${schedulerDiagNote ? ' · ' + ctx.escapeHtml(schedulerDiagNote) : ''}</div>
        </div>
        <div class="network-breakdown-list">
          ${ws!.alerts.map((alert) => `
            <div class="network-row">
              <div class="network-row-label">${ctx.escapeHtml(getWorkerAlertLabel(alert.reason, ctx.workerHelpersContext))}</div>
              <div class="network-row-meta">${ctx.escapeHtml(alert.workerId)}${alert.count !== undefined ? ` · ${alert.count}` : ''}${alert.reason === 'worker_inactive' ? getAlertInactiveDiagnostic(ws!, alert.workerId, ctx.workerHelpersContext) : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '<div class="note-card">当前没有 worker 告警。</div>';
  const rows = ws!.rows.length > 0
    ? ws!.rows.map((row) => getWorkerRowMarkup(row, ctx.workerHelpersContext)).join('')
    : '<div class="empty-hint">当前还没有 worker 记录。</div>';
  const capacityCards = getWorkerCapacityMarkup(ws!, ctx.workerHelpersContext);
  const topologyMarkup = getWorkerTopologyMarkup(ws!, ctx.workerHelpersContext);
  const schedulerMarkup = getWorkerSchedulerMarkup(ws!, ctx.workerHelpersContext);

  ctx.serverWorkersContentEl.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><div class="panel-title">监控项</div><div class="panel-value">${ws!.rows.length}</div></div>
      <div class="summary-card"><div class="panel-title">认领/待处理</div><div class="panel-value">${countWorkerRows(ws!.rows, ['active', 'pending'], ctx.workerHelpersContext)}</div></div>
      <div class="summary-card"><div class="panel-title">积压总数</div><div class="panel-value">${sumWorkerRows(ws!.rows, 'pendingCount', ctx.workerHelpersContext)}</div></div>
      <div class="summary-card"><div class="panel-title">死信</div><div class="panel-value">${sumWorkerRows(ws!.rows, 'deadLetterCount', ctx.workerHelpersContext)}</div></div>
      ${capacityCards}
    </div>
    <div class="note-card">${ctx.escapeHtml(ws!.note ?? 'Worker 面板读取低频诊断快照，不改变 worker 运行。')}</div>
    ${topologyMarkup}
    ${schedulerMarkup}
    ${alerts}
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">Worker 工作情况</div>
        <div class="network-breakdown-subtitle">按玩家刷盘、实例刷盘、outbox 和备份 worker 汇总</div>
      </div>
      <div class="network-breakdown-list">${rows}</div>
    </div>
  `;
}

/** loadWorkerState：读取Worker状态。 */
export async function loadWorkerState(silent: boolean, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken() || ctx.getWorkerStateLoading()) {
    return;
  }
  ctx.setWorkerStateLoading(true);
  renderWorkerPanel(ctx);
  try {
    ctx.setWorkerState(await ctx.request<GmWorkerStateRes>(buildGmWorkersApiPath()));
    if (!silent) {
      ctx.setStatus(`已刷新 ${ctx.getWorkerState()!.rows.length} 个 worker 状态`);
    }
  } finally {
    ctx.setWorkerStateLoading(false);
    renderWorkerPanel(ctx);
  }
}

export function getEnvCheckStatusText(status: GmEnvCheckResult['groups'][number]['items'][number]['status'], ctx: ServerPanelsExtraContext): string {
  if (status === 'ok') return '通过';
  if (status === 'warn') return '警告';
  return '异常';
}

export function getEnvCheckStatusIcon(status: GmEnvCheckResult['groups'][number]['items'][number]['status'], ctx: ServerPanelsExtraContext): string {
  if (status === 'ok') return '✅';
  if (status === 'warn') return '⚠️';
  return '❌';
}

export function renderEnvCheckPanel(ctx: ServerPanelsExtraContext): void {
  const ec = ctx.getEnvCheckResult();
  ctx.serverEnvCheckRefreshBtn.disabled = ctx.getEnvCheckLoading();
  ctx.serverEnvCheckRefreshBtn.textContent = ctx.getEnvCheckLoading() ? '检测中…' : '开始检测';

  if (ctx.getEnvCheckLoading()) {
    ctx.serverEnvCheckMetaEl.textContent = '环境检测执行中…';
  } else if (ec) {
    const { summary } = ec!;
    ctx.serverEnvCheckMetaEl.textContent = `检测时间 ${new Date(ec!.checkedAt).toLocaleString()} · 共 ${summary.total} 项 · 通过 ${summary.ok} · 警告 ${summary.warn} · 异常 ${summary.error}`;
  } else {
    ctx.serverEnvCheckMetaEl.textContent = '环境检测尚未执行。';
  }

  if (!ec) {
    ctx.serverEnvCheckContentEl.innerHTML = '<div class="empty-hint">点击“开始检测”读取环境状态。</div>';
    return;
  }

  ctx.serverEnvCheckContentEl.innerHTML = ec!.groups.map((group) => `
    <div class="network-breakdown" style="margin-top: 12px;">
      <div class="network-breakdown-head">
        <div class="panel-title">${ctx.escapeHtml(group.title)}</div>
        <div class="network-breakdown-subtitle">${group.items.length} 项检测</div>
      </div>
      <div class="network-breakdown-list">
        ${group.items.map((item) => `
          <div class="network-row">
            <div>
              <div class="network-row-label">${getEnvCheckStatusIcon(item.status, ctx)} ${ctx.escapeHtml(item.name)}</div>
              <div class="network-row-meta">${ctx.escapeHtml(item.value)}${item.expected ? ` · 期望：${ctx.escapeHtml(item.expected)}` : ''}</div>
            </div>
            <div class="network-row-value">${getEnvCheckStatusText(item.status, ctx)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

export async function loadEnvCheck(silent: boolean, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken() || ctx.getEnvCheckLoading()) return;
  ctx.setEnvCheckLoading(true);
  renderEnvCheckPanel(ctx);
  try {
    ctx.setEnvCheckResult(await ctx.request<GmEnvCheckResult>(buildGmEnvironmentCheckApiPath()));
    if (!silent) {
      const { summary } = ctx.getEnvCheckResult()!;
      ctx.setStatus(`环境检测完成：异常 ${summary.error} 项，警告 ${summary.warn} 项`);
    }
  } finally {
    ctx.setEnvCheckLoading(false);
    renderEnvCheckPanel(ctx);
  }
}

export async function loadRuntimeFlags(ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken() || ctx.getRuntimeFlagsLoading()) return;
  ctx.setRuntimeFlagsLoading(true);
  renderRuntimeFlagsPanel(ctx);
  try {
    const res = await ctx.request<{ flags: Array<{ key: string; value: boolean }> }>(`${ctx.GM_API_BASE_PATH}/runtime-flags`);
    ctx.setRuntimeFlags(res.flags ?? []);
  } finally {
    ctx.setRuntimeFlagsLoading(false);
    renderRuntimeFlagsPanel(ctx);
  }
}

export async function toggleRuntimeFlag(key: string, value: boolean, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken()) return;
  await ctx.request(`${ctx.GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
  if (key === ctx.NETWORK_PAYLOAD_CAPTURE_FLAG_KEY) {
    await ctx.loadState(true);
  }
  await loadRuntimeFlags(ctx);
}

export async function addRuntimeFlag(key: string, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken() || !key.trim()) return;
  await ctx.request(`${ctx.GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key.trim())}`, {
    method: 'POST',
    body: JSON.stringify({ value: false }),
  });
  await loadRuntimeFlags(ctx);
}

export async function deleteRuntimeFlag(key: string, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken()) return;
  await ctx.request(`${ctx.GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  await loadRuntimeFlags(ctx);
}

export async function setMaintenanceMode(active: boolean, ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken()) return;
  ctx.toggleMaintenanceModeBtn.disabled = true;
  try {
    await ctx.request<BasicOkRes & { active?: boolean }>(`${ctx.GM_API_BASE_PATH}/maintenance`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    if (ctx.getState()) {
      ctx.setState({
        ...ctx.getState() as any,
        operations: {
          maintenanceActive: active,
          restartRequested: (ctx.getState() as any).operations?.restartRequested === true,
        },
      });
      ctx.renderSummary(ctx.getState());
    }
    await ctx.loadState(true);
    ctx.setStatus(active ? '已开启维护中' : '已关闭维护中');
  } finally {
    ctx.toggleMaintenanceModeBtn.disabled = false;
  }
}

export async function restartServer(ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken()) return;
  ctx.restartServerBtn.disabled = true;
  await ctx.request<BasicOkRes & { restartRequested?: boolean }>(`${ctx.GM_API_BASE_PATH}/server/restart`, {
    method: 'POST',
    body: JSON.stringify({
      confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.serverRestart,
    } satisfies GmRestartServerReq),
  });
  if (ctx.getState()) {
    ctx.setState({
      ...ctx.getState() as any,
      operations: {
        maintenanceActive: (ctx.getState() as any).operations?.maintenanceActive === true,
        restartRequested: true,
      },
    });
    ctx.renderSummary(ctx.getState());
  }
  ctx.setPendingStatus('重启指令已发送，服务即将断开并由外层托管器拉起');
}

export function renderRuntimeFlagsPanel(ctx: ServerPanelsExtraContext): void {
  // 运行时开关现在渲染到游戏配置页，直接触发游戏配置页重新渲染
  ctx.renderGameConfig();
}

/** 生成运行时开关区块的 HTML，供游戏配置页使用 */
export function buildRuntimeFlagsHtml(ctx: ServerPanelsExtraContext): string {
  return serverPanelsBuildRuntimeFlagsHtml(ctx.getRuntimeFlagsLoading(), ctx.getRuntimeFlags(), ctx.NETWORK_PAYLOAD_CAPTURE_FLAG_KEY);
}

/** 绑定运行时开关区块内的事件 */
export function bindRuntimeFlagsEvents(container: HTMLElement, ctx: ServerPanelsExtraContext): void {
  // 整行点击切换（排除删除按钮区域）
  container.querySelectorAll<HTMLElement>('[data-flag-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-flag-delete]')) return;
      const input = row.querySelector<HTMLInputElement>('input[data-flag-key]');
      if (!input) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // 绑定 toggle 事件
  container.querySelectorAll<HTMLInputElement>('input[data-flag-key]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.flagKey!;
      toggleRuntimeFlag(key, input.checked, ctx).catch((err: unknown) => {
        ctx.setStatus(err instanceof Error ? err.message : '切换开关失败', true);
      });
    });
  });

  // 绑定删除事件
  container.querySelectorAll<HTMLButtonElement>('[data-flag-delete]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.flagDelete!;
      if (!confirm(`确定删除开关 "${key}" 吗？`)) return;
      deleteRuntimeFlag(key, ctx).catch((err: unknown) => {
        ctx.setStatus(err instanceof Error ? err.message : '删除开关失败', true);
      });
    });
  });

  // 绑定添加开关事件
  const addInput = container.querySelector<HTMLInputElement>('#gameconfig-flags-new-key');
  const addBtn = container.querySelector<HTMLButtonElement>('#gameconfig-flags-add');
  if (addInput && addBtn) {
    addBtn.addEventListener('click', () => {
      const key = addInput.value.trim();
      if (!key) return;
      addRuntimeFlag(key, ctx).then(() => {
        addInput.value = '';
      }).catch((err: unknown) => {
        ctx.setStatus(err instanceof Error ? err.message : '添加开关失败', true);
      });
    });
  }
}


export function renderObjectsPanel(ctx: ServerPanelsExtraContext): void {
  ctx.serverObjectsRefreshBtn.disabled = ctx.getObjectsLoading();
  if (ctx.getObjectsLoading()) {
    ctx.serverObjectsMetaEl.textContent = '加载中...';
    return;
  }
  if (!ctx.getObjectCountsData()) {
    ctx.serverObjectsMetaEl.textContent = '对象信息尚未加载。';
    ctx.serverObjectsContentEl.innerHTML = '<div class="empty-hint">当前没有对象信息。</div>';
    return;
  }
  ctx.serverObjectsMetaEl.textContent = serverPanelsRenderObjectsPanelMeta(ctx.getObjectCountsData()!);
  ctx.serverObjectsContentEl.innerHTML = serverPanelsRenderObjectsPanelHtml(ctx.getObjectCountsData()!);
}

export async function loadObjectCounts(ctx: ServerPanelsExtraContext): Promise<void> {
  if (!ctx.getToken() || ctx.getObjectsLoading()) return;
  ctx.setObjectsLoading(true);
  renderObjectsPanel(ctx);
  try {
    ctx.setObjectCountsData(await ctx.request<ObjectCountsResponse>(`${ctx.GM_API_BASE_PATH}/world/objects`));
  } finally {
    ctx.setObjectsLoading(false);
    renderObjectsPanel(ctx);
  }
}

