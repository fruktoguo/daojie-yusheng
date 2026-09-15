/**
 * 本文件是客户端 DOM UI 的 technique panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 功法面板
 * 展示已习得功法列表、逐层详情弹窗、主修切换与技能提示
 */
import {
  Attributes,
  calcTechniqueAttrValues,
  calcTechniqueFinalAttrBonus,
  calcTechniqueNextLevelGains,
  calcTechniqueNextLevelSpecialStatGains,
  calcTechniqueQiProjectionModifiers,
  compareTechniqueDisplayOrder,
  deriveTechniqueRealm,
  getTechniqueExpLevelAdjustment,
  getTechniquePassiveSkillStrengthMultiplier,
  getTechniqueMaxLevel,
  getSkillPassiveEffects,
  isTechniqueFullyMastered,
  isTechniqueLearnLimitReached,
  isPassiveTechnique,
  isCreatedTechniqueId,
  isTechniqueAggregationId,
  PlayerState,
  resolveSkillUnlockLevel,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP,
  TechniqueCategory,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
  type C2S_RequestTechniquePage,
  type S2C_TechniquePage,
} from '@mud/shared';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel, getTechniqueRealmLabel } from '../../domain-labels';
import {
  fetchTechniqueTemplateById,
  getLocalRealmLevelEntry,
  resolveClientTechniqueName,
  resolveCreatedTechniqueStrengthPercent,
  resolvePreviewTechnique,
  resolvePreviewTechniques,
} from '../../content/local-templates';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { confirmModalHost } from '../confirm-modal-host';
import { detailModalHost } from '../detail-modal-host';
import { buildSkillTooltipContent, summarizeResidentSkillEffects } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint } from '../ui-primitives';
import {
  calcTechniqueSpecialStatContribution,
  formatTechniqueBonusSummaryHtml,
  formatTechniqueCumulativeBonusSummary,
  formatTechniqueLayerBonusSummary,
  formatTechniqueQiProjectionSummaryHtml,
} from '../technique-bonus-summary';
import { TechniqueConstellationCanvas, TechniqueConstellationCanvasData, TechniqueConstellationHoverPayload } from './technique-constellation-canvas';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
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
  mountReactTechniquePanel,
  setReactTechniquePanelCallbacks,
  shouldUseReactTechniquePanel,
  syncReactTechniquePanelState,
  unmountReactTechniquePanel,
} from '../../react-ui/panels/technique/mount-technique-panel';
import {
  renderListImpl,
  ensureShellImpl,
  renderTechniqueCardImpl,
  createTechniqueCardElementImpl,
  createPendingTechniqueCardElementImpl,
  cacheCardNodeRefsImpl,
  buildTechniqueCardPatchSignatureImpl,
  syncTechniqueListContentImpl,
  matchesCategoryFilterImpl,
  matchesStatusFilterImpl,
  getFilteredEmptyHintImpl,
  getDisplayTechniquesImpl,
  getVisibleTechniquesImpl,
  getVisiblePendingComprehensionsImpl,
  getPageStateImpl,
  getPagedTechniquesImpl,
  patchPaginationImpl,
  isSameTechniqueIdSequenceImpl,
  patchFilterTabsImpl,
  patchListImpl,
} from './technique-panel.cards';
import {
  renderModalImpl,
  buildFallbackLayersImpl,
  renderSkillOverviewImpl,
  renderPassiveTechniqueOverviewImpl,
  renderLayerFocusImpl,
  renderConstellationImpl,
  resolveOpenLayerLevelImpl,
  mountConstellationImpl,
  bindSkillTooltipsImpl,
  bindTechniqueExpTooltipImpl,
  bindForgetButtonImpl,
  closeModalImpl,
  patchModalImpl,
  buildConstellationDataImpl,
  destroyConstellationCanvasImpl,
  showConstellationTooltipImpl,
  buildConstellationStructureSignatureImpl,
  patchLayerFocusImpl,
} from './technique-panel.detail';

/** TechniquePanelState：功法面板当前使用的数据状态。 */
export type TechniquePanelState = {
/**
 * cultivatingTechId：cultivatingTechID标识。
 */

  cultivatingTechId?: string;  
  /**
 * previewPlayer：preview玩家引用。
 */

  previewPlayer?: PlayerState;  
  /**
 * techniques：功法相关字段。
 */

  techniques: TechniqueState[];
  pendingComprehensions?: PlayerState['pendingTechniqueComprehensions'];
};

/** TechniqueCardNodeRefs：功法卡片子节点缓存引用，避免每 tick querySelector。 */
export interface TechniqueCardNodeRefs {
  card: HTMLElement;
  realmLevel: HTMLElement;
  realm: HTMLElement;
  layer: HTMLElement;
  progressText: HTMLElement;
  progressFill: HTMLElement;
  remain: HTMLElement;
  cultivateButton: HTMLButtonElement;
  skillToggleButton: HTMLButtonElement | null;
}

/** TechniquePagedSnapshot：服务端分页缓存。 */
export interface TechniquePagedSnapshot {
  requestId?: string;
  category: TechniqueCategoryFilter;
  status: TechniqueStatusFilter;
  search: string;
  offset: number;
  limit: number;
  total: number;
  totalItems: number;
  revision: number;
  items: TechniqueState[];
}

