/**
 * technique-panel.cards.ts
 * 功法面板卡片/列表渲染提取模块，接收 TechniquePanel 实例作为 self。
 */
import {
  isTechniqueFullyMastered,
  PlayerState,
  TechniqueState,
} from '@mud/shared';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel, getTechniqueRealmLabel } from '../../domain-labels';
import { getLocalRealmLevelEntry, resolvePreviewTechniques } from '../../content/local-templates';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint } from '../ui-primitives';
import { formatDisplayInteger } from '../../utils/number';
import { t } from '../i18n';
import {
  buildTechniqueListEntries,
  countTechniqueListCategories,
  matchesPendingTechniqueFilters,
  type TechniqueCategoryFilter,
  type TechniquePendingListEntry,
  type TechniqueStatusFilter,
} from '../technique-list-view';
import {
  TechniquePanel,
  TechniqueCardNodeRefs,
  escapeHtml,
  TECHNIQUE_CATEGORY_FILTERS,
  TECHNIQUE_STATUS_FILTERS,
  TECHNIQUE_PANEL_PAGE_SIZE,
  resolveTechniqueCategory,
  shouldShowTechniqueSkillToggle,
  areTechniqueSkillsEnabled,
  getTechniqueProgressRatio,
  formatTechniqueLayerText,
  formatTechniqueProgressText,
  formatTechniqueRemainText,
  getResolvedTechniqueRealm,
  getTechniqueRealmLevelLabel,
  sortTechniquesForPanel,
} from './technique-panel';

export function renderListImpl(self: TechniquePanel): void {
  const techniques = self.getDisplayTechniques();
  const pendingComprehensions = self.getPendingTechniqueListEntries();
  if (techniques.length === 0 && pendingComprehensions.length === 0 && !self.hasPagedListContext()) {
    self.clear();
    return;
  }
  self.ensureShell();
  self.patchFilterTabs(techniques);
  self.patchList();
  self.ensureTechniquePageRequested();
}

export function ensureShellImpl(self: TechniquePanel): NonNullable<typeof self.shellRefs> {
  if (self.shellRefs?.shell.isConnected) {
    return self.shellRefs;
  }
  const shell = document.createElement('div');
  shell.className = 'tech-panel-shell';
  const toolbar = document.createElement('div');
  toolbar.className = 'tech-panel-toolbar';
  toolbar.innerHTML = `
    <label class="tech-search-box">
      <input class="tech-search-input" data-tech-search="true" type="search" placeholder="搜索功法名称" value="${escapeHtml(self.searchQuery)}" autocomplete="off" aria-label="搜索功法" />
    </label>
  `.trim();
  const topTabs = document.createElement('div');
  topTabs.className = 'tech-filter-tabs ui-filter-tabs';
  for (const filter of TECHNIQUE_CATEGORY_FILTERS) {
    const button = document.createElement('button');
    button.className = 'tech-filter-tab ui-filter-tab';
    button.dataset.techCategoryFilter = filter.value;
    button.type = 'button';
    button.append(document.createTextNode(filter.label));
    const count = document.createElement('span');
    count.className = 'tech-filter-count';
    count.dataset.techCategoryCount = filter.value;
    button.append(count);
    topTabs.append(button);
  }
  const body = document.createElement('div');
  body.className = 'tech-panel-body';
  const sideTabs = document.createElement('div');
  sideTabs.className = 'tech-side-tabs';
  for (const filter of TECHNIQUE_STATUS_FILTERS) {
    const button = document.createElement('button');
    button.className = 'tech-side-tab ui-subtab-btn';
    button.dataset.techStatusFilter = filter.value;
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = filter.label;
    const count = document.createElement('span');
    count.className = 'tech-filter-count';
    count.dataset.techStatusCount = filter.value;
    button.append(label, count);
    sideTabs.append(button);
  }
  const list = document.createElement('div');
  list.className = 'tech-panel-list';
  list.dataset.techList = 'true';
  const pagination = document.createElement('div');
  pagination.className = 'tech-pagination';
  pagination.dataset.techPagination = 'true';
  pagination.innerHTML = `
    <button class="small-btn ghost" data-tech-page-action="prev" type="button">上一页</button>
    <span class="tech-pagination-status" data-tech-page-status="true"></span>
    <button class="small-btn ghost" data-tech-page-action="next" type="button">下一页</button>
  `.trim();
  body.append(sideTabs, list);
  shell.append(toolbar, topTabs, body, pagination);
  preserveSelection(self.pane, () => {
    self.pane.replaceChildren(shell);
  });
  self.shellRefs = { shell, topTabs, sideTabs, pagination, list };
  return self.shellRefs;
}

