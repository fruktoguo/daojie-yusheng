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
import { createSmallBtn } from '../ui-primitives';
import { formatDisplayInteger } from '../../utils/number';

/** BodyTrainingPlayerSnapshot：玩家炼体与底蕴的读取快照。 */
type BodyTrainingPlayerSnapshot = Pick<PlayerState, 'bodyTraining' | 'foundation'>;

/** BodyTrainingInfusionPlan：炼体灌注的预览方案。 */
type BodyTrainingInfusionPlan = {
/**
 * levelGain：等级Gain相关字段。
 */

  levelGain: number;  
  /**
 * expNeeded：expNeeded相关字段。
 */

  expNeeded: number;  
  /**
 * foundationCost：foundation消耗数值。
 */

  foundationCost: number;  
  /**
 * previewState：preview状态状态或数据块。
 */

  previewState: BodyTrainingState;
};

/** BodyTrainingInfusionMode：模式枚举。 */
type BodyTrainingInfusionMode = 'level' | 'all';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** getProgressRatio：读取进度Ratio。 */
function getProgressRatio(state: BodyTrainingState): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (state.expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, state.exp / state.expToNext));
}

/** formatBonusSummary：格式化Bonus摘要。 */
function formatBonusSummary(state: BodyTrainingState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const attrs = calcBodyTrainingAttrBonus(state.level);
  if (state.level <= 0) {
    return '四维暂未提升';
  }
  return (['constitution', 'spirit', 'perception', 'talent'] as const)
    .map((key) => `${ATTR_KEY_LABELS[key]}+${formatDisplayInteger(attrs[key] ?? 0)}`)
    .join(' / ');
}

/** normalizeFoundation：规范化Foundation。 */
function normalizeFoundation(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** applyFoundationInfusion：应用Foundation Infusion。 */
function applyFoundationInfusion(state: BodyTrainingState, foundationSpent: number): BodyTrainingState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (foundationSpent <= 0) {
    return state;
  }
  return normalizeBodyTrainingState({
    level: state.level,
    exp: state.exp + foundationSpent * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
    expToNext: state.expToNext,
  });
}

