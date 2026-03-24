function trimTrailingZeros(text: string): string {
  return text.replace(/\.?0+$/, '');
}

function formatPlainNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (maximumFractionDigits <= 0 || Math.abs(value % 1) < 1e-6) {
    return String(Math.round(value));
  }
  return trimTrailingZeros(value.toFixed(maximumFractionDigits));
}

export interface DisplayNumberOptions {
  maximumFractionDigits?: number;
  compactThreshold?: number;
  compactMaximumFractionDigits?: number;
}

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
  if (absValue >= 100_000_000) {
    return `${sign}${formatPlainNumber(absValue / 100_000_000, compactMaximumFractionDigits)}亿`;
  }
  return `${sign}${formatPlainNumber(absValue / 10_000, compactMaximumFractionDigits)}万`;
}

export function formatDisplayInteger(value: number, options: Omit<DisplayNumberOptions, 'maximumFractionDigits'> = {}): string {
  return formatDisplayNumber(Math.round(value), {
    ...options,
    maximumFractionDigits: 0,
  });
}

export function formatDisplaySignedNumber(value: number, options: DisplayNumberOptions = {}): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatDisplayNumber(Math.abs(value), options)}`;
}

export function formatDisplayPercent(value: number, options: DisplayNumberOptions = {}): string {
  return `${formatDisplayNumber(value, options)}%`;
}

export function formatDisplayCurrentMax(current: number, max: number): string {
  return `${formatDisplayInteger(current)} / ${formatDisplayInteger(max)}`;
}

export function formatDisplayCountBadge(count: number): string {
  return `x${formatDisplayInteger(count)}`;
}
