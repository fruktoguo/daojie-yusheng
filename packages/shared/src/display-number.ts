/** 去掉小数末尾多余的 0。 */
function trimTrailingZeros(text: string): string {
  return text.replace(/\.?0+$/, '');
}

const PLAIN_NUMBER_FORMATTERS = new Map<number, Intl.NumberFormat>();

/** 获取不带千分位的大数格式化器，避免极大数回退为科学计数法。 */
function getPlainNumberFormatter(maximumFractionDigits: number): Intl.NumberFormat {
  const normalizedDigits = Math.max(0, Math.min(20, Math.floor(maximumFractionDigits)));
  const cached = PLAIN_NUMBER_FORMATTERS.get(normalizedDigits);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits: normalizedDigits,
  });
  PLAIN_NUMBER_FORMATTERS.set(normalizedDigits, formatter);
  return formatter;
}

/** 按固定精度输出普通数值。 */
function formatPlainNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const normalizedDigits = Math.max(0, Math.min(20, Math.floor(maximumFractionDigits)));
  if (maximumFractionDigits <= 0 || Math.abs(value % 1) < 1e-6) {
    const rounded = Math.round(value);
    return Math.abs(rounded) >= 1e21 ? getPlainNumberFormatter(0).format(rounded) : String(rounded);
  }
  if (Math.abs(value) >= 1e21) {
    return trimTrailingZeros(getPlainNumberFormatter(normalizedDigits).format(value));
  }
  return trimTrailingZeros(value.toFixed(normalizedDigits));
}

/** 中文四位进制大数单位。 */
const COMPACT_NUMBER_UNITS = [
  { value: 1e68, suffix: '无量大数' },
  { value: 1e64, suffix: '不可思议' },
  { value: 1e60, suffix: '那由他' },
  { value: 1e56, suffix: '阿僧祇' },
  { value: 1e52, suffix: '恒河沙' },
  { value: 1e48, suffix: '极' },
  { value: 1e44, suffix: '载' },
  { value: 1e40, suffix: '正' },
  { value: 1e36, suffix: '涧' },
  { value: 1e32, suffix: '沟' },
  { value: 1e28, suffix: '穰' },
  { value: 1e24, suffix: '秭' },
  { value: 1e20, suffix: '垓' },
  { value: 1e16, suffix: '京' },
  { value: 1e12, suffix: '兆' },
  { value: 1e8, suffix: '亿' },
  { value: 1e4, suffix: '万' },
] as const;

/** 按当前数值选择最合适的中文大数单位。 */
function resolveCompactNumberUnit(absValue: number): (typeof COMPACT_NUMBER_UNITS)[number] {
  for (const unit of COMPACT_NUMBER_UNITS) {
    if (absValue >= unit.value) {
      return unit;
    }
  }
  return COMPACT_NUMBER_UNITS[COMPACT_NUMBER_UNITS.length - 1];
}

/** 数字显示格式选项。 */
export interface DisplayNumberOptions {
  /** 普通数值最多保留的小数位。 */
  maximumFractionDigits?: number;
  /** 开始压缩为中文单位的阈值。 */
  compactThreshold?: number;
  /** 压缩为中文单位后最多保留的小数位。 */
  compactMaximumFractionDigits?: number;
}

/** 格式化需要展示给玩家的数值。 */
export function formatDisplayNumber(value: number, options: DisplayNumberOptions = {}): string {
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
  const unit = resolveCompactNumberUnit(absValue);
  return `${sign}${formatPlainNumber(absValue / unit.value, compactMaximumFractionDigits)}${unit.suffix}`;
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
