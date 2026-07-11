#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const storageSourcePath = path.join(packageRoot, 'src/offline-gain-storage.ts');
const storageSource = readFileSync(storageSourcePath, 'utf8');
const transpiled = ts.transpileModule(storageSource, {
  fileName: storageSourcePath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleRecord = { exports: {} };
const loadCompiledModule = new Function('require', 'module', 'exports', transpiled.outputText);
loadCompiledModule(
  (specifier) => {
    throw new Error(`收支历史验证不允许加载运行时依赖：${specifier}`);
  },
  moduleRecord,
  moduleRecord.exports,
);

const {
  readOfflineGainReportsFromBrowser,
  storeOfflineGainReportsInBrowser,
} = moduleRecord.exports;

class MemoryStorage {
  #entries = new Map();

  get length() {
    return this.#entries.size;
  }

  clear() {
    this.#entries.clear();
  }

  getItem(key) {
    return this.#entries.get(String(key)) ?? null;
  }

  key(index) {
    return Array.from(this.#entries.keys())[index] ?? null;
  }

  removeItem(key) {
    this.#entries.delete(String(key));
  }

  setItem(key, value) {
    this.#entries.set(String(key), String(value));
  }
}

const now = Date.now();
const playerId = 'player:statistic-history-proof';
const windowRef = { localStorage: new MemoryStorage() };
const onlineReport = createReport({
  id: 'online:history-proof',
  scope: 'online',
  startedAt: now - 1_000,
  endedAt: now - 1_000,
  durationMs: 0,
  spiritStones: { gained: 25, lost: 5, net: 20 },
});
const offlineReport = createReport({
  id: 'offline:history-proof',
  scope: 'offline',
  startedAt: now - 61_000,
  endedAt: now,
  durationMs: 61_000,
  progress: [{
    kind: 'realmExp',
    label: '境界修为',
    gained: 120,
    lost: 0,
    net: 120,
  }],
});

const stored = storeOfflineGainReportsInBrowser(playerId, [onlineReport, offlineReport], windowRef);
assert.equal(stored.storageOk, true);
assert.deepEqual(stored.storedReportIds, [onlineReport.id, offlineReport.id]);
assert.deepEqual(
  stored.reports.map((report) => report.id),
  [offlineReport.id],
  '在线收支应静默归档，不能伪装成离线收益弹层',
);

const history = readOfflineGainReportsFromBrowser(playerId, windowRef);
assert.deepEqual(
  history.map((report) => report.scope).sort(),
  ['offline', 'online'],
  '本机收支历史必须同时保留在线与离线明细',
);
assert.equal(history.find((report) => report.scope === 'online')?.spiritStones.net, 20);
assert.equal(history.find((report) => report.scope === 'offline')?.progress[0]?.gained, 120);

const reactSettingsSource = readFileSync(
  path.join(packageRoot, 'src/react-ui/panels/settings/SettingsPanel.tsx'),
  'utf8',
);
const legacySettingsSource = readFileSync(
  path.join(packageRoot, 'src/ui/panels/settings-panel.ts'),
  'utf8',
);
const panelStyles = readFileSync(path.join(packageRoot, 'src/styles/panels.css'), 'utf8');
for (const source of [reactSettingsSource, legacySettingsSource]) {
  assert.match(source, /settings-offline-gain-record-button/);
  assert.match(source, /settings-offline-gain-record-date/);
  assert.match(source, /settings-offline-gain-record-meta/);
  assert.match(source, /formatPlayerStatisticScope\(report\.scope\)/);
}
assert.match(
  panelStyles,
  /\.settings-offline-gain-record-list\s*>\s*\.settings-offline-gain-record-button/,
  '收支历史按钮类名必须命中正式样式选择器',
);

console.log(JSON.stringify({
  ok: true,
  answers: [
    '在线与离线收支均会进入本机历史。',
    '在线明细静默归档，不会触发离线收益确认层。',
    'React 与 DOM 设置面板均使用正式收支历史样式类名，并显示统计范围。',
  ],
}, null, 2));

function createReport(overrides) {
  return {
    id: '',
    playerId,
    scope: 'offline',
    source: 'system',
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    generatedAt: now,
    spiritStones: { gained: 0, lost: 0, net: 0 },
    items: [],
    progress: [],
    techniques: [],
    professions: [],
    ...overrides,
  };
}
