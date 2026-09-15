/**
 * gm/generated-technique.ts —— GM 生成功法面板：列表、详情、任务列表、任务详情。
 *
 * 从 gm.ts 抽取：buildGeneratedTechniqueListQueryParams/
 * buildTechniqueGenerationJobListQueryParams/applyGeneratedTechniqueSubtabVisibility/
 * switchGeneratedTechniqueSubtab/loadCurrentGeneratedTechniqueSubtab/
 * loadGeneratedTechniques/renderGeneratedTechniquePanel/
 * renderGeneratedTechniqueRow/renderGeneratedTechniqueDetail/
 * loadGeneratedTechniqueDetail/getGeneratedTechniqueGradeLabel/
 * loadTechniqueGenerationJobs/renderTechniqueGenerationJobPanel/
 * renderTechniqueGenerationJobRow/renderTechniqueGenerationJobDetail/
 * loadTechniqueGenerationJobDetail/formatTechniqueGenerationJobItemState/
 * formatTechniqueGenerationJobPlayerLabel/formatTechniqueGenerationJobStatus/
 * handleGeneratedTechniquePanelLoadError。
 * 对 gm.ts 的依赖通过 GeneratedTechniqueContext 显式注入。
 */

import {
  type GmGeneratedTechniqueDetailRes,
  type GmGeneratedTechniqueListRes,
  type GmGeneratedTechniqueSummary,
  type GmTechniqueGenerationJobDetailRes,
  type GmTechniqueGenerationJobListRes,
  type GmTechniqueGenerationJobSummary,
} from '@mud/shared';
import {
  buildGmGeneratedTechniquesApiPath,
  buildGmGeneratedTechniqueDetailApiPath,
  buildGmTechniqueGenerationJobsApiPath,
  buildGmTechniqueGenerationJobDetailApiPath,
} from './api';
import {
  getGeneratedTechniqueGradeLabel as genGetGeneratedTechniqueGradeLabel,
  formatTechniqueGenerationJobItemState as genFormatTechniqueGenerationJobItemState,
  formatTechniqueGenerationJobPlayerLabel as genFormatTechniqueGenerationJobPlayerLabel,
  formatTechniqueGenerationJobStatus as genFormatTechniqueGenerationJobStatus,
  renderGeneratedTechniqueRow as genRenderGeneratedTechniqueRow,
  renderTechniqueGenerationJobRow as genRenderTechniqueGenerationJobRow,
} from './gen-technique-format';

/** GeneratedTechniqueContext：generated-technique 对 gm.ts 的依赖。 */
export interface GeneratedTechniqueContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  escapeHtml(input: string): string;
  getCurrentGeneratedTechniqueSubtab(): 'techniques' | 'jobs' | 'manual';
  setCurrentGeneratedTechniqueSubtab(tab: 'techniques' | 'jobs' | 'manual'): void;
  getGeneratedTechniquePage(): number;
  setGeneratedTechniquePage(page: number): void;
  getTechniqueGenerationJobPage(): number;
  setTechniqueGenerationJobPage(page: number): void;
  getGeneratedTechniques(): GmGeneratedTechniqueSummary[];
  setGeneratedTechniques(techniques: GmGeneratedTechniqueSummary[]): void;
  getGeneratedTechniqueTotalPages(): number;
  setGeneratedTechniqueTotalPages(pages: number): void;
  getSelectedGeneratedTechniqueId(): string | null;
  setSelectedGeneratedTechniqueId(id: string | null): void;
  getTechniqueGenerationJobs(): GmTechniqueGenerationJobSummary[];
  setTechniqueGenerationJobs(jobs: GmTechniqueGenerationJobSummary[]): void;
  getTechniqueGenerationJobTotalPages(): number;
  setTechniqueGenerationJobTotalPages(pages: number): void;
  getSelectedTechniqueGenerationJobId(): string | null;
  setSelectedTechniqueGenerationJobId(id: string | null): void;
  generatedTechniqueBrowseEl: HTMLElement;
  generatedTechniqueListEl: HTMLElement;
  generatedTechniqueDetailEl: HTMLElement;
  generatedTechniqueDetailEmptyEl: HTMLElement;
  generatedTechniqueDetailMetaEl: HTMLElement;
  generatedTechniqueJsonEl: HTMLTextAreaElement;
  generatedTechniquePageMetaEl: HTMLElement;
  generatedTechniquePageNextBtn: HTMLButtonElement;
  generatedTechniquePagePrevBtn: HTMLButtonElement;
  generatedTechniquePaginationEl: HTMLElement;
  generatedTechniqueSubtabJobsBtn: HTMLButtonElement;
  generatedTechniqueSubtabManualBtn: HTMLButtonElement;
  generatedTechniqueSubtabTechniquesBtn: HTMLButtonElement;
  customTechniqueFormEl: HTMLElement;
  getGeneratedTechniqueEditor(): { activate(): void };
  getSelectedGeneratedTechniqueDetail(): GmGeneratedTechniqueDetailRes['technique'] | null;
  setSelectedGeneratedTechniqueDetail(detail: GmGeneratedTechniqueDetailRes['technique'] | null): void;
  getSelectedTechniqueGenerationJobDetail(): GmTechniqueGenerationJobDetailRes['job'] | null;
  setSelectedTechniqueGenerationJobDetail(detail: GmTechniqueGenerationJobDetailRes['job'] | null): void;
  getGeneratedTechniqueListRequestNonce(): number;
  setGeneratedTechniqueListRequestNonce(nonce: number): void;
  getGeneratedTechniqueDetailRequestNonce(): number;
  setGeneratedTechniqueDetailRequestNonce(nonce: number): void;
  getTechniqueGenerationJobListRequestNonce(): number;
  setTechniqueGenerationJobListRequestNonce(nonce: number): void;
  getTechniqueGenerationJobDetailRequestNonce(): number;
  setTechniqueGenerationJobDetailRequestNonce(nonce: number): void;
}
export function buildGeneratedTechniqueListQueryParams(ctx: GeneratedTechniqueContext): URLSearchParams {
  return new URLSearchParams({
    page: String(ctx.getGeneratedTechniquePage()),
    pageSize: '50',
  });
}

