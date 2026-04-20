/** 统一弹窗尺寸枚举。 */
export type UiModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full';

/** 用于拼装弹窗样式类名的状态。 */
type ModalFrameClassState = {
/**
 * layerClasses：对象字段。
 */

  layerClasses: string[];  
  /**
 * cardClasses：对象字段。
 */

  cardClasses: string[];
};

/** 弹窗帧需要同步的 DOM 目标。 */
type ModalFrameTargets = {
/**
 * layer：对象字段。
 */

  layer: HTMLElement;  
  /**
 * card：对象字段。
 */

  card: HTMLElement;
};

const DETAIL_VARIANT_SIZE_MAP: Record<string, UiModalSize> = {
  'detail-modal--body-training-infuse': 'sm',
  'detail-modal--quest': 'md',
  'detail-modal--heaven-gate': 'md',
  'detail-modal--mail': 'lg',
  'detail-modal--settings': 'xl',
  'detail-modal--tutorial': 'wide',
  'detail-modal--market': 'full',
  'detail-modal--suggestion': 'full',
  'detail-modal--technique': 'wide',
  'detail-modal--skill-management': 'wide',
  'detail-modal--skill-preset': 'wide',
};

/** 拆分弹窗变体的样式类。 */
export function splitModalVariantClasses(value = ''): string[] {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

/** 解析详情弹窗尺寸。 */
export function resolveDetailModalSize(variantClass = '', size: UiModalSize = 'md'): UiModalSize {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const variantClasses = splitModalVariantClasses(variantClass);
  for (const variant of variantClasses) {
    const mapped = DETAIL_VARIANT_SIZE_MAP[variant];
    if (mapped) {
      return mapped;
    }
  }
  return size;
}

/** 拼装弹窗卡片的 class 列表。 */
export function buildModalCardClassList(size: UiModalSize, variantClass = ''): string[] {
  return [`ui-modal-card--${size}`, ...splitModalVariantClasses(variantClass)];
}

/** 将计算好的类名写回弹窗帧节点。 */
export function applyModalFrameClasses(
  targets: ModalFrameTargets,
  previous: ModalFrameClassState,
  next: ModalFrameClassState,
): ModalFrameClassState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (const className of previous.layerClasses) {
    targets.layer.classList.remove(className);
  }
  for (const className of previous.cardClasses) {
    targets.card.classList.remove(className);
  }

  for (const className of next.layerClasses) {
    targets.layer.classList.add(className);
  }
  for (const className of next.cardClasses) {
    targets.card.classList.add(className);
  }
  return next;
}


