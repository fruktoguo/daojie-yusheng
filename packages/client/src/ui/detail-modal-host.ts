/**
 * 本文件是客户端 DOM UI 的 detail modal host 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 全局单实例详情弹层宿主
 * 所有"点击展开详情"类交互共用此弹层，通过 ownerId 区分归属
 */
import { preserveSelection } from './selection-preserver';
import { t } from './i18n';
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

  onAfterRender?: (body: HTMLElement, signal: AbortSignal) => void;
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

  onAfterRender?: (body: HTMLElement, signal: AbortSignal) => void;
};

function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  root.replaceChildren(createFragmentFromHtml(html));
}


type FocusSnapshot = {
  path: number[];
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
};

type ScrollSnapshot = {
  path: number[];
  scrollTop: number;
  scrollLeft: number;
};

type DetailModalInteractionSnapshot = {
  focus: FocusSnapshot | null;
  scrolls: ScrollSnapshot[];
};

type SelectableElement = HTMLInputElement | HTMLTextAreaElement;

function getElementPath(root: HTMLElement, element: Element): number[] | null {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    path.push(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return current === root ? path.reverse() : null;
}

function resolveElementPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let current: Element = root;
  for (const index of path) {
    const next = current.children.item(index);
    if (!(next instanceof HTMLElement)) return null;
    current = next;
  }
  return current instanceof HTMLElement ? current : null;
}

function isSelectableElement(element: Element): element is SelectableElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function captureDetailModalInteraction(root: HTMLElement): DetailModalInteractionSnapshot {
  const active = document.activeElement;
  const activeElement = active instanceof HTMLElement && root.contains(active) ? active : null;
  const focusPath = activeElement ? getElementPath(root, activeElement) : null;
  const selectableElement = activeElement && isSelectableElement(activeElement) ? activeElement : null;
  const focus = focusPath ? {
    path: focusPath,
    selectionStart: selectableElement ? selectableElement.selectionStart : null,
    selectionEnd: selectableElement ? selectableElement.selectionEnd : null,
    selectionDirection: selectableElement ? selectableElement.selectionDirection : null,
  } : null;
  const scrolls: ScrollSnapshot[] = [];
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) {
      const path = element === root ? [] : getElementPath(root, element);
      if (path) scrolls.push({ path, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft });
    }
  }
  return { focus, scrolls };
}

function restoreDetailModalInteraction(root: HTMLElement, snapshot: DetailModalInteractionSnapshot): void {
  for (const entry of snapshot.scrolls) {
    const element = resolveElementPath(root, entry.path);
    if (!element) continue;
    element.scrollTop = entry.scrollTop;
    element.scrollLeft = entry.scrollLeft;
  }
  if (!snapshot.focus) return;
  const focused = resolveElementPath(root, snapshot.focus.path);
  if (!focused) return;
  focused.focus({ preventScroll: true });
  if (isSelectableElement(focused) && snapshot.focus.selectionStart !== null && snapshot.focus.selectionEnd !== null) {
    focused.setSelectionRange(snapshot.focus.selectionStart, snapshot.focus.selectionEnd, snapshot.focus.selectionDirection ?? 'none');
  }
}

function preserveDetailModalInteraction(root: HTMLElement, render: () => void): void {
  const snapshot = captureDetailModalInteraction(root);
  preserveSelection(root, render);
  restoreDetailModalInteraction(root, snapshot);
}

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
  /** 当前 body 渲染轮次绑定的事件监听，下一轮 patch 前统一撤销。 */
  private bodyRenderEvents: AbortController | null = null;
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
    this.setHint(options.hint);
    const renderSignal = this.prepareBodyRenderSignal();
    preserveDetailModalInteraction(this.body, () => {
      if (typeof options.renderBody === 'function') {
        this.patchBodyFromRenderer(options.renderBody);
        return;
      }
      replaceElementHtml(this.body, options.bodyHtml ?? '');
    });
    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
    options.onAfterRender?.(this.body, renderSignal);
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
      this.setHint(options.hint);
    }
    if (typeof options.renderBody === 'function' || options.bodyHtml !== undefined) {
      const renderSignal = this.prepareBodyRenderSignal();
      preserveDetailModalInteraction(this.body, () => {
        if (typeof options.renderBody === 'function') {
          this.patchBodyFromRenderer(options.renderBody);
          return;
        }
        replaceElementHtml(this.body, options.bodyHtml ?? '');
      });
      options.onAfterRender?.(this.body, renderSignal);
    }
    return true;
  }

  /** 省略 hint 时沿用默认关闭提示，显式传空字符串时隐藏提示。 */
  private setHint(hint: string | undefined): void {
    const hintText = hint ?? t('modal.detail.close-hint', undefined);
    this.hint.textContent = hintText;
    this.hint.classList.toggle('hidden', hintText.length === 0);
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
    this.bodyRenderEvents?.abort();
    this.bodyRenderEvents = null;
    this.setFrameClasses('', undefined);
    this.body.replaceChildren();
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

  /** 为下一轮 body 渲染创建事件生命周期。 */
  private prepareBodyRenderSignal(): AbortSignal {
    this.bodyRenderEvents?.abort();
    this.bodyRenderEvents = new AbortController();
    return this.bodyRenderEvents.signal;
  }

  /** 用临时容器承接旧 renderBody，再局部 patch 到真实弹层 body。 */
  private patchBodyFromRenderer(renderBody: (body: HTMLElement) => void): void {
    const scratch = document.createElement('div');
    renderBody(scratch);
    this.body.replaceChildren(...Array.from(scratch.childNodes));
  }
}

/** splitModalLayerClasses：处理split弹窗层Classes。 */
function splitModalLayerClasses(variantClass: string): string[] {
  return variantClass.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

/** detailModalHost：详情弹窗宿主。 */
export const detailModalHost = new DetailModalHost();
