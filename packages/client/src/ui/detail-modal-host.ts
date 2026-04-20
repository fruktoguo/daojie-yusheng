/**
 * 全局单实例详情弹层宿主
 * 所有"点击展开详情"类交互共用此弹层，通过 ownerId 区分归属
 */
import { preserveSelection } from './selection-preserver';
import {
  applyModalFrameClasses,
  buildModalCardClassList,
  resolveDetailModalSize,
  type UiModalSize,
} from './ui-modal-frame';

/** 弹层配置项 */
type DetailModalOptions = {
/**
 * ownerId：对象字段。
 */

  ownerId: string;  
  /**
 * variantClass：对象字段。
 */

  variantClass?: string;  
  /**
 * title：对象字段。
 */

  title: string;  
  /**
 * size：对象字段。
 */

  size?: UiModalSize;  
  /**
 * subtitle：对象字段。
 */

  subtitle?: string;  
  /**
 * hint：对象字段。
 */

  hint?: string;  
  /**
 * bodyHtml：对象字段。
 */

  bodyHtml?: string;  
  /**
 * renderBody：对象字段。
 */

  renderBody?: (body: HTMLElement) => void;  
  /**
 * onClose：对象字段。
 */

  onClose?: () => void;  
  /**
 * onAfterRender：对象字段。
 */

  onAfterRender?: (body: HTMLElement) => void;
};

/** 弹层局部 patch 配置项。 */
type DetailModalPatchOptions = {
/**
 * ownerId：对象字段。
 */

  ownerId: string;  
  /**
 * variantClass：对象字段。
 */

  variantClass?: string;  
  /**
 * title：对象字段。
 */

  title?: string;  
  /**
 * size：对象字段。
 */

  size?: UiModalSize;  
  /**
 * subtitle：对象字段。
 */

  subtitle?: string;  
  /**
 * hint：对象字段。
 */

  hint?: string;  
  /**
 * bodyHtml：对象字段。
 */

  bodyHtml?: string;  
  /**
 * renderBody：对象字段。
 */

  renderBody?: (body: HTMLElement) => void;  
  /**
 * onClose：对象字段。
 */

  onClose?: (() => void) | null;  
  /**
 * onAfterRender：对象字段。
 */

  onAfterRender?: (body: HTMLElement) => void;
};

/** DetailModalHost：详情弹窗宿主实现。 */
class DetailModalHost {
  /** modal：弹窗。 */
  private modal = document.getElementById('detail-modal')!;
  /** card：卡片。 */
  private card = document.getElementById('detail-modal-card')!;
  /** title：标题。 */
  private title = document.getElementById('detail-modal-title')!;
  /** subtitle：subtitle。 */
  private subtitle = document.getElementById('detail-modal-subtitle')!;
  /** hint：hint。 */
  private hint = document.getElementById('detail-modal-hint')!;
  /** body：身体。 */
  private body = document.getElementById('detail-modal-body')!;
  /** ownerId：owner ID。 */
  private ownerId: string | null = null;
  /** onClose：on Close。 */
  private onClose: (() => void) | null = null;
  /** frameClassState：帧Class状态。 */
  private frameClassState = { layerClasses: [] as string[], cardClasses: [] as string[] };
  /** initialized：initialized。 */
  private initialized = false;

  /** 打开弹层，若已有其他 owner 的弹层则先关闭 */
  open(options: DetailModalOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.ensureInitialized();
    if (this.ownerId && this.ownerId !== options.ownerId) {
      this.dismiss(true);
    }

    this.ownerId = options.ownerId;
    this.onClose = options.onClose ?? null;
    this.setFrameClasses(options.variantClass ?? '', options.size);
    this.title.textContent = options.title;
    this.subtitle.textContent = options.subtitle ?? '';
    this.subtitle.classList.toggle('hidden', !options.subtitle);
    this.hint.textContent = options.hint ?? '点击空白处关闭';
    preserveSelection(this.body, () => {
      if (typeof options.renderBody === 'function') {
        this.body.replaceChildren();
        options.renderBody(this.body);
        return;
      }
      this.body.innerHTML = options.bodyHtml ?? '';
    });
    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
    options.onAfterRender?.(this.body);
  }

  /** 仅当 ownerId 匹配时关闭弹层 */
  close(ownerId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.ownerId !== ownerId) return;
    this.dismiss(false);
  }

  /** 判断当前弹层是否属于指定 owner 且处于打开状态 */
  isOpenFor(ownerId: string): boolean {
    return this.ownerId === ownerId && !this.modal.classList.contains('hidden');
  }

  /** 对已打开的同 owner 弹层做局部更新，避免调用方重复操作宿主节点。 */
  patch(options: DetailModalPatchOptions): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.isOpenFor(options.ownerId)) {
      return false;
    }
    if (options.onClose !== undefined) {
      this.onClose = options.onClose;
    }
    if (options.variantClass !== undefined || options.size !== undefined) {
      this.setFrameClasses(options.variantClass ?? '', options.size);
    }
    if (options.title !== undefined) {
      this.title.textContent = options.title;
    }
    if (options.subtitle !== undefined) {
      this.subtitle.textContent = options.subtitle;
      this.subtitle.classList.toggle('hidden', !options.subtitle);
    }
    if (options.hint !== undefined) {
      this.hint.textContent = options.hint || '点击空白处关闭';
    }
    if (typeof options.renderBody === 'function' || options.bodyHtml !== undefined) {
      preserveSelection(this.body, () => {
        if (typeof options.renderBody === 'function') {
          this.body.replaceChildren();
          options.renderBody(this.body);
          return;
        }
        this.body.innerHTML = options.bodyHtml ?? '';
      });
      options.onAfterRender?.(this.body);
    }
    return true;
  }

  /** ensureInitialized：确保Initialized。 */
  private ensureInitialized(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** dismiss：处理dismiss。 */
  private dismiss(notify: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ownerId && this.modal.classList.contains('hidden')) return;
    const onClose = this.onClose;
    this.ownerId = null;
    this.onClose = null;
    this.setFrameClasses('', undefined);
    this.body.innerHTML = '';
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    if (notify) {
      onClose?.();
    }
  }

  /** setFrameClasses：处理set帧Classes。 */
  private setFrameClasses(variantClass: string, size?: UiModalSize): void {
    const resolvedSize = resolveDetailModalSize(variantClass, size);
    this.frameClassState = applyModalFrameClasses({
      layer: this.modal,
      card: this.card,
    }, this.frameClassState, {
      layerClasses: splitModalLayerClasses(variantClass),
      cardClasses: buildModalCardClassList(resolvedSize, variantClass),
    });
  }
}

/** splitModalLayerClasses：处理split弹窗层Classes。 */
function splitModalLayerClasses(variantClass: string): string[] {
  return variantClass.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

/** detailModalHost：详情弹窗宿主。 */
export const detailModalHost = new DetailModalHost();
