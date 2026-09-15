/**
 * technique-panel.detail.ts
 * 功法面板弹窗/详情渲染提取模块，接收 TechniquePanel 实例作为 self。
 */
import {
  calcTechniqueAttrValues,
  calcTechniqueNextLevelGains,
  calcTechniqueNextLevelSpecialStatGains,
  calcTechniqueQiProjectionModifiers,
  deriveTechniqueRealm,
  getTechniquePassiveSkillStrengthMultiplier,
  getTechniqueMaxLevel,
  getSkillPassiveEffects,
  isPassiveTechnique,
  isCreatedTechniqueId,
  isTechniqueAggregationId,
  resolveSkillUnlockLevel,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
} from '@mud/shared';
import { getTechniqueGradeLabel, getTechniqueRealmLabel } from '../../domain-labels';
import { resolveCreatedTechniqueStrengthPercent, resolvePreviewTechniques } from '../../content/local-templates';
import { prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { buildSkillTooltipContent, summarizeResidentSkillEffects } from '../skill-tooltip';
import {
  calcTechniqueSpecialStatContribution,
  formatTechniqueCumulativeBonusSummary,
  formatTechniqueLayerBonusSummary,
  formatTechniqueQiProjectionSummaryHtml,
} from '../technique-bonus-summary';
import { TechniqueConstellationCanvas, TechniqueConstellationCanvasData, TechniqueConstellationHoverPayload } from './technique-constellation-canvas';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { t } from '../i18n';
import {
  TechniquePanel,
  escapeHtml,
  replaceElementHtml,
  calcTechniqueEffectiveContribution,
  formatTechniqueContributionSummary,
  getTechniqueProgressRatio,
  formatTechniqueProgressText,
  calcTechniqueTotalExp,
  getResolvedTechniqueRealm,
  getTechniqueRealmLevelLabel,
  buildTechniqueExpTooltipLines,
  buildTechniqueMilestones,
} from './technique-panel';

export function renderModalImpl(self: TechniquePanel): void {
  if (!self.openTechId) { self.closeModal(); return; }
  const tech = self.findPreviewTechnique(self.openTechId);
  if (!tech) { self.closeModal(); return; }
  const passiveTechnique = isPassiveTechnique(tech);
  const maxLevel = passiveTechnique ? Math.max(1, tech.level) : getTechniqueMaxLevel(tech.layers, tech.level);
  const previewTechniques = resolvePreviewTechniques(self.lastState.techniques);
  const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers);
  const effectiveAttrs = calcTechniqueEffectiveContribution(previewTechniques, tech.techId);
  const currentSpecialStats = calcTechniqueSpecialStatContribution(tech.level, tech.layers);
  const currentQiProjection = calcTechniqueQiProjectionModifiers(tech.level, tech.layers);
  const skillsByLevel = new Map<number, TechniqueState['skills']>();
  const milestones = passiveTechnique ? new Map<number, TechniqueRealm>() : buildTechniqueMilestones(tech, maxLevel);
  for (const skill of tech.skills) {
    const unlockLevel = resolveSkillUnlockLevel(skill);
    const current = skillsByLevel.get(unlockLevel) ?? [];
    current.push(skill);
    skillsByLevel.set(unlockLevel, current);
  }
  const layers = passiveTechnique ? [] : tech.layers && tech.layers.length > 0
    ? [...tech.layers].sort((left, right) => left.level - right.level)
    : self.buildFallbackLayers(tech, maxLevel);
  const selectedLevel = passiveTechnique ? tech.level : self.resolveOpenLayerLevel(layers, tech.level);
  const constellationHtml = passiveTechnique ? '' : self.renderConstellation(tech, layers, tech.level, selectedLevel, skillsByLevel, milestones);
  const focusHtml = passiveTechnique
    ? self.renderPassiveTechniqueOverview(tech)
    : self.renderLayerFocus(tech, layers, selectedLevel, skillsByLevel, milestones);
  const constellationSignature = passiveTechnique ? '' : self.buildConstellationStructureSignature(layers, skillsByLevel);
  const detailHtml = passiveTechnique ? focusHtml
    : `<section class="tech-modal-pane tech-modal-pane--constellation">
        <div class="tech-modal-section-title">${t('technique.modal.section.constellation', undefined)}</div>
        <div class="tech-modal-pane-body" data-tech-modal-constellation-shell="true" data-tech-modal-constellation-signature="${escapeHtml(constellationSignature)}">${constellationHtml}</div>
      </section>
      <section class="tech-modal-pane tech-modal-pane--focus">
        <div class="tech-modal-section-title">${t('technique.modal.section.focus', undefined)}</div>
        <div class="tech-modal-pane-body" data-tech-modal-focus-shell="true">${focusHtml}</div>
      </section>`;
  const totalExp = calcTechniqueTotalExp(tech);
  const showsCreatedTechniqueStrength = isCreatedTechniqueId(tech.techId) && !isTechniqueAggregationId(tech.techId);
  const strengthPercent = showsCreatedTechniqueStrength ? resolveCreatedTechniqueStrengthPercent(tech.techId) : null;
  const strengthHtml = showsCreatedTechniqueStrength
    ? `<section class="tech-modal-strength" data-tech-modal-strength="true">
        <span>功法强度</span>
        <strong>${strengthPercent === null ? '读取中' : `${formatDisplayInteger(strengthPercent)}%`}</strong>
      </section>` : '';
  detailModalHost.open({
    ownerId: TechniquePanel.MODAL_OWNER,
    size: 'wide',
    variantClass: 'detail-modal--technique',
    title: tech.name,
    subtitle: t('technique.modal.subtitle', {
      realmLevel: getTechniqueRealmLevelLabel(tech),
      grade: getTechniqueGradeLabel(tech.grade),
      realm: getTechniqueRealmLabel(getResolvedTechniqueRealm(tech)),
      level: formatDisplayInteger(tech.level),
      maxLevel: passiveTechnique ? '无限' : formatDisplayInteger(maxLevel),
    }),
    bodyHtml: `
    <div class="tech-modal-stack${showsCreatedTechniqueStrength ? ' tech-modal-stack--with-strength' : ''}">
      ${strengthHtml}
      <section class="tech-modal-summary">
        <div class="tech-modal-stat">
          <span class="tech-modal-label">${t('technique.modal.label.current-exp', undefined)}</span>
          <span data-tech-modal-current-exp="true" data-tech-exp-tooltip="true">${formatTechniqueProgressText(tech)}</span>
        </div>
        <div class="tech-modal-stat">
          <span class="tech-modal-label">${t('technique.modal.label.total-exp', undefined)}</span>
          <span data-tech-modal-total-exp="true">${formatDisplayInteger(totalExp)}</span>
        </div>
        <div class="tech-modal-stat">
          <span class="tech-modal-label">${t('technique.modal.label.current-bonus', undefined)}</span>
          <span data-tech-modal-current-attrs="true">${formatTechniqueContributionSummary(effectiveAttrs, currentAttrs, currentSpecialStats, currentSpecialStats, currentQiProjection)}</span>
        </div>
      </section>
      ${detailHtml}
      <section class="ui-modal-footer-actions">
        <button class="small-btn danger" data-tech-forget="${escapeHtml(tech.techId)}" type="button">${escapeHtml(t('technique.forget.action', undefined))}</button>
      </section>
    </div>
  `,
    onClose: () => {
      self.openTechId = null;
      self.openLayerLevel = null;
      self.destroyConstellationCanvas();
      self.tooltip.hide(true);
    },
    onAfterRender: (body, signal) => {
      if (!passiveTechnique) {
        self.mountConstellation(body, tech, layers, selectedLevel, skillsByLevel, milestones);
      }
      self.bindSkillTooltips(body, signal);
      self.bindTechniqueExpTooltip(body, signal);
      self.bindForgetButton(body, signal);
    },
  });
}

