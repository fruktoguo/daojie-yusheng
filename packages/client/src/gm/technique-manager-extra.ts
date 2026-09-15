/**
 * gm/technique-manager-extra.ts —— GM 功法管理器渲染层。
 *
 * 从 gm.ts 抽取：renderTechniqueFilterControls/renderTechniqueOverview/
 * renderTechniqueCandidateList/renderTechniqueManage/renderLearnedTechniqueList/
 * renderTechniqueDetails/renderTechniqueManager。
 * 功法分页/筛选/选择等模块级状态通过 TechniqueManagerRenderContext 显式传入，
 * 可变页码通过 setCurrentTechniqueCandidatePage/setCurrentTechniqueLearnedPage 回写。
 */

import {
  TECHNIQUE_CATEGORY_LABELS,
  TECHNIQUE_GRADE_LABELS,
  type AutoBattleSkillConfig,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueState,
} from '@mud/shared';
import { GM_TECHNIQUE_PAGE_SIZE_OPTIONS } from './editor-helpers';

/** GmTechniqueEditorSubtab：功法管理器子标签页。 */
export type GmTechniqueEditorSubtab = 'overview' | 'manage' | 'details';

/** GmTechniqueCandidateSource：功法候选来源。 */
export type GmTechniqueCandidateSource = 'system' | 'systemRandom' | 'generated';

/** GmTechniqueCategoryFilter：功法类别筛选值。 */
export type GmTechniqueCategoryFilter = 'all' | TechniqueCategory;

/** GmTechniqueGradeFilter：功法品阶筛选值。 */
export type GmTechniqueGradeFilter = 'all' | TechniqueGrade;

/** GmTechniqueCandidate：功法候选项。 */
export interface GmTechniqueCandidate {
  source: 'system' | 'generated';
  techId: string;
  name: string;
  category?: TechniqueCategory | string | null;
  grade?: TechniqueGrade | string | null;
  realmLv?: number | null;
  meta: string;
  learned: boolean;
  disabledReason?: string | null;
}

/** GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS：功法类别筛选选项。 */
export const GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS: readonly { value: GmTechniqueCategoryFilter; label: string }[] = [
  { value: 'all', label: '全部类别' },
  { value: 'internal', label: TECHNIQUE_CATEGORY_LABELS.internal },
  { value: 'arts', label: TECHNIQUE_CATEGORY_LABELS.arts },
  { value: 'divine', label: TECHNIQUE_CATEGORY_LABELS.divine },
  { value: 'secret', label: TECHNIQUE_CATEGORY_LABELS.secret },
];

/** GM_TECHNIQUE_GRADE_FILTER_OPTIONS：功法品阶筛选选项。 */
export const GM_TECHNIQUE_GRADE_FILTER_OPTIONS: readonly { value: GmTechniqueGradeFilter; label: string }[] = [
  { value: 'all', label: '全部品阶' },
  { value: 'mortal', label: TECHNIQUE_GRADE_LABELS.mortal },
  { value: 'yellow', label: TECHNIQUE_GRADE_LABELS.yellow },
  { value: 'mystic', label: TECHNIQUE_GRADE_LABELS.mystic },
  { value: 'earth', label: TECHNIQUE_GRADE_LABELS.earth },
  { value: 'heaven', label: TECHNIQUE_GRADE_LABELS.heaven },
  { value: 'spirit', label: TECHNIQUE_GRADE_LABELS.spirit },
  { value: 'saint', label: TECHNIQUE_GRADE_LABELS.saint },
  { value: 'emperor', label: TECHNIQUE_GRADE_LABELS.emperor },
];

