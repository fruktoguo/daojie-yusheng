/**
 * 本文件负责 炼体 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { StrictMode, memo, useCallback, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  BodyTrainingState,
  BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
  calcBodyTrainingAttrPercentBonus,
  getBodyTrainingExpToNext,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { formatDisplayInteger } from '../../../utils/number';
import { t } from '../../../ui/i18n';
import { detailModalHost } from '../../../ui/detail-modal-host';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function normalizeFoundation(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function getProgressRatio(state: BodyTrainingState): number {
  if (state.expToNext <= 0) return 1;
  return Math.max(0, Math.min(1, state.exp / state.expToNext));
}

function formatBonusSummary(state: BodyTrainingState): string {
  if (state.level <= 0) return t('body-training.bonus.none');
  const attrs = calcBodyTrainingAttrPercentBonus(state.level);
  return t('body-training.bonus.all-attrs', { percent: formatDisplayInteger(attrs.constitution ?? 0) });
}

function applyFoundationInfusion(state: BodyTrainingState, foundationSpent: number): BodyTrainingState {
  if (foundationSpent <= 0) return state;
  return normalizeBodyTrainingState({
    level: state.level,
    exp: state.exp + foundationSpent * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
    expToNext: state.expToNext,
  });
}

function getExpNeededForLevelGain(state: BodyTrainingState, levelGain: number): number {
  const normalizedGain = Math.max(0, Math.floor(levelGain));
  if (normalizedGain <= 0) return 0;
  let currentLevel = state.level;
  let currentExp = state.exp;
  let currentExpToNext = state.expToNext;
  let expNeeded = 0;
  for (let i = 0; i < normalizedGain; i++) {
    expNeeded += Math.max(0, currentExpToNext - currentExp);
    currentLevel += 1;
    currentExp = 0;
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
  return expNeeded;
}

function getMaxAffordableLevelGain(state: BodyTrainingState, foundation: number): number {
  const nf = normalizeFoundation(foundation);
  if (nf <= 0) return 0;
  let currentLevel = state.level;
  let currentExp = state.exp;
  let currentExpToNext = state.expToNext;
  let accExpNeeded = 0;
  let levelGain = 0;
  while (true) {
    accExpNeeded += Math.max(0, currentExpToNext - currentExp);
    const cost = Math.ceil(accExpNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
    if (cost > nf) return levelGain;
    levelGain += 1;
    currentLevel += 1;
    currentExp = 0;
    currentExpToNext = getBodyTrainingExpToNext(currentLevel);
  }
}

type InfusionMode = 'level' | 'all';

interface InfusionPlan {
  levelGain: number;
  expNeeded: number;
  foundationCost: number;
  previewState: BodyTrainingState;
}

function buildInfusionPlan(state: BodyTrainingState, levelGain: number): InfusionPlan {
  const ng = Math.max(0, Math.floor(levelGain));
  const expNeeded = getExpNeededForLevelGain(state, ng);
  const foundationCost = Math.ceil(expNeeded / BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER);
  return { levelGain: ng, expNeeded, foundationCost, previewState: applyFoundationInfusion(state, foundationCost) };
}

function buildAllInfusionPlan(state: BodyTrainingState, foundation: number): InfusionPlan {
  const foundationCost = normalizeFoundation(foundation);
  const previewState = applyFoundationInfusion(state, foundationCost);
  return {
    levelGain: Math.max(0, previewState.level - state.level),
    expNeeded: foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
    foundationCost,
    previewState,
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface BodyTrainingPanelState {
  bodyTraining: BodyTrainingState;
  foundation: number;
}

export const { store: bodyTrainingPanelStore, useStore: useBodyTrainingPanelStore } = createPanelStore<BodyTrainingPanelState>({
  bodyTraining: normalizeBodyTrainingState(),
  foundation: 0,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface BodyTrainingCallbacks {
  onInfuse: ((foundationSpent: number) => void) | null;
}

const callbacks: BodyTrainingCallbacks = { onInfuse: null };

export function setBodyTrainingCallbacks(cbs: Partial<BodyTrainingCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── 主面板组件 ──────────────────────────────────────────────────────────────

export function BodyTrainingPanel() {
  const { bodyTraining: state, foundation } = useBodyTrainingPanelStore();

  const maxLevelGain = useMemo(() => getMaxAffordableLevelGain(state, foundation), [state, foundation]);
  const canInfuse = foundation > 0 && callbacks.onInfuse !== null;

  const handleOpenInfusion = useCallback(() => {
    if (!canInfuse) return;
    const meta = getBodyTrainingInfuseModalMeta(state.level);
    detailModalHost.open({
      ownerId: BODY_TRAINING_INFUSE_MODAL_OWNER,
      size: meta.size,
      variantClass: meta.variantClass,
      title: meta.title,
      subtitle: meta.subtitle,
      hint: meta.hint,
      renderBody: (body) => {
        body.replaceChildren();
      },
      onAfterRender: (body, signal) => {
        mountInfusionModalBody(body, signal, {
          state,
          foundation,
          maxLevelGain,
          onConfirm: (foundationSpent) => {
            callbacks.onInfuse?.(foundationSpent);
            detailModalHost.close(BODY_TRAINING_INFUSE_MODAL_OWNER);
          },
        });
      },
      onClose: unmountInfusionModalBody,
    });
  }, [canInfuse, foundation, maxLevelGain, state]);

  const progressRatio = getProgressRatio(state);
  const bonusSummary = formatBonusSummary(state);

  const foundationNote = useMemo(() => {
    if (foundation <= 0) return t('body-training.infuse.no-foundation');
    if (maxLevelGain <= 0) return t('body-training.foundation.direct-infuse', { foundation: formatDisplayInteger(foundation) });
    return t('body-training.foundation.max-reach-level', { level: formatDisplayInteger(state.level + maxLevelGain) });
  }, [foundation, maxLevelGain, state.level]);

  const infusePreviewHeadline = useMemo(() => {
    if (maxLevelGain <= 0) return t('body-training.infuse.preview.no-level-gain');
    return t('body-training.infuse.preview.max-level-gain', { level: formatDisplayInteger(maxLevelGain) });
  }, [maxLevelGain]);

  const infusePreviewDetail = useMemo(() => {
    if (foundation <= 0) return t('body-training.infuse.no-foundation');
    if (maxLevelGain <= 0) return t('body-training.infuse.detail.insufficient-one-level', { foundation: formatDisplayInteger(foundation) });
    return t('body-training.infuse.detail.rate', { exp: formatDisplayInteger(BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER) });
  }, [foundation, maxLevelGain]);

  const infuseButtonLabel = useMemo(() => {
    if (!callbacks.onInfuse) return t('body-training.infuse.unavailable');
    if (foundation <= 0) return t('body-training.infuse.insufficient-foundation');
    return t('body-training.infuse.action');
  }, [foundation]);

  return (
    <div className="body-training-panel">
      {/* Hero section */}
      <section className="body-training-hero">
        <div className="body-training-hero-main">
          <span className="body-training-kicker">{t('body-training.kicker.level')}</span>
          <strong className="body-training-level" data-body-level="true">
            {t('body-training.level', { level: formatDisplayInteger(state.level) })}
          </strong>
          <span className="body-training-progress-text" data-body-progress="true">
            {formatDisplayInteger(state.exp)}/{formatDisplayInteger(state.expToNext)}
          </span>
        </div>
        <div className="body-training-progress-bar">
          <span className="body-training-progress-fill" data-body-progress-fill="true" style={{ width: `${(progressRatio * 100).toFixed(2)}%` }} />
        </div>
        <div className="body-training-hero-note" data-body-remain="true">
          {t('body-training.remain-exp', { exp: formatDisplayInteger(Math.max(0, state.expToNext - state.exp)) })}
        </div>
      </section>

      {/* Grid section */}
      <section className="body-training-grid">
        <article className="body-training-card">
          <span className="body-training-card-label">{t('body-training.label.current-bonus')}</span>
          <strong className="body-training-card-value" data-body-bonus-summary="true">{bonusSummary}</strong>
        </article>
        <article className="body-training-card">
          <span className="body-training-card-label">{t('body-training.label.current-foundation')}</span>
          <strong className="body-training-card-value" data-body-foundation="true">{formatDisplayInteger(foundation)}</strong>
          <span className="body-training-card-note" data-body-foundation-note="true">{foundationNote}</span>
        </article>
        <article className="body-training-card body-training-card--wide body-training-card--accent">
          <span className="body-training-card-label">{t('body-training.infuse.title')}</span>
          <strong className="body-training-card-value" data-body-infuse-preview="true">{infusePreviewHeadline}</strong>
          <span className="body-training-card-note" data-body-infuse-detail="true">{infusePreviewDetail}</span>
          <button
            className="small-btn body-training-infuse-btn"
            type="button"
            data-body-infuse="true"
            disabled={!canInfuse}
            onClick={handleOpenInfusion}
          >
            {infuseButtonLabel}
          </button>
        </article>
      </section>

    </div>
  );
}