export function buildFallbackLayersImpl(self: TechniquePanel, tech: TechniqueState, maxLevel: number): TechniqueLayerDef[] {
  const rows: TechniqueLayerDef[] = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    rows.push({
      level,
      expToNext: level >= maxLevel ? 0 : 0,
      attrs: calcTechniqueNextLevelGains(level - 1, tech.layers),
      specialStats: calcTechniqueNextLevelSpecialStatGains(level - 1, tech.layers),
    });
  }
  return rows;
}

export function renderSkillOverviewImpl(self: TechniquePanel, tech: TechniqueState): string {
  if (tech.skills.length === 0) {
    return `<div class="tech-skill-overview-empty">${t('technique.skill.empty', undefined)}</div>`;
  }
  const sortedSkills = [...tech.skills].sort((left, right) => {
    const levelDelta = resolveSkillUnlockLevel(left) - resolveSkillUnlockLevel(right);
    if (levelDelta !== 0) { return levelDelta; }
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
          <span class="tech-skill-overview-meta">${escapeHtml(t('technique.skill.unlock-meta', { level: formatDisplayInteger(unlockLevel), state: unlocked ? t('technique.skill.unlocked', undefined) : t('technique.skill.locked', undefined) }))}</span>
        </div>
        <div class="tech-skill-overview-desc">${escapeHtml(skill.desc)}</div>
      </div>`;
    }).join('')}
  </div>`;
}

export function renderPassiveTechniqueOverviewImpl(self: TechniquePanel, tech: TechniqueState): string {
  const multiplier = getTechniquePassiveSkillStrengthMultiplier(tech.level);
  const skills = tech.skills.filter((skill) => skill.active === false && getSkillPassiveEffects(skill).length > 0);
  const rows = skills.map((skill) => {
    const unlockLevel = resolveSkillUnlockLevel(skill);
    const unlocked = tech.level >= unlockLevel;
    const effectHtml = unlocked
      ? (summarizeResidentSkillEffects(skill, { techLevel: tech.level, passiveTechnique: true }) || '常驻被动效果')
      : `第 ${formatDisplayInteger(unlockLevel)} 层解锁`;
    return `<div class="tech-skill-overview-item ${unlocked ? 'unlocked' : 'locked'}">
      <div class="tech-skill-overview-head">
        <span class="tech-skill-tag" data-skill-tooltip-title="${escapeHtml(skill.name)}" data-skill-tooltip-skill-id="${escapeHtml(skill.id)}" data-skill-tooltip-unlock-level="${unlockLevel}" data-skill-tooltip-rich="1">${escapeHtml(skill.name)}</span>
        <span class="tech-skill-overview-meta">${unlocked ? effectHtml : escapeHtml(effectHtml)}</span>
      </div>
      <div class="tech-skill-overview-desc">${escapeHtml(skill.desc)}</div>
    </div>`;
  }).join('');
  return `<section class="tech-modal-pane tech-modal-pane--focus tech-modal-pane--passive" data-tech-modal-passive-shell="true" data-tech-modal-passive-level="${tech.level}">
    <div class="tech-modal-section-title">被动效果</div>
    <div class="tech-modal-pane-body" data-tech-modal-passive-content="true">
      <div class="tech-passive-strength">当前强度倍率 ×${formatDisplayNumber(multiplier)}（每层 +5%，无限层）</div>
      <div class="tech-skill-overview-list">${rows || '<div class="tech-skill-overview-empty">暂无被动效果</div>'}</div>
    </div>
  </section>`;
}

export function renderLayerFocusImpl(
  self: TechniquePanel,
  tech: TechniqueState,
  layers: TechniqueLayerDef[],
  selectedLevel: number,
  skillsByLevel: Map<number, TechniqueState['skills']>,
  milestones: Map<number, TechniqueRealm>,
): string {
  const layer = layers.find((entry) => entry.level === selectedLevel) ?? layers[0];
  const selectedRealm = deriveTechniqueRealm(layer.level, tech.layers);
  const skills = skillsByLevel.get(layer.level) ?? [];
  const skillTags = skills.length > 0
    ? skills.map((skill) => {
      return `<span class="tech-skill-tag"
        data-skill-tooltip-title="${escapeHtml(skill.name)}"
        data-skill-tooltip-skill-id="${escapeHtml(skill.id)}"
        data-skill-tooltip-unlock-level="${resolveSkillUnlockLevel(skill)}"
        data-skill-tooltip-rich="1">${escapeHtml(skill.name)}</span>`;
    }).join('')
    : `<span class="tech-layer-empty">${t('technique.layer.no-skill', undefined)}</span>`;
  const layerAttrs = formatTechniqueLayerBonusSummary(layer, t('technique.layer.no-attr-gain', undefined));
  const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers);
  const milestone = milestones.get(layer.level);
  const stateLabel = layer.level < tech.level ? t('technique.layer.state.passed', undefined) : layer.level === tech.level ? t('technique.layer.state.current', undefined) : t('technique.layer.state.locked', undefined);
  const expText = layer.expToNext > 0 ? t('technique.layer.next-exp', { exp: formatDisplayInteger(layer.expToNext) }) : t('technique.layer.endpoint', undefined);
  const milestoneText = milestone ? t('technique.layer.milestone', { realm: getTechniqueRealmLabel(milestone) }) : t('technique.layer.realm-stage', { realm: getTechniqueRealmLabel(selectedRealm) });
  return `<section class="tech-focus-card ${layer.level < tech.level ? 'passed' : ''} ${layer.level === tech.level ? 'current' : ''}" data-tech-focus-card="true">
    <div class="tech-focus-head">
      <div>
        <div class="tech-focus-title" data-tech-focus-title="true">${escapeHtml(t('technique.focus.title', { level: formatDisplayInteger(layer.level) }))}</div>
        <div class="tech-focus-subtitle" data-tech-focus-subtitle="true">${escapeHtml(milestoneText)}</div>
      </div>
      <div class="tech-focus-state" data-tech-focus-state="true">${stateLabel}</div>
    </div>
    <div class="tech-focus-grid">
      <div class="tech-focus-stat">
        <span class="tech-modal-label">${t('technique.focus.label.progress', undefined)}</span>
        <span data-tech-focus-exp="true">${expText}</span>
      </div>
      <div class="tech-focus-stat">
        <span class="tech-modal-label">${t('technique.focus.label.layer-attrs', undefined)}</span>
        <span data-tech-focus-layer-attrs="true">${escapeHtml(layerAttrs)}</span>
      </div>
      <div class="tech-focus-stat">
        <span class="tech-modal-label">${t('technique.focus.label.total-attrs', undefined)}</span>
        <span data-tech-focus-total-attrs="true">${escapeHtml(totalAttrs)}</span>
      </div>
    </div>
    <div class="tech-focus-skills">
      <span class="tech-modal-label">${t('technique.focus.label.skill-nodes', undefined)}</span>
      <span class="tech-layer-skill-list" data-tech-focus-skills="true">${skillTags}</span>
    </div>
  </section>`;
}

export function renderConstellationImpl(
  self: TechniquePanel,
  tech: TechniqueState,
  layers: TechniqueLayerDef[],
  currentLevel: number,
  selectedLevel: number,
  skillsByLevel: Map<number, TechniqueState['skills']>,
  milestones: Map<number, TechniqueRealm>,
): string {
  const note = currentLevel < layers.length
    ? t('technique.constellation.note.current', { level: formatDisplayInteger(currentLevel), percent: formatDisplayInteger(getTechniqueProgressRatio(tech) * 100) })
    : t('technique.constellation.note.completed', { level: formatDisplayInteger(layers.length) });
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

export function resolveOpenLayerLevelImpl(self: TechniquePanel, layers: TechniqueLayerDef[], fallbackLevel: number): number {
  if (layers.length === 0) { return fallbackLevel; }
  const levels = new Set(layers.map((entry) => entry.level));
  if (self.openLayerLevel && levels.has(self.openLayerLevel)) { return self.openLayerLevel; }
  const clamped = Math.min(Math.max(fallbackLevel, layers[0].level), layers[layers.length - 1].level);
  self.openLayerLevel = clamped;
  return clamped;
}

export function mountConstellationImpl(
  self: TechniquePanel,
  modalBody: HTMLElement,
  tech: TechniqueState,
  layers: TechniqueLayerDef[],
  selectedLevel: number,
  skillsByLevel: Map<number, TechniqueState['skills']>,
  milestones: Map<number, TechniqueRealm>,
): void {
  const root = modalBody.querySelector<HTMLElement>('[data-tech-constellation-root="true"]');
  if (!root) { self.destroyConstellationCanvas(); return; }
  const data = self.buildConstellationData(tech, layers, selectedLevel, skillsByLevel, milestones);
  self.destroyConstellationCanvas();
  self.constellationCanvas = new TechniqueConstellationCanvas(root, data, (level) => {
    if (self.openLayerLevel === level) { return; }
    self.openLayerLevel = level;
    if (!self.patchModal()) { self.renderModal(); }
  }, (payload, clientX, clientY) => {
    self.showConstellationTooltip(payload, clientX, clientY);
  }, (clientX, clientY) => {
    self.tooltip.move(clientX, clientY);
  }, () => {
    self.tooltip.hide();
  });
}

export function bindSkillTooltipsImpl(self: TechniquePanel, modalBody: HTMLElement, signal: AbortSignal): void {
  const tapMode = prefersPinnedTooltipInteraction();
  const resolveTooltip = (node: HTMLElement) => {
    const title = node.dataset.skillTooltipTitle ?? '';
    const rich = node.dataset.skillTooltipRich === '1';
    const skillId = node.dataset.skillTooltipSkillId ?? '';
    const unlockLevel = Number(node.dataset.skillTooltipUnlockLevel ?? '0') || undefined;
    const techniques = resolvePreviewTechniques(self.lastState.techniques);
    const technique = techniques.find((entry) => entry.skills.some((skill) => skill.id === skillId));
    const skill = technique?.skills.find((entry) => entry.id === skillId);
    const tooltip = skill ? buildSkillTooltipContent(skill, {
      unlockLevel,
      techLevel: technique?.level,
      player: self.lastState.previewPlayer,
      knownSkills: techniques.flatMap((entry) => entry.skills),
      passiveTechnique: technique ? isPassiveTechnique(technique) : undefined,
    }) : { lines: [], asideCards: [] };
    return { title, rich, tooltip };
  };
  modalBody.addEventListener('click', (event) => {
    if (!tapMode || !(event instanceof PointerEvent)) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-skill-tooltip-title]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    if (self.tooltip.isPinnedTo(node)) { self.tooltip.hide(true); return; }
    const { title, rich, tooltip } = resolveTooltip(node);
    self.tooltip.showPinned(node, title, tooltip.lines, event.clientX, event.clientY, { allowHtml: rich, asideCards: tooltip.asideCards });
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal });
  modalBody.addEventListener('pointerover', (event) => {
    if (!(event instanceof PointerEvent) || (tapMode && self.tooltip.isPinned())) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-skill-tooltip-title]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) { return; }
    const { title, rich, tooltip } = resolveTooltip(node);
    self.tooltip.show(title, tooltip.lines, event.clientX, event.clientY, { allowHtml: rich, asideCards: tooltip.asideCards });
  }, { signal });
  modalBody.addEventListener('pointermove', (event) => {
    if (!(event instanceof PointerEvent) || (tapMode && self.tooltip.isPinned())) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-skill-tooltip-title]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    self.tooltip.move(event.clientX, event.clientY);
  }, { signal });
  modalBody.addEventListener('pointerout', (event) => {
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-skill-tooltip-title]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) { return; }
    if (!self.tooltip.isPinnedTo(node)) { self.tooltip.hide(); }
  }, { signal });
}

