/**
 * 功法面板
 * 展示已习得功法列表、逐层详情弹窗、主修切换与技能提示
 */

import {
  Attributes,
  calcTechniqueAttrValues,
  calcTechniqueFinalAttrBonus,
  calcTechniqueNextLevelGains,
  deriveTechniqueRealm,
  getTechniqueExpLevelAdjustment,
  getTechniqueMaxLevel,
  PlayerState,
  resolveSkillUnlockLevel,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP,
  TechniqueCategory,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
} from '@mud/shared-next';
import { ATTR_KEY_LABELS, getTechniqueCategoryLabel, getTechniqueGradeLabel, getTechniqueRealmLabel } from '../../domain-labels';
import { getLocalRealmLevelEntry, resolvePreviewTechnique, resolvePreviewTechniques } from '../../content/local-templates';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { buildSkillTooltipContent } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { TechniqueConstellationCanvas, TechniqueConstellationCanvasData, TechniqueConstellationHoverPayload } from './technique-constellation-canvas';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';

type TechniquePanelState = {
  cultivatingTechId?: string;
  previewPlayer?: PlayerState;
  techniques: TechniqueState[];
};

type TechniqueCategoryFilter = 'all' | TechniqueCategory;
type TechniqueStatusFilter = 'in_progress' | 'completed' | 'all';

const TECHNIQUE_CATEGORY_FILTERS: Array<{ value: TechniqueCategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'arts', label: '术法' },
  { value: 'internal', label: '内功' },
  { value: 'divine', label: '神通' },
  { value: 'secret', label: '秘术' },
];

const TECHNIQUE_STATUS_FILTERS: Array<{ value: TechniqueStatusFilter; label: string }> = [
  { value: 'in_progress', label: '未圆满' },
  { value: 'completed', label: '已圆满' },
  { value: 'all', label: '全部' },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatAttrMap(attrs: Partial<Attributes>, fallback = '无属性提升'): string {
  const entries = TECHNIQUE_ATTR_KEYS
    .map((key) => [key, attrs[key] ?? 0] as const)
    .filter(([, value]) => value > 0);
  if (entries.length === 0) {
    return fallback;
  }
  return entries.map(([key, value]) => `${ATTR_KEY_LABELS[key]}+${formatDisplayNumber(value)}`).join(' / ');
}

function subtractAttrMap(left: Partial<Attributes>, right: Partial<Attributes>): Partial<Attributes> {
  const result: Partial<Attributes> = {};
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const delta = Math.max(0, (left[key] ?? 0) - (right[key] ?? 0));
    if (delta > 0) {
      result[key] = delta;
    }
  }
  return result;
}

function calcTechniqueEffectiveContribution(techniques: TechniqueState[], techId: string): Partial<Attributes> {
  const totalAttrs = calcTechniqueFinalAttrBonus(techniques);
  const totalWithoutCurrent = calcTechniqueFinalAttrBonus(techniques.filter((tech) => tech.techId !== techId));
  return subtractAttrMap(totalAttrs, totalWithoutCurrent);
}

function formatTechniqueContributionSummary(totalAttrs: Partial<Attributes>, rawAttrs: Partial<Attributes>): string {
  return `${formatAttrMap(totalAttrs)}（原始：${formatAttrMap(rawAttrs)}）`;
}

function resolveTechniqueCategory(tech: TechniqueState): TechniqueCategory {
  return tech.category ?? (tech.skills.length > 0 ? 'arts' : 'internal');
}

function getTechniqueProgressRatio(tech: TechniqueState): number {
  if (tech.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, tech.exp / tech.expToNext));
}

function getTechniqueRemainingExp(tech: TechniqueState): number {
  if (tech.expToNext <= 0) {
    return 0;
  }
  return Math.max(0, tech.expToNext - tech.exp);
}

function formatTechniqueProgressText(tech: TechniqueState): string {
  return tech.expToNext > 0
    ? `${formatDisplayInteger(tech.exp)}/${formatDisplayInteger(tech.expToNext)}`
    : '已满层';
}

