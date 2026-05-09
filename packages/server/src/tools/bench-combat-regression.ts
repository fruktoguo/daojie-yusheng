// @ts-nocheck

/**
 * 用途：战斗链路性能回归检测。
 *
 * 流程：
 *   1. 运行 `bench:combat`，捕获 JSON 输出；
 *   2. 读取 `packages/server/data/bench-baselines/combat.json` 基线；
 *   3. 若基线不存在，把当前结果写入基线并标记为 initialized（首次建立基线不算失败）；
 *   4. 若基线存在，对比核心 p95 字段，任何一项退化 > 10% 则 exit 1；
 *   5. `--update-baseline` 时无条件覆盖基线。
 *
 * 基线存储为受控文件（需要随代码一起 review），不在运行时写 DB，不走 tick 热路径。
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REGRESSION_RATIO = 1.2; // p95 > baseline * 1.2 视为回归（wall-clock 微基准存在调度和 JIT 噪声）
const NEW_ENTRY_TOLERANCE_MS = 0.1; // 若基线缺该字段，小于该值视为可接受
// 两端都低于该值视为噪声，不做比例判定。战斗核心热路径固定阈值 ≥ 0.5ms，基线值基本在 0.1ms 以上，
// 该地板可屏蔽 basicAttackSingle 等微秒级指标的 ±100% 运行波动。
const NOISE_FLOOR_MS = 0.1;
// 即便两端都不在噪声地板以下，绝对差值小于该值也视为非回归。
const MIN_ABS_DELTA_MS = 0.05;
const SCALAR_THRESHOLDS = {
  // 只对 avg / p95 做回归检测：p99 属于 1% 尾部，单次运行波动极大，易产生误报。
  'p95Ms': REGRESSION_RATIO,
  'avgMs': REGRESSION_RATIO,
  'p95Bytes': REGRESSION_RATIO,
  'avgBytes': REGRESSION_RATIO,
};

const BASELINE_PATH = 'packages/server/data/bench-baselines/combat.json';

function repoRoot() {
  const startCandidates = [
    process.cwd(),
    path.resolve(__dirname, '..', '..', '..', '..', '..'),
  ];
  for (const start of startCandidates) {
    let current = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))
        || fs.existsSync(path.join(current, 'packages/server/package.json'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  throw new Error(`cannot locate repo root from cwd=${process.cwd()}`);
}

function runBench(root) {
  const benchEntry = path.join(root, 'packages/server/dist/tools/bench-combat.js');
  if (!fs.existsSync(benchEntry)) {
    throw new Error(`bench-combat dist missing at ${benchEntry}; run \`pnpm --filter @mud/server compile\` first`);
  }
  const result = spawnSync(process.execPath, [benchEntry], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`bench-combat exited non-zero: code=${result.status} stderr=${result.stderr?.slice(0, 400)}`);
  }
  const out = result.stdout ?? '';
  const jsonStart = out.indexOf('{');
  const jsonEnd = out.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error('bench-combat produced no parseable JSON');
  }
  return JSON.parse(out.slice(jsonStart, jsonEnd + 1));
}

function flattenMetrics(obj, prefix, out) {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const segments = flatKey.split('.');
      const leaf = segments[segments.length - 1];
      if (SCALAR_THRESHOLDS[leaf] !== undefined) {
        out[flatKey] = value;
      }
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenMetrics(value, flatKey, out);
    }
  }
}

function compareMetrics(current, baseline) {
  const regressions = [];
  const added = [];
  const improved = [];
  const currentMetrics = {};
  const baselineMetrics = {};
  flattenMetrics(current, '', currentMetrics);
  flattenMetrics(baseline, '', baselineMetrics);

  for (const [key, value] of Object.entries(currentMetrics)) {
    const leaf = key.split('.').pop();
    const ratioLimit = SCALAR_THRESHOLDS[leaf] ?? REGRESSION_RATIO;
    const baseValue = baselineMetrics[key];
    if (baseValue === undefined) {
      if (value > NEW_ENTRY_TOLERANCE_MS) {
        added.push({ key, value });
      }
      continue;
    }
    if (baseValue === 0) {
      if (value > NEW_ENTRY_TOLERANCE_MS) {
        regressions.push({ key, current: value, baseline: baseValue, ratio: Infinity, limit: ratioLimit });
      }
      continue;
    }
    const ratio = value / baseValue;
    // 噪声过滤：两端都在噪声阈值以下时，放行比率异常（微秒级 JIT/调度噪声不视为回归）。
    if (value < NOISE_FLOOR_MS && baseValue < NOISE_FLOOR_MS) {
      continue;
    }
    // 绝对差值过小（< 0.05ms）视为可接受的运行间波动，不视为回归。
    const absDelta = value - baseValue;
    if (absDelta < MIN_ABS_DELTA_MS) {
      if (ratio < 1 / ratioLimit) {
        improved.push({ key, current: value, baseline: baseValue, ratio });
      }
      continue;
    }
    if (ratio > ratioLimit) {
      regressions.push({ key, current: value, baseline: baseValue, ratio, limit: ratioLimit, absDeltaMs: Number(absDelta.toFixed(6)) });
    }
    else if (ratio < 1 / ratioLimit) {
      improved.push({ key, current: value, baseline: baseValue, ratio });
    }
  }

  return { regressions, added, improved };
}

function main() {
  const root = repoRoot();
  const shouldUpdateBaseline = process.argv.includes('--update-baseline');
  const baselineAbs = path.join(root, BASELINE_PATH);
  const baselineDir = path.dirname(baselineAbs);

  const current = runBench(root);
  if (!current || current.ok !== true) {
    console.log(JSON.stringify({
      ok: false,
      reason: 'bench-combat thresholds failed; baseline comparison skipped',
      answers: '当前 bench-combat 自身未通过固定阈值，回归检测不会覆盖这种情况',
      excludes: '不替代 bench-combat 本身的阈值检测',
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(baselineAbs) || shouldUpdateBaseline) {
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(baselineAbs, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      case: 'bench-combat-regression',
      status: shouldUpdateBaseline ? 'baseline_updated' : 'baseline_initialized',
      baselinePath: BASELINE_PATH,
      regressionRatio: REGRESSION_RATIO,
      answers: '初始化或刷新 bench:combat 基线后，后续运行会按 avg/p95 < 基线 * 1.2 + 绝对差 > 0.05ms 校验（p99 噪声大，不参与比对）',
      excludes: '不比较历史版本趋势，只与当前基线一次对比；微秒级波动在 0.1ms 噪声地板内不算回归',
    }, null, 2));
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(baselineAbs, 'utf8'));
  const diff = compareMetrics(current, baseline);

  const regressedSignificantly = diff.regressions.length > 0;
  console.log(JSON.stringify({
    ok: !regressedSignificantly,
    case: 'bench-combat-regression',
    regressionRatio: REGRESSION_RATIO,
    baselinePath: BASELINE_PATH,
    regressions: diff.regressions,
    addedMetrics: diff.added,
    improvedMetrics: diff.improved.slice(0, 10),
    answers: '当前 bench:combat avg/p95 与基线比较，比例 > 1.2 且绝对差 > 0.05ms 时退出非 0',
    excludes: '不证明线上环境性能、不证明真实 socket/DB 开销、不替代阈值 bench；0.1ms 以下的耗时变化视为噪声；p99 属于 1% 尾部不参与回归比对',
  }, null, 2));

  if (regressedSignificantly) {
    process.exitCode = 1;
  }
}

main();
