const GUARDED_EXTERNAL_LINK_SELECTOR = 'a[data-guarded-external-link="true"]';
const POINTER_ACTIVATION_WINDOW_MS = 1500;

type PointerActivation = {
  link: HTMLAnchorElement;
  pointerId: number;
  button: number;
  atMs: number;
};

function getGuardedExternalLink(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>(GUARDED_EXTERNAL_LINK_SELECTOR) : null;
}

function prepareGuardedExternalLinks(documentRef: Document): void {
  for (const link of documentRef.querySelectorAll<HTMLAnchorElement>(GUARDED_EXTERNAL_LINK_SELECTOR)) {
    link.removeAttribute('href');
    link.tabIndex = 0;
    link.setAttribute('role', 'link');
  }
}

function isKeyboardActivation(event: MouseEvent, documentRef: Document, link: HTMLAnchorElement): boolean {
  return event.detail === 0 && documentRef.activeElement === link && event.isTrusted;
}

function isValidPointerActivation(
  event: MouseEvent,
  activation: PointerActivation | null,
  link: HTMLAnchorElement,
): boolean {
  if (!activation || activation.link !== link) {
    return false;
  }
  if ('pointerId' in event && typeof event.pointerId === 'number' && event.pointerId !== activation.pointerId) {
    return false;
  }
  if (event.button !== activation.button) {
    return false;
  }
  return performance.now() - activation.atMs <= POINTER_ACTIVATION_WINDOW_MS;
}

export function bindExternalLinkGuard(documentRef: Document): void {
  let lastPointerActivation: PointerActivation | null = null;

  prepareGuardedExternalLinks(documentRef);

  documentRef.addEventListener(
    'pointerdown',
    (event) => {
      const link = getGuardedExternalLink(event.target);
      if (!link || event.button > 1 || !event.isTrusted) {
        return;
      }
      lastPointerActivation = {
        link,
        pointerId: event.pointerId,
        button: event.button,
        atMs: performance.now(),
      };
    },
    { capture: true },
  );

  const openExternalLink = (link: HTMLAnchorElement): void => {
    const url = link.dataset.externalLinkUrl?.trim();
    if (!url) {
      return;
    }
    window.open(url, link.target || '_blank', 'noopener,noreferrer');
  };

  const guardActivation = (event: MouseEvent) => {
    const link = getGuardedExternalLink(event.target);
    if (!link) {
      return;
    }
    if (
      isValidPointerActivation(event, lastPointerActivation, link) ||
      isKeyboardActivation(event, documentRef, link)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openExternalLink(link);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  documentRef.addEventListener('click', guardActivation, { capture: true });
  documentRef.addEventListener('auxclick', guardActivation, { capture: true });
  documentRef.addEventListener(
    'keydown',
    (event) => {
      const link = getGuardedExternalLink(event.target);
      if (!link || !event.isTrusted || (event.key !== 'Enter' && event.key !== ' ')) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      openExternalLink(link);
    },
    { capture: true },
  );
}