export function buildTechniqueGenerationJobListQueryParams(ctx: GeneratedTechniqueContext): URLSearchParams {
  return new URLSearchParams({
    page: String(ctx.getTechniqueGenerationJobPage()),
    pageSize: '50',
  });
}

export function applyGeneratedTechniqueSubtabVisibility(tab: 'techniques' | 'jobs' | 'manual', ctx: GeneratedTechniqueContext): void {
  ctx.generatedTechniqueSubtabTechniquesBtn.classList.toggle('active', tab === 'techniques');
  ctx.generatedTechniqueSubtabJobsBtn.classList.toggle('active', tab === 'jobs');
  ctx.generatedTechniqueSubtabManualBtn.classList.toggle('active', tab === 'manual');
  const manual = tab === 'manual';
  ctx.generatedTechniqueBrowseEl.classList.toggle('hidden', manual);
  ctx.generatedTechniquePaginationEl.classList.toggle('hidden', manual);
  ctx.customTechniqueFormEl.classList.toggle('hidden', !manual);
  if (manual) {
    ctx.getGeneratedTechniqueEditor().activate();
  }
}

export function switchGeneratedTechniqueSubtab(tab: 'techniques' | 'jobs' | 'manual', ctx: GeneratedTechniqueContext): void {
  ctx.setCurrentGeneratedTechniqueSubtab(tab);
  applyGeneratedTechniqueSubtabVisibility(tab, ctx);
  if (tab === 'manual') {
    return;
  }
  loadCurrentGeneratedTechniqueSubtab(false, ctx).catch((e: unknown) => handleGeneratedTechniquePanelLoadError(e, ctx));
}

export async function loadCurrentGeneratedTechniqueSubtab(silent: boolean, ctx: GeneratedTechniqueContext): Promise<void> {
  if (ctx.getCurrentGeneratedTechniqueSubtab() === 'manual') {
    return;
  }
  if (ctx.getCurrentGeneratedTechniqueSubtab() === 'jobs') {
    await loadTechniqueGenerationJobs(silent, ctx);
    return;
  }
  await loadGeneratedTechniques(silent, ctx);
}

