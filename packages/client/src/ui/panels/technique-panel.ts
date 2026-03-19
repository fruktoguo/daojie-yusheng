import {
  Attributes,
  calcTechniqueAttrValues,
  calcTechniqueNextLevelGains,
  getTechniqueMaxLevel,
  PlayerState,
  resolveSkillUnlockLevel,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_LABELS,
  TechniqueLayerDef,
  TechniqueState,
} from '@mud/shared';
import { FloatingTooltip } from '../floating-tooltip';
import { buildSkillTooltipLines } from '../skill-tooltip';

const ATTR_NAMES: Record<keyof Attributes, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};

type TechniquePanelState = {
  cultivatingTechId?: string;
  spellAtk: number;
  techniques: TechniqueState[];
};

function formatNumber(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : value % 0.1 === 0 ? 1 : 2);
}

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
  return entries.map(([key, value]) => `${ATTR_NAMES[key]}+${formatNumber(value)}`).join(' / ');
}

export class TechniquePanel {
  private pane = document.getElementById('pane-technique')!;
  private modal = document.getElementById('technique-modal')!;
  private modalTitle = document.getElementById('technique-modal-title')!;
  private modalSubtitle = document.getElementById('technique-modal-subtitle')!;
  private modalBody = document.getElementById('technique-modal-body')!;
  private onCultivate: ((techId: string | null) => void) | null = null;
  private tooltip = new FloatingTooltip();
  private openTechId: string | null = null;
  private lastState: TechniquePanelState = { techniques: [], spellAtk: 0 };