export function renderTechniqueCardImpl(self: TechniquePanel, tech: TechniqueState): string {
  const isCultivating = self.lastState.cultivatingTechId === tech.techId;
  const showSkillToggle = shouldShowTechniqueSkillToggle(tech);
  const skillsEnabled = showSkillToggle ? areTechniqueSkillsEnabled(tech, self.lastState.previewPlayer) : false;
  const progressRatio = getTechniqueProgressRatio(tech);
  const progressText = formatTechniqueProgressText(tech);
  const remainText = formatTechniqueRemainText(tech);
  const realmLevelLabel = getTechniqueRealmLevelLabel(tech);
  const realmLabel = getTechniqueRealmLabel(getResolvedTechniqueRealm(tech));
  const categoryLabel = getTechniqueCategoryLabel(resolveTechniqueCategory(tech));
  return `<div class="tech-card ${isCultivating ? 'cultivating' : ''}" data-tech-card="${tech.techId}" data-guided-tour-tech-card="learned">
    <button class="tech-card-main" data-tech-open="${tech.techId}" type="button">
      <span class="tech-summary-main">
        <span class="tech-name">${escapeHtml(tech.name)}</span>
        <span class="tech-badge tech-grade">${escapeHtml(getTechniqueGradeLabel(tech.grade))}</span>
        <span class="tech-badge tech-category">${escapeHtml(categoryLabel)}</span>
        <span class="tech-badge tech-realm-level" data-tech-realm-level="${tech.techId}">${escapeHtml(realmLevelLabel)}</span>
        <span class="tech-badge tech-realm" data-tech-realm="${tech.techId}">${escapeHtml(realmLabel)}</span>
        <span class="tech-layer" data-tech-layer="${tech.techId}">${escapeHtml(formatTechniqueLayerText(tech))}</span>
      </span>
      <span class="tech-progress-meta">
        <span class="tech-progress-text" data-tech-progress-text="${tech.techId}">${progressText}</span>
      </span>
      <span class="tech-progress-bar"><span class="tech-progress-fill" data-tech-progress-fill="${tech.techId}" style="width:${(progressRatio * 100).toFixed(2)}%"></span></span>
      <span class="tech-progress-remain" data-tech-progress-remain="${tech.techId}">${remainText}</span>
    </button>
    <div class="tech-card-actions">
      ${showSkillToggle ? `<button
        class="small-btn ghost ${skillsEnabled ? 'active' : ''}"
        data-tech-skills-toggle="${tech.techId}"
        data-tech-skills-enabled="${skillsEnabled ? '1' : '0'}"
        type="button"
      >${escapeHtml(t('technique.card.skills-toggle', { state: skillsEnabled ? t('common.state.on-short', undefined) : t('common.state.off-short', undefined) }))}</button>` : ''}
      <button
        class="small-btn ${isCultivating ? 'danger' : ''}"
        data-tech-cultivate-button="${tech.techId}"
        data-guided-tour-cultivate-button="true"
        data-cultivate="${isCultivating ? '' : tech.techId}"
        data-cultivate-stop="${isCultivating ? tech.techId : ''}"
        type="button"
      >${isCultivating ? t('technique.action.cancel-cultivate', undefined) : t('technique.action.set-cultivate', undefined)}</button>
    </div>
  </div>`;
}