export function bindTechniqueExpTooltipImpl(self: TechniquePanel, modalBody: HTMLElement, signal: AbortSignal): void {
  const tapMode = prefersPinnedTooltipInteraction();
  const showTooltip = (node: HTMLElement, clientX: number, clientY: number, pin = false): void => {
    if (!self.openTechId) { return; }
    const tech = self.findPreviewTechnique(self.openTechId);
    if (!tech) { return; }
    const lines = buildTechniqueExpTooltipLines(tech, self.lastState.previewPlayer);
    if (pin) { self.tooltip.showPinned(node, t('technique.exp-tooltip.title', undefined), lines, clientX, clientY); return; }
    self.tooltip.show(t('technique.exp-tooltip.title', undefined), lines, clientX, clientY);
  };
  modalBody.addEventListener('click', (event) => {
    if (!tapMode || !(event instanceof PointerEvent)) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tech-exp-tooltip="true"]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    if (self.tooltip.isPinnedTo(node)) { self.tooltip.hide(true); return; }
    showTooltip(node, event.clientX, event.clientY, true);
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal });
  modalBody.addEventListener('pointerover', (event) => {
    if (!(event instanceof PointerEvent) || (tapMode && self.tooltip.isPinned())) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tech-exp-tooltip="true"]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) { return; }
    showTooltip(node, event.clientX, event.clientY);
  }, { signal });
  modalBody.addEventListener('pointermove', (event) => {
    if (!(event instanceof PointerEvent) || (tapMode && self.tooltip.isPinned())) { return; }
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tech-exp-tooltip="true"]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    self.tooltip.move(event.clientX, event.clientY);
  }, { signal });
  modalBody.addEventListener('pointerout', (event) => {
    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tech-exp-tooltip="true"]') : null;
    if (!node || !modalBody.contains(node)) { return; }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) { return; }
    if (!self.tooltip.isPinnedTo(node)) { self.tooltip.hide(); }
  }, { signal });
}

