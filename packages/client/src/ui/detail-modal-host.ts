import { preserveSelection } from './selection-preserver';

type DetailModalOptions = {
  ownerId: string;
  variantClass?: string;
  title: string;
  subtitle?: string;
  hint?: string;
  bodyHtml: string;
  onClose?: () => void;
  onAfterRender?: (body: HTMLElement) => void;
};

class DetailModalHost {
  private modal = document.getElementById('detail-modal')!;
  private card = document.getElementById('detail-modal-card')!;
  private title = document.getElementById('detail-modal-title')!;
  private subtitle = document.getElementById('detail-modal-subtitle')!;
  private hint = document.getElementById('detail-modal-hint')!;
  private body = document.getElementById('detail-modal-body')!;
  private ownerId: string | null = null;
  private onClose: (() => void) | null = null;
  private variantClass = '';
  private initialized = false;

  open(options: DetailModalOptions): void {
    this.ensureInitialized();
    if (this.ownerId && this.ownerId !== options.ownerId) {
      this.dismiss(true);
    }

    this.ownerId = options.ownerId;
    this.onClose = options.onClose ?? null;
    this.setVariantClass(options.variantClass ?? '');
    this.title.textContent = options.title;
    this.subtitle.textContent = options.subtitle ?? '';
    this.subtitle.classList.toggle('hidden', !options.subtitle);
    this.hint.textContent = options.hint ?? '点击空白处关闭';
    preserveSelection(this.body, () => {
      this.body.innerHTML = options.bodyHtml;
    });
    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
    options.onAfterRender?.(this.body);
  }

  close(ownerId: string): void {
    if (this.ownerId !== ownerId) return;
    this.dismiss(false);
  }

  isOpenFor(ownerId: string): boolean {
    return this.ownerId === ownerId && !this.modal.classList.contains('hidden');
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.modal.addEventListener('click', () => {
      this.dismiss(true);
    });
    this.card.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.dismiss(true);
      }
    });
  }

  private dismiss(notify: boolean): void {
    if (!this.ownerId && this.modal.classList.contains('hidden')) return;
    const onClose = this.onClose;
    this.ownerId = null;
    this.onClose = null;
    this.setVariantClass('');
    this.body.innerHTML = '';
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    if (notify) {
      onClose?.();
    }
  }

  private setVariantClass(nextClass: string): void {
    if (this.variantClass) {
      this.modal.classList.remove(this.variantClass);
      this.card.classList.remove(this.variantClass);
    }
    this.variantClass = nextClass;
    if (this.variantClass) {
      this.modal.classList.add(this.variantClass);
      this.card.classList.add(this.variantClass);
    }
  }
}

export const detailModalHost = new DetailModalHost();