export function createTechniqueCardElementImpl(self: TechniquePanel, tech: TechniqueState): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = self.renderTechniqueCard(tech).trim();
  const card = template.content.firstElementChild;
  if (!(card instanceof HTMLElement)) {
    throw new Error(t('technique.error.create-card-failed', undefined));
  }
  self.cacheCardNodeRefs(tech.techId, card);
  return card;
}

export function createPendingTechniqueCardElementImpl(
  self: TechniquePanel,
  pending: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number],
): HTMLElement {
  const isCultivating = self.lastState.cultivatingTechId === pending.techId;
  const ratio = pending.requiredProgress > 0 ? Math.min(1, pending.progress / pending.requiredProgress) : 0;
  const transferLocked = Boolean(pending.activeTransferJob);
  const selfComprehensionAllowed = pending.selfComprehensionAllowed !== false;
  const canStartCultivating = selfComprehensionAllowed && !transferLocked;
  const startDisabled = !isCultivating && !canStartCultivating;
  const actionLabel = transferLocked
    ? '传授中'
    : !selfComprehensionAllowed
      ? '需传法领悟'
      : isCultivating
        ? t('technique.action.cancel-cultivate', undefined)
        : '设为主修领悟';
  const realmLv = Math.max(1, Math.floor(Number(pending.realmLv) || 1));
  const realmLabel = getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
  const template = document.createElement('template');
  template.innerHTML = `<div class="tech-card pending ${isCultivating ? 'cultivating' : ''}" data-pending-tech-card="${escapeHtml(pending.techId)}" data-guided-tour-tech-card="pending">
    <button class="tech-card-main" data-cultivate="${canStartCultivating && !isCultivating ? escapeHtml(pending.techId) : ''}" data-cultivate-stop="${isCultivating ? escapeHtml(pending.techId) : ''}" ${startDisabled ? 'disabled' : ''} type="button">
      <span class="tech-summary-main">
        <span class="tech-name">${escapeHtml(pending.name)}</span>
        <span class="tech-badge tech-category">未领悟</span>
        ${pending.sourceKind === 'created' ? '<span class="tech-badge tech-category">自创</span>' : ''}
        <span class="tech-badge tech-grade">${escapeHtml(getTechniqueGradeLabel(pending.grade))}</span>
        <span class="tech-badge tech-category">${escapeHtml(getTechniqueCategoryLabel(pending.category))}</span>
        <span class="tech-badge tech-realm-level">${escapeHtml(realmLabel)}</span>
        ${transferLocked ? `<span class="tech-badge tech-grade">${pending.activeTransferJob?.status === 'blocked' ? '等待传授' : '传授中'}</span>` : ''}
        ${!selfComprehensionAllowed ? '<span class="tech-badge tech-grade">需传法</span>' : ''}
      </span>
      <span class="tech-progress-meta"><span class="tech-progress-text">${formatDisplayInteger(Math.floor(pending.progress))} / ${formatDisplayInteger(Math.floor(pending.requiredProgress))}</span></span>
      <span class="tech-progress-bar"><span class="tech-progress-fill" style="width:${(ratio * 100).toFixed(2)}%"></span></span>
    </button>
    <div class="tech-card-actions">
      <button class="small-btn ${isCultivating ? 'danger' : 'ghost'}" data-guided-tour-cultivate-button="true" data-cultivate="${canStartCultivating && !isCultivating ? escapeHtml(pending.techId) : ''}" data-cultivate-stop="${isCultivating ? escapeHtml(pending.techId) : ''}" ${startDisabled ? 'disabled' : ''} type="button">${actionLabel}</button>
      ${transferLocked
        ? `<button class="small-btn danger" data-tech-transmission-cancel="${escapeHtml(pending.techId)}" type="button">取消传法</button>`
        : `<button class="small-btn danger" data-tech-comprehension-discard="${escapeHtml(pending.techId)}" type="button">${escapeHtml(t('technique.comprehension.discard.action'))}</button>`}
    </div>
  </div>`.trim();
  const card = template.content.firstElementChild;
  if (!(card instanceof HTMLElement)) {
    throw new Error(t('technique.error.create-card-failed', undefined));
  }
  return card;
}

