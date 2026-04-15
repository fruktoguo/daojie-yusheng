type ConfirmModalOptions = {
  ownerId: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmButtonClass?: string;
  onConfirm?: () => void;
  onClose?: () => void;
};

class ConfirmModalHost {
  private modal: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private confirmButton: HTMLButtonElement | null = null;
  private ownerId: string | null = null;
  private onConfirm: (() => void) | null = null;
  private onClose: (() => void) | null = null;
  private initialized = false;

/** open：打开界面或流程。 */
  open(options: ConfirmModalOptions): void {
    this.ensureInitialized();
    if (!this.modal || !this.card || !this.title || !this.subtitle || !this.body || !this.cancelButton || !this.confirmButton) {
      return;
    }

    this.ownerId = options.ownerId;
    this.onConfirm = options.onConfirm ?? null;
    this.onClose = options.onClose ?? null;
    this.title.textContent = options.title;
    this.subtitle.textContent = options.subtitle ?? '';
    this.subtitle.classList.toggle('hidden', !options.subtitle);
    this.body.innerHTML = options.bodyHtml;
    this.cancelButton.textContent = options.cancelLabel ?? '取消';
    this.confirmButton.textContent = options.confirmLabel ?? '确认';
    this.confirmButton.disabled = options.confirmDisabled === true;
    this.confirmButton.className = `small-btn ${options.confirmButtonClass ?? ''}`.trim();
    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
  }

/** close：关闭界面或流程。 */
  close(ownerId: string): void {
    if (this.ownerId !== ownerId) {
      return;
    }
    this.dismiss(false);
  }

/** isOpenFor：判断并返回条件结果。 */
  isOpenFor(ownerId: string): boolean {
    return this.ownerId === ownerId && !this.modal?.classList.contains('hidden');
  }


  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const modal = document.createElement('div');
    modal.className = 'confirm-modal-layer hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-modal-backdrop="true"></div>
      <div class="confirm-modal-card" role="dialog" aria-modal="true">
        <div class="confirm-modal-head">
          <div>
            <div class="confirm-modal-title"></div>
            <div class="confirm-modal-subtitle hidden"></div>
          </div>
        </div>
        <div class="confirm-modal-body"></div>
        <div class="confirm-modal-actions">
          <button class="small-btn ghost" type="button" data-confirm-modal-cancel="true">取消</button>
          <button class="small-btn" type="button" data-confirm-modal-confirm="true">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.modal = modal;
    this.card = modal.querySelector<HTMLElement>('.confirm-modal-card');
    this.title = modal.querySelector<HTMLElement>('.confirm-modal-title');
    this.subtitle = modal.querySelector<HTMLElement>('.confirm-modal-subtitle');
    this.body = modal.querySelector<HTMLElement>('.confirm-modal-body');
    this.cancelButton = modal.querySelector<HTMLButtonElement>('[data-confirm-modal-cancel="true"]');
    this.confirmButton = modal.querySelector<HTMLButtonElement>('[data-confirm-modal-confirm="true"]');

    modal.querySelector<HTMLElement>('[data-confirm-modal-backdrop="true"]')?.addEventListener('click', () => {
      this.dismiss(true);
    });
    this.card?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    this.cancelButton?.addEventListener('click', () => {
      this.dismiss(true);
    });
    this.confirmButton?.addEventListener('click', () => {
      if (this.confirmButton?.disabled) {
        return;
      }
      const onConfirm = this.onConfirm;
      this.dismiss(false);
      onConfirm?.();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.modal?.classList.contains('hidden')) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.dismiss(true);
    }, true);
  }


  private dismiss(notify: boolean): void {
    if (!this.modal || this.modal.classList.contains('hidden')) {
      return;
    }
    const onClose = this.onClose;
    this.ownerId = null;
    this.onConfirm = null;
    this.onClose = null;
    this.body && (this.body.innerHTML = '');
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    if (notify) {
      onClose?.();
    }
  }
}

export const confirmModalHost = new ConfirmModalHost();