export async function loadGeneratedTechniques(silent: boolean, ctx: GeneratedTechniqueContext): Promise<void> {
  if (!ctx.getToken()) return;
  const nonce = ctx.getGeneratedTechniqueListRequestNonce() + 1; ctx.setGeneratedTechniqueListRequestNonce(nonce);
  applyGeneratedTechniqueSubtabVisibility('techniques', ctx);
  ctx.generatedTechniqueSubtabTechniquesBtn.classList.add('active');
  ctx.generatedTechniqueSubtabJobsBtn.classList.remove('active');
  ctx.generatedTechniqueListEl.innerHTML = '<div class="empty-hint">正在加载功法…</div>';
  ctx.generatedTechniquePageMetaEl.textContent = `第 ${ctx.getGeneratedTechniquePage()} / ${Math.max(1, ctx.getGeneratedTechniqueTotalPages())} 页 · 加载中`;
  ctx.generatedTechniquePagePrevBtn.disabled = true;
  ctx.generatedTechniquePageNextBtn.disabled = true;

  const result = await ctx.request<GmGeneratedTechniqueListRes>(
    buildGmGeneratedTechniquesApiPath(buildGeneratedTechniqueListQueryParams(ctx)),
  );
  if (nonce !== ctx.getGeneratedTechniqueListRequestNonce()) {
    return;
  }

  ctx.setGeneratedTechniques(result.techniques);
  ctx.setGeneratedTechniquePage(result.page.page);
  ctx.setGeneratedTechniqueTotalPages(result.page.totalPages);
  if (!ctx.getSelectedGeneratedTechniqueId() || !ctx.getGeneratedTechniques().some((technique) => technique.id === ctx.getSelectedGeneratedTechniqueId())) {
    ctx.setSelectedGeneratedTechniqueId(null);
    ctx.setSelectedGeneratedTechniqueDetail(null);
  }
  renderGeneratedTechniquePanel(result, ctx);
  if (!silent) {
    ctx.setStatus(`已同步生成的功法第 ${result.page.page} / ${result.page.totalPages} 页，本页 ${result.techniques.length} 条，共 ${result.page.total} 条`);
  }
}

export function renderGeneratedTechniquePanel(result: GmGeneratedTechniqueListRes | undefined, ctx: GeneratedTechniqueContext): void {
  const page = result?.page ?? {
    page: ctx.getGeneratedTechniquePage(),
    pageSize: 50,
    total: ctx.getGeneratedTechniques().length,
    totalPages: ctx.getGeneratedTechniqueTotalPages(),
  };
  ctx.generatedTechniquePageMetaEl.textContent = `第 ${page.page} / ${Math.max(1, page.totalPages)} 页 · 共 ${page.total} 条`;
  ctx.generatedTechniquePagePrevBtn.disabled = page.page <= 1;
  ctx.generatedTechniquePageNextBtn.disabled = page.page >= page.totalPages;

  if (ctx.getGeneratedTechniques().length === 0) {
    ctx.generatedTechniqueListEl.innerHTML = '<div class="empty-hint">暂无生成的功法。</div>';
  } else {
    ctx.generatedTechniqueListEl.innerHTML = ctx.getGeneratedTechniques().map((technique) => renderGeneratedTechniqueRow(technique, ctx)).join('');
  }
  renderGeneratedTechniqueDetail(ctx);
}

export function renderGeneratedTechniqueRow(technique: GmGeneratedTechniqueSummary, ctx: GeneratedTechniqueContext): string {
  return genRenderGeneratedTechniqueRow(technique, ctx.getSelectedGeneratedTechniqueId());
}

export function renderGeneratedTechniqueDetail(ctx: GeneratedTechniqueContext): void {
  if (!ctx.getSelectedGeneratedTechniqueId()) {
    ctx.generatedTechniqueDetailEmptyEl.classList.remove('hidden');
    ctx.generatedTechniqueDetailEl.classList.add('hidden');
    ctx.generatedTechniqueDetailMetaEl.textContent = '从左侧选择一条记录。';
    ctx.generatedTechniqueJsonEl.value = '';
    return;
  }
  const summary = ctx.getGeneratedTechniques().find((technique) => technique.id === ctx.getSelectedGeneratedTechniqueId()) ?? null;
  ctx.generatedTechniqueDetailMetaEl.textContent = summary
    ? `${summary.name} · ${getGeneratedTechniqueGradeLabel(summary.grade, ctx)} · ${summary.realmLv !== null && summary.realmLv !== undefined ? `Lv.${summary.realmLv}` : 'Lv.-'}`
    : ctx.getSelectedGeneratedTechniqueId();
  ctx.generatedTechniqueDetailEmptyEl.classList.add('hidden');
  ctx.generatedTechniqueDetailEl.classList.remove('hidden');
  const detail = ctx.getSelectedGeneratedTechniqueDetail();
  ctx.generatedTechniqueJsonEl.value = detail
    ? JSON.stringify(detail.rawJson ?? detail, null, 2)
    : '正在加载详情…';
}

