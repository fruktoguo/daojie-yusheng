#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultConfigPath = path.join(repoRoot, 'docs/数值分析/境界等级基准期望六维参数.json');
const ATTR_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'];

function parseArgs(argv) {
  const args = {
    configPath: defaultConfigPath,
    outputPath: undefined,
    baselineOutputPath: undefined,
    maxRealmLevel: undefined,
  };
  for (const arg of argv) {
    if (arg.startsWith('--config=')) {
      args.configPath = path.resolve(repoRoot, arg.slice('--config='.length));
      continue;
    }
    if (arg.startsWith('--output=')) {
      args.outputPath = path.resolve(repoRoot, arg.slice('--output='.length));
      continue;
    }
    if (arg.startsWith('--baseline-output=')) {
      args.baselineOutputPath = path.resolve(repoRoot, arg.slice('--baseline-output='.length));
      continue;
    }
    if (arg.startsWith('--max-level=')) {
      args.maxRealmLevel = Number(arg.slice('--max-level='.length));
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolvePath(input, fallback) {
  const value = typeof input === 'string' && input.trim() ? input.trim() : fallback;
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

function finiteNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function positiveNumber(value, fallback) {
  return Math.max(0, finiteNumber(value, fallback));
}

function positiveInteger(value, fallback) {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function rawAtDecay(freeLimit, decaySpan, decay) {
  const normalizedDecay = Math.max(0, Math.min(0.999999, finiteNumber(decay, 0)));
  if (normalizedDecay <= 0) {
    return freeLimit;
  }
  return freeLimit + decaySpan * normalizedDecay / (1 - normalizedDecay);
}

function softDecayedPool(rawPool, freeLimit, decaySpan) {
  if (rawPool <= 0) return 0;
  if (rawPool <= freeLimit) return rawPool;
  if (decaySpan <= 0) return freeLimit;
  return freeLimit + decaySpan * Math.log1p((rawPool - freeLimit) / decaySpan);
}

function lerp(left, right, ratio) {
  const t = Math.max(0, Math.min(1, finiteNumber(ratio, 0)));
  return left + (right - left) * t;
}

function mergeBandCurve(defaultCurve, band) {
  return {
    startFreeLimitRatio: finiteNumber(band.startFreeLimitRatio, defaultCurve.startFreeLimitRatio),
    midProgress: Math.max(0, Math.min(1, finiteNumber(band.midProgress, defaultCurve.midProgress))),
    midDecay: finiteNumber(band.midDecay, defaultCurve.midDecay),
    endDecay: finiteNumber(band.endDecay, defaultCurve.endDecay),
    postDecays: Array.isArray(band.postDecays) ? [...band.postDecays] : [...(defaultCurve.postDecays ?? [])],
    capAfterPostDecays: band.capAfterPostDecays ?? defaultCurve.capAfterPostDecays,
  };
}

function buildBandPoints(band, defaultCurve) {
  const startLevel = positiveNumber(band.startLevel, 0);
  const endLevel = positiveNumber(band.endLevel, startLevel);
  const freeLimit = positiveNumber(band.freeLimit, 0);
  const decaySpan = positiveNumber(band.decaySpan, 0);
  const curve = mergeBandCurve(defaultCurve, band);
  const width = Math.max(1, endLevel - startLevel + 1);
  const midpoint = startLevel + (endLevel - startLevel) * curve.midProgress;
  const points = [
    {
      level: startLevel,
      raw: freeLimit * Math.max(0, curve.startFreeLimitRatio),
      label: '起点',
    },
    {
      level: midpoint,
      raw: rawAtDecay(freeLimit, decaySpan, curve.midDecay),
      label: '区间50%',
    },
    {
      level: endLevel,
      raw: rawAtDecay(freeLimit, decaySpan, curve.endDecay),
      label: '终点',
    },
  ];
  const postDecays = Array.isArray(curve.postDecays) ? curve.postDecays : [];
  postDecays.forEach((decay, index) => {
    points.push({
      level: endLevel + width * (index + 1),
      raw: rawAtDecay(freeLimit, decaySpan, decay),
      label: `外推${index + 1}`,
    });
  });
  return {
    ...band,
    startLevel,
    endLevel,
    freeLimit,
    decaySpan,
    curve,
    points: points.sort((left, right) => left.level - right.level),
  };
}

function calculateBandRaw(level, resolvedBand) {
  if (level < resolvedBand.startLevel) {
    return 0;
  }
  const points = resolvedBand.points;
  if (points.length === 0) {
    return 0;
  }
  if (level <= points[0].level) {
    return points[0].raw;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (level <= current.level) {
      const span = current.level - previous.level;
      if (span <= 0) {
        return current.raw;
      }
      return lerp(previous.raw, current.raw, (level - previous.level) / span);
    }
  }
  const last = points[points.length - 1];
  if (resolvedBand.curve.capAfterPostDecays !== false || points.length < 2) {
    return last.raw;
  }
  const previous = points[points.length - 2];
  const levelSpan = Math.max(1, last.level - previous.level);
  const rawSlope = (last.raw - previous.raw) / levelSpan;
  return Math.max(0, last.raw + rawSlope * (level - last.level));
}

function calculateRootCap(level, rootConfig) {
  if (!rootConfig?.enabled) {
    return 0;
  }
  const multiplier = positiveNumber(rootConfig.capMultiplier, 1);
  switch (rootConfig.capFormula) {
    case 'none':
      return 0;
    case 'linear':
      return Math.floor(level * multiplier);
    case 'triangular':
    default:
      return Math.floor((level * (level + 1)) / 2 * multiplier);
  }
}

function calculateRootPercent(level, rootConfig) {
  if (!rootConfig?.enabled) {
    return 0;
  }
  const cap = calculateRootCap(level, rootConfig);
  const expectationRatio = positiveNumber(rootConfig.expectationRatio, 0);
  const percentPerPoint = positiveNumber(rootConfig.percentPerPoint, 1);
  return cap * expectationRatio * percentPerPoint;
}

function calculateBodyTrainingPercent(level, bodyTrainingConfig) {
  if (!bodyTrainingConfig?.enabled) {
    return 0;
  }
  const levelMultiplier = positiveNumber(bodyTrainingConfig.levelMultiplier, 0);
  const percentPerLevel = positiveNumber(bodyTrainingConfig.percentPerLevel, 1);
  return level * levelMultiplier * percentPerLevel;
}

function normalizeBaseStatEnhancementAnchors(baseStatConfig) {
  const anchors = Array.isArray(baseStatConfig?.enhancementAnchors)
    ? baseStatConfig.enhancementAnchors
    : [];
  return anchors
    .map((anchor, index) => ({
      index,
      level: positiveNumber(anchor.level, 0),
      enhanceLevel: positiveNumber(anchor.enhanceLevel, 0),
    }))
    .filter((anchor) => anchor.level > 0)
    .sort((left, right) => left.level - right.level || left.index - right.index);
}

function calculateExpectedEnhanceLevel(level, baseStatConfig) {
  const anchors = normalizeBaseStatEnhancementAnchors(baseStatConfig);
  if (anchors.length === 0) {
    return 0;
  }
  if (level <= anchors[0].level) {
    return anchors[0].enhanceLevel;
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const current = anchors[index];
    if (level <= current.level) {
      const span = current.level - previous.level;
      if (span <= 0) {
        return current.enhanceLevel;
      }
      return lerp(previous.enhanceLevel, current.enhanceLevel, (level - previous.level) / span);
    }
  }
  return anchors[anchors.length - 1].enhanceLevel;
}

function normalizeBaseStatStageDeltas(baseStatConfig) {
  const stages = Array.isArray(baseStatConfig?.realmStageDeltas)
    ? baseStatConfig.realmStageDeltas
    : [];
  return stages
    .map((stage, index) => ({
      index,
      levelFrom: positiveInteger(stage.levelFrom, 0),
      value: finiteNumber(stage.value, 0),
    }))
    .filter((stage) => stage.levelFrom > 0)
    .sort((left, right) => left.levelFrom - right.levelFrom || left.index - right.index);
}

function calculateBaseStatStageDelta(level, baseStatConfig) {
  const stages = normalizeBaseStatStageDeltas(baseStatConfig);
  let value = 0;
  for (const stage of stages) {
    if (level >= stage.levelFrom) {
      value = stage.value;
    }
  }
  return value;
}

function calculateSingleBaseStatValue(level, baseStatConfig) {
  if (!baseStatConfig?.enabled) {
    return undefined;
  }
  const mortalBaseValue = finiteNumber(baseStatConfig.mortalBaseValue, 0);
  const levelBaseValue = finiteNumber(baseStatConfig.levelBaseValue, 8);
  const levelGrowth = finiteNumber(baseStatConfig.levelGrowth, 0.5);
  const enhancementGrowthRate = finiteNumber(baseStatConfig.enhancementGrowthRate, 0.1);
  const levelPool = levelBaseValue + Math.max(0, level - 1) * levelGrowth;
  const expectedEnhanceLevel = calculateExpectedEnhanceLevel(level, baseStatConfig);
  const enhancedPool = levelPool * ((1 + enhancementGrowthRate) ** expectedEnhanceLevel);
  return mortalBaseValue + calculateBaseStatStageDelta(level, baseStatConfig) + enhancedPool;
}

function normalizeRealmStageConfigs(realmBaseConfig) {
  if (!realmBaseConfig?.enabled || !Array.isArray(realmBaseConfig.stages)) {
    return [];
  }
  return realmBaseConfig.stages
    .map((stage, index) => ({
      ...stage,
      index,
      levelFrom: positiveInteger(stage.levelFrom, 0),
      levelTo: positiveInteger(stage.levelTo, 0),
      attrBonus: stage.attrBonus && typeof stage.attrBonus === 'object' ? stage.attrBonus : {},
    }))
    .filter((stage) => stage.levelFrom > 0)
    .sort((left, right) => left.levelFrom - right.levelFrom || left.index - right.index);
}

function resolveRealmStageIndex(level, stages) {
  let result = -1;
  for (let index = 0; index < stages.length; index += 1) {
    if (level >= stages[index].levelFrom) {
      result = index;
    }
  }
  return result;
}

function calculateCumulativeRealmAttrs(level, realmBaseConfig) {
  const result = Object.fromEntries(ATTR_KEYS.map((key) => [key, 0]));
  const stages = normalizeRealmStageConfigs(realmBaseConfig);
  const stageIndex = resolveRealmStageIndex(level, stages);
  if (stageIndex < 0) {
    return { attrs: result, stage: null, stages };
  }
  for (let index = 0; index <= stageIndex; index += 1) {
    const attrBonus = stages[index].attrBonus;
    for (const key of ATTR_KEYS) {
      result[key] += finiteNumber(attrBonus[key], 0);
    }
  }
  return { attrs: result, stage: stages[stageIndex], stages };
}

function calculateRealmOneAttr(level, realmBaseConfig) {
  if (!realmBaseConfig?.enabled) {
    return 0;
  }
  const { attrs } = calculateCumulativeRealmAttrs(level, realmBaseConfig);
  const values = ATTR_KEYS.map((key) => finiteNumber(attrs[key], 0));
  if (realmBaseConfig.mode === 'sum') {
    return values.reduce((sum, value) => sum + value, 0);
  }
  if (realmBaseConfig.mode === 'min') {
    return Math.min(...values);
  }
  return values.reduce((sum, value) => sum + value, 0) / ATTR_KEYS.length;
}

function calculateRows(config, bands) {
  const maxRealmLevel = positiveInteger(config.maxRealmLevel, 78);
  const baseAttr = positiveNumber(config.baseAttrPerKey, 10);
  const rows = [];
  for (let level = 1; level <= maxRealmLevel; level += 1) {
    const techniqueOneAttr = bands.reduce((sum, band) => {
      const raw = calculateBandRaw(level, band);
      return sum + softDecayedPool(raw, band.freeLimit, band.decaySpan);
    }, 0);
    const rootExpectedPct = calculateRootPercent(level, config.rootFoundation);
    const bodyTrainingExpectedPct = calculateBodyTrainingPercent(level, config.bodyTraining);
    const realmOneAttr = calculateRealmOneAttr(level, config.realmBaseAttrs);
    const beforeMultipliers = baseAttr + realmOneAttr + techniqueOneAttr;
    const expectedOneAttr = beforeMultipliers
      * (1 + bodyTrainingExpectedPct / 100)
      * (1 + rootExpectedPct / 100);
    rows.push({
      level,
      realmOneAttr,
      techniqueOneAttr,
      rootExpectedPct,
      bodyTrainingExpectedPct,
      beforeMultipliers,
      expectedOneAttr,
      totalSixAttrs: expectedOneAttr * 6,
    });
  }
  return rows;
}

function formatPercent(value, digits) {
  return `${formatNumber(value, digits)}%`;
}

function buildGradeBandMarkdown(bands, digits) {
  const lines = [
    '| 品阶 | 起始等级 | 目标等级 | 无衰减上限 | 衰减跨度 | 说明 |',
    '|---|---:|---:|---:|---:|---|',
  ];
  for (const band of bands) {
    const startRatio = formatPercent(band.curve.startFreeLimitRatio * 100, digits);
    const midProgress = formatPercent(band.curve.midProgress * 100, digits);
    const endDecay = formatPercent(band.curve.endDecay * 100, digits);
    lines.push(`| ${band.label} | ${band.startLevel} | ${band.endLevel} | ${formatNumber(band.freeLimit, digits)} | ${formatNumber(band.decaySpan, digits)} | ${band.startLevel} 级达到无衰减上限的 ${startRatio}，区间 ${midProgress} 处达到无衰减上限，${band.endLevel} 级达到 ${endDecay} 边际衰减 |`);
  }
  return lines.join('\n');
}

function buildCalculationTable(rows, digits) {
  const lines = [
    '| 等级 | 境界基础单项 | 功法公式后单项 | 根基期望% | 炼体期望% | 乘区前单项 | 基准期望单项六维 | 六维总和 |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of rows) {
    lines.push(`| ${row.level} | ${formatNumber(row.realmOneAttr, digits)} | ${formatNumber(row.techniqueOneAttr, digits)} | ${formatPercent(row.rootExpectedPct, digits)} | ${formatPercent(row.bodyTrainingExpectedPct, digits)} | ${formatNumber(row.beforeMultipliers, digits)} | ${formatNumber(row.expectedOneAttr, digits)} | ${formatNumber(row.totalSixAttrs, digits)} |`);
  }
  return lines.join('\n');
}

function buildBaselineConfig(config, bands, rows, configPath) {
  const digits = positiveInteger(config.roundDigits, 2);
  return {
    version: 1,
    levels: rows.map((row) => {
      const singleAttr = roundNumber(row.expectedOneAttr, digits);
      const entry = {
        realmLv: row.level,
        singleAttr,
      };
      const singleBaseStatValue = calculateSingleBaseStatValue(row.level, config.baseStatBaseline);
      if (singleBaseStatValue !== undefined) {
        entry.singleBaseStatValue = roundNumber(singleBaseStatValue, digits);
      }
      return entry;
    }),
  };
}

function describeRootFormula(rootConfig) {
  if (!rootConfig?.enabled) {
    return 'rootExpectedPct(L) = 0';
  }
  if (rootConfig.capFormula === 'linear') {
    return 'rootCap(L) = floor(L * capMultiplier)';
  }
  if (rootConfig.capFormula === 'none') {
    return 'rootCap(L) = 0';
  }
  return 'rootCap(L) = floor(L * (L + 1) / 2 * capMultiplier)';
}

function buildMarkdown(config, bands, rows, configPath) {
  const digits = positiveInteger(config.roundDigits, 2);
  const rootFormula = describeRootFormula(config.rootFoundation);
  const rootCap78 = calculateRootCap(config.maxRealmLevel, config.rootFoundation);
  const rootPct78 = calculateRootPercent(config.maxRealmLevel, config.rootFoundation);
  const postDecayText = (config.bandCurve?.postDecays ?? [])
    .map((decay, index) => `- \`目标等级 + ${index + 1} * 区间宽度\` 达到 \`${formatPercent(decay * 100, digits)}\` 边际衰减。`)
    .join('\n');
  const relativeConfigPath = path.relative(repoRoot, configPath).replaceAll(path.sep, '/');
  const relativeBaselinePath = resolvePath(
    config.baselineOutputPath,
    'packages/server/data/content/realm-attr-baselines.json',
  );
  const baselinePathLabel = path.relative(repoRoot, relativeBaselinePath).replaceAll(path.sep, '/');
  return `# 境界等级基准期望六维公式

统计日期：${config.reportDate ?? new Date().toISOString().slice(0, 10)}

> 本文由 \`scripts/generate-realm-baseline-attrs.mjs\` 自动生成。调整参数请改 \`${relativeConfigPath}\`，然后运行 \`pnpm report:realm-baseline-attrs\`。
> 同次生成的基准配置：\`${baselinePathLabel}\`。

## 目标

本文按设计口径给出 \`1-${config.maxRealmLevel}\` 境界等级的基准期望六维公式。这里的“基准期望六维”用于数值规划，不直接等同当前线上角色最终面板。

暂不计入：

- 装备、强化、丹药、Buff、灵根、阵法、GM 修正。
- 具体功法偏科分配；本文先按六维均匀基准池计算，所以六维单项相同。

计入：

- 默认基础六维：每项 \`${formatNumber(config.baseAttrPerKey, digits)}\`。
- 当前大境界基础六维：按境界阶段累计 \`attrBonus\`，再折算为六维平均单项值。
- 功法品阶软衰减后的期望单项贡献。
- 根基期望百分比：按配置中的根基上限公式、期望比例和每点百分比计算。
- 炼体期望百分比：按配置中的炼体等级倍率和每层百分比计算。

## 可调参数

主要参数都在 \`${relativeConfigPath}\`：

- \`maxRealmLevel\`：输出到哪个境界等级。
- \`baselineOutputPath\`：写入服务端内容基准配置的位置。
- \`baseAttrPerKey\`：每项默认基础六维。
- \`realmBaseAttrs\`：当前境界基础六维的等级区间、累计加成和单项折算方式。
- \`bandCurve.startFreeLimitRatio\`：品阶起点占无衰减上限的比例。
- \`bandCurve.midProgress\`：区间中点位置，默认 \`0.5\`。
- \`bandCurve.midDecay\`：区间中点边际衰减，默认 \`0\`，即刚好达到无衰减上限。
- \`bandCurve.endDecay\`：区间终点边际衰减，默认 \`0.5\`。
- \`bandCurve.postDecays\`：区间终点后的外推边际衰减点。
- \`rootFoundation\`：根基上限公式、期望比例、每点百分比。
- \`bodyTraining\`：炼体等级倍率、每层百分比。
- \`baseStatBaseline\`：写入 \`singleBaseStatValue\` 的普通基础属性单项量化基准。
- \`gradeBands[]\`：每个品阶的等级区间、无衰减上限、衰减跨度，也可单独覆盖 \`bandCurve\` 参数。

也可以临时指定：

\`\`\`bash
node scripts/generate-realm-baseline-attrs.mjs --config=docs/数值分析/境界等级基准期望六维参数.json --max-level=78
\`\`\`

## 品阶等级区间

${buildGradeBandMarkdown(bands, digits)}

每个品阶在目标等级内使用三个锚点：

- \`起始等级\` 达到 \`无衰减上限 * startFreeLimitRatio\`。
- \`起始等级 + midProgress 区间进度\` 达到 \`midDecay\` 对应的原始池。
- \`目标等级\` 达到 \`endDecay\` 对应的原始池。

每个品阶在目标等级之后继续按同宽度外推：

${postDecayText || '- 无外推点。'}
- \`capAfterPostDecays = true\` 时，超过最后一个外推点后按最后一个外推点封顶。

这里的区间宽度按闭区间计：

\`\`\`text
width_g = end_g - start_g + 1
\`\`\`

## 功法池公式

当前功法软衰减公式来自 \`packages/shared/src/technique.ts\`：

\`\`\`text
soft(raw, free, span) =
  raw                                                   raw <= free
  free + span * ln(1 + (raw - free) / span)             raw > free
\`\`\`

边际衰减率 \`d\` 对应的原始池：

\`\`\`text
rawAtDecay(free, span, d) =
  free                                  d = 0
  free + span * d / (1 - d)             0 < d < 1
\`\`\`

品阶原始池按等级分段线性插值：

\`\`\`text
  raw_g(L) = lerp(相邻锚点 raw, 当前等级在锚点区间内的进度)
techniqueOneAttr(L) = sum(soft(raw_g(L), free_g, span_g))
\`\`\`

## 境界基础六维公式

境界等级先按 \`realmBaseAttrs.stages[].levelFrom\` 找到当前阶段；超过最后一个阶段起始等级时，沿用最后一个阶段。这与当前运行时按最高 \`levelFrom <= realmLv\` 取阶段的口径一致。

\`\`\`text
realmAttrs(L) = sum(当前阶段及以前所有 stage.attrBonus)
realmOneAttr(L) = sum(realmAttrs(L) 六项) / 6
\`\`\`

服务端基准配置中的 \`singleAttr\` 保存六维单项基准值。因为境界基础六维本身有偏科，所以这里统一折算为六维平均单项值。

同一个基准配置还会写入 \`singleBaseStatValue\`，表示每个普通基础属性的单项量化基准值；该字段来自 \`baseStatBaseline\`，不参与本文六维计算表。

## 根基与炼体公式

当前配置的根基公式：

\`\`\`text
${rootFormula}
rootExpectedPct(L) = rootCap(L) * expectationRatio * percentPerPoint
\`\`\`

当前配置的炼体公式：

\`\`\`text
bodyTrainingExpectedPct(L) = L * levelMultiplier * percentPerLevel
\`\`\`

最终基准期望单项六维：

\`\`\`text
baseOneAttr(L) = baseAttrPerKey + realmOneAttr(L) + techniqueOneAttr(L)

expectedOneAttr(L) =
  baseOneAttr(L)
  * (1 + bodyTrainingExpectedPct(L) / 100)
  * (1 + rootExpectedPct(L) / 100)

expectedTotalSixAttrs(L) = expectedOneAttr(L) * 6
\`\`\`

注意：根基按当前配置取值时，高等级会形成很大的百分比乘区。例如 ${config.maxRealmLevel} 级 \`rootCap = ${rootCap78}\`，\`rootExpectedPct = ${formatPercent(rootPct78, digits)}\`。

## 1-${config.maxRealmLevel} 计算表

${buildCalculationTable(rows, digits)}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readJson(args.configPath);
  if (args.maxRealmLevel !== undefined) {
    config.maxRealmLevel = args.maxRealmLevel;
  }
  const outputPath = args.outputPath ?? resolvePath(config.outputPath, 'docs/数值分析/境界等级基准期望六维公式.md');
  const baselineOutputPath = args.baselineOutputPath
    ?? resolvePath(config.baselineOutputPath, 'packages/server/data/content/realm-attr-baselines.json');
  const defaultCurve = {
    startFreeLimitRatio: 0.2,
    midProgress: 0.5,
    midDecay: 0,
    endDecay: 0.5,
    postDecays: [0.7, 0.9],
    capAfterPostDecays: true,
    ...(config.bandCurve ?? {}),
  };
  const bands = (config.gradeBands ?? []).map((band) => buildBandPoints(band, defaultCurve));
  const rows = calculateRows(config, bands);
  const markdown = buildMarkdown(config, bands, rows, args.configPath);
  const baselineConfig = buildBaselineConfig(config, bands, rows, args.configPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');
  fs.mkdirSync(path.dirname(baselineOutputPath), { recursive: true });
  fs.writeFileSync(baselineOutputPath, `${JSON.stringify(baselineConfig, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${path.relative(repoRoot, outputPath).replaceAll(path.sep, '/')}`);
  console.log(`已生成 ${path.relative(repoRoot, baselineOutputPath).replaceAll(path.sep, '/')}`);
}

main();