// ─── 灌注弹层组件 ────────────────────────────────────────────────────────────

const BODY_TRAINING_INFUSE_MODAL_OWNER = 'body-training-infuse-modal';
let infusionModalRoot: Root | null = null;
let infusionModalHost: HTMLDivElement | null = null;

function mountInfusionModalBody(body: HTMLElement, signal: AbortSignal, props: {
  state: BodyTrainingState;
  foundation: number;
  maxLevelGain: number;
  onConfirm: (foundationSpent: number) => void;
}): void {
  unmountInfusionModalBody();
  infusionModalHost = document.createElement('div');
  infusionModalHost.className = 'react-panel-host';
  infusionModalHost.dataset.reactPanel = 'body-training-infuse';
  body.replaceChildren(infusionModalHost);
  infusionModalRoot = createRoot(infusionModalHost);
  infusionModalRoot.render(
    <StrictMode>
      <InfusionModal
        state={props.state}
        foundation={props.foundation}
        maxLevelGain={props.maxLevelGain}
        onClose={() => detailModalHost.close(BODY_TRAINING_INFUSE_MODAL_OWNER)}
        onConfirm={props.onConfirm}
      />
    </StrictMode>,
  );
  signal.addEventListener('abort', unmountInfusionModalBody, { once: true });
}

