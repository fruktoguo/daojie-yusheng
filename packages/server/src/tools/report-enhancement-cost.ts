/**
 * CLI 工具：按期望值估算强化到目标等级所需的灵石、保护物与总成本。
 *
 * 默认按用户指定口径：
 * - 只有成功时才扣灵石
 * - 未保护失败归零
 * - 保护失败降 1 级并消耗 1 个保护物
 *
 * 用法示例：
 * `pnpm --filter @mud/server report:enhancement:cost -- --target-level=10 --item-level=2`
 * `pnpm --filter @mud/server report:enhancement:cost -- --target-level=10 --item-level=2 --protection-unit-price=5`
 * `pnpm --filter @mud/server report:enhancement:cost -- --target-level=10 --item-level=2 --item-id=equip.copper_enhancement_hammer`
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  MAX_ENHANCE_LEVEL,
  applyAsymptoticSuccessModifier,
  getEnhancementSpiritStoneCost,
  getEnhancementTargetSuccessRate,
} from '@mud/shared';

/** CliOptions：定义强化成本估算脚本的输入参数。 */
interface CliOptions {
  targetLevel: number;
  itemLevel: number;
  extraSuccessRate: number;
  protectionUnitPrice?: number;
  targetItemUnitPrice?: number;
  itemId?: string;
  protectionItemId?: string;
  protectionEnhanceLevel: number;
  envFile: string;
}

/** StrategySummary：定义单个保护起点策略的期望结果。 */
interface StrategySummary {
  protectionStartLevel: number | null;
  expectedSpiritStones: number;
  expectedProtectionCount: number;
  expectedTargetCopies: number;
  expectedProtectionCost?: number;
  expectedTotalCostWithoutBase?: number;
  expectedTotalCostWithBase?: number;
}

/** PostgresConnectionOptions：定义最小 PostgreSQL 连接选项。 */
interface PostgresConnectionOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

/** PgQueryResult：定义最小查询返回结构。 */
interface PgQueryResult<Row> {
  rows: Row[];
}

/** PgClient：定义最小 PostgreSQL 客户端接口。 */
interface PgClient {
  connect(): Promise<void>;
  query<Row>(sql: string, params?: unknown[]): Promise<PgQueryResult<Row>>;
  end(): Promise<void>;
}

const { Client: PgClient } = require('pg') as {
  Client: new (options: PostgresConnectionOptions) => PgClient;
};

/** ParsedArgMap：定义 CLI 参数键值表。 */
type ParsedArgMap = Map<string, string>;

/** main：执行脚本主流程。 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help')) {
    printHelp();
    return;
  }

  const options = normalizeOptions(args);
  const protectionItemId = options.protectionItemId ?? options.itemId;
  let resolvedProtectionUnitPrice = options.protectionUnitPrice;
  let priceSource = resolvedProtectionUnitPrice === undefined ? '未提供' : '命令行';

  if (resolvedProtectionUnitPrice === undefined && protectionItemId) {
    try {
      const marketPrice = await readLowestSellPrice({
        itemId: protectionItemId,
        enhanceLevel: options.protectionEnhanceLevel,
        envFile: options.envFile,
      });
      priceSource = marketPrice === null ? '坊市当前无挂售' : '坊市最低挂售价';
      if (marketPrice === null) {
        resolvedProtectionUnitPrice = undefined;
      } else {
        resolvedProtectionUnitPrice = marketPrice;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      priceSource = `坊市查询失败: ${message}`;
      resolvedProtectionUnitPrice = undefined;
    }
  }

  const spiritStonePerSuccess = getEnhancementSpiritStoneCost(options.itemLevel, false);
  const successRates = buildSuccessRateMap(options.targetLevel, options.extraSuccessRate);
  const strategies = buildStrategies({
    targetLevel: options.targetLevel,
    spiritStonePerSuccess,
    protectionUnitPrice: resolvedProtectionUnitPrice,
    targetItemUnitPrice: options.targetItemUnitPrice,
    itemId: options.itemId,
    protectionItemId,
    successRates,
  });
  const bestStrategy = resolvedProtectionUnitPrice === undefined
    ? null
    : findBestStrategy(strategies);

  printSummary({
    options,
    spiritStonePerSuccess,
    successRates,
    strategies,
    bestStrategy,
    protectionUnitPrice: resolvedProtectionUnitPrice,
    protectionPriceSource: priceSource,
    protectionItemId,
  });
}

/** parseArgs：解析 `--key=value` 风格参数。 */
function parseArgs(argv: string[]): ParsedArgMap {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const body = arg.slice(2);
    const equalIndex = body.indexOf('=');
    if (equalIndex < 0) {
      args.set(body, 'true');
      continue;
    }
    const key = body.slice(0, equalIndex).trim();
    const value = body.slice(equalIndex + 1).trim();
    args.set(key, value);
  }
  return args;
}

