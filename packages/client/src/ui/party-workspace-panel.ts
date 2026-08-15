/** 队伍完整功能窗口：复用坊市/拍卖行的 detail modal 骨架。 */
import { WorkspaceModalPanel } from './workspace-modal-panel';
import { PartyPanel } from './panels/party-panel';

export class PartyWorkspacePanel {
  readonly root: HTMLElement;

  private readonly workspace: WorkspaceModalPanel;
  private available = false;
  private visibilityChangeHandler: (() => void) | null = null;
  private opener: HTMLElement | null = null;

  constructor(contentPanel: PartyPanel) {
    this.workspace = new WorkspaceModalPanel({
      ownerId: 'party-workspace-panel',
      contentId: 'party-workspace-panel',
      title: '队伍',
      subtitle: '成员协作、邀请招募与队伍管理',
      className: 'party-workspace-content',
      onClose: () => this.handleNativeClose(),
    });
    this.root = this.workspace.root;
    contentPanel.mount(this.workspace.body);
  }

  setVisibilityChangeHandler(handler: (() => void) | null): void {
    this.visibilityChangeHandler = handler;
  }

  open(opener: HTMLElement | null = null): void {
    if (!this.available) return;
    this.rememberOpener(opener);
    this.workspace.open();
    this.visibilityChangeHandler?.();
    window.requestAnimationFrame(() => {
      if (this.isOpen()) this.workspace.focusInitialControl();
    });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.workspace.close(false);
    this.visibilityChangeHandler?.();
    if (restoreFocus) this.restoreOpenerFocus();
  }

  isOpen(): boolean {
    return this.workspace.isOpen();
  }

  setAvailable(available: boolean): void {
    this.available = available;
    const wasOpen = this.isOpen();
    if (!available) this.workspace.close(false);
    this.visibilityChangeHandler?.();
    if (!available && wasOpen) this.restoreOpenerFocus();
  }

  setUnreadCount(count: number): void {
    const unread = Math.max(0, Math.trunc(count));
    this.workspace.setTitle(unread > 0 ? `队伍 · ${unread > 99 ? '99+' : unread} 条未读` : '队伍');
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
    this.workspace.destroy();
  }
}