function formatTechniqueRemainText(tech: TechniqueState): string {
  return tech.expToNext > 0
    ? `距下一层还需 ${formatDisplayInteger(getTechniqueRemainingExp(tech))} 功法经验`
    : '当前已达圆满层';
}

function calcTechniqueTotalExp(tech: TechniqueState): number {
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

function getResolvedTechniqueRealm(tech: TechniqueState): TechniqueRealm {
  return deriveTechniqueRealm(tech.level, tech.layers, tech.attrCurves);
}

function getTechniqueRealmLevelLabel(tech: TechniqueState): string {
  const entry = getLocalRealmLevelEntry(tech.realmLv);
  return entry
    ? entry.displayName
    : `Lv.${formatDisplayInteger(tech.realmLv)}`;
}

function getPlayerRealmLv(player?: PlayerState): number | null {
  const realmLv = player?.realm?.realmLv ?? player?.realmLv;
  return Number.isFinite(realmLv) ? Math.max(1, Math.floor(Number(realmLv))) : null;
}

function getRealmLevelDisplayName(realmLv: number): string {
  const entry = getLocalRealmLevelEntry(realmLv);
  return entry?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
}

function buildTechniqueExpTooltipLines(tech: TechniqueState, player?: PlayerState): string[] {
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

function findTechniqueRealmStartLevel(
  realm: TechniqueRealm,
  maxLevel: number,
  layers?: TechniqueLayerDef[],
  compatCurves?: TechniqueState['attrCurves'],
): number | null {
  for (let level = 1; level <= maxLevel; level += 1) {
    if (deriveTechniqueRealm(level, layers, compatCurves) === realm) {
      return level;
    }
  }
  return null;
}

function buildTechniqueMilestones(tech: TechniqueState, maxLevel: number): Map<number, TechniqueRealm> {
  const milestones = new Map<number, TechniqueRealm>();
  for (const realm of [TechniqueRealm.Minor, TechniqueRealm.Major, TechniqueRealm.Perfection]) {
    const level = findTechniqueRealmStartLevel(realm, maxLevel, tech.layers, tech.attrCurves);
    if (level !== null) {
      milestones.set(level, realm);
    }
  }
  return milestones;
}

export class TechniquePanel {
  private static readonly MODAL_OWNER = 'technique-panel';
  private pane = document.getElementById('pane-technique')!;
  private onCultivate: ((techId: string | null) => void) | null = null;
  private tooltip = new FloatingTooltip();
  private constellationCanvas: TechniqueConstellationCanvas | null = null;
  private openTechId: string | null = null;
  private openLayerLevel: number | null = null;
  private categoryFilter: TechniqueCategoryFilter = 'all';
  private statusFilter: TechniqueStatusFilter = 'in_progress';
  private lastState: TechniquePanelState = { techniques: [] };

  constructor() {
    this.bindPaneEvents();
  }

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">尚未习得功法</div>';
    this.tooltip.hide(true);
    this.closeModal();
  }

  setCallbacks(onCultivate: (techId: string | null) => void): void {
    this.onCultivate = onCultivate;
  }

  /** 更新功法列表与主修状态 */
  update(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
    this.lastState = { techniques, cultivatingTechId, previewPlayer };
    this.renderList();
    this.renderModal();
  }

  /** 仅同步经验、进度条与主修状态，避免高频整块重绘 */
  syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, previewPlayer?: PlayerState): void {
    this.lastState = { techniques, cultivatingTechId, previewPlayer };
    this.renderList();
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  initFromPlayer(player: PlayerState): void {
    this.update(player.techniques, player.cultivatingTechId, player);
  }

  private renderList(): void {
    const techniques = resolvePreviewTechniques(this.lastState.techniques);
    if (techniques.length === 0) {
      this.clear();
      return;
    }

    const filteredTechniques = techniques.filter((tech) => (
      this.matchesCategoryFilter(tech) && this.matchesStatusFilter(tech)
    ));
    const topTabsHtml = TECHNIQUE_CATEGORY_FILTERS.map((filter) => {
      const count = techniques.filter((tech) => (
        this.matchesStatusFilter(tech) && (filter.value === 'all' || resolveTechniqueCategory(tech) === filter.value)
      )).length;
      return `<button
        class="tech-filter-tab ${this.categoryFilter === filter.value ? 'active' : ''}"
        data-tech-category-filter="${filter.value}"
        type="button"
      >${escapeHtml(filter.label)}<span class="tech-filter-count">${formatDisplayInteger(count)}</span></button>`;
    }).join('');
    const sideTabsHtml = TECHNIQUE_STATUS_FILTERS.map((filter) => {
      const count = techniques.filter((tech) => (
        this.matchesCategoryFilter(tech) && this.matchesStatusFilter(tech, filter.value)
      )).length;
      return `<button
        class="tech-side-tab ${this.statusFilter === filter.value ? 'active' : ''}"
        data-tech-status-filter="${filter.value}"
        type="button"
      ><span>${escapeHtml(filter.label)}</span><span class="tech-filter-count">${formatDisplayInteger(count)}</span></button>`;
    }).join('');
    const listHtml = filteredTechniques.length > 0
      ? filteredTechniques.map((tech) => this.renderTechniqueCard(tech)).join('')
      : `<div class="empty-hint">${escapeHtml(this.getFilteredEmptyHint())}</div>`;

    preserveSelection(this.pane, () => {
      this.pane.innerHTML = `<div class="tech-panel-shell">
        <div class="tech-filter-tabs">${topTabsHtml}</div>
        <div class="tech-panel-body">
          <div class="tech-side-tabs">${sideTabsHtml}</div>
          <div class="tech-panel-list" data-tech-list="true">${listHtml}</div>
        </div>
      </div>`;
    });
  }

  private renderTechniqueCard(tech: TechniqueState): string {
    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    const isCultivating = this.lastState.cultivatingTechId === tech.techId;
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

  private matchesCategoryFilter(tech: TechniqueState, filter = this.categoryFilter): boolean {
    return filter === 'all' || resolveTechniqueCategory(tech) === filter;
  }

  private matchesStatusFilter(tech: TechniqueState, filter = this.statusFilter): boolean {
    if (filter === 'all') {
      return true;
    }
    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    if (filter === 'in_progress') {
      return tech.level < maxLevel;
    }
    return tech.level >= maxLevel;
  }

  private getFilteredEmptyHint(): string {
    if (this.statusFilter === 'in_progress') {
      return '当前没有未圆满的功法';
    }
    if (this.statusFilter === 'completed') {
      return '当前没有已圆满的功法';
    }
    return '当前筛选下没有符合条件的功法';
  }

  private renderModal(): void {
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
    const focusSignature = this.buildFocusStructureSignature(selectedLevel, skillsByLevel, milestones);
    const totalExp = calcTechniqueTotalExp(tech);
    detailModalHost.open({
      ownerId: TechniquePanel.MODAL_OWNER,
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
            <span data-tech-modal-current-attrs="true">${escapeHtml(formatTechniqueContributionSummary(effectiveAttrs, currentAttrs))}</span>
          </div>
        </section>
        <section class="tech-modal-pane tech-modal-pane--constellation">
          <div class="tech-modal-section-title">周天星图</div>
          <div class="tech-modal-pane-body" data-tech-modal-constellation-shell="true" data-tech-modal-constellation-signature="${escapeHtml(constellationSignature)}">${constellationHtml}</div>
        </section>
        <section class="tech-modal-pane tech-modal-pane--focus">
          <div class="tech-modal-section-title">星位注解</div>
          <div class="tech-modal-pane-body" data-tech-modal-focus-shell="true" data-tech-modal-focus-signature="${escapeHtml(focusSignature)}">${focusHtml}</div>
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

  private buildFallbackLayers(tech: TechniqueState, maxLevel: number): TechniqueLayerDef[] {
    const rows: TechniqueLayerDef[] = [];
    for (let level = 1; level <= maxLevel; level += 1) {
      rows.push({
        level,
        expToNext: level >= maxLevel ? 0 : 0,
        attrs: calcTechniqueNextLevelGains(level - 1, undefined, tech.attrCurves),
      });
    }
    return rows;
  }

  private renderSkillOverview(tech: TechniqueState): string {
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

    const layerAttrs = formatAttrMap(layer.attrs ?? {}, '本层不增加六维');
    const totalAttrs = formatAttrMap(calcTechniqueAttrValues(layer.level, tech.layers, tech.attrCurves));
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

  private resolveOpenLayerLevel(layers: TechniqueLayerDef[], fallbackLevel: number): number {
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
          this.onCultivate?.(null);
        } else {
          this.lastState.cultivatingTechId = techId;
          this.onCultivate?.(techId);
        }
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

  private mountConstellation(
    modalBody: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
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

  private closeModal(): void {
    this.openTechId = null;
    this.openLayerLevel = null;
    this.destroyConstellationCanvas();
    detailModalHost.close(TechniquePanel.MODAL_OWNER);
    this.tooltip.hide(true);
  }

  private patchList(): boolean {
    const techniques = resolvePreviewTechniques(this.lastState.techniques);
    const { cultivatingTechId } = this.lastState;
    if (techniques.length === 0) {
      return false;
    }

    for (const tech of techniques) {
      const card = this.pane.querySelector<HTMLElement>(`[data-tech-card="${CSS.escape(tech.techId)}"]`);
      const realmLevelNode = this.pane.querySelector<HTMLElement>(`[data-tech-realm-level="${CSS.escape(tech.techId)}"]`);
      const realmNode = this.pane.querySelector<HTMLElement>(`[data-tech-realm="${CSS.escape(tech.techId)}"]`);
      const layerNode = this.pane.querySelector<HTMLElement>(`[data-tech-layer="${CSS.escape(tech.techId)}"]`);
      const progressTextNode = this.pane.querySelector<HTMLElement>(`[data-tech-progress-text="${CSS.escape(tech.techId)}"]`);
      const progressFillNode = this.pane.querySelector<HTMLElement>(`[data-tech-progress-fill="${CSS.escape(tech.techId)}"]`);
      const remainNode = this.pane.querySelector<HTMLElement>(`[data-tech-progress-remain="${CSS.escape(tech.techId)}"]`);
      const cultivateButton = this.pane.querySelector<HTMLButtonElement>(`[data-tech-cultivate-button="${CSS.escape(tech.techId)}"]`);
      if (!card || !realmLevelNode || !realmNode || !layerNode || !progressTextNode || !progressFillNode || !remainNode || !cultivateButton) {
        return false;
      }

      const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
      const isCultivating = cultivatingTechId === tech.techId;
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
      cultivateButton.textContent = isCultivating ? '取消主修' : '设为主修';
      cultivateButton.classList.toggle('danger', isCultivating);
      cultivateButton.dataset.cultivate = isCultivating ? '' : tech.techId;
      cultivateButton.dataset.cultivateStop = isCultivating ? tech.techId : '';
    }

    return true;
  }

  private patchModal(): boolean {
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
    currentAttrsNode.textContent = formatTechniqueContributionSummary(effectiveAttrs, currentAttrs);

    const focusSignature = this.buildFocusStructureSignature(selectedLevel, skillsByLevel, milestones);
    if (focusShell.dataset.techModalFocusSignature !== focusSignature) {
      focusShell.dataset.techModalFocusSignature = focusSignature;
      focusShell.innerHTML = this.renderLayerFocus(tech, layers, selectedLevel, skillsByLevel, milestones);
      this.bindSkillTooltips(focusShell);
    } else {
      this.patchLayerFocus(focusShell, tech, layers, selectedLevel, skillsByLevel, milestones);
    }

    const constellationSignature = this.buildConstellationStructureSignature(layers, skillsByLevel);
    if (constellationShell.dataset.techModalConstellationSignature !== constellationSignature) {
      constellationShell.dataset.techModalConstellationSignature = constellationSignature;
      constellationShell.innerHTML = this.renderConstellation(tech, layers, tech.level, selectedLevel, skillsByLevel, milestones);
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
        const layerAttrs = formatAttrMap(layer.attrs ?? {}, '本层不增加六维');
        const totalAttrs = formatAttrMap(calcTechniqueAttrValues(layer.level, tech.layers, tech.attrCurves));
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

  private destroyConstellationCanvas(): void {
    this.constellationCanvas?.destroy();
    this.constellationCanvas = null;
  }

  private showConstellationTooltip(payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number): void {
    this.tooltip.show(payload.title, payload.lines, clientX, clientY);
  }

  private buildConstellationStructureSignature(
    layers: TechniqueLayerDef[],
    skillsByLevel: Map<number, TechniqueState['skills']>,
  ): string {
    return layers.map((layer) => {
      const skills = skillsByLevel.get(layer.level) ?? [];
      return `${layer.level}:${skills.map((skill) => skill.id).join(',')}`;
    }).join('|');
  }

  private buildFocusStructureSignature(
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): string {
    const skills = skillsByLevel.get(selectedLevel) ?? [];
    const milestone = milestones.get(selectedLevel) ?? '';
    return [
      selectedLevel,
      milestone,
      skills.map((skill) => skill.id).join(','),
    ].join('|');
  }

  private patchLayerFocus(
    focusShell: HTMLElement,
    tech: TechniqueState,
    layers: TechniqueLayerDef[],
    selectedLevel: number,
    skillsByLevel: Map<number, TechniqueState['skills']>,
    milestones: Map<number, TechniqueRealm>,
  ): void {
    const layer = layers.find((entry) => entry.level === selectedLevel) ?? layers[0];
    const card = focusShell.querySelector<HTMLElement>('[data-tech-focus-card="true"]');
    const title = focusShell.querySelector<HTMLElement>('[data-tech-focus-title="true"]');
    const subtitle = focusShell.querySelector<HTMLElement>('[data-tech-focus-subtitle="true"]');
    const state = focusShell.querySelector<HTMLElement>('[data-tech-focus-state="true"]');
    const exp = focusShell.querySelector<HTMLElement>('[data-tech-focus-exp="true"]');
    const layerAttrsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-layer-attrs="true"]');
    const totalAttrsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-total-attrs="true"]');
    if (!layer || !card || !title || !subtitle || !state || !exp || !layerAttrsNode || !totalAttrsNode) {
      return;
    }
    const selectedRealm = deriveTechniqueRealm(layer.level, tech.layers, tech.attrCurves);
    const milestone = milestones.get(layer.level);
    const stateLabel = layer.level < tech.level ? '已贯通' : layer.level === tech.level ? '当前停驻' : '尚未抵达';
    const expText = layer.expToNext > 0 ? `升下一层需 ${formatDisplayInteger(layer.expToNext)} 功法经验` : '此层已是终点';
    const milestoneText = milestone ? `此层踏入${getTechniqueRealmLabel(milestone)}` : `此层属${getTechniqueRealmLabel(selectedRealm)}阶段`;
    const layerAttrs = formatAttrMap(layer.attrs ?? {}, '本层不增加六维');
    const totalAttrs = formatAttrMap(calcTechniqueAttrValues(layer.level, tech.layers, tech.attrCurves));

    card.classList.toggle('passed', layer.level < tech.level);
    card.classList.toggle('current', layer.level === tech.level);
    title.textContent = `第 ${formatDisplayInteger(layer.level)} 层星位`;
    subtitle.textContent = milestoneText;
    state.textContent = stateLabel;
    exp.textContent = expText;
    layerAttrsNode.textContent = layerAttrs;
    totalAttrsNode.textContent = totalAttrs;
  }

  private findPreviewTechnique(techId: string): TechniqueState | undefined {
    const technique = this.lastState.techniques.find((entry) => entry.techId === techId);
    return technique ? resolvePreviewTechnique(technique) : undefined;
  }
}