/** TechniqueManagerRenderContext：功法管理器渲染依赖的状态与辅助函数。 */
export interface TechniqueManagerRenderContext {
  currentTechniqueCandidateSource: GmTechniqueCandidateSource;
  currentTechniqueCandidatePage: number;
  currentTechniquePageSize: number;
  selectedTechniqueCandidateIds: Set<string>;
  generatedTechniqueCandidateLoading: boolean;
  generatedTechniqueCandidateError: string | null;
  generatedTechniqueCandidateTotal: number;
  generatedTechniqueCandidatePageTotal: number;
  currentTechniqueLearnedPage: number;
  selectedLearnedTechniqueIds: Set<string>;
  currentTechniqueEditorSubtab: GmTechniqueEditorSubtab;
  currentTechniqueCategoryFilter: GmTechniqueCategoryFilter;
  currentTechniqueGradeFilter: GmTechniqueGradeFilter;
  currentTechniqueRealmLvFilter: string;
  currentTechniqueSearchQuery: string;
  currentTechniqueRandomPickCount: number;
  setCurrentTechniqueCandidatePage(page: number): void;
  setCurrentTechniqueLearnedPage(page: number): void;
  getTechniqueCategoryCounts(techniques: TechniqueState[]): Record<TechniqueCategory, number>;
  getLearnedTechniqueOptions(techniques: TechniqueState[], includeEmpty?: boolean): Array<{ value: string; label: string }>;
  getTechniqueEditorControls(index: number, technique: TechniqueState): string;
  getFilteredLearnedTechniques(techniques: TechniqueState[]): Array<{ technique: TechniqueState; index: number; meta: string }>;
  paginateTechniqueEntries<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; total: number; totalPages: number };
  getTechniqueCandidatePageData(techniques: TechniqueState[]): { items: GmTechniqueCandidate[]; page: number; total: number; totalPages: number };
  hasServerEditorCatalog(): boolean;
  getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string;
  getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string;
  getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string;
  escapeHtml(input: string): string;
  optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string;
  selectField(label: string, path: string, value: string | number | undefined, options: Array<{ value: string | number; label: string }>, extraClass?: string): string;
  textField(label: string, path: string, value: string | undefined, extraClass?: string): string;
}
export function renderTechniqueFilterControls(mode: 'candidates' | 'learned', ctx: TechniqueManagerRenderContext): string {
  const sourceOptions: Array<{ value: GmTechniqueCandidateSource; label: string }> = [
    { value: 'system', label: '系统功法' },
    { value: 'systemRandom', label: '系统随机功法' },
    { value: 'generated', label: '玩家自创功法' },
  ];
  const pageSizeOptions = GM_TECHNIQUE_PAGE_SIZE_OPTIONS.map((value) => ({ value, label: `${value} 条/页` }));
  return `
    <div class="gm-technique-filters">
      ${mode === 'candidates' ? `
        <label class="editor-field">
          <span>来源</span>
          <select data-technique-filter="source">
            ${ctx.optionsMarkup(sourceOptions, ctx.currentTechniqueCandidateSource)}
          </select>
        </label>
      ` : ''}
      <label class="editor-field">
        <span>类别</span>
        <select data-technique-filter="category">
          ${ctx.optionsMarkup([...GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS], ctx.currentTechniqueCategoryFilter)}
        </select>
      </label>
      <label class="editor-field">
        <span>品阶</span>
        <select data-technique-filter="grade">
          ${ctx.optionsMarkup([...GM_TECHNIQUE_GRADE_FILTER_OPTIONS], ctx.currentTechniqueGradeFilter)}
        </select>
      </label>
      <label class="editor-field">
        <span>境界等级</span>
        <input
          type="number"
          min="1"
          step="1"
          data-technique-filter="realmLv"
          value="${ctx.escapeHtml(ctx.currentTechniqueRealmLvFilter)}"
          placeholder="全部"
        />
      </label>
      <label class="editor-field wide">
        <span>名称 / ID 搜索</span>
        <input
          type="search"
          data-technique-filter="keyword"
          autocomplete="off"
          spellcheck="false"
          value="${ctx.escapeHtml(ctx.currentTechniqueSearchQuery)}"
          placeholder="输入功法名、ID、类别或品阶"
        />
      </label>
      <label class="editor-field">
        <span>分页</span>
        <select data-technique-filter="pageSize">
          ${ctx.optionsMarkup(pageSizeOptions, ctx.currentTechniquePageSize)}
        </select>
      </label>
      ${mode === 'candidates' && ctx.currentTechniqueCandidateSource === 'systemRandom' ? `
        <label class="editor-field">
          <span>随机数量</span>
          <input type="number" min="1" step="1" data-technique-filter="randomCount" value="${ctx.escapeHtml(String(ctx.currentTechniqueRandomPickCount))}" />
        </label>
      ` : ''}
    </div>
  `;
}

