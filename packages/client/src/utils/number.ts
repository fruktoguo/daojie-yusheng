/** 去掉小数末尾多余的 0。 */
function trimTrailingZeros(text: string): string {
  return text.replace(/\.?0+$/, '');
}

/** 按固定精度输出普通数值。 */
function formatPlainNumber(value: number, maximumFractionDigits: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return '0';
  }
  if (maximumFractionDigits <= 0 || Math.abs(value % 1) < 1e-6) {
    return String(Math.round(value));
  }
  return trimTrailingZeros(value.toFixed(maximumFractionDigits));
}

/** 数字显示格式选项。 */
export interface DisplayNumberOptions {
/**
 * maximumFractionDigits：DisplayNumberOptions 内部字段。
 */

  maximumFractionDigits?: number;  
  /**
 * compactThreshold：DisplayNumberOptions 内部字段。
 */

  compactThreshold?: number;  
  /**
 * compactMaximumFractionDigits：DisplayNumberOptions 内部字段。
 */

  compactMaximumFractionDigits?: number;
}

/** 格式化需要展示给玩家的数值。 */
export function formatDisplayNumber(value: number, options: DisplayNumberOptions = {}): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return '0';
  }
  const {
    maximumFractionDigits = 2,
    compactThreshold = 10_000,
    compactMaximumFractionDigits = 1,
  } = options;
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue < compactThreshold) {
    return `${sign}${formatPlainNumber(absValue, maximumFractionDigits)}`;
  }
  if (absValue >= 100_000_000) {
    return `${sign}${formatPlainNumber(absValue / 100_000_000, compactMaximumFractionDigits)}亿`;
  }
  return `${sign}${formatPlainNumber(absValue / 10_000, compactMaximumFractionDigits)}万`;
}

/** 格式化整数显示。 */
export function formatDisplayInteger(value: number, options: Omit<DisplayNumberOptions, 'maximumFractionDigits'> = {}): string {
  return formatDisplayNumber(Math.round(value), {
    ...options,
    maximumFractionDigits: 0,
  });
}

/** 格式化带正负号的数值。 */
export function formatDisplaySignedNumber(value: number, options: DisplayNumberOptions = {}): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatDisplayNumber(Math.abs(value), options)}`;
}

/** 格式化百分比。 */
export function formatDisplayPercent(value: number, options: DisplayNumberOptions = {}): string {
  return `${formatDisplayNumber(value, options)}%`;
}

/** 格式化“当前 / 最大值”。 */
export function formatDisplayCurrentMax(current: number, max: number): string {
  return `${formatDisplayInteger(current)} / ${formatDisplayInteger(max)}`;
}

/** 格式化数量角标。 */
export function formatDisplayCountBadge(count: number): string {
  return `x${formatDisplayInteger(count)}`;
}
