/** MARKET_PRICE_PRESET_VALUES：定义该变量以承载业务值。 */
export const MARKET_PRICE_PRESET_VALUES = [0.01, 1, 100, 10_000, 1_000_000] as const;
/** MARKET_MIN_UNIT_PRICE：定义该变量以承载业务值。 */
export const MARKET_MIN_UNIT_PRICE = MARKET_PRICE_PRESET_VALUES[0];
/** MARKET_MAX_UNIT_PRICE：定义该变量以承载业务值。 */
export const MARKET_MAX_UNIT_PRICE = 10_000_000_000;

/** MARKET_FRACTIONAL_PRICE_SCALE：定义该变量以承载业务值。 */
const MARKET_FRACTIONAL_PRICE_SCALE = 100;
/** MARKET_PRICE_EPSILON：定义该变量以承载业务值。 */
const MARKET_PRICE_EPSILON = 1e-9;

/** MarketPriceBand：定义该类型的结构与数据语义。 */
type MarketPriceBand = {
/** start：定义该变量以承载业务值。 */
  start: number;
/** end：定义该变量以承载业务值。 */
  end: number;
/** step：定义该变量以承载业务值。 */
  step: number;
};

/** greatestCommonDivisor：执行对应的业务逻辑。 */
function greatestCommonDivisor(left: number, right: number): number {
/** a：定义该变量以承载业务值。 */
  let a = Math.abs(Math.trunc(left));
/** b：定义该变量以承载业务值。 */
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
/** next：定义该变量以承载业务值。 */
    const next = a % b;
    a = b;
    b = next;
  }
  return Math.max(1, a);
}

/** normalizeFractionalPriceUnits：执行对应的业务逻辑。 */
function normalizeFractionalPriceUnits(value: number): number | null {
  if (!Number.isFinite(value) || value < MARKET_MIN_UNIT_PRICE || value >= 1) {
    return null;
  }
/** scaled：定义该变量以承载业务值。 */
  const scaled = Math.round(value * MARKET_FRACTIONAL_PRICE_SCALE);
  if (Math.abs((value * MARKET_FRACTIONAL_PRICE_SCALE) - scaled) > MARKET_PRICE_EPSILON) {
    return null;
  }
  if (scaled <= 0 || scaled >= MARKET_FRACTIONAL_PRICE_SCALE) {
    return null;
  }
  return scaled;
}

/** normalizeBasePrice：执行对应的业务逻辑。 */
function normalizeBasePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 1) {
    return 1;
  }
  return 10 ** Math.floor(Math.log10(value));
}

/** getMarketPriceBand：执行对应的业务逻辑。 */
function getMarketPriceBand(value: number): MarketPriceBand {
/** price：定义该变量以承载业务值。 */
  const price = Math.max(1, Math.floor(value));
/** base：定义该变量以承载业务值。 */
  const base = normalizeBasePrice(price);
/** normalized：定义该变量以承载业务值。 */
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

/** getMarketPriceStep：执行对应的业务逻辑。 */
export function getMarketPriceStep(value: number): number {
  if (value < 1) {
    return MARKET_MIN_UNIT_PRICE;
  }
  return getMarketPriceBand(value).step;
}

/** isValidMarketPrice：执行对应的业务逻辑。 */
export function isValidMarketPrice(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0 || value > MARKET_MAX_UNIT_PRICE) {
    return false;
  }
  if (value < 1) {
    return normalizeFractionalPriceUnits(value) !== null;
  }
  if (!Number.isInteger(value)) {
    return false;
  }
/** band：定义该变量以承载业务值。 */
  const band = getMarketPriceBand(value);
  return (value - band.start) % band.step === 0;
}