export const TECHNIQUE_CATEGORY_FILTERS: Array<{
/**
 * value：值数值。
 */
 value: TechniqueCategoryFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'all', label: t('technique.filter.category.all', undefined) },
  { value: 'arts', label: t('technique.filter.category.arts', undefined) },
  { value: 'internal', label: t('technique.filter.category.internal', undefined) },
  { value: 'divine', label: t('technique.filter.category.divine', undefined) },
  { value: 'secret', label: t('technique.filter.category.secret', undefined) },
];

export const TECHNIQUE_STATUS_FILTERS: Array<{
/**
 * value：值数值。
 */
 value: TechniqueStatusFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'in_progress', label: t('technique.filter.status.in-progress', undefined) },
  { value: 'completed', label: t('technique.filter.status.completed', undefined) },
  { value: 'all', label: t('technique.filter.status.all', undefined) },
];

export const TECHNIQUE_PANEL_PAGE_SIZE = 12;
export const TECHNIQUE_SEARCH_DEBOUNCE_MS = 180;

/** escapeHtml：转义 HTML 文本中的危险字符。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** subtractAttrMap：处理subtract属性地图。 */
export function subtractAttrMap(left: Partial<Attributes>, right: Partial<Attributes>): Partial<Attributes> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const result: Partial<Attributes> = {};
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const delta = Math.max(0, (left[key] ?? 0) - (right[key] ?? 0));
    if (delta > 0) {
      result[key] = delta;
    }
  }
  return result;
}

/** calcTechniqueEffectiveContribution：处理calc Technique Effective Contribution。 */
export function calcTechniqueEffectiveContribution(techniques: TechniqueState[], techId: string): Partial<Attributes> {
  const totalAttrs = calcTechniqueFinalAttrBonus(techniques);
  const totalWithoutCurrent = calcTechniqueFinalAttrBonus(techniques.filter((tech) => tech.techId !== techId));
  return subtractAttrMap(totalAttrs, totalWithoutCurrent);
}

/** formatTechniqueContributionSummary：格式化Technique Contribution摘要。 */
export function formatTechniqueContributionSummary(
  totalAttrs: Partial<Attributes>,
  rawAttrs: Partial<Attributes>,
  totalSpecialStats?: ReturnType<typeof calcTechniqueSpecialStatContribution>,
  rawSpecialStats?: ReturnType<typeof calcTechniqueSpecialStatContribution>,
  qiProjection?: ReturnType<typeof calcTechniqueQiProjectionModifiers>,
): string {
  const attrSummary = `${formatTechniqueBonusSummaryHtml(totalAttrs, totalSpecialStats)}<span class="tech-bonus-raw">（原始：${formatTechniqueBonusSummaryHtml(rawAttrs, rawSpecialStats)}）</span>`;
  const qiProjectionSummary = formatTechniqueQiProjectionSummaryHtml(qiProjection);
  return qiProjectionSummary ? `${attrSummary}${qiProjectionSummary}` : attrSummary;
}

/** resolveTechniqueCategory：解析Technique Category。 */
export function resolveTechniqueCategory(tech: TechniqueState): TechniqueCategory {
  return tech.category ?? (tech.skills.length > 0 ? 'arts' : 'internal');
}

/** shouldShowTechniqueSkillToggle：判断功法列表项是否需要显示技能开关。 */
export function shouldShowTechniqueSkillToggle(tech: TechniqueState): boolean {
  const category = resolveTechniqueCategory(tech);
  return tech.skills.length > 0 && (category === 'arts' || category === 'divine');
}

/** areTechniqueSkillsEnabled：处理are Technique技能启用。 */
export function areTechniqueSkillsEnabled(tech: TechniqueState, previewPlayer?: PlayerState): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof tech.skillsEnabled === 'boolean') {
    return tech.skillsEnabled;
  }
  const unlockedSkillIds = tech.skills
    .filter((skill) => (tech.level ?? 1) >= resolveSkillUnlockLevel(skill))
    .map((skill) => skill.id);
  if (unlockedSkillIds.length === 0 || !previewPlayer) {
    return true;
  }
  const actions = previewPlayer.actions ?? [];
  let hasResolvedSkill = false;
  for (const skillId of unlockedSkillIds) {
    const action = actions.find((entry) => entry.id === skillId);
    if (!action) {
      continue;
    }
    /** hasResolvedSkill：has Resolved技能标记。 */
    hasResolvedSkill = true;
    if (action.skillEnabled !== false) {
      return true;
    }
  }
  return !hasResolvedSkill ? true : false;
}

/** getTechniqueProgressRatio：读取Technique进度Ratio。 */
export function getTechniqueProgressRatio(tech: TechniqueState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (tech.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, tech.exp / tech.expToNext));
}

export function formatTechniqueLayerText(tech: TechniqueState): string {
  return isPassiveTechnique(tech)
    ? `第 ${formatDisplayInteger(tech.level)} 层 / 无限`
    : t('technique.card.layer', {
      level: tech.level,
      maxLevel: getTechniqueMaxLevel(tech.layers, tech.level),
    });
}

export function isTechniqueCappedBeforeMastery(tech: TechniqueState): boolean {
  return !isTechniqueFullyMastered(tech)
    && (isTechniqueLearnLimitReached(tech) || tech.expToNext <= 0);
}

/** getTechniqueRemainingExp：读取Technique Remaining Exp。 */
export function getTechniqueRemainingExp(tech: TechniqueState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (tech.expToNext <= 0) {
    return 0;
  }
  return Math.max(0, tech.expToNext - tech.exp);
}

