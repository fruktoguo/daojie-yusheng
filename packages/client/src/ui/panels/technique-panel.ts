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
  deriveTechniqueRealm,
  getTechniqueExpLevelAdjustment,
  getTechniqueMaxLevel,
  PlayerState,
  resolveSkillUnlockLevel,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP,
  TECHNIQUE_GRADE_ORDER,
  TechniqueCategory,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
} from '@mud/shared';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel, getTechniqueRealmLabel } from '../../domain-labels';
import { getLocalRealmLevelEntry, resolvePreviewTechnique, resolvePreviewTechniques } from '../../content/local-templates';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { buildSkillTooltipContent } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint } from '../ui-primitives';
import {
  calcTechniqueSpecialStatContribution,
  formatTechniqueBonusSummary,
  formatTechniqueCumulativeBonusSummary,
  formatTechniqueLayerBonusSummary,
} from '../technique-bonus-summary';
import { TechniqueConstellationCanvas, TechniqueConstellationCanvasData, TechniqueConstellationHoverPayload } from './technique-constellation-canvas';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';

/** TechniquePanelState：功法面板当前使用的数据状态。 */
type TechniquePanelState = {
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
};

/** TechniqueCategoryFilter：功法分类筛选条件。 */
type TechniqueCategoryFilter = 'all' | TechniqueCategory;
/** TechniqueStatusFilter：功法圆满进度筛选条件。 */
type TechniqueStatusFilter = 'in_progress' | 'completed' | 'all';

const TECHNIQUE_CATEGORY_FILTERS: Array<{
/**
 * value：值数值。
 */
 value: TechniqueCategoryFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'arts', label: '术法' },
  { value: 'internal', label: '内功' },
  { value: 'divine', label: '神通' },
  { value: 'secret', label: '秘术' },
];

const TECHNIQUE_STATUS_FILTERS: Array<{
/**
 * value：值数值。
 */
 value: TechniqueStatusFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'in_progress', label: '未圆满' },
  { value: 'completed', label: '已圆满' },
  { value: 'all', label: '全部' },
];

