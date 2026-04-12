import {
  ATTR_KEY_LABELS,
  BodyTrainingState,
  BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
  calcBodyTrainingAttrBonus,
  getBodyTrainingExpToNext,
  normalizeBodyTrainingState,
} from '@mud/shared-next';
import type { PlayerState } from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';
import { formatDisplayInteger } from '../../utils/number';

/** BodyTrainingPlayerSnapshot：定义该类型的结构与数据语义。 */
type BodyTrainingPlayerSnapshot = Pick<PlayerState, 'bodyTraining' | 'foundation'>;

/** BodyTrainingInfusionPlan：定义该类型的结构与数据语义。 */
type BodyTrainingInfusionPlan = {
/** levelGain：定义该变量以承载业务值。 */
  levelGain: number;
/** expNeeded：定义该变量以承载业务值。 */
  expNeeded: number;
/** foundationCost：定义该变量以承载业务值。 */
  foundationCost: number;
/** previewState：定义该变量以承载业务值。 */
  previewState: BodyTrainingState;
};

/** BodyTrainingInfusionMode：定义该类型的结构与数据语义。 */
type BodyTrainingInfusionMode = 'level' | 'all';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** getProgressRatio：执行对应的业务逻辑。 */
function getProgressRatio(state: BodyTrainingState): number {
  if (state.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, state.exp / state.expToNext));
}

/** formatBonusSummary：执行对应的业务逻辑。 */
function formatBonusSummary(state: BodyTrainingState): string {
/** attrs：定义该变量以承载业务值。 */
  const attrs = calcBodyTrainingAttrBonus(state.level);
  if (state.level <= 0) {
    return '四维暂未提升';
  }
  return (['constitution', 'spirit', 'perception', 'talent'] as const)
    .map((key) => `${ATTR_KEY_LABELS[key]}+${formatDisplayInteger(attrs[key] ?? 0)}`)
    .join(' / ');
}

