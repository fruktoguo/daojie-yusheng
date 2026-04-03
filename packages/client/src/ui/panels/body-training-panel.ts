import {
  ATTR_KEY_LABELS,
  BodyTrainingState,
  calcBodyTrainingAttrBonus,
  normalizeBodyTrainingState,
} from '@mud/shared';
import type { PlayerState } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';
import { formatDisplayInteger } from '../../utils/number';

const BODY_TRAINING_ATTR_KEYS = ['constitution', 'spirit', 'perception', 'talent'] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getProgressRatio(state: BodyTrainingState): number {
  if (state.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, state.exp / state.expToNext));
}

function formatBonusSummary(state: BodyTrainingState): string {
  const attrs = calcBodyTrainingAttrBonus(state.level);
  if (state.level <= 0) {
    return '四维暂未提升';
  }
  return BODY_TRAINING_ATTR_KEYS
    .map((key) => `${ATTR_KEY_LABELS[key]}+${formatDisplayInteger(attrs[key] ?? 0)}`)
    .join(' / ');
}

export class BodyTrainingPanel {
  private pane = document.getElementById('pane-body-training')!;
  private lastState: BodyTrainingState = normalizeBodyTrainingState();

  clear(): void {
    this.lastState = normalizeBodyTrainingState();
    this.render(this.lastState);
  }

  initFromPlayer(player: PlayerState): void {
    this.update(player.bodyTraining);
  }

  update(bodyTraining?: BodyTrainingState | null): void {
    const nextState = normalizeBodyTrainingState(bodyTraining);
    this.lastState = nextState;
    this.render(nextState);
  }

  syncDynamic(bodyTraining?: BodyTrainingState | null): void {
    const nextState = normalizeBodyTrainingState(bodyTraining);
    this.lastState = nextState;
    if (!this.patch(nextState)) {
      this.render(nextState);
    }
  }

  private render(state: BodyTrainingState): void {
    const progressRatio = getProgressRatio(state);
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = `
        <div class="body-training-panel">
          <section class="body-training-hero">
            <div class="body-training-hero-main">
              <span class="body-training-kicker">炼体层数</span>
              <strong class="body-training-level" data-body-level="true">第 ${formatDisplayInteger(state.level)} 层</strong>
              <span class="body-training-progress-text" data-body-progress="true">${formatDisplayInteger(state.exp)}/${formatDisplayInteger(state.expToNext)}</span>
            </div>
            <div class="body-training-progress-bar">
              <span class="body-training-progress-fill" data-body-progress-fill="true" style="width:${(progressRatio * 100).toFixed(2)}%"></span>
            </div>
            <div class="body-training-hero-note" data-body-remain="true">距下一层还需 ${formatDisplayInteger(Math.max(0, state.expToNext - state.exp))} 炼体经验</div>
          </section>
          <section class="body-training-grid">
            <article class="body-training-card">
              <span class="body-training-card-label">当前总加成</span>
              <strong class="body-training-card-value" data-body-bonus-summary="true">${escapeHtml(formatBonusSummary(state))}</strong>
            </article>
            <article class="body-training-card">
              <span class="body-training-card-label">经验规则</span>
              <strong class="body-training-card-value">首层 10000，每层递增 20%</strong>
            </article>
            <article class="body-training-card body-training-card--wide">
              <span class="body-training-card-label">经验流向</span>
              <strong class="body-training-card-value">未设置主修，或所有功法圆满后，后续获得的功法经验都会自动转入炼体</strong>
            </article>
          </section>
          <section class="body-training-attrs">
            ${BODY_TRAINING_ATTR_KEYS.map((key) => `
              <article class="body-training-attr-chip">
                <span class="body-training-attr-label">${escapeHtml(ATTR_KEY_LABELS[key])}</span>
                <strong class="body-training-attr-value" data-body-attr="${key}">+${formatDisplayInteger(state.level)}</strong>
              </article>
            `).join('')}
          </section>
        </div>
      `;
    });
  }

  private patch(state: BodyTrainingState): boolean {
    const levelNode = this.pane.querySelector<HTMLElement>('[data-body-level="true"]');
    const progressNode = this.pane.querySelector<HTMLElement>('[data-body-progress="true"]');
    const fillNode = this.pane.querySelector<HTMLElement>('[data-body-progress-fill="true"]');
    const remainNode = this.pane.querySelector<HTMLElement>('[data-body-remain="true"]');
    const bonusNode = this.pane.querySelector<HTMLElement>('[data-body-bonus-summary="true"]');
    if (!levelNode || !progressNode || !fillNode || !remainNode || !bonusNode) {
      return false;
    }
    levelNode.textContent = `第 ${formatDisplayInteger(state.level)} 层`;
    progressNode.textContent = `${formatDisplayInteger(state.exp)}/${formatDisplayInteger(state.expToNext)}`;
    fillNode.style.width = `${(getProgressRatio(state) * 100).toFixed(2)}%`;
    remainNode.textContent = `距下一层还需 ${formatDisplayInteger(Math.max(0, state.expToNext - state.exp))} 炼体经验`;
    bonusNode.textContent = formatBonusSummary(state);
    for (const key of BODY_TRAINING_ATTR_KEYS) {
      const node = this.pane.querySelector<HTMLElement>(`[data-body-attr="${key}"]`);
      if (!node) {
        return false;
      }
      node.textContent = `+${formatDisplayInteger(state.level)}`;
    }
    return true;
  }
}
