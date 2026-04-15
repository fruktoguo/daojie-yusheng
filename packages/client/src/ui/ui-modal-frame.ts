export type UiModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full';

type ModalFrameClassState = {
  layerClasses: string[];
  cardClasses: string[];
};

type ModalFrameTargets = {
  layer: HTMLElement;
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

export function splitModalVariantClasses(value = ''): string[] {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

export function resolveDetailModalSize(variantClass = '', size: UiModalSize = 'md'): UiModalSize {
  const variantClasses = splitModalVariantClasses(variantClass);
  for (const variant of variantClasses) {
    const mapped = DETAIL_VARIANT_SIZE_MAP[variant];
    if (mapped) {
      return mapped;
    }
  }
  return size;
}

export function buildModalCardClassList(size: UiModalSize, variantClass = ''): string[] {
  return [`ui-modal-card--${size}`, ...splitModalVariantClasses(variantClass)];
}

export function applyModalFrameClasses(
  targets: ModalFrameTargets,
  previous: ModalFrameClassState,
  next: ModalFrameClassState,
): ModalFrameClassState {
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