/** formatTechniqueProgressText：格式化Technique进度文本。 */
export function formatTechniqueProgressText(tech: TechniqueState): string {
  if (isTechniqueCappedBeforeMastery(tech)) {
    return t('technique.progress.fragment-limit', undefined);
  }
  return tech.expToNext > 0
    ? `${formatDisplayInteger(tech.exp)}/${formatDisplayInteger(tech.expToNext)}`
    : t('technique.progress.max-level', undefined);
}

/** formatTechniqueRemainText：格式化Technique Remain文本。 */
export function formatTechniqueRemainText(tech: TechniqueState): string {
  if (isTechniqueCappedBeforeMastery(tech)) {
    return t('technique.progress.fragment-limit-note', undefined);
  }
  return tech.expToNext > 0
    ? t('technique.progress.remain-exp', { exp: formatDisplayInteger(getTechniqueRemainingExp(tech)) })
    : t('technique.progress.completed', undefined);
}

/** calcTechniqueTotalExp：处理calc Technique总量Exp。 */
export function calcTechniqueTotalExp(tech: TechniqueState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!tech.layers || tech.layers.length === 0) {
    return tech.exp;
  }
  let totalExp = tech.exp;
  for (const layer of tech.layers) {
    if (layer.level >= tech.level) {
      break;
    }
    totalExp += Math.max(0, layer.expToNext);
  }
  return totalExp;
}

/** getResolvedTechniqueRealm：读取Resolved Technique境界。 */
export function getResolvedTechniqueRealm(tech: TechniqueState): TechniqueRealm {
  return isPassiveTechnique(tech) ? TechniqueRealm.Entry : deriveTechniqueRealm(tech.level, tech.layers);
}

/** getTechniqueRealmLevelLabel：读取Technique境界等级标签。 */
export function getTechniqueRealmLevelLabel(tech: TechniqueState): string {
  const entry = getLocalRealmLevelEntry(tech.realmLv);
  return entry
    ? entry.displayName
    : `Lv.${formatDisplayInteger(tech.realmLv)}`;
}

/** getPlayerRealmLv：读取玩家境界Lv。 */
export function getPlayerRealmLv(player?: PlayerState): number | null {
  const realmLv = player?.realm?.realmLv ?? player?.realmLv;
  return Number.isFinite(realmLv) ? Math.max(1, Math.floor(Number(realmLv))) : null;
}

/** getRealmLevelDisplayName：读取境界等级显示名称。 */
export function getRealmLevelDisplayName(realmLv: number): string {
  const entry = getLocalRealmLevelEntry(realmLv);
  return entry?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
}

/** buildTechniqueExpTooltipLines：构建Technique Exp提示Lines。 */
export function buildTechniqueExpTooltipLines(tech: TechniqueState, player?: PlayerState): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const stepPercent = Math.round(TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP * 100);
  const lines = [
    t('technique.exp-tooltip.rule', undefined),
    t('technique.exp-tooltip.step', { percent: stepPercent }),
    t('technique.exp-tooltip.tech-realm', { realm: getRealmLevelDisplayName(tech.realmLv) }),
  ];
  const playerRealmLv = getPlayerRealmLv(player);
  if (playerRealmLv === null) {
    return lines;
  }
  const delta = playerRealmLv - tech.realmLv;
  const adjustment = getTechniqueExpLevelAdjustment(playerRealmLv, tech.realmLv);
  lines.push(t('technique.exp-tooltip.player-realm', { realm: getRealmLevelDisplayName(playerRealmLv) }));
  if (delta === 0) {
    lines.push(t('technique.exp-tooltip.same-level', { percent: formatDisplayNumber(adjustment * 100) }));
    return lines;
  }
  if (delta > 0) {
    lines.push(t('technique.exp-tooltip.above-level', { delta: formatDisplayInteger(delta), percent: formatDisplayNumber(adjustment * 100) }));
    return lines;
  }
  lines.push(t('technique.exp-tooltip.below-level', { delta: formatDisplayInteger(-delta), percent: formatDisplayNumber(adjustment * 100) }));
  return lines;
}

/** sortTechniquesForPanel：排序Techniques For面板。 */
export function sortTechniquesForPanel(techniques: TechniqueState[]): TechniqueState[] {
  return [...techniques].sort(compareTechniqueDisplayOrder);
}

/** findTechniqueRealmStartLevel：查找Technique境界Start等级。 */
export function findTechniqueRealmStartLevel(
  realm: TechniqueRealm,
  maxLevel: number,
  layers?: TechniqueLayerDef[],
): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (let level = 1; level <= maxLevel; level += 1) {
    if (deriveTechniqueRealm(level, layers) === realm) {
      return level;
    }
  }
  return null;
}

/** buildTechniqueMilestones：构建Technique Milestones。 */
export function buildTechniqueMilestones(tech: TechniqueState, maxLevel: number): Map<number, TechniqueRealm> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const milestones = new Map<number, TechniqueRealm>();
  for (const realm of [TechniqueRealm.Minor, TechniqueRealm.Major, TechniqueRealm.Perfection]) {
    const level = findTechniqueRealmStartLevel(realm, maxLevel, tech.layers);
    if (level !== null) {
      milestones.set(level, realm);
    }
  }
  return milestones;
}

