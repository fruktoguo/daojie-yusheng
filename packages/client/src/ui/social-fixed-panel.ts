/** 道友子功能固定面板宿主：业务状态仍由 SocialPanel 统一维护。 */
export type SocialFixedPanelKind = 'relations' | 'requests' | 'nearby' | 'messages';

const PANEL_META: Record<SocialFixedPanelKind, { rootId: string; title: string }> = {
  relations: { rootId: 'pane-social-relations', title: '道友名录' },
  requests: { rootId: 'pane-social-requests', title: '道友申请' },
  nearby: { rootId: 'pane-social-nearby', title: '附近修士' },
  messages: { rootId: 'pane-social-messages', title: '私聊' },
};

export class SocialFixedPanel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  private readonly title: HTMLElement;
  private readonly backButton: HTMLButtonElement;

  constructor(
    kind: SocialFixedPanelKind,
    private readonly onOpen: () => void,
    private readonly onReturn: () => void,
  ) {
    const meta = PANEL_META[kind];
    const root = document.getElementById(meta.rootId);
    if (!root) throw new Error(`missing social fixed panel root: ${meta.rootId}`);
    this.root = root;
    this.root.setAttribute('role', 'tabpanel');
    this.root.setAttribute('aria-labelledby', `${meta.rootId}-title`);
    this.root.innerHTML = `
      <div class="social-fixed-panel-shell">
        <div class="social-fixed-panel-head">
          <div class="social-fixed-panel-title" id="${meta.rootId}-title">${meta.title}</div>
          <button class="small-btn ghost" type="button" data-social-action="menu-close">返回道友</button>
        </div>
        <div class="social-fixed-panel-body" data-social-fixed-panel-body="${kind}"></div>
      </div>
    `;
    this.title = this.root.querySelector<HTMLElement>('.social-fixed-panel-title')!;
    this.backButton = this.root.querySelector<HTMLButtonElement>('[data-social-action="menu-close"]')!;
    this.body = this.root.querySelector<HTMLElement>('[data-social-fixed-panel-body]')!;
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onReturn();
  }

  isOpen(): boolean {
    return this.root.classList.contains('active');
  }

  updateContent(html: string): void {
    this.body.innerHTML = html;
  }

  clearContent(): void {
    this.body.replaceChildren();
  }

  setTitle(title: string): void {
    this.title.textContent = title;
    this.root.setAttribute('aria-label', title);
  }

  focusCloseButton(): void {
    this.backButton.focus({ preventScroll: true });
  }
}