function unmountInfusionModalBody(): void {
  infusionModalRoot?.unmount();
  infusionModalRoot = null;
  infusionModalHost?.remove();
  infusionModalHost = null;
}

function InfusionModal({ state, foundation, maxLevelGain, onClose, onConfirm }: {
  state: BodyTrainingState;
  foundation: number;
  maxLevelGain: number;
  onClose: () => void;
  onConfirm: (foundationSpent: number) => void;
}) {
  const [mode, setMode] = useState<InfusionMode>(maxLevelGain > 0 ? 'level' : 'all');
  const [levelGain, setLevelGain] = useState(Math.max(1, Math.min(maxLevelGain, 1)));

  const clampedLevelGain = Math.max(1, Math.min(maxLevelGain, levelGain));
  const inAllMode = mode === 'all';

  const plan = useMemo(() => {
    if (inAllMode) return buildAllInfusionPlan(state, foundation);
    return buildInfusionPlan(state, clampedLevelGain);
  }, [state, foundation, inAllMode, clampedLevelGain]);

  const handleAdjust = useCallback((delta: number) => {
    setMode('level');
    setLevelGain((prev) => Math.max(1, Math.min(maxLevelGain, prev + delta)));
  }, [maxLevelGain]);

  const handleAll = useCallback(() => {
    setMode('all');
  }, []);

  const handleConfirm = useCallback(() => {
    if (plan.foundationCost <= 0 || plan.foundationCost > foundation) return;
    onConfirm(plan.foundationCost);
  }, [plan, foundation, onConfirm]);

  const canDecrease = clampedLevelGain > 1;
  const canIncrease = clampedLevelGain < maxLevelGain;

  return (
    <div className="body-training-infuse-modal">
      <section className="body-training-infuse-summary">
        <article className="body-training-infuse-stat">
          <span className="body-training-infuse-stat-label">{t('body-training.infuse.available-foundation')}</span>
          <strong className="body-training-infuse-stat-value" data-body-infuse-available="true">{formatDisplayInteger(foundation)}</strong>
        </article>
        <article className="body-training-infuse-stat">
          <span className="body-training-infuse-stat-label">
            {maxLevelGain > 0 ? t('body-training.infuse.max-level-gain-label') : t('body-training.infuse.available-infuse-label')}
          </span>
          <strong className="body-training-infuse-stat-value" data-body-infuse-max="true">
            {maxLevelGain > 0
              ? t('body-training.infuse.level-gain', { level: formatDisplayInteger(maxLevelGain) })
              : t('body-training.infuse.foundation-count', { count: formatDisplayInteger(foundation) })}
          </strong>
        </article>
      </section>

      <section className="body-training-infuse-picker">
        <div className="body-training-infuse-picker-label">{t('body-training.infuse.pick-mode')}</div>
        <div className="body-training-infuse-picker-row">
          <button className={`small-btn ghost${!inAllMode ? ' active' : ''}`} type="button" disabled={inAllMode || clampedLevelGain <= 10} onClick={() => handleAdjust(-10)}>-10</button>
          <button className={`small-btn ghost${!inAllMode ? ' active' : ''}`} type="button" disabled={inAllMode || !canDecrease} onClick={() => handleAdjust(-1)}>-1</button>
          <strong className="body-training-infuse-picker-value" data-body-infuse-picker-value="true">
            {inAllMode ? t('body-training.infuse.all-foundation') : t('body-training.infuse.level-gain', { level: formatDisplayInteger(clampedLevelGain) })}
          </strong>
          <button className={`small-btn ghost${!inAllMode ? ' active' : ''}`} type="button" disabled={inAllMode || !canIncrease} onClick={() => handleAdjust(1)}>+1</button>
          <button className={`small-btn ghost${!inAllMode ? ' active' : ''}`} type="button" disabled={inAllMode || clampedLevelGain + 10 > maxLevelGain} onClick={() => handleAdjust(10)}>+10</button>
          <button className={`small-btn ghost${inAllMode ? ' active' : ''}`} type="button" disabled={foundation <= 0} onClick={handleAll}>{t('body-training.infuse.all-action')}</button>
        </div>
      </section>

      <section className="body-training-infuse-preview">
        <div className="body-training-infuse-preview-row">
          <span>{t('body-training.infuse.cost-foundation')}</span>
          <strong data-body-infuse-foundation-cost="true">{formatDisplayInteger(plan.foundationCost)}</strong>
        </div>
        <div className="body-training-infuse-preview-row">
          <span>{t('body-training.infuse.convert-exp')}</span>
          <strong data-body-infuse-exp-gain="true">{formatDisplayInteger(plan.foundationCost * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER)}</strong>
        </div>
        <div className="body-training-infuse-preview-row">
          <span>{t('body-training.infuse.preview-level')}</span>
          <strong data-body-infuse-preview-level="true">{t('body-training.level', { level: formatDisplayInteger(plan.previewState.level) })}</strong>
        </div>
        <div className="body-training-infuse-preview-row">
          <span>{t('body-training.infuse.preview-exp')}</span>
          <strong data-body-infuse-preview-exp="true">{formatDisplayInteger(plan.previewState.exp)}/{formatDisplayInteger(plan.previewState.expToNext)}</strong>
        </div>
      </section>

      <div className="body-training-infuse-note" data-body-infuse-note="true">
        {inAllMode
          ? t('body-training.infuse.note.all', { cost: formatDisplayInteger(plan.foundationCost) })
          : t('body-training.infuse.note.level', { exp: formatDisplayInteger(plan.expNeeded), cost: formatDisplayInteger(plan.foundationCost) })}
      </div>

      <div className="body-training-infuse-actions">
        <button className="small-btn ghost" type="button" onClick={onClose}>{t('common.action.cancel')}</button>
        <button className="small-btn" type="button" onClick={handleConfirm}>{t('body-training.infuse.confirm')}</button>
      </div>
    </div>
  );
}

/** 获取灌注弹层 meta（用于 detailModal） */
export function getBodyTrainingInfuseModalMeta(level: number) {
  return {
    title: t('body-training.infuse.title'),
    subtitle: t('body-training.infuse.subtitle.current-level', { level: formatDisplayInteger(level) }),
    hint: t('common.modal.click-blank-close'),
    size: 'sm' as const,
    variantClass: 'detail-modal--body-training-infuse',
  };
}
