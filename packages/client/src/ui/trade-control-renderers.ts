/**
 * 本文件是客户端 DOM UI 的 trade control renderers 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
type AttrValue = string | number | boolean | null | undefined;

export interface TradeControlButton {
  label: string;
  attrs?: Record<string, AttrValue>;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

export interface TradeQuantityControlOptions {
  value: string | number;
  min?: string | number;
  step?: string | number;
  max?: string | number;
  inputAttrs?: Record<string, AttrValue>;
  inputClassName?: string;
  leftButtons?: TradeControlButton[];
  rightButtons?: TradeControlButton[];
}

export interface TradePriceStepControlOptions {
  value: string;
  currencyName: string;
  displayAttrs?: Record<string, AttrValue>;
  leftButtons?: TradeControlButton[];
  rightButtons?: TradeControlButton[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAttrs(attrs: Record<string, AttrValue> | undefined): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`)
    .join('');
}

function renderButton(button: TradeControlButton): string {
  const classes = ['small-btn', 'ghost', button.className, button.active ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  return `<button class="${escapeHtml(classes)}"${renderAttrs(button.attrs)} type="button" ${button.disabled ? 'disabled' : ''}>${escapeHtml(button.label)}</button>`;
}

function renderButtonGroup(buttons: TradeControlButton[] | undefined, className: string): string {
  if (!buttons || buttons.length === 0) return '';
  return `<div class="${className}">${buttons.map(renderButton).join('')}</div>`;
}

export function renderTradeQuantityControl(options: TradeQuantityControlOptions): string {
  const inputClassName = options.inputClassName ?? 'gm-inline-input';
  return `
    <div class="market-quantity-row">
      ${options.leftButtons?.map(renderButton).join('') ?? ''}
      <input
        class="${escapeHtml(inputClassName)}"
        ${renderAttrs(options.inputAttrs)}
        type="number"
        inputmode="numeric"
        min="${escapeHtml(options.min ?? 1)}"
        step="${escapeHtml(options.step ?? 1)}"
        ${options.max === undefined ? '' : `max="${escapeHtml(options.max)}"`}
        value="${escapeHtml(options.value)}"
      />
      ${options.rightButtons?.map(renderButton).join('') ?? ''}
    </div>
  `;
}

export function renderTradePriceStepControl(options: TradePriceStepControlOptions): string {
  return `
    <div class="market-price-control-row">
      ${renderButtonGroup(options.leftButtons, 'market-price-control-side')}
      <div class="market-price-display"${renderAttrs(options.displayAttrs)}>
        <strong>${escapeHtml(options.value)}</strong>
        <span>${escapeHtml(options.currencyName)}</span>
      </div>
      ${renderButtonGroup(options.rightButtons, 'market-price-control-side')}
    </div>
  `;
}