export async function loadGeneratedTechniqueDetail(id: string, ctx: GeneratedTechniqueContext): Promise<void> {
  ctx.setSelectedGeneratedTechniqueId(id);
  ctx.setSelectedGeneratedTechniqueDetail(null);
  renderGeneratedTechniquePanel(undefined, ctx);
  const nonce = ctx.getGeneratedTechniqueDetailRequestNonce() + 1; ctx.setGeneratedTechniqueDetailRequestNonce(nonce);
  const result = await ctx.request<GmGeneratedTechniqueDetailRes>(buildGmGeneratedTechniqueDetailApiPath(id));
  if (nonce !== ctx.getGeneratedTechniqueDetailRequestNonce() || ctx.getSelectedGeneratedTechniqueId() !== id) {
    return;
  }
  ctx.setSelectedGeneratedTechniqueDetail(result.technique);
  renderGeneratedTechniquePanel(undefined, ctx);
  ctx.setStatus(`已加载功法：${result.technique.name}`);
}

export function getGeneratedTechniqueGradeLabel(grade: string | null | undefined, ctx: GeneratedTechniqueContext): string {
  return genGetGeneratedTechniqueGradeLabel(grade);
}

export async function loadTechniqueGenerationJobs(silent: boolean, ctx: GeneratedTechniqueContext): Promise<void> {
  if (!ctx.getToken()) return;
  const nonce = ctx.getTechniqueGenerationJobListRequestNonce() + 1; ctx.setTechniqueGenerationJobListRequestNonce(nonce);
  applyGeneratedTechniqueSubtabVisibility('jobs', ctx);
  ctx.generatedTechniqueSubtabTechniquesBtn.classList.remove('active');
  ctx.generatedTechniqueSubtabJobsBtn.classList.add('active');
  ctx.generatedTechniqueListEl.innerHTML = '<div class="empty-hint">正在加载生成任务…</div>';
  ctx.generatedTechniquePageMetaEl.textContent = `第 ${ctx.getTechniqueGenerationJobPage()} / ${Math.max(1, ctx.getTechniqueGenerationJobTotalPages())} 页 · 加载中`;
  ctx.generatedTechniquePagePrevBtn.disabled = true;
  ctx.generatedTechniquePageNextBtn.disabled = true;

  const result = await ctx.request<GmTechniqueGenerationJobListRes>(
    buildGmTechniqueGenerationJobsApiPath(buildTechniqueGenerationJobListQueryParams(ctx)),
  );
  if (nonce !== ctx.getTechniqueGenerationJobListRequestNonce()) {
    return;
  }

  ctx.setTechniqueGenerationJobs(result.jobs);
  ctx.setTechniqueGenerationJobPage(result.page.page);
  ctx.setTechniqueGenerationJobTotalPages(result.page.totalPages);
  if (!ctx.getSelectedTechniqueGenerationJobId() || !ctx.getTechniqueGenerationJobs().some((job) => job.id === ctx.getSelectedTechniqueGenerationJobId())) {
    ctx.setSelectedTechniqueGenerationJobId(null);
    ctx.setSelectedTechniqueGenerationJobDetail(null);
  }
  renderTechniqueGenerationJobPanel(result, ctx);
  if (!silent) {
    ctx.setStatus(`已同步生成任务第 ${result.page.page} / ${result.page.totalPages} 页，本页 ${result.jobs.length} 条，共 ${result.page.total} 条`);
  }
}

export function renderTechniqueGenerationJobPanel(result: GmTechniqueGenerationJobListRes | undefined, ctx: GeneratedTechniqueContext): void {
  const page = result?.page ?? {
    page: ctx.getTechniqueGenerationJobPage(),
    pageSize: 50,
    total: ctx.getTechniqueGenerationJobs().length,
    totalPages: ctx.getTechniqueGenerationJobTotalPages(),
  };
  ctx.generatedTechniquePageMetaEl.textContent = `第 ${page.page} / ${Math.max(1, page.totalPages)} 页 · 共 ${page.total} 条`;
  ctx.generatedTechniquePagePrevBtn.disabled = page.page <= 1;
  ctx.generatedTechniquePageNextBtn.disabled = page.page >= page.totalPages;

  if (ctx.getTechniqueGenerationJobs().length === 0) {
    ctx.generatedTechniqueListEl.innerHTML = '<div class="empty-hint">暂无生成任务。</div>';
  } else {
    ctx.generatedTechniqueListEl.innerHTML = ctx.getTechniqueGenerationJobs().map((job) => renderTechniqueGenerationJobRow(job, ctx)).join('');
  }
  renderTechniqueGenerationJobDetail(ctx);
}

