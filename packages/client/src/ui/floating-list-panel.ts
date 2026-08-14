/**
 * 可拖拽浮动列表宿主，供 HUD 级轻量列表复用。
 *
 * 只负责位置、折叠和可见性；业务内容和按钮事件仍由各自面板绑定。
 */
export type FloatingListPanelState = {
  left: number | null;
  top: number | null;
  collapsed: boolean;
  closed: boolean;
};

export type FloatingListPanelOptions = {
  id: string;
  title: string;
  storageKey: string;
  className?: string;
  defaultLeft: number;
  defaultTop: number;
  minWidth?: number;
  maxWidth?: number;
  width?: number;
  height?: number;
  onBeforeClose?: () => void;
  onClose?: () => void;
};

export const LARGE_FLOATING_PANEL_WIDTH = 800;
export const LARGE_FLOATING_PANEL_HEIGHT = 450;

const DEFAULT_MIN_WIDTH = 240;
const DEFAULT_MAX_WIDTH = 420;
const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStoredState(storageKey: string): FloatingListPanelState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { left: null, top: null, collapsed: false, closed: false };
    }
    const parsed = JSON.parse(raw) as Partial<FloatingListPanelState>;
    return {
      left: typeof parsed.left === 'number' && Number.isFinite(parsed.left) ? parsed.left : null,
      top: typeof parsed.top === 'number' && Number.isFinite(parsed.top) ? parsed.top : null,
      collapsed: parsed.collapsed === true,
      closed: parsed.closed === true,
    };
  } catch {
    return { left: null, top: null, collapsed: false, closed: false };
  }
}

function writeStoredState(storageKey: string, state: FloatingListPanelState): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // localStorage 不可用时退化为本次会话状态，不影响主界面交互。
  }
}