/** normalizeFoundation：执行对应的业务逻辑。 */
function normalizeFoundation(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** applyFoundationInfusion：执行对应的业务逻辑。 */
function applyFoundationInfusion(state: BodyTrainingState, foundationSpent: number): BodyTrainingState {
  if (foundationSpent <= 0) {
    return state;
  }
  return normalizeBodyTrainingState({
    level: state.level,
    exp: state.exp + foundationSpent * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
    expToNext: state.expToNext,
  });
}

/** getExpNeededForLevelGain：执行对应的业务逻辑。 */
function getExpNeededForLevelGain(state: BodyTrainingState, levelGain: number): number {
/** normalizedGain：定义该变量以承载业务值。 */
  const normalizedGain = Math.max(0, Math.floor(levelGain));
  if (normalizedGain <= 0) {
    return 0;
  }
/** currentLevel：定义该变量以承载业务值。 */
  let currentLevel = state.level;
/** currentExp：定义该变量以承载业务值。 */
  let currentExp = state.exp;
/** currentExpToNext：定义该变量以承载业务值。 */
  let currentExpToNext = state.expToNext;
/** expNeeded：定义该变量以承载业务值。 */
  let expNeeded = 0;
  for (let index = 0; index < normalizedGain; index += 1) {
    expNeeded += Math.max(0, currentExpToNext - currentExp);
    currentLevel += 1;
    currentExp = 0;
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
  return expNeeded;
}

/** getMaxAffordableLevelGain：执行对应的业务逻辑。 */
function getMaxAffordableLevelGain(state: BodyTrainingState, foundation: number): number {
/** normalizedFoundation：定义该变量以承载业务值。 */
  const normalizedFoundation = normalizeFoundation(foundation);
  if (normalizedFoundation <= 0) {
    return 0;
  }
/** currentLevel：定义该变量以承载业务值。 */
  let currentLevel = state.level;
/** currentExp：定义该变量以承载业务值。 */
  let currentExp = state.exp;
/** currentExpToNext：定义该变量以承载业务值。 */
  let currentExpToNext = state.expToNext;
/** accumulatedExpNeeded：定义该变量以承载业务值。 */
  let accumulatedExpNeeded = 0;
/** levelGain：定义该变量以承载业务值。 */
  let levelGain = 0;
  while (true) {
    accumulatedExpNeeded += Math.max(0, currentExpToNext - currentExp);
/** foundationCost：定义该变量以承载业务值。 */
    const foundationCost = Math.ceil(accumulatedExpNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
    if (foundationCost > normalizedFoundation) {
      return levelGain;
    }
    levelGain += 1;
    currentLevel += 1;
    currentExp = 0;
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
}

/** buildInfusionPlan：执行对应的业务逻辑。 */
function buildInfusionPlan(state: BodyTrainingState, levelGain: number): BodyTrainingInfusionPlan {
/** normalizedLevelGain：定义该变量以承载业务值。 */
  const normalizedLevelGain = Math.max(0, Math.floor(levelGain));
/** expNeeded：定义该变量以承载业务值。 */
  const expNeeded = getExpNeededForLevelGain(state, normalizedLevelGain);
/** foundationCost：定义该变量以承载业务值。 */
  const foundationCost = Math.ceil(expNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
  return {
    levelGain: normalizedLevelGain,
    expNeeded,
    foundationCost,
    previewState: applyFoundationInfusion(state, foundationCost),
  };
}

/** buildAllInfusionPlan：执行对应的业务逻辑。 */
function buildAllInfusionPlan(state: BodyTrainingState, foundation: number): BodyTrainingInfusionPlan {
/** foundationCost：定义该变量以承载业务值。 */
  const foundationCost = normalizeFoundation(foundation);
  return {
    levelGain: Math.max(0, normalizeBodyTrainingState({
      level: state.level,
      exp: state.exp + foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
      expToNext: state.expToNext,
    }).level - state.level),
    expNeeded: foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
    foundationCost,
    previewState: applyFoundationInfusion(state, foundationCost),
  };
}

/** BodyTrainingPanel：封装相关状态与行为。 */
export class BodyTrainingPanel {
  private static readonly MODAL_OWNER = 'body-training-infuse-modal';

  private pane = document.getElementById('pane-body-training')!;
/** baseState：定义该变量以承载业务值。 */
  private baseState: BodyTrainingState = normalizeBodyTrainingState();
/** displayState：定义该变量以承载业务值。 */
  private displayState: BodyTrainingState = normalizeBodyTrainingState();
  private baseFoundation = 0;
  private displayFoundation = 0;
  private infusionModalOpen = false;
/** selectedInfusionMode：定义该变量以承载业务值。 */
  private selectedInfusionMode: BodyTrainingInfusionMode = 'level';
  private selectedLevelGain = 1;
  private onInfuse: ((foundationSpent: number) => void) | null = null;

  setInfusionHandler(handler: ((foundationSpent: number) => void) | null): void {
    this.onInfuse = handler;
    if (!this.onInfuse) {
      this.closeInfusionModal();
    }
    this.patchOrRender();
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.closeInfusionModal();
    this.baseState = normalizeBodyTrainingState();
    this.displayState = this.baseState;
    this.baseFoundation = 0;
    this.displayFoundation = 0;
    this.patchOrRender();
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: BodyTrainingPlayerSnapshot): void {
    this.baseState = normalizeBodyTrainingState(player.bodyTraining);
    this.baseFoundation = normalizeFoundation(player.foundation);
    this.syncDisplayState();
    this.render(this.displayState, this.displayFoundation);
  }

/** syncFoundation：执行对应的业务逻辑。 */
  syncFoundation(foundation?: number | null): void {
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.patchOrRender();
    this.refreshInfusionModal();
  }

/** update：执行对应的业务逻辑。 */
  update(bodyTraining?: BodyTrainingState | null, foundation?: number | null): void {
    this.baseState = normalizeBodyTrainingState(bodyTraining);
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.render(this.displayState, this.displayFoundation);
    this.refreshInfusionModal();
  }

/** syncDynamic：执行对应的业务逻辑。 */
  syncDynamic(bodyTraining?: BodyTrainingState | null, foundation?: number | null): void {
    this.baseState = normalizeBodyTrainingState(bodyTraining);
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.patchOrRender();
    this.refreshInfusionModal();
  }

/** syncDisplayState：执行对应的业务逻辑。 */
  private syncDisplayState(): void {
    this.displayState = this.baseState;
    this.displayFoundation = this.baseFoundation;
  }

/** render：执行对应的业务逻辑。 */
  private render(state: BodyTrainingState, foundation: number): void {
/** progressRatio：定义该变量以承载业务值。 */
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
              <span class="body-training-card-label">当前底蕴</span>
              <strong class="body-training-card-value" data-body-foundation="true">${formatDisplayInteger(foundation)}</strong>
              <span class="body-training-card-note" data-body-foundation-note="true">${escapeHtml(this.getFoundationNote())}</span>
            </article>
            <article class="body-training-card body-training-card--wide body-training-card--accent">
              <span class="body-training-card-label">灌注炼体</span>
              <strong class="body-training-card-value" data-body-infuse-preview="true">${escapeHtml(this.getInfusionPreviewHeadline())}</strong>
              <span class="body-training-card-note" data-body-infuse-detail="true">${escapeHtml(this.getInfusionPreviewDetail())}</span>
              <button class="small-btn body-training-infuse-btn" type="button" data-body-infuse="true"${this.isInfusionButtonDisabled() ? ' disabled' : ''}>${escapeHtml(this.getInfusionButtonLabel())}</button>
            </article>
          </section>
        </div>
      `;
    });
    this.bindEvents();
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(): void {
    this.pane.querySelector<HTMLButtonElement>('[data-body-infuse="true"]')?.addEventListener('click', () => {
      this.openInfusionModal();
    });
  }

/** patch：执行对应的业务逻辑。 */
  private patch(state: BodyTrainingState, foundation: number): boolean {
/** levelNode：定义该变量以承载业务值。 */
    const levelNode = this.pane.querySelector<HTMLElement>('[data-body-level="true"]');
/** progressNode：定义该变量以承载业务值。 */
    const progressNode = this.pane.querySelector<HTMLElement>('[data-body-progress="true"]');
/** fillNode：定义该变量以承载业务值。 */
    const fillNode = this.pane.querySelector<HTMLElement>('[data-body-progress-fill="true"]');
/** remainNode：定义该变量以承载业务值。 */
    const remainNode = this.pane.querySelector<HTMLElement>('[data-body-remain="true"]');
/** bonusNode：定义该变量以承载业务值。 */
    const bonusNode = this.pane.querySelector<HTMLElement>('[data-body-bonus-summary="true"]');
/** foundationNode：定义该变量以承载业务值。 */
    const foundationNode = this.pane.querySelector<HTMLElement>('[data-body-foundation="true"]');
/** foundationNoteNode：定义该变量以承载业务值。 */
    const foundationNoteNode = this.pane.querySelector<HTMLElement>('[data-body-foundation-note="true"]');
/** previewNode：定义该变量以承载业务值。 */
    const previewNode = this.pane.querySelector<HTMLElement>('[data-body-infuse-preview="true"]');
/** detailNode：定义该变量以承载业务值。 */
    const detailNode = this.pane.querySelector<HTMLElement>('[data-body-infuse-detail="true"]');
/** buttonNode：定义该变量以承载业务值。 */
    const buttonNode = this.pane.querySelector<HTMLButtonElement>('[data-body-infuse="true"]');
    if (!levelNode
      || !progressNode
      || !fillNode
      || !remainNode
      || !bonusNode
      || !foundationNode
      || !foundationNoteNode
      || !previewNode
      || !detailNode
      || !buttonNode) {
      return false;
    }
    levelNode.textContent = `第 ${formatDisplayInteger(state.level)} 层`;
    progressNode.textContent = `${formatDisplayInteger(state.exp)}/${formatDisplayInteger(state.expToNext)}`;
    fillNode.style.width = `${(getProgressRatio(state) * 100).toFixed(2)}%`;
    remainNode.textContent = `距下一层还需 ${formatDisplayInteger(Math.max(0, state.expToNext - state.exp))} 炼体经验`;
    bonusNode.textContent = formatBonusSummary(state);
    foundationNode.textContent = formatDisplayInteger(foundation);
    foundationNoteNode.textContent = this.getFoundationNote();
    previewNode.textContent = this.getInfusionPreviewHeadline();
    detailNode.textContent = this.getInfusionPreviewDetail();
    buttonNode.textContent = this.getInfusionButtonLabel();
    buttonNode.disabled = this.isInfusionButtonDisabled();
    return true;
  }

/** patchOrRender：执行对应的业务逻辑。 */
  private patchOrRender(): void {
    if (!this.patch(this.displayState, this.displayFoundation)) {
      this.render(this.displayState, this.displayFoundation);
    }
  }

/** openInfusionModal：执行对应的业务逻辑。 */
  private openInfusionModal(): void {
    if (this.isInfusionButtonDisabled()) {
      return;
    }
    this.infusionModalOpen = true;
    this.selectedInfusionMode = this.getMaxLevelGain() > 0 ? this.selectedInfusionMode : 'all';
    this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain);
    this.renderInfusionModal();
  }

/** closeInfusionModal：执行对应的业务逻辑。 */
  private closeInfusionModal(): void {
    if (!this.infusionModalOpen && !detailModalHost.isOpenFor(BodyTrainingPanel.MODAL_OWNER)) {
      return;
    }
    this.infusionModalOpen = false;
    detailModalHost.close(BodyTrainingPanel.MODAL_OWNER);
  }

/** refreshInfusionModal：执行对应的业务逻辑。 */
  private refreshInfusionModal(): void {
    if (!this.infusionModalOpen) {
      return;
    }
    if (this.baseFoundation <= 0 || !this.onInfuse) {
      this.closeInfusionModal();
      return;
    }
/** maxLevelGain：定义该变量以承载业务值。 */
    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      this.selectedInfusionMode = 'all';
    }
    this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain);
    this.renderInfusionModal();
  }

/** renderInfusionModal：执行对应的业务逻辑。 */
  private renderInfusionModal(): void {
/** maxLevelGain：定义该变量以承载业务值。 */
    const maxLevelGain = this.getMaxLevelGain();
    if (!this.infusionModalOpen || this.baseFoundation <= 0 || !this.onInfuse) {
      this.closeInfusionModal();
      return;
    }
/** plan：定义该变量以承载业务值。 */
    const plan = this.getSelectedPlan();
    detailModalHost.open({
      ownerId: BodyTrainingPanel.MODAL_OWNER,
      variantClass: 'detail-modal--body-training-infuse',
      title: '灌注炼体',
      subtitle: `当前第 ${formatDisplayInteger(this.baseState.level)} 层`,
      hint: '点击空白处关闭',
      bodyHtml: this.renderInfusionModalBody(plan, maxLevelGain),
      onClose: () => {
        this.infusionModalOpen = false;
      },
      onAfterRender: (body) => {
        this.bindInfusionModalEvents(body, maxLevelGain);
      },
    });
  }

/** renderInfusionModalBody：执行对应的业务逻辑。 */
  private renderInfusionModalBody(plan: BodyTrainingInfusionPlan, maxLevelGain: number): string {
/** inAllMode：定义该变量以承载业务值。 */
    const inAllMode = this.selectedInfusionMode === 'all';
/** canDecrease：定义该变量以承载业务值。 */
    const canDecrease = plan.levelGain > 1;
/** canIncrease：定义该变量以承载业务值。 */
    const canIncrease = plan.levelGain < maxLevelGain;
    return `
      <div class="body-training-infuse-modal">
        <section class="body-training-infuse-summary">
          <article class="body-training-infuse-stat">
            <span class="body-training-infuse-stat-label">可用底蕴</span>
            <strong class="body-training-infuse-stat-value">${formatDisplayInteger(this.baseFoundation)}</strong>
          </article>
          <article class="body-training-infuse-stat">
            <span class="body-training-infuse-stat-label">${maxLevelGain > 0 ? '最多可升' : '当前可灌'}</span>
            <strong class="body-training-infuse-stat-value">${maxLevelGain > 0 ? `+${formatDisplayInteger(maxLevelGain)} 层` : `${formatDisplayInteger(this.baseFoundation)} 底蕴`}</strong>
          </article>
        </section>
        <section class="body-training-infuse-picker">
          <div class="body-training-infuse-picker-label">选择灌注方式</div>
          <div class="body-training-infuse-picker-row">
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="-10" ${(inAllMode || plan.levelGain <= 10) ? 'disabled' : ''}>-10</button>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="-1" ${(inAllMode || !canDecrease) ? 'disabled' : ''}>-1</button>
            <strong class="body-training-infuse-picker-value">${inAllMode ? '全部底蕴' : `+${formatDisplayInteger(plan.levelGain)} 层`}</strong>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="1" ${(inAllMode || !canIncrease) ? 'disabled' : ''}>+1</button>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="10" ${(inAllMode || plan.levelGain + 10 > maxLevelGain) ? 'disabled' : ''}>+10</button>
            <button class="small-btn ghost ${inAllMode ? 'active' : ''}" type="button" data-body-infuse-all="true" ${this.baseFoundation > 0 ? '' : 'disabled'}>全部灌注</button>
          </div>
        </section>
        <section class="body-training-infuse-preview">
          <div class="body-training-infuse-preview-row">
            <span>消耗底蕴</span>
            <strong>${formatDisplayInteger(plan.foundationCost)}</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>转化经验</span>
            <strong>${formatDisplayInteger(plan.foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER)}</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>预计境界</span>
            <strong>第 ${formatDisplayInteger(plan.previewState.level)} 层</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>预计当前经验</span>
            <strong>${formatDisplayInteger(plan.previewState.exp)}/${formatDisplayInteger(plan.previewState.expToNext)}</strong>
          </div>
        </section>
        <div class="body-training-infuse-note">
          ${inAllMode
            ? `本次将直接灌入全部 ${formatDisplayInteger(plan.foundationCost)} 点底蕴。`
            : `本次需要 ${formatDisplayInteger(plan.expNeeded)} 点炼体经验，换算为 ${formatDisplayInteger(plan.foundationCost)} 点底蕴。`}
        </div>
        <div class="body-training-infuse-actions">
          <button class="small-btn ghost" type="button" data-body-infuse-close="true">取消</button>
          <button class="small-btn" type="button" data-body-infuse-confirm="true">确认灌注</button>
        </div>
      </div>
    `;
  }

/** bindInfusionModalEvents：执行对应的业务逻辑。 */
  private bindInfusionModalEvents(body: HTMLElement, maxLevelGain: number): void {
    body.querySelectorAll<HTMLElement>('[data-body-infuse-adjust]').forEach((button) => button.addEventListener('click', () => {
/** delta：定义该变量以承载业务值。 */
      const delta = Number.parseInt(button.dataset.bodyInfuseAdjust ?? '0', 10);
      if (!Number.isFinite(delta) || delta === 0) {
        return;
      }
      this.selectedInfusionMode = 'level';
      this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain + delta);
      this.renderInfusionModal();
    }));
    body.querySelector<HTMLElement>('[data-body-infuse-all="true"]')?.addEventListener('click', () => {
      this.selectedInfusionMode = 'all';
      this.selectedLevelGain = Math.max(1, Math.min(maxLevelGain, this.selectedLevelGain || 1));
      this.renderInfusionModal();
    });
    body.querySelector<HTMLElement>('[data-body-infuse-close="true"]')?.addEventListener('click', () => {
      this.closeInfusionModal();
    });
    body.querySelector<HTMLElement>('[data-body-infuse-confirm="true"]')?.addEventListener('click', () => {
/** plan：定义该变量以承载业务值。 */
      const plan = this.getSelectedPlan();
      if (!this.onInfuse || plan.foundationCost <= 0 || plan.foundationCost > this.baseFoundation) {
        return;
      }
      this.baseState = plan.previewState;
      this.baseFoundation = Math.max(0, this.baseFoundation - plan.foundationCost);
      this.syncDisplayState();
      this.patchOrRender();
      this.closeInfusionModal();
      this.onInfuse(plan.foundationCost);
    });
  }

/** getMaxLevelGain：执行对应的业务逻辑。 */
  private getMaxLevelGain(): number {
    return getMaxAffordableLevelGain(this.baseState, this.baseFoundation);
  }

/** clampLevelGain：执行对应的业务逻辑。 */
  private clampLevelGain(levelGain: number): number {
/** maxLevelGain：定义该变量以承载业务值。 */
    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      return 1;
    }
    return Math.max(1, Math.min(maxLevelGain, Math.floor(levelGain || 1)));
  }

/** isInfusionButtonDisabled：执行对应的业务逻辑。 */
  private isInfusionButtonDisabled(): boolean {
    return this.baseFoundation <= 0 || !this.onInfuse;
  }

/** getInfusionButtonLabel：执行对应的业务逻辑。 */
  private getInfusionButtonLabel(): string {
    if (!this.onInfuse) {
      return '暂不可用';
    }
    if (this.baseFoundation <= 0) {
      return '底蕴不足';
    }
    return '灌注';
  }

/** getInfusionPreviewHeadline：执行对应的业务逻辑。 */
  private getInfusionPreviewHeadline(): string {
/** maxLevelGain：定义该变量以承载业务值。 */
    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      return '可先灌注底蕴积累经验';
    }
    return `本次最多可提升 ${formatDisplayInteger(maxLevelGain)} 层`;
  }

/** getInfusionPreviewDetail：执行对应的业务逻辑。 */
  private getInfusionPreviewDetail(): string {
    if (this.baseFoundation <= 0) {
      return '当前没有可用于灌注的底蕴。';
    }
    if (this.getMaxLevelGain() <= 0) {
      return `当前底蕴暂不足提升一层，可直接灌注 ${formatDisplayInteger(this.baseFoundation)} 点底蕴。`;
    }
    return `1 点底蕴 = ${formatDisplayInteger(BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER)} 点炼体经验。`;
  }

/** getFoundationNote：执行对应的业务逻辑。 */
  private getFoundationNote(): string {
/** maxLevelGain：定义该变量以承载业务值。 */
    const maxLevelGain = this.getMaxLevelGain();
    if (this.baseFoundation <= 0) {
      return '当前没有可用于灌注的底蕴。';
    }
    if (maxLevelGain <= 0) {
      return `当前可直接灌入 ${formatDisplayInteger(this.baseFoundation)} 点底蕴。`;
    }
    return `当前最多可直达第 ${formatDisplayInteger(this.baseState.level + maxLevelGain)} 层。`;
  }

/** getSelectedPlan：执行对应的业务逻辑。 */
  private getSelectedPlan(): BodyTrainingInfusionPlan {
    if (this.selectedInfusionMode === 'all') {
      return buildAllInfusionPlan(this.baseState, this.baseFoundation);
    }
    return buildInfusionPlan(this.baseState, this.clampLevelGain(this.selectedLevelGain));
  }
}

