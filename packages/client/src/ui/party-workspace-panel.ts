/** 队伍完整功能独立面板：固定尺寸，与四个道友子面板互斥显示。 */
import {
  FloatingListPanel,
  LARGE_FLOATING_PANEL_HEIGHT,
  LARGE_FLOATING_PANEL_WIDTH,
} from './floating-list-panel';
import { PartyPanel } from './panels/party-panel';

const PARTY_WORKSPACE_STORAGE_KEY = 'mud:floating-party:v1';

export class PartyWorkspacePanel {
  readonly root: HTMLElement;

  private readonly floatingPanel: FloatingListPanel;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly mutationObserver: MutationObserver | null;
  private available = false;
  private visibilityChangeHandler: (() => void) | null = null;
  private opener: HTMLElement | null = null;

  constructor(contentPanel: PartyPanel) {
    this.floatingPanel = new FloatingListPanel({
      id: 'floating-party-panel',
      title: '队伍',
      storageKey: PARTY_WORKSPACE_STORAGE_KEY,
      className: 'floating-list-panel--workspace floating-list-panel--party-workspace',
      defaultLeft: Math.max(8, Math.round((window.innerWidth - LARGE_FLOATING_PANEL_WIDTH) / 2)),
      defaultTop: 72,
      minWidth: 280,
      maxWidth: LARGE_FLOATING_PANEL_WIDTH,
      width: LARGE_FLOATING_PANEL_WIDTH,
      height: LARGE_FLOATING_PANEL_HEIGHT,
      onClose: () => this.handleNativeClose(),
    });
    this.root = this.floatingPanel.root;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    contentPanel.mount(this.floatingPanel.body);
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.floatingPanel.refreshLayout())
      : null;
    this.resizeObserver?.observe(this.floatingPanel.body);
    this.mutationObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(() => this.floatingPanel.refreshLayout())
      : null;
    this.mutationObserver?.observe(this.floatingPanel.body, { childList: true, subtree: true });
    this.floatingPanel.setTransientHidden(true);
  }

  setVisibilityChangeHandler(handler: (() => void) | null): void {
    this.visibilityChangeHandler = handler;
  }

  open(opener: HTMLElement | null = null): void {
    if (!this.available) return;
    this.rememberOpener(opener);
    this.floatingPanel.setTransientHidden(false);
    this.floatingPanel.setClosed(false);
    this.floatingPanel.refreshLayout();
    this.visibilityChangeHandler?.();
    window.requestAnimationFrame(() => {
      if (this.isOpen()) this.floatingPanel.focusCloseButton();
    });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.floatingPanel.setClosed(true);
    this.visibilityChangeHandler?.();
    if (restoreFocus) this.restoreOpenerFocus();
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  setAvailable(available: boolean): void {
    this.available = available;
    const wasOpen = this.isOpen();
    if (!available) this.floatingPanel.setTransientHidden(true);
    this.visibilityChangeHandler?.();
    if (!available && wasOpen) this.restoreOpenerFocus();
  }

  setUnreadCount(count: number): void {
    const unread = Math.max(0, Math.trunc(count));
    this.floatingPanel.setTitle(unread > 0 ? `队伍 · ${unread > 99 ? '99+' : unread} 条未读` : '队伍');
  }

  private handleNativeClose(): void {
    this.visibilityChangeHandler?.();
    this.restoreOpenerFocus();
  }

  private rememberOpener(opener: HTMLElement | null): void {
    const candidate = opener
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (candidate && candidate.isConnected && !this.root.contains(candidate)) this.opener = candidate;
  }

  private restoreOpenerFocus(): void {
    const opener = this.opener;
    this.opener = null;
    window.requestAnimationFrame(() => {
      const activeRightTab = document.querySelector<HTMLElement>(
        '[data-tab-group="right-top"] [data-tab][aria-selected="true"], [data-tab-group="right-top"] [data-tab].active',
      );
      const partyLauncher = document.querySelector<HTMLElement>('[data-social-menu="party"]');
      const hudLauncher = document.querySelector<HTMLElement>('[data-party-hud-action="open-panel"]');
      for (const candidate of [opener, activeRightTab, partyLauncher, hudLauncher]) {
        if (
          !candidate?.isConnected
          || candidate.matches(':disabled')
          || candidate.getClientRects().length === 0
        ) continue;
        candidate.focus({ preventScroll: true });
        if (document.activeElement === candidate) return;
      }
    });
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.floatingPanel.destroy();
  }
}
