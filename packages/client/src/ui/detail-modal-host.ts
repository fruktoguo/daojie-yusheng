/**
 * 全局单实例详情弹层宿主
 * 所有"点击展开详情"类交互共用此弹层，通过 ownerId 区分归属
 */
import { preserveSelection } from './selection-preserver';
import { patchElementChildren, patchElementHtml } from './dom-patch';
import {
  applyModalFrameClasses,
  buildModalCardClassList,
  resolveDetailModalSize,
  type UiModalSize,
} from './ui-modal-frame';

/** 弹层配置项 */
type DetailModalOptions = {
/**
 * ownerId：ownerID标识。
 */

  ownerId: string;  
  /**
 * variantClass：variantClass相关字段。
 */

  variantClass?: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * size：数量或计量字段。
 */

  size?: UiModalSize;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: string;  
  /**
 * hint：hint相关字段。
 */

  hint?: string;  
  /**
 * bodyHtml：bodyHtml相关字段。
 */

  bodyHtml?: string;  
  /**
 * renderBody：Body相关字段。
 */

  renderBody?: (body: HTMLElement) => void;  
  /**
 * onRequestClose：请求关闭前的拦截钩子。
 */

  onRequestClose?: () => boolean;
  /**
 * onClose：onClose相关字段。
 */

  onClose?: () => void;  
  /**
 * onAfterRender：onAfterRender相关字段。
 */

  onAfterRender?: (body: HTMLElement) => void;
};

/** 弹层局部 patch 配置项。 */
type DetailModalPatchOptions = {
/**
 * ownerId：ownerID标识。
 */

  ownerId: string;  
  /**
 * variantClass：variantClass相关字段。
 */

  variantClass?: string;  
  /**
 * title：title名称或显示文本。
 */

  title?: string;  
  /**
 * size：数量或计量字段。
 */

  size?: UiModalSize;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: string;  
  /**
 * hint：hint相关字段。
 */

  hint?: string;  
  /**
 * bodyHtml：bodyHtml相关字段。
 */

  bodyHtml?: string;  
  /**
 * renderBody：Body相关字段。
 */

  renderBody?: (body: HTMLElement) => void;  
  /**
 * onRequestClose：请求关闭前的拦截钩子。
 */

  onRequestClose?: (() => boolean) | null;
  /**
 * onClose：onClose相关字段。
 */

  onClose?: (() => void) | null;  
  /**
 * onAfterRender：onAfterRender相关字段。
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
  /** onRequestClose：请求关闭前的拦截钩子。 */
  private onRequestClose: (() => boolean) | null = null;
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
      if (!this.dismiss(true)) {
        return;
      }
    }

    this.ownerId = options.ownerId;
    this.onRequestClose = options.onRequestClose ?? null;
    this.onClose = options.onClose ?? null;
    this.setFrameClasses(options.variantClass ?? '', options.size);
    this.title.textContent = options.title;
    this.subtitle.textContent = options.subtitle ?? '';
    this.subtitle.classList.toggle('hidden', !options.subtitle);
    this.hint.textContent = options.hint ?? '点击空白处关闭';
    preserveSelection(this.body, () => {
      if (typeof options.renderBody === 'function') {
        this.patchBodyFromRenderer(options.renderBody);
        return;
      }
      patchElementHtml(this.body, options.bodyHtml ?? '');
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
    if (options.onRequestClose !== undefined) {
      this.onRequestClose = options.onRequestClose;
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
          this.patchBodyFromRenderer(options.renderBody);
          return;
        }
        patchElementHtml(this.body, options.bodyHtml ?? '');
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
  private dismiss(notify: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ownerId && this.modal.classList.contains('hidden')) return true;
    if (notify && this.onRequestClose && this.onRequestClose() === false) {
      return false;
    }
    const onClose = this.onClose;
    this.ownerId = null;
    this.onRequestClose = null;
    this.onClose = null;
    this.setFrameClasses('', undefined);
    patchElementHtml(this.body, '');
    this.modal.classList.add('hidden');
    this.modal.setAttribute('aria-hidden', 'true');
    if (notify) {
      onClose?.();
    }
    return true;
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

  /** 用临时容器承接旧 renderBody，再局部 patch 到真实弹层 body。 */
  private patchBodyFromRenderer(renderBody: (body: HTMLElement) => void): void {
    const scratch = document.createElement('div');
    renderBody(scratch);
    patchElementChildren(this.body, Array.from(scratch.childNodes));
  }
}

/** splitModalLayerClasses：处理split弹窗层Classes。 */
function splitModalLayerClasses(variantClass: string): string[] {
  return variantClass.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

/** detailModalHost：详情弹窗宿主。 */
export const detailModalHost = new DetailModalHost();