  constructor() {
    this.modal.addEventListener('click', () => {
      this.closeModal();
    });
    this.modal.querySelector('.tech-modal-card')?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeModal();
      }
    });
  }

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">尚未习得功法</div>';
    this.closeModal();
  }

  setCallbacks(onCultivate: (techId: string | null) => void): void {
    this.onCultivate = onCultivate;
  }

  update(techniques: TechniqueState[], cultivatingTechId?: string, spellAtk = 0): void {
    this.lastState = { techniques, cultivatingTechId, spellAtk };
    this.renderList();
    this.renderModal();
  }

  initFromPlayer(player: PlayerState): void {
    this.update(player.techniques, player.cultivatingTechId, player.numericStats?.spellAtk ?? 0);
  }

  private renderList(): void {
    const { techniques } = this.lastState;
    if (techniques.length === 0) {
      this.clear();
      return;
    }

    this.pane.innerHTML = techniques.map((tech) => {
      const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
      const isCultivating = this.lastState.cultivatingTechId === tech.techId;
      return `<button class="tech-card ${isCultivating ? 'cultivating' : ''}" data-tech-open="${tech.techId}" type="button">
        <span class="tech-summary-main">
          <span class="tech-name">${escapeHtml(tech.name)}</span>
          <span class="tech-realm">${tech.grade ? TECHNIQUE_GRADE_LABELS[tech.grade] : '无品'}</span>
          <span class="tech-layer">第${tech.level}/${maxLevel}层</span>
        </span>
      </button>`;
    }).join('');

    this.pane.querySelectorAll<HTMLElement>('[data-tech-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const techId = button.dataset.techOpen;
        if (!techId) return;
        this.openTechId = techId;
        this.renderModal();
      });
    });
  }

  private renderModal(): void {
    if (!this.openTechId) {
      this.closeModal();
      return;
    }
    const tech = this.lastState.techniques.find((entry) => entry.techId === this.openTechId);
    if (!tech) {
      this.closeModal();
      return;
    }

    const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level, tech.attrCurves);
    const currentAttrs = calcTechniqueAttrValues(tech.level, tech.layers, tech.attrCurves);
    const nextAttrs = calcTechniqueNextLevelGains(tech.level, tech.layers, tech.attrCurves);
    const isCultivating = this.lastState.cultivatingTechId === tech.techId;
    const skillsByLevel = new Map<number, TechniqueState['skills']>();
    for (const skill of tech.skills) {
      const unlockLevel = resolveSkillUnlockLevel(skill);
      const current = skillsByLevel.get(unlockLevel) ?? [];
      current.push(skill);
      skillsByLevel.set(unlockLevel, current);
    }

    this.modalTitle.textContent = tech.name;
    this.modalSubtitle.textContent = `${tech.grade ? TECHNIQUE_GRADE_LABELS[tech.grade] : '无品'} · 第 ${tech.level}/${maxLevel} 层`;

    const layers = tech.layers && tech.layers.length > 0
      ? [...tech.layers].sort((left, right) => left.level - right.level)
      : this.buildLegacyLayers(tech, maxLevel);
    const layerRows = layers.map((layer) => this.renderLayerRow(layer, tech.level, skillsByLevel)).join('');
    this.modalBody.innerHTML = `
      <div class="tech-modal-summary">
        <div class="tech-modal-stat">
          <span class="tech-modal-label">当前经验</span>
          <span>${tech.expToNext > 0 ? `${tech.exp}/${tech.expToNext}` : '已满层'}</span>
        </div>
        <div class="tech-modal-stat">
          <span class="tech-modal-label">当前原始总加成</span>
          <span>${escapeHtml(formatAttrMap(currentAttrs))}</span>
        </div>
        <div class="tech-modal-stat">
          <span class="tech-modal-label">下一层原始收益</span>
          <span>${escapeHtml(formatAttrMap(nextAttrs, '已无下一层'))}</span>
        </div>
      </div>
      <div class="tech-modal-section-title">逐层详情</div>
      <div class="tech-layer-list">${layerRows}</div>
      <div class="tech-modal-actions">
        ${isCultivating
          ? `<button class="small-btn danger" data-cultivate-stop="${tech.techId}" type="button">停止修炼</button>`
          : `<button class="small-btn" data-cultivate="${tech.techId}" type="button">设为当前修炼</button>`}
      </div>
    `;

    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
    this.bindModalActions();
    this.bindSkillTooltips();
  }

  private buildLegacyLayers(tech: TechniqueState, maxLevel: number): TechniqueLayerDef[] {
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

  private renderLayerRow(layer: TechniqueLayerDef, currentLevel: number, skillsByLevel: Map<number, TechniqueState['skills']>): string {
    const skills = skillsByLevel.get(layer.level) ?? [];
    const skillTags = skills.length > 0
      ? skills.map((skill) => {
        const detail = {
          title: skill.name,
          lines: buildSkillTooltipLines(skill, resolveSkillUnlockLevel(skill)),
        };
        return `<span class="tech-skill-tag"
          data-skill-tooltip-title="${escapeHtml(detail.title)}"
          data-skill-tooltip-detail="${escapeHtml(detail.lines.join('\n'))}">${escapeHtml(skill.name)}</span>`;
      }).join('')
      : '<span class="tech-layer-empty">本层无新技能</span>';

    let expText = '已满层';
    if (layer.expToNext > 0) {
      expText = `升下一层需 ${layer.expToNext} 修炼经验`;
    }

    return `<div class="tech-layer-row ${layer.level === currentLevel ? 'current' : ''} ${layer.level < currentLevel ? 'passed' : ''}">
      <div class="tech-layer-row-head">
        <span class="tech-layer-index">第 ${layer.level} 层</span>
        <span class="tech-layer-exp">${expText}</span>
      </div>
      <div class="tech-layer-attrs">${escapeHtml(formatAttrMap(layer.attrs ?? {}, '本层不增加六维'))}</div>
      <div class="tech-layer-skills">
        <span class="tech-modal-label">解锁技能</span>
        <span class="tech-layer-skill-list">${skillTags}</span>
      </div>
    </div>`;
  }

  private bindModalActions(): void {
    this.modalBody.querySelector<HTMLElement>('[data-cultivate]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const techId = (event.currentTarget as HTMLElement).dataset.cultivate;
      if (!techId) return;
      this.onCultivate?.(techId);
      this.renderModal();
    });
    this.modalBody.querySelector<HTMLElement>('[data-cultivate-stop]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onCultivate?.(null);
      this.renderModal();
    });
  }

  private bindSkillTooltips(): void {
    this.modalBody.querySelectorAll<HTMLElement>('[data-skill-tooltip-title]').forEach((node) => {
      const title = node.dataset.skillTooltipTitle ?? '';
      const detail = node.dataset.skillTooltipDetail ?? '';
      const lines = detail.split('\n');
      node.addEventListener('pointerenter', (event) => {
        this.tooltip.show(title, lines, event.clientX, event.clientY);
      });
      node.addEventListener('pointermove', (event) => {
        this.tooltip.move(event.clientX, event.clientY);
      });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
    });
  }

  private closeModal(): void {
    this.openTechId = null;
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    this.tooltip.hide();
  }
}