/** normalizeMarketPriceUp：执行对应的业务逻辑。 */
export function normalizeMarketPriceUp(value: number): number {
  if (!Number.isFinite(value)) {
    return MARKET_MIN_UNIT_PRICE;
  }
/** bounded：定义该变量以承载业务值。 */
  const bounded = Math.max(MARKET_MIN_UNIT_PRICE, Math.min(MARKET_MAX_UNIT_PRICE, value));
  if (bounded < 1) {
/** scaled：定义该变量以承载业务值。 */
    const scaled = Math.ceil((bounded * MARKET_FRACTIONAL_PRICE_SCALE) - MARKET_PRICE_EPSILON);
    if (scaled >= MARKET_FRACTIONAL_PRICE_SCALE) {
      return 1;
    }
    return Math.max(1, scaled) / MARKET_FRACTIONAL_PRICE_SCALE;
  }
/** current：定义该变量以承载业务值。 */
  let current = Math.max(1, Math.ceil(bounded));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
/** band：定义该变量以承载业务值。 */
    const band = getMarketPriceBand(current);
/** offset：定义该变量以承载业务值。 */
    const offset = current - band.start;
/** alignedOffset：定义该变量以承载业务值。 */
    const alignedOffset = Math.ceil(offset / band.step) * band.step;
/** candidate：定义该变量以承载业务值。 */
    const candidate = band.start + alignedOffset;
    if (candidate < band.end) {
      return candidate;
    }
    current = band.end;
  }
}

/** normalizeMarketPriceDown：执行对应的业务逻辑。 */
export function normalizeMarketPriceDown(value: number): number {
  if (!Number.isFinite(value)) {
    return MARKET_MIN_UNIT_PRICE;
  }
/** bounded：定义该变量以承载业务值。 */
  const bounded = Math.max(MARKET_MIN_UNIT_PRICE, Math.min(MARKET_MAX_UNIT_PRICE, value));
  if (bounded < 1) {
/** scaled：定义该变量以承载业务值。 */
    const scaled = Math.floor((bounded * MARKET_FRACTIONAL_PRICE_SCALE) + MARKET_PRICE_EPSILON);
    return Math.max(1, Math.min(scaled, MARKET_FRACTIONAL_PRICE_SCALE - 1)) / MARKET_FRACTIONAL_PRICE_SCALE;
  }
/** current：定义该变量以承载业务值。 */
  let current = Math.max(1, Math.floor(bounded));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
/** band：定义该变量以承载业务值。 */
    const band = getMarketPriceBand(current);
/** offset：定义该变量以承载业务值。 */
    const offset = current - band.start;
/** alignedOffset：定义该变量以承载业务值。 */
    const alignedOffset = Math.floor(offset / band.step) * band.step;
/** candidate：定义该变量以承载业务值。 */
    const candidate = band.start + alignedOffset;
    if (candidate >= band.start) {
      return candidate;
    }
    current = band.start - 1;
  }
}

/** getMarketMinimumTradeQuantity：执行对应的业务逻辑。 */
export function getMarketMinimumTradeQuantity(unitPrice: number): number {
/** scaled：定义该变量以承载业务值。 */
  const scaled = normalizeFractionalPriceUnits(unitPrice);
  if (scaled === null) {
    return 1;
  }
  return MARKET_FRACTIONAL_PRICE_SCALE / greatestCommonDivisor(MARKET_FRACTIONAL_PRICE_SCALE, scaled);
}

/** isValidMarketTradeQuantity：执行对应的业务逻辑。 */
export function isValidMarketTradeQuantity(unitPrice: number, quantity: number): boolean {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return false;
  }
  return quantity % getMarketMinimumTradeQuantity(unitPrice) === 0;
}

/** calculateMarketTradeTotalCost：执行对应的业务逻辑。 */
export function calculateMarketTradeTotalCost(quantity: number, unitPrice: number): number | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || !isValidMarketPrice(unitPrice)) {
    return null;
  }
  if (unitPrice >= 1) {
/** total：定义该变量以承载业务值。 */
    const total = quantity * unitPrice;
    return Number.isSafeInteger(total) ? total : null;
  }
/** scaled：定义该变量以承载业务值。 */
  const scaled = normalizeFractionalPriceUnits(unitPrice);
  if (scaled === null) {
    return null;
  }
/** totalScaled：定义该变量以承载业务值。 */
  const totalScaled = quantity * scaled;
  if (!Number.isSafeInteger(totalScaled) || totalScaled % MARKET_FRACTIONAL_PRICE_SCALE !== 0) {
    return null;
  }
/** total：定义该变量以承载业务值。 */
  const total = totalScaled / MARKET_FRACTIONAL_PRICE_SCALE;
  return Number.isSafeInteger(total) ? total : null;
}
