type UiButtonVariant = 'ghost' | 'danger';

function applyUiButtonVariants(button: HTMLButtonElement, variants: UiButtonVariant[] = []): void {
  button.className = ['small-btn', 'ui-btn', ...variants].join(' ');
}

export function createUiButton(options: {
  label: string;
  type?: 'button' | 'submit' | 'reset';
  variants?: UiButtonVariant[];
  className?: string;
  dataset?: Record<string, string>;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = options.type ?? 'button';
  applyUiButtonVariants(button, options.variants);
  if (options.className) {
    button.classList.add(...options.className.split(' ').filter(Boolean));
  }
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) {
      button.dataset[key] = value;
    }
  }
  button.textContent = options.label;
  return button;
}

export function createSmallBtn(
  label: string,
  options: {
    type?: 'button' | 'submit' | 'reset';
    variants?: UiButtonVariant[];
    className?: string;
    disabled?: boolean;
    dataset?: Record<string, string>;
  } = {},
): HTMLButtonElement {
  const button = createUiButton({
    label,
    type: options.type,
    variants: options.variants,
    className: options.className,
    dataset: options.dataset,
  });
  button.disabled = options.disabled === true;
  return button;
}

export function createUiEmptyHint(text: string, className?: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = 'empty-hint ui-empty-hint';
  if (className) {
    node.classList.add(...className.split(' ').filter(Boolean));
  }
  node.textContent = text;
  return node;
}

export function createEmptyHint(text: string, className?: string): HTMLDivElement {
  return createUiEmptyHint(text, className);
}

export function createUiPanelSection(title: string): {
  section: HTMLDivElement;
  title: HTMLDivElement;
} {
  const section = document.createElement('div');
  section.className = 'panel-section ui-panel-section';

  const titleEl = document.createElement('div');
  titleEl.className = 'panel-section-title ui-panel-section-title';
  titleEl.textContent = title;
  section.append(titleEl);

  return { section, title: titleEl };
}

export function createPanelSectionWithTitle(title: string): {
  sectionEl: HTMLDivElement;
  titleEl: HTMLDivElement;
} {
  const result = createUiPanelSection(title);
  return {
    sectionEl: result.section,
    titleEl: result.title,
  };
}

export function ensureChild<T extends Element>(
  parent: HTMLElement,
  selector: string,
  factory: () => T,
): T {
  const existing = parent.querySelector<T>(selector);
  if (existing) {
    return existing;
  }
  const created = factory();
  parent.appendChild(created);
  return created;
}
