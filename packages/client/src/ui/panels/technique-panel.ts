import {
  Attributes,
  calcTechniqueAttrValues,
  calcTechniqueNextLevelGains,
  TechniqueAttrCurveSegment,
  TechniqueAttrCurves,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_LABELS,
  TechniqueState,
  TechniqueRealm,
  PlayerState,
} from '@mud/shared';

const REALM_NAMES: Record<TechniqueRealm, string> = {
  [TechniqueRealm.Entry]: '入门',
  [TechniqueRealm.Minor]: '小成',
  [TechniqueRealm.Major]: '大成',
  [TechniqueRealm.Perfection]: '圆满',
};
const ATTR_NAMES: Record<keyof Attributes, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};

function formatNumber(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : value % 0.1 === 0 ? 1 : 2);
}

function formatAttrMap(prefix: string, attrs: Partial<Attributes>): string {
  const entries = TECHNIQUE_ATTR_KEYS
    .map((key) => [key, attrs[key] ?? 0] as const)
    .filter(([, value]) => value > 0);
  if (entries.length === 0) {
    return `${prefix}无`;
  }
  return `${prefix}${entries.map(([key, value]) => `${ATTR_NAMES[key]}+${formatNumber(value)}`).join(' / ')}`;
}

function formatSegmentRange(segment: TechniqueAttrCurveSegment): string {
  if (segment.endLevel === undefined) {
    return `${segment.startLevel}层后`;
  }
  if (segment.startLevel === segment.endLevel) {
    return `${segment.startLevel}层`;
  }
  return `${segment.startLevel}-${segment.endLevel}层`;
}

function formatCurveDetails(curves?: TechniqueAttrCurves): string {
  if (!curves) return '成长曲线：暂无';
  const parts = TECHNIQUE_ATTR_KEYS
    .map((key) => {
      const segments = curves[key];
      if (!segments || segments.length === 0) return '';
      return `${ATTR_NAMES[key]} ${segments
        .map((segment) => `${formatSegmentRange(segment)}+${formatNumber(segment.gainPerLevel)}/层`)
        .join(' / ')}`;
    })
    .filter((entry) => entry.length > 0);
  return parts.length > 0 ? `成长曲线：${parts.join('；')}` : '成长曲线：暂无';
}

/** 功法面板：显示已学功法、境界、经验和技能 */
export class TechniquePanel {
  private pane = document.getElementById('pane-technique')!;
  private onCultivate: ((techId: string | null) => void) | null = null;

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">尚未习得功法</div>';
  }

  setCallbacks(onCultivate: (techId: string | null) => void): void {
    this.onCultivate = onCultivate;
  }

  update(techniques: TechniqueState[], cultivatingTechId?: string): void {
    this.render(techniques, cultivatingTechId);
  }

  initFromPlayer(player: PlayerState): void {
    this.render(player.techniques, player.cultivatingTechId);
  }

  private render(techniques: TechniqueState[], cultivatingTechId?: string): void {
    if (techniques.length === 0) {
      this.clear();
      return;
    }

    let html = '';
    for (const tech of techniques) {
      const isCultivating = cultivatingTechId === tech.techId;
      const expPercent = tech.expToNext > 0 ? Math.floor((tech.exp / tech.expToNext) * 100) : 100;
      const currentAttrs = calcTechniqueAttrValues(tech.level, tech.attrCurves);
      const nextAttrs = calcTechniqueNextLevelGains(tech.level, tech.attrCurves);
      const curveDetails = formatCurveDetails(tech.attrCurves);
      const skillHtml = tech.skills.length > 0
        ? tech.skills.map((skill) => `
            <div class="skill-chip">
              <div class="skill-chip-title">${skill.name}</div>
              <div class="skill-chip-meta">射程 ${skill.range} · 威力 ${skill.power} · 冷却 ${skill.cooldown}s</div>
            </div>
          `).join('')
        : '<div class="empty-hint compact">暂无可用招式</div>';

      html += `<div class="tech-card">
        <div class="tech-head">
          <span class="tech-name">${tech.name}</span>
          <span class="tech-realm">${tech.grade ? TECHNIQUE_GRADE_LABELS[tech.grade] : '无品'}</span>
          <span class="tech-realm">${REALM_NAMES[tech.realm]}</span>
        </div>
        <div class="tech-exp-bar">
          <div class="tech-exp-fill" style="width:${expPercent}%"></div>
        </div>
        <div class="tech-meta">
          <span>层级 ${tech.level}</span>
          <span>经验 ${tech.exp}/${tech.expToNext > 0 ? tech.expToNext : '满'}</span>
        </div>`;
      html += `<div class="tech-meta">
          <span>${formatAttrMap('本法原始加成 ', currentAttrs)}</span>
          <span>${formatAttrMap('下层原始收益 ', nextAttrs)}</span>
        </div>`;
      html += `<div class="tech-meta"><span>${curveDetails}</span></div>`;

      html += `<div class="tech-skills">${skillHtml}</div>`;

      if (isCultivating) {
        html += `<button class="small-btn danger" data-cultivate-stop="${tech.techId}">停止修炼</button>`;
      } else {
        html += `<button class="small-btn" data-cultivate="${tech.techId}">修炼</button>`;
      }

      html += '</div>';
    }

    this.pane.innerHTML = html;

    this.pane.querySelectorAll('[data-cultivate]').forEach(btn => {
      btn.addEventListener('click', () => {
        const techId = (btn as HTMLElement).dataset.cultivate!;
        this.onCultivate?.(techId);
      });
    });
    this.pane.querySelectorAll('[data-cultivate-stop]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.onCultivate?.(null);
      });
    });
  }
}