export function cacheCardNodeRefsImpl(self: TechniquePanel, techId: string, card: HTMLElement): void {
  const escaped = CSS.escape(techId);
  const realmLevel = card.querySelector<HTMLElement>(`[data-tech-realm-level="${escaped}"]`);
  const realm = card.querySelector<HTMLElement>(`[data-tech-realm="${escaped}"]`);
  const layer = card.querySelector<HTMLElement>(`[data-tech-layer="${escaped}"]`);
  const progressText = card.querySelector<HTMLElement>(`[data-tech-progress-text="${escaped}"]`);
  const progressFill = card.querySelector<HTMLElement>(`[data-tech-progress-fill="${escaped}"]`);
  const remain = card.querySelector<HTMLElement>(`[data-tech-progress-remain="${escaped}"]`);
  const cultivateButton = card.querySelector<HTMLButtonElement>(`[data-tech-cultivate-button="${escaped}"]`);
  const skillToggleButton = card.querySelector<HTMLButtonElement>(`[data-tech-skills-toggle="${escaped}"]`);
  if (realmLevel && realm && layer && progressText && progressFill && remain && cultivateButton) {
    self.cardNodeRefs.set(techId, {
      card, realmLevel, realm, layer, progressText, progressFill, remain, cultivateButton, skillToggleButton,
    });
  }
}

export function buildTechniqueCardPatchSignatureImpl(self: TechniquePanel, tech: TechniqueState): string {
  const showSkillToggle = shouldShowTechniqueSkillToggle(tech);
  const skillsEnabled = showSkillToggle ? areTechniqueSkillsEnabled(tech, self.lastState.previewPlayer) : false;
  const isCultivating = self.lastState.cultivatingTechId === tech.techId;
  return [
    tech.level, tech.exp ?? 0, tech.expToNext ?? 0, tech.realmLv,
    getResolvedTechniqueRealm(tech), isCultivating ? 1 : 0,
    showSkillToggle ? 1 : 0, skillsEnabled ? 1 : 0,
  ].join('|');
}

export function syncTechniqueListContentImpl(self: TechniquePanel, listRoot: HTMLElement, orderedNodes: HTMLElement[]): void {
  const allowed = new Set(orderedNodes);
  for (const child of Array.from(listRoot.children)) {
    if (!(child instanceof HTMLElement) || !allowed.has(child)) {
      const techId = child instanceof HTMLElement ? child.dataset.techCard : undefined;
      if (techId) {
        self.cardNodeRefs.delete(techId);
        self.cardPatchSignatures.delete(techId);
      }
      child.remove();
    }
  }
  let reference: ChildNode | null = listRoot.firstChild;
  for (const node of orderedNodes) {
    if (reference !== node) {
      listRoot.insertBefore(node, reference);
    }
    reference = node.nextSibling;
  }
}

export function matchesCategoryFilterImpl(self: TechniquePanel, tech: TechniqueState, filter: TechniqueCategoryFilter = self.categoryFilter): boolean {
  return filter === 'all' || resolveTechniqueCategory(tech) === filter;
}

export function matchesStatusFilterImpl(self: TechniquePanel, tech: TechniqueState, filter: TechniqueStatusFilter = self.statusFilter): boolean {
  if (filter === 'all') { return true; }
  const mastered = isTechniqueFullyMastered(tech);
  return filter === 'in_progress' ? !mastered : mastered;
}

