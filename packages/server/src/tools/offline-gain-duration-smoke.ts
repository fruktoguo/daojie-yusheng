import assert from 'node:assert/strict';

import {
  OFFLINE_GAIN_REPORT_MIN_DURATION_MS,
  resolveOfflineGainReportDurationMs,
} from '../runtime/player/offline-gain-duration.helpers';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const startedAt = Date.UTC(2026, 6, 19, 10, 0, 0);

assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt, accumulatedDurationMs: 0 }, startedAt + 6 * 60_000),
  6 * 60_000,
  '逻辑 tick 完全停滞时，真实离线满一分钟仍必须生成报告',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt, accumulatedDurationMs: 5_000 }, startedAt + 6 * 60_000),
  6 * 60_000,
  '逻辑累计不足门槛时，可信墙钟必须防止报告被过滤',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt, accumulatedDurationMs: 0 }, startedAt + 9_000),
  9_000,
  '零逻辑 tick 的短断线仍必须保留真实短时长',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt, accumulatedDurationMs: 2_000 }, startedAt + 9_000),
  2_000,
  '短离线仍按逻辑累计结算，不能被墙钟放大',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt, accumulatedDurationMs: 60_000 }, startedAt + 6 * 60_000),
  60_000,
  '逻辑累计达到门槛后继续保持既有逻辑时长口径',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt }, startedAt + OFFLINE_GAIN_REPORT_MIN_DURATION_MS),
  OFFLINE_GAIN_REPORT_MIN_DURATION_MS,
  '缺少旧版逻辑累计字段时必须使用可信墙钟',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt: 1_000, accumulatedDurationMs: 4_000 }, Date.now()),
  4_000,
  '损坏或测试占位时间戳不能制造超长离线报告',
);
assert.equal(
  resolveOfflineGainReportDurationMs({ startedAt: 'invalid', accumulatedDurationMs: 'invalid' }, 'invalid'),
  0,
  '非法时长输入必须安全归零',
);

console.log(JSON.stringify({
  ok: true,
  case: 'offline-gain-duration',
  fallbackDurationMs: 6 * 60_000,
}, null, 2));
