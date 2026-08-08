/**
 * 自定义权限策略的独立弹层宿主。
 *
 * 权限面板拥有自己的叠加层，避免打开自定义策略时替换宝库、统法台等父业务弹层。
 */

export interface AccessPolicyPanelOptions {
  ownerId: string;
  title: string;
  subtitle?: string;
  renderBody(body: HTMLElement): void;
  onRequestClose?(): boolean;
  onClose?(): void;
}

class AccessPolicyPanelHost {
  private layer: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private closeButton: HTMLButtonElement | null = null;
  private ownerId: string | null = null;
  private onRequestClose: (() => boolean) | null = null;
  private onClose: (() => void) | null = null;
  private previousFocus: HTMLElement | null = null;

  open(options: AccessPolicyPanelOptions): boolean {
    this.ensureMounted();
    if (!this.layer || !this.title || !this.subtitle || !this.body || !this.closeButton) return false;
    if (this.ownerId && !this.dismiss(true)) return false;

    this.ownerId = options.ownerId;
    this.onRequestClose = options.onRequestClose ?? null;
    this.onClose = options.onClose ?? null;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.title.textContent = options.title;
    this.subtitle.textContent = options.subtitle ?? '';
    this.subtitle.hidden = !options.subtitle;
    this.body.replaceChildren();
    try {
      options.renderBody(this.body);
    } catch (error) {
      this.dismiss(false);
      throw error;
    }
    this.layer.classList.remove('hidden');
    this.layer.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => this.closeButton?.focus({ preventScroll: true }));
    return true;
  }

  close(ownerId: string): void {
    if (this.ownerId === ownerId) this.dismiss(false);
  }

  isOpenFor(ownerId: string): boolean {
    return this.ownerId === ownerId && this.layer?.classList.contains('hidden') === false;
  }

  private ensureMounted(): void {
    if (this.layer) return;
    const layer = document.createElement('div');
    layer.className = 'access-policy-panel-layer ui-modal-layer hidden';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `
      <div class="access-policy-panel-backdrop" data-access-policy-panel-close="backdrop"></div>
      <section class="access-policy-panel ui-modal-card ui-modal-card--md" role="dialog" aria-modal="true" aria-labelledby="access-policy-panel-title">
        <header class="access-policy-panel-header">
          <div class="access-policy-panel-heading">
            <h2 id="access-policy-panel-title" class="access-policy-panel-title"></h2>
            <p class="access-policy-panel-subtitle"></p>
          </div>
          <button class="access-policy-panel-close" type="button" data-access-policy-panel-close="button" aria-label="关闭自定义权限策略" title="关闭">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div class="access-policy-panel-body"></div>
      </section>
    `;
    document.body.append(layer);
    this.layer = layer;
    this.title = layer.querySelector<HTMLElement>('.access-policy-panel-title');
    this.subtitle = layer.querySelector<HTMLElement>('.access-policy-panel-subtitle');
    this.body = layer.querySelector<HTMLElement>('.access-policy-panel-body');
    this.closeButton = layer.querySelector<HTMLButtonElement>('.access-policy-panel-close');
    layer.querySelector<HTMLElement>('.access-policy-panel-backdrop')?.addEventListener('click', () => this.dismiss(true));
    this.closeButton?.addEventListener('click', () => this.dismiss(true));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.ownerId) this.dismiss(true);
    });
  }

  private dismiss(notify: boolean): boolean {
    if (!this.ownerId) return true;
    if (notify && this.onRequestClose?.() === false) return false;
    const onClose = this.onClose;
    const previousFocus = this.previousFocus;
    this.ownerId = null;
    this.onRequestClose = null;
    this.onClose = null;
    this.previousFocus = null;
    this.body?.replaceChildren();
    this.layer?.classList.add('hidden');
    this.layer?.setAttribute('aria-hidden', 'true');
    if (notify) onClose?.();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    return true;
  }
}

export const accessPolicyPanelHost = new AccessPolicyPanelHost();