export function getFilteredEmptyHintImpl(self: TechniquePanel): string {
  if (self.pendingRequestId) { return '正在加载功法...'; }
  if (self.searchQuery) { return `没有找到名称包含"${self.searchQuery}"的功法`; }
  if (self.statusFilter === 'in_progress') { return t('technique.empty.no-in-progress', undefined); }
  if (self.statusFilter === 'completed') { return t('technique.empty.no-completed', undefined); }
  return t('technique.empty.no-filtered', undefined);
}

export function getDisplayTechniquesImpl(self: TechniquePanel): TechniqueState[] {
  if (self.hasActivePagedSnapshot()) {
    return self.pagedSnapshot?.items ?? [];
  }
  return sortTechniquesForPanel(resolvePreviewTechniques(self.lastState.techniques));
}

export function getVisibleTechniquesImpl(self: TechniquePanel, techniques: TechniqueState[]): TechniqueState[] {
  if (self.hasActivePagedSnapshot()) { return techniques; }
  return techniques.filter((tech) => (
    self.matchesCategoryFilter(tech) && self.matchesStatusFilter(tech)
  ));
}

export function getVisiblePendingComprehensionsImpl(
  self: TechniquePanel,
  pendingComprehensions: TechniquePendingListEntry[] = self.getPendingTechniqueListEntries(),
  category: TechniqueCategoryFilter = self.categoryFilter,
  status: TechniqueStatusFilter = self.statusFilter,
): TechniquePendingListEntry[] {
  return pendingComprehensions.filter((pending) => matchesPendingTechniqueFilters(pending, {
    category, status, search: self.searchQuery,
  }));
}

export function getPageStateImpl(self: TechniquePanel, filteredTechniques: TechniqueState[]): {
  totalItems: number; totalPages: number; currentPage: number; startIndex: number; endIndex: number;
} {
  const paged = self.hasActivePagedSnapshot() ? self.pagedSnapshot : null;
  const totalItems = paged?.total ?? filteredTechniques.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / TECHNIQUE_PANEL_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, self.currentPage), totalPages);
  if (currentPage !== self.currentPage) {
    self.currentPage = currentPage;
    if (paged) { self.ensureTechniquePageRequested(true); }
  }
  const startIndex = (currentPage - 1) * TECHNIQUE_PANEL_PAGE_SIZE;
  return { totalItems, totalPages, currentPage, startIndex, endIndex: Math.min(totalItems, startIndex + TECHNIQUE_PANEL_PAGE_SIZE) };
}

export function getPagedTechniquesImpl(self: TechniquePanel, filteredTechniques: TechniqueState[]): TechniqueState[] {
  if (self.hasActivePagedSnapshot()) { return self.pagedSnapshot?.items ?? []; }
  const pageState = self.getPageState(filteredTechniques);
  return filteredTechniques.slice(pageState.startIndex, pageState.endIndex);
}

export function patchPaginationImpl(self: TechniquePanel, filteredTechniques: TechniqueState[]): boolean {
  const pagination = self.pane.querySelector<HTMLElement>('[data-tech-pagination="true"]');
  const status = self.pane.querySelector<HTMLElement>('[data-tech-page-status="true"]');
  const prev = self.pane.querySelector<HTMLButtonElement>('[data-tech-page-action="prev"]');
  const next = self.pane.querySelector<HTMLButtonElement>('[data-tech-page-action="next"]');
  if (!pagination || !status || !prev || !next) { return false; }
  const pageState = self.getPageState(filteredTechniques);
  const shouldShow = pageState.totalItems > TECHNIQUE_PANEL_PAGE_SIZE;
  pagination.hidden = !shouldShow;
  status.textContent = shouldShow
    ? `第 ${formatDisplayInteger(pageState.currentPage)} / ${formatDisplayInteger(pageState.totalPages)} 页 · 共 ${formatDisplayInteger(pageState.totalItems)} 门`
    : '';
  prev.disabled = pageState.currentPage <= 1;
  next.disabled = pageState.currentPage >= pageState.totalPages;
  return true;
}