export function renderTechniqueGenerationJobRow(job: GmTechniqueGenerationJobSummary, ctx: GeneratedTechniqueContext): string {
  return genRenderTechniqueGenerationJobRow(job, ctx.getSelectedTechniqueGenerationJobId());
}

export function renderTechniqueGenerationJobDetail(ctx: GeneratedTechniqueContext): void {
  if (!ctx.getSelectedTechniqueGenerationJobId()) {
    ctx.generatedTechniqueDetailEmptyEl.classList.remove('hidden');
    ctx.generatedTechniqueDetailEl.classList.add('hidden');
    ctx.generatedTechniqueDetailMetaEl.textContent = '从左侧选择一条生成任务。';
    ctx.generatedTechniqueJsonEl.value = '';
    return;
  }
  const summary = ctx.getTechniqueGenerationJobs().find((job) => job.id === ctx.getSelectedTechniqueGenerationJobId()) ?? null;
  ctx.generatedTechniqueDetailMetaEl.textContent = summary
    ? `${formatTechniqueGenerationJobStatus(summary.status, ctx)} · ${formatTechniqueGenerationJobItemState(summary, ctx)} · ${formatTechniqueGenerationJobPlayerLabel(summary, ctx)}`
    : ctx.getSelectedTechniqueGenerationJobId();
  ctx.generatedTechniqueDetailEmptyEl.classList.add('hidden');
  ctx.generatedTechniqueDetailEl.classList.remove('hidden');
  const jobDetail = ctx.getSelectedTechniqueGenerationJobDetail();
  ctx.generatedTechniqueJsonEl.value = jobDetail
    ? JSON.stringify(jobDetail.rawJson ?? jobDetail, null, 2)
    : '正在加载详情…';
}

export async function loadTechniqueGenerationJobDetail(id: string, ctx: GeneratedTechniqueContext): Promise<void> {
  ctx.setSelectedTechniqueGenerationJobId(id);
  ctx.setSelectedTechniqueGenerationJobDetail(null);
  renderTechniqueGenerationJobPanel(undefined, ctx);
  const nonce = ctx.getTechniqueGenerationJobDetailRequestNonce() + 1; ctx.setTechniqueGenerationJobDetailRequestNonce(nonce);
  const result = await ctx.request<GmTechniqueGenerationJobDetailRes>(buildGmTechniqueGenerationJobDetailApiPath(id));
  if (nonce !== ctx.getTechniqueGenerationJobDetailRequestNonce() || ctx.getSelectedTechniqueGenerationJobId() !== id) {
    return;
  }
  ctx.setSelectedTechniqueGenerationJobDetail(result.job);
  renderTechniqueGenerationJobPanel(undefined, ctx);
  ctx.setStatus(`已加载生成任务：${result.job.id}`);
}

export function formatTechniqueGenerationJobItemState(job: GmTechniqueGenerationJobSummary, ctx: GeneratedTechniqueContext): string {
  return genFormatTechniqueGenerationJobItemState(job);
}

export function formatTechniqueGenerationJobPlayerLabel(job: GmTechniqueGenerationJobSummary, ctx: GeneratedTechniqueContext): string {
  return genFormatTechniqueGenerationJobPlayerLabel(job);
}

export function formatTechniqueGenerationJobStatus(status: string, ctx: GeneratedTechniqueContext): string {
  return genFormatTechniqueGenerationJobStatus(status);
}

export function handleGeneratedTechniquePanelLoadError(error: unknown, ctx: GeneratedTechniqueContext): void {
  ctx.generatedTechniqueListEl.innerHTML = `<div class="empty-hint" style="color:var(--stamp-red);">${ctx.escapeHtml(error instanceof Error ? error.message : '加载失败')}</div>`;
  ctx.setStatus(error instanceof Error ? error.message : '加载 AI 生成数据失败', true);
}

// ===== 交易记录 tab =====
/** tradesQueryState：交易记录 tab 当前查询状态，分页 / 关键字。 */
let tradesQueryState: { page: number; pageSize: number; playerKeyword: string; itemKeyword: string } = {
  page: 1,
  pageSize: 20,
  playerKeyword: '',
  itemKeyword: '',
};

/** loadTrades：根据当前/给定查询条件请求服务端并渲染。 */