export class FloatingListPanel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  private readonly state: FloatingListPanelState;
  private readonly storageKey: string;
  private readonly defaultLeft: number;
  private readonly defaultTop: number;
  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly onBeforeClose: (() => void) | null;
  private readonly onClose: (() => void) | null;
  private readonly eventAbort = new AbortController();
  private transientHidden = false;
  private dragState: {
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null = null;

  constructor(options: FloatingListPanelOptions) {
    this.storageKey = options.storageKey;
    this.defaultLeft = options.defaultLeft;
    this.defaultTop = options.defaultTop;
    this.minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
    this.maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
    this.onBeforeClose = options.onBeforeClose ?? null;
    this.onClose = options.onClose ?? null;
    this.state = readStoredState(this.storageKey);

    this.root = document.createElement('section');
    this.root.id = options.id;
    this.root.className = `floating-list-panel ${options.className ?? ''}`.trim();
    this.root.setAttribute('aria-label', options.title);
    this.root.style.minWidth = `${this.minWidth}px`;
    this.root.style.maxWidth = `${this.maxWidth}px`;
    if (options.width !== undefined) {
      this.root.style.setProperty('--floating-list-panel-width', `${Math.max(1, Math.trunc(options.width))}px`);
    }
    if (options.height !== undefined) {
      this.root.style.setProperty('--floating-list-panel-height', `${Math.max(1, Math.trunc(options.height))}px`);
    }
    this.root.innerHTML = `
      <div class="floating-list-panel__bar" data-floating-list-drag-handle="true">
        <span class="floating-list-panel__title">${options.title}</span>
        <div class="floating-list-panel__tools">
          <button class="floating-list-panel__tool" data-floating-list-collapse="true" type="button" aria-label="折叠"></button>
          <button class="floating-list-panel__tool" data-floating-list-close="true" type="button" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="floating-list-panel__body" data-floating-list-body="true"></div>
    `;
    this.body = this.root.querySelector<HTMLElement>('[data-floating-list-body="true"]')!;
    document.body.appendChild(this.root);
    this.bindEvents();
    this.applyState();
    window.addEventListener('resize', () => this.refreshLayout(), { signal: this.eventAbort.signal });
  }

  updateContent(html: string): void {
    this.body.innerHTML = html.trim();
    this.applyState();
  }

  setTitle(title: string): void {
    const normalized = title.trim() || '浮动列表';
    const titleNode = this.root.querySelector<HTMLElement>('.floating-list-panel__title');
    if (titleNode && titleNode.textContent !== normalized) {
      titleNode.textContent = normalized;
    }
    this.root.setAttribute('aria-label', normalized);
  }

  /** 业务内容尺寸变化后重新把浮窗约束到当前视口。 */
  refreshLayout(): void {
    if (this.root.hidden) {
      return;
    }
    this.repositionWithinViewport();
  }

  setBodyKey(value: string): void {
    this.body.dataset.floatingListBodyKey = value;
  }

  getBodyKey(): string {
    return this.body.dataset.floatingListBodyKey ?? '';
  }

  focusCloseButton(): void {
    this.root.querySelector<HTMLButtonElement>('[data-floating-list-close="true"]')?.focus({ preventScroll: true });
  }

  destroy(): void {
    this.eventAbort.abort();
    this.root.remove();
  }

  setTransientHidden(hidden: boolean): void {
    this.transientHidden = hidden;
    this.applyState();
  }

  setClosed(closed: boolean): void {
    if (this.state.closed === closed) {
      return;
    }
    this.state.closed = closed;
    this.persist();
    this.applyState();
  }

  private bindEvents(): void {
    const signal = this.eventAbort.signal;
    const dragHandle = this.root.querySelector<HTMLElement>('[data-floating-list-drag-handle="true"]');
    const collapseButton = this.root.querySelector<HTMLButtonElement>('[data-floating-list-collapse="true"]');
    const closeButton = this.root.querySelector<HTMLButtonElement>('[data-floating-list-close="true"]');

    const bringToFront = () => this.root.parentElement?.appendChild(this.root);
    this.root.addEventListener('pointerdown', bringToFront, { signal });
    this.root.addEventListener('focusin', bringToFront, { signal });
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.root.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }, { signal });

    dragHandle?.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea')) {
        return;
      }
      const rect = this.root.getBoundingClientRect();
      this.dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      dragHandle.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
      event.preventDefault();
    }, { signal });

    dragHandle?.addEventListener('pointermove', (event) => {
      if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
        return;
      }
      this.moveTo(event.clientX - this.dragState.offsetX, event.clientY - this.dragState.offsetY);
    }, { signal });

    const finishDrag = (event: PointerEvent) => {
      if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
        return;
      }
      this.dragState = null;
      this.root.classList.remove('is-dragging');
      this.persist();
    };
    dragHandle?.addEventListener('pointerup', finishDrag, { signal });
    dragHandle?.addEventListener('pointercancel', finishDrag, { signal });

    collapseButton?.addEventListener('click', () => {
      this.state.collapsed = !this.state.collapsed;
      if (this.state.closed) {
        this.state.closed = false;
      }
      this.persist();
      this.applyState();
    }, { signal });

    closeButton?.addEventListener('click', () => this.close(), { signal });
  }

  private close(): void {
    if (this.state.closed) return;
    this.onBeforeClose?.();
    this.state.closed = true;
    this.persist();
    this.applyState();
    this.onClose?.();
  }

  private moveTo(left: number, top: number): void {
    const rect = this.root.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
    this.state.left = clamp(left, VIEWPORT_MARGIN, maxLeft);
    this.state.top = clamp(top, VIEWPORT_MARGIN, maxTop);
    this.root.style.left = `${this.state.left}px`;
    this.root.style.top = `${this.state.top}px`;
    this.root.style.right = 'auto';
  }

  private applyState(): void {
    this.root.classList.toggle('is-collapsed', this.state.collapsed);
    this.root.classList.toggle('is-closed', this.state.closed);
    this.root.hidden = this.state.closed || this.transientHidden;
    const collapseButton = this.root.querySelector<HTMLButtonElement>('[data-floating-list-collapse="true"]');
    if (collapseButton) {
      collapseButton.textContent = this.state.collapsed ? '+' : '−';
      collapseButton.setAttribute('aria-label', this.state.collapsed ? '展开' : '折叠');
    }
    const left = this.state.left ?? this.defaultLeft;
    const top = this.state.top ?? this.defaultTop;
    this.moveTo(left, top);
  }

  private repositionWithinViewport(): void {
    const rect = this.root.getBoundingClientRect();
    this.moveTo(rect.left, rect.top);
    this.persist();
  }

  private persist(): void {
    writeStoredState(this.storageKey, this.state);
  }
}