/** normalizeOptions：归一化 CLI 参数并做基础校验。 */
function normalizeOptions(args: ParsedArgMap): CliOptions {
  const targetLevel = requireInteger(args, 'target-level', 1, MAX_ENHANCE_LEVEL);
  const itemLevel = requireInteger(args, 'item-level', 1, 9999);
  const extraSuccessRate = parseRateInput(args.get('extra-success-rate') ?? '0');
  const protectionUnitPrice = parseOptionalNumber(args.get('protection-unit-price'));
  const targetItemUnitPrice = parseOptionalNumber(args.get('target-item-unit-price'));
  const rawItemId = args.get('item-id')?.trim();
  const rawProtectionItemId = args.get('protection-item-id')?.trim();
  const itemId = rawItemId && rawItemId.length > 0 ? rawItemId : undefined;
  const protectionItemId = rawProtectionItemId && rawProtectionItemId.length > 0 ? rawProtectionItemId : undefined;
  const protectionEnhanceLevel = parseOptionalInteger(args.get('protection-enhance-level'), 0, MAX_ENHANCE_LEVEL) ?? 0;
  const envFile = args.get('env-file')?.trim() || path.resolve(__dirname, '..', '..', '.env');

  if (protectionUnitPrice !== undefined && protectionUnitPrice < 0) {
    throw new Error('`--protection-unit-price` 不能小于 0。');
  }
  if (targetItemUnitPrice !== undefined && targetItemUnitPrice < 0) {
    throw new Error('`--target-item-unit-price` 不能小于 0。');
  }

  return {
    targetLevel,
    itemLevel,
    extraSuccessRate,
    protectionUnitPrice,
    targetItemUnitPrice,
    itemId,
    protectionItemId,
    protectionEnhanceLevel,
    envFile,
  };
}

