/**
 * 全局单实例详情弹层宿主
 * 所有"点击展开详情"类交互共用此弹层，通过 ownerId 区分归属
 */

import { preserveSelection } from './selection-preserver';

/** 弹层配置项 */
type DetailModalOptions = {
/** ownerId：定义该变量以承载业务值。 */
  ownerId: string;
  variantClass?: string;
/** title：定义该变量以承载业务值。 */
  title: string;
  subtitle?: string;
  hint?: string;
/** bodyHtml：定义该变量以承载业务值。 */
  bodyHtml: string;
  onRequestClose?: () => boolean;
  onClose?: () => void;
  onAfterRender?: (body: HTMLElement) => void;
};

/** DetailModalHost：封装相关状态与行为。 */
class DetailModalHost {
  private modal = document.getElementById('detail-modal')!;
  private card = document.getElementById('detail-modal-card')!;
  private title = document.getElementById('detail-modal-title')!;
  private subtitle = document.getElementById('detail-modal-subtitle')!;
  private hint = document.getElementById('detail-modal-hint')!;
  private body = document.getElementById('detail-modal-body')!;
/** ownerId：定义该变量以承载业务值。 */
  private ownerId: string | null = null;
  private onRequestClose: (() => boolean) | null = null;
  private onClose: (() => void) | null = null;
  private variantClass = '';
  private initialized = false;

  /** 打开弹层，若已有其他 owner 的弹层则先关闭 */
  open(options: DetailModalOptions): void {
    this.ensureInitialized();
    if (this.ownerId && this.ownerId !== options.ownerId) {
      if (!this.dismiss(true)) {
        return;
      }
    }

    this.ownerId = options.ownerId;
    this.onRequestClose = options.onRequestClose ?? null;
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

  /** 仅当 ownerId 匹配时关闭弹层 */
  close(ownerId: string): void {
    if (this.ownerId !== ownerId) return;
    this.dismiss(false);
  }

  /** 判断当前弹层是否属于指定 owner 且处于打开状态 */
  isOpenFor(ownerId: string): boolean {
    return this.ownerId === ownerId && !this.modal.classList.contains('hidden');
  }

/** ensureInitialized：执行对应的业务逻辑。 */
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

/** dismiss：执行对应的业务逻辑。 */
  private dismiss(notify: boolean): boolean {
    if (!this.ownerId && this.modal.classList.contains('hidden')) return true;
    if (notify && this.onRequestClose && this.onRequestClose() === false) {
      return false;
    }
/** onClose：定义该变量以承载业务值。 */
    const onClose = this.onClose;
    this.ownerId = null;
    this.onRequestClose = null;
    this.onClose = null;
    this.setVariantClass('');
    this.body.innerHTML = '';
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    if (notify) {
      onClose?.();
    }
    return true;
  }

/** setVariantClass：执行对应的业务逻辑。 */
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

/** detailModalHost：定义该变量以承载业务值。 */
export const detailModalHost = new DetailModalHost();

