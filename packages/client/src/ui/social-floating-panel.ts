/** 道友子功能独立悬浮窗：只负责窗口外壳，业务状态仍由 SocialPanel 统一维护。 */
import {
  FloatingListPanel,
  LARGE_FLOATING_PANEL_HEIGHT,
  LARGE_FLOATING_PANEL_WIDTH,
} from './floating-list-panel';

export type SocialFloatingPanelKind = 'relations' | 'requests' | 'nearby' | 'messages';

type SocialFloatingPanelMeta = {
  title: string;
  storageKey: string;
  offset: number;
};

const PANEL_META: Record<SocialFloatingPanelKind, SocialFloatingPanelMeta> = {
  relations: { title: '道友名录', storageKey: 'mud:floating-social-relations:v1', offset: 0 },
  requests: { title: '道友申请', storageKey: 'mud:floating-social-requests:v1', offset: 24 },
  nearby: { title: '附近修士', storageKey: 'mud:floating-social-nearby:v1', offset: 48 },
  messages: { title: '私聊', storageKey: 'mud:floating-social-messages:v1', offset: 72 },
};

export class SocialFloatingPanel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  private readonly floatingPanel: FloatingListPanel;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onBeforeClose: () => void;
  private readonly onClose: () => void;

  constructor(kind: SocialFloatingPanelKind, onBeforeClose: () => void, onClose: () => void) {
    const meta = PANEL_META[kind];
    this.onBeforeClose = onBeforeClose;
    this.onClose = onClose;
    this.floatingPanel = new FloatingListPanel({
      id: `floating-social-${kind}`,
      title: meta.title,
      storageKey: meta.storageKey,
      className: `floating-list-panel--workspace floating-list-panel--social floating-list-panel--social-${kind}`,
      defaultLeft: Math.max(8, Math.round((window.innerWidth - LARGE_FLOATING_PANEL_WIDTH) / 2) + meta.offset),
      defaultTop: 72 + meta.offset,
      minWidth: 280,
      maxWidth: LARGE_FLOATING_PANEL_WIDTH,
      width: LARGE_FLOATING_PANEL_WIDTH,
      height: LARGE_FLOATING_PANEL_HEIGHT,
      onBeforeClose,
      onClose,
    });
    this.root = this.floatingPanel.root;
    this.body = this.floatingPanel.body;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    this.root.dataset.socialFloatingPanel = kind;
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.floatingPanel.refreshLayout())
      : null;
    this.resizeObserver?.observe(this.body);
    this.floatingPanel.setTransientHidden(true);
  }

  open(): void {
    this.floatingPanel.setTransientHidden(false);
    this.floatingPanel.setClosed(false);
    this.floatingPanel.refreshLayout();
  }

  close(notify = true): void {
    if (this.root.hidden) return;
    if (notify) this.onBeforeClose();
    this.floatingPanel.setClosed(true);
    if (notify) this.onClose();
  }

  hide(): void {
    this.floatingPanel.setTransientHidden(true);
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  updateContent(html: string): void {
    this.floatingPanel.updateContent(html);
  }

  clearContent(): void {
    this.floatingPanel.updateContent('');
  }

  setTitle(title: string): void {
    this.floatingPanel.setTitle(title);
  }

  focusCloseButton(): void {
    this.floatingPanel.focusCloseButton();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.floatingPanel.destroy();
  }
}