export function bindForgetButtonImpl(self: TechniquePanel, modalBody: HTMLElement, signal: AbortSignal): void {
  modalBody.addEventListener('click', (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tech-forget]') : null;
    if (!button || !modalBody.contains(button)) { return; }
    const techId = button.dataset.techForget;
    const tech = techId ? self.findPreviewTechnique(techId) : null;
    if (!tech) { return; }
    event.preventDefault();
    event.stopPropagation();
    self.handleForgetTechnique(tech);
  }, { signal });
}

export function closeModalImpl(self: TechniquePanel): void {
  self.openTechId = null;
  self.openLayerLevel = null;
  self.destroyConstellationCanvas();
  detailModalHost.close(TechniquePanel.MODAL_OWNER);
  self.tooltip.hide(true);
}

export function patchModalImpl(self: TechniquePanel): boolean {
  if (!self.openTechId) { return true; }
  if (!detailModalHost.isOpenFor(TechniquePanel.MODAL_OWNER)) { return false; }
  const tech = self.findPreviewTechnique(self.openTechId);
  if (!tech) { return false; }
  const passiveTechnique = isPassiveTechnique(tech);
  if (passiveTechnique) {
    const expNode = document.querySelector<HTMLElement>('[data-tech-modal-current-exp="true"]');
    const totalExpNode = document.querySelector<HTMLElement>('[data-tech-modal-total-exp="true"]');
    const currentAttrsNode = document.querySelector<HTMLElement>('[data-tech-modal-current-attrs="true"]');
    const passiveShell = document.querySelector<HTMLElement>('[data-tech-modal-passive-shell="true"]');
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (!expNode || !totalExpNode || !currentAttrsNode || !passiveShell || !titleNode || !subtitleNode) { return false; }
    const previewTechniques = resolvePreviewTechniques(self.lastState.techniques);
    const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers);
    const effectiveAttrs = calcTechniqueEffectiveContribution(previewTechniques, tech.techId);
    const currentSpecialStats = calcTechniqueSpecialStatContribution(tech.level, tech.layers);
    const currentQiProjection = calcTechniqueQiProjectionModifiers(tech.level, tech.layers);
    titleNode.textContent = tech.name;
    subtitleNode.textContent = t('technique.modal.subtitle', {
      realmLevel: getTechniqueRealmLevelLabel(tech), grade: getTechniqueGradeLabel(tech.grade),
      realm: getTechniqueRealmLabel(getResolvedTechniqueRealm(tech)),
      level: formatDisplayInteger(tech.level), maxLevel: '无限',
    });
    expNode.textContent = formatTechniqueProgressText(tech);
    totalExpNode.textContent = formatDisplayInteger(calcTechniqueTotalExp(tech));
    currentAttrsNode.innerHTML = formatTechniqueContributionSummary(effectiveAttrs, currentAttrs, currentSpecialStats, currentSpecialStats, currentQiProjection);
    if (passiveShell.dataset.techModalPassiveLevel !== String(tech.level)) {
      const template = document.createElement('template');
      template.innerHTML = self.renderPassiveTechniqueOverview(tech).trim();
      const nextShell = template.content.firstElementChild;
      if (!(nextShell instanceof HTMLElement)) { return false; }
      passiveShell.replaceWith(nextShell);
      self.bindSkillTooltips(nextShell, new AbortController().signal);
    }
    return true;
  }
  const expNode = document.querySelector<HTMLElement>('[data-tech-modal-current-exp="true"]');
  const totalExpNode = document.querySelector<HTMLElement>('[data-tech-modal-total-exp="true"]');
  const currentAttrsNode = document.querySelector<HTMLElement>('[data-tech-modal-current-attrs="true"]');
  const focusShell = document.querySelector<HTMLElement>('[data-tech-modal-focus-shell="true"]');
  const constellationShell = document.querySelector<HTMLElement>('[data-tech-modal-constellation-shell="true"]');
  const titleNode = document.getElementById('detail-modal-title');
  const subtitleNode = document.getElementById('detail-modal-subtitle');
  if (!expNode || !totalExpNode || !currentAttrsNode || !focusShell || !constellationShell || !titleNode || !subtitleNode) { return false; }
  const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level);
  const previewTechniques = resolvePreviewTechniques(self.lastState.techniques);
  const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers);
  const effectiveAttrs = calcTechniqueEffectiveContribution(previewTechniques, tech.techId);
  const currentSpecialStats = calcTechniqueSpecialStatContribution(tech.level, tech.layers);
  const currentQiProjection = calcTechniqueQiProjectionModifiers(tech.level, tech.layers);
  const skillsByLevel = new Map<number, TechniqueState['skills']>();
  for (const skill of tech.skills) {
    const unlockLevel = resolveSkillUnlockLevel(skill);
    const current = skillsByLevel.get(unlockLevel) ?? [];
    current.push(skill);
    skillsByLevel.set(unlockLevel, current);
  }
  const layers = tech.layers && tech.layers.length > 0
    ? [...tech.layers].sort((left, right) => left.level - right.level)
    : self.buildFallbackLayers(tech, maxLevel);
  const milestones = buildTechniqueMilestones(tech, maxLevel);
  const selectedLevel = self.resolveOpenLayerLevel(layers, tech.level);
  titleNode.textContent = tech.name;
  subtitleNode.textContent = t('technique.modal.subtitle', {
    realmLevel: getTechniqueRealmLevelLabel(tech), grade: getTechniqueGradeLabel(tech.grade),
    realm: getTechniqueRealmLabel(getResolvedTechniqueRealm(tech)),
    level: formatDisplayInteger(tech.level), maxLevel: formatDisplayInteger(maxLevel),
  });
  expNode.textContent = formatTechniqueProgressText(tech);
  totalExpNode.textContent = formatDisplayInteger(calcTechniqueTotalExp(tech));
  currentAttrsNode.innerHTML = formatTechniqueContributionSummary(effectiveAttrs, currentAttrs, currentSpecialStats, currentSpecialStats, currentQiProjection);
  if (!focusShell.querySelector('[data-tech-focus-card="true"]')) {
    replaceElementHtml(focusShell, self.renderLayerFocus(tech, layers, selectedLevel, skillsByLevel, milestones));
  } else {
    self.patchLayerFocus(focusShell, tech, layers, selectedLevel, skillsByLevel, milestones);
  }
  const constellationSignature = self.buildConstellationStructureSignature(layers, skillsByLevel);
  if (constellationShell.dataset.techModalConstellationSignature !== constellationSignature) {
    constellationShell.dataset.techModalConstellationSignature = constellationSignature;
    replaceElementHtml(constellationShell, self.renderConstellation(tech, layers, tech.level, selectedLevel, skillsByLevel, milestones));
    self.mountConstellation(constellationShell, tech, layers, selectedLevel, skillsByLevel, milestones);
  }
  const noteNode = document.querySelector<HTMLElement>('.tech-starfield-note');
  if (noteNode) {
    noteNode.textContent = tech.level < layers.length
      ? t('technique.constellation.note.current', { level: formatDisplayInteger(tech.level), percent: formatDisplayInteger(getTechniqueProgressRatio(tech) * 100) })
      : t('technique.constellation.note.completed', { level: formatDisplayInteger(layers.length) });
  }
  const constellationData = self.buildConstellationData(tech, layers, selectedLevel, skillsByLevel, milestones);
  const constellationRoot = constellationShell.querySelector<HTMLElement>('[data-tech-constellation-root="true"]');
  if (!constellationRoot) { return false; }
  if (self.constellationCanvas) {
    self.constellationCanvas.update(constellationData);
  } else {
    self.constellationCanvas = new TechniqueConstellationCanvas(constellationRoot, constellationData, (level) => {
      if (self.openLayerLevel === level) { return; }
      self.openLayerLevel = level;
      if (!self.patchModal()) { self.renderModal(); }
    }, (payload, clientX, clientY) => {
      self.showConstellationTooltip(payload, clientX, clientY);
    }, (clientX, clientY) => {
      self.tooltip.move(clientX, clientY);
    }, () => {
      self.tooltip.hide();
    });
  }
  return true;
}