export function isSameTechniqueIdSequenceImpl(self: TechniquePanel, nextIds: string[]): boolean {
  if (!self.lastVisibleTechniqueIds || self.lastVisibleTechniqueIds.length !== nextIds.length) { return false; }
  return nextIds.every((techId, index) => self.lastVisibleTechniqueIds?.[index] === techId);
}

export function patchFilterTabsImpl(
  self: TechniquePanel,
  techniques: TechniqueState[],
  pendingComprehensions: TechniquePendingListEntry[] = self.getPendingTechniqueListEntries(),
): boolean {
  const pagedTotal = self.hasActivePagedSnapshot() ? self.pagedSnapshot?.total ?? 0 : null;
  const categoryCounts = countTechniqueListCategories(techniques, pendingComprehensions, self.statusFilter, self.searchQuery);
  const visiblePendingCount = self.getVisiblePendingComprehensions(pendingComprehensions).length;
  for (const filter of TECHNIQUE_CATEGORY_FILTERS) {
    const button = self.pane.querySelector<HTMLButtonElement>(`[data-tech-category-filter="${filter.value}"]`);
    const countNode = self.pane.querySelector<HTMLElement>(`[data-tech-category-count="${filter.value}"]`);
    if (!button || !countNode) { return false; }
    const count = pagedTotal === null
      ? categoryCounts[filter.value]
      : filter.value === self.categoryFilter ? pagedTotal + visiblePendingCount : 0;
    button.classList.toggle('active', self.categoryFilter === filter.value);
    countNode.textContent = formatDisplayInteger(count);
  }
  for (const filter of TECHNIQUE_STATUS_FILTERS) {
    const button = self.pane.querySelector<HTMLButtonElement>(`[data-tech-status-filter="${filter.value}"]`);
    const countNode = self.pane.querySelector<HTMLElement>(`[data-tech-status-count="${filter.value}"]`);
    if (!button || !countNode) { return false; }
    const count = pagedTotal === null
      ? buildTechniqueListEntries(techniques, pendingComprehensions, {
        category: self.categoryFilter, status: filter.value, search: self.searchQuery,
      }).length
      : filter.value === self.statusFilter ? pagedTotal + visiblePendingCount : 0;
    button.classList.toggle('active', self.statusFilter === filter.value);
    countNode.textContent = formatDisplayInteger(count);
  }
  return true;
}