/** requireInteger：读取必须存在的整数参数。 */
function requireInteger(args: ParsedArgMap, key: string, min: number, max: number): number {
  const raw = args.get(key);
  if (!raw) {
    throw new Error(`缺少必要参数：\`--${key}=...\``);
  }
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`参数 \`--${key}\` 必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return value;
}

/** parseOptionalInteger：解析可选整数参数。 */
function parseOptionalInteger(raw: string | undefined, min: number, max: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`整数参数超出范围：${raw}`);
  }
  return value;
}

/** parseOptionalNumber：解析可选数值参数。 */
function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`数值参数无效：${raw}`);
  }
  return value;
}

/** parseRateInput：解析额外成功率，支持 `0.01`、`1`、`1%` 三种写法。 */
function parseRateInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(percent)) {
      throw new Error(`额外成功率无效：${raw}`);
    }
    return percent / 100;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error(`额外成功率无效：${raw}`);
  }
  return Math.abs(value) > 1 ? value / 100 : value;
}

/** buildSuccessRateMap：构建每一级目标强化的实际成功率。 */
function buildSuccessRateMap(targetLevel: number, extraSuccessRate: number): number[] {
  const rates = Array(targetLevel + 1).fill(0);
  for (let level = 1; level <= targetLevel; level += 1) {
    rates[level] = applyAsymptoticSuccessModifier(getEnhancementTargetSuccessRate(level), extraSuccessRate);
  }
  return rates;
}

/** buildStrategies：计算所有保护起点的期望值。 */
function buildStrategies(input: {
  targetLevel: number;
  spiritStonePerSuccess: number;
  protectionUnitPrice?: number;
  targetItemUnitPrice?: number;
  itemId?: string;
  protectionItemId?: string;
  successRates: number[];
}): StrategySummary[] {
  const strategies: StrategySummary[] = [];
  strategies.push(buildStrategySummary({
    protectionStartLevel: null,
    ...input,
  }));
  for (let level = 2; level <= input.targetLevel; level += 1) {
    strategies.push(buildStrategySummary({
      protectionStartLevel: level,
      ...input,
    }));
  }
  return strategies;
}

/** buildStrategySummary：计算单个保护起点的期望灵石、保护数与总成本。 */
function buildStrategySummary(input: {
  protectionStartLevel: number | null;
  targetLevel: number;
  spiritStonePerSuccess: number;
  protectionUnitPrice?: number;
  targetItemUnitPrice?: number;
  itemId?: string;
  protectionItemId?: string;
  successRates: number[];
}): StrategySummary {
  const coeff = buildCoefficientMatrix(input.targetLevel, input.protectionStartLevel, input.successRates);
  const expectedSpiritStones = solveLinearSystem(
    coeff.matrix,
    buildRewardVector({
      targetLevel: input.targetLevel,
      successRates: input.successRates,
      protectionStartLevel: input.protectionStartLevel,
      reward: ({ successRate }) => successRate * input.spiritStonePerSuccess,
    }),
  )[0] ?? 0;
  const expectedProtectionCount = solveLinearSystem(
    coeff.matrix,
    buildRewardVector({
      targetLevel: input.targetLevel,
      successRates: input.successRates,
      protectionStartLevel: input.protectionStartLevel,
      reward: ({ failureRate, protectionActive }) => protectionActive ? failureRate : 0,
    }),
  )[0] ?? 0;

  const isSelfProtection = Boolean(
    input.itemId
    && input.protectionItemId
    && input.itemId === input.protectionItemId,
  );
  const expectedTargetCopies = isSelfProtection ? 1 + expectedProtectionCount : 1;
  const expectedProtectionCost = input.protectionUnitPrice === undefined
    ? input.protectionStartLevel === null ? 0 : undefined
    : expectedProtectionCount * input.protectionUnitPrice;
  const expectedTotalCostWithoutBase = expectedProtectionCost === undefined
    ? undefined
    : expectedSpiritStones + expectedProtectionCost;

  let expectedTotalCostWithBase: number | undefined;
  const baseItemUnitPrice = input.targetItemUnitPrice ?? (isSelfProtection ? input.protectionUnitPrice : undefined);
  if (expectedTotalCostWithoutBase !== undefined && baseItemUnitPrice !== undefined) {
    expectedTotalCostWithBase = expectedTotalCostWithoutBase + baseItemUnitPrice;
  }

  return {
    protectionStartLevel: input.protectionStartLevel,
    expectedSpiritStones,
    expectedProtectionCount,
    expectedTargetCopies,
    expectedProtectionCost,
    expectedTotalCostWithoutBase,
    expectedTotalCostWithBase,
  };
}

/** buildCoefficientMatrix：构建期望方程组系数矩阵。 */
function buildCoefficientMatrix(
  targetLevel: number,
  protectionStartLevel: number | null,
  successRates: number[],
): { matrix: number[][] } {
  const matrix = Array.from({ length: targetLevel }, () => Array(targetLevel).fill(0));
  for (let currentLevel = 0; currentLevel < targetLevel; currentLevel += 1) {
    const nextLevel = currentLevel + 1;
    const successRate = successRates[nextLevel] ?? 0;
    const failureRate = 1 - successRate;
    const protectionActive = protectionStartLevel !== null && nextLevel >= protectionStartLevel;
    const failureLevel = protectionActive ? Math.max(0, currentLevel - 1) : 0;

    matrix[currentLevel][currentLevel] += 1;
    if (nextLevel < targetLevel) {
      matrix[currentLevel][nextLevel] -= successRate;
    }
    if (failureLevel < targetLevel) {
      matrix[currentLevel][failureLevel] -= failureRate;
    }
  }
  return { matrix };
}

/** buildRewardVector：构建方程右侧常数项。 */
function buildRewardVector(input: {
  targetLevel: number;
  successRates: number[];
  protectionStartLevel: number | null;
  reward: (entry: { successRate: number; failureRate: number; protectionActive: boolean }) => number;
}): number[] {
  const rewards = Array(input.targetLevel).fill(0);
  for (let currentLevel = 0; currentLevel < input.targetLevel; currentLevel += 1) {
    const nextLevel = currentLevel + 1;
    const successRate = input.successRates[nextLevel] ?? 0;
    const failureRate = 1 - successRate;
    const protectionActive = input.protectionStartLevel !== null && nextLevel >= input.protectionStartLevel;
    rewards[currentLevel] = input.reward({
      successRate,
      failureRate,
      protectionActive,
    });
  }
  return rewards;
}

/** solveLinearSystem：高斯消元求解小规模线性方程组。 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const a = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error('强化期望值方程求解失败：矩阵奇异。');
    }

    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    const divisor = a[col][col];
    for (let index = col; index < size; index += 1) {
      a[col][index] /= divisor;
    }
    b[col] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-12) {
        continue;
      }
      for (let index = col; index < size; index += 1) {
        a[row][index] -= factor * a[col][index];
      }
      b[row] -= factor * b[col];
    }
  }

  return b;
}

/** findBestStrategy：根据总成本找到最省钱的保护起点。 */
function findBestStrategy(strategies: StrategySummary[]): StrategySummary | null {
  let best: StrategySummary | null = null;
  for (const strategy of strategies) {
    if (strategy.expectedTotalCostWithoutBase === undefined) {
      continue;
    }
    if (!best || strategy.expectedTotalCostWithoutBase < (best.expectedTotalCostWithoutBase ?? Number.POSITIVE_INFINITY)) {
      best = strategy;
    }
  }
  return best;
}

/** readLowestSellPrice：读取当前坊市某个物品指定强化等级的最低挂售价。 */
async function readLowestSellPrice(input: {
  itemId: string;
  enhanceLevel: number;
  envFile: string;
}): Promise<number | null> {
  loadEnvFileIfPresent(input.envFile);
  const options = buildPostgresConnectionOptions();
  const client = new PgClient(options);

  try {
    await client.connect();
    const result = await client.query<{ lowest_sell_price: string | number | null }>(
      `
        SELECT MIN("unitPrice") AS lowest_sell_price
        FROM market_orders
        WHERE status = 'open'
          AND side = 'sell'
          AND ("itemSnapshot"->>'itemId') = $1
          AND COALESCE((("itemSnapshot"->>'enhanceLevel'))::int, 0) = $2
      `,
      [input.itemId, input.enhanceLevel],
    );
    const rawPrice = result.rows[0]?.lowest_sell_price;
    if (rawPrice === null || rawPrice === undefined) {
      return null;
    }
    const value = Number(rawPrice);
    return Number.isFinite(value) ? value : null;
  } finally {
    await client.end();
  }
}

/** loadEnvFileIfPresent：在未显式设置环境变量时从 `.env` 注入数据库配置。 */
function loadEnvFileIfPresent(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** buildPostgresConnectionOptions：构建 PostgreSQL 连接参数。 */
function buildPostgresConnectionOptions(): PostgresConnectionOptions {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && databaseUrl.trim().length > 0) {
    return {
      connectionString: databaseUrl.trim(),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'daojie_yusheng',
  };
}

/** printSummary：输出最终估算结果。 */
function printSummary(input: {
  options: CliOptions;
  spiritStonePerSuccess: number;
  successRates: number[];
  strategies: StrategySummary[];
  bestStrategy: StrategySummary | null;
  protectionUnitPrice?: number;
  protectionPriceSource: string;
  protectionItemId?: string;
}): void {
  console.log('强化成本期望估算');
  console.log(`目标强化等级: +${input.options.targetLevel}`);
  console.log(`物品等级: ${input.options.itemLevel}`);
  console.log(`额外成功率修正: ${(input.options.extraSuccessRate * 100).toFixed(2)}%`);
  console.log(`灵石结算口径: 仅成功时扣除，每次成功 ${formatNumber(input.spiritStonePerSuccess)} 灵石`);
  console.log(`保护失败规则: 生效时降 1 级并消耗 1 个保护物；未保护失败归零`);
  if (input.protectionItemId) {
    console.log(`保护物品 ID: ${input.protectionItemId} (+${input.options.protectionEnhanceLevel})`);
  }
  if (input.protectionUnitPrice !== undefined) {
    console.log(`保护物单价: ${formatNumber(input.protectionUnitPrice)} 灵石 (${input.protectionPriceSource})`);
  } else {
    console.log(`保护物单价: 未知 (${input.protectionPriceSource})`);
  }
  if (input.options.targetItemUnitPrice !== undefined) {
    console.log(`目标物本体单价: ${formatNumber(input.options.targetItemUnitPrice)} 灵石`);
  }

  console.log('');
  console.log('逐级成功率:');
  for (let level = 1; level <= input.options.targetLevel; level += 1) {
    console.log(`  +${level}: ${(input.successRates[level] * 100).toFixed(2)}%`);
  }

  console.log('');
  console.log('各保护策略期望:');
  console.log('  保护起点 | 期望灵石 | 期望保护 | 期望本体数 | 保护成本 | 总成本(不含本体) | 总成本(含本体)');
  for (const strategy of input.strategies) {
    console.log(
      [
        padStrategyLabel(strategy.protectionStartLevel),
        pad(formatNumber(strategy.expectedSpiritStones), 9),
        pad(formatNumber(strategy.expectedProtectionCount), 9),
        pad(formatNumber(strategy.expectedTargetCopies), 10),
        pad(formatOptionalNumber(strategy.expectedProtectionCost), 8),
        pad(formatOptionalNumber(strategy.expectedTotalCostWithoutBase), 15),
        pad(formatOptionalNumber(strategy.expectedTotalCostWithBase), 13),
      ].join(' | '),
    );
  }

  console.log('');
  if (input.bestStrategy) {
    console.log(`最省钱的保护起点: ${strategyLabel(input.bestStrategy.protectionStartLevel)}`);
    console.log(`对应期望灵石: ${formatNumber(input.bestStrategy.expectedSpiritStones)}`);
    console.log(`对应期望保护数: ${formatNumber(input.bestStrategy.expectedProtectionCount)}`);
    if (input.bestStrategy.expectedTotalCostWithoutBase !== undefined) {
      console.log(`对应期望总成本(不含本体): ${formatNumber(input.bestStrategy.expectedTotalCostWithoutBase)} 灵石`);
    }
    if (input.bestStrategy.expectedTotalCostWithBase !== undefined) {
      console.log(`对应期望总成本(含本体): ${formatNumber(input.bestStrategy.expectedTotalCostWithBase)} 灵石`);
    }
  } else {
    console.log('未提供保护物单价，暂时无法判断哪一级开始保护最省钱。');
  }
}

/** printHelp：输出脚本帮助信息。 */
function printHelp(): void {
  console.log([
    '强化成本期望估算脚本',
    '',
    '必填参数：',
    '  --target-level=10              目标强化等级，范围 1~20',
    '  --item-level=2                 目标物品等级，用于计算每次成功扣除的灵石',
    '',
    '可选参数：',
    '  --extra-success-rate=0.01      额外成功率修正，支持 0.01 / 1 / 1%',
    '  --protection-unit-price=5      保护物单价；若不填且提供了保护物品 ID，会尝试查坊市最低挂售价',
    '  --target-item-unit-price=5     目标本体单价；用于计算“含本体”的总成本',
    '  --item-id=equip.xxx            目标物品 ID；当保护物与本体相同且未填 protection-item-id 时会复用',
    '  --protection-item-id=equip.xxx 保护物品 ID；不填则回退为 item-id',
    '  --protection-enhance-level=0   查坊市时锁定保护物强化等级，默认 +0',
    '  --env-file=packages/server/.env 数据库配置文件路径',
    '  --help                         查看帮助',
    '',
    '说明：',
    '  1. 该脚本只估算灵石与保护物，不包含额外材料。',
    '  2. 默认按“成功才扣灵石、失败不扣灵石”的口径计算。',
    '  3. 若保护物与目标本体相同，会额外输出期望本体总消耗数。',
  ].join('\n'));
}

/** strategyLabel：格式化保护起点标签。 */
function strategyLabel(value: number | null): string {
  return value === null ? '无保护' : `从 +${value} 开始保护`;
}

/** padStrategyLabel：格式化表格中的保护起点。 */
function padStrategyLabel(value: number | null): string {
  return pad(value === null ? '无保护' : `+${value}`, 8);
}

/** formatOptionalNumber：格式化可选数值。 */
function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? '-' : formatNumber(value);
}

/** formatNumber：格式化小数显示。 */
function formatNumber(value: number): string {
  return value.toFixed(2);
}

/** pad：右对齐填充字符串。 */
function pad(value: string, width: number): string {
  return value.padStart(width, ' ');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`强化成本估算失败：${message}`);
  process.exitCode = 1;
});