export function buildConstellationDataImpl(
  self: TechniquePanel,
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
      const layerRealm = deriveTechniqueRealm(layer.level, tech.layers);
      const layerAttrs = formatTechniqueLayerBonusSummary(layer, t('technique.layer.no-attr-gain', undefined));
      const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers);
      const progressText = layer.level < tech.level
        ? t('technique.constellation.progress.passed', undefined)
        : layer.level === tech.level
          ? t('technique.constellation.progress.current', { percent: formatDisplayInteger(getTechniqueProgressRatio(tech) * 100) })
          : layer.level === tech.level + 1 && tech.level < layers.length && tech.expToNext > 0
            ? t('technique.constellation.progress.breaking', { percent: formatDisplayInteger(getTechniqueProgressRatio(tech) * 100) })
            : t('technique.constellation.progress.locked', undefined);
      const milestone = milestones.get(layer.level);
      return {
        level: layer.level,
        milestone: milestone ? getTechniqueRealmLabel(milestone) as '小成' | '大成' | '圆满' : undefined,
        hoverTitle: t('technique.focus.title', { level: formatDisplayInteger(layer.level) }),
        hoverLines: [
          progressText,
          t('technique.constellation.hover.gain', { value: layerAttrs }),
          t('technique.constellation.hover.total', { value: totalAttrs }),
          t('technique.constellation.hover.realm', { realm: getTechniqueRealmLabel(layerRealm) }),
        ],
      };
    }),
  };
}