export function patchListImpl(self: TechniquePanel): boolean {
  const techniques = self.getDisplayTechniques();
  const pendingComprehensions = self.getPendingTechniqueListEntries();
  const hasPagedListContext = self.hasPagedListContext();
  if (techniques.length === 0 && pendingComprehensions.length === 0 && !hasPagedListContext) { return false; }
  if (!self.patchFilterTabs(techniques, pendingComprehensions)) { return false; }
  const filteredTechniques = self.getVisibleTechniques(techniques);
  if (!self.patchPagination(filteredTechniques)) { return false; }
  const pageTechniques = self.getPagedTechniques(filteredTechniques);
  const visibleEntries = buildTechniqueListEntries(pageTechniques, pendingComprehensions, {
    category: self.categoryFilter, status: self.statusFilter, search: self.searchQuery,
  });
  const visibleTechniqueIds = pageTechniques.map((tech) => tech.techId);
  const listRoot = self.pane.querySelector<HTMLElement>('[data-tech-list="true"]');
  if (!listRoot) { return false; }
  if (visibleEntries.length === 0) {
    const emptyNode = listRoot.querySelector<HTMLElement>('[data-tech-empty="true"]') ?? createEmptyHint('');
    emptyNode.dataset.techEmpty = 'true';
    emptyNode.textContent = self.getFilteredEmptyHint();
    self.syncTechniqueListContent(listRoot, [emptyNode]);
    self.lastVisibleTechniqueIds = [];
    return true;
  }
  const existingCards = new Map<string, HTMLElement>();
  listRoot.querySelectorAll<HTMLElement>('[data-tech-card]').forEach((card) => {
    const techId = card.dataset.techCard;
    if (techId) { existingCards.set(techId, card); }
  });
  const orderedCards: HTMLElement[] = [];
  for (const entry of visibleEntries) {
    if (entry.kind === 'pending') {
      orderedCards.push(self.createPendingTechniqueCardElement(entry.pending));
      continue;
    }
    const card = existingCards.get(entry.technique.techId) ?? self.createTechniqueCardElement(entry.technique);
    existingCards.delete(entry.technique.techId);
    orderedCards.push(card);
  }
  self.syncTechniqueListContent(listRoot, orderedCards);
  const { cultivatingTechId } = self.lastState;
  for (const tech of pageTechniques) {
    let refs = self.cardNodeRefs.get(tech.techId);
    if (!refs) {
      const card = listRoot.querySelector<HTMLElement>(`[data-tech-card="${CSS.escape(tech.techId)}"]`);
      if (card) {
        self.cacheCardNodeRefs(tech.techId, card);
        refs = self.cardNodeRefs.get(tech.techId);
      }
    }
    if (!refs) { return false; }
    const { card, realmLevel: realmLevelNode, realm: realmNode, layer: layerNode,
      progressText: progressTextNode, progressFill: progressFillNode, remain: remainNode,
      cultivateButton, skillToggleButton } = refs;
    const showSkillToggle = shouldShowTechniqueSkillToggle(tech);
    if (showSkillToggle !== Boolean(skillToggleButton)) { return false; }
    const nextSignature = self.buildTechniqueCardPatchSignature(tech);
    if (self.cardPatchSignatures.get(tech.techId) === nextSignature) { continue; }
    const isCultivating = cultivatingTechId === tech.techId;
    const skillsEnabled = showSkillToggle ? areTechniqueSkillsEnabled(tech, self.lastState.previewPlayer) : false;
    const progressRatio = getTechniqueProgressRatio(tech);
    const progressText = formatTechniqueProgressText(tech);
    const remainText = formatTechniqueRemainText(tech);
    const realmLevelLabel = getTechniqueRealmLevelLabel(tech);
    const realmLabel = getTechniqueRealmLabel(getResolvedTechniqueRealm(tech));
    card.classList.toggle('cultivating', isCultivating);
    realmLevelNode.textContent = realmLevelLabel;
    realmNode.textContent = realmLabel;
    layerNode.textContent = formatTechniqueLayerText(tech);
    progressTextNode.textContent = progressText;
    progressFillNode.style.width = `${(progressRatio * 100).toFixed(2)}%`;
    remainNode.textContent = remainText;
    if (showSkillToggle && skillToggleButton) {
      skillToggleButton.textContent = t('technique.card.skills-toggle', { state: skillsEnabled ? t('common.state.on-short', undefined) : t('common.state.off-short', undefined) });
      skillToggleButton.classList.toggle('active', skillsEnabled);
      skillToggleButton.dataset.techSkillsEnabled = skillsEnabled ? '1' : '0';
    }
    cultivateButton.textContent = isCultivating ? t('technique.action.cancel-cultivate', undefined) : t('technique.action.set-cultivate', undefined);
    cultivateButton.classList.toggle('danger', isCultivating);
    cultivateButton.dataset.cultivate = isCultivating ? '' : tech.techId;
    cultivateButton.dataset.cultivateStop = isCultivating ? tech.techId : '';
    self.cardPatchSignatures.set(tech.techId, nextSignature);
  }
  self.lastVisibleTechniqueIds = visibleTechniqueIds;
  return true;
}
