/** 按钮外观枚举，决定幽灵按钮或危险按钮样式。 */
type UiButtonVariant = 'ghost' | 'danger';

/** applyUiButtonVariants：应用界面按钮Variants。 */
function applyUiButtonVariants(button: HTMLButtonElement, variants: UiButtonVariant[] = []): void {
  button.className = ['small-btn', 'ui-btn', ...variants].join(' ');
}

/** createUiButton：创建界面按钮。 */
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

/** createSmallBtn：创建Small Btn。 */
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

/** createUiEmptyHint：创建界面Empty Hint。 */
export function createUiEmptyHint(text: string, className?: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = 'empty-hint ui-empty-hint';
  if (className) {
    node.classList.add(...className.split(' ').filter(Boolean));
  }
  node.textContent = text;
  return node;
}

/** createEmptyHint：创建Empty Hint。 */
export function createEmptyHint(text: string, className?: string): HTMLDivElement {
  return createUiEmptyHint(text, className);
}

/** createUiPanelSection：创建界面面板Section。 */
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

/** createPanelSectionWithTitle：创建面板Section With标题。 */
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

/** ensureChild：确保Child。 */
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


