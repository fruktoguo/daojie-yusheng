export const MARKET_PRICE_PRESET_VALUES = [1, 100, 10_000, 1_000_000] as const;
export const MARKET_MAX_UNIT_PRICE = 10_000_000_000;

type MarketPriceBand = {
  start: number;
  end: number;
  step: number;
};

function normalizeBasePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 1) {
    return 1;
  }
  return 10 ** Math.floor(Math.log10(value));
}

function getMarketPriceBand(value: number): MarketPriceBand {
  const price = Math.max(1, Math.floor(value));
  const base = normalizeBasePrice(price);
  const normalized = price / base;
  if (normalized < 3) {
    return {
      start: base,
      end: base * 3,
      step: Math.max(1, base / 20),
    };
  }
  if (normalized < 5) {
    return {
      start: base * 3,
      end: base * 5,
      step: Math.max(1, base / 10),
    };
  }
  return {
    start: base * 5,
    end: base * 10,
    step: Math.max(1, base / 5),
  };
}

export function getMarketPriceStep(value: number): number {
  return getMarketPriceBand(value).step;
}

export function isValidMarketPrice(value: number): boolean {
  if (!Number.isInteger(value) || value <= 0) {
    return false;
  }
  const band = getMarketPriceBand(value);
  return (value - band.start) % band.step === 0;
}

export function normalizeMarketPriceUp(value: number): number {
  let current = Math.max(1, Math.ceil(value));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
    const band = getMarketPriceBand(current);
    const offset = current - band.start;
    const alignedOffset = Math.ceil(offset / band.step) * band.step;
    const candidate = band.start + alignedOffset;
    if (candidate < band.end) {
      return candidate;
    }
    current = band.end;
  }
}

export function normalizeMarketPriceDown(value: number): number {
  let current = Math.max(1, Math.floor(value));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
    const band = getMarketPriceBand(current);
    const offset = current - band.start;
    const alignedOffset = Math.floor(offset / band.step) * band.step;
    const candidate = band.start + alignedOffset;
    if (candidate >= band.start) {
      return candidate;
    }
    current = band.start - 1;
  }
}