/** TECHNIQUE_GRADE_SORT_INDEX：TECHNIQUE GRADE排序索引映射。 */
const TECHNIQUE_GRADE_SORT_INDEX = new Map(
  TECHNIQUE_GRADE_ORDER.map((grade, index) => [grade, index] as const),
);

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** createFragmentFromHtml：从 HTML 文本创建文档片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** subtractAttrMap：处理subtract属性地图。 */
function subtractAttrMap(left: Partial<Attributes>, right: Partial<Attributes>): Partial<Attributes> {
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
function calcTechniqueEffectiveContribution(techniques: TechniqueState[], techId: string): Partial<Attributes> {
  const totalAttrs = calcTechniqueFinalAttrBonus(techniques);
  const totalWithoutCurrent = calcTechniqueFinalAttrBonus(techniques.filter((tech) => tech.techId !== techId));
  return subtractAttrMap(totalAttrs, totalWithoutCurrent);
}

/** formatTechniqueContributionSummary：格式化Technique Contribution摘要。 */
function formatTechniqueContributionSummary(
  totalAttrs: Partial<Attributes>,
  rawAttrs: Partial<Attributes>,
  totalSpecialStats?: ReturnType<typeof calcTechniqueSpecialStatContribution>,
  rawSpecialStats?: ReturnType<typeof calcTechniqueSpecialStatContribution>,
): string {
  return `${formatTechniqueBonusSummary(totalAttrs, totalSpecialStats)}（原始：${formatTechniqueBonusSummary(rawAttrs, rawSpecialStats)}）`;
}

/** resolveTechniqueCategory：解析Technique Category。 */
function resolveTechniqueCategory(tech: TechniqueState): TechniqueCategory {
  return tech.category ?? (tech.skills.length > 0 ? 'arts' : 'internal');
}

/** shouldShowTechniqueSkillToggle：判断功法列表项是否需要显示技能开关。 */
function shouldShowTechniqueSkillToggle(tech: TechniqueState): boolean {
  const category = resolveTechniqueCategory(tech);
  return tech.skills.length > 0 && (category === 'arts' || category === 'divine');
}

/** areTechniqueSkillsEnabled：处理are Technique技能启用。 */
function areTechniqueSkillsEnabled(tech: TechniqueState, previewPlayer?: PlayerState): boolean {
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
function getTechniqueProgressRatio(tech: TechniqueState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (tech.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, tech.exp / tech.expToNext));
}

/** getTechniqueRemainingExp：读取Technique Remaining Exp。 */
function getTechniqueRemainingExp(tech: TechniqueState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (tech.expToNext <= 0) {
    return 0;
  }
  return Math.max(0, tech.expToNext - tech.exp);
}

/** formatTechniqueProgressText：格式化Technique进度文本。 */
function formatTechniqueProgressText(tech: TechniqueState): string {
  return tech.expToNext > 0
    ? `${formatDisplayInteger(tech.exp)}/${formatDisplayInteger(tech.expToNext)}`
    : '已满层';
}

/** formatTechniqueRemainText：格式化Technique Remain文本。 */
function formatTechniqueRemainText(tech: TechniqueState): string {
  return tech.expToNext > 0
    ? `距下一层还需 ${formatDisplayInteger(getTechniqueRemainingExp(tech))} 功法经验`
    : '当前已达圆满层';
}

/** calcTechniqueTotalExp：处理calc Technique总量Exp。 */
function calcTechniqueTotalExp(tech: TechniqueState): number {
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
function getResolvedTechniqueRealm(tech: TechniqueState): TechniqueRealm {
  return deriveTechniqueRealm(tech.level, tech.layers, tech.attrCurves);
}

/** getTechniqueRealmLevelLabel：读取Technique境界等级标签。 */
function getTechniqueRealmLevelLabel(tech: TechniqueState): string {
  const entry = getLocalRealmLevelEntry(tech.realmLv);
  return entry
    ? entry.displayName
    : `Lv.${formatDisplayInteger(tech.realmLv)}`;
}

/** getPlayerRealmLv：读取玩家境界Lv。 */
function getPlayerRealmLv(player?: PlayerState): number | null {
  const realmLv = player?.realm?.realmLv ?? player?.realmLv;
  return Number.isFinite(realmLv) ? Math.max(1, Math.floor(Number(realmLv))) : null;
}

/** getTechniqueGradeSortIndex：读取Technique Grade排序索引。 */
function getTechniqueGradeSortIndex(tech: TechniqueState): number {
  return TECHNIQUE_GRADE_SORT_INDEX.get(tech.grade ?? 'mortal') ?? -1;
}

/** getRealmLevelDisplayName：读取境界等级显示名称。 */
function getRealmLevelDisplayName(realmLv: number): string {
  const entry = getLocalRealmLevelEntry(realmLv);
  return entry?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
}

/** buildTechniqueExpTooltipLines：构建Technique Exp提示Lines。 */
function buildTechniqueExpTooltipLines(tech: TechniqueState, player?: PlayerState): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const stepPercent = Math.round(TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP * 100);
  const lines = [
    '功法经验会按你的境界与功法境界差乘算。',
    `每低一级乘 ${100 - stepPercent}% ，每高一级乘 ${100 + stepPercent}%。`,
    `此功法境界：${getRealmLevelDisplayName(tech.realmLv)}`,
  ];
  const playerRealmLv = getPlayerRealmLv(player);
  if (playerRealmLv === null) {
    return lines;
  }
  const delta = playerRealmLv - tech.realmLv;
  const adjustment = getTechniqueExpLevelAdjustment(playerRealmLv, tech.realmLv);
  lines.push(`你的境界：${getRealmLevelDisplayName(playerRealmLv)}`);
  if (delta === 0) {
    lines.push(`当前与功法同级，功法经验修正为 ${formatDisplayNumber(adjustment * 100)}%。`);
    return lines;
  }
  if (delta > 0) {
    lines.push(`当前高于功法 ${formatDisplayInteger(delta)} 级，功法经验修正为 ${formatDisplayNumber(adjustment * 100)}%。`);
    return lines;
  }
  lines.push(`当前低于功法 ${formatDisplayInteger(-delta)} 级，功法经验修正为 ${formatDisplayNumber(adjustment * 100)}%。`);
  return lines;
}

/** sortTechniquesForPanel：排序Techniques For面板。 */
function sortTechniquesForPanel(techniques: TechniqueState[]): TechniqueState[] {
  return [...techniques].sort((left, right) => {
    const realmDelta = getResolvedTechniqueRealm(right) - getResolvedTechniqueRealm(left);
    if (realmDelta !== 0) {
      return realmDelta;
    }
    const gradeDelta = getTechniqueGradeSortIndex(right) - getTechniqueGradeSortIndex(left);
    if (gradeDelta !== 0) {
      return gradeDelta;
    }
    const realmLevelDelta = right.realmLv - left.realmLv;
    if (realmLevelDelta !== 0) {
      return realmLevelDelta;
    }
    const levelDelta = right.level - left.level;
    if (levelDelta !== 0) {
      return levelDelta;
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

/** findTechniqueRealmStartLevel：查找Technique境界Start等级。 */
function findTechniqueRealmStartLevel(
  realm: TechniqueRealm,
  maxLevel: number,
  layers?: TechniqueLayerDef[],
  attrCurves?: TechniqueState['attrCurves'],
): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (let level = 1; level <= maxLevel; level += 1) {
    if (deriveTechniqueRealm(level, layers, attrCurves) === realm) {
      return level;
    }
  }
  return null;
}

/** buildTechniqueMilestones：构建Technique Milestones。 */
function buildTechniqueMilestones(tech: TechniqueState, maxLevel: number): Map<number, TechniqueRealm> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const milestones = new Map<number, TechniqueRealm>();
  for (const realm of [TechniqueRealm.Minor, TechniqueRealm.Major, TechniqueRealm.Perfection]) {
    const level = findTechniqueRealmStartLevel(realm, maxLevel, tech.layers, tech.attrCurves);
    if (level !== null) {
      milestones.set(level, realm);
    }
  }
  return milestones;
}

/** TechniquePanel：Technique面板实现。 */
export class TechniquePanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'technique-panel';
  /** pane：pane。 */
  private pane = document.getElementById('pane-technique')!;
  /** onCultivate：on Cultivate。 */
  private onCultivate: ((techId: string | null) => void) | null = null;
  /** onToggleTechniqueSkills：on Toggle Technique技能。 */
  private onToggleTechniqueSkills: ((techId: string, enabled: boolean) => void) | null = null;
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip();
  /** constellationCanvas：星图Canvas。 */
  private constellationCanvas: TechniqueConstellationCanvas | null = null;
  /** openTechId：open Tech ID。 */
  private openTechId: string | null = null;
  /** openLayerLevel：open层等级。 */
  private openLayerLevel: number | null = null;
  /** categoryFilter：category筛选。 */
  private categoryFilter: TechniqueCategoryFilter = 'all';
  /** statusFilter：状态筛选。 */
  private statusFilter: TechniqueStatusFilter = 'in_progress';
  /** lastState：last状态。 */
  private lastState: TechniquePanelState = { techniques: [] };
  /** lastVisibleTechniqueIds：last可见Technique ID 列表。 */
  private lastVisibleTechniqueIds: string[] | null = null;  
  /**
 * shellRefs：shellRef相关字段。
 */

  private shellRefs: {  
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
 * list：集合字段。
 */

    list: HTMLDivElement;
  } | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.bindPaneEvents();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.lastVisibleTechniqueIds = null;
    this.shellRefs = null;
    const empty = createEmptyHint('尚未习得功法');
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
    onToggleTechniqueSkills?: (techId: string, enabled: boolean) => void,
  ): void {
    this.onCultivate = onCultivate;
    this.onToggleTechniqueSkills = onToggleTechniqueSkills ?? null;
  }

  /** 更新功法列表与主修状态 */
  update(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
    this.lastState = { techniques, cultivatingTechId, previewPlayer };
    this.renderList();
    this.renderModal();
  }

  /** 仅同步经验、进度条与主修状态，避免高频整块重绘 */
  syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.lastState = { techniques, cultivatingTechId, previewPlayer };
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

  /** renderList：渲染列表。 */
  private renderList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const techniques = this.getDisplayTechniques();
    if (techniques.length === 0) {
      this.clear();
      return;
    }

    this.ensureShell();
    this.patchFilterTabs(techniques);
    this.patchList();
  }

  /** ensureShell：确保Shell。 */
  private ensureShell(): {  
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
 * list：集合字段。
 */
 list: HTMLDivElement } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.shellRefs?.shell.isConnected) {
      return this.shellRefs;
    }

    const shell = document.createElement('div');
    shell.className = 'tech-panel-shell';

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
    body.append(sideTabs, list);
    shell.append(topTabs, body);

    preserveSelection(this.pane, () => {
      this.pane.replaceChildren(shell);
    });
    this.shellRefs = { shell, topTabs, sideTabs, list };
    return this.shellRefs;
  }

  /** renderTechniqueCard：渲染Technique卡片。 */
  private renderTechniqueCard(tech: TechniqueState): string {
    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    const isCultivating = this.lastState.cultivatingTechId === tech.techId;
    const showSkillToggle = shouldShowTechniqueSkillToggle(tech);
    const skillsEnabled = showSkillToggle ? areTechniqueSkillsEnabled(tech, this.lastState.previewPlayer) : false;
    const progressRatio = getTechniqueProgressRatio(tech);
    const progressText = formatTechniqueProgressText(tech);
    const remainText = formatTechniqueRemainText(tech);
    const realmLevelLabel = getTechniqueRealmLevelLabel(tech);
    const realmLabel = getTechniqueRealmLabel(getResolvedTechniqueRealm(tech));
    const categoryLabel = getTechniqueCategoryLabel(resolveTechniqueCategory(tech));
    return `<div class="tech-card ${isCultivating ? 'cultivating' : ''}" data-tech-card="${tech.techId}">
      <button class="tech-card-main" data-tech-open="${tech.techId}" type="button">
        <span class="tech-summary-main">
          <span class="tech-name">${escapeHtml(tech.name)}</span>
          <span class="tech-badge tech-grade">${escapeHtml(getTechniqueGradeLabel(tech.grade))}</span>
          <span class="tech-badge tech-category">${escapeHtml(categoryLabel)}</span>
          <span class="tech-badge tech-realm-level" data-tech-realm-level="${tech.techId}">${escapeHtml(realmLevelLabel)}</span>
          <span class="tech-badge tech-realm" data-tech-realm="${tech.techId}">${escapeHtml(realmLabel)}</span>
          <span class="tech-layer" data-tech-layer="${tech.techId}">第${tech.level}/${maxLevel}层</span>
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
        >技能 ${skillsEnabled ? '开' : '关'}</button>` : ''}
        <button
          class="small-btn ${isCultivating ? 'danger' : ''}"
          data-tech-cultivate-button="${tech.techId}"
          data-cultivate="${isCultivating ? '' : tech.techId}"
          data-cultivate-stop="${isCultivating ? tech.techId : ''}"
          type="button"
        >${isCultivating ? '取消主修' : '设为主修'}</button>
      </div>
    </div>`;
  }

  /** createTechniqueCardElement：创建Technique卡片元素。 */
  private createTechniqueCardElement(tech: TechniqueState): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const template = document.createElement('template');
    template.innerHTML = this.renderTechniqueCard(tech).trim();
    const card = template.content.firstElementChild;
    if (!(card instanceof HTMLElement)) {
      throw new Error('Failed to create technique card element');
    }
    return card;
  }

  /** syncTechniqueListContent：同步Technique列表Content。 */
  private syncTechniqueListContent(listRoot: HTMLElement, orderedNodes: HTMLElement[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allowed = new Set(orderedNodes);
    for (const child of Array.from(listRoot.children)) {
      if (!(child instanceof HTMLElement) || !allowed.has(child)) {
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

  /** matchesCategoryFilter：判断是否Category筛选。 */
  private matchesCategoryFilter(tech: TechniqueState, filter = this.categoryFilter): boolean {
    return filter === 'all' || resolveTechniqueCategory(tech) === filter;
  }

  /** matchesStatusFilter：判断是否状态筛选。 */
  private matchesStatusFilter(tech: TechniqueState, filter = this.statusFilter): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (filter === 'all') {
      return true;
    }
    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    if (filter === 'in_progress') {
      return tech.level < maxLevel;
    }
    return tech.level >= maxLevel;
  }

  /** getFilteredEmptyHint：读取Filtered Empty Hint。 */
  private getFilteredEmptyHint(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.statusFilter === 'in_progress') {
      return '当前没有未圆满的功法';
    }
    if (this.statusFilter === 'completed') {
      return '当前没有已圆满的功法';
    }
    return '当前筛选下没有符合条件的功法';
  }

  /** getDisplayTechniques：读取显示Techniques。 */
  private getDisplayTechniques(): TechniqueState[] {
    return sortTechniquesForPanel(resolvePreviewTechniques(this.lastState.techniques));
  }

  /** getVisibleTechniques：读取可见Techniques。 */
  private getVisibleTechniques(techniques: TechniqueState[]): TechniqueState[] {
    return techniques.filter((tech) => (
      this.matchesCategoryFilter(tech) && this.matchesStatusFilter(tech)
    ));
  }

  /** isSameTechniqueIdSequence：判断是否Same Technique ID Sequence。 */
  private isSameTechniqueIdSequence(nextIds: string[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.lastVisibleTechniqueIds || this.lastVisibleTechniqueIds.length !== nextIds.length) {
      return false;
    }
    return nextIds.every((techId, index) => this.lastVisibleTechniqueIds?.[index] === techId);
  }

  /** patchFilterTabs：处理patch筛选标签页。 */
  private patchFilterTabs(techniques: TechniqueState[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const filter of TECHNIQUE_CATEGORY_FILTERS) {
      const button = this.pane.querySelector<HTMLButtonElement>(`[data-tech-category-filter="${filter.value}"]`);
      const countNode = this.pane.querySelector<HTMLElement>(`[data-tech-category-count="${filter.value}"]`);
      if (!button || !countNode) {
        return false;
      }
      const count = techniques.filter((tech) => (
        this.matchesStatusFilter(tech) && (filter.value === 'all' || resolveTechniqueCategory(tech) === filter.value)
      )).length;
      button.classList.toggle('active', this.categoryFilter === filter.value);
      countNode.textContent = formatDisplayInteger(count);
    }

    for (const filter of TECHNIQUE_STATUS_FILTERS) {
      const button = this.pane.querySelector<HTMLButtonElement>(`[data-tech-status-filter="${filter.value}"]`);
      const countNode = this.pane.querySelector<HTMLElement>(`[data-tech-status-count="${filter.value}"]`);
      if (!button || !countNode) {
        return false;
      }
      const count = techniques.filter((tech) => (
        this.matchesCategoryFilter(tech) && this.matchesStatusFilter(tech, filter.value)
      )).length;
      button.classList.toggle('active', this.statusFilter === filter.value);
      countNode.textContent = formatDisplayInteger(count);
    }

    return true;
  }

  /** renderModal：渲染弹窗。 */
  private renderModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.openTechId) {
      this.closeModal();
      return;
    }
    const tech = this.findPreviewTechnique(this.openTechId);
    if (!tech) {
      this.closeModal();
      return;
    }

    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    const previewTechniques = resolvePreviewTechniques(this.lastState.techniques);
    const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers, tech.attrCurves);
    const effectiveAttrs = calcTechniqueEffectiveContribution(previewTechniques, tech.techId);
    const currentSpecialStats = calcTechniqueSpecialStatContribution(tech.level, tech.layers);
    const skillsByLevel = new Map<number, TechniqueState['skills']>();
    const milestones = buildTechniqueMilestones(tech, maxLevel);
    for (const skill of tech.skills) {
      const unlockLevel = resolveSkillUnlockLevel(skill);
      const current = skillsByLevel.get(unlockLevel) ?? [];
      current.push(skill);
      skillsByLevel.set(unlockLevel, current);
    }

    const layers = tech.layers && tech.layers.length > 0
      ? [...tech.layers].sort((left, right) => left.level - right.level)
      : this.buildFallbackLayers(tech, maxLevel);
    const selectedLevel = this.resolveOpenLayerLevel(layers, tech.level);
    const constellationHtml = this.renderConstellation(tech, layers, tech.level, selectedLevel, skillsByLevel, milestones);
    const focusHtml = this.renderLayerFocus(tech, layers, selectedLevel, skillsByLevel, milestones);
    const constellationSignature = this.buildConstellationStructureSignature(layers, skillsByLevel);
    const totalExp = calcTechniqueTotalExp(tech);
    detailModalHost.open({
      ownerId: TechniquePanel.MODAL_OWNER,
      size: 'wide',
      variantClass: 'detail-modal--technique',
      title: tech.name,
      subtitle: `${getTechniqueRealmLevelLabel(tech)} · ${getTechniqueGradeLabel(tech.grade)} · ${getTechniqueRealmLabel(getResolvedTechniqueRealm(tech))} · 第 ${formatDisplayInteger(tech.level)}/${formatDisplayInteger(maxLevel)} 层`,
      bodyHtml: `
      <div class="tech-modal-stack">
        <section class="tech-modal-summary">
          <div class="tech-modal-stat">
            <span class="tech-modal-label">当前经验</span>
            <span data-tech-modal-current-exp="true" data-tech-exp-tooltip="true">${formatTechniqueProgressText(tech)}</span>
          </div>
          <div class="tech-modal-stat">
            <span class="tech-modal-label">总经验</span>
            <span data-tech-modal-total-exp="true">${formatDisplayInteger(totalExp)}</span>
          </div>
          <div class="tech-modal-stat">
            <span class="tech-modal-label">当前总加成</span>
            <span data-tech-modal-current-attrs="true">${escapeHtml(formatTechniqueContributionSummary(effectiveAttrs, currentAttrs, currentSpecialStats, currentSpecialStats))}</span>
          </div>
        </section>
        <section class="tech-modal-pane tech-modal-pane--constellation">
          <div class="tech-modal-section-title">周天星图</div>
          <div class="tech-modal-pane-body" data-tech-modal-constellation-shell="true" data-tech-modal-constellation-signature="${escapeHtml(constellationSignature)}">${constellationHtml}</div>
        </section>
        <section class="tech-modal-pane tech-modal-pane--focus">
          <div class="tech-modal-section-title">星位注解</div>
          <div class="tech-modal-pane-body" data-tech-modal-focus-shell="true">${focusHtml}</div>
        </section>
      </div>
    `,
      onClose: () => {
        this.openTechId = null;
        this.openLayerLevel = null;
        this.destroyConstellationCanvas();
        this.tooltip.hide(true);
      },
      onAfterRender: (body) => {
        this.mountConstellation(body, tech, layers, selectedLevel, skillsByLevel, milestones);
        this.bindSkillTooltips(body);
        this.bindTechniqueExpTooltip(body);
      },
    });
  }

  /** buildFallbackLayers：构建兜底Layers。 */
  private buildFallbackLayers(tech: TechniqueState, maxLevel: number): TechniqueLayerDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rows: TechniqueLayerDef[] = [];
    for (let level = 1; level <= maxLevel; level += 1) {
      rows.push({
        level,
        expToNext: level >= maxLevel ? 0 : 0,
        attrs: calcTechniqueNextLevelGains(level - 1, tech.layers, tech.attrCurves),
        specialStats: calcTechniqueNextLevelSpecialStatGains(level - 1, tech.layers),
      });
    }
    return rows;
  }

  /** renderSkillOverview：渲染技能Overview。 */
  private renderSkillOverview(tech: TechniqueState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (tech.skills.length === 0) {
      return '<div class="tech-skill-overview-empty">此功法暂无技能。</div>';
    }
    const sortedSkills = [...tech.skills].sort((left, right) => {
      const levelDelta = resolveSkillUnlockLevel(left) - resolveSkillUnlockLevel(right);
      if (levelDelta !== 0) {
        return levelDelta;
      }
      return left.name.localeCompare(right.name, 'zh-CN');
    });
    return `<div class="tech-skill-overview-list">
      ${sortedSkills.map((skill) => {
        const unlockLevel = resolveSkillUnlockLevel(skill);
        const unlocked = tech.level >= unlockLevel;
        return `<div class="tech-skill-overview-item ${unlocked ? 'unlocked' : 'locked'}">
          <div class="tech-skill-overview-head">
            <span class="tech-skill-tag"
              data-skill-tooltip-title="${escapeHtml(skill.name)}"
              data-skill-tooltip-skill-id="${escapeHtml(skill.id)}"
              data-skill-tooltip-unlock-level="${unlockLevel}"
              data-skill-tooltip-rich="1">${escapeHtml(skill.name)}</span>
            <span class="tech-skill-overview-meta">第 ${formatDisplayInteger(unlockLevel)} 层解锁 · ${unlocked ? '已解锁' : '未解锁'}</span>
          </div>
          <div class="tech-skill-overview-desc">${escapeHtml(skill.desc)}</div>
        </div>`;
      }).join('')}
    </div>`;
  }  
  /**
 * renderLayerFocus：执行层Focu相关逻辑。
 * @param tech TechniqueState 参数说明。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param selectedLevel number 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @param milestones Map<number, TechniqueRealm> 参数说明。
 * @returns 返回层Focu。
 */


  private renderLayerFocus(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): string {
    const layer = layers.find((entry) => entry.level === selectedLevel) ?? layers[0];
    const selectedRealm = deriveTechniqueRealm(layer.level, tech.layers, tech.attrCurves);
    const skills = skillsByLevel.get(layer.level) ?? [];
    const skillTags = skills.length > 0
      ? skills.map((skill) => {
        return `<span class="tech-skill-tag"
          data-skill-tooltip-title="${escapeHtml(skill.name)}"
          data-skill-tooltip-skill-id="${escapeHtml(skill.id)}"
          data-skill-tooltip-unlock-level="${resolveSkillUnlockLevel(skill)}"
          data-skill-tooltip-rich="1">${escapeHtml(skill.name)}</span>`;
      }).join('')
      : '<span class="tech-layer-empty">此层未解锁新技能</span>';

    const layerAttrs = formatTechniqueLayerBonusSummary(layer, '本层不增加属性');
    const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers, tech.attrCurves);
    const milestone = milestones.get(layer.level);
    const stateLabel = layer.level < tech.level ? '已贯通' : layer.level === tech.level ? '当前停驻' : '尚未抵达';
    const expText = layer.expToNext > 0 ? `升下一层需 ${formatDisplayInteger(layer.expToNext)} 功法经验` : '此层已是终点';
    const milestoneText = milestone ? `此层踏入${getTechniqueRealmLabel(milestone)}` : `此层属${getTechniqueRealmLabel(selectedRealm)}阶段`;

    return `<section class="tech-focus-card ${layer.level < tech.level ? 'passed' : ''} ${layer.level === tech.level ? 'current' : ''}" data-tech-focus-card="true">
      <div class="tech-focus-head">
        <div>
          <div class="tech-focus-title" data-tech-focus-title="true">第 ${formatDisplayInteger(layer.level)} 层星位</div>
          <div class="tech-focus-subtitle" data-tech-focus-subtitle="true">${escapeHtml(milestoneText)}</div>
        </div>
        <div class="tech-focus-state" data-tech-focus-state="true">${stateLabel}</div>
      </div>
      <div class="tech-focus-grid">
        <div class="tech-focus-stat">
          <span class="tech-modal-label">层位进度</span>
          <span data-tech-focus-exp="true">${expText}</span>
        </div>
        <div class="tech-focus-stat">
          <span class="tech-modal-label">本层原始收益</span>
          <span data-tech-focus-layer-attrs="true">${escapeHtml(layerAttrs)}</span>
        </div>
        <div class="tech-focus-stat">
          <span class="tech-modal-label">至此累计加成</span>
          <span data-tech-focus-total-attrs="true">${escapeHtml(totalAttrs)}</span>
        </div>
      </div>
      <div class="tech-focus-skills">
        <span class="tech-modal-label">技能节点</span>
        <span class="tech-layer-skill-list" data-tech-focus-skills="true">${skillTags}</span>
      </div>
    </section>`;
  }  
  /**
 * renderConstellation：执行Constellation相关逻辑。
 * @param tech TechniqueState 参数说明。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param currentLevel number 参数说明。
 * @param selectedLevel number 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @param milestones Map<number, TechniqueRealm> 参数说明。
 * @returns 返回Constellation。
 */


  private renderConstellation(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    currentLevel: number,
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): string {
    const note = currentLevel < layers.length
      ? `当前停驻第 ${formatDisplayInteger(currentLevel)} 层，周天流转 ${formatDisplayInteger(getTechniqueProgressRatio(tech) * 100)}%，点击任意星位切换下方注解。`
      : `当前已抵达 ${formatDisplayInteger(layers.length)} 层圆满，点击任意星位切换下方注解。`;
    return `<div class="tech-starfield-shell">
      <div class="tech-starfield-canvas-shell" data-tech-constellation-root="true">
        <canvas class="tech-starfield-canvas" data-tech-starfield-canvas="true"></canvas>
        <svg class="tech-starfield-skill-lines" data-tech-starfield-skill-lines="true" aria-hidden="true">
          ${layers.map((layer) => {
            return (skillsByLevel.get(layer.level) ?? []).map((_, skillIndex) => {
              return `<polyline class="tech-starfield-skill-line" data-tech-skill-line-level="${layer.level}" data-tech-skill-line-index="${skillIndex}"></polyline>`;
            }).join('');
          }).join('')}
        </svg>
        <div class="tech-starfield-skill-layer">
          ${layers.map((layer) => {
            return (skillsByLevel.get(layer.level) ?? []).map((skill, skillIndex) => {
              const unlocked = layer.level <= currentLevel;
              return `<button
                class="tech-skill-tag tech-starfield-skill-label ${unlocked ? 'unlocked' : 'locked'}"
                data-tech-skill-anchor-level="${layer.level}"
                data-tech-skill-anchor-index="${skillIndex}"
                data-skill-tooltip-title="${escapeHtml(skill.name)}"
                data-skill-tooltip-skill-id="${escapeHtml(skill.id)}"
                data-skill-tooltip-unlock-level="${resolveSkillUnlockLevel(skill)}"
                data-skill-tooltip-rich="1"
                type="button"
              >${escapeHtml(skill.name)}</button>`;
            }).join('');
          }).join('')}
        </div>
      </div>
      <div class="tech-starfield-note">${escapeHtml(note)}</div>
    </div>`;
  }

  /** resolveOpenLayerLevel：解析Open层等级。 */
  private resolveOpenLayerLevel(layers: TechniqueLayerDef[], fallbackLevel: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (layers.length === 0) {
      return fallbackLevel;
    }
    const levels = new Set(layers.map((entry) => entry.level));
    if (this.openLayerLevel && levels.has(this.openLayerLevel)) {
      return this.openLayerLevel;
    }
    const clamped = Math.min(Math.max(fallbackLevel, layers[0].level), layers[layers.length - 1].level);
    this.openLayerLevel = clamped;
    return clamped;
  }

  /** bindPaneEvents：绑定Pane事件。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const categoryButton = target.closest<HTMLElement>('[data-tech-category-filter]');
      if (categoryButton) {
        const filter = categoryButton.dataset.techCategoryFilter as TechniqueCategoryFilter | undefined;
        if (filter && this.categoryFilter !== filter) {
          this.categoryFilter = filter;
          this.renderList();
        }
        return;
      }

      const statusButton = target.closest<HTMLElement>('[data-tech-status-filter]');
      if (statusButton) {
        const filter = statusButton.dataset.techStatusFilter as TechniqueStatusFilter | undefined;
        if (filter && this.statusFilter !== filter) {
          this.statusFilter = filter;
          this.renderList();
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
        if (cultivateButton.dataset.cultivateStop) {
          this.lastState.cultivatingTechId = undefined;
          if (this.lastState.previewPlayer) this.lastState.previewPlayer.cultivatingTechId = undefined;
          this.onCultivate?.(null);
        } else {
          this.lastState.cultivatingTechId = techId;
          if (this.lastState.previewPlayer) this.lastState.previewPlayer.cultivatingTechId = techId;
          this.onCultivate?.(techId);
        }
        this.renderList();
        this.patchModal();
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
        const targetTechnique = this.lastState.techniques.find((entry) => entry.techId === techId);
        if (targetTechnique) {
          targetTechnique.skillsEnabled = nextEnabled;
        }
        if (targetTechnique && this.lastState.previewPlayer) {
          const unlockedSkillIds = targetTechnique.skills
            .filter((skill) => (targetTechnique.level ?? 1) >= resolveSkillUnlockLevel(skill))
            .map((skill) => skill.id);
          for (const action of this.lastState.previewPlayer.actions ?? []) {
            if (unlockedSkillIds.includes(action.id)) {
              action.skillEnabled = nextEnabled;
            }
          }
        }
        this.onToggleTechniqueSkills?.(techId, nextEnabled);
        this.renderList();
        this.patchModal();
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
      this.openTechId = techId;
      const openedTech = this.findPreviewTechnique(techId);
      this.openLayerLevel = openedTech?.level ?? null;
      this.renderModal();
    });
  }  
  /**
 * mountConstellation：执行mountConstellation相关逻辑。
 * @param modalBody HTMLElement 参数说明。
 * @param tech TechniqueState 参数说明。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param selectedLevel number 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @param milestones Map<number, TechniqueRealm> 参数说明。
 * @returns 无返回值，直接更新mountConstellation相关状态。
 */


  private mountConstellation(
    modalBody: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const root = modalBody.querySelector<HTMLElement>('[data-tech-constellation-root="true"]');
    if (!root) {
      this.destroyConstellationCanvas();
      return;
    }
    const data = this.buildConstellationData(tech, layers, selectedLevel, skillsByLevel, milestones);
    this.destroyConstellationCanvas();
    this.constellationCanvas = new TechniqueConstellationCanvas(root, data, (level) => {
      if (this.openLayerLevel === level) {
        return;
      }
      this.openLayerLevel = level;
      if (!this.patchModal()) {
        this.renderModal();
      }
    }, (payload, clientX, clientY) => {
      this.showConstellationTooltip(payload, clientX, clientY);
    }, (clientX, clientY) => {
      this.tooltip.move(clientX, clientY);
    }, () => {
      this.tooltip.hide();
    });
  }

  /** bindSkillTooltips：绑定技能Tooltips。 */
  private bindSkillTooltips(modalBody: HTMLElement): void {
    const tapMode = prefersPinnedTooltipInteraction();
    modalBody.querySelectorAll<HTMLElement>('[data-skill-tooltip-title]').forEach((node) => {
      if (node.dataset.skillTooltipBound === '1') {
        return;
      }
      node.dataset.skillTooltipBound = '1';
      const title = node.dataset.skillTooltipTitle ?? '';
      const rich = node.dataset.skillTooltipRich === '1';
      const skillId = node.dataset.skillTooltipSkillId ?? '';
      const unlockLevel = Number(node.dataset.skillTooltipUnlockLevel ?? '0') || undefined;
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        const techniques = resolvePreviewTechniques(this.lastState.techniques);
        const technique = techniques.find((entry) => entry.skills.some((skill) => skill.id === skillId));
        const skill = technique?.skills.find((entry) => entry.id === skillId);
        const tooltip = skill ? buildSkillTooltipContent(skill, {
          unlockLevel,
          techLevel: technique?.level,
          player: this.lastState.previewPlayer,
          knownSkills: techniques.flatMap((entry) => entry.skills),
        }) : { lines: [], asideCards: [] };
        this.tooltip.showPinned(node, title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
        event.preventDefault();
        event.stopPropagation();
      }, true);
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        const techniques = resolvePreviewTechniques(this.lastState.techniques);
        const technique = techniques.find((entry) => entry.skills.some((skill) => skill.id === skillId));
        const skill = technique?.skills.find((entry) => entry.id === skillId);
        const tooltip = skill ? buildSkillTooltipContent(skill, {
          unlockLevel,
          techLevel: technique?.level,
          player: this.lastState.previewPlayer,
          knownSkills: techniques.flatMap((entry) => entry.skills),
        }) : { lines: [], asideCards: [] };
        this.tooltip.show(title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
      });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
    });
  }

  /** bindTechniqueExpTooltip：绑定Technique Exp提示。 */
  private bindTechniqueExpTooltip(modalBody: HTMLElement): void {
    const tapMode = prefersPinnedTooltipInteraction();
    modalBody.querySelectorAll<HTMLElement>('[data-tech-exp-tooltip="true"]').forEach((node) => {
      if (node.dataset.techExpTooltipBound === '1') {
        return;
      }
      node.dataset.techExpTooltipBound = '1';
      const showTooltip = (clientX: number, clientY: number, pin = false): void => {
        if (!this.openTechId) {
          return;
        }
        const tech = this.findPreviewTechnique(this.openTechId);
        if (!tech) {
          return;
        }
        const lines = buildTechniqueExpTooltipLines(tech, this.lastState.previewPlayer);
        if (pin) {
          this.tooltip.showPinned(node, '功法经验修正', lines, clientX, clientY);
          return;
        }
        this.tooltip.show('功法经验修正', lines, clientX, clientY);
      };
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        showTooltip(event.clientX, event.clientY, true);
        event.preventDefault();
        event.stopPropagation();
      }, true);
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        showTooltip(event.clientX, event.clientY);
      });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
    });
  }

  /** closeModal：关闭弹窗。 */
  private closeModal(): void {
    this.openTechId = null;
    this.openLayerLevel = null;
    this.destroyConstellationCanvas();
    detailModalHost.close(TechniquePanel.MODAL_OWNER);
    this.tooltip.hide(true);
  }

  /** patchList：处理patch列表。 */
  private patchList(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const techniques = this.getDisplayTechniques();
    if (techniques.length === 0) {
      return false;
    }
    if (!this.patchFilterTabs(techniques)) {
      return false;
    }
    const filteredTechniques = this.getVisibleTechniques(techniques);
    const visibleTechniqueIds = filteredTechniques.map((tech) => tech.techId);
    const listRoot = this.pane.querySelector<HTMLElement>('[data-tech-list="true"]');
    if (!listRoot) {
      return false;
    }
    if (filteredTechniques.length === 0) {
      const emptyNode = listRoot.querySelector<HTMLElement>('[data-tech-empty="true"]') ?? createEmptyHint('');
      emptyNode.dataset.techEmpty = 'true';
      emptyNode.textContent = this.getFilteredEmptyHint();
      this.syncTechniqueListContent(listRoot, [emptyNode]);
      this.lastVisibleTechniqueIds = [];
      return true;
    }

    const existingCards = new Map<string, HTMLElement>();
    listRoot.querySelectorAll<HTMLElement>('[data-tech-card]').forEach((card) => {
      const techId = card.dataset.techCard;
      if (techId) {
        existingCards.set(techId, card);
      }
    });

    const orderedCards: HTMLElement[] = [];
    for (const tech of filteredTechniques) {
      const card = existingCards.get(tech.techId) ?? this.createTechniqueCardElement(tech);
      existingCards.delete(tech.techId);
      orderedCards.push(card);
    }
    this.syncTechniqueListContent(listRoot, orderedCards);

    const { cultivatingTechId } = this.lastState;
    for (const tech of filteredTechniques) {
      const card = listRoot.querySelector<HTMLElement>(`[data-tech-card="${CSS.escape(tech.techId)}"]`);
      const realmLevelNode = listRoot.querySelector<HTMLElement>(`[data-tech-realm-level="${CSS.escape(tech.techId)}"]`);
      const realmNode = listRoot.querySelector<HTMLElement>(`[data-tech-realm="${CSS.escape(tech.techId)}"]`);
      const layerNode = listRoot.querySelector<HTMLElement>(`[data-tech-layer="${CSS.escape(tech.techId)}"]`);
      const progressTextNode = listRoot.querySelector<HTMLElement>(`[data-tech-progress-text="${CSS.escape(tech.techId)}"]`);
      const progressFillNode = listRoot.querySelector<HTMLElement>(`[data-tech-progress-fill="${CSS.escape(tech.techId)}"]`);
      const remainNode = listRoot.querySelector<HTMLElement>(`[data-tech-progress-remain="${CSS.escape(tech.techId)}"]`);
      const cultivateButton = listRoot.querySelector<HTMLButtonElement>(`[data-tech-cultivate-button="${CSS.escape(tech.techId)}"]`);
      const skillToggleButton = listRoot.querySelector<HTMLButtonElement>(`[data-tech-skills-toggle="${CSS.escape(tech.techId)}"]`);
      const showSkillToggle = shouldShowTechniqueSkillToggle(tech);
      if (!card || !realmLevelNode || !realmNode || !layerNode || !progressTextNode || !progressFillNode || !remainNode || !cultivateButton) {
        return false;
      }
      if (showSkillToggle !== Boolean(skillToggleButton)) {
        return false;
      }

      const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
      const isCultivating = cultivatingTechId === tech.techId;
      const skillsEnabled = showSkillToggle ? areTechniqueSkillsEnabled(tech, this.lastState.previewPlayer) : false;
      const progressRatio = getTechniqueProgressRatio(tech);
      const progressText = formatTechniqueProgressText(tech);
      const remainText = formatTechniqueRemainText(tech);
      const realmLevelLabel = getTechniqueRealmLevelLabel(tech);
      const realmLabel = getTechniqueRealmLabel(getResolvedTechniqueRealm(tech));

      card.classList.toggle('cultivating', isCultivating);
      realmLevelNode.textContent = realmLevelLabel;
      realmNode.textContent = realmLabel;
      layerNode.textContent = `第${tech.level}/${maxLevel}层`;
      progressTextNode.textContent = progressText;
      progressFillNode.style.width = `${(progressRatio * 100).toFixed(2)}%`;
      remainNode.textContent = remainText;
      if (showSkillToggle && skillToggleButton) {
        skillToggleButton.textContent = `技能 ${skillsEnabled ? '开' : '关'}`;
        skillToggleButton.classList.toggle('active', skillsEnabled);
        skillToggleButton.dataset.techSkillsEnabled = skillsEnabled ? '1' : '0';
      }
      cultivateButton.textContent = isCultivating ? '取消主修' : '设为主修';
      cultivateButton.classList.toggle('danger', isCultivating);
      cultivateButton.dataset.cultivate = isCultivating ? '' : tech.techId;
      cultivateButton.dataset.cultivateStop = isCultivating ? tech.techId : '';
    }

    this.lastVisibleTechniqueIds = visibleTechniqueIds;
    return true;
  }

  /** patchModal：处理patch弹窗。 */
  private patchModal(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.openTechId) {
      return true;
    }
    if (!detailModalHost.isOpenFor(TechniquePanel.MODAL_OWNER)) {
      return false;
    }
    const tech = this.findPreviewTechnique(this.openTechId);
    if (!tech) {
      return false;
    }

    const expNode = document.querySelector<HTMLElement>('[data-tech-modal-current-exp="true"]');
    const totalExpNode = document.querySelector<HTMLElement>('[data-tech-modal-total-exp="true"]');
    const currentAttrsNode = document.querySelector<HTMLElement>('[data-tech-modal-current-attrs="true"]');
    const focusShell = document.querySelector<HTMLElement>('[data-tech-modal-focus-shell="true"]');
    const constellationShell = document.querySelector<HTMLElement>('[data-tech-modal-constellation-shell="true"]');
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (!expNode || !totalExpNode || !currentAttrsNode || !focusShell || !constellationShell || !titleNode || !subtitleNode) {
      return false;
    }
    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    const previewTechniques = resolvePreviewTechniques(this.lastState.techniques);
    const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers, tech.attrCurves);
    const effectiveAttrs = calcTechniqueEffectiveContribution(previewTechniques, tech.techId);
    const currentSpecialStats = calcTechniqueSpecialStatContribution(tech.level, tech.layers);
    const skillsByLevel = new Map<number, TechniqueState['skills']>();
    for (const skill of tech.skills) {
      const unlockLevel = resolveSkillUnlockLevel(skill);
      const current = skillsByLevel.get(unlockLevel) ?? [];
      current.push(skill);
      skillsByLevel.set(unlockLevel, current);
    }
    const layers = tech.layers && tech.layers.length > 0
      ? [...tech.layers].sort((left, right) => left.level - right.level)
      : this.buildFallbackLayers(tech, maxLevel);
    const milestones = buildTechniqueMilestones(tech, maxLevel);
    const selectedLevel = this.resolveOpenLayerLevel(layers, tech.level);

    titleNode.textContent = tech.name;
    subtitleNode.textContent = `${getTechniqueRealmLevelLabel(tech)} · ${getTechniqueGradeLabel(tech.grade)} · ${getTechniqueRealmLabel(getResolvedTechniqueRealm(tech))} · 第 ${formatDisplayInteger(tech.level)}/${formatDisplayInteger(maxLevel)} 层`;
    expNode.textContent = formatTechniqueProgressText(tech);
    totalExpNode.textContent = formatDisplayInteger(calcTechniqueTotalExp(tech));
    currentAttrsNode.textContent = formatTechniqueContributionSummary(effectiveAttrs, currentAttrs, currentSpecialStats, currentSpecialStats);

    if (!focusShell.querySelector('[data-tech-focus-card="true"]')) {
      focusShell.replaceChildren(createFragmentFromHtml(this.renderLayerFocus(tech, layers, selectedLevel, skillsByLevel, milestones)));
      this.bindSkillTooltips(focusShell);
    } else {
      this.patchLayerFocus(focusShell, tech, layers, selectedLevel, skillsByLevel, milestones);
    }

    const constellationSignature = this.buildConstellationStructureSignature(layers, skillsByLevel);
    if (constellationShell.dataset.techModalConstellationSignature !== constellationSignature) {
      constellationShell.dataset.techModalConstellationSignature = constellationSignature;
      constellationShell.replaceChildren(createFragmentFromHtml(this.renderConstellation(tech, layers, tech.level, selectedLevel, skillsByLevel, milestones)));
      this.mountConstellation(constellationShell, tech, layers, selectedLevel, skillsByLevel, milestones);
      this.bindSkillTooltips(constellationShell);
    }

    const noteNode = document.querySelector<HTMLElement>('.tech-starfield-note');
    if (noteNode) {
      noteNode.textContent = tech.level < layers.length
        ? `当前停驻第 ${formatDisplayInteger(tech.level)} 层，周天流转 ${formatDisplayInteger(getTechniqueProgressRatio(tech) * 100)}%，点击任意星位切换下方注解。`
        : `当前已抵达 ${formatDisplayInteger(layers.length)} 层圆满，点击任意星位切换下方注解。`;
    }
    const constellationData = this.buildConstellationData(tech, layers, selectedLevel, skillsByLevel, milestones);
    const constellationRoot = constellationShell.querySelector<HTMLElement>('[data-tech-constellation-root="true"]');
    if (!constellationRoot) {
      return false;
    }
    if (this.constellationCanvas) {
      this.constellationCanvas.update(constellationData);
    } else {
      this.constellationCanvas = new TechniqueConstellationCanvas(constellationRoot, constellationData, (level) => {
        if (this.openLayerLevel === level) {
          return;
        }
        this.openLayerLevel = level;
        if (!this.patchModal()) {
          this.renderModal();
        }
      }, (payload, clientX, clientY) => {
        this.showConstellationTooltip(payload, clientX, clientY);
      }, (clientX, clientY) => {
        this.tooltip.move(clientX, clientY);
      }, () => {
        this.tooltip.hide();
      });
    }
    return true;
  }  
  /**
 * buildConstellationData：构建并返回目标对象。
 * @param tech TechniqueState 参数说明。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param selectedLevel number 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @param milestones Map<number, TechniqueRealm> 参数说明。
 * @returns 返回ConstellationData。
 */


  private buildConstellationData(
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): TechniqueConstellationCanvasData {
    return {
      techniqueName: tech.name,
      maxLevels: layers.length,
      currentLevel: tech.level,
      expPercent: Math.round(getTechniqueProgressRatio(tech) * 100),
      selectedLevel,
      nodes: layers.map((layer) => {
        const layerRealm = deriveTechniqueRealm(layer.level, tech.layers, tech.attrCurves);
        const layerAttrs = formatTechniqueLayerBonusSummary(layer, '本层不增加属性');
        const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers, tech.attrCurves);
        const progressText = layer.level < tech.level
          ? '进度：已贯通'
          : layer.level === tech.level
            ? `进度：当前停驻，周天流转 ${formatDisplayInteger(getTechniqueProgressRatio(tech) * 100)}%`
            : layer.level === tech.level + 1 && tech.level < layers.length && tech.expToNext > 0
              ? `进度：正在突破，承接 ${formatDisplayInteger(getTechniqueProgressRatio(tech) * 100)}%`
              : '进度：境界未至';
        const milestone = milestones.get(layer.level);
        return {
          level: layer.level,
          milestone: milestone ? getTechniqueRealmLabel(milestone) as '小成' | '大成' | '圆满' : undefined,
          hoverTitle: `第 ${formatDisplayInteger(layer.level)} 层星位`,
          hoverLines: [
            progressText,
            `收益：${layerAttrs}`,
            `累计：${totalAttrs}`,
            `境界：${getTechniqueRealmLabel(layerRealm)}`,
          ],
        };
      }),
    };
  }

  /** destroyConstellationCanvas：处理destroy星图Canvas。 */
  private destroyConstellationCanvas(): void {
    this.constellationCanvas?.destroy();
    this.constellationCanvas = null;
  }

  /** showConstellationTooltip：处理显示星图提示。 */
  private showConstellationTooltip(payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number): void {
    this.tooltip.show(payload.title, payload.lines, clientX, clientY);
  }  
  /**
 * buildConstellationStructureSignature：构建并返回目标对象。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @returns 返回ConstellationStructureSignature。
 */


  private buildConstellationStructureSignature(
    layers: TechniqueLayerDef[],
    skillsByLevel: Map<number, TechniqueState['skills']>,
  ): string {
    return layers.map((layer) => {
      const skills = skillsByLevel.get(layer.level) ?? [];
      return `${layer.level}:${skills.map((skill) => skill.id).join(',')}`;
    }).join('|');
  }  
  /**
 * patchLayerFocus：执行patch层Focu相关逻辑。
 * @param focusShell HTMLElement 参数说明。
 * @param tech TechniqueState 参数说明。
 * @param layers TechniqueLayerDef[] 参数说明。
 * @param selectedLevel number 参数说明。
 * @param skillsByLevel Map<number, TechniqueState['skills']> 参数说明。
 * @param milestones Map<number, TechniqueRealm> 参数说明。
 * @returns 无返回值，直接更新patch层Focu相关状态。
 */


  private patchLayerFocus(
    focusShell: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const layer = layers.find((entry) => entry.level === selectedLevel) ?? layers[0];
    const card = focusShell.querySelector<HTMLElement>('[data-tech-focus-card="true"]');
    const title = focusShell.querySelector<HTMLElement>('[data-tech-focus-title="true"]');
    const subtitle = focusShell.querySelector<HTMLElement>('[data-tech-focus-subtitle="true"]');
    const state = focusShell.querySelector<HTMLElement>('[data-tech-focus-state="true"]');
    const exp = focusShell.querySelector<HTMLElement>('[data-tech-focus-exp="true"]');
    const layerAttrsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-layer-attrs="true"]');
    const totalAttrsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-total-attrs="true"]');
    const skillsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-skills="true"]');
    if (!layer || !card || !title || !subtitle || !state || !exp || !layerAttrsNode || !totalAttrsNode || !skillsNode) {
      return;
    }
    const selectedRealm = deriveTechniqueRealm(layer.level, tech.layers, tech.attrCurves);
    const milestone = milestones.get(layer.level);
    const skills = skillsByLevel.get(layer.level) ?? [];
    const stateLabel = layer.level < tech.level ? '已贯通' : layer.level === tech.level ? '当前停驻' : '尚未抵达';
    const expText = layer.expToNext > 0 ? `升下一层需 ${formatDisplayInteger(layer.expToNext)} 功法经验` : '此层已是终点';
    const milestoneText = milestone ? `此层踏入${getTechniqueRealmLabel(milestone)}` : `此层属${getTechniqueRealmLabel(selectedRealm)}阶段`;
    const layerAttrs = formatTechniqueLayerBonusSummary(layer, '本层不增加属性');
    const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers, tech.attrCurves);

    card.classList.toggle('passed', layer.level < tech.level);
    card.classList.toggle('current', layer.level === tech.level);
    title.textContent = `第 ${formatDisplayInteger(layer.level)} 层星位`;
    subtitle.textContent = milestoneText;
    state.textContent = stateLabel;
    exp.textContent = expText;
    layerAttrsNode.textContent = layerAttrs;
    totalAttrsNode.textContent = totalAttrs;
    if (skills.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'tech-layer-empty';
      empty.textContent = '此层未解锁新技能';
      skillsNode.replaceChildren(empty);
      return;
    }
    skillsNode.replaceChildren(
      ...skills.map((skill) => {
        const node = document.createElement('span');
        node.className = 'tech-skill-tag';
        node.dataset.skillTooltipTitle = skill.name;
        node.dataset.skillTooltipSkillId = skill.id;
        node.dataset.skillTooltipUnlockLevel = String(resolveSkillUnlockLevel(skill));
        node.dataset.skillTooltipRich = '1';
        node.textContent = skill.name;
        return node;
      }),
    );
    this.bindSkillTooltips(focusShell);
  }

  /** findPreviewTechnique：查找Preview Technique。 */
  private findPreviewTechnique(techId: string): TechniqueState | undefined {
    const technique = this.lastState.techniques.find((entry) => entry.techId === techId);
    return technique ? resolvePreviewTechnique(technique) : undefined;
  }
}