export function renderTechniqueOverview(techniques: TechniqueState[], autoBattleSkills: AutoBattleSkillConfig[], cultivatingTechId: string | undefined, ctx: TechniqueManagerRenderContext): string {
  const counts = ctx.getTechniqueCategoryCounts(techniques);
  const autoBattleMarkup = autoBattleSkills.length > 0
    ? autoBattleSkills.map((entry, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="auto-skill-title" data-index="${index}">${ctx.escapeHtml(ctx.getAutoSkillCardTitle(entry, index))}</div>
            <div class="editor-card-meta" data-preview="auto-skill-meta" data-index="${index}">${ctx.escapeHtml(ctx.getAutoSkillCardMeta(entry))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-auto-skill" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${ctx.textField('技能 ID', `autoBattleSkills.${index}.skillId`, entry.skillId)}
          <div class="editor-field">
            <span>启用状态</span>
            <label class="editor-toggle">
              <input type="checkbox" data-bind="autoBattleSkills.${index}.enabled" data-kind="boolean" ${entry.enabled ? 'checked' : ''} />
              <span>自动战斗时允许使用</span>
            </label>
          </div>
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有自动战斗技能配置。</div>';
  return `
    <div class="stats-grid">
      <div class="stats-card">
        <div class="stats-card-label">已学总数</div>
        <div class="stats-card-value">${techniques.length}</div>
        <div class="stats-card-note">当前写入玩家功法分域的功法数量</div>
      </div>
      ${GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS.filter((entry) => entry.value !== 'all').map((entry) => `
        <div class="stats-card">
          <div class="stats-card-label">${ctx.escapeHtml(entry.label)}</div>
          <div class="stats-card-value">${counts[entry.value as TechniqueCategory] ?? 0}</div>
          <div class="stats-card-note">${ctx.escapeHtml(entry.label)}类已学数量</div>
        </div>
      `).join('')}
      <div class="stats-card">
        <div class="stats-card-label">自动技能</div>
        <div class="stats-card-value">${autoBattleSkills.length}</div>
        <div class="stats-card-note">自动战斗技能槽数量</div>
      </div>
    </div>
    <div class="editor-section-head" style="margin-top: 12px;">
      <div>
        <div class="editor-section-title">修炼与自动战斗</div>
        <div class="editor-section-note">主修功法与自动技能列表。</div>
      </div>
      <button class="small-btn" type="button" data-action="add-auto-skill">新增自动技能</button>
    </div>
    <div class="editor-grid compact" style="margin-bottom: 10px;">
      ${ctx.selectField('主修功法', 'cultivatingTechId', cultivatingTechId ?? '', ctx.getLearnedTechniqueOptions(techniques, true), 'wide')}
    </div>
    <div class="editor-card-list">${autoBattleMarkup}</div>
  `;
}

export function renderTechniqueCandidateList(techniques: TechniqueState[], ctx: TechniqueManagerRenderContext): string {
  const isGenerated = ctx.currentTechniqueCandidateSource === 'generated';
  const pageData = ctx.getTechniqueCandidatePageData(techniques);
  ctx.setCurrentTechniqueCandidatePage(pageData.page);
  const selectablePageItems = pageData.items.filter((entry) => !entry.disabledReason);
  const selectedOnPage = selectablePageItems.filter((entry) => ctx.selectedTechniqueCandidateIds.has(entry.techId)).length;
  const allPageSelected = selectablePageItems.length > 0 && selectedOnPage === selectablePageItems.length;

  const listMeta = isGenerated && ctx.generatedTechniqueCandidateLoading
    ? '正在加载玩家自创功法...'
    : `第 ${pageData.page} / ${Math.max(1, pageData.totalPages)} 页 · 共 ${pageData.total} 条 · 已选 ${ctx.selectedTechniqueCandidateIds.size} 条`;
  return `
    <div class="gm-technique-list-head">
      <div class="editor-note">${ctx.escapeHtml(listMeta)}</div>
      <div class="button-row">
        ${isGenerated ? `<button class="small-btn" type="button" data-action="refresh-generated-technique-candidates">刷新自创功法</button>` : ''}
        ${ctx.currentTechniqueCandidateSource === 'systemRandom' ? `<button class="small-btn" type="button" data-action="random-select-technique-candidates">随机选择</button>` : ''}
        <button class="small-btn" type="button" data-action="select-page-technique-candidates">${allPageSelected ? '取消本页' : '全选本页'}</button>
        <button class="small-btn" type="button" data-action="clear-technique-candidate-selection" ${ctx.selectedTechniqueCandidateIds.size === 0 ? 'disabled' : ''}>清空选择</button>
        <button class="small-btn primary" type="button" data-action="add-selected-techniques" ${ctx.selectedTechniqueCandidateIds.size === 0 ? 'disabled' : ''}>添加选中未学</button>
        <button class="small-btn danger" type="button" data-action="remove-selected-technique-candidates" ${ctx.selectedTechniqueCandidateIds.size === 0 ? 'disabled' : ''}>移除选中已学</button>
      </div>
    </div>
    ${ctx.generatedTechniqueCandidateError ? `<div class="editor-note" style="color: var(--stamp-red);">${ctx.escapeHtml(ctx.generatedTechniqueCandidateError)}</div>` : ''}
    <div class="gm-technique-candidate-list">
      ${pageData.items.length > 0
        ? pageData.items.map((candidate) => `
          <label class="gm-technique-row ${candidate.learned ? 'learned' : ''} ${candidate.disabledReason ? 'disabled' : ''}">
            <input
              type="checkbox"
              data-technique-candidate-id="${ctx.escapeHtml(candidate.techId)}"
              ${candidate.disabledReason ? 'disabled' : ''}
              ${!candidate.disabledReason && ctx.selectedTechniqueCandidateIds.has(candidate.techId) ? 'checked' : ''}
            />
            <div class="gm-technique-row-main">
              <div class="gm-technique-row-title">${ctx.escapeHtml(candidate.name || candidate.techId)}</div>
              <div class="gm-technique-row-meta">${ctx.escapeHtml(candidate.meta)}</div>
            </div>
            <span class="pill ${candidate.learned ? 'online' : ''}">${candidate.disabledReason ? '需迁移' : candidate.learned ? '已学' : '未学'}</span>

          </label>
        `).join('')
        : `<div class="editor-note">${isGenerated && ctx.generatedTechniqueCandidateLoading ? '正在加载...' : '没有匹配的功法。'}</div>`}
    </div>
    <div class="gm-technique-pagination">
      <button class="small-btn" type="button" data-action="technique-candidate-prev" ${pageData.page <= 1 ? 'disabled' : ''}>上一页</button>
      <div class="editor-note">第 ${pageData.page} / ${Math.max(1, pageData.totalPages)} 页</div>
      <button class="small-btn" type="button" data-action="technique-candidate-next" ${pageData.page >= pageData.totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

export function renderTechniqueManage(techniques: TechniqueState[], ctx: TechniqueManagerRenderContext): string {
  const catalogDisabledNote = ctx.hasServerEditorCatalog()
    ? ''
    : '<div class="editor-note" style="color: var(--stamp-red);">服务端编辑目录不可用，系统功法无法添加。</div>';
  return `
    ${catalogDisabledNote}
    ${renderTechniqueFilterControls('candidates', ctx)}
    <div data-gm-technique-candidate-list>
      ${renderTechniqueCandidateList(techniques, ctx)}
    </div>
  `;
}

export function renderLearnedTechniqueList(techniques: TechniqueState[], ctx: TechniqueManagerRenderContext): string {
  const filtered = ctx.getFilteredLearnedTechniques(techniques);
  const pageData = ctx.paginateTechniqueEntries(filtered, ctx.currentTechniqueLearnedPage, ctx.currentTechniquePageSize);
  ctx.setCurrentTechniqueLearnedPage(pageData.page);
  const selectedOnPage = pageData.items.filter((entry) => ctx.selectedLearnedTechniqueIds.has(entry.technique.techId)).length;
  const allPageSelected = pageData.items.length > 0 && selectedOnPage === pageData.items.length;
  return `
    <div class="gm-technique-list-head">
      <div class="editor-note">第 ${pageData.page} / ${Math.max(1, pageData.totalPages)} 页 · 共 ${pageData.total} 条 · 已选 ${ctx.selectedLearnedTechniqueIds.size} 条</div>
      <div class="button-row">
        <button class="small-btn" type="button" data-action="select-page-learned-techniques">${allPageSelected ? '取消本页' : '全选本页'}</button>
        <button class="small-btn" type="button" data-action="clear-learned-technique-selection" ${ctx.selectedLearnedTechniqueIds.size === 0 ? 'disabled' : ''}>清空选择</button>
        <button class="small-btn" type="button" data-action="max-selected-learned-techniques" ${ctx.selectedLearnedTechniqueIds.size === 0 ? 'disabled' : ''}>选中满级</button>
        <button class="small-btn danger" type="button" data-action="remove-selected-learned-techniques" ${ctx.selectedLearnedTechniqueIds.size === 0 ? 'disabled' : ''}>移除选中</button>
      </div>
    </div>
    <div class="editor-card-list gm-technique-learned-list">
      ${pageData.items.length > 0
        ? pageData.items.map(({ technique, index, meta }) => `
          <div class="editor-card gm-technique-learned-card">
            <div class="editor-card-head">
              <label class="gm-technique-select-row">
                <input
                  type="checkbox"
                  data-learned-technique-id="${ctx.escapeHtml(technique.techId)}"
                  ${ctx.selectedLearnedTechniqueIds.has(technique.techId) ? 'checked' : ''}
                />
                <span>
                  <span class="editor-card-title" data-preview="technique-title" data-index="${index}">${ctx.escapeHtml(ctx.getTechniqueCardTitle(technique, index))}</span>
                  <span class="editor-card-meta" data-preview="technique-meta" data-index="${index}">${ctx.escapeHtml(meta)}</span>
                </span>
              </label>
              <button class="small-btn danger" type="button" data-action="remove-technique" data-index="${index}">删除</button>
            </div>
            ${ctx.getTechniqueEditorControls(index, technique)}
          </div>
        `).join('')
        : '<div class="editor-note">没有匹配的已学功法。</div>'}
    </div>
    <div class="gm-technique-pagination">
      <button class="small-btn" type="button" data-action="technique-learned-prev" ${pageData.page <= 1 ? 'disabled' : ''}>上一页</button>
      <div class="editor-note">第 ${pageData.page} / ${Math.max(1, pageData.totalPages)} 页</div>
      <button class="small-btn" type="button" data-action="technique-learned-next" ${pageData.page >= pageData.totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

export function renderTechniqueDetails(techniques: TechniqueState[], ctx: TechniqueManagerRenderContext): string {
  return `
    ${renderTechniqueFilterControls('learned', ctx)}
    <div data-gm-technique-learned-list>
      ${renderLearnedTechniqueList(techniques, ctx)}
    </div>
  `;
}

export function renderTechniqueManager(techniques: TechniqueState[], autoBattleSkills: AutoBattleSkillConfig[], cultivatingTechId: string | undefined, ctx: TechniqueManagerRenderContext): string {
  const subtabs: Array<{ value: GmTechniqueEditorSubtab; label: string }> = [
    { value: 'overview', label: '总览' },
    { value: 'manage', label: '添加/移除' },
    { value: 'details', label: '已学详情' },
  ];
  const body = ctx.currentTechniqueEditorSubtab === 'overview'
    ? renderTechniqueOverview(techniques, autoBattleSkills, cultivatingTechId, ctx)
    : ctx.currentTechniqueEditorSubtab === 'manage'
      ? renderTechniqueManage(techniques, ctx)
      : renderTechniqueDetails(techniques, ctx);
  return `
    <div class="gm-technique-manager" data-gm-technique-manager>
      <div class="gm-technique-subtabs">
        ${subtabs.map((entry) => `
          <button
            class="workspace-tab ${ctx.currentTechniqueEditorSubtab === entry.value ? 'active' : ''}"
            type="button"
            data-action="switch-technique-subtab"
            data-technique-subtab="${entry.value}"
          >${ctx.escapeHtml(entry.label)}</button>
        `).join('')}
      </div>
      <div class="gm-technique-subtab-body" data-gm-technique-body>
        ${body}
      </div>
    </div>
  `;
}
