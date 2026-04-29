/** 按钮外观枚举，决定幽灵按钮或危险按钮样式。 */
type UiButtonVariant = 'ghost' | 'danger';

/** applyUiButtonVariants：应用界面按钮Variants。 */
function applyUiButtonVariants(button: HTMLButtonElement, variants: UiButtonVariant[] = []): void {
  button.className = ['small-btn', 'ui-btn', ...variants].join(' ');
}

/** createUiButton：创建界面按钮。 */
export function createUiButton(options: {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * type：type相关字段。
 */

  type?: 'button' | 'submit' | 'reset';  
  /**
 * variants：variant相关字段。
 */

  variants?: UiButtonVariant[];  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;  
  /**
 * dataset：dataset相关字段。
 */

  dataset?: Record<string, string>;
}): HTMLButtonElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * type：type相关字段。
 */

    type?: 'button' | 'submit' | 'reset';    
    /**
 * variants：variant相关字段。
 */

    variants?: UiButtonVariant[];    
    /**
 * className：class名称名称或显示文本。
 */

    className?: string;    
    /**
 * disabled：disabled相关字段。
 */

    disabled?: boolean;    
    /**
 * dataset：dataset相关字段。
 */

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * section：section相关字段。
 */

  section: HTMLDivElement;  
  /**
 * title：title名称或显示文本。
 */

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
/**
 * sectionEl：sectionEl相关字段。
 */

  sectionEl: HTMLDivElement;  
  /**
 * titleEl：titleEl相关字段。
 */

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const existing = parent.querySelector<T>(selector);
  if (existing) {
    return existing;
  }
  const created = factory();
  parent.appendChild(created);
  return created;
}


