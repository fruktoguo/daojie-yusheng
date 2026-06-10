/**
 * 运行时新手导览层：遮罩、高亮、箭头和步骤推进。
 *
 * 该模块只处理客户端显示与点击引导，不参与服务端权威规则或玩家资产逻辑。
 */
import {
  GUIDED_TOUR_FLOWS,
  STARTER_GUIDED_TOUR_FLOW_ID,
  type GuidedTourFlow,
  type GuidedTourPlacement,
  type GuidedTourPrepareAction,
  type GuidedTourPrepareWhen,
  type GuidedTourStep,
} from '../constants/ui/guided-tour';
import { t } from './i18n';

type GuidedTourLayoutTarget = 'left' | 'right' | 'bottom';

export interface GuidedTourControls {
  switchTab: (tabName: string) => void;
  setLayoutCollapsed: (target: GuidedTourLayoutTarget, collapsed: boolean, options?: { persist?: boolean }) => void;
  isMobileLayoutActive: () => boolean;
}

interface GuidedTourOptions {
  documentRef: Document;
  windowRef: Window;
  controls: GuidedTourControls;
  flows?: GuidedTourFlow[];
}

interface GuidedTourStorageState {
  completed: Record<string, number>;
  dismissed: Record<string, number>;
}

interface ActiveTarget {
  element: HTMLElement;
  rect: DOMRect;
  paddedRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface GuidedTourDebugApi {
  start: (flowId?: string) => void;
  reset: (flowId?: string) => void;
  status: () => GuidedTourStorageState;
}

declare global {
  interface Window {
    __guidedTour?: GuidedTourDebugApi;
  }
}

const STORAGE_KEY = 'mud:guided-tour:v1';
const TARGET_PADDING = 8;
const VIEWPORT_MARGIN = 12;
const CARD_GAP = 16;
const TARGET_WAIT_TIMEOUT_MS = 3200;
const TARGET_WAIT_INTERVAL_MS = 80;

function emptyStorageState(): GuidedTourStorageState {
  return {
    completed: {},
    dismissed: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStorageState(value: unknown): GuidedTourStorageState {
  if (!isRecord(value)) {
    return emptyStorageState();
  }
  const completed = isRecord(value.completed) ? value.completed : {};
  const dismissed = isRecord(value.dismissed) ? value.dismissed : {};
  const normalized = emptyStorageState();
  for (const [key, version] of Object.entries(completed)) {
    if (typeof version === 'number' && Number.isFinite(version)) {
      normalized.completed[key] = version;
    }
  }
  for (const [key, version] of Object.entries(dismissed)) {
    if (typeof version === 'number' && Number.isFinite(version)) {
      normalized.dismissed[key] = version;
    }
  }
  return normalized;
}

function resolveCopy(key: string, fallback: string): string {
  return t(key, undefined, fallback);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getViewportSize(win: Window): { width: number; height: number } {
  return {
    width: Math.max(0, win.innerWidth || win.document.documentElement.clientWidth || 0),
    height: Math.max(0, win.innerHeight || win.document.documentElement.clientHeight || 0),
  };
}

/** GuidedTour：全局运行时导览控制器。 */
export class GuidedTour {
  private readonly documentRef: Document;
  private readonly windowRef: Window;
  private readonly controls: GuidedTourControls;
  private readonly flows: GuidedTourFlow[];
  private host: HTMLElement | null = null;
  private masks: Record<'top' | 'left' | 'right' | 'bottom', HTMLElement> | null = null;
  private highlight: HTMLElement | null = null;
  private arrow: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private activeFlow: GuidedTourFlow | null = null;
  private activeStepIndex = -1;
  private activeTarget: ActiveTarget | null = null;
  private repositionQueued = false;
  private initialized = false;
  private shellObserver: MutationObserver | null = null;

  constructor(options: GuidedTourOptions) {
    this.documentRef = options.documentRef;
    this.windowRef = options.windowRef;
    this.controls = options.controls;
    this.flows = options.flows ?? GUIDED_TOUR_FLOWS;
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.registerDebugApi();
    this.bindGlobalEvents();
    this.scheduleAutoStart();
  }

  start(flowId = STARTER_GUIDED_TOUR_FLOW_ID, options: { force?: boolean } = {}): void {
    const flow = this.flows.find((entry) => entry.id === flowId);
    if (!flow) {
      return;
    }
    if (this.activeFlow) {
      if (!options.force) {
        return;
      }
      this.close();
    }
    if (!options.force && this.isFlowClosed(flow)) {
      return;
    }
    void this.startFlow(flow);
  }

  reset(flowId?: string): void {
    const state = this.readStorageState();
    if (flowId) {
      delete state.completed[flowId];
      delete state.dismissed[flowId];
    } else {
      state.completed = {};
      state.dismissed = {};
    }
    this.writeStorageState(state);
  }

  private registerDebugApi(): void {
    this.windowRef.__guidedTour = {
      start: (flowId = STARTER_GUIDED_TOUR_FLOW_ID) => this.start(flowId, { force: true }),
      reset: (flowId) => this.reset(flowId),
      status: () => this.readStorageState(),
    };
  }

  private bindGlobalEvents(): void {
    this.windowRef.addEventListener('resize', () => this.queueReposition());
    this.windowRef.visualViewport?.addEventListener('resize', () => this.queueReposition());
    this.documentRef.addEventListener('scroll', () => this.queueReposition(), true);
    this.documentRef.addEventListener('click', (event) => this.handleDocumentClick(event), true);
    this.documentRef.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.activeFlow) {
        this.dismissActiveFlow();
      }
    });
  }

  private scheduleAutoStart(): void {
    const autoFlow = this.flows.find((flow) => flow.autoStart);
    if (!autoFlow || this.isFlowClosed(autoFlow)) {
      return;
    }
    const shell = this.documentRef.getElementById('game-shell');
    if (!shell) {
      return;
    }
    const tryStart = () => {
      if (!this.isShellVisible(shell) || this.isFlowClosed(autoFlow)) {
        return false;
      }
      this.windowRef.setTimeout(() => this.start(autoFlow.id), 650);
      return true;
    };
    if (tryStart()) {
      return;
    }
    this.shellObserver = new MutationObserver(() => {
      if (tryStart()) {
        this.shellObserver?.disconnect();
        this.shellObserver = null;
      }
    });
    this.shellObserver.observe(shell, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  private isShellVisible(shell: HTMLElement): boolean {
    return !shell.classList.contains('hidden') && isElementVisible(shell);
  }

  private async startFlow(flow: GuidedTourFlow): Promise<void> {
    this.activeFlow = flow;
    this.activeStepIndex = 0;
    this.ensureDom();
    await this.showActiveStep();
  }

  private async showActiveStep(): Promise<void> {
    const flow = this.activeFlow;
    if (!flow) {
      return;
    }
    const step = flow.steps[this.activeStepIndex];
    if (!step) {
      this.completeActiveFlow();
      return;
    }

    this.ensureDom();
    await this.applyPrepareActions(step.prepare ?? []);
    const target = await this.resolveTarget(step);
    if (!target) {
      this.activeStepIndex += 1;
      await this.showActiveStep();
      return;
    }
    this.activeTarget = target;
    this.setHostVisible(true);
    this.renderCard(flow, step);
    this.positionMask(target);
    this.positionCard(target, step.placement ?? 'auto');
    target.element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    await sleep(140);
    this.queueReposition();
    this.card?.focus({ preventScroll: true });
  }

  private async applyPrepareActions(actions: GuidedTourPrepareAction[]): Promise<void> {
    let changed = false;
    for (const action of actions) {
      if (!this.shouldRunPrepareAction(action.when)) {
        continue;
      }
      if (action.type === 'switch-tab') {
        this.controls.switchTab(action.tabName);
        changed = true;
      } else if (action.type === 'set-layout-collapsed') {
        this.controls.setLayoutCollapsed(action.target, action.collapsed, { persist: false });
        changed = true;
      }
    }
    if (changed) {
      await sleep(120);
    }
  }

  private shouldRunPrepareAction(when: GuidedTourPrepareWhen | undefined): boolean {
    if (!when || when === 'always') {
      return true;
    }
    const mobile = this.controls.isMobileLayoutActive();
    return when === 'mobile' ? mobile : !mobile;
  }

  private async resolveTarget(step: GuidedTourStep): Promise<ActiveTarget | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < TARGET_WAIT_TIMEOUT_MS) {
      const element = this.queryStepTarget(step);
      if (element && isElementVisible(element)) {
        return this.measureTarget(element);
      }
      await sleep(TARGET_WAIT_INTERVAL_MS);
    }
    return null;
  }

  private queryStepTarget(step: GuidedTourStep): HTMLElement | null {
    const selector = this.controls.isMobileLayoutActive() && step.mobileTargetSelector
      ? step.mobileTargetSelector
      : step.targetSelector;
    return this.documentRef.querySelector<HTMLElement>(selector);
  }

  private measureTarget(element: HTMLElement): ActiveTarget {
    const rect = element.getBoundingClientRect();
    const viewport = getViewportSize(this.windowRef);
    const left = clamp(rect.left - TARGET_PADDING, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN));
    const top = clamp(rect.top - TARGET_PADDING, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN));
    const right = clamp(rect.right + TARGET_PADDING, left + 1, Math.max(left + 1, viewport.width - VIEWPORT_MARGIN));
    const bottom = clamp(rect.bottom + TARGET_PADDING, top + 1, Math.max(top + 1, viewport.height - VIEWPORT_MARGIN));
    return {
      element,
      rect,
      paddedRect: {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      },
    };
  }

  private renderCard(flow: GuidedTourFlow, step: GuidedTourStep): void {
    if (!this.card) {
      return;
    }
    const stepTotal = flow.steps.length;
    const stepCurrent = this.activeStepIndex + 1;
    const targetClick = step.advanceMode === 'target-click';
    this.card.innerHTML = `
      <div class="guided-tour-card-kicker">${this.escapeHtml(resolveCopy(flow.titleKey, flow.titleFallback))}</div>
      <div class="guided-tour-card-title">${this.escapeHtml(resolveCopy(step.titleKey, step.titleFallback))}</div>
      <div class="guided-tour-card-body">${this.escapeHtml(resolveCopy(step.bodyKey, step.bodyFallback))}</div>
      <div class="guided-tour-progress" aria-label="${this.escapeHtml(t('guided-tour.progress.aria', { current: stepCurrent, total: stepTotal }, `第 ${stepCurrent} / ${stepTotal} 步`))}">
        <span>${this.escapeHtml(t('guided-tour.progress.label', { current: stepCurrent, total: stepTotal }, `${stepCurrent}/${stepTotal}`))}</span>
        <div class="guided-tour-progress-track">
          <div class="guided-tour-progress-fill" style="width:${Math.round((stepCurrent / stepTotal) * 100)}%"></div>
        </div>
      </div>
      <div class="guided-tour-actions">
        <button class="small-btn ghost" type="button" data-guided-tour-skip>${this.escapeHtml(t('guided-tour.action.skip', undefined, '跳过'))}</button>
        <button class="small-btn ghost" type="button" data-guided-tour-prev${this.activeStepIndex <= 0 ? ' disabled' : ''}>${this.escapeHtml(t('guided-tour.action.prev', undefined, '上一步'))}</button>
        <button class="small-btn" type="button" data-guided-tour-next>${this.escapeHtml(targetClick
          ? t('guided-tour.action.wait-target', undefined, '点击高亮处')
          : (stepCurrent >= stepTotal ? t('guided-tour.action.finish', undefined, '完成') : t('guided-tour.action.next', undefined, '下一步')))}</button>
      </div>
    `;
    this.card.querySelector<HTMLElement>('[data-guided-tour-skip]')?.addEventListener('click', () => this.dismissActiveFlow());
    this.card.querySelector<HTMLElement>('[data-guided-tour-prev]')?.addEventListener('click', () => {
      if (this.activeStepIndex > 0) {
        this.activeStepIndex -= 1;
        void this.showActiveStep();
      }
    });
    this.card.querySelector<HTMLElement>('[data-guided-tour-next]')?.addEventListener('click', () => {
      if (targetClick) {
        this.flashTarget();
        return;
      }
      void this.goNext();
    });
  }

  private ensureDom(): void {
    if (this.host) {
      return;
    }
    const host = this.documentRef.createElement('div');
    host.className = 'guided-tour-layer hidden';
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');

    const masks = {
      top: this.createMask('top'),
      left: this.createMask('left'),
      right: this.createMask('right'),
      bottom: this.createMask('bottom'),
    };
    const highlight = this.documentRef.createElement('div');
    highlight.className = 'guided-tour-highlight';
    const arrow = this.documentRef.createElement('div');
    arrow.className = 'guided-tour-arrow';
    const card = this.documentRef.createElement('section');
    card.className = 'guided-tour-card';
    card.tabIndex = -1;

    host.append(masks.top, masks.left, masks.right, masks.bottom, highlight, arrow, card);
    this.documentRef.body.append(host);
    this.host = host;
    this.masks = masks;
    this.highlight = highlight;
    this.arrow = arrow;
    this.card = card;
  }

  private createMask(name: string): HTMLElement {
    const mask = this.documentRef.createElement('div');
    mask.className = `guided-tour-mask guided-tour-mask--${name}`;
    mask.addEventListener('click', () => this.flashTarget());
    return mask;
  }

  private setHostVisible(visible: boolean): void {
    this.host?.classList.toggle('hidden', !visible);
    this.host?.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  private queueReposition(): void {
    if (!this.activeFlow || this.repositionQueued) {
      return;
    }
    this.repositionQueued = true;
    this.windowRef.requestAnimationFrame(() => {
      this.repositionQueued = false;
      this.reposition();
    });
  }

  private reposition(): void {
    const flow = this.activeFlow;
    if (!flow || this.activeStepIndex < 0) {
      return;
    }
    const step = flow.steps[this.activeStepIndex];
    const element = step ? this.queryStepTarget(step) : null;
    if (!step || !element || !isElementVisible(element)) {
      return;
    }
    this.activeTarget = this.measureTarget(element);
    this.positionMask(this.activeTarget);
    this.positionCard(this.activeTarget, step.placement ?? 'auto');
  }

  private positionMask(target: ActiveTarget): void {
    if (!this.masks || !this.highlight) {
      return;
    }
    const viewport = getViewportSize(this.windowRef);
    const rect = target.paddedRect;
    this.setRect(this.masks.top, 0, 0, viewport.width, rect.top);
    this.setRect(this.masks.left, 0, rect.top, rect.left, rect.height);
    this.setRect(this.masks.right, rect.right, rect.top, Math.max(0, viewport.width - rect.right), rect.height);
    this.setRect(this.masks.bottom, 0, rect.bottom, viewport.width, Math.max(0, viewport.height - rect.bottom));
    this.setRect(this.highlight, rect.left, rect.top, rect.width, rect.height);
  }

  private positionCard(target: ActiveTarget, preferredPlacement: GuidedTourPlacement): void {
    if (!this.card || !this.arrow) {
      return;
    }
    const viewport = getViewportSize(this.windowRef);
    const rect = target.paddedRect;
    const cardRect = this.card.getBoundingClientRect();
    const cardWidth = Math.min(Math.max(cardRect.width, 280), Math.max(280, viewport.width - VIEWPORT_MARGIN * 2));
    const cardHeight = Math.max(cardRect.height, 160);
    const placement = this.resolvePlacement(preferredPlacement, rect, cardWidth, cardHeight, viewport);
    let left = rect.left + rect.width / 2 - cardWidth / 2;
    let top = rect.bottom + CARD_GAP;

    if (placement === 'top') {
      top = rect.top - cardHeight - CARD_GAP;
    } else if (placement === 'right') {
      left = rect.right + CARD_GAP;
      top = rect.top + rect.height / 2 - cardHeight / 2;
    } else if (placement === 'left') {
      left = rect.left - cardWidth - CARD_GAP;
      top = rect.top + rect.height / 2 - cardHeight / 2;
    }

    left = clamp(left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - cardWidth - VIEWPORT_MARGIN));
    top = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - cardHeight - VIEWPORT_MARGIN));
    this.card.classList.remove('guided-tour-card--top', 'guided-tour-card--right', 'guided-tour-card--bottom', 'guided-tour-card--left');
    this.card.classList.add(`guided-tour-card--${placement}`);
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;
    this.card.style.width = `${cardWidth}px`;
    this.positionArrow(placement, rect, left, top, cardWidth, cardHeight);
  }

  private resolvePlacement(
    preferred: GuidedTourPlacement,
    rect: ActiveTarget['paddedRect'],
    cardWidth: number,
    cardHeight: number,
    viewport: { width: number; height: number },
  ): Exclude<GuidedTourPlacement, 'auto'> {
    const candidates: Array<Exclude<GuidedTourPlacement, 'auto'>> = preferred === 'auto'
      ? ['bottom', 'top', 'right', 'left']
      : [preferred, 'bottom', 'top', 'right', 'left'].filter((entry, index, list) => list.indexOf(entry) === index) as Array<Exclude<GuidedTourPlacement, 'auto'>>;
    for (const candidate of candidates) {
      if (candidate === 'bottom' && viewport.height - rect.bottom >= cardHeight + CARD_GAP + VIEWPORT_MARGIN) return candidate;
      if (candidate === 'top' && rect.top >= cardHeight + CARD_GAP + VIEWPORT_MARGIN) return candidate;
      if (candidate === 'right' && viewport.width - rect.right >= cardWidth + CARD_GAP + VIEWPORT_MARGIN) return candidate;
      if (candidate === 'left' && rect.left >= cardWidth + CARD_GAP + VIEWPORT_MARGIN) return candidate;
    }
    return 'bottom';
  }

  private positionArrow(
    placement: Exclude<GuidedTourPlacement, 'auto'>,
    targetRect: ActiveTarget['paddedRect'],
    cardLeft: number,
    cardTop: number,
    cardWidth: number,
    cardHeight: number,
  ): void {
    if (!this.arrow) {
      return;
    }
    this.arrow.className = `guided-tour-arrow guided-tour-arrow--${placement}`;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const cardCenterX = cardLeft + cardWidth / 2;
    const cardCenterY = cardTop + cardHeight / 2;
    const left = placement === 'left' || placement === 'right'
      ? (placement === 'left' ? cardLeft + cardWidth - 6 : cardLeft - 6)
      : clamp(targetCenterX - 6, cardLeft + 18, cardLeft + cardWidth - 30);
    const top = placement === 'top' || placement === 'bottom'
      ? (placement === 'top' ? cardTop + cardHeight - 6 : cardTop - 6)
      : clamp(targetCenterY - 6, cardTop + 18, cardTop + cardHeight - 30);
    this.arrow.style.left = `${Number.isFinite(left) ? left : cardCenterX}px`;
    this.arrow.style.top = `${Number.isFinite(top) ? top : cardCenterY}px`;
  }

  private setRect(element: HTMLElement, left: number, top: number, width: number, height: number): void {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${Math.max(0, width)}px`;
    element.style.height = `${Math.max(0, height)}px`;
  }

  private handleDocumentClick(event: MouseEvent): void {
    const flow = this.activeFlow;
    const target = this.activeTarget;
    if (!flow || !target) {
      return;
    }
    const step = flow.steps[this.activeStepIndex];
    if (step?.advanceMode !== 'target-click') {
      return;
    }
    if (event.target instanceof Node && target.element.contains(event.target)) {
      this.windowRef.setTimeout(() => {
        void this.goNext();
      }, 80);
    }
  }

  private async goNext(): Promise<void> {
    if (!this.activeFlow) {
      return;
    }
    this.activeStepIndex += 1;
    await this.showActiveStep();
  }

  private flashTarget(): void {
    this.highlight?.classList.remove('guided-tour-highlight--pulse');
    void this.highlight?.offsetWidth;
    this.highlight?.classList.add('guided-tour-highlight--pulse');
  }

  private completeActiveFlow(): void {
    const flow = this.activeFlow;
    if (flow) {
      const state = this.readStorageState();
      state.completed[flow.id] = flow.storageVersion;
      delete state.dismissed[flow.id];
      this.writeStorageState(state);
    }
    this.close();
  }

  private dismissActiveFlow(): void {
    const flow = this.activeFlow;
    if (flow) {
      const state = this.readStorageState();
      state.dismissed[flow.id] = flow.storageVersion;
      this.writeStorageState(state);
    }
    this.close();
  }

  private close(): void {
    this.activeFlow = null;
    this.activeStepIndex = -1;
    this.activeTarget = null;
    this.setHostVisible(false);
  }

  private isFlowClosed(flow: GuidedTourFlow): boolean {
    const state = this.readStorageState();
    return state.completed[flow.id] === flow.storageVersion || state.dismissed[flow.id] === flow.storageVersion;
  }

  private readStorageState(): GuidedTourStorageState {
    try {
      const raw = this.windowRef.localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeStorageState(JSON.parse(raw)) : emptyStorageState();
    } catch {
      return emptyStorageState();
    }
  }

  private writeStorageState(state: GuidedTourStorageState): void {
    try {
      this.windowRef.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时只影响是否自动再次弹出，不影响本次导览。
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