/** TechniquePanel：Technique面板实现。 */
export class TechniquePanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  static readonly MODAL_OWNER = 'technique-panel';
  /** pane：pane。 */
  pane = document.getElementById('pane-technique')!;
  /** onCultivate：on Cultivate。 */
  onCultivate: ((techId: string | null) => void) | null = null;
  /** onToggleTechniqueSkills：on Toggle Technique技能。 */
  onToggleTechniqueSkills: ((techId: string, enabled: boolean) => void) | null = null;
  onForgetTechnique: ((techId: string) => void) | null = null;
  onCancelTechniqueTransmission: ((techId: string) => void) | null = null;
  onDiscardTechniqueComprehension: ((techId: string) => void) | null = null;
  onRequestTechniquePage: ((payload: C2S_RequestTechniquePage) => void) | null = null;
  /** tooltip：提示。 */
  tooltip = new FloatingTooltip();
  /** constellationCanvas：星图Canvas。 */
  constellationCanvas: TechniqueConstellationCanvas | null = null;
  /** openTechId：open Tech ID。 */
  openTechId: string | null = null;
  /** openLayerLevel：open层等级。 */
  openLayerLevel: number | null = null;
  /** categoryFilter：category筛选。 */
  categoryFilter: TechniqueCategoryFilter = 'all';
  /** statusFilter：状态筛选。 */
  statusFilter: TechniqueStatusFilter = 'in_progress';
  /** searchQuery：功法名称搜索词。 */
  searchQuery = '';
  /** currentPage：当前分页页码，从 1 开始。 */
  currentPage = 1;
  pageRequestSeq = 0;
  pendingRequestId: string | null = null;
  searchDebounceTimer: number | null = null;
  pagedSnapshot: TechniquePagedSnapshot | null = null;
  paneVisibilityObserver: MutationObserver | null = null;
  /** lastState：last状态。 */
  lastState: TechniquePanelState = { techniques: [] };
  /** lastVisibleTechniqueIds：last可见Technique ID 列表。 */
  lastVisibleTechniqueIds: string[] | null = null;
  renderPendingWhileHidden = false;
  /** cardNodeRefs：缓存每张功法卡片的子节点引用，避免每 tick 重复 querySelector。 */
  cardNodeRefs = new Map<string, TechniqueCardNodeRefs>();  
  /** cardPatchSignatures：记录卡片已写入的显示签名，避免未变化功法重复写 DOM。 */
  cardPatchSignatures = new Map<string, string>();
  /**
 * shellRefs：shellRef相关字段。
 */

  shellRefs: {  
  /**
 * shell：shell相关字段。
 */

    shell: HTMLDivElement;    
    /**
 * topTabs：topTab相关字段。
 */

    topTabs: HTMLDivElement;    
    /**
 * sideTabs：sideTab相关字段。
 */

    sideTabs: HTMLDivElement;    
    /**
 * pagination：分页控件。
 */

    pagination: HTMLDivElement;
    /**
 * list：集合字段。
 */

    list: HTMLDivElement;
  } | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    setReactTechniquePanelCallbacks({
      onCultivate: (techId) => this.handleCultivate(techId),
      onToggleSkills: (techId, enabled) => this.handleToggleTechniqueSkills(techId, enabled),
      onOpenDetail: (techId) => this.openTechniqueDetail(techId),
      onCancelTransmission: (techId) => this.handleCancelTechniqueTransmission(techId),
      onDiscardPending: (techId) => this.handleDiscardTechniqueComprehension(techId),
    });
    this.bindPaneEvents();
    this.bindPaneVisibilityObserver();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.renderPendingWhileHidden = false;
    this.clearSearchDebounceTimer();
    this.pendingRequestId = null;
    this.pagedSnapshot = null;
    this.lastState = { techniques: [] };
    this.lastVisibleTechniqueIds = null;
    this.cardNodeRefs.clear();
    this.cardPatchSignatures.clear();
    this.shellRefs = null;
    if (this.useReactPanel()) {
      syncReactTechniquePanelState({ techniques: [] });
      mountReactTechniquePanel();
      this.tooltip.hide(true);
      this.closeModal();
      return;
    }
    const empty = createEmptyHint(t('technique.empty.none-learned', undefined));
    empty.dataset.techEmpty = 'true';
    this.pane.replaceChildren(empty);
    this.tooltip.hide(true);
    this.closeModal();
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onCultivate (techId: string | null) => void 参数说明。
 * @param onToggleTechniqueSkills (techId: string, enabled: boolean) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onCultivate: (techId: string | null) => void,
    onForgetTechnique?: (techId: string) => void,
    onToggleTechniqueSkills?: (techId: string, enabled: boolean) => void,
    onCancelTechniqueTransmission?: (techId: string) => void,
    onDiscardTechniqueComprehension?: (techId: string) => void,
    onRequestTechniquePage?: (payload: C2S_RequestTechniquePage) => void,
  ): void {
    this.onCultivate = onCultivate;
    this.onForgetTechnique = onForgetTechnique ?? null;
    this.onToggleTechniqueSkills = onToggleTechniqueSkills ?? null;
    this.onCancelTechniqueTransmission = onCancelTechniqueTransmission ?? null;
    this.onDiscardTechniqueComprehension = onDiscardTechniqueComprehension ?? null;
    this.onRequestTechniquePage = onRequestTechniquePage ?? null;
    this.ensureTechniquePageRequested(true);
  }

  /** 更新功法列表与主修状态 */
  update(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
    this.lastState = { techniques, cultivatingTechId, previewPlayer, pendingComprehensions: previewPlayer?.pendingTechniqueComprehensions };
    this.mergePagedSnapshotFromRuntime(techniques);
    this.ensureTechniquePageRequested();
    if (this.deferRenderIfHidden()) {
      return;
    }
    this.syncReactState();
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      this.renderModal();
      return;
    }
    this.renderList();
    this.renderModal();
  }

  /** 仅同步经验、进度条与主修状态，避免高频整块重绘 */
  syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.lastState = { techniques, cultivatingTechId, previewPlayer, pendingComprehensions: previewPlayer?.pendingTechniqueComprehensions };
    this.mergePagedSnapshotFromRuntime(techniques);
    this.ensureTechniquePageRequested();
    if (this.deferRenderIfHidden()) {
      return;
    }
    this.syncReactState();
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      if (!this.patchModal()) {
        this.renderModal();
      }
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.update(player.techniques, player.cultivatingTechId, player);
  }

  handleTechniquePage(page: S2C_TechniquePage): void {
    const category = this.normalizeTechniqueCategoryFilter(page.category);
    const status = this.normalizeTechniqueStatusFilter(page.status);
    const search = this.normalizeTechniqueSearch(page.search);
    const offset = this.normalizeTechniquePageOffset(page.offset);
    const limit = this.normalizeTechniquePageLimit(page.limit);
    const expectedOffset = (this.currentPage - 1) * TECHNIQUE_PANEL_PAGE_SIZE;
    if (
      page.requestId !== this.pendingRequestId
      || category !== this.categoryFilter
      || status !== this.statusFilter
      || search !== this.searchQuery
      || offset !== expectedOffset
    ) {
      return;
    }
    this.pendingRequestId = null;
    const items = sortTechniquesForPanel(resolvePreviewTechniques(page.items as TechniqueState[]));
    this.pagedSnapshot = {
      requestId: page.requestId,
      category,
      status,
      search,
      offset,
      limit,
      total: Math.max(0, Math.trunc(Number(page.total) || 0)),
      totalItems: Math.max(0, Math.trunc(Number(page.totalItems) || 0)),
      revision: Math.max(1, Math.trunc(Number(page.revision) || 1)),
      items,
    };
    this.lastVisibleTechniqueIds = null;
    this.syncReactState();
    if (this.deferRenderIfHidden()) {
      return;
    }
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      this.patchModal();
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
  }

  mergePagedSnapshotFromRuntime(techniques: TechniqueState[]): void {
    if (!this.pagedSnapshot) {
      return;
    }
    const runtimeById = new Map(resolvePreviewTechniques(techniques).map((tech) => [tech.techId, tech]));
    let changed = false;
    const items = this.pagedSnapshot.items.map((item) => {
      const next = runtimeById.get(item.techId);
      if (!next) {
        return item;
      }
      changed = true;
      return next;
    });
    if (changed) {
      this.pagedSnapshot = { ...this.pagedSnapshot, items };
    }
  }

  clearSearchDebounceTimer(): void {
    if (this.searchDebounceTimer !== null) {
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  normalizeTechniqueCategoryFilter(value: unknown): TechniqueCategoryFilter {
    return TECHNIQUE_CATEGORY_FILTERS.some((filter) => filter.value === value)
      ? value as TechniqueCategoryFilter
      : 'all';
  }

  normalizeTechniqueStatusFilter(value: unknown): TechniqueStatusFilter {
    return TECHNIQUE_STATUS_FILTERS.some((filter) => filter.value === value)
      ? value as TechniqueStatusFilter
      : 'in_progress';
  }

  normalizeTechniqueSearch(value: unknown): string {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, 64).toLowerCase()
      : '';
  }

  normalizeTechniquePageOffset(value: unknown): number {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  normalizeTechniquePageLimit(value: unknown): number {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.min(24, parsed)) : TECHNIQUE_PANEL_PAGE_SIZE;
  }

  getRequestedTechniqueOffset(): number {
    return (Math.max(1, this.currentPage) - 1) * TECHNIQUE_PANEL_PAGE_SIZE;
  }

  hasActivePagedSnapshot(): boolean {
    const snapshot = this.pagedSnapshot;
    return Boolean(
      snapshot
      && snapshot.category === this.categoryFilter
      && snapshot.status === this.statusFilter
      && snapshot.search === this.searchQuery
      && snapshot.offset === this.getRequestedTechniqueOffset()
      && snapshot.limit === TECHNIQUE_PANEL_PAGE_SIZE,
    );
  }

  hasPagedListContext(): boolean {
    return Boolean(
      this.onRequestTechniquePage
      && (this.pendingRequestId || this.pagedSnapshot || this.searchQuery || this.categoryFilter !== 'all' || this.statusFilter !== 'in_progress'),
    );
  }

  ensureTechniquePageRequested(force = false): void {
    if (!this.onRequestTechniquePage) {
      return;
    }
    if (!force && (this.pendingRequestId || this.hasActivePagedSnapshot())) {
      return;
    }
    this.requestTechniquePage();
  }

  requestTechniquePage(): void {
    if (!this.onRequestTechniquePage) {
      return;
    }
    this.clearSearchDebounceTimer();
    const requestId = `tech:${Date.now()}:${++this.pageRequestSeq}`;
    this.pendingRequestId = requestId;
    this.onRequestTechniquePage({
      category: this.categoryFilter,
      status: this.statusFilter,
      search: this.searchQuery,
      offset: this.getRequestedTechniqueOffset(),
      limit: TECHNIQUE_PANEL_PAGE_SIZE,
      requestId,
      knownRevision: this.pagedSnapshot?.revision,
    });
  }

  scheduleTechniqueSearchRequest(): void {
    this.clearSearchDebounceTimer();
    this.searchDebounceTimer = window.setTimeout(() => {
      this.searchDebounceTimer = null;
      this.requestTechniquePage();
    }, TECHNIQUE_SEARCH_DEBOUNCE_MS);
  }

  resetTechniquePageAndRequest(debounce = false): void {
    this.currentPage = 1;
    this.pendingRequestId = null;
    this.pagedSnapshot = null;
    this.lastVisibleTechniqueIds = null;
    if (debounce) {
      this.scheduleTechniqueSearchRequest();
    } else {
      this.requestTechniquePage();
    }
  }

  useReactPanel(): boolean {
    return shouldUseReactTechniquePanel();
  }

  isPaneVisible(): boolean {
    return this.pane.isConnected && this.pane.classList.contains('active');
  }

  deferRenderIfHidden(): boolean {
    if (this.isPaneVisible() || detailModalHost.isOpenFor(TechniquePanel.MODAL_OWNER)) {
      return false;
    }
    this.renderPendingWhileHidden = true;
    return true;
  }

  bindPaneVisibilityObserver(): void {
    this.paneVisibilityObserver = new MutationObserver(() => {
      if (this.renderPendingWhileHidden && this.isPaneVisible()) {
        this.flushHiddenRender();
      }
    });
    this.paneVisibilityObserver.observe(this.pane, { attributes: true, attributeFilter: ['class'] });
  }

  flushHiddenRender(): void {
    if (!this.renderPendingWhileHidden) {
      return;
    }
    this.renderPendingWhileHidden = false;
    this.syncReactState();
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      if (!this.patchModal()) {
        this.renderModal();
      }
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  syncReactState(): void {
    syncReactTechniquePanelState({
      techniques: resolvePreviewTechniques(this.lastState.techniques),
      pendingComprehensions: this.getPendingTechniqueListEntries(),
      cultivatingTechId: this.lastState.cultivatingTechId,
      previewPlayer: this.lastState.previewPlayer,
    });
  }

  getPendingTechniqueListEntries(): TechniquePendingListEntry[] {
    return this.lastState.pendingComprehensions
      ?? this.lastState.previewPlayer?.pendingTechniqueComprehensions
      ?? [];
  }

  handleCultivate(techId: string | null): void {
    this.lastState.cultivatingTechId = techId ?? undefined;
    if (this.lastState.previewPlayer) {
      this.lastState.previewPlayer.cultivatingTechId = techId ?? undefined;
    }
    this.onCultivate?.(techId);
    this.syncReactState();
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      this.patchModal();
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    this.patchModal();
  }

  handleToggleTechniqueSkills(techId: string, enabled: boolean): void {
    const targetTechnique = this.lastState.techniques.find((entry) => entry.techId === techId);
    if (targetTechnique) {
      targetTechnique.skillsEnabled = enabled;
    }
    if (targetTechnique && this.lastState.previewPlayer) {
      const unlockedSkillIds = targetTechnique.skills
        .filter((skill) => (targetTechnique.level ?? 1) >= resolveSkillUnlockLevel(skill))
        .map((skill) => skill.id);
      for (const action of this.lastState.previewPlayer.actions ?? []) {
        if (unlockedSkillIds.includes(action.id)) {
          action.skillEnabled = enabled;
        }
      }
    }
    this.onToggleTechniqueSkills?.(techId, enabled);
    this.syncReactState();
    if (this.useReactPanel()) {
      mountReactTechniquePanel();
      this.patchModal();
      return;
    }
    this.mergePagedSnapshotFromRuntime(this.lastState.techniques);
    if (!this.patchList()) {
      this.renderList();
    }
    this.patchModal();
  }

  handleCancelTechniqueTransmission(techId: string): void {
    if (!techId) {
      return;
    }
    this.onCancelTechniqueTransmission?.(techId);
  }

  handleDiscardTechniqueComprehension(techId: string): void {
    const pending = (this.lastState.pendingComprehensions ?? this.lastState.previewPlayer?.pendingTechniqueComprehensions ?? [])
      .find((entry) => entry.techId === techId);
    if (!pending || pending.activeTransferJob) {
      return;
    }
    const techniqueName = resolveClientTechniqueName(pending.techId, pending.name);
    confirmModalHost.open({
      ownerId: `technique-comprehension-discard:${pending.techId}`,
      title: t('technique.comprehension.discard.confirm.title', { name: techniqueName }),
      subtitle: t('technique.comprehension.discard.confirm.subtitle'),
      bodyHtml: `<p>${escapeHtml(t('technique.comprehension.discard.confirm.body', { name: techniqueName }))}</p>`,
      confirmLabel: t('technique.comprehension.discard.confirm.ok'),
      cancelLabel: t('technique.comprehension.discard.confirm.cancel'),
      confirmButtonClass: 'danger',
      onConfirm: () => this.onDiscardTechniqueComprehension?.(pending.techId),
    });
  }

  handleForgetTechnique(tech: TechniqueState): void {
    const ownerId = `technique-forget:${tech.techId}`;
    confirmModalHost.open({
      ownerId,
      title: t('technique.forget.confirm.title', { name: tech.name }),
      subtitle: t('technique.forget.confirm.subtitle', undefined),
      bodyHtml: `
        <p>${escapeHtml(t('technique.forget.confirm.body-1', { name: tech.name }))}</p>
        <p>${escapeHtml(t('technique.forget.confirm.body-2', undefined))}</p>
      `,
      confirmLabel: t('technique.forget.confirm.ok', undefined),
      cancelLabel: t('technique.forget.confirm.cancel', undefined),
      confirmButtonClass: 'danger',
      onConfirm: () => {
        this.onForgetTechnique?.(tech.techId);
        this.closeModal();
      },
    });
  }

  openTechniqueDetail(techId: string): void {
    this.openTechId = techId;
    const openedTech = this.findPreviewTechnique(techId);
    this.openLayerLevel = openedTech?.level ?? null;
    this.renderModal();
    if (
      isCreatedTechniqueId(techId)
      && !isTechniqueAggregationId(techId)
      && resolveCreatedTechniqueStrengthPercent(techId) === null
    ) {
      void fetchTechniqueTemplateById(techId).then(() => {
        if (this.openTechId === techId) {
          this.renderModal();
        }
      });
    }
  }

  renderList(): void {
    return renderListImpl(this);
  }

  ensureShell(): NonNullable<typeof this.shellRefs> {
    return ensureShellImpl(this);
  }

  renderTechniqueCard(tech: TechniqueState): string {
    return renderTechniqueCardImpl(this, tech);
  }

  createTechniqueCardElement(tech: TechniqueState): HTMLElement {
    return createTechniqueCardElementImpl(this, tech);
  }
  createPendingTechniqueCardElement(pending: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number]): HTMLElement {
    return createPendingTechniqueCardElementImpl(this, pending);
  }

  cacheCardNodeRefs(techId: string, card: HTMLElement): void {
    return cacheCardNodeRefsImpl(this, techId, card);
  }
  buildTechniqueCardPatchSignature(tech: TechniqueState): string {
    return buildTechniqueCardPatchSignatureImpl(this, tech);
  }

  syncTechniqueListContent(listRoot: HTMLElement, orderedNodes: HTMLElement[]): void {
    return syncTechniqueListContentImpl(this, listRoot, orderedNodes);
  }

  matchesCategoryFilter(tech: TechniqueState, filter = this.categoryFilter): boolean {
    return matchesCategoryFilterImpl(this, tech, filter);
  }

  matchesStatusFilter(tech: TechniqueState, filter = this.statusFilter): boolean {
    return matchesStatusFilterImpl(this, tech, filter);
  }

  getFilteredEmptyHint(): string {
    return getFilteredEmptyHintImpl(this);
  }

  getDisplayTechniques(): TechniqueState[] {
    return getDisplayTechniquesImpl(this);
  }

  getVisibleTechniques(techniques: TechniqueState[]): TechniqueState[] {
    return getVisibleTechniquesImpl(this, techniques);
  }
  getVisiblePendingComprehensions(
    pendingComprehensions = this.getPendingTechniqueListEntries(),
    category = this.categoryFilter,
    status = this.statusFilter,
  ): TechniquePendingListEntry[] {
    return getVisiblePendingComprehensionsImpl(this, pendingComprehensions, category, status);
  }
  getPageState(filteredTechniques: TechniqueState[]): {
    totalItems: number; totalPages: number; currentPage: number; startIndex: number; endIndex: number;
  } {
    return getPageStateImpl(this, filteredTechniques);
  }
  getPagedTechniques(filteredTechniques: TechniqueState[]): TechniqueState[] {
    return getPagedTechniquesImpl(this, filteredTechniques);
  }
  patchPagination(filteredTechniques: TechniqueState[]): boolean {
    return patchPaginationImpl(this, filteredTechniques);
  }

  isSameTechniqueIdSequence(nextIds: string[]): boolean {
    return isSameTechniqueIdSequenceImpl(this, nextIds);
  }

  patchFilterTabs(
    techniques: TechniqueState[],
    pendingComprehensions = this.getPendingTechniqueListEntries(),
  ): boolean {
    return patchFilterTabsImpl(this, techniques, pendingComprehensions);
  }

  renderModal(): void {
    return renderModalImpl(this);
  }

  buildFallbackLayers(tech: TechniqueState, maxLevel: number): TechniqueLayerDef[] {
    return buildFallbackLayersImpl(this, tech, maxLevel);
  }

  renderSkillOverview(tech: TechniqueState): string {
    return renderSkillOverviewImpl(this, tech);
  }  

  renderPassiveTechniqueOverview(tech: TechniqueState): string {
    return renderPassiveTechniqueOverviewImpl(this, tech);
  }
  renderLayerFocus(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): string {
    return renderLayerFocusImpl(this, tech, layers, selectedLevel, skillsByLevel, milestones);
  }  
  renderConstellation(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    currentLevel: number,
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): string {
    return renderConstellationImpl(this, tech, layers, currentLevel, selectedLevel, skillsByLevel, milestones);
  }

  resolveOpenLayerLevel(layers: TechniqueLayerDef[], fallbackLevel: number): number {
    return resolveOpenLayerLevelImpl(this, layers, fallbackLevel);
  }

  /** bindPaneEvents：绑定Pane事件。 */
  bindPaneEvents(): void {
    this.pane.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.techSearch !== 'true') {
        return;
      }
      const nextSearch = this.normalizeTechniqueSearch(target.value);
      if (nextSearch === this.searchQuery) {
        return;
      }
      this.searchQuery = nextSearch;
      this.resetTechniquePageAndRequest(true);
      if (!this.patchList()) {
        this.renderList();
      }
    });

    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const categoryButton = target.closest<HTMLElement>('[data-tech-category-filter]');
      if (categoryButton) {
        const filter = this.normalizeTechniqueCategoryFilter(categoryButton.dataset.techCategoryFilter);
        if (this.categoryFilter !== filter) {
          this.categoryFilter = filter;
          this.resetTechniquePageAndRequest();
          if (!this.patchList()) {
            this.renderList();
          }
        }
        return;
      }

      const statusButton = target.closest<HTMLElement>('[data-tech-status-filter]');
      if (statusButton) {
        const filter = this.normalizeTechniqueStatusFilter(statusButton.dataset.techStatusFilter);
        if (this.statusFilter !== filter) {
          this.statusFilter = filter;
          this.resetTechniquePageAndRequest();
          if (!this.patchList()) {
            this.renderList();
          }
        }
        return;
      }

      const pageButton = target.closest<HTMLElement>('[data-tech-page-action]');
      if (pageButton) {
        event.stopPropagation();
        const action = pageButton.dataset.techPageAction;
        const pageState = this.getPageState(this.getVisibleTechniques(this.getDisplayTechniques()));
        const nextPage = action === 'prev'
          ? Math.max(1, this.currentPage - 1)
          : action === 'next'
            ? Math.min(pageState.totalPages, this.currentPage + 1)
            : this.currentPage;
        if (nextPage !== this.currentPage) {
          this.currentPage = nextPage;
          this.pendingRequestId = null;
          this.pagedSnapshot = null;
          this.lastVisibleTechniqueIds = null;
          this.requestTechniquePage();
          if (!this.patchList()) {
            this.renderList();
          }
        }
        return;
      }

      const cultivateButton = target.closest<HTMLElement>('[data-tech-cultivate-button]');
      if (cultivateButton) {
        event.stopPropagation();
        const techId = cultivateButton.dataset.cultivateStop || cultivateButton.dataset.cultivate;
        if (!techId) {
          return;
        }
        this.handleCultivate(cultivateButton.dataset.cultivateStop ? null : techId);
        return;
      }

      const genericCultivateButton = target.closest<HTMLElement>('[data-cultivate], [data-cultivate-stop]');
      if (genericCultivateButton) {
        event.stopPropagation();
        const techId = genericCultivateButton.dataset.cultivateStop || genericCultivateButton.dataset.cultivate;
        if (!techId) {
          return;
        }
        this.handleCultivate(genericCultivateButton.dataset.cultivateStop ? null : techId);
        return;
      }

      const cancelTransmissionButton = target.closest<HTMLElement>('[data-tech-transmission-cancel]');
      if (cancelTransmissionButton) {
        event.stopPropagation();
        const techId = cancelTransmissionButton.dataset.techTransmissionCancel;
        if (techId) {
          this.handleCancelTechniqueTransmission(techId);
        }
        return;
      }

      const discardComprehensionButton = target.closest<HTMLElement>('[data-tech-comprehension-discard]');
      if (discardComprehensionButton) {
        event.stopPropagation();
        const techId = discardComprehensionButton.dataset.techComprehensionDiscard;
        if (techId) {
          this.handleDiscardTechniqueComprehension(techId);
        }
        return;
      }

      const skillToggleButton = target.closest<HTMLElement>('[data-tech-skills-toggle]');
      if (skillToggleButton) {
        event.stopPropagation();
        const techId = skillToggleButton.dataset.techSkillsToggle;
        if (!techId) {
          return;
        }
        const nextEnabled = skillToggleButton.dataset.techSkillsEnabled !== '1';
        this.handleToggleTechniqueSkills(techId, nextEnabled);
        return;
      }

      const openButton = target.closest<HTMLElement>('[data-tech-open]');
      if (!openButton) {
        return;
      }
      const techId = openButton.dataset.techOpen;
      if (!techId) {
        return;
      }
      this.openTechniqueDetail(techId);
    });
  }  
  mountConstellation(
    modalBody: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
    return mountConstellationImpl(this, modalBody, tech, layers, selectedLevel, skillsByLevel, milestones);
  }

  bindSkillTooltips(modalBody: HTMLElement, signal: AbortSignal): void {
    return bindSkillTooltipsImpl(this, modalBody, signal);
  }

  bindTechniqueExpTooltip(modalBody: HTMLElement, signal: AbortSignal): void {
    return bindTechniqueExpTooltipImpl(this, modalBody, signal);
  }
  bindForgetButton(modalBody: HTMLElement, signal: AbortSignal): void {
    return bindForgetButtonImpl(this, modalBody, signal);
  }

  closeModal(): void {
    return closeModalImpl(this);
  }

  patchList(): boolean {
    return patchListImpl(this);
  }

  patchModal(): boolean {
    return patchModalImpl(this);
  }  
  buildConstellationData(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): TechniqueConstellationCanvasData {
    return buildConstellationDataImpl(this, tech, layers, selectedLevel, skillsByLevel, milestones);
  }

  destroyConstellationCanvas(): void {
    return destroyConstellationCanvasImpl(this);
  }

  showConstellationTooltip(payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number): void {
    return showConstellationTooltipImpl(this, payload, clientX, clientY);
  }  
  buildConstellationStructureSignature(
    layers: TechniqueLayerDef[],
    skillsByLevel: Map<number, TechniqueState['skills']>,
  ): string {
    return buildConstellationStructureSignatureImpl(this, layers, skillsByLevel);
  }  
  patchLayerFocus(
    focusShell: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
    return patchLayerFocusImpl(this, focusShell, tech, layers, selectedLevel, skillsByLevel, milestones);
  }

  /** findPreviewTechnique：查找Preview Technique。 */
  findPreviewTechnique(techId: string): TechniqueState | undefined {
    const pagedTechnique = this.pagedSnapshot?.items.find((entry) => entry.techId === techId);
    if (pagedTechnique) {
      return resolvePreviewTechnique(pagedTechnique);
    }
    const technique = this.lastState.techniques.find((entry) => entry.techId === techId);
    return technique ? resolvePreviewTechnique(technique) : undefined;
  }
}
