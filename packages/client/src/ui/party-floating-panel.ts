/** 独立队伍悬浮窗：复用通用拖拽、折叠、关闭与位置持久化能力。 */
import {
  FloatingListPanel,
  LARGE_FLOATING_PANEL_HEIGHT,
  LARGE_FLOATING_PANEL_WIDTH,
} from './floating-list-panel';
import { PartyPanel } from './panels/party-panel';

const PARTY_FLOATING_STORAGE_KEY = 'mud:floating-party:v1';

export class PartyFloatingPanel {
  readonly root: HTMLElement;

  private readonly floatingPanel: FloatingListPanel;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly mutationObserver: MutationObserver | null;
  private available = false;

  constructor(contentPanel: PartyPanel) {
    this.floatingPanel = new FloatingListPanel({
      id: 'floating-party-panel',
      title: '队伍',
      storageKey: PARTY_FLOATING_STORAGE_KEY,
      className: 'floating-list-panel--workspace floating-list-panel--party',
      defaultLeft: Math.max(8, Math.round((window.innerWidth - LARGE_FLOATING_PANEL_WIDTH) / 2)),
      defaultTop: 64,
      minWidth: 280,
      maxWidth: LARGE_FLOATING_PANEL_WIDTH,
      width: LARGE_FLOATING_PANEL_WIDTH,
      height: LARGE_FLOATING_PANEL_HEIGHT,
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

  open(): void {
    if (!this.available) {
      return;
    }
    this.floatingPanel.setTransientHidden(false);
    this.floatingPanel.setClosed(false);
  }

  setAvailable(available: boolean): void {
    this.available = available;
    this.floatingPanel.setTransientHidden(!available);
  }

  setUnreadCount(count: number): void {
    const unread = Math.max(0, Math.trunc(count));
    this.floatingPanel.setTitle(unread > 0 ? `队伍 · ${unread > 99 ? '99+' : unread} 条未读` : '队伍');
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.floatingPanel.destroy();
  }
}