/** getExpNeededForLevelGain：读取Exp Needed For等级Gain。 */
function getExpNeededForLevelGain(state: BodyTrainingState, levelGain: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedGain = Math.max(0, Math.floor(levelGain));
  if (normalizedGain <= 0) {
    return 0;
  }
  let currentLevel = state.level;
  let currentExp = state.exp;
  let currentExpToNext = state.expToNext;
  let expNeeded = 0;
  for (let index = 0; index < normalizedGain; index += 1) {
    expNeeded += Math.max(0, currentExpToNext - currentExp);
    currentLevel += 1;
    /** currentExp：当前Exp。 */
    currentExp = 0;
    /** currentExpToNext：当前Exp To新版。 */
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
  return expNeeded;
}

/** getMaxAffordableLevelGain：读取最大Affordable等级Gain。 */
function getMaxAffordableLevelGain(state: BodyTrainingState, foundation: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedFoundation = normalizeFoundation(foundation);
  if (normalizedFoundation <= 0) {
    return 0;
  }
  let currentLevel = state.level;
  let currentExp = state.exp;
  let currentExpToNext = state.expToNext;
  let accumulatedExpNeeded = 0;
  let levelGain = 0;
  while (true) {
    accumulatedExpNeeded += Math.max(0, currentExpToNext - currentExp);
    const foundationCost = Math.ceil(accumulatedExpNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
    if (foundationCost > normalizedFoundation) {
      return levelGain;
    }
    levelGain += 1;
    currentLevel += 1;
    /** currentExp：当前Exp。 */
    currentExp = 0;
    /** currentExpToNext：当前Exp To新版。 */
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
}

/** buildInfusionPlan：构建Infusion规划。 */
function buildInfusionPlan(state: BodyTrainingState, levelGain: number): BodyTrainingInfusionPlan {
  const normalizedLevelGain = Math.max(0, Math.floor(levelGain));
  const expNeeded = getExpNeededForLevelGain(state, normalizedLevelGain);
  const foundationCost = Math.ceil(expNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
  return {
    levelGain: normalizedLevelGain,
    expNeeded,
    foundationCost,
    previewState: applyFoundationInfusion(state, foundationCost),
  };
}

/** buildAllInfusionPlan：构建All Infusion规划。 */
function buildAllInfusionPlan(state: BodyTrainingState, foundation: number): BodyTrainingInfusionPlan {
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

/** BodyTrainingPanel：身体修炼面板实现。 */
export class BodyTrainingPanel {
  /** eventsBound：事件Bound。 */
  private eventsBound = false;
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'body-training-infuse-modal';

  /** pane：pane。 */
  private pane = document.getElementById('pane-body-training')!;
  /** baseState：基础状态。 */
  private baseState: BodyTrainingState = normalizeBodyTrainingState();
  /** displayState：显示状态。 */
  private displayState: BodyTrainingState = normalizeBodyTrainingState();
  /** baseFoundation：基础Foundation。 */
  private baseFoundation = 0;
  /** displayFoundation：显示Foundation。 */
  private displayFoundation = 0;
  /** infusionModalOpen：infusion弹窗Open。 */
  private infusionModalOpen = false;
  /** selectedInfusionMode：selected Infusion模式。 */
  private selectedInfusionMode: BodyTrainingInfusionMode = 'level';
  /** selectedLevelGain：selected等级Gain。 */
  private selectedLevelGain = 1;
  /** onInfuse：on Infuse。 */
  private onInfuse: ((foundationSpent: number) => void) | null = null;
  /** levelNode：等级节点。 */
  private levelNode: HTMLElement | null = null;
  /** progressNode：进度节点。 */
  private progressNode: HTMLElement | null = null;
  /** fillNode：fill节点。 */
  private fillNode: HTMLElement | null = null;
  /** remainNode：remain节点。 */
  private remainNode: HTMLElement | null = null;
  /** bonusNode：bonus节点。 */
  private bonusNode: HTMLElement | null = null;
  /** foundationNode：foundation节点。 */
  private foundationNode: HTMLElement | null = null;
  /** foundationNoteNode：foundation Note节点。 */
  private foundationNoteNode: HTMLElement | null = null;
  /** previewNode：preview节点。 */
  private previewNode: HTMLElement | null = null;
  /** detailNode：详情节点。 */
  private detailNode: HTMLElement | null = null;
  /** buttonNode：按钮节点。 */
  private buttonNode: HTMLButtonElement | null = null;  
  /**
 * setInfusionHandler：写入InfusionHandler。
 * @param handler ((foundationSpent: number) => void) | null 参数说明。
 * @returns 无返回值，直接更新InfusionHandler相关状态。
 */


  setInfusionHandler(handler: ((foundationSpent: number) => void) | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.onInfuse = handler;
    if (!this.onInfuse) {
      this.closeInfusionModal();
    }
    this.patchOrRender();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.closeInfusionModal();
    this.baseState = normalizeBodyTrainingState();
    this.displayState = this.baseState;
    this.baseFoundation = 0;
    this.displayFoundation = 0;
    this.patchOrRender();
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: BodyTrainingPlayerSnapshot): void {
    this.baseState = normalizeBodyTrainingState(player.bodyTraining);
    this.baseFoundation = normalizeFoundation(player.foundation);
    this.syncDisplayState();
    this.render(this.displayState, this.displayFoundation);
  }

  /** syncFoundation：同步Foundation。 */
  syncFoundation(foundation?: number | null): void {
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.patchOrRender();
    this.refreshInfusionModal();
  }

  /** update：更新更新。 */
  update(bodyTraining?: BodyTrainingState | null, foundation?: number | null): void {
    this.baseState = normalizeBodyTrainingState(bodyTraining);
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.render(this.displayState, this.displayFoundation);
    this.refreshInfusionModal();
  }

  /** syncDynamic：同步Dynamic。 */
  syncDynamic(bodyTraining?: BodyTrainingState | null, foundation?: number | null): void {
    this.baseState = normalizeBodyTrainingState(bodyTraining);
    this.baseFoundation = normalizeFoundation(foundation);
    this.syncDisplayState();
    this.patchOrRender();
    this.refreshInfusionModal();
  }

  /** syncDisplayState：同步显示状态。 */
  private syncDisplayState(): void {
    this.displayState = this.baseState;
    this.displayFoundation = this.baseFoundation;
  }

  /** render：渲染渲染。 */
  private render(state: BodyTrainingState, foundation: number): void {
    this.ensureStructure();
    this.patch(state, foundation);
  }

  /** bindEvents：绑定事件。 */
  private bindEvents(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.eventsBound) {
      return;
    }
    this.eventsBound = true;
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-body-infuse="true"]')) {
        this.openInfusionModal();
      }
    });
  }

  /** ensureStructure：确保Structure。 */
  private ensureStructure(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.levelNode
      && this.progressNode
      && this.fillNode
      && this.remainNode
      && this.bonusNode
      && this.foundationNode
      && this.foundationNoteNode
      && this.previewNode
      && this.detailNode
      && this.buttonNode) {
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'body-training-panel';

    const heroSection = document.createElement('section');
    heroSection.className = 'body-training-hero';

    const heroMain = document.createElement('div');
    heroMain.className = 'body-training-hero-main';

    const kickerNode = document.createElement('span');
    kickerNode.className = 'body-training-kicker';
    kickerNode.textContent = '炼体层数';

    const levelNode = document.createElement('strong');
    levelNode.className = 'body-training-level';
    levelNode.dataset.bodyLevel = 'true';

    const progressNode = document.createElement('span');
    progressNode.className = 'body-training-progress-text';
    progressNode.dataset.bodyProgress = 'true';

    heroMain.append(kickerNode, levelNode, progressNode);

    const progressBar = document.createElement('div');
    progressBar.className = 'body-training-progress-bar';

    const fillNode = document.createElement('span');
    fillNode.className = 'body-training-progress-fill';
    fillNode.dataset.bodyProgressFill = 'true';
    progressBar.append(fillNode);

    const remainNode = document.createElement('div');
    remainNode.className = 'body-training-hero-note';
    remainNode.dataset.bodyRemain = 'true';

    heroSection.append(heroMain, progressBar, remainNode);

    const gridSection = document.createElement('section');
    gridSection.className = 'body-training-grid';

    const bonusCard = document.createElement('article');
    bonusCard.className = 'body-training-card';
    const bonusLabel = document.createElement('span');
    bonusLabel.className = 'body-training-card-label';
    bonusLabel.textContent = '当前总加成';
    const bonusNode = document.createElement('strong');
    bonusNode.className = 'body-training-card-value';
    bonusNode.dataset.bodyBonusSummary = 'true';
    bonusCard.append(bonusLabel, bonusNode);

    const foundationCard = document.createElement('article');
    foundationCard.className = 'body-training-card';
    const foundationLabel = document.createElement('span');
    foundationLabel.className = 'body-training-card-label';
    foundationLabel.textContent = '当前底蕴';
    const foundationNode = document.createElement('strong');
    foundationNode.className = 'body-training-card-value';
    foundationNode.dataset.bodyFoundation = 'true';
    const foundationNoteNode = document.createElement('span');
    foundationNoteNode.className = 'body-training-card-note';
    foundationNoteNode.dataset.bodyFoundationNote = 'true';
    foundationCard.append(foundationLabel, foundationNode, foundationNoteNode);

    const infuseCard = document.createElement('article');
    infuseCard.className = 'body-training-card body-training-card--wide body-training-card--accent';
    const infuseLabel = document.createElement('span');
    infuseLabel.className = 'body-training-card-label';
    infuseLabel.textContent = '灌注炼体';
    const previewNode = document.createElement('strong');
    previewNode.className = 'body-training-card-value';
    previewNode.dataset.bodyInfusePreview = 'true';
    const detailNode = document.createElement('span');
    detailNode.className = 'body-training-card-note';
    detailNode.dataset.bodyInfuseDetail = 'true';
    const buttonNode = createSmallBtn('灌注炼体', {
      className: 'body-training-infuse-btn',
      dataset: { bodyInfuse: 'true' },
    });
    infuseCard.append(infuseLabel, previewNode, detailNode, buttonNode);

    gridSection.append(bonusCard, foundationCard, infuseCard);
    panel.append(heroSection, gridSection);

    this.pane.replaceChildren(panel);
    this.levelNode = levelNode;
    this.progressNode = progressNode;
    this.fillNode = fillNode;
    this.remainNode = remainNode;
    this.bonusNode = bonusNode;
    this.foundationNode = foundationNode;
    this.foundationNoteNode = foundationNoteNode;
    this.previewNode = previewNode;
    this.detailNode = detailNode;
    this.buttonNode = buttonNode;
    this.bindEvents();
  }

  /** patch：处理patch。 */
  private patch(state: BodyTrainingState, foundation: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const levelNode = this.levelNode;
    const progressNode = this.progressNode;
    const fillNode = this.fillNode;
    const remainNode = this.remainNode;
    const bonusNode = this.bonusNode;
    const foundationNode = this.foundationNode;
    const foundationNoteNode = this.foundationNoteNode;
    const previewNode = this.previewNode;
    const detailNode = this.detailNode;
    const buttonNode = this.buttonNode;
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

  /** patchOrRender：处理patch Or渲染。 */
  private patchOrRender(): void {
    if (!this.patch(this.displayState, this.displayFoundation)) {
      this.render(this.displayState, this.displayFoundation);
    }
  }

  /** openInfusionModal：打开Infusion弹窗。 */
  private openInfusionModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.isInfusionButtonDisabled()) {
      return;
    }
    this.infusionModalOpen = true;
    this.selectedInfusionMode = this.getMaxLevelGain() > 0 ? this.selectedInfusionMode : 'all';
    this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain);
    this.renderInfusionModal();
  }

  /** closeInfusionModal：关闭Infusion弹窗。 */
  private closeInfusionModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.infusionModalOpen && !detailModalHost.isOpenFor(BodyTrainingPanel.MODAL_OWNER)) {
      return;
    }
    this.infusionModalOpen = false;
    detailModalHost.close(BodyTrainingPanel.MODAL_OWNER);
  }

  /** refreshInfusionModal：处理refresh Infusion弹窗。 */
  private refreshInfusionModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.infusionModalOpen) {
      return;
    }
    if (this.baseFoundation <= 0 || !this.onInfuse) {
      this.closeInfusionModal();
      return;
    }
    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      this.selectedInfusionMode = 'all';
    }
    this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain);
    this.renderInfusionModal();
  }

  /** renderInfusionModal：渲染Infusion弹窗。 */
  private renderInfusionModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const maxLevelGain = this.getMaxLevelGain();
    if (!this.infusionModalOpen || this.baseFoundation <= 0 || !this.onInfuse) {
      this.closeInfusionModal();
      return;
    }
    const plan = this.getSelectedPlan();
    const existingBody = detailModalHost.isOpenFor(BodyTrainingPanel.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (existingBody && this.patchInfusionModalBody(existingBody, plan, maxLevelGain)) {
      return;
    }
    detailModalHost.open({
      ownerId: BodyTrainingPanel.MODAL_OWNER,
      size: 'sm',
      variantClass: 'detail-modal--body-training-infuse',
      title: '灌注炼体',
      subtitle: `当前第 ${formatDisplayInteger(this.baseState.level)} 层`,
      hint: '点击空白处关闭',
      renderBody: (body) => {
        body.innerHTML = this.renderInfusionModalBody(plan, maxLevelGain);
      },
      onClose: () => {
        this.infusionModalOpen = false;
      },
      onAfterRender: (body) => {
        this.bindInfusionModalEvents(body);
      },
    });
  }

  /** patchInfusionModalBody：局部刷新 Infusion 弹层。 */
  private patchInfusionModalBody(body: HTMLElement, plan: BodyTrainingInfusionPlan, maxLevelGain: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const root = body.querySelector<HTMLElement>('.body-training-infuse-modal');
    if (!root) {
      return false;
    }
    const inAllMode = this.selectedInfusionMode === 'all';
    const canDecrease = plan.levelGain > 1;
    const canIncrease = plan.levelGain < maxLevelGain;
    setTextContent(body, '[data-body-infuse-available="true"]', formatDisplayInteger(this.baseFoundation));
    setTextContent(
      body,
      '[data-body-infuse-max="true"]',
      maxLevelGain > 0 ? `+${formatDisplayInteger(maxLevelGain)} 层` : `${formatDisplayInteger(this.baseFoundation)} 底蕴`,
    );
    setTextContent(
      body,
      '[data-body-infuse-picker-value="true"]',
      inAllMode ? '全部底蕴' : `+${formatDisplayInteger(plan.levelGain)} 层`,
    );
    setTextContent(body, '[data-body-infuse-foundation-cost="true"]', formatDisplayInteger(plan.foundationCost));
    setTextContent(
      body,
      '[data-body-infuse-exp-gain="true"]',
      formatDisplayInteger(plan.foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER),
    );
    setTextContent(body, '[data-body-infuse-preview-level="true"]', `第 ${formatDisplayInteger(plan.previewState.level)} 层`);
    setTextContent(
      body,
      '[data-body-infuse-preview-exp="true"]',
      `${formatDisplayInteger(plan.previewState.exp)}/${formatDisplayInteger(plan.previewState.expToNext)}`,
    );
    setTextContent(
      body,
      '[data-body-infuse-note="true"]',
      inAllMode
        ? `本次将直接灌入全部 ${formatDisplayInteger(plan.foundationCost)} 点底蕴。`
        : `本次需要 ${formatDisplayInteger(plan.expNeeded)} 点炼体经验，换算为 ${formatDisplayInteger(plan.foundationCost)} 点底蕴。`,
    );
    patchInfusionAdjustButton(body, '-10', !inAllMode, inAllMode || plan.levelGain <= 10);
    patchInfusionAdjustButton(body, '-1', !inAllMode, inAllMode || !canDecrease);
    patchInfusionAdjustButton(body, '1', !inAllMode, inAllMode || !canIncrease);
    patchInfusionAdjustButton(body, '10', !inAllMode, inAllMode || plan.levelGain + 10 > maxLevelGain);
    const allButton = body.querySelector<HTMLButtonElement>('[data-body-infuse-all="true"]');
    if (allButton) {
      allButton.classList.toggle('active', inAllMode);
      allButton.disabled = this.baseFoundation <= 0;
    }
    return true;
  }

  /** renderInfusionModalBody：渲染Infusion弹窗身体。 */
  private renderInfusionModalBody(plan: BodyTrainingInfusionPlan, maxLevelGain: number): string {
    const inAllMode = this.selectedInfusionMode === 'all';
    const canDecrease = plan.levelGain > 1;
    const canIncrease = plan.levelGain < maxLevelGain;
    return `
      <div class="body-training-infuse-modal">
        <section class="body-training-infuse-summary">
          <article class="body-training-infuse-stat">
            <span class="body-training-infuse-stat-label">可用底蕴</span>
            <strong class="body-training-infuse-stat-value" data-body-infuse-available="true">${formatDisplayInteger(this.baseFoundation)}</strong>
          </article>
          <article class="body-training-infuse-stat">
            <span class="body-training-infuse-stat-label">${maxLevelGain > 0 ? '最多可升' : '当前可灌'}</span>
            <strong class="body-training-infuse-stat-value" data-body-infuse-max="true">${maxLevelGain > 0 ? `+${formatDisplayInteger(maxLevelGain)} 层` : `${formatDisplayInteger(this.baseFoundation)} 底蕴`}</strong>
          </article>
        </section>
        <section class="body-training-infuse-picker">
          <div class="body-training-infuse-picker-label">选择灌注方式</div>
          <div class="body-training-infuse-picker-row">
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="-10" ${(inAllMode || plan.levelGain <= 10) ? 'disabled' : ''}>-10</button>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="-1" ${(inAllMode || !canDecrease) ? 'disabled' : ''}>-1</button>
            <strong class="body-training-infuse-picker-value" data-body-infuse-picker-value="true">${inAllMode ? '全部底蕴' : `+${formatDisplayInteger(plan.levelGain)} 层`}</strong>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="1" ${(inAllMode || !canIncrease) ? 'disabled' : ''}>+1</button>
            <button class="small-btn ghost ${!inAllMode ? 'active' : ''}" type="button" data-body-infuse-adjust="10" ${(inAllMode || plan.levelGain + 10 > maxLevelGain) ? 'disabled' : ''}>+10</button>
            <button class="small-btn ghost ${inAllMode ? 'active' : ''}" type="button" data-body-infuse-all="true" ${this.baseFoundation > 0 ? '' : 'disabled'}>全部灌注</button>
          </div>
        </section>
        <section class="body-training-infuse-preview">
          <div class="body-training-infuse-preview-row">
            <span>消耗底蕴</span>
            <strong data-body-infuse-foundation-cost="true">${formatDisplayInteger(plan.foundationCost)}</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>转化经验</span>
            <strong data-body-infuse-exp-gain="true">${formatDisplayInteger(plan.foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER)}</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>预计境界</span>
            <strong data-body-infuse-preview-level="true">第 ${formatDisplayInteger(plan.previewState.level)} 层</strong>
          </div>
          <div class="body-training-infuse-preview-row">
            <span>预计当前经验</span>
            <strong data-body-infuse-preview-exp="true">${formatDisplayInteger(plan.previewState.exp)}/${formatDisplayInteger(plan.previewState.expToNext)}</strong>
          </div>
        </section>
        <div class="body-training-infuse-note" data-body-infuse-note="true">
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

  /** bindInfusionModalEvents：绑定Infusion弹窗事件。 */
  private bindInfusionModalEvents(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (body.dataset.bodyInfuseBound === 'true') {
      return;
    }
    body.dataset.bodyInfuseBound = 'true';
    body.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-body-infuse-adjust],[data-body-infuse-all],[data-body-infuse-close],[data-body-infuse-confirm]') : null;
      if (!target || !(target instanceof HTMLButtonElement) || target.disabled) {
        return;
      }
      if (target.dataset.bodyInfuseAdjust) {
        const delta = Number.parseInt(target.dataset.bodyInfuseAdjust, 10);
        if (!Number.isFinite(delta) || delta === 0) {
          return;
        }
        this.selectedInfusionMode = 'level';
        this.selectedLevelGain = this.clampLevelGain(this.selectedLevelGain + delta);
        this.renderInfusionModal();
        return;
      }
      if (target.dataset.bodyInfuseAll === 'true') {
        this.selectedInfusionMode = 'all';
        this.selectedLevelGain = Math.max(1, Math.min(this.getMaxLevelGain(), this.selectedLevelGain || 1));
        this.renderInfusionModal();
        return;
      }
      if (target.dataset.bodyInfuseClose === 'true') {
        this.closeInfusionModal();
        return;
      }
      if (target.dataset.bodyInfuseConfirm === 'true') {
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
      }
    });
  }

  /** getMaxLevelGain：读取最大等级Gain。 */
  private getMaxLevelGain(): number {
    return getMaxAffordableLevelGain(this.baseState, this.baseFoundation);
  }

  /** clampLevelGain：处理clamp等级Gain。 */
  private clampLevelGain(levelGain: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      return 1;
    }
    return Math.max(1, Math.min(maxLevelGain, Math.floor(levelGain || 1)));
  }

  /** isInfusionButtonDisabled：判断是否Infusion按钮Disabled。 */
  private isInfusionButtonDisabled(): boolean {
    return this.baseFoundation <= 0 || !this.onInfuse;
  }

  /** getInfusionButtonLabel：读取Infusion按钮标签。 */
  private getInfusionButtonLabel(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.onInfuse) {
      return '暂不可用';
    }
    if (this.baseFoundation <= 0) {
      return '底蕴不足';
    }
    return '灌注';
  }

  /** getInfusionPreviewHeadline：读取Infusion Preview Headline。 */
  private getInfusionPreviewHeadline(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const maxLevelGain = this.getMaxLevelGain();
    if (maxLevelGain <= 0) {
      return '可先灌注底蕴积累经验';
    }
    return `本次最多可提升 ${formatDisplayInteger(maxLevelGain)} 层`;
  }

  /** getInfusionPreviewDetail：读取Infusion Preview详情。 */
  private getInfusionPreviewDetail(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.baseFoundation <= 0) {
      return '当前没有可用于灌注的底蕴。';
    }
    if (this.getMaxLevelGain() <= 0) {
      return `当前底蕴暂不足提升一层，可直接灌注 ${formatDisplayInteger(this.baseFoundation)} 点底蕴。`;
    }
    return `1 点底蕴 = ${formatDisplayInteger(BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER)} 点炼体经验。`;
  }

  /** getFoundationNote：读取Foundation Note。 */
  private getFoundationNote(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const maxLevelGain = this.getMaxLevelGain();
    if (this.baseFoundation <= 0) {
      return '当前没有可用于灌注的底蕴。';
    }
    if (maxLevelGain <= 0) {
      return `当前可直接灌入 ${formatDisplayInteger(this.baseFoundation)} 点底蕴。`;
    }
    return `当前最多可直达第 ${formatDisplayInteger(this.baseState.level + maxLevelGain)} 层。`;
  }

  /** getSelectedPlan：读取Selected规划。 */
  private getSelectedPlan(): BodyTrainingInfusionPlan {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.selectedInfusionMode === 'all') {
      return buildAllInfusionPlan(this.baseState, this.baseFoundation);
    }
    return buildInfusionPlan(this.baseState, this.clampLevelGain(this.selectedLevelGain));
  }
}

/** setTextContent：设置文本内容。 */
function setTextContent(root: ParentNode, selector: string, value: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const element = root.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = value;
  }
}

/** patchInfusionAdjustButton：更新灌注调整按钮。 */
function patchInfusionAdjustButton(root: ParentNode, delta: string, active: boolean, disabled: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const button = root.querySelector<HTMLButtonElement>(`[data-body-infuse-adjust="${delta}"]`);
  if (!button) {
    return;
  }
  button.classList.toggle('active', active);
  button.disabled = disabled;
}