export function destroyConstellationCanvasImpl(self: TechniquePanel): void {
  self.constellationCanvas?.destroy();
  self.constellationCanvas = null;
}

export function showConstellationTooltipImpl(self: TechniquePanel, payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number): void {
  self.tooltip.show(payload.title, payload.lines, clientX, clientY);
}

export function buildConstellationStructureSignatureImpl(
  self: TechniquePanel,
  layers: TechniqueLayerDef[],
  skillsByLevel: Map<number, TechniqueState['skills']>,
): string {
  return layers.map((layer) => {
    const skills = skillsByLevel.get(layer.level) ?? [];
    return `${layer.level}:${skills.map((skill) => skill.id).join(',')}`;
  }).join('|');
}

export function patchLayerFocusImpl(
  self: TechniquePanel,
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
  const skillsNode = focusShell.querySelector<HTMLElement>('[data-tech-focus-skills="true"]');
  if (!layer || !card || !title || !subtitle || !state || !exp || !layerAttrsNode || !totalAttrsNode || !skillsNode) { return; }
  const selectedRealm = deriveTechniqueRealm(layer.level, tech.layers);
  const milestone = milestones.get(layer.level);
  const skills = skillsByLevel.get(layer.level) ?? [];
  const stateLabel = layer.level < tech.level ? t('technique.layer.state.passed', undefined) : layer.level === tech.level ? t('technique.layer.state.current', undefined) : t('technique.layer.state.locked', undefined);
  const expText = layer.expToNext > 0 ? t('technique.layer.next-exp', { exp: formatDisplayInteger(layer.expToNext) }) : t('technique.layer.endpoint', undefined);
  const milestoneText = milestone ? t('technique.layer.milestone', { realm: getTechniqueRealmLabel(milestone) }) : t('technique.layer.realm-stage', { realm: getTechniqueRealmLabel(selectedRealm) });
  const layerAttrs = formatTechniqueLayerBonusSummary(layer, t('technique.layer.no-attr-gain', undefined));
  const totalAttrs = formatTechniqueCumulativeBonusSummary(layer.level, tech.layers);
  card.classList.toggle('passed', layer.level < tech.level);
  card.classList.toggle('current', layer.level === tech.level);
  title.textContent = t('technique.focus.title', { level: formatDisplayInteger(layer.level) });
  subtitle.textContent = milestoneText;
  state.textContent = stateLabel;
  exp.textContent = expText;
  layerAttrsNode.textContent = layerAttrs;
  totalAttrsNode.textContent = totalAttrs;
  if (skills.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'tech-layer-empty';
    empty.textContent = t('technique.layer.no-skill', undefined);
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
}
